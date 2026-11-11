import * as pc from 'playcanvas';
import {RUN_SPEED,cameraFraction,sightBlocked} from '@bar/shared';
import {CameraXray} from './camera-xray';
import {DEFAULT_AIM_CAMERA,readAimCamera,type AimCamera} from '../weapons/aim-settings';

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
// The most the held aim point may turn the view in one frame (radians); and what the monitor calls a jump: this much turn in one frame, or this many metres for the camera.
const HOLD_MOST=.5,JUMP_TURN=.6,JUMP_METRES=1.2;
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
// Closer to the head than this the head joint hides, and it shows again only past the second (no flicker on the edge).
const HEAD_HIDES=.42,HEAD_SHOWS=.55;
// Weapons (docs/sistemas/armas.md#camera): where the view sits aiming and with a weapon out is AimCamera (tuned live from the Esc menu; the line of
// sight just over the shoulder, as GTA V frames it, and the view turning nearly in place instead of diving under the shoulder looking up).
// The shoulder swaps at this rate (per second).
const SWAP_RATE=10;
// How fast the framing with the weapon in hand comes in and goes out (per second).
const ARMED_FRAME_RATE=6;
// A weapon out (not aiming): the turn this much faster too, and the view may look further up; through a scope the elevation stops at ±this.
const HOLD_STEP=.03,UP_SLIDE=1.2;
const ARMED_TURN=.6,ARMED_PITCH_UP=-1.2,SCOPE_PITCH=1.45;
// Recoil: a kick reaches the view at this rate (per second); after this long (s) with no kick, the share given back returns at this rate.
const KICK_RATE=45,RECOVER_AFTER=.09,RECOVER_RATE=7;
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
  /** Weapons, opt-in (the defaults leave the view as it always was): a weapon is out (no recentre, a quicker turn, a wider look up). */
  armed=false;
  private armedBefore=false;
  /** How far up the third-person view may look now (it slides between the plain limit and the armed one). */
  private upLimit=PITCH_UP;
  /** 0-1 the weapon out, eased (the framing with the weapon in hand comes in and goes out gently). */
  private armedBlend=0;
  /** 0-1 aiming down the sights (the gun's eased blend) and its framing; 0-1 through a scope, and the point the scope's eye is at. */
  private aimBlend=0;
  private aimProfile:'rifle'|'pistol'='rifle';
  private scopeBlend=0;
  private readonly scopePoint=new pc.Vec3();
  private scopePointSet=false;
  /** The shoulder the view sits over (1 right, -1 left): the one chosen, and the one used now (always the chosen one: the user asked for it fixed). */
  side:1|-1=1;
  private sideChosen:1|-1=1;
  /** Multiplies the mouse's and the fingers' turn: aiming slows it with the zoom, aim assistance with friction. */
  lookScale=1;
  /** Where the view sits with a weapon (AimCamera), and the settings' object it was read from. */
  private aimTune:AimCamera={...DEFAULT_AIM_CAMERA};
  private aimTuneSource?:AimCamera;
  /** A point the view keeps in its middle while it moves between the framings (holdAim). */
  private readonly focus=new pc.Vec3();
  private focusSet=false;
  /** Recoil on its way to the view, and the share to give back (radians: up, right). */
  private kickPitch=0;
  private kickYaw=0;
  private backPitch=0;
  private backYaw=0;
  private sinceKick=1;

  constructor(private readonly camera:pc.Entity,device:pc.GraphicsDevice) {this.xray=new CameraXray(device);}

  /** In the eyes: used to hide the local head, name and ring. */
  get firstPerson():boolean {return this.inside>.7;}
  /** Also when an obstacle has squeezed the view against the head: the head is hidden, as are the name and the ring at the feet. */
  get headHidden():boolean {return this.firstPerson||this.headClose||this.scopeBlend>.5;}
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
    this.sinceDrag=0;if(dx||dy){this.focusSet=false;this.cause="drag";}
    this.yawGoal-=dx*TURN_PER_PIXEL*this.feel.sensitivity*this.lookScale;
    const pitch=dy*LOOK_PER_PIXEL*this.feel.sensitivity*this.lookScale;
    this.pitchGoal+=pitch;this.pulledDown(pitch);
    this.holdPitch();
  }
  /** Aiming down the sights: 0-1 (eased by the gun), framed for a long gun or a pistol. The saved view and distance are never touched. */
  aim(blend:number,profile:'rifle'|'pistol'='rifle'):void {this.aimBlend=clamp(Number.isFinite(blend)?blend:0,0,1);this.aimProfile=profile;}
  /** Through a scope: 0-1, the view moving into the eyes (or to `point`), still looking along the aim. */
  scope(blend:number,point?:pc.Vec3):void {
    this.scopeBlend=clamp(Number.isFinite(blend)?blend:0,0,1);
    if(point){this.scopePoint.copy(point);this.scopePointSet=true;}else this.scopePointSet=false;
    if(this.scopeBlend>0)this.holdPitch();
  }
  /** A stick's turn (radians, in the rig's angles: yaw up turns left, pitch up looks down), eased like the mouse's. */
  look(dYaw:number,dPitch:number):void {
    if(!Number.isFinite(dYaw)||!Number.isFinite(dPitch))return;
    if(dYaw||dPitch){this.focusSet=false;this.cause="look";}
    this.sinceDrag=0;this.yawGoal+=dYaw;this.pitchGoal+=dPitch;this.pulledDown(dPitch);this.holdPitch();
  }
  /** Aim assistance: turns the view now, goals and all, so the easing adds no lag behind what it follows. */
  nudge(dYaw:number,dPitch:number):void {
    if(!Number.isFinite(dYaw)||!Number.isFinite(dPitch))return;
    this.note("nudge",dYaw,dPitch);this.yaw+=dYaw;this.yawGoal+=dYaw;this.yawGoalBefore+=dYaw;this.pitch+=dPitch;this.pitchGoal+=dPitch;this.holdPitch();
  }
  /** A shot's kick: up and to the right (radians); `recover` of it comes back once the shooting stops (less what the player pulled down). */
  recoil(up:number,side:number,recover=0):void {
    if(!Number.isFinite(up)||!Number.isFinite(side))return;
    this.kickPitch+=up;this.kickYaw+=side;this.backPitch+=up*clamp(recover,0,1);this.backYaw+=side*clamp(recover,0,1);this.sinceKick=0;
  }
  /** The weapon framing, as the settings have it (the same object again costs nothing). */
  tuneAim(tune:AimCamera):void {if(tune!==this.aimTuneSource){this.aimTuneSource=tune;this.aimTune=readAimCamera(tune);}}
  /**
   * Going into the aim (or out of it) the view moves (closer, to the side, higher) but its turn stays: the middle of the screen would land somewhere else.
   * While a point is held the view turns, frame by frame, to keep that point in the middle; undefined lets go. The player's own turn lets go too.
   */
  holdAim(point?:{x:number;y:number;z:number}|readonly [number,number,number]):void {
    if(!point){this.focusSet=false;return;}
    if(Array.isArray(point))this.focus.set(point[0]!,point[1]!,point[2]!);else {const p=point as {x:number;y:number;z:number};this.focus.set(p.x,p.y,p.z);}
    this.focusSet=Number.isFinite(this.focus.x)&&Number.isFinite(this.focus.y)&&Number.isFinite(this.focus.z);
  }
  get holdingAim():boolean {return this.focusSet;}
  /** H / R3: the other shoulder. */
  swapShoulder():void {this.setSide(this.sideChosen===1?-1:1);}
  setSide(side:1|-1):void {this.sideChosen=this.side=side;}
  /** Pulling down against the climb counts as recovery already made. */
  private pulledDown(pitch:number):void {if(pitch>0&&this.backPitch>0)this.backPitch=Math.max(0,this.backPitch-pitch);}
  /** The kicks reach the view at once (no easing lag); what is given back returns to the goals, gently. */
  private kick(dt:number):void {
    if(this.kickPitch||this.kickYaw){
      const share=ease(KICK_RATE,dt),up=this.kickPitch*share,side=this.kickYaw*share;
      this.kickPitch-=up;this.kickYaw-=side;
      if(Math.abs(this.kickPitch)<1e-5)this.kickPitch=0;
      if(Math.abs(this.kickYaw)<1e-5)this.kickYaw=0;
      this.nudge(-side,-up);
    }
    this.sinceKick+=dt;
    if(this.sinceKick>RECOVER_AFTER&&(this.backPitch||this.backYaw)){
      const share=ease(RECOVER_RATE,dt),up=this.backPitch*share,side=this.backYaw*share;
      this.backPitch-=up;this.backYaw-=side;
      if(Math.abs(this.backPitch)<1e-5)this.backPitch=0;
      if(Math.abs(this.backYaw)<1e-5)this.backYaw=0;
      this.pitchGoal+=up;this.yawGoal+=side;this.holdPitch();
    }
  }
  /** Turns the view to look along `heading` (the camera goes to the opposite side), by the short way round; the chase does not undo it at once. */
  face(heading:number):void {
    this.note("face");this.yawGoal+=wrapped(heading+Math.PI-this.yawGoal);this.sinceDrag=0;
  }
  /** A view someone else places (the selfie): the mouse still turns the heading and elevation that movement follows. */
  turn(dt:number):void {
    this.yaw=trail(this.yaw,this.yawGoal,this.yawGoalBefore,TURN_RATE,dt);this.yawGoalBefore=this.yawGoal;
    this.pitch+=(this.pitchGoal-this.pitch)*ease(TURN_RATE,dt);
  }
  /** Third person keeps the horizon: back from first person's free turns on the nearest turn, without unwinding them on screen. */
  private holdPitch():void {
    const scoped=this.scopeBlend>0;
    if(this.mode!=='third'&&!scoped)return;
    const turns=Math.round(this.pitchGoal/(Math.PI*2))*Math.PI*2;
    // Through a scope the view never loops over (first person can); a weapon out may look higher.
    this.pitchGoal=scoped?clamp(this.pitchGoal-turns,-SCOPE_PITCH,this.mode==='third'?PITCH_DOWN:SCOPE_PITCH):clamp(this.pitchGoal-turns,this.upLimit,PITCH_DOWN);this.pitch-=turns;
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
    if(Math.abs(turn)<FOLLOW_WIDEST){this.note("recentre");this.yawGoal+=turn*ease(FOLLOW_TURN*this.stride*pace,dt);}
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
    // The look-up limit is wider armed; putting the weapon away slides it back (a jump of half a radian in one frame was the camera "teleporting").
    const upWanted=this.armed?ARMED_PITCH_UP:PITCH_UP;
    if(this.upLimit!==upWanted){this.upLimit+=clamp(upWanted-this.upLimit,-dt*UP_SLIDE,dt*UP_SLIDE);this.holdPitch();}
    this.armedBefore=this.armed;
    // Armed, the view stays where the player put it: no swing behind the body.
    if(this.mode==='third'&&!riding&&!this.armed&&!this.aimBlend)this.recentre(dt,subject.facing,pace);
    this.kick(dt);
    this.armedBlend+=((this.armed&&!riding?1:0)-this.armedBlend)*ease(ARMED_FRAME_RATE,dt);
    if(Math.abs(this.armedBlend-Math.round(this.armedBlend))<.002)this.armedBlend=Math.round(this.armedBlend);
    // With the weapon only out, its own height; aiming, the aim's (both measured from the view without a weapon).
    const tune=this.aimTune,hand=this.armedBlend*(1-this.aimBlend),lift=tune.armedRise*hand+tune.rise*this.aimBlend,turn=TURN_RATE*pace*(1+(this.armed?ARMED_TURN:0)+tune.turn*this.aimBlend);
    this.yaw=trail(this.yaw,this.yawGoal,this.yawGoalBefore,turn,dt);this.yawGoalBefore=this.yawGoal;
    this.pitch+=(this.pitchGoal-this.pitch)*ease(turn,dt);
    this.inside+=((this.mode==='first'?1:0)-this.inside)*ease(7,dt);
    if(Math.abs(this.inside-Math.round(this.inside))<.002)this.inside=Math.round(this.inside);
    this.boomLength+=(this.distanceGoal-this.boomLength)*ease(ZOOM_RATE_S*pace,dt);
    // The frame is measured off the head joint, wherever each skeleton has it and whatever the clip does with it (seated, fallen).
    this.stature+=((subject.head?clamp(subject.head.y-feet.y,STATURE_LEAST,STATURE_MOST):STATURE)-this.stature)*ease(STATURE_RATE,dt);
    // Behind the player: the point it looks at trails the body a little; far away (a respawn, a teleport) it jumps.
    goal.set(feet.x,feet.y+this.stature-HEAD_TO_SHOULDERS+this.feel.height+lift,feet.z);
    const tight=1+tune.follow*this.aimBlend;
    if(this.target.distance(goal)>8)this.target.copy(goal);
    else this.target.set(trail(this.target.x,goal.x,this.targetBefore.x,FOLLOW_RATE*pace*tight,dt),trail(this.target.y,goal.y,this.targetBefore.y,(riding?FOLLOW_RATE:FOLLOW_RATE_UP)*pace*tight,dt),trail(this.target.z,goal.z,this.targetBefore.z,FOLLOW_RATE*pace*tight,dt));
    this.targetBefore.copy(goal);
    const flat=Math.cos(this.pitch);
    a.set(Math.sin(this.yaw)*flat,Math.sin(this.pitch),Math.cos(this.yaw)*flat);
    right.set(Math.cos(this.yaw),0,-Math.sin(this.yaw));
    // The eyes: just above and in front of the head joint, steadied a little (the clips bob the head).
    if(subject.head)goal.set(subject.head.x+Math.sin(subject.facing)*.1,subject.head.y+.09,subject.head.z+Math.cos(subject.facing)*.1);
    else goal.set(feet.x,feet.y+EYE_HEIGHT,feet.z);
    if(!this.eyeSet||this.eye.distance(goal)>1){this.eye.copy(goal);this.eyeSet=true;}
    else this.eye.lerp(this.eye,goal,ease(25,dt));
    // Off the chosen shoulder, always (no side change nor fold to the middle by itself); on a bike straight behind.
    // With a weapon the offset is the tuning's (AimCamera) and the swap is quick.
    const armed=this.armed||this.aimBlend>0,offset=tune.armedShoulder+(tune.shoulder-tune.armedShoulder)*this.aimBlend;
    const shoulderGoal=riding?0:this.side*(armed?offset:SHOULDER_SIDE);
    this.shoulder+=(shoulderGoal-this.shoulder)*ease(armed&&!riding?SWAP_RATE:3,dt);
    const back=(this.rushing*RUSH_BACK+this.stride*this.stride*RUN_BACK)*(1-this.aimBlend);
    const held=this.boomLength+(tune.armedBoom-this.boomLength)*this.armedBlend+back;
    const boom=held+((this.aimProfile==='pistol'?tune.boomPistol:tune.boomRifle)-held)*this.aimBlend;
    wanted.copy(this.target).add(c.copy(a).mulScalar(boom)).add(c.copy(right).mulScalar(this.shoulder));
    // Aiming, the view stays near the shoulder's height whatever the elevation: it still looks along `a`, the crosshair is the view's own middle.
    if(this.aimBlend)wanted.y-=a.y*boom*tune.level*this.aimBlend;
    const w=this.inside*this.inside*(3-2*this.inside);
    // From the body itself, not from the point trailing it: the body is never inside a wall, a point catching up with it can be.
    body.set(feet.x,feet.y+this.stature-HEAD_TO_SHOULDERS,feet.z);
    if(this.inside>=1){this.opening=1;this.openingSpeed=0;this.wantedSet=false;}
    else {
      this.clear(dt,body,wanted,feet.y,pace,riding);
      // The view stays on the chosen shoulder, armed or not: only the player moves it (H / R3, the settings). A wall at that side shortens the boom.
      this.side=this.sideChosen;
    }
    const behind=this.opening<1?b.lerp(body,wanted,this.opening):b.copy(wanted);
    this.fromHead=behind.distance(body);
    this.headClose=this.fromHead<(this.headClose?HEAD_SHOWS:HEAD_HIDES);
    // Both views share their direction. Rotating the up vector with the orbit avoids flips and singularities at the poles.
    a.mulScalar(-1);
    up.set(-Math.sin(this.yaw)*Math.sin(this.pitch),Math.cos(this.pitch),-Math.cos(this.yaw)*Math.sin(this.pitch));
    const position=b.lerp(behind,this.eye,w);
    // Through a scope: into the eyes, along the same aim.
    if(this.scopeBlend>0)position.lerp(position,this.scopePointSet?this.scopePoint:this.eye,this.scopeBlend*this.scopeBlend*(3-2*this.scopeBlend));
    // Holding a point (holdAim): from wherever the view is now, it looks straight at it, and the turn the player has is set to match.
    if(this.focusSet&&this.mode==='third'){
      probe.copy(this.focus).sub(position);const length=probe.length();
      if(length>.5){
        let dYaw=wrapped(Math.atan2(-probe.x,-probe.z)-this.yaw),dPitch=Math.asin(clamp(-probe.y/length,-1,1))-this.pitch;
        // The held point was picked from the view as it was; as the boom closes in, a near one (a wall just ahead of the old view) ends up beside or
        // behind the new view, and turning to it is a half turn. No hold asks for more than this: past it, let go and keep the heading.
        if(Math.abs(dYaw)>HOLD_MOST||Math.abs(dPitch)>HOLD_MOST){this.focusSet=false;this.note('holdAim-released',dYaw,dPitch);}
        else {
        this.cause='holdAim';
        // A few degrees a frame at most: the held point only has to follow the camera's move (a metre or two) and a near one asks for a lot more.
        dYaw=clamp(dYaw,-HOLD_STEP,HOLD_STEP);dPitch=clamp(dPitch,-HOLD_STEP,HOLD_STEP);
        this.yaw+=dYaw;this.yawGoal+=dYaw;this.yawGoalBefore+=dYaw;this.pitch+=dPitch;this.pitchGoal+=dPitch;
        a.set(-Math.sin(this.yaw)*Math.cos(this.pitch),-Math.sin(this.pitch),-Math.cos(this.yaw)*Math.cos(this.pitch));
        up.set(-Math.sin(this.yaw)*Math.sin(this.pitch),Math.cos(this.pitch),-Math.cos(this.yaw)*Math.sin(this.pitch));
        }
      }
    }
    this.watchJumps(dt,position);
    if(this.shaking>.0005){
      this.shakeTime+=dt;this.shaking*=Math.exp(-SHAKE_FADE*dt);
      position.x+=Math.sin(this.shakeTime*67)*this.shaking;position.y+=Math.sin(this.shakeTime*83+1)*this.shaking;position.z+=Math.sin(this.shakeTime*59+2)*this.shaking;
    }
    this.camera.setPosition(position);
    this.camera.lookAt(c.copy(position).add(a),up);
    if(subject.roll)this.camera.rotateLocal(Math.sin(subject.elapsed*.7)*subject.roll*.3,0,Math.sin(subject.elapsed*.45)*subject.roll);
    // The x-ray opens while a solid hides part of the body from the camera, and closes once it is clear.
    let hidden=false;
    if(w<.5&&this.scopeBlend<.5)for(const height of SIGHT){
      centre.set(feet.x,feet.y+height,feet.z);
      if(sightBlocked(position,centre)){hidden=true;break;}
    }
    this.hiddenFor=hidden?this.hiddenFor+dt:0;
    if(hidden&&this.hiddenFor<(subject.xrayAfter??0))hidden=false;
    this.xrayOpen+=((hidden?1:0)-this.xrayOpen)*ease(hidden?8:4,dt);
    if(this.xrayOpen<.002)this.xrayOpen=0;
    centre.set(feet.x,feet.y+BODY_CENTRE,feet.z);
    if(subject.clearance)centre.add(c.copy(position).sub(centre).normalize().mulScalar(subject.clearance));
    this.xray.set(position,centre,WINDOW_RADIUS,this.xrayOpen*(1-Math.max(w,this.scopeBlend)),feet.y+FLOOR_KEPT);
  }

  // ---- Monitor: every frame the view turns or the camera moves further than a hand or a boom can (see `jumps`, window.__cameraJumps). ----
  /** The writers that touched the view since the last frame (drag, look, nudge, holdAim, face, recentre, chase, kick), the last frame's view, and the log. */
  private cause='';
  private readonly causes=new Set<string>();
  private seen?:{yaw:number;pitch:number;at:pc.Vec3;boom:number};
  readonly jumps:Array<Record<string,unknown>>=[];
  /** Called with each recorded jump (a place to send it from). */
  onJump?:(event:Record<string,unknown>)=>void;
  private note(cause:string,dYaw=0,dPitch=0):void {this.causes.add(cause);if(dYaw||dPitch)this.causes.add(`${cause}:${dYaw.toFixed(2)}/${dPitch.toFixed(2)}`);}
  private watchJumps(dt:number,position:pc.Vec3):void {
    if(this.cause){this.causes.add(this.cause);this.cause='';}
    const before=this.seen;
    this.seen={yaw:this.yaw,pitch:this.pitch,at:position.clone(),boom:this.opening};
    if(!before||dt<=0||dt>.1)return;
    const turn=Math.abs(wrapped(this.yaw-before.yaw)),tilt=Math.abs(this.pitch-before.pitch),moved=position.distance(before.at);
    if(turn>JUMP_TURN||tilt>JUMP_TURN||moved>JUMP_METRES){
      const event={at:new Date().toISOString(),turn:+turn.toFixed(2),tilt:+tilt.toFixed(2),moved:+moved.toFixed(2),dt:+dt.toFixed(4),
        causes:[...this.causes],openingBefore:+before.boom.toFixed(3),...this.telemetry()};
      this.jumps.push(event);if(this.jumps.length>40)this.jumps.shift();
      try{console.warn('[camera] jump',event);}catch{/* No console. */}
      try{(globalThis as {__cameraJumps?:unknown}).__cameraJumps=this.jumps;localStorage.setItem('bar.cameraJumps',JSON.stringify(this.jumps));}catch{/* Storage may be blocked. */}
      try{this.onJump?.(event);}catch{/* A listener never breaks the camera. */}
    }
    this.causes.clear();
  }

  /** Not following the player (watching a screen, at the door): no window; the next follow starts from where it is. */
  idle():void {this.xrayOpen=0;this.xray.set(undefined,undefined,0,0,0);}

  telemetry() {
    const p=this.camera.getPosition();
    return {mode:this.mode,distance:this.distance,inside:+this.inside.toFixed(3),boom:+this.boomLength.toFixed(3),reach:this.reach,xray:+this.xrayOpen.toFixed(3),yaw:+this.yaw.toFixed(3),pitch:+this.pitch.toFixed(3),position:[+p.x.toFixed(3),+p.y.toFixed(3),+p.z.toFixed(3)],
      opening:+this.opening.toFixed(3),fromHead:+this.fromHead.toFixed(3),shoulder:+this.shoulder.toFixed(3),stature:+this.stature.toFixed(3),stride:+this.stride.toFixed(3),
      armed:this.armed,aim:+this.aimBlend.toFixed(3),scope:+this.scopeBlend.toFixed(3),side:this.side,lookScale:+this.lookScale.toFixed(3)};
  }
}
