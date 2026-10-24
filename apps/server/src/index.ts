import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { config as loadEnvironment } from 'dotenv';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { authSecret } from '@bar/shared/tickets';
import { BarRoom } from './BarRoom.js';
import { readWorldConfig } from './config.js';
import { worldRouter } from './http.js';

loadEnvironment({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
authSecret();
// Fails fast with the variable's name when the environment is invalid.
const config = readWorldConfig();
const http = createServer();
const gameServer = new Server({ transport: new WebSocketTransport({ server: http, maxPayload: 8192, pingInterval: 5000, pingMaxRetries: 2 }), greet: false });
gameServer.router = worldRouter();
gameServer.define('bar', BarRoom);
await gameServer.listen(config.port, config.host);
console.log(`B.A.R. multiplayer pronto em ws://localhost:${config.port}`);
