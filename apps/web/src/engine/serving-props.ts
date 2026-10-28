import * as pc from 'playcanvas';
import {SERVED_PROPS,type ItemId} from '@bar/shared';
import {handFrame,type HandRig} from './drink-props';

/**
 * Tonico's round aluminium tray and the arm work around it: the left hand holds the tray level under its centre,
 * the right hand takes each item off the tray and puts it on the table (BarScene animates the items).
 */
export const TRAY_RADIUS=.19;
/** Thickness of the tray and of the small plate under snacks; props stand on top of them. */
export const TRAY_HEIGHT=.012;
export const PLATE_HEIGHT=.012;

const footprint=(item:string)=>SERVED_PROPS[item as ItemId]?.radius??.05;
const layouts=new Map<string,{x:number;z:number}[]>();
/**
 * Where an order's items stand on the tray (tray-local metres, +Z forward): packed from the centre outwards, the
 * biggest first, slightly over the rim when they do not fit otherwise (a plate of torresmo fills most of it).
 */
export function traySlots(items:readonly string[]):{x:number;z:number}[] {
  const key=items.join(','),cached=layouts.get(key);if(cached)return cached;
  const slots:{x:number;z:number}[]=[],placed:{x:number;z:number;radius:number}[]=[];
  for(const index of items.map((_,i)=>i).sort((a,b)=>footprint(items[b]!)-footprint(items[a]!))){
    const radius=footprint(items[index]!);
    let best={x:0,z:0,score:Infinity};
    for(let x=-TRAY_RADIUS;x<=TRAY_RADIUS;x+=.01)for(let z=-TRAY_RADIUS;z<=TRAY_RADIUS;z+=.01){
      const from=Math.hypot(x,z);if(from+radius*.4>TRAY_RADIUS)continue;
      const overlap=placed.reduce((sum,p)=>sum+Math.max(0,p.radius+radius+.006-Math.hypot(p.x-x,p.z-z)),0);
      const score=overlap*10+from;
      if(score<best.score)best={x,z,score};
    }
    placed.push({x:best.x,z:best.z,radius});slots[index]={x:best.x,z:best.z};
  }
  layouts.set(key,slots);return slots;
}

const DEG=180/Math.PI;
/** Turns `bone` (world space, on top of its pose) by the shortest rotation that takes direction `from` to `to`. */
function aim(bone:pc.Entity,from:pc.Vec3,to:pc.Vec3):void {
  const a=from.clone().normalize(),b=to.clone().normalize(),axis=new pc.Vec3().cross(a,b),sin=axis.length();
  if(sin<1e-6)return;
  const angle=Math.atan2(sin,a.dot(b))*DEG;
  bone.setRotation(new pc.Quat().setFromAxisAngle(axis.mulScalar(1/sin),angle).mul(bone.getRotation()));
}

/**
 * Two-bone IK over the animated pose: turns `upper` and `lower` so that `end` (the wrist) reaches `target`, or
 * points at it when it is out of reach, with the elbow bending towards `pole`. `weight` blends from the clip's pose.
 */
export function reach(upper:pc.Entity,lower:pc.Entity,end:pc.Entity,target:pc.Vec3,pole:pc.Vec3,weight=1):void {
  if(weight<=1e-3)return;
  const shoulder=upper.getPosition().clone(),elbow=lower.getPosition().clone(),wrist=end.getPosition().clone();
  const a=shoulder.distance(elbow),b=elbow.distance(wrist);
  const toGoal=new pc.Vec3().lerp(wrist,target,Math.min(1,weight)).sub(shoulder);
  const c=Math.min(a+b-1e-4,Math.max(Math.abs(a-b)+1e-4,toGoal.length()));
  const direction=toGoal.normalize();
  // The elbow's side: the pole, or the way it bends now when the pole lies along the arm.
  let bend=pole.clone().sub(direction.clone().mulScalar(pole.dot(direction)));
  if(bend.lengthSq()<1e-8)bend=new pc.Vec3().sub2(elbow,shoulder).sub(direction.clone().mulScalar(new pc.Vec3().sub2(elbow,shoulder).dot(direction)));
  bend.normalize();
  const cos=Math.min(1,Math.max(-1,(a*a+c*c-b*b)/(2*a*c))),sin=Math.sqrt(1-cos*cos);
  const wantedElbow=shoulder.clone().add(direction.clone().mulScalar(a*cos)).add(bend.mulScalar(a*sin));
  aim(upper,new pc.Vec3().sub2(elbow,shoulder),wantedElbow.sub(shoulder));
  const movedElbow=lower.getPosition().clone();
  aim(lower,new pc.Vec3().sub2(end.getPosition(),movedElbow),shoulder.add(direction.mulScalar(c)).sub(movedElbow));
}

/** Turns the hand palm up, fingers towards `front`: what it carries rests on it. */
export function palmUp(rig:HandRig,up:pc.Vec3,front:pc.Vec3):void {
  aim(rig.hand,handFrame(rig).palm,up);
  const fingers=handFrame(rig).fingers,flat=(v:pc.Vec3)=>v.clone().sub(up.clone().mulScalar(v.dot(up)));
  const along=flat(fingers),forward=flat(front);
  if(along.lengthSq()>1e-6&&forward.lengthSq()>1e-6)aim(rig.hand,along,forward);
}

/** Where the tray rests on the open hand: over the middle of the palm. */
export function trayCentre(rig:HandRig,up:pc.Vec3):pc.Vec3 {
  const frame=handFrame(rig);
  return frame.origin.clone().add(frame.fingers.clone().mulScalar(frame.length*.5)).add(up.clone().mulScalar(.03));
}

export const smoothstep=(t:number)=>{const x=Math.min(1,Math.max(0,t));return x*x*(3-2*x);};
