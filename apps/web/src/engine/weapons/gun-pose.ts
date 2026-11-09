import * as pc from 'playcanvas';
import type {ReloadStyle,WeaponStats} from '@bar/shared';
import type {HandRig} from '../drink-props';
import {gripFingers,handJoints,orientHand,palmCentre,reachArm,turnBone,wristFor} from './ik';
import {extendMag,followMag,hideRole,moveRole,restParts,turnRole,type WeaponInstance} from './weapon-models';
import type {MechSound,MetaVec} from './meta';
import {holsterTime} from '../../weapons/contract';

/**
 * The body holding a firearm (docs/sistemas/armas.md#cliente): weapon first. Each frame, after the clips and the head look posed the skeleton, the
 * weapon is placed where the hold puts it (the stock in the shoulder's pocket, a pistol out in front of the face, the revolver at the end of a
 * straight arm) along the aim, the chest turns and pitches to carry it, and both arms reach the grip and the support by two-bone IK; the fingers
 * close on it. Then the reload, the hand-worked actions, the draw and the holster move the gun and the hands on top. Everything is restored at the
 * next frameupdate (restore), so nothing accumulates over the clips (fight-flinch.ts's pattern).
 */
export interface GunSkeleton {
  model:pc.Entity;
  bones:{head:pc.Entity;upperarm_l:pc.Entity;lowerarm_l:pc.Entity;hand_l:pc.Entity;upperarm_r:pc.Entity;lowerarm_r:pc.Entity;hand_r:pc.Entity};
  left?:HandRig;right?:HandRig;
}
/** What the pose is asked for this frame. Times are milliseconds on one clock (`now`'s). Angles radians. */
export interface PoseInput {
  now:number;stats:WeaponStats;
  /** The body's drawn heading, the aim's heading and elevation (up positive), and the point the barrel converges on (the local player's crosshair). */
  bodyYaw:number;heading:number;elevation:number;aimPoint?:pc.Vec3;
  /** Pointing at the aim (aiming or just fired), and how far down the sights (0-1). */
  aiming:boolean;ads:number;
  /** Running: the sprint carry. Lowered: the low ready (a wall in front, or not aiming). */
  running:boolean;lowered:boolean;
  drawAt:number;holsterAt:number;
  /** `key`: what names this reload across frames (the room's start time for others: their `at` is converted to this clock each frame and wobbles). */
  reload?:{at:number;duration:number;style:ReloadStyle;from:number;to:number;key?:number}|undefined;
  cycle?:{at:number;duration:number;action:'pump'|'lever'|'bolt'|'double'}|undefined;
  /** The last round went: the slide stays back. */
  empty:boolean;
  /** The last shot (ms, `now`'s clock) and how many so far (the revolver's cylinder turns a chamber each). */
  lastShotAt:number;shots:number;
}
/** What the pose makes happen in the world: a mechanical sound, a casing out of the port, a magazine let fall. */
export interface PoseEvents {
  mech(sound:MechSound,at:pc.Vec3):void;
  casing(kind:'brass'|'shell',at:pc.Vec3,velocity:pc.Vec3):void;
  magazine(at:pc.Vec3,rotation:pc.Quat,velocity:pc.Vec3,long:boolean):void;
}

const RAD=180/Math.PI;
const clamp=(v:number,a:number,b:number)=>v<a?a:v>b?b:v;
const smooth=(t:number)=>{const x=clamp(t,0,1);return x*x*(3-2*x);};
/** 0 before `a`, 1 after `b`, eased between. */
const span=(u:number,a:number,b:number)=>smooth((u-a)/Math.max(1e-6,b-a));
const wrap=(a:number)=>{let x=(a+Math.PI)%(Math.PI*2);if(x<0)x+=Math.PI*2;return x-Math.PI;};

/** How each hold stands: the chest's turn while aiming (degrees, + turns the right shoulder forward), and how much of the elevation the spine takes. */
const STANCE={rifle:{turn:-24,pitch:.55},pistol:{turn:-4,pitch:.5},revolver:{turn:18,pitch:.45}} as const;
const SPINE_SHARES=[.28,.34,.38];
/** How far a bolt's handle turns up before it is pulled (radians). */
const BOLT_LIFT=Math.PI/3;

// Scratch (the pass runs one avatar at a time).
const fwd=new pc.Vec3(),right=new pc.Vec3(),up=new pc.Vec3(0,1,0),chestFwd=new pc.Vec3(),chestRight=new pc.Vec3();
const dir=new pc.Vec3(),lowDir=new pc.Vec3(),tmp=new pc.Vec3(),tmp2=new pc.Vec3(),tmp3=new pc.Vec3();
const shoulderR=new pc.Vec3(),shoulderL=new pc.Vec3(),shoulderMid=new pc.Vec3(),eye=new pc.Vec3(),hipPos=new pc.Vec3();
const aimPos=new pc.Vec3(),lowPos=new pc.Vec3(),gunPos=new pc.Vec3(),holsterPos=new pc.Vec3(),reloadPos=new pc.Vec3();
const aimRot=new pc.Quat(),lowRot=new pc.Quat(),gunRot=new pc.Quat(),holsterRot=new pc.Quat(),reloadRot=new pc.Quat(),q=new pc.Quat(),q2=new pc.Quat();
const mat=new pc.Mat4(),wp=new pc.Vec3(),magAxis=new pc.Vec3(),bottomOut=new pc.Vec3();
const gripW=new pc.Vec3(),supportW=new pc.Vec3(),leftTarget=new pc.Vec3(),rightTarget=new pc.Vec3(),wrist=new pc.Vec3(),pole=new pc.Vec3();
const palmR=new pc.Vec3(),fingersR=new pc.Vec3(),palmL=new pc.Vec3(),fingersL=new pc.Vec3(),axisX=new pc.Vec3(),axisY=new pc.Vec3(),axisZ=new pc.Vec3();
const belt=new pc.Vec3(),magBottom=new pc.Vec3(),handle=new pc.Vec3(),port=new pc.Vec3(),pivot=new pc.Vec3(),palm=new pc.Vec3(),velocity=new pc.Vec3();
const prevSpine=new pc.Quat(),headWorld=new pc.Quat(),neckWorld=new pc.Quat();

