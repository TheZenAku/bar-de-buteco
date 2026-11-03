import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TRUCO_PERSONALITIES, TRUCO_BET, TRUCO_LEVEL_INFO, TrucoGame, cardStrength, handWinner, hasCasalMaior, manilhaRank, mayRaise, newTrucoDeck, provenWin, teamOf, tieRuling, trucoDecide, trucoStakes, type TrucoFace, type TrucoPersonality, type TrucoRank, type TrucoSuit } from '@bar/shared';

/** A small seeded generator, so a failure repeats. */
function seeded(seed: number) { let s = seed >>> 0 || 1; const next = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 2 ** 32; }; return { chance: next, random: (n: number) => Math.floor(next() * n) }; }
const NAMES = ['Ana', 'Beto', 'Caio', 'Duda'];
const face = (id: string, rank: TrucoRank, suit: TrucoSuit): TrucoFace => ({ id, rank, suit });
function game(options: { score?: [number, number]; dark?: boolean; dealer?: number } = {}) {
  return new TrucoGame({ random: seeded(7).random, nameOf: seat => NAMES[seat]!, dealer: options.dealer ?? 3, ...(options.score ? { score: options.score } : {}), ...(options.dark ? { dark: true } : {}) });
}
/** Deals, then swaps in known hands: seats 0..3, three cards each as 'rank suit'. Seat 0 is the Mão (dealer 3). */
function rigged(hands: string[][], viraRank: TrucoRank = '4', options: { score?: [number, number]; dark?: boolean } = {}) {
  const g = game(options);
  g.advance();
  g.hands = hands.map((list, seat) => list.map((text, i) => { const [rank, suit] = text.split(' ') as [TrucoRank, TrucoSuit]; return face(`s${seat}c${i}`, rank, suit); }));
  g.vira = face('v', viraRank, 'ouros');
  g.advance();
  return g;
}
/** Plays one card from each seat, in turn order: by index in their hand. */
function trick(g: TrucoGame, picks: number[] = [0, 0, 0, 0]) {
  for (const pick of picks) g.play(g.turn!, g.hands[g.turn!]![pick]!.id);
  assert.equal(g.phase, 'trick-end');
  g.advance();
}
const QUIET = ['6 ouros', '6 espadas', '6 copas'];

test('the deck has 40 cards: no 8, 9, 10 or jokers', () => {
  const deck = newTrucoDeck();
  assert.equal(deck.length, 40);
  assert.equal(new Set(deck.map(c => `${c.rank}${c.suit}`)).size, 40);
  assert.ok(!deck.some(c => ['8', '9', '10'].includes(c.rank)));
});

test('the manilha is the rank after the vira, wrapping from the 3 to the 4', () => {
  const steps: Array<[TrucoRank, TrucoRank]> = [['4', '5'], ['7', 'Q'], ['Q', 'J'], ['J', 'K'], ['K', 'A'], ['A', '2'], ['2', '3'], ['3', '4']];
  for (const [vira, manilha] of steps) assert.equal(manilhaRank(vira), manilha);
});

test('card order: manilhas by suit, then 3, 2, Ás, Rei, Valete, Dama, 7, 6, 5, 4', () => {
  const vira = { rank: '4' };
  const order = [['5', 'paus'], ['5', 'copas'], ['5', 'espadas'], ['5', 'ouros'], ['3', 'ouros'], ['2', 'ouros'], ['A', 'ouros'], ['K', 'ouros'], ['J', 'ouros'], ['Q', 'ouros'], ['7', 'ouros'], ['6', 'ouros'], ['4', 'ouros']] as const;
  for (let i = 1; i < order.length; i++) {
    const [ra, sa] = order[i - 1]!, [rb, sb] = order[i]!;
    assert.ok(cardStrength({ rank: ra, suit: sa }, vira) > cardStrength({ rank: rb, suit: sb }, vira), `${ra} ${sa} should beat ${rb} ${sb}`);
  }
  // Ordinary cards of a rank tie, whatever the suit.
  assert.equal(cardStrength({ rank: '3', suit: 'paus' }, vira), cardStrength({ rank: '3', suit: 'ouros' }, vira));
  // The card of the vira's rank is an ordinary card.
  assert.equal(cardStrength({ rank: '4', suit: 'paus' }, vira), 0);
});

