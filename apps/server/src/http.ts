import { createEndpoint, createRouter } from '@colyseus/core';
import { BarRoom } from './BarRoom.js';
import { internalSecretMatches, readiness, worldMetrics } from './observability.js';

/**
 * The world's HTTP endpoints, on Colyseus's own router (so a check never sends a second response).
 * /health: the process answers (liveness). /ready: the bar exists and the API answered recently (traffic can come).
 * /metrics: Prometheus text, only with the internal secret (the edge proxies /game/ to this server).
 */
export function worldRouter() {
  return createRouter({
    health: createEndpoint('/health', { method: 'GET' }, async () => Response.json({ ok: true, service: 'game', roomId: BarRoom.activeId || null })),
    ready: createEndpoint('/ready', { method: 'GET' }, async () => { const state = readiness(); return Response.json({ ...state, service: 'game' }, { status: state.ready ? 200 : 503 }); }),
    metrics: createEndpoint('/metrics', { method: 'GET' }, async (context) => internalSecretMatches(context.request?.headers.get('x-internal-secret') ?? null)
      ? new Response(worldMetrics.render(), { headers: { 'content-type': 'text/plain; version=0.0.4' } }) : new Response('Not found', { status: 404 })),
  });
}
