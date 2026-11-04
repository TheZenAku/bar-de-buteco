import {test} from 'node:test';import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {internalSecret} from '@bar/shared/tickets';
import {createApi} from '../src/app.js';import {readConfig} from '../src/config.js';import {OWNER_EMAIL} from '../src/admin-policy.js';
import {currencyLedger,highfoodDeliveries,wallets} from '../src/database/schema.js';

async function setup(t:{after(fn:()=>Promise<void>|void):void}){
  const config={...readConfig(),dataPath:'memory://',databaseUrl:undefined,autoVerifyEmail:true};
  const api=await createApi({config,rateLimit:false,migrate:true});t.after(()=>api.app.close());
  const internal={'x-internal-secret':internalSecret()};
  const session=async(username:string,email=`${username}@highfood.test`)=>{
    const response=await api.app.inject({method:'POST',url:'/api/auth/register',payload:{username,email,displayName:username,password:'SenhaBoaDeTeste2026!'}});
    assert.equal(response.statusCode,201,response.body);
    const cookie=`${response.cookies[0]!.name}=${response.cookies[0]!.value}`,id=response.json().user.id as string;
    await api.app.inject({method:'GET',url:'/api/wardrobe',headers:{cookie}});
    return {cookie,id};
  };
  return {app:api.app,db:api.db,internal,session};
}
const order=(userId:string,over:Record<string,unknown>={})=>({userId,orderId:randomUUID(),customerId:'dona-cida',customer:'Dona Cida',restaurant:'Pizzaria',items:['Pizza'],address:'Rua X, 10',length:300,durationMs:60_000,onTime:true,crashes:0,wornBox:false,...over});

test('catalog visibility never grants a motorcycle to new accounts, and ownership audit requires internal access',async t=>{
  const {app,db,internal,session}=await setup(t);
  const accounts=await Promise.all([session('sem_moto_a'),session('sem_moto_b')]);
  for(const {cookie} of accounts){
    const view=(await app.inject({method:'GET',url:'/api/vehicles',headers:{cookie}})).json();
    assert.equal(view.owned,false);assert.equal(view.vehicles.length,0);
    assert.ok(view.models.some((model:any)=>model.model==='moto-delivery'));
    assert.equal((await app.inject({method:'GET',url:'/api/inventory',headers:{cookie}})).json().keys.length,0);
  }
  assert.equal((await app.inject({method:'GET',url:'/api/internal/vehicles/ownership-audit'})).statusCode,401);
  const audit=await app.inject({method:'GET',url:'/api/internal/vehicles/ownership-audit',headers:internal});
  assert.equal(audit.statusCode,200);assert.equal(audit.json().motorcycles,0);assert.equal(audit.json().motorcycle_owners,0);
  await db.update(wallets).set({balance:12000}).where(eq(wallets.userId,accounts[0]!.id));
  assert.equal((await app.inject({method:'POST',url:'/api/vehicles/buy',headers:{cookie:accounts[0]!.cookie},payload:{requestId:randomUUID()}})).statusCode,200);
  const untouched=(await app.inject({method:'GET',url:'/api/vehicles',headers:{cookie:accounts[1]!.cookie}})).json();
  assert.equal(untouched.owned,false);assert.equal(untouched.vehicles.length,0);
  const after=(await app.inject({method:'GET',url:'/api/internal/vehicles/ownership-audit',headers:internal})).json();
  assert.equal(after.motorcycles,1);assert.equal(after.motorcycle_owners,1);assert.equal(after.purchases,1);
});

