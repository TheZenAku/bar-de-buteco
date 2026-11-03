import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CUSHIONS, FOOT_SPOT, HALF_LENGTH, HALF_WIDTH, HEAD_SPOT, HEAD_STRING, INTERACTABLES, POCKETS, POOL, POOL_TABLE, POOL_TABLES, PoolPlanner, aimGuide, decodeBalls, decodeTracks, isWalkable,
  judgeShot, newRack, poolExit, poolSpot, rackBalls, shotFacts, simulateShot, spotBall, stickTouches, trackAt,
  type PoolBallSpot, type PoolRack, type PoolShotFacts, type PoolShotView, type PoolStroke,
} from '@bar/shared';
import { PoolTable, listBalls, type PoolBank, type PoolSummary } from '../src/minigames/pool.js';

const R = POOL_TABLE.ballRadius;
const seeded = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const stroke = (angle: number, power: number, extra: Partial<PoolStroke> = {}): PoolStroke => ({ angle, power, spinX: 0, spinY: 0, elevation: 0, ...extra });
const ball = (balls: readonly PoolBallSpot[], n: number) => balls.find(b => b.n === n);
const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const facts = (f: Partial<PoolShotFacts>): PoolShotFacts => ({ firstHit: -1, pocketed: [], offTable: [], cushioned: [], jumpedOver: false, doubleHit: false, touched: [], moving: false, ...f });
const rackAs = (patch: Partial<PoolRack>): PoolRack => ({ ...newRack(0), breaking: false, ...patch });
/** The aim that sends ball `n` (at bx, by) into a pocket: the ghost ball's direction from the cue ball. */
function potAngle(cue: { x: number; y: number }, bx: number, by: number, pocket: number): number {
  const p = POCKETS[pocket]!, ox = p.aimX - bx, oy = p.aimY - by, l = Math.hypot(ox, oy);
  return Math.atan2(by - oy / l * 2 * R - cue.y, bx - ox / l * 2 * R - cue.x);
}
/** Every ball on the cloth (or resting in a pocket's mouth, against a jaw), clear of the cushions and of every other ball. */
function noOverlap(balls: readonly PoolBallSpot[], tolerance = 1e-6): void {
  for (const a of balls) {
    assert.ok(Math.abs(a.x) <= HALF_LENGTH + .03 && Math.abs(a.y) <= HALF_WIDTH + .03, `ball ${a.n} on the table (${a.x.toFixed(4)}, ${a.y.toFixed(4)})`);
    for (const c of CUSHIONS) {
      const dx = c.bx - c.ax, dy = c.by - c.ay, s = Math.max(0, Math.min(1, ((a.x - c.ax) * dx + (a.y - c.ay) * dy) / (dx * dx + dy * dy)));
      assert.ok(Math.hypot(a.x - c.ax - dx * s, a.y - c.ay - dy * s) >= R - tolerance, `ball ${a.n} clear of the cushions (${a.x.toFixed(4)}, ${a.y.toFixed(4)})`);
    }
    for (const b of balls) if (a.n < b.n) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 2 * R - tolerance, `balls ${a.n} and ${b.n} do not overlap`);
  }
}
/** The view rounds positions to a tenth of a millimetre. */
const VIEW_TOLERANCE = 1.5e-4;

// ── The table in the bar ──────────────────────────────────────────────────────────────────────────────────────────

test('the three map tables of the games hall are pool tables, each with two places on free floor', async () => {
  assert.equal(POOL_TABLES.length, 3);
  for (const place of POOL_TABLES) {
    assert.ok(INTERACTABLES.some(i => i.id === place.id && i.type === 'pool'), `${place.id} is used with E`);
    for (const seat of [0, 1]) {
      const spot = poolSpot(place, seat), exit = poolExit(place, seat);
      assert.ok(isWalkable(spot.x, spot.z, spot.y), `${place.id} seat ${seat} stands on free floor`);
      assert.ok(isWalkable(exit.x, exit.z, exit.y), `${place.id} seat ${seat} leaves onto free floor`);
    }
  }
  // Pockets: four corners and two sides, mouths of about two balls.
  assert.equal(POCKETS.filter(p => p.side).length, 2);
  assert.ok(POOL_TABLE.cornerCut * Math.SQRT2 > 4 * R && POOL_TABLE.cornerCut * Math.SQRT2 < 4.4 * R);
});

