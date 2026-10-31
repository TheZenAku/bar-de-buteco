import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BLACKJACK, chipStack, betLimits, handReturn, handValue, totalLabel } from '@bar/shared';
import { BlackjackTable, freshShoe, type Card, type TableBank } from '../src/minigames/blackjack.js';
import { BlackjackBank, type BankEntry } from '../src/minigames/blackjack-bank.js';
import { FileOutbox } from '../src/world/outbox.js';
import { InternalApiError } from '../src/internal.js';

const shoe = (...ranks: string[]): Card[] => ranks.map(rank => ({ rank, suit: '♠' }));
const flush = () => new Promise(resolve => setImmediate(resolve));

class FakeBank implements TableBank {
  stakes: Array<[string, number]> = [];
  settled: Array<[string, number]> = [];
  roundIds = new Set<string>();
  refuse?: (playerId: string) => string | undefined;
  hold?: Promise<void>;
  async stake(playerId: string, roundId: string, amount: number): Promise<void> {
    await this.hold;
    const refusal = this.refuse?.(playerId);
    if (refusal) throw new Error(refusal);
    this.roundIds.add(roundId); this.stakes.push([playerId, amount]);
  }
  settle(roundId: string, playerId: string, payout: number): void { this.roundIds.add(roundId); this.settled.push([playerId, payout]); }
}

const TIMING = { betMs: 1000, allBetMs: 0, dealStepMs: 10, insuranceMs: 1000, turnMs: 5000, dealerStepMs: 10, resultsMs: 1000 };
function setup(ranks: string[], players: Array<[string, number]> = [['a', 0]]) {
  const clock = { now: 1000 }, bank = new FakeBank(), results: Array<[string, string]> = [], notices: string[] = [];
  const table = new BlackjackTable('t', { bank, makeShoe: () => shoe(...ranks), clock: () => clock.now, timing: TIMING,
    onResult: (_round, player, result) => results.push([player, result]), onNotice: (_player, message) => notices.push(message) });
  for (const [id, chair] of players) table.join(id, id.toUpperCase(), chair);
  /** Everyone bets, the window closes, the cards land. */
  const deal = async (bets: Record<string, number>) => {
    for (const [id, amount] of Object.entries(bets)) table.bet(id, amount, clock.now);
    table.tick(clock.now); await flush();
    clock.now += 1000; table.tick(clock.now);
  };
  const play = (id: string, action: Parameters<BlackjackTable['act']>[1]) => table.act(id, action, { hand: table.snapshot().turnHand, move: table.move }, clock.now);
  const dealer = () => { for (let i = 0; i < 30 && table.phase === 'dealer'; i++) { clock.now += 10; table.tick(clock.now); } };
  return { table, bank, clock, results, notices, deal, play, dealer, seat: (id: string) => table.snapshot().seats.find(s => s.playerId === id)! };
}

test('shared rules: soft totals, labels, returns, limits and chip stacks', () => {
  assert.deepEqual(handValue(shoe('A', 'A', '9')), { total: 21, soft: true });
  assert.deepEqual(handValue(shoe('A', '6', 'K')), { total: 17, soft: false });
  assert.equal(handValue(shoe('K', 'Q', '2')).total, 22);
  assert.equal(totalLabel(shoe('A', '6')), '7/17');
  assert.equal(totalLabel(shoe('A', 'K')), 'BJ');
  assert.equal(totalLabel(shoe('A', 'K'), true), '21', 'A split 21 is not a natural');
  assert.equal(handReturn('blackjack', 15), 37, '3:2 rounds the odd half down');
  assert.equal(handReturn('surrender', 25), 12);
  assert.deepEqual(betLimits({ 'blackjack:min-bet': 50, 'blackjack:max-bet': 20 }), { min: 50, max: 50 });
  assert.deepEqual(chipStack(135), [100, 25, 10]);
});

test('a fresh shoe has six full decks', () => {
  const cards = freshShoe();
  assert.equal(cards.length, 52 * BLACKJACK.decks);
  const counts = new Map<string, number>();
  for (const c of cards) counts.set(c.rank + c.suit, (counts.get(c.rank + c.suit) ?? 0) + 1);
  assert.equal(counts.size, 52);
  assert.ok([...counts.values()].every(n => n === BLACKJACK.decks));
});