/** A rotation whose -Z runs along `forward` and +Y as near world up (or `upHint`) as it can, into `out`. */
function lookRotation(forward:pc.Vec3,out:pc.Quat,upHint:pc.Vec3=pc.Vec3.UP):pc.Quat {
  axisZ.copy(forward).mulScalar(-1).normalize();
  axisX.cross(upHint,axisZ);
  if(axisX.lengthSq()<1e-6)axisX.cross(pc.Vec3.FORWARD,axisZ);
  axisX.normalize();axisY.cross(axisZ,axisX);
  const d=mat.data;
  d[0]=axisX.x;d[1]=axisX.y;d[2]=axisX.z;d[3]=0;d[4]=axisY.x;d[5]=axisY.y;d[6]=axisY.z;d[7]=0;d[8]=axisZ.x;d[9]=axisZ.y;d[10]=axisZ.z;d[11]=0;d[12]=0;d[13]=0;d[14]=0;d[15]=1;
  return out.setFromMat4(mat);
}
/** Turns a rotation about one of its own axes (local), into itself. */
function turnLocal(rotation:pc.Quat,axis:pc.Vec3,degrees:number):pc.Quat {
  if(Math.abs(degrees)<1e-4)return rotation;
  q.setFromAxisAngle(axis,degrees);
  return rotation.mul(q);
}
/** A point of the weapon's space in the world, for a weapon at `position` turned `rotation`. */
function weaponPoint(position:pc.Vec3,rotation:pc.Quat,point:MetaVec|pc.Vec3,out:pc.Vec3):pc.Vec3 {
  if(point instanceof pc.Vec3)wp.copy(point);else wp.set(point[0],point[1],point[2]);
  rotation.transformVector(wp,out);
  return out.add(position);
}
/** The grip's place for a weapon turned `rotation` whose `point` (weapon space) must be at `at`. */
function gripFor(at:pc.Vec3,rotation:pc.Quat,point:MetaVec,out:pc.Vec3):pc.Vec3 {
  wp.set(point[0],point[1],point[2]);
  rotation.transformVector(wp,out);
  return out.mulScalar(-1).add(at);
}
export class GunPose {
  private readonly saved:{node:pc.GraphNode;rotation:pc.Quat;position:pc.Vec3}[]=[];
  private dirty=false;
  private readonly spine:(pc.GraphNode|null)[];
  private readonly neck:pc.GraphNode|null;
  private readonly hip:pc.GraphNode|null;
  private readonly armRight:number;
  private readonly armLeft:number;
  /** Eased weights: pointing at the aim, down the sights, the sprint carry. */
  private aimW=0;private adsW=0;private sprintW=0;
  /** The recoil's springs: how far the gun is back (m) and turned up (rad), and their speeds. */
  private back=0;private backV=0;private rise=0;private riseV=0;private roll=0;private rollV=0;
  /** Where the muzzle was drawn last frame (the barrel's way to the crosshair's point starts there). */
  readonly muzzle=new pc.Vec3();readonly muzzleDir=new pc.Vec3(0,0,1);
  /** Events already sent for the current reload or cycle (bit flags by step), and which one. */
  private reloadKey=0;private reloadSent=0;private cycleKey=0;private cycleSent=0;private shotsSeen=-1;private cylinder=0;
  /** The left hand holds something now (a magazine, shells), for the props. */
  carrying:''|'mag'|'shell'|'shells'|'loader'='';
  readonly carryAt=new pc.Vec3();readonly carryRot=new pc.Quat();
  /** 0-1: how much of the weapon is out (0 holstered: hidden), and the value of the last frame (whether there was one). */
  shown=0;private outW=0;private outSeen=false;private holsterSeen=0;private holsterFrom=1;

  constructor(private readonly skeleton:GunSkeleton) {
    const find=(name:string)=>skeleton.model.findByName(name) as pc.GraphNode|null;
    this.spine=['spine_01','spine_02','spine_03'].map(find);
    this.neck=skeleton.bones.head.parent;
    this.hip=find('hip');
    const b=skeleton.bones;
    this.armRight=b.upperarm_r.getPosition().distance(b.lowerarm_r.getPosition())+b.lowerarm_r.getPosition().distance(b.hand_r.getPosition());
    this.armLeft=b.upperarm_l.getPosition().distance(b.lowerarm_l.getPosition())+b.lowerarm_l.getPosition().distance(b.hand_l.getPosition());
    if(!(this.armRight>.3&&this.armRight<1))this.armRight=.58;
    if(!(this.armLeft>.3&&this.armLeft<1))this.armLeft=.58;
    const nodes:pc.GraphNode[]=[...this.spine.filter((n):n is pc.GraphNode=>!!n),...(this.neck?[this.neck]:[]),b.head,b.upperarm_l,b.lowerarm_l,b.hand_l,b.upperarm_r,b.lowerarm_r,b.hand_r,
      ...handJoints(skeleton.left).filter(n=>n!==b.hand_l),...handJoints(skeleton.right).filter(n=>n!==b.hand_r)];
    for(const node of new Set(nodes))this.saved.push({node,rotation:new pc.Quat(),position:new pc.Vec3()});
  }

  /** Back to the clips' pose (frameupdate, before the clips run again). */
  restore():void {
    if(!this.dirty)return;
    for(let i=this.saved.length-1;i>=0;i--){const s=this.saved[i]!;s.node.setLocalRotation(s.rotation);}
    this.dirty=false;
  }
  private save():void {
    for(const s of this.saved)s.rotation.copy(s.node.getLocalRotation());
    this.dirty=true;
  }

