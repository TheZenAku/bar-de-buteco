import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';

export const MIGRATION_TABLE='bar_schema_migrations';

export interface MigrationFile {name:string;checksum:string;sql:string}
export interface AppliedMigration {name:string;checksum:string}

export interface SqlExecutor {
  execute(sql:string):Promise<void>;
  query<T>(sql:string,params?:unknown[]):Promise<T[]>;
}

export interface MigrationSession extends SqlExecutor {
  transaction<T>(work:(transaction:SqlExecutor)=>Promise<T>):Promise<T>;
}

export interface MigrationCoordinator {
  withLock<T>(work:(session:MigrationSession)=>Promise<T>):Promise<T>;
}

export interface MigrationResult {
  applied:string[];
  alreadyApplied:string[];
}

export type SchemaVerifier=(executor:SqlExecutor)=>Promise<void>;
export type MigrationFinalizer=(executor:SqlExecutor)=>Promise<void>;

export class MigrationError extends Error {
  constructor(message:string,options?:ErrorOptions){super(message,options);this.name='MigrationError';}
}

const migrationName=/^(\d{3,})_[a-z0-9][a-z0-9_-]*\.sql$/;

export async function loadMigrations(folder:string):Promise<MigrationFile[]> {
  const entries=(await readdir(folder,{withFileTypes:true})).filter(entry=>entry.isFile()&&entry.name.endsWith('.sql'));
  if(!entries.length)throw new MigrationError(`Nenhuma migração SQL encontrada em ${folder}.`);
  const versioned=entries.map(entry=>{
    const match=migrationName.exec(entry.name);
    if(!match)throw new MigrationError(`Nome de migração inválido: ${entry.name}.`);
    return {entry,version:BigInt(match[1]!)};
  });
  versioned.sort((left,right)=>left.version<right.version?-1:left.version>right.version?1:left.entry.name.localeCompare(right.entry.name));
  const versions=new Set<string>(),migrations:MigrationFile[]=[];
  for(const {entry,version} of versioned){
    const canonicalVersion=version.toString();
    if(versions.has(canonicalVersion))throw new MigrationError(`Versão de migração duplicada: ${canonicalVersion}.`);
    versions.add(canonicalVersion);
    // Git checkouts may use CRLF on Windows; line-ending conversion is not a schema change.
    const sql=(await readFile(resolve(folder,entry.name),'utf8')).replace(/\r\n?/g,'\n');
    if(!sql.trim())throw new MigrationError(`Migração vazia: ${entry.name}.`);
    migrations.push({name:entry.name,sql,checksum:createHash('sha256').update(sql).digest('hex')});
  }
  return migrations;
}

function validateApplied(migrations:MigrationFile[],rows:AppliedMigration[],allowUnknown:boolean):Set<string>{
  const available=new Map(migrations.map(migration=>[migration.name,migration]));
  const applied=new Set<string>();
  for(const row of rows){
    const migration=available.get(row.name);
    if(!migration){
      if(allowUnknown)continue;
      throw new MigrationError(`O banco registra uma migração ausente neste artefato: ${row.name}.`);
    }
    if(row.checksum!==migration.checksum)throw new MigrationError(`Checksum divergente para ${row.name}; migrações aplicadas são imutáveis.`);
    applied.add(row.name);
  }
  let missingSeen=false;
  for(const migration of migrations){
    if(!applied.has(migration.name))missingSeen=true;
    else if(missingSeen)throw new MigrationError(`Histórico de migrações contém uma lacuna antes de ${migration.name}.`);
  }
  return applied;
}

const ledgerSql=`CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
  name text PRIMARY KEY,
  checksum text NOT NULL CHECK (length(checksum) = 64),
  applied_at timestamptz NOT NULL DEFAULT now()
)`;

async function readApplied(executor:Pick<SqlExecutor,'query'>):Promise<AppliedMigration[]>{
  return executor.query<AppliedMigration>(`SELECT name, checksum FROM ${MIGRATION_TABLE} ORDER BY name`);
}

export async function applyMigrations(
  coordinator:MigrationCoordinator,
  folder:string,
  verifySchema:SchemaVerifier,
  finalize?:MigrationFinalizer,
):Promise<MigrationResult>{
  const migrations=await loadMigrations(folder);
  return coordinator.withLock(session=>session.transaction(async transaction=>{
    await transaction.execute(ledgerSql);
    const rows=await readApplied(transaction);
    const applied=validateApplied(migrations,rows,false);
    const pending=migrations.filter(migration=>!applied.has(migration.name));
    if(pending.length){
        for(const migration of pending)await transaction.execute(migration.sql);
        // A legacy database may already have tables that IF NOT EXISTS would silently accept with
        // the wrong shape. Certify the complete schema before writing any baseline ledger entry.
        await verifySchema(transaction);
        for(const migration of pending)
          await transaction.query(`INSERT INTO ${MIGRATION_TABLE} (name, checksum) VALUES ($1, $2)`,[migration.name,migration.checksum]);
    }else await verifySchema(transaction);
    await finalize?.(transaction);
    return {applied:pending.map(migration=>migration.name),alreadyApplied:migrations.filter(migration=>applied.has(migration.name)).map(migration=>migration.name)};
  }));
}

/** Runtime check only: newer, unknown migrations are allowed so an expand-only rollback can still boot. */
export async function assertMigrationsCurrent(executor:SqlExecutor,folder:string,verifySchema:SchemaVerifier):Promise<void>{
  const migrations=await loadMigrations(folder);
  let rows:AppliedMigration[];
  try{rows=await readApplied(executor);}
  catch(error){throw new MigrationError('Schema do banco não foi preparado. Execute o comando de migração antes de iniciar a API.',{cause:error});}
  const applied=validateApplied(migrations,rows,true);
  const missing=migrations.filter(migration=>!applied.has(migration.name));
  if(missing.length)throw new MigrationError(`Schema do banco desatualizado; faltam: ${missing.map(migration=>migration.name).join(', ')}.`);
  await verifySchema(executor);
}