test('the rack: 1 in front on the lower mark, 8 in the middle, a solid and a stripe at the base corners', async () => {
  for (let s = 1; s < 30; s++) {
    const balls = rackBalls(seeded(s)), objects = balls.filter(b => b.n);
    assert.deepEqual(objects.map(b => b.n).sort((a, b) => a - b), ALL);
    const apex = ball(balls, 1)!;
    assert.ok(Math.hypot(apex.x - FOOT_SPOT.x, apex.y - FOOT_SPOT.y) < 1e-3, '1 on the lower mark');
    const rows = [...new Set(objects.map(b => Math.round((b.x - FOOT_SPOT.x) * 100)))].sort((a, b) => a - b);
    assert.equal(rows.length, 5);
    const middle = objects.filter(b => Math.round((b.x - FOOT_SPOT.x) * 100) === rows[2]).sort((a, b) => a.y - b.y);
    assert.equal(middle[1]!.n, 8, '8 in the middle of the triangle');
    const base = objects.filter(b => Math.round((b.x - FOOT_SPOT.x) * 100) === rows[4]).sort((a, b) => a.y - b.y);
    const corners = [base[0]!.n, base[4]!.n];
    assert.ok(corners.some(n => n < 8) && corners.some(n => n > 8), 'a solid and a stripe at the corners');
    noOverlap(balls);
  }
});

// ── Physics ───────────────────────────────────────────────────────────────────────────────────────────────────────

test('a real break: the balls spread, stay apart and on the cloth, and the break is legal (scenario 1)', async () => {
  let legal = 0;
  for (let s = 1; s <= 12; s++) {
    const balls = rackBalls(seeded(s)), shot = simulateShot(balls, stroke(0, 1, { spinY: -.2 }), { record: true });
    noOverlap(shot.balls);
    assert.equal(shot.firstHit, 1, 'the cue ball meets the 1 first');
    assert.equal(shot.balls.length + shot.pocketed.length + shot.offTable.length, 16, 'no ball vanishes');
    assert.ok(shot.duration > 1000 && shot.duration < 40_000);
    const verdict = judgeShot(newRack(0), ALL, shotFacts(shot));
    if (!verdict.fouls.length) legal++;
    assert.ok(!verdict.fouls.includes('break-cushions'), 'a full break sends balls to the cushions');
    // The recorded paths end where the balls ended.
    for (const track of decodeTracks(shotTracks(shot))) {
      const end = trackAt(track, shot.duration + 1);
      const final = ball(shot.balls, track.n);
      if (track.end === 'stop') assert.ok(final && Math.hypot(end.x - final.x, end.y - final.y) < 2e-4, `track of ${track.n} ends at the ball`);
      else assert.ok(end.gone);
    }
  }
  assert.ok(legal >= 10, `most breaks are clean (${legal}/12)`);
});
const shotTracks = (shot: ReturnType<typeof simulateShot>) => (shot.tracks ?? []).map(t => { const row = [t.n, t.end === 'stop' ? 0 : t.end === 'pocket' ? 1 : 2, t.pocket]; t.t.forEach((ms, i) => row.push(ms, t.x[i]!, t.y[i]!)); return row; });

test('pots: straight into a side pocket, a cut into a corner, along the cushion into the corner', async () => {
  const side = simulateShot([{ n: 0, x: 0, y: -.2 }, { n: 5, x: 0, y: .2 }], stroke(Math.PI / 2, .3));
  assert.equal(side.pocketed[0]?.n, 5); assert.equal(side.pocketed[0]?.pocket, 4);
  for (const cx of [.1, .4]) {
    const cue = { x: cx, y: 0 }, shot = simulateShot([{ n: 0, ...cue }, { n: 9, x: .7, y: .25 }], stroke(potAngle(cue, .7, .25, 5), .35));
    assert.equal(shot.pocketed[0]?.n, 9, `cut from x ${cx}`); assert.equal(shot.pocketed[0]?.pocket, 5);
  }
  const rail = simulateShot([{ n: 0, x: 0, y: .4 }, { n: 3, x: .3, y: HALF_WIDTH - R }], stroke(Math.atan2(HALF_WIDTH - R - .4, .3 - 2 * R), .3));
  assert.equal(rail.pocketed[0]?.n, 3);
});

test('spin: draw comes back, a stun stops short, follow goes on; side spin changes the angle off a cushion', async () => {
  const end = (spinY: number) => ball(simulateShot([{ n: 0, x: -.6, y: 0 }, { n: 2, x: -.3, y: 0 }], stroke(0, .22, { spinY })).balls, 0)!.x;
  const draw = end(-.6), stun = end(0), follow = end(.6), contact = -.3 - 2 * R;
  assert.ok(draw < contact - .05, `draw comes back (${draw.toFixed(3)})`);
  assert.ok(follow > stun + .2 && follow > contact + .2, `follow goes on (${follow.toFixed(3)})`);
  const off = (spinX: number) => ball(simulateShot([{ n: 0, x: 0, y: 0 }], stroke(Math.atan2(.45, .3), .3, { spinX })).balls, 0)!;
  const left = off(-1), none = off(0), right = off(1);
  assert.ok(Math.hypot(left.x - none.x, left.y - none.y) > .1 && Math.hypot(right.x - none.x, right.y - none.y) > .1, 'side spin turns the ball off the cushion');
});

