import assert from 'node:assert/strict';
import test from 'node:test';
import {RIBEIRO_ASSEMBLY,RIBEIRO_COMPUTER,RIBEIRO_CUTTERS,RIBEIRO_DOCK,RIBEIRO_DRILLS,RIBEIRO_MACHINING,RIBEIRO_NAME,RIBEIRO_PREP,RIBEIRO_RECIPES,RIBEIRO_STOCK,WEAPON_IDS} from '@bar/shared';

test('Ribeiro: coordenadas e catálogo industrial permanecem coerentes',()=>{
  assert.deepEqual([RIBEIRO_COMPUTER.x,RIBEIRO_COMPUTER.z,RIBEIRO_COMPUTER.rotation],[345.93,316.07,1.821]);
  assert.deepEqual([RIBEIRO_DOCK.x,RIBEIRO_DOCK.z,RIBEIRO_DOCK.rotation],[342.90,321.58,1.628]);
  assert.deepEqual([RIBEIRO_PREP.x,RIBEIRO_PREP.z,RIBEIRO_PREP.rotation],[350.49,320.32,1.566]);
  assert.deepEqual([RIBEIRO_STOCK.x,RIBEIRO_STOCK.z,RIBEIRO_STOCK.rotation],[339.48,314.65,-.060]);
  assert.equal(RIBEIRO_NAME,'Ribeiro Usinagem e Ferramentaria');
  assert.equal(RIBEIRO_CUTTERS.length,4);assert.equal(RIBEIRO_MACHINING.length,2);assert.equal(RIBEIRO_DRILLS.length,3);assert.equal(RIBEIRO_ASSEMBLY.length,3);
  assert.deepEqual(new Set(RIBEIRO_RECIPES.map(recipe=>recipe.weapon)),new Set(WEAPON_IDS));
  assert.ok(RIBEIRO_RECIPES.every(recipe=>Object.values(recipe.materials).every(quantity=>quantity>0)));
});
