import test from 'node:test';
import assert from 'node:assert/strict';
import {BLOCK,FIGHT,FIGHT_MOVES,PUNCH_IDS,NO_PUNCH,TICK_MS,blockCovers,blockVerdict,chipOf,fightMove,inputSchema,oneWayOf,type BlockSpan} from '@bar/shared';

const base={seq:1,dx:0,dz:0,running:false,rotation:0};

test('the block rides in the input stream: the schema takes the held key and the one report of how late the press is, and nothing else',()=>{
  assert.equal(inputSchema.safeParse({...base,fight:true,block:true}).success,true);
  assert.equal(inputSchema.safeParse({...base,fight:true,block:true,blockAt:{seen:1000,ago:30}}).success,true);
  assert.equal(inputSchema.safeParse({...base,fight:true,block:true,blockAt:{seen:1000,ago:30,extra:1}}).success,false,'strict');
  assert.equal(inputSchema.safeParse({...base,fight:true,block:true,blockAt:{seen:-1,ago:30}}).success,false);
  assert.equal(inputSchema.safeParse({...base,fight:true,block:true,blockAt:{seen:1000,ago:99999}}).success,false);
  assert.equal(inputSchema.safeParse({...base,block:'yes'}).success,false);
});

test('walking with the block held is slower than the guard walk, and never runs; the same on both ends because it reads only the input',()=>{
  const from={x:60,y:0,z:7},dt=TICK_MS/1000;
  const walk=fightMove(from,NO_PUNCH,1,{dx:0,dz:1},dt,false,[]),blocked=fightMove(from,NO_PUNCH,1,{dx:0,dz:1,block:true},dt,false,[]);
  const runBlocked=fightMove(from,NO_PUNCH,1,{dx:0,dz:1,block:true,running:true},dt,false,[]);
  assert.ok(Math.abs((walk.z-from.z)-FIGHT.speed*dt)<1e-9);
  assert.ok(Math.abs((blocked.z-from.z)-BLOCK.speed*dt)<1e-9);
  assert.equal(runBlocked.z,blocked.z,'Shift does not run with the block up');
  assert.ok(BLOCK.speed<FIGHT.speed);
});

test('the trip of an input from what its browser reports: half of the way down, wait and way up, less half a tick; bounded; zero when the report cannot be true',()=>{
  // A browser that drew the state sent at 1000 right away (ago 0) and whose input is taken at 1225: 225 ms there and back, 25 ms of which is the tick's wait.
  assert.equal(oneWayOf(1225,{seen:1000,ago:0}),100);
  // Holding the state for 100 ms before sending is not network.
  assert.equal(oneWayOf(1225,{seen:1000,ago:100}),50);
  assert.equal(oneWayOf(1000,{seen:1000,ago:0}),0,'a LAN: nothing');
  assert.equal(oneWayOf(900,{seen:1000,ago:0}),0,'from the future');
  assert.equal(oneWayOf(1000+5000,{seen:1000,ago:0}),BLOCK.lateMaxMs,'bounded: a liar cannot go back further');
  assert.equal(oneWayOf(1225,{seen:Number.NaN,ago:0}),0);
});

test('the verdict of a blow is read on the blocker\'s own timeline: parry inside the window after the press, block after it, nothing outside the span',()=>{
  const held:BlockSpan[]=[{from:1000,to:Infinity,parry:true}];
  // A press up to parryLateMs after the contact still defends it (the blocker pressed on what they saw); past that it is too late.
  assert.equal(blockVerdict(held,1000-BLOCK.parryLateMs-1),'none','too late');
  assert.equal(blockVerdict(held,1000-BLOCK.parryLateMs),'parry','a late press that opened a window');
  assert.equal(blockVerdict([{from:1000,to:Infinity,parry:false}],1000-BLOCK.parryLateMs),'block','a late press that did not: still a block, never nothing');
  assert.equal(blockVerdict([{from:1000,to:Infinity,parry:true,early:BLOCK.botParryMs,late:0}],999),'none','a bot has no late window');
  assert.equal(blockVerdict(held,1000),'parry');
  assert.equal(blockVerdict(held,1000+BLOCK.parryMs),'parry');
  assert.equal(blockVerdict(held,1000+BLOCK.parryMs+1),'block');
  assert.equal(blockVerdict([{from:1000,to:1000+BLOCK.parryMs+100,parry:true}],1000+BLOCK.parryMs+101),'none','after the release');
  assert.equal(blockVerdict([{from:1000,to:1000+BLOCK.parryMs+100,parry:true}],1000+BLOCK.parryMs+100),'block');
  // A press that did not earn a window (mashing) is a block however fresh.
  assert.equal(blockVerdict([{from:1000,to:Infinity,parry:false}],1010),'block');
  // The newest span that holds the moment decides.
  assert.equal(blockVerdict([{from:100,to:400,parry:true},{from:900,to:Infinity,parry:true}],950),'parry');
  assert.equal(blockVerdict([],5),'none');
});

test('a block covers the arc in front only',()=>{
  const at={x:0,y:0,z:0,rotation:0};   // facing +z
  assert.equal(blockCovers(at,{x:0,z:1}),true);
  assert.equal(blockCovers(at,{x:1,z:.4}),true,'a little to the side');
  assert.equal(blockCovers(at,{x:1,z:-.2}),false,'beside and behind');
  assert.equal(blockCovers(at,{x:0,z:-1}),false,'behind');
  assert.equal(blockCovers({...at,rotation:Math.PI},{x:0,z:-1}),true,'turned around');
});

test('what gets through a block: a share, heavier blows let more, never the last point',()=>{
  for(const id of PUNCH_IDS){
    const blow=FIGHT_MOVES[id],chip=chipOf(id,100);
    assert.equal(chip,Math.round(blow.damage*(blow.heavy?BLOCK.chipHeavy:BLOCK.chip)),id);
    assert.ok(chip<blow.damage,`${id}: a block always saves something`);
    assert.equal(chipOf(id,1),0,`${id}: the last point stays`);
    assert.equal(chipOf(id,0),0);
  }
});

test('the numbers hold together: three heavy blows break a full meter, the parry window is shorter than its cooldown, the wait is bounded',()=>{
  assert.ok(FIGHT_MOVES.heavy.damage*BLOCK.drain*5>BLOCK.meter&&FIGHT_MOVES.heavy.damage*BLOCK.drain*3<=BLOCK.meter,'five hay-makers break it');
  assert.ok(FIGHT_MOVES.jab.damage*BLOCK.drain*12<BLOCK.meter&&FIGHT_MOVES.jab.damage*BLOCK.drain*15>BLOCK.meter,'a dozen and a half jabs do');
  assert.ok(BLOCK.parryMs<BLOCK.parryCooldownMs);
  assert.ok(BLOCK.deferMaxMs>=TICK_MS&&BLOCK.deferMaxMs<=BLOCK.parryLateMs,'the wait never outlasts the late window it exists for');
  assert.ok(BLOCK.parryStunMs>FIGHT_MOVES.heavy.activeFrom,'the parried puncher stays down long enough for a counter to land');
});
