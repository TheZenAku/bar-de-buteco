import test from 'node:test';
import assert from 'node:assert/strict';
import {movePlayer,isWalkable,RUN_SPEED,TICK_MS,inputSchema,COLLIDERS,PLAYER_RADIUS,WORLD,BLACKJACK_SEATS,INTERACTABLES} from '@bar/shared';
import {signTicket,verifyTicket} from '@bar/shared/tickets';

test('movement keeps diagonal speed bounded and prevents crossing walls or furniture',()=>{
  const diagonal=movePlayer({x:0,z:0},{dx:1,dz:1,running:true});
  assert.ok(Math.abs(Math.hypot(diagonal.x,diagonal.z)-RUN_SPEED*TICK_MS/1000)<0.00001);
  let position={x:0,z:0};
  for(let i=0;i<500;i++)position=movePlayer(position,{dx:1,dz:0,running:true});
  assert.ok(isWalkable(position.x,position.z));assert.ok(position.x<WORLD.maxX);
  const table=COLLIDERS.find(collider=>collider.id==='blackjack')!;
  const front={x:table.x,z:table.z+table.hz+PLAYER_RADIUS+0.2};
  const blocked=movePlayer(front,{dx:0,dz:-1,running:true});
  assert.equal(blocked.z,front.z);
  assert.equal(inputSchema.safeParse({seq:1,dx:100,dz:0,running:true,rotation:0}).success,false);
});

test('every seat is inside the room and walkable, so a seated player can stand up and leave',()=>{
  for(const seat of [...BLACKJACK_SEATS,...INTERACTABLES.filter(object=>object.type==='seat')]){
    assert.ok(isWalkable(seat.x,seat.z),`seat at ${seat.x.toFixed(2)},${seat.z.toFixed(2)}`);
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