test('simultaneous contacts: a cue ball meeting two touching balls at once splits them evenly (scenario 14)', async () => {
  const shot = simulateShot([{ n: 0, x: -.4, y: 0 }, { n: 3, x: 0, y: R + 5e-5 }, { n: 11, x: 0, y: -R - 5e-5 }], stroke(0, .08));
  const a = ball(shot.balls, 3)!, b = ball(shot.balls, 11)!;
  assert.ok(Math.abs(a.y + b.y) < .01 && Math.abs(a.x - b.x) < .01, `mirror images (${a.x.toFixed(3)},${a.y.toFixed(3)}) (${b.x.toFixed(3)},${b.y.toFixed(3)})`);
  assert.deepEqual([...shot.firstHits].sort((x, y) => x - y), [3, 11]);
  // A legal ball and an illegal one met at once: legal (stripes' player hit the 11 with the 3).
  const verdict = judgeShot(rackAs({ groups: ['stripes', 'solids'] }), ALL, shotFacts(shot));
  assert.ok(!verdict.fouls.includes('wrong-first'));
});

test('nothing goes through anything: full-power shots in every direction keep every ball on the table and apart', async () => {
  const random = seeded(99);
  for (let k = 0; k < 24; k++) {
    const balls = rackBalls(random);
    const broken = simulateShot(balls, stroke((random() - .5) * .2, 1)).balls;
    if (!ball(broken, 0)) continue;
    const shot = simulateShot(broken, stroke(random() * Math.PI * 2, 1, { spinX: random() * 2 - 1, spinY: random() * 2 - 1 }));
    noOverlap(shot.balls);
    assert.equal(shot.balls.length + shot.pocketed.length + shot.offTable.length, broken.length);
  }
});

test('the same stroke gives the same result: the physics steps a fixed millisecond, never the frame rate', async () => {
  const balls = rackBalls(seeded(5)), a = simulateShot(balls, stroke(.01, .97), { record: true }), b = simulateShot(balls, stroke(.01, .97), { record: true });
  assert.deepEqual(a.balls, b.balls); assert.deepEqual(a.pocketed, b.pocketed); assert.deepEqual(a.tracks, b.tracks);
});

test('fouls the physics sees: double hit, the cue ball jumping over a ball and off the table, the stick on a ball', async () => {
  assert.equal(simulateShot([{ n: 0, x: 0, y: 0 }, { n: 4, x: 2 * R + 1e-4, y: 0 }], stroke(0, .5)).doubleHit, true, 'straight through a frozen ball');
  assert.equal(simulateShot([{ n: 0, x: 0, y: 0 }, { n: 4, x: R * 1.42, y: R * 1.42 }], stroke(0, .5)).doubleHit, false, 'a cut off a close ball is clean');
  assert.equal(simulateShot([{ n: 0, x: 0, y: 0 }, { n: 4, x: .3, y: 0 }], stroke(0, .5)).doubleHit, false);
  const jump = simulateShot([{ n: 0, x: -.3, y: 0 }, { n: 4, x: -.1, y: 0 }], stroke(0, 1, { elevation: 45 }));
  assert.ok(jump.jumpedOver); assert.deepEqual(jump.offTable, [0]);
  assert.deepEqual(stickTouches([{ n: 0, x: 0, y: 0 }, { n: 3, x: -.3, y: .01 }], stroke(0, .5)), [3], 'a level cue lies on the ball behind');
  assert.deepEqual(stickTouches([{ n: 0, x: 0, y: 0 }, { n: 3, x: -.3, y: .01 }], stroke(0, .5, { elevation: 20 })), [], 'raised, it passes over');
  const touched = simulateShot([{ n: 0, x: 0, y: 0 }, { n: 3, x: -.3, y: .01 }, { n: 5, x: .4, y: 0 }], stroke(0, .3));
  assert.deepEqual(touched.touched, [3]);
});

test('the aiming guide: the ghost ball, the object ball along the line of centres, the cue ball off the tangent', async () => {
  const guide = aimGuide([{ n: 0, x: 0, y: 0 }, { n: 3, x: .6, y: .02 }], 0)!;
  assert.equal(guide.ball, 3);
  assert.ok(Math.abs(Math.hypot(guide.ghost!.x - .6, guide.ghost!.y - .02) - 2 * R) < 1e-9);
  assert.ok(Math.abs(guide.object!.x * guide.cueAfter!.x + guide.object!.y * guide.cueAfter!.y) < 1e-9, 'tangent line at 90°');
  const bank = aimGuide([{ n: 0, x: 0, y: 0 }], Math.PI / 2, 1)!;
  assert.ok(bank.path.length >= 2);
});

