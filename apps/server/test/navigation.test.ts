import test from 'node:test';
import assert from 'node:assert/strict';
import { INTERACTABLES, PICKUP_POINT, isWalkable } from '@bar/shared';
import { findPath, PathFollower } from '../src/world/navigation.js';
import { createNpcs } from '../src/world/npcs.js';

const seats = INTERACTABLES.filter(i => i.type === 'seat');
const near = (goal: { x: number; y?: number; z: number }) => (p: { x: number; y: number; z: number }) => Math.hypot(p.x - goal.x, p.z - goal.z) < 0.9 && Math.abs(p.y - (goal.y ?? .3)) < .3;

test('Tonico finds a walkable path from the counter to tables on both floors, and follows it', () => {
  assert.ok(isWalkable(PICKUP_POINT.x, PICKUP_POINT.z, PICKUP_POINT.y), 'The pickup point is free floor');
  const ground = seats.filter(s => Math.abs((s.y ?? .3) - .3) < .1), upstairs = seats.filter(s => (s.y ?? 0) > 3);
  for (const seat of [ground[0]!, ground.at(-1)!, upstairs[0]!]) {
    const started = performance.now();
    const goal = { x: seat.x, y: seat.y ?? .3, z: seat.z };
    const path = findPath(PICKUP_POINT, near(goal), goal);
    const ms = performance.now() - started;
    assert.ok(path, `Path to ${seat.id}`);
    assert.ok(ms < 1500, `${seat.id} took ${ms.toFixed(0)} ms`);
    const tonico = createNpcs().find(npc => npc.id === 'tonico')!;
    Object.assign(tonico, PICKUP_POINT);
    const follower = new PathFollower(path);
    let ticks = 0;
    while (!follower.step(tonico) && ticks++ < 4000) assert.ok(isWalkable(tonico.x, tonico.z, tonico.y), 'Never through walls');
    assert.ok(near(goal)(tonico), `Tonico arrived at ${seat.id}`);
  }
});

test('an unreachable goal ends within the search budget', () => {
  const goal = { x: 500, y: .3, z: 500 };
  const started = performance.now();
  assert.equal(findPath(PICKUP_POINT, near(goal), goal, 4000), undefined);
  assert.ok(performance.now() - started < 3000);
});
