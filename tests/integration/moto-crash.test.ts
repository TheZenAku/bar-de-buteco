import test from 'node:test';
import assert from 'node:assert/strict';
import {JOINT,MAP_COLLIDERS,MOTO,Ragdoll,advanceMoto,isWalkable,loosePose,motoFits,motoLeanSide,motoLiftSpot,motoObstacle,motoStrikes,motoUprightSpot,parkedMoto,startWreck,stepLoose,stepMoto,stepWreck,wreckPose,type MotoBody,type MotoWreck,type RagdollStart} from '@bar/shared';

const car=MAP_COLLIDERS.find(c=>c.id==='COL_Ext_Carro_Prata')!;
const at=(x:number,z:number,yaw:number,speed=0):MotoBody=>({x,y:0,z,yaw,pitch:0,speed,steer:0});
const THROTTLE={throttle:1,steer:0,brake:false};
/** Open street, far from anything. */
const OPEN={x:-60,z:7};
const seated=(speed:number,closing:number,seed=7,x=OPEN.x):RagdollStart=>({x,y:0,z:OPEN.z,yaw:Math.PI/2,vx:speed,vz:0,closing,seated:true,seed});
const untilAsleep=(body:Ragdoll,each?:()=>void)=>{for(let i=0;i<400&&!body.asleep;i++){body.advance(.05);each?.();}return body;};
const upOf=(q:readonly number[])=>1-2*(q[0]!**2+q[2]!**2);

test('running into something says how hard: the part of the speed that goes straight against it',()=>{
  // Square into the car.
  let body=at(car.x-car.hx-MOTO.HALF_LENGTH-2,car.z,Math.PI/2,14),hit;
  for(let i=0;i<40&&!hit;i++){const step=advanceMoto(body,THROTTLE);body=step.body;hit=step.hit;}
  assert.ok(hit,'It hit');
  assert.ok(Math.abs(hit.closing-hit.speed)<.01,`All of ${hit.speed} went into it: ${hit.closing}`);
  assert.ok(hit.closing>=MOTO.CRASH_SPEED);
  assert.equal(hit.nx,-1,'The face it hit looks back at it');
  assert.equal(hit.solid,car.id);
  // At a slant only part of it does, and it scrapes along.
  body=at(car.x-1,car.z+car.hz+.5,Math.PI/2+.2,12);hit=undefined;
  for(let i=0;i<20&&!hit;i++){const step=advanceMoto(body,THROTTLE);body=step.body;hit=step.hit;}
  assert.ok(hit,'It touched');
  assert.ok(hit.closing<hit.speed*.5,`Slanted: ${hit.closing} of ${hit.speed}`);
  // Slowly it is no crash, and nothing is reported on an open street.
  body=at(car.x-car.hx-MOTO.HALF_LENGTH-.3,car.z,Math.PI/2,2);hit=undefined;
  for(let i=0;i<20&&!hit;i++){const step=advanceMoto(body,{throttle:0,steer:0,brake:false});body=step.body;hit=step.hit;}
  assert.ok(hit&&hit.closing<MOTO.CRASH_SPEED,`A knock: ${hit?.closing}`);
  assert.equal(advanceMoto(at(OPEN.x,OPEN.z,Math.PI/2,14),THROTTLE).hit,undefined);
  // stepMoto is that same step: the prediction sees the same bike.
  assert.deepEqual(stepMoto(at(OPEN.x,OPEN.z,Math.PI/2,14),THROTTLE),advanceMoto(at(OPEN.x,OPEN.z,Math.PI/2,14),THROTTLE).body);
});

test('another bike is something to run into, and a body in the way is struck',()=>{
  const other={id:'b',x:OPEN.x+4,y:0,z:OPEN.z,yaw:0};
  let body=at(OPEN.x,OPEN.z,Math.PI/2,12),hit;
  for(let i=0;i<40&&!hit;i++){const step=advanceMoto(body,THROTTLE,.05,[motoObstacle(other)]);body=step.body;hit=step.hit;}
  assert.ok(hit,'It hit the other bike');
  assert.equal(hit.solid,'moto:b');
  assert.ok(hit.closing>=MOTO.CRASH_SPEED);
  assert.ok(body.x<other.x,'Stopped short of it');
  const ridden=at(OPEN.x,OPEN.z,Math.PI/2);
  assert.ok(motoStrikes(ridden,{x:OPEN.x+.5,y:0,z:OPEN.z}));
  assert.ok(!motoStrikes(ridden,{x:OPEN.x,y:0,z:OPEN.z+1.5}),'Beside it, clear');
  assert.ok(!motoStrikes(ridden,{x:OPEN.x,y:3.4,z:OPEN.z}),'On a floor above');
});