  /** A shot: the gun kicks back and up (the springs), a little sideways. */
  kick(stats:WeaponStats):void {
    const strength=clamp(stats.recoil.v*RAD/1.2,.35,3.2);
    this.backV+=stats.recoil.kick*38;
    this.riseV+=(.05+.045*strength)*30*(stats.hold==='rifle'?.7:1);
    this.rollV+=(Math.random()-.5+stats.recoil.bias*.5)*.06*30*strength;
  }
  private springs(dt:number):void {
    // Critically damped: a kick is a velocity, the gun goes and comes back once without wobbling.
    const step=(x:number,v:number,w:number):[number,number]=>{const a=-w*w*x-2*w*v;v+=a*dt;x+=v*dt;return [x,v];};
    const n=Math.max(1,Math.ceil(dt/.008));dt/=n;
    for(let i=0;i<n;i++){
      [this.back,this.backV]=step(this.back,this.backV,24);
      [this.rise,this.riseV]=step(this.rise,this.riseV,18);
      [this.roll,this.rollV]=step(this.roll,this.rollV,16);
    }
  }

  /**
   * Poses the body and places `weapon` (its root at the grip, world space). Returns false when nothing is in hand (holstered): the caller hides the
   * weapon.
   */
  apply(input:PoseInput,weapon:WeaponInstance,dt:number,events:PoseEvents):boolean {
    const {stats,now}=input,hold=stats.hold,meta=weapon.meta,b=this.skeleton.bones;
    this.springs(dt);
    // Out of the holster: the draw over drawMs; back in over most of it.
    // The holster lasts as long as the logic keeps the weapon (holsterTime), so it is never cut off mid-arc. The weapon's place only moves
    // towards the holster as fast as the time allows and back out at a fixed speed: a holster let go of (the player changed their mind) swings
    // back out instead of jumping to the hand.
    const drawMs=Math.max(120,stats.drawMs);
    // A holster starts from where the draw had got to (not from fully out).
    if(input.holsterAt!==this.holsterSeen){this.holsterSeen=input.holsterAt;this.holsterFrom=this.outSeen?this.outW:1;}
    const target=input.holsterAt>input.drawAt?this.holsterFrom*(1-clamp((now-input.holsterAt)/holsterTime(stats.drawMs),0,1)):input.drawAt>0?clamp((now-input.drawAt)/drawMs,0,1):1;
    const out=this.outSeen&&target>this.outW?Math.min(target,this.outW+dt*8):target;
    this.outW=out;this.outSeen=out>0;
    this.shown=out;
    if(out<=0)return false;
    this.save();
    const ease=(rate:number)=>1-Math.exp(-rate*dt);
    this.aimW+=((input.aiming&&!input.running?1:0)-this.aimW)*ease(input.aiming?14:6);
    this.adsW+=(clamp(input.ads,0,1)-this.adsW)*ease(18);
    this.sprintW+=((input.running?1:0)-this.sprintW)*ease(input.running?7:9);
    const aimW=this.aimW,adsW=this.adsW*aimW,sprintW=this.sprintW*(1-aimW);

    // The body's frame and the aim.
    const B=input.bodyYaw;
    fwd.set(Math.sin(B),0,Math.cos(B));right.set(-Math.cos(B),0,Math.sin(B));
    const stance=STANCE[hold];
    const yawDelta=clamp(wrap(input.heading-B),-1.3,1.3);
    const reload=input.reload&&now>=input.reload.at&&now<input.reload.at+input.reload.duration?input.reload:undefined;
    const reloadU=reload?(now-reload.at)/reload.duration:0;
    const reloadK=reload?smooth(reloadU/.1)*(1-span(reloadU,.88,1)):0;
    // The chest: turned to the aim (and the stance), pitched with it; recoil and the sprint lean it a little.
    const chestYaw=(yawDelta*RAD+stance.turn)*aimW*(1-.5*reloadK)+(hold==='rifle'?-12:0)*(1-aimW);
    const chestPitch=clamp(input.elevation*RAD*stance.pitch,-32,30)*aimW*(1-.6*reloadK)-this.rise*RAD*.25-6*sprintW-(hold==='rifle'?7:3)*adsW;
    const C=B+chestYaw/RAD;
    chestFwd.set(Math.sin(C),0,Math.cos(C));chestRight.set(-Math.cos(C),0,Math.sin(C));
    const head=b.head,neck=this.neck;
    headWorld.copy(head.getRotation());if(neck)neckWorld.copy(neck.getRotation());
    for(let i=0;i<3;i++){
      const bone=this.spine[i];if(!bone)continue;
      turnBone(bone,up,chestYaw*SPINE_SHARES[i]!);
    }
    for(let i=0;i<3;i++){
      const bone=this.spine[i];if(!bone)continue;
      turnBone(bone,chestRight,chestPitch*SPINE_SHARES[i]!);
    }
    // The head keeps looking where the head look sent it (at the aim); the neck half follows the chest.
    if(neck){prevSpine.copy(neck.getRotation());q2.slerp(prevSpine,neckWorld,.5);neck.setRotation(q2);}
    head.setRotation(headWorld);
    if(adsW>.01&&hold==='rifle'){
      // The cheek on the stock: the head goes forward and down (the neck bows, the face stays level) and tilts onto it.
      dir.set(Math.sin(input.heading),0,Math.cos(input.heading));tmp.set(-dir.z,0,dir.x);
      if(neck)turnBone(neck,tmp,-20*adsW);
      turnBone(head,tmp,14*adsW);
      turnBone(head,dir,10*adsW);
    }

    // Where things are now that the chest has turned.
    shoulderR.copy(b.upperarm_r.getPosition());shoulderL.copy(b.upperarm_l.getPosition());
    shoulderMid.lerp(shoulderL,shoulderR,.5);
    eye.copy(head.getPosition()).add(tmp.copy(up).mulScalar(.085)).add(tmp2.set(Math.sin(input.heading),0,Math.cos(input.heading)).mulScalar(.095));
    if(this.hip)hipPos.copy(this.hip.getPosition());else hipPos.copy(shoulderMid).add(tmp.copy(up).mulScalar(-.5));

    // The aim's direction: at the crosshair's point from the muzzle (the barrel converges where the camera looks), else heading and elevation.
    const ce=Math.cos(input.elevation);
    dir.set(Math.sin(input.heading)*ce,Math.sin(input.elevation),Math.cos(input.heading)*ce);
    if(input.aimPoint&&this.muzzle.lengthSq()>0){
      tmp.sub2(input.aimPoint,this.muzzle);
      const length=tmp.length();
      // Too close (the point on the gun itself) the convergence turns wild: fall back to the plain aim.
      if(length>1.2){
        // Fades in with the distance and out as the point leaves the aim's cone (a hard cut at one angle made the barrel snap).
        tmp.mulScalar(1/length);
        const weight=smooth((length-1.2)/1.5)*span(tmp.dot(dir),.78,.94);
        if(weight>0)dir.lerp(dir,tmp,weight).normalize();
      }
    }
    lookRotation(dir,aimRot);

    // The aim pose: the anchor of each hold, then down the sights.
    const stock:MetaVec=meta.stock??[0,.03,.25];
    if(hold==='rifle'){
      // The butt in the shoulder's pocket: inside the joint, a little forward and down.
      tmp.copy(shoulderR).add(tmp2.copy(chestRight).mulScalar(-.045)).add(tmp3.copy(chestFwd).mulScalar(.05));tmp.y-=.035;
      gripFor(tmp,aimRot,stock,aimPos);
      if(adsW>.001){
        // The sight's line through the eye: the gun comes up and in to it (the cheek on the stock).
        weaponPoint(aimPos,aimRot,weapon.sight,tmp);
        tmp2.sub2(tmp,eye);const along=tmp2.dot(dir);
        tmp2.copy(eye).add(tmp3.copy(dir).mulScalar(along)).sub(tmp);
        const length=tmp2.length();if(length>.05)tmp2.mulScalar(.05/length);
        aimPos.add(tmp2.mulScalar(adsW));
      }
    }else{
      // Out in front, the arms almost straight along the aim: from between the shoulders for the pistol (both hands meet in the middle), from the
      // right shoulder for the revolver. The skins' arms are short against their heads (the eye sits ahead of the shoulder), so the sights cannot
      // reach the eye's line at arm's length: aimed, the gun rises towards it; from the hip it sits lower and closer.
      const fore=hold==='pistol'&&meta.support&&meta.support[2]<-.1?-meta.support[2]*.75:0;
      const pistol=hold==='pistol',reach=Math.max(.25,this.armRight*(pistol?.86:.95)*(.9+.1*adsW)+.03-fore);
      if(pistol){tmp.copy(shoulderMid);tmp.y=shoulderMid.y*.6+shoulderR.y*.4;}else tmp.copy(shoulderR).add(tmp2.copy(chestRight).mulScalar(-.03));
      const reachOut=pistol?Math.sqrt(Math.max(.04,reach*reach-.025)):reach;
      tmp.add(tmp2.copy(dir).mulScalar(reachOut)).add(tmp3.copy(up).mulScalar(adsW*.05-(1-adsW)*(pistol?.08:.05)));
      aimPos.copy(tmp);
    }
    // The low ready, and the sprint carry.
    if(hold==='rifle'){
      lowDir.copy(chestFwd).mulScalar(Math.cos(.62)).add(tmp.copy(up).mulScalar(-Math.sin(.62))).add(tmp2.copy(chestRight).mulScalar(-.32)).normalize();
      if(sprintW>.001){tmp.copy(chestFwd).mulScalar(.35).add(tmp2.copy(up).mulScalar(.62)).add(tmp3.copy(chestRight).mulScalar(-.7)).normalize();lowDir.lerp(lowDir,tmp,sprintW).normalize();}
      lookRotation(lowDir,lowRot);
      turnLocal(lowRot,pc.Vec3.BACK,-25*sprintW-8);
      tmp.copy(shoulderR).add(tmp2.copy(chestRight).mulScalar(-.05)).add(tmp3.copy(chestFwd).mulScalar(.08));tmp.y-=.07;
      gripFor(tmp,lowRot,stock,lowPos);
      if(sprintW>.001){tmp.copy(hipPos).add(tmp2.copy(chestRight).mulScalar(.08)).add(tmp3.copy(chestFwd).mulScalar(.24));tmp.y+=.12;lowPos.lerp(lowPos,tmp,sprintW);}
    }else{
      const down=hold==='pistol'?.85:1.05;
      lowDir.copy(chestFwd).mulScalar(Math.cos(down)).add(tmp.copy(up).mulScalar(-Math.sin(down))).normalize();
      if(sprintW>.001){tmp.copy(chestFwd).mulScalar(.25).add(tmp2.copy(up).mulScalar(-1)).normalize();lowDir.lerp(lowDir,tmp,sprintW).normalize();}
      lookRotation(lowDir,lowRot,tmp2.copy(up).add(tmp3.copy(chestFwd).mulScalar(.3)));
      if(hold==='pistol'){tmp.copy(shoulderMid).add(tmp2.copy(chestFwd).mulScalar(.3)).add(tmp3.copy(chestRight).mulScalar(.04));tmp.y-=.3;}
      else{tmp.copy(shoulderR).add(tmp2.copy(chestFwd).mulScalar(.2)).add(tmp3.copy(chestRight).mulScalar(-.02));tmp.y-=.5;}
      if(sprintW>.001){tmp2.copy(shoulderR).add(tmp3.copy(chestFwd).mulScalar(.1));tmp2.y-=.42;tmp.lerp(tmp,tmp2,sprintW);}
      lowPos.copy(tmp);
    }
    gunPos.lerp(lowPos,aimPos,aimW);gunRot.slerp(lowRot,aimRot,aimW);

    // The reload's own place for the gun: in, low and canted so the work faces the left hand.
    if(reloadK>.001)this.reloadPlace(input,weapon,reload!,reloadU,reloadK);

    // The recoil: back along the barrel and up about the shoulder (long guns) or the wrist.
    if(this.back!==0||this.rise!==0||this.roll!==0){
      gunRot.transformVector(pc.Vec3.BACK,tmp);gunPos.add(tmp.mulScalar(this.back));
      weaponPoint(gunPos,gunRot,hold==='rifle'?stock:[0,0,0],pivot);
      gunRot.transformVector(pc.Vec3.RIGHT,tmp);
      q.setFromAxisAngle(tmp,this.rise*RAD);
      gunRot.transformVector(pc.Vec3.FORWARD,tmp2);q2.setFromAxisAngle(tmp2,this.roll*RAD);q.mul(q2);
      tmp.sub2(gunPos,pivot);q.transformVector(tmp,tmp);gunPos.copy(pivot).add(tmp);
      q2.mul2(q,gunRot);gunRot.copy(q2);
    }

    // The draw and the holster: from the hip (handguns) or the back (long guns), along an arc.
    if(out<1){
      this.holsterPlace(hold,B);
      const t=smooth((out-.18)/.82);
      gunPos.lerp(holsterPos,gunPos,t).add(tmp.copy(up).mulScalar(Math.sin(Math.PI*t)*(hold==='rifle'?.14:.07)));
      gunRot.slerp(holsterRot,gunRot,t);
    }
    weapon.root.setPosition(gunPos);weapon.root.setRotation(gunRot);
    restParts(weapon);extendMag(weapon);

    // The moving parts: the slide's blowback, the hammer and cylinder, the actions worked by hand.
    this.actionParts(input,weapon,events);
    weaponPoint(gunPos,gunRot,weapon.muzzle,this.muzzle);
    gunRot.transformVector(pc.Vec3.FORWARD,this.muzzleDir);

    // The hands: the right on the grip, the left on the support (the pistol's cups the grip, the revolver's hangs).
    const left=this.skeleton.left,rightHand=this.skeleton.right;
    const rightW=smooth(out/.18);
    weaponPoint(gunPos,gunRot,meta.grip,gripW);
    gunRot.transformVector(tmp.set(-1,0,0),palmR);gunRot.transformVector(tmp.set(0,-.38,-1).normalize(),fingersR);
    rightTarget.copy(gripW);
    const cycleRight=this.cycleRight(input,weapon,rightTarget,palmR,fingersR);
    let leftW=hold==='revolver'?0:out>.62?smooth((out-.62)/.3):0;
    leftW*=hold==='pistol'?1-sprintW:1;
    weaponPoint(gunPos,gunRot,weapon.support??pc.Vec3.ZERO,supportW);
    leftTarget.copy(supportW);
    // The pistol's left hand cups the grip; a pistol-held gun with a fore-end (the sawn-off) has it under the barrels, as a long gun's.
    const cupping=!meta.support||meta.support[2]>-.1;
    if(weapon.foregrip==='vertical'){gunRot.transformVector(tmp.set(1,0,0),palmL);gunRot.transformVector(tmp.set(0,-.3,-1).normalize(),fingersL);}
    else if(weapon.foregrip==='angled'){gunRot.transformVector(tmp.set(.7,.7,0).normalize(),palmL);gunRot.transformVector(tmp.set(.5,-.3,-1).normalize(),fingersL);}
    else if(hold==='pistol'&&cupping){gunRot.transformVector(tmp.set(1,.25,.1).normalize(),palmL);gunRot.transformVector(tmp.set(0,-.55,-1).normalize(),fingersL);}
    else{gunRot.transformVector(tmp.set(.55,1,0).normalize(),palmL);gunRot.transformVector(tmp.set(1,.45,-.55).normalize(),fingersL);}
    let leftOff=hold==='pistol'&&cupping?.035:weapon.foregrip!==''?0:.028;
    // The pump rides back with the left hand.
    const pump=weapon.bones.pump;
    if(pump&&input.cycle?.action==='pump'){const amount=this.cycleAmount(input);gunRot.transformVector(pump.axis,tmp);leftTarget.add(tmp.mulScalar(pump.travel*amount));}
    if(reloadK>.001){
      const work=this.reloadLeft(input,weapon,reload!,reloadU,events);
      leftW=Math.max(leftW,work.weight);leftOff=work.off;
    }
    if(b.upperarm_r&&rightW>0){
      if(rightHand){wristFor(rightHand,rightTarget,palmR,fingersR,wrist,.42,cycleRight?.03:0);}else wrist.copy(rightTarget);
      pole.copy(up).mulScalar(hold==='rifle'?-.7:-1).add(tmp.copy(chestRight).mulScalar(hold==='rifle'?1:.35)).add(tmp2.copy(chestFwd).mulScalar(-.25));
      reachArm(b.upperarm_r,b.lowerarm_r,b.hand_r,wrist,pole,rightW);
      if(rightHand){orientHand(rightHand,palmR,fingersR,rightW);if(rightW>.5)gripFingers(rightHand,[58,66,42],cycleRight?[50,60,40]:[22,34,24]);}
    }
    if(leftW>.001){
      if(left)wristFor(left,leftTarget,palmL,fingersL,wrist,.42,leftOff);else wrist.copy(leftTarget);
      pole.copy(up).mulScalar(-1).add(tmp.copy(chestRight).mulScalar(-.55)).add(tmp2.copy(chestFwd).mulScalar(-.1));
      reachArm(b.upperarm_l,b.lowerarm_l,b.hand_l,wrist,pole,leftW);
      if(left){orientHand(left,palmL,fingersL,leftW);if(leftW>.5)gripFingers(left,this.carrying?[38,48,30]:[48,58,36],this.carrying?[38,48,30]:[48,58,36]);}
    }
    if(left&&this.carrying){palmCentre(left,this.carryAt,.55,.03);this.carryRot.copy(gunRot);}
    // The drum and the puller go wherever the reload put the magazine.
    followMag(weapon);
    return true;
  }

