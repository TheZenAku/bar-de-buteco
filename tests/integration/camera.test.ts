import {test,type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import * as pc from 'playcanvas';
import {cameraFraction} from '@bar/shared';
import {CameraRig,readCameraFeel,type CameraSubject} from '../../apps/web/src/engine/camera-rig';

function fixture(t:TestContext,feet=new pc.Vec3(4.6,.3,-10)){
  // The rig uses shader uniforms and transforms; its behaviour does not need a renderer or a WebGL context.
  const device=Object.assign(new pc.EventHandler(),{scope:new pc.ScopeSpace('camera-test')});
  const camera=new pc.Entity('Camera test');
  const rig=new CameraRig(camera,device as unknown as pc.GraphicsDevice);
  const subject:CameraSubject={feet,facing:0,roll:0,elapsed:0};
  const settle=(frames=360)=>{for(let i=0;i<frames;i++)rig.follow(1/60,subject);};
  t.after(()=>{device.fire('destroy');camera.destroy();});
  return {camera,rig,subject,settle};
}

const close=(actual:number,expected:number,message:string,tolerance=1e-5)=>assert.ok(Math.abs(actual-expected)<tolerance,`${message}: expected ${expected}, got ${actual}`);
const finite=(vector:pc.Vec3)=>[vector.x,vector.y,vector.z].every(Number.isFinite);
// Sixteen metres of air all round, up to the sky: nothing stops a boom here.
const OPEN=()=>new pc.Vec3(-396,0,-396);
/** Turns the view until it looks along these angles (radians). */
const aim=(rig:CameraRig,yaw:number,pitch:number)=>rig.drag((rig.yaw-yaw)/.006,(pitch-rig.pitch)/.004);
/** How far from the point it orbits the view sits, along the way it looks. */
const radius=(camera:pc.Entity,rig:CameraRig,pivot:pc.Vec3)=>camera.getPosition().clone().sub(pivot).dot(new pc.Vec3(Math.sin(rig.yaw)*Math.cos(rig.pitch),Math.sin(rig.pitch),Math.cos(rig.yaw)*Math.cos(rig.pitch)));

test('the wheel steps between perto, médio and longe and stops at both ends',t=>{
  const {rig}=fixture(t);
  assert.equal(rig.distance,4.2,'It starts in the middle');
  assert.equal(rig.wheel(100),true);
  assert.equal(rig.distance,6.5);
  assert.equal(rig.wheel(100),false,'Longe is the limit');
  assert.equal(rig.distance,6.5);
  assert.equal(rig.wheel(-100),true);
  assert.equal(rig.distance,4.2);
  assert.equal(rig.wheel(-100),true);
  assert.equal(rig.distance,2.5);
  assert.equal(rig.wheel(-100),false,'Perto is the limit, not the eyes');
  assert.equal(rig.distance,2.5);
  assert.equal(rig.mode,'third');
  for(const delta of [0,NaN,Infinity,-Infinity]){
    assert.equal(rig.wheel(delta),false,'Empty or invalid input does not move the camera');
    assert.equal(rig.distance,2.5);
  }
});

test('a trackpad takes one step for a whole notch of travel, and turning back starts over',t=>{
  const {rig}=fixture(t);
  for(let i=0;i<4;i++)assert.equal(rig.wheel(10),false);
  assert.equal(rig.wheel(-10),false);
  for(let i=0;i<3;i++)assert.equal(rig.wheel(-10),false);
  assert.equal(rig.distance,4.2,'The way back cancels what was gathered');
  assert.equal(rig.wheel(-10),true);
  assert.equal(rig.distance,2.5);
});

test('any distance asked for lands on the nearest of the three',t=>{
  const {rig}=fixture(t);
  for(const [asked,got] of [[.01,2.5],[3.3,2.5],[3.4,4.2],[5.3,4.2],[5.4,6.5],[1234,6.5]] as const){
    rig.setDistance(asked);
    assert.equal(rig.distance,got,`${asked} m`);
  }
  rig.setDistance(4.2);
  for(const invalid of [0,-1,NaN,Infinity]){
    rig.setDistance(invalid);
    assert.equal(rig.distance,4.2);
    assert.equal(rig.mode,'third');
  }
});

test('first person keeps the zoom, and the wheel out of it goes back there',t=>{
  const {camera,rig,subject,settle}=fixture(t);
  rig.setDistance(6.5);
  rig.setMode('first');
  assert.equal(rig.distance,0);
  assert.equal(rig.reach,6.5);
  settle();
  assert.equal(rig.firstPerson,true);
  subject.head=new pc.Vec3(subject.feet.x+.03,2.1,subject.feet.z+.03);
  settle();
  close(camera.getPosition().distance(new pc.Vec3(subject.head.x,subject.head.y+.09,subject.head.z+.1)),0,'Exactly at the eyes');
  assert.equal(rig.wheel(-100),false,'Inwards there is nothing further');
  assert.equal(rig.mode,'first');
  assert.equal(rig.wheel(100),true);
  assert.equal(rig.mode,'third');
  assert.equal(rig.distance,6.5);
  settle();
  assert.equal(rig.firstPerson,false);
  assert.equal(rig.cycle(),'first');
  assert.equal(rig.cycle(),'third');
  assert.equal(rig.distance,6.5,'Q keeps it too');
});

test('a step of zoom glides and settles at exactly that distance',t=>{
  const {camera,rig,subject,settle}=fixture(t,OPEN());
  settle();
  const pivot=subject.feet.clone().add(new pc.Vec3(0,1.42,0)),before=radius(camera,rig,pivot);
  rig.wheel(100);
  rig.follow(1/60,subject);
  assert.ok(radius(camera,rig,pivot)>before&&radius(camera,rig,pivot)<6.5,'A single frame advances towards it');
  settle();
  close(radius(camera,rig,pivot),6.5,'The camera settles at the step');
});

test('a wall shortens the boom without changing the chosen distance, and the view stays on the player\'s side',t=>{
  const {camera,rig,subject,settle}=fixture(t);
  rig.setDistance(6.5);
  aim(rig,-Math.PI/2,0);
  settle();
  const body={x:subject.feet.x,y:subject.feet.y+1.42,z:subject.feet.z},position=camera.getPosition();
  assert.ok(cameraFraction(body,{x:body.x-6.5,y:body.y,z:body.z},true)<1,'This view would pass through an exterior wall');
  assert.equal(cameraFraction(body,position,true),1,'Nothing solid is left between the body and the view');
  assert.ok(Math.hypot(position.x-body.x,position.z-body.z)<2,'The view came in to the wall');
  assert.equal(rig.reach,6.5,'The chosen distance is kept for when there is room');
});

test('no frame of a fast turn or a walk ever puts the view behind a wall, at any frame rate',t=>{
  for(const fps of [60,20]){
    const {camera,rig,subject}=fixture(t,new pc.Vec3(4.6,.3,-10));
    rig.setDistance(6.5);
    for(let frame=0;frame<fps*30;frame++){
      if(frame%fps===0)rig.drag(900*Math.sin(frame*1.7),260*Math.sin(frame*.9));
      subject.feet.x=4.6+Math.sin(frame/fps)*.3;
      subject.facing=frame/fps;
      rig.follow(1/fps,subject);
      assert.equal(cameraFraction({x:subject.feet.x,y:subject.feet.y+1.42,z:subject.feet.z},camera.getPosition(),true),1,`${fps} FPS, frame ${frame}`);
    }
  }
});

test('the view closes in on an obstacle quickly and opens again slowly, without a jump',t=>{
  const {camera,rig,subject,settle}=fixture(t,new pc.Vec3(21,.3,-9.05));
  rig.setDistance(2.5);
  aim(rig,-Math.PI/2,0);
  settle();
  assert.equal(rig.telemetry().opening,1,'Towards the bar there is room');
  // Round to the display fridges, about two metres behind.
  aim(rig,Math.PI/2,0);
  const closing:number[]=[];
  for(let frame=0;frame<60;frame++){rig.follow(1/60,subject);closing.push(rig.telemetry().opening);}
  const closed=closing.at(-1)!,reached=closing.findIndex(value=>value<closed+.02);
  assert.ok(closed<1,`The fridge stops the view (${closed})`);
  assert.ok(reached>=0&&reached<45,`Within three quarters of a second (${reached} frames)`);
  assert.ok(camera.getPosition().x<23.13,'The view stays in front of the fridge');
  assert.equal(rig.reach,2.5);
  aim(rig,-Math.PI/2,0);
  // Half a second for the turn back; only then is the way clear for good.
  for(let frame=0;frame<30;frame++)rig.follow(1/60,subject);
  const opening:number[]=[rig.telemetry().opening];
  for(let frame=0;frame<150;frame++){rig.follow(1/60,subject);opening.push(rig.telemetry().opening);}
  assert.equal(opening.at(-1),1,'And all the way out in the end');
  const widest=Math.max(...opening.slice(1).map((value,index)=>value-opening[index]!));
  assert.ok(widest<.05,`No frame of opening moves more than a little (${widest})`);
});

test('the floor shortens a low view and third person keeps the horizon',t=>{
  const {camera,rig,subject,settle}=fixture(t,OPEN());
  rig.setDistance(6.5);
  aim(rig,0,-3);
  settle();
  close(rig.pitch,-.6,'Looking up stops short of the feet');
  assert.ok(camera.getPosition().y>=subject.feet.y+.17,'The view stays over the floor');
  assert.ok(camera.getPosition().y<subject.feet.y+.3,'Resting just above it');
  assert.ok(rig.telemetry().fromHead<3,'Having come in to do it');
  aim(rig,0,3);
  settle();
  close(rig.pitch,1.35,'Looking down stops before the pole');
  assert.ok(camera.up.y>0,'The horizon is never upside down');
});

test('first person turns freely through both poles and third person takes back the nearest turn',t=>{
  const {camera,rig,settle}=fixture(t);
  rig.setMode('first');
  settle();
  for(const pitch of [Math.PI/2-.001,Math.PI/2,Math.PI/2+.001,3*Math.PI/2,-Math.PI/2,-3*Math.PI/2,Math.PI*4+.4]){
    rig.drag(0,(pitch-rig.pitch)/.004);
    settle();
    close(rig.pitch,pitch,'Vertical input is not clamped');
    const expectedForward=new pc.Vec3(-Math.sin(rig.yaw)*Math.cos(pitch),-Math.sin(pitch),-Math.cos(rig.yaw)*Math.cos(pitch));
    const expectedUp=new pc.Vec3(-Math.sin(rig.yaw)*Math.sin(pitch),Math.cos(pitch),-Math.cos(rig.yaw)*Math.sin(pitch));
    assert.ok(finite(camera.forward)&&finite(camera.up),'Orientation stays finite at the poles');
    close(camera.forward.dot(expectedForward),1,'The view keeps its direction through the pole');
    close(camera.up.dot(expectedUp),1,'The camera rolls continuously over the pole');
    close(camera.forward.dot(camera.up),0,'Forward and up stay perpendicular');
  }
  rig.setMode('third');
  assert.ok(Math.abs(rig.pitch-.4)<.001,'Two whole turns off, the same angle');
  settle();
  close(rig.pitch,.4,'Nothing to unwind');
});

test('walking with the mouse at rest swings the view behind the body, and only then',t=>{
  const {rig,subject}=fixture(t,OPEN());
  const walk=(seconds:number,facing:number,speed=6)=>{
    subject.facing=facing;
    for(let frame=0;frame<seconds*60;frame++){subject.feet.x+=Math.sin(facing)*speed/60;subject.feet.z+=Math.cos(facing)*speed/60;rig.follow(1/60,subject);}
  };
  const off=(facing:number)=>Math.abs(Math.atan2(Math.sin(facing+Math.PI-rig.yaw),Math.cos(facing+Math.PI-rig.yaw)));
  aim(rig,0,.2);
  walk(.5,Math.PI/2);
  close(rig.yaw,0,'Just after the mouse moved, it stays where the hand put it',.01);
  walk(8,Math.PI/2);
  assert.ok(off(Math.PI/2)<.2,`Running sideways it ends up behind (${off(Math.PI/2)} rad off)`);
  // Long enough for the stride to die away.
  for(let frame=0;frame<180;frame++)rig.follow(1/60,subject);
  const standing=rig.yaw;
  for(let frame=0;frame<240;frame++)rig.follow(1/60,subject);
  close(rig.yaw,standing,'Standing still it never moves by itself',.02);
  aim(rig,0,.2);
  walk(3,0);
  close(rig.yaw,0,'A body running at the view leaves it alone',.01);
});

test('the frame comes from the feet and the head joint, whatever the skeleton, and no walk cycle shakes it',t=>{
  for(const height of [1.2,1.5,1.9]){
    const {camera,rig,subject,settle}=fixture(t,OPEN());
    aim(rig,0,0);
    subject.head=new pc.Vec3(subject.feet.x,subject.feet.y+height,subject.feet.z);
    settle(900);
    close(camera.getPosition().y,subject.feet.y+height-.2,`A head at ${height} m puts the view level with the shoulders under it`,.001);
    // A run cycle: the head bobs six centimetres, three times a second.
    const heights:number[]=[];
    for(let frame=0;frame<240;frame++){subject.head.y=subject.feet.y+height+Math.sin(frame/60*Math.PI*6)*.06;rig.follow(1/60,subject);heights.push(camera.getPosition().y);}
    const shake=Math.max(...heights.slice(60))-Math.min(...heights.slice(60));
    assert.ok(shake<.02,`The bob reaches the view as ${shake} m`);
  }
});

test('running falls back a little and a steady run keeps the same distance at any frame rate',t=>{
  const distanceAt=(fps:number)=>{
    const {camera,rig,subject}=fixture(t,OPEN());
    aim(rig,0,.2);
    subject.facing=Math.PI;
    for(let frame=0;frame<fps*8;frame++){subject.feet.z-=6/fps;rig.follow(1/fps,subject);}
    return camera.getPosition().z-subject.feet.z;
  };
  const steady=distanceAt(60),slow=distanceAt(24);
  assert.ok(Math.abs(steady-slow)<.03,`Frames do not change the distance (${steady} and ${slow})`);
  assert.ok(steady>4.2*Math.cos(.2)+.3,`The run opens the frame (${steady})`);
  assert.ok(steady<4.2*Math.cos(.2)+1.3,`But not by much (${steady})`);
});

test('sensitivity, height and smoothing tune the view and saved values are kept in range',t=>{
  const {camera,rig,subject,settle}=fixture(t,OPEN());
  aim(rig,0,0);
  settle();
  const level=camera.getPosition().y;
  rig.setFeel({height:.3,sensitivity:2,smoothing:.5});
  settle();
  close(camera.getPosition().y,level+.3,'Height moves the frame up',.001);
  const yaw=rig.yaw;
  rig.drag(100,0);
  settle();
  close(rig.yaw,yaw-1.2,'Sensitivity multiplies the turn');
  const first=(smoothing:number)=>{rig.setFeel({height:0,sensitivity:1,smoothing});const start=rig.yaw;rig.drag(100,0);rig.follow(1/60,subject);const moved=Math.abs(rig.yaw-start);settle();return moved;};
  assert.ok(first(0)>first(1)*1.5,'Less smoothing gets there sooner');
  assert.deepEqual(readCameraFeel({height:9,sensitivity:0,smoothing:-1}),{height:.6,sensitivity:.25,smoothing:0});
  assert.deepEqual(readCameraFeel('nonsense'),{height:0,sensitivity:1,smoothing:.5});
});

test('squeezed against a wall the head hides, without counting as first person',t=>{
  const {rig,settle}=fixture(t,new pc.Vec3(4.25,.3,-10));
  aim(rig,-Math.PI/2,0);
  settle();
  assert.equal(rig.headHidden,true,`${rig.telemetry().fromHead} m from the head`);
  assert.equal(rig.firstPerson,false,'So the body does not start turning with the view');
  aim(rig,Math.PI/2,0);
  settle();
  assert.equal(rig.headHidden,false);
});

test('on a bike the view sits straight behind and only the building stops it',t=>{
  const {camera,rig,settle}=fixture(t,new pc.Vec3(21,.3,-9.05));
  rig.setDistance(2.5);
  rig.ride(true);
  aim(rig,Math.PI/2,.05);
  settle(60);
  assert.equal(rig.telemetry().shoulder,0,'Not off the shoulder');
  assert.ok(camera.getPosition().x>23.13,'Past the fridge, which the x-ray opens instead');
  rig.ride(false);
  assert.equal(rig.mode,'third');
});

test('horizontal input can keep turning through multiple complete revolutions',t=>{
  const {camera,rig,settle}=fixture(t);
  settle();
  const yaw=rig.yaw;
  for(let quarter=0;quarter<8;quarter++){
    rig.drag(Math.PI/2/.006,0);
    settle(120);
    assert.ok(finite(camera.forward)&&finite(camera.up));
  }
  close(rig.yaw,yaw-Math.PI*4,'Horizontal rotation has no angular boundary');
});
