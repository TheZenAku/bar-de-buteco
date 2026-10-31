import {z} from 'zod';

/**
 * Blackjack at the upstairs table, as casinos deal it: six decks shuffled again for every round (nothing to count), the
 * dealer stands on every 17 (S17) and peeks for a natural under an ace or a ten, a natural pays 3:2 and insurance 2:1,
 * double on any first two cards (also after a split), split equal values up to four hands (split aces take one card each),
 * late surrender on the first two cards. The room is the only one who knows the shoe and the hole card
 * (apps/server/src/minigames/blackjack.ts); bets are real coins (docs/sistemas/blackjack.md).
 */
export const BLACKJACK={
  decks:6,
  maxHands:4,
  /** Bet limits when the price table has none (blackjack:min-bet, blackjack:max-bet). */
  minBet:10,maxBet:500,
  /** The chips on the tray, smallest first. */
  chips:[5,10,25,100,500] as const,
  /** After the first bet, how long the others have to bet; once everyone seated has bet, the deal comes this soon. */
  betMs:12_000,allBetMs:1_500,
  /** Between two cards of the deal (the browsers fly them in at the same pace). */
  dealStepMs:350,
  insuranceMs:8_000,
  /** Each decision; the room's BLACKJACK_TURN_MS overrides it. Out of time, the hand stands. */
  turnMs:20_000,
  /** Between two of the dealer's cards, and before the totals once the hole card is turned. */
  dealerStepMs:850,
  resultsMs:7_000,
} as const;

export type BlackjackPhase='waiting'|'betting'|'closing'|'dealing'|'insurance'|'playing'|'dealer'|'results';
export type BlackjackAction='hit'|'stand'|'double'|'split'|'surrender';
export type HandOutcome='blackjack'|'win'|'push'|'loss'|'bust'|'surrender';
export const BLACKJACK_ACTIONS:readonly BlackjackAction[]=['hit','stand','double','split','surrender'];

export const isTenValue=(rank:string)=>rank==='10'||rank==='J'||rank==='Q'||rank==='K';
/** An ace counts 11 here; handValue makes it 1 when needed. */
export const cardValue=(rank:string)=>rank==='A'?11:isTenValue(rank)?10:Number(rank)||0;

/** The best total under 22 if there is one; soft while an ace still counts 11. Hidden cards ('?') count nothing. */
export function handValue(cards:ReadonlyArray<{rank:string}>):{total:number;soft:boolean} {
  let total=0,aces=0;
  for(const {rank} of cards){if(rank==='A')aces++;total+=cardValue(rank);}
  while(total>21&&aces>0){total-=10;aces--;}
  return {total,soft:aces>0};
}
/** Two cards making 21 in a hand that does not come from a split. */
export const isNatural=(cards:ReadonlyArray<{rank:string}>,split=false)=>!split&&cards.length===2&&handValue(cards).total===21;
/** How a total reads at the table: "BJ" for a natural, "7/17" while soft, "22" bust. */
export function totalLabel(cards:ReadonlyArray<{rank:string}>,split=false):string {
  if(!cards.length)return '';
  if(isNatural(cards,split))return 'BJ';
  const {total,soft}=handValue(cards);
  return soft&&total<21?`${total-10}/${total}`:String(total);
}

/**
 * What comes back for a finished hand, its stake included: a natural 3:2 (rounded down, like the casinos' odd chips),
 * a win 1:1, a push the stake, a surrender half of it.
 */
export function handReturn(outcome:HandOutcome,bet:number):number {
  switch(outcome){
    case 'blackjack':return bet+Math.floor(bet*3/2);
    case 'win':return bet*2;
    case 'push':return bet;
    case 'surrender':return Math.floor(bet/2);
    default:return 0;
  }
}
/** Insurance costs half the bet and pays 2:1 when the dealer has a natural. */
export const insuranceCost=(bet:number)=>Math.floor(bet/2);
/** The most a round can give back per coin staked (a natural: 2.5); the API refuses any payment above it. */
export const BLACKJACK_MAX_RETURN=2.5;

/** The table's limits from the price table: the maximum is never under the minimum. */
export function betLimits(prices:Readonly<Record<string,number>>):{min:number;max:number} {
  const min=Math.max(1,prices['blackjack:min-bet']??BLACKJACK.minBet);
  return {min,max:Math.max(min,prices['blackjack:max-bet']??BLACKJACK.maxBet)};
}
/** The chips that make an amount, largest first (how a bet is stacked on the felt). */
export function chipStack(amount:number,chips:readonly number[]=BLACKJACK.chips):number[] {
  const stack:number[]=[];let left=Math.max(0,Math.floor(amount));
  for(const chip of [...chips].sort((a,b)=>b-a))while(left>=chip&&stack.length<40){stack.push(chip);left-=chip;}
  if(left>0)stack.push(left);
  return stack;
}

// What the browser sends. `hand` and `move` (the table's) say which decision the click was for: a double click, or a
// click on a hand that has moved on, is refused instead of drawing a second card.
export const blackjackBetSchema=z.object({amount:z.number().int().min(0).max(1_000_000)}).strict();
export const blackjackActionSchema=z.object({action:z.enum(['hit','stand','double','split','surrender']),hand:z.number().int().min(0).max(BLACKJACK.maxHands-1),move:z.number().int().min(0).max(2_147_483_647)}).strict();
export const blackjackInsuranceSchema=z.object({take:z.boolean()}).strict();
