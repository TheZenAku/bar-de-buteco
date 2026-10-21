import test from 'node:test';
import assert from 'node:assert/strict';
import { BlackjackTable, freshDeck, handTotal, type Card } from '../src/minigames/blackjack.js';

const cards = (...ranks: string[]): Card[] => ranks.map(rank => ({ rank, suit: '♠' }));

test('aces become 1 when needed, including multiple aces', () => {
  assert.equal(handTotal(cards('A', 'A', '9')), 21);
  assert.equal(handTotal(cards('A', '6')), 17);
  assert.equal(handTotal(cards('K', 'Q', '2')), 22);
});

test('fresh deck contains exactly 52 unique cards', () => {
  const deck = freshDeck();
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map(c => c.rank + c.suit)).size, 52);
});

test('hole card stays private until settlement and dealer stands on soft 17', () => {
  const results: string[] = [];
  const table = new BlackjackTable('one', (_r, _p, result) => results.push(result), () => cards('10', 'A', '8', '6', 'K'));
  table.join('a', 'A'); table.start('a', 1000);
  assert.equal(table.snapshot().dealer[1], null);
  assert.equal(table.snapshot().dealerTotal, null);
  table.act('a', 'stand', 1001);
  assert.equal(table.snapshot().dealerTotal, 17);
  assert.equal(table.snapshot().dealer.length, 2);
  assert.deepEqual(results, ['win']);
  table.tick(50000);
  assert.deepEqual(results, ['win']);
});

test('natural beats three-card 21; dealer natural beats non-natural', () => {
  const table = new BlackjackTable('one', () => {}, () => cards('A', '7', 'K', '4', '10'));
  table.join('a', 'A'); table.start('a', 1000);
  assert.equal(table.snapshot().phase, 'finished');
  assert.equal(table.snapshot().seats[0]?.result, 'win');
  const dealer = new BlackjackTable('one', () => {}, () => cards('10', 'A', '9', 'K'));
  dealer.join('a', 'A'); dealer.start('a', 1000);
  assert.equal(dealer.snapshot().seats[0]?.result, 'loss');
});

test('enforces four seats, membership, turn order and automatic timeout', () => {
  const table = new BlackjackTable('one', () => {}, () => cards('10', '9', '8', '7', '10', '5', '6', '7', '8', '8'));
  for (const p of ['a', 'b', 'c', 'd']) table.join(p, p);
  assert.throws(() => table.join('e', 'e'), /cheia/);
  assert.throws(() => table.start('x'), /primeiro/);
  table.start('a', 1000);
  assert.throws(() => table.act('b', 'hit', 1001), /vez/);
  table.tick(26_000);
  assert.equal(table.snapshot().turnPlayerId, 'b');
  assert.throws(() => table.join('e', 'e'), /terminar/);
});

test('bust loses even when dealer would bust; leaving active round keeps settlement', () => {
  const result: string[] = [];
  const table = new BlackjackTable('one', (_r, _p, r) => result.push(r), () => cards('K', '10', 'Q', '6', '5', 'K'));
  table.join('a', 'A'); table.start('a', 1000);
  table.act('a', 'hit', 1001);
  assert.deepEqual(result, ['loss']);
  const leaving = new BlackjackTable('one', (_r, _p, r) => result.push(r), () => cards('10', '10', '7', '8'));
  leaving.join('a', 'A'); leaving.start('a', 1000); leaving.leave('a', 1001);
  assert.equal(leaving.snapshot().phase, 'finished');
  assert.equal(leaving.snapshot().seats.length, 1);
  assert.deepEqual(result, ['loss', 'loss']);
});
