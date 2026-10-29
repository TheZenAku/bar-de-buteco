import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import map from '../../packages/shared/src/map-data.json';
import {BAR_ANIMATIONS,CLEANABLE_TABLES,INTERACTABLES,MAGRAO_SPOT,URINALS,barClipMs,barFrame,barTimeline,canInteract,cornerSpot,inFrame,isWalkable,
  nearestCorner,seatExit,standUpSpot,tableCorners,type BarClip} from '@bar/shared';

test('the bar animations are published as exported, with every clip the module plays and the places it looks up', () => {
  for (const {file, hash} of Object.values(BAR_ANIMATIONS.groups)) {
    const source = readFileSync(new URL(`../../assets-bar/map/BarBoteco/export/animacoes/${file}`, import.meta.url));
    const published = readFileSync(new URL(`../../apps/web/public/animacoes/${file}`, import.meta.url));
    assert.ok(source.equals(published), `${file} is served as exported`);
    assert.equal(createHash('sha256').update(published).digest('hex').slice(0, 12), hash);
  }
  // animacoes_bar.js GRUPO_DO_CLIPE.
  assert.deepEqual(Object.keys(BAR_ANIMATIONS.clips).sort(), ['andar_bebado_loop', 'andar_loop', 'cair', 'comer_comecar', 'comer_loop', 'comer_terminar', 'fumar_acender',
    'fumar_apagar', 'fumar_loop', 'levantar', 'levantar_chao', 'limpar_mesa', 'magrao_chopp', 'magrao_chopp_escuro', 'magrao_longneck', 'parado_loop', 'sentado_loop',
    'sentar', 'urinar', 'vomitar']);
  // Como conferir: about 124 chairs, 31 tables, 3 urinals and Magrão's place.
  assert.equal(map.seats.filter(seat => Number.isInteger(seat.chair)).length, 124);
  assert.equal(new Set(map.seats.filter(seat => Number.isInteger(seat.chair)).map(seat => seat.chair)).size, 124, 'one chair instance per seat');
  // The picnic tables' bench places have no chair to pull.
  assert.ok(map.seats.every(seat => Number.isInteger(seat.chair) !== !!seat.bench));
  assert.equal(CLEANABLE_TABLES.length, 31);
  assert.equal(URINALS.length, 3);
  assert.deepEqual([MAGRAO_SPOT.x, MAGRAO_SPOT.z], [18.4, -7.75]);
  assert.ok(BAR_ANIMATIONS.clips.magrao_chopp.duration > 13 && BAR_ANIMATIONS.clips.magrao_chopp.duration < 15, 'about 14 s per order');
});

test('getting up leaves the body beside its chair, on free floor for most seats', () => {
  const seats = INTERACTABLES.filter(i => i.type === 'seat' && !i.bench);
  // levantar ends 0.56 m to the side of the chair, facing the table as the chair does.
  for (const seat of seats) {
    const exit = seatExit(seat.id)!;
    assert.ok(Math.abs(Math.hypot(exit.x - seat.x, exit.z - seat.z) - .56) < .01, seat.id);
    assert.ok(Math.abs(exit.rotation - seat.rotation!) < 1e-6);
  }
  // Where the room stands them: on free floor, at most a few centimetres from where the clip leaves the body.
  for (const seat of seats) {
    const exit = seatExit(seat.id)!, spot = standUpSpot(seat.id);
    assert.ok(spot && isWalkable(spot.x, spot.z, spot.y), seat.id);
    assert.ok(Math.hypot(spot.x - exit.x, spot.z - exit.z) <= .1, `${seat.id}: ${Math.hypot(spot.x - exit.x, spot.z - exit.z).toFixed(2)} m`);
  }
});