test('a thrown body goes on as the bike was going, up and over, and comes to rest on the ground in one piece',()=>{
  const start=seated(14,14),body=new Ragdoll(start);
  const [x0]=body.joint(JOINT.pelvis),rods=[[JOINT.hipL,JOINT.kneeL],[JOINT.kneeR,JOINT.footR],[JOINT.shoulderL,JOINT.elbowL],[JOINT.elbowR,JOINT.handR]] as const;
  const length=(a:number,b:number)=>{const p=body.joint(a),q=body.joint(b);return Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2]);};
  const lengths=rods.map(([a,b])=>length(a,b));
  let high=0;
  untilAsleep(body,()=>{
    for(let i=0;i<16;i++)assert.ok(body.joint(i)[1]>-.02,`Point ${i} under the ground at ${body.time}`);
    high=Math.max(high,body.joint(JOINT.pelvis)[1]);
    rods.forEach(([a,b],i)=>assert.ok(Math.abs(length(a,b)-lengths[i]!)<.1,`A limb stretched: ${length(a,b)} from ${lengths[i]}`));
  });
  const rest=body.rest();
  assert.ok(body.asleep,'It stopped');
  assert.ok(body.time<7,`In ${body.time} s`);
  assert.ok(high>1.2,`It rose: ${high}`);
  assert.ok(rest.x-x0>8,`It went on: ${rest.x-x0} m`);
  assert.ok(Math.abs(rest.z-OPEN.z)<4,`Mostly straight on: ${rest.z}`);
  assert.ok(body.joint(JOINT.pelvis)[1]<.4,'Lying down');
  assert.ok(body.joint(JOINT.head)[1]<.5,'Head down too');
  // Slower it does not go as far.
  const slow=untilAsleep(new Ragdoll(seated(5,5)));
  assert.ok(slow.rest().x-x0<rest.x-x0-3,`${slow.rest().x-x0} against ${rest.x-x0}`);
});

test('from the same start, the same body: however the time is cut up, as the room and the browsers need',()=>{
  const start=seated(13,13,123);
  const room=new Ragdoll(start),browser=new Ragdoll(start);
  for(let i=0;i<60;i++)room.advance(.05);
  for(let i=0;i<180;i++)browser.advance(1/60);
  assert.deepEqual([...browser.points],[...room.points]);
  const other=new Ragdoll({...start,seed:124});
  for(let i=0;i<60;i++)other.advance(.05);
  assert.notDeepEqual([...other.points],[...room.points],'Another crash falls another way');
});

test('a wall stops a body: it never goes through, and it falls down at its foot',()=>{
  const startX=car.x-car.hx-MOTO.HALF_LENGTH-.1,body=new Ragdoll({x:startX,y:0,z:car.z,yaw:Math.PI/2,vx:14,vz:0,closing:14,seated:true,seed:3});
  const top=car.maxY!;
  untilAsleep(body,()=>{
    for(let i=0;i<16;i++){const [x,y,z]=body.joint(i);if(y<top-.05&&Math.abs(z-car.z)<car.hz-.2)assert.ok(x<car.x+car.hx,`Point ${i} through the car at ${x},${y},${z}`);}
  });
  assert.ok(body.asleep);
});

test('someone on foot is swept off their feet the way the bike was going',()=>{
  const body=new Ragdoll({x:OPEN.x,y:0,z:OPEN.z,yaw:0,vx:10,vz:0,closing:6,seated:false,seed:9});
  untilAsleep(body);
  const rest=body.rest();
  assert.ok(rest.x-OPEN.x>3,`Went with it: ${rest.x-OPEN.x}`);
  assert.ok(body.joint(JOINT.pelvis)[1]<.4,'Down');
});

