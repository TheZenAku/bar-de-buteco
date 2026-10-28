import { ORDER_PREPARATION_MS, PICKUP_POINT, handOverMs, type ItemId, type Position } from '@bar/shared';
import type { Npc } from '../state.js';
import { findPath, PathFollower } from './navigation.js';
import type { TablePlan } from './served.js';

type Point = Required<Position>;
export interface TableOrder { id: string; playerId: string; seatId: string; items: ItemId[]; total: number; placedAt: number; owner: { sessionId: string; userId: string } }
type Phase = 'pickup' | 'preparing' | 'delivering' | 'handing' | 'returning';
// Where Tonico goes back to after a delivery, before his usual round (apps/server/src/world/npcs.ts).
const REST_POINT: Point = { x: 15.3, y: .3, z: -6 };
export const TABLE_QUEUE_MAX = 8;
/** What leaves the server: the order without the session it was charged to. */
export const publicOrder = ({ owner: _owner, ...order }: TableOrder) => order;

export interface WaiterEvents {
  /** Tonico starts putting the order on the table, at the planned spots: the room shows the items there. */
  placing?: { order: TableOrder; plan: TablePlan };
  /** The order reached the table: the room applies its effects. */
  delivered?: TableOrder;
  /** The order could not be delivered (the customer left the seat, no path): the room refunds it. */
  dropped?: { order: TableOrder; reason: string };
}
/** Where an order will stand on the table top (apps/server/src/world/served.ts); without it Tonico hands it over. */
export interface TableTop { plan(order: TableOrder): TablePlan | undefined }

/**
 * Tonico runs table orders one at a time: from wherever he is to the counter, waits for Magrão to
 * prepare them, carries them on his tray to the table along a path found on the shared floor and colliders,
 * puts them down where `tables` planned and walks back. While serving, the wandering NPC director leaves him
 * alone (behavior 'serving').
 */
export class WaiterService {
  private queue: TableOrder[] = [];
  private job?: { order: TableOrder; phase: Phase; follower?: PathFollower; until?: number; plan?: TablePlan };
  private returning?: PathFollower;

  constructor(private readonly tables?: TableTop) {}

  has(playerId: string): boolean { return this.job?.order.playerId === playerId || this.queue.some(o => o.playerId === playerId); }
  get pending(): number { return this.queue.length + (this.job ? 1 : 0); }
  order(order: TableOrder): void {
    if (this.has(order.playerId)) throw new Error('Seu pedido já está com o Tonico.');
    if (this.pending >= TABLE_QUEUE_MAX) throw new Error('O Tonico está atolado de pedidos. Tente daqui a pouco.');
    this.queue.push(order);
  }
  /** Removes a customer's orders; returns them so the room can refund each. */
  cancel(playerId: string): TableOrder[] {
    const removed = this.queue.filter(o => o.playerId === playerId);
    this.queue = this.queue.filter(o => o.playerId !== playerId);
    if (this.job?.order.playerId === playerId) { removed.push(this.job.order); this.job = undefined; }
    return removed;
  }
  snapshot() {
    return { phase: this.job?.phase ?? (this.returning ? 'returning' : 'idle'), current: this.job && publicOrder(this.job.order), queue: this.queue.map(publicOrder) };
  }

