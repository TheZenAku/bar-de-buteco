import test from 'node:test';
import assert from 'node:assert/strict';
import { BARTEND_DURATION_MS, isWalkable, type Position } from '@bar/shared';
import { createNpcs } from '../src/world/npcs.js';
import { BarService, servingSpot } from '../src/world/bartender.js';

function run(service: BarService, customer: Position | undefined, start = 0, until = 30000) {
  const bartender = createNpcs().find(npc => npc.id === 'bartender')!;
  const states = new Set<string>();
  for (let now = start; now <= until; now += 50) {
    const served = service.update(bartender, () => customer, now);
    assert.ok(isWalkable(bartender.x, bartender.z, bartender.y), 'Seu Zé stays behind the counter, clear of furniture');
    states.add(bartender.animationState);
    if (served) return { served, now, bartender, states };
  }
  return { served: undefined, now: until, bartender, states };
}

test('Seu Zé walks behind the counter to face the customer, prepares the drink and then serves', () => {
  const customer = { x: 16.9, y: 0.3, z: -9.2 };
  const service = new BarService();
  service.order('ana');
  const spot = servingSpot(customer, 0.3);
  const { served, now, bartender, states } = run(service, customer);
  assert.equal(served, 'ana');
  assert.ok(Math.hypot(bartender.x - spot.x, bartender.z - spot.z) < 0.1, 'He stands across the counter from the customer');
  assert.ok(Math.abs(bartender.z - customer.z) < 0.1);
  assert.ok(Math.abs(Math.atan2(customer.x - bartender.x, customer.z - bartender.z) - bartender.rotation) < 0.01, 'Facing the customer');
  assert.ok(states.has('walk') && states.has('bartend'));
  assert.ok(now >= BARTEND_DURATION_MS, 'The drink comes only after the whole bartending clip');
  assert.equal(bartender.animationState, 'idle');
});

test('Seu Zé serves from where he is when the customer is out of his reach', () => {
  // Along the short leg of the L, where the freezers stand behind the counter.
  const customer = { x: 21.5, y: 0.3, z: -4.1 };
  const service = new BarService();
  service.order('bia');
  const { served, now, bartender } = run(service, customer);
  assert.equal(served, 'bia');
  assert.ok(now < 8000 + BARTEND_DURATION_MS + 100, 'He gives up walking instead of waiting forever');
  assert.ok(Math.abs(Math.atan2(customer.x - bartender.x, customer.z - bartender.z) - bartender.rotation) < 0.01);
});

test('orders are served one at a time and a cancelled order is dropped', () => {
  const service = new BarService();
  service.order('ana'); service.order('bia'); service.order('ana');
  assert.ok(service.has('ana') && service.has('bia'));
  service.cancel('ana');
  assert.equal(service.has('ana'), false);
  assert.equal(run(service, { x: 16.9, y: 0.3, z: -7.5 }).served, 'bia');
  assert.equal(run(service, { x: 16.9, y: 0.3, z: -7.5 }, 0, 2000).served, undefined, 'Nothing left to serve');
});
