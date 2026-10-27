import { floorHeight, isWalkable, movePlayer, type Position } from '@bar/shared';

type Point = Required<Position>;
// Lattice spacing and the sub-steps that check each edge (stair treads rise less than a normal step per sub-step).
const CELL = 0.35;
const SUBSTEP = 0.1;
const DIRECTIONS = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]] as const;

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
 * A* over a lattice anchored at the start, using the shared movement rules: no navmesh to bake or keep in
 * sync with the map, so a bigger map or a moved door needs nothing. The search is bounded; callers fall back
 * (refund, serve from where the NPC stands) when no path is found within the budget.
 */
export function findPath(start: Point, arrived: (p: Point) => boolean, goal: Point, budget = 25_000): Point[] | undefined {
  const key = (ix: number, iz: number, y: number) => `${ix}:${iz}:${Math.round(y * 5)}`;
  interface Node { ix: number; iz: number; point: Point; cost: number; parent?: Node }
  const open = new Heap<Node>(), best = new Map<string, number>();
  const root: Node = { ix: 0, iz: 0, point: start, cost: 0 };
  open.push(root, 0); best.set(key(0, 0, start.y), 0);
  const h = (p: Point) => Math.hypot(goal.x - p.x, (goal.y - p.y) * 3, goal.z - p.z);
  // Each lattice edge is walked once per search; diagonals reuse their two orthogonal edges.
  const edges = new Map<string, Point | null>();
  const edge = (node: Node, dx: number, dz: number) => {
    const k = `${key(node.ix, node.iz, node.point.y)}>${dx},${dz}`;
    let result = edges.get(k);
    if (result === undefined) { result = walkSegment(node.point, { x: start.x + (node.ix + dx) * CELL, z: start.z + (node.iz + dz) * CELL }) ?? null; edges.set(k, result); }
    return result ?? undefined;
  };
  for (let expanded = 0; open.size && expanded < budget; expanded++) {
    const node = open.pop()!;
    if (arrived(node.point)) {
      const path: Point[] = [];
      for (let n: Node | undefined = node; n; n = n.parent) path.unshift(n.point);
      return smooth(path);
    }
    if ((best.get(key(node.ix, node.iz, node.point.y)) ?? Infinity) < node.cost) continue;
    for (const [dx, dz] of DIRECTIONS) {
      const ix = node.ix + dx, iz = node.iz + dz;
      // Diagonals never cut a wall corner.
      if (dx && dz && (!edge(node, dx, 0) || !edge(node, 0, dz))) continue;
      const point = edge(node, dx, dz);
      if (!point) continue;
      const cost = node.cost + Math.hypot(dx, dz) * CELL + Math.abs(point.y - node.point.y), k = key(ix, iz, point.y);
      if (cost >= (best.get(k) ?? Infinity)) continue;
      best.set(k, cost); open.push({ ix, iz, point, cost, parent: node }, cost + h(point));
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
