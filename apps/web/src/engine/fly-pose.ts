import * as pc from 'playcanvas';

const BONES=['head','upperarm_l','lowerarm_l','upperarm_r','lowerarm_r','upperleg_l','lowerleg_l','upperleg_r','lowerleg_r','foot_l','foot_r'] as const;
type Bones=Record<typeof BONES[number],pc.Entity>;
const clamp01=(x:number)=>Math.min(1,Math.max(0,x));
const smooth=(x:number)=>{const t=clamp01(x);return t*t*(3-2*t);};
/** Out with a little overshoot, settling back: the body carried past its height by the push, then floating down onto it. */
const outBack=(x:number)=>{const t=clamp01(x),s=1.4;return 1+(s+1)*(t-1)**3+s*(t-1)**2;};

/** The take-off (s): the knees load, then the legs push and the body leaves the floor, then it rises into the hover. */
const LOAD=.16,PUSH=.2,RISE=.62;
/** The landing (s): the knees take the blow fast, then the body stands up slowly. */
const ABSORB=.09,STAND=.6;
/** A leg's thigh or shin (m), for how far the hips drop when the knees bend with the feet planted. */
const SEGMENT=.43;
/** The deepest knee bend (degrees), at crouch 1. */
const KNEE=40;

/**
 * The administrators' flight (B): the whole body leans about the hips, and the limbs are turned over the clip's Idle in the body's own frame
 * (so no rig's bone axes matter). Applied after the animation and restored before the next one, like HeadLookPose.
 * - Take-off: the knees load and the arms go back, the legs push (toes pointed, arms swung up) and the body rises with a little overshoot
 *   (liftY carries the drawn root up with the push, instead of the room's jump of 1.5 m in one frame).
 * - Hovering: upright, a little back, knees soft, hands open at the sides and drifting. Under way: a streamlined line, tilted towards level at
 *   full speed, arms swept back and legs trailing, toes pointed, with a slow roll and nod on top (BarScene).
 * - Letting go (fly-fall): legs reaching down, arms out for balance, leaning back a little.
 * - Landing: the knees take it (deeper the faster it came down), the hips drop, the chest and arms go forward; then it stands up.
 */
export class FlyPose {
  /** 0 on the ground, 1 in the air (eased); how much of the way to the full dash (eased); how much of the falling pose (eased). */
  air=0;
  dash=0;
  fall=0;
  /** Whether the last update was in flight. */
  flying=false;
  /** Seconds since take-off or touchdown while they play (-1 otherwise); how hard the landing was (0.3 to 1); where the feet left from. */
  private launch=-1;
  private land=-1;
  private impact=0;
  private fromY=0;
  private saved=new Map<pc.Entity,pc.Quat>();
  private readonly turn=new pc.Quat();
  private readonly axisX=new pc.Vec3();
  private readonly axisZ=new pc.Vec3();

  /** `flying`: first seen already in the air (someone met mid-flight), so there is no take-off to play. */
  constructor(flying=false){if(flying){this.flying=true;this.air=1;}}

  /** Body lean in degrees (positive: forward) at the current blend: the root's tilt, which the hips pivot. */
  get lean():number {return this.air*(-5+this.dash*68)-this.fall*3;}
  /** How far the knees bend (0 to 1): loading before take-off, taking the landing. */
  get crouch():number {
    if(this.launch>=0)return this.launch<LOAD?smooth(this.launch/LOAD)*.75:(1-smooth((this.launch-LOAD)/PUSH))*.75;
    if(this.land>=0)return this.impact*(this.land<ABSORB?smooth(this.land/ABSORB):1-smooth((this.land-ABSORB)/STAND));
    return 0;
  }
  /** How far the hips drop for that bend (m), the feet staying where they are. */
  get drop():number {return 2*SEGMENT*(1-Math.cos(this.crouch*KNEE*pc.math.DEG_TO_RAD));}
  /** Whether anything of the flight is still drawn on the body. */
  get posed():boolean {return this.air>0||this.fall>0||this.launch>=0||this.land>=0;}

  /** The first frame of a flight, before the root moves: the push starts from where the feet are. */
  takeoff(y:number):void {if(!this.flying){this.launch=0;this.land=-1;this.fromY=y;}}
  /** The height the drawn root heads for while the push carries it up; the room already put the body at `y`. */
  liftY(y:number):number {
    if(this.launch<0)return y;
    return this.fromY+(y-this.fromY)*outBack((this.launch-LOAD*.8)/(PUSH+RISE));
  }

