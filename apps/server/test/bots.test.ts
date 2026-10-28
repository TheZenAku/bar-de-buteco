import test from 'node:test';
import assert from 'node:assert/strict';
import { BotRunner } from '../src/world/bots.js';

const runner = () => new BotRunner({ apiUrl: 'http://127.0.0.1:9', worldUrl: 'http://127.0.0.1:9', log: () => {}, settled: () => {} });

test('the administration can start the development bots, never in production', () => {
  assert.equal(runner().available, true, 'tests/load/bots.ts is there in development');
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const production = runner();
    assert.equal(production.available, false);
    assert.throws(() => production.set(5), /desenvolvimento/);
    assert.deepEqual(production.snapshot(), { available: false, running: false, target: 0, status: undefined });
  } finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
});
