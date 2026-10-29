import test from 'node:test';
import assert from 'node:assert/strict';
import { MAGRAO_SPOT, barClipMs } from '@bar/shared';
import { createNpcs } from '../src/world/npcs.js';
import { BarService } from '../src/world/bartender.js';

function run(service: BarService, waiting: (id: string) => boolean = () => true, start = 0, until = 40000) {
  const bartender = createNpcs().find(npc => npc.id === 'bartender')!;
  const states = new Set<string>();
  for (let now = start; now <= until; now += 50) {
    const served = service.update(bartender, waiting, now);
    assert.ok(Math.hypot(bartender.x - MAGRAO_SPOT.x, bartender.z - MAGRAO_SPOT.z) < 1e-6, 'Magrão stays at his place: the clips walk him');
    states.add(bartender.animationState);
    if (served) return { served, now, bartender, states };
  }
  return { served: undefined, now: until, bartender, states };
}

test('Magrão pours a chopp at the tap and the drink is served when the whole clip has played', () => {
  const service = new BarService();
  service.order('ana', 'copo');
  const { served, now, bartender, states } = run(service);
  assert.equal(served, 'ana');
  assert.deepEqual([...states], ['serve-chopp', 'idle']);
  assert.ok(now >= barClipMs('magrao_chopp') && now < barClipMs('magrao_chopp') + 100, 'The drink comes at the end of magrao_chopp');
  assert.equal(bartender.rotation, MAGRAO_SPOT.rotation, 'Facing the customers (+Z of Balcao_Lugar_Magrao)');
  assert.equal(bartender.animationState, 'idle');
});

test('a long neck comes from the freezer, with its own clip', () => {
  const service = new BarService();
  service.order('bia', 'garrafa');
  const { served, now, states } = run(service);
  assert.equal(served, 'bia');
  assert.ok(states.has('serve-longneck'));
  assert.ok(now >= barClipMs('magrao_longneck') && now < barClipMs('magrao_longneck') + 100);
});

test('orders are served one at a time and a cancelled order is dropped', () => {
  const service = new BarService();
  service.order('ana'); service.order('bia'); service.order('ana');
  assert.ok(service.has('ana') && service.has('bia'));
  service.cancel('ana');
  assert.equal(service.has('ana'), false);
  assert.equal(run(service).served, 'bia');
  assert.equal(run(service, () => true, 0, 2000).served, undefined, 'Nothing left to serve');
});

test('an order dropped once started is finished, and nobody gets it', () => {
  const service = new BarService();
  service.order('ana', 'copo');
  const bartender = createNpcs().find(npc => npc.id === 'bartender')!;
  service.update(bartender, () => true, 0);
  assert.equal(bartender.animationState, 'serve-chopp');
  service.cancel('ana');
  assert.equal(service.has('ana'), false);
  service.update(bartender, () => false, 5000);
  assert.equal(bartender.animationState, 'serve-chopp', 'He does not drop the glass halfway');
  assert.equal(service.update(bartender, () => false, barClipMs('magrao_chopp')), undefined);
  assert.equal(bartender.animationState, 'idle');
});
