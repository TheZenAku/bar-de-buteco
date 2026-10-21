import test from 'node:test';
import assert from 'node:assert/strict';
import {movePlayer,isWalkable,RUN_SPEED,TICK_MS,inputSchema} from '@bar/shared';
import {signTicket,verifyTicket} from '@bar/shared/tickets';

test('movement keeps diagonal speed bounded and prevents crossing walls or furniture',()=>{
  const diagonal=movePlayer({x:0,z:0},{dx:1,dz:1,running:true});
  assert.ok(Math.abs(Math.hypot(diagonal.x,diagonal.z)-RUN_SPEED*TICK_MS/1000)<0.00001);
  let position={x:0,z:0};
  for(let i=0;i<500;i++)position=movePlayer(position,{dx:1,dz:0,running:true});
  assert.ok(isWalkable(position.x,position.z));assert.ok(position.x<14);
  const blocked=movePlayer({x:5,z:-1.7},{dx:0,dz:-1,running:true});
  assert.equal(blocked.z,-1.7);
  assert.equal(inputSchema.safeParse({seq:1,dx:100,dz:0,running:true,rotation:0}).success,false);
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
