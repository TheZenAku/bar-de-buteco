import * as pc from 'playcanvas';
import {sightBlocked} from '@bar/shared';
import {CameraXray} from './camera-xray';

/** First person, or a freely positioned orbit at the distance chosen by the player. */
export type CameraMode='first'|'third';
export const CAMERA_MODES:readonly CameraMode[]=['first','third'];
export const CAMERA_LABELS:Readonly<Record<CameraMode,string>>={first:'Primeira pessoa',third:'Terceira pessoa'};
export const isCameraMode=(value:unknown):value is CameraMode=>CAMERA_MODES.includes(value as CameraMode);
export const DEFAULT_CAMERA_DISTANCE=6.4;
/** A saved third-person distance must be positive and finite; there is no preset or maximum zoom. */
export const readCameraDistance=(value:unknown,fallback=DEFAULT_CAMERA_DISTANCE):number=>
  typeof value==='number'&&Number.isFinite(value)&&value>0?value:fallback;

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

const TARGET_HEIGHT=1.25;
// As zoom approaches the eyes, lift the orbit's pivot out of the chest; keep the full chosen radius.
const EYE_ZOOM=1;
// A box avatar (its skin still loading) has no head joint: the eyes are this high.
const EYE_HEIGHT=1.62;
// The x-ray window: around the middle of the body, .8 m to either side (and taller: camera-xray.ts); the floor under the feet is never cut.
const BODY_CENTRE=.95,WINDOW_RADIUS=.8,FLOOR_KEPT=.12;
// Points of the body the camera must see; when a solid hides any of them, the window opens.
const SIGHT=[1.6,1.1,.6];
// Continuous wheel travel: fine control near the player, proportional zoom further out, including fractional pixels.
const ZOOM_RATE=.001;
// On a bike the view swings behind it this fast (per second), this low (radians), this long (seconds) after the mouse let go.
const CHASE_TURN=3.2,CHASE_PITCH=.3,CHASE_AFTER_DRAG=1.5;
// At full speed the view falls back this many metres behind the bike.
const RUSH_BACK=.5;
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

/** How fast a knock to the camera dies away (per second). */
const SHAKE_FADE=13;
/**
 * The camera of the local player. Zoom and unrestricted rotation follow the hand smoothly. Geometry never changes
 * the chosen distance or angle; whatever hides the player is cut away by the visual x-ray (camera-xray.ts).
 */
export class CameraRig {
  mode:CameraMode='third';
  /** Heading of the view (radians): movement and the listener follow it. The camera sits at +sin/+cos, looking back. */
  yaw=.15;
  private yawGoal=.15;
  /** Elevation in radians, shared by both views and unrestricted through full vertical turns. */
  pitch=.55;
  private pitchGoal=.55;
  /** 0 behind the player, 1 in their eyes. */
  private inside=0;
  /** First person remembers the exact last third-person distance. */
  private distanceGoal=DEFAULT_CAMERA_DISTANCE;
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
  private readonly temp={a:new pc.Vec3(),b:new pc.Vec3(),c:new pc.Vec3(),up:new pc.Vec3(),goal:new pc.Vec3(),centre:new pc.Vec3()};

  constructor(private readonly camera:pc.Entity,device:pc.GraphicsDevice) {this.xray=new CameraXray(device);}

  /** In the eyes (or nearly): the head is hidden, as are the name and the ring at the feet. */
  get firstPerson():boolean {return this.inside>.7||this.boomLength<.5;}
  /** Exact last third-person distance, retained while looking through the eyes. */
  get reach():number {return this.distanceGoal;}
  get distance():number {return this.mode==='first'?0:this.distanceGoal;}

  setMode(mode:CameraMode):void {
    this.mode=mode;
  }
  /** An exact distance in metres. Zero enters first person without forgetting the previous zoom. */
  setDistance(distance:number):void {
    if(!Number.isFinite(distance))return;
    if(distance<=0){this.mode='first';return;}
    this.distanceGoal=distance;
    this.mode='third';
  }
  /** Q: the next view round CAMERA_MODES. */
  cycle():CameraMode {this.setMode(CAMERA_MODES[(CAMERA_MODES.indexOf(this.mode)+1)%CAMERA_MODES.length]!);return this.mode;}
  /** Every wheel delta adjusts the distance; no notches, mode presets or accumulated threshold. */
  wheel(deltaY:number):boolean {
    if(!Number.isFinite(deltaY)||deltaY===0)return false;
    const distance=Math.max(0,(this.distance+1)*Math.exp(deltaY*ZOOM_RATE)-1);
    if(!Number.isFinite(distance)||distance===this.distance)return false;
    this.setDistance(distance);return true;
  }
  /** Dragging the mouse: sideways turns, up and down looks up and down (the boom rises as the view looks down). */
  drag(dx:number,dy:number):void {
    this.sinceDrag=0;
    this.yawGoal-=dx*.006;
    this.pitchGoal+=dy*.004;
  }

