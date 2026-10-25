import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {eq} from 'drizzle-orm';
import {connectDatabase,migrateDatabase} from '../src/database/index.js';
import {controls,itemInventory,profiles,users} from '../src/database/schema.js';

const adminUrl=process.env.TEST_DATABASE_URL;
const ownerRole='bar_owner';
const migratorRole='bar_migrator';
const runtimeRole='bar_runtime';
// Disposable CI-only credentials. Production receives independent secrets through Compose.
const migratorPassword='a1'.repeat(32);
const runtimePassword='b2'.repeat(32);

const quoteIdentifier=(value:string)=>`"${value.replaceAll('"','""')}"`;

function roleUrl(base:string,role:string,password:string){
  const parsed=new URL(base);
  parsed.username=role;
  parsed.password=password;
  return parsed.toString();
}

async function bootstrapRoles(admin:pg.Pool){
  await admin.query(`
    DO $roles$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='bar_owner') THEN
        CREATE ROLE bar_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='bar_migrator') THEN
        CREATE ROLE bar_migrator LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='bar_runtime') THEN
        CREATE ROLE bar_runtime LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      END IF;
    END
    $roles$;

    ALTER ROLE bar_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    ALTER ROLE bar_migrator LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${migratorPassword}';
    ALTER ROLE bar_runtime LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${runtimePassword}';
    ALTER ROLE bar_owner RESET ALL;
    ALTER ROLE bar_migrator RESET ALL;
    ALTER ROLE bar_runtime RESET ALL;
    ALTER ROLE bar_owner SET search_path = pg_catalog, public;
    ALTER ROLE bar_migrator SET search_path = pg_catalog, public;
    ALTER ROLE bar_runtime SET search_path = pg_catalog, public;
  `);

  const memberships=await admin.query<{parent_role:string;member_role:string}>(`
    SELECT parent.rolname AS parent_role, member.rolname AS member_role
    FROM pg_auth_members membership
    JOIN pg_roles parent ON parent.oid=membership.roleid
    JOIN pg_roles member ON member.oid=membership.member
    WHERE member.rolname IN ('bar_migrator','bar_runtime')
  `);
  for(const membership of memberships.rows)
    await admin.query(`REVOKE ${quoteIdentifier(membership.parent_role)} FROM ${quoteIdentifier(membership.member_role)}`);
  await admin.query('GRANT bar_owner TO bar_migrator');

  const database=(await admin.query<{name:string}>('SELECT current_database() AS name')).rows[0]!.name;
  await admin.query(`
    REVOKE ALL ON DATABASE ${quoteIdentifier(database)} FROM PUBLIC;
    GRANT CONNECT ON DATABASE ${quoteIdentifier(database)} TO bar_owner,bar_migrator,bar_runtime;
    REVOKE ALL ON SCHEMA public FROM PUBLIC;
    ALTER SCHEMA public OWNER TO bar_owner;

    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
    REVOKE ALL ON SCHEMA public FROM bar_runtime;
    GRANT USAGE ON SCHEMA public TO bar_runtime;
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM bar_runtime;
    GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO bar_runtime;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM bar_runtime;
    GRANT USAGE,SELECT,UPDATE ON ALL SEQUENCES IN SCHEMA public TO bar_runtime;

    ALTER DEFAULT PRIVILEGES FOR ROLE bar_owner IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
    ALTER DEFAULT PRIVILEGES FOR ROLE bar_owner IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO bar_runtime;
    ALTER DEFAULT PRIVILEGES FOR ROLE bar_owner IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC;
    ALTER DEFAULT PRIVILEGES FOR ROLE bar_owner IN SCHEMA public GRANT USAGE,SELECT,UPDATE ON SEQUENCES TO bar_runtime;
    ALTER DEFAULT PRIVILEGES FOR ROLE bar_owner IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC;
  `);
}

const permissionDenied=(error:unknown)=>
  error instanceof Error&&'code' in error&&(error as Error&{code?:string}).code==='42501';

