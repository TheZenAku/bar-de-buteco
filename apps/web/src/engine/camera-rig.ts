import * as pc from 'playcanvas';
import {RUN_SPEED,cameraFraction,sightBlocked} from '@bar/shared';
import {CameraXray} from './camera-xray';

/** First person, or an orbit at one of the three distances. */
export type CameraMode='first'|'third';
export const CAMERA_MODES:readonly CameraMode[]=['first','third'];
export const CAMERA_LABELS:Readonly<Record<CameraMode,string>>={first:'Primeira pessoa',third:'Terceira pessoa'};
export const isCameraMode=(value:unknown):value is CameraMode=>CAMERA_MODES.includes(value as CameraMode);
/** Perto, médio e longe, in metres: the wheel steps between them. */
export const CAMERA_ZOOMS:readonly number[]=[2.5,4.2,6.5];
export const CAMERA_ZOOM_LABELS:readonly string[]=['Perto','Médio','Longe'];
export const DEFAULT_CAMERA_DISTANCE=CAMERA_ZOOMS[1]!;
const nearestZoom=(metres:number)=>CAMERA_ZOOMS.reduce((best,zoom)=>Math.abs(zoom-metres)<Math.abs(best-metres)?zoom:best);
/** A saved third-person distance: the nearest of the three (browsers may still hold a free zoom from before them), when it is positive and finite. */
export const readCameraDistance=(value:unknown,fallback=DEFAULT_CAMERA_DISTANCE):number=>
  nearestZoom(typeof value==='number'&&Number.isFinite(value)&&value>0?value:fallback);
/** What each player tunes in Configurações → Câmera (the distance is its own setting, with the wheel). */
export interface CameraFeel {
  /** Metres added to the height of the point the view orbits. */
  height:number;
  /** Multiplies the mouse's turn. */
  sensitivity:number;
  /** 0 follows at twice the speed, .5 as tuned below, 1 at half. */
  smoothing:number;
}
export const DEFAULT_CAMERA_FEEL:Readonly<CameraFeel>={height:0,sensitivity:1,smoothing:.5};
export const CAMERA_HEIGHT_LIMIT=.6;
export const CAMERA_SENSITIVITY_LIMITS=[.25,3] as const;
const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));
const finite=(value:unknown,fallback:number)=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
export const readCameraFeel=(value:unknown):CameraFeel=>{
  const saved=(value&&typeof value==='object'?value:{}) as Partial<CameraFeel>;
  return {height:clamp(finite(saved.height,DEFAULT_CAMERA_FEEL.height),-CAMERA_HEIGHT_LIMIT,CAMERA_HEIGHT_LIMIT),
    sensitivity:clamp(finite(saved.sensitivity,DEFAULT_CAMERA_FEEL.sensitivity),...CAMERA_SENSITIVITY_LIMITS),
    smoothing:clamp(finite(saved.smoothing,DEFAULT_CAMERA_FEEL.smoothing),0,1)};
};

/** Who the camera follows this frame. */
export interface CameraSubject {
  /** The avatar on the floor. */
  feet:pc.Vec3;
  /** Its head joint, when the skin has loaded (first person looks from just above and in front of it). */
  head?:pc.Vec3;
  /** Which way the body faces (radians, zero facing +Z). */
  facing:number;
  /** Degrees the view rolls with drink (0 sober). */
  roll:number;
  elapsed:number;
  /** How many metres of what it is riding reach back past the body: the x-ray stops that much sooner. */
  clearance?:number;
  /** Seconds it must stay hidden before the x-ray opens (0: at once). */
  xrayAfter?:number;
}

