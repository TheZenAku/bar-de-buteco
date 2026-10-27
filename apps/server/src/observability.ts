import { createHmac, timingSafeEqual } from 'node:crypto';
import { MetricsRegistry } from '@bar/shared/metrics';
import { internalSecret } from '@bar/shared/tickets';

/** One registry per world process (GET /metrics, internal secret required). */
export const worldMetrics = new MetricsRegistry();

/** The API is considered reachable when the last maintenance round trip is this recent (maintenance runs every 3 s). */
export const API_FRESH_MS = 15_000;
export const health = { roomId: undefined as string | undefined, apiOkAt: 0, outboxWritable: true };

export function readiness(now = Date.now()): { ready: boolean; checks: Record<string, boolean> } {
  const checks = { room: !!health.roomId, api: now - health.apiOkAt <= API_FRESH_MS, outbox: health.outboxWritable };
  return { ready: Object.values(checks).every(Boolean), checks };
}

/**
 * Logs never carry raw account ids: a keyed hash (HMAC with INTERNAL_SECRET) still correlates every line of the
 * same player. To find a player's lines: `node tools/ops/pseudonym.mjs <userId>` in the same environment.
 */
export function pseudonym(id: string): string { return createHmac('sha256', internalSecret()).update(`log:${id}`).digest('hex').slice(0, 12); }

const PLAYER_FIELDS = new Set(['playerId', 'userId']);
export function logLine(event: string, details: Record<string, unknown>, roomId?: string): string {
  const safe = Object.fromEntries(Object.entries(details).map(([name, value]) => [name, PLAYER_FIELDS.has(name) && typeof value === 'string' ? pseudonym(value) : value]));
  return JSON.stringify({ service: 'game', event, roomId, ...safe, at: new Date().toISOString() });
}

export function internalSecretMatches(value: string | null): boolean {
  if (!value) return false;
  const a = Buffer.from(value), b = Buffer.from(internalSecret());
  return a.length === b.length && timingSafeEqual(a, b);
}
