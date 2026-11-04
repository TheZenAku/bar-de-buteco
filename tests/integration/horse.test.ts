import test from 'node:test';
import assert from 'node:assert/strict';
import {HORSE,horseFits,isRidingHorse,moveHorse,skillById,skillsOf,loadoutOf,inputSchema} from '../../packages/shared/src/index.js';

const start={x:0,y:0,z:6},input={dx:1,dz:0,running:false,rotation:Math.PI/2};
test('horse is a purchased Tião skill, using the existing configurable loadout',()=>{
  assert.equal(skillById(HORSE.skill)?.skin,'tiao');
  assert.ok(skillsOf('tiao').some(s=>s.id===HORSE.skill));
  assert.deepEqual(loadoutOf({},'tiao',[HORSE.skill]),{skill:HORSE.skill,key:'KeyX'});
  assert.equal(loadoutOf({},'tiao',[]),undefined);
  assert.equal(isRidingHorse('moto:1'),false);
});
test('horse prediction normalizes diagonals and uses the same capped step at both speeds',()=>{
  assert.equal(horseFits(start,0),true);
  const walk=moveHorse(start,0,input),fast=moveHorse(start,0,{...input,running:true});
  assert.ok(Math.abs(walk.x-HORSE.walkSpeed*.05)<1e-6);
  assert.ok(Math.abs(fast.x-HORSE.fastSpeed*.05)<1e-6);
  const diagonal=moveHorse(start,0,{...input,dx:1,dz:1,rotation:Math.PI/4});
  assert.ok(Math.abs(Math.hypot(diagonal.x,diagonal.z-start.z)-walk.x)<1e-6);
  const gallopDiagonal=moveHorse(start,0,{...input,dx:1,dz:1,running:true,rotation:Math.PI/4});
  assert.ok(Math.abs(Math.hypot(gallopDiagonal.x,gallopDiagonal.z-start.z)-fast.x)<1e-6);
  assert.ok(HORSE.fastSpeed>=HORSE.walkSpeed*2,'galloping covers visibly more ground than walking');
  assert.deepEqual(moveHorse(start,0,input,10),moveHorse(start,0,input,.1));
});
test('the horse cannot spawn indoors or enter the bar through walls or doors',()=>{
  assert.equal(horseFits({x:18,y:.3,z:-4},0),false);
  let p={x:10,y:0,z:5,rotation:Math.PI};
  for(let i=0;i<150;i++){
    p=moveHorse(p,p.rotation,{dx:0,dz:-1,running:true,rotation:Math.PI});
    assert.equal(horseFits(p,p.rotation),true);
  }
  assert.ok(p.z>0,'the whole horse stops on the street, before the bar');
});

test('a horse can retreat from forbidden ground when there is no room to turn around',()=>{
  for(const start of [
    {x:-8,y:0,z:-24,rotation:Math.PI/4},
    {x:-8,y:0,z:-28,rotation:7*Math.PI/4},
    {x:-8,y:0,z:-12,rotation:Math.PI/2},
    {x:12,y:0,z:8,rotation:Math.PI},
    {x:20,y:0,z:8,rotation:3*Math.PI/4},
  ]){
    let p=start;
    const dx=Math.sin(start.rotation),dz=Math.cos(start.rotation);
    assert.equal(horseFits(p,p.rotation),true);
    for(let i=0;i<150;i++){
      p=moveHorse(p,p.rotation,{dx,dz,running:true,rotation:start.rotation});
      assert.equal(horseFits(p,p.rotation),true,'the whole horse stays outside the forbidden area');
    }
    const blocked={...p},rotation=Math.atan2(-dx,-dz);
    for(let i=0;i<20;i++){
      p=moveHorse(p,p.rotation,{dx:-dx,dz:-dz,running:false,rotation});
      assert.equal(horseFits(p,p.rotation),true,'retreating and turning keep the whole horse in free space');
    }
    assert.ok(Math.hypot(p.x-blocked.x,p.z-blocked.z)>1,'reversing direction must move away from the boundary');
    assert.ok(Math.abs(Math.atan2(Math.sin(p.rotation-rotation),Math.cos(p.rotation-rotation)))<.001,'the horse turns once there is room');
  }
});

test('repeated turns and stopping keep horse headings valid for the next network input',()=>{
  let p={...start,rotation:0};
  for(let i=0;i<48;i++){
    const heading=i*Math.PI/4,rotation=Math.atan2(Math.sin(heading),Math.cos(heading));
    p=moveHorse(p,p.rotation,{dx:0,dz:0,running:false,rotation});
    assert.ok(Math.abs(p.rotation)<=Math.PI,'prediction must not accumulate complete turns');
    assert.equal(inputSchema.safeParse({seq:i,dx:0,dz:0,running:false,rotation:p.rotation}).success,true,'the predicted stop is accepted by the server');
  }
});
