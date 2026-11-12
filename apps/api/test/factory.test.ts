import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {internalSecret} from '@bar/shared/tickets';
import {createApi} from '../src/app.js';
import {readConfig} from '../src/config.js';
import {factoryLedger,factoryRuntime,factorySlots} from '../src/database/schema.js';
import stock from '../../server/data/factory/empresa_brasil_estoque.json' with {type:'json'};

test('estado da fábrica e 25 vagas persistem atomicamente e o requestId é idempotente',{timeout:120000},async t=>{
  const api=await createApi({config:{...readConfig(),dataPath:'memory://',databaseUrl:undefined,autoVerifyEmail:true},rateLimit:false,migrate:true});t.after(()=>api.app.close());
  const headers={'x-internal-secret':internalSecret()},requestId=randomUUID(),slots=stock.vagas.map((slot,index)=>({marker:slot.marcador,material:slot.tipo,quantity:index===0?18:0,capacity:slot.capacidade,levelM:slot.nivel_m,revision:7}));
  const save=(id=requestId,state:object={revision:7,emergency:false,tanks:[],dryer:{state:'PARADO'},bagging:{state:'PARADO'}})=>api.app.inject({method:'POST',url:'/api/internal/factory',headers,payload:{action:'save',actorId:'test',requestId:id,state,slots}});
  const first=await save();assert.equal(first.statusCode,200,first.body);assert.equal(first.json().applied,true);
  const replay=await save(requestId,{revision:999});assert.equal(replay.statusCode,200,replay.body);assert.equal(replay.json().applied,false);
  const view=(await api.app.inject({method:'POST',url:'/api/internal/factory',headers,payload:{action:'view'}})).json();assert.equal(view.slots.length,25);assert.equal(view.slots.find((slot:any)=>slot.marker===slots[0]!.marker).quantity,18);assert.equal(view.state.revision,7);
  assert.equal((await api.db.select().from(factoryLedger).where(eq(factoryLedger.requestId,requestId))).length,1);assert.equal((await api.db.select().from(factoryRuntime)).length,1);assert.equal((await api.db.select().from(factorySlots)).length,25);
  const invalid=slots.map((slot,index)=>index?slot:{...slot,quantity:19});assert.equal((await api.app.inject({method:'POST',url:'/api/internal/factory',headers,payload:{action:'save',actorId:'test',requestId:randomUUID(),state:{revision:8},slots:invalid}})).statusCode,400);

  const created=await api.app.inject({method:'POST',url:'/api/internal/factory',headers,payload:{action:'order.create',kind:'purchase',material:'MALTE',pallets:2,price:800,requestId:randomUUID()}});assert.equal(created.statusCode,200,created.body);const order=created.json().order;
  for(const material of ['ACO','ALUMINIO','POLIMERO','MOLAS'] as const){
    const ribeiro=await api.app.inject({method:'POST',url:'/api/internal/factory',headers,payload:{action:'order.create',kind:'ribeiro-purchase',material,pallets:1,price:0,requestId:randomUUID()}});
    assert.equal(ribeiro.statusCode,200,ribeiro.body);assert.equal(ribeiro.json().order.kind,'ribeiro-purchase');assert.equal(ribeiro.json().order.material,material);
  }
  const accepted=await api.app.inject({method:'POST',url:'/api/internal/factory',headers,payload:{action:'order.accept',id:order.id,userId:randomUUID(),requestId:randomUUID()}});assert.equal(accepted.statusCode,200,accepted.body);
  const ghostId=randomUUID(),delivered=await api.app.inject({method:'POST',url:'/api/internal/factory',headers,payload:{action:'order.ghost',id:order.id,requestId:ghostId}});assert.equal(delivered.statusCode,200,delivered.body);assert.equal(delivered.json().bags,36);
  assert.equal((await api.app.inject({method:'POST',url:'/api/internal/factory',headers,payload:{action:'order.ghost',id:order.id,requestId:ghostId}})).json().applied,false);
  const afterDelivery=(await api.app.inject({method:'POST',url:'/api/internal/factory',headers,payload:{action:'view'}})).json();assert.equal(afterDelivery.slots.filter((slot:any)=>slot.material==='MALTE').reduce((sum:number,slot:any)=>sum+slot.quantity,0),36);
});