test('bets: limits, seat, window, and the coins taken when it closes', async () => {
  const { table, bank, clock, deal } = setup(['10', '6', '9', 'A']);
  assert.throws(() => table.bet('x', 100), /Sente-se/);
  assert.throws(() => table.bet('a', 5), /de 10 a 500/);
  assert.throws(() => table.bet('a', 501), /de 10 a 500/);
  assert.throws(() => table.bet('a', 10.5), /inválida/);
  table.join('b', 'B', 2);
  table.bet('a', 50, clock.now);
  assert.equal(table.phase, 'betting');
  assert.equal(bank.stakes.length, 0, 'Nothing is taken while the window is open');
  table.bet('a', 0, clock.now);
  assert.equal(table.phase, 'waiting', 'Taking back the only bet closes the window');
  table.leave('b');
  await deal({ a: 100 });
  assert.deepEqual(bank.stakes, [['a', 100]]);
  assert.equal(bank.roundIds.size, 1);
  assert.equal(table.phase, 'playing');
  assert.throws(() => table.bet('a', 100), /fechadas/);
});

test('the hole card stays private until it turns, and the dealer stands on soft 17', async () => {
  const { table, bank, deal, play, dealer, seat } = setup(['10', '6', '9', 'A']);
  await deal({ a: 100 });
  const during = table.snapshot();
  assert.equal(during.dealer[1]!.rank, '?');
  assert.equal(during.dealerTotal, 6);
  assert.ok(!JSON.stringify(during).includes('"rank":"A"'), 'The ace under the 6 never leaves the table');
  await play('a', 'stand');
  dealer();
  assert.equal(table.phase, 'results');
  assert.equal(table.snapshot().dealerTotal, 17);
  assert.equal(table.snapshot().dealer.length, 2, 'Soft 17 stands');
  assert.equal(seat('a').hands[0]!.outcome, 'win');
  assert.deepEqual(bank.settled, [['a', 200]]);
  assert.equal(seat('a').result, 'win');
});

test('a natural pays 3:2; a dealer natural under a ten ends the round at once', async () => {
  const natural = setup(['A', '9', 'K', '8']);
  await natural.deal({ a: 100 });
  natural.dealer();
  assert.equal(natural.seat('a').hands[0]!.outcome, 'blackjack');
  assert.deepEqual(natural.bank.settled, [['a', 250]]);
  const peek = setup(['9', 'K', '9', 'A']);
  await peek.deal({ a: 100 });
  assert.equal(peek.table.phase, 'results', 'The dealer peeks and shows the natural');
  assert.deepEqual(peek.bank.settled, [['a', 0]]);
  const both = setup(['A', 'K', 'K', 'A']);
  await both.deal({ a: 100 });
  assert.equal(both.seat('a').hands[0]!.outcome, 'push');
  assert.deepEqual(both.bank.settled, [['a', 100]]);
});

test('insurance pays 2:1 on a dealer natural; with a natural it is even money', async () => {
  const insured = setup(['9', 'A', '9', 'K']);
  await insured.deal({ a: 100 });
  assert.equal(insured.table.phase, 'insurance');
  await insured.table.insure('a', true);
  await assert.rejects(insured.table.insure('a', true), /seguro/);
  assert.deepEqual(insured.bank.stakes, [['a', 100], ['a', 50]]);
  assert.equal(insured.table.phase, 'results');
  assert.deepEqual(insured.bank.settled, [['a', 150]], 'Hand lost, insurance 50 returns 150: net 0');
  const declined = setup(['9', 'A', '9', '7']);
  await declined.deal({ a: 100 });
  declined.clock.now += 1000; declined.table.tick(declined.clock.now);
  assert.equal(declined.table.phase, 'playing', 'Unanswered, insurance is declined and play goes on');
  assert.equal(declined.seat('a').insured, 'declined');
  const evenMoney = setup(['A', 'A', 'K', '7']);
  await evenMoney.deal({ a: 100 });
  await evenMoney.table.insure('a', true);
  evenMoney.dealer();
  assert.deepEqual(evenMoney.bank.settled, [['a', 250]]);
  assert.equal(evenMoney.seat('a').net, 100, 'Natural plus insurance nets the bet: even money');
});

test('double takes one card for twice the bet; double after split', async () => {
  const doubled = setup(['6', '9', '5', '7', 'K', '8']);
  await doubled.deal({ a: 100 });
  await doubled.play('a', 'double');
  assert.deepEqual(doubled.bank.stakes, [['a', 100], ['a', 100]]);
  doubled.dealer();
  const hand = doubled.seat('a').hands[0]!;
  assert.equal(hand.cards.length, 3);
  assert.equal(hand.bet, 200);
  assert.equal(hand.outcome, 'win', 'Dealer 16 drew an 8 and busted');
  assert.deepEqual(doubled.bank.settled, [['a', 400]]);

  const split = setup(['8', '10', '8', '7', '3', 'K', '9']);
  await split.deal({ a: 100 });
  await split.play('a', 'split');
  assert.deepEqual(split.seat('a').hands.map(h => h.cards.map(c => c.rank)), [['8', '3'], ['8']], 'The second hand gets its card on its turn');
  await split.play('a', 'double');
  assert.equal(split.table.snapshot().turnHand, 1);
  assert.deepEqual(split.seat('a').hands[1]!.cards.map(c => c.rank), ['8', '9']);
  await split.play('a', 'stand');
  split.dealer();
  assert.deepEqual(split.seat('a').hands.map(h => [h.outcome, h.payout]), [['win', 400], ['push', 100]]);
  assert.equal(split.seat('a').staked, 300);
  assert.deepEqual(split.bank.settled, [['a', 500]]);
});

