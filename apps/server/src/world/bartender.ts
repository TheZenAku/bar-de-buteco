import { BARTEND_DURATION_MS, COUNTER_FOOTPRINT, PLAYER_RADIUS, movePlayer, type Position } from '@bar/shared';
import type { Npc } from '../state.js';

// Fraction of walking speed (3.5 m/s) Seu Zé uses behind the counter.
const PACE = 0.4;
// Ticks without progress, or time spent walking, before he serves from where he stands.
const STUCK_TICKS = 6;
const WALK_LIMIT_MS = 8000;

/** Across the counter from the customer: behind the face of the counter the customer leans on. */
export function servingSpot(customer: Position, y: number): Position {
  const box = COUNTER_FOOTPRINT.reduce((best, b) => {
    const gap = Math.hypot(Math.max(Math.abs(customer.x - b.x) - b.hx, 0), Math.max(Math.abs(customer.z - b.z) - b.hz, 0));
    return gap < best.gap ? { b, gap } : best;
  }, { b: COUNTER_FOOTPRINT[0]!, gap: Infinity }).b;
  const clear = PLAYER_RADIUS + 0.08;
  const along = (value: number, centre: number, half: number) => Math.min(Math.max(value, centre - half + clear), centre + half - clear);
  return Math.abs(customer.x - box.x) - box.hx >= Math.abs(customer.z - box.z) - box.hz
    ? { x: box.x - Math.sign(customer.x - box.x) * (box.hx + clear), y, z: along(customer.z, box.z, box.hz) }
    : { x: along(customer.x, box.x, box.hx), y, z: box.z - Math.sign(customer.z - box.z) * (box.hz + clear) };
}

interface Job { playerId: string; target: Position; walkUntil: number; stuck: number; servedAt?: number }

/**
 * Seu Zé takes orders one at a time: he walks behind the counter to face the customer (or, if he
 * cannot get there, stays where he is), then plays the bartending clip. The drink is ready at its end.
 */
export class BarService {
  private queue: string[] = [];
  private job?: Job;

  has(playerId: string): boolean { return this.job?.playerId === playerId || this.queue.includes(playerId); }
  order(playerId: string): void { if (!this.has(playerId)) this.queue.push(playerId); }
  cancel(playerId: string): void {
    this.queue = this.queue.filter(id => id !== playerId);
    if (this.job?.playerId === playerId) this.job = undefined;
  }

  /** Advances the service; returns the customer whose drink has just been served. */
  update(npc: Npc, customer: (playerId: string) => Position | undefined, now: number): string | undefined {
    while (!this.job && this.queue.length) {
      const playerId = this.queue.shift()!, position = customer(playerId);
      if (position) this.job = { playerId, target: servingSpot(position, npc.y), walkUntil: now + WALK_LIMIT_MS, stuck: 0 };
    }
    const job = this.job, position = job && customer(job.playerId);
    if (!job || !position) {
      this.job = undefined;
      if (npc.behavior === 'serving') { npc.behavior = 'idle'; npc.animationState = 'idle'; }
      return;
    }
    npc.behavior = 'serving';
    if (job.servedAt === undefined) {
      const dx = job.target.x - npc.x, dz = job.target.z - npc.z, d = Math.hypot(dx, dz);
      if (d > 0.05 && job.stuck < STUCK_TICKS && now < job.walkUntil) {
        // Slow down on arrival instead of overshooting the spot.
        const pace = Math.min(PACE, d / 0.175);
        const next = movePlayer(npc, { dx: dx / d * pace, dz: dz / d * pace, running: false });
        job.stuck = Math.hypot(next.x - npc.x, next.z - npc.z) < 0.005 ? job.stuck + 1 : 0;
        npc.x = next.x; npc.y = next.y; npc.z = next.z; npc.rotation = Math.atan2(dx, dz); npc.animationState = 'walk';
        return;
      }
      job.servedAt = now;
      npc.animationState = 'bartend'; npc.animationStartedAt = now;
    }
    npc.rotation = Math.atan2(position.x - npc.x, position.z - npc.z);
    if (now < job.servedAt + BARTEND_DURATION_MS) return;
    this.job = undefined;
    npc.animationState = 'idle';
    return job.playerId;
  }
}
