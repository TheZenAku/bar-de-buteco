import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TRUCO, type TrucoLevel, type TrucoView } from '@bar/shared';
import { TrucoTable } from '../src/minigames/truco.ts';

function seeded(seed: number) { let s = seed >>> 0 || 1; const next = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 2 ** 32; }; return { chance: next, random: (n: number) => Math.floor(next() * n) }; }
function setup(seed = 5, refuse: string[] = []) {
  const views = new Map<string, TrucoView>(), notices: string[] = [], matches: Array<{ stake: number; players: Array<{ id: string; won: boolean; paid: number }> }> = [], r = seeded(seed);
  const stakes: Array<[string, number]> = [], settled: Array<[string, number]> = [];
  // As strict as the room's crypto.randomInt, which refuses an empty range.
  const random = (n: number) => { if (n < 1) throw new Error(`random(${n})`); return r.random(n); };
  const table = new TrucoTable('truco-1', { view: (id, view) => views.set(id, view), notice: (_, m) => notices.push(m), onMatch: s => matches.push(s), random, chance: r.chance,
    bank: { stake: async (id, _, amount) => { if (refuse.includes(id)) throw new Error('Sem moedas.'); stakes.push([id, amount]); }, settle: (_, id, payout) => { settled.push([id, payout]); } } });
  let now = 1_000_000;
  const run = (ms: number, step = 100) => { for (let t = 0; t < ms; t += step) { now += step; table.tick(now); } };
  return { table, views, notices, matches, stakes, settled, run, now: () => now };
}
const person = (id: string) => ({ id, name: id.toUpperCase(), color: '#b90eb2' });
function until(t: ReturnType<typeof setup>, holds: () => boolean, label: string, limit = 120_000) {
  for (let spent = 0; spent < limit && !holds(); spent += 100) t.run(100);
  assert.ok(holds(), `never: ${label}`);
}
async function start(t: ReturnType<typeof setup>, ...ids: string[]) {
  for (const id of ids) await t.table.ready(id, true, t.now());
}

test('alone at the table: the level sets the stake, and every NPC is of that level', async () => {
  const cases: Array<[TrucoLevel, number, string[]]> = [['iniciante', 100, ['iniciante']], ['medio', 150, ['conservador', 'blefador', 'provocador']], ['experiente', 200, ['experiente', 'estrategico']]];
  for (const [level, stake, personalities] of cases) {
    const t = setup();
    t.table.join(person('ana'));
    t.table.configure('ana', { level });
    await start(t, 'ana');
    assert.deepEqual(t.stakes, [['ana', stake]]);
    const view = t.views.get('ana')!;
    assert.equal(view.stake, stake);
    const npcs = view.seats.filter(s => s.kind === 'npc');
    assert.equal(npcs.length, 3);
    assert.equal(new Set(npcs.map(s => s.name)).size, 3, 'three different regulars');
    for (const npc of npcs) assert.ok(personalities.includes(npc.personalityId!), `${npc.name} is ${npc.personalityId}`);
  }
});

test('two people on one team play the level; on both teams, the table\'s stake, from 400', async () => {
  const t = setup();
  t.table.join(person('ana'));
  assert.equal(t.table.join(person('bia')), 2, 'across: partners');
  t.table.configure('ana', { level: 'medio' });
  assert.equal(t.table.stake, 150);
  t.table.move('bia', 1);
  assert.equal(t.table.betweenPeople, true);
  assert.equal(t.table.stake, 400);
  assert.throws(() => t.table.configure('ana', { stake: 300 }), /400/);
  t.table.configure('bia', { stake: 700 });
  assert.equal(t.table.stake, 700);
  t.table.move('bia', 2);
  assert.equal(t.table.stake, 150, 'partners again: the level');
  t.table.join(person('caio')); t.table.join(person('duda'));
  assert.throws(() => t.table.join(person('eva')), /cheia/);
});

test('everyone says yes first; any change asks again; nobody pays until all have', async () => {
  const t = setup();
  t.table.join(person('ana')); t.table.join(person('bia'));
  await t.table.ready('ana', true, t.now());
  assert.deepEqual(t.stakes, [], 'waiting for Bia');
  assert.equal(t.table.game, undefined);
  t.table.configure('bia', { level: 'experiente' });
  assert.equal(t.table.seats[0]!.person!.ready, false, 'the price changed: her yes is gone');
  await t.table.ready('ana', true, t.now());
  await t.table.ready('bia', true, t.now());
  assert.deepEqual(t.stakes.sort(), [['ana', 200], ['bia', 200]]);
  assert.ok(t.table.game);
});

