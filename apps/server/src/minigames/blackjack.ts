import { randomInt, randomUUID } from 'node:crypto';
import { BLACKJACK, cardValue, handReturn, handValue, insuranceCost, isNatural, isTenValue, type BlackjackAction, type BlackjackPhase, type HandOutcome } from '@bar/shared';

export type Suit = '♠' | '♥' | '♦' | '♣';
export interface Card { rank: string; suit: Suit }
/** A card on the felt: `seq` is its place in the round's deal. */
interface Dealt extends Card { seq: number }
/** The round's result for a whole seat (net of every hand and the insurance), for the statistics. */
export type Result = 'win' | 'loss' | 'push';

export interface Hand {
  cards: Dealt[]; bet: number;
  /** Made by a split: 21 is not a natural, there is no surrender, and split aces take a single card. */
  split: boolean; splitAces: boolean;
  doubled: boolean; surrendered: boolean; done: boolean;
  outcome: HandOutcome | null; payout: number;
}
export interface Seat {
  playerId: string; displayName: string;
  /** BLACKJACK_SEATS index; play goes from the dealer's left (chair 3) to chair 0, as dealt in casinos. */
  chair: number;
  /** The bet for the next deal (waiting, betting) or the one in play; lastBet is what to repeat afterwards. */
  bet: number; lastBet: number;
  hands: Hand[];
  insurance: number; insured: '' | 'pending' | 'taken' | 'declined';
  /** Dealt into the current round (their bet was taken). */
  inRound: boolean;
  /** A wallet change for this seat is on its way (bet, double, split, insurance): nothing else until it lands. */
  pending: boolean;
  /** Got up while their coins were in play: their hands stand and are settled, the chair frees afterwards. */
  left: boolean;
  staked: number; paid: number;
}
export interface TableView {
  id: string; phase: BlackjackPhase; round: number; move: number; roundId: string; deadline: number;
  turnPlayerId: string; turnHand: number; minBet: number; maxBet: number;
  dealer: Array<Dealt | { rank: '?'; suit: ''; seq: number }>; dealerTotal: number; dealerSoft: boolean;
  seats: Array<Omit<Seat, 'hands' | 'pending'> & { status: string; result: string; net: number;
    hands: Array<Omit<Hand, 'splitAces' | 'done' | 'surrendered'> & { total: number; soft: boolean; status: string }> }>;
}

/**
 * Where a table's coins go: stake() takes them from the player's wallet (throws, with the reason to show, when it
 * cannot), settle() gives back what the round returned to them (0 after a loss) and must not lose it (the room's
 * BlackjackBank journals it on disk before answering).
 */
export interface TableBank {
  stake(playerId: string, roundId: string, amount: number): Promise<void>;
  settle(roundId: string, playerId: string, payout: number): void;
}
export interface RoundSummary { roundId: string; players: Array<{ playerId: string; staked: number; paid: number; outcomes: HandOutcome[] }> }
export interface TableOptions {
  bank?: TableBank;
  onResult?: (roundId: string, playerId: string, result: Result) => void;
  onRound?: (summary: RoundSummary) => void;
  /** A message for one player that no request is waiting for (their bet could not be taken when the deal closed). */
  onNotice?: (playerId: string, message: string) => void;
  /** The cards in dealing order; a fresh six-deck shoe each round by default. */
  makeShoe?: () => Card[];
  limits?: () => { min: number; max: number };
  timing?: Partial<Record<'betMs' | 'allBetMs' | 'dealStepMs' | 'insuranceMs' | 'turnMs' | 'dealerStepMs' | 'resultsMs', number>>;
  clock?: () => number;
}

const SUITS: readonly Suit[] = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const FREE_BANK: TableBank = { stake: async () => {}, settle: () => {} };

/** `decks` decks shuffled with Fisher–Yates over crypto.randomInt (every order equally likely). */
export function freshShoe(decks: number = BLACKJACK.decks): Card[] {
  const shoe: Card[] = [];
  for (let d = 0; d < decks; d++) for (const suit of SUITS) for (const rank of RANKS) shoe.push({ rank, suit });
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [shoe[i], shoe[j]] = [shoe[j]!, shoe[i]!];
  }
  return shoe;
}
export const handTotal = (cards: readonly Card[]) => handValue(cards).total;