  /** The holster's place: the right hip (handguns, muzzle down) or across the back (long guns, butt over the right shoulder). */
  private holsterPlace(hold:'pistol'|'revolver'|'rifle',B:number):void {
    fwd.set(Math.sin(B),0,Math.cos(B));right.set(-Math.cos(B),0,Math.sin(B));
    if(hold==='rifle'){
      holsterPos.copy(shoulderR).add(tmp.copy(fwd).mulScalar(-.17)).add(tmp2.copy(right).mulScalar(-.04));holsterPos.y+=.06;
      tmp.copy(up).mulScalar(-.75).add(tmp2.copy(right).mulScalar(-.66)).normalize();
      lookRotation(tmp,holsterRot,tmp2.copy(fwd).mulScalar(-1));
    }else{
      holsterPos.copy(hipPos).add(tmp.copy(right).mulScalar(.2)).add(tmp2.copy(fwd).mulScalar(.0));holsterPos.y+=.02;
      tmp.copy(up).mulScalar(-1).add(tmp2.copy(fwd).mulScalar(.08)).normalize();
      lookRotation(tmp,holsterRot,fwd);
    }
  }

  /** The gun during a reload: pulled in and low in front of the chest, canted towards the left hand (or muzzle up/down as the style needs). */
  private reloadPlace(input:PoseInput,weapon:WeaponInstance,reload:NonNullable<PoseInput['reload']>,u:number,k:number):void {
    const hold=input.stats.hold,id=weapon.id;
    const style=reload.style;
    // Muzzle: the break-action and the revolver's ejection point it down/up; the rest stays a little up so the magazine well faces the hand.
    let pitch=hold==='rifle'?8:12,cant=hold==='rifle'?-28:-20,inward=-.18;
    if(style==='break'){pitch=-28+span(u,.72,.84)*30;cant=-10;}
    if(id==='revolver'){pitch=style==='mag'?(u<.4?55:20):35;cant=-35;inward=-.3;}
    if(style==='shell'&&id==='escopeta'){pitch=10;cant=-75;}
    if(style==='shell'&&id==='carabina'){pitch=10;cant=-55;}
    tmp.copy(chestFwd).mulScalar(Math.cos(pitch/RAD)).add(tmp2.copy(up).mulScalar(Math.sin(pitch/RAD))).add(tmp3.copy(chestRight).mulScalar(inward)).normalize();
    lookRotation(tmp,reloadRot);turnLocal(reloadRot,pc.Vec3.FORWARD,cant);
    tmp.copy(shoulderMid).add(tmp2.copy(chestFwd).mulScalar(hold==='rifle'?.34:.36)).add(tmp3.copy(chestRight).mulScalar(hold==='rifle'?.1:.02));
    tmp.y-=hold==='rifle'?.2:.18;
    reloadPos.copy(tmp);
    gunPos.lerp(gunPos,reloadPos,k);gunRot.slerp(gunRot,reloadRot,k);
  }