// ── Rules (Noel Snooker) ──────────────────────────────────────────────────────────────────────────────────────────

test('break: valid with nothing pocketed passes the turn; under two cushions is a foul (scenarios 1, 2)', async () => {
  const clean = judgeShot(newRack(0), ALL, facts({ firstHit: 1, cushioned: [3, 7, 0] }));
  assert.deepEqual(clean.fouls, []); assert.equal(clean.again, false); assert.deepEqual(clean.groups, ['', '']);
  const weak = judgeShot(newRack(0), ALL, facts({ firstHit: 1, cushioned: [0] }));
  assert.deepEqual(weak.fouls, ['break-cushions']);
  // A ball that dropped reached a cushion too; the cue ball counts.
  assert.deepEqual(judgeShot(newRack(0), ALL, facts({ firstHit: 1, cushioned: [0], pocketed: [5] })).fouls, []);
  assert.deepEqual(judgeShot(newRack(0), ALL, facts({ firstHit: 1, cushioned: [0, 4], pocketed: [0] })).fouls, ['scratch'], 'scratch on the break');
  assert.deepEqual(judgeShot(newRack(0), ALL, facts({ firstHit: 1, cushioned: [0], pocketed: [0] })).fouls.sort(), ['break-cushions', 'scratch'], 'only the cue ball got there');
});

test('break with both groups down: the first to drop gives the group, the breaker goes on (scenario 3)', async () => {
  const v = judgeShot(newRack(0), ALL, facts({ firstHit: 1, cushioned: [2, 4], pocketed: [12, 3] }));
  assert.deepEqual(v.fouls, []); assert.equal(v.again, true); assert.deepEqual(v.groups, ['stripes', 'solids']); assert.equal(v.assigned, 'stripes');
  const foul = judgeShot(newRack(0), ALL, facts({ firstHit: 1, cushioned: [2, 4], pocketed: [12, 0] }));
  assert.deepEqual(foul.groups, ['', ''], 'a foul break leaves the table open'); assert.equal(foul.again, false); assert.equal(foul.respotCue, true);
});

test('open table: no foul for both groups, the first in decides; the 8 first is a foul (scenario 4)', async () => {
  const rack = rackAs({ turn: 1 });
  const v = judgeShot(rack, ALL, facts({ firstHit: 2, pocketed: [2, 10] }));
  assert.deepEqual(v.fouls, []); assert.deepEqual(v.groups, ['stripes', 'solids']); assert.equal(v.again, true);
  assert.deepEqual(judgeShot(rack, ALL, facts({ firstHit: 8 })).fouls, ['wrong-first']);
  assert.deepEqual(judgeShot(rack, ALL, facts({ firstHit: 10, pocketed: [10] })).groups, ['solids', 'stripes']);
});

test('continuity: own ball down goes on, nothing down passes, opponent ball first or down is a foul (scenarios 5, 6, 8)', async () => {
  const rack = rackAs({ groups: ['solids', 'stripes'] });
  assert.equal(judgeShot(rack, ALL, facts({ firstHit: 3, pocketed: [3] })).again, true);
  const miss = judgeShot(rack, ALL, facts({ firstHit: 3 }));
  assert.equal(miss.again, false); assert.deepEqual(miss.fouls, []);
  assert.deepEqual(judgeShot(rack, ALL, facts({ firstHit: 11, pocketed: [3] })).fouls, ['wrong-first']);
  const both = judgeShot(rack, ALL, facts({ firstHit: 3, pocketed: [3, 11] }));
  assert.deepEqual(both.fouls, ['opponent-ball']); assert.equal(both.again, false);
  assert.deepEqual(judgeShot(rack, ALL, facts({ firstHit: -1 })).fouls, ['no-hit']);
});

