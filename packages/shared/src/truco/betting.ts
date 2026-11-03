/** A value a call brings the hand to, and the value before it: refusing pays the caller what the hand was worth. */
export type TrucoCallValue=3|6|9|12;
const LADDER:ReadonlyArray<{value:TrucoCallValue;label:string;from:number}>=[
  {value:3,label:'Truco',from:1},{value:6,label:'Seis',from:3},{value:9,label:'Nove',from:6},{value:12,label:'Doze',from:9},
];
export const callLabel=(value:number)=>LADDER.find(step=>step.value===value)?.label??'';
/** The step above a hand worth `value`, if there is one. */
export const nextCall=(value:number)=>LADDER.find(step=>step.from===value);
/**
 * The limit of points (rulebook: "quem tem nove tentos não pode retrucar com seis, somente no caso de empate"): when what
 * the hand is already worth closes the match for a team, it may not raise it further, unless the score is level.
 */
export function mayRaise(score:readonly [number,number],team:0|1,to:TrucoCallValue,target:number):boolean {
  const step=LADDER.find(s=>s.value===to)!;
  return score[team]+step.from<target||score[0]===score[1];
}
