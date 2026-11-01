import {test} from 'node:test';import assert from 'node:assert/strict';
import {copyFile,mkdir,mkdtemp,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {PLATE} from '@bar/shared';
import {connectDatabase,defaultMigrationFolder,migrateDatabase} from '../src/database/index.js';
import {loadMigrations,MIGRATION_TABLE} from '../src/database/migrations.js';

test('bikes bought before the garages keep their owner and state, and get an id and a plate of their own',async t=>{
  const root=await mkdtemp(join(tmpdir(),'bar-vehicles-')),folder=join(root,'migrations'),path=join(root,'database');
  t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(folder);
  const names=(await readdir(defaultMigrationFolder)).filter(name=>name.endsWith('.sql')).sort(),last=names.indexOf('014_garage_trade.sql');
  assert.ok(last>0);
  for(const name of names)await copyFile(join(defaultMigrationFolder,name),join(folder,name));
  // A database as the live one is today: everything before this migration applied and in the ledger, with bikes on it.
  const earlier=(await loadMigrations(folder)).slice(0,last),database=new PGlite(path);await database.waitReady;
  await database.exec(`CREATE TABLE ${MIGRATION_TABLE} (name text PRIMARY KEY, checksum text NOT NULL CHECK (length(checksum) = 64), applied_at timestamptz NOT NULL DEFAULT now())`);
  for(const migration of earlier){await database.exec(migration.sql);await database.query(`INSERT INTO ${MIGRATION_TABLE} (name,checksum) VALUES ($1,$2)`,[migration.name,migration.checksum]);}
  for(let n=0;n<3;n++){
    await database.query(`INSERT INTO users (id,username,email,password_hash) VALUES ('u${n}','u${n}','u${n}@test.local','hash')`);
    await database.query(`INSERT INTO player_vehicles (user_id,model,parts,mileage) VALUES ('u${n}','moto-delivery','${n},100,100,100,100,100,100,100,100,100,100,100',${n*1000})`);
  }
  await database.close();
  const {applied}=await migrateDatabase({path,migrationFolder:folder});
  assert.deepEqual(applied,names.slice(last));
  // The schema contract holds for the database that came this way, not only for a new one.
  const connection=await connectDatabase({path,migrationFolder:folder});await connection.close();
  const after=new PGlite(path);await after.waitReady;
  try{
    const {rows}=await after.query<{id:string;plate:string;user_id:string;parts:string;mileage:number}>('SELECT id,plate,user_id,parts,mileage FROM player_vehicles ORDER BY user_id');
    assert.equal(rows.length,3);
    rows.forEach((row,n)=>{
      assert.equal(row.user_id,`u${n}`);assert.equal(row.mileage,n*1000);assert.ok(row.parts.startsWith(`${n},`));
      assert.ok(PLATE.test(row.plate),row.plate);assert.match(row.id,/^[0-9a-f-]{36}$/);
    });
    assert.equal(new Set(rows.map(row=>row.plate)).size,3);
    // Run again over itself, as a legacy baseline does: nothing changes.
    await after.exec((await loadMigrations(folder))[last]!.sql);
    assert.deepEqual((await after.query<{plate:string}>('SELECT plate FROM player_vehicles ORDER BY user_id')).rows.map(row=>row.plate),rows.map(row=>row.plate));
    // Two rows cannot share a plate, or an id.
    await assert.rejects(()=>after.query(`UPDATE player_vehicles SET plate='${rows[0]!.plate}' WHERE id='${rows[1]!.id}'`));
    await assert.rejects(()=>after.query(`INSERT INTO player_vehicles (id,plate,user_id,model,parts) VALUES ('${rows[0]!.id}','ZZZ9Z99','u0','moto-delivery','x')`));
  }finally{await after.close();}
});
