import test from 'node:test';
import assert from 'node:assert/strict';
import {HORSE_REAR,horseRearLevel,motoInputSchema,inputSchema,stepWheelie,wheeliePose} from '@bar/shared';

test('a wheelie only raises a powered motorcycle moving forward and drops under braking or release',()=>{
  let level=0;for(let n=0;n<30;n++)level=stepWheelie(level,true,4,false,true);
  assert.ok(level>.99&&level<=1);
  for(const [speed,brake,power,car] of [[0,false,true,false],[-3,false,true,false],[4,true,true,false],[4,false,false,false],[4,false,true,true]] as const)
    assert.ok(stepWheelie(level,true,speed,brake,power,car)<level);
  for(let n=0;n<30;n++)level=stepWheelie(level,false,4,false,true);
  assert.ok(level<.00001);
});
test('raising the motorcycle rotates about the rear axle without burying the rear tyre',()=>{
  for(const level of [0,.1,.5,1]){
    const pose=wheeliePose(level),angle=pose.angle*Math.PI/180;
    const rearY=pose.y+.3*Math.cos(angle)-.675*Math.sin(angle);
    const rearZ=pose.z-.3*Math.sin(angle)-.675*Math.cos(angle);
    assert.ok(Math.abs(rearY-.3)<1e-12);assert.ok(Math.abs(rearZ+.675)<1e-12);
    assert.ok(pose.angle>=0&&pose.angle<=34);
  }
});
test('horse rear has a finite rise and landing and old timestamps cannot replay it',()=>{
  assert.equal(horseRearLevel(0,10000),0);
  assert.equal(horseRearLevel(10000,9999),0);
  assert.equal(horseRearLevel(10000,10000),0);
  assert.ok(horseRearLevel(10000,10000+HORSE_REAR.durationMs/2)>.999);
  assert.equal(horseRearLevel(10000,10000+HORSE_REAR.durationMs),0);
});
test('new held controls preserve legacy inputs and refuse malformed values',()=>{
  const moto={seq:1,throttle:1,steer:0,brake:false};
  assert.ok(motoInputSchema.safeParse(moto).success);
  assert.ok(motoInputSchema.safeParse({...moto,horn:true,wheelie:true}).success);
  assert.ok(!motoInputSchema.safeParse({...moto,horn:'yes'}).success);
  const walk={seq:1,dx:0,dz:0,running:true,rotation:0};
  assert.ok(inputSchema.safeParse({...walk,rear:true}).success);
  assert.ok(!inputSchema.safeParse({...walk,rear:1}).success);
});