test('who has the hand, for every pattern of tricks', () => {
  const cases: Array<[Array<0 | 1 | 'tie'>, 0 | 1 | 'tie' | undefined]> = [
    [[0], undefined], [[0, 0], 0], [[1, 1], 1], [[0, 1], undefined], [[0, 1, 0], 0], [[0, 1, 1], 1],
    // First tied: the next that is not a tie decides.
    [['tie', 0], 0], [['tie', 1], 1], [['tie', 'tie'], undefined], [['tie', 'tie', 1], 1],
    // Second or third tied: whoever won the first.
    [[1, 'tie'], 1], [[0, 1, 'tie'], 0], [[1, 0, 'tie'], 1],
    // Three ties.
    [['tie', 'tie', 'tie'], 'tie'],
  ];
  for (const [tricks, expected] of cases) assert.equal(handWinner(tricks), expected, JSON.stringify(tricks));
});

test('three ties: nobody without a call; three points by how the call was made; Mão de 11 and Mão de Ferro have their own rule', () => {
  assert.deepEqual(tieRuling({ iron: false, elevenTeam: null, call: null }).points, 0);
  assert.equal(tieRuling({ iron: false, elevenTeam: null, call: null }).team, null);
  const exposed = tieRuling({ iron: false, elevenTeam: null, call: { team: 0, exposed: true } });
  assert.equal(exposed.team, 1); assert.equal(exposed.points, 3);
  const dark = tieRuling({ iron: false, elevenTeam: null, call: { team: 0, exposed: false } });
  assert.equal(dark.team, 0); assert.equal(dark.points, 3);
  const eleven = tieRuling({ iron: false, elevenTeam: 1, call: null });
  assert.equal(eleven.team, 0); assert.equal(eleven.points, 3);
  const iron = tieRuling({ iron: true, elevenTeam: null, call: null });
  assert.equal(iron.team, null); assert.equal(iron.points, 0);
});

test('the deal: three cards each, unique, a vira, from the Mão to the right of the dealer', () => {
  const g = game({ dealer: 1 });
  assert.equal(g.phase, 'shuffling'); assert.equal(g.dealer, 1); assert.equal(g.mao, 2);
  g.advance();
  assert.equal(g.phase, 'dealing');
  for (const hand of g.hands) assert.equal(hand.length, 3);
  const all = [...g.hands.flat(), g.vira!].map(c => `${c.rank}${c.suit}`);
  assert.equal(new Set(all).size, 13);
  g.advance();
  assert.equal(g.turn, 2);
});

test('play goes counter-clockwise, the dealer last, and whoever takes the trick leads the next', () => {
  const g = rigged([['3 ouros', '6 ouros', '6 paus'], ['7 ouros', '7 paus', '7 copas'], ['Q ouros', 'Q paus', 'Q copas'], ['J ouros', 'J paus', 'J copas']]);
  assert.equal(g.turn, 0);
  g.play(0, 's0c0'); assert.equal(g.turn, 1);
  g.play(1, 's1c0'); assert.equal(g.turn, 2);
  g.play(2, 's2c0'); assert.equal(g.turn, 3);
  g.play(3, 's3c0');
  assert.equal(g.tricks[0], 0);
  g.advance();
  assert.equal(g.turn, 0);
  assert.throws(() => g.play(1, 's1c1'), /vez/);
});

test('a trick both partners tie on is their team\'s; opposing teams tie it', () => {
  const g = rigged([['3 ouros', ...QUIET.slice(0, 2)], ['7 ouros', '7 paus', '7 copas'], ['3 paus', 'Q paus', 'Q copas'], ['J ouros', 'J paus', 'J copas']]);
  trick(g);
  assert.equal(g.tricks[0], 0);
  const h = rigged([['3 ouros', '6 ouros', '6 espadas'], ['3 paus', '7 paus', '7 copas'], ['Q ouros', 'Q paus', 'Q copas'], ['J ouros', 'J paus', 'J copas']]);
  trick(h);
  assert.equal(h.tricks[0], 'tie');
  assert.equal(h.turn, 0, 'whoever showed that strength first leads again');
});

