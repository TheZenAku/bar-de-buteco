import {KICK_PATHS} from './kick-paths.js';
export {KICK_PATHS} from './kick-paths.js';
import {skillById} from './profile.js';
import type {RagdollStart} from './ragdoll.js';
import {sightBlocked} from './world.js';

/**
 * A kick that lands (docs/sistemas/perfil.md). The room decides it from where the foot is drawn at that moment of the clip (kick-paths.ts) against
 * the other player's body, so what the foot touches is what gets hit, and nothing else. The one hit flies with the same body a crash throws (ragdoll.ts).
 */
export interface KickBlow {
  /** Life it takes. A kick alone never takes the last point. */
  hp:number;
  /** How fast it sends the body away along the ground and up (m/s), and how hard it turns it over (RagdollStart.closing). */
  speed:number;lift:number;closing:number;
  /** When the leg cuts the air (ms into the clip), for its sound. */
  swingMs:number;
  /** How much the sounds and the camera make of it. */
  heavy:boolean;
}
export const KICKS:Readonly<Record<string,KickBlow>>={
  karate:{hp:6,speed:9,lift:3.8,closing:2.5,swingMs:430,heavy:false},
  'air-kick':{hp:10,speed:12,lift:4.8,closing:4,swingMs:640,heavy:true},
};
/** The leg and the body it can touch (a standing capsule); how far the player turns to a target; how long nobody can be kicked again after getting up. */
export const KICK={legRadius:.13,bodyRadius:.3,bodyHeight:1.75,sweepMs:20,aimRange:2,aimCone:1.05,graceMs:2500} as const;

export interface KickBody {x:number;y:number;z:number;rotation:number}
type Feet=Pick<KickBody,'x'|'y'|'z'>;

/** The moments a kick can land, in ms into its clip. */
export function kickWindow(skill:string):{from:number;to:number}|undefined {
  const path=KICK_PATHS[skillById(skill)?.clip??''];
  if(!path)return;
  return {from:path.from,to:path.from+(path.hip.length/3-1)*path.step};
}
/** Where a row of KICK_PATHS is, in the kicker's own axes, `ms` into the clip. */
function wayAt(way:readonly number[],from:number,step:number,ms:number):[number,number,number] {
  const at=Math.max(0,Math.min(way.length/3-1,(ms-from)/step)),i=Math.min(way.length/3-2,Math.floor(at)),f=at-i,k=i*3;
  return [way[k]!+(way[k+3]!-way[k]!)*f,way[k+1]!+(way[k+4]!-way[k+1]!)*f,way[k+2]!+(way[k+5]!-way[k+2]!)*f];
}
/** Whether the leg from the hips to the foot, in the kicker's own axes, meets this body (in the same axes). */
function legMeets(hip:readonly [number,number,number],foot:readonly [number,number,number],x:number,y:number,z:number):boolean {
  const dx=foot[0]-hip[0],dz=foot[2]-hip[2],length=dx*dx+dz*dz,along=length>1e-9?Math.max(0,Math.min(1,((x-hip[0])*dx+(z-hip[2])*dz)/length)):1;
  const height=hip[1]+(foot[1]-hip[1])*along;
  return Math.hypot(hip[0]+dx*along-x,hip[2]+dz*along-z)<KICK.legRadius+KICK.bodyRadius&&height+KICK.legRadius>y&&height-KICK.legRadius<y+KICK.bodyHeight;
}
/** Whether a wall stands between them: a kick does not go through one. Thin posts and low furniture do not stop it (firstHit). */
export function kickClear(kicker:Feet,target:Feet):boolean {
  return !sightBlocked({x:kicker.x,y:kicker.y+1.1,z:kicker.z},{x:target.x,y:target.y+1.1,z:target.z},0);
}
/** Whether a kicking leg touched this body between two moments of the clip (ms), all along the way it went and not only where it ended up. */
export function kickTouches(skill:string,fromMs:number,toMs:number,kicker:KickBody,target:Feet):boolean {
  const path=KICK_PATHS[skillById(skill)?.clip??''],span=kickWindow(skill);
  if(!path||!span)return false;
  const start=Math.max(fromMs,span.from),end=Math.min(toMs,span.to);
  if(start>end)return false;
  // The body in the kicker's own axes: the table is already in them.
  const s=Math.sin(kicker.rotation),c=Math.cos(kicker.rotation),dx=target.x-kicker.x,dz=target.z-kicker.z,x=c*dx-s*dz,y=target.y-kicker.y,z=s*dx+c*dz;
  for(let ms=start;;ms=Math.min(end,ms+KICK.sweepMs)){
    const hip=wayAt(path.hip,path.from,path.step,ms);
    for(const foot of path.feet)if(legMeets(hip,wayAt(foot,path.from,path.step,ms),x,y,z))return true;
    if(ms>=end)return false;
  }
}
/** Which way to face so the kick goes at someone just about in front (radians), the one most worth it among `targets`; undefined when nobody is. */
export function kickAim(kicker:KickBody,targets:readonly Feet[]):number|undefined {
  let best:number|undefined,bestScore=Infinity;
  for(const target of targets){
    const dx=target.x-kicker.x,dz=target.z-kicker.z,away=Math.hypot(dx,dz);
    if(away>KICK.aimRange||away<.01||Math.abs(target.y-kicker.y)>1)continue;
    const heading=Math.atan2(dx,dz),off=Math.abs(Math.atan2(Math.sin(heading-kicker.rotation),Math.cos(heading-kicker.rotation)));
    if(off>KICK.aimCone)continue;
    const score=away+off;
    if(score<bestScore){bestScore=score;best=heading;}
  }
  return best;
}
/** How the body hit leaves: mostly the way the kick was going, partly straight away from the kicker. */
export function kickLaunch(skill:string,by:string,kicker:KickBody,target:KickBody,seed:number):RagdollStart {
  const blow=KICKS[skill]!,away=Math.hypot(target.x-kicker.x,target.z-kicker.z)||1;
  const dx=Math.sin(kicker.rotation)*.65+(target.x-kicker.x)/away*.35,dz=Math.cos(kicker.rotation)*.65+(target.z-kicker.z)/away*.35,size=Math.hypot(dx,dz)||1;
  return {x:target.x,y:target.y,z:target.z,yaw:target.rotation,vx:dx/size*blow.speed,vz:dz/size*blow.speed,closing:blow.closing,lift:blow.lift,by,seated:false,seed};
}
