import test from 'node:test';
import assert from 'node:assert/strict';
import {INTERACTABLES,SHOP_SPOT,canInteract,inStageArea,isWalkable,nearestInteraction} from '@bar/shared';

test('the house shop stands on the backyard floor and is used from its blip, not from a step away',()=>{
  const shop=INTERACTABLES.find(object=>object.id==='shop');
  assert.ok(shop&&shop.type==='shop');
  assert.ok(inStageArea(SHOP_SPOT),'in the backyard, where its blip shows');
  assert.ok(isWalkable(SHOP_SPOT.x,SHOP_SPOT.z,SHOP_SPOT.y),'on open floor');
  assert.equal(nearestInteraction(SHOP_SPOT)?.id,'shop');
  for(const [dx,dz] of [[.5,0],[0,-.5],[-.4,.4]])assert.ok(canInteract(shop,{x:SHOP_SPOT.x+dx,y:SHOP_SPOT.y,z:SHOP_SPOT.z+dz}),`on the ring ${dx},${dz}`);
  assert.equal(canInteract(shop,{x:SHOP_SPOT.x+1,y:SHOP_SPOT.y,z:SHOP_SPOT.z}),false,'a step off the ring');
});
