import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Vec3,WorldRay} from '@bar/shared';
import {AimAssist,anglesTo,angularDistance,bodyFrame,bubble,dampedStep,friction,lockCone,pickTarget,type AssistInput,type AssistTarget,type Angles} from '../../apps/web/src/weapons/aim-assist';

const RAD=Math.PI/180;
const OPEN:WorldRay=()=>undefined;
const CAMERA:Vec3=[.5,1.55,-1.6];
const body=(id:string,x:number,z:number,skin='nathan'):AssistTarget=>({id,skin,pose:{x,y:0,z,rotation:Math.PI}});
/** The view that looks at a body's chest, turned by these angles (radians, right and down). */
const lookingAt=(target:AssistTarget,right=0,down=0):Angles=>{const a=anglesTo(CAMERA,bodyFrame(target).chest);return {yaw:a.yaw-right,pitch:a.pitch+down};};

// One clock for every run: time only goes forward.
let now=1000;
/** Runs the assist at 60 FPS, applying its nudges to the view the way CameraRig.nudge does. */
function run(assist:AimAssist,view:Angles,frames:number,input:Partial<AssistInput>&{targets:AssistTarget[]},each?:(frame:number,view:Angles)=>void){
  const outs=[];
  for(let i=0;i<frames;i++){
    now+=1000/60;each?.(i,view);
    const out=assist.update({dt:1/60,now,device:'gamepad',padMode:'travar',touchAssist:true,autoFire:false,aiming:true,firing:false,stick:{x:0,y:0},camera:CAMERA,view:{...view},range:60,world:OPEN,...input});
    view.yaw+=out.yaw;view.pitch+=out.pitch;outs.push(out);
  }
  return outs;
}

test('angles from the camera are the rig\'s: the view built from them looks at the point',()=>{
  const point:Vec3=[3,2.5,8],a=anglesTo(CAMERA,point),flat=Math.cos(a.pitch);
  const forward=[-Math.sin(a.yaw)*flat,-Math.sin(a.pitch),-Math.cos(a.yaw)*flat];
  const to=[point[0]-CAMERA[0],point[1]-CAMERA[1],point[2]-CAMERA[2]],length=Math.hypot(...to);
  for(let i=0;i<3;i++)assert.ok(Math.abs(forward[i]!-to[i]!/length)<1e-9);
});

test('the lock picks the body nearest the crosshair inside its cone, in sight and in range',()=>{
  const near=body('perto',1,8),wide=body('longe-do-centro',9,9),far=body('fora',0,90),hidden=body('escondido',0,12);
  const view=lookingAt(near,3*RAD);
  const picked=pickTarget(CAMERA,view,[wide,near,far,hidden],60,target=>target.id!=='escondido');
  assert.equal(picked?.target.id,'perto');
  assert.equal(pickTarget(CAMERA,lookingAt(near,40*RAD),[near],60,()=>true),undefined,'Out of the cone');
  assert.ok(lockCone(1)>=29*RAD&&lockCone(100)===8*RAD);
});

test('travar: LT snaps to the chest in about 150 ms without overshooting',()=>{
  const target=body('alvo',0,10),view=lookingAt(target,9*RAD,-3*RAD),assist=new AimAssist();
  const errors:number[]=[];
  run(assist,view,30,{targets:[target]},()=>errors.push(angularDistance(view,anglesTo(CAMERA,bodyFrame(target).chest))));
  const at150=errors[9]!,end=angularDistance(view,anglesTo(CAMERA,bodyFrame(target).chest));
  assert.ok(at150<.6*RAD,`Error at 150 ms: ${(at150/RAD).toFixed(2)}°`);
  assert.ok(end<.02*RAD,'Settled on the chest');
  for(let i=1;i<errors.length;i++)assert.ok(errors[i]!<=errors[i-1]!+1e-9,'Closing every frame, never past it');
  assert.equal(assist.locked,'alvo');
});

test('travar: the lock follows a strafing target and the stick walks the reticle up to the head',()=>{
  const target=body('alvo',0,12),view=lookingAt(target,4*RAD),assist=new AimAssist();
  run(assist,view,20,{targets:[target]});
  // Strafing at a run, 5 m/s across the view.
  let worst=0;
  run(assist,view,60,{targets:[target]},()=>{target.pose.x+=5/60;});
  worst=Math.max(worst,angularDistance(view,anglesTo(CAMERA,bodyFrame(target).chest)));
  assert.ok(worst<.15*RAD,`Tracking error ${(worst/RAD).toFixed(3)}°`);
  // Stick up for half a second: the reticle climbs to the head, and stays on the body.
  run(assist,view,30,{targets:[target],stick:{x:0,y:-1}});
  const head=bodyFrame(target).chest[1]+bodyFrame(target).up;
  const aimed=anglesTo(CAMERA,[target.pose.x,head,target.pose.z]);
  assert.ok(Math.abs(view.pitch-aimed.pitch)<.4*RAD,'At the top of the head');
  assert.equal(assist.locked,'alvo');
});