/**
 * One blackjack table, authoritative: the shoe and the hole card never leave it before they are turned, every action is
 * checked against the phase, the turn and the very decision it answers (hand and card count), and every coin goes
 * through the bank. Phases: waiting → betting (the first bet opens a window) → closing (the bets are taken) → dealing →
 * insurance (dealer shows an ace) → playing (each hand in turn) → dealer → results → waiting.
 */
export class BlackjackTable {
  readonly id: string;
  readonly seats: Seat[] = [];
  phase: BlackjackPhase = 'waiting';
  roundId = '';
  /** Rounds dealt since the table opened (the browsers tell a new deal from a repeated state by it). */
  round = 0;
  /** Counts decisions and turn changes: an action names the one it answers, so a repeated click never plays twice. */
  move = 0;
  deadline = 0;
  private dealer: Dealt[] = [];
  private revealed = false;
  private shoe: Card[] = [];
  private seq = 0;
  private turn: { seat: Seat; hand: number } | null = null;
  private readonly bank: TableBank;
  private readonly timing: Required<NonNullable<TableOptions['timing']>>;
  private readonly clock: () => number;

  constructor(id = 'blackjack-1', private readonly options: TableOptions = {}) {
    this.id = id;
    this.bank = options.bank ?? FREE_BANK;
    this.clock = options.clock ?? Date.now;
    const { betMs, allBetMs, dealStepMs, insuranceMs, turnMs, dealerStepMs, resultsMs } = BLACKJACK;
    this.timing = { betMs, allBetMs, dealStepMs, insuranceMs, turnMs, dealerStepMs, resultsMs, ...options.timing };
  }

  get limits(): { min: number; max: number } { return this.options.limits?.() ?? { min: BLACKJACK.minBet, max: BLACKJACK.maxBet }; }
  get turnPlayerId(): string | null { return this.phase === 'playing' ? this.turn?.seat.playerId ?? null : null; }
  seat(playerId: string): Seat | undefined { return this.seats.find(s => s.playerId === playerId); }

  /** Takes a chair (`preferred` when free, else the nearest free one); seated again in their own chair if still there. */
  join(playerId: string, displayName: string, preferred?: number): number {
    const existing = this.seat(playerId);
    if (existing) { existing.left = false; return existing.chair; }
    const taken = new Set(this.seats.map(s => s.chair));
    const free = [0, 1, 2, 3].filter(c => !taken.has(c));
    if (!free.length) throw new Error('A mesa está cheia.');
    const chair = preferred !== undefined && free.includes(preferred) ? preferred : free.sort((a, b) => Math.abs(a - (preferred ?? 0)) - Math.abs(b - (preferred ?? 0)))[0]!;
    this.seats.push({ playerId, displayName, chair, bet: 0, lastBet: 0, hands: [], insurance: 0, insured: '', inRound: false, pending: false, left: false, staked: 0, paid: 0 });
    this.seats.sort((a, b) => b.chair - a.chair);
    return chair;
  }

  /**
   * Gets up. Before the deal the bet simply goes (it was never taken); with coins in play the seat stays until the
   * round is settled: its hands stand where they are, so leaving can neither erase a loss nor dodge a decision.
   */
  leave(playerId: string, now = this.clock()): void {
    const seat = this.seat(playerId);
    if (!seat) return;
    if (seat.inRound || (this.phase === 'closing' && seat.bet > 0)) {
      seat.left = true;
      if (seat.insured === 'pending') seat.insured = 'declined';
      for (const hand of seat.hands) hand.done = true;
      if (this.phase === 'insurance') this.insuranceAnswered(now);
      if (this.phase === 'playing' && this.turn?.seat === seat && !seat.pending) this.advance(now);
      return;
    }
    this.seats.splice(this.seats.indexOf(seat), 1);
    if (this.phase === 'betting' && !this.seats.some(s => s.bet > 0)) this.toWaiting();
    else if (this.phase === 'betting') this.hurry(now);
  }

