/** The deck: 40 cards (no 8, 9, 10 or jokers). Weakest to strongest, as the rulebook ranks them. */
export const TRUCO_RANKS=['4','5','6','7','Q','J','K','A','2','3'] as const;
/** The manilhas' suits, weakest to strongest: only they break a tie between two cards of the same rank. */
export const TRUCO_SUITS=['ouros','espadas','copas','paus'] as const;
export type TrucoRank=(typeof TRUCO_RANKS)[number];
export type TrucoSuit=(typeof TRUCO_SUITS)[number];
/** A card someone can see, or one lying face down ('?'). `id` is its place in the hand's deal and says nothing about what it is. */
export interface TrucoCard {id:string;rank:TrucoRank|'?';suit:TrucoSuit|''}
/** A card whose face is known. */
export type TrucoFace=TrucoCard&{rank:TrucoRank;suit:TrucoSuit};
/** A whole number below `n`: the room passes crypto.randomInt, tests a seeded one. */
export type TrucoRandom=(n:number)=>number;

export const MANILHA_NAMES:Record<TrucoSuit,string>={paus:'Zap',copas:'Copeta',espadas:'Espadilha',ouros:'Pica-fumo'};

/** The rank after the vira; after the 3 comes the 4. */
export const manilhaRank=(vira:TrucoRank):TrucoRank=>TRUCO_RANKS[(TRUCO_RANKS.indexOf(vira)+1)%TRUCO_RANKS.length]!;
export const isManilha=(card:{rank:string},vira:{rank:string})=>vira.rank!=='?'&&card.rank===manilhaRank(vira.rank as TrucoRank);
/** The rank's place, 0–9, or above them all for a manilha, by suit. Two ordinary cards of a rank tie, whatever their suits. */
export function cardStrength(card:{rank:string;suit:string},vira:{rank:string}):number {
  if(isManilha(card,vira))return TRUCO_RANKS.length+TRUCO_SUITS.indexOf(card.suit as TrucoSuit);
  return TRUCO_RANKS.indexOf(card.rank as TrucoRank);
}
export function newTrucoDeck():Array<Omit<TrucoFace,'id'>> {
  return TRUCO_RANKS.flatMap(rank=>TRUCO_SUITS.map(suit=>({rank,suit})));
}
/** Fisher–Yates. */
export function shuffled<T>(list:readonly T[],random:TrucoRandom):T[] {
  const out=[...list];
  for(let i=out.length-1;i>0;i--){const j=random(i+1);[out[i],out[j]]=[out[j]!,out[i]!];}
  return out;
}
const BY_STRENGTH=(a:{strength:number},b:{strength:number})=>b.strength-a.strength;
/**
 * Cards that win the hand whatever the opponents hold (rulebook: "cartas a provar vitória garantida", e.g. Casal Maior).
 * The team plays its best three in different tricks and needs two of them. Against the strongest cards still unseen, a
 * strongest card always wins, and only the second strongest unseen could beat its third card.
 */
export function provenWin(cards:ReadonlyArray<{rank:string;suit:string}>,vira:TrucoFace|{rank:string;suit:string}):boolean {
  const own=cards.map(c=>({strength:cardStrength(c,vira)})).sort(BY_STRENGTH).map(c=>c.strength),seen=new Set(cards.map(c=>`${c.rank}${c.suit}`));
  seen.add(`${vira.rank}${vira.suit}`);
  const unseen=newTrucoDeck().filter(c=>!seen.has(`${c.rank}${c.suit}`)).map(c=>({strength:cardStrength(c,vira)})).sort(BY_STRENGTH).map(c=>c.strength);
  const [a=-1,b=-1,c=-1]=own,[x=-1,y=-1]=unseen;
  return a>x&&(b>x||c>y);
}
/** The two highest manilhas, Zap and Copeta, on one team. */
export const hasCasalMaior=(cards:ReadonlyArray<{rank:string;suit:string}>,vira:{rank:string})=>
  cards.some(c=>isManilha(c,vira)&&c.suit==='paus')&&cards.some(c=>isManilha(c,vira)&&c.suit==='copas');
