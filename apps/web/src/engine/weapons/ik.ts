import * as pc from 'playcanvas';
import type {HandRig} from '../drink-props';

/**
 * The arm and hand work of the weapons, without allocating per frame (serving-props.ts and drink-props.ts do the same with fresh vectors; with
 * twenty armed avatars that is thousands of objects a second). Every function works on world-space rotations over the pose the clips left, so no
 * rig's own bone axes are assumed (Nathan's hands are ~120° off Mixamo's: handFrame reads the frame from the finger joints).
 */
const RAD_TO_DEG=180/Math.PI;
const qa=new pc.Quat(),qb=new pc.Quat();
const va=new pc.Vec3(),vb=new pc.Vec3(),vc=new pc.Vec3();

/** Turns `bone` (world space, on top of its pose) by the shortest rotation that takes direction `from` to `to`, `weight` of the way. */
export function aimBone(bone:pc.GraphNode,from:pc.Vec3,to:pc.Vec3,weight=1):void {
  const fl=from.length(),tl=to.length();
  if(fl<1e-8||tl<1e-8||weight<=1e-4)return;
  va.copy(from).mulScalar(1/fl);vb.copy(to).mulScalar(1/tl);
  vc.cross(va,vb);
  const sin=vc.length();
  if(sin<1e-7)return;
  const angle=Math.atan2(sin,va.dot(vb))*RAD_TO_DEG*weight;
  qa.setFromAxisAngle(vc.mulScalar(1/sin),angle);
  qb.mul2(qa,bone.getRotation());
  bone.setRotation(qb);
}
/** Turns `bone` about a world axis (unit) by `degrees`, on top of its pose. */
export function turnBone(bone:pc.GraphNode,axis:pc.Vec3,degrees:number):void {
  if(Math.abs(degrees)<1e-3)return;
  qa.setFromAxisAngle(axis,degrees);
  qb.mul2(qa,bone.getRotation());
  bone.setRotation(qb);
}

const shoulder=new pc.Vec3(),elbow=new pc.Vec3(),wrist=new pc.Vec3(),goal=new pc.Vec3(),bend=new pc.Vec3(),wanted=new pc.Vec3(),tmp=new pc.Vec3(),tmp2=new pc.Vec3();
/**
 * Two-bone IK: turns `upper` and `lower` so the wrist (`end`'s origin) reaches `target` (or points at it, out of reach), the elbow bending towards
 * `pole` (a world direction). `weight` blends from the clip's pose. Returns how far the wrist is left from the target (m).
 */
export function reachArm(upper:pc.GraphNode,lower:pc.GraphNode,end:pc.GraphNode,target:pc.Vec3,pole:pc.Vec3,weight=1):number {
  if(weight<=1e-3)return end.getPosition().distance(target);
  shoulder.copy(upper.getPosition());elbow.copy(lower.getPosition());wrist.copy(end.getPosition());
  const a=shoulder.distance(elbow),b=elbow.distance(wrist);
  goal.lerp(wrist,target,Math.min(1,weight)).sub(shoulder);
  const c=Math.min(a+b-1e-4,Math.max(Math.abs(a-b)+1e-4,goal.length()));
  goal.normalize();
  bend.copy(pole).sub(tmp.copy(goal).mulScalar(pole.dot(goal)));
  if(bend.lengthSq()<1e-8){
    tmp2.sub2(elbow,shoulder);
    bend.copy(tmp2).sub(tmp.copy(goal).mulScalar(tmp2.dot(goal)));
  }
  bend.normalize();
  const cos=Math.min(1,Math.max(-1,(a*a+c*c-b*b)/(2*a*c))),sin=Math.sqrt(1-cos*cos);
  wanted.copy(shoulder).add(tmp.copy(goal).mulScalar(a*cos)).add(bend.mulScalar(a*sin)).sub(shoulder);
  aimBone(upper,tmp2.sub2(elbow,shoulder),wanted);
  elbow.copy(lower.getPosition());
  tmp.copy(shoulder).add(goal.mulScalar(c)).sub(elbow);
  aimBone(lower,tmp2.sub2(end.getPosition(),elbow),tmp);
  return end.getPosition().distance(target);
}

