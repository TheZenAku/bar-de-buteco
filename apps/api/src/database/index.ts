import {PGlite} from '@electric-sql/pglite';
import {drizzle as pgliteDrizzle,type PgliteDatabase} from 'drizzle-orm/pglite';
import {drizzle as postgresDrizzle} from 'drizzle-orm/node-postgres';
import pg from 'pg';
import {mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import * as schema from './schema.js';
import {applyMigrations,assertMigrationsCurrent,MIGRATION_TABLE,MigrationError,type MigrationCoordinator,type MigrationFinalizer,type MigrationResult,type MigrationSession,type SqlExecutor} from './migrations.js';
import {verifyApplicationSchema} from './schema-contract.js';

export type Database=PgliteDatabase<typeof schema>;
export type DatabaseDriver='postgres'|'pglite';
export interface DatabaseOptions {
  url?:string;
  path?:string;
  migrationFolder?:string;
  migrationRole?:string;
  migrationRuntimeRole?:string;
  migrationLockTimeoutMs?:number;
}
export interface DatabaseConnection {db:Database;close:()=>Promise<void>;driver:DatabaseDriver}

export const repositoryRoot=resolve(dirname(fileURLToPath(import.meta.url)),'../../../..');
export const defaultMigrationFolder=resolve(repositoryRoot,'infra/migrations');

interface OpenDatabase extends DatabaseConnection {
  executor:SqlExecutor;
  coordinator:MigrationCoordinator;
}

const roleName=/^[a-z_][a-z0-9_]{0,62}$/;
const quoteRole=(role:string,variable='MIGRATION_ROLE')=>{
  if(!roleName.test(role))throw new MigrationError(`${variable} inválido.`);
  return `"${role}"`;
};

const advisoryLock="pg_catalog.hashtextextended('bar-de-buteco:migrations:' || pg_catalog.current_database(), 0)";
const defaultMigrationLockTimeoutMs=30_000;

const postgresExecutor=(client:{query:(sql:string,params?:unknown[])=>Promise<{rows:unknown[]}>}):SqlExecutor=>({
  async execute(sql){await client.query(sql);},
  async query<T>(sql:string,params?:unknown[]){return (await client.query(sql,params)).rows as T[];},
});

function postgresCoordinator(pool:pg.Pool,role?:string,lockTimeoutMs=defaultMigrationLockTimeoutMs):MigrationCoordinator{
  if(!Number.isInteger(lockTimeoutMs)||lockTimeoutMs<1)throw new MigrationError('MIGRATION_LOCK_TIMEOUT_MS inválido.');
  return {async withLock<T>(work:(session:MigrationSession)=>Promise<T>):Promise<T>{
    const client=await pool.connect();let locked=false,roleSelected=false,searchPathSelected=false;
    try{
      const deadline=Date.now()+lockTimeoutMs;
      while(!locked){
        const result=await client.query<{locked:boolean}>(`SELECT pg_catalog.pg_try_advisory_lock(${advisoryLock}) AS locked`);
        locked=result.rows[0]?.locked===true;
        if(locked)break;
        const remaining=deadline-Date.now();
        if(remaining<=0)throw new MigrationError(`Timeout de ${lockTimeoutMs} ms aguardando o lock de migração.`);
        await delay(Math.min(250,remaining));
      }
      if(role){await client.query(`SET ROLE ${quoteRole(role)}`);roleSelected=true;}
      // The role defaults put pg_catalog first for runtime safety. Migrations use immutable,
      // unqualified DDL, so their owner-only target schema must be first while this lock is held.
      await client.query('SET search_path TO public, pg_catalog');searchPathSelected=true;
      const executor=postgresExecutor(client);
      const session:MigrationSession={...executor,async transaction<R>(task:(transaction:SqlExecutor)=>Promise<R>):Promise<R>{
        await client.query('BEGIN');
        try{const result=await task(executor);await client.query('COMMIT');return result;}
        catch(error){
          try{await client.query('ROLLBACK');}
          catch(rollbackError){throw new AggregateError([error,rollbackError],'A migração falhou e o rollback também falhou.');}
          throw error;
        }
      }};
      return await work(session);
    }finally{
      try{if(searchPathSelected)await client.query('RESET search_path');}
      finally{
        try{if(roleSelected)await client.query('RESET ROLE');}
        finally{try{if(locked)await client.query(`SELECT pg_catalog.pg_advisory_unlock(${advisoryLock})`);}finally{client.release();}}
      }
    }
  }};
}

function pgliteCoordinator(client:PGlite):MigrationCoordinator{
  const executor:SqlExecutor={
    async execute(sql){await client.exec(sql);},
    async query<T>(sql:string,params?:unknown[]){return (await client.query<T>(sql,params)).rows;},
  };
  return {async withLock<T>(work:(session:MigrationSession)=>Promise<T>):Promise<T>{
    // A PGlite data directory has one owning process. Its transaction mutex serializes the batch;
    // PostgreSQL uses the cross-process advisory lock above.
    return work({...executor,async transaction<R>(task:(transaction:SqlExecutor)=>Promise<R>):Promise<R>{
      return client.transaction(async tx=>task({
        async execute(sql){await tx.exec(sql);},
        async query<U>(sql:string,params?:unknown[]){return (await tx.query<U>(sql,params)).rows;},
      }));
    }});
  }};
}

async function openDatabase(options:DatabaseOptions={}):Promise<OpenDatabase>{
  if(options.url){
    const lockTimeoutMs=options.migrationLockTimeoutMs??defaultMigrationLockTimeoutMs;
    if(!Number.isInteger(lockTimeoutMs)||lockTimeoutMs<1)throw new MigrationError('MIGRATION_LOCK_TIMEOUT_MS inválido.');
    const pool=new pg.Pool({connectionString:options.url,max:10});
    const executor=postgresExecutor(pool);
    return {db:postgresDrizzle(pool,{schema}) as unknown as Database,close:()=>pool.end(),driver:'postgres',executor,coordinator:postgresCoordinator(pool,options.migrationRole,lockTimeoutMs)};
  }
  const dataPath=options.path??resolve(repositoryRoot,'.data/postgres');
  if(dataPath!=='memory://')await mkdir(dataPath,{recursive:true});
  const client=new PGlite(dataPath);await client.waitReady;
  const executor:SqlExecutor={
    async execute(sql){await client.exec(sql);},
    async query<T>(sql:string,params?:unknown[]){return (await client.query<T>(sql,params)).rows;},
  };
  return {db:pgliteDrizzle(client,{schema}),close:()=>client.close(),driver:'pglite',executor,coordinator:pgliteCoordinator(client)};
}

function publicConnection(connection:OpenDatabase):DatabaseConnection{
  return {db:connection.db,close:connection.close,driver:connection.driver};
}

function migrationPermissionFinalizer(driver:DatabaseDriver,runtimeRole?:string):MigrationFinalizer|undefined{
  if(!runtimeRole)return undefined;
  if(driver!=='postgres')throw new MigrationError('MIGRATION_RUNTIME_ROLE só pode ser usado com PostgreSQL.');
  const role=quoteRole(runtimeRole,'MIGRATION_RUNTIME_ROLE');
  return async executor=>{
    // Default table privileges may include a newly-created ledger. Remove every write privilege
    // before the migration transaction commits, then restore read-only access.
    await executor.execute(`REVOKE ALL PRIVILEGES ON TABLE ${MIGRATION_TABLE} FROM ${role}`);
    await executor.execute(`GRANT SELECT ON TABLE ${MIGRATION_TABLE} TO ${role}`);
  };
}

/** Runtime connection: reads and validates the migration ledger, but never executes DDL. */
export async function connectDatabase(options:DatabaseOptions={}):Promise<DatabaseConnection>{
  const connection=await openDatabase(options),folder=options.migrationFolder??defaultMigrationFolder;
  try{await assertMigrationsCurrent(connection.executor,folder,verifyApplicationSchema);return publicConnection(connection);}
  catch(error){await connection.close();throw error;}
}

/** Explicit convenience for local fixtures/tests. Production deploys must use the one-shot migrate command. */
export function assertLocalMigrationHelperAllowed(nodeEnv=process.env.NODE_ENV):void{
  if(nodeEnv==='production')throw new MigrationError('connectMigratedDatabase é proibido em produção; use o runner de migração dedicado.');
}

export async function connectMigratedDatabase(options:DatabaseOptions={}):Promise<DatabaseConnection>{
  assertLocalMigrationHelperAllowed();
  const connection=await openDatabase(options),folder=options.migrationFolder??defaultMigrationFolder;
  try{
    await applyMigrations(connection.coordinator,folder,verifyApplicationSchema,migrationPermissionFinalizer(connection.driver,options.migrationRuntimeRole));
    await assertMigrationsCurrent(connection.executor,folder,verifyApplicationSchema);
    return publicConnection(connection);
  }catch(error){await connection.close();throw error;}
}

export async function migrateDatabase(options:DatabaseOptions={}):Promise<MigrationResult>{
  const connection=await openDatabase(options),folder=options.migrationFolder??defaultMigrationFolder;
  try{return await applyMigrations(connection.coordinator,folder,verifyApplicationSchema,migrationPermissionFinalizer(connection.driver,options.migrationRuntimeRole));}
  finally{await connection.close();}
}
