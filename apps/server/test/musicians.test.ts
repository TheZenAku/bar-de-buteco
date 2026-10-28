import test from 'node:test';
import assert from 'node:assert/strict';
import { MapSchema } from '@colyseus/schema';
import { MUSICIANS, STAGE_SPOTS, musicianPhase, phaseMs, stageSpot } from '@bar/shared';
import { MusicianSpot } from '../src/state.js';
import { Musicians } from '../src/world/musicians.js';

const spot = (id: string) => stageSpot(id)!;
const ms = (id: string, phase: 'entrando' | 'comecando' | 'loop' | 'saindo') => phaseMs(spot(id), phase);
const online = (ids: Iterable<string>) => { const set = new Set(ids); return (id: string) => set.has(id) ? true : undefined; };

test('every spot plays its four clips in order: take, start, loop until asked, stop, then the spot is free', () => {
  const state = new MapSchema<MusicianSpot>(), musicians = new Musicians(state);
  assert.deepEqual([...state.keys()].sort(), STAGE_SPOTS.map(s => s.id).sort(), 'one synced entry per spot of the map');
  assert.deepEqual(STAGE_SPOTS.map(s => s.id).sort(), ['bateria', 'cavaquinho', 'violao', 'vocal']);
  for (const { id } of STAGE_SPOTS) {
    const player = `player-${id}`, everyone = online([player]);
    musicians.start(id, player, 1000);
    assert.deepEqual(state.get(id)!.toJSON(), { id, playerId: player, phase: 'entrando', startedAt: 1000, stopping: false });
    // The take and start clips run into the next phase by themselves, at exact boundaries even with late ticks.
    const start = 1000 + ms(id, 'entrando'), loop = start + ms(id, 'comecando');
    musicians.update(start + 37, everyone);
    assert.deepEqual([state.get(id)!.phase, state.get(id)!.startedAt], ['comecando', start]);
    musicians.update(loop + 5000, everyone);
    assert.deepEqual([state.get(id)!.phase, state.get(id)!.startedAt], ['loop', loop], 'the loop repeats until a stop');
    assert.equal(musicians.stop(player, loop + 6000), true);
    assert.deepEqual([state.get(id)!.phase, state.get(id)!.startedAt], ['saindo', loop + 6000]);
    assert.deepEqual(musicians.update(loop + 6000 + ms(id, 'saindo') - 1, everyone), [], 'still putting the instrument back');
    assert.deepEqual(musicians.update(loop + 6000 + ms(id, 'saindo'), everyone), [{ playerId: player, spotId: id }]);
    assert.deepEqual(state.get(id)!.toJSON(), { id, playerId: '', phase: '', startedAt: 0, stopping: false }, 'free again');
  }
});

test('one musician per spot and one spot per musician', () => {
  const state = new MapSchema<MusicianSpot>(), musicians = new Musicians(state);
  musicians.start('violao', 'ana', 0);
  assert.throws(() => musicians.start('violao', 'bia', 10), /já tem músico/);
  assert.throws(() => musicians.start('bateria', 'ana', 10), /já está tocando/);
  assert.throws(() => musicians.start('triangulo', 'bia', 10), /não existe/);
  musicians.start('bateria', 'bia', 20);
  assert.equal(musicians.spotOf('bia')?.id, 'bateria');
  assert.equal(musicians.stop('caio', 30), false, 'stopping without playing does nothing');
});

test('a stop asked for before the loop follows the start clip at once, as everyone predicts it', () => {
  const state = new MapSchema<MusicianSpot>(), musicians = new Musicians(state), everyone = online(['ana']);
  musicians.start('vocal', 'ana', 0);
  musicians.stop('ana', 500);
  assert.deepEqual([state.get('vocal')!.phase, state.get('vocal')!.stopping], ['entrando', true], 'the take clip is not cut');
  const loop = ms('vocal', 'entrando') + ms('vocal', 'comecando');
  // A client derives the same thing from the synced state alone.
  assert.deepEqual(musicianPhase(state.get('vocal')!.toJSON() as never, loop + 10), { phase: 'saindo', startedAt: loop });
  musicians.update(loop + 10, everyone);
  assert.deepEqual([state.get('vocal')!.phase, state.get('vocal')!.startedAt], ['saindo', loop]);
  assert.deepEqual(musicians.update(loop + ms('vocal', 'saindo'), everyone), [{ playerId: 'ana', spotId: 'vocal' }]);
});

test('a dropped connection stops the show after the timeout; coming back in time keeps it; a vanished avatar frees the spot', () => {
  const state = new MapSchema<MusicianSpot>(), musicians = new Musicians(state, 2000);
  const connected = new Map([['ana', true], ['bia', true]]), status = (id: string) => connected.get(id);
  musicians.start('violao', 'ana', 0); musicians.start('cavaquinho', 'bia', 0);
  const loop = ms('violao', 'entrando') + ms('violao', 'comecando');
  musicians.update(loop, status);
  connected.set('ana', false); connected.set('bia', false);
  musicians.update(loop + 100, status);
  connected.set('bia', true);
  musicians.update(loop + 1500, status);
  connected.set('bia', false);
  musicians.update(loop + 2099, status);
  assert.equal(state.get('violao')!.phase, 'loop', 'within the timeout the musician keeps playing');
  musicians.update(loop + 2100, status);
  assert.deepEqual([state.get('violao')!.phase, state.get('violao')!.startedAt], ['saindo', loop + 2100], 'two seconds offline: the stop clip starts');
  assert.equal(state.get('cavaquinho')!.phase, 'loop', 'reconnecting reset the clock of the other one');
  assert.deepEqual(musicians.update(loop + 2100 + ms('violao', 'saindo'), status).map(end => end.spotId), ['violao']);
  connected.delete('bia');
  assert.deepEqual(musicians.update(loop + 9000, status), [{ playerId: 'bia', spotId: 'cavaquinho' }], 'an avatar that left the bar frees its spot at once');
  assert.equal(state.get('cavaquinho')!.playerId, '');
  assert.equal(MUSICIANS.dropMs, 10_000, 'the room\'s default timeout');
});

test('a fall frees the spot at once, without the stop clip', () => {
  const state = new MapSchema<MusicianSpot>(), musicians = new Musicians(state);
  musicians.start('bateria', 'ana', 0);
  assert.equal(musicians.release('ana'), true);
  assert.equal(state.get('bateria')!.playerId, '');
  assert.equal(musicians.release('ana'), false);
});
