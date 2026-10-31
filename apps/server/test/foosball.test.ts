import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FOOSBALL, FOOSBALL_RODS, FOOSBALL_TABLES, INTERACTABLES, aimOffset, createSim, decodeFrame, encodeFrame, foosballBetLimits, foosballSpot, isWalkable, foosballExit,
  manY, placeBall, rodIndex, startKick, stepSim, type FoosballSim,
} from '@bar/shared';
import { FoosballTable, type FoosballBank, type FoosballSummary } from '../src/minigames/foosball.js';
import { FoosballCpu, crossingY } from '../src/minigames/foosball-cpu.js';
import { GameBank, type BankEntry } from '../src/minigames/blackjack-bank.js';
import { FileOutbox } from '../src/world/outbox.js';

const DT = 1 / FOOSBALL.tickHz;
const run = (sim: FoosballSim, seconds: number) => { for (let i = 0; i < seconds * FOOSBALL.tickHz; i++) stepSim(sim, DT); };

/** A table on a clock the test moves: every tick advances it by one physics step. */
function harness(options: { bank?: FoosballBank; random?: () => number } = {}) {
  let now = 1_000_000;
  const summaries: FoosballSummary[] = [], notices: Array<[string, string]> = [];
  const table = new FoosballTable('pebolim-1', { clock: () => now, random: options.random ?? (() => .3), bank: options.bank, onMatch: s => summaries.push(s), onNotice: (id, m) => notices.push([id, m]) });
  const advance = (ms: number) => { for (let t = 0; t < ms; t += 1000 / FOOSBALL.tickHz) { now += 1000 / FOOSBALL.tickHz; table.tick(now); } };
  return { table, summaries, notices, advance, now: () => now };
}
/** Two players ready: the match is on, in its kickoff. */
async function started(h: ReturnType<typeof harness>) {
  h.table.join('ana', 'Ana'); h.table.join('bia', 'Bia');
  await h.table.ready('ana', true, h.now()); await h.table.ready('bia', true, h.now());
}
/** Rolls the ball into a goal (every figure up, so nothing is in the way). */
function shoot(table: FoosballTable, towards: 'red' | 'blue') {
  for (const rod of table.sim.rods) rod.autoLiftUntil = table.sim.time + 5000;
  table.sim.frozen = false;
  Object.assign(table.sim.ball, { x: towards === 'blue' ? .4 : -.4, y: 0, vx: towards === 'blue' ? 3 : -3, vy: 0 });
}

test('the table is the map\'s: two tables in the games hall, reachable, with places at both sides', () => {
  assert.equal(FOOSBALL_TABLES.length, 2);
  for (const place of FOOSBALL_TABLES) {
    assert.ok(INTERACTABLES.some(i => i.id === place.id && i.type === 'foosball'));
    const exit = foosballExit(place, place.x);
    assert.ok(isWalkable(exit.x, exit.z, exit.y), `${place.id}: whoever leaves stands on free floor`);
    for (const team of ['red', 'blue'] as const) {
      const spot = foosballSpot(place, team, 'solo');
      assert.ok(Math.abs(spot.z - place.z) > place.hz, 'Players stand outside the table, at its handles');
    }
  }
  // Rods 14 cm apart, alternating like the modelled table, and every figure's reach covers the whole width.
  assert.deepEqual(FOOSBALL_RODS.map(r => `${r.team[0]}${r.men}`), ['r1', 'r2', 'b3', 'r5', 'b5', 'r3', 'b2', 'b1']);
  for (const rod of FOOSBALL_RODS.filter(r => r.kind !== 'goalie')) {
    const edge = manY(rod, rod.men - 1, rod.travel) + FOOSBALL.man.halfWidth + FOOSBALL.ballRadius;
    assert.ok(edge >= FOOSBALL.width / 2 - .02, `${rod.team} ${rod.kind} reaches the wall`);
  }
});

test('the pointer puts the nearest figure in front of it, without jumping between figures', () => {
  const five = FOOSBALL_RODS[rodIndex('red', 'midfield')]!;
  for (const y of [-.28, -.1, 0, .07, .2, .28]) {
    const offset = aimOffset(five, y, 0);
    assert.ok(Math.min(...[0, 1, 2, 3, 4].map(k => Math.abs(manY(five, k, offset) - y))) < 1e-9, `a figure at ${y}`);
  }
  // The 2-rod's figures overlap in the middle: the one already there stays.
  const two = FOOSBALL_RODS[rodIndex('red', 'defense')]!;
  assert.equal(aimOffset(two, 0, .1), .12);
  assert.equal(aimOffset(two, 0, -.1), -.12);
});

