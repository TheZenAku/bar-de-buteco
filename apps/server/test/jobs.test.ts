import test from 'node:test';
import assert from 'node:assert/strict';
import { JOBS, canInteract, floorHeight, handOverMs, isWalkable, stationInteractable, type ItemId, type JobStation } from '@bar/shared';
import { JobDirector } from '../src/world/jobs.js';

/** A free spot on the floor from which the station can be touched. */
export function besideStation(station: JobStation) {
  for (let r = .3; r < 1.6; r += .05) for (let a = 0; a < Math.PI * 2; a += Math.PI / 16) {
    const x = station.x + Math.sin(a) * r, z = station.z + Math.cos(a) * r, y = floorHeight(x, z, station.y);
    if (y !== undefined && isWalkable(x, z, y) && canInteract(stationInteractable(station), { x, y, z })) return { x, y, z };
  }
}

test('every job station can be reached on foot and touched', () => {
  for (const job of JOBS) for (const station of job.stations)
    assert.ok(besideStation(station), `${job.id}/${station.id} has no free spot to work from`);
});

test('a task pays once when held for its duration; idling ends the shift; slots, cooldown and administration apply', () => {
  const director = new JobDirector(), job = JOBS[0]!;
  const shift = director.start('ana', job.id, job.start, 0);
  assert.throws(() => director.start('ana', job.id, job.start, 0), /já está trabalhando/);
  for (const station of job.stations) {
    shift.task = { ...shift.task, station, startedAt: undefined, deadline: 1e12 };
    const task = director.begin('ana', besideStation(station)!, 1000);
    assert.equal(task.station.id, station.id);
    const events = director.tick(1000 + station.durationMs);
    assert.equal(events.filter(e => e.type === 'paid').length, 1, `${station.id} pays once`);
    assert.equal(director.tick(1000 + station.durationMs + 50).filter(e => e.type === 'paid').length, 0);
  }
  director.start('bia', job.id, job.start, 0);
  assert.throws(() => director.start('caio', job.id, job.start, 0), /vagas/);
  director.configure(job.id, { slots: 3 });
  director.start('caio', job.id, job.start, 0);
  const idle = director.tick(director.shift('caio')!.task.deadline);
  assert.ok(idle.some(e => e.type === 'ended' && e.playerId === 'caio'), 'idle worker loses the shift');
  assert.throws(() => director.start('caio', job.id, job.start, director.shift('ana')!.task.deadline), /Descanse/);
  director.configure(job.id, { enabled: false });
  director.stop('bia', 0);
  assert.throws(() => director.start('dani', job.id, job.start, 0), /fechadas/);
});

test('tables are handed out only while something finished waits on them, one worker per table', () => {
  const dirty = new Set<number>(), tables = { dirtyTables: () => [...dirty], isDirty: (t: number) => dirty.has(t) };
  const director = new JobDirector(tables), job = JOBS[0]!;
  for (let i = 0; i < 20; i++) {
    director.start(`clean-${i}`, job.id, job.start, 0);
    assert.equal(director.shift(`clean-${i}`)!.task.station.table, undefined, 'Nothing to clear: fridges and sink only');
    director.stop(`clean-${i}`, 0);
  }
  dirty.add(7); dirty.add(3);
  const ana = director.start('ana', job.id, job.start, 0), bia = director.start('bia', job.id, job.start, 0);
  assert.equal(ana.task.station.id, 'mesa-7', 'The table waiting longest first');
  assert.equal(bia.task.station.id, 'mesa-3', 'Never the table another worker is on');
  // Somebody else cleared it: Ana gets another task, with a fresh deadline and no shift lost.
  dirty.delete(7);
  const events = director.tick(30_000);
  assert.deepEqual(events, [{ type: 'changed', playerId: 'ana' }], 'Ana is told her task changed');
  assert.notEqual(director.shift('ana')!.task.station.id, 'mesa-7');
  assert.equal(director.shift('ana')!.task.deadline, 30_000 + job.taskTimeoutMs);
});

test('an order given to a worker comes first: picked up at the counter, then put on the customer\'s table; a shift ending hands it back', () => {
  const director = new JobDirector(), job = JOBS[0]!;
  director.start('ana', job.id, job.start, 0);
  const order = { id: 'o-1', playerId: 'caio', seatId: 'seat-1', items: ['coxinha', 'garrafa'] as ItemId[], total: 52, placedAt: 0, owner: { sessionId: 's', userId: 'caio' } };
  director.take('ana', order, 'Caio', 7, 0);
  let task = director.shift('ana')!.task;
  assert.equal(task.kind, 'pickup');
  assert.match(task.station.label, /Caio no balcão/);
  assert.equal(director.holder('caio')?.entry.picked, false);
  director.begin('ana', besideStation(task.station)!, 1000);
  let events = director.tick(1000 + task.station.durationMs);
  assert.equal(events[0]?.type === 'paid' && events[0].kind, 'pickup');
  assert.equal(director.holder('caio')?.entry.picked, true, 'On the tray now');
  task = director.shift('ana')!.task;
  assert.equal(task.kind, 'deliver');
  assert.equal(task.station.table, 7);
  assert.equal(task.station.durationMs, handOverMs(2));
  director.begin('ana', besideStation(task.station)!, 20_000);
  events = director.tick(20_000 + task.station.durationMs);
  assert.equal(events[0]?.type === 'paid' && events[0].kind, 'deliver');
  assert.equal(director.holder('caio'), undefined, 'Delivered');

  director.take('ana', { ...order, id: 'o-2' }, 'Caio', 7, 30_000);
  director.take('ana', { ...order, id: 'o-3', playerId: 'dani' }, 'Dani', 8, 30_000);
  assert.throws(() => director.take('ana', { ...order, id: 'o-4', playerId: 'eva' }, 'Eva', 9, 30_000), /pedidos demais/);
  assert.equal(director.drop('dani', 30_000)?.entry.order.id, 'o-3');
  const stopped = director.stop('ana', 31_000)!;
  assert.deepEqual(stopped.orders.map(o => o.order.id), ['o-2'], 'What was not delivered goes back to the room (to Tonico)');
});
