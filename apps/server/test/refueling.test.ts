import test from 'node:test';
import assert from 'node:assert/strict';
import {CAR_MODEL,FUEL_PUMPS,MOTO_ENGINE,NEW_CAR_PARTS,parkedMoto,pumpHome,vehicleTank,type FuelPhase} from '@bar/shared';
import {Moto} from '../src/state.js';
import {Refueling} from '../src/world/refueling.js';
import {mkdtemp,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {FileOutbox} from '../src/world/outbox.js';import type {FuelJournal} from '../src/world/refueling.js';

function fixture(budget=500,model=CAR_MODEL){
  const pump=FUEL_PUMPS[0]!,vehicle=new Moto().assign({...parkedMoto({id:'test',x:pump.x-3.3,y:pump.y,z:pump.z-1,yaw:Math.PI}),model,riderId:'driver',parts:NEW_CAR_PARTS,fuel:90,engine:MOTO_ENGINE.OFF});
  let now=Date.now(),online=true,failPayment=false,charges=0;
  const paid:number[]=[],phases:FuelPhase[]=[],positions:Array<{x:number;z:number}>=[];
  const service=new Refueling({vehicles:()=>[vehicle],connected:()=>online,reserve:async()=>({budget}),settle:async(_user,_id,total)=>{charges++;if(failPayment)throw new Error('offline');paid.push(total);return {balance:budget-total,applied:-total};},paid:()=>{},changed:()=>{}});
  const state=service.states.get(pump.id)!,npc=service.npcs.get(pump.npcId)!;
  const tick=async()=>{now+=50;phases.push(state.phase);positions.push({x:npc.x,z:npc.z});service.update(now,.05);await Promise.resolve();await Promise.resolve();};
  const until=async(phase:FuelPhase)=>{for(let i=0;i<4000&&state.phase!==phase;i++)await tick();assert.equal(state.phase,phase);};
  return {service,vehicle,state,pump,npc,paid,phases,positions,tick,until,request:()=>service.request({userId:'driver',sessionId:'test'},vehicle,now),offline:()=>{online=false;},paymentFails:(value:boolean)=>{failPayment=value;},charges:()=>charges};
}
test('first physical pump: exact sequence, gradual fuel, actual walking and only one debit after docking',async()=>{
  const f=fixture();await f.request();assert.equal(f.service.busy(f.vehicle.id),true);
  assert.ok([...f.service.npcs.values()].every(npc=>npc.skin==='frentista'));
  await assert.rejects(f.request(),/atendimento/);
  await f.until('fueling');assert.equal(f.vehicle.fuel,90);assert.deepEqual(f.paid,[]);
  const before=f.vehicle.fuel;await f.tick();assert.ok(f.vehicle.fuel>before&&f.vehicle.fuel<100);
  await f.until('replace');assert.deepEqual(f.paid,[],'the nozzle must be returned before billing');
  await f.until('idle');assert.equal(f.vehicle.fuel,100);assert.deepEqual(f.paid,[26]);
  const phases=f.phases.filter((p,i,a)=>i===0||p!==a[i-1]);
  assert.deepEqual(phases,['to-pump','take','to-car','insert','fueling','remove','return','replace','paying','home']);
  for(let i=1;i<f.positions.length;i++)assert.ok(Math.hypot(f.positions[i]!.x-f.positions[i-1]!.x,f.positions[i]!.z-f.positions[i-1]!.z)<=.063,'walk speed is bounded, no teleport');
  const home=pumpHome(f.pump);assert.ok(Math.hypot(f.npc.x-home.x,f.npc.z-home.z)<.01);assert.equal(f.service.busy(f.vehicle.id),false);
  for(let i=0;i<100;i++)await f.tick();assert.equal(f.paid.length,1);
});
test('limited balance, full tank, moving vehicle and running engine',async()=>{
  const f=fixture(3);f.vehicle.engine=MOTO_ENGINE.ON;await assert.rejects(f.request(),/motor/);f.vehicle.engine=MOTO_ENGINE.OFF;
  f.vehicle.lateralSpeed=.2;await assert.rejects(f.request(),/Pare/);f.vehicle.lateralSpeed=0;
  f.vehicle.fuel=100;await assert.rejects(f.request(),/cheio/);f.vehicle.fuel=90;
  await f.request();await f.until('idle');assert.equal(f.paid[0],3);assert.ok(Math.abs(f.state.litres-.5)<1e-6);assert.ok(Math.abs(f.vehicle.fuel-(90+.5/vehicleTank(CAR_MODEL)*100))<1e-6);assert.match(f.state.message,/moedas/);
});
test('cancellation at every phase completes the return and charges only delivered litres',async()=>{
  for(const phase of ['to-pump','take','to-car','insert','fueling','remove','return','replace'] as FuelPhase[]){
    const f=fixture();await f.request();await f.until(phase);if(phase==='fueling')for(let i=0;i<5;i++)await f.tick();
    f.service.cancel('driver');await f.until('idle');assert.equal(f.paid.length,1,phase);assert.equal(f.paid[0],f.state.total,phase);assert.equal(f.service.busy(f.vehicle.id),false);
  }
});
test('disconnect and API outage retain payment identity, controlled finalization and independent pumps',async()=>{
  const f=fixture();await f.request();await f.until('fueling');for(let i=0;i<10;i++)await f.tick();f.offline();f.paymentFails(true);
  await f.until('paying');for(let i=0;i<70;i++)await f.tick();assert.equal(f.paid.length,0);assert.equal(f.service.busy(f.vehicle.id),true);assert.ok(f.charges()>=1);
  f.paymentFails(false);await f.until('idle');assert.equal(f.paid.length,1);
  assert.equal(f.service.states.get(FUEL_PUMPS[1]!.id)!.phase,'idle');
});
test('motorcycle uses its existing 5.5 litre tank and has a reachable filler',async()=>{
  const f=fixture(100,'moto-delivery');await f.request();await f.until('idle');assert.ok(Math.abs(f.state.litres-.55)<1e-5);assert.equal(f.vehicle.fuel,100);
});
test('all authored pumps can serve independently; the same pump refuses a second driver',async()=>{
  const vehicles=FUEL_PUMPS.map((p,i)=>new Moto().assign({...parkedMoto({id:`v${i}`,x:p.x-3.3,y:p.y,z:p.z-1,yaw:Math.PI}),model:CAR_MODEL,riderId:`d${i}`,fuel:99,engine:0}));
  const paid:number[]=[],service=new Refueling({vehicles:()=>vehicles,connected:()=>true,reserve:async()=>({budget:100}),settle:async(_user,_id,total)=>{paid.push(total);return {balance:100-total,applied:-total};},paid:()=>{},changed:()=>{}});
  let now=Date.now();await Promise.all(vehicles.map((v,i)=>service.request({userId:`d${i}`,sessionId:'test'},v,now)));
  const second=new Moto().assign({...vehicles[0]!.toJSON(),id:'second',riderId:'another'});await assert.rejects(service.request({userId:'another',sessionId:'test'},second,now),/ocupada/);
  for(let i=0;i<1000&&[...service.states.values()].some(s=>s.phase!=='idle');i++){now+=50;service.update(now,.05);await Promise.resolve();await Promise.resolve();}
  assert.ok([...service.states.values()].every(s=>s.phase==='idle'));assert.equal(paid.length,FUEL_PUMPS.length);assert.ok(vehicles.every(v=>v.fuel===100));
});
test('a restarted room replays its durable costs and releases unused holds, preserving ids across API retries',async t=>{
  const folder=await mkdtemp(join(tmpdir(),'bar-fuel-'));t.after(()=>rm(folder,{recursive:true,force:true}));
  const path=join(folder,'fuel.jsonl'),journal=new FileOutbox<FuelJournal>(path);
  journal.add('fuel','interrupted',{userId:'driver',total:9});journal.add('fuel','unused',{userId:'other',total:0});
  let available=false;const requests:string[]=[];
  const service=new Refueling({vehicles:()=>[],connected:()=>false,reserve:async()=>({budget:0}),settle:async(user,id,total)=>{requests.push(`${user}:${id}:${total}`);if(!available)throw new Error('API away');return {balance:100-total,applied:-total};},paid:()=>{},changed:()=>{}},new FileOutbox<FuelJournal>(path));
  await service.recover();assert.equal(new FileOutbox(path).size,2);available=true;await service.recover();assert.equal(new FileOutbox(path).size,0);
  assert.deepEqual(requests,['driver:interrupted:9','other:unused:0','driver:interrupted:9','other:unused:0']);
  await service.recover();assert.equal(requests.length,4);
});