// ---- The feel of the third-person view: the numbers to touch (docs/sistemas/camera.md). ----
// Elevation when entering (radians, positive looks down): a little above the shoulders. Third person turns only between these two.
const START_PITCH=.12,PITCH_UP=-.6,PITCH_DOWN=1.35;
// The view orbits the shoulders: this many metres under the head joint.
const HEAD_TO_SHOULDERS=.2;
// Metres the view sits to the right of the body: the player a little to the left of the frame.
const SHOULDER_SIDE=.3;
// Mouse: radians per pixel, sideways and up and down, at sensitivity 1.
const TURN_PER_PIXEL=.006,LOOK_PER_PIXEL=.004;
// Per second, at smoothing .5: the view's turn, the zoom, and the point it looks at following the body, sideways and up and down.
const TURN_RATE=18,ZOOM_RATE_S=10,FOLLOW_RATE=10,FOLLOW_RATE_UP=6;
// How fast the height of the frame follows the head, slow enough that no walk or run cycle shakes the view.
const STATURE_RATE=2.5;
// Metres the view falls back at a full run (a share of that walking), and how fast the stride is felt (per second).
const RUN_BACK=.5,STRIDE_RATE=3;
// Walking with the mouse at rest: this long after the mouse, the view swings behind where the body faces at up to this rate (per second, at a full run), unless the body comes towards the view by more than this (radians).
const FOLLOW_AFTER=1.5,FOLLOW_TURN=.5,FOLLOW_WIDEST=2.4;
// Obstacles: seconds to close in, seconds to open again, and how long it must stay clear before opening.
const CLOSE_TIME=.08,OPEN_TIME=.5,OPEN_AFTER=.18;
// Looks this many seconds (at most this many metres) ahead of where the view is going, so it closes in before reaching a corner.
const LEAD_TIME=.12,LEAD_MOST=2.5;
// The view stays this high over the floor under the player.
const OVER_FLOOR=.18;

// The head joint's height off the feet, whatever the skeleton; a box avatar (its skin still loading) has no joint.
const STATURE=1.62,STATURE_LEAST=.7,STATURE_MOST=2.2;
// A box avatar has no head joint: the eyes are this high.
const EYE_HEIGHT=1.62;
// The x-ray window: around the middle of the body, .8 m to either side (and taller: camera-xray.ts); the floor under the feet is never cut.
const BODY_CENTRE=.95,WINDOW_RADIUS=.8,FLOOR_KEPT=.12;
// Points of the body the camera must see; when a solid hides any of them, the window opens.
const SIGHT=[1.6,1.1,.6];
// Pixels of wheel travel that make one step: a mouse's notch is 100 or more, a trackpad gets there little by little.
const ZOOM_NOTCH=50;
// On a bike the view swings behind it this fast (per second), this low (radians), this long (seconds) after the mouse let go.
const CHASE_TURN=3.2,CHASE_PITCH=.3,CHASE_AFTER_DRAG=1.5;
// At full speed the view falls back this many metres behind the bike.
const RUSH_BACK=.5;
// Metres of room the shoulder needs beyond its own offset, and how long that side must stay free before the view goes back to it.
const SHOULDER_ROOM=.2,SHOULDER_BACK_AFTER=.4;
// Closer to the head than this the head joint hides, and it shows again only past the second (no flicker on the edge).
const HEAD_HIDES=.42,HEAD_SHOWS=.55;
/** Exponential smoothing: the part of the way covered in `dt` seconds at `rate` per second. */
const ease=(rate:number,dt:number)=>1-Math.exp(-rate*dt);
/**
 * The same smoothing towards a goal that moves, solved over the frame: `ease` assumes the goal stands still while the frame lasts,
 * so its lag behind something moving changes with the frame's length, and at speed the subject shakes in the view. Here a goal moving
 * steadily is followed at the same distance however long the frames are. `before` is where the goal was last frame.
 */
function trail(value:number,goal:number,before:number,rate:number,dt:number):number {
  if(dt<=0)return value;
  const steady=(goal-before)/dt/rate;
  return goal-steady-(before-value-steady)*Math.exp(-rate*dt);
}
const wrapped=(angle:number)=>Math.atan2(Math.sin(angle),Math.cos(angle));

