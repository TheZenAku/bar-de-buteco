import { CAFE_TABLES, INTERACTABLES, LEFTOVER_MS, SERVED_PROPS, SERVE_ITEM_MS, SERVE_LEAD_MS, consumeMs, type ItemId } from '@bar/shared';
import type { MapSchema } from '@colyseus/schema';
import { ServedItem } from '../state.js';

/** A place on a table top; the prop's front (+Z, its label) faces the customer. */
export interface Spot { x: number; y: number; z: number; rotation: number }
/** Where an order goes, and what has to be cleared from the table when it arrives. */
export interface TablePlan { table: number; spots: Spot[]; clear: string[] }
interface Footprint { x: number; z: number; radius: number }
/** `consumed`: the part (0–1) of it the customer has already had. */
interface Placed { state: ServedItem; ownerId: string; seatId: string; consumed: number }
/** Whether a customer still sits where they ordered from. */
export type Seated = (playerId: string, seatId: string) => boolean;
/** Gives a customer the effects of `portion` (0–1) of something they are having at the table. */
export type Consume = (playerId: string, item: string, portion: number) => void;

// The customer tables' top is a 0.83 m square (INST_A_mesa-vermelha) with the number holder in its centre.
const TABLE_HALF = .39, HOLDER_RADIUS = .1, GAP = .012, STEP = .02;
// The picnic tables' top (P_Mesa_Madeira, the backyard's 24-31) is 1.8 x 0.8 m between its benches. A customer on a
// bench has their half of it, as far as PICNIC_REACH to either side of where they sit.
const PICNIC_HALF = { along: .38, across: .88 }, PICNIC_REACH = .3;
// Never more than this on all tables together: the oldest go first.
const MAX_ITEMS = 96;
// Effects are taken in steps of at least this part of an item (and the rest when it is finished).
const SIP = .05;

/**
 * Spots for `items` ordered from a seat: on the customer's quarter of the table top (`anywhere` also allows the
 * neighbours' side), clear of the number holder, of each other and of `taken`. The biggest goes first, each as
 * close to the customer's edge and as centred in front of them as it fits. Undefined if they do not all fit.
 */
export function layoutSpots(seat: { x: number; z: number; table?: number; rotation?: number; bench?: boolean }, items: readonly ItemId[], taken: readonly Footprint[], anywhere = false, random = Math.random): Spot[] | undefined {
  const table = CAFE_TABLES.find(t => t.number === seat.table);
  if (!table) return;
  // Table axes: along (from the centre towards the customer) and across. On a bench they are square to the table (the
  // customer faces it) and `side` is how far along the bench the customer sits.
  const length = Math.hypot(seat.x - table.x, seat.z - table.z) || 1, bench = !!seat.bench && seat.rotation !== undefined;
  const ax = bench ? -Math.sin(seat.rotation!) : (seat.x - table.x) / length, az = bench ? -Math.cos(seat.rotation!) : (seat.z - table.z) / length;
  const side = bench ? (seat.x - table.x) * az - (seat.z - table.z) * ax : 0, half = bench ? PICNIC_HALF : { along: TABLE_HALF, across: TABLE_HALF };
  const placed = [...taken], spots: Spot[] = [];
  const queue = items.map((item, index) => ({ index, radius: SERVED_PROPS[item]?.radius ?? .05 })).sort((a, b) => b.radius - a.radius);
  for (const { index, radius } of queue) {
    const edge = half.along - radius, reach = half.across - radius;
    let best: { x: number; z: number; score: number } | undefined;
    for (let along = edge; along >= -edge; along -= STEP) for (let across = -reach; across <= reach + 1e-9; across += STEP) {
      const own = bench ? along >= 0 && Math.abs(across - side) <= PICNIC_REACH : along >= Math.abs(across);
      if ((!anywhere && !own) || Math.hypot(along, across) < HOLDER_RADIUS + radius) continue;
      const x = table.x + ax * along + az * across, z = table.z + az * along - ax * across;
      if (placed.some(p => Math.hypot(p.x - x, p.z - z) < p.radius + radius + GAP)) continue;
      // A little jitter, so that no two tables look stamped.
      const score = edge - along + Math.abs(across - side) * .6 + random() * .015;
      if (!best || score < best.score) best = { x, z, score };
    }
    if (!best) return;
    placed.push({ x: best.x, z: best.z, radius });
    spots[index] = { x: best.x, y: table.top, z: best.z, rotation: Math.atan2(seat.x - best.x, seat.z - best.z) + (random() - .5) * .5 };
  }
  return spots;
}

