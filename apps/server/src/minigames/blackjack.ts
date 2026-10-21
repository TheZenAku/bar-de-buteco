import { randomInt, randomUUID } from 'node:crypto';

export type Card = { rank: string; suit: '♠' | '♥' | '♦' | '♣' };
export type Result = 'win' | 'loss' | 'push';
export interface Seat {
  playerId: string;
  displayName: string;
  cards: Card[];
  stood: boolean;
  result: Result | null;
}
export interface BlackjackSnapshot {
  id: string;
  phase: 'waiting' | 'playing' | 'finished';
  roundId: string;
  turnPlayerId: string | null;
  turnEndsAt: number;
  dealer: Array<Card | null>;
  dealerTotal: number | null;
  seats: Array<Seat & { total: number; blackjack: boolean }>;
}

export function handTotal(cards: readonly Card[]): number {
  let total = 0;
  let aces = 0;
  for (const { rank } of cards) {
    if (rank === 'A') { aces++; total += 11; }
    else total += ['J', 'Q', 'K'].includes(rank) ? 10 : Number(rank);
  }
  while (total > 21 && aces-- > 0) total -= 10;
  return total;
}

export function freshDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of ['♠', '♥', '♦', '♣'] as const) {
    for (const rank of ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']) deck.push({ rank, suit });
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return deck;
}

/** The deck and dealer hole card stay exclusively on the authoritative server. */
export class BlackjackTable {
  readonly id: string;
  readonly seats: Seat[] = [];
  phase: BlackjackSnapshot['phase'] = 'waiting';
  roundId = '';
  turnEndsAt = 0;
  private turnIndex = -1;
  private dealer: Card[] = [];
  private deck: Card[] = [];
  private settled = false;
  private finishedAt = 0;

  constructor(
    id = 'blackjack-1',
    private readonly onResult: (roundId: string, playerId: string, result: Result) => void = () => {},
    private readonly makeDeck: () => Card[] = freshDeck,
    private readonly turnDuration = 25_000,
  ) { this.id = id; }

  join(playerId: string, displayName: string): void {
    if (this.seats.some(s => s.playerId === playerId)) return;
    if (this.phase === 'playing') throw new Error('Espere a rodada terminar para sentar.');
    if (this.seats.length >= 4) throw new Error('A mesa está cheia.');
    this.seats.push({ playerId, displayName, cards: [], stood: false, result: null });
  }

  leave(playerId: string, now = Date.now()): void {
    const index = this.seats.findIndex(s => s.playerId === playerId);
    if (index < 0) return;
    // A dealt seat remains until settlement so leaving cannot erase a loss.
    if (this.phase === 'playing') {
      const seat = this.seats[index]!;
      seat.stood = true;
      if (this.turnIndex === index) this.advance(now);
      return;
    }
    this.seats.splice(index, 1);
    if (this.seats.length === 0) this.reset();
  }

  start(playerId: string, now = Date.now()): void {
    if (!this.seats.some(s => s.playerId === playerId)) throw new Error('Sente-se à mesa primeiro.');
    if (this.phase === 'playing') throw new Error('A rodada já começou.');
    if (this.phase === 'finished' && now - this.finishedAt < 3000) throw new Error('Aguarde os resultados.');
    this.deck = this.makeDeck().slice();
    this.roundId = randomUUID();
    this.dealer = [];
    this.settled = false;
    this.phase = 'playing';
    this.turnIndex = -1;
    for (const seat of this.seats) { seat.cards = []; seat.stood = false; seat.result = null; }
    for (let deal = 0; deal < 2; deal++) {
      for (const seat of this.seats) seat.cards.push(this.draw());
      this.dealer.push(this.draw());
    }
    for (const seat of this.seats) if (handTotal(seat.cards) === 21) seat.stood = true;
    if (handTotal(this.dealer) === 21) this.finish(now);
    else this.advance(now);
  }

  act(playerId: string, action: 'hit' | 'stand', now = Date.now()): void {
    if (this.phase !== 'playing') throw new Error('Não há rodada em andamento.');
    const seat = this.seats[this.turnIndex];
    if (!seat || seat.playerId !== playerId) throw new Error('Espere a sua vez.');
    if (now >= this.turnEndsAt) { this.tick(now); throw new Error('Seu tempo terminou.'); }
    if (action === 'hit') {
      seat.cards.push(this.draw());
      if (handTotal(seat.cards) >= 21) { seat.stood = true; this.advance(now); }
    } else { seat.stood = true; this.advance(now); }
  }

  tick(now = Date.now()): void {
    if (this.phase === 'playing' && now >= this.turnEndsAt) {
      const seat = this.seats[this.turnIndex];
      if (seat) seat.stood = true;
      this.advance(now);
    }
  }

  resetRound(): void {
    if (this.phase === 'playing') return;
    this.reset();
    for (const seat of this.seats) { seat.cards = []; seat.stood = false; seat.result = null; }
  }

  snapshot(): BlackjackSnapshot {
    const reveal = this.phase !== 'playing';
    return {
      id: this.id, phase: this.phase, roundId: this.roundId,
      turnPlayerId: this.phase === 'playing' ? this.seats[this.turnIndex]?.playerId ?? null : null,
      turnEndsAt: this.turnEndsAt,
      dealer: this.dealer.map((card, i) => reveal || i === 0 ? { ...card } : null),
      dealerTotal: reveal ? handTotal(this.dealer) : null,
      seats: this.seats.map(seat => ({ ...seat, cards: seat.cards.map(c => ({ ...c })), total: handTotal(seat.cards), blackjack: seat.cards.length === 2 && handTotal(seat.cards) === 21 })),
    };
  }

  private draw(): Card {
    const card = this.deck.shift();
    if (!card) throw new Error('Baralho esgotado.');
    return card;
  }

  private advance(now: number): void {
    do { this.turnIndex++; } while (this.turnIndex < this.seats.length && this.seats[this.turnIndex]!.stood);
    if (this.turnIndex >= this.seats.length) this.finish(now);
    else this.turnEndsAt = now + this.turnDuration;
  }

  private finish(now: number): void {
    if (this.settled) return;
    this.settled = true;
    // Dealer stands on all 17s, including a soft 17.
    if (this.seats.some(seat => handTotal(seat.cards) <= 21)) {
      while (handTotal(this.dealer) < 17) this.dealer.push(this.draw());
    }
    const total = handTotal(this.dealer);
    const dealerNatural = this.dealer.length === 2 && total === 21;
    this.phase = 'finished';
    this.finishedAt = now;
    this.turnEndsAt = 0;
    for (const seat of this.seats) {
      const score = handTotal(seat.cards);
      const natural = seat.cards.length === 2 && score === 21;
      seat.result = score > 21 ? 'loss' : dealerNatural ? (natural ? 'push' : 'loss') : natural ? 'win' : total > 21 || score > total ? 'win' : score === total ? 'push' : 'loss';
      this.onResult(this.roundId, seat.playerId, seat.result);
    }
  }

  private reset(): void {
    this.phase = 'waiting'; this.roundId = ''; this.dealer = []; this.deck = []; this.turnEndsAt = 0; this.turnIndex = -1;
  }
}
