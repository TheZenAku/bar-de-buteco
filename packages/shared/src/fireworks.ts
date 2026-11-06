import {z} from 'zod';
import type {Position} from './index.js';
import {solidRayFraction} from './world.js';

export const FIREWORK={speed:32,flightMs:1700,cooldownMs:1200,burstMs:2200,maxVisible:12} as const;
export interface FireworkVector {x:number;y:number;z:number}
export interface FireworkShot {id:string;playerId:string;launchedAt:number;origin:FireworkVector;direction:FireworkVector;flightMs:number;hue:number}
const vector=z.object({x:z.number().finite(),y:z.number().finite(),z:z.number().finite()}).strict();
export const fireworkFireSchema=z.object({direction:vector.refine(v=>Math.abs(Math.hypot(v.x,v.y,v.z)-1)<.02)}).strict();

/** Shared approximation of the raised right hand; never accept a launch position from the browser. */
export function fireworkOrigin(at:Position,rotation:number):FireworkVector {
  const chest={x:at.x,y:(at.y??0)+1.4,z:at.z};
  const hand={x:chest.x+Math.cos(rotation)*.25+Math.sin(rotation)*.35,y:chest.y,z:chest.z-Math.sin(rotation)*.25+Math.cos(rotation)*.35};
  const fraction=Math.max(0,solidRayFraction(chest,hand)-.01);
  return {x:chest.x+(hand.x-chest.x)*fraction,y:chest.y,z:chest.z+(hand.z-chest.z)*fraction};
}

/** A powered, straight flight, stopped by the same solid map geometry as the camera. */
export function fireworkFlightMs(origin:FireworkVector,direction:FireworkVector):number {
  const range=FIREWORK.speed*FIREWORK.flightMs/1000;
  const end={x:origin.x+direction.x*range,y:origin.y+direction.y*range,z:origin.z+direction.z*range};
  let fraction=solidRayFraction(origin,end);
  if(end.y<0&&direction.y<0)fraction=Math.min(fraction,Math.max(0,origin.y/(origin.y-end.y)));
  return FIREWORK.flightMs*fraction;
}
export function fireworkPosition(shot:FireworkShot,ageMs:number):FireworkVector {
  const distance=FIREWORK.speed*Math.max(0,Math.min(ageMs,shot.flightMs))/1000;
  return {x:shot.origin.x+shot.direction.x*distance,y:shot.origin.y+shot.direction.y*distance,z:shot.origin.z+shot.direction.z*distance};
}
