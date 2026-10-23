import test from 'node:test';
import assert from 'node:assert/strict';
import {movePlayer,isWalkable,RUN_SPEED,OLD_CANE_SPEED,TICK_MS,inputSchema,COLLIDERS,PLAYER_RADIUS,WORLD,BLACKJACK_SEATS,INTERACTABLES,standingPosition} from '@bar/shared';

test('old-cane movement is 0.475 metres per second, including diagonal input and Shift',()=>{
  for(const running of [false,true])for(const [dx,dz] of [[1,0],[1,1]]){
    const start={x:0,y:0,z:7};let position=start;
    for(let i=0;i<20;i++)position=movePlayer(position,{dx,dz,running},TICK_MS/1000,true);
    assert.ok(Math.abs(Math.hypot(position.x-start.x,position.z-start.z)-OLD_CANE_SPEED)<1e-6);
  }
  assert.equal(inputSchema.safeParse({seq:1,dx:1,dz:0,running:true,rotation:0,oldWalk:false,speed:100}).success,false);
});
import {signTicket,verifyTicket} from '@bar/shared/tickets';

test('movement keeps diagonal speed bounded and prevents crossing walls or furniture',()=>{
  const diagonal=movePlayer({x:0,y:0,z:7},{dx:1,dz:1,running:true});
  assert.ok(Math.abs(Math.hypot(diagonal.x,diagonal.z-7)-RUN_SPEED*TICK_MS/1000)<0.00001);
  let position={x:0,y:0,z:7};
  for(let i=0;i<500;i++)position=movePlayer(position,{dx:1,dz:0,running:true});
  assert.ok(isWalkable(position.x,position.z));assert.ok(position.x<WORLD.maxX);
  const table=COLLIDERS.find(collider=>collider.id==='blackjack')!;
  const front={x:table.x,y:.3,z:table.z+table.hz+PLAYER_RADIUS+0.02};
  const blocked=movePlayer(front,{dx:0,dz:-1,running:true});
  assert.equal(blocked.z,front.z);
  assert.equal(inputSchema.safeParse({seq:1,dx:100,dz:0,running:true,rotation:0}).success,false);
});

test('every authored seat has a clear standing position on its floor',()=>{
  const seats=[...BLACKJACK_SEATS,...INTERACTABLES.filter(object=>object.type==='seat')];
  for(const [index,seat] of seats.entries()){
    const exit=standingPosition(seat,seat.rotation);
    assert.ok(isWalkable(exit.x,exit.z,exit.y),`exit from seat at ${seat.x.toFixed(2)},${seat.z.toFixed(2)}`);
    if(index>=BLACKJACK_SEATS.length)assert.ok(Math.hypot(exit.x-seat.x,exit.z-seat.z)>=.19,`exit remains inside chair at ${seat.x.toFixed(2)},${seat.z.toFixed(2)}`);
  }
});

test('game admission tickets authenticate claims and reject tampering and wrong signing secret',()=>{
  const token=signTicket({userId:'test-user',sessionId:'session',displayName:'Jogador',color:'#fff',role:'user'},'a-secret-for-tests-only');
  assert.equal(verifyTicket(token,'a-secret-for-tests-only').userId,'test-user');
  assert.throws(()=>verifyTicket(token,'a-different-secret'));
  const [payload,signature]=token.split('.');
  const changed=JSON.parse(Buffer.from(payload,'base64url').toString());changed.role='admin';
  const forged=`${Buffer.from(JSON.stringify(changed)).toString('base64url')}.${signature}`;
  assert.throws(()=>verifyTicket(forged,'a-secret-for-tests-only'));
});
