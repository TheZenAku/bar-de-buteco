import {z} from 'zod';
import {MAP_MARKERS} from './world.js';
import type {PunchId,PressKind} from './fight.js';

/**
 * Zeca's sparring (docs/sistemas/zeca.md): an NPC on the terrace who challenges whoever talks to him to a fist fight. Winning pays coins, XP and badges.
 * Nobody picks a difficulty: each player has a step in a ladder of three (easy, medium, hard) kept by the API; a win pays that step's prize and moves them up,
 * beating the hardest one starts the ladder over. The fight itself is the fist fight (fight.ts) with a bot at the other end (apps/server/src/world/sparring.ts).
 */
export const SPARRING_NPC='sparring',SPARRING_FOE_PREFIX='sparring:';
export const SPARRING={
  name:'Zeca',skin:'tiao',
  /** Where he stands (the terrace upstairs: the biggest free floor of the bar), facing the stairs. */
  spot:{x:MAP_MARKERS.Ponto_Terraco!.x,y:MAP_MARKERS.Ponto_Terraco!.y,z:MAP_MARKERS.Ponto_Terraco!.z,rotation:Math.PI},
  /** How near to talk to him (m), how far the fight may drift from him before it is called off (m), and how long it may last (ms). */
  reach:3.2,leash:14,maxMs:180_000,
  /** The count before the first blow (ms), and how long the loser or winner is left lying before he is back on his feet (ms). */
  countdownMs:3000,afterMs:3500,
  /** A fighter's life in the ring: it is the fight's own (apart from the real life bar, which a sparring never touches). */
  playerHp:100,
  /** A win pays once per this long (ms), except for administrators. */
  cooldownMs:6*60*60*1000,
} as const;

export type SparringTierId='easy'|'medium'|'hard';
/** How a fighter of the ladder behaves: see SparringAI in apps/server/src/world/sparring.ts. */
export interface SparringTier {
  id:SparringTierId;
  /** The prize in coins for beating it. */
  prize:number;
  /** His life; and how much of each blow of his lands (the player's life is the fight's own, SPARRING.playerHp). */
  hp:number;damage:number;
  /** Reacting to a blow of the player's: how long before he sees it coming (ms), how often he blocks it, and how often that block is a parry. */
  reactMs:number;block:number;parry:number;
  /** The wait between his combos (ms, from and to), and the combos he draws from (what each press of the combo asks for). */
  gapMs:readonly [number,number];combos:readonly (readonly PressKind[])[];
  /** Whether he circles the player instead of standing in front of him. */
  circles:boolean;
}
export const SPARRING_TIERS:readonly SparringTier[]=[
  {id:'easy',prize:100,hp:70,damage:.6,reactMs:520,block:.12,parry:0,gapMs:[1700,2800],combos:[['light'],['light','light']],circles:false},
  {id:'medium',prize:200,hp:100,damage:.9,reactMs:300,block:.4,parry:.12,gapMs:[1000,1900],combos:[['light','light'],['light','light','light'],['light','heavy']],circles:false},
  {id:'hard',prize:300,hp:130,damage:1.1,reactMs:170,block:.62,parry:.35,gapMs:[600,1300],combos:[['light','light','light'],['light','light','heavy'],['light','heavy','light'],['heavy']],circles:true},
];
export const sparringTier=(index:number):SparringTier=>SPARRING_TIERS[Math.max(0,Math.min(SPARRING_TIERS.length-1,Math.floor(index)||0))]!;
/** The step after a win: one up, and back to the first after the last. */
export const nextSparringTier=(index:number):number=>(Math.max(0,Math.floor(index)||0)+1)%SPARRING_TIERS.length;
/** Achievement series fed by a win (achievements.ts): every win, and wins on the hardest step. */
export const SPARRING_SERIES={wins:'sparring',hard:'quebra-queixo'} as const;

/** What the API knows of a player's ladder: the step they are on, the wait left for the prize (0 when they can fight for it), and whether there is none for them. */
export interface SparringStatus {tier:number;cooldownMs:number;unlimited:boolean}
export interface SparringClaim extends SparringStatus {prize:number;balance:number;/** The step that was beaten. */beaten:number}
export const sparringStatusRequestSchema=z.object({userId:z.string().uuid()}).strict();
export const sparringClaimRequestSchema=z.object({userId:z.string().uuid(),requestId:z.string().uuid()}).strict();

/** What the room tells the browser (sparring.dialog), when the player talks to him. `can`: whether the fight is on offer now. */
export interface SparringDialog {line:string;can:boolean;busy?:boolean;cooldownMs?:number}
/** The fight as the browser shows it (sparring.state): the phase, both lives, and the clock of the count or of the round (room time, ms). */
export interface SparringState {
  phase:'countdown'|'fight'|'won'|'lost'|'off';
  foe:{name:string;hp:number;max:number};you:{hp:number;max:number};
  /** The end of the count (countdown) or of the round (fight); room time. */
  until:number;
}
/** How a fight ended (sparring.result), with what it paid. */
export interface SparringResult {won:boolean;reason:'ko'|'down'|'left'|'time';prize:number;balance?:number;message:string;cooldownMs?:number}

/** The one who talks to him is near enough. */
export const nearSparring=(from:{x:number;z:number;y?:number}):boolean=>Math.hypot(from.x-SPARRING.spot.x,from.z-SPARRING.spot.z)<=SPARRING.reach&&Math.abs((from.y??SPARRING.spot.y)-SPARRING.spot.y)<1.2;

/** The moves a combo of presses throws, in order, as the shared rules allow (fight.ts punchAllowed): for tests and the bot. */
export type ComboMoves=readonly PunchId[];
