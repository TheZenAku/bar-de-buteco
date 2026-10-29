import { CLEAR_ITEM_MS, MAP_COLLIDERS, ORDER_PREPARATION_MS, PICKUP_POINT, handOverMs, tableByNumber, type ItemId, type Position } from '@bar/shared';
import type { Npc } from '../state.js';
import { PathFollower, PathSearch } from './navigation.js';
import type { TablePlan } from './served.js';

type Point = Required<Position>;
export interface TableOrder { id: string; playerId: string; seatId: string; items: ItemId[]; total: number; placedAt: number; owner: { sessionId: string; userId: string } }
type Phase = 'pickup' | 'preparing' | 'delivering' | 'handing' | 'bussing' | 'clearing' | 'dropping' | 'unloading';
/** An order to serve, or a table to clear (`table`; `tray`: what he took off it so far). */
interface Job { order?: TableOrder; table?: number; phase: Phase; route?: Route; follower?: PathFollower; until?: number; plan?: TablePlan; tray: string[] }
// Where Tonico goes back to after a delivery, before his usual round (apps/server/src/world/npcs.ts).
const REST_POINT: Point = { x: 15.3, y: .3, z: -6 };
export const TABLE_QUEUE_MAX = 8;
// Search nodes expanded per tick: a route to the terrace is found in about a second without holding the room's tick.
const SEARCH_SLICE = 400;
// What fits on the tray in one trip when clearing tables; the rest waits for the next one.
const TRAY_MAX = 6;
// A table Tonico could not reach is left alone for this long.
const UNREACHABLE_MS = 60_000;
const UNLOAD_MS = 1000;
/** What leaves the server: the order without the session it was charged to. */
export const publicOrder = ({ owner: _owner, ...order }: TableOrder) => order;

export interface WaiterEvents {
  /** The order left the counter on Tonico's tray: it can no longer be cancelled. */
  picked?: TableOrder;
  /** Tonico starts putting the order on the table, at the planned spots: the room shows the items there. */
  placing?: { order: TableOrder; plan: TablePlan };
  /** The order reached the table. */
  delivered?: TableOrder;
  /** The order could not be delivered (the customer left the seat, no path): the room refunds it. */
  dropped?: { order: TableOrder; reason: string };
}
/** What is on the tables (apps/server/src/world/served.ts). */
export interface TableTop {
  /** Where an order will stand on the table top; without it Tonico hands it over. */
  plan(order: TableOrder): TablePlan | undefined;
  /** Tables with finished items waiting, the longest waiting first. */
  dirtyTables?(): number[];
  /** Takes one finished item off a table, for the tray. */
  takeOne?(table: number): string | undefined;
}

/** Candidate routes tried one after the other, each searched a slice per tick (PathSearch). */
class Route {
  private search?: PathSearch;
  private index = 0;
  constructor(private readonly candidates: Array<() => PathSearch | undefined>) {}
  /** The path, null when no candidate has one, undefined while still searching. */
  step(): Point[] | null | undefined {
    for (let budget = SEARCH_SLICE; ;) {
      this.search ??= this.candidates[this.index]?.();
      if (!this.search) { if (this.index >= this.candidates.length) return null; this.index++; continue; }
      const result = this.search.run(budget);
      if (result) return result;
      if (result === undefined) return;
      this.search = undefined; this.index++; budget = SEARCH_SLICE / 4;
    }
  }
}
/** How much further out than at a café table he stands to reach a table's top: a picnic table's benches keep him back. */
const clearance = (table: number | undefined): number => {
  const t = table === undefined ? undefined : tableByNumber(table), c = t && MAP_COLLIDERS.find(c => c.id === t.collider);
  return c ? Math.max(0, Math.min(c.hx, c.hz) - .45) : 0;
};
const to = (from: Point, goal: Point, within: number, keepAway?: { point: Point; distance: number }) => () => new PathSearch(from,
  p => Math.hypot(p.x - goal.x, p.z - goal.z) < within && Math.abs(p.y - goal.y) < .3 && (!keepAway || Math.hypot(p.x - keepAway.point.x, p.z - keepAway.point.z) > keepAway.distance), goal);

/**
 * Tonico runs table orders one at a time: from wherever he is to the counter, waits for Magrão to prepare them,
 * carries them on his tray to the table along a path found on the shared floor and colliders, puts them down where
 * `tables` planned and walks back. Between orders, while nobody works the bar (`bussing`), he collects what customers
 * finished from the tables and takes it to the counter. While serving or clearing, the wandering NPC director leaves him
 * alone (behavior 'serving'). Routes are searched a slice per tick (Route).
 */
export class WaiterService {
  private queue: TableOrder[] = [];
  private job?: Job;
  private returning?: { route?: Route; follower?: PathFollower };
  private readonly unreachable = new Map<number, number>();

  constructor(private readonly tables?: TableTop) {}