test('fouls: scratch, cue ball off the table, playing while balls roll, the stick on a ball, jump (scenarios 7, 9)', async () => {
  const rack = rackAs({ groups: ['solids', 'stripes'] });
  const scratch = judgeShot(rack, ALL, facts({ firstHit: 3, pocketed: [3, 0] }));
  assert.deepEqual(scratch.fouls, ['scratch']); assert.equal(scratch.again, false); assert.equal(scratch.respotCue, true);
  const off = judgeShot(rack, ALL, facts({ firstHit: 3, offTable: [0] }));
  assert.deepEqual(off.fouls, ['off-table']); assert.equal(off.respotCue, true);
  const objectOff = judgeShot(rack, ALL, facts({ firstHit: 3, offTable: [12] }));
  assert.deepEqual(objectOff.respot, [12], 'an object ball off the table goes back on the lower mark');
  for (const [f, foul] of [[{ moving: true }, 'moving'], [{ touched: [9] }, 'touch'], [{ doubleHit: true }, 'double'], [{ jumpedOver: true }, 'jump']] as const)
    assert.deepEqual(judgeShot(rack, ALL, facts({ firstHit: 3, pocketed: [3], ...f })).fouls, [foul]);
  // The marks: the cue ball back on the upper one (or along the long line towards the head cushion when taken).
  assert.deepEqual(spotBall([{ n: 5, x: 0, y: 0 }], HEAD_SPOT, -1), { x: HEAD_SPOT.x, y: 0 });
  const moved = spotBall([{ n: 5, x: HEAD_SPOT.x, y: 0 }], HEAD_SPOT, -1);
  assert.ok(moved.x < HEAD_SPOT.x - 2 * R + 1e-3 && moved.y === 0);
});

test('the 8: early is a loss, legal is a win, on the same shot as the last ball is early (scenarios 10, 11)', async () => {
  const onTable = [1, 8, 9, 10];
  const early = judgeShot(rackAs({ groups: ['solids', 'stripes'] }), onTable, facts({ firstHit: 1, pocketed: [1, 8] }));
  assert.equal(early.winner, 1); assert.match(early.reason, /antes da hora/);
  assert.equal(judgeShot(rackAs({}), ALL, facts({ firstHit: 3, pocketed: [8] })).winner, 1, 'on an open table too');
  const win = judgeShot(rackAs({ groups: ['solids', 'stripes'] }), [8, 9, 10], facts({ firstHit: 8, pocketed: [8] }));
  assert.equal(win.winner, 0);
  assert.deepEqual(judgeShot(rackAs({ groups: ['solids', 'stripes'] }), [8, 9], facts({ firstHit: 9 })).fouls, ['wrong-first'], 'on the 8, the 8 first');
});

test('the 8 with the cue ball: a loss with only the 8 in play, the benefit while the opponent has balls (scenario 12)', async () => {
  const lone = judgeShot(rackAs({ groups: ['solids', 'stripes'] }), [8], facts({ firstHit: 8, pocketed: [8, 0] }));
  assert.equal(lone.winner, 1); assert.match(lone.reason, /branca/);
  const benefit = judgeShot(rackAs({ groups: ['solids', 'stripes'] }), [8, 9, 12, 14], facts({ firstHit: 8, pocketed: [8, 0] }));
  assert.equal(benefit.winner, -1); assert.equal(benefit.benefit, 1); assert.equal(benefit.removed, 9, 'the lowest of theirs comes out');
  const last = judgeShot(rackAs({ groups: ['solids', 'stripes'] }), [8, 13], facts({ firstHit: 8, pocketed: [8, 0] }));
  assert.equal(last.winner, 1, 'their last ball out with the benefit: they win');
  assert.equal(judgeShot(rackAs({ groups: ['solids', 'stripes'] }), [2, 8, 13], facts({ firstHit: 2, pocketed: [8, 0] })).winner, 1, 'not on the 8: early');
});

test('the 8 with an opponent ball: the benefit, then one continuous turn decides (scenario 13)', async () => {
  const v = judgeShot(rackAs({ groups: ['solids', 'stripes'] }), [8, 10, 11, 15], facts({ firstHit: 8, pocketed: [8, 11] }));
  assert.deepEqual(v.fouls, ['opponent-ball']); assert.equal(v.benefit, 1); assert.equal(v.removed, 10);
  const run = rackAs({ groups: ['solids', 'stripes'], turn: 1, benefit: 1 });
  assert.equal(judgeShot(run, [15], facts({ firstHit: 15, pocketed: [15] })).winner, 1, 'cleared: wins');
  const going = judgeShot(run, [12, 15], facts({ firstHit: 12, pocketed: [12] }));
  assert.equal(going.again, true); assert.equal(going.benefit, 1);
  assert.equal(judgeShot(run, [12, 15], facts({ firstHit: 12 })).winner, 0, 'a miss in the run: the one who pocketed the 8 wins');
  assert.equal(judgeShot(run, [12, 15], facts({ firstHit: 12, pocketed: [12, 0] })).winner, 0, 'a foul in the run too');
});

