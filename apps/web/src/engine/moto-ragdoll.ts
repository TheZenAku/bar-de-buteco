import * as pc from 'playcanvas';
import {JOINT as J,Ragdoll,type RagdollStart} from '@bar/shared';
import {aim} from './serving-props';

/** The bones a thrown body moves: the clip's pose stays under everything else (spine_01, the clavicles, hands and feet). */
export interface RagdollRig {
  root:pc.Entity;hip:pc.Entity;spine?:pc.Entity|null;neck?:pc.Entity|null;head:pc.Entity;
  upperarm_l:pc.Entity;lowerarm_l:pc.Entity;hand_l:pc.Entity;upperarm_r:pc.Entity;lowerarm_r:pc.Entity;hand_r:pc.Entity;
  upperleg_l:pc.Entity;lowerleg_l:pc.Entity;foot_l:pc.Entity;upperleg_r:pc.Entity;lowerleg_r:pc.Entity;foot_r:pc.Entity;
}
/** How long the body takes to go from lying as it fell to the first frame of getting up. */
const RELEASE_SECONDS=.5;
/** The room's start older than this was seen late (out of view, or a late arrival): the body catches up at once. */
const LATE_MS=500;
/** Between where it was drawn on the bike and where the room threw it from (the bike is drawn a little behind the room): gone in this long. */
const OFFSET_FADE=9;

const tempA=new pc.Vec3(),tempB=new pc.Vec3(),tempC=new pc.Vec3(),matrix=new pc.Mat4();
/** The rotation whose X, Y and Z are these (`left`, then `up` made square with it, and their cross). */
function frame(left:pc.Vec3,up:pc.Vec3,out:pc.Quat):pc.Quat {
  const x=tempA.copy(left).normalize(),z=tempC.cross(x,up).normalize(),y=tempB.cross(z,x);
  const m=matrix.data;
  m[0]=x.x;m[1]=x.y;m[2]=x.z;m[3]=0;m[4]=y.x;m[5]=y.y;m[6]=y.z;m[7]=0;m[8]=z.x;m[9]=z.y;m[10]=z.z;m[11]=0;m[12]=0;m[13]=0;m[14]=0;m[15]=1;
  return out.setFromMat4(matrix);
}

/**
 * A body thrown by a crash, drawn: the same Ragdoll the room runs (ragdoll.ts), its points turned into world rotations over the clip's pose,
 * after the clip each frame, so every skin's own bone axes do not matter. Then the way back into the getting-up clip.
 */
export class RagdollPuppet {
  private readonly sim:Ragdoll;
  private hipOffset?:pc.Quat;
  private chestOffset?:pc.Quat;
  private readonly quat=new pc.Quat();
  private readonly a=new pc.Vec3();
  private readonly b=new pc.Vec3();
  private readonly point=new pc.Vec3();
  private release=0;
  /** How the body lay on the last frame the sim drew it: the fade into the next clip starts from there. */
  private kept?:{hip:pc.Vec3;turns:Array<[pc.Entity,pc.Quat]>};
  private readonly drawnOffset=new pc.Vec3();

