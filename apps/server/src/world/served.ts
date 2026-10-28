import { CAFE_TABLES, INTERACTABLES, LEFTOVER_MS, SERVED_PROPS, SERVE_ITEM_MS, SERVE_LEAD_MS, type ItemId } from '@bar/shared';
import type { MapSchema } from '@colyseus/schema';
import { ServedItem } from '../state.js';

/** A place on a table top; the prop's front (+Z, its label) faces the customer. */
export interface Spot { x: number; y: number; z: number; rotation: number }
/** Where an order goes, and what has to be cleared from the table when it arrives. */
export interface TablePlan { table: number; spots: Spot[]; clear: string[] }
interface Footprint { x: number; z: number; radius: number }
interface Placed { state: ServedItem; ownerId: string; seatId: string; leftAt?: number }
/** Whether a customer still sits where they ordered from. */
export type Seated = (playerId: string, seatId: string) => boolean;

// The customer tables' top is a 0.83 m square (INST_A_mesa-vermelha) with the number holder in its centre.
const TABLE_HALF = .39, HOLDER_RADIUS = .1, GAP = .012, STEP = .02;
// Never more than this on all tables together: the oldest go first.
const MAX_ITEMS = 96;

/**
 * Spots for `items` ordered from a seat: on the customer's quarter of the table top (`anywhere` also allows the
 * neighbours' side), clear of the number holder, of each other and of `taken`. The biggest goes first, each as
 * close to the customer's edge and as centred in front of them as it fits. Undefined if they do not all fit.
 */
export function layoutSpots(seat: { x: number; z: number; table?: number }, items: readonly ItemId[], taken: readonly Footprint[], anywhere = false, random = Math.random): Spot[] | undefined {
  const table = CAFE_TABLES.find(t => t.number === seat.table);
  if (!table) return;
  // Table axes: along (from the centre towards the customer) and across.
  const length = Math.hypot(seat.x - table.x, seat.z - table.z) || 1, ax = (seat.x - table.x) / length, az = (seat.z - table.z) / length;
  const placed = [...taken], spots: Spot[] = [];
  const queue = items.map((item, index) => ({ index, radius: SERVED_PROPS[item]?.radius ?? .05 })).sort((a, b) => b.radius - a.radius);
  for (const { index, radius } of queue) {
    const edge = TABLE_HALF - radius;
    let best: { x: number; z: number; score: number } | undefined;
    for (let along = edge; along >= -edge; along -= STEP) for (let across = -edge; across <= edge + 1e-9; across += STEP) {
      if ((!anywhere && along < Math.abs(across)) || Math.hypot(along, across) < HOLDER_RADIUS + radius) continue;
      const x = table.x + ax * along + az * across, z = table.z + az * along - ax * across;
      if (placed.some(p => Math.hypot(p.x - x, p.z - z) < p.radius + radius + GAP)) continue;
      // A little jitter, so that no two tables look stamped.
      const score = edge - along + Math.abs(across) * .6 + random() * .015;
      if (!best || score < best.score) best = { x, z, score };
    }
    if (!best) return;
    placed.push({ x: best.x, z: best.z, radius });
    spots[index] = { x: best.x, y: table.top, z: best.z, rotation: Math.atan2(seat.x - best.x, seat.z - best.z) + (random() - .5) * .5 };
  }
  return spots;
}

/**
 * What Tonico left on the tables, synced to every browser through the room state. Items stay while their
 * customer sits there and for LEFTOVER_MS after they get up, unless the helper clears the table first.
 */
export class ServedItems {
  private readonly items = new Map<string, Placed>();
  constructor(private readonly state: MapSchema<ServedItem>) {}

  get size(): number { return this.items.size; }

  /**
   * Where an order's items will stand. On a full table, what customers who left behind goes first (oldest
   * first), then the customer's own earlier items; never what someone still seated is having.
   */
  plan(order: { playerId: string; seatId: string; items: readonly ItemId[] }, seated: Seated): TablePlan | undefined {
    const seat = INTERACTABLES.find(i => i.id === order.seatId && i.type === 'seat');
    if (seat?.table === undefined) return;
    const onTable = [...this.items.values()].filter(p => p.state.table === seat.table).sort((a, b) => a.state.placedAt - b.state.placedAt);
    const removable = [...onTable.filter(p => !seated(p.ownerId, p.seatId)), ...onTable.filter(p => p.ownerId === order.playerId && seated(p.ownerId, p.seatId))];
    for (let count = 0; count <= removable.length; count++) {
      const clear = new Set(removable.slice(0, count).map(p => p.state.id));
      const taken = onTable.filter(p => !clear.has(p.state.id)).map(p => ({ x: p.state.x, z: p.state.z, radius: SERVED_PROPS[p.state.item as ItemId]?.radius ?? .05 }));
      for (const anywhere of [false, true]) {
        const spots = layoutSpots(seat, order.items, taken, anywhere);
        if (spots) return { table: seat.table, spots, clear: [...clear] };
      }
    }
    // The neighbours' plates fill the table: in front of the customer all the same.
    const spots = layoutSpots(seat, order.items, [], true);
    return spots && { table: seat.table, spots, clear: removable.map(p => p.state.id) };
  }

  /** Tonico starts putting an order down: its items touch the table one after the other. */
  place(order: { id: string; playerId: string; seatId: string; items: readonly ItemId[] }, plan: TablePlan, now: number): void {
    for (const id of plan.clear) this.remove(id);
    order.items.forEach((item, slot) => {
      const spot = plan.spots[slot]!, id = `${order.id}:${slot}`;
      const state = new ServedItem().assign({ id, item, table: plan.table, ...spot, placedAt: now + SERVE_LEAD_MS + (slot + 1) * SERVE_ITEM_MS, orderId: order.id, slot });
      this.items.set(id, { state, ownerId: order.playerId, seatId: order.seatId });
      this.state.set(id, state);
    });
    for (const oldest of [...this.items.values()].sort((a, b) => a.state.placedAt - b.state.placedAt).slice(0, Math.max(0, this.items.size - MAX_ITEMS))) this.remove(oldest.state.id);
  }

  /** An order refunded while being put down leaves nothing behind. */
  removeOrder(orderId: string): void {
    for (const placed of [...this.items.values()]) if (placed.state.orderId === orderId) this.remove(placed.state.id);
  }

  /** The helper wiped a table: what customers left behind goes, the plates of whoever still sits there stay. */
  clearTable(table: number, seated: Seated): number {
    const leftovers = [...this.items.values()].filter(p => p.state.table === table && !seated(p.ownerId, p.seatId));
    for (const placed of leftovers) this.remove(placed.state.id);
    return leftovers.length;
  }

  /** Leftovers disappear LEFTOVER_MS after their customer got up (sitting back down keeps them). */
  update(now: number, seated: Seated): void {
    for (const placed of [...this.items.values()]) {
      if (seated(placed.ownerId, placed.seatId)) { placed.leftAt = undefined; continue; }
      placed.leftAt ??= now;
      if (now - placed.leftAt >= LEFTOVER_MS) this.remove(placed.state.id);
    }
  }

  private remove(id: string): void {
    if (this.items.delete(id)) this.state.delete(id);
  }
}
