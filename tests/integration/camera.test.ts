import {test,type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import * as pc from 'playcanvas';
import {cameraFraction} from '@bar/shared';
import {CameraRig,type CameraSubject} from '../../apps/web/src/engine/camera-rig';

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

test('the wheel adjusts distance with fractional input and reverses immediately without preset steps',t=>{
  const {rig}=fixture(t);
  rig.setDistance(7.375);
  assert.equal(rig.wheel(.125),true);
  assert.ok(rig.distance>7.375&&rig.distance<8.375,'A fraction of a pixel makes a fine outward adjustment');
  assert.equal(rig.mode,'third');
  assert.equal(rig.wheel(-.125),true);
  close(rig.distance,7.375,'Reversing the same amount restores the chosen distance');
  rig.wheel(3000);
  assert.ok(rig.distance>10.5,'Zoom can move farther than the old far preset');
  const distance=rig.distance;
  for(const delta of [0,NaN,Infinity,-Infinity]){
    assert.equal(rig.wheel(delta),false,'Empty or invalid input does not move the camera');
    assert.equal(rig.distance,distance);
  }
});

test('first person and third person preserve the exact chosen distance, including when zoom reaches zero',t=>{
  const {rig,settle}=fixture(t);
  rig.setDistance(8.731);
  rig.setMode('first');
  assert.equal(rig.distance,0);
  assert.equal(rig.reach,8.731);
  settle();
  assert.equal(rig.firstPerson,true);
  rig.setMode('third');
  assert.equal(rig.distance,8.731);
  settle();
  assert.equal(rig.firstPerson,false);
  assert.equal(rig.wheel(-100000),true);
  assert.equal(rig.mode,'first');
  assert.equal(rig.distance,0);
  assert.equal(rig.reach,8.731,'Zooming to the eyes remembers the last positive distance');
  assert.equal(rig.wheel(-.1),false,'Further inward movement stops at the eyes');
  assert.equal(rig.wheel(.1),true);
  assert.equal(rig.mode,'third');
  assert.ok(rig.distance>0&&rig.distance<1,'Reversing from the eyes starts with a fine outward adjustment');
  rig.setDistance(3.14159);
  assert.equal(rig.cycle(),'first');
  assert.equal(rig.cycle(),'third');
  assert.equal(rig.distance,3.14159,'The keyboard mode switch keeps a custom zoom');
});

test('a very close custom zoom stays near the eyes, hides the head and retains its full radius',t=>{
  const {camera,rig,subject,settle}=fixture(t);
  rig.setDistance(.01);
  settle();
  const eye=new pc.Vec3(subject.feet.x,subject.feet.y+1.62,subject.feet.z);
  close(camera.getPosition().distance(eye),.01,'Close zoom stays near the eyes instead of inside the chest',.0002);
  const horizontal=Math.hypot(camera.getPosition().x-subject.feet.x,camera.getPosition().z-subject.feet.z);
  close(horizontal/Math.abs(Math.cos(rig.pitch)),.01,'The full chosen orbit radius remains available');
  assert.equal(rig.firstPerson,true,'The head is hidden at a very close zoom');
  assert.equal(rig.mode,'third');
  assert.equal(rig.distance,.01,'A close view does not replace the exact custom zoom with first person');
  subject.head=new pc.Vec3(subject.feet.x+.03,2.1,subject.feet.z+.03);
  eye.copy(subject.head).add(new pc.Vec3(0,.09,.1));
  settle();
  close(camera.getPosition().distance(eye),.01,'The loaded head joint becomes the close-zoom pivot',.0003);
  rig.setDistance(0);
  settle();
  close(camera.getPosition().distance(eye),0,'Zero zoom is exactly at the eyes');
  assert.equal(rig.reach,.01,'Entering the eyes remembers the very close custom zoom');
  rig.setMode('third');
  settle();
  assert.equal(rig.mode,'third');
  assert.equal(rig.distance,.01);
  assert.equal(rig.firstPerson,true);
  rig.setDistance(1.5);
  settle();
  assert.equal(rig.firstPerson,false,'Moving away makes the head visible again');
});

test('distance changes glide smoothly and converge to the exact custom distance',t=>{
  const {camera,rig,subject,settle}=fixture(t);
  settle();
  const radius=()=>Math.hypot(camera.getPosition().x-subject.feet.x,camera.getPosition().z-subject.feet.z)/Math.abs(Math.cos(rig.pitch));
  const before=radius();
  rig.setDistance(12.34567);
  rig.follow(1/60,subject);
  assert.ok(radius()>before&&radius()<12.34567,'A single frame advances towards the requested zoom');
  settle();
  close(radius(),12.34567,'The camera settles at the requested distance');
});

test('walls and the floor do not shorten the chosen camera distance',t=>{
  const {camera,rig,subject,settle}=fixture(t);
  rig.setDistance(8.731);
  rig.drag((rig.yaw+Math.PI/2)/.006,-rig.pitch/.004);
  settle();
  const position=camera.getPosition();
  const target={x:subject.feet.x,y:position.y,z:subject.feet.z};
  assert.ok(cameraFraction(target,position,true)<1,'This view passes through a solid exterior wall');
  close(Math.hypot(position.x-target.x,position.z-target.z),8.731,'The wall does not pull the camera in');
  rig.drag(0,-.8/.004);
  settle();
  assert.ok(camera.getPosition().y<0,'The player can orbit below the floor');
  const horizontal=Math.hypot(camera.getPosition().x-target.x,camera.getPosition().z-target.z);
  close(horizontal/Math.abs(Math.cos(rig.pitch)),8.731,'The floor does not pull the camera in');
});

test('first and third person stay freely oriented through both poles and full vertical rotations',t=>{
  const {camera,rig,settle}=fixture(t);
  for(const mode of ['third','first'] as const){
    rig.setMode(mode);
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
  }
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
