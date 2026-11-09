import {bodyZones,gunBody,mapRay,rayBody,type GunPose,type Vec3,type WorldRay} from '@bar/shared';
import type {PadAssist} from './aim-settings';
export type {PadAssist};

/**
 * Aim assistance (docs/sistemas/armas.md#mira-assistida). A gamepad gets Red Dead Redemption 2's lock ('travar': LT snaps to the best target and
 * holds it, the right stick walks the reticle over the body, a flick jumps to the next), or a soft help ('assistida': friction and magnetism near a
 * body, a small snap when aiming), or none ('livre'). A finger gets a gentler snap and tracking; the mouse never gets anything. Everything works in
 * the camera rig's angles (yaw: the camera sits at +sin/+cos and looks back; pitch > 0 looks down), measured from where the camera really is: over
 * the shoulder the parallax is real. The scene applies the result through CameraRig.nudge (no lag) and scales the player's own look by lookScale.
 */
export type InputDevice='mouse'|'gamepad'|'touch';
export interface AssistTarget {id:string;skin?:string;pose:GunPose}
export interface Angles {yaw:number;pitch:number}

const RAD=Math.PI/180;
export const wrapped=(angle:number)=>Math.atan2(Math.sin(angle),Math.cos(angle));
const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));
const smoothstep=(a:number,b:number,x:number)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};

/** The rig's angles that look from `from` at `to`. */
export function anglesTo(from:Vec3,to:Vec3):Angles {
  const dx=to[0]-from[0],dy=to[1]-from[1],dz=to[2]-from[2];
  return {yaw:Math.atan2(dx,dz)-Math.PI,pitch:-Math.atan2(dy,Math.hypot(dx,dz))};
}
/** Where `to` sits on screen from `view` (radians): right and down. */
export function screenOffset(view:Angles,to:Angles):{x:number;y:number} {
  return {x:-wrapped(to.yaw-view.yaw)*Math.cos(view.pitch),y:to.pitch-view.pitch};
}
export const angularDistance=(view:Angles,to:Angles)=>{const off=screenOffset(view,to);return Math.hypot(off.x,off.y);};
/** The cone a lock looks in around the crosshair at `distance` metres (radians): wide up close, never under 8°. */
export const lockCone=(distance:number)=>Math.max(8*RAD,Math.min(30*RAD,Math.atan(2.2/Math.max(.1,distance))));
/** The bubble around a body where friction and magnetism act (radians), and where they fade out (×1.6). */
export const bubble=(distance:number)=>Math.atan(.45/Math.max(.1,distance))+1.2*RAD;
/** The look's multiplier over a target: `strength` inside the bubble, 1 past 1.6 times it, smooth between. */
export function friction(off:number,distance:number,strength:number):number {
  const inner=bubble(distance);
  return 1-(1-strength)*(1-smoothstep(inner,inner*1.6,off));
}
/** A body's aim points: the chest, the head, how far up and down and to the sides the reticle may walk from the chest (m). */
export function bodyFrame(target:AssistTarget):{chest:Vec3;up:number;down:number;half:number;neck:number} {
  const body=gunBody(target.skin),{x,y,z}=target.pose;
  return {chest:[x,y+body.chest,z],up:body.head+.06-body.chest,down:body.chest-.55,half:body.shoulderWidth/2+.06,neck:body.neck-body.chest};
}