test('two tricks win the hand: one point, and the deal moves forward', () => {
  const g = rigged([['3 ouros', '3 paus', '6 ouros'], ['7 ouros', '7 paus', '7 copas'], ['Q ouros', 'Q paus', 'Q copas'], ['J ouros', 'J paus', 'J copas']]);
  trick(g); trick(g);
  assert.equal(g.phase, 'hand-end');
  assert.deepEqual(g.score, [1, 0]);
  const dealer = g.dealer;
  g.advance();
  assert.equal(g.dealer, (dealer + 1) % 4);
  assert.equal(g.handNumber, 2);
});

test('three tied tricks without a call: nobody scores and the deal passes', () => {
  const same = ['3 ouros', '2 ouros', 'A ouros'], other = ['3 paus', '2 paus', 'A paus'];
  const g = rigged([same, other, ['Q ouros', 'Q paus', 'Q copas'], ['J ouros', 'J paus', 'J copas']]);
  trick(g); trick(g); trick(g);
  assert.deepEqual(g.score, [0, 0]);
  assert.equal(g.phase, 'hand-end');
  assert.equal(g.result?.winner, null);
  g.advance();
  assert.equal(g.dealer, 0);
});

test('three tied tricks with a call: exposed loses, in the dark takes it', () => {
  const same = ['3 ouros', '2 ouros', 'A ouros'], other = ['3 paus', '2 paus', 'A paus'], q = ['Q ouros', 'Q paus', 'Q copas'], j = ['J ouros', 'J paus', 'J copas'];
  // Seat 1 calls with the Mão's card already face up: exposed.
  const exposed = rigged([same, other, q, j]);
  exposed.play(0, 's0c0');
  exposed.call(1); exposed.answer(0, 'accept', 3);
  assert.equal(exposed.value, 3);
  exposed.play(1, 's1c0'); exposed.play(2, 's2c0'); exposed.play(3, 's3c0'); exposed.advance();
  trick(exposed); trick(exposed);
  assert.deepEqual(exposed.score, [3, 0]);
  // Seat 0 calls before any card shows: in the dark.
  const dark = rigged([same, other, q, j]);
  dark.call(0); dark.answer(1, 'accept', 3);
  trick(dark); trick(dark); trick(dark);
  assert.deepEqual(dark.score, [3, 0]);
});

test('the ladder: each refusal pays what the hand was worth, each acceptance what was asked', () => {
  const ladder = [[3, 1], [6, 3], [9, 6], [12, 9]] as const;
  for (let steps = 0; steps < 4; steps++) {
    const g = rigged([QUIET, ['7 ouros', '7 paus', '7 copas'], ['Q ouros', 'Q paus', 'Q copas'], ['J ouros', 'J paus', 'J copas']]);
    g.score = [0, 0];
    g.call(0);
    for (let i = 0; i < steps; i++) g.answer(i % 2 === 0 ? 1 : 0, 'raise', ladder[i]![0]);
    const asker = teamOf(steps % 2 === 0 ? 0 : 1), answerer = steps % 2 === 0 ? 1 : 0;
    assert.equal(g.bet!.to, ladder[steps]![0]);
    g.answer(answerer, 'run', ladder[steps]![0]);
    assert.equal(g.score[asker], ladder[steps]![1], `running from ${ladder[steps]![0]}`);
    assert.equal(g.phase, 'hand-end');
  }
  const g = rigged([QUIET, ['7 ouros', '7 paus', '7 copas'], ['Q ouros', 'Q paus', 'Q copas'], ['J ouros', 'J paus', 'J copas']]);
  g.call(0); g.answer(1, 'raise', 3); g.answer(0, 'raise', 6); g.answer(1, 'raise', 9);
  assert.equal(g.bet!.to, 12);
  assert.throws(() => g.answer(0, 'raise', 12), /aumentar/);
  g.answer(0, 'accept', 12);
  assert.equal(g.value, 12);
  assert.equal(g.callOption(0), null);
  assert.equal(g.callOption(1), null);
});

