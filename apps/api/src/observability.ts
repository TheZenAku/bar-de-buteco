import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { MetricsRegistry } from '@bar/shared/metrics';

/** Request ids: the caller's (e.g. the world's `world-…`) when well formed, otherwise a new one. */
const REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;
export function requestIdFor(request: IncomingMessage): string {
  const header = request.headers['x-request-id'];
  return typeof header === 'string' && REQUEST_ID.test(header) ? header : randomUUID();
}

/** API metrics (GET /api/internal/metrics, internal secret; never exposed by the edge). */
export function createApiMetrics() {
  const registry = new MetricsRegistry();
  return {
    registry,
    /** Route templates, never raw URLs: ids and queries stay out of the labels. */
    record(method: string, route: string | undefined, status: number, ms: number): void {
      registry.inc('bar_api_requests_total', 'HTTP requests answered', { method, route: route ?? 'unmatched', status: `${Math.floor(status / 100)}xx` });
      registry.observe('bar_api_request_ms', 'Response time in ms', ms);
    },
  };
}
