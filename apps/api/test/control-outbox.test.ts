import {test} from 'node:test';
import assert from 'node:assert/strict';
import {eq} from 'drizzle-orm';
import {createApi} from '../src/app.js';
import {readConfig} from '../src/config.js';
import {connectMigratedDatabase} from '../src/database/index.js';
import {controls} from '../src/database/schema.js';
import {CONTROL_OUTBOX,acknowledgeControls,claimControlsOnce,leaseControls} from '../src/control-outbox.js';

const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

test('control outbox: lease, confirm, redelivery after a crash, dead letter and the previous version',async t=>{
  const connection=await connectMigratedDatabase({path:'memory://'});t.after(()=>connection.close());
  const {db}=connection;
  // Rows are written exactly as the admin transaction writes them (id + payload): status defaults to pending.
  const issue=async(id:string,action='kick')=>{await db.insert(controls).values({id,payload:{id,action,playerId:'p1',issuedAt:Date.now()}});await pause(5);};

  await t.test('leases are exclusive, ordered, and confirmed rows are never delivered again',async()=>{
    await issue('a');await issue('b');await issue('c');
    const [first,second]=await Promise.all([leaseControls(db,'world-1',{limit:2}),leaseControls(db,'world-2',{limit:2})]);
    const ids=[...first,...second].map(row=>row.id);
    assert.deepEqual([...ids].sort(),['a','b','c'],'Every control leased once, by one owner');
    assert.equal(new Set(ids).size,3);
    const one=first.length===2?first:second;assert.deepEqual(one.map(row=>row.id),['a','b'],'Issue order');
    assert.ok([...first,...second].every(row=>row.attempts===1));
    const holder=(id:string)=>first.some(row=>row.id===id)?'world-1':'world-2';
    // Confirmations from someone who does not hold the lease change nothing.
    assert.deepEqual(await acknowledgeControls(db,'intruder',['a','b','c']),{applied:0,failed:0});
    for(const id of ['a','b','c'])assert.equal((await acknowledgeControls(db,holder(id),[id])).applied,1);
    assert.deepEqual(await leaseControls(db,'world-1'),[]);
    assert.deepEqual((await db.select().from(controls)).map(row=>row.status),['applied','applied','applied']);
  });

  await t.test('a crash between lease and confirmation delivers the control again after the lease expires',async()=>{
    await issue('crash');
    const leased=await leaseControls(db,'crashed-world',{leaseMs:60});
    assert.deepEqual(leased.map(row=>row.id),['crash']);
    assert.deepEqual(await leaseControls(db,'new-world',{leaseMs:60}),[],'Still leased: not delivered twice at once');
    await pause(120);
    const again=await leaseControls(db,'new-world');
    assert.deepEqual(again.map(row=>[row.id,row.attempts]),[['crash',2]]);
    assert.equal((await acknowledgeControls(db,'crashed-world',['crash'])).applied,0,'A late confirmation from the old owner is ignored');
    assert.equal((await acknowledgeControls(db,'new-world',['crash'])).applied,1);
    const [row]=await db.select().from(controls).where(eq(controls.id,'crash'));
    assert.equal(row!.status,'applied');assert.ok(row!.appliedAt);
  });

  await t.test('repeated expiries park the control as failed (dead letter); reported failures keep the reason',async()=>{
    await issue('poison');
    for(let attempt=1;attempt<=3;attempt++){const leased=await leaseControls(db,`w${attempt}`,{leaseMs:20,maxAttempts:3});assert.deepEqual(leased.map(row=>row.attempts),[attempt]);await pause(40);}
    assert.deepEqual(await leaseControls(db,'w4',{leaseMs:20,maxAttempts:3}),[]);
    const [poison]=await db.select().from(controls).where(eq(controls.id,'poison'));
    assert.equal(poison!.status,'failed');assert.match(poison!.lastError!,/3 attempts/);
    await issue('rejected','event');
    await leaseControls(db,'w5');
    assert.deepEqual(await acknowledgeControls(db,'w5',[],[{id:'rejected',error:'evento desconhecido'}]),{applied:0,failed:1});
    const [rejected]=await db.select().from(controls).where(eq(controls.id,'rejected'));
    assert.equal(rejected!.status,'failed');assert.equal(rejected!.lastError,'evento desconhecido');
  });

  await t.test('the previous world version (GET, no confirmation) still gets each control once',async()=>{
    await issue('legacy');
    assert.deepEqual((await claimControlsOnce(db)).map(row=>row.id),['legacy']);
    assert.deepEqual(await claimControlsOnce(db),[]);
  });

  await t.test('the previous API version (DELETE RETURNING) still works against the expanded table',async()=>{
    await issue('old-api');
    // Exactly the previous statement: claims (deletes) everything, whatever the new columns say.
    const claimed=await db.delete(controls).returning();
    assert.ok(claimed.some(row=>row.id==='old-api'));
    assert.equal((await db.select().from(controls)).length,0);
  });

  assert.equal(CONTROL_OUTBOX.maxAttempts>1,true);
});

test('internal outbox routes require the internal secret and validate the owner',async t=>{
  const config={...readConfig(),production:false,databaseUrl:undefined,dataPath:'memory://',autoVerifyEmail:true};
  const service=await createApi({config,rateLimit:false,migrate:true});t.after(()=>service.app.close());
  const headers={'x-internal-secret':config.internalSecret};
  await service.db.insert(controls).values({id:'route',payload:{id:'route',action:'event',eventType:'PARTY'}});
  assert.equal((await service.app.inject({method:'POST',url:'/api/internal/controls/lease',payload:{owner:'w'}})).statusCode,401);
  assert.equal((await service.app.inject({method:'POST',url:'/api/internal/controls/lease',payload:{owner:''},headers})).statusCode,400);
  const leased=(await service.app.inject({method:'POST',url:'/api/internal/controls/lease',payload:{owner:'w'},headers})).json().controls;
  assert.deepEqual(leased,[{id:'route',action:'event',eventType:'PARTY',attempts:1}]);
  const ack=await service.app.inject({method:'POST',url:'/api/internal/controls/ack',payload:{owner:'w',applied:['route']},headers});
  assert.deepEqual(ack.json(),{applied:1,failed:0});
});