test('the picnic tables\' benches seat six each, straight down from behind the bench and back out behind it', () => {
  const benches = INTERACTABLES.filter(i => i.type === 'seat' && i.bench);
  assert.equal(benches.length, 48);
  for (let number = 24; number <= 31; number++) {
    const table = map.tables.find(t => t.number === number)!, places = benches.filter(seat => seat.table === number);
    assert.equal(places.length, 6, `mesa ${number}`);
    for (const seat of places) {
      // On a bench's seat line, facing across the table.
      const facing = {x: Math.sin(seat.rotation!), z: Math.cos(seat.rotation!)}, toTable = {x: table.x - seat.x, z: table.z - seat.z};
      assert.ok(Math.abs(facing.x * toTable.x + facing.z * toTable.z - .62) < .01, `${seat.id} on the bench line, facing the table`);
      // Reached from behind the bench, on the floor, by a player clear of the table and its benches.
      const exit = seatExit(seat.id)!, spot = standUpSpot(seat.id)!;
      assert.ok(Math.abs(Math.hypot(exit.x - seat.x, exit.z - seat.z) - .55) < .01 && exit.rotation === seat.rotation, seat.id);
      assert.ok(isWalkable(spot.x, spot.z, spot.y) && Math.hypot(spot.x - exit.x, spot.z - exit.z) <= .1, `${seat.id} gets up on free floor`);
      assert.ok(canInteract(seat, spot), `${seat.id} reached from where its customer gets up`);
    }
  }
  // Sat straight into the seated loop (no chair to pull), and eating from there as at any table.
  const bench = {animation: 'sit', animationStartedAt: 1000, interactionState: benches[0]!.id, x: 0, z: 0};
  assert.deepEqual(barTimeline(bench, 1250), {clip: 'sentado_loop', time: .25, startedAt: 1000, blend: 0});
  assert.equal(barTimeline(bench, 3100, '', {startedAt: 3000, endedAt: 0})!.clip, 'comer_comecar');
  assert.equal(barFrame(bench)?.yaw, benches[0]!.rotation);
});

test('a table is cleared from its corner nearest to the worker, and every table has a corner on free floor', () => {
  for (const table of CLEANABLE_TABLES) {
    const corners = tableCorners(table).map(cornerSpot);
    assert.ok(corners.some(spot => isWalkable(spot.x, spot.z, spot.y)), `mesa ${table.number}`);
    for (const spot of corners) {
      assert.ok(Math.abs(Math.hypot(spot.x - table.anchor.x, spot.z - table.anchor.z) - .945) < .01, 'diagonal 0.67 m from the centre');
      // The worker faces the table's centre.
      const facing = Math.atan2(table.anchor.x - spot.x, table.anchor.z - spot.z);
      assert.ok(Math.abs(Math.atan2(Math.sin(facing - spot.rotation), Math.cos(facing - spot.rotation))) < .01);
      // From the corner spot, the frame found is that corner, and the room's barFrame finds it back.
      const frame = nearestCorner(table, spot);
      assert.ok(Math.hypot(cornerSpot(frame).x - spot.x, cornerSpot(frame).z - spot.z) < 1e-6);
      assert.ok(barFrame({animation: 'clean', x: spot.x, y: spot.y, z: spot.z}), `mesa ${table.number}`);
    }
  }
});

test('urinals are used standing at their spot, from the restroom only', () => {
  for (const urinal of URINALS) {
    const object = INTERACTABLES.find(i => i.id === urinal.id)!;
    assert.equal(object.type, 'urinal');
    assert.ok(isWalkable(urinal.x, urinal.z, urinal.y), `${urinal.id} stands on free floor`);
    assert.ok(canInteract(object, {x: urinal.x - .3, y: urinal.y, z: urinal.z}));
  }
});

