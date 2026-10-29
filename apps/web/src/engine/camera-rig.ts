import * as pc from 'playcanvas';
import {cameraFraction,sightBlocked} from '@bar/shared';
import {CameraXray} from './camera-xray';

/** The local player's views: through their own eyes, or from behind at three distances. */
export type CameraMode='first'|'near'|'default'|'far';
/** From the eyes outwards: the mouse wheel steps along it, Q goes round it. */
export const CAMERA_MODES:readonly CameraMode[]=['first','near','default','far'];
export const CAMERA_LABELS:Readonly<Record<CameraMode,string>>={first:'Primeira pessoa',near:'Terceira pessoa · próxima',default:'Terceira pessoa · padrão',far:'Terceira pessoa · longe'};
export const isCameraMode=(value:unknown):value is CameraMode=>CAMERA_MODES.includes(value as CameraMode);

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

// Third person: the boom's length (metres) and the height above the feet it looks at (the near view looks over the shoulders).
const BOOMS:Record<Exclude<CameraMode,'first'>,{length:number;height:number}>={near:{length:3,height:1.45},default:{length:6.4,height:1.25},far:{length:10.5,height:1.1}};
// Radians: how high over the player the boom may rise; how far up (negative) or down the eyes may look in first person.
const PITCH={min:.08,max:1.2},LOOK={min:-1.25,max:1.3};
// A box avatar (its skin still loading) has no head joint: the eyes are this high.
const EYE_HEIGHT=1.62;
// The x-ray window: around the middle of the body, .8 m to either side (and taller: camera-xray.ts); the floor under the feet is never cut.
const BODY_CENTRE=.95,WINDOW_RADIUS=.8,FLOOR_KEPT=.12;
// Points of the body the camera must see; when a solid hides any of them, the window opens.
const SIGHT=[1.6,1.1,.6];
// Wheel travel (pixels) per view step: one notch of a mouse, a short swipe on a touchpad.
const WHEEL_STEP=60;
/** Exponential smoothing: the part of the way covered in `dt` seconds at `rate` per second. */
const ease=(rate:number,dt:number)=>1-Math.exp(-rate*dt);
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const turn=(from:number,to:number)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));

/**
 * The camera of the local player. Every move is smoothed: the mouse turns it a little behind the hand, a change of view
 * glides (into the eyes too), and a wall pulls the boom in within a few frames and lets it out slowly. Only the building
 * stops the boom; furniture and props do not, and whatever hides the player is cut away by the x-ray (camera-xray.ts).
 */
export class CameraRig {
  mode:CameraMode='default';
  /** Heading of the view (radians): movement and the listener follow it. The camera sits at +sin/+cos, looking back. */
  yaw=.15;
  private yawGoal=.15;
  /** Third person: how high the boom rises over the player (radians). */
  pitch=.55;
  private pitchGoal=.55;
  /** First person: how far down the eyes look (radians, negative up). */
  private look=.1;
  private lookGoal=.1;
  /** 0 behind the player, 1 in their eyes. */
  private inside=0;
  /** The last third-person view: first person glides out of and back into it. */
  private outside:Exclude<CameraMode,'first'>='default';
  private boomLength=BOOMS.default.length;
  private height=BOOMS.default.height;
  /** The boom as drawn, after the walls. */
  private boom=BOOMS.default.length;
  private readonly target=new pc.Vec3(0,1.2,3.5);
  private readonly eye=new pc.Vec3();
  private eyeSet=false;
  private xrayOpen=0;
  private wheelTravel=0;
  private readonly xray:CameraXray;
  private readonly temp={a:new pc.Vec3(),b:new pc.Vec3(),c:new pc.Vec3(),goal:new pc.Vec3(),centre:new pc.Vec3()};

  constructor(private readonly camera:pc.Entity,device:pc.GraphicsDevice) {this.xray=new CameraXray(device);}

  /** In the eyes (or nearly): the head is hidden, as are the name and the ring at the feet. */
  get firstPerson():boolean {return this.inside>.7;}
  /** Length of the third-person boom chosen now (before the walls). */
  get reach():number {return BOOMS[this.outside].length;}

