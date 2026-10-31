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
    const fd = openSync(this.path, 'a');
    try { writeSync(fd, `${JSON.stringify(record)}\n`); fsyncSync(fd); } finally { closeSync(fd); }
    this.records.set(id, record);
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

  /** Atomic replace: a crash leaves either the old or the new file, never a partial one. */
  private rewrite(): void {
    const temporary = `${this.path}.tmp`, fd = openSync(temporary, 'w');
    try { writeSync(fd, this.pending().map(record => `${JSON.stringify(record)}\n`).join('')); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(temporary, this.path);
  }
}
