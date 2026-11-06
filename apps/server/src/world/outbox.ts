import { appendFileSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';

export interface OutboxRecord<T = unknown> { id: string; kind: string; payload: T; createdAt: number }

/**
 * A durable local outbox (JSON lines). A record is on disk (fsync) before `add` returns, and leaves only when
 * `complete` or `fail` is called, so a crash or restart never loses it; the receiver must be idempotent by `id`.
 * A torn last line (crash during a write) is skipped when loading.
 */
export class FileOutbox<T = unknown> {
  private records = new Map<string, OutboxRecord<T>>();
  /** The file still holds records that have left (a rewrite failed): the next write replaces it whole. The receivers are idempotent, so a stale line costs a repeat, never a loss. */
  private stale = false;
  constructor(readonly path: string, private log: (event: string, details: Record<string, unknown>) => void = () => {}) {
    mkdirSync(dirname(path), { recursive: true });
    if (!existsSync(path)) return;
    const lines = readFileSync(path, 'utf8').split('\n');
    for (const [index, line] of lines.entries()) {
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line) as OutboxRecord<T>;
        if (typeof record?.id === 'string' && typeof record.kind === 'string') this.records.set(record.id, record);
        else throw new Error('registro sem id');
      } catch (error) { this.log('outbox_line_skipped', { path, line: index + 1, error: error instanceof Error ? error.message : String(error) }); }
    }
  }

  /** Idempotent: a record already waiting with the same id is kept as it is. */
  add(kind: string, id: string, payload: T, now = Date.now()): void {
    if (this.records.has(id)) return;
    const record: OutboxRecord<T> = { id, kind, payload, createdAt: now };
    this.records.set(id, record);
    if (this.stale) { this.rewrite(); return; }
    const fd = openSync(this.path, 'a');
    try { writeSync(fd, `${JSON.stringify(record)}\n`); fsyncSync(fd); } finally { closeSync(fd); }
  }
  pending(): OutboxRecord<T>[] { return [...this.records.values()].sort((a, b) => a.createdAt - b.createdAt); }
  get size(): number { return this.records.size; }

  complete(ids: readonly string[]): void {
    let changed = false;
    for (const id of ids) changed = this.records.delete(id) || changed;
    if (changed) this.rewrite();
  }
  /** In one atomic rewrite, the records `ids` leave and `next` comes in: a crash leaves either all of them or it. */
  swap(ids: readonly string[], next: { kind: string; id: string; payload: T }, now = Date.now()): void {
    for (const id of ids) this.records.delete(id);
    if (!this.records.has(next.id)) this.records.set(next.id, { ...next, createdAt: now });
    this.rewrite();
  }
  /** Records the receiver rejected for good go to `<path>.failed` (dead letter) instead of being retried forever. */
  fail(ids: readonly string[], reason: string): void {
    const failed = ids.map(id => this.records.get(id)).filter((record): record is OutboxRecord<T> => !!record);
    if (!failed.length) return;
    appendFileSync(`${this.path}.failed`, failed.map(record => `${JSON.stringify({ ...record, failedAt: Date.now(), reason })}\n`).join(''));
    this.log('outbox_dead_letter', { path: this.path, ids: failed.map(record => record.id), reason });
    this.complete(failed.map(record => record.id));
  }

  /**
   * Atomic replace: a crash leaves either the old or the new file, never a partial one. On Windows the rename is refused
   * (EPERM/EBUSY) while anything else has the file open (antivirus, an indexer, an editor), and the world died of it in the
   * middle of a blackjack round: so it is tried again, then the file is written in place, and if even that fails the
   * records stay in memory (marked stale) until the next write. It never throws: the room must not fall for a disk hiccup.
   */
  private rewrite(): void {
    const text = this.pending().map(record => `${JSON.stringify(record)}\n`).join('');
    const temporary = `${this.path}.tmp`;
    try {
      const fd = openSync(temporary, 'w');
      try { writeSync(fd, text); fsyncSync(fd); } finally { closeSync(fd); }
      for (let attempt = 0; ; attempt++) {
        try { renameSync(temporary, this.path); this.stale = false; return; }
        catch (error) { if (attempt >= 3) throw error; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5 * (attempt + 1)); }
      }
    } catch (error) {
      this.log('outbox_rewrite_retry', { path: this.path, error: error instanceof Error ? error.message : String(error) });
      try { const fd = openSync(this.path, 'w'); try { writeSync(fd, text); fsyncSync(fd); } finally { closeSync(fd); } this.stale = false; }
      catch (second) { this.stale = true; this.log('outbox_rewrite_failed', { path: this.path, error: second instanceof Error ? second.message : String(second) }); }
    }
  }
}