/** How fast a knock to the camera dies away (per second). */
const SHAKE_FADE=13;
/**
 * The camera of the local player: behind the body, a little above the shoulders. The mouse turns it, the wheel zooms, and
 * walking with the mouse at rest swings it slowly behind the body. The frame is measured from the feet and the head joint
 * only, so every skeleton gets the same view. Solids shorten the boom: it closes in fast and opens slowly, and never passes
 * through a wall. Whatever still hides a part of the body (a table in front of the legs) is cut away by the x-ray (camera-xray.ts).
 */
export class CameraRig {
  mode:CameraMode='third';
  /** Heading of the view (radians): movement and the listener follow it. The camera sits at +sin/+cos, looking back. */
  yaw=.15;
  private yawGoal=.15;
  /** Elevation in radians, shared by both views: first person turns without limit, third person between PITCH_UP and PITCH_DOWN. */
  pitch=START_PITCH;
  private pitchGoal=START_PITCH;
  /** 0 behind the player, 1 in their eyes. */
  private inside=0;
  /** First person remembers the last third-person distance. */
  private distanceGoal=DEFAULT_CAMERA_DISTANCE;
  /** Wheel travel towards the next step. */
  private wheeled=0;
  private boomLength=DEFAULT_CAMERA_DISTANCE;
  private readonly target=new pc.Vec3(0,1.2,3.5);
  /** Where the point it looks at, the heading and the view's turn were heading last frame (trail). */
  private readonly targetBefore=new pc.Vec3(0,1.2,3.5);
  private headingBefore?:number;
  private yawGoalBefore=.15;
  /** How long a solid has hidden the body (xrayAfter). */
  private hiddenFor=0;
  private readonly eye=new pc.Vec3();
  private eyeSet=false;
  private xrayOpen=0;
  private readonly xray:CameraXray;
  /** Riding a bike: the view and the elevation to give back getting off, and how long ago the mouse last turned the view. */
  private beforeRide?:{mode:CameraMode;pitch:number};
  private sinceDrag=0;
  /** How much of the fall back at speed applies (rush). */
  private rushing=0;
  /** A blow felt through the camera: how far it shakes right now (metres). */
  private shaking=0;
  private shakeTime=0;
  /** The player's tuning (CameraFeel). */
  private feel:CameraFeel={...DEFAULT_CAMERA_FEEL};
  /** How high the head is off the feet right now, eased (STATURE_RATE). */
  private stature=STATURE;
  /** How fast the body goes, eased: 0 standing, 1 at a full run. */
  private stride=0;
  private feetBefore?:{x:number;z:number};
  /** How far to the side the view sits now, and how long that side has been free. */
  private shoulder=0;
  private shoulderFreeFor=SHOULDER_BACK_AFTER;
  /** The part of the way from the body to the wanted place the view really goes (1: all of it), how fast that changes, and how long it has been able to open. */
  private opening=1;
  private openingSpeed=0;
  private openFor=0;
  /** Where the view wanted to be last frame, for the look ahead. */
  private readonly wantedBefore=new pc.Vec3();
  private wantedSet=false;
  /** Metres from the head to the view; whether the head is hidden for being that close. */
  private fromHead=DEFAULT_CAMERA_DISTANCE;
  private headClose=false;
  private readonly temp={a:new pc.Vec3(),b:new pc.Vec3(),c:new pc.Vec3(),up:new pc.Vec3(),goal:new pc.Vec3(),centre:new pc.Vec3(),body:new pc.Vec3(),wanted:new pc.Vec3(),probe:new pc.Vec3(),right:new pc.Vec3()};

  constructor(private readonly camera:pc.Entity,device:pc.GraphicsDevice) {this.xray=new CameraXray(device);}

