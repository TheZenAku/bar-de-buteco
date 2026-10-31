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
/** Exponential smoothing: the part of the way covered in `dt` seconds at `rate` per second. */
const ease=(rate:number,dt:number)=>1-Math.exp(-rate*dt);

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
  private readonly eye=new pc.Vec3();
  private eyeSet=false;
  private xrayOpen=0;
  private readonly xray:CameraXray;
  /** Riding a bike: the view and the elevation to give back getting off, and how long ago the mouse last turned the view. */
  private beforeRide?:{mode:CameraMode;pitch:number};
  private sinceDrag=0;
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
    if(this.sinceDrag<CHASE_AFTER_DRAG)return;
    const behind=heading+Math.PI,turn=Math.atan2(Math.sin(behind-this.yawGoal),Math.cos(behind-this.yawGoal));
    this.yawGoal+=turn*ease(CHASE_TURN,dt);
    this.pitchGoal+=(CHASE_PITCH-this.pitchGoal)*ease(2,dt);
  }

  /** Places the camera behind or in the eyes of `subject`, and sets the x-ray window for this frame. */
  follow(dt:number,subject:CameraSubject):void {
    const {a,b,c,up,goal,centre}=this.temp,{feet}=subject;
    this.yaw+=(this.yawGoal-this.yaw)*ease(18,dt);
    this.pitch+=(this.pitchGoal-this.pitch)*ease(18,dt);
    this.inside+=((this.mode==='first'?1:0)-this.inside)*ease(7,dt);
    if(Math.abs(this.inside-Math.round(this.inside))<.002)this.inside=Math.round(this.inside);
    this.boomLength+=(this.distanceGoal-this.boomLength)*ease(12,dt);
    // Behind the player: the point it looks at trails the body a little; far away (a respawn, a teleport) it jumps.
    goal.set(feet.x,feet.y+TARGET_HEIGHT,feet.z);
    if(this.target.distance(goal)>8)this.target.copy(goal);
    else this.target.lerp(this.target,goal,ease(10,dt));
    const flat=Math.cos(this.pitch);
    a.set(Math.sin(this.yaw)*flat,Math.sin(this.pitch),Math.cos(this.yaw)*flat);
    // The eyes: just above and in front of the head joint, steadied a little (the clips bob the head).
    if(subject.head)goal.set(subject.head.x+Math.sin(subject.facing)*.1,subject.head.y+.09,subject.head.z+Math.cos(subject.facing)*.1);
    else goal.set(feet.x,feet.y+EYE_HEIGHT,feet.z);
    if(!this.eyeSet||this.eye.distance(goal)>1){this.eye.copy(goal);this.eyeSet=true;}
    else this.eye.lerp(this.eye,goal,ease(25,dt));
    const near=Math.max(0,1-this.boomLength/EYE_ZOOM),nearEyes=near*near*(3-2*near);
    const behind=b.lerp(this.target,this.eye,nearEyes).add(c.copy(a).mulScalar(this.boomLength));
    const w=this.inside*this.inside*(3-2*this.inside);
    // Both views share their direction. Rotating the up vector with the orbit avoids flips and singularities at the poles.
    a.mulScalar(-1);
    up.set(-Math.sin(this.yaw)*Math.sin(this.pitch),Math.cos(this.pitch),-Math.cos(this.yaw)*Math.sin(this.pitch));
    const position=b.lerp(behind,this.eye,w);
    this.camera.setPosition(position);
    this.camera.lookAt(c.copy(position).add(a),up);
    if(subject.roll)this.camera.rotateLocal(Math.sin(subject.elapsed*.7)*subject.roll*.3,0,Math.sin(subject.elapsed*.45)*subject.roll);
    // The x-ray opens while a solid hides part of the body from the camera, and closes once it is clear.
    let hidden=false;
    if(w<.5)for(const height of SIGHT){
      centre.set(feet.x,feet.y+height,feet.z);
      if(sightBlocked(position,centre)){hidden=true;break;}
    }
    this.xrayOpen+=((hidden?1:0)-this.xrayOpen)*ease(hidden?8:4,dt);
    if(this.xrayOpen<.002)this.xrayOpen=0;
    centre.set(feet.x,feet.y+BODY_CENTRE,feet.z);
    this.xray.set(position,centre,WINDOW_RADIUS,this.xrayOpen*(1-w),feet.y+FLOOR_KEPT);
  }

  /** Not following the player (watching a screen, at the door): no window; the next follow starts from where it is. */
  idle():void {this.xrayOpen=0;this.xray.set(undefined,undefined,0,0,0);}

  telemetry() {
    const p=this.camera.getPosition();
    return {mode:this.mode,distance:this.distance,inside:+this.inside.toFixed(3),boom:+this.boomLength.toFixed(3),reach:this.reach,xray:+this.xrayOpen.toFixed(3),yaw:+this.yaw.toFixed(3),pitch:+this.pitch.toFixed(3),position:[+p.x.toFixed(3),+p.y.toFixed(3),+p.z.toFixed(3)]};
  }
}
