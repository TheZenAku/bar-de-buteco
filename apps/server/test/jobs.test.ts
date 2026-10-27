import test from 'node:test';
import assert from 'node:assert/strict';
import { JOBS, canInteract, floorHeight, isWalkable, stationInteractable, type JobStation } from '@bar/shared';
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
