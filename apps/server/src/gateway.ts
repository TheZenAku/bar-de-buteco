import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http';
import { connect, type Socket } from 'node:net';

/**
 * Several worlds (bars), one address. One Node process is one thread: a world of 128 people uses a few percent of a
 * core, but a thousand people do not fit in one. WORLD_SHARDS=n starts n world processes (this file spawns them, each
 * with WORLD_SHARD=i on GAME_PORT+1+i, loopback only) and listens on GAME_PORT itself, so nginx, Vite and the bots keep
 * pointing where they always did.
 *
 * Colyseus puts the process in the seat's address: the browser asks POST /matchmake/... (any world can answer), gets
 * back `processId` and `roomId`, then opens a socket to /<processId>/<roomId>. So the gateway
 *   - sends each matchmake request to the emptiest world that is up and not full (polling their /health), and
 *   - sends each socket to the world whose processId is first in the path.
 * Worlds are independent bars (no shared presence): people in different ones do not see each other.
 */
export interface Shard { index: number; port: number; child?: ChildProcess; up: boolean; processId?: string; players: number; capacity: number }

const POLL_MS = 1000;

export function startGateway(options: { port: number; host: string; shards: number; log: (line: string) => void }): { close(): void } {
  const shards: Shard[] = Array.from({ length: options.shards }, (_, index) => ({ index, port: options.port + 1 + index, up: false, players: 0, capacity: 0 }));
  let closing = false;

  const launch = (shard: Shard): void => {
    const child = spawn(process.execPath, [...process.execArgv, ...process.argv.slice(1)], {
      env: { ...process.env, WORLD_SHARD: String(shard.index), GAME_PORT: String(shard.port), HOST: '127.0.0.1' },
      // The IPC channel is how a world knows its gateway died (index.ts): Windows kills a parent without telling its children.
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    });
    shard.child = child;
    child.on('exit', code => {
      shard.up = false; shard.processId = undefined; shard.players = 0; shard.child = undefined;
      options.log(`mundo ${shard.index} saiu (${code}).`);
      if (!closing) setTimeout(() => launch(shard), 2000).unref();
    });
  };
  for (const shard of shards) launch(shard);

  const poll = async (shard: Shard): Promise<void> => {
    try {
      const response = await fetch(`http://127.0.0.1:${shard.port}/health`, { signal: AbortSignal.timeout(2000) });
      const body = await response.json() as { processId?: string; players?: number; capacity?: number; roomId?: string | null };
      shard.up = response.ok && !!body.processId; shard.processId = body.processId; shard.players = body.players ?? 0; shard.capacity = body.capacity ?? 0;
    } catch { shard.up = false; }
  };
  const timer = setInterval(() => { for (const shard of shards) void poll(shard); }, POLL_MS); timer.unref();
  for (const shard of shards) void poll(shard);

  // The emptiest world with a free place. A world that has no bar yet (capacity 0, nobody has joined) counts as empty;
  // the matchmaker there creates it. Players the gateway sent since the last poll count too, so a burst spreads out.
  const sent = new Map<number, number>();
  const load = (s: Shard) => s.players + (sent.get(s.index) ?? 0);
  const choose = (): Shard | undefined => shards.filter(s => s.up && (s.capacity === 0 || load(s) < s.capacity)).sort((a, b) => load(a) - load(b) || a.index - b.index)[0];
  setInterval(() => sent.clear(), POLL_MS).unref();

  const forward = (req: IncomingMessage, res: ServerResponse, shard: Shard): void => {
    const upstream = httpRequest({ host: '127.0.0.1', port: shard.port, method: req.method, path: req.url, headers: req.headers }, answer => {
      res.writeHead(answer.statusCode ?? 502, answer.headers); answer.pipe(res);
    });
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    req.pipe(upstream);
  };

  const server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0]!;
    if (path === '/health') {
      const up = shards.filter(s => s.up);
      res.writeHead(up.length ? 200 : 503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: up.length > 0, service: 'game', shards: shards.map(s => ({ index: s.index, up: s.up, players: s.players, capacity: s.capacity })), players: up.reduce((n, s) => n + s.players, 0) }));
      return;
    }
    // Ready as soon as any world is; /metrics and everything else ask the first world that is up.
    if (path.startsWith('/matchmake/')) {
      const shard = choose();
      if (!shard) { res.writeHead(503, { 'content-type': 'application/json' }); res.end(JSON.stringify({ code: 503, error: 'BAR_FULL: O bar está cheio. Aguarde uma vaga.' })); return; }
      sent.set(shard.index, (sent.get(shard.index) ?? 0) + 1);
      forward(req, res, shard); return;
    }
    const shard = shards.find(s => s.up);
    if (!shard) { res.writeHead(503); res.end(); return; }
    forward(req, res, shard);
  });

  // A socket goes to the world named in its path; the request is replayed byte for byte and the sockets joined.
  server.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
    const processId = (req.url ?? '').split('?')[0]!.split('/').filter(Boolean)[0];
    const shard = shards.find(s => s.up && s.processId === processId);
    if (!shard) { socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n'); return; }
    const upstream = connect(shard.port, '127.0.0.1', () => {
      const lines = [`${req.method} ${req.url} HTTP/1.1`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
      upstream.write(`${lines.join('\r\n')}\r\n\r\n`); if (head.length) upstream.write(head);
      upstream.pipe(socket); socket.pipe(upstream);
    });
    const end = () => { upstream.destroy(); socket.destroy(); };
    upstream.on('error', end); socket.on('error', end); upstream.on('close', end); socket.on('close', end);
  });

  server.listen(options.port, options.host, () => options.log(`Porta de entrada em ${options.host}:${options.port}: ${options.shards} mundos nas portas ${shards[0]!.port}–${shards.at(-1)!.port}.`));
  return {
    close() { closing = true; clearInterval(timer); server.close(); for (const shard of shards) shard.child?.kill(); },
  };
}