  /** Where the left hand works during a reload (into leftTarget/palmL/fingersL), its weight and grip offset; moves the magazine; sends sounds and props. */
  private reloadLeft(input:PoseInput,weapon:WeaponInstance,reload:NonNullable<PoseInput['reload']>,u:number,events:PoseEvents):{weight:number;off:number} {
    const key=reload.key??reload.at;
    if(this.reloadKey!==key){this.reloadKey=key;this.reloadSent=0;}
    const once=(bit:number,when:boolean,act:()=>void)=>{if(when&&!(this.reloadSent&(1<<bit))){this.reloadSent|=1<<bit;act();}};
    const hold=input.stats.hold,meta=weapon.meta,style=reload.style;
    // The belt: the left hip's front, where the magazines and shells are.
    const B=input.bodyYaw;fwd.set(Math.sin(B),0,Math.cos(B));right.set(-Math.cos(B),0,Math.sin(B));
    belt.copy(hipPos).add(tmp.copy(right).mulScalar(-.15)).add(tmp2.copy(fwd).mulScalar(.08));belt.y-=.02;
    const weight=smooth(u/.08)*(1-span(u,.94,1))+(hold==='revolver'?0:1)*(span(u,.94,1));
    let off=.03;this.carrying='';
    const at=(target:pc.Vec3,blend:number)=>{if(blend>0)leftTarget.lerp(leftTarget,target,blend);};
    const handPalmDown=()=>{gunRot.transformVector(tmp.set(.3,-1,0).normalize(),palmL);gunRot.transformVector(tmp.set(0,0,-1),fingersL);};
    if(style==='mag'&&weapon.id==='revolver'){
      // The speed loader: the gate opens and the cylinder swings, the empties fall, the loader goes in at once.
      const gate=span(u,.02,.14)*(1-span(u,.78,.88));
      moveRole(weapon,'gate',gate);
      once(0,u>.02,()=>events.mech('cylinderOpen',gunPos));
      once(1,u>.18,()=>{for(let i=0;i<Math.max(1,6-reload.from);i++){weaponPoint(gunPos,gunRot,[0,.07,-.03],port);velocity.set((Math.random()-.5)*.4,-.6,(Math.random()-.5)*.4);events.casing('brass',port,velocity);}});
      weaponPoint(gunPos,gunRot,[.02,.075,-.02],port);
      at(belt,span(u,.2,.42)*(1-span(u,.44,.62)));at(port,span(u,.44,.62)*(1-span(u,.8,.95)));
      if(u>.3&&u<.72)this.carrying='loader';
      once(2,u>.66,()=>events.mech('shellIn',port));
      once(3,u>.8,()=>events.mech('cylinderClose',gunPos));
      return {weight:weight*(1-span(u,.86,.98)),off};
    }
    if(style==='mag'){
      const mag=weapon.bones.mag,travel=mag?.travel??.15;
      gunRot.transformVector(mag?.axis??tmp2.set(0,-1,0),magAxis);const axis=magAxis;
      // The bottom of the magazine (where the hand takes it): the bone along its axis, past the well.
      const magOut=span(u,.12,.22);
      if(mag)magBottom.copy(mag.node.getPosition());else weaponPoint(gunPos,gunRot,[0,-.05,-.07],magBottom);
      magBottom.add(tmp.copy(axis).mulScalar(travel*.55));
      bottomOut.copy(magBottom).add(tmp.copy(axis).mulScalar(travel*magOut));
      once(0,u>.12,()=>events.mech('magOut',magBottom));
      if(u<.22){moveRole(weapon,'mag',magOut);at(bottomOut,span(u,0,.12));if(u>.12)this.carrying='';}
      else if(u<.62){
        once(1,true,()=>{if(mag){velocity.copy(axis).mulScalar(.6);events.magazine(mag.node.getPosition(),mag.node.getRotation(),velocity,hold==='rifle');}});
        // To the belt, and back up with a new one.
        const toBelt=span(u,.22,.4),back=span(u,.44,.62);
        tmp.copy(magBottom).add(tmp2.copy(axis).mulScalar(travel*1.1));
        leftTarget.copy(bottomOut).lerp(leftTarget,belt,toBelt).lerp(leftTarget,tmp,back);
        handPalmDown();
        if(u>.4){
          this.carrying='mag';
          // The new magazine is in the hand: the bone follows it there.
          if(mag){const shift=tmp.copy(leftTarget).sub(tmp2.copy(magBottom));mag.node.setPosition(tmp2.copy(mag.node.getPosition()).add(shift).add(tmp3.copy(axis).mulScalar(-travel*.15)));}
        }else if(mag)hideRole(weapon,'mag');
      }else{
        // In: the magazine slides home with the hand under it.
        const home=span(u,.62,.7);
        moveRole(weapon,'mag',(1-home)*1.1);
        once(2,u>.68,()=>events.mech('magIn',magBottom));
        tmp.copy(magBottom).add(tmp2.copy(axis).mulScalar(travel*1.1*(1-home)));
        at(tmp,1-span(u,.72,.8));
        if(reload.from===0){
          // From empty: the rack (the slide pulled by its back on a pistol, the charging handle on a rifle) and let go.
          const charging=weapon.bones.charging?.node??weapon.bones.slide?.node;
          if(charging)handle.copy(charging.getPosition());else weaponPoint(gunPos,gunRot,hold==='pistol'?meta.sight:meta.eject??meta.sight,handle);
          if(hold==='pistol')handle.add(gunRot.transformVector(tmp.set(0,.01,.02),tmp2));
          const pull=span(u,.8,.85)*(1-span(u,.86,.89));
          const role=weapon.bones.charging?'charging':weapon.bones.slide?'slide':'bolt';
          moveRole(weapon,role,pull);if(role!=='slide'&&weapon.bones.bolt)moveRole(weapon,'bolt',pull);
          gunRot.transformVector(pc.Vec3.BACK,tmp);handle.add(tmp.mulScalar(pull*.06));
          at(handle,span(u,.72,.8)*(1-span(u,.88,.96)));
          once(3,u>.8,()=>events.mech(hold==='pistol'?'slideRelease':'rack',handle));
          if(u>.72&&u<.88)handPalmDown();
        }
      }
      off=.025;
      return {weight,off};
    }
    if(style==='break'){
      moveRole(weapon,'barrels',span(u,.03,.14)*(1-span(u,.76,.84)));
      once(0,u>.03,()=>events.mech('breakOpen',gunPos));
      weaponPoint(gunPos,gunRot,[0,.07,-.1],port);
      once(1,u>.2,()=>{for(let i=0;i<(reload.from===0?2:1);i++){velocity.copy(up).mulScalar(1.6).add(gunRot.transformVector(pc.Vec3.BACK,tmp).mulScalar(.9)).add(tmp2.set((Math.random()-.5)*.4,0,(Math.random()-.5)*.4));events.casing('shell',port,velocity);}});
      at(belt,span(u,.22,.42)*(1-span(u,.46,.66)));at(port,span(u,.46,.66)*(1-span(u,.74,.86)));
      if(u>.4&&u<.72)this.carrying='shells';
      once(2,u>.68,()=>events.mech('shellIn',port));
      once(3,u>.78,()=>events.mech('breakClose',gunPos));
      return {weight,off};
    }
    // Round by round: open, then each round from the belt into the port (the revolver's gate, the shotgun's port underneath, the carbine's gate), close.
    const timing=input.stats.reloadMs;
    const start='each' in timing?timing.start:reload.duration*.2,each='each' in timing?timing.each:reload.duration*.2;
    const t=u*reload.duration,rounds=Math.max(1,reload.to-reload.from);
    if(weapon.id==='revolver'){moveRole(weapon,'gate',span(t,0,start*.7)*(1-span(t,reload.duration-(reload.duration-start-each*rounds)*.8,reload.duration)));once(0,t>0,()=>events.mech('cylinderOpen',gunPos));}
    if(weapon.id==='escopeta')weaponPoint(gunPos,gunRot,[0,-.005,-.12],port);
    else if(weapon.id==='revolver')weaponPoint(gunPos,gunRot,[.02,.075,-.012],port);
    else if(input.stats.action==='bolt'&&meta.eject)weaponPoint(gunPos,gunRot,meta.eject,port);
    else weaponPoint(gunPos,gunRot,[.022,.06,-.06],port);
    const round=Math.floor((t-start)/each),inRound=((t-start)-round*each)/each;
    if(input.stats.action==='bolt'&&weapon.bones.bolt){
      // The bolt action loads through its open bolt: the handle up and back at the start, forward and down once the rounds are in.
      const loaded=start+each*rounds,open=span(t,start*.1,start*.8)*(1-span(t,loaded+(reload.duration-loaded)*.05,loaded+(reload.duration-loaded)*.6));
      turnRole(weapon,'bolt',pc.Vec3.BACK,BOLT_LIFT*Math.min(1,open*2));moveRole(weapon,'bolt',Math.max(0,open*2-1));
      once(12,open>.6,()=>events.mech('boltBack',port));
    }
    if(t<start)at(port,span(t,start*.3,start));
    else if(round<rounds){
      at(belt,span(inRound,0,.4)*(1-span(inRound,.45,.85)));
      at(port,span(inRound,.45,.85));
      if(inRound>.35&&inRound<.92)this.carrying='shell';
      once(1+(round%8),inRound>.88,()=>events.mech('shellIn',port));
      if(weapon.id==='revolver')moveRole(weapon,'cylinder',(round+span(inRound,.88,1))%6);
    }else{
      const end=(t-start-each*rounds)/Math.max(1,reload.duration-start-each*rounds);
      once(10,true,()=>events.mech(weapon.id==='revolver'?'cylinderClose':weapon.id==='escopeta'&&reload.from===0?'pumpBack':input.stats.action==='bolt'?'boltForward':'select',port));
      if(weapon.id==='escopeta'&&reload.from===0){
        const pump=weapon.bones.pump,amount=span(end,0,.4)*(1-span(end,.45,.85));
        moveRole(weapon,'pump',amount);
        weaponPoint(gunPos,gunRot,meta.support??[0,0,-.3],supportW);
        if(pump){gunRot.transformVector(pump.axis,tmp);supportW.add(tmp.mulScalar(pump.travel*amount));}
        at(supportW,span(end,0,.25));
        once(11,end>.45,()=>events.mech('pumpForward',supportW));
      }else at(port,1-span(end,0,.6));
    }
    off=.03;
    return {weight,off};
  }