/**
 * What was served on the tables, synced to every browser through the room state. A customer has each item over
 * consumeMs while seated (its effects come in as it goes); finished, or left behind when they get up, it waits on the
 * table (`doneAt`) until someone collects it: the bar's helper (clearTable) or, with nobody working, Tonico (takeOne).
 * Uncollected, it goes on its own LEFTOVER_MS later.
 */
export class ServedItems {
  private readonly items = new Map<string, Placed>();
  constructor(private readonly state: MapSchema<ServedItem>) {}

  get size(): number { return this.items.size; }

  /**
   * Where an order's items will stand. On a full table, what is finished goes first (oldest first), then the
   * customer's own earlier items; never what a neighbour is still having.
   */
  plan(order: { playerId: string; seatId: string; items: readonly ItemId[] }, seated: Seated): TablePlan | undefined {
    const seat = INTERACTABLES.find(i => i.id === order.seatId && i.type === 'seat');
    if (seat?.table === undefined) return;
    const onTable = [...this.items.values()].filter(p => p.state.table === seat.table).sort((a, b) => a.state.placedAt - b.state.placedAt);
    const finished = (p: Placed) => !!p.state.doneAt || !seated(p.ownerId, p.seatId);
    const removable = [...onTable.filter(finished), ...onTable.filter(p => p.ownerId === order.playerId && !finished(p))];
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

  /** An order starts being put down: its items touch the table one after the other. */
  place(order: { id: string; playerId: string; seatId: string; items: readonly ItemId[] }, plan: TablePlan, now: number): void {
    for (const id of plan.clear) this.remove(id);
    order.items.forEach((item, slot) => {
      const spot = plan.spots[slot]!, id = `${order.id}:${slot}`;
      const state = new ServedItem().assign({ id, item, table: plan.table, ...spot, placedAt: now + SERVE_LEAD_MS + (slot + 1) * SERVE_ITEM_MS, orderId: order.id, slot, seat: order.seatId });
      this.items.set(id, { state, ownerId: order.playerId, seatId: order.seatId, consumed: 0 });
      this.state.set(id, state);
    });
    for (const oldest of [...this.items.values()].sort((a, b) => a.state.placedAt - b.state.placedAt).slice(0, Math.max(0, this.items.size - MAX_ITEMS))) this.remove(oldest.state.id);
  }

  /** An order refunded while being put down leaves nothing behind. */
  removeOrder(orderId: string): void {
    for (const placed of [...this.items.values()]) if (placed.state.orderId === orderId) this.remove(placed.state.id);
  }

  /** Tables with finished items waiting, the longest waiting first. */
  dirtyTables(): number[] {
    const since = new Map<number, number>();
    for (const { state } of this.items.values()) if (state.doneAt) since.set(state.table, Math.min(since.get(state.table) ?? Infinity, state.doneAt));
    return [...since].sort((a, b) => a[1] - b[1]).map(([table]) => table);
  }
  isDirty(table: number): boolean { return [...this.items.values()].some(p => p.state.table === table && !!p.state.doneAt); }

  /** The helper cleared a table: everything finished goes; what someone is still having stays. */
  clearTable(table: number): number {
    const finished = [...this.items.values()].filter(p => p.state.table === table && p.state.doneAt);
    for (const placed of finished) this.remove(placed.state.id);
    return finished.length;
  }
  /** Tonico takes one finished item off a table (the oldest first): what it was, for his tray. */
  takeOne(table: number): string | undefined {
    const next = [...this.items.values()].filter(p => p.state.table === table && p.state.doneAt).sort((a, b) => a.state.doneAt - b.state.doneAt)[0];
    if (!next) return;
    this.remove(next.state.id);
    return next.state.item;
  }

  /**
   * Seated customers have what is in front of them (`consume` gives them its effects as they go); whatever is
   * finished, or left behind by someone who got up, waits to be collected and goes on its own LEFTOVER_MS later.
   */
  update(now: number, seated: Seated, consume?: Consume): void {
    for (const placed of [...this.items.values()]) {
      const { state } = placed;
      if (state.doneAt) { if (now - state.doneAt >= LEFTOVER_MS) this.remove(state.id); continue; }
      // Still on its way to the table.
      if (now < state.placedAt) continue;
      if (!seated(placed.ownerId, placed.seatId)) { state.doneAt = now; continue; }
      const progress = Math.min(1, (now - state.placedAt) / consumeMs(state.item)), portion = progress - placed.consumed;
      if (portion >= SIP || progress >= 1) { placed.consumed = progress; consume?.(placed.ownerId, state.item, portion); }
      if (progress >= 1) state.doneAt = now;
    }
  }

  private remove(id: string): void {
    if (this.items.delete(id)) this.state.delete(id);
  }
}
