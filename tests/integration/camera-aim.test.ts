import {test,type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import * as pc from 'playcanvas';
import {CameraRig,type CameraSubject} from '../../apps/web/src/engine/camera-rig';
import {AIM_CAMERA_LIMITS,DEFAULT_AIM_CAMERA,type AimCamera} from '../../apps/web/src/weapons/aim-settings';

// The geometry tests run on a fixed tuning, apart from the defaults the owner picks live (their own test at the end).
const TUNE:AimCamera={armedBoom:2.6,armedRise:.05,armedShoulder:.55,boomRifle:1.55,boomPistol:1.45,shoulder:.52,rise:.05,level:.65,follow:2,turn:1.5,zoom:1};

// The weapons' opt-in members of the rig (docs/sistemas/armas.md#camera); camera.test.ts keeps asserting the defaults.
function fixture(t:TestContext,feet=new pc.Vec3(-396,0,-396)){
  const device=Object.assign(new pc.EventHandler(),{scope:new pc.ScopeSpace('camera-aim-test')});
  const camera=new pc.Entity('Camera aim test');
  const rig=new CameraRig(camera,device as unknown as pc.GraphicsDevice);
  rig.tuneAim(TUNE);
  const subject:CameraSubject={feet,facing:0,roll:0,elapsed:0};
  const settle=(frames=360)=>{for(let i=0;i<frames;i++)rig.follow(1/60,subject);};
  t.after(()=>{device.fire('destroy');camera.destroy();});
  return {camera,rig,subject,settle};
}
const pivot=(feet:pc.Vec3)=>new pc.Vec3(feet.x,feet.y+1.62-.2,feet.z);
/** Aiming the pivot rises a little, just over the shoulder (AIM_RISE). */
const aimPivot=(feet:pc.Vec3)=>new pc.Vec3(feet.x,feet.y+1.62-.2+.05,feet.z);
/** How far behind the pivot the camera sits (flat, along the heading), how far to its right, and how far above it. */
function frame(camera:pc.Entity,rig:CameraRig,at:pc.Vec3){
  const offset=camera.getPosition().clone().sub(at);
  return {back:offset.dot(new pc.Vec3(Math.sin(rig.yaw),0,Math.cos(rig.yaw)))/Math.cos(rig.pitch),right:offset.dot(new pc.Vec3(Math.cos(rig.yaw),0,-Math.sin(rig.yaw))),up:offset.y};
}

test('aiming closes the boom and moves over the shoulder, without touching the saved view',t=>{
  const {camera,rig,subject,settle}=fixture(t);
  settle();
  rig.armed=true;rig.aim(1,'rifle');settle(120);
  const aimed=frame(camera,rig,aimPivot(subject.feet));
  assert.ok(Math.abs(aimed.back-1.55)<.08,`Boom ${aimed.back}`);
  assert.ok(Math.abs(aimed.right-.52)<.01,`Shoulder ${aimed.right}`);
  assert.equal(rig.distance,4.2,'The saved distance is the same');
  assert.equal(rig.mode,'third');
  rig.aim(1,'pistol');settle(60);
  assert.ok(Math.abs(frame(camera,rig,aimPivot(subject.feet)).back-1.45)<.08);
  rig.aim(0);rig.armed=false;settle();
  assert.ok(Math.abs(frame(camera,rig,pivot(subject.feet)).back-4.2)<.02,'Back to the chosen distance');
});

test('aiming, the view sits just over the shoulder and hardly dives under the shoulder looking up',t=>{
  const {camera,rig,subject,settle}=fixture(t);
  rig.armed=true;rig.aim(1,'rifle');
  rig.look(0,-rig.pitch);settle(120);
  const level=frame(camera,rig,aimPivot(subject.feet));
  assert.ok(Math.abs(level.up)<.01,`Level, at the pivot: ${level.up}`);
  assert.ok(camera.getPosition().y-subject.feet.y>1.45,'Above where the unarmed view orbits (1.42)');
  rig.look(0,-.5);settle(120);
  const up=frame(camera,rig,aimPivot(subject.feet)).up,orbit=-1.55*Math.sin(.5);
  assert.ok(up<0&&up>orbit*.4,`Looking up it drops ${up}, far less than the plain orbit's ${orbit}`);
  rig.aim(0);rig.armed=false;rig.look(0,.2-rig.pitch);settle();
  assert.ok(Math.abs(frame(camera,rig,pivot(subject.feet)).up-4.2*Math.sin(rig.pitch))<.02,'Unarmed the orbit is the usual one');
});

test('the shoulder swaps quickly, and the chosen side stays',t=>{
  const {camera,rig,subject,settle}=fixture(t);
  rig.armed=true;rig.aim(1);settle();
  rig.swapShoulder();
  for(let i=0;i<30;i++)rig.follow(1/60,subject);
  assert.ok(frame(camera,rig,pivot(subject.feet)).right<-.45,'Most of the way in half a second');
  settle(60);
  assert.equal(rig.side,-1);
  rig.aim(0);rig.armed=false;settle();
  assert.ok(Math.abs(frame(camera,rig,pivot(subject.feet)).right+.3)<.01,'Unarmed it stays on the left, at the usual offset');
});

test('armed, walking with the mouse at rest does not swing the view behind the body',t=>{
  const {rig,subject,settle}=fixture(t);
  settle();
  const yaw=rig.yaw;rig.armed=true;
  subject.facing=1.2;
  for(let i=0;i<360;i++){subject.feet.x+=.05;rig.follow(1/60,subject);}
  assert.ok(Math.abs(rig.yaw-yaw)<1e-9,'No recentre');
});

test('a nudge turns the view at once with no lag after it; a look eases there',t=>{
  const {rig,subject,settle}=fixture(t);
  settle();
  const yaw=rig.yaw,pitch=rig.pitch;
  rig.nudge(.1,.05);
  assert.ok(Math.abs(rig.yaw-yaw-.1)<1e-12&&Math.abs(rig.pitch-pitch-.05)<1e-12);
  for(let i=0;i<10;i++)rig.follow(1/60,subject);
  assert.ok(Math.abs(rig.yaw-yaw-.1)<1e-9,'Nothing to catch up');
  rig.look(-.2,0);
  rig.follow(1/60,subject);
  assert.ok(rig.yaw>yaw-.1&&rig.yaw<yaw+.1,'Eased, not jumped');
  settle(60);
  assert.ok(Math.abs(rig.yaw-(yaw-.1))<1e-4);
});

test('recoil kicks the view up within a few frames and gives its share back once the shooting stops',t=>{
  const {rig,subject,settle}=fixture(t);
  rig.armed=true;settle();
  const start=rig.pitch;
  rig.recoil(.05,0,.6);
  for(let i=0;i<5;i++)rig.follow(1/60,subject);
  assert.ok(start-rig.pitch>.045,`Up by ${(start-rig.pitch).toFixed(4)} after 80 ms`);
  settle(120);
  assert.ok(Math.abs(start-rig.pitch-.02)<.002,`Settles 40% up: ${(start-rig.pitch).toFixed(4)}`);
  // Pulling down while it climbs is recovery already made.
  const before=rig.pitch;
  rig.recoil(.05,0,1);
  for(let i=0;i<5;i++)rig.follow(1/60,subject);
  rig.look(0,.05);
  settle(120);
  assert.ok(Math.abs(rig.pitch-before)<.003,'No double give-back');
});

test('through a scope the view goes into the eyes, the head hides, the x-ray stays shut and the elevation stops at ±1.45',t=>{
  const {camera,rig,subject,settle}=fixture(t);
  const head=new pc.Vec3(subject.feet.x,subject.feet.y+1.62,subject.feet.z);subject.head=head;
  rig.armed=true;rig.aim(1);rig.scope(1);settle(120);
  const eye=new pc.Vec3(head.x,head.y+.09,head.z+.1);
  assert.ok(camera.getPosition().distance(eye)<.02,`At the eye: ${camera.getPosition().distance(eye)}`);
  assert.equal(rig.headHidden,true);
  rig.setMode('first');rig.look(0,-3);settle(30);
  assert.ok(Math.abs(rig.pitch+1.45)<1e-3,'No loop over through a scope');
  assert.equal(rig.telemetry().scope,1);
});

test('an armed first-person sight follows locomotion without copying the walking head bob',t=>{
  const {camera,rig,subject,settle}=fixture(t);
  subject.head=new pc.Vec3(subject.feet.x,subject.feet.y+1.62,subject.feet.z);
  rig.setMode('first');rig.armed=true;settle(180);
  const heights:number[]=[];
  for(let frame=0;frame<180;frame++){
    subject.feet.x+=.05;
    subject.head.x=subject.feet.x;
    subject.head.y=subject.feet.y+1.62+Math.sin(frame/60*Math.PI*6)*.06;
    rig.follow(1/60,subject);
    heights.push(camera.getPosition().y);
    assert.ok(Math.abs(camera.getPosition().x-(subject.feet.x+Math.sin(subject.facing)*.1))<.03,'The eyes travel with the feet, without run lag');
  }
  assert.ok(Math.max(...heights)-Math.min(...heights)<.025,'The animated head does not shake the sight');
});

test('lookScale scales the mouse and the fingers, and armed the view may look higher',t=>{
  const {rig,subject,settle}=fixture(t);
  settle();
  const yaw=rig.yaw;
  rig.lookScale=.5;rig.drag(100,0);settle(60);
  assert.ok(Math.abs(yaw-rig.yaw-.3)<1e-4,'Half of 0.6 rad');
  rig.lookScale=1;
  rig.drag(0,-250);settle(60);
  assert.ok(Math.abs(rig.pitch+.6)<1e-4,'Unarmed: -0.6');
  rig.armed=true;settle(60);rig.drag(0,-250);settle(60); // the limit slides open (UP_SLIDE), it does not jump
  assert.ok(Math.abs(rig.pitch+1.2)<1e-4,'Armed: -1.2');
  rig.armed=false;settle(90);
  assert.ok(rig.pitch>-.61,'Holstering eases it back in range');
});

test('the weapon framing follows the live tuning (Esc › Ajustes › Armas e mira)',t=>{
  const {camera,rig,subject,settle}=fixture(t);
  rig.armed=true;rig.aim(1,'rifle');rig.look(0,-rig.pitch);
  rig.tuneAim({...TUNE,rise:.3,boomRifle:2.2,shoulder:.8});settle(240);
  const tuned=frame(camera,rig,new pc.Vec3(subject.feet.x,subject.feet.y+1.62-.2+.3,subject.feet.z));
  assert.ok(Math.abs(tuned.up)<.01&&Math.abs(tuned.back-2.2)<.08&&Math.abs(tuned.right-.8)<.01,JSON.stringify(tuned));
  rig.tuneAim({...TUNE,rise:99});settle(240);
  assert.ok(Math.abs(frame(camera,rig,aimPivot(subject.feet)).up-(AIM_CAMERA_LIMITS.rise[1]-.05))<.01,'Out of range values are clamped');
});

test('with the weapon only out the view takes its own framing, so the crosshair clears the body',t=>{
  const {camera,rig,subject,settle}=fixture(t);
  settle();rig.look(0,-rig.pitch);
  rig.armed=true;settle(240);
  const held=frame(camera,rig,new pc.Vec3(subject.feet.x,subject.feet.y+1.62-.2+TUNE.armedRise,subject.feet.z));
  assert.ok(Math.abs(held.back-TUNE.armedBoom)<.05&&Math.abs(held.right-TUNE.armedShoulder)<.01&&Math.abs(held.up)<.01,JSON.stringify(held));
  rig.tuneAim({...TUNE,armedBoom:3.5,armedShoulder:.7});settle(240);
  const tuned=frame(camera,rig,new pc.Vec3(subject.feet.x,subject.feet.y+1.62-.2+TUNE.armedRise,subject.feet.z));
  assert.ok(Math.abs(tuned.back-3.5)<.05&&Math.abs(tuned.right-.7)<.01,JSON.stringify(tuned));
  rig.armed=false;settle(360);
  assert.ok(Math.abs(frame(camera,rig,pivot(subject.feet)).back-4.2)<.05,'Put away, back to the chosen distance');
});

test('a rig nobody tuned takes the defaults the owner picked (Copiar valores, 2026-11-09)',t=>{
  const device=Object.assign(new pc.EventHandler(),{scope:new pc.ScopeSpace('camera-aim-defaults')});
  const camera=new pc.Entity('Camera aim defaults'),rig=new CameraRig(camera,device as unknown as pc.GraphicsDevice);
  t.after(()=>{device.fire('destroy');camera.destroy();});
  const subject:CameraSubject={feet:new pc.Vec3(-396,0,-396),facing:0,roll:0,elapsed:0};
  rig.look(0,-rig.pitch);rig.armed=true;
  for(let i=0;i<480;i++)rig.follow(1/60,subject);
  const held=frame(camera,rig,new pc.Vec3(subject.feet.x,subject.feet.y+1.62-.2+DEFAULT_AIM_CAMERA.armedRise,subject.feet.z));
  assert.ok(Math.abs(held.back-DEFAULT_AIM_CAMERA.armedBoom)<.08&&Math.abs(held.right-DEFAULT_AIM_CAMERA.armedShoulder)<.01&&Math.abs(held.up)<.01,JSON.stringify(held));
  rig.aim(1,'rifle');for(let i=0;i<240;i++)rig.follow(1/60,subject);
  const aimed=frame(camera,rig,new pc.Vec3(subject.feet.x,subject.feet.y+1.62-.2+DEFAULT_AIM_CAMERA.rise,subject.feet.z));
  assert.ok(Math.abs(aimed.back-DEFAULT_AIM_CAMERA.boomRifle)<.08&&Math.abs(aimed.right-DEFAULT_AIM_CAMERA.shoulder)<.01&&Math.abs(aimed.up)<.01,JSON.stringify(aimed));
});

test('going into the aim and out of it keeps the crosshair on the point it was on (holdAim)',t=>{
  const {camera,rig,subject,settle}=fixture(t);
  rig.tuneAim({...DEFAULT_AIM_CAMERA});
  rig.armed=true;settle(240);
  const along=(metres:number)=>camera.getPosition().clone().add(camera.forward.clone().mulScalar(metres));
  const offRay=(point:pc.Vec3)=>{const to=point.clone().sub(camera.getPosition()),f=camera.forward.clone().normalize();return to.clone().sub(f.mulScalar(to.dot(f))).length();};
  const point=along(18);
  // Without holding, the move alone throws the middle of the screen off the point.
  {const {camera:c2,rig:r2,settle:s2}=fixture(t);r2.tuneAim({...DEFAULT_AIM_CAMERA});r2.armed=true;s2(240);r2.aim(1);s2(60);
    const to=point.clone().sub(c2.getPosition()),f=c2.forward.clone().normalize();assert.ok(to.sub(f.mulScalar(to.dot(f))).length()>.3,'The framing change alone moves the aim');}
  rig.holdAim([point.x,point.y,point.z]);
  let worst=0;
  for(let i=0;i<=20;i++){rig.aim(i/20);rig.follow(1/60,subject);worst=Math.max(worst,offRay(point));}
  settle(30);worst=Math.max(worst,offRay(point));
  assert.ok(worst<.01,`The point stays in the middle (worst ${worst.toFixed(4)} m off)`);
  rig.holdAim(undefined);
  // Out again, from the aim: the same.
  const back=along(12);rig.holdAim([back.x,back.y,back.z]);worst=0;
  for(let i=20;i>=0;i--){rig.aim(i/20);rig.follow(1/60,subject);worst=Math.max(worst,offRay(back));}
  assert.ok(worst<.01,`Out of the aim too (worst ${worst.toFixed(4)} m)`);
  // The player's own turn lets go at once.
  rig.drag(40,0);assert.equal(rig.holdingAim,false);
});

test('a held point that ends up behind the closing view is let go, not turned to (no half turn); the monitor logs real jumps with a cause',t=>{
  const {camera,rig,subject,settle}=fixture(t);
  settle();
  const yaw=rig.yaw,eye=camera.getPosition().clone();
  // 1.5 m ahead of the old view: once the boom closes in to the shoulder it is behind the camera.
  rig.armed=true;rig.aim(1,'rifle');rig.holdAim([eye.x-Math.sin(yaw)*1.5,eye.y,eye.z-Math.cos(yaw)*1.5]);
  let worst=0,before=rig.yaw;
  for(let i=0;i<60;i++){rig.follow(1/60,subject);worst=Math.max(worst,Math.abs(rig.yaw-before));before=rig.yaw;}
  assert.ok(worst<.5,`Worst turn in one frame ${worst}`);
  rig.nudge(2,0);rig.follow(1/60,subject);
  assert.ok(rig.jumps.length>0&&(rig.jumps.at(-1)!.causes as string[]).some(c=>c.startsWith('nudge')),'A 2 rad nudge is logged with its cause');
});

test('a near held point and a holster while looking up never turn the view more than a few degrees a frame',t=>{
  const {camera,rig,settle}=fixture(t);
  settle();
  rig.armed=true;settle(60);
  const turn=(frames:number,each:(i:number)=>void)=>{let last=camera.forward.clone(),most=0;for(let i=0;i<frames;i++){each(i);settle(1);most=Math.max(most,Math.acos(Math.min(1,camera.forward.dot(last))));last=camera.forward.clone();}return most;};
  rig.holdAim([-396,0,-394.5]);// the ground 1.5 m ahead: the old hold asked for a 29° turn in one frame
  assert.ok(turn(20,i=>rig.aim((i+1)/20,'rifle'))<.06,'holdAim steps');
  rig.holdAim(undefined);rig.aim(0);rig.armed=true;settle(60);
  for(let i=0;i<60;i++){rig.look(0,-.02);settle(1);}
  assert.ok(turn(90,i=>{if(!i)rig.armed=false;})<.06,'holstering slides the look-up limit');
});