  /** `sink`: how fast the body was coming down (m/s), for how hard it lands. */
  update(flying:boolean,speed:number,dt:number,falling=false,sink=0):void {
    if(this.flying&&!flying){this.land=0;this.launch=-1;this.impact=.3+.7*clamp01(sink/10);}
    this.flying=flying;
    if(this.launch>=0&&(this.launch+=dt)>LOAD+PUSH+RISE)this.launch=-1;
    if(this.land>=0&&(this.land+=dt)>ABSORB+STAND)this.land=-1;
    // The hover takes over once the feet have pushed; on touchdown the flight lets go quickly and the landing takes the body.
    const pushing=this.launch>=0&&this.launch<LOAD+PUSH*.5;
    this.air+=((flying&&!pushing?1:0)-this.air)*(1-Math.exp(-dt/(flying?.3:.1)));
    this.dash+=((flying?Math.min(1,speed/9):0)-this.dash)*(1-Math.exp(-dt/.25));
    this.fall+=((flying&&falling?1:0)-this.fall)*(1-Math.exp(-dt/.18));
    if(this.air<.002)this.air=0;
    if(this.fall<.002)this.fall=0;
  }

  restore():void {
    for(const [bone,rotation] of this.saved)bone.setLocalRotation(rotation);
    this.saved.clear();
  }

  /** `body` is the tilted group the skeleton lives in: the limbs turn about its axes. `spine`: the chest, over the knees when they bend. */
  apply(bones:Bones,body:pc.GraphNode,t:number,spine?:pc.Entity|null):void {
    this.restore();
    if(!this.posed)return;
    const rotation=body.getRotation();
    rotation.transformVector(pc.Vec3.RIGHT,this.axisX);rotation.transformVector(pc.Vec3.BACK,this.axisZ);
    const air=smooth(this.air),dash=smooth(this.dash),fall=smooth(this.fall),idle=air*(1-dash)*(1-fall);
    const drift=Math.sin(t*1.7)*3*idle,breath=Math.sin(t*1.1+1)*2*idle;
    // The push (0 to 1 and back): legs straight, toes pointed, arms swung up. The crouch: knees bent with the feet flat (thigh -k, shin +2k, foot -k).
    const push=this.launch<0?0:Math.sin(Math.PI*clamp01((this.launch-LOAD)/(PUSH+RISE*.5)));
    const crouch=this.crouch,landing=this.land>=0?crouch:0,loading=crouch-landing,knee=crouch*KNEE;
    // On touchdown the floor takes the legs: what the flight had them doing goes while the knees take the blow.
    const free=this.land>=0?1-smooth(this.land/ABSORB):1;
    // Rotating about +X (the model's left-right line) swings a hanging limb backwards and tips a bone pointing up forwards; about +Z, towards the model's left (+X).
    const swing=(bone:pc.Entity|null|undefined,degrees:number,splay=0)=>{
      if(!bone||(!degrees&&!splay))return;
      if(!this.saved.has(bone))this.saved.set(bone,bone.getLocalRotation().clone());
      bone.setRotation(this.turn.setFromAxisAngle(this.axisX,degrees).mul(bone.getRotation().clone()));
      if(splay)bone.setRotation(this.turn.setFromAxisAngle(this.axisZ,splay).mul(bone.getRotation().clone()));
    };
    // The chest over the knees as they bend, so the weight stays over the feet.
    swing(spine,crouch*24);
    // Legs: the crouch; soft knees and a slow scissor hovering; trailing, straight and pointed dashing; reaching down for the floor falling.
    const thigh=-knee+free*(air*(1-fall)*5+dash*14-fall*12),shin=2*knee+free*(idle*14+dash*10+fall*22);
    swing(bones.upperleg_l,thigh-drift*2.5,free*(idle*2+fall*3));swing(bones.upperleg_r,thigh+drift*2.5,-free*(idle*2+fall*3));
    swing(bones.lowerleg_l,shin+breath);swing(bones.lowerleg_r,shin+4*idle-breath);
    const foot=-knee+push*28+free*(air*(1-fall)*10+dash*24-fall*8);
    swing(bones.foot_l,foot);swing(bones.foot_r,foot);
    // Arms: back while loading, swung up with the push, forward on landing; open at the sides hovering, swept back dashing, out wide falling.
    const flutter=Math.sin(t*7)*2*dash,wave=Math.sin(t*3.1)*4*fall;
    const arm=loading*34-push*62-landing*30+idle*8+dash*12,spread=push*14+landing*12+air*(idle*16+dash*15)+fall*48;
    swing(bones.upperarm_l,arm+drift+flutter,spread+breath*.5+wave);
    swing(bones.upperarm_r,arm-drift-flutter,-spread-breath*.5-wave);
    const elbow=-idle*10-dash*4-landing*28-push*12-fall*18;
    swing(bones.lowerarm_l,elbow-breath-flutter);swing(bones.lowerarm_r,elbow+breath+flutter);
    // The head lifts against the lean so the eyes look ahead, not at the ground.
    swing(bones.head,-dash*58-idle*3-crouch*14+fall*6);
  }
}
