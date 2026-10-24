import type { Control } from '../internal.js';
import { InternalApiError } from '../internal.js';
import type { FileOutbox } from './outbox.js';

type Send = <T>(path: string, body?: unknown) => Promise<T>;
export type MatchResult = 'win' | 'loss' | 'draw';

/**
 * Administrative controls from the API's outbox: lease, apply, confirm. A control delivered again (the
 * confirmation was lost, or the lease expired) is confirmed without being applied a second time.
 */
export class ControlRelay {
  private applied = new Map<string, number>();
  constructor(readonly owner: string, private send: Send, private keepMs = 60 * 60_000) {}

  /** `apply` throws to reject a control for good (it is reported as failed, not retried). */
  async poll(apply: (control: Control) => void, now = Date.now()): Promise<{ applied: string[]; failed: string[] }> {
    for (const [id, at] of this.applied) if (now - at > this.keepMs) this.applied.delete(id);
    const { controls = [] } = await this.send<{ controls?: Control[] }>('controls/lease', { owner: this.owner });
    const applied: string[] = [], failed: { id: string; error: string }[] = [];
    for (const control of controls) {
      if (!this.applied.has(control.id)) {
        try { apply(control); }
        catch (error) { failed.push({ id: control.id, error: error instanceof Error ? error.message : String(error) }); continue; }
        this.applied.set(control.id, now);
      }
      applied.push(control.id);
    }
    if (applied.length || failed.length) await this.send('controls/ack', { owner: this.owner, applied, failed });
    return { applied, failed: failed.map(entry => entry.id) };
  }
}

/** Blackjack results go through the durable outbox: a crash or an API outage never loses a finished round. */
export class ResultRelay {
  constructor(private outbox: FileOutbox<{ roundId: string; userId: string; result: MatchResult }>, private send: Send) {}

  record(roundId: string, userId: string, result: MatchResult): void {
    this.outbox.add('blackjack-result', `${roundId}:${userId}`, { roundId, userId, result });
  }
  get pending(): number { return this.outbox.size; }

  /** Sends what is waiting, one request per round (the API ignores results it already counted). */
  async flush(): Promise<void> {
    const rounds = new Map<string, { ids: string[]; results: { userId: string; result: MatchResult }[] }>();
    for (const { id, payload } of this.outbox.pending()) {
      const round = rounds.get(payload.roundId) ?? { ids: [], results: [] };
      round.ids.push(id); round.results.push({ userId: payload.userId, result: payload.result });
      rounds.set(payload.roundId, round);
    }
    for (const [roundId, { ids, results }] of rounds) {
      try { await this.send('stats', { roundId, results }); }
      catch (error) {
        // The API refused the content itself (4xx): retrying cannot succeed. Anything else is retried later.
        if (error instanceof InternalApiError && error.status >= 400 && error.status < 500) { this.outbox.fail(ids, error.message); continue; }
        throw error;
      }
      this.outbox.complete(ids);
    }
  }
}
