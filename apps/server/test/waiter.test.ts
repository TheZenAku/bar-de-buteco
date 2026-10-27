import test from 'node:test';
import assert from 'node:assert/strict';
import { INTERACTABLES, isWalkable } from '@bar/shared';
import { createNpcs } from '../src/world/npcs.js';
import { WaiterService, publicOrder, type TableOrder } from '../src/world/waiter.js';

const seat = INTERACTABLES.find(i => i.type === 'seat' && Math.abs((i.y ?? 0) - .3) < .1)!;
const order = (playerId: string): TableOrder => ({ id: `order-${playerId}`, playerId, seatId: seat.id, items: ['coxinha'], total: 22, placedAt: 0, owner: { sessionId: 'secret-session', userId: playerId } });
const where = { x: seat.x, y: seat.y ?? .3, z: seat.z };

test('Tonico delivers at the table, one order per customer, and returns to his round', () => {
  const waiter = new WaiterService(), tonico = createNpcs().find(n => n.id === 'tonico')!;
  waiter.order(order('ana'));
  assert.throws(() => waiter.order(order('ana')), /já está/);
  let delivered: TableOrder | undefined;
  for (let now = 0; now < 120_000 && !delivered; now += 50) {
    delivered = waiter.update(tonico, () => where, now).delivered;
    assert.ok(isWalkable(tonico.x, tonico.z, tonico.y), 'Never through furniture or walls');
  }
  assert.equal(delivered?.playerId, 'ana');
  assert.ok(Math.hypot(tonico.x - seat.x, tonico.z - seat.z) < 1);
  for (let now = 120_000; now < 240_000 && tonico.behavior === 'serving'; now += 50) waiter.update(tonico, () => where, now);
  assert.equal(tonico.behavior, 'idle', 'Back to the wandering round');
  assert.ok(!('owner' in publicOrder(order('bia'))), 'The session never leaves the server');
});

test('a cancelled order in his hands sends Tonico back instead of freezing him', () => {
  const waiter = new WaiterService(), tonico = createNpcs().find(n => n.id === 'tonico')!;
  waiter.order(order('caio'));
  for (let now = 0; now < 2000; now += 50) waiter.update(tonico, () => where, now);
  assert.equal(tonico.behavior, 'serving');
  assert.deepEqual(waiter.cancel('caio').map(o => o.id), ['order-caio']);
  for (let now = 2000; now < 120_000 && tonico.behavior === 'serving'; now += 50) waiter.update(tonico, () => where, now);
  assert.equal(tonico.behavior, 'idle');
  assert.equal(waiter.pending, 0);
});

test('a customer who left the seat gets the order dropped (to be refunded)', () => {
  const waiter = new WaiterService(), tonico = createNpcs().find(n => n.id === 'tonico')!;
  waiter.order(order('dani'));
  const events = waiter.update(tonico, () => undefined, 0);
  assert.equal(events.dropped?.order.id, 'order-dani');
  assert.match(events.dropped!.reason, /devolvidas/);
});
