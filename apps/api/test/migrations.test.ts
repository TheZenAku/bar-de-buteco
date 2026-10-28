import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,copyFile,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {assertLocalMigrationHelperAllowed,connectDatabase,defaultMigrationFolder,migrateDatabase} from '../src/database/index.js';
import {loadMigrations,MIGRATION_TABLE} from '../src/database/migrations.js';
import {readMigrationConfig} from '../src/config.js';

const migrationNames=['001_initial.sql','002_characters.sql','003_inventory.sql','004_control_outbox.sql','005_retire_character_creator.sql'];

async function fixture(t:TestContext){
  const root=await mkdtemp(join(tmpdir(),'bar-migrations-')),folder=join(root,'migrations'),path=join(root,'database');
  await mkdir(folder);
  for(const name of migrationNames)await copyFile(join(defaultMigrationFolder,name),join(folder,name));
  t.after(()=>rm(root,{recursive:true,force:true}));
  return {root,folder,path};
}

async function raw<T>(path:string,work:(database:PGlite)=>Promise<T>):Promise<T>{
  const database=new PGlite(path);await database.waitReady;
  try{return await work(database);}finally{await database.close();}
}

test('runtime connection is read-only about schema; explicit migration records one immutable batch and the second run is a no-op',async t=>{
  const {folder,path}=await fixture(t);
  await assert.rejects(()=>connectDatabase({path,migrationFolder:folder}),/Execute o comando de migração/);
  assert.equal(await raw(path,async db=>(await db.query<{table_name:string|null}>("SELECT to_regclass('public.users')::text AS table_name")).rows[0]!.table_name),null);

  const first=await migrateDatabase({path,migrationFolder:folder});assert.deepEqual(first.applied,migrationNames);
  await raw(path,async db=>db.query("INSERT INTO users (id,username,email,password_hash) VALUES ('sentinel','sentinel','sentinel@test.local','hash')"));
  const second=await migrateDatabase({path,migrationFolder:folder});assert.deepEqual(second,{applied:[],alreadyApplied:migrationNames});
  const connection=await connectDatabase({path,migrationFolder:folder});await connection.close();
  await raw(path,async db=>{
    assert.equal((await db.query<{count:number}>(`SELECT count(*)::int AS count FROM ${MIGRATION_TABLE}`)).rows[0]!.count,5);
    assert.equal((await db.query<{count:number}>("SELECT count(*)::int AS count FROM users WHERE id='sentinel'")).rows[0]!.count,1);
  });
});

test('checksums ignore checkout line endings but reject a real change before touching data',async t=>{
  const {folder,path}=await fixture(t),initial=join(folder,migrationNames[0]!);
  const lf=(await readFile(initial,'utf8')).replace(/\r\n?/g,'\n');await writeFile(initial,lf.replaceAll('\n','\r\n'));
  await migrateDatabase({path,migrationFolder:folder});
  await writeFile(initial,lf);assert.equal((await migrateDatabase({path,migrationFolder:folder})).applied.length,0);
  await writeFile(initial,`${lf}\n-- altered after deployment\n`);
  await assert.rejects(()=>migrateDatabase({path,migrationFolder:folder}),/Checksum divergente/);
});

test('all pending migrations and ledger inserts roll back together when a later SQL file fails',async t=>{
  const {folder,path}=await fixture(t);
  await writeFile(join(folder,'006_broken.sql'),'CREATE TABLE should_rollback (id integer); SELECT function_that_does_not_exist();\n');
  await assert.rejects(()=>migrateDatabase({path,migrationFolder:folder}));
  await raw(path,async db=>{
    const relations=await db.query<{users:string|null;broken:string|null;ledger:string|null}>("SELECT to_regclass('public.users')::text AS users, to_regclass('public.should_rollback')::text AS broken, to_regclass('public.bar_schema_migrations')::text AS ledger");
    assert.deepEqual(relations.rows[0],{users:null,broken:null,ledger:null});
  });
});

test('a complete legacy schema is baselined without losing data, but a lookalike partial schema is refused',async t=>{
  const complete=await fixture(t);
  await raw(complete.path,async db=>{
    for(const name of migrationNames)await db.exec((await readFile(join(complete.folder,name),'utf8')).replace(/\r\n?/g,'\n'));
    await db.query("INSERT INTO users (id,username,email,password_hash) VALUES ('legacy','legacy','legacy@test.local','hash')");
  });
  assert.deepEqual((await migrateDatabase({path:complete.path,migrationFolder:complete.folder})).applied,migrationNames);
  await raw(complete.path,async db=>assert.equal((await db.query<{count:number}>("SELECT count(*)::int AS count FROM users WHERE id='legacy'")).rows[0]!.count,1));
  await raw(complete.path,db=>db.exec('ALTER TABLE reports DROP CONSTRAINT reports_reporter_id_fkey; ALTER TABLE reports ADD CONSTRAINT reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE;'));
  await assert.rejects(()=>connectDatabase({path:complete.path,migrationFolder:complete.folder}),/chave estrangeira ausente ou divergente em reports\.reporter_id/);

  const partial=await fixture(t);
  await raw(partial.path,db=>db.exec("CREATE TABLE users (id text PRIMARY KEY, username text NOT NULL UNIQUE, email text NOT NULL UNIQUE, password_hash text NOT NULL, role text NOT NULL DEFAULT 'player' CHECK (role IN ('player','admin')), created_at timestamptz NOT NULL DEFAULT now());"));
  await assert.rejects(()=>migrateDatabase({path:partial.path,migrationFolder:partial.folder}),/coluna ausente users\.verified/);
  await raw(partial.path,async db=>{
    assert.equal((await db.query<{relation:string|null}>("SELECT to_regclass('public.bar_schema_migrations')::text AS relation")).rows[0]!.relation,null);
    assert.equal((await db.query<{relation:string|null}>("SELECT to_regclass('public.sessions')::text AS relation")).rows[0]!.relation,null);
  });
});