test('the bike: sold for its price, the same purchase once, refused without the coins, and the world hears about it',async t=>{
  const {app,db,internal,session}=await setup(t),{cookie,id}=await session('comprador');
  const view=await app.inject({method:'GET',url:'/api/vehicles',headers:{cookie}});
  assert.equal(view.json().owned,false);assert.equal(view.json().price,10000);
  const poor=await app.inject({method:'POST',url:'/api/vehicles/buy',headers:{cookie},payload:{requestId:randomUUID()}});
  assert.equal(poor.statusCode,409);assert.match(poor.json().error,/Faltam 10\.000|Faltam/);
  await db.update(wallets).set({balance:12_000}).where(eq(wallets.userId,id));
  const requestId=randomUUID(),bought=await app.inject({method:'POST',url:'/api/vehicles/buy',headers:{cookie},payload:{requestId}});
  assert.equal(bought.statusCode,200,bought.body);assert.equal(bought.json().owned,true);assert.equal(bought.json().balance,2000);
  // The same click again: nothing more is charged. Another purchase without the coins for it: nor is it.
  await app.inject({method:'POST',url:'/api/vehicles/buy',headers:{cookie},payload:{requestId}});
  const again=await app.inject({method:'POST',url:'/api/vehicles/buy',headers:{cookie},payload:{requestId:randomUUID()}});
  assert.equal(again.statusCode,409);
  const [wallet]=await db.select().from(wallets).where(eq(wallets.userId,id));assert.equal(wallet!.balance,2000);
  const ledger=await db.select().from(currencyLedger).where(eq(currencyLedger.reason,'vehicle:moto-delivery'));assert.equal(ledger.length,1);assert.equal(ledger[0]!.amount,-10000);
  // The world reads it with the rest of the player's access, and keeps its state.
  const sessions=await app.inject({method:'POST',url:'/api/internal/vehicles',headers:internal,payload:{updates:[{vehicleId:bought.json().vehicles[0].id,parts:'90,100,100,100,100,100,100,100,100,100,100,100',mileage:1500}]}});
  assert.equal(sessions.statusCode,200,sessions.body);
  const after=await app.inject({method:'GET',url:'/api/vehicles',headers:{cookie}});
  assert.equal(after.json().vehicles[0].mileage,1500);assert.match(after.json().vehicles[0].parts,/^90,/);
  // Only a logged-in player buys.
  assert.equal((await app.inject({method:'POST',url:'/api/vehicles/buy',payload:{requestId:randomUUID()}})).statusCode,401);
});

test('a delivery is paid once by its order, by the price table, and shows in the app',async t=>{
  const {app,db,internal,session}=await setup(t),{cookie,id}=await session('entregador1');
  const body=order(id);
  const first=await app.inject({method:'POST',url:'/api/internal/highfood/complete',headers:internal,payload:body});
  assert.equal(first.statusCode,200,first.body);assert.equal(first.json().paid,24);assert.equal(first.json().stars,5);
  const second=await app.inject({method:'POST',url:'/api/internal/highfood/complete',headers:internal,payload:body});
  assert.equal(second.json().paid,24);
  const [wallet]=await db.select().from(wallets).where(eq(wallets.userId,id));assert.equal(wallet!.balance,24);
  assert.equal((await db.select().from(highfoodDeliveries).where(eq(highfoodDeliveries.userId,id))).length,1);
  await app.inject({method:'POST',url:'/api/internal/highfood/lost',headers:internal,payload:{userId:id,orderId:randomUUID(),customerId:'seu-ademir',customer:'Seu Ademir',restaurant:'R',items:['X'],address:'Rua Y, 2',length:200,reason:'gave-up'}});
  const view=(await app.inject({method:'GET',url:'/api/highfood',headers:{cookie}})).json();
  assert.equal(view.deliveries,1);assert.equal(view.earnedTotal,24);assert.equal(view.today.earned,24);assert.equal(view.today.count,1);assert.equal(view.recent.length,2);
  assert.equal(view.today.fullLeft,19);assert.equal(view.onTimeShare,1);
  assert.equal(view.rating,3,'One five-star and one given up on');
  assert.equal(view.customers['dona-cida'].name,'Dona Cida');assert.ok(view.customers['dona-cida'].look);
  assert.equal(view.week.length,1);assert.equal(view.week[0].earned,24);
  const rating=await app.inject({method:'POST',url:'/api/internal/highfood/rating',headers:internal,payload:{userId:id}});
  assert.equal(rating.json().rating,3);
  // Only the world asks to pay.
  assert.equal((await app.inject({method:'POST',url:'/api/internal/highfood/complete',payload:order(id)})).statusCode,401);
  assert.equal((await app.inject({method:'POST',url:'/api/internal/highfood/complete',headers:internal,payload:{...order(id),length:-1}})).statusCode,400);
});

test('past the deliveries at full price they pay half, and past the daily ceiling nothing; the record stays',async t=>{
  const {app,db,internal,session}=await setup(t),{id}=await session('entregador2');
  const pays:number[]=[];
  for(let i=0;i<40;i++){
    const answer=await app.inject({method:'POST',url:'/api/internal/highfood/complete',headers:internal,payload:order(id)});
    assert.equal(answer.statusCode,200,answer.body);pays.push(answer.json().paid);
    if(i===39)assert.equal(answer.json().capped,true);
  }
  assert.equal(pays[0],24);assert.equal(pays[19],24);assert.equal(pays[20],12,'Half after twenty');
  assert.equal(pays.reduce((sum,value)=>sum+value,0),700,'The ceiling, and not a coin more');
  assert.equal(pays.at(-1),0);
  assert.equal((await db.select().from(highfoodDeliveries).where(eq(highfoodDeliveries.userId,id))).length,40);
});

