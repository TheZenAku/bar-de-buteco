import {z} from 'zod';
import {POOL_LEVELS,type PoolLevel} from './ai.js';
import {POOL_PHYSICS,type PoolStroke,type PoolTrack} from './physics.js';
import type {PoolFoul,PoolSeat} from './rules.js';
import {POOL_TABLE_IDS,type PoolBallSpot,type PoolGroup} from './table.js';
import {TRUCO_BET,TRUCO_LEVEL_INFO} from '../truco/stakes.js';
export * from './table.js';
export * from './physics.js';
export * from './aim.js';
export * from './rules.js';
export * from './ai.js';

/**
 * Sinuca, bola 8 (docs/sistemas/sinuca.md): the room owns each table (apps/server/src/minigames/pool.ts), runs every
 * stroke through the physics at once and sends its recorded paths (pool.shot) to whoever is at or near the table, who
 * play them back on the server's clock. The table's state goes by message too (pool.view), on every change.
 */
export const POOL={
  /** A turn to aim (the clock runs out: the turn passes), a choice (the coin toss, the 8 on the break), the coin toss. */
  aimMs:60_000,choiceMs:20_000,
  /** After the balls stop, the verdict waits this long (the last ball settles); the result stays this long on the table. */
  settleMs:500,finishedMs:15_000,
  /** How long a match waits for a player whose connection dropped (then the house's player takes the seat or they lose). */
  pauseMs:25_000,
} as const;

/**
 * What a match is worth, the truco table's way: against Juca the level sets it, per person; between two people the table
 * chooses, from a minimum up. The winner gets back twice their part; the house covers Juca's (price table pool:*).
 */
export const POOL_LEVEL_STAKES:Record<PoolLevel,number>={facil:TRUCO_LEVEL_INFO.iniciante.stake,medio:TRUCO_LEVEL_INFO.medio.stake,dificil:TRUCO_LEVEL_INFO.experiente.stake};
/** Between people, per person. */
export const POOL_BET={minBet:TRUCO_BET.minBet,maxBet:TRUCO_BET.maxBet,step:TRUCO_BET.step} as const;
export const POOL_MAX_RETURN=2;
export interface PoolStakes {levels:Record<PoolLevel,number>;min:number;max:number}
/** The values from the price table: the maximum is never under the minimum. */
export function poolStakes(prices:Readonly<Record<string,number>>):PoolStakes {
  const min=Math.max(1,prices['pool:min-bet']??POOL_BET.minBet);
  return {levels:{facil:prices['pool:level-facil']??POOL_LEVEL_STAKES.facil,medio:prices['pool:level-medio']??POOL_LEVEL_STAKES.medio,dificil:prices['pool:level-dificil']??POOL_LEVEL_STAKES.dificil},
    min,max:Math.max(min,prices['pool:max-bet']??POOL_BET.maxBet)};
}

export type PoolPhase='lobby'|'aim'|'rolling'|'choice'|'paused'|'finished';
export type PoolChoiceKind='toss'|'eight-break';
export interface PoolSeatView {seat:PoolSeat;playerId:string;displayName:string;cpu:PoolLevel|'';ready:boolean;connected:boolean;
  /** Racks won since they sat down (the scoreboard of rematches). */
  racks:number;
  /** Coins this player has in the match, and what the last one left them (+ won, − lost). */
  staked:number;prize:number}
export interface PoolFeedItem {id:number;kind:'foul'|'pot'|'info'|'win'|'turn';text:string}
export interface PoolTableView {
  id:string;phase:PoolPhase;seats:PoolSeatView[];hostId:string;level:PoolLevel;
  /** Whose shot it is, who broke this rack and whether the next shot is the break. */
  turn:PoolSeat;breaker:PoolSeat;breaking:boolean;
  groups:[PoolGroup|'',PoolGroup|''];benefit:-1|PoolSeat;
  /** The balls on the table, flat: number, x and y in tenths of a millimetre. */
  balls:number[];
  /** Balls pocketed in this rack, in order. */
  pocketed:number[];
  /** The cue ball may be put anywhere in the quadro (the break). */
  placing:boolean;
  choice:{seat:PoolSeat;kind:PoolChoiceKind;foul:boolean}|null;
  /** When the phase ends (server ms; 0 when it does not end by itself). */
  deadline:number;
  /** The stroke counter (a stroke names the one it is for) and the rack's number. */
  shot:number;rack:number;
  lastFouls:PoolFoul[];feed:PoolFeedItem[];
  winner:-1|PoolSeat;reason:string;message:string;
  /** What the match is worth per person: Juca's level's stake, or the one the table chose between two people; the levels'
   *  stakes, the limits between people, and whether the stakes are being taken (the lobby is locked meanwhile). */
  stake:number;betweenPeople:boolean;levelStakes:Record<PoolLevel,number>;minBet:number;maxBet:number;step:number;taking:boolean;
  revision:number;
}
/** A stroke's playback: when it started on the server's clock, how long the balls roll, and each moving ball's path. */
export interface PoolShotView {tableId:string;shot:number;startAt:number;duration:number;stroke:PoolStroke;
  /** Each moving ball: [n, end (0 still, 1 pocket, 2 off the table), pocket, then t (ms), x, y (0.1 mm), t, x, y…]. */
  tracks:number[][];
  /** [t ms, kind, speed cm/s] for each sound (PoolSoundKind). */
  sounds:number[]}