test('calls: at any moment, out of turn too; never twice running by the same team; the other team may raise later', () => {
  const g = rigged([QUIET, ['7 ouros', '7 paus', '7 copas'], ['Q ouros', 'Q paus', 'Q copas'], ['J ouros', 'J paus', 'J copas']]);
  assert.equal(g.turn, 0);
  assert.ok(g.callOption(2), 'out of turn');
  g.call(2);
  assert.throws(() => g.play(0, 's0c0'), /vez/, 'no card while a call waits');
  assert.throws(() => g.answer(0, 'accept', 3), /outra dupla/);
  g.answer(3, 'accept', 3);
  assert.equal(g.turn, 0, 'the turn did not move');
  assert.equal(g.callOption(0), null);
  assert.equal(g.callOption(2), null);
  assert.deepEqual(g.callOption(1), { value: 6, label: 'Seis' });
});

test('first initiative: one partner answers for both, and a stale answer is refused', () => {
  const g = rigged([QUIET, ['7 ouros', '7 paus', '7 copas'], ['Q ouros', 'Q paus', 'Q copas'], ['J ouros', 'J paus', 'J copas']]);
  g.call(0);
  g.answer(1, 'accept', 3);
  assert.throws(() => g.answer(3, 'run', 3), /Não há pedido/);
  assert.equal(g.value, 3);
  const h = rigged([QUIET, ['7 ouros', '7 paus', '7 copas'], ['Q ouros', 'Q paus', 'Q copas'], ['J ouros', 'J paus', 'J copas']]);
  h.call(0); h.answer(1, 'raise', 3);
  assert.throws(() => h.answer(0, 'accept', 3), /mudou/);
});

test('the limit of points: nine may not raise to six, unless the score is level', () => {
  assert.equal(mayRaise([9, 2], 0, 6, 12), false);
  assert.equal(mayRaise([9, 9], 0, 6, 12), true);
  assert.equal(mayRaise([9, 2], 0, 3, 12), true);
  assert.equal(mayRaise([9, 2], 1, 6, 12), true);
  const g = rigged([QUIET, ['7 ouros', '7 paus', '7 copas'], ['Q ouros', 'Q paus', 'Q copas'], ['J ouros', 'J paus', 'J copas']], '4', { score: [2, 9] });
  g.call(0);
  assert.equal(g.raiseOption(1), null);
  assert.throws(() => g.answer(1, 'raise', 3), /limite/);
  g.answer(1, 'accept', 3);
  assert.equal(g.callOption(1), null, 'and no raising later either');
});

/** To the Mão de 11's decision, with known hands. */
function eleven(hands: string[][], score: [number, number], viraRank: TrucoRank = '4') {
  const g = rigged(hands, viraRank, { score });
  assert.equal(g.phase, 'eleven');
  return g;
}
const ELEVEN_HANDS = [['3 ouros', '3 paus', '6 ouros'], ['7 ouros', '7 paus', '7 copas'], ['Q ouros', 'Q paus', 'Q copas'], ['J ouros', 'J paus', 'J copas']];

test('Mão de 11: worth three, the partner\'s cards can be seen, no call, running gives one', () => {
  const g = eleven(ELEVEN_HANDS, [11, 4]);
  assert.equal(g.value, 3);
  assert.deepEqual(g.observe(0).partnerCards.map(c => c.id), ['s2c0', 's2c1', 's2c2']);
  assert.deepEqual(g.observe(1).partnerCards, [], 'the other team sees nothing');
  assert.throws(() => g.call(0), /Mão de 11/);
  assert.throws(() => g.decideEleven(1, 'play'), /dupla/);
  g.decideEleven(2, 'run');
  assert.deepEqual(g.score, [11, 5]);
  assert.equal(g.phase, 'hand-end');
});

test('Mão de 11: played, the winner takes three, and no one may call during it', () => {
  const g = eleven(ELEVEN_HANDS, [4, 11]);
  g.decideEleven(1, 'play');
  assert.equal(g.callOption(0), null);
  assert.equal(g.callOption(1), null);
  assert.throws(() => g.call(0), /Mão de 11/);
  trick(g); trick(g);
  assert.deepEqual(g.score, [7, 11], 'the team not at 11 won it: three points');
});