  /** `seat` answers where the customer sits now, or undefined if they left their seat. */
  update(npc: Npc, seat: (order: TableOrder) => Point | undefined, now: number): WaiterEvents {
    if (!this.job) {
      // The order on his tray was cancelled: the tray empties.
      unload(npc);
      const order = this.queue.shift();
      if (!order) {
        // The order he was carrying was cancelled: he walks back instead of standing there for good.
        if (!this.returning && npc.behavior === 'serving') this.goBack(npc);
        if (this.returning) { npc.behavior = 'serving'; npc.animationState = 'walk'; if (this.returning.step(npc)) { this.returning = undefined; npc.behavior = 'idle'; npc.animationState = 'idle'; } }
        return {};
      }
      const path = findPath(here(npc), p => Math.hypot(p.x - PICKUP_POINT.x, p.z - PICKUP_POINT.z) < .3 && Math.abs(p.y - PICKUP_POINT.y) < .3, PICKUP_POINT);
      // Stuck somewhere unreachable (an event pushed him into a corner): he reappears at the counter.
      if (!path) Object.assign(npc, PICKUP_POINT);
      this.returning = undefined;
      this.job = { order, phase: 'pickup', follower: path ? new PathFollower(path, .4) : undefined };
    }
    const job = this.job, target = seat(job.order);
    npc.behavior = 'serving';
    if (!target) { this.job = undefined; unload(npc); this.goBack(npc); return { dropped: { order: job.order, reason: 'Você saiu da mesa e o Tonico levou o pedido de volta. Moedas devolvidas.' } }; }
    if (job.phase === 'pickup') {
      npc.animationState = 'walk';
      if (!job.follower || job.follower.step(npc)) { job.phase = 'preparing'; job.until = now + ORDER_PREPARATION_MS; npc.animationState = 'wait'; npc.animationStartedAt = now; npc.rotation = Math.PI / 2; }
      return {};
    }
    if (job.phase === 'preparing') {
      if (now < job.until!) return {};
      job.plan = this.tables?.plan(job.order);
      const spots = job.plan && centre(job.plan.spots);
      // Beside the customer, within reach of where the order goes (never on top of them); failing that, near the seat.
      const path = (spots && findPath(here(npc), p => Math.hypot(p.x - spots.x, p.z - spots.z) < .75 && Math.hypot(p.x - target.x, p.z - target.z) > .45 && Math.abs(p.y - target.y) < .3, { ...spots, y: target.y }))
        ?? findPath(here(npc), p => Math.hypot(p.x - target.x, p.z - target.z) < .9 && Math.abs(p.y - target.y) < .3, target);
      if (!path) { this.job = undefined; this.goBack(npc); return { dropped: { order: job.order, reason: 'O Tonico não achou caminho até a sua mesa. Moedas devolvidas.' } }; }
      job.phase = 'delivering'; job.follower = new PathFollower(path, .4); npc.animationState = 'walk';
      npc.carrying = job.order.items.join(','); npc.carryingOrder = job.order.id;
      return {};
    }
    if (job.phase === 'delivering') {
      if (!job.follower!.step(npc)) return {};
      job.phase = 'handing'; job.until = now + handOverMs(job.order.items.length);
      const look = job.plan ? centre(job.plan.spots) : target;
      npc.rotation = Math.atan2(look.x - npc.x, look.z - npc.z); npc.animationState = 'use'; npc.animationStartedAt = now;
      return job.plan ? { placing: { order: job.order, plan: job.plan } } : {};
    }
    if (job.phase === 'handing' && now >= job.until!) { this.job = undefined; unload(npc); this.goBack(npc); return { delivered: job.order }; }
    return {};
  }

  private goBack(npc: Npc): void {
    const path = this.queue.length ? undefined : findPath(here(npc), p => Math.hypot(p.x - REST_POINT.x, p.z - REST_POINT.z) < .4 && Math.abs(p.y - REST_POINT.y) < .3, REST_POINT);
    this.returning = path ? new PathFollower(path, .32) : undefined;
    if (!path && !this.queue.length) { npc.behavior = 'idle'; npc.animationState = 'idle'; }
  }
}
const here = (npc: Npc): Point => ({ x: npc.x, y: npc.y, z: npc.z });
const centre = (spots: readonly { x: number; z: number }[]) => ({ x: spots.reduce((sum, s) => sum + s.x, 0) / spots.length, z: spots.reduce((sum, s) => sum + s.z, 0) / spots.length });
/** Empties the tray (only writes when there is something to clear, so the state is not patched every tick). */
const unload = (npc: Npc): void => { if (npc.carrying || npc.carryingOrder) { npc.carrying = ''; npc.carryingOrder = ''; } };