test('the timeline: clips one after the other from the room\'s clock, loops repeat, steps out of a loop blend', () => {
  const ms = barClipMs;
  const seated = {animation: 'sit', animationStartedAt: 1000, interactionState: 'seat-1', x: 0, z: 0};
  assert.deepEqual(barTimeline(seated, 1500), {clip: 'sentar', time: .5, startedAt: 1000, blend: .3});
  const loop = barTimeline(seated, 1000 + ms('sentar') + ms('sentado_loop') + 250)!;
  assert.equal(loop.clip, 'sentado_loop'); assert.ok(Math.abs(loop.time - .25) < 1e-9, 'the loop repeats');
  // Blackjack seats keep the game's own card clips.
  assert.equal(barTimeline({...seated, currentTableId: 'blackjack-1'}, 9000), undefined);
  // Eating: from the food touching the table until it is finished, then back to the loop.
  const down = 1000 + ms('sentar'), meal = {startedAt: down + 2000, endedAt: 0};
  assert.equal(barTimeline(seated, down + 2100, '', meal)!.clip, 'comer_comecar');
  assert.equal(barTimeline(seated, down + 2000 + ms('comer_comecar') + 100, '', meal)!.clip, 'comer_loop');
  const ended = {...meal, endedAt: down + 20000};
  assert.deepEqual(barTimeline(seated, down + 20100, '', ended), {clip: 'comer_terminar', time: .1, startedAt: down + 20000, blend: .4});
  assert.deepEqual(barTimeline(seated, down + 20000 + ms('comer_terminar') + 100, '', ended), {clip: 'sentado_loop', time: .1, startedAt: down + 20000 + ms('comer_terminar'), blend: 0});
  // Getting up asked for while sitting down: still sitting down until then.
  const up = {...seated, animation: 'stand-up', animationStartedAt: down};
  assert.equal(barTimeline(up, 2000)!.clip, 'sentar');
  assert.deepEqual(barTimeline(up, down + 500), {clip: 'levantar', time: .5, startedAt: down, blend: .4});
  assert.equal(barTimeline(up, down + 60000)!.time, ms('levantar') / 1000, 'holds the last frame');
  // A cigarette: lit, then the loop; put out.
  const smoking = {animation: 'smoke', animationStartedAt: 0, x: 0, z: 0};
  assert.equal(barTimeline(smoking, 100)!.clip, 'fumar_acender');
  assert.equal(barTimeline(smoking, ms('fumar_acender') + 100)!.blend, 0, 'into the loop from the last frame');
  assert.equal(barTimeline({...smoking, animation: 'smoke-stop', animationStartedAt: ms('fumar_acender')}, 1000)!.clip, 'fumar_acender', 'put out once lit');
  // Falling holds; getting up from the floor follows the fall without a blend.
  assert.equal(barTimeline({animation: 'fallen', animationStartedAt: 0, x: 0, z: 0}, 60000)!.time, ms('cair') / 1000);
  assert.equal(barTimeline({animation: 'recover', animationStartedAt: 0, x: 0, z: 0}, 10)!.blend, 0);
  // Magrão's clips are his alone, at his place.
  assert.equal(barTimeline({animation: 'serve-longneck', animationStartedAt: 0, x: 0, z: 0}, 10, 'bartender')!.clip, 'magrao_longneck');
  assert.equal(barTimeline({animation: 'serve-longneck', animationStartedAt: 0, x: 0, z: 0}, 10), undefined);
  assert.deepEqual(barFrame({animation: 'serve-chopp', x: 0, z: 0}, 'bartender'), BAR_ANIMATIONS.counter.magrao);
  // Walking, idling and the game's other clips are not bar animations.
  for (const animation of ['idle', 'walk', 'drink', 'dance', 'toilet', 'use']) assert.equal(barTimeline({animation, animationStartedAt: 0, x: 0, z: 0}, 10), undefined);
});

test('inFrame turns a clip point by the place\'s yaw', () => {
  const p = inFrame({x: 1, y: .3, z: 2, yaw: Math.PI / 2}, {x: 0, z: 1, yaw: 0});
  assert.ok(Math.abs(p.x - 2) < 1e-9 && Math.abs(p.z - 2) < 1e-9 && p.rotation === Math.PI / 2, JSON.stringify(p));
});