test('a kick: a touch passes, a full charge is a bomb, and the ball dies at a still figure', () => {
  const speeds = [0, .5, 1].map(power => {
    const sim = createSim(), mid = rodIndex('red', 'midfield');
    for (const [i, rod] of sim.rods.entries()) if (i !== mid) rod.lift = true;
    placeBall(sim, mid); sim.frozen = false; startKick(sim.rods[mid]!, power, sim.time);
    let top = 0;
    for (let i = 0; i < 20; i++) { stepSim(sim, DT); top = Math.max(top, Math.hypot(sim.ball.vx, sim.ball.vy)); }
    return top;
  });
  assert.ok(speeds[0]! > 1 && speeds[0]! < 2, `pass ${speeds[0]}`);
  assert.ok(speeds[2]! > 4.5 && speeds[2]! < FOOSBALL.ball.maxSpeed, `bomb ${speeds[2]}`);
  assert.ok(speeds[0]! < speeds[1]! && speeds[1]! < speeds[2]!);
  // A slow ball against a figure at rest stops there (trapped), on the near side.
  const sim = createSim(); sim.frozen = false;
  const blue = FOOSBALL_RODS[rodIndex('blue', 'midfield')]!;
  for (const [i, rod] of sim.rods.entries()) if (i !== blue.index) rod.lift = true;
  run(sim, .2);
  Object.assign(sim.ball, { x: blue.x - .15, y: 0, vx: .5, vy: 0 });
  run(sim, 1);
  assert.ok(Math.abs(sim.ball.vx) < .05 && sim.ball.x < blue.x, `trapped at ${sim.ball.x}`);
});

test('figures block, raised figures let the ball through, and a team\'s own shot passes its figures ahead', () => {
  const blocked = createSim(); blocked.frozen = false;
  Object.assign(blocked.ball, { x: -.3, y: 0, vx: 2, vy: 0 });
  run(blocked, 1);
  assert.ok(!blocked.events.some(e => e.kind === 'goal'), 'the figures in the way stop it');
  const open = createSim(); open.frozen = false;
  for (const rod of open.rods) rod.lift = true;
  run(open, .2);
  Object.assign(open.ball, { x: -.3, y: 0, vx: 2, vy: 0 });
  run(open, 1);
  assert.ok(open.events.some(e => e.kind === 'goal' && e.team === 'red'), 'everything raised: straight into the blue goal');
  // The red goalie strikes: red's rods ahead rise for a moment, blue's do not.
  const shot = createSim(), keeper = rodIndex('red', 'goalie');
  placeBall(shot, keeper); shot.frozen = false; startKick(shot.rods[keeper]!, 1, shot.time);
  for (let i = 0; i < 12; i++) stepSim(shot, DT);
  assert.ok(shot.rods[rodIndex('red', 'attack')]!.autoLiftUntil > shot.time, 'red attack raised');
  assert.equal(shot.rods[rodIndex('blue', 'attack')]!.autoLiftUntil, 0, 'blue attack still down');
});

test('a goal counts once the ball is past the line, posts and walls bounce it', () => {
  const sim = createSim(); sim.frozen = false;
  for (const rod of sim.rods) rod.lift = true;
  run(sim, .2);
  Object.assign(sim.ball, { x: .45, y: .2, vx: 2, vy: 0 });
  run(sim, .5);
  assert.ok(sim.events.some(e => e.kind === 'wall'), 'off the end wall beside the goal');
  assert.ok(!sim.events.some(e => e.kind === 'goal'));
  sim.events.length = 0;
  Object.assign(sim.ball, { x: -.45, y: .02, vx: -2, vy: 0 });
  run(sim, .5);
  const goal = sim.events.find(e => e.kind === 'goal');
  assert.equal(goal?.kind === 'goal' && goal.team, 'blue', 'into red\'s goal: a goal for blue');
  assert.ok(sim.frozen, 'and the ball stays in');
});