  /**
   * The bet for the next deal (0 takes it back). The first bet opens the betting window for the whole table; once
   * everyone seated has bet, the deal comes at once. The coins are taken when the window closes.
   */
  bet(playerId: string, amount: number, now = this.clock()): void {
    const seat = this.seat(playerId);
    if (!seat || seat.left) throw new Error('Sente-se à mesa primeiro.');
    if (this.phase !== 'waiting' && this.phase !== 'betting') throw new Error(this.phase === 'results' ? 'Aguarde a próxima rodada.' : 'As apostas estão fechadas. Espere a próxima rodada.');
    const { min, max } = this.limits;
    if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('Aposta inválida.');
    if (amount && (amount < min || amount > max)) throw new Error(`A aposta vai de ${min} a ${max} moedas.`);
    seat.bet = amount;
    if (amount) seat.lastBet = amount;
    if (this.phase === 'waiting' && amount) { this.phase = 'betting'; this.deadline = now + this.timing.betMs; }
    if (this.phase === 'betting' && !this.seats.some(s => s.bet > 0)) this.toWaiting();
    else if (this.phase === 'betting') this.hurry(now);
  }

  /** Insurance (half the bet, pays 2:1 on a dealer natural) while the dealer shows an ace; with a natural it is even money. */
  async insure(playerId: string, take: boolean): Promise<void> {
    const seat = this.seat(playerId);
    if (this.phase !== 'insurance' || !seat?.inRound || seat.left) throw new Error('Não há seguro para decidir agora.');
    if (seat.insured !== 'pending' || seat.pending) throw new Error('Você já decidiu o seguro.');
    const cost = insuranceCost(seat.hands[0]!.bet);
    if (take && cost > 0) {
      const roundId = this.roundId;
      seat.pending = true;
      try { await this.bank.stake(seat.playerId, roundId, cost); }
      finally { seat.pending = false; }
      seat.insurance = cost; seat.staked += cost;
    }
    seat.insured = take && cost > 0 ? 'taken' : 'declined';
    this.insuranceAnswered(this.clock());
  }

  /**
   * A decision on the hand in turn. `expect` is what the browser saw (the hand in turn and the table's move): a click
   * meant for an earlier decision is refused instead of being applied to the next one. A double or a split takes the extra bet
   * first; the turn waits for it.
   */
  async act(playerId: string, action: BlackjackAction, expect: { hand: number; move: number }, now = this.clock()): Promise<void> {
    const { seat, hand } = this.decision(playerId, expect);
    if (now >= this.deadline) { this.tick(now); throw new Error('Seu tempo terminou.'); }
    const cost = this.cost(seat, hand, action);
    if (cost > 0) {
      seat.pending = true;
      try { await this.bank.stake(seat.playerId, this.roundId, cost); }
      finally { seat.pending = false; }
      seat.staked += cost;
    }
    now = Math.max(now, this.clock());
    this.move++;
    const index = seat.hands.indexOf(hand);
    if (action === 'hit') {
      hand.cards.push(this.draw());
      if (handTotal(hand.cards) >= 21) hand.done = true;
    } else if (action === 'stand') hand.done = true;
    else if (action === 'double') { hand.bet += cost; hand.doubled = true; hand.cards.push(this.draw()); hand.done = true; }
    else if (action === 'surrender') { hand.surrendered = true; hand.done = true; }
    else {
      const aces = hand.cards[0]!.rank === 'A';
      const second: Hand = { cards: [hand.cards.pop()!], bet: cost, split: true, splitAces: aces, doubled: false, surrendered: false, done: false, outcome: null, payout: 0 };
      hand.split = true; hand.splitAces = aces;
      seat.hands.splice(index + 1, 0, second);
      // Split aces take one card each and stand; any other pair plays on, its second card coming when its turn does.
      if (aces) for (const h of [hand, second]) { h.cards.push(this.draw()); h.done = true; }
      else { hand.cards.push(this.draw()); if (handTotal(hand.cards) === 21) hand.done = true; }
    }
    if (hand.done || seat.left) this.advance(now);
    else this.deadline = now + this.timing.turnMs;
  }