  /** 0→1→0 over the hand-worked action after a shot. */
  private cycleAmount(input:PoseInput):number {
    const c=input.cycle;if(!c)return 0;
    const u=(input.now-c.at)/Math.max(1,c.duration);
    if(u<0||u>1)return 0;
    return c.action==='bolt'?span(u,.25,.45)*(1-span(u,.55,.72)):span(u,.05,.42)*(1-span(u,.5,.9));
  }
  /** The right hand's work in a bolt or lever cycle: moves its target (and returns true when it is off the grip). */
  private cycleRight(input:PoseInput,weapon:WeaponInstance,target:pc.Vec3,palmDir:pc.Vec3,fingersDir:pc.Vec3):boolean {
    const c=input.cycle;if(!c||(c.action!=='bolt'&&c.action!=='lever'))return false;
    const u=(input.now-c.at)/Math.max(1,c.duration);
    if(u<0||u>1)return false;
    if(c.action==='lever'){
      // The hand rides the lever down and up about its pivot.
      const lever=weapon.bones.lever;if(!lever)return false;
      const amount=this.cycleAmount(input);
      lever.node.getPosition();pivot.copy(lever.node.getPosition());
      gunRot.transformVector(lever.axis,tmp);q.setFromAxisAngle(tmp,lever.travel*amount*RAD);
      tmp2.sub2(target,pivot);q.transformVector(tmp2,tmp2);target.copy(pivot).add(tmp2);
      q.transformVector(palmDir,palmDir);q.transformVector(fingersDir,fingersDir);
      return false;
    }
    const bolt=weapon.bones.bolt;
    if(bolt)handle.copy(bolt.node.getPosition());else weaponPoint(gunPos,gunRot,weapon.meta.eject??[.03,.08,-.02],handle);
    const lift=BOLT_LIFT*span(u,.12,.24)*(1-span(u,.74,.84)),hx=.045,hy=-.01;
    handle.add(gunRot.transformVector(tmp.set(hx*Math.cos(lift)-hy*Math.sin(lift),hx*Math.sin(lift)+hy*Math.cos(lift),0),tmp2));
    const reach=span(u,.05,.22)*(1-span(u,.75,.95));
    target.lerp(target,handle,reach);
    if(reach>.3){gunRot.transformVector(tmp.set(-.2,-1,0).normalize(),palm);palmDir.lerp(palmDir,palm,reach).normalize();gunRot.transformVector(tmp.set(-1,0,-.3).normalize(),palm);fingersDir.lerp(fingersDir,palm,reach).normalize();}
    return reach>.5;
  }

