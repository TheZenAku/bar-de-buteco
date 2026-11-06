import test from 'node:test';
import assert from 'node:assert/strict';
import {FIREWORK,MAP_COLLIDERS,fireworkFireSchema,fireworkFlightMs,fireworkOrigin,fireworkPosition,itemById,priceEntry,type FireworkShot} from '@bar/shared';

test('fireworks are shop items and only accept a finite unit direction',()=>{
  assert.equal(itemById('rojao')?.category,'fogo');
  assert.equal(priceEntry('item:rojao')?.defaultValue,35);
  for(const direction of [{x:0,y:1,z:0},{x:1,y:0,z:0},{x:0,y:0,z:-1}])assert.ok(fireworkFireSchema.safeParse({direction}).success);
  for(const direction of [{x:0,y:0,z:0},{x:0,y:2,z:0},{x:NaN,y:0,z:0},{x:Infinity,y:0,z:0}])assert.equal(fireworkFireSchema.safeParse({direction}).success,false);
  assert.equal(fireworkFireSchema.safeParse({direction:{x:0,y:1,z:0},origin:{x:100,y:100,z:100}}).success,false);
});

test('rockets stop at map solids and the ground, and freeze at the burst point',()=>{
  const origin={x:10000,y:20,z:10000},up={x:0,y:1,z:0};
  assert.equal(fireworkFlightMs(origin,up),FIREWORK.flightMs);
  const down={x:0,y:-1,z:0},groundMs=fireworkFlightMs(origin,down);
  assert.equal(groundMs,625);
  const shot:FireworkShot={id:'test',playerId:'player',launchedAt:0,origin,direction:down,flightMs:groundMs,hue:0};
  assert.equal(fireworkPosition(shot,10000).y,0);
  assert.deepEqual(fireworkPosition(shot,-10),origin);
  const hand=fireworkOrigin({x:100,y:0,z:100},0);
  assert.ok(hand.y===1.4&&hand.z>100&&hand.x>100);
  // Cross a real solid collider at its mid-height, starting just outside its bounding box.
  const wall=MAP_COLLIDERS.find(c=>(c.maxY??0)-(c.minY??0)>2&&c.hx>.5)!;
  assert.ok(wall);
  const from={x:wall.x-wall.hx-.5,y:((wall.minY??0)+(wall.maxY??0))/2,z:wall.z};
  assert.ok(fireworkFlightMs(from,{x:1,y:0,z:0})<FIREWORK.flightMs);
});