async function expectPermissionDenied(client:pg.PoolClient,sql:string){
  await client.query('BEGIN');
  try{await assert.rejects(client.query(sql),permissionDenied);}
  finally{await client.query('ROLLBACK');}
}

test('PostgreSQL 17 separa owner, migrador concorrente e runtime sem DDL',{
  skip:adminUrl?false:'TEST_DATABASE_URL não configurada; smoke nativo roda no job PostgreSQL da CI.',
},async()=>{
  if(!adminUrl)return;
  const admin=new pg.Pool({connectionString:adminUrl,max:2});
  const migratorUrl=roleUrl(adminUrl,migratorRole,migratorPassword);
  const runtimeUrl=roleUrl(adminUrl,runtimeRole,runtimePassword);
  try{
    await bootstrapRoles(admin);

    const options={
      url:migratorUrl,
      migrationRole:ownerRole,
      migrationRuntimeRole:runtimeRole,
      migrationLockTimeoutMs:10_000,
    };
    const migrations=await Promise.all([migrateDatabase(options),migrateDatabase(options)]);
    assert.deepEqual(migrations.map(result=>result.applied.length).sort((a,b)=>a-b),[0,4]);
    for(const result of migrations)assert.equal(result.applied.length+result.alreadyApplied.length,4);

    const connection=await connectDatabase({url:runtimeUrl});
    try{
      assert.equal(connection.driver,'postgres');
      const userId=randomUUID();
      await connection.db.insert(users).values({id:userId,username:`smoke_${userId}`,email:`${userId}@smoke.invalid`,passwordHash:'not-a-real-password-hash'});
      await connection.db.insert(profiles).values({userId,displayName:'PostgreSQL smoke'});
      assert.equal((await connection.db.select({id:users.id}).from(users)).some(row=>row.id===userId),true);
      await connection.db.delete(users).where(eq(users.id,userId));
      await connection.db.select({character:profiles.characterConfig}).from(profiles).limit(1);
      await connection.db.select({quantity:itemInventory.quantity}).from(itemInventory).limit(1);
      await connection.db.select({status:controls.status,attempts:controls.attempts}).from(controls).limit(1);
    }finally{await connection.close();}

    const runtime=new pg.Pool({connectionString:runtimeUrl,max:1});
    try{
      const client=await runtime.connect();
      try{
        assert.equal((await client.query<{search_path:string}>('SHOW search_path')).rows[0]!.search_path,'pg_catalog, public');
        assert.equal((await client.query<{count:number}>('SELECT count(*)::int AS count FROM bar_schema_migrations')).rows[0]!.count,4);
        await expectPermissionDenied(client,'CREATE TABLE runtime_must_not_create (id integer)');
        await expectPermissionDenied(client,'ALTER TABLE users ADD COLUMN runtime_must_not_alter integer');
        await expectPermissionDenied(client,`INSERT INTO bar_schema_migrations (name,checksum) VALUES ('999_forbidden.sql','${'f'.repeat(64)}')`);
      }finally{client.release();}
    }finally{await runtime.end();}

    const ownership=await admin.query<{tableowner:string}>("SELECT DISTINCT tableowner FROM pg_tables WHERE schemaname='public'");
    assert.deepEqual(ownership.rows,[{tableowner:ownerRole}]);
    const privileges=await admin.query<{schema_create:boolean;ledger_select:boolean;ledger_insert:boolean}>(`
      SELECT
        has_schema_privilege('bar_runtime','public','CREATE') AS schema_create,
        has_table_privilege('bar_runtime','bar_schema_migrations','SELECT') AS ledger_select,
        has_table_privilege('bar_runtime','bar_schema_migrations','INSERT') AS ledger_insert
    `);
    assert.deepEqual(privileges.rows[0],{schema_create:false,ledger_select:true,ledger_insert:false});
  }finally{await admin.end();}
});