test('frames carry the ball and the rods, and decode back', () => {
  const sim = createSim(); placeBall(sim, rodIndex('blue', 'defense'));
  sim.rods[2]!.offset = .081; sim.rods[2]!.angle = -.5;
  const frame = encodeFrame('pebolim-1', sim, 1234, [{ kind: 'kick', speed: 3.2, rod: 2, team: 'blue' }]);
  const back = decodeFrame(frame);
  assert.ok(Math.abs(back.ball.x - sim.ball.x) < 1e-4 && Math.abs(back.rods[2]!.offset - .081) < 1e-4 && Math.abs(back.rods[2]!.angle + .5) < 1e-3);
  assert.deepEqual(back.sounds, [{ kind: 'kick', speed: 3.2 }]);
  assert.ok(JSON.stringify(frame).length < 200, 'small enough for 30 a second');
});

test('the lobby: places, the host\'s settings, Zé do Totó, and the start when everyone is ready', async () => {
  const h = harness(), { table } = h;
  assert.equal(table.join('ana', 'Ana').team, 'red');
  assert.equal(table.join('bia', 'Bia').team, 'blue', 'the team with fewer players first');
  assert.throws(() => table.join('caio', 'Caio'), /completa/);
  assert.equal(table.hostId, 'ana');
  assert.throws(() => table.configure('bia', { goals: 3 }), /Só quem abriu/);
  table.configure('ana', { format: '2x2', goals: 3 });
  assert.deepEqual(table.slots.map(s => [s.team, s.role, s.playerId]), [['red', 'defense', 'ana'], ['red', 'attack', ''], ['blue', 'defense', 'bia'], ['blue', 'attack', '']]);
  table.cpu('ana', 1, true);
  assert.equal(table.slots[1]!.displayName, 'Zé do Totó');
  assert.throws(() => table.configure('ana', { stake: 50 }), /só entre jogadores/);
  // Zé's place goes to a player who arrives, and he is called again for the last one.
  assert.equal(table.join('caio', 'Caio').slot, 3);
  table.move('caio', 3);
  await table.ready('ana', true, h.now());
  assert.equal(table.phase, 'lobby', 'not everyone is ready');
  await table.ready('bia', true, h.now()); await table.ready('caio', true, h.now());
  assert.equal(table.phase, 'kickoff');
  assert.ok(table.matchId);
  assert.throws(() => table.join('duda', 'Duda'), /já começou/);
  h.advance(FOOSBALL.kickoffMs + 50);
  assert.equal(table.phase, 'playing');
  assert.ok(Math.abs(table.sim.ball.vy) > .1, 'the serve rolls the ball to the next figure');
});

test('a match: goals, the serve to whoever conceded, the end at the target, the rematch', async () => {
  const h = harness(), { table } = h;
  await started(h);
  table.configure; // settings are locked during the match
  assert.throws(() => table.configure('ana', { goals: 3 }), /rolando/);
  const first = table.serve;
  const midfield = FOOSBALL_RODS[rodIndex(first, 'midfield')]!;
  assert.ok(Math.abs(table.sim.ball.x - midfield.x) < .05, 'the serve is at the serving team\'s 5-rod');
  for (let goal = 1; goal <= FOOSBALL.defaultGoals; goal++) {
    h.advance(FOOSBALL.kickoffMs + 50);
    shoot(table, 'blue');
    h.advance(300);
    assert.equal(table.phase, 'goal');
    assert.equal(table.score.red, goal);
    assert.equal(table.serve, 'blue', 'whoever conceded serves');
    h.advance(FOOSBALL.goalMs + 50);
  }
  assert.equal(table.phase, 'finished');
  assert.equal(table.winner, 'red');
  assert.deepEqual(h.summaries[0]!.players.map(p => [p.playerId, p.result]), [['ana', 'win'], ['bia', 'loss']]);
  h.advance(FOOSBALL.finishedMs + 50);
  assert.equal(table.phase, 'lobby');
  assert.deepEqual(table.humans.map(s => [s.playerId, s.ready]), [['ana', false], ['bia', false]], 'same places, ready again for a rematch');
});

test('best of three: a set ends, the score starts over and its loser serves', async () => {
  const h = harness(), { table } = h;
  table.join('ana', 'Ana'); table.join('bia', 'Bia');
  table.configure('ana', { goals: 3, sets: 3 });
  await table.ready('ana', true, h.now()); await table.ready('bia', true, h.now());
  for (let goal = 0; goal < 3; goal++) { h.advance(FOOSBALL.kickoffMs + 50); shoot(table, 'red'); h.advance(300); h.advance(FOOSBALL.goalMs + 50); }
  assert.equal(table.phase, 'set');
  assert.equal(table.setsWon.blue, 1);
  h.advance(FOOSBALL.setMs + 50);
  assert.deepEqual([table.phase, table.score.red, table.score.blue, table.set, table.serve], ['kickoff', 0, 0, 2, 'red']);
});

