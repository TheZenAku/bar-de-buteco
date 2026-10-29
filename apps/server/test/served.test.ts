import test from 'node:test';
import assert from 'node:assert/strict';
import { MapSchema } from '@colyseus/schema';
import { CAFE_TABLES, INTERACTABLES, LEFTOVER_MS, SERVED_PROPS, SERVE_ITEM_MS, SERVE_LEAD_MS, consumeMs, type ItemId } from '@bar/shared';
import { ServedItem } from '../src/state.js';
import { ServedItems, layoutSpots } from '../src/world/served.js';

const seatsOf = (table: number) => INTERACTABLES.filter(i => i.type === 'seat' && i.table === table);
const [seat, neighbour] = seatsOf(7);
const table = CAFE_TABLES.find(t => t.number === 7)!;
const radius = (item: string) => SERVED_PROPS[item as ItemId]!.radius;

test('an order stands on the customer\'s side of the table top, clear of the number holder and of each other', () => {
  const items: ItemId[] = ['torresmo', 'garrafa', 'coxinha', 'agua'];
  const spots = layoutSpots(seat!, items, [], false, () => .5)!;
  assert.equal(spots.length, 4);
  spots.forEach((spot, i) => {
    const r = radius(items[i]!), x = spot.x - table.x, z = spot.z - table.z;
    assert.equal(spot.y, table.top, 'On the table top');
    assert.ok(Math.max(Math.abs(x), Math.abs(z)) + r <= .4, `${items[i]} inside the 0.83 m top`);
    assert.ok(Math.hypot(x, z) >= .1 + r, `${items[i]} clear of the number holder`);
    assert.ok(Math.hypot(spot.x - seat!.x, spot.z - seat!.z) < Math.hypot(spot.x - neighbour!.x, spot.z - neighbour!.z), `${items[i]} nearer its customer than the neighbour`);
    // The label faces the customer.
    const facing = Math.atan2(seat!.x - spot.x, seat!.z - spot.z);
    assert.ok(Math.abs(Math.atan2(Math.sin(spot.rotation - facing), Math.cos(spot.rotation - facing))) <= .25 + 1e-9);
    for (let j = 0; j < i; j++) assert.ok(Math.hypot(spot.x - spots[j]!.x, spot.z - spots[j]!.z) >= r + radius(items[j]!), `${items[i]} and ${items[j]} apart`);
  });
});

test('at a picnic table the order stands in front of its customer on the bench, on their half of the long top', () => {
  const picnic = CAFE_TABLES.find(t => t.number === 24)!, places = seatsOf(24);
  assert.equal(places.length, 6);
  const items: ItemId[] = ['torresmo', 'garrafa', 'coxinha', 'agua'];
  for (const customer of places) {
    const spots = layoutSpots(customer, items, [], false, () => .5)!;
    assert.equal(spots.length, 4, customer.id);
    // Table axes: towards the customer's bench, and along the benches.
    const ax = -Math.sin(customer.rotation!), az = -Math.cos(customer.rotation!);
    const side = (customer.x - picnic.x) * az - (customer.z - picnic.z) * ax;
    spots.forEach((spot, i) => {
      const r = radius(items[i]!), along = (spot.x - picnic.x) * ax + (spot.z - picnic.z) * az, across = (spot.x - picnic.x) * az - (spot.z - picnic.z) * ax;
      assert.equal(spot.y, picnic.top);
      assert.ok(along >= 0 && along + r <= .4 && Math.abs(across) + r <= .9, `${customer.id}: ${items[i]} on the 1.8 x 0.8 m top, on the customer's half`);
      assert.ok(Math.abs(across - side) <= .3 + 1e-9, `${customer.id}: ${items[i]} in front of the customer`);
      assert.ok(Math.hypot(along, across) >= .1 + r, 'clear of the number holder');
    });
  }
});