  setMode(mode:CameraMode):void {
    if(mode===this.mode)return;
    // Into the eyes, they look where the camera was looking; out of them, the boom comes up behind.
    if(mode==='first')this.look=this.lookGoal=clamp(this.pitch*.35,LOOK.min,LOOK.max);
    else this.outside=mode;
    this.mode=mode;
  }
  /** Q: the next view round CAMERA_MODES. */
  cycle():CameraMode {this.setMode(CAMERA_MODES[(CAMERA_MODES.indexOf(this.mode)+1)%CAMERA_MODES.length]!);return this.mode;}
  /** The mouse wheel: rolling towards the screen steps in, away steps out, one view per notch. Returns the new view, if any. */
  wheel(deltaY:number):CameraMode|undefined {
    if(Math.sign(deltaY)!==Math.sign(this.wheelTravel))this.wheelTravel=0;
    this.wheelTravel+=deltaY;
    if(Math.abs(this.wheelTravel)<WHEEL_STEP)return;
    const step=Math.sign(this.wheelTravel);this.wheelTravel=0;
    const next=CAMERA_MODES[clamp(CAMERA_MODES.indexOf(this.mode)+step,0,CAMERA_MODES.length-1)]!;
    if(next===this.mode)return;
    this.setMode(next);return next;
  }
  /** Dragging the mouse: sideways turns, up and down looks up and down (the boom rises as the view looks down). */
  drag(dx:number,dy:number):void {
    this.yawGoal-=dx*.006;
    if(this.mode==='first')this.lookGoal=clamp(this.lookGoal+dy*.004,LOOK.min,LOOK.max);
    else this.pitchGoal=clamp(this.pitchGoal+dy*.004,PITCH.min,PITCH.max);
  }
  /** Swings the view to a heading (radians), smoothly. */
  turnTo(yaw:number):void {this.yawGoal=this.yaw+turn(this.yaw,yaw);}

  /** Places the camera behind or in the eyes of `subject`, and sets the x-ray window for this frame. */
  follow(dt:number,subject:CameraSubject):void {
    const {a,b,c,goal,centre}=this.temp,{feet}=subject;
    this.yaw+=turn(this.yaw,this.yawGoal)*ease(18,dt);
    this.pitch+=(this.pitchGoal-this.pitch)*ease(18,dt);
    this.look+=(this.lookGoal-this.look)*ease(18,dt);
    this.inside+=((this.mode==='first'?1:0)-this.inside)*ease(7,dt);
    if(Math.abs(this.inside-Math.round(this.inside))<.002)this.inside=Math.round(this.inside);
    const boom=BOOMS[this.outside];
    this.boomLength+=(boom.length-this.boomLength)*ease(5,dt);
    this.height+=(boom.height-this.height)*ease(5,dt);
    // Behind the player: the point it looks at trails the body a little; far away (a respawn, a teleport) it jumps.
    goal.set(feet.x,feet.y+this.height,feet.z);
    if(this.target.distance(goal)>8){this.target.copy(goal);this.boom=0;}
    else this.target.lerp(this.target,goal,ease(10,dt));
    const flat=Math.cos(this.pitch);
    a.set(Math.sin(this.yaw)*flat,Math.sin(this.pitch),Math.cos(this.yaw)*flat);
    b.copy(a).mulScalar(this.boomLength).add(this.target);
    const free=cameraFraction(this.target,b,true)*this.boomLength;
    // Into a wall within a few frames (the x-ray covers them); back out slowly once it is clear.
    this.boom+=(free-this.boom)*ease(free<this.boom?30:3,dt);
    const behind=b.copy(a).mulScalar(this.boom).add(this.target);
    // The eyes: just above and in front of the head joint, steadied a little (the clips bob the head).
    if(subject.head)goal.set(subject.head.x+Math.sin(subject.facing)*.1,subject.head.y+.09,subject.head.z+Math.cos(subject.facing)*.1);
    else goal.set(feet.x,feet.y+EYE_HEIGHT,feet.z);
    if(!this.eyeSet||this.eye.distance(goal)>1){this.eye.copy(goal);this.eyeSet=true;}
    else this.eye.lerp(this.eye,goal,ease(25,dt));
    const w=this.inside*this.inside*(3-2*this.inside);
    // Where it looks: at the player from behind, along the eyes' heading from inside, turning between the two.
    c.set(-Math.sin(this.yaw)*Math.cos(this.look),-Math.sin(this.look),-Math.cos(this.yaw)*Math.cos(this.look));
    a.copy(this.target).sub(behind).normalize().lerp(a,c,w).normalize();
    const position=b.lerp(behind,this.eye,w);
    this.camera.setPosition(position);
    this.camera.lookAt(c.copy(position).add(a));
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
    return {mode:this.mode,inside:+this.inside.toFixed(3),boom:+this.boom.toFixed(3),reach:this.reach,xray:+this.xrayOpen.toFixed(3),yaw:+this.yaw.toFixed(3),pitch:+this.pitch.toFixed(3),position:[+p.x.toFixed(3),+p.y.toFixed(3),+p.z.toFixed(3)]};
  }
}