/** The best target near the crosshair: the least off the crosshair within its cone, a little in favour of the near. */
export function pickTarget(camera:Vec3,view:Angles,targets:readonly AssistTarget[],range:number,visible:(target:AssistTarget)=>boolean,
  cone:(distance:number)=>number=lockCone):{target:AssistTarget;angles:Angles;distance:number}|undefined {
  let best:{target:AssistTarget;angles:Angles;distance:number;score:number}|undefined;
  for(const target of targets){
    const {chest}=bodyFrame(target),distance=Math.hypot(chest[0]-camera[0],chest[1]-camera[1],chest[2]-camera[2]);
    if(distance>range||distance<.5)continue;
    const angles=anglesTo(camera,chest),off=angularDistance(view,angles),limit=cone(distance);
    if(off>limit)continue;
    // In front only: the cone already is, but a body behind the camera can wrap into it at the poles.
    if(Math.abs(wrapped(angles.yaw-view.yaw))>Math.PI/2)continue;
    if(!visible(target))continue;
    const score=off/limit+.15*distance/range;
    if(!best||score<best.score)best={target,angles,distance,score};
  }
  return best&&{target:best.target,angles:best.angles,distance:best.distance};
}
/** A flick of the stick (screen direction `toward`): the nearest other target that way from `from`. */
export function flickTarget(camera:Vec3,view:Angles,from:string,toward:{x:number;y:number},targets:readonly AssistTarget[],range:number,
  visible:(target:AssistTarget)=>boolean):AssistTarget|undefined {
  const length=Math.hypot(toward.x,toward.y)||1,dir={x:toward.x/length,y:toward.y/length};
  let best:{target:AssistTarget;score:number}|undefined;
  for(const target of targets){
    if(target.id===from)continue;
    const {chest}=bodyFrame(target),distance=Math.hypot(chest[0]-camera[0],chest[1]-camera[1],chest[2]-camera[2]);
    if(distance>range)continue;
    const off=screenOffset(view,anglesTo(camera,chest)),along=off.x*dir.x+off.y*dir.y,across=Math.abs(off.x*dir.y-off.y*dir.x);
    // That way (within 50° of it) and on screen-ish (a wide 70°).
    if(along<=0||across>along*1.2||Math.hypot(off.x,off.y)>70*RAD||!visible(target))continue;
    const score=along+across*1.5;
    if(!best||score<best.score)best={target,score};
  }
  return best?.target;
}
/**
 * One step of a critically damped approach of `error` (radians) to 0 with velocity `velocity`, at `omega` (1/s): how much of it to cover this
 * frame, and the velocity after. Settles in about 4.7/omega without overshooting.
 */
export function dampedStep(error:number,velocity:number,omega:number,dt:number):{move:number;velocity:number} {
  const decay=Math.exp(-omega*dt),left=(error+(velocity+omega*error)*dt)*decay;
  return {move:error-left,velocity:(velocity-omega*(velocity+omega*error)*dt)*decay};
}

/** What the scene knows this frame. */
export interface AssistInput {
  dt:number;now:number;
  device:InputDevice;padMode:PadAssist;touchAssist:boolean;autoFire:boolean;
  /** Aiming down the sights is held (LT, the right button, the touch toggle), and the trigger. */
  aiming:boolean;firing:boolean;
  /** The right stick after its dead zone (x right, y down), zero for other devices. */
  stick:{x:number;y:number};
  camera:Vec3;view:Angles;
  targets:readonly AssistTarget[];
  /** How far a lock reaches (m): the weapon's range, at most 60 m (120 m through a scope). */
  range:number;
  world?:WorldRay;
}
export interface AssistOutput {
  /** Rotation to add to the view now (rig angles, CameraRig.nudge). */
  yaw:number;pitch:number;
  /** Multiplies the player's own look (stick or finger): friction. */
  lookScale:number;
  /** The stick turns the view (false while a lock takes it to walk the reticle over the body). */
  stickLooks:boolean;
  locked?:string;
  /** The crosshair is on a body (for touch auto-fire), and auto-fire wants the trigger. */
  onBody:boolean;autoFire:boolean;
}

