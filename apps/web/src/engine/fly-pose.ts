import * as pc from 'playcanvas';

const BONES=['head','upperarm_l','lowerarm_l','upperarm_r','lowerarm_r','upperleg_l','lowerleg_l','upperleg_r','lowerleg_r','foot_l','foot_r'] as const;
type Bones=Record<typeof BONES[number],pc.Entity>;
const smooth=(x:number)=>x*x*(3-2*x);

/**
 * The administrators' flight (B): the whole body leans about the hips, and the limbs are turned over the clip's Idle
 * in the body's own frame (so no rig's bone axes matter). Hovering: upright, a little back, knees soft, hands open
 * at the sides and drifting. Under way: a streamlined line, tilted towards level at full speed, arms swept back and legs
 * trailing, toes pointed, with a slow roll and nod on top (BarScene). Applied after the animation and restored before the next one, like HeadLookPose.
 */
export class FlyPose {
  /** 0 on the ground, 1 in the air (eased); how much of the way to the full dash (eased). */
  air=0;
  dash=0;
  private saved=new Map<pc.Entity,pc.Quat>();
  private readonly turn=new pc.Quat();
  private readonly axisX=new pc.Vec3();
  private readonly axisZ=new pc.Vec3();

  /** Body lean in degrees (positive: forward) at the current blend: the root's tilt, which the hips pivot. */
  get lean():number {return this.air*(-5+this.dash*68);}

  update(flying:boolean,speed:number,dt:number):void {
    this.air+=((flying?1:0)-this.air)*(1-Math.exp(-dt/.18));
    this.dash+=((flying?Math.min(1,speed/9):0)-this.dash)*(1-Math.exp(-dt/.22));
    if(this.air<.002)this.air=0;
  }

  restore():void {
    for(const [bone,rotation] of this.saved)bone.setLocalRotation(rotation);
    this.saved.clear();
  }

  /** `body` is the tilted group the skeleton lives in: the limbs turn about its axes. */
  apply(bones:Bones,body:pc.GraphNode,t:number):void {
    this.restore();
    if(this.air<.01)return;
    const rotation=body.getRotation();
    rotation.transformVector(pc.Vec3.RIGHT,this.axisX);rotation.transformVector(pc.Vec3.BACK,this.axisZ);
    const air=smooth(this.air),dash=smooth(this.dash),idle=air*(1-dash);
    const drift=Math.sin(t*1.7)*3*idle,breath=Math.sin(t*1.1+1)*2*idle;
    // Rotating about +X (the model's left-right line) swings a hanging limb backwards; about +Z, towards the model's left (+X).
    const swing=(name:keyof Bones,degrees:number,splay=0)=>{
      const bone=bones[name];if(!bone)return;
      this.saved.set(bone,bone.getLocalRotation().clone());
      bone.setRotation(this.turn.setFromAxisAngle(this.axisX,degrees).mul(bone.getRotation().clone()));
      if(splay)bone.setRotation(this.turn.setFromAxisAngle(this.axisZ,splay).mul(bone.getRotation().clone()));
    };
    // Legs: soft knees and a slow scissor while hovering; trailing, straight and pointed while dashing.
    swing('upperleg_l',air*5+dash*14-drift*2.5,idle*2);swing('upperleg_r',air*5+dash*14+drift*2.5,-idle*2);
    swing('lowerleg_l',idle*(14+breath)+dash*10);swing('lowerleg_r',idle*(18-breath)+dash*10);
    swing('foot_l',air*10+dash*24);swing('foot_r',air*10+dash*24);
    // Arms: relaxed and open while hovering; swept back along the body (a little apart, hands fluttering in the wind) while dashing.
    const flutter=Math.sin(t*7)*2*dash;
    swing('upperarm_l',idle*(8+drift)+dash*(12+flutter),air*(idle*16+dash*15)+breath*.5*idle);
    swing('upperarm_r',idle*(8-drift)+dash*(12-flutter),-air*(idle*16+dash*15)-breath*.5*idle);
    swing('lowerarm_l',-idle*(10+breath)-dash*(4+flutter));swing('lowerarm_r',-idle*(10-breath)-dash*(4-flutter));
    // The head lifts against the lean so the eyes look ahead, not at the ground.
    swing('head',-dash*58-idle*3);
  }
}
