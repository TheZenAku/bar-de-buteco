import { fileURLToPath } from 'node:url';
import { config as loadEnvironment } from 'dotenv';
import { readWorldConfig } from './config.js';

loadEnvironment({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
// Fails fast with the variable's name when the environment is invalid.
const config = readWorldConfig();

if (config.shards > 1 && config.shard === undefined) {
  // WORLD_SHARDS=n: this process only routes; the n worlds are children of it (gateway.ts).
  const { startGateway } = await import('./gateway.js');
  const gateway = startGateway({ port: config.port, host: config.host, shards: config.shards, log: line => console.log(`[porta] ${line}`) });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { gateway.close(); process.exit(0); });
} else {
  const { createServer } = await import('node:http');
  const { Server } = await import('@colyseus/core');
  const { Encoder } = await import('@colyseus/schema');
  const { WebSocketTransport } = await import('@colyseus/ws-transport');
  const { BarRoom } = await import('./BarRoom.js');
  const { worldRouter } = await import('./http.js');
  // The state patch is written into one shared buffer that starts at 16 KB; a crowd (or a join) overflows it, and each overflow
  // reallocates and logs. Start big enough for a full room instead.
  Encoder.BUFFER_SIZE = 512 * 1024;
  // A world that dies leaves its reason in .data/world/crash.log (the dev terminal's scrollback is the only other place, and `tsx watch` then waits silently).
  const { appendFileSync, mkdirSync } = await import('node:fs');
  const { dirname } = await import('node:path');
  const crashLog = fileURLToPath(new URL('../../../.data/world/crash.log', import.meta.url));
  const die = (kind: string) => (error: unknown) => {
    try { mkdirSync(dirname(crashLog), { recursive: true }); appendFileSync(crashLog, `${new Date().toISOString()} ${kind} (mundo ${config.shard ?? 0}, pid ${process.pid})\n${error instanceof Error ? error.stack : String(error)}\n\n`); } catch { /* the console still has it */ }
    console.error(kind, error); process.exit(1);
  };
  process.on('uncaughtException', die('uncaughtException')); process.on('unhandledRejection', die('unhandledRejection'));
  if (config.shard !== undefined && process.send) process.on('disconnect', () => process.exit(0));
  const http = createServer();
  const gameServer = new Server({ transport: new WebSocketTransport({ server: http, maxPayload: 24_576, pingInterval: 5000, pingMaxRetries: 2 }), greet: false });
  gameServer.router = worldRouter();
  gameServer.define('bar', BarRoom);
  await gameServer.listen(config.port, config.host);
  console.log(`B.A.R. multiplayer pronto em ws://localhost:${config.port}${config.shard === undefined ? '' : ` (mundo ${config.shard})`}`);
}