test('a full table makes room from what is finished first, never from what a seated neighbour is having', () => {
  const state = new MapSchema<ServedItem>(), served = new ServedItems(state);
  const seatedNow = new Set([`ana:${seat!.id}`, `bia:${neighbour!.id}`]);
  const seated = (playerId: string, seatId: string) => seatedNow.has(`${playerId}:${seatId}`);
  const order = (id: string, playerId: string, seatId: string, items: ItemId[]) => ({ id, playerId, seatId, items });
  const serve = (o: ReturnType<typeof order>, now: number) => { const plan = served.plan(o, seated)!; served.place(o, plan, now); return plan; };

  const bia = order('bia-1', 'bia', neighbour!.id, ['torresmo', 'copo']);
  serve(bia, 0);
  assert.equal(state.size, 2);
  const first = state.get('bia-1:0')!;
  assert.equal(first.table, 7);
  assert.equal(first.placedAt, SERVE_LEAD_MS + SERVE_ITEM_MS, 'Put down one after the other');
  assert.equal(state.get('bia-1:1')!.placedAt, SERVE_LEAD_MS + 2 * SERVE_ITEM_MS);

  // Ana orders until her side is full: her own oldest plates are taken away, Bia's stay.
  for (let i = 0; i < 6; i++) serve(order(`ana-${i}`, 'ana', seat!.id, ['torresmo', 'pastel', 'coxinha', 'refrigerante']), 1000 * (i + 1));
  assert.ok(state.has('bia-1:0') && state.has('bia-1:1'), 'A seated neighbour keeps what they are having');
  assert.ok(!state.has('ana-0:0'), 'The oldest of Ana\'s own plates made room');
  assert.ok(state.has('ana-5:0'));
});

test('a seated customer has each item over its time, and what is finished or left behind waits to be collected', () => {
  const state = new MapSchema<ServedItem>(), served = new ServedItems(state);
  const seatedNow = new Set([`ana:${seat!.id}`, `bia:${neighbour!.id}`]);
  const seated = (playerId: string, seatId: string) => seatedNow.has(`${playerId}:${seatId}`);
  const had = new Map<string, number>();
  const consume = (playerId: string, item: string, portion: number) => had.set(`${playerId}:${item}`, (had.get(`${playerId}:${item}`) ?? 0) + portion);
  for (const [id, playerId, seatId, items] of [['ana-1', 'ana', seat!.id, ['coxinha', 'garrafa']], ['bia-1', 'bia', neighbour!.id, ['torresmo']]] as const) {
    const o = { id, playerId, seatId, items: [...items] as ItemId[] };
    served.place(o, served.plan(o, seated)!, 0);
  }
  const down = SERVE_LEAD_MS + 3 * SERVE_ITEM_MS;
  for (let now = 0; now <= down + consumeMs('coxinha'); now += 1000) served.update(now, seated, consume);
  assert.ok(Math.abs(had.get('ana:coxinha')! - 1) < 1e-9, 'The whole coxinha, a little at a time');
  assert.ok(had.get('ana:garrafa')! > .3 && had.get('ana:garrafa')! < 1, 'The beer lasts longer');
  assert.ok(state.get('ana-1:0')!.doneAt > 0, 'The finished coxinha waits on the table');
  assert.equal(state.get('ana-1:1')!.doneAt, 0, 'The beer is still being had');
  assert.deepEqual(served.dirtyTables(), [7]);

  // Bia gets up halfway through her torresmo: the rest is left behind, and it waits to be collected too.
  seatedNow.delete(`bia:${neighbour!.id}`);
  served.update(down + consumeMs('coxinha') + 1, seated, consume);
  assert.ok(had.get('bia:torresmo')! < 1);
  assert.ok(state.get('bia-1:0')!.doneAt > 0);

  // Clearing the table takes everything finished; the beer Ana is still having stays.
  assert.equal(served.clearTable(7), 2);
  assert.deepEqual([...state.keys()], ['ana-1:1']);
  assert.equal(served.isDirty(7), false);
  assert.equal(served.takeOne(7), undefined, 'Nothing finished left to take');

  // Finished, it is Tonico's (one item at a time) or goes on its own after LEFTOVER_MS.
  seatedNow.clear();
  served.update(1_000_000, seated, consume);
  assert.equal(served.takeOne(7), 'garrafa');
  const o = { id: 'caio-1', playerId: 'caio', seatId: seat!.id, items: ['agua'] as ItemId[] };
  served.place(o, served.plan(o, seated)!, 2_000_000);
  served.update(2_000_000 + down, seated, consume);
  served.update(2_000_000 + down + LEFTOVER_MS, seated, consume);
  assert.equal(state.size, 0, 'Leftovers expire');
});

test('an order refunded while being put down leaves nothing behind', () => {
  const state = new MapSchema<ServedItem>(), served = new ServedItems(state);
  const o = { id: 'caio-1', playerId: 'caio', seatId: seat!.id, items: ['cafe', 'pastel'] as ItemId[] };
  served.place(o, served.plan(o, () => true)!, 0);
  assert.equal(state.size, 2);
  served.removeOrder('caio-1');
  assert.equal(state.size, 0);
  assert.equal(served.plan({ ...o, seatId: 'counter' }, () => true), undefined, 'Only seats have a table');
});
