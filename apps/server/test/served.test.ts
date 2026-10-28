import test from 'node:test';
import assert from 'node:assert/strict';
import { MapSchema } from '@colyseus/schema';
import { CAFE_TABLES, INTERACTABLES, LEFTOVER_MS, SERVED_PROPS, SERVE_ITEM_MS, SERVE_LEAD_MS, type ItemId } from '@bar/shared';
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

test('a full table makes room from leftovers first, never from a seated neighbour; leftovers expire and the helper wipes them', () => {
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

  // Bia gets up: her items stay, then go after LEFTOVER_MS, unless the helper wipes the table before.
  seatedNow.delete(`bia:${neighbour!.id}`);
  served.update(10_000, seated);
  assert.ok(state.has('bia-1:0'), 'Still there right after she got up');
  served.update(10_000 + LEFTOVER_MS - 1, seated);
  assert.ok(state.has('bia-1:0'));
  assert.equal(served.clearTable(7, seated), 2, 'Wiping the table takes her leftovers');
  assert.ok([...state.keys()].every(id => id.startsWith('ana-')), 'Ana still has hers');
  seatedNow.clear();
  served.update(20_000, seated);
  served.update(20_000 + LEFTOVER_MS, seated);
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