test('the 8 on the break: the breaker chooses after a clean one, the other player after a foul', async () => {
  const clean = judgeShot(newRack(0), ALL, facts({ firstHit: 1, cushioned: [2, 3], pocketed: [8] }));
  assert.deepEqual(clean.choice, { seat: 0, foul: false });
  const foul = judgeShot(newRack(0), ALL, facts({ firstHit: 1, cushioned: [2, 3], pocketed: [8, 0] }));
  assert.deepEqual(foul.choice, { seat: 1, foul: true }); assert.equal(foul.respotCue, true);
});

// ── The table ─────────────────────────────────────────────────────────────────────────────────────────────────────

function harness(seed = 3, bank?: PoolBank) {
  let now = 5_000_000;
  const shots: PoolShotView[] = [], summaries: PoolSummary[] = [], notices: Array<[string, string]> = [];
  const table = new PoolTable('sinuca-1', { bank, clock: () => now, random: seeded(seed), onShot: s => shots.push(s), onMatch: s => summaries.push(s), onNotice: (id, m) => notices.push([id, m]), thinkBudgetMs: 1000 });
  const advance = (ms: number) => { for (let t = 0; t < ms; t += 50) { now += 50; table.tick(now); } };
  /** Until the balls stop and the verdict is in. */
  const settle = () => { for (let i = 0; i < 2000 && table.phase === 'rolling'; i++) { now += 50; table.tick(now); } };
  return { table, shots, summaries, notices, advance, settle, now: () => now };
}
/** Ana and Bia at the table, the toss chosen: Ana breaks. */
async function started(h: ReturnType<typeof harness>) {
  h.table.join('ana', 'Ana'); h.table.join('bia', 'Bia');
  await h.table.ready('ana', true); await h.table.ready('bia', true);
  assert.equal(h.table.phase, 'choice'); assert.equal(h.table.choice?.kind, 'toss');
  const chooser = h.table.seats[h.table.choice!.seat]!.playerId;
  h.table.choose(chooser, chooser === 'ana' ? 'break' : 'pass');
  assert.equal(h.table.phase, 'aim'); assert.equal(h.table.rack.turn, 0); assert.equal(h.table.placing, true);
}

test('a match: toss, the break placed in the quadro, the stroke plays out, the verdict, the next turn', async () => {
  const h = harness();
  await started(h);
  assert.throws(() => h.table.shoot('bia', { shot: 0, ...stroke(0, 1) }), /vez/);
  assert.throws(() => h.table.shoot('ana', { shot: 0, ...stroke(0, 1), cue: { x: .2, y: 0 } }), /quadro/);
  assert.throws(() => h.table.shoot('ana', { shot: 7, ...stroke(0, 1) }), /já passou/);
  h.table.shoot('ana', { shot: 0, ...stroke(0, 1, { spinY: -.2 }), cue: { x: HEAD_STRING - .1, y: .05 } });
  assert.equal(h.table.phase, 'rolling'); assert.equal(h.shots.length, 1);
  assert.ok(h.shots[0]!.tracks.length > 5 && h.shots[0]!.duration > 500);
  // A double click repeats the stroke counter: ignored, no foul.
  h.table.shoot('ana', { shot: 0, ...stroke(0, 1) });
  h.settle();
  assert.ok(['aim', 'choice'].includes(h.table.phase));
  assert.equal(h.table.rack.breaking, false);
  assert.ok(!h.table.lastFouls.includes('moving'));
  const balls = decodeBalls(h.table.snapshot().balls);
  assert.equal(balls.length + h.table.pocketed.length, 16);
  noOverlap(balls, VIEW_TOLERANCE); noOverlap(h.table.balls);
  assert.ok(h.table.feed.length > 0);
});

test('a stroke sent while the balls still roll is the foul of playing with a ball in motion', async () => {
  const h = harness(8);
  await started(h);
  h.table.shoot('ana', { shot: 0, ...stroke(0, 1), cue: { x: HEAD_STRING - .1, y: 0 } });
  h.table.shoot('ana', { shot: 1, ...stroke(1, .5) });
  h.settle();
  assert.ok(h.table.lastFouls.includes('moving'));
  assert.equal(h.table.rack.turn, 1);
});

