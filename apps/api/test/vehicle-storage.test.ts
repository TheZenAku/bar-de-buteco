import test from 'node:test';import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';import {and,eq} from 'drizzle-orm';
import {INVENTORY_CAPACITY,ITEM_IDS,STORAGE,TRUCK_MODEL,TRUCK_NAME,storageStackMax} from '@bar/shared';import {internalSecret} from '@bar/shared/tickets';
import {createApi} from '../src/app.js';import {readConfig} from '../src/config.js';
import {HighfoodService} from '../src/highfood-service.js';import {PricingService} from '../src/pricing-service.js';
import {inventoryLedger,itemInventory,playerVehicles,sessions,vehicleStorage,wallets} from '../src/database/schema.js';

test('the truck is sold with a hold; moves are atomic, idempotent, limited and only for the key holder',{timeout:120000},async t=>{
  const api=await createApi({config:{...readConfig(),dataPath:'memory://',databaseUrl:undefined,autoVerifyEmail:true},rateLimit:false,migrate:true});t.after(()=>api.app.close());
  const internal={'x-internal-secret':internalSecret()};
  async function account(name:string){
    const registered=await api.app.inject({method:'POST',url:'/api/auth/register',payload:{username:name,displayName:name,email:`${name}@truck.test`,password:'SenhaBoaDeTeste2026!'}});assert.equal(registered.statusCode,201,registered.body);
    const userId=registered.json().user.id as string,cookie=`${registered.cookies[0]!.name}=${registered.cookies[0]!.value}`;
    await api.app.inject({method:'GET',url:'/api/inventory',headers:{cookie}});await api.db.update(wallets).set({balance:1_000_000}).where(eq(wallets.userId,userId));
    const [session]=await api.db.select().from(sessions).where(eq(sessions.userId,userId));return {userId,cookie,sessionId:session!.id};
  }
  const a=await account('truck_owner'),b=await account('truck_other');
  const catalogue=(await api.app.inject({method:'GET',url:'/api/vehicles',headers:{cookie:a.cookie}})).json();
  const offer=catalogue.models.find((m:any)=>m.model===TRUCK_MODEL);assert.equal(offer.name,TRUCK_NAME);assert.equal(offer.seats,2);assert.equal(offer.price,60000);
  const buy=async(model:string)=>(await api.app.inject({method:'POST',url:'/api/vehicles/buy',headers:{cookie:a.cookie},payload:{requestId:randomUUID(),model,color:'#ffffff'}}));
  const bought=await buy(TRUCK_MODEL);assert.equal(bought.statusCode,200,bought.body);
  const truck=bought.json().vehicles.find((v:any)=>v.model===TRUCK_MODEL);assert.equal(truck.load,0);
  const hatch=(await buy('carro-hatch')).json().vehicles.find((v:any)=>v.model==='carro-hatch');
  const call=(who:{userId:string;sessionId:string},body:object,vehicleId=truck.id)=>api.app.inject({method:'POST',url:'/api/internal/vehicle-storage',headers:internal,payload:{userId:who.userId,sessionId:who.sessionId,vehicleId,...body}});
  const move=(who:{userId:string;sessionId:string},direction:string,itemId:string,quantity:number,requestId:string=randomUUID())=>call(who,{action:'move',direction,itemId,quantity,requestId});
  const bag=async(itemId:string)=>(await api.db.select().from(itemInventory).where(and(eq(itemInventory.userId,a.userId),eq(itemInventory.itemId,itemId))))[0]?.quantity??0;
  const hold=async(itemId:string)=>(await api.db.select().from(vehicleStorage).where(and(eq(vehicleStorage.vehicleId,truck.id),eq(vehicleStorage.itemId,itemId))))[0]?.quantity??0;
  const setBag=(itemId:string,quantity:number)=>api.db.insert(itemInventory).values({userId:a.userId,itemId,quantity}).onConflictDoUpdate({target:[itemInventory.userId,itemInventory.itemId],set:{quantity}});
  await setBag('refrigerante',9);await setBag('agua',10);

  // Empty at first, and the key holder's alone.
  const empty=(await call(a,{action:'view'})).json();assert.equal(empty.storage.stacks.length,0);assert.equal(empty.storage.capacity,STORAGE.SLOTS);assert.equal(empty.storage.load,0);
  assert.equal((await call(b,{action:'view'})).statusCode,404);
  assert.equal((await move(b,'deposit','agua',1)).statusCode,404);
  assert.equal((await call(a,{action:'view'},hatch.id)).statusCode,400);
  assert.equal((await api.app.inject({method:'POST',url:'/api/internal/vehicle-storage',headers:{},payload:{userId:a.userId,sessionId:a.sessionId,vehicleId:truck.id,action:'view'}})).statusCode,401);

  // A deposit takes from the backpack what it gives the hold, in one step; the same request again moves nothing.
  const request=randomUUID(),first=await move(a,'deposit','refrigerante',4,request);assert.equal(first.statusCode,200,first.body);
  assert.equal(await bag('refrigerante'),5);assert.equal(await hold('refrigerante'),4);
  assert.deepEqual(first.json().storage.stacks,[{itemId:'refrigerante',quantity:4}]);assert.equal(first.json().storage.load,1);
  assert.equal((await move(a,'deposit','refrigerante',4,request)).statusCode,200);assert.equal(await bag('refrigerante'),5);assert.equal(await hold('refrigerante'),4);
  assert.equal((await api.db.select().from(inventoryLedger).where(eq(inventoryLedger.id,`storage-deposit:${request}`))).length,1);
  // More than there is, none at all and nonsense are refused without moving anything.
  assert.equal((await move(a,'deposit','refrigerante',6)).statusCode,409);assert.equal((await move(a,'deposit','rojao',1)).statusCode,409);
  for(const quantity of [0,-1,1.5,STORAGE.MAX_MOVE+1])assert.equal((await move(a,'deposit','agua',quantity)).statusCode,400);
  assert.equal((await move(a,'deposit','inexistente',1)).statusCode,400);
  assert.equal(await bag('refrigerante'),5);assert.equal(await hold('refrigerante'),4);
  // Two at once for the last units: exactly one wins, nothing is lost or made.
  const race=await Promise.all([move(a,'deposit','refrigerante',5),move(a,'deposit','refrigerante',5)]);
  assert.deepEqual(race.map(r=>r.statusCode).sort(),[200,409]);assert.equal(await bag('refrigerante'),0);assert.equal(await hold('refrigerante'),9);

  // Withdrawing respects the hold's content and the backpack's own limits.
  assert.equal((await move(a,'withdraw','refrigerante',10)).statusCode,409);assert.equal((await move(a,'withdraw','agua',1)).statusCode,409);
  const out=await move(a,'withdraw','refrigerante',9);assert.equal(out.statusCode,200,out.body);assert.equal(await bag('refrigerante'),9);assert.equal(await hold('refrigerante'),0);assert.equal(out.json().storage.stacks.length,0);
  assert.equal((await move(a,'deposit','agua',10)).statusCode,200);assert.equal(await bag('agua'),0);
  await setBag('agua',5);
  assert.equal((await move(a,'withdraw','agua',6)).statusCode,409);   // 5 + 6 would pass the backpack's stack of 10
  assert.equal((await move(a,'withdraw','agua',5)).statusCode,200);assert.equal(await bag('agua'),10);assert.equal(await hold('agua'),5);

  // A full backpack takes nothing new out of the hold.
  await api.db.delete(itemInventory).where(eq(itemInventory.userId,a.userId));
  for(const itemId of ITEM_IDS.slice(0,INVENTORY_CAPACITY).filter(id=>id!=='torresmo'))await setBag(itemId,1);
  await api.db.insert(vehicleStorage).values({vehicleId:truck.id,itemId:'torresmo',quantity:2}).onConflictDoUpdate({target:[vehicleStorage.vehicleId,vehicleStorage.itemId],set:{quantity:2}});
  await setBag('rojao',1);await setBag('peca_carro',1);
  const slots=(await api.db.select().from(itemInventory).where(eq(itemInventory.userId,a.userId))).length;
  if(slots<INVENTORY_CAPACITY)for(const itemId of ITEM_IDS){const used=(await api.db.select().from(itemInventory).where(eq(itemInventory.userId,a.userId))).length;if(used>=INVENTORY_CAPACITY)break;if(itemId!=='torresmo')await setBag(itemId,1);}
  const full=(await api.db.select().from(itemInventory).where(eq(itemInventory.userId,a.userId))).length;assert.ok(full<=INVENTORY_CAPACITY);
  if(full>=INVENTORY_CAPACITY)assert.equal((await move(a,'withdraw','torresmo',1)).statusCode,409);

  // The hold's own stack limit and its slots.
  const limit=storageStackMax('agua');assert.equal(limit,100);
  await setBag('agua',3);await api.db.update(vehicleStorage).set({quantity:limit-2}).where(and(eq(vehicleStorage.vehicleId,truck.id),eq(vehicleStorage.itemId,'agua')));
  assert.equal((await move(a,'deposit','agua',3)).statusCode,409);assert.equal((await move(a,'deposit','agua',2)).statusCode,200);assert.equal(await hold('agua'),limit);

  // How full it is shows in the vehicle list, so the room draws the crates.
  const load=async()=>(await api.app.inject({method:'GET',url:'/api/vehicles',headers:{cookie:a.cookie}})).json().vehicles.find((v:any)=>v.id===truck.id).load;
  assert.equal(await load(),3);
  await api.db.delete(vehicleStorage).where(eq(vehicleStorage.vehicleId,truck.id));assert.equal(await load(),0);
  await api.db.insert(vehicleStorage).values({vehicleId:truck.id,itemId:'agua',quantity:1});assert.equal(await load(),1);
  await api.db.update(vehicleStorage).set({quantity:30}).where(eq(vehicleStorage.vehicleId,truck.id));assert.equal(await load(),2);

  // The hold follows the truck: after a trade only the new key holder opens it, with its content.
  const traded=await api.app.inject({method:'POST',url:'/api/internal/trades/commit',headers:internal,payload:{id:randomUUID(),a:{userId:a.userId,sessionId:a.sessionId,offer:{coins:0,items:[],vehicles:[truck.id]}},b:{userId:b.userId,sessionId:b.sessionId,offer:{coins:0,items:[],vehicles:[]}}}});assert.equal(traded.statusCode,200,traded.body);
  assert.equal((await call(a,{action:'view'})).statusCode,404);
  const received=(await call(b,{action:'view'})).json().storage;assert.deepEqual(received.stacks,[{itemId:'agua',quantity:30}]);assert.equal(received.load,2);
  // And it goes with the vehicle when the administration takes it away.
  await new HighfoodService(api.db,new PricingService(api.db)).setVehicle(b.userId,b.userId,false,'teste',truck.plate);
  assert.equal((await api.db.select().from(playerVehicles).where(eq(playerVehicles.id,truck.id))).length,0);
  assert.equal((await api.db.select().from(vehicleStorage).where(eq(vehicleStorage.vehicleId,truck.id))).length,0);
});