  /** The clock moves the table: windows close, cards come, time runs out, results clear. */
  tick(now = this.clock()): void {
    if (!this.deadline || now < this.deadline) return;
    switch (this.phase) {
      case 'betting': void this.close(); break;
      case 'dealing': this.afterDeal(now); break;
      case 'insurance':
        if (this.seats.some(s => s.pending)) return;
        for (const seat of this.seats) if (seat.insured === 'pending') seat.insured = 'declined';
        this.peek(now); break;
      case 'playing':
        if (!this.turn || this.turn.seat.pending) return;
        this.turn.seat.hands[this.turn.hand]!.done = true;
        this.advance(now); break;
      case 'dealer': this.dealerStep(now); break;
      case 'results': this.toWaiting(); break;
    }
  }

  snapshot(): TableView {
    const visible = this.dealer.filter((_, i) => i === 0 || this.revealed), dealerValue = handValue(visible);
    const { min, max } = this.limits;
    return {
      id: this.id, phase: this.phase, round: this.round, move: this.move, roundId: this.roundId, deadline: this.deadline,
      turnPlayerId: this.turnPlayerId ?? '', turnHand: this.phase === 'playing' ? this.turn?.hand ?? -1 : -1, minBet: min, maxBet: max,
      dealer: this.dealer.map((card, i) => i === 0 || this.revealed ? { ...card } : { rank: '?' as const, suit: '' as const, seq: card.seq }),
      dealerTotal: visible.length ? dealerValue.total : 0, dealerSoft: dealerValue.soft,
      seats: this.seats.map(seat => {
        const net = seat.paid - seat.staked, settled = this.phase === 'results' && seat.inRound;
        return {
          playerId: seat.playerId, displayName: seat.displayName, chair: seat.chair, bet: seat.bet, lastBet: seat.lastBet,
          insurance: seat.insurance, insured: seat.insured, inRound: seat.inRound, left: seat.left, staked: seat.staked, paid: seat.paid, net,
          status: seat.left ? 'left' : !seat.inRound ? (seat.bet > 0 ? 'betting' : 'watching') : this.turn?.seat === seat && this.phase === 'playing' ? 'turn' : seat.hands.every(h => h.done) ? 'done' : 'playing',
          result: settled ? (net > 0 ? 'win' : net < 0 ? 'loss' : 'draw') : '',
          hands: seat.hands.map(hand => {
            const value = handValue(hand.cards);
            return { cards: hand.cards.map(c => ({ ...c })), bet: hand.bet, split: hand.split, doubled: hand.doubled, outcome: hand.outcome, payout: hand.payout,
              total: value.total, soft: value.soft, status: this.handStatus(hand) };
          }),
        };
      }),
    };
  }

  // ── Rounds ──────────────────────────────────────────────────────────────────────────────────────────────────────

  /** The betting window closes: every bet is taken from its wallet at once, and whoever could not pay sits this one out. */
  private async close(): Promise<void> {
    const roundId = randomUUID(), betting = this.seats.filter(s => s.bet > 0 && !s.left);
    this.phase = 'closing'; this.roundId = roundId; this.deadline = 0;
    await Promise.all(betting.map(async seat => {
      seat.pending = true;
      try { await this.bank.stake(seat.playerId, roundId, seat.bet); seat.staked = seat.bet; seat.inRound = true; }
      catch (error) {
        // Out of this round; settling it gives back whatever a stake without an answer may have taken.
        seat.bet = 0; this.bank.settle(roundId, seat.playerId, 0);
        this.options.onNotice?.(seat.playerId, `Sua aposta não entrou: ${error instanceof Error ? error.message : 'a carteira não respondeu.'}`);
      }
      finally { seat.pending = false; }
    }));
    // Got up while their bet was being taken: it goes back untouched.
    for (const seat of this.seats.filter(s => s.inRound && s.left)) { this.bank.settle(roundId, seat.playerId, seat.staked); seat.inRound = false; seat.staked = 0; }
    for (const seat of this.seats.filter(s => s.left && !s.inRound)) this.seats.splice(this.seats.indexOf(seat), 1);
    if (!this.seats.some(s => s.inRound)) { this.toWaiting(); return; }
    this.deal(this.clock());
  }