test('Mão de 11: three ties give the opponents three', () => {
  const g = eleven([['3 ouros', '2 ouros', 'A ouros'], ['3 paus', '2 paus', 'A paus'], ['Q ouros', 'Q paus', 'Q copas'], ['J ouros', 'J paus', 'J copas']], [11, 4]);
  g.decideEleven(0, 'play');
  trick(g); trick(g); trick(g);
  assert.deepEqual(g.score, [11, 7]);
});

test('Mão de 11: Casal Maior only has to be shown; ordinary cards do not', () => {
  const casal = eleven([['5 paus', '6 ouros', '6 espadas'], ['7 ouros', '7 paus', '7 copas'], ['5 copas', 'Q paus', 'Q copas'], ['J ouros', 'J paus', 'J copas']], [11, 4]);
  assert.ok(hasCasalMaior([...casal.hands[0]!, ...casal.hands[2]!], casal.vira!));
  assert.equal(casal.observe(0).canShow, true);
  assert.equal(casal.observe(1).canShow, false, 'the other team is not told');
  casal.decideEleven(2, 'show');
  assert.deepEqual(casal.score, [12, 4]);
  const plain = eleven(ELEVEN_HANDS, [11, 4]);
  assert.equal(plain.observe(0).canShow, false);
  assert.throws(() => plain.decideEleven(0, 'show'), /garantem/);
});

test('proven win: Zap and Copeta; or Zap, Espadilha and Pica-fumo; not Zap alone', () => {
  const vira = face('v', '4', 'ouros'), m = (suit: TrucoSuit) => ({ rank: '5', suit });
  assert.equal(provenWin([m('paus'), m('copas'), { rank: '6', suit: 'ouros' }], vira), true);
  assert.equal(provenWin([m('paus'), m('espadas'), m('ouros')], vira), true);
  assert.equal(provenWin([m('paus'), m('espadas'), { rank: '3', suit: 'ouros' }], vira), false);
  assert.equal(provenWin([m('paus'), { rank: '3', suit: 'ouros' }, { rank: '3', suit: 'paus' }], vira), false);
  assert.equal(provenWin([m('copas'), m('espadas'), m('ouros')], vira), false);
});

test('Mão de Ferro: at 11 to 11, no decision, no call; a tie gives nothing and the deal passes', () => {
  const same = ['3 ouros', '2 ouros', 'A ouros'], other = ['3 paus', '2 paus', 'A paus'];
  const g = rigged([same, other, ['Q ouros', 'Q paus', 'Q copas'], ['J ouros', 'J paus', 'J copas']], '4', { score: [11, 11] });
  assert.equal(g.iron, true); assert.equal(g.phase, 'playing');
  assert.equal(g.callOption(0), null);
  assert.throws(() => g.call(0), /Ferro/);
  trick(g); trick(g); trick(g);
  assert.deepEqual(g.score, [11, 11]);
  const dealer = g.dealer;
  g.advance();
  assert.equal(g.dealer, (dealer + 1) % 4);
  assert.equal(g.iron, true);
});

test('Mão de Ferro: whoever wins it wins the match', () => {
  const g = rigged([['3 ouros', '3 paus', '6 ouros'], ['7 ouros', '7 paus', '7 copas'], ['Q ouros', 'Q paus', 'Q copas'], ['J ouros', 'J paus', 'J copas']], '4', { score: [11, 11] });
  trick(g); trick(g);
  assert.deepEqual(g.score, [12, 11]);
  g.advance();
  assert.equal(g.phase, 'match-end'); assert.equal(g.winner, 0);
});

test('Escuro: in the Mão de Ferro, nobody sees their own cards; a played card shows', () => {
  const g = rigged([['3 ouros', '3 paus', '6 ouros'], ['7 ouros', '7 paus', '7 copas'], ['Q ouros', 'Q paus', 'Q copas'], ['J ouros', 'J paus', 'J copas']], '4', { score: [11, 11], dark: true });
  const seen = g.observe(0);
  assert.ok(seen.hand.every(c => c.rank === '?' && c.suit === ''));
  assert.equal(seen.dark, true);
  g.play(0, seen.hand[0]!.id);
  assert.equal(g.observe(1).table[0]!.card.rank, '3');
  // Outside the Ferro the option changes nothing.
  const normal = rigged([QUIET, ['7 ouros', '7 paus', '7 copas'], ['Q ouros', 'Q paus', 'Q copas'], ['J ouros', 'J paus', 'J copas']], '4', { dark: true });
  assert.equal(normal.observe(0).dark, false);
  assert.equal(normal.observe(0).hand[0]!.rank, '6');
});

