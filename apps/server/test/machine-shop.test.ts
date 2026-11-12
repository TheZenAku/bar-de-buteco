import assert from 'node:assert/strict';
import test from 'node:test';
import {RIBEIRO_RECIPES,RIBEIRO_STAGE_MS} from '@bar/shared';
import {MachineShop} from '../src/world/machine-shop.js';

test('Ribeiro executa preparação, corte, usinagem, furação, acabamento, montagem e estoque',()=>{
  const shop=new MachineShop(),recipe=RIBEIRO_RECIPES[0]!;
  for(const [material,quantity] of Object.entries(recipe.materials))shop.addMaterial(material as keyof typeof recipe.materials,quantity);
  assert.equal(shop.start(recipe.weapon,'player-1','Operador').ok,true);
  let carry=shop.interact('player-1','Operador','preparation',null).carry!;
  assert.equal(shop.challengeFor('cut-1',carry),'cut');
  let result=shop.interact('player-1','Operador','cut-1',carry);assert.equal(result.ok,true);assert.equal(result.carry,null);
  shop.tick(Date.now()+RIBEIRO_STAGE_MS.cut+10);carry=shop.interact('player-1','Operador','cut-1',null).carry!;
  assert.equal(shop.challengeFor('machine-1',carry),'machining');
  result=shop.interact('player-1','Operador','machine-1',carry);assert.equal(result.ok,true);
  shop.tick(Date.now()+RIBEIRO_STAGE_MS.machining+10);carry=shop.interact('player-1','Operador','machine-1',null).carry!;
  assert.equal(shop.challengeFor('drill-1',carry),'drill');
  result=shop.interact('player-1','Operador','drill-1',carry);assert.equal(result.ok,true);
  shop.tick(Date.now()+RIBEIRO_STAGE_MS.drill+10);assert.equal(shop.challengeFor('drill-1',null),'finish');carry=shop.interact('player-1','Operador','drill-1',null).carry!;
  assert.equal(carry.stage,'finished');
  result=shop.interact('player-1','Operador','assembly-1',carry);assert.equal(result.ok,true);
  shop.tick(Date.now()+RIBEIRO_STAGE_MS.assembly+10);
  assert.equal(shop.state.stock[recipe.weapon],1);assert.equal(shop.state.completed,1);assert.equal(shop.state.orders[0]?.status,'completed');
  assert.equal(shop.takeStock(recipe.weapon),true);assert.equal(shop.state.stock[recipe.weapon],0);assert.equal(shop.takeStock(recipe.weapon),false);
  shop.returnStock(recipe.weapon);assert.equal(shop.state.stock[recipe.weapon],1);
});