test('shots in sequence to the end against the house\'s player: every ball accounted for, the turn by the rules (scenario 15)', async () => {
  for (const seed of [2, 6, 11]) {
    const h = harness(seed);
    h.table.join('ana', 'Ana'); h.table.configure('ana', { level: 'dificil' }); h.table.cpu('ana', true); await h.table.ready('ana', true);
    let strokes = 0;
    for (let guard = 0; guard < 4000 && h.table.phase !== 'finished'; guard++) {
      const t = h.table;
      if (t.phase === 'choice' && t.seats[t.choice!.seat]!.playerId === 'ana') t.choose('ana', t.choice!.kind === 'toss' ? 'break' : 'spot');
      else if (t.phase === 'aim' && t.seats[t.rack.turn]!.playerId === 'ana') {
        // Ana plays like the house's best: the same planner.
        const planner = new PoolPlanner(t.rack, t.rack.turn, t.balls, 'dificil', seeded(seed + strokes), t.placing);
        while (!planner.step(1000));
        const plan = planner.plan();
        t.shoot('ana', { shot: t.shot, ...plan.stroke, ...(plan.cue ? { cue: plan.cue } : {}) });
      }
      const before = t.shot;
      h.advance(100);
      if (t.shot !== before) strokes++;
      if (t.phase !== 'rolling') {
        const balls = decodeBalls(t.snapshot().balls);
        assert.equal(balls.length + t.pocketed.length, 16, 'every ball on the table or pocketed');
        assert.ok(balls.some(b => b.n === 0), 'the cue ball is always back');
        noOverlap(balls, VIEW_TOLERANCE); noOverlap(t.balls);
      }
    }
    assert.equal(h.table.phase, 'finished', `seed ${seed}: the rack ends`);
    assert.equal(h.summaries.length, 1);
    assert.ok(strokes >= 3, `several strokes (${strokes})`);
    assert.ok(h.table.rack.winner >= 0 && h.table.rack.reason);
  }
});

test('the house\'s best beats a beginner over several racks', async () => {
  let best = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const h = harness(seed * 7);
    h.table.join('ana', 'Ana'); h.table.configure('ana', { level: 'facil' }); h.table.cpu('ana', true); await h.table.ready('ana', true);
    for (let guard = 0; guard < 6000 && h.table.phase !== 'finished'; guard++) {
      const t = h.table;
      if (t.phase === 'choice' && t.seats[t.choice!.seat]!.playerId === 'ana') t.choose('ana', t.choice!.kind === 'toss' ? 'break' : 'spot');
      else if (t.phase === 'aim' && t.seats[t.rack.turn]!.playerId === 'ana') {
        const planner = new PoolPlanner(t.rack, t.rack.turn, t.balls, 'dificil', seeded(seed * 31 + guard), t.placing);
        while (!planner.step(1000));
        const plan = planner.plan();
        t.shoot('ana', { shot: t.shot, ...plan.stroke, ...(plan.cue ? { cue: plan.cue } : {}) });
      }
      h.advance(100);
    }
    if (h.summaries[0]?.players[0]?.result === 'win') best++;
  }
  assert.ok(best >= 4, `the expert won ${best} of 6`);
});

test('the 8 on the break: back on the lower mark and the chooser plays, or a new break', async () => {
  const h = harness();
  await started(h);
  // As the room leaves it after a clean break with the 8 down: the breaker chooses.
  h.table.balls = h.table.balls.filter(b => b.n !== 8); h.table.pocketed = [8];
  Object.assign(h.table, { phase: 'choice', choice: { seat: 0, kind: 'eight-break', foul: false } });
  assert.throws(() => h.table.choose('bia', 'spot'), /não é sua/);
  h.table.choose('ana', 'spot');
  assert.equal(h.table.phase, 'aim'); assert.equal(h.table.rack.turn, 0);
  const eight = h.table.balls.find(b => b.n === 8)!;
  assert.ok(Math.abs(eight.y) < 1e-9 && eight.x >= FOOT_SPOT.x - 1e-9, 'on the lower mark, or behind it along the long line');
  Object.assign(h.table, { phase: 'choice', choice: { seat: 1, kind: 'eight-break', foul: true } });
  h.table.choose('bia', 'rerack');
  assert.equal(h.table.breaker, 1, 'after a foul, the chooser breaks'); assert.equal(h.table.placing, true); assert.equal(h.table.balls.length, 16);
});

test('leaving mid-match is a withdrawal; a dropped shooter pauses the table and loses if they do not come back', async () => {
  const h = harness();
  await started(h);
  h.table.leave('bia');
  assert.equal(h.table.phase, 'finished'); assert.equal(h.table.rack.winner, 0); assert.match(h.table.rack.reason, /desistiu/);
  assert.equal(h.summaries[0]!.forfeit, true);

  const g = harness(4);
  await started(g);
  g.table.connection('ana', false);
  assert.equal(g.table.phase, 'paused');
  g.advance(2000); g.table.connection('ana', true);
  assert.equal(g.table.phase, 'aim', 'back: the turn goes on');
  g.table.connection('ana', false);
  g.advance(POOL.pauseMs + 500);
  assert.equal(g.table.phase, 'finished'); assert.equal(g.table.rack.winner, 1);
  assert.ok(g.notices.some(([id]) => id === 'ana'));
});