test('the score stops at 12 and the match ends there', () => {
  const g = rigged([['3 ouros', '3 paus', '6 ouros'], ['7 ouros', '7 paus', '7 copas'], ['Q ouros', 'Q paus', 'Q copas'], ['J ouros', 'J paus', 'J copas']], '4', { score: [10, 0] });
  g.call(0); g.answer(1, 'accept', 3);
  trick(g); trick(g);
  assert.deepEqual(g.score, [12, 0]);
  g.advance();
  assert.equal(g.phase, 'match-end');
  assert.throws(() => g.play(0, 's0c2'), /vez/);
});

test('the face-down card: never in the first trick, worth nothing, its face told to nobody', () => {
  const g = rigged([['3 ouros', '3 paus', '3 copas'], ['7 ouros', '7 paus', '7 copas'], ['Q ouros', 'Q paus', 'Q copas'], ['J ouros', 'J paus', 'J copas']]);
  assert.equal(g.observe(0).canHide, false);
  assert.throws(() => g.play(0, 's0c0', true), /primeira vaza/);
  trick(g);
  assert.equal(g.observe(0).canHide, true, 'from the second trick');
  assert.equal(g.observe(1).canHide, false, 'on your turn');
  g.play(0, 's0c1', true);
  const seen = JSON.stringify(g.observe(1));
  assert.equal(g.table[0]!.card.rank, '?');
  assert.ok(!seen.includes('"3","suit":"paus"'), 'the 3 of clubs is nowhere');
  assert.ok(!JSON.stringify(g.log).includes('3 de paus'));
  g.play(1, 's1c1'); g.play(2, 's2c1'); g.play(3, 's3c1');
  assert.equal(g.tricks[1], 1, 'a 3 face down loses to a 7');
});

test('the face-down card: all four face down tie, and it exposes nothing to a call', () => {
  const hands = [['3 ouros', '3 paus', '3 copas'], ['7 ouros', '7 paus', '7 copas'], ['Q ouros', 'Q paus', 'Q copas'], ['J ouros', 'J paus', 'J copas']];
  const g = rigged(hands);
  trick(g);
  for (let i = 0; i < 4; i++) g.play(g.turn!, g.hands[g.turn!]![0]!.id, true);
  assert.equal(g.tricks[1], 'tie');
  // A call over a card face down is still in the dark.
  const h = rigged(hands);
  trick(h);
  h.play(0, 's0c1', true);
  h.call(1); h.answer(0, 'accept', 3);
  assert.equal(h.standing?.exposed, false);
  h.play(1, 's1c1');
  h.call(0); h.answer(1, 'accept', 6);
  assert.equal(h.standing?.exposed, true, 'a card face up is exposed');
});

test('what a match is worth: the levels, the minimum between people, and the price table can change them', () => {
  assert.deepEqual([TRUCO_LEVEL_INFO.iniciante.stake, TRUCO_LEVEL_INFO.medio.stake, TRUCO_LEVEL_INFO.experiente.stake], [100, 150, 200]);
  assert.equal(TRUCO_BET.minBet, 400);
  assert.deepEqual(trucoStakes({}).levels, { iniciante: 100, medio: 150, experiente: 200 });
  assert.equal(trucoStakes({ 'truco:level-medio': 175 }).levels.medio, 175);
  const limits = trucoStakes({ 'truco:min-bet': 600, 'truco:max-bet': 500 });
  assert.deepEqual([limits.min, limits.max], [600, 600]);
});

test('an observation holds nothing a seat could not see', () => {
  const r = seeded(3);
  for (let i = 0; i < 40; i++) {
    const g = new TrucoGame({ random: r.random, nameOf: s => NAMES[s]!, score: i % 3 === 0 ? [11, 3] : [0, 0] });
    g.advance(); g.advance();
    if (g.phase === 'eleven') g.decideEleven(0, 'play');
    for (let seat = 0; seat < 4; seat++) {
      const text = JSON.stringify(g.observe(seat));
      for (const other of [0, 1, 2, 3]) if (other !== seat) for (const card of g.hands[other]!) assert.ok(!text.includes(`"${card.id}"`), `${seat} sees ${card.id}`);
    }
  }
});

