import { FOOSBALL, FOOSBALL_RODS, attackDir, kicksBack, manY, startKick, type FoosballBall, type FoosballLevel, type FoosballSim, type FoosballTeam } from '@bar/shared';

/**
 * How Zé do Totó plays each night: how late he sees the ball (ms), how far off he aims (m), how fast his hands are (share of
 * the rod's top speed), how sure he is to strike a ball he could, how long he takes to decide, how hard he hits, and how
 * often he angles a shot (pulling the figure sideways as it strikes).
 */
const NIGHTS: Record<FoosballLevel, { delay: number; noise: number; hands: number; strike: number; think: number; power: [number, number]; angle: number }> = {
  facil: { delay: 230, noise: .034, hands: .5, strike: .45, think: 260, power: [.35, .75], angle: .1 },
  medio: { delay: 130, noise: .018, hands: .75, strike: .8, think: 150, power: [.5, .9], angle: .35 },
  dificil: { delay: 70, noise: .007, hands: 1, strike: .95, think: 70, power: [.65, 1], angle: .6 },
};
const HALF_W = FOOSBALL.width / 2 - FOOSBALL.ballRadius;

/** Where a ball moving in a straight line crosses x, bouncing off the side walls; the ball's own y when it is not coming. */
export function crossingY(ball: FoosballBall, x: number): number {
  if (Math.abs(ball.vx) < .05 || (x - ball.x) * ball.vx <= 0) return ball.y;
  const t = Math.min(1.2, (x - ball.x) / ball.vx), span = HALF_W * 2;
  // Unfold the reflections: the path is a sawtooth between the walls.
  let y = (ball.y + ball.vy * t + HALF_W) % (span * 2);
  if (y < 0) y += span * 2;
  return y > span ? span * 2 - y - HALF_W : y - HALF_W;
}

/**
 * Where to send a ball struck from a rod: at the last rod, the side of the goal away from the goalie; before it, the gap
 * of the other team's next rod nearest to the ball (between two of its figures, or between a figure and the wall).
 */
export function laneFor(sim: FoosballSim, rodIndex: number): number {
  const def = FOOSBALL_RODS[rodIndex]!, dir = attackDir(def.team), ball = sim.ball;
  const ahead = FOOSBALL_RODS.filter(r => r.team !== def.team && (r.x - def.x) * dir > 0).sort((a, b) => (a.x - b.x) * dir);
  const next = ahead.find(r => r.kind !== 'goalie');
  if (!next) {
    const keeper = ahead[0]!, at = sim.rods[keeper.index]!.offset, half = FOOSBALL.goalWidth / 2 - FOOSBALL.ballRadius - .01;
    return Math.abs(half - at) > Math.abs(-half - at) ? half : -half;
  }
  const offset = sim.rods[next.index]!.offset, edges = [-HALF_W, ...Array.from({ length: next.men }, (_, k) => manY(next, k, offset)), HALF_W];
  let best = ball.y, distance = Infinity;
  for (let i = 0; i + 1 < edges.length; i++) {
    const gap = (edges[i]! + edges[i + 1]!) / 2;
    if (edges[i + 1]! - edges[i]! < FOOSBALL.ballRadius * 2 + FOOSBALL.man.halfWidth * 2 + .01) continue;
    if (Math.abs(gap - ball.y) < distance) { distance = Math.abs(gap - ball.y); best = gap; }
  }
  return best;
}

/** One of Zé's slots: what he saw lately (he reacts late, as a person does), and when he may strike again. */
export class FoosballCpu {
  private seen: Array<{ t: number; ball: FoosballBall }> = [];
  private nextStrike = 0;
  private aim = 0;
  constructor(readonly level: FoosballLevel, private readonly random: () => number = Math.random) {}

