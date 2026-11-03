export type TrucoTeam=0|1;
export type TrickOutcome=TrucoTeam|'tie';

/**
 * Who has the hand after these tricks, or undefined if another trick is needed.
 * Won two: the hand. First tied: the next trick that is not a tie decides. Second or third tied: whoever won the first.
 * Three ties: 'tie'.
 */
export function handWinner(tricks:readonly TrickOutcome[]):TrickOutcome|undefined {
  const [a,b,c]=tricks;
  if(a===undefined||b===undefined)return undefined;
  if(a==='tie'&&b==='tie')return c;
  if(a==='tie')return b;
  if(b==='tie'||a===b)return a;
  return c==='tie'?a:c;
}
/** The call that stands on a hand: who made it, and if a card already lay face up in the trick when they did. */
export interface StandingCall {team:TrucoTeam;exposed:boolean}
export interface TieRuling {team:TrucoTeam|null;points:number;reason:string}
/**
 * Three tied tricks. Without a call nobody scores, and in the Mão de Ferro neither. In a Mão de 11 the team that chose to
 * play it loses three. With a call someone gets three: whoever called with a card exposed loses on a tie, whoever called
 * in the dark "joga pelo empate", the tie is theirs.
 */
export function tieRuling(context:{iron:boolean;elevenTeam:TrucoTeam|null;call:StandingCall|null}):TieRuling {
  if(context.iron)return {team:null,points:0,reason:'Empate na Mão de Ferro: ninguém ganha tentos'};
  if(context.elevenTeam!==null)return {team:context.elevenTeam===0?1:0,points:3,reason:'Empate na Mão de 11: três tentos aos adversários'};
  if(!context.call)return {team:null,points:0,reason:'Três empates sem trucada: ninguém ganha tentos'};
  const {team,exposed}=context.call;
  return exposed?{team:team===0?1:0,points:3,reason:'Três empates: quem trucou com carta exposta perde'}:{team,points:3,reason:'Três empates: quem trucou no escuro joga pelo empate'};
}
