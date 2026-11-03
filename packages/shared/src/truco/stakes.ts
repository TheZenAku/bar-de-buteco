/**
 * What a match is worth. Against NPCs the level sets it, per person; with people on both teams the table chooses, from a
 * minimum up. Whoever wins gets back twice their part: everyone's parts added up and divided by two.
 */
export const TRUCO_LEVELS=['iniciante','medio','experiente'] as const;
export type TrucoLevel=(typeof TRUCO_LEVELS)[number];
export const TRUCO_LEVEL_INFO:Record<TrucoLevel,{label:string;stake:number;npcs:string}>={
  iniciante:{label:'Iniciante',stake:100,npcs:'NPCs iniciantes'},
  medio:{label:'Médio',stake:150,npcs:'NPCs de nível médio'},
  experiente:{label:'Experiente',stake:200,npcs:'NPCs experientes'},
};
/** Between people, per person. */
export const TRUCO_BET={minBet:400,maxBet:5000,step:100} as const;
export const TRUCO_MAX_RETURN=2;
export interface TrucoStakes {levels:Record<TrucoLevel,number>;min:number;max:number}
/** The values from the price table: the maximum is never under the minimum. */
export function trucoStakes(prices:Readonly<Record<string,number>>):TrucoStakes {
  const min=Math.max(1,prices['truco:min-bet']??TRUCO_BET.minBet);
  return {
    levels:{iniciante:prices['truco:level-iniciante']??TRUCO_LEVEL_INFO.iniciante.stake,medio:prices['truco:level-medio']??TRUCO_LEVEL_INFO.medio.stake,experiente:prices['truco:level-experiente']??TRUCO_LEVEL_INFO.experiente.stake},
    min,max:Math.max(min,prices['truco:max-bet']??TRUCO_BET.maxBet),
  };
}
