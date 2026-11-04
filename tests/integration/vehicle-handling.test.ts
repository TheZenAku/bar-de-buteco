import test from 'node:test';
import assert from 'node:assert/strict';
import {CAR,CAR_MODEL,FULL_HANDLING,NEW_CAR_PARTS,advanceMoto,boxContains,canMountMoto,canRepairMoto,motoHandling,motoObstacle,motoSteerAngle,parkedMoto,readCarParts,stepMoto,vehicleMoving,vehicleSpeed,vehicleVelocity,writeCarParts,type MotoBody} from '@bar/shared';
import {stepCarDynamics} from '../../packages/shared/src/car-dynamics.js';
import {PredictedRide,RoomTrack,PLAYBACK_DELAY_MS} from '../../apps/web/src/engine/moto-motion';

const start=(speed=15):MotoBody=>({model:CAR_MODEL,x:50,y:0,z:7,yaw:Math.PI/2,pitch:0,speed,steer:0});
const input=(steer=1,brake=false)=>({throttle:0,steer,brake});
const shape={...FULL_HANDLING};
function cruise(body:MotoBody,speed:number):MotoBody {
  const ratio=speed/(vehicleSpeed(body)||1);
  return {...body,speed:body.speed*ratio,lateralSpeed:(body.lateralSpeed??0)*ratio};
}
function circle(speed:number,steer=1,handling=shape){
  let body=start(speed);
  for(let i=0;i<800;i++)body=stepCarDynamics(cruise(body,speed),input(steer),.01,handling);
  return body;
}

test('healthy vehicles reach the measured arcade corner radii, symmetrically',()=>{
  for(const [speed,lo,hi] of [[10,7,10],[15,13,18],[20,23,32]]){
    const right=circle(speed),left=circle(speed,-1),radius=vehicleSpeed(right)/Math.abs(right.yawRate!);
    assert.ok(radius>=lo&&radius<=hi,`${speed*3.6} km/h: ${radius} m`);
    assert.ok(Math.abs(right.yawRate!+left.yawRate!)<1e-10);
    assert.ok(Math.abs(right.lateralSpeed!+left.lateralSpeed!)<1e-10);
  }
  for(const [speed,lo,hi] of [[10,4,7],[15,10,14]]){
    const radius=1.342*.8/Math.tan(motoSteerAngle(speed));
    assert.ok(radius>=lo&&radius<=hi,`bike ${speed*3.6} km/h: ${radius} m`);
  }
});

test('the handbrake produces a tighter turn and lateral slip, then releases into a stable recovery',()=>{
  let normal=circle(15),sliding={...normal};
  let normalTurn=0,slideTurn=0,mostSlip=0;
  for(let i=0;i<35;i++){
    normal=stepCarDynamics(normal,input(),.01,shape);
    sliding=stepCarDynamics(sliding,input(1,true),.01,shape);
    normalTurn+=Math.abs(normal.yawRate!)*.01;slideTurn+=Math.abs(sliding.yawRate!)*.01;
    mostSlip=Math.max(mostSlip,Math.abs(sliding.lateralSpeed!));
  }
  assert.ok(slideTurn>normalTurn*1.1,`yaw: ${slideTurn} vs ${normalTurn}`);
  assert.ok(mostSlip>Math.abs(normal.lateralSpeed!)+1,'the rear actually slides');
  for(let i=0;i<400;i++)sliding=stepCarDynamics(sliding,input(0),.01,shape);
  assert.ok(Math.abs(sliding.lateralSpeed!)<.05&&Math.abs(sliding.yawRate!)<.01,'no persistent spin');
});

test('passive tyres, braking and recovery never create translational energy',()=>{
  for(const speed of [0,.1,1,2,3,4,15,39])for(const side of [-10,0,10])for(const brake of [false,true]){
    let body={...start(speed),lateralSpeed:side,yawRate:.4};
    for(let i=0;i<200;i++){
      const next=stepCarDynamics(body,input(i<70?1:i<140?-1:0,brake),.01,shape);
      assert.ok(vehicleSpeed(next)<=vehicleSpeed(body)+1e-10);
      for(const value of [next.speed,next.lateralSpeed,next.yawRate])assert.ok(Number.isFinite(value));
      body={...next,lateralSpeed:next.lateralSpeed!,yawRate:next.yawRate!};
    }
  }
});

test('steering responds promptly, returns, countersteers, reverses and never rotates at rest',()=>{
  let body=start(0);
  for(let i=0;i<25;i++)body=stepCarDynamics(body,input(),.01,shape);
  assert.equal(body.steer,1);assert.equal(body.yawRate,0);
  for(let i=0;i<17;i++)body=stepCarDynamics(body,input(0),.01,shape);
  assert.equal(body.steer,0);
  let right=circle(10);
  for(let i=0;i<100;i++)right=stepCarDynamics(cruise(right,10),input(-1),.01,shape);
  assert.ok(right.yawRate!>0);
  const reverse=stepMoto({...start(-2),steer:1},input());
  assert.ok(reverse.yaw>Math.PI/2);
  const stopped=stepMoto({...start(0),steer:1},input());assert.equal(stopped.yaw,Math.PI/2);
});

