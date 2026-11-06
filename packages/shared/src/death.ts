import {z} from 'zod';
import {floorHeight,isWalkable} from './world.js';

/**
 * Death (docs/sistemas/morte.md). The room decides everything; the clients draw what this timeline says, from the plan the room sends.
 * Clip durations are the real ones of assets-bar/skins/Morte/morte_0X_*.glb (24 fps).
 */
export const DEATH_CLIPS={
  rise:{file:'morte_01_surgindo_do_chao',ms:7000},
  float:{file:'morte_02_flutuando_parada',ms:5000},
  strike:{file:'morte_03_golpe_da_foice',ms:4000},
  laugh:{file:'morte_04_risada',ms:5000},
  leave:{file:'morte_05_indo_embora',ms:6000},
} as const;
export type DeathClip=keyof typeof DEATH_CLIPS;
export const DEATH_CLIP_ORDER:readonly DeathClip[]=['rise','float','strike','laugh','leave'];

export const DEATH={
  /** Where the Morte rises, from the victim, and how close she floats before the blow. */
  riseDistance:4.5,attackDistance:1.25,floatSpeed:1.6,minFloatMs:1800,
  /** The scythe lands at frame 64 of 96 of the strike (24 fps). */
  impactMs:Math.round(64/24*1000),
  /** The body is gone by frame 100 of 144 of the leaving clip, when the cloud covers it. */
  takenMs:Math.round(100/24*1000),
  /** Black screen of the victim, in the dark. */
  blackoutMs:5000,
  /** Minigame. A sequence lights its buttons one by one; the player repeats it within the time limit. */
  lengthStart:4,lengthMax:7,
  /** How many sequences must be repeated to come back. The length grows by one with each round won (4, 5, 6, 7 would take four). */
  roundsToWin:1,
  showStepMs:600,showGapMs:150,inputLimitMs:10_000,errorHoldMs:2000,
  /** After this long a death that nobody finished is ended anyway (the player gets out of the dark). */
  maxMs:15*60_000,
} as const;

/** The interaction state that keeps a body still and out of every action, and the one after the cloud swallowed it (the avatar is not drawn). */
export const DEATH_STATE='death';
export const DEATH_GONE_STATE='death-gone';
export const isDeathState=(interaction:string|undefined)=>interaction===DEATH_STATE||interaction===DEATH_GONE_STATE;

export const DEATH_BUTTONS=4;
export type DeathButton=0|1|2|3;
export const deathInputSchema=z.object({button:z.number().int().min(0).max(DEATH_BUTTONS-1)}).strict();

/** What the room tells the sight of the scene: where the Morte rises, where she stops, and when it all started (server clock). */
export interface DeathPlan {
  id:string;
  victim:string;
  startedAt:number;
  /** Where the victim stands, and the Morte's rise point and the point of the blow. */
  vx:number;vy:number;vz:number;
  sx:number;sz:number;ax:number;az:number;
  floatMs:number;
}
export interface DeathFrame {
  clip:DeathClip;
  /** Seconds into the clip (a looping float wraps). */
  time:number;
  x:number;y:number;z:number;
  /** Facing (the same rotation as a player's: forward is (sin, cos)). */
  yaw:number;
  /** 0 before the blow lands, then 1 for the rest of the scene. */
  impacted:boolean;
  /** The victim's body has been taken. */
  taken:boolean;
  /** The whole scene is over. */
  done:boolean;
}
const angleTo=(fromX:number,fromZ:number,toX:number,toZ:number)=>Math.atan2(toX-fromX,toZ-fromZ);
export const deathDurationMs=(plan:Pick<DeathPlan,'floatMs'>)=>DEATH_CLIPS.rise.ms+plan.floatMs+DEATH_CLIPS.strike.ms+DEATH_CLIPS.laugh.ms+DEATH_CLIPS.leave.ms;
export function deathStarts(plan:Pick<DeathPlan,'startedAt'|'floatMs'>):Record<DeathClip,number> {
  const rise=plan.startedAt,float=rise+DEATH_CLIPS.rise.ms,strike=float+plan.floatMs,laugh=strike+DEATH_CLIPS.strike.ms,leave=laugh+DEATH_CLIPS.laugh.ms;
  return {rise,float,strike,laugh,leave};
}