  private deal(now: number): void {
    this.shoe = (this.options.makeShoe ?? freshShoe)().slice();
    this.seq = 0; this.dealer = []; this.revealed = false; this.turn = null; this.round++;
    const players = this.seats.filter(s => s.inRound);
    for (const seat of players) seat.hands = [{ cards: [], bet: seat.bet, split: false, splitAces: false, doubled: false, surrendered: false, done: false, outcome: null, payout: 0 }];
    for (let pass = 0; pass < 2; pass++) {
      for (const seat of players) seat.hands[0]!.cards.push(this.draw());
      this.dealer.push(this.draw());
    }
    for (const seat of players) if (isNatural(seat.hands[0]!.cards)) seat.hands[0]!.done = true;
    this.phase = 'dealing'; this.deadline = now + this.seq * this.timing.dealStepMs;
  }

  private afterDeal(now: number): void {
    const up = this.dealer[0]!.rank;
    if (up === 'A') {
      this.phase = 'insurance'; this.deadline = now + this.timing.insuranceMs;
      for (const seat of this.seats) if (seat.inRound) seat.insured = seat.left ? 'declined' : 'pending';
      this.insuranceAnswered(now);
    } else if (isTenValue(up)) this.peek(now);
    else this.startPlay(now);
  }
  private insuranceAnswered(now: number): void {
    if (this.phase === 'insurance' && !this.seats.some(s => s.insured === 'pending' || s.pending)) this.peek(now);
  }
  /** The dealer looks under an ace or a ten: with a natural the round ends at once (no double or split was bought yet). */
  private peek(now: number): void {
    if (isNatural(this.dealer)) { this.revealed = true; this.settle(now); }
    else this.startPlay(now);
  }
  private startPlay(now: number): void { this.phase = 'playing'; this.turn = null; this.advance(now); }

  /** The next hand that still has a decision, dealing a split hand its second card when its turn comes. */
  private advance(now: number): void {
    const order = this.seats.filter(s => s.inRound);
    let s = this.turn ? order.indexOf(this.turn.seat) : 0, h = this.turn ? this.turn.hand + 1 : 0;
    for (; s < order.length; s++, h = 0) {
      const seat = order[s]!;
      for (; h < seat.hands.length; h++) {
        const hand = seat.hands[h]!;
        if (hand.done || seat.left) continue;
        if (hand.cards.length === 1) { hand.cards.push(this.draw()); if (handTotal(hand.cards) === 21) { hand.done = true; continue; } }
        this.turn = { seat, hand: h }; this.deadline = now + this.timing.turnMs; this.move++;
        return;
      }
    }
    this.turn = null;
    this.phase = 'dealer'; this.revealed = true; this.deadline = now + this.timing.dealerStepMs;
  }

  /** One step of the dealer's play: draw below 17 (stand on every 17) while a hand still waits for the dealer's total. */
  private dealerStep(now: number): void {
    const waiting = this.seats.some(s => s.inRound && s.hands.some(h => !h.surrendered && handTotal(h.cards) <= 21 && !isNatural(h.cards, h.split)));
    if (waiting && handTotal(this.dealer) < 17) { this.dealer.push(this.draw()); this.deadline = now + this.timing.dealerStepMs; return; }
    this.settle(now);
  }

