import { sql } from 'drizzle-orm';
import type { Database } from './database/index.js';

/**
 * Administrative controls (kick, ban, event) as a transactional outbox. The admin transaction inserts a
 * `pending` row; the world leases rows (`leased`, with an owner and an expiry), applies them and confirms
 * (`applied`), or reports a failure. A lease that expires (world crashed between lease and confirmation) makes
 * the row available again; after `maxAttempts` leases it is parked as `failed` (dead letter) for inspection.
 */
export const CONTROL_OUTBOX = { leaseMs: 30_000, maxAttempts: 5, batch: 50, retentionDays: 7 } as const;

export interface LeasedControl { id: string; payload: Record<string, unknown>; attempts: number }
interface Row { id: string; payload: Record<string, unknown>; attempts: number; created_at: string | Date }

const rows = <T>(result: unknown): T[] => (result as { rows: T[] }).rows;

export async function leaseControls(db: Database, owner: string, options: { limit?: number; leaseMs?: number; maxAttempts?: number } = {}): Promise<LeasedControl[]> {
  const limit = options.limit ?? CONTROL_OUTBOX.batch, leaseMs = options.leaseMs ?? CONTROL_OUTBOX.leaseMs, maxAttempts = options.maxAttempts ?? CONTROL_OUTBOX.maxAttempts;
  return db.transaction(async (tx) => {
    // Dead letter: leased too many times without confirmation.
    await tx.execute(sql`UPDATE game_controls SET status = 'failed', last_error = coalesce(last_error, 'lease expired after ' || attempts || ' attempts')
      WHERE status = 'leased' AND lease_expires_at < now() AND attempts >= ${maxAttempts}`);
    // Old confirmations are history only; keep the table small.
    await tx.execute(sql`DELETE FROM game_controls WHERE status = 'applied' AND applied_at < now() - make_interval(days => ${CONTROL_OUTBOX.retentionDays})`);
    const leased = rows<Row>(await tx.execute(sql`UPDATE game_controls SET status = 'leased', lease_owner = ${owner},
        lease_expires_at = now() + make_interval(secs => ${leaseMs / 1000}), attempts = attempts + 1
      WHERE id IN (SELECT id FROM game_controls
        WHERE status = 'pending' OR (status = 'leased' AND lease_expires_at < now() AND attempts < ${maxAttempts})
        ORDER BY created_at, id LIMIT ${limit} FOR UPDATE SKIP LOCKED)
      RETURNING id, payload, attempts, created_at`));
    // UPDATE … RETURNING has no order: apply in issue order.
    const issued = (row: Row) => new Date(row.created_at).getTime();
    return leased.sort((a, b) => issued(a) - issued(b) || a.id.localeCompare(b.id)).map(({ id, payload, attempts }) => ({ id, payload, attempts }));
  });
}

/** Confirms the rows this owner still holds. Confirmations for rows leased again by someone else are ignored. */
export async function acknowledgeControls(db: Database, owner: string, applied: readonly string[], failed: readonly { id: string; error: string }[] = []): Promise<{ applied: number; failed: number }> {
  return db.transaction(async (tx) => {
    let appliedCount = 0, failedCount = 0;
    for (const id of applied)
      appliedCount += rows(await tx.execute(sql`UPDATE game_controls SET status = 'applied', applied_at = now(), lease_expires_at = NULL
        WHERE id = ${id} AND status = 'leased' AND lease_owner = ${owner} RETURNING id`)).length;
    for (const { id, error } of failed)
      failedCount += rows(await tx.execute(sql`UPDATE game_controls SET status = 'failed', last_error = ${error.slice(0, 500)}, lease_expires_at = NULL
        WHERE id = ${id} AND status = 'leased' AND lease_owner = ${owner} RETURNING id`)).length;
    return { applied: appliedCount, failed: failedCount };
  });
}

/**
 * The previous world version polls GET /api/internal/controls and never confirms. For it the behaviour stays
 * what it was (each row delivered once): the lease is confirmed as soon as it is handed out.
 */
export async function claimControlsOnce(db: Database): Promise<Record<string, unknown>[]> {
  const owner = 'legacy-poll';
  const leased = await leaseControls(db, owner);
  await acknowledgeControls(db, owner, leased.map((row) => row.id));
  return leased.map((row) => row.payload);
}
