import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { Client as BrowserClient, type Room as ClientRoom } from '@colyseus/sdk';
import { BLACKJACK_TABLE,SKINS,OLD_CANE_SPEED,TICK_MS } from '@bar/shared';
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
  const equipped:Record<string,string>={alice:'nathan',bob:'leandro'};
  const access=(userId:string)=>({valid:true,blocked:[],role:'user',balance:1000,equippedSkin:equipped[userId]??'nathan',ownedSkins:userId==='bob'?['nathan','leandro']:SKINS.map(s=>s.id)});
  const bets:Array<{userId:string;amount:number;reason:string}>=[];
  const internal = createServer(async (req, res) => {
    let data = '';
    for await (const chunk of req) data += chunk;
    const body = data ? JSON.parse(data) : {};
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/internal/validate') res.end(JSON.stringify({...access(body.userId),valid:body.sessionId===`session-${body.userId}`}));
    else if(req.url==='/api/internal/equip'){
      if(!access(body.userId).ownedSkins.includes(body.skin)){res.statusCode=403;res.end('{"error":"Skin não adquirida"}');}
      else {equipped[body.userId]=body.skin;res.end(JSON.stringify(access(body.userId)));}
    }
    else if (req.url === '/api/internal/controls') res.end('{"controls":[]}');
    else if (req.url === '/api/internal/wallet') { bets.push(body); res.end(JSON.stringify({ balance: 1000 + body.amount, applied: body.amount })); }
    else if (req.url === '/api/internal/blackjack/settle') res.end(JSON.stringify({ balance: 1000, applied: body.payout }));
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
    const second = await browser.joinOrCreate('bar', { ticket: ticket('bob'), skin: 'rafael' }); rooms.push(second);
    const secondErrors: string[] = [];
    second.onMessage('error', m => secondErrors.push(m.message));
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
    const savedSkin=bob.skin;
    second.send('chat.send',{text:'/velho'});
    await eventually(()=>first.state.players.get('bob').oldWalk===true);
    assert.equal(bob.skin,savedSkin);
    const slowX=bob.x;second.send('player.input',{seq:0,dx:1,dz:0,running:true,rotation:0});
    await eventually(()=>bob.lastProcessedInput===0);
    assert.ok(Math.abs(bob.x-slowX-OLD_CANE_SPEED*TICK_MS/1000)<1e-5);
    assert.equal(bob.animationState,'walk','Shift must not select running during the cane gait');
    assert.ok(!received.includes('/velho'),'Slash commands are interpreted by the server, not broadcast as chat text');
    second.send('chat.send',{text:'/velho'});await eventually(()=>first.state.players.get('bob').oldWalk===false);
    second.send('player.emote',{emote:'wave'});
    await eventually(()=>first.state.players.get('bob').animationState==='wave');
    assert.ok(bob.animationStartedAt>0,'The wave is visible and time-synchronized for other players');
    await eventually(()=>bob.animationState==='idle',2500);
    // Skins: chosen on arrival, switched live and seen by others; unknown ones are refused.
    assert.equal(player.skin, 'nathan');
    assert.equal(bob.skin, 'leandro', 'Arrival options cannot forge a paid skin');
    second.send('player.skin',{skin:'rafael'});
    await eventually(()=>secondErrors.length>0);
    assert.equal(bob.skin,'leandro','The server rejects skins absent from the account inventory');
    first.send('player.skin', { skin: 'rafael' });
    await eventually(() => second.state.players.get('alice').skin === 'rafael');
    first.send('player.skin', { skin: 'naoexiste' });
    await eventually(() => errors.length === 2);
    assert.equal(player.skin, 'rafael');
    second.send('player.emote', { emote: 'kick' });
    await eventually(() => secondErrors.includes('O golpe de karatê é exclusivo do Rafael.'));
    assert.notEqual(bob.animationState, 'kick');
    first.send('player.input', { seq: 33, dx: 1, dz: 0, running: false, rotation: 0 });
    first.send('player.emote', { emote: 'kick' });
    await eventually(() => second.state.players.get('alice').animationState === 'kick');
    assert.equal(player.interactionState, 'kick');
    assert.ok(player.animationStartedAt > 0);
    assert.equal(player.lastProcessedInput, 33, 'Kick acknowledges movement discarded from the input queue');
    const kickX = player.x;
    first.send('player.input', { seq: 34, dx: 1, dz: 0, running: true, rotation: 1 });
    first.send('player.interact', { objectId: 'stand' });
    first.send('blackjack.leave', {});
    first.send('player.emote', { emote: 'dance' });
    await eventually(() => player.lastProcessedInput === 34);
    assert.equal(player.x, kickX, 'Kick cannot move the authoritative character');
    assert.equal(player.animationState, 'kick', 'Other emotes cannot interrupt the kick');
    await eventually(() => player.animationState === 'idle');
    assert.equal(player.interactionState, '');
    assert.ok(Date.now() - player.animationStartedAt >= 2000);
    // G draws a new dance each time, and the others receive the draw to play the same clip.
    // Three emotes: with the kick below, four within the per-second limit.
    const draws: number[] = [];
    for (const emote of ['dance', 'idle', 'dance'] as const) {
      first.send('player.emote', { emote });
      await eventually(() => second.state.players.get('alice').animationState === emote);
      if (emote === 'dance') draws.push(second.state.players.get('alice').dance);
    }
    assert.equal(draws[1], player.dance, 'Everyone sees the dance drawn by the room');
    assert.notEqual(draws[0], draws[1], 'Each dance is drawn anew (1 in 65536 to repeat)');
    // Just onto the first stair flight (x 13.25–14.75, rising towards −z from z −11.65).
    player.x=14;player.y=.3;player.z=-11.75;
    first.send('player.input',{seq:35,dx:0,dz:-1,running:false,rotation:Math.PI});
    await eventually(()=>second.state.players.get('alice').y>.4);
    assert.ok(player.y<.6,'Stair height comes from the shared map support surface');
    player.x = -12; player.z = 8; bob.x = 12; bob.z = 8;
    await eventually(() => !second.state.players.has('alice') && !first.state.players.has('bob'));
    // Touching the front of the blackjack table.
    player.x = BLACKJACK_TABLE.x - 0.6; player.y=BLACKJACK_TABLE.y;player.z = BLACKJACK_TABLE.z + 0.85; bob.x = BLACKJACK_TABLE.x + 0.6;bob.y=BLACKJACK_TABLE.y;bob.z = BLACKJACK_TABLE.z + 0.85;
    await eventually(() => second.state.players.has('alice'));
    first.send('blackjack.join', { tableId: 'blackjack-1' });
    await eventually(() => first.state.tables.get('blackjack-1').seats.length === 1);
    const seatedErrors = errors.length;
    first.send('player.emote', { emote: 'kick' });
    await eventually(() => errors.length > seatedErrors);
    assert.equal(player.animationState, 'sit', 'Seated Rafael cannot kick');
    second.send('blackjack.join', { tableId: 'blackjack-1' });
    await eventually(() => first.state.tables.get('blackjack-1').seats.length === 2);
    // Both bet: the window closes at once, the coins are taken through the API, then the cards come.
    first.send('blackjack.bet', { amount: 5 });
    await eventually(() => errors.some(message => message.includes('de 10 a 500')));
    first.send('blackjack.bet', { amount: 20 });
    second.send('blackjack.bet', { amount: 10 });
    await eventually(() => first.state.tables.get('blackjack-1').dealerCards.length === 2, 6000);
    assert.deepEqual(bets.map(b => [b.userId, b.amount, b.reason.split(':').slice(0, 2).join(':')]).sort(), [['alice', -20, 'blackjack:bet'], ['bob', -10, 'blackjack:bet']]);
    const table = first.state.tables.get('blackjack-1');
    if (table.phase !== 'results') {
      assert.equal(table.dealerCards[1].rank, '?', 'The hole card is not in the synced state');
      assert.ok(table.dealerTotal <= 11, 'The total shown is the up card alone');
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
    // Leaving keeps the avatar in the bar; logging in again takes it over where it stood.
    await second.leave();
    await eventually(() => authoritative!.state.players.get('bob')?.connected === false);
    assert.equal(authoritative!.state.occupancy, 1);
    const bobBefore = { x: bob.x, y: bob.y, z: bob.z };
    const bobAgain = await browser.joinOrCreate('bar', { ticket: ticket('bob') }); rooms.push(bobAgain);
    await eventually(() => authoritative!.state.players.get('bob')?.connected === true);
    assert.equal(authoritative!.state.players.get('bob'), bob, 'Same avatar, not a new one');
    assert.deepEqual({ x: bob.x, y: bob.y, z: bob.z }, bobBefore);
    // A second login of a connected account takes over at once instead of being refused.
    let replaced = false;
    first.onLeave(() => { replaced = true; });
    await bobAgain.leave();
    // Another browser window: its own SDK client.
    const takeover = await new BrowserClient(url).joinOrCreate('bar', { ticket: ticket('alice') }); rooms.push(takeover);
    await eventually(() => replaced && takeover.state?.players?.get('alice')?.connected === true);
    assert.equal(authoritative!.state.players.get('alice'), player);
    assert.equal(player.currentTableId, '', 'Blackjack needs a present player; the avatar stands up');
    assert.equal(authoritative!.state.occupancy, 1);
    // A development bot (tests/load/bots.ts) takes its avatar with it when it leaves.
    const bot = await browser.joinOrCreate('bar', { ticket: signTicket({ userId: 'bot', sessionId: 'session-bot', displayName: 'Bot Zeca', role: 'user', color: '#aa8844', bot: true }) }); rooms.push(bot);
    await eventually(() => authoritative!.state.players.get('bot')?.connected === true);
    await bot.leave();
    await eventually(() => !authoritative!.state.players.has('bot'));
    assert.equal(authoritative!.state.occupancy, 1);
  } finally {
    await Promise.allSettled(rooms.filter(room=>room.connection?.isOpen).map(room => room.leave()));
    await server.gracefullyShutdown(false);
    await new Promise<void>(resolve => internal.close(() => resolve()));
    if (previousApi === undefined) delete process.env.API_INTERNAL_URL; else process.env.API_INTERNAL_URL = previousApi;
    if (previousCapacity === undefined) delete process.env.BAR_CAPACITY; else process.env.BAR_CAPACITY = previousCapacity;
  }
});
