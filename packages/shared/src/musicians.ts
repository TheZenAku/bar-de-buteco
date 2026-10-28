import {STAGE} from './world.js';

/**
 * The musicians on the stage (16_animacoes_palco.py). At each spot (Palco_Lugar_*: violão, cavaquinho, bateria, vocal)
 * one player at a time plays four clips of its GLB (public/palco): taking the instrument ('entrando'), starting
 * ('comecando'), the loop, and putting it back ('saindo'), after which ('fim') the spot is free again.
 * The room owns who plays where and when the current phase began; the take and start clips run into the next phase by
 * themselves, so every client derives them from the clips' lengths (map-data) with musicianPhase, as the room does.
 */
export const STAGE_SPOTS=STAGE.places;
export type StageSpot=(typeof STAGE_SPOTS)[number];
export const STAGE_PHASES=['entrando','comecando','loop','saindo'] as const;
export type StagePhase=typeof STAGE_PHASES[number]|'fim';
/** One spot as the room syncs it (BarState.musicians): who plays there ('' when free), the phase and when it began (server ms). */
export interface MusicianState {
  id:string;playerId:string;phase:StagePhase|'';startedAt:number;
  /** Asked to stop before the loop began: the stop clip follows the start at once. */
  stopping:boolean;
}
export const MUSICIANS={
  /** Seconds the body blends into the take clip and from the loop into the stop clip (palco_musicos.js TRANSICAO). */
  blendSeconds:.35,
  /** Seconds back to the idle pose once the stop clip has ended. */
  releaseSeconds:.3,
  /** A musician whose connection dropped stops playing after this long (ms), which frees the spot. */
  dropMs:10_000,
} as const;
export const stageSpot=(id:string):StageSpot|undefined=>STAGE_SPOTS.find(spot=>spot.id===id);
/** Milliseconds of a phase's clip at a spot ('fim' has none). */
export function phaseMs(spot:StageSpot,phase:StagePhase):number {
  const index=STAGE_PHASES.indexOf(phase as typeof STAGE_PHASES[number]);
  return index<0?0:Math.round(spot.animation.durations[index]!*1000);
}
/**
 * The phase playing at `now` and when it began, from the synced one: the take, start and stop clips each run once into
 * the next, the loop repeats until the room starts the stop. Undefined for a free spot.
 */
export function musicianPhase(state:Pick<MusicianState,'id'|'phase'|'startedAt'|'stopping'>,now:number):{phase:StagePhase;startedAt:number}|undefined {
  const spot=stageSpot(state.id);
  if(!spot||!state.phase)return;
  let phase:StagePhase=state.phase,startedAt=state.startedAt;
  while(phase!=='loop'&&phase!=='fim'){
    const ends=startedAt+phaseMs(spot,phase);
    if(now<ends)break;
    startedAt=ends;
    phase=phase==='entrando'?'comecando':phase==='comecando'?(state.stopping?'saindo':'loop'):'fim';
  }
  return {phase,startedAt};
}