  /** The parts that move by themselves or by hand this frame. */
  private actionParts(input:PoseInput,weapon:WeaponInstance,events:PoseEvents):void {
    const {now,stats}=input,since=now-input.lastShotAt;
    if(this.shotsSeen<0)this.shotsSeen=input.shots;
    if(input.shots!==this.shotsSeen){this.cylinder+=((input.shots-this.shotsSeen+65536)%65536)%7;this.shotsSeen=input.shots;}
    // The trigger, pressed for an instant.
    if(since>=0&&since<90)moveRole(weapon,'trigger',1-since/90);
    if(stats.action==='self'){
      // Blowback: the slide or bolt goes back and returns in a few hundredths; on the last round it stays back.
      const cycle=since>=0&&since<70?Math.sin(Math.PI*Math.min(1,since/70)):0;
      const held=input.empty&&!input.reload?1:0;
      const role=weapon.bones.slide?'slide':'bolt';
      moveRole(weapon,role,Math.max(cycle,held));
      if(role==='slide'||!weapon.bones.slide)moveRole(weapon,'charging',0);
      if(weapon.id==='revolver'){
        // Single action: the hammer falls with the shot and the thumb cocks it again; the cylinder turns a chamber.
        const cocked=since<0||since>260?1:since<40?0:span(since,120,240);
        moveRole(weapon,'hammer',cocked);
        moveRole(weapon,'cylinder',this.cylinder-1+span(since,120,240));
      }
    }
    const c=input.cycle;
    if(c){
      const u=(now-c.at)/Math.max(1,c.duration);
      if(u>=0&&u<=1){
        if(this.cycleKey!==c.at){this.cycleKey=c.at;this.cycleSent=0;}
        const once=(bit:number,when:boolean,act:()=>void)=>{if(when&&!(this.cycleSent&(1<<bit))){this.cycleSent|=1<<bit;act();}};
        const amount=this.cycleAmount(input);
        const eject=()=>{weaponPoint(gunPos,gunRot,weapon.meta.eject??[.02,.08,-.05],port);gunRot.transformVector(tmp.set(1,.7,.25),velocity).mulScalar(1.6);events.casing(stats.caliber==='12ga'?'shell':'brass',port,velocity);};
        if(c.action==='pump'){moveRole(weapon,'pump',amount);moveRole(weapon,'bolt',amount);once(0,u>.05,()=>events.mech('pumpBack',gunPos));once(1,u>.3,eject);once(2,u>.5,()=>events.mech('pumpForward',gunPos));}
        else if(c.action==='lever'){moveRole(weapon,'lever',amount);moveRole(weapon,'hammer',Math.min(1,amount*1.5));once(0,u>.05,()=>events.mech('leverDown',gunPos));once(1,u>.38,eject);once(2,u>.5,()=>events.mech('leverUp',gunPos));}
        else if(c.action==='bolt'){
          // The handle up (a turn about the bore), back, forward, down.
          turnRole(weapon,'bolt',pc.Vec3.BACK,BOLT_LIFT*span(u,.12,.24)*(1-span(u,.74,.84)));
          moveRole(weapon,'bolt',amount);once(0,u>.25,()=>events.mech('boltBack',gunPos));once(1,u>.43,eject);once(2,u>.55,()=>events.mech('boltForward',gunPos));}
        else if(c.action==='double'){moveRole(weapon,'hammer',1-span(u,.1,.6));once(0,u>.3,()=>events.mech('hammer',gunPos));}
      }
    }
  }
}