test('runtime tolerates an expand-only future ledger entry, while an old migrator and a ledger gap fail closed',async t=>{
  const future=await fixture(t);await migrateDatabase({path:future.path,migrationFolder:future.folder});
  await raw(future.path,db=>db.query(`INSERT INTO ${MIGRATION_TABLE} (name,checksum) VALUES ('999_future.sql',$1)`,['f'.repeat(64)]));
  const runtime=await connectDatabase({path:future.path,migrationFolder:future.folder});await runtime.close();
  await assert.rejects(()=>migrateDatabase({path:future.path,migrationFolder:future.folder}),/ausente neste artefato/);

  const gap=await fixture(t);await migrateDatabase({path:gap.path,migrationFolder:gap.folder});
  await raw(gap.path,db=>db.query(`DELETE FROM ${MIGRATION_TABLE} WHERE name='002_characters.sql'`));
  await assert.rejects(()=>connectDatabase({path:gap.path,migrationFolder:gap.folder}),/lacuna/);
  await assert.rejects(()=>migrateDatabase({path:gap.path,migrationFolder:gap.folder}),/lacuna/);
});

test('migration versions are ordered numerically and aliases with different zero padding are duplicates',async t=>{
  const root=await mkdtemp(join(tmpdir(),'bar-migration-order-'));t.after(()=>rm(root,{recursive:true,force:true}));
  await writeFile(join(root,'1000_later.sql'),'SELECT 1000;\n');
  await writeFile(join(root,'999_earlier.sql'),'SELECT 999;\n');
  assert.deepEqual((await loadMigrations(root)).map(migration=>migration.name),['999_earlier.sql','1000_later.sql']);
  await writeFile(join(root,'0999_duplicate.sql'),'SELECT 999;\n');
  await assert.rejects(()=>loadMigrations(root),/Versão de migração duplicada: 999/);
});

test('a malformed pre-existing migration ledger cannot certify an otherwise valid legacy schema',async t=>{
  const legacy=await fixture(t);
  await raw(legacy.path,async db=>{
    for(const name of migrationNames)await db.exec((await readFile(join(legacy.folder,name),'utf8')).replace(/\r\n?/g,'\n'));
    await db.exec(`CREATE TABLE ${MIGRATION_TABLE} (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
  });
  await assert.rejects(()=>migrateDatabase({path:legacy.path,migrationFolder:legacy.folder}),/CHECK obrigatório ausente em bar_schema_migrations/);
  await raw(legacy.path,async db=>assert.equal((await db.query<{count:number}>(`SELECT count(*)::int AS count FROM ${MIGRATION_TABLE}`)).rows[0]!.count,0));
});

test('migration config separates owner/runtime roles and validates the bounded lock timeout',()=>{
  const config=readMigrationConfig({
    NODE_ENV:'production',
    DATABASE_URL:'postgresql://bar_runtime:runtime@postgres/bar',
    MIGRATION_DATABASE_URL:'postgresql://bar_migrator:migrator@postgres/bar',
  });
  assert.deepEqual(config,{
    url:'postgresql://bar_migrator:migrator@postgres/bar',
    path:undefined,
    role:'bar_owner',
    runtimeRole:'bar_runtime',
    lockTimeoutMs:30_000,
  });
  assert.throws(()=>readMigrationConfig({MIGRATION_LOCK_TIMEOUT_MS:'0'}),/MIGRATION_LOCK_TIMEOUT_MS inválido/);
  assert.throws(()=>readMigrationConfig({MIGRATION_LOCK_TIMEOUT_MS:'not-a-number'}),/MIGRATION_LOCK_TIMEOUT_MS inválido/);
  assert.equal(readMigrationConfig({MIGRATION_LOCK_TIMEOUT_MS:'1250'}).lockTimeoutMs,1250);
  assert.throws(()=>readMigrationConfig({MIGRATION_ROLE:'owner;DROP ROLE owner'}),/MIGRATION_ROLE inválido/);
  assert.throws(()=>readMigrationConfig({MIGRATION_RUNTIME_ROLE:'Runtime'}),/MIGRATION_RUNTIME_ROLE inválido/);
  assert.throws(()=>readMigrationConfig({MIGRATION_ROLE:'same_role',MIGRATION_RUNTIME_ROLE:'same_role'}),/devem ser diferentes/);
  assert.throws(()=>readMigrationConfig({
    NODE_ENV:'production',
    DATABASE_URL:'postgresql://shared:runtime@postgres/bar',
    MIGRATION_DATABASE_URL:'postgresql://shared:migrator@postgres/bar?application_name=migrate',
  }),/usuários PostgreSQL diferentes/);
});

test('the local auto-migration helper is structurally disabled in production',()=>{
  assert.doesNotThrow(()=>assertLocalMigrationHelperAllowed('test'));
  assert.throws(()=>assertLocalMigrationHelperAllowed('production'),/proibido em produção/);
});