  /** Moves Zé's rods (`rods`: indexes of the ones he holds) and strikes when a figure has the ball. Called every tick. */
  play(sim: FoosballSim, rods: readonly number[], team: FoosballTeam, dt: number): void {
    const night = NIGHTS[this.level], now = sim.time;
    this.seen.push({ t: now, ball: { ...sim.ball } });
    while (this.seen.length > 2 && this.seen[1]!.t <= now - night.delay) this.seen.shift();
    const ball = this.seen[0]!.ball, dir = attackDir(team);
    // His aim wanders slowly, as an unsteady hand does.
    this.aim += (((this.random() * 2 - 1) * night.noise) - this.aim) * Math.min(1, dt * 3);
    for (const index of rods) {
      const def = FOOSBALL_RODS[index]!, rod = sim.rods[index]!;
      // A slow ball at this rod's feet (in front of it, or just behind, where the swing still reaches it) is his to play:
      // he lines the figure up beside it, so that the edge of the foot sends it into a lane. Otherwise he guards.
      const ahead = (ball.x - def.x) * dir, speed = Math.hypot(ball.vx, ball.vy), mine = !sim.frozen && ahead > -.05 && ahead < .08 && speed < 3;
      let wanted = crossingY(ball, def.x) + this.aim, edge = 0;
      // A ball coming fast is hit first time; one he controls (nearly still) he may aim.
      if (mine && speed < .6 && this.random() < night.angle * dt * 30 + (this.edge.has(index) ? 1 : 0)) {
        if (!this.edge.has(index)) {
          const lane = laneFor(sim, index), run = Math.max(.1, Math.abs((FOOSBALL_RODS.find(r => r.team !== team && (r.x - def.x) * dir > 0)?.x ?? def.x + dir * .3) - def.x));
          this.edge.set(index, { edge: Math.max(-.02, Math.min(.02, Math.atan2(lane - ball.y, run) / .5 * .02)), since: now });
        }
        // Lining it up takes too long (the figure cannot get there): he hits it square.
        const aim = this.edge.get(index)!;
        edge = now - aim.since < 700 ? aim.edge : 0;
        wanted = ball.y - edge + this.aim * .3;
      } else if (!mine) this.edge.delete(index);
      // The figure nearest to where the ball will be goes there, at his hands' speed.
      let best = rod.target, miss = Infinity;
      for (let k = 0; k < def.men; k++) {
        const offset = Math.max(-def.travel, Math.min(def.travel, wanted - manY(def, k, 0)));
        const off = Math.abs(manY(def, k, offset) - wanted) + Math.abs(offset - rod.offset) * .05;
        if (off < miss) { miss = off; best = offset; }
      }
      const step = FOOSBALL.rodSpeed * night.hands * dt;
      rod.target = rod.target + Math.max(-step, Math.min(step, best - rod.target));
      rod.lift = false;
      // A slow ball stuck behind one of his figures goes back to his rods behind (a back pass).
      if (!mine && !sim.frozen && !rod.kick && now >= this.nextStrike && speed < .4 && kicksBack(def, rod, sim.ball)) {
        this.nextStrike = now + night.think * (.8 + this.random() * .8);
        startKick(rod, .7, now, true);
        continue;
      }
      if (!mine || rod.kick || now < this.nextStrike) continue;
      // Strikes once a figure is where he wanted it (the edge he chose, or square behind a ball coming at him).
      const gap = Math.min(...Array.from({ length: def.men }, (_, k) => Math.abs(manY(def, k, rod.offset) - (ball.y - edge))));
      if (gap > (edge ? .006 : .02)) continue;
      this.nextStrike = now + night.think * (.6 + this.random() * .8);
      if (this.random() > night.strike) continue;
      const [low, high] = night.power, back = def.kind === 'goalie' || def.kind === 'defense';
      startKick(rod, back ? high : low + (high - low) * this.random(), now);
      this.edge.delete(index);
    }
  }
  /** The edge of the foot he chose for the ball at each of his rods (m, signed), and since when he lines it up. */
  private edge = new Map<number, { edge: number; since: number }>();
}