test('someone who cannot pay calls it off, and the others get their part back', async () => {
  const t = setup(5, ['bia']);
  t.table.join(person('ana')); t.table.join(person('bia'));
  await t.table.ready('ana', true, t.now());
  await t.table.ready('bia', true, t.now());
  assert.equal(t.table.game, undefined);
  assert.deepEqual(t.settled.sort(), [['ana', 100], ['bia', 0]]);
  assert.equal(t.table.seats[0]!.person!.ready, false);
  assert.ok(t.notices.some(n => /Sem moedas/.test(n)));
});

test('the winners take twice their part: the parts added up, divided by two; the losers nothing', async () => {
  const t = setup(31);
  t.table.join(person('ana')); t.table.join(person('bia'));
  t.table.move('bia', 1);
  t.table.configure('ana', { stake: 500 });
  await start(t, 'ana', 'bia');
  assert.deepEqual(t.stakes.sort(), [['ana', 500], ['bia', 500]]);
  const game = t.table.game!;
  game.score = [11, 2]; game.elevenTeam = null;
  // Straight to the end: Ana's team takes the last points.
  game.score = [12, 2]; game.phase = 'hand-end'; t.table.tick(t.now()); t.run(TRUCO.handEndMs + 200);
  assert.equal(game.phase, 'match-end');
  assert.deepEqual(t.settled.sort(), [['ana', 1000], ['bia', 0]]);
  assert.equal(t.views.get('ana')!.prize, 500);
  assert.equal(t.views.get('bia')!.prize, -500);
  assert.equal(t.matches[0]!.stake, 500);
});

test('against NPCs the house covers their part: two people on the winning team are both paid double', async () => {
  const t = setup(31);
  t.table.join(person('ana')); t.table.join(person('bia'));
  t.table.configure('ana', { level: 'experiente' });
  await start(t, 'ana', 'bia');
  const game = t.table.game!;
  game.score = [12, 2]; game.phase = 'hand-end'; t.table.tick(t.now()); t.run(TRUCO.handEndMs + 200);
  assert.deepEqual(t.settled.sort(), [['ana', 400], ['bia', 400]]);
});

test('whoever leaves in the middle loses their part at once, even if their team wins; an NPC of the level takes the seat', async () => {
  const t = setup(6);
  t.table.join(person('ana')); t.table.join(person('bia'));
  t.table.configure('ana', { level: 'medio' });
  await start(t, 'ana', 'bia');
  t.table.leave('bia');
  assert.deepEqual(t.settled, [['bia', 0]]);
  assert.ok(['conservador', 'blefador', 'provocador'].includes(t.table.seats[2]!.npc!.personality));
  const game = t.table.game!;
  game.score = [12, 2]; game.phase = 'hand-end'; t.table.tick(t.now()); t.run(TRUCO.handEndMs + 200);
  assert.deepEqual(t.settled, [['bia', 0], ['ana', 300]], 'Bia is not paid again');
  t.table.leave('ana');
  assert.equal(t.table.game, undefined);
  assert.ok(t.table.seats.every(s => !s.person && !s.npc));
});

test('with everyone gone mid-match nobody is left owed, and the table is free again at every level', async () => {
  for (const level of ['iniciante', 'medio', 'experiente'] as TrucoLevel[]) {
    const t = setup(6);
    t.table.join(person('ana'));
    t.table.configure('ana', { level });
    await start(t, 'ana');
    assert.equal(t.table.seats.filter(s => s.npc).length, 3, 'all the regulars of the level are seated');
    t.table.leave('ana');
    assert.deepEqual(t.settled, [['ana', 0]]);
    assert.equal(t.table.game, undefined);
    assert.equal(t.table.join(person('bia')), 0, 'and the next person sits');
    t.table.tick(t.now());
    assert.equal(t.views.get('bia')!.phase, 'lobby');
  }
});

test('two people, both leaving one after the other mid-match: an NPC of the level, then a free table', async () => {
  const t = setup(6);
  t.table.join(person('ana')); t.table.join(person('bia'));
  await start(t, 'ana', 'bia');
  t.table.leave('bia');
  assert.equal(new Set(t.table.seats.map(s => s.npc?.name).filter(Boolean)).size, 3, 'three different regulars');
  t.table.leave('ana');
  assert.equal(t.table.game, undefined);
});