/** Where the shooter aims, for the others at the table to see (relayed, up to 10 a second). */
export interface PoolAimView {tableId:string;angle:number;power:number;spinX:number;spinY:number;elevation:number;cue?:{x:number;y:number}}

export const encodeBalls=(balls:readonly PoolBallSpot[])=>balls.flatMap(b=>[b.n,Math.round(b.x*1e4),Math.round(b.y*1e4)]);
export function decodeBalls(flat:readonly number[]):PoolBallSpot[] {
  const out:PoolBallSpot[]=[];
  for(let i=0;i+2<flat.length;i+=3)out.push({n:flat[i]!,x:flat[i+1]!/1e4,y:flat[i+2]!/1e4});
  return out;
}
const END={stop:0,pocket:1,off:2} as const;
export function encodeTracks(tracks:readonly PoolTrack[]):number[][] {
  return tracks.map(t=>{const row=[t.n,END[t.end],t.pocket];for(let i=0;i<t.t.length;i++)row.push(t.t[i]!,t.x[i]!,t.y[i]!);return row;});
}
export function decodeTracks(rows:readonly number[][]):PoolTrack[] {
  return rows.map(row=>{
    const t:number[]=[],x:number[]=[],y:number[]=[];
    for(let i=3;i+2<row.length;i+=3){t.push(row[i]!);x.push(row[i+1]!);y.push(row[i+2]!);}
    return {n:row[0]!,end:(['stop','pocket','off'] as const)[row[1]!]??'stop',pocket:row[2]!,t,x,y};
  });
}
/** A ball's place on its path at `ms` into the stroke (metres), and whether it is still on the table then. */
export function trackAt(track:PoolTrack,ms:number):{x:number;y:number;gone:boolean} {
  const {t,x,y}=track,last=t.length-1;
  if(last<0)return {x:0,y:0,gone:false};
  if(ms<=t[0]!)return {x:x[0]!/1e4,y:y[0]!/1e4,gone:false};
  if(ms>=t[last]!)return {x:x[last]!/1e4,y:y[last]!/1e4,gone:track.end!=='stop'};
  let lo=0,hi=last;
  while(hi-lo>1){const mid=(lo+hi)>>1;if(t[mid]!<=ms)lo=mid;else hi=mid;}
  const k=(ms-t[lo]!)/Math.max(1,t[hi]!-t[lo]!);
  return {x:(x[lo]!+(x[hi]!-x[lo]!)*k)/1e4,y:(y[lo]!+(y[hi]!-y[lo]!)*k)/1e4,gone:false};
}

// What the browser sends. The player comes from the session, never from the message.
const tableId=z.enum(POOL_TABLE_IDS);
const stroke={angle:z.number().finite().min(-10).max(10),power:z.number().finite().min(0).max(1),spinX:z.number().finite().min(-1).max(1),
  spinY:z.number().finite().min(-1).max(1),elevation:z.number().finite().min(0).max(POOL_PHYSICS.maxElevation)};
const cue=z.object({x:z.number().finite().min(-1).max(1),y:z.number().finite().min(-1).max(1)}).strict();
export const poolJoinSchema=z.object({tableId,seat:z.number().int().min(0).max(1).optional()}).strict();
export const poolWatchSchema=z.object({tableId:z.union([tableId,z.literal('')])}).strict();
export const poolSeatSchema=z.object({seat:z.number().int().min(0).max(1)}).strict();
export const poolCpuSchema=z.object({on:z.boolean()}).strict();
export const poolConfigSchema=z.object({level:z.enum(POOL_LEVELS as [PoolLevel,...PoolLevel[]]).optional(),stake:z.number().int().min(1).max(1_000_000).optional()}).strict();
export const poolReadySchema=z.object({ready:z.boolean()}).strict();
export const poolAimSchema=z.object({...stroke,cue:cue.optional()}).strict();
/** A stroke: `shot` is the table's stroke counter it was aimed for (a stale one is refused). */
export const poolShotSchema=z.object({shot:z.number().int().min(0).max(1_000_000),...stroke,cue:cue.optional()}).strict();
export const poolChoiceSchema=z.object({choice:z.enum(['break','pass','spot','rerack'])}).strict();