  /** In the eyes: used to hide the local head, name and ring. */
  get firstPerson():boolean {return this.inside>.7;}
  /** Also when an obstacle has squeezed the view against the head: the head is hidden, as are the name and the ring at the feet. */
  get headHidden():boolean {return this.firstPerson||this.headClose;}
  /** Last third-person distance, retained while looking through the eyes. */
  get reach():number {return this.distanceGoal;}
  get distance():number {return this.mode==='first'?0:this.distanceGoal;}

  setMode(mode:CameraMode):void {
    this.mode=mode;
    this.holdPitch();
  }
  /** The nearest of the three distances, in third person. */
  setDistance(distance:number):void {
    if(!Number.isFinite(distance)||distance<=0)return;
    this.distanceGoal=nearestZoom(distance);
    this.mode='third';
    this.holdPitch();
  }
  /** Height, sensitivity and smoothing, as Configurações has them. */
  setFeel(feel:CameraFeel):void {this.feel=readCameraFeel(feel);}
  /** VR: the head decides where to look. The view takes the headset's heading and elevation as they are, with no easing. */
  slave(yaw:number,pitch:number):void {
    this.yaw=this.yawGoal=this.yawGoalBefore=yaw;
    this.pitch=this.pitchGoal=pitch;
    this.sinceDrag=0;
  }
  /** VR: in the eyes at once, with no walk in from behind. */
  enterFirst():void {this.mode='first';this.inside=1;this.holdPitch();}
  /** Q: the next view round CAMERA_MODES. */
  cycle():CameraMode {this.setMode(CAMERA_MODES[(CAMERA_MODES.indexOf(this.mode)+1)%CAMERA_MODES.length]!);return this.mode;}
  /** One step of the wheel: towards longe or towards perto, stopping at both. Out of first person it goes back to the last distance. */
  wheel(deltaY:number):boolean {
    if(!Number.isFinite(deltaY)||deltaY===0)return false;
    if(deltaY*this.wheeled<0)this.wheeled=0;
    this.wheeled+=deltaY;
    if(Math.abs(this.wheeled)<ZOOM_NOTCH)return false;
    const out=this.wheeled>0;
    this.wheeled=0;
    if(this.mode==='first'){
      if(out)this.setMode('third');
      return out;
    }
    const zoom=CAMERA_ZOOMS[CAMERA_ZOOMS.indexOf(this.distanceGoal)+(out?1:-1)];
    if(zoom===undefined)return false;
    this.setDistance(zoom);return true;
  }
  /** Dragging the mouse: sideways turns, up and down looks up and down (the boom rises as the view looks down). */
  drag(dx:number,dy:number):void {
    this.sinceDrag=0;
    this.yawGoal-=dx*TURN_PER_PIXEL*this.feel.sensitivity;
    this.pitchGoal+=dy*LOOK_PER_PIXEL*this.feel.sensitivity;
    this.holdPitch();
  }
  /** Turns the view to look along `heading` (the camera goes to the opposite side), by the short way round; the chase does not undo it at once. */
  face(heading:number):void {
    this.yawGoal+=wrapped(heading+Math.PI-this.yawGoal);this.sinceDrag=0;
  }
  /** Third person keeps the horizon: back from first person's free turns on the nearest turn, without unwinding them on screen. */
  private holdPitch():void {
    if(this.mode!=='third')return;
    const turns=Math.round(this.pitchGoal/(Math.PI*2))*Math.PI*2;
    this.pitchGoal=clamp(this.pitchGoal-turns,PITCH_UP,PITCH_DOWN);this.pitch-=turns;
  }