test('ITSF time limits: 10 s on the 5-rod gives the ball to the other 5-rod, 15 s at the back too', async () => {
  const h = harness(), { table } = h;
  await started(h);
  h.advance(FOOSBALL.kickoffMs + 50);
  // The ball held in red's 5-rod strip, kept touched (so it is not dead).
  const red5 = FOOSBALL_RODS[rodIndex('red', 'midfield')]!;
  for (let t = 0; t < 10_500 && table.phase === 'playing'; t += 100) {
    Object.assign(table.sim.ball, { x: red5.x + .03, y: .06, vx: 0, vy: .05 });
    h.advance(100);
  }
  assert.equal(table.phase, 'kickoff');
  assert.match(table.message, /Tempo de posse estourado \(meio, 10 s\)/);
  assert.ok(table.sim.ball.x > 0, 'the ball goes to blue\'s 5-rod');
  // Still at the back, nobody playing it (it is never dead: the goalie reaches it): 15 s, then blue's 5-rod serves.
  h.advance(FOOSBALL.restartMs + 50);
  const since = h.now();
  while ((table.phase as string) === 'playing' && h.now() - since < 16_000) { Object.assign(table.sim.ball, { x: -.42, y: .25, vx: 0, vy: 0 }); h.advance(100); }
  assert.equal(table.phase, 'kickoff');
  assert.ok(h.now() - since >= FOOSBALL.possession.other);
  assert.match(table.message, /goleiro e zaga, 15 s.*Azul/);
  // Over the time on the 3-rod, the ball goes to the other team's 2-rod.
  h.advance(FOOSBALL.restartMs + 50);
  const red3 = FOOSBALL_RODS[rodIndex('red', 'attack')]!;
  while ((table.phase as string) === 'playing') { Object.assign(table.sim.ball, { x: red3.x + .03, y: .1, vx: 0, vy: 0 }); h.advance(100); }
  assert.ok(Math.abs(table.sim.ball.x - FOOSBALL_RODS[rodIndex('blue', 'defense')]!.x) < .05, 'at blue\'s 2-rod');
});

test('a dropped connection pauses the match; back in time it goes on, else Zé takes the place', async () => {
  const h = harness(), { table } = h;
  await started(h);
  h.advance(FOOSBALL.kickoffMs + 50);
  table.connection('bia', false, h.now());
  assert.equal(table.phase, 'paused');
  h.advance(2000);
  table.connection('bia', true, h.now());
  assert.equal(table.phase, 'kickoff', 'back: a countdown and the ball where it stopped');
  h.advance(FOOSBALL.restartMs + 50);
  table.connection('bia', false, h.now());
  h.advance(FOOSBALL.pauseMs + 50);
  assert.equal(table.slots.find(s => s.team === 'blue')!.cpu, 'medio');
  assert.ok(['kickoff', 'playing'].includes(table.phase));
  assert.ok(h.notices.some(([id]) => id === 'bia'));
});

test('leaving a friendly hands the place to Zé; the last player out clears the table', async () => {
  const h = harness(), { table } = h;
  await started(h);
  h.advance(FOOSBALL.kickoffMs + 50);
  table.leave('bia', h.now());
  assert.ok(table.inMatch);
  assert.equal(table.slots.find(s => s.team === 'blue')!.displayName, 'Zé do Totó');
  table.leave('ana', h.now());
  assert.equal(table.phase, 'lobby');
  assert.ok(table.slots.every(s => !s.playerId && !s.cpu));
});

