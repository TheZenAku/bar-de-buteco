import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {VEHICLE_CATALOG,vehiclePriceKey,type VehicleOffer,type VehicleView} from '@bar/shared';
import {createApi} from '../src/app.js';
import {readConfig} from '../src/config.js';
import {wallets} from '../src/database/schema.js';

test('every registered vehicle remains for sale before and after purchasing every model',async t=>{
  const api=await createApi({config:{...readConfig(),dataPath:'memory://',databaseUrl:undefined,autoVerifyEmail:true},rateLimit:false,migrate:true});
  t.after(()=>api.app.close());
  const registered=await api.app.inject({method:'POST',url:'/api/auth/register',payload:{username:'catalog_buyer',displayName:'Catalog Buyer',email:'buyer@catalog.test',password:'SenhaBoaDeTeste2026!'}});
  assert.equal(registered.statusCode,201,registered.body);
  const userId=registered.json().user.id,headers={cookie:`${registered.cookies[0]!.name}=${registered.cookies[0]!.value}`};
  await api.app.inject({method:'GET',url:'/api/inventory',headers});
  let balance=500_000;
  await api.db.update(wallets).set({balance}).where(eq(wallets.userId,userId));
  const prices=(await api.app.inject({method:'GET',url:'/api/prices'})).json().prices;
  const expected=VEHICLE_CATALOG.map(vehicle=>vehicle.model);
  const check=(view:VehicleView)=>{
    assert.deepEqual(view.models?.map(offer=>offer.model),expected,'the complete catalogue is independent of ownership');
    for(const vehicle of VEHICLE_CATALOG){
      const listed:VehicleOffer=view.models!.find(candidate=>candidate.model===vehicle.model)!;
      assert.equal(listed.price,prices[vehiclePriceKey(vehicle.model)]);
      assert.equal(listed.name,vehicle.name);assert.equal(listed.seats,vehicle.seats);assert.equal(listed.photo,vehicle.photo);
    }
  };
  const initial=await api.app.inject({method:'GET',url:'/api/vehicles',headers});
  assert.equal(initial.statusCode,200);check(initial.json());
  assert.equal(initial.json().vehicles.length,0);
  for(const vehicle of VEHICLE_CATALOG){
    const payload={requestId:randomUUID(),model:vehicle.model};
    const bought=await api.app.inject({method:'POST',url:'/api/vehicles/buy',headers,payload});
    assert.equal(bought.statusCode,200,bought.body);check(bought.json());
    balance-=prices[vehiclePriceKey(vehicle.model)];assert.equal(bought.json().balance,balance);
    assert.ok(bought.json().vehicles.some((owned:{model:string})=>owned.model===vehicle.model));
    const retry=await api.app.inject({method:'POST',url:'/api/vehicles/buy',headers,payload});
    assert.equal(retry.statusCode,200,retry.body);assert.equal(retry.json().balance,balance);
  }
  const final=(await api.app.inject({method:'GET',url:'/api/vehicles',headers})).json();
  check(final);assert.deepEqual(final.vehicles.map((owned:{model:string})=>owned.model).sort(),[...expected].sort());
  const inventory=(await api.app.inject({method:'GET',url:'/api/inventory',headers})).json();
  assert.equal(inventory.keys.length,VEHICLE_CATALOG.length);
});
