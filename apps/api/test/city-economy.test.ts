import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createApi} from '../src/app.js';
import {readConfig} from '../src/config.js';
import {cityTreasury,cityTreasuryLedger,factoryShipments} from '../src/database/schema.js';
import {cityEconomy,VAULT_PAGE_SIZE,vaultSource} from '../src/admin-city-economy.js';
import {FactoryLogistics} from '../src/factory-logistics.js';
import {eq} from 'drizzle-orm';

test('o cofre da cidade: saldo, hoje, origens, série por dia e movimentos paginados',{timeout:120000},async t=>{
  const api=await createApi({config:{...readConfig(),dataPath:'memory://',databaseUrl:undefined,autoVerifyEmail:true},rateLimit:false,migrate:true});t.after(()=>api.app.close());
  const logistics=new FactoryLogistics(api.db);
  const empty=await cityEconomy(api.db,logistics,{days:30,page:0,flow:'all'});
  assert.equal(empty.vault.balance,0);assert.equal(empty.vault.ledger.total,0);assert.equal(empty.vault.series.length,30);assert.equal(empty.firm.today.sales,0);assert.equal(empty.firm.finance.taxPercent>=0,true);

  // The tax of a sale is written by the logistics (private); here the same rows are written directly, plus two real adjustments.
  let balance=0;
  for(let i=0;i<20;i++){balance+=700;await api.db.insert(cityTreasuryLedger).values({id:randomUUID(),amount:700,balanceAfter:balance,reason:`Imposto da venda ${i.toString(16).padStart(8,'0')}`,ref:randomUUID(),actorId:null});}
  await api.db.update(cityTreasury).set({balance}).where(eq(cityTreasury.id,'city'));
  await logistics.adjustTreasury(-1000,'Obra da praça','admin-1',randomUUID());
  await logistics.adjustTreasury(300,'Doação','admin-1',randomUUID());
  await assert.rejects(()=>logistics.adjustTreasury(-1_000_000,'além do saldo','admin-1',randomUUID()),/não tem esse valor/);

  const all=await cityEconomy(api.db,logistics,{days:7,page:0,flow:'all'});
  assert.equal(all.vault.balance,14000-1000+300);
  assert.deepEqual({in:all.vault.today.in,out:all.vault.today.out,count:all.vault.today.count},{in:14300,out:1000,count:22});
  assert.equal(all.vault.series.length,7);assert.equal(all.vault.series.at(-1)!.balance,13300);assert.equal(all.vault.series[0]!.balance,0);
  assert.deepEqual(all.vault.sources.map(source=>[source.source,source.in,source.out,source.count]),[['tax',14000,0,20],['admin',300,1000,2]]);
  assert.equal(all.vault.ledger.total,22);assert.equal(all.vault.ledger.rows.length,VAULT_PAGE_SIZE);
  assert.equal(all.vault.ledger.rows[0]!.reason,'Doação');assert.equal(all.vault.ledger.rows[0]!.source,'admin');assert.equal(all.vault.ledger.rows[0]!.balanceAfter,13300);

  const second=await cityEconomy(api.db,logistics,{days:7,page:1,flow:'all'});
  assert.equal(second.vault.ledger.rows.length,22-VAULT_PAGE_SIZE);assert.notEqual(second.vault.ledger.rows[0]!.id,all.vault.ledger.rows[0]!.id);
  const out=await cityEconomy(api.db,logistics,{days:7,page:0,flow:'out'});
  assert.equal(out.vault.ledger.total,1);assert.equal(out.vault.ledger.rows[0]!.amount,-1000);assert.equal(out.vault.ledger.rows[0]!.reason,'Obra da praça');
  // The firm's books: a sale counts the day it left the dock, its freight the day it arrived.
  const now=new Date(),row={vehicleId:'moto:1',driverId:'d1',material:'PRODUTO',pallets:5,bags:90};
  await api.db.insert(factoryShipments).values({...row,id:randomUUID(),kind:'sale',status:'delivered',gross:25000,tax:3750,staff:2000,ownerShare:19250,freight:1500,requestId:randomUUID(),departedAt:now,deliveredAt:now});
  await api.db.insert(factoryShipments).values({...row,id:randomUUID(),kind:'sale',status:'loaded',gross:0,requestId:randomUUID()});
  await api.db.insert(factoryShipments).values({...row,id:randomUUID(),kind:'purchase',status:'delivered',freight:900,requestId:randomUUID(),deliveredAt:now});
  const firm=(await cityEconomy(api.db,logistics,{days:7,page:0,flow:'all'})).firm;
  assert.deepEqual(firm.today,{sales:1,pallets:5,gross:25000,tax:3750,staff:2000,owner:19250,freight:2400});assert.deepEqual(firm.period,firm.today);
  assert.equal(firm.total.sales,1);assert.equal(firm.total.gross,25000);assert.equal(firm.series.at(-1)!.gross,25000);
  assert.deepEqual(firm.trips.active.map(trip=>trip.status),['loaded']);assert.equal(firm.trips.latest.length,2);
  assert.equal(vaultSource('Imposto da venda abc'),'tax');assert.equal(vaultSource('admin:x'),'admin');assert.equal(vaultSource('outra coisa'),'other');
});