  private settle(now: number): void {
    this.phase = 'results'; this.turn = null; this.deadline = now + this.timing.resultsMs;
    const dealer = handTotal(this.dealer), dealerNatural = isNatural(this.dealer), summary: RoundSummary = { roundId: this.roundId, players: [] };
    for (const seat of this.seats) {
      if (!seat.inRound) continue;
      for (const hand of seat.hands) {
        const total = handTotal(hand.cards), natural = isNatural(hand.cards, hand.split);
        hand.done = true;
        hand.outcome = hand.surrendered ? 'surrender' : total > 21 ? 'bust' : natural ? (dealerNatural ? 'push' : 'blackjack')
          : dealerNatural ? 'loss' : dealer > 21 || total > dealer ? 'win' : total === dealer ? 'push' : 'loss';
        hand.payout = handReturn(hand.outcome, hand.bet);
      }
      seat.paid = seat.hands.reduce((sum, hand) => sum + hand.payout, 0) + (dealerNatural ? seat.insurance * 3 : 0);
      this.bank.settle(this.roundId, seat.playerId, seat.paid);
      const net = seat.paid - seat.staked;
      this.options.onResult?.(this.roundId, seat.playerId, net > 0 ? 'win' : net < 0 ? 'loss' : 'push');
      summary.players.push({ playerId: seat.playerId, staked: seat.staked, paid: seat.paid, outcomes: seat.hands.map(h => h.outcome!) });
    }
    this.options.onRound?.(summary);
  }

  /** Clears the felt: who left goes, everyone else keeps their chair and their last bet to repeat. */
  private toWaiting(): void {
    for (const seat of this.seats.filter(s => s.left)) this.seats.splice(this.seats.indexOf(seat), 1);
    for (const seat of this.seats) Object.assign(seat, { bet: 0, hands: [], insurance: 0, insured: '', inRound: false, staked: 0, paid: 0 });
    this.phase = 'waiting'; this.roundId = ''; this.deadline = 0; this.dealer = []; this.revealed = false; this.turn = null; this.shoe = [];
  }

  // ── Checks ──────────────────────────────────────────────────────────────────────────────────────────────────────

  private decision(playerId: string, expect: { hand: number; move: number }): { seat: Seat; hand: Hand } {
    if (this.phase !== 'playing' || !this.turn) throw new Error('Não há jogada para fazer agora.');
    const { seat, hand: index } = this.turn;
    if (seat.playerId !== playerId) throw new Error('Espere a sua vez.');
    if (seat.pending) throw new Error('Aguarde: a jogada anterior ainda está sendo registrada.');
    const hand = seat.hands[index]!;
    if (expect.hand !== index || expect.move !== this.move) throw new Error('Essa jogada já passou. Veja a mesa de novo.');
    return { seat, hand };
  }
  /** What an action costs on top of the bet, or why it is not allowed on this hand. */
  private cost(seat: Seat, hand: Hand, action: BlackjackAction): number {
    const two = hand.cards.length === 2;
    if (action === 'double') {
      if (!two || hand.splitAces) throw new Error('Só dá para dobrar com as duas primeiras cartas.');
      return hand.bet;
    }
    if (action === 'split') {
      if (!two || cardValue(hand.cards[0]!.rank) !== cardValue(hand.cards[1]!.rank)) throw new Error('Só dá para dividir duas cartas do mesmo valor.');
      if (hand.splitAces) throw new Error('Ases divididos não se dividem de novo.');
      if (seat.hands.length >= BLACKJACK.maxHands) throw new Error(`No máximo ${BLACKJACK.maxHands} mãos por jogador.`);
      return hand.bet;
    }
    if (action === 'surrender' && (!two || hand.split || seat.hands.length > 1)) throw new Error('Só dá para desistir antes de qualquer outra jogada.');
    return 0;
  }
  private handStatus(hand: Hand): string {
    if (hand.surrendered) return 'surrendered';
    if (handTotal(hand.cards) > 21) return 'bust';
    if (isNatural(hand.cards, hand.split)) return 'blackjack';
    if (hand.doubled) return 'doubled';
    return hand.done ? 'done' : 'playing';
  }
  /** Moves the table on as soon as everyone seated has bet. */
  private hurry(now: number): void {
    if (this.phase === 'betting' && this.seats.every(s => s.bet > 0 || s.left)) this.deadline = Math.min(this.deadline, now + this.timing.allBetMs);
  }
  private draw(): Dealt {
    const card = this.shoe.shift();
    if (!card) throw new Error('Baralho esgotado.');
    return { ...card, seq: this.seq++ };
  }
}