test('split aces take one card each, 21 is not a natural, and four hands is the limit', async () => {
  const aces = setup(['A', '9', 'A', '7', 'K', '5', '10']);
  await aces.deal({ a: 100 });
  await aces.play('a', 'split');
  assert.equal(aces.table.phase, 'dealer', 'Both aces stand on their single card');
  aces.dealer();
  assert.deepEqual(aces.seat('a').hands.map(h => [h.outcome, h.payout]), [['win', 200], ['win', 200]], 'A split A+K pays 1:1');
  const eights = setup(['8', '9', '8', '7', '8', '8', '8', '8']);
  await eights.deal({ a: 10 });
  for (let i = 0; i < 3; i++) await eights.play('a', 'split');
  assert.equal(eights.seat('a').hands.length, 4);
  await assert.rejects(eights.play('a', 'split'), /No máximo 4/);
});

test('late surrender gives half back, only as the first decision', async () => {
  const s = setup(['10', '9', '6', '7']);
  await s.deal({ a: 100 });
  await s.play('a', 'surrender');
  s.dealer();
  assert.equal(s.seat('a').hands[0]!.outcome, 'surrender');
  assert.deepEqual(s.bank.settled, [['a', 50]]);
  const late = setup(['5', '9', '5', '7', '2']);
  await late.deal({ a: 100 });
  await late.play('a', 'hit');
  await assert.rejects(late.play('a', 'surrender'), /antes de qualquer/);
  await assert.rejects(late.play('a', 'double'), /duas primeiras/);
});

test('a repeated or stale click never plays twice; out of turn is refused', async () => {
  const { table, deal, clock } = setup(['5', '9', '5', '7', '2', '3', '8', '8', '8', '8'], [['a', 0], ['b', 3]]);
  await deal({ a: 100, b: 100 });
  // b sits at the dealer's left (chair 3): first to play.
  assert.equal(table.turnPlayerId, 'b');
  await assert.rejects(table.act('a', 'hit', { hand: 0, move: table.move }), /sua vez/);
  const move = table.move;
  await table.act('b', 'hit', { hand: 0, move }, clock.now);
  await assert.rejects(table.act('b', 'hit', { hand: 0, move }, clock.now), /já passou/);
  assert.equal(table.snapshot().seats.find(s => s.playerId === 'b')!.hands[0]!.cards.length, 3);
});

test('time runs out into a stand; a pending wallet change holds the clock', async () => {
  const { table, bank, deal, clock, seat } = setup(['5', '9', '6', '7', '10', 'K', '2'], [['a', 0], ['b', 3]]);
  await deal({ a: 100, b: 100 });
  clock.now += TIMING.turnMs; table.tick(clock.now);
  assert.equal(table.turnPlayerId, 'a', 'b stood when the time ran out');
  assert.equal(seat('b').hands[0]!.status, 'done');
  let release!: () => void;
  bank.hold = new Promise(resolve => { release = resolve; });
  const doubling = table.act('a', 'double', { hand: 0, move: table.move }, clock.now);
  clock.now += TIMING.turnMs * 3; table.tick(clock.now);
  assert.equal(table.turnPlayerId, 'a', 'The turn waits for the double being paid');
  await assert.rejects(table.act('a', 'stand', { hand: 0, move: table.move }, clock.now), /anterior/);
  release(); await doubling;
  assert.equal(seat('a').hands[0]!.doubled, true);
});

test('getting up mid-round stands the hands and still settles them; the chair frees after the results', async () => {
  const { table, bank, deal, results, clock, dealer } = setup(['10', '10', '9', '6', '9', '9'], [['a', 0], ['b', 3]]);
  await deal({ a: 100, b: 100 });
  table.leave('b', clock.now);
  assert.equal(table.turnPlayerId, 'a');
  assert.equal(table.seats.length, 2, 'b stays until settled');
  assert.throws(() => table.bet('b', 100), /Sente-se/);
  await table.act('a', 'stand', { hand: 0, move: table.move }, clock.now);
  dealer();
  assert.deepEqual(bank.settled.sort(), [['a', 200], ['b', 0]]);
  assert.deepEqual(results.sort(), [['a', 'win'], ['b', 'loss']]);
  clock.now += TIMING.resultsMs; table.tick(clock.now);
  assert.equal(table.phase, 'waiting');
  assert.deepEqual(table.seats.map(s => s.playerId), ['a']);
  assert.equal(table.seats[0]!.lastBet, 100, 'The last bet is kept to repeat');
});