/** Where the scene is at `now` (server clock). Before the start it holds the first frame; after the end, the last. */
export function deathFrame(plan:DeathPlan,now:number):DeathFrame {
  const starts=deathStarts(plan),t=now-plan.startedAt,total=deathDurationMs(plan);
  const faceVictim=angleTo(plan.sx,plan.sz,plan.vx,plan.vz),floorY=plan.vy;
  const at=(clip:DeathClip,x:number,z:number,yaw:number,time:number)=>({clip,time:Math.max(0,time)/1000,x,y:floorY,z,yaw,impacted:now>=starts.strike+DEATH.impactMs,taken:now>=starts.leave+DEATH.takenMs,done:t>=total});
  if(now<starts.float)return at('rise',plan.sx,plan.sz,faceVictim,Math.min(now-starts.rise,DEATH_CLIPS.rise.ms));
  if(now<starts.strike){
    const k=Math.min(1,(now-starts.float)/plan.floatMs),eased=k*k*(3-2*k);
    return at('float',plan.sx+(plan.ax-plan.sx)*eased,plan.sz+(plan.az-plan.sz)*eased,faceVictim,((now-starts.float)%DEATH_CLIPS.float.ms));
  }
  const yaw=angleTo(plan.ax,plan.az,plan.vx,plan.vz);
  if(now<starts.laugh)return at('strike',plan.ax,plan.az,yaw,now-starts.strike);
  if(now<starts.leave)return at('laugh',plan.ax,plan.az,yaw,now-starts.laugh);
  return at('leave',plan.ax,plan.az,yaw,Math.min(now-starts.leave,DEATH_CLIPS.leave.ms));
}

/** Plans the scene round a victim: the first direction (their front first) where the Morte can rise and float to the blow on foot. */
export function planDeath(id:string,victim:{id:string;x:number;y:number;z:number;rotation:number},startedAt:number):DeathPlan {
  const y=victim.y,walkable=(x:number,z:number)=>isWalkable(x,z,floorHeight(x,z,y)??y);
  let best:{sx:number;sz:number;ax:number;az:number}|undefined;
  // Distances shrink when the room is tight; the Morte always rises somewhere, even over the victim's own spot as the last resort.
  for(const distance of [DEATH.riseDistance,3.4,2.6]){
    for(let step=0;step<12&&!best;step++){
      const turn=step%2?Math.ceil(step/2):-Math.ceil(step/2),angle=victim.rotation+(step===0?0:turn*Math.PI/6),dx=Math.sin(angle),dz=Math.cos(angle);
      const sx=victim.x+dx*distance,sz=victim.z+dz*distance,ax=victim.x+dx*DEATH.attackDistance,az=victim.z+dz*DEATH.attackDistance;
      const clear=[0,.25,.5,.75,1].every(k=>walkable(sx+(ax-sx)*k,sz+(az-sz)*k));
      if(clear)best={sx,sz,ax,az};
    }
    if(best)break;
  }
  best??={sx:victim.x+Math.sin(victim.rotation)*DEATH.attackDistance,sz:victim.z+Math.cos(victim.rotation)*DEATH.attackDistance,ax:victim.x+Math.sin(victim.rotation)*DEATH.attackDistance,az:victim.z+Math.cos(victim.rotation)*DEATH.attackDistance};
  const away=Math.hypot(best.ax-best.sx,best.az-best.sz);
  return {id,victim:victim.id,startedAt,vx:victim.x,vy:y,vz:victim.z,...best,floatMs:Math.max(DEATH.minFloatMs,Math.round(away/DEATH.floatSpeed*1000))};
}

/** Messages to the victim only (the dark, the phrase, the buttons). The server validates every press. */
export type DeathScreen=
  |{id:string;phase:'blackout';until:number;phrase:string}
  /** The sequence is shown button by button from `showStartedAt` (server clock); the player may press from `inputFrom`, until `until`. */
  |{id:string;phase:'play';sequence:number[];showStartedAt:number;inputFrom:number;until:number;round:number}
  /** A mistake: the red phrase for `until`, then a new sequence. */
  |{id:string;phase:'error';until:number;phrase:string}
  /** A correct press, so the button can light: `progress` of `length` done. */
  |{id:string;phase:'press';button:number;progress:number;length:number}
  |{id:string;phase:'won'|'end'};
export const SCENE_AUDIO_RADIUS=40;

/** The length of the n-th sequence (0-based) of a death: it starts at 4 and grows by one per round won, up to 7. */
export const sequenceLength=(roundsWon:number)=>Math.min(DEATH.lengthMax,DEATH.lengthStart+Math.max(0,roundsWon));
export function randomSequence(length:number,random:()=>number=Math.random):number[] {
  const sequence:number[]=[];
  for(let i=0;i<length;i++)sequence.push(Math.min(DEATH_BUTTONS-1,Math.floor(random()*DEATH_BUTTONS)));
  return sequence;
}
/** When the player may start repeating: the whole sequence has been shown. */
export const showDurationMs=(length:number)=>length*(DEATH.showStepMs+DEATH.showGapMs);
