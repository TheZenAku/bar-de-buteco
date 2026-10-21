import test from 'node:test';
import assert from 'node:assert/strict';
import { EventDirector } from '../src/world/events.js';

test('events require occupancy, cannot overlap, have duration and avoid consecutive repetition', () => {
  const events = new EventDirector(1, 1, 0);
  assert.equal(events.update(1, 0), false);
  assert.equal(events.update(1, 2), true);
  const kind = events.current.kind;
  assert.throws(() => events.start('party', 2), /ativo/);
  assert.ok(events.current.endsAt >= 30_001 && events.current.endsAt <= 90_001);
  assert.equal(events.update(100_000, 2), true);
  assert.equal(events.current.kind, 'none');
  assert.equal(events.update(100_001, 2), true);
  assert.notEqual(events.current.kind, kind);
});
