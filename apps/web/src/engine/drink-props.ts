import * as pc from 'playcanvas';
import type {DrinkItem} from '@bar/shared';

/**
 * Bottle and glass held in a hand. The props (tools/assets/import-drinks.mjs) have their origin at the centre of
 * the base and +Y towards the mouth. The grip is rebuilt every frame from the hand's own bones, so each
 * skeleton is handled as authored: no shared rig, no fixed offset per bone axis convention.
 */
export interface DrinkProp {
  url:string;height:number;radius:number;
  /** Fraction of the height held at the centre of the fist. */
  grip:number;
  /** While sipping, elevation (degrees) of the bottom→top axis: negative tips the bottom up (bottle). */
  sip:number;
  /** Finger flexion at the three joints, degrees. */
  curl:readonly [number,number,number];
}
export const DRINK_PROPS:Record<DrinkItem,DrinkProp>={
  garrafa:{url:'props/garrafa.glb',height:.23,radius:.031,grip:.32,sip:-28,curl:[38,48,32]},
  // A copo americano is held low, its rim above the fist.
  copo:{url:'props/copo.glb',height:.093,radius:.027,grip:.28,sip:38,curl:[34,44,30]},
};
/** Per-skeleton fine-tuning of the grip (metres along the fingers and towards the palm). */
export const RIG_GRIP:Record<string,{along?:number;palm?:number}>={
  // Read's rig has no middle, ring or little finger: the knuckle line comes from the index finger only.
  read:{along:-.01},
};

const FINGERS=['index','middle','ring','pinky'] as const;
export interface HandRig {
  hand:pc.Entity;
  fingers:Partial<Record<typeof FINGERS[number]|'thumb',pc.Entity[]>>;
  /** +1 or −1 so that cross(fingers, across) points out of the palm; measured in the bind pose. */
  palmSign:number;
}
/** Finds a hand ('l' or 'r') by the canonical joint names every supported rig uses. Call in the bind pose. */
export function findHand(model:pc.Entity,side:'l'|'r'):HandRig|undefined {
  const find=(name:string)=>(model.findByName(name) as pc.Entity|null)??undefined;
  const hand=find(`hand_${side}`);if(!hand)return;
  const fingers:HandRig['fingers']={};
  for(const name of [...FINGERS,'thumb'] as const){
    const chain=[1,2,3].map(i=>find(`${name}_0${i}_${side}`)).filter((e):e is pc.Entity=>!!e);
    if(chain.length)fingers[name]=chain;
  }
  if(!fingers.index&&!fingers.middle)return;
  const rig:HandRig={hand,fingers,palmSign:1};
  const frame=handFrame(rig);
  // Bind poses hold the palms down (T-pose) or towards the thighs (A-pose).
  const inward=new pc.Vec3().sub2(model.getPosition(),hand.getPosition());inward.y=0;inward.normalize();
  const reference=new pc.Vec3(0,-1,0).add(inward);
  rig.palmSign=frame.palm.dot(reference)>=0?1:-1;
  return rig;
}

interface Frame {origin:pc.Vec3;fingers:pc.Vec3;across:pc.Vec3;palm:pc.Vec3;length:number}
/** The hand's grip frame: towards the fingers, across the knuckles (towards the thumb), out of the palm. */
function handFrame(rig:HandRig):Frame {
  const origin=rig.hand.getPosition().clone();
  const knuckles=FINGERS.flatMap(f=>rig.fingers[f]?.[0]?[rig.fingers[f]![0]!.getPosition()]:[]);
  const middle=knuckles.reduce((sum,p)=>sum.add(p),new pc.Vec3()).mulScalar(1/Math.max(1,knuckles.length));
  const fingers=new pc.Vec3().sub2(middle,origin);const length=fingers.length()||.08;fingers.normalize();
  const across=new pc.Vec3();
  const index=rig.fingers.index?.[0],pinky=rig.fingers.pinky?.[0],thumb=rig.fingers.thumb?.[0];
  if(index&&pinky)across.sub2(index.getPosition(),pinky.getPosition());
  else if(thumb)across.sub2(thumb.getPosition(),origin);
  else across.cross(fingers,pc.Vec3.UP);
  across.sub(fingers.clone().mulScalar(across.dot(fingers))).normalize();
  const palm=new pc.Vec3().cross(fingers,across).normalize().mulScalar(rig.palmSign);
  return {origin,fingers,across,palm,length};
}