  /** Getting on a bike: third person, behind it (chase); getting off: the view the player had. */
  ride(on:boolean):void {
    if(on&&!this.beforeRide){this.beforeRide={mode:this.mode,pitch:this.pitchGoal};this.setMode('third');this.sinceDrag=CHASE_AFTER_DRAG;}
    else if(!on&&this.beforeRide){this.pitchGoal=this.beforeRide.pitch;this.setMode(this.beforeRide.mode);this.beforeRide=undefined;}
  }
  /** Swings the view behind the bike's heading (radians), unless the mouse has just looked somewhere else. */
  chase(heading:number,dt:number):void {
    const turned=this.headingBefore===undefined?0:wrapped(heading-this.headingBefore);
    this.headingBefore=heading;
    if(this.sinceDrag+dt<CHASE_AFTER_DRAG)return;
    // In unwrapped angles: behind the heading, on the turn nearest to the view.
    const turn=wrapped(heading+Math.PI-this.yawGoal);
    this.yawGoal=trail(this.yawGoal,this.yawGoal+turn,this.yawGoal+turn-turned,CHASE_TURN,dt);
    this.pitchGoal+=(CHASE_PITCH-this.pitchGoal)*ease(2,dt);
  }

  /** The view pulling back at speed, 0 to 1 (BarScene eases it): added to the chosen distance, never changing it. */
  rush(amount:number):void {this.rushing=amount;}

  /** A knock: the view shakes this far (metres) for a moment. Harder ones win over what is left of the last. */
  shake(metres:number):void {this.shaking=Math.max(this.shaking,metres);}

  /** Feels how fast the body goes, from the feet alone; a teleport counts as no more than a full run. */
  private feelStride(dt:number,feet:pc.Vec3,riding:boolean):void {
    const speed=dt>0&&this.feetBefore&&!riding?Math.hypot(feet.x-this.feetBefore.x,feet.z-this.feetBefore.z)/dt:0;
    this.feetBefore={x:feet.x,z:feet.z};
    this.stride+=(Math.min(1,speed/RUN_SPEED)-this.stride)*ease(STRIDE_RATE,dt);
    if(this.stride<.001)this.stride=0;
  }
  /** Walking with the mouse at rest: the view swings slowly behind the body, and leaves alone a body coming towards it. */
  private recentre(dt:number,facing:number,pace:number):void {
    if(this.sinceDrag<FOLLOW_AFTER||!this.stride)return;
    const turn=wrapped(facing+Math.PI-this.yawGoal);
    if(Math.abs(turn)<FOLLOW_WIDEST)this.yawGoal+=turn*ease(FOLLOW_TURN*this.stride*pace,dt);
  }
  /** How far along the way from the body to `wanted` the view goes this frame: every solid there closes it, and walls and floors at once. */
  private clear(dt:number,body:pc.Vec3,wanted:pc.Vec3,feetY:number,pace:number,riding:boolean):void {
    const {probe}=this.temp,floor=feetY+OVER_FLOOR;
    // A bike at speed would pump in and out behind every car and bench: only the building stops its view.
    const solid=cameraFraction(body,wanted,riding);
    let hard=solid<1&&!riding?cameraFraction(body,wanted,true):solid;
    if(wanted.y<floor&&body.y>floor)hard=Math.min(hard,(body.y-floor)/(body.y-wanted.y));
    let goal=Math.min(solid,hard);
    // Where the view is heading: closing in before a corner reaches it, so a fast turn does not end in a jump.
    if(this.wantedSet&&dt>0){
      const moved=probe.copy(wanted).sub(this.wantedBefore).length(),lead=Math.min(LEAD_MOST,moved/dt*LEAD_TIME);
      if(lead>.05)goal=Math.min(goal,cameraFraction(body,probe.mulScalar(lead/moved).add(wanted),riding));
    }
    this.wantedBefore.copy(wanted);this.wantedSet=true;
    this.openFor=goal>=this.opening?this.openFor+dt:0;
    if(goal<this.opening||this.openFor>=OPEN_AFTER){
      // A critically damped spring: unlike the exponential, it also starts gently.
      const omega=2/((goal<this.opening?CLOSE_TIME:OPEN_TIME)/pace),x=omega*dt,decay=1/(1+x+.48*x*x+.235*x*x*x);
      const gap=this.opening-goal,pull=(this.openingSpeed+omega*gap)*dt;
      this.openingSpeed=(this.openingSpeed-omega*pull)*decay;
      const next=goal+(gap+pull)*decay;
      if((gap>0)!==(next>goal)||Math.abs(next-goal)<.0005){this.opening=goal;this.openingSpeed=0;}else this.opening=next;
    } else this.openingSpeed=0;
    // Nothing eases through a wall.
    if(this.opening>hard){this.opening=hard;this.openingSpeed=0;}
  }