test('a match in play takes nobody new; after the result, the table goes back to the lobby and asks for new stakes', async () => {
  const t = setup(6);
  t.table.join(person('ana'));
  await start(t, 'ana');
  assert.throws(() => t.table.join(person('bia')), /Espere/);
  const game = t.table.game!;
  game.score = [12, 2]; game.phase = 'hand-end'; t.table.tick(t.now()); t.run(TRUCO.handEndMs + 200);
  assert.equal(t.views.get('ana')!.phase, 'match-end');
  t.table.again('ana');
  assert.equal(t.views.get('ana')!.phase, 'lobby');
  assert.equal(t.table.seats[0]!.person!.ready, false);
  await start(t, 'ana');
  const second = t.table.game!;
  second.score = [2, 12]; second.phase = 'hand-end'; t.table.tick(t.now()); t.run(TRUCO.handEndMs + 200);
  t.run(TRUCO.matchEndMs + 300);
  assert.equal(t.views.get('ana')!.phase, 'lobby', 'by itself after a while');
});

test('leaving when the match is over and coming back starts from zero, on the first screen', async () => {
  const t = setup(6);
  t.table.join(person('ana'));
  t.table.configure('ana', { level: 'experiente', dark: true });
  await start(t, 'ana');
  const game = t.table.game!;
  game.score = [12, 2]; game.phase = 'hand-end'; t.table.tick(t.now()); t.run(TRUCO.handEndMs + 200);
  assert.equal(t.views.get('ana')!.phase, 'match-end');
  t.table.leave('ana');
  t.views.clear();
  t.table.join(person('ana'));
  t.table.tick(t.now());
  const view = t.views.get('ana')!;
  assert.equal(view.phase, 'lobby');
  assert.deepEqual(view.score, [0, 0]);
  assert.equal(view.prize, undefined);
  assert.equal(view.result, undefined);
  assert.equal(view.stake, undefined);
  assert.equal(view.lobby!.level, 'iniciante', 'nothing kept from the last match');
  assert.equal(view.lobby!.dark, false);
  await start(t, 'ana');
  assert.equal(t.views.get('ana')!.phase, 'shuffling', 'and the next match starts');
  assert.deepEqual(t.views.get('ana')!.score, [0, 0]);
});

test('leaving when the match is over with someone else still seated: they stay, and whoever returns finds the lobby', async () => {
  const t = setup(6);
  t.table.join(person('ana')); t.table.join(person('bia'));
  await start(t, 'ana', 'bia');
  const game = t.table.game!;
  game.score = [12, 2]; game.phase = 'hand-end'; t.table.tick(t.now()); t.run(TRUCO.handEndMs + 200);
  t.table.leave('bia');
  assert.equal(t.views.get('ana')!.phase, 'match-end', 'Ana still sees her result');
  t.views.clear();
  t.table.join(person('bia'));
  t.table.tick(t.now());
  assert.equal(t.views.get('bia')!.phase, 'lobby');
  assert.equal(t.views.get('ana')!.phase, 'lobby');
  assert.equal(t.views.get('bia')!.prize, undefined);
});

test('nobody ever receives another player\'s unplayed cards, or the face of a card played face down', async () => {
  const t = setup(9);
  t.table.join(person('ana')); t.table.join(person('bia'));
  await start(t, 'ana', 'bia');
  for (let i = 0; i < 400; i++) {
    t.run(100);
    const game = t.table.game;
    if (!game) break;
    for (const id of ['ana', 'bia']) {
      const view = t.views.get(id);
      if (!view) continue;
      const text = JSON.stringify(view), self = view.selfSeat;
      for (let seat = 0; seat < 4; seat++) {
        if (seat === self) continue;
        for (const card of game.hands[seat]!) assert.ok(!text.includes(`"${card.id}"`), `${id} got ${card.id}`);
      }
      for (const s of view.seats) assert.ok(!('hand' in s));
    }
    const mine = game.turn === 0 ? 'ana' : game.turn === 2 ? 'bia' : '';
    if (game.phase === 'playing' && mine) t.table.play(mine, game.hands[game.turn!]![0]!.id, game.canHide(game.turn!), t.now());
    else if (game.phase === 'bet' && game.bet!.team !== 0) t.table.answer('ana', 'accept', game.bet!.to, t.now());
    else if (game.phase === 'eleven' && game.elevenTeam === 0) t.table.eleven('ana', 'play', t.now());
  }
});

