import test from 'node:test';
import assert from 'node:assert/strict';
import { AOI_RADIUS, CROWD, CROWD_RECORD, FULL_DETAIL_MAX, readCrowd } from '@bar/shared';
import { CrowdPlanner, type CrowdEntry } from '../src/world/crowd.js';

const entry = (n: number, x: number, z: number, extra: Partial<CrowdEntry> = {}): CrowdEntry => ({ id: `p${n}`, slot: n + 1, x, y: 0, z, rotation: 0, skin: n % 9, gait: 0, rider: false, noSprite: false, group: '', ...extra });
/** A deterministic scatter: `count` players over a square of `side` metres. */
const scatter = (count: number, side: number, seed = 1): CrowdEntry[] => {
  let s = seed; const random = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  return Array.from({ length: count }, (_, i) => entry(i, random() * side, random() * side));
};

test('a viewer holds at most FULL_DETAIL_MAX models, the nearest ones, and everybody else within the radius is a sprite', () => {
  const planner = new CrowdPlanner(), crowd = scatter(400, 60);
  planner.build(crowd, true);
  const viewer = crowd[0]!, models = planner.models(viewer, new Set());
  assert.ok(models.has(viewer.id));
  assert.ok(models.size <= FULL_DETAIL_MAX, `${models.size} models`);
  // Every model is inside the area of interest, and nobody nearer than the farthest model was left out.
  const near = crowd.filter(other => other !== viewer && Math.hypot(other.x - viewer.x, other.z - viewer.z) <= AOI_RADIUS).sort((a, b) => Math.hypot(a.x - viewer.x, a.z - viewer.z) - Math.hypot(b.x - viewer.x, b.z - viewer.z));
  assert.ok(near.length > FULL_DETAIL_MAX, 'the scene must be crowded for this test');
  for (const other of near.slice(0, FULL_DETAIL_MAX - 1)) assert.ok(models.has(other.id), `${other.id} is among the nearest`);
  const sprites = readCrowd(planner.sprites(viewer, models));
  assert.ok(sprites.length > 0 && sprites.length <= CROWD.max);
  const modelSlots = new Set(crowd.filter(player => models.has(player.id)).map(player => player.slot));
  assert.ok(sprites.every(record => !modelSlots.has(record.slot)), 'a model is not also a sprite');
  assert.ok(sprites.every(record => record.slot !== viewer.slot));
});

test('players already held stay held a little beyond the edge, and others have to be inside it to enter', () => {
  const planner = new CrowdPlanner(), viewer = entry(0, 0, 0), edge = entry(1, AOI_RADIUS + 1.5, 0);
  planner.build([viewer, edge], false);
  assert.ok(!planner.models(viewer, new Set()).has('p1'));
  assert.ok(planner.models(viewer, new Set(['p1'])).has('p1'));
  planner.build([viewer, entry(1, AOI_RADIUS * 1.4, 0)], false);
  assert.ok(!planner.models(viewer, new Set(['p1'])).has('p1'));
});

test('riders are models from anywhere, table mates are models whatever the distance in the crowd, and the seated have no sprite', () => {
  const planner = new CrowdPlanner();
  const viewer = entry(0, 0, 0, { group: 'table:1' }), rider = entry(1, 300, 300, { rider: true }), mate = entry(2, 10, 0, { group: 'table:1' }), seated = entry(3, 50, 0, { noSprite: true }), walker = entry(4, 60, 0);
  const crowd = [viewer, rider, mate, seated, walker, ...scatter(60, 18, 7).map((e, i) => ({ ...e, id: `n${i}`, slot: 100 + i }))];
  planner.build(crowd, true);
  const models = planner.models(viewer, new Set());
  assert.ok(models.has('p1') && models.has('p2'));
  const sprites = readCrowd(planner.sprites(viewer, models)).map(record => record.slot);
  assert.ok(!sprites.includes(seated.slot));
  assert.ok(sprites.includes(walker.slot));
});

test('records survive the wire: position to a decimetre, facing to 1.4 degrees, skin and gait', () => {
  const planner = new CrowdPlanner(), viewer = entry(0, 0, 0), far = entry(1, -57.34, 91.26, { rotation: -Math.PI / 2, skin: 4, gait: 2 });
  planner.build([viewer, far], true);
  const bytes = planner.sprites(viewer, new Set([viewer.id]));
  assert.equal(bytes.length, CROWD_RECORD);
  const [record] = readCrowd(bytes);
  assert.equal(record!.slot, far.slot); assert.equal(record!.skin, 4); assert.equal(record!.flags, 2);
  assert.ok(Math.abs(record!.x + 57.3) < .06 && Math.abs(record!.z - 91.3) < .06);
  assert.ok(Math.abs(Math.cos(record!.facing) - Math.cos(-Math.PI / 2)) < .03 && Math.abs(Math.sin(record!.facing) - Math.sin(-Math.PI / 2)) < .03);
});

test('a thousand players packed into the bar: planning every viewer fits well inside a tick', () => {
  const planner = new CrowdPlanner(), crowd = scatter(1000, 45, 3);
  const start = performance.now();
  planner.build(crowd, true);
  let sprites = 0, models = 0;
  for (const viewer of crowd) { const held = planner.models(viewer, new Set()); models += held.size; sprites += planner.sprites(viewer, held).length / CROWD_RECORD; }
  const ms = performance.now() - start;
  console.log(`1000 viewers in a 45 m square: ${ms.toFixed(0)} ms for the models (${(models / 1000).toFixed(1)} per viewer) and the sprites (${(sprites / 1000).toFixed(0)} per viewer)`);
  assert.ok(models / 1000 <= FULL_DETAIL_MAX && sprites / 1000 <= CROWD.max);
  // This runs 10 times a second (the sprites 3): a generous bound for a loaded machine.
  assert.ok(ms < 400, `${ms.toFixed(0)} ms`);
});