  /** Places the camera behind or in the eyes of `subject`, and sets the x-ray window for this frame. */
  follow(dt:number,subject:CameraSubject):void {
    const {a,b,c,up,goal,centre,body,wanted,probe,right}=this.temp,{feet}=subject,riding=!!this.beforeRide;
    // Smoothing tunes the walking view; the bike keeps the rates its motion was tuned with.
    const pace=riding?1:2**(1-2*this.feel.smoothing);
    this.sinceDrag+=dt;
    this.feelStride(dt,feet,riding);
    if(this.mode==='third'&&!riding)this.recentre(dt,subject.facing,pace);
    this.yaw=trail(this.yaw,this.yawGoal,this.yawGoalBefore,TURN_RATE*pace,dt);this.yawGoalBefore=this.yawGoal;
    this.pitch+=(this.pitchGoal-this.pitch)*ease(TURN_RATE*pace,dt);
    this.inside+=((this.mode==='first'?1:0)-this.inside)*ease(7,dt);
    if(Math.abs(this.inside-Math.round(this.inside))<.002)this.inside=Math.round(this.inside);
    this.boomLength+=(this.distanceGoal-this.boomLength)*ease(ZOOM_RATE_S*pace,dt);
    // The frame is measured off the head joint, wherever each skeleton has it and whatever the clip does with it (seated, fallen).
    this.stature+=((subject.head?clamp(subject.head.y-feet.y,STATURE_LEAST,STATURE_MOST):STATURE)-this.stature)*ease(STATURE_RATE,dt);
    // Behind the player: the point it looks at trails the body a little; far away (a respawn, a teleport) it jumps.
    goal.set(feet.x,feet.y+this.stature-HEAD_TO_SHOULDERS+this.feel.height,feet.z);
    if(this.target.distance(goal)>8)this.target.copy(goal);
    else this.target.set(trail(this.target.x,goal.x,this.targetBefore.x,FOLLOW_RATE*pace,dt),trail(this.target.y,goal.y,this.targetBefore.y,(riding?FOLLOW_RATE:FOLLOW_RATE_UP)*pace,dt),trail(this.target.z,goal.z,this.targetBefore.z,FOLLOW_RATE*pace,dt));
    this.targetBefore.copy(goal);
    const flat=Math.cos(this.pitch);
    a.set(Math.sin(this.yaw)*flat,Math.sin(this.pitch),Math.cos(this.yaw)*flat);
    right.set(Math.cos(this.yaw),0,-Math.sin(this.yaw));
    // The eyes: just above and in front of the head joint, steadied a little (the clips bob the head).
    if(subject.head)goal.set(subject.head.x+Math.sin(subject.facing)*.1,subject.head.y+.09,subject.head.z+Math.cos(subject.facing)*.1);
    else goal.set(feet.x,feet.y+EYE_HEIGHT,feet.z);
    if(!this.eyeSet||this.eye.distance(goal)>1){this.eye.copy(goal);this.eyeSet=true;}
    else this.eye.lerp(this.eye,goal,ease(25,dt));
    // Off the shoulder; on a bike straight behind, and straight behind where that side has no room.
    this.shoulder+=((riding||this.shoulderFreeFor<SHOULDER_BACK_AFTER?0:SHOULDER_SIDE)-this.shoulder)*ease(3,dt);
    const back=this.rushing*RUSH_BACK+this.stride*this.stride*RUN_BACK;
    wanted.copy(this.target).add(c.copy(a).mulScalar(this.boomLength+back)).add(c.copy(right).mulScalar(this.shoulder));
    const w=this.inside*this.inside*(3-2*this.inside);
    // From the body itself, not from the point trailing it: the body is never inside a wall, a point catching up with it can be.
    body.set(feet.x,feet.y+this.stature-HEAD_TO_SHOULDERS,feet.z);
    if(this.inside>=1){this.opening=1;this.openingSpeed=0;this.wantedSet=false;}
    else {
      this.clear(dt,body,wanted,feet.y,pace,riding);
      if(!riding){
        const free=cameraFraction(body,probe.copy(wanted).add(c.copy(right).mulScalar(SHOULDER_SIDE+SHOULDER_ROOM-this.shoulder)))>=1;
        this.shoulderFreeFor=free?this.shoulderFreeFor+dt:0;
      }
    }
    const behind=this.opening<1?b.lerp(body,wanted,this.opening):b.copy(wanted);
    this.fromHead=behind.distance(body);
    this.headClose=this.fromHead<(this.headClose?HEAD_SHOWS:HEAD_HIDES);
    // Both views share their direction. Rotating the up vector with the orbit avoids flips and singularities at the poles.
    a.mulScalar(-1);
    up.set(-Math.sin(this.yaw)*Math.sin(this.pitch),Math.cos(this.pitch),-Math.cos(this.yaw)*Math.sin(this.pitch));
    const position=b.lerp(behind,this.eye,w);
    if(this.shaking>.0005){
      this.shakeTime+=dt;this.shaking*=Math.exp(-SHAKE_FADE*dt);
      position.x+=Math.sin(this.shakeTime*67)*this.shaking;position.y+=Math.sin(this.shakeTime*83+1)*this.shaking;position.z+=Math.sin(this.shakeTime*59+2)*this.shaking;
    }
    this.camera.setPosition(position);
    this.camera.lookAt(c.copy(position).add(a),up);
    if(subject.roll)this.camera.rotateLocal(Math.sin(subject.elapsed*.7)*subject.roll*.3,0,Math.sin(subject.elapsed*.45)*subject.roll);
    // The x-ray opens while a solid hides part of the body from the camera, and closes once it is clear.
    let hidden=false;
    if(w<.5)for(const height of SIGHT){
      centre.set(feet.x,feet.y+height,feet.z);
      if(sightBlocked(position,centre)){hidden=true;break;}
    }
    this.hiddenFor=hidden?this.hiddenFor+dt:0;
    if(hidden&&this.hiddenFor<(subject.xrayAfter??0))hidden=false;
    this.xrayOpen+=((hidden?1:0)-this.xrayOpen)*ease(hidden?8:4,dt);
    if(this.xrayOpen<.002)this.xrayOpen=0;
    centre.set(feet.x,feet.y+BODY_CENTRE,feet.z);
    if(subject.clearance)centre.add(c.copy(position).sub(centre).normalize().mulScalar(subject.clearance));
    this.xray.set(position,centre,WINDOW_RADIUS,this.xrayOpen*(1-w),feet.y+FLOOR_KEPT);
  }

  /** Not following the player (watching a screen, at the door): no window; the next follow starts from where it is. */
  idle():void {this.xrayOpen=0;this.xray.set(undefined,undefined,0,0,0);}

  telemetry() {
    const p=this.camera.getPosition();
    return {mode:this.mode,distance:this.distance,inside:+this.inside.toFixed(3),boom:+this.boomLength.toFixed(3),reach:this.reach,xray:+this.xrayOpen.toFixed(3),yaw:+this.yaw.toFixed(3),pitch:+this.pitch.toFixed(3),position:[+p.x.toFixed(3),+p.y.toFixed(3),+p.z.toFixed(3)],
      opening:+this.opening.toFixed(3),fromHead:+this.fromHead.toFixed(3),shoulder:+this.shoulder.toFixed(3),stature:+this.stature.toFixed(3),stride:+this.stride.toFixed(3)};
  }
}