// The lock: snap ω (1/s), how fast the stick walks the reticle over the body (m/s up-down, sideways), how far past the body it must push to let go
// (m), how long a target may stay out of sight (ms).
const LOCK_OMEGA=32,WALK_UP=1.5,WALK_SIDE=1.1,BREAK_PAST=.4,LOST_MS=300;
// A flick: from under .3 to over .85 within 120 ms.
const FLICK_LOW=.3,FLICK_HIGH=.85,FLICK_MS=120;
// The soft help: ADS snap at most 6° over 180 ms; friction aiming / from the hip; magnetism's share of the target's motion.
const SOFT_SNAP=6*RAD,SOFT_SNAP_MS=180,SOFT_OMEGA=26,FRICTION_ADS=.45,FRICTION_HIP=.6,MAGNETISM=.6;
// The lock's own hip fire: milder.
const LOCK_HIP_FRICTION=.7,LOCK_HIP_MAGNETISM=.35;
// Touch: snap at most 12° over 220 ms, tracking share while aiming, friction for drags over a body, auto-fire after this long on a body (ms).
const TOUCH_SNAP=12*RAD,TOUCH_SNAP_MS=220,TOUCH_OMEGA=21,TOUCH_TRACK=.6,TOUCH_FRICTION=.5,AUTO_FIRE_MS=120;
// Sight lines are checked this often per target (ms).
const SIGHT_MS=100;

export class AimAssist {
  private lock?:{id:string;up:number;side:number;past:number;vy:number;vp:number;prev?:Angles;lostAt:number;flicking:boolean};
  private snap?:{id:string;until:number;omega:number;vy:number;vp:number};
  private readonly sight=new Map<string,{at:number;visible:boolean}>();
  private readonly motion=new Map<string,Angles>();
  private aimingBefore=false;
  private stickLow=0;
  private stickWasLow=true;
  private bodySince=0;
  /** The target locked now, and the point the lock aims at (for the HUD). */
  get locked():string|undefined {return this.lock?.id;}
  reset():void {this.lock=undefined;this.snap=undefined;this.aimingBefore=false;this.bodySince=0;}

  private visible(target:AssistTarget,camera:Vec3,now:number,world:WorldRay):boolean {
    const known=this.sight.get(target.id);
    if(known&&now-known.at<SIGHT_MS)return known.visible;
    const {chest}=bodyFrame(target),hit=world(camera,chest);
    const visible=!hit||hit.fraction>.97;
    this.sight.set(target.id,{at:now,visible});
    return visible;
  }

  update(input:AssistInput):AssistOutput {
    const out:AssistOutput={yaw:0,pitch:0,lookScale:1,stickLooks:true,onBody:false,autoFire:false};
    const {dt,now,camera,view,targets}=input,world=input.world??mapRay;
    const press=input.aiming&&!this.aimingBefore;this.aimingBefore=input.aiming;
    // How each target moves across the view this frame (its own motion and the camera's): magnetism follows it.
    const moves=new Map<string,Angles>();
    for(const target of targets){
      const angles=anglesTo(camera,bodyFrame(target).chest),before=this.motion.get(target.id);
      moves.set(target.id,before?{yaw:wrapped(angles.yaw-before.yaw),pitch:angles.pitch-before.pitch}:{yaw:0,pitch:0});
      this.motion.set(target.id,angles);
    }
    for(const id of [...this.motion.keys()])if(!targets.some(target=>target.id===id)){this.motion.delete(id);this.sight.delete(id);}
    const seen=(target:AssistTarget)=>this.visible(target,camera,now,world);
    const mode:PadAssist|'touch'|'none'=input.device==='gamepad'?input.padMode:input.device==='touch'&&input.touchAssist?'touch':'none';
    if(mode==='none'||mode==='livre'){this.lock=this.snap=undefined;this.bodySince=0;return out;}
    if(mode==='travar')this.travar(input,press,moves,seen,out);
    else this.soft(input,mode,press,moves,seen,out);
    // The crosshair on a body: a finger's auto-fire (aiming only, after a moment on it).
    out.onBody=this.onBody(input);
    if(mode==='touch'&&input.autoFire&&input.aiming&&out.onBody){if(!this.bodySince)this.bodySince=now;out.autoFire=now-this.bodySince>=AUTO_FIRE_MS;}
    else this.bodySince=out.onBody&&input.aiming?this.bodySince||now:0;
    out.locked=this.lock?.id;
    return out;
  }

