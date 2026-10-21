import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { config } from 'dotenv';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { authSecret } from '@bar/shared/tickets';
import { BarRoom } from './BarRoom.js';

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
authSecret();
const port = Number(process.env.GAME_PORT) || 2567;
const http = createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, service: 'game', roomId: BarRoom.activeId || null })); }
});
const gameServer = new Server({ transport: new WebSocketTransport({ server: http, maxPayload: 8192, pingInterval: 5000, pingMaxRetries: 2 }), greet: false });
gameServer.define('bar', BarRoom);
await gameServer.listen(port, process.env.HOST || '0.0.0.0');
console.log(`B.A.R. multiplayer pronto em ws://localhost:${port}`);
