import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { Client as BrowserClient, type Room as ClientRoom } from '@colyseus/sdk';
import { BLACKJACK_TABLE } from '@bar/shared';
import { signTicket } from '@bar/shared/tickets';
import { BarRoom } from '../src/BarRoom.js';

async function eventually(check: () => boolean, timeout = 3000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Condition timed out');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

test('real WebSocket clients: auth, authority, AOI, chat, table privacy, reconnect and singleton capacity', { timeout: 20_000 }, async () => {
  const previousApi = process.env.API_INTERNAL_URL, previousCapacity = process.env.BAR_CAPACITY;
  process.env.BAR_CAPACITY = '2';
  const internal = createServer(async (req, res) => {
    let data = '';
    for await (const chunk of req) data += chunk;
    const body = data ? JSON.parse(data) : {};
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/internal/validate') res.end(JSON.stringify({ valid: body.sessionId === `session-${body.userId}`, blocked: [], role: 'user' }));
    else if (req.url === '/api/internal/controls') res.end('{"controls":[]}');
    else res.end('{"ok":true}');
  });
  await new Promise<void>(resolve => internal.listen(0, '127.0.0.1', resolve));
  process.env.API_INTERNAL_URL = `http://127.0.0.1:${(internal.address() as AddressInfo).port}`;
  const http = createServer();
  const server = new Server({ transport: new WebSocketTransport({ server: http }), greet: false, gracefullyShutdown: false });
  let authoritative: BarRoom | undefined;
  server.define('bar', BarRoom).on('create', room => { authoritative = room as BarRoom; });
  await server.listen(0, '127.0.0.1');
  const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  const browser = new BrowserClient(url);
  const rooms: ClientRoom[] = [];
  const ticket = (userId: string) => signTicket({ userId, sessionId: `session-${userId}`, displayName: userId, role: 'user', color: '#aa8844' });
  try {
    await assert.rejects(() => browser.joinOrCreate('bar', { ticket: 'forged' }));
    const first = await browser.joinOrCreate('bar', { ticket: ticket('alice') }); rooms.push(first);
    first.reconnection.minUptime = 0;
    const errors: string[] = [];
    first.onMessage('error', m => errors.push(m.message));
    first.onMessage('chat.message', () => {});
    await eventually(() => first.state?.players?.has('alice'));
    await assert.rejects(() => browser.joinOrCreate('bar', { ticket: ticket('alice') }), /ALREADY_CONNECTED/);
    const second = await browser.joinOrCreate('bar', { ticket: ticket('bob'), skin: 'leandro' }); rooms.push(second);
    second.onMessage('error', () => {});
    const received: string[] = [];
    second.onMessage('chat.message', m => received.push(m.text));
    await eventually(() => second.state?.players?.size === 2 && first.state.players.size === 2);
    assert.equal(first.roomId, second.roomId);
    await assert.rejects(() => browser.joinOrCreate('bar', { ticket: ticket('carol') }), /BAR_FULL/);
    const player = authoritative!.state.players.get('alice')!;
    const startX = player.x;
    first.send('player.input', { seq: 0, dx: 1, dz: 0, running: false, rotation: 0 });
    await eventually(() => first.state.players.get('alice').lastProcessedInput === 0);
    assert.ok(Math.abs(player.x - startX - 0.175) < 0.001);
    first.send('player.input', { seq: 1, dx: 500, dz: 0, running: true, rotation: 0 });
    await eventually(() => errors.includes('Comando inválido.'));
    assert.equal(player.lastProcessedInput, 0);
    const beforeBurst=player.x;
    for(let seq=2;seq<=32;seq++)first.send('player.input',{seq,dx:1,dz:0,running:false,rotation:0});
    await eventually(()=>player.lastProcessedInput===32);
    assert.ok(player.x-beforeBurst<=0.175*7+0.001,'Packet bursts cannot increase per-tick movement or replay a long backlog');
    assert.equal(errors.length,1,'Congestion should not flood the UI with errors');
    first.send('chat.send', { text: 'Olá do teste real' });
    await eventually(() => received.includes('Olá do teste real'));
    const bob = authoritative!.state.players.get('bob')!;
    // Skins: chosen on arrival, switched live and seen by others; unknown ones are refused.
    assert.equal(player.skin, 'nathan');
    assert.equal(bob.skin, 'leandro');
    first.send('player.skin', { skin: 'rafael' });
    await eventually(() => second.state.players.get('alice').skin === 'rafael');
    first.send('player.skin', { skin: 'naoexiste' });
    await eventually(() => errors.length === 2);
    assert.equal(player.skin, 'rafael');
    player.x = -12; player.z = 8; bob.x = 12; bob.z = 8;
    await eventually(() => !second.state.players.has('alice') && !first.state.players.has('bob'));
    // In front of the blackjack table, within reach.
    player.x = BLACKJACK_TABLE.x - 0.6; player.z = BLACKJACK_TABLE.z + 1.6; bob.x = BLACKJACK_TABLE.x + 0.6; bob.z = BLACKJACK_TABLE.z + 1.6;
    await eventually(() => second.state.players.has('alice'));
    first.send('blackjack.join', { tableId: 'blackjack-1' });
    await eventually(() => first.state.tables.get('blackjack-1').seats.length === 1);
    second.send('blackjack.join', { tableId: 'blackjack-1' });
    await eventually(() => first.state.tables.get('blackjack-1').seats.length === 2);
    first.send('blackjack.start', { tableId: 'blackjack-1' });
    await eventually(() => first.state.tables.get('blackjack-1').phase !== 'waiting');
    const table = first.state.tables.get('blackjack-1');
    if (table.phase === 'playing') {
      assert.equal(table.dealerCards[1].rank, '?');
      assert.equal(table.dealerTotal, 0);
    }
    const originalSession = first.sessionId;
    let resumed = false;
    first.onReconnect(() => { resumed = true; });
    // Simulate a transport drop without consenting to leave.
    (authoritative!.clients.get(first.sessionId)!.ref as unknown as { terminate(): void }).terminate();
    await eventually(() => resumed, 8000);
    assert.equal(first.sessionId, originalSession);
    assert.equal(authoritative!.state.occupancy, 2);
    assert.equal(first.state.players.get('alice').connected, true);
  } finally {
    await Promise.allSettled(rooms.map(room => room.leave()));
    await server.gracefullyShutdown(false);
    await new Promise<void>(resolve => internal.close(() => resolve()));
    if (previousApi === undefined) delete process.env.API_INTERNAL_URL; else process.env.API_INTERNAL_URL = previousApi;
    if (previousCapacity === undefined) delete process.env.BAR_CAPACITY; else process.env.BAR_CAPACITY = previousCapacity;
  }
});
