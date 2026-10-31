import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { Client as BrowserClient, type Room as ClientRoom } from '@colyseus/sdk';
import { FOOSBALL_TABLES, SKINS, foosballSpot, type FoosballFrame } from '@bar/shared';
import { signTicket } from '@bar/shared/tickets';
import { BarRoom } from '../src/BarRoom.js';

async function eventually(check: () => boolean, timeout = 4000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Condition timed out');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

test('pebolim through real WebSocket clients: places, stakes through the API, frames, kicks and a W.O. paid once', { timeout: 30_000 }, async () => {
  const previousApi = process.env.API_INTERNAL_URL;
  const wallet: Array<{ userId: string; amount: number; reason: string }> = [], settled: Array<{ userId: string; payout: number; stakes: string[] }> = [];
  const internal = createServer(async (req, res) => {
    let data = '';
    for await (const chunk of req) data += chunk;
    const body = data ? JSON.parse(data) : {};
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/internal/validate') res.end(JSON.stringify({ valid: body.sessionId === `session-${body.userId}`, blocked: [], role: 'user', balance: 1000, equippedSkin: 'nathan', ownedSkins: SKINS.map(s => s.id) }));
    else if (req.url === '/api/internal/controls') res.end('{"controls":[]}');
    else if (req.url === '/api/internal/wallet') { wallet.push(body); res.end(JSON.stringify({ balance: 1000 + body.amount, applied: body.amount })); }
    else if (req.url === '/api/internal/foosball/settle') { settled.push(body); res.end(JSON.stringify({ balance: 1000 + body.payout, applied: body.payout })); }
    else res.end('{"ok":true}');
  });
  await new Promise<void>(resolve => internal.listen(0, '127.0.0.1', resolve));
  process.env.API_INTERNAL_URL = `http://127.0.0.1:${(internal.address() as AddressInfo).port}`;
  const http = createServer();
  const server = new Server({ transport: new WebSocketTransport({ server: http }), greet: false, gracefullyShutdown: false });
  let room: BarRoom | undefined;
  server.define('bar', BarRoom).on('create', created => { room = created as BarRoom; });
  await server.listen(0, '127.0.0.1');
  const browser = new BrowserClient(`http://127.0.0.1:${(http.address() as AddressInfo).port}`);
  const rooms: ClientRoom[] = [];
  const ticket = (userId: string) => signTicket({ userId, sessionId: `session-${userId}`, displayName: userId === 'ana' ? 'Ana' : 'Bia', role: 'user', color: '#aa8844' });
  try {
    const ana = await browser.joinOrCreate('bar', { ticket: ticket('ana') }); rooms.push(ana);
    const bia = await browser.joinOrCreate('bar', { ticket: ticket('bia') }); rooms.push(bia);
    const errors: Record<string, string[]> = { ana: [], bia: [] }, frames: Record<string, FoosballFrame[]> = { ana: [], bia: [] }, opened: Array<{ tableId: string; watching: boolean }> = [];
    for (const [name, client] of [['ana', ana], ['bia', bia]] as const) {
      client.onMessage('error', m => errors[name]!.push(m.message));
      client.onMessage('foosball.frame', f => frames[name]!.push(f));
      client.onMessage('foosball.open', m => opened.push(m));
      client.onMessage('chat.message', () => {});
    }
    await eventually(() => room!.state.players.size === 2);
    const place = FOOSBALL_TABLES[0]!, a = room!.state.players.get('ana')!, b = room!.state.players.get('bia')!;
    // Too far away first.
    ana.send('foosball.join', { tableId: place.id });
    await eventually(() => errors.ana!.some(m => m.includes('Chegue mais perto')));
    // Both on the room's side of the table, touching it.
    Object.assign(a, { x: place.x - .3, y: place.y, z: place.z - place.hz - .37 });
    Object.assign(b, { x: place.x + .3, y: place.y, z: place.z - place.hz - .37 });
    ana.send('player.interact', { objectId: place.id });
    await eventually(() => a.interactionState === `foosball:${place.id}`);
    const red = foosballSpot(place, 'red', 'solo');
    assert.ok(Math.abs(a.x - red.x) < 1e-3 && Math.abs(a.z - red.z) < 1e-3, 'Ana stands at the red handles, on the window side');
    bia.send('foosball.join', { tableId: place.id });
    await eventually(() => ana.state.foosball.get(place.id).slots.filter((s: { playerId: string }) => s.playerId).length === 2);
    assert.deepEqual(opened.map(o => o.watching), [false, false]);
    assert.equal(ana.state.foosball.get(place.id).hostId, 'ana');
    // The host puts coins on it; below the table's minimum is refused, and only the host decides.
    bia.send('foosball.config', { goals: 3 });
    await eventually(() => errors.bia!.some(m => m.includes('Só quem abriu')));
    ana.send('foosball.config', { stake: 5 });
    await eventually(() => errors.ana!.some(m => m.includes('de 10 a 500')));
    ana.send('foosball.config', { stake: 50, goals: 3 });
    await eventually(() => ana.state.foosball.get(place.id).stake === 50);
    ana.send('foosball.ready', { ready: true });
    bia.send('foosball.ready', { ready: true });
    await eventually(() => ana.state.foosball.get(place.id).phase === 'kickoff');
    assert.deepEqual(wallet.map(w => [w.userId, w.amount, w.reason.split(':').slice(0, 2).join(':')]).sort(), [['ana', -50, 'foosball:bet'], ['bia', -50, 'foosball:bet']]);
    // Frames come to both players, 30 a second, with the ball at the serve.
    await eventually(() => frames.ana!.length > 10 && frames.bia!.length > 10);
    const span = frames.ana!.at(-1)!.t - frames.ana!.at(-11)!.t;
    assert.ok(span > 220 && span < 600, `about 30 frames a second (${span} ms for 10)`);
    // The pointer moves the rods; a kick is taken; a malformed one is refused.
    ana.send('foosball.input', { y: .2, lift: false });
    ana.send('foosball.kick', { power: .8 });
    ana.send('foosball.kick', { power: 9 });
    await eventually(() => errors.ana!.includes('Comando inválido.'));
    await eventually(() => (frames.ana!.at(-1)?.r[3 * 2] ?? 0) !== 0, 2000);
    // Bia walks off mid-match: with coins on it, a W.O.; Ana is paid twice her part, once.
    bia.send('foosball.leave', {});
    await eventually(() => ana.state.foosball.get(place.id).phase === 'finished');
    assert.equal(ana.state.foosball.get(place.id).winner, 'red');
    assert.equal(b.interactionState, '');
    assert.ok(Math.abs(b.z - (place.z - place.hz - .4)) < .05, 'Bia steps out on the room side');
    await eventually(() => settled.length >= 1);
    assert.deepEqual(settled.map(s => [s.userId, s.payout, s.stakes.length]), [['ana', 100, 1]]);
    // E at the table, mid-lobby, gets Ana up.
    await eventually(() => ana.state.foosball.get(place.id).phase === 'lobby', 12_000);
    ana.send('player.interact', { objectId: 'stand' });
    await eventually(() => a.interactionState === '');
  } finally {
    await Promise.allSettled(rooms.filter(r => r.connection?.isOpen).map(r => r.leave()));
    await server.gracefullyShutdown(false);
    await new Promise<void>(resolve => internal.close(() => resolve()));
    if (previousApi === undefined) delete process.env.API_INTERNAL_URL; else process.env.API_INTERNAL_URL = previousApi;
  }
});