  has(playerId: string): boolean { return this.job?.order?.playerId === playerId || this.queue.some(o => o.playerId === playerId); }
  get pending(): number { return this.queue.length + (this.job?.order ? 1 : 0); }
  /** Whether a customer's order is still at the counter (queued, or being picked up or prepared). */
  cancellable(playerId: string): boolean {
    return this.queue.some(o => o.playerId === playerId) || (this.job?.order?.playerId === playerId && ['pickup', 'preparing'].includes(this.job.phase));
  }
  order(order: TableOrder): void {
    if (this.has(order.playerId)) throw new Error('Seu pedido já está com o Tonico.');
    if (this.pending >= TABLE_QUEUE_MAX) throw new Error('O Tonico está atolado de pedidos. Tente daqui a pouco.');
    this.queue.push(order);
  }
  /** An order a worker took and could not deliver (their shift ended): Tonico takes it next, whatever the queue. */
  adopt(order: TableOrder): void { if (!this.has(order.playerId)) this.queue.unshift(order); }
  /** Removes a customer's orders; returns them so the room can refund each. */
  cancel(playerId: string): TableOrder[] {
    const removed = this.queue.filter(o => o.playerId === playerId);
    this.queue = this.queue.filter(o => o.playerId !== playerId);
    if (this.job?.order?.playerId === playerId) { removed.push(this.job.order); this.job = undefined; }
    return removed;
  }
  snapshot() {
    const phase = this.job?.phase ?? (this.returning ? 'returning' : 'idle');
    return { phase: this.job?.table ? `${phase} · mesa ${this.job.table}` : phase, current: this.job?.order && publicOrder(this.job.order), queue: this.queue.map(publicOrder) };
  }

  /**
   * `seat` answers where the customer sits now, or undefined if they left their seat. `bussing`: nobody works the bar,
   * so clearing the tables is Tonico's.
   */
  update(npc: Npc, seat: (order: TableOrder) => Point | undefined, now: number, bussing = false): WaiterEvents {
    if (!this.job) this.next(npc, now, bussing);
    const job = this.job;
    if (!job) { this.walkBack(npc); return {}; }
    npc.behavior = 'serving';
    if (job.order) return this.serve(npc, job, job.order, seat(job.order), now);
    return this.bus(npc, job, now, bussing);
  }

  /** The next thing to do: the oldest order, else (with nobody working the bar) the table waiting longest. */
  private next(npc: Npc, now: number, bussing: boolean): void {
    // An order cancelled while on his tray: the tray empties.
    unload(npc);
    const order = this.queue.shift();
    if (order) {
      this.returning = undefined;
      this.job = { order, phase: 'pickup', route: new Route([to(here(npc), PICKUP_POINT, .3)]), tray: [] };
      return;
    }
    if (!bussing || !this.tables?.dirtyTables) return;
    const table = this.tables.dirtyTables().map(tableByNumber).find(t => t && (this.unreachable.get(t.number) ?? 0) <= now);
    if (!table) return;
    this.returning = undefined;
    const centre = { x: table.x, y: table.y, z: table.z };
    this.job = { table: table.number, phase: 'bussing', route: new Route([to(here(npc), centre, .95 + clearance(table.number))]), tray: [] };
  }

  private serve(npc: Npc, job: Job, order: TableOrder, target: Point | undefined, now: number): WaiterEvents {
    if (!target) { this.job = undefined; unload(npc); this.goBack(npc); return { dropped: { order, reason: 'Você saiu da mesa e o pedido voltou para o balcão. Moedas devolvidas.' } }; }
    if (job.phase === 'pickup') {
      if (!this.follow(npc, job, () => { Object.assign(npc, PICKUP_POINT); return true; })) return {};
      // At the counter: Magrão prepares the order while the way to the table is searched.
      job.phase = 'preparing'; job.until = now + ORDER_PREPARATION_MS; npc.animationState = 'wait'; npc.animationStartedAt = now; npc.rotation = Math.PI / 2;
      job.plan = this.tables?.plan(order);
      const spots = job.plan && centre(job.plan.spots), from = here(npc);
      // Beside the customer, within reach of where the order goes (never on top of them); failing that, near the seat.
      job.route = new Route([...spots ? [to(from, { ...spots, y: target.y }, .75 + clearance(job.plan?.table), { point: target, distance: .45 })] : [], to(from, target, .9)]);
      return {};
    }
    if (job.phase === 'preparing') {
      const path = job.route!.step();
      if (path === undefined || now < job.until!) return {};
      if (!path) { this.job = undefined; this.goBack(npc); return { dropped: { order, reason: 'O Tonico não achou caminho até a sua mesa. Moedas devolvidas.' } }; }
      job.phase = 'delivering'; job.follower = new PathFollower(path, .4); job.route = undefined; npc.animationState = 'walk';
      npc.carrying = order.items.join(','); npc.carryingOrder = order.id;
      return { picked: order };
    }
    if (job.phase === 'delivering') {
      if (!job.follower!.step(npc)) return {};
      job.phase = 'handing'; job.until = now + handOverMs(order.items.length);
      // Planned again at the table: what is on it may have changed on the way.
      const plan = this.tables?.plan(order) ?? job.plan, look = plan ? centre(plan.spots) : target;
      npc.rotation = Math.atan2(look.x - npc.x, look.z - npc.z); npc.animationState = 'use'; npc.animationStartedAt = now;
      return plan ? { placing: { order, plan } } : {};
    }
    if (job.phase === 'handing' && now >= job.until!) { this.job = undefined; unload(npc); this.goBack(npc); return { delivered: order }; }
    return {};
  }