/** A hand's grip frame (drink-props.ts handFrame, into caller-owned vectors): towards the fingers, across the knuckles (towards the thumb), out of the palm. */
export interface GripFrame {origin:pc.Vec3;fingers:pc.Vec3;across:pc.Vec3;palm:pc.Vec3;length:number}
export const gripFrame=():GripFrame=>({origin:new pc.Vec3(),fingers:new pc.Vec3(),across:new pc.Vec3(),palm:new pc.Vec3(),length:.08});
const FINGERS=['index','middle','ring','pinky'] as const;
export function readFrame(rig:HandRig,out:GripFrame):GripFrame {
  out.origin.copy(rig.hand.getPosition());
  let count=0;tmp.set(0,0,0);
  for(const name of FINGERS){const joint=rig.fingers[name]?.[0];if(joint){tmp.add(joint.getPosition());count++;}}
  if(count)tmp.mulScalar(1/count);else tmp.copy(out.origin);
  out.fingers.sub2(tmp,out.origin);out.length=out.fingers.length()||.08;out.fingers.normalize();
  const index=rig.fingers.index?.[0],pinky=rig.fingers.pinky?.[0],thumb=rig.fingers.thumb?.[0];
  if(index&&pinky)out.across.sub2(index.getPosition(),pinky.getPosition());
  else if(thumb)out.across.sub2(thumb.getPosition(),out.origin);
  else out.across.cross(out.fingers,pc.Vec3.UP);
  out.across.sub(tmp.copy(out.fingers).mulScalar(out.across.dot(out.fingers))).normalize();
  out.palm.cross(out.fingers,out.across).normalize().mulScalar(rig.palmSign);
  return out;
}

const frame=gripFrame(),flat=new pc.Vec3(),flatWanted=new pc.Vec3();
/**
 * Turns the hand so its palm faces `palm` and its fingers run along `fingers` (both world directions, need not be exactly perpendicular), `weight`
 * of the way from the clip's.
 */
export function orientHand(rig:HandRig,palm:pc.Vec3,fingers:pc.Vec3,weight=1):void {
  readFrame(rig,frame);
  aimBone(rig.hand,frame.palm,palm,weight);
  readFrame(rig,frame);
  // The fingers, turned about the palm's normal only (the palm stays where it was put).
  const n=frame.palm;
  flat.copy(frame.fingers).sub(tmp.copy(n).mulScalar(frame.fingers.dot(n)));
  flatWanted.copy(fingers).sub(tmp.copy(n).mulScalar(fingers.dot(n)));
  if(flat.lengthSq()>1e-6&&flatWanted.lengthSq()>1e-6)aimBone(rig.hand,flat,flatWanted,weight);
}
/** Where the palm's middle is on this hand now (the point a grip should be at): along the fingers and a little off the palm. */
export function palmCentre(rig:HandRig,out:pc.Vec3,along=.45,off=.02):pc.Vec3 {
  readFrame(rig,frame);
  return out.copy(frame.origin).add(tmp.copy(frame.fingers).mulScalar(frame.length*along)).add(tmp2.copy(frame.palm).mulScalar(off));
}
/** The wrist's place so that the palm's middle lands on `grip`, with the hand turned to `palm`/`fingers` (estimated from its current size). */
export function wristFor(rig:HandRig,grip:pc.Vec3,palm:pc.Vec3,fingers:pc.Vec3,out:pc.Vec3,along=.45,off=.02):pc.Vec3 {
  readFrame(rig,frame);
  return out.copy(grip).sub(tmp.copy(fingers).normalize().mulScalar(frame.length*along)).sub(tmp2.copy(palm).normalize().mulScalar(off));
}

const fingerAxis=new pc.Vec3(),bone=new pc.Vec3(),turned=new pc.Vec3();
function curlChain(chain:readonly pc.GraphNode[],axis:pc.Vec3,palm:pc.Vec3,angles:readonly number[]):void {
  const first=chain[0],second=chain[1]??first?.children[0];
  if(!first||!second)return;
  bone.sub2(second.getPosition(),first.getPosition());
  qa.setFromAxisAngle(axis,10);qa.transformVector(bone,turned);
  const sign=turned.sub(bone).dot(palm)>=0?1:-1;
  for(let i=0;i<chain.length;i++)turnBone(chain[i]!,axis,sign*(angles[i]??0));
}
/** Closes the fingers around a grip (degrees at the three joints), the index on its own (on the trigger, or wrapped like the rest), the thumb a little. */
export function gripFingers(rig:HandRig,curl:readonly number[],index:readonly number[]=curl,thumb:readonly number[]=[14,20,12]):void {
  readFrame(rig,frame);
  fingerAxis.copy(frame.across);
  for(const name of FINGERS){const chain=rig.fingers[name];if(chain)curlChain(chain,fingerAxis,frame.palm,name==='index'?index:curl);}
  if(rig.fingers.thumb)curlChain(rig.fingers.thumb,frame.fingers,frame.palm,thumb);
}
/** Every joint of a hand rig (save/restore). */
export function handJoints(rig:HandRig|undefined):pc.GraphNode[] {
  if(!rig)return [];
  return [rig.hand,...Object.values(rig.fingers).flatMap(chain=>chain??[])];
}
