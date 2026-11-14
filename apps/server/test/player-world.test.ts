import test from 'node:test';
import assert from 'node:assert/strict';
import { NEEDS, createNeeds } from '@bar/shared';
import { restoredNeeds } from '../src/world/needs.js';

const NOW = 1_000_000;

test('a saved character keeps its needs across a restart', () => {
  const saved = { ...createNeeds(NOW), hunger: 12, thirst: 40, bladder: 55, drunk: 3, hpCore: 7, condition: 'normal', faints: 2 };
  const back = restoredNeeds(JSON.parse(JSON.stringify(saved)), NOW + 60_000);
  assert.equal(back.hunger, 12);
  assert.equal(back.thirst, 40);
  assert.equal(back.bladder, 55);
  assert.equal(back.drunk, 3);
  assert.equal(back.hpCore, 7);
  assert.equal(back.faints, 2);
});

test('a missing or damaged save falls back to full needs field by field', () => {
  assert.deepEqual(restoredNeeds(null, NOW), createNeeds(NOW));
  const partial = restoredNeeds({ hunger: 'lots', thirst: Number.NaN, stamina: 30, bonuses: 'x' }, NOW);
  assert.equal(partial.hunger, NEEDS.hunger.max);
  assert.equal(partial.thirst, NEEDS.thirst.max);
  assert.equal(partial.stamina, 30);
  assert.deepEqual(partial.bonuses, []);
});

test('a saved death is revived, as respawning does', () => {
  const back = restoredNeeds({ ...createNeeds(NOW), dead: true, hp: 0, hpCore: 0, condition: 'fainted' }, NOW);
  assert.equal(back.dead, false);
  assert.equal(back.hp, NEEDS.hp.recoverTo);
  assert.equal(back.condition, 'normal');
});
