import {z} from 'zod';
import type {TrucoCard,TrucoFace} from './cards.js';
import type {TrucoCallValue} from './betting.js';
import {TRUCO_SIGNALS,type TrucoPhase,type TrucoPlay,type TrucoResult,type TrucoSignal,type TrucoTrick} from './game.js';
import type {TrucoPersonality} from './ai.js';
import {TRUCO_LEVELS,type TrucoLevel} from './stakes.js';
import type {TrucoTeam} from './scoring.js';

export * from './cards.js';
export * from './betting.js';
export * from './scoring.js';
export * from './game.js';
export * from './ai.js';
export * from './stakes.js';

export const trucoJoinSchema=z.object({tableId:z.literal('truco-1')}).strict();
export const trucoSeatSchema=z.object({seat:z.number().int().min(0).max(3)}).strict();
export const trucoConfigSchema=z.object({level:z.enum(TRUCO_LEVELS).optional(),stake:z.number().int().min(1).max(1_000_000).optional(),dark:z.boolean().optional()}).strict();
export const trucoReadySchema=z.object({ready:z.boolean()}).strict();
export const trucoPlaySchema=z.object({card:z.string().min(1).max(24),hidden:z.boolean().optional()}).strict();
export const trucoAnswerSchema=z.object({answer:z.enum(['accept','raise','run']),to:z.number().int().min(3).max(12)}).strict();
export const trucoElevenSchema=z.object({answer:z.enum(['play','run','show'])}).strict();
export const trucoSignalSchema=z.object({signal:z.enum(TRUCO_SIGNALS)}).strict();

/** The face beside every player, and the four faces the rulebook's signs became. */
export const NEUTRAL_FACE='😐';
export const SIGNAL_FACES:Record<TrucoSignal,{face:string;manilha:string;gesture:string}>={
  zap:{face:'😉',manilha:'Zap',gesture:'Piscar um olho'},
  copeta:{face:'🤨',manilha:'Copeta',gesture:'Erguer a sobrancelha'},
  espadilha:{face:'😕',manilha:'Espadilha',gesture:'Entortar a boca'},
  'pica-fumo':{face:'😛',manilha:'Pica-fumo',gesture:'Mostrar a ponta da língua'},
};

export interface TrucoLook {tone:number;hair:number;hairColor:number;facial:number;glasses:number;shirt:number;bg:number}
export interface TrucoSeatView {
  seat:number;team:TrucoTeam;name:string;kind:'human'|'npc'|'empty';id?:string;color?:string;look?:TrucoLook;personality?:string;personalityId?:TrucoPersonality;cards:number;
  say?:{text:string;tone?:'taunt'|'calm';key:number};
  /** In the lobby: this person said yes to the stake. */
  ready?:boolean;
  /** The last face shown: a browser flashes it when `key` changes. */
  signal?:{signal:TrucoSignal;key:number};
}
/** A call waiting for an answer. */
export interface TrucoBetView {by:number;label:string;from:number;to:TrucoCallValue;raiseTo?:TrucoCallValue;raiseLabel?:string;runAway:number;mine:boolean;answering:boolean;waitingFor?:string}
export interface TrucoElevenView {team:TrucoTeam;mine:boolean;partnerCards?:TrucoCard[];casalMaior?:boolean;canShow?:boolean;waitingFor?:string}
/**
 * What one seat sees of the table. The room sends it to that player alone, so nobody else's hand is ever on their browser:
 * the other seats only have a count of cards, and `partnerCards` only exists while the rules let the partner's hand be seen.
 */
export interface TrucoView {
  id:string;mode:string;phase:TrucoPhase|'lobby';handNumber:number;
  selfSeat:number;seats:TrucoSeatView[];dealer:number;turn:number|null;
  /** Server clock (ms) when the turn or the answer runs out, and how long it was. */
  deadline:number;turnMs:number;
  score:[number,number];target:number;handValue:number;callLabel:string;
  vira:TrucoFace|null;deck:number;mine:TrucoCard[];table:TrucoPlay[];tricks:TrucoTrick[];
  canCall?:{value:TrucoCallValue;label:string};
  /** Your card may go face down: from the second trick on, on your turn. */
  canHide?:boolean;
  bet?:TrucoBetView;eleven?:TrucoElevenView;iron?:{dark:boolean};
  result?:TrucoResult;
  log:string[];
  /** Before the match: what it is worth and what can be chosen. */
  lobby?:{level:TrucoLevel;dark:boolean;betweenPeople:boolean;stake:number;min:number;max:number;step:number;levels:Array<{id:TrucoLevel;label:string;stake:number;npcs:string}>;taking:boolean};
  /** What you have in play. */
  stake?:number;
  /** What the match came to for you, once it ended: won or lost, net. */
  prize?:number;
}
