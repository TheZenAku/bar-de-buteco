import test from 'node:test';
import assert from 'node:assert/strict';
import {USE_DURATION_MS,consumeMs,consumedOverTime,type PlayerState,type ServedItemState,type WorldState} from '@bar/shared';
import {consumptions} from '../../apps/web/src/consumption.ts';

const me=(patch:Partial<PlayerState>={}):PlayerState=>({id:'me',displayName:'Eu',color:'#fff',skin:'nathan',x:0,y:.3,z:0,rotation:0,animationState:'idle',animationStartedAt:0,interactionState:'',currentTableId:'',lastProcessedInput:0,connected:true,...patch});
const served=(id:string,patch:Partial<ServedItemState>):ServedItemState=>({id,item:'coxinha',table:4,x:0,y:.8,z:0,rotation:0,placedAt:1_000,orderId:'o1',slot:0,seat:'seat-4-1',...patch});
const world=(self:PlayerState,items:ServedItemState[]=[]):WorldState=>({players:{[self.id]:self},npcs:{},tables:{},event:{id:'',type:'',startedAt:0,durationMs:0},occupancy:1,capacity:32,serverTime:0,served:Object.fromEntries(items.map(i=>[i.id,i]))});
const holding=(item:string,since:number)=>({holding:item,holdingSince:since,holdingUntil:since+consumeMs(item)});

test('every drink and snack lasts the same wherever it comes from: the counter, the backpack or a table',()=>{
  for(const item of ['garrafa','copo','agua','refrigerante','cafe','coxinha','pastel','torresmo'])assert.equal(consumedOverTime(item),true,item);
  assert.equal(consumedOverTime('curativo'),false,'a bandage is used at once');
  const walking=me({animationState:'walk',...holding('copo',5_000)});
  const seated=me({interactionState:'seat-4-1',animationState:'sit'});
  const [inHand]=consumptions(world(walking),walking,'',6_000),[atTable]=consumptions(world(seated,[served('o1:0',{item:'copo',placedAt:5_000})]),seated,'',6_000);
  assert.equal(inHand!.durationMs,atTable!.durationMs);assert.equal(inHand!.durationMs,consumeMs('copo'));
});

test('what is in hand counts while walking around until it is finished; waiting at the counter is not consuming',()=>{
  const drinking=me({animationState:'walk',...holding('garrafa',5_000)});
  assert.deepEqual(consumptions(world(drinking),drinking,'',6_000),[{id:'hand:5000',item:'garrafa',startedAt:5_000,durationMs:consumeMs('garrafa')}]);
  assert.deepEqual(consumptions(world(drinking),drinking,'',5_000+consumeMs('garrafa')),[],'finished');
  const waiting=me({interactionState:'counter',animationState:'wait',drinkItem:'copo'});
  assert.deepEqual(consumptions(world(waiting),waiting,'',6_000),[]);
});

test('a snack from the backpack is had in hand; a bandage shows its quick use, named by the item asked for',()=>{
  const snack=me({...holding('coxinha',2_000)});
  assert.deepEqual(consumptions(world(snack),snack,'coxinha',2_500).map(c=>[c.item,c.durationMs]),[['coxinha',consumeMs('coxinha')]]);
  const bandage=me({interactionState:'inventory',animationState:'use',animationStartedAt:2_000});
  assert.deepEqual(consumptions(world(bandage),bandage,'curativo',2_500).map(c=>[c.item,c.durationMs]),[['curativo',USE_DURATION_MS]]);
});

test('seated, every item served at that seat counts from when it touched the table, beside what is in hand',()=>{
  const seated=me({interactionState:'seat-4-1',animationState:'sit',...holding('agua',1_500)});
  const items=[
    served('o1:0',{item:'torresmo',placedAt:3_000}),
    served('o1:1',{item:'copo',placedAt:2_000,slot:1}),
    served('o1:2',{item:'agua',placedAt:9_000,slot:2}),               // still on the tray
    served('o0:0',{item:'pastel',placedAt:500,doneAt:1_500}),          // finished
    served('o2:0',{item:'cafe',placedAt:1_000,seat:'seat-4-2'}),        // the neighbour's
  ];
  assert.deepEqual(consumptions(world(seated,items),seated,'',5_000),[
    {id:'hand:1500',item:'agua',startedAt:1_500,durationMs:consumeMs('agua')},
    {id:'o1:1',item:'copo',startedAt:2_000,durationMs:consumeMs('copo')},
    {id:'o1:0',item:'torresmo',startedAt:3_000,durationMs:consumeMs('torresmo')},
  ]);
  // Getting up stops the table's items (the room marks what is left as finished); the hand keeps its own.
  const standing=me({interactionState:'seat-4-1',animationState:'stand-up',...holding('agua',1_500)});
  assert.deepEqual(consumptions(world(standing,items),standing,'',5_000).map(c=>c.item),['agua']);
});