test('coins: every part is taken before the start, the winners take twice theirs, a W.O. counts, a refusal calls it off', async () => {
  const staked: Array<[string, number]> = [], settled: Array<[string, number]> = [];
  let refuse = '';
  const bank: FoosballBank = {
    stake: async (id, _match, amount) => { if (id === refuse) throw new Error('Moedas insuficientes.'); staked.push([id, amount]); },
    settle: (_match, id, payout) => { settled.push([id, payout]); },
  };
  const h = harness({ bank }), { table } = h;
  table.join('ana', 'Ana'); table.join('bia', 'Bia');
  assert.throws(() => table.configure('ana', { stake: 5 }), /de 10 a 500/);
  table.configure('ana', { stake: 100 });
  assert.throws(() => table.cpu('ana', 0, true), /ocupado/);
  refuse = 'bia';
  await table.ready('ana', true, h.now()); await table.ready('bia', true, h.now());
  assert.equal(table.phase, 'lobby', 'Bia could not pay: no match');
  assert.deepEqual(settled, [['ana', 100], ['bia', 0]], 'Ana\'s part goes back');
  assert.match(table.message, /faltou a parte de Bia/);
  refuse = ''; settled.length = 0;
  await table.ready('ana', true, h.now()); await table.ready('bia', true, h.now());
  assert.equal(table.phase, 'kickoff');
  h.advance(FOOSBALL.kickoffMs + 50);
  // Bia gets up mid-match: with coins on it, that is a W.O.
  table.leave('bia', h.now());
  assert.equal(table.phase, 'finished');
  assert.equal(table.winner, 'red');
  assert.deepEqual(settled, [['ana', 200], ['bia', 0]]);
  assert.ok(h.summaries.at(-1)!.forfeit);
  assert.deepEqual(foosballBetLimits({ 'foosball:min-bet': 50, 'foosball:max-bet': 20 }), { min: 50, max: 50 });
});

test('Zé do Totó plays: he tracks the ball, strikes it and, sober, beats a player who does nothing', async () => {
  assert.equal(crossingY({ x: 0, y: 0, vx: 1, vy: 0 }, .3), 0);
  assert.ok(Math.abs(crossingY({ x: 0, y: 0, vx: 1, vy: 1 }, .5) - (2 * (FOOSBALL.width / 2 - FOOSBALL.ballRadius) - .5)) < 1e-9, 'bounces off the wall');
  let seed = 7;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const h = harness({ random }), { table } = h;
  table.join('ana', 'Ana');
  table.configure('ana', { level: 'dificil', goals: 3 });
  table.cpu('ana', 1, true);
  await table.ready('ana', true, h.now());
  let kicks = 0;
  // Every ball that dies at the idle player's figures waits for their possession clock (10–15 s): give it time.
  for (let t = 0; t < 400_000 && table.phase !== 'finished'; t += 500) {
    h.advance(500);
    kicks += table.frame(h.now())?.s?.filter((_, i, all) => i % 2 === 0 && all[i] === 3).length ?? 0;
  }
  assert.equal(table.winner, 'blue', `Zé won (${table.score.red} × ${table.score.blue})`);
  assert.ok(kicks > 3, `he struck the ball (${kicks})`);
});

test('the levels mean something: sober Zé beats Zé after a few too many', async () => {
  let seed = 11;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const h = harness({ random }), { table } = h;
  table.join('ana', 'Ana'); table.configure('ana', { level: 'dificil', goals: 5 }); table.cpu('ana', 1, true);
  await table.ready('ana', true, h.now());
  // Ana's red place played by the easy level, against the sober one.
  Object.assign(table.slots[0]!, { cpu: 'facil', brain: new FoosballCpu('facil', random) });
  for (let t = 0; t < 600_000 && table.phase !== 'finished'; t += 500) h.advance(500);
  assert.equal(table.winner, 'blue', `sober ${table.score.blue} × ${table.score.red} drunk`);
});

test('the pebolim bank journals its own stakes and settles at its own route', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bar-foosball-')), sent: Array<[string, unknown]> = [], debits: string[] = [];
  const bank = new GameBank('foosball', new FileOutbox<BankEntry>(join(dir, 'journal.jsonl')), id => ({ sessionId: `s-${id}`, userId: id }),
    async (_owner, _amount, reason) => { debits.push(reason); return { balance: 900, applied: -100 }; },
    async <T>(path: string, body: unknown) => { sent.push([path, body]); return { balance: 1100, applied: 200 } as T; }, { log: () => {} });
  await bank.stake('ana', 'm1', 100);
  assert.deepEqual(debits, ['foosball:bet:m1']);
  bank.settle('m1', 'ana', 200);
  await bank.flush();
  assert.equal(sent[0]![0], 'foosball/settle');
  assert.equal((sent[0]![1] as { payout: number }).payout, 200);
});