test('travar: pushing on past the body lets go, and so does losing it from sight',()=>{
  const target=body('alvo',0,10),view=lookingAt(target,2*RAD),assist=new AimAssist();
  run(assist,view,10,{targets:[target]});
  const outs=run(assist,view,60,{targets:[target],stick:{x:1,y:0}});
  assert.equal(assist.locked,undefined,'Pushed off the side');
  assert.equal(outs.at(-1)!.stickLooks,true,'The stick turns the view again');
  // Re-press: locked again; then a wall comes between.
  run(assist,view,2,{targets:[target],aiming:false});
  run(assist,view,10,{targets:[target]});
  assert.equal(assist.locked,'alvo');
  const wall:WorldRay=()=>({fraction:.5,normal:[0,0,-1],surface:'concreto',id:'parede'});
  run(assist,view,12,{targets:[target],world:wall});
  assert.equal(assist.locked,'alvo','Not yet: 200 ms');
  run(assist,view,16,{targets:[target],world:wall});
  assert.equal(assist.locked,undefined,'Gone once 300 ms out of sight (sight is checked at 10 Hz)');
});

test('travar: a flick of the stick jumps to the next target that way',()=>{
  // Looking along +Z the screen's right is -X.
  const left=body('esquerda',2,10),right=body('direita',-2.5,10),view=lookingAt(left,0),assist=new AimAssist();
  run(assist,view,12,{targets:[left,right]});
  assert.equal(assist.locked,'esquerda');
  run(assist,view,2,{targets:[left,right],stick:{x:.1,y:0}});
  run(assist,view,3,{targets:[left,right],stick:{x:.95,y:0}});
  assert.equal(assist.locked,'direita');
  run(assist,view,3,{targets:[left,right],stick:{x:0,y:0}});
  run(assist,view,20,{targets:[left,right]});
  assert.ok(angularDistance(view,anglesTo(CAMERA,bodyFrame(right).chest))<.1*RAD);
});

test('friction slows the look inside the bubble and fades out by 1.6 times it',()=>{
  const d=10,inner=bubble(d);
  assert.ok(Math.abs(friction(0,d,.45)-.45)<1e-12);
  assert.ok(Math.abs(friction(inner,d,.45)-.45)<1e-12);
  assert.equal(friction(inner*1.6,d,.45),1);
  let before=0;
  for(let off=0;off<=inner*2;off+=inner/20){const value=friction(off,d,.45);assert.ok(value>=before-1e-12);before=value;}
});

test('assistida: a small snap when aiming starts (6° at most), then friction; the mouse and livre get nothing',()=>{
  const target=body('alvo',0,15);
  const view=lookingAt(target,4*RAD),assist=new AimAssist();
  run(assist,view,14,{targets:[target],padMode:'assistida'});
  assert.ok(angularDistance(view,anglesTo(CAMERA,bodyFrame(target).chest))<.3*RAD,'Snapped');
  const away=lookingAt(target,9*RAD),still={...away};
  run(new AimAssist(),away,14,{targets:[target],padMode:'assistida'});
  assert.ok(Math.abs(away.yaw-still.yaw)<1e-9,'Too far for the soft snap');
  const outs=run(new AimAssist(),lookingAt(target,.2*RAD),14,{targets:[target],padMode:'assistida'});
  assert.ok(outs.at(-1)!.lookScale<.5,'Friction aiming over the body');
  for(const device of ['mouse'] as const){
    const view=lookingAt(target,4*RAD),before={...view};
    const out=run(new AimAssist(),view,20,{targets:[target],device});
    assert.deepEqual(view,before);assert.ok(out.every(item=>item.lookScale===1));
  }
  const free=lookingAt(target,4*RAD),before={...free};
  run(new AimAssist(),free,20,{targets:[target],padMode:'livre'});
  assert.deepEqual(free,before);
});

test('touch: a gentler snap on aim, and auto-fire only after the crosshair rests on a body',()=>{
  const target=body('alvo',0,8);
  const view=lookingAt(target,10*RAD),assist=new AimAssist();
  run(assist,view,16,{targets:[target],device:'touch'});
  assert.ok(angularDistance(view,anglesTo(CAMERA,bodyFrame(target).chest))<.5*RAD,'Snapped within 12°');
  const quick=run(new AimAssist(),lookingAt(target),5,{targets:[target],device:'touch',autoFire:true});
  assert.equal(quick.some(out=>out.autoFire),false,'Not in the first 120 ms');
  const rest=run(new AimAssist(),lookingAt(target),12,{targets:[target],device:'touch',autoFire:true});
  assert.equal(rest.at(-1)!.autoFire,true);
  const off=run(new AimAssist(),lookingAt(target),12,{targets:[target],device:'touch',autoFire:false});
  assert.equal(off.at(-1)!.autoFire,false,'Off unless chosen');
});

test('the damped step closes without overshoot at any frame time',()=>{
  for(const dt of [1/30,1/60,1/144]){
    let error=.2,velocity=0;
    for(let t=0;t<.5;t+=dt){const step=dampedStep(error,velocity,32,dt);error-=step.move;velocity=step.velocity;assert.ok(error>=-1e-9);}
    assert.ok(error<1e-4);
  }
});