test('a bike left to itself goes on, weaves, slows and falls over as it stops holding itself up',()=>{
  let body=at(OPEN.x,OPEN.z,Math.PI/2,13);
  const loose={roll:.02,rollRate:.5};
  let fell=false,seconds=0,lean=0,bumps=0;
  // The road's bumps, the same on every run.
  const bump=()=>(++bumps*.6180339887)%1;
  for(;seconds<25&&!fell;seconds+=.05){
    const step=stepLoose(body,loose,.05,[],bump);
    body=step.body;fell=step.fell;
    assert.equal(step.hit,undefined);
    if(body.speed>6)lean=Math.max(lean,Math.abs(loose.roll));
  }
  assert.ok(fell,'It fell');
  assert.ok(seconds>1.5,`Not at once: ${seconds} s`);
  assert.ok(lean<.4,`Fast, it stayed up: ${lean}`);
  assert.ok(body.x-OPEN.x>10,`It rode on: ${body.x-OPEN.x} m`);
  assert.ok(body.speed<7,`Slow by then: ${body.speed}`);
  const pose=loosePose(body,loose);
  assert.ok(upOf([pose.qx,pose.qy,pose.qz,pose.qw])<.85,'Leaning');
  // And it goes down from there on the side it leaned to.
  const wreck=startWreck(body,loose.roll,loose.rollRate,body.speed);
  let done=false;for(let i=0;i<300&&!done;i++)done=stepWreck(wreck,.05);
  assert.ok(done);
  assert.ok(upOf(wreck.q)<.6,`On its side: ${upOf(wreck.q)}`);
  assert.equal(motoLeanSide(wreckPose(wreck)),loose.roll>0?-1:1);
});

const settle=(wreck:MotoWreck,each?:()=>void)=>{let done=false,seconds=0;for(;seconds<20&&!done;seconds+=.05){done=stepWreck(wreck,.05);each?.();}return seconds;};
test('knocked down flat out, it scrapes along on its side and stops, on top of the street',()=>{
  const start=at(OPEN.x,OPEN.z,Math.PI/2,14),wreck=startWreck(start,.75,1.5,14);
  const seconds=settle(wreck,()=>{const pose=wreckPose(wreck);assert.ok(pose.y>-.05&&pose.y<2.5,`At ${pose.y}`);});
  const pose=wreckPose(wreck);
  assert.ok(seconds<9.5,`It stopped in ${seconds} s`);
  assert.ok(pose.x-OPEN.x>5,`It slid: ${pose.x-OPEN.x} m`);
  assert.ok(upOf(wreck.q)<.6&&upOf(wreck.q)>.05,`Lying on its side: ${upOf(wreck.q)}`);
  assert.ok(Math.hypot(wreck.vx,wreck.vz)<.2);
});

test('into a wall it stops there and falls: the rear rises, it never goes through',()=>{
  const start=at(car.x-car.hx-MOTO.HALF_LENGTH-.12,car.z,Math.PI/2,14),wreck=startWreck(start,0,.5,14);
  let lowestUp=1;
  settle(wreck,()=>{
    const pose=wreckPose(wreck);lowestUp=Math.min(lowestUp,upOf(wreck.q));
    assert.ok(pose.x<car.x,`Through the car: ${pose.x}`);
  });
  assert.ok(lowestUp<.9,'It tipped');
  assert.ok(upOf(wreck.q)<.6,`On its side at the end: ${upOf(wreck.q)}`);
  assert.ok(wreckPose(wreck).x<car.x-car.hx+.3);
});

test('a fallen bike comes up where it fits, and whoever lifts it stands on the side it fell to',()=>{
  const wreck=startWreck(at(OPEN.x,OPEN.z,Math.PI/2,10),.6,1,10);
  settle(wreck);
  const pose=wreckPose(wreck),upright=motoUprightSpot(pose);
  assert.ok(motoFits(upright.x,upright.z,upright.yaw,upright.y),'Fits right there');
  assert.ok(Math.hypot(upright.x-pose.x,upright.z-pose.z)<.01,'On the same spot');
  const side=motoLeanSide(pose),spot=motoLiftSpot(upright,side);
  const c=Math.cos(upright.yaw),s=Math.sin(upright.yaw);
  assert.ok(isWalkable(spot.x,spot.z,spot.y));
  assert.ok(((spot.x-upright.x)*c-(spot.z-upright.z)*s)*side>.5,'On that side');
  // Against the car: moved out rather than left inside it.
  const stuck=motoUprightSpot({x:car.x,y:0,z:car.z,yaw:Math.PI/2});
  assert.ok(motoFits(stuck.x,stuck.z,stuck.yaw,stuck.y),`Off the car: ${stuck.x},${stuck.z}`);
});

test('only a bike on its wheels can be ridden',()=>{
  const parked=parkedMoto({id:'m',x:OPEN.x,y:0,z:OPEN.z,yaw:0});
  assert.equal(parked.phase,'');
  assert.equal(stepMoto(parked,{throttle:0,steer:0,brake:false}).speed,0);
});