  /** RDR2: LT snaps to the best target and holds it while held; the stick walks the reticle over the body, past it lets go; a flick jumps. */
  private travar(input:AssistInput,press:boolean,moves:Map<string,Angles>,seen:(target:AssistTarget)=>boolean,out:AssistOutput):void {
    const {dt,now,camera,view,targets,stick}=input;
    // Only a press of LT locks (re-pressing snaps again): a lock let go by pushing off the body is not taken back while LT stays held.
    if(!input.aiming)this.lock=undefined;
    else if(press){
      const found=pickTarget(camera,view,targets,input.range,seen);
      this.lock=found?{id:found.target.id,up:0,side:0,past:0,vy:0,vp:0,lostAt:0,flicking:false}:undefined;
    }
    // A flick of the stick while locked switches to the nearest target that way.
    const magnitude=Math.hypot(stick.x,stick.y);
    if(magnitude<FLICK_LOW){this.stickLow=now;this.stickWasLow=true;if(this.lock)this.lock.flicking=false;}
    if(this.lock&&magnitude>FLICK_HIGH&&this.stickWasLow&&now-this.stickLow<=FLICK_MS){
      this.stickWasLow=false;
      const next=flickTarget(camera,view,this.lock.id,stick,targets,input.range,seen);
      if(next)this.lock={id:next.id,up:0,side:0,past:0,vy:0,vp:0,lostAt:0,flicking:true};
    }
    if(magnitude>=FLICK_LOW&&now-this.stickLow>FLICK_MS)this.stickWasLow=false;
    const lock=this.lock;
    if(!lock){this.hip(input,moves,LOCK_HIP_FRICTION,LOCK_HIP_MAGNETISM,out);return;}
    const target=targets.find(item=>item.id===lock.id);
    if(!target){this.lock=undefined;return;}
    const frame=bodyFrame(target),distance=Math.hypot(frame.chest[0]-camera[0],frame.chest[1]-camera[1],frame.chest[2]-camera[2]);
    if(distance>input.range*1.1){this.lock=undefined;return;}
    if(!seen(target)){lock.lostAt||=now;if(now-lock.lostAt>LOST_MS){this.lock=undefined;return;}}
    else lock.lostAt=0;
    // The stick walks the aim point over the body (not while a flick is still held); pushing on past its edge lets go.
    if(!lock.flicking){
      const up=lock.up-stick.y*WALK_UP*dt,side=lock.side+stick.x*WALK_SIDE*dt;
      const half=up>frame.neck?.13:frame.half;
      const clampedUp=clamp(up,-frame.down,frame.up),clampedSide=clamp(side,-half,half);
      // Over the head or under the knees counts half: walking up to a headshot often overshoots a little.
      const past=Math.hypot((up-clampedUp)*.5,side-clampedSide);
      lock.past=past>0?lock.past+past:Math.max(0,lock.past-dt*.5);
      lock.up=clampedUp;lock.side=clampedSide;
      if(lock.past>BREAK_PAST){this.lock=undefined;return;}
    }
    out.stickLooks=false;
    const right=[Math.cos(view.yaw),0,-Math.sin(view.yaw)];
    const point:Vec3=[frame.chest[0]+right[0]!*lock.side,frame.chest[1]+lock.up,frame.chest[2]+right[2]!*lock.side];
    const desired=anglesTo(camera,point);
    // The target's own motion across the view, followed fully; the rest closes in a critically damped snap.
    const motion=lock.prev?{yaw:wrapped(desired.yaw-lock.prev.yaw),pitch:desired.pitch-lock.prev.pitch}:{yaw:0,pitch:0};
    lock.prev=desired;
    const errYaw=wrapped(desired.yaw-view.yaw)-motion.yaw,errPitch=desired.pitch-view.pitch-motion.pitch;
    const yaw=dampedStep(errYaw,lock.vy,LOCK_OMEGA,dt),pitch=dampedStep(errPitch,lock.vp,LOCK_OMEGA,dt);
    lock.vy=yaw.velocity;lock.vp=pitch.velocity;
    out.yaw=motion.yaw+yaw.move;out.pitch=motion.pitch+pitch.move;
  }