test('NPCs: hidden cards cannot change a decision, because they are not in what it receives', () => {
  const hands = (rival: string[]) => [QUIET, rival, ['Q ouros', 'Q paus', 'Q copas'], ['J ouros', 'J paus', 'J copas']];
  for (const personality of TRUCO_PERSONALITIES) {
    const decide = (rival: string[]) => { const r = seeded(11), g = rigged(hands(rival)); return JSON.stringify(trucoDecide(g.observe(0), personality, r.chance)); };
    assert.equal(decide(['5 paus', '5 copas', '5 espadas']), decide(['4 paus', '4 copas', '4 espadas']), personality);
  }
});

/** A whole match of NPCs, by the rules' own moves. */
function playMatch(team0: TrucoPersonality, team1: TrucoPersonality, seed: number, dark = false) {
  const r = seeded(seed), g = new TrucoGame({ random: r.random, nameOf: s => NAMES[s]!, dark });
  const who = (seat: number) => seat % 2 === 0 ? team0 : team1;
  let calls: Record<number, number> = { 0: 0, 1: 0 }, moves = 0;
  while (g.phase !== 'match-end') {
    assert.ok(++moves < 5000, 'the match ends');
    if (g.timed) { g.advance(); continue; }
    const seat = g.phase === 'playing' ? g.turn! : g.phase === 'bet' ? (g.bet!.team === 0 ? 1 : 0) : g.elevenTeam!;
    const decision = trucoDecide(g.observe(seat), who(seat), r.chance)!;
    assert.ok(decision, `${g.phase} needs a decision`);
    if (decision.type === 'play') g.play(seat, decision.card, !!decision.hidden);
    else if (decision.type === 'call') { calls[teamOf(seat)]!++; g.call(seat); }
    else if (decision.type === 'answer') g.answer(seat, decision.answer, g.bet!.to);
    else g.decideEleven(seat, decision.answer);
  }
  return { winner: g.winner!, score: g.score, calls };
}

test('NPCs: every personality finishes matches by the rules, in the Escuro too', () => {
  let seed = 1;
  for (const a of TRUCO_PERSONALITIES) for (const b of TRUCO_PERSONALITIES) {
    const result = playMatch(a, b, seed++, seed % 2 === 0);
    assert.ok(Math.max(...result.score) === 12);
  }
});

test('NPCs: each level beats the one below it', () => {
  // Truco has plenty of luck: the margin shows over many matches, measured at 200 each when these were tuned (about 70%, 62% and 58%).
  const series = (strong: TrucoPersonality, weak: TrucoPersonality, seed: number, matches = 40) => { let wins = 0; for (let i = 0; i < matches; i++) if (playMatch(strong, weak, seed + i * 7).winner === 0) wins++; return wins / matches; };
  assert.ok(series('experiente', 'iniciante', 900) > .6, 'experienced over beginner');
  assert.ok(series('experiente', 'blefador', 950) > .5, 'experienced over medium');
  assert.ok(series('estrategico', 'provocador', 1000) > .5, 'strategist over medium');
  assert.ok(series('provocador', 'iniciante', 1050) > .5, 'medium over beginner');
});

test('NPCs: the strategist beats the beginner over many matches, and the bluffer calls more than the cautious', () => {
  let wins = 0; const matches = 120;
  for (let i = 0; i < matches; i++) if (playMatch('estrategico', 'iniciante', 100 + i).winner === 0) wins++;
  assert.ok(wins > matches * .55, `the strategist won ${wins} of ${matches}`);
  let bluffer = 0, cautious = 0;
  for (let i = 0; i < 20; i++) { const m = playMatch('blefador', 'conservador', 500 + i); bluffer += m.calls[0]!; cautious += m.calls[1]!; }
  assert.ok(bluffer > cautious, `${bluffer} calls against ${cautious}`);
});