test('the administration: customers with their pictures, the price group, and a picture in use stays',async t=>{
  const {app,internal,session}=await setup(t),owner=await session('dono',OWNER_EMAIL),player=await session('jogador9');
  assert.equal((await app.inject({method:'GET',url:'/api/admin/highfood',headers:{cookie:player.cookie}})).statusCode,403);
  const panel=await app.inject({method:'GET',url:'/api/admin/highfood',headers:{cookie:owner.cookie}});
  assert.equal(panel.statusCode,200,panel.body);
  assert.ok(panel.json().customers.length>=20);
  const cida=panel.json().customers.find((each:{id:string})=>each.id==='dona-cida');
  // A real one-pixel PNG, sent the way the badges' are.
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64');
  const sent=await app.inject({method:'POST',url:'/api/admin/badges/images',headers:{cookie:owner.cookie,'content-type':'image/png'},payload:png});
  assert.equal(sent.statusCode,200,sent.body);
  const image=sent.json().id as string;
  const {id:_id,active,name,skin,look,lines}=cida;void _id;
  const saved=await app.inject({method:'POST',url:'/api/admin/highfood/customers',headers:{cookie:owner.cookie},payload:{id:'dona-cida',active,name,skin,look,lines,image,reason:'Foto de verdade'}});
  assert.equal(saved.statusCode,200,saved.body);
  assert.equal(saved.json().customers.find((each:{id:string})=>each.id==='dona-cida').image,image);
  const world=await app.inject({method:'GET',url:'/api/internal/highfood/customers',headers:internal});
  assert.equal(world.json().customers.find((each:{id:string})=>each.id==='dona-cida').image,image);
  const removal=await app.inject({method:'POST',url:'/api/admin/badges/images/delete',headers:{cookie:owner.cookie},payload:{id:image,reason:'Não quero mais'}});
  assert.equal(removal.statusCode,409);assert.match(removal.json().error,/Dona Cida/);
  // A new one gets an id from the name, and an inactive one does not reach the world.
  const created=await app.inject({method:'POST',url:'/api/admin/highfood/customers',headers:{cookie:owner.cookie},payload:{active:false,name:'Zé Novo',skin,look,lines,image:null,reason:'Cliente novo'}});
  assert.ok(created.json().customers.some((each:{id:string})=>each.id==='ze-novo'));
  const after=await app.inject({method:'GET',url:'/api/internal/highfood/customers',headers:internal});
  assert.ok(!after.json().customers.some((each:{id:string})=>each.id==='ze-novo'));
  // Prices.
  const prices=await app.inject({method:'GET',url:'/api/prices'});
  assert.equal(prices.json().prices['vehicle:moto'],10000);assert.equal(prices.json().prices['cap:highfood-daily'],700);
  // The bike the administration hands out.
  const grant=await app.inject({method:'POST',url:'/api/admin/highfood/vehicle',headers:{cookie:owner.cookie},payload:{playerId:player.id,owned:true,reason:'Teste de entregas'}});
  assert.equal(grant.statusCode,200,grant.body);
  assert.equal((await app.inject({method:'GET',url:'/api/vehicles',headers:{cookie:player.cookie}})).json().owned,true);
  // With two, the key taken back has to be named; a wrong plate takes nothing.
  await app.inject({method:'POST',url:'/api/admin/highfood/vehicle',headers:{cookie:owner.cookie},payload:{playerId:player.id,owned:true,reason:'Mais uma moto'}});
  const plates=(await app.inject({method:'GET',url:'/api/vehicles',headers:{cookie:player.cookie}})).json().vehicles.map((each:{plate:string})=>each.plate) as string[];
  assert.equal(plates.length,2);
  assert.equal((await app.inject({method:'POST',url:'/api/admin/highfood/vehicle',headers:{cookie:owner.cookie},payload:{playerId:player.id,owned:false,reason:'Sem dizer qual'}})).statusCode,409);
  assert.equal((await app.inject({method:'POST',url:'/api/admin/highfood/vehicle',headers:{cookie:owner.cookie},payload:{playerId:player.id,owned:false,plate:'ZZZ9Z99',reason:'Placa errada'}})).statusCode,404);
  assert.equal((await app.inject({method:'POST',url:'/api/admin/highfood/vehicle',headers:{cookie:owner.cookie},payload:{playerId:player.id,owned:false,plate:plates[0],reason:'Essa placa'}})).statusCode,200);
  assert.deepEqual((await app.inject({method:'GET',url:'/api/vehicles',headers:{cookie:player.cookie}})).json().vehicles.map((each:{plate:string})=>each.plate),[plates[1]]);
});