function rotateAbout(bone:pc.Entity,axis:pc.Vec3,degrees:number):void {
  if(Math.abs(degrees)<.01)return;
  bone.setRotation(new pc.Quat().setFromAxisAngle(axis,degrees).mul(bone.getRotation()));
}
/** Flexes a finger chain towards the palm, whichever way its joint axes point. */
function curl(chain:pc.Entity[],axis:pc.Vec3,palm:pc.Vec3,angles:readonly number[]):void {
  const [first,second]=chain;if(!first||!second)return;
  const bone=new pc.Vec3().sub2(second.getPosition(),first.getPosition());
  const turned=new pc.Quat().setFromAxisAngle(axis,10).transformVector(bone);
  const sign=turned.sub(bone).dot(palm)>=0?1:-1;
  chain.forEach((joint,i)=>rotateAbout(joint,axis,sign*(angles[i]??0)));
}

/**
 * Places `prop` in the hand after the animation ran this frame. Near the mouth the wrist turns so the
 * bottle or glass reaches its drinking angle; the fingers close around it.
 */
export function holdDrink(rig:HandRig,prop:pc.Entity,item:DrinkProp,head:pc.Entity,up:pc.Vec3,front:pc.Vec3,tuning:{along?:number;palm?:number}={}):number {
  let frame=handFrame(rig);
  for(const name of FINGERS){const chain=rig.fingers[name];if(chain)curl(chain,frame.across,frame.palm,item.curl);}
  if(rig.fingers.thumb)curl(rig.fingers.thumb,frame.fingers,frame.palm,[12,18,10]);
  const mouth=head.getPosition().clone().add(up.clone().mulScalar(.06)).add(front.clone().mulScalar(.11));
  const centre=(f:Frame)=>f.origin.clone().add(f.fingers.clone().mulScalar(f.length*.55+(tuning.along??0))).add(f.palm.clone().mulScalar(item.radius+.02+(tuning.palm??0)));
  // 0 at rest, 1 with the drink at the lips.
  const t=Math.min(1,Math.max(0,(.36-centre(frame).distance(mouth))/.12)),sip=t*t*(3-2*t);
  if(sip>0){
    const elevation=item.sip*Math.PI/180;
    const target=front.clone().mulScalar(-Math.cos(elevation)).add(up.clone().mulScalar(Math.sin(elevation))).normalize();
    const axis=new pc.Vec3().cross(frame.across,target),angle=Math.acos(Math.min(1,Math.max(-1,frame.across.dot(target))))*180/Math.PI;
    if(axis.length()>1e-5){rotateAbout(rig.hand,axis.normalize(),angle*sip);frame=handFrame(rig);}
  }
  const along=frame.across,base=centre(frame).sub(along.clone().mulScalar(item.height*item.grip));
  const top=base.clone().add(along.clone().mulScalar(item.height));
  if(sip>0){
    // Bring the rim to the lips, a few centimetres at most so the hand still holds it.
    const reach=new pc.Vec3().sub2(mouth,top),length=reach.length(),limit=.035*sip;
    if(length>limit)reach.mulScalar(limit/length);
    base.add(reach);top.add(reach);
    // Never inside the face.
    const face=head.getPosition().clone().add(up.clone().mulScalar(.09)),away=new pc.Vec3().sub2(top,face),clearance=.105-away.length();
    if(clearance>0){const push=away.lengthSq()>1e-8?away.normalize():front.clone();base.add(push.mulScalar(clearance));}
  }
  // Label away from the palm; +Y along the drink.
  const z=frame.palm.clone().mulScalar(-1);z.sub(along.clone().mulScalar(z.dot(along))).normalize();
  const x=new pc.Vec3().cross(along,z);
  const m=new pc.Mat4();const d=m.data;
  d[0]=x.x;d[1]=x.y;d[2]=x.z;d[4]=along.x;d[5]=along.y;d[6]=along.z;d[8]=z.x;d[9]=z.y;d[10]=z.z;
  prop.setPosition(base);prop.setRotation(new pc.Quat().setFromMat4(m));
  return sip;
}