  /** 'assistida' and touch: a short snap when aiming starts, then friction and magnetism near a body. */
  private soft(input:AssistInput,mode:'assistida'|'touch',press:boolean,moves:Map<string,Angles>,seen:(target:AssistTarget)=>boolean,out:AssistOutput):void {
    const {dt,now,camera,view,targets}=input;
    const touch=mode==='touch',limit=touch?TOUCH_SNAP:SOFT_SNAP;
    if(press){
      const found=pickTarget(camera,view,targets,input.range,seen,()=>limit);
      this.snap=found?{id:found.target.id,until:now+(touch?TOUCH_SNAP_MS:SOFT_SNAP_MS),omega:touch?TOUCH_OMEGA:SOFT_OMEGA,vy:0,vp:0}:undefined;
    }
    const snap=this.snap;
    if(snap&&(!input.aiming||now>snap.until))this.snap=undefined;
    else if(snap){
      const target=targets.find(item=>item.id===snap.id);
      if(target){
        const desired=anglesTo(camera,bodyFrame(target).chest);
        const yaw=dampedStep(wrapped(desired.yaw-view.yaw),snap.vy,snap.omega,dt),pitch=dampedStep(desired.pitch-view.pitch,snap.vp,snap.omega,dt);
        snap.vy=yaw.velocity;snap.vp=pitch.velocity;out.yaw+=yaw.move;out.pitch+=pitch.move;
        return;
      }
      this.snap=undefined;
    }
    if(touch){
      // A finger: tracking while aiming, friction for drags over a body.
      this.hip(input,moves,TOUCH_FRICTION,input.aiming?TOUCH_TRACK:0,out);
      return;
    }
    this.hip(input,moves,input.aiming?FRICTION_ADS:FRICTION_HIP,MAGNETISM,out);
  }

  /** Friction and magnetism from the nearest body to the crosshair (in its bubble). */
  private hip(input:AssistInput,moves:Map<string,Angles>,frictionAt:number,magnetism:number,out:AssistOutput):void {
    const {camera,view,targets}=input;
    let best:{off:number;distance:number;id:string}|undefined;
    for(const target of targets){
      const {chest}=bodyFrame(target),distance=Math.hypot(chest[0]-camera[0],chest[1]-camera[1],chest[2]-camera[2]);
      if(distance>input.range)continue;
      // The bubble is measured to the body's nearest point on its upright line (head to knees), not to the chest alone.
      const top=anglesTo(camera,[chest[0],chest[1]+.45,chest[2]]),bottom=anglesTo(camera,[chest[0],chest[1]-.6,chest[2]]);
      const centre=anglesTo(camera,chest),off=screenOffset(view,centre);
      const offTop=screenOffset(view,top).y,offBottom=screenOffset(view,bottom).y;
      const above=off.y<offTop?off.y-offTop:off.y>offBottom?off.y-offBottom:0;
      const angle=Math.hypot(off.x,above);
      if(!best||angle<best.off)best={off:angle,distance,id:target.id};
    }
    if(!best)return;
    out.lookScale=friction(best.off,best.distance,frictionAt);
    const inside=1-smoothstep(bubble(best.distance),bubble(best.distance)*1.6,best.off);
    // Magnetism only pulls while the player means to shoot (aiming or firing); friction is there whenever a body is under the crosshair.
    if(inside>0&&magnetism>0&&(input.aiming||input.firing)){
      const move=moves.get(best.id);
      if(move){out.yaw+=move.yaw*magnetism*inside;out.pitch+=move.pitch*magnetism*inside;}
    }
  }

  /** Whether the crosshair's ray meets a body now (slightly swollen: what a thumb can hold). */
  private onBody(input:AssistInput):boolean {
    const {camera,view}=input,flat=Math.cos(view.pitch);
    const forward:Vec3=[-Math.sin(view.yaw)*flat,-Math.sin(view.pitch),-Math.cos(view.yaw)*flat];
    for(const target of input.targets){
      if(Math.abs(target.pose.x-camera[0])>input.range||Math.abs(target.pose.z-camera[2])>input.range)continue;
      if(rayBody(camera,forward,input.range,bodyZones(target.skin,target.pose,.03)))return true;
    }
    return false;
  }
}