  /** Clearing a table: there, one finished item at a time onto the tray, then to the counter with them. */
  private bus(npc: Npc, job: Job, now: number, bussing: boolean): WaiterEvents {
    const table = job.table!;
    if (job.phase === 'bussing') {
      // An order, or someone started working the bar: the table can wait (nothing is on the tray yet).
      if (this.queue.length || !bussing) { this.job = undefined; return {}; }
      const arrived = this.follow(npc, job, () => { this.unreachable.set(table, now + UNREACHABLE_MS); return false; });
      if (!this.job || !arrived) return {};
      const t = tableByNumber(table)!;
      job.phase = 'clearing'; job.until = now + CLEAR_ITEM_MS;
      npc.rotation = Math.atan2(t.x - npc.x, t.z - npc.z); npc.animationState = 'use'; npc.animationStartedAt = now;
      return {};
    }
    if (job.phase === 'clearing') {
      if (now < job.until!) return {};
      const item = job.tray.length < TRAY_MAX ? this.tables?.takeOne?.(table) : undefined;
      if (item) {
        job.tray.push(item); npc.carrying = job.tray.join(','); npc.carryingOrder = `mesa-${table}`;
        job.until = now + CLEAR_ITEM_MS; npc.animationStartedAt = now;
        return {};
      }
      if (!job.tray.length) { this.job = undefined; this.goBack(npc); return {}; }
      job.phase = 'dropping'; job.route = new Route([to(here(npc), PICKUP_POINT, .3)]);
      return {};
    }
    if (job.phase === 'dropping') {
      if (!this.follow(npc, job, () => { Object.assign(npc, PICKUP_POINT); return true; })) return {};
      job.phase = 'unloading'; job.until = now + UNLOAD_MS; npc.rotation = Math.PI / 2; npc.animationState = 'use'; npc.animationStartedAt = now;
      return {};
    }
    if (job.phase === 'unloading' && now >= job.until!) { this.job = undefined; unload(npc); this.goBack(npc); }
    return {};
  }

  /**
   * Searches the job's route (a slice per tick), then walks it; true on arrival. Without a route `stuck` decides: true
   * to carry on from where he stands, false to drop the job.
   */
  private follow(npc: Npc, job: Job, stuck: () => boolean): boolean {
    if (job.route) {
      const path = job.route.step();
      if (path === undefined) { npc.animationState = 'idle'; return false; }
      job.route = undefined;
      if (!path) { if (stuck()) return true; this.job = undefined; this.goBack(npc); return false; }
      job.follower = new PathFollower(path, .4);
    }
    npc.animationState = 'walk';
    return !job.follower || job.follower.step(npc);
  }

  private goBack(npc: Npc): void {
    this.returning = this.queue.length ? undefined : { route: new Route([to(here(npc), REST_POINT, .4)]) };
  }
  /** Back to where his round starts; then the NPC director has him again. */
  private walkBack(npc: Npc): void {
    // The order he was carrying was cancelled: he walks back instead of standing there for good.
    if (!this.returning && npc.behavior === 'serving') this.goBack(npc);
    const back = this.returning;
    if (!back) return;
    npc.behavior = 'serving';
    if (back.route) {
      const path = back.route.step();
      if (path === undefined) { npc.animationState = 'idle'; return; }
      back.route = undefined;
      if (path) back.follower = new PathFollower(path, .32);
    }
    npc.animationState = 'walk';
    if (!back.follower || back.follower.step(npc)) { this.returning = undefined; npc.behavior = 'idle'; npc.animationState = 'idle'; }
  }
}
const here = (npc: Npc): Point => ({ x: npc.x, y: npc.y, z: npc.z });
const centre = (spots: readonly { x: number; z: number }[]) => ({ x: spots.reduce((sum, s) => sum + s.x, 0) / spots.length, z: spots.reduce((sum, s) => sum + s.z, 0) / spots.length });
/** Empties the tray (only writes when there is something to clear, so the state is not patched every tick). */
const unload = (npc: Npc): void => { if (npc.carrying || npc.carryingOrder) { npc.carrying = ''; npc.carryingOrder = ''; } };
