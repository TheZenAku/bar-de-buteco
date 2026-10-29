import { MAP_SURFACES, floorHeight, isWalkable, movePlayer, type Position } from '@bar/shared';

type Point = Required<Position>;
// Step between search nodes and the sub-steps that check each edge (stair treads rise less than a normal step per sub-step).
const CELL = 0.35;
const SUBSTEP = 0.1;
// Nodes closer than this count as the same place.
const KEY = CELL / 2;
// A blocked step is tried again this far to either side: an opening narrower than the step (the doorway from the upper
// hall to the terrace leaves the body 15 cm of play) is only found by a step that happens to line up with it.
const NUDGES = [.05, -.05, .1, -.1, .15, -.15];
const DIRECTIONS = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]] as const;
// Floors further apart than this are only joined by the stairs.
const FLOOR_GAP = .9;

const distance3 = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
/**
 * The map's staircases, from its ramp surfaces: flights chained where one ends and the next begins (the landing). The
 * search heads for them when the goal is on another floor, instead of searching the whole floor first.
 */
const STAIRS = (() => {
  const edge = (points: number[][], high: boolean): Point => {
    const sorted = [...points].sort((a, b) => high ? b[1]! - a[1]! : a[1]! - b[1]!).slice(0, 2);
    return { x: (sorted[0]![0]! + sorted[1]![0]!) / 2, y: (sorted[0]![1]! + sorted[1]![1]!) / 2, z: (sorted[0]![2]! + sorted[1]![2]!) / 2 };
  };
  const flights = MAP_SURFACES.filter(s => s.points.length >= 3 && Math.max(...s.points.map(p => p[1]!)) - Math.min(...s.points.map(p => p[1]!)) > .4)
    .map(s => ({ bottom: edge(s.points, false), top: edge(s.points, true) })).sort((a, b) => a.bottom.y - b.bottom.y);
  const stairs: Array<{ bottom: Point; top: Point; length: number }> = [];
  const used = new Set<typeof flights[number]>();
  for (const first of flights) {
    if (used.has(first)) continue;
    used.add(first);
    let top = first.top, length = distance3(first.bottom, first.top);
    for (let next = flights.find(f => !used.has(f) && Math.abs(f.bottom.y - top.y) < .15 && Math.hypot(f.bottom.x - top.x, f.bottom.z - top.z) < 3); next;
      next = flights.find(f => !used.has(f) && Math.abs(f.bottom.y - top.y) < .15 && Math.hypot(f.bottom.x - top.x, f.bottom.z - top.z) < 3)) {
      used.add(next); length += distance3(top, next.bottom) + distance3(next.bottom, next.top); top = next.top;
    }
    stairs.push({ bottom: first.bottom, top, length });
  }
  return stairs;
})();
/** Estimated cost from `p` to `goal`: straight on the same floor, by way of the nearest staircase to another one. */
function estimate(p: Point, goal: Point): number {
  const direct = Math.hypot(goal.x - p.x, (goal.y - p.y) * 3, goal.z - p.z);
  if (Math.abs(goal.y - p.y) < FLOOR_GAP) return direct;
  let best = Infinity;
  for (const stairs of STAIRS) {
    const [enter, exit] = goal.y > p.y ? [stairs.bottom, stairs.top] : [stairs.top, stairs.bottom];
    // Already on the stairs: on to their end.
    const climbing = p.y > stairs.bottom.y + .3 && p.y < stairs.top.y - .3;
    best = Math.min(best, (climbing ? distance3(p, exit) : distance3(p, enter) + stairs.length) + distance3(exit, goal));
  }
  return Number.isFinite(best) ? best : direct;
}

/** Walks from a point towards another as a body would (floor, walls, doors, stairs); undefined if blocked. */
export function walkSegment(from: Point, to: { x: number; z: number }): Point | undefined {
  const length = Math.hypot(to.x - from.x, to.z - from.z), steps = Math.max(1, Math.ceil(length / SUBSTEP));
  let y = from.y;
  for (let i = 1; i <= steps; i++) {
    const x = from.x + (to.x - from.x) * i / steps, z = from.z + (to.z - from.z) * i / steps, next = floorHeight(x, z, y);
    if (next === undefined || !isWalkable(x, z, next)) return;
    y = next;
  }
  return { x: to.x, y, z: to.z };
}

class Heap<T> {
  private items: Array<{ value: T; priority: number }> = [];
  get size(): number { return this.items.length; }
  push(value: T, priority: number): void {
    const items = this.items; items.push({ value, priority });
    for (let i = items.length - 1; i > 0;) { const parent = (i - 1) >> 1; if (items[parent]!.priority <= items[i]!.priority) break; [items[parent], items[i]] = [items[i]!, items[parent]!]; i = parent; }
  }
  pop(): T | undefined {
    const items = this.items, top = items[0]; const last = items.pop();
    if (!top || !last) return top?.value;
    if (items.length) {
      items[0] = last;
      for (let i = 0; ;) {
        const l = i * 2 + 1, r = l + 1; let m = i;
        if (l < items.length && items[l]!.priority < items[m]!.priority) m = l;
        if (r < items.length && items[r]!.priority < items[m]!.priority) m = r;
        if (m === i) break; [items[m], items[i]] = [items[i]!, items[m]!]; i = m;
      }
    }
    return top.value;
  }
}

