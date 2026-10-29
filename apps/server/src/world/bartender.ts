import { MAGRAO_SPOT, SERVE_FOR_DRINK, SERVE_STATES, barClipMs, type ServeState } from '@bar/shared';
import type { Npc } from '../state.js';

interface Job { playerId: string; state: ServeState; startedAt: number; cancelled?: boolean }

/**
 * Magrão serves the counter one order at a time from his place behind it (Balcao_Lugar_Magrao), facing the customers:
 * a chopp is poured at the tap, a long neck comes out of the freezer (bar_magrao.glb, 18_animacoes_bar.py). The clip
 * takes him there and back; the drink is on the counter (Balcao_Entrega) when it ends, and the customer has it then.
 * An order dropped once he has started is finished all the same (nobody gets it).
 */
export class BarService {
  private queue: Array<{ playerId: string; item: string }> = [];
  private job?: Job;

  has(playerId: string): boolean { return (this.job?.playerId === playerId && !this.job.cancelled) || this.queue.some(order => order.playerId === playerId); }
  order(playerId: string, item = 'copo'): void { if (!this.has(playerId)) this.queue.push({ playerId, item }); }
  cancel(playerId: string): void {
    this.queue = this.queue.filter(order => order.playerId !== playerId);
    if (this.job?.playerId === playerId) this.job.cancelled = true;
  }

  /** Advances the service; returns the customer whose drink has just been put on the counter. */
  update(npc: Npc, waiting: (playerId: string) => unknown, now: number): string | undefined {
    while (!this.job && this.queue.length) {
      const next = this.queue.shift()!;
      if (waiting(next.playerId)) this.job = { playerId: next.playerId, state: SERVE_FOR_DRINK[next.item] ?? 'serve-chopp', startedAt: now };
    }
    const job = this.job;
    if (!job) {
      if (npc.behavior === 'serving') { npc.behavior = 'idle'; npc.animationState = 'idle'; npc.animationStartedAt = now; }
      return;
    }
    if (npc.behavior !== 'serving' || npc.animationState !== job.state) {
      // Every clip starts and ends at his place: he is put back there if anything moved him.
      npc.x = MAGRAO_SPOT.x; npc.y = MAGRAO_SPOT.y; npc.z = MAGRAO_SPOT.z; npc.rotation = MAGRAO_SPOT.rotation;
      npc.behavior = 'serving'; npc.animationState = job.state; npc.animationStartedAt = job.startedAt;
    }
    if (now < job.startedAt + barClipMs(SERVE_STATES[job.state])) return;
    this.job = undefined;
    npc.behavior = 'idle'; npc.animationState = 'idle'; npc.animationStartedAt = now;
    return !job.cancelled && waiting(job.playerId) ? job.playerId : undefined;
  }
}
