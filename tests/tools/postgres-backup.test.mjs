import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {assertTemporaryDatabaseName,createPostgresBackup,sha256,verifyPostgresRestore} from '../../tools/ops/postgres-backup-lib.mjs';

function workspace(t){const root=mkdtempSync(join(tmpdir(),'bar-pg-ops-'));mkdirSync(join(root,'.local/backups'),{recursive:true});writeFileSync(join(root,'.env.production'),'POSTGRES_PASSWORD=fake\n');t.after(()=>rmSync(root,{recursive:true,force:true}));return root;}
function fakeExecutor(steps){const calls=[];return {calls,run(command,args,options={}){calls.push({command,args,input:options.input});const step=steps.shift();if(!step)throw new Error('Comando inesperado');if(step.error)throw step.error;return {stdout:Buffer.from(step.stdout??''),stderr:Buffer.alloc(0)};}};}

test('backup uses pg_dump, validates the archive and writes an atomic checksum without overwriting',t=>{
  const root=workspace(t),dump=Buffer.from('PGDMP\0fake'),fake=fakeExecutor([{stdout:dump},{stdout:'archive list'}]);
  const result=createPostgresBackup({root,output:'.local/backups/bar-test.dump',run:fake.run});
  assert.deepEqual(readFileSync(result.path),dump);assert.equal(result.digest,sha256(dump));
  assert.equal(readFileSync(result.checksumPath,'utf8'),`${result.digest}  bar-test.dump\n`);
  assert.match(fake.calls[0].args.join(' '),/pg_dump .*--format=custom/);assert.deepEqual(fake.calls[1].input,dump);
  assert.throws(()=>createPostgresBackup({root,output:'.local/backups/bar-test.dump',run:fake.run}),/sobrescrito/);
  assert.throws(()=>createPostgresBackup({root,output:'../outside.dump',run:fake.run}),/dentro de \.local\/backups/);
});

test('a publication race never removes the artifact that won the destination name',t=>{
  const root=workspace(t),dump=Buffer.from('PGDMP-race-winner'),target=join(root,'.local/backups/bar-raced.dump'),checksumPath=`${target}.sha256`;
  let call=0;
  const run=()=>{
    call++;
    if(call===2)writeFileSync(checksumPath,'winner checksum\n');
    return {stdout:call===1?dump:Buffer.from('archive list'),stderr:Buffer.alloc(0)};
  };
  assert.throws(()=>createPostgresBackup({root,output:'.local/backups/bar-raced.dump',run}),/EEXIST|already exists/i);
  assert.deepEqual(readFileSync(target),dump);
  assert.equal(readFileSync(checksumPath,'utf8'),'winner checksum\n');
  assert.throws(()=>verifyPostgresRestore({root,input:'.local/backups/bar-raced.dump',run}),/Checksum/);
});

test('checksum mismatch refuses restore before Docker or a temporary database is touched',t=>{
  const root=workspace(t),path=join(root,'.local/backups/bar-bad.dump');writeFileSync(path,'changed');writeFileSync(`${path}.sha256`,`${'0'.repeat(64)}  bar-bad.dump\n`);
  const fake=fakeExecutor([]);
  assert.throws(()=>verifyPostgresRestore({root,input:'.local/backups/bar-bad.dump',run:fake.run}),/Checksum/);assert.equal(fake.calls.length,0);
});

test('restore is limited to a reserved temporary database, validates core tables and always drops it',t=>{
  const root=workspace(t),path=join(root,'.local/backups/bar-good.dump'),dump=Buffer.from('PGDMP-good');writeFileSync(path,dump);writeFileSync(`${path}.sha256`,`${sha256(dump)}  bar-good.dump\n`);
  const name='bar_restore_check_20261024_120000_abcdef123456';
  const fake=fakeExecutor([{stdout:'list'},{stdout:''},{stdout:''},{stdout:''},{stdout:'t\n'},{stdout:''}]);
  const result=verifyPostgresRestore({root,input:'.local/backups/bar-good.dump',databaseName:name,run:fake.run});
  assert.equal(result.verified,true);assert.match(fake.calls[2].args.join(' '),new RegExp(`CREATE DATABASE "${name}"`));
  assert.deepEqual(fake.calls[3].input,dump);assert.match(fake.calls.at(-1).args.join(' '),new RegExp(`DROP DATABASE IF EXISTS "${name}" WITH \\(FORCE\\)`));
  assert.throws(()=>assertTemporaryDatabaseName('bar'),/inseguro/);
});

test('a failed restore still drops only the generated temporary database',t=>{
  const root=workspace(t),path=join(root,'.local/backups/bar-fail.dump'),dump=Buffer.from('PGDMP-fail');writeFileSync(path,dump);writeFileSync(`${path}.sha256`,`${sha256(dump)}  bar-fail.dump\n`);
  const name='bar_restore_check_20261024_120000_123456abcdef',failure=new Error('restore failed');
  const fake=fakeExecutor([{stdout:'list'},{stdout:''},{stdout:''},{error:failure},{stdout:''}]);
  assert.throws(()=>verifyPostgresRestore({root,input:'.local/backups/bar-fail.dump',databaseName:name,run:fake.run}),/restore failed/);
  assert.match(fake.calls.at(-1).args.join(' '),new RegExp(`DROP DATABASE IF EXISTS "${name}"`));
  const destructive=fake.calls.filter(call=>call.args.some(arg=>String(arg).includes('DROP DATABASE')));
  assert.equal(destructive.length,1);assert.match(destructive[0].args.join(' '),new RegExp(name));
});

test('a failed CREATE never drops a database that may belong to another process',t=>{
  const root=workspace(t),path=join(root,'.local/backups/bar-race.dump'),dump=Buffer.from('PGDMP-race');writeFileSync(path,dump);writeFileSync(`${path}.sha256`,`${sha256(dump)}  bar-race.dump\n`);
  const name='bar_restore_check_20261024_120000_fedcba654321';
  const fake=fakeExecutor([{stdout:'list'},{stdout:''},{error:new Error('already exists')}]);
  assert.throws(()=>verifyPostgresRestore({root,input:'.local/backups/bar-race.dump',databaseName:name,run:fake.run}),/already exists/);
  assert.equal(fake.calls.filter(call=>call.args.some(arg=>String(arg).includes('DROP DATABASE'))).length,0);
});
