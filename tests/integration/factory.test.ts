import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_FACTORY_BALANCE,addIngredient,batchYield,calculateBatchQuality,emptyDryer,emptyTank,interpolateCubicage,isInsideWorkWindow,productBags,tickDryer,tickTank,type DryerRuntime,type TankRuntime} from '@bar/shared/factory';
import tanks from '../../apps/server/data/factory/empresa_brasil_tanques.json' with {type:'json'};

const table=tanks.tabela.map(([heightM,radiusM,volumeL])=>({heightM,radiusM,volumeL}));

test('a cubicagem interpola bordas e o volume da receita',()=>{
  assert.deepEqual(interpolateCubicage(0,table),{heightM:0,radiusM:0,volumeL:0});
  assert.equal(interpolateCubicage(6646.6,table).heightM,2.035);
  const recipe=interpolateCubicage(1395,table);assert.ok(recipe.heightM>.6&&recipe.heightM<.61);
  assert.equal(interpolateCubicage(99999,table).volumeL,6646.6);
});

test('tanque exige água, tampa e agitador e respeita a ordem da receita',()=>{
  const empty=emptyTank(1);
  assert.throws(()=>addIngredient(empty,'MALTE'),/tampa/i);
  let tank:TankRuntime={...empty,state:'AGUARDANDO_INSUMOS',waterL:1200,lidOpen:true,agitatorRpm:120};
  tank=addIngredient(tank,'MIX');assert.equal(tank.mixBags,1);assert.ok(tank.quality<100);assert.ok(tank.penalties.includes('mix_fora_de_ordem'));
  for(let i=0;i<8;i++)tank=addIngredient(tank,'MALTE');
  assert.equal(tank.malteBags,8);
});

test('tanque e secador avançam por dt real e escala configurável',()=>{
  let tank:TankRuntime={...emptyTank(2),state:'DISSOLVENDO',agitatorRpm:120};
  tank=tickTank(tank,89);assert.equal(tank.state,'DISSOLVENDO');tank=tickTank(tank,1);assert.equal(tank.state,'HOMOGENEIZANDO');
  tank=tickTank(tank,60);assert.equal(tank.state,'AGUARDANDO_QUALIDADE');
  let dryer:DryerRuntime={...emptyDryer(),state:'PRE_AQUECENDO'};
  dryer=tickDryer(dryer,180);assert.equal(dryer.state,'PRONTO');assert.ok(dryer.inletC>=180);
});

test('qualidade controla rendimento e sacos inteiros',()=>{
  assert.equal(calculateBatchQuality({waterL:1200,temperatureC:65,penalties:[]}),100);
  assert.equal(batchYield(100),DEFAULT_FACTORY_BALANCE.recipe.yieldMax);
  assert.equal(productBags(300,100),11);
  assert.ok(calculateBatchQuality({waterL:900,temperatureC:80,penalties:['grumos']})<70);
});

test('janela de trabalho cobre virada de dia no fuso de São Paulo',()=>{
  const overnight={days:[1],startMinute:22*60,endMinute:6*60,timeZone:'America/Sao_Paulo'};
  assert.equal(isInsideWorkWindow(new Date('2026-11-10T04:00:00Z'),overnight),true);// terça 01h, turno de segunda
  assert.equal(isInsideWorkWindow(new Date('2026-11-10T12:00:00Z'),overnight),false);
});
