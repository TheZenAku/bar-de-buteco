import type {PlayerInput,Position} from './index.js';
import {boxContains,isWalkable,roadHeight,solidsBetween,WORLD} from './world.js';

/** Tião's purchased, toggled skill. The room and client run the same movement. */
export const HORSE={skill:'horse',interaction:'horse',walkSpeed:3.2,fastSpeed:9,halfLength:1.25,radius:.4,height:2.85} as const;
export const isRidingHorse=(state:string|undefined):boolean=>state===HORSE.interaction;
const heading=(rotation:number)=>Math.atan2(Math.sin(rotation),Math.cos(rotation));

/** The whole horse and rider must fit outside, including while turning at rest. */
export function horseFits(position:Position,rotation:number):boolean {
  const y=position.y??0,s=Math.sin(rotation),c=Math.cos(rotation),reach=HORSE.halfLength+HORSE.radius;
  const solids=solidsBetween(position.x-reach,position.z-reach,position.x+reach,position.z+reach);
  for(const along of [-.85,-.425,0,.425,.85]){
    const x=position.x+s*along,z=position.z+c*along;
    if(x<WORLD.minX+HORSE.radius||x>WORLD.maxX-HORSE.radius||z<WORLD.minZ+HORSE.radius||z>WORLD.maxZ-HORSE.radius)return false;
    const floor=roadHeight(x,z,y);
    if(floor===undefined||Math.abs(floor-y)>.24)return false;
    if(solids.some(solid=>!solid.ramp&&(solid.maxY??Infinity)>y+.26&&(solid.minY??-Infinity)<y+HORSE.height&&boxContains(solid,x,z,HORSE.radius)))return false;
  }
  return isWalkable(position.x,position.z,y);
}

export function moveHorse(position:Position,rotation:number,input:Pick<PlayerInput,'dx'|'dz'|'running'|'rotation'>,dt=.05):Required<Position>&{rotation:number} {
  let current={x:position.x,y:position.y??0,z:position.z,rotation:heading(rotation)};
  const turn=heading(input.rotation-rotation),turns=Math.max(1,Math.ceil(Math.abs(turn)/.08));
  // Keep the original footprint if the swept turn is blocked, so backing away stays possible.
  let nextRotation=current.rotation;
  for(let i=1;i<=turns;i++){
    const next=heading(rotation+turn*i/turns);
    if(!horseFits(current,next)){nextRotation=current.rotation;break;}
    nextRotation=next;
  }
  current.rotation=nextRotation;
  const length=Math.hypot(input.dx,input.dz),scale=(input.running?HORSE.fastSpeed:HORSE.walkSpeed)*Math.min(.1,Math.max(0,dt))/Math.max(1,length);
  const steps=Math.max(1,Math.ceil(length*scale/.08));
  for(let i=0;i<steps;i++){
    const x=current.x+input.dx*scale/steps,z=current.z+input.dz*scale/steps,y=roadHeight(x,z,current.y);
    if(y===undefined||!horseFits({x,y,z},current.rotation))break;
    current={x,y,z,rotation:current.rotation};
  }
  return current;
}