  /** Getting on a bike: third person, behind it (chase); getting off: the view the player had. */
  ride(on:boolean):void {
    if(on&&!this.beforeRide){this.beforeRide={mode:this.mode,pitch:this.pitchGoal};this.mode='third';this.sinceDrag=CHASE_AFTER_DRAG;}
    else if(!on&&this.beforeRide){this.mode=this.beforeRide.mode;this.pitchGoal=this.beforeRide.pitch;this.beforeRide=undefined;}
  }
  /** Swings the view behind the bike's heading (radians), unless the mouse has just looked somewhere else. */
  chase(heading:number,dt:number):void {
    this.sinceDrag+=dt;
    const turned=this.headingBefore===undefined?0:Math.atan2(Math.sin(heading-this.headingBefore),Math.cos(heading-this.headingBefore));
    this.headingBefore=heading;
    if(this.sinceDrag<CHASE_AFTER_DRAG)return;
    // In unwrapped angles: behind the heading, on the turn nearest to the view.
    const behind=heading+Math.PI,turn=Math.atan2(Math.sin(behind-this.yawGoal),Math.cos(behind-this.yawGoal));
    this.yawGoal=trail(this.yawGoal,this.yawGoal+turn,this.yawGoal+turn-turned,CHASE_TURN,dt);
    this.pitchGoal+=(CHASE_PITCH-this.pitchGoal)*ease(2,dt);
  }

  /** The view pulling back at speed, 0 to 1 (BarScene eases it): added to the chosen distance, never changing it. */
  rush(amount:number):void {this.rushing=amount;}

  /** A knock: the view shakes this far (metres) for a moment. Harder ones win over what is left of the last. */
  shake(metres:number):void {this.shaking=Math.max(this.shaking,metres);}

  /** Places the camera behind or in the eyes of `subject`, and sets the x-ray window for this frame. */
  follow(dt:number,subject:CameraSubject):void {
    const {a,b,c,up,goal,centre}=this.temp,{feet}=subject;
    this.yaw=trail(this.yaw,this.yawGoal,this.yawGoalBefore,18,dt);this.yawGoalBefore=this.yawGoal;
    this.pitch+=(this.pitchGoal-this.pitch)*ease(18,dt);
    this.inside+=((this.mode==='first'?1:0)-this.inside)*ease(7,dt);
    if(Math.abs(this.inside-Math.round(this.inside))<.002)this.inside=Math.round(this.inside);
    this.boomLength+=(this.distanceGoal-this.boomLength)*ease(12,dt);
    // Behind the player: the point it looks at trails the body a little; far away (a respawn, a teleport) it jumps.
    goal.set(feet.x,feet.y+TARGET_HEIGHT,feet.z);
    if(this.target.distance(goal)>8)this.target.copy(goal);
    else this.target.set(trail(this.target.x,goal.x,this.targetBefore.x,10,dt),trail(this.target.y,goal.y,this.targetBefore.y,10,dt),trail(this.target.z,goal.z,this.targetBefore.z,10,dt));
    this.targetBefore.copy(goal);
    const flat=Math.cos(this.pitch);
    a.set(Math.sin(this.yaw)*flat,Math.sin(this.pitch),Math.cos(this.yaw)*flat);
    // The eyes: just above and in front of the head joint, steadied a little (the clips bob the head).
    if(subject.head)goal.set(subject.head.x+Math.sin(subject.facing)*.1,subject.head.y+.09,subject.head.z+Math.cos(subject.facing)*.1);
    else goal.set(feet.x,feet.y+EYE_HEIGHT,feet.z);
    if(!this.eyeSet||this.eye.distance(goal)>1){this.eye.copy(goal);this.eyeSet=true;}
    else this.eye.lerp(this.eye,goal,ease(25,dt));
    const near=Math.max(0,1-this.boomLength/EYE_ZOOM),nearEyes=near*near*(3-2*near);
    const behind=b.lerp(this.target,this.eye,nearEyes).add(c.copy(a).mulScalar(this.boomLength+this.rushing*RUSH_BACK));
    const w=this.inside*this.inside*(3-2*this.inside);
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
    return {mode:this.mode,distance:this.distance,inside:+this.inside.toFixed(3),boom:+this.boomLength.toFixed(3),reach:this.reach,xray:+this.xrayOpen.toFixed(3),yaw:+this.yaw.toFixed(3),pitch:+this.pitch.toFixed(3),position:[+p.x.toFixed(3),+p.y.toFixed(3),+p.z.toFixed(3)]};
  }
}