test('a bet the wallet refuses sits the round out; getting up while bets are taken gives the bet back', async () => {
  const refused = setup(['10', '9', '7', '7']);
  refused.bank.refuse = () => 'Moedas insuficientes.';
  await refused.deal({ a: 100 });
  assert.equal(refused.table.phase, 'waiting');
  assert.match(refused.notices[0]!, /Moedas insuficientes/);
  assert.deepEqual(refused.bank.settled, [['a', 0]], 'Settled at zero: an unanswered stake would come back');
  const leaving = setup(['10', '9', '7', '7']);
  let release!: () => void;
  leaving.bank.hold = new Promise(resolve => { release = resolve; });
  leaving.table.bet('a', 100, leaving.clock.now); leaving.table.tick(leaving.clock.now);
  assert.equal(leaving.table.phase, 'closing');
  leaving.table.leave('a');
  release(); await flush(); await flush();
  assert.deepEqual(leaving.bank.settled, [['a', 100]]);
  assert.equal(leaving.table.phase, 'waiting');
  assert.equal(leaving.table.seats.length, 0);
});

test('the bank journals every bet, settles once per round, and gives back what a crash left in play', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bar-bj-')), path = join(dir, 'journal.jsonl');
  const debits: Array<[number, string]> = [], sent: unknown[] = [], wallet: Array<[string, number]> = [];
  let failNext: 'refuse' | 'down' | undefined;
  const debit = async (_owner: unknown, amount: number, reason: string) => {
    if (failNext === 'refuse') { failNext = undefined; throw new InternalApiError(409, 'Moedas insuficientes.'); }
    if (failNext === 'down') { failNext = undefined; throw new Error('timeout'); }
    debits.push([amount, reason]); return { balance: 900, applied: amount };
  };
  let api: 'ok' | 'down' | 'refuse' = 'ok';
  const send = async <T>(_path: string, body: unknown): Promise<T> => {
    if (api === 'down') throw new InternalApiError(503, 'fora');
    if (api === 'refuse') throw new InternalApiError(409, 'Aposta não encontrada no livro-caixa.');
    sent.push(body); return { balance: 1000, applied: 1 } as T;
  };
  const owner = (id: string) => ({ sessionId: `s-${id}`, userId: id });
  const make = () => new BlackjackBank(new FileOutbox<BankEntry>(path), owner, debit, send, { log: () => {}, wallet: (id, c) => wallet.push([id, c.applied]) });
  const bank = make();
  await bank.stake('ana', 'r1', 100);
  assert.deepEqual(debits, [[-100, 'blackjack:bet:r1']]);
  failNext = 'refuse';
  await assert.rejects(bank.stake('ana', 'r1', 100), /insuficientes/);
  failNext = 'down';
  await assert.rejects(bank.stake('ana', 'r1', 50), /não respondeu/);
  api = 'down';
  bank.settle('r1', 'ana', 200);
  await bank.flush();
  assert.equal(bank.pending, 1, 'Kept while the API is away');
  const reopened = make();
  assert.equal(reopened.pending, 1, 'And still there after a restart');
  api = 'ok';
  await reopened.flush();
  assert.equal(reopened.pending, 0);
  const settlement = sent[0] as { payout: number; stakes: string[]; voids: string[] };
  assert.equal(settlement.payout, 200);
  assert.equal(settlement.stakes.length, 1, 'The refused bet is not part of it');
  assert.equal(settlement.voids.length, 1, 'The unanswered one is, to be given back if it was taken');
  // A crash mid-round: the stake left on disk becomes a refund of whatever was really taken.
  await reopened.stake('bia', 'r2', 30);
  const afterCrash = make();
  await afterCrash.flush();
  const refund = sent[1] as { userId: string; payout: number; stakes: string[]; voids: string[] };
  assert.deepEqual([refund.userId, refund.payout, refund.stakes.length, refund.voids.length], ['bia', 0, 0, 1]);
  // A settlement the API refuses for good goes to the dead letter instead of being retried forever.
  await afterCrash.stake('caio', 'r3', 10);
  api = 'refuse';
  afterCrash.settle('r3', 'caio', 20);
  await afterCrash.flush();
  assert.equal(afterCrash.pending, 0);
  // A loss with every stake answered leaves nothing to deliver.
  api = 'ok';
  await afterCrash.stake('duda', 'r4', 10);
  const before = sent.length;
  afterCrash.settle('r4', 'duda', 0);
  await afterCrash.flush();
  assert.equal(sent.length, before);
});
