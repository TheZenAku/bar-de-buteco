import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { config } from 'dotenv';
import { Server, createEndpoint, createRouter } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { authSecret } from '@bar/shared/tickets';
import { BarRoom } from './BarRoom.js';

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
authSecret();
const port = Number(process.env.GAME_PORT) || 2567;
const http = createServer();
const gameServer = new Server({ transport: new WebSocketTransport({ server: http, maxPayload: 8192, pingInterval: 5000, pingMaxRetries: 2 }), greet: false });
// Share Colyseus's HTTP router so health checks cannot send a second response.
gameServer.router = createRouter({ health: createEndpoint('/health', { method: 'GET' }, async () =>
  Response.json({ ok: true, service: 'game', roomId: BarRoom.activeId || null })) });
gameServer.define('bar', BarRoom);
await gameServer.listen(port, process.env.HOST || '0.0.0.0');
console.log(`B.A.R. multiplayer pronto em ws://localhost:${port}`);