test('the turn runs out: it passes to the other player, no foul', async () => {
  const h = harness();
  await started(h);
  h.advance(POOL.aimMs + 100);
  assert.equal(h.table.rack.turn, 1); assert.equal(h.table.placing, false); assert.equal(h.table.rack.breaking, false);
  assert.deepEqual(h.table.lastFouls, []);
  assert.ok(h.notices.some(([id]) => id === 'ana'));
});

test('rematch: the same two players, the break goes to the other', async () => {
  const h = harness();
  await started(h);
  const first = h.table.breaker;
  h.table.leave('bia');
  h.advance(POOL.finishedMs + 100);
  h.table.join('bia', 'Bia');
  await h.table.ready('ana', true); await h.table.ready('bia', true);
  assert.equal(h.table.phase, 'aim', 'no toss for a rematch');
  assert.equal(h.table.breaker, first === 0 ? 1 : 0);
});

test('stakes, as at the truco table: Juca\'s level sets them, between two people the table does; the winner gets twice, giving up loses', async () => {
  const taken: Array<[string, number]> = [], paid: Array<[string, string, number]> = [];
  let refuse = '';
  const bank: PoolBank = { stake: async (id, _match, amount) => { if (id === refuse) throw new Error('Saldo insuficiente.'); taken.push([id, amount]); },
    settle: (match, id, payout) => { paid.push([match, id, payout]); } };
  // Alone at the table: Juca's level's stake, and on the yes he takes the empty seat.
  const h = harness(3, bank);
  h.table.join('ana', 'Ana');
  assert.equal(h.table.snapshot().stake, 150); assert.equal(h.table.snapshot().betweenPeople, false);
  h.table.configure('ana', { level: 'dificil' });
  assert.equal(h.table.snapshot().stake, 200);
  assert.deepEqual(h.table.snapshot().levelStakes, { facil: 100, medio: 150, dificil: 200 });
  await h.table.ready('ana', true);
  assert.equal(h.table.seats[1]!.cpu, 'dificil'); assert.notEqual(h.table.phase, 'lobby');
  assert.deepEqual(taken, [['ana', 200]]); assert.equal(h.table.seats[0]!.staked, 200);
  // Giving up loses the part (Juca's is the house's).
  h.table.leave('ana');
  assert.deepEqual(paid.map(p => [p[1], p[2]]), [['ana', 0]]);
  // Two people: from the minimum (400) up, only the host sets it, within the limits; any change asks the yes again.
  const g = harness(4, bank);
  taken.length = 0; paid.length = 0;
  g.table.join('ana', 'Ana'); g.table.join('bia', 'Bia');
  assert.equal(g.table.snapshot().stake, 400); assert.equal(g.table.snapshot().betweenPeople, true);
  assert.throws(() => g.table.configure('bia', { stake: 600 }), /Só quem abriu/);
  assert.throws(() => g.table.configure('ana', { stake: 300 }), /de 400 a 5000/);
  await g.table.ready('bia', true);
  g.table.configure('ana', { stake: 600 });
  assert.equal(g.table.seats[1]!.ready, false, 'a new stake asks for the yes again');
  // One wallet refuses: no match, the other part comes back.
  refuse = 'bia';
  await g.table.ready('ana', true); await g.table.ready('bia', true);
  assert.equal(g.table.phase, 'lobby'); assert.deepEqual(taken, [['ana', 600]]); assert.deepEqual(paid.map(p => [p[1], p[2]]), [['ana', 600], ['bia', 0]]);
  assert.match(g.table.message, /apostas voltaram/);
  refuse = ''; taken.length = 0; paid.length = 0;
  await g.table.ready('ana', true); await g.table.ready('bia', true);
  assert.notEqual(g.table.phase, 'lobby'); assert.deepEqual(taken.sort(), [['ana', 600], ['bia', 600]]);
  assert.equal(g.table.snapshot().stake, 600);
  // Bia gives up: Ana gets twice her part, once; Bia nothing.
  g.table.leave('bia');
  assert.deepEqual(paid.map(p => [p[1], p[2]]).sort(), [['ana', 1200], ['bia', 0]]);
  assert.equal(new Set(paid.map(p => p[0])).size, 1, 'one match');
  assert.equal(g.table.seats[0]!.prize, 600);
  assert.equal(g.summaries.at(-1)!.stake, 600);
});

test('the log\'s wording', async () => {
  assert.equal(listBalls([3]), 'a 3');
  assert.equal(listBalls([3, 11]), 'a 3 e a 11');
  assert.equal(listBalls([3, 8, 11]), 'a 3, a 8 (preta) e a 11');
});