/**
 * A* with fixed steps from the start, using the shared movement rules: no navmesh to bake or keep in sync with the
 * map, so a bigger map or a moved door needs nothing. A blocked step is retried slightly to either side (NUDGES), so
 * narrow openings are found wherever the search starts. The search is bounded; callers fall back (refund, serve from
 * where the NPC stands) when no path is found within the budget.
 */
export function findPath(start: Point, arrived: (p: Point) => boolean, goal: Point, budget = 25_000): Point[] | undefined {
  return new PathSearch(start, arrived, goal, budget).run(Infinity) ?? undefined;
}

interface SearchNode { point: Point; cost: number; parent?: SearchNode }
/**
 * findPath run a slice at a time, so that a long search (another floor, the terrace) never holds the room's tick:
 * `run(n)` expands up to n more nodes and returns the path, null when there is none, or undefined while searching.
 */
export class PathSearch {
  private readonly open = new Heap<SearchNode>();
  private readonly best = new Map<string, number>();
  private expanded = 0;
  private result?: Point[] | null;
  constructor(private readonly start: Point, private readonly arrived: (p: Point) => boolean, private readonly goal: Point, private readonly budget = 25_000) {
    this.open.push({ point: start, cost: 0 }, 0); this.best.set(this.key(start), 0);
  }
  private key(p: Point): string { return `${Math.round((p.x - this.start.x) / KEY)}:${Math.round((p.z - this.start.z) / KEY)}:${Math.round(p.y * 5)}`; }

  run(expansions: number): Point[] | null | undefined {
    if (this.result !== undefined) return this.result;
    const { open, best } = this;
    for (let slice = 0; slice < expansions; slice++) {
      const node = open.pop();
      if (!node || this.expanded++ >= this.budget) return this.result = null;
      if (this.arrived(node.point)) {
        const path: Point[] = [];
        for (let n: SearchNode | undefined = node; n; n = n.parent) path.unshift(n.point);
        return this.result = smooth(path);
      }
      if ((best.get(this.key(node.point)) ?? Infinity) < node.cost) continue;
      for (const [dx, dz] of DIRECTIONS) {
        const x = node.point.x + dx * CELL, z = node.point.z + dz * CELL;
        let point = walkSegment(node.point, { x, z });
        if (!point) {
          const length = Math.hypot(dx, dz), across = { x: -dz / length, z: dx / length };
          for (const nudge of NUDGES) if ((point = walkSegment(node.point, { x: x + across.x * nudge, z: z + across.z * nudge }))) break;
        }
        if (!point) continue;
        const cost = node.cost + Math.hypot(point.x - node.point.x, point.z - node.point.z) + Math.abs(point.y - node.point.y), k = this.key(point);
        if (cost >= (best.get(k) ?? Infinity)) continue;
        best.set(k, cost); open.push({ point, cost, parent: node }, cost + estimate(point, this.goal));
      }
    }
  }
}

/** Drops intermediate points that a straight walk can skip. */
function smooth(path: Point[]): Point[] {
  const result: Point[] = [path[0]!];
  for (let i = 0; i < path.length - 1;) {
    let j = path.length - 1;
    while (j > i + 1 && (Math.abs(path[j]!.y - path[i]!.y) > .05 || !walkSegment(path[i]!, path[j]!))) j--;
    result.push(path[j]!); i = j;
  }
  return result;
}

/** Moves a body along a path at a fraction of walking speed; returns true at the end of the path. */
export class PathFollower {
  private index = 1;
  private stuck = 0;
  constructor(readonly path: Point[], private pace = 0.32) {}
  get done(): boolean { return this.index >= this.path.length; }
  step(body: { x: number; y: number; z: number; rotation: number }): boolean {
    const target = this.path[this.index];
    if (!target) return true;
    const dx = target.x - body.x, dz = target.z - body.z, d = Math.hypot(dx, dz);
    // Settle on the validated point itself, so the end of the path is exactly where the search arrived.
    if (d < 0.08) { body.x = target.x; body.y = target.y; body.z = target.z; this.index++; this.stuck = 0; return this.done; }
    const pace = Math.min(this.pace, d / 0.175);
    const next = movePlayer(body, { dx: dx / d * pace, dz: dz / d * pace, running: false });
    // Somebody standing in the way: after a moment, step over to the next validated point.
    this.stuck = Math.hypot(next.x - body.x, next.z - body.z) < 0.005 ? this.stuck + 1 : 0;
    if (this.stuck > 30) { Object.assign(body, { x: target.x, y: target.y, z: target.z }); this.index++; this.stuck = 0; return this.done; }
    body.x = next.x; body.y = next.y; body.z = next.z; body.rotation = Math.atan2(dx, dz);
    return false;
  }
}
