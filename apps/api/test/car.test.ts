import test from 'node:test';import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';import {eq} from 'drizzle-orm';
import {CAR_MODEL,CAR_NAME,NEW_CAR_PARTS,readCarParts,writeCarParts} from '@bar/shared';import {internalSecret} from '@bar/shared/tickets';
import {createApi} from '../src/app.js';import {readConfig} from '../src/config.js';
import {currencyLedger,playerVehicles,sessions,wallets} from '../src/database/schema.js';

test('cars are sold once for their configured price; colour, keys, parts and mileage persist and follow a trade',{timeout:60000},async t=>{
  const api=await createApi({config:{...readConfig(),dataPath:'memory://',databaseUrl:undefined,autoVerifyEmail:true},rateLimit:false,migrate:true});t.after(()=>api.app.close());
  const internal={'x-internal-secret':internalSecret()};
  async function account(name:string){
    const registered=await api.app.inject({method:'POST',url:'/api/auth/register',payload:{username:name,displayName:name,email:`${name}@car.test`,password:'SenhaBoaDeTeste2026!'}});assert.equal(registered.statusCode,201,registered.body);
    const userId=registered.json().user.id as string,cookie=`${registered.cookies[0]!.name}=${registered.cookies[0]!.value}`;
    await api.app.inject({method:'GET',url:'/api/inventory',headers:{cookie}});await api.db.update(wallets).set({balance:100000}).where(eq(wallets.userId,userId));
    const [session]=await api.db.select().from(sessions).where(eq(sessions.userId,userId));return {userId,cookie,sessionId:session!.id};
  }
  const a=await account('car_owner'),b=await account('car_other'),headers={cookie:a.cookie},requestId=randomUUID();
  const catalogue=(await api.app.inject({method:'GET',url:'/api/vehicles',headers})).json();assert.equal(catalogue.models.find((m:any)=>m.model===CAR_MODEL).seats,4);
  const payload={requestId,model:CAR_MODEL,color:'#ad173c'},buy=()=>api.app.inject({method:'POST',url:'/api/vehicles/buy',headers,payload});
  const responses=await Promise.all([buy(),buy(),buy()]);for(const response of responses)assert.equal(response.statusCode,200,response.body);
  const car=responses.at(-1)!.json().vehicles[0];assert.equal(car.name,CAR_NAME);assert.equal(car.color,'#ad173c');assert.equal(car.parts,NEW_CAR_PARTS);
  assert.equal((await api.db.select().from(playerVehicles)).length,1);assert.equal((await api.db.select().from(currencyLedger).where(eq(currencyLedger.reason,`vehicle:${CAR_MODEL}`))).length,1);
  assert.equal(responses.at(-1)!.json().balance,65000);
  const keys=(await api.app.inject({method:'GET',url:'/api/inventory',headers})).json().keys;assert.equal(keys[0].name,CAR_NAME);
  assert.equal((await api.app.inject({method:'POST',url:'/api/vehicles/buy',headers,payload:{...payload,model:'moto-delivery'}})).statusCode,409);
  for(const color of ['red','#123','<script>','1234567'])assert.equal((await api.app.inject({method:'POST',url:'/api/vehicles/paint',headers,payload:{vehicleId:car.id,color}})).statusCode,400);
  assert.equal((await api.app.inject({method:'POST',url:'/api/vehicles/paint',headers:{cookie:b.cookie},payload:{vehicleId:car.id,color:'#00aa11'}})).statusCode,404);
  const paint=await api.app.inject({method:'POST',url:'/api/vehicles/paint',headers,payload:{vehicleId:car.id,color:'#00Aa11'}});assert.equal(paint.statusCode,200,paint.body);
  const parts=writeCarParts({...readCarParts(NEW_CAR_PARTS),pneu_de:0,capo:12});
  assert.equal((await api.app.inject({method:'POST',url:'/api/internal/vehicles',headers:internal,payload:{updates:[{vehicleId:car.id,parts,mileage:2300,fuel:37.25}]}})).statusCode,200);
  assert.equal((await api.app.inject({method:'GET',url:'/api/vehicles',headers})).json().vehicles[0].fuel,37.25);
  for(const fuel of [-1,101])assert.equal((await api.app.inject({method:'POST',url:'/api/internal/vehicles',headers:internal,payload:{updates:[{vehicleId:car.id,parts,mileage:2300,fuel}]}})).statusCode,400);
  const traded=await api.app.inject({method:'POST',url:'/api/internal/trades/commit',headers:internal,payload:{id:randomUUID(),a:{userId:a.userId,sessionId:a.sessionId,offer:{coins:0,items:[],vehicles:[car.id]}},b:{userId:b.userId,sessionId:b.sessionId,offer:{coins:0,items:[],vehicles:[]}}}});
  assert.equal(traded.statusCode,200,traded.body);const received=traded.json().sides[b.userId].vehicles[0];
  assert.equal(received.color,'#00aa11');assert.equal(received.parts,parts);assert.equal(received.mileage,2300);assert.equal(received.name,CAR_NAME);
  assert.equal(received.fuel,37.25);
  assert.equal((await api.app.inject({method:'POST',url:'/api/vehicles/paint',headers,payload:{vehicleId:car.id,color:'#ffffff'}})).statusCode,404);
});
