import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {internalSecret} from '@bar/shared/tickets';
import {TRUCK_MODEL} from '@bar/shared';
import {createApi} from '../src/app.js';
import {readConfig} from '../src/config.js';
import {factoryLedger,factoryRuntime,factorySlots,playerVehicles,vehicleStorage,wallets} from '../src/database/schema.js';
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
  const accepted=await api.app.inject({method:'POST',url:'/api/internal/factory',headers,payload:{action:'order.accept',id:order.id,userId:randomUUID(),requestId:randomUUID()}});assert.equal(accepted.statusCode,200,accepted.body);
  const ghostId=randomUUID(),delivered=await api.app.inject({method:'POST',url:'/api/internal/factory',headers,payload:{action:'order.ghost',id:order.id,requestId:ghostId}});assert.equal(delivered.statusCode,200,delivered.body);assert.equal(delivered.json().bags,36);
  assert.equal((await api.app.inject({method:'POST',url:'/api/internal/factory',headers,payload:{action:'order.ghost',id:order.id,requestId:ghostId}})).json().applied,false);
  const afterDelivery=(await api.app.inject({method:'POST',url:'/api/internal/factory',headers,payload:{action:'view'}})).json();assert.equal(afterDelivery.slots.filter((slot:any)=>slot.material==='MALTE').reduce((sum:number,slot:any)=>sum+slot.quantity,0),36);

  const account=await api.app.inject({method:'POST',url:'/api/auth/register',payload:{username:'factory_driver',displayName:'Factory Driver',email:'driver@factory.test',password:'SenhaBoaDeTeste2026!'}}),userId=account.json().user.id as string,vehicleId=randomUUID();
  await api.db.insert(playerVehicles).values({id:vehicleId,plate:'FBR1A23',userId,model:TRUCK_MODEL,parts:'{}',mileage:0});await api.db.update(wallets).set({balance:0}).where(eq(wallets.userId,userId));
  const real=(await api.app.inject({method:'POST',url:'/api/internal/factory',headers,payload:{action:'order.create',kind:'purchase',material:'MIX',pallets:2,price:800,requestId:randomUUID()}})).json().order;await api.app.inject({method:'POST',url:'/api/internal/factory',headers,payload:{action:'order.accept',id:real.id,userId,requestId:randomUUID()}});
  const cargo=(stage:string,requestId=randomUUID())=>api.app.inject({method:'POST',url:'/api/internal/factory',headers,payload:{action:'order.cargo',orderId:real.id,userId,vehicleId,stage,requestId}});
  assert.equal((await cargo('load')).statusCode,200);assert.equal((await api.db.select().from(vehicleStorage).where(eq(vehicleStorage.vehicleId,vehicleId)))[0]?.quantity,36);
  const dockId=randomUUID();assert.equal((await cargo('dock',dockId)).statusCode,200);assert.equal((await cargo('dock',dockId)).json().applied,false);assert.equal((await api.db.select().from(vehicleStorage).where(eq(vehicleStorage.vehicleId,vehicleId))).length,0);assert.equal((await api.db.select().from(wallets).where(eq(wallets.userId,userId)))[0]?.balance,800);
});