test('the partner\'s cards reach only the team at 11, and only while it decides', async () => {
  const t = setup(21);
  t.table.join(person('ana'));
  await start(t, 'ana');
  t.table.game!.score = [11, 2];
  t.table.game!.elevenTeam = 0; t.table.game!.value = 3;
  until(t, () => t.table.game!.phase === 'eleven', 'eleven');
  const view = t.views.get('ana')!;
  assert.equal(view.eleven?.mine, true);
  assert.equal(view.eleven?.partnerCards?.length, 3);
  t.table.eleven('ana', 'play', t.now());
  assert.equal(t.views.get('ana')!.eleven, undefined);
  assert.ok(!JSON.stringify(t.views.get('ana')).includes('partnerCards'));
});

test('an NPC beside a person leaves the answer to them, until time runs out', async () => {
  const t = setup(4);
  t.table.join(person('ana'));
  await start(t, 'ana');
  until(t, () => t.table.game!.phase === 'playing', 'the deal');
  const game = t.table.game!;
  game.call(1);
  t.run(TRUCO.npcMaxMs + 500);
  assert.equal(game.phase, 'bet', 'the partner waited');
  t.run(TRUCO.answerMs);
  assert.notEqual(game.phase === 'bet' && game.bet?.by === 1 && game.bet.to === 3, true, 'and answered when time ran out');
});

test('without an NPC on the team, no answer in time is running away', async () => {
  const t = setup(4);
  t.table.join(person('ana')); t.table.join(person('bia'));
  await start(t, 'ana', 'bia');
  until(t, () => t.table.game!.phase === 'playing', 'the deal');
  const game = t.table.game!, before = game.score[1];
  game.call(1);
  t.run(TRUCO.answerMs + 200);
  assert.equal(game.score[1], before + 1);
});

test('a turn that runs out plays the first card and tells the player', async () => {
  const t = setup(8);
  t.table.join(person('ana'));
  await start(t, 'ana');
  until(t, () => t.table.game?.phase === 'playing' && t.table.game.turn === 0, 'your turn');
  const left = t.table.game!.hands[0]!.length;
  t.run(TRUCO.turnMs + 200);
  assert.equal(t.table.game!.hands[0]!.length, left - 1);
  assert.match(t.notices[0]!, /tempo/);
});

test('faces: everyone at the table sees one, a moment apart', async () => {
  const t = setup(14);
  t.table.join(person('ana')); t.table.join(person('bia'));
  await start(t, 'ana', 'bia');
  until(t, () => t.table.game!.phase === 'playing', 'the deal');
  t.table.signal('ana', 'zap', t.now());
  assert.deepEqual(t.views.get('bia')!.seats[0]!.signal?.signal, 'zap');
  assert.throws(() => t.table.signal('ana', 'copeta', t.now()), /Calma/);
  t.run(TRUCO.signalCooldownMs + 100);
  t.table.signal('ana', 'copeta', t.now());
  assert.equal(t.views.get('ana')!.seats[0]!.signal?.signal, 'copeta');
});

test('whole matches against NPCs of each level run to the end and pay once', async () => {
  for (const [seed, level] of [[31, 'iniciante'], [32, 'medio'], [33, 'experiente']] as Array<[number, TrucoLevel]>) {
    const t = setup(seed);
    t.table.join(person('ana'));
    t.table.configure('ana', { level });
    await start(t, 'ana');
    for (let spent = 0; spent < 3_000_000 && t.table.game?.phase !== 'match-end'; spent += 200) {
      t.run(200, 200);
      const game = t.table.game!;
      if (game.phase === 'playing' && game.turn === 0) t.table.play('ana', game.hands[0]![0]!.id, false, t.now());
      else if (game.phase === 'bet' && game.bet!.team === 1) t.table.answer('ana', 'accept', game.bet!.to, t.now());
      else if (game.phase === 'eleven' && game.elevenTeam === 0) t.table.eleven('ana', 'play', t.now());
    }
    assert.equal(t.table.game!.phase, 'match-end');
    assert.ok(Math.max(...t.table.game!.score) === 12);
    assert.equal(t.settled.length, 1, 'one settlement');
    assert.equal(t.matches.length, 1);
  }
});
