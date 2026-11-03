import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { Client as BrowserClient, type Room as ClientRoom } from '@colyseus/sdk';
import { HEAD_STRING, POOL_TABLES, SKINS, poolSpot, type PoolAimView, type PoolShotView, type PoolTableView } from '@bar/shared';
import { signTicket } from '@bar/shared/tickets';
import { BarRoom } from '../src/BarRoom.js';

async function eventually(check: () => boolean, timeout = 4000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Condition timed out');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

test('sinuca through real WebSocket clients: seats, the toss, the shooter\'s aim seen by the other, one stroke played identically for both (scenario 16)', { timeout: 60_000 }, async () => {
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
    else if (req.url === '/api/internal/pool/settle') { settled.push(body); res.end(JSON.stringify({ balance: 1000 + body.payout, applied: body.payout })); }
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
  const names: Record<string, string> = { ana: 'Ana', bia: 'Bia', caio: 'Caio' };
  const ticket = (userId: string) => signTicket({ userId, sessionId: `session-${userId}`, displayName: names[userId]!, role: 'user', color: '#aa8844' });
  try {
    const ana = await browser.joinOrCreate('bar', { ticket: ticket('ana') }); rooms.push(ana);
    const bia = await browser.joinOrCreate('bar', { ticket: ticket('bia') }); rooms.push(bia);
    const caio = await browser.joinOrCreate('bar', { ticket: ticket('caio') }); rooms.push(caio);
    const errors: Record<string, string[]> = { ana: [], bia: [], caio: [] }, views: Record<string, PoolTableView[]> = { ana: [], bia: [], caio: [] };
    const shots: Record<string, PoolShotView[]> = { ana: [], bia: [], caio: [] }, aims: Record<string, PoolAimView[]> = { ana: [], bia: [], caio: [] };
    const opened: Array<{ tableId: string; watching: boolean }> = [];
    for (const [name, client] of [['ana', ana], ['bia', bia], ['caio', caio]] as const) {
      client.onMessage('error', m => errors[name]!.push(m.message));
      client.onMessage('pool.view', v => views[name]!.push(v));
      client.onMessage('pool.shot', s => shots[name]!.push(s));
      client.onMessage('pool.aim', a => aims[name]!.push(a));
      client.onMessage('pool.open', m => opened.push(m));
      client.onMessage('chat.message', () => {});
    }
    await eventually(() => room!.state.players.size === 3);
    const place = POOL_TABLES[1]!, a = room!.state.players.get('ana')!, b = room!.state.players.get('bia')!, c = room!.state.players.get('caio')!;
    const last = (name: string) => views[name]!.at(-1);
    // Caio is downstairs: no views of the table come to him.
    Object.assign(c, { x: 12, y: 0, z: -1.6 });
    // Too far away first.
    ana.send('pool.join', { tableId: place.id });
    await eventually(() => errors.ana!.some(m => m.includes('Chegue mais perto')));
    // Both at the table's long sides, touching it.
    Object.assign(a, { x: place.x - .4, y: place.y, z: place.z - place.hz - .36 });
    Object.assign(b, { x: place.x + .4, y: place.y, z: place.z + place.hz + .36 });
    ana.send('player.interact', { objectId: place.id });
    await eventually(() => a.interactionState === `pool:${place.id}`);
    const spot = poolSpot(place, 0);
    assert.ok(Math.abs(a.x - spot.x) < 1e-3 && Math.abs(a.z - spot.z) < 1e-3, 'Ana stands at her side of the table');
    bia.send('pool.join', { tableId: place.id });
    await eventually(() => last('ana')?.seats.every(s => s.playerId) === true && last('bia')?.seats.every(s => s.playerId) === true);
    assert.deepEqual(opened.map(o => o.watching), [false, false]);
    assert.equal(views.caio!.length, 0, 'nothing for someone on another floor');
    // Only the host calls the house's player.
    bia.send('pool.cpu', { on: true });
    await eventually(() => errors.bia!.some(m => m.includes('Só quem abriu')));
    ana.send('pool.ready', { ready: true });
    bia.send('pool.ready', { ready: true });
    await eventually(() => last('ana')?.phase === 'choice' && last('bia')?.phase === 'choice');
    // Two people: the table's stake, from 400, taken from both wallets when both said yes.
    assert.deepEqual(wallet.map(w => [w.userId, w.amount, w.reason.split(':').slice(0, 2).join(':')]).sort(), [['ana', -400, 'pool:bet'], ['bia', -400, 'pool:bet']]);
    assert.equal(last('ana')!.stake, 400);
    const toss = last('ana')!.choice!, chooser = toss.seat === 0 ? ana : bia, other = toss.seat === 0 ? bia : ana;
    assert.equal(toss.kind, 'toss');
    other.send('pool.choice', { choice: 'break' });
    await eventually(() => errors[other === ana ? 'ana' : 'bia']!.some(m => m.includes('não é sua')));
    chooser.send('pool.choice', { choice: 'break' });
    await eventually(() => last('ana')?.phase === 'aim' && last('bia')?.phase === 'aim');
    const view = last('ana')!, shooterId = view.seats[view.turn]!.playerId, shooter = shooterId === 'ana' ? ana : bia, waiter = shooter === ana ? bia : ana;
    const waiterName = waiter === ana ? 'ana' : 'bia', shooterName = shooter === ana ? 'ana' : 'bia';
    assert.equal(view.placing, true, 'the break: the cue ball goes in the quadro');
    // Out of turn, and a cue ball outside the quadro, are refused.
    waiter.send('pool.shot', { shot: view.shot, angle: 0, power: 1, spinX: 0, spinY: 0, elevation: 0 });
    await eventually(() => errors[waiterName]!.some(m => m.includes('Não é a sua vez')));
    shooter.send('pool.shot', { shot: view.shot, angle: 0, power: 1, spinX: 0, spinY: 0, elevation: 0, cue: { x: .3, y: 0 } });
    await eventually(() => errors[shooterName]!.some(m => m.includes('quadro')));
    shooter.send('pool.shot', { shot: view.shot, angle: 0, power: 3, spinX: 0, spinY: 0, elevation: 0 });
    await eventually(() => errors[shooterName]!.includes('Comando inválido.'));
    // The shooter's aim reaches the other player.
    shooter.send('pool.aim', { angle: .02, power: .7, spinX: 0, spinY: -.2, elevation: 0, cue: { x: HEAD_STRING - .1, y: .04 } });
    await eventually(() => aims[waiterName]!.length > 0);
    assert.deepEqual(aims[waiterName]![0]!.cue, { x: HEAD_STRING - .1, y: .04 });
    assert.equal(aims[shooterName]!.length, 0, 'not echoed to the shooter');
    // Caio comes upstairs, near the table: he starts getting its views (the 3D balls).
    Object.assign(c, { x: place.x, y: place.y, z: place.z - 2.2 });
    await eventually(() => views.caio!.length > 0);
    // The break: one stroke, the same recorded paths for everyone, then the same table.
    shooter.send('pool.shot', { shot: view.shot, angle: .002, power: 1, spinX: 0, spinY: -.2, elevation: 0, cue: { x: HEAD_STRING - .1, y: .04 } });
    await eventually(() => shots.ana!.length === 1 && shots.bia!.length === 1 && shots.caio!.length === 1);
    assert.deepEqual(shots.ana![0], shots.bia![0]); assert.deepEqual(shots.ana![0], shots.caio![0]);
    assert.ok(shots.ana![0]!.tracks.length >= 10, 'the rack spread');
    await eventually(() => last('ana')?.phase !== 'rolling' && last('bia')?.phase !== 'rolling' && last('ana')?.revision === last('bia')?.revision, 25_000);
    const after = last('ana')!;
    assert.deepEqual(after, last('bia'));
    assert.equal(after.breaking, false);
    assert.equal(after.balls.length / 3 + after.pocketed.length, 16);
    assert.ok(after.feed.length >= 2);
    // A stale stroke counter is refused.
    const nowShooter = after.seats[after.turn]!.playerId === 'ana' ? ana : bia;
    if (after.phase === 'aim') {
      nowShooter.send('pool.shot', { shot: view.shot, angle: 1, power: .3, spinX: 0, spinY: 0, elevation: 0 });
      await eventually(() => errors[nowShooter === ana ? 'ana' : 'bia']!.some(m => m.includes('já passou')));
    }
    // Bia gives up: Ana wins the rack; Bia steps back from the table.
    bia.send('pool.leave', {});
    await eventually(() => last('ana')?.phase === 'finished');
    assert.equal(last('ana')!.seats[last('ana')!.winner]?.playerId, 'ana');
    assert.match(last('ana')!.reason, /desistiu/);
    // Ana is paid twice her part, once; Bia's walking off loses hers.
    await eventually(() => settled.length >= 1);
    assert.deepEqual(settled.map(x => [x.userId, x.payout, x.stakes.length]), [['ana', 800, 1]]);
    assert.equal(b.interactionState, '');
    assert.ok(Math.abs(b.z - place.z) > place.hz, 'Bia stands off the table');
    // E gets Ana up.
    ana.send('player.interact', { objectId: 'stand' });
    await eventually(() => a.interactionState === '');
  } finally {
    await Promise.allSettled(rooms.filter(r => r.connection?.isOpen).map(r => r.leave()));
    await server.gracefullyShutdown(false);
    await new Promise<void>(resolve => internal.close(() => resolve()));
    if (previousApi === undefined) delete process.env.API_INTERNAL_URL; else process.env.API_INTERNAL_URL = previousApi;
  }
});