test('both gears pull away from rest even when the integration substep is shorter than 10 ms',()=>{
  for(const dt of [.002,.01,.016,.05]){
    const forward=stepMoto(start(0),{...input(0),throttle:1},dt);
    const reverse=stepMoto(start(0),{...input(0),throttle:-1},dt);
    assert.ok(forward.speed>0&&forward.x>50,`forward dt=${dt}`);
    assert.ok(reverse.speed<0&&reverse.x<50,`reverse dt=${dt}`);
  }
});

test('each axle retains its own grip and damaged tyres alter the force response',()=>{
  const fresh=readCarParts(NEW_CAR_PARTS);
  const handling=(patch:Record<string,number>)=>motoHandling({id:'car',model:CAR_MODEL,parts:writeCarParts({...fresh,...patch})});
  const healthy=handling({}),front=handling({pneu_de:0}),rear=handling({pneu_td:0});
  assert.ok(front.frontGrip!<healthy.frontGrip!);assert.equal(front.rearGrip,healthy.rearGrip);
  assert.ok(rear.rearGrip!<healthy.rearGrip!);assert.equal(rear.frontGrip,healthy.frontGrip);
  assert.ok(Math.abs(circle(15,1,front).yawRate!)<Math.abs(circle(15,1,healthy).yawRate!));
  assert.notEqual(circle(15,1,rear).lateralSpeed,circle(15,1,healthy).lateralSpeed);
});

test('sideways collisions cannot cross thin walls or other vehicles, even in a long tick',()=>{
  for(const hz of [.02,.76]){
    const wall=hz===.76?motoObstacle({id:'other',...start(0),z:7-CAR.HALF_WIDTH-hz-.4})
      :{id:'side',x:50,z:7-CAR.HALF_WIDTH-hz-.4,hx:4,hz,minY:0,maxY:2};
    const body={...start(0),lateralSpeed:20};
    const result=advanceMoto(body,input(0),.4,[wall]);
    assert.ok(result.hit&&result.hit.closing>5,'lateral impact is measured from world velocity');
    assert.ok(result.body.z>=wall.z+wall.hz+CAR.HALF_WIDTH-1e-6);
    assert.ok(vehicleSpeed(result.body)<vehicleSpeed(body));
  }
});

test('sweeping a rotating corner into a narrow post stops yaw before the hull overlaps it',()=>{
  const body={...start(10),steer:1,yawRate:-2};
  const post={id:'corner',x:51.7,z:7.8,hx:.03,hz:.03,minY:0,maxY:2};
  const result=advanceMoto(body,input(),.2,[post]);
  assert.equal(result.hit?.solid,post.id);
  assert.equal(result.body.yawRate,0);
  assert.equal(boxContains(motoObstacle({id:'car',...result.body}),post.x,post.z,.03),false);
});

test('legacy states default to zero, and pure lateral movement still blocks boarding and maintenance',()=>{
  assert.equal(vehicleSpeed(start(0)),0);
  const car={...parkedMoto({id:'car',...start(0)}),lateralSpeed:3};
  assert.ok(vehicleMoving(car));assert.equal(vehicleVelocity(car).z,-3);
  assert.equal(canMountMoto(car,{x:50,y:0,z:8}),false);
  assert.equal(canRepairMoto(car,{x:50,y:0,z:8}),false);
  assert.equal(vehicleMoving({...car,lateralSpeed:0,yawRate:.2}),true);
  assert.equal(canMountMoto({...car,lateralSpeed:0,yawRate:1},{x:50,y:0,z:8}),false,'a rotating hull is not parked');
});

test('the new state is deterministic and prediction follows identical ticks at 30, 60 and 120 FPS',()=>{
  const initial={...start(8),lateralSpeed:1,yawRate:-.3};
  const tick=(body:MotoBody)=>stepMoto(body,input(.2));
  let authoritative: MotoBody=initial;
  for(let i=0;i<20;i++)authoritative=tick(authoritative);
  for(const fps of [30,60,120]){
    const ride=new PredictedRide(initial);let ticks=0;
    // End just after the second boundary to avoid an accumulator roundoff tie.
    for(let i=0;i<fps;i++)ride.advance(1/fps+1e-10,b=>{ticks++;return tick(b);});
    assert.equal(ticks,20);
    let replay:MotoBody=initial;for(let i=0;i<20;i++)replay=tick(replay);
    assert.deepEqual(replay,authoritative);
    const before=ride.pose();ride.correct(authoritative);const after=ride.pose();
    assert.ok(Math.hypot(before.x-after.x,before.z-after.z)<1e-9);
    assert.equal(after.lateralSpeed,before.lateralSpeed);assert.equal(after.yawRate,before.yawRate);
  }
});

test('remote extrapolation follows lateral velocity and yaw, instead of the nose alone',()=>{
  const track=new RoomTrack(),state={...parkedMoto({id:'car',...start(0)}),lateralSpeed:3,yawRate:.3,ticks:1};
  track.push(state,1000);
  const pose=track.sample(1000+PLAYBACK_DELAY_MS+50)!;
  assert.ok(pose.z<state.z-.14);assert.ok(pose.yaw>state.yaw);
});
