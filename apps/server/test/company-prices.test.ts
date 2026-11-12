import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_FACTORY_BALANCE,DEFAULT_FACTORY_FINANCE,breakEvenPalletPrice,catalogProfits,factoryFinancePatchSchema,mergeFactoryFinance,purchaseQuote,type EstimateRules} from '@bar/shared/factory';

const rulesOf=(finance=DEFAULT_FACTORY_FINANCE):EstimateRules=>({rawMaltePrice:finance.rawMaltePrice,rawMixPrice:finance.rawMixPrice,palletPrice:finance.palletPrice,taxPercent:finance.taxPercent,employeeFee:finance.employeeFee,maxPalletsPerTruck:finance.maxPalletsPerTruck,bagKg:DEFAULT_FACTORY_BALANCE.bagKg,yieldMin:DEFAULT_FACTORY_BALANCE.recipe.yieldMin,yieldMax:DEFAULT_FACTORY_BALANCE.recipe.yieldMax});

test('a firma sem valores salvos usa os preços de matéria-prima e salário de presença padrão',()=>{
  const finance=mergeFactoryFinance({palletPrice:27360,taxPercent:20});
  assert.equal(finance.rawMaltePrice,30000);assert.equal(finance.rawMixPrice,20000);assert.equal(finance.idlePay,500);assert.equal(finance.idleEveryMin,30);
  assert.equal(finance.palletPrice,27360);
});
test('o preço da matéria-prima vem da finança e o imposto vai por cima',()=>{
  assert.deepEqual(purchaseQuote('MALTE',2,20,25000),{base:50000,tax:10000,total:60000});
  assert.deepEqual(purchaseQuote('MIX',1,15),{base:20000,tax:3000,total:23000});
});
test('a administração só aceita valores de dinheiro e intervalo válidos',()=>{
  assert.ok(factoryFinancePatchSchema.safeParse({rawMaltePrice:35000,rawMixPrice:0,idlePay:0,idleEveryMin:10}).success);
  assert.ok(!factoryFinancePatchSchema.safeParse({idleEveryMin:0}).success);
  assert.ok(!factoryFinancePatchSchema.safeParse({rawMaltePrice:-1}).success);
  assert.ok(!factoryFinancePatchSchema.safeParse({idlePay:1.5}).success);
});
test('com o palete a 27.360 e imposto de 20% toda OP do catálogo dá prejuízo (o caso que o dono viu)',()=>{
  const rows=catalogProfits(rulesOf({...DEFAULT_FACTORY_FINANCE,palletPrice:27360,taxPercent:20}));
  assert.equal(rows.length,8);
  assert.ok(rows.every(row=>row.estimate.profit.expected<0));
});
test('preço mínimo do palete: nenhuma OP perde dinheiro a partir dele e alguma perde logo abaixo',()=>{
  const base=rulesOf({...DEFAULT_FACTORY_FINANCE,taxPercent:20});
  const price=breakEvenPalletPrice(base);assert.ok(price&&price>27360&&price<60000,String(price));
  assert.ok(catalogProfits({...base,palletPrice:price}).every(row=>row.estimate.profit.expected>=0));
  assert.ok(catalogProfits({...base,palletPrice:price-500}).some(row=>row.estimate.profit.expected<0));
});
test('sem preço possível o mínimo é nulo (matéria-prima mais cara do que qualquer venda)',()=>{
  assert.equal(breakEvenPalletPrice({...rulesOf(),rawMaltePrice:1_000_000,rawMixPrice:1_000_000}),null);
});