  /** `from`: where this body's seat was drawn when it came off, if it was seen on a bike. */
  constructor(start:RagdollStart,readonly startedAt:number,age:number,from?:{x:number;y:number;z:number}) {
    this.sim=new Ragdoll(start);
    if(age>LATE_MS)this.sim.advance(age/1000);
    else if(from)this.drawnOffset.set(from.x-start.x,from.y-start.y,from.z-start.z);
  }
  /** Where the pelvis is right now. */
  pelvis():[number,number,number] {return this.sim.joint(J.pelvis);}
  /** Where it lies on the ground. */
  ground():number {return this.sim.rest().y;}
  get time():number {return this.sim.time;}
  get asleep():boolean {return this.sim.asleep;}
  private at(joint:number,out:pc.Vec3):pc.Vec3 {const [x,y,z]=this.sim.joint(joint);return out.set(x,y,z);}
  private between(from:number,to:number,out:pc.Vec3):pc.Vec3 {const [ax,ay,az]=this.sim.joint(from),[bx,by,bz]=this.sim.joint(to);return out.set(bx-ax,by-ay,bz-az);}
  /** Time passes and the body takes the sim's pose. Run after the clip (and after the root has been placed) this frame. */
  pose(dt:number,rig:RagdollRig):void {
    this.sim.advance(dt);
    this.drawnOffset.mulScalar(Math.exp(-OFFSET_FADE*dt));
    const {hip,spine,neck,head,root}=rig,{a,b,quat}=this;
    // The first frame says how each bone sits in its part of the body: from then on the part leads it.
    if(!this.hipOffset){
      this.hipOffset=frame(a.sub2(rig.upperleg_l.getPosition(),rig.upperleg_r.getPosition()),b.sub2(spine?.getPosition()??head.getPosition(),hip.getPosition()),new pc.Quat()).invert().mul(hip.getRotation());
      if(spine&&neck)this.chestOffset=frame(a.sub2(rig.upperarm_l.getPosition(),rig.upperarm_r.getPosition()),b.sub2(neck.getPosition(),spine.getPosition()),new pc.Quat()).invert().mul(spine.getRotation());
    }
    root.setPosition(root.getPosition().clone().add(this.at(J.pelvis,a).add(this.drawnOffset).sub(hip.getPosition())));
    frame(this.between(J.hipR,J.hipL,a),this.between(J.pelvis,J.chest,b),quat);
    hip.setRotation(quat.mul(this.hipOffset));
    if(spine&&this.chestOffset){
      frame(this.between(J.shoulderR,J.shoulderL,a),this.between(J.chest,J.neck,b),quat);
      spine.setRotation(quat.mul(this.chestOffset));
    }
    if(neck)aim(neck,a.sub2(head.getPosition(),neck.getPosition()),this.between(J.neck,J.head,b));
    this.limb(rig.upperarm_l,rig.lowerarm_l,rig.hand_l,J.shoulderL,J.elbowL,J.handL);
    this.limb(rig.upperarm_r,rig.lowerarm_r,rig.hand_r,J.shoulderR,J.elbowR,J.handR);
    this.limb(rig.upperleg_l,rig.lowerleg_l,rig.foot_l,J.hipL,J.kneeL,J.footL);
    this.limb(rig.upperleg_r,rig.lowerleg_r,rig.foot_r,J.hipR,J.kneeR,J.footR);
    this.keep(rig);
  }
  private keep(rig:RagdollRig):void {
    if(!this.kept)this.kept={hip:new pc.Vec3(),turns:[rig.hip,rig.spine,rig.neck,rig.upperarm_l,rig.lowerarm_l,rig.upperarm_r,rig.lowerarm_r,rig.upperleg_l,rig.lowerleg_l,rig.upperleg_r,rig.lowerleg_r].filter((bone):bone is pc.Entity=>!!bone).map(bone=>[bone,new pc.Quat()])};
    this.kept.hip.copy(rig.hip.getPosition());
    for(const [bone,turn] of this.kept.turns)turn.copy(bone.getRotation());
  }
  private limb(upper:pc.Entity,lower:pc.Entity,end:pc.Entity,top:number,middle:number,bottom:number):void {
    const {a,b}=this;
    aim(upper,a.sub2(lower.getPosition(),upper.getPosition()),this.between(top,middle,b));
    aim(lower,a.sub2(end.getPosition(),lower.getPosition()),this.between(middle,bottom,b));
  }
  /** Fades from how the body lay into what the clip plays now. False once done. */
  fade(dt:number,rig:RagdollRig):boolean {
    this.release+=dt/RELEASE_SECONDS;
    if(this.release>=1||!this.kept)return false;
    const t=this.release,left=1-t*t*(3-2*t),{a,quat}=this;
    const shift=a.sub2(this.kept.hip,rig.hip.getPosition()).mulScalar(left);
    rig.root.setPosition(rig.root.getPosition().clone().add(shift));
    for(const [bone,turn] of this.kept.turns)bone.setRotation(quat.slerp(bone.getRotation(),turn,left));
    return true;
  }
}

const liftTurn=new pc.Quat();
/** How far down the hips go, how far the back bows (degrees), at the start of a lift. */
const LIFT_CROUCH=.42,LIFT_BOW=62,LIFT_GRIP_BACK=.05;
/**
 * Lifting a fallen bike, drawn after the clip (standing idle): hips down, feet planted, the back bowed, one hand on the nearest grip and the
 * other on the seat. They all follow as the bike comes up, by the same two-bone reach as the riding pose.
 */
export function lifterPose(rig:RagdollRig,grips:{left:pc.Vec3;right:pc.Vec3;seat:pc.Vec3},progress:number,reach:(upper:pc.Entity,lower:pc.Entity,end:pc.Entity,target:pc.Vec3,pole:pc.Vec3)=>void):void {
  const {root,spine,head}=rig,t=Math.max(0,Math.min(1,progress)),rise=t*t*(3-2*t),crouch=1-rise;
  const left=root.right.clone(),up=pc.Vec3.UP,front=root.forward.clone().mulScalar(-1);
  const footL=rig.foot_l.getPosition().clone(),footR=rig.foot_r.getPosition().clone();
  root.setPosition(root.getPosition().clone().add(new pc.Vec3(0,-LIFT_CROUCH*crouch,0)));
  const bow=LIFT_BOW*(.15+.85*crouch);
  if(spine)spine.setRotation(liftTurn.setFromAxisAngle(left,bow).mul(spine.getRotation()));
  head.setRotation(liftTurn.setFromAxisAngle(left,-bow*.7).mul(head.getRotation()));
  for(const [upper,lower,foot,to,sign] of [[rig.upperleg_l,rig.lowerleg_l,rig.foot_l,footL,1],[rig.upperleg_r,rig.lowerleg_r,rig.foot_r,footR,-1]] as const){
    const kept=foot.getRotation().clone();
    reach(upper,lower,foot,to,front.clone().add(left.clone().mulScalar(sign*.3)));
    foot.setRotation(kept);
  }
  // The grip on the same side of the body goes to that hand, the seat to the other.
  const leftReach=grips.left.clone().sub(root.getPosition()).dot(left),rightReach=grips.right.clone().sub(root.getPosition()).dot(left);
  const near=rig.hand_l.getPosition().distance(grips.left)<rig.hand_l.getPosition().distance(grips.right)?grips.left:grips.right;
  const onLeft=(near===grips.left?leftReach:rightReach)>=0;
  const toLeft=(onLeft?near:grips.seat).clone().sub(front.clone().mulScalar(LIFT_GRIP_BACK)),toRight=(onLeft?grips.seat:near).clone().sub(front.clone().mulScalar(LIFT_GRIP_BACK));
  reach(rig.upperarm_l,rig.lowerarm_l,rig.hand_l,toLeft,left.clone().mulScalar(.8).add(up.clone().mulScalar(-.3)));
  reach(rig.upperarm_r,rig.lowerarm_r,rig.hand_r,toRight,left.clone().mulScalar(-.8).add(up.clone().mulScalar(-.3)));
}
