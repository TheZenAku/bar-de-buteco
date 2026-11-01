import {test} from 'node:test';import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {eq,sql} from 'drizzle-orm';
import {internalSecret} from '@bar/shared/tickets';
import {GARAGE,INVENTORY_CAPACITY,ITEM_CATALOG,NEW_MOTO_PARTS,PLATE,VEHICLE_KEY,type TradeOffer} from '@bar/shared';
import {createApi} from '../src/app.js';import {readConfig} from '../src/config.js';
import {currencyLedger,inventoryLedger,itemInventory,moderationActions,playerVehicles,sessions,trades,wallets} from '../src/database/schema.js';

type Setup=Awaited<ReturnType<typeof setup>>;
async function setup(t:{after(fn:()=>Promise<void>|void):void}){
  const config={...readConfig(),dataPath:'memory://',databaseUrl:undefined,autoVerifyEmail:true};
  const api=await createApi({config,rateLimit:false,migrate:true});t.after(()=>api.app.close());
  const internal={'x-internal-secret':internalSecret()};
  const player=async(username:string,coins=0)=>{
    const response=await api.app.inject({method:'POST',url:'/api/auth/register',payload:{username,email:`${username}@troca.test`,displayName:username,password:'SenhaBoaDeTeste2026!'}});
    assert.equal(response.statusCode,201,response.body);
    const cookie=`${response.cookies[0]!.name}=${response.cookies[0]!.value}`,userId=response.json().user.id as string;
    await api.app.inject({method:'GET',url:'/api/inventory',headers:{cookie}});
    await api.db.update(wallets).set({balance:coins}).where(eq(wallets.userId,userId));
    await api.db.delete(itemInventory).where(eq(itemInventory.userId,userId));
    const [session]=await api.db.select({id:sessions.id}).from(sessions).where(eq(sessions.userId,userId));
    return {cookie,userId,sessionId:session!.id,username};
  };
  return {app:api.app,db:api.db,internal,player};
}
type Who=Awaited<ReturnType<Setup['player']>>;
const offer=(over:Partial<TradeOffer>={}):TradeOffer=>({coins:0,items:[],vehicles:[],...over});
const commit=(s:Setup,a:Who,oa:TradeOffer,b:Who,ob:TradeOffer,id=randomUUID())=>s.app.inject({method:'POST',url:'/api/internal/trades/commit',headers:s.internal,payload:{id,a:{userId:a.userId,sessionId:a.sessionId,offer:oa},b:{userId:b.userId,sessionId:b.sessionId,offer:ob}}});
const coinsOf=async(s:Setup,who:Who)=>(await s.db.select().from(wallets).where(eq(wallets.userId,who.userId)))[0]!.balance;
const itemsOf=async(s:Setup,who:Who)=>Object.fromEntries((await s.db.select().from(itemInventory).where(eq(itemInventory.userId,who.userId))).map(row=>[row.itemId,row.quantity]));
const give=async(s:Setup,who:Who,itemId:string,quantity:number)=>{await s.db.insert(itemInventory).values({userId:who.userId,itemId,quantity}).onConflictDoUpdate({target:[itemInventory.userId,itemInventory.itemId],set:{quantity}});};
const bike=async(s:Setup,who:Who,parts=NEW_MOTO_PARTS)=>{const id=randomUUID(),plate=`TST${Math.floor(Math.random()*10)}A${String(Math.floor(Math.random()*100)).padStart(2,'0')}`;await s.db.insert(playerVehicles).values({id,plate:`${plate.slice(0,3)}${id.charCodeAt(0)%10}${String.fromCharCode(65+id.charCodeAt(1)%26)}${String(parseInt(id.slice(2,6),16)%100).padStart(2,'0')}`,userId:who.userId,model:'moto-delivery',parts,mileage:1234});return id;};
const ownerOf=async(s:Setup,id:string)=>(await s.db.select().from(playerVehicles).where(eq(playerVehicles.id,id)))[0]?.userId;

test('a trade moves coins, items and a key at once, the key takes the bike with its state, and repeating it changes nothing',async t=>{
  const s=await setup(t),ana=await s.player('ana',1000),bob=await s.player('bob',50);
  await give(s,ana,'agua',3);await give(s,bob,'coxinha',2);
  const broken=`0,${NEW_MOTO_PARTS.split(',').slice(1).join(',')}`,moto=await bike(s,ana,broken),id=randomUUID();
  const done=await commit(s,ana,offer({items:[{itemId:'agua',quantity:2}],vehicles:[moto]}),bob,offer({coins:30,items:[{itemId:'coxinha',quantity:2}]}),id);
  assert.equal(done.statusCode,200,done.body);
  const answer=done.json();assert.equal(answer.replayed,false);
  assert.equal(await coinsOf(s,ana),1030);assert.equal(await coinsOf(s,bob),20);
  assert.deepEqual(await itemsOf(s,ana),{agua:1,coxinha:2});assert.deepEqual(await itemsOf(s,bob),{agua:2});
  assert.equal(await ownerOf(s,moto),bob.userId);
  assert.equal(answer.sides[ana.userId].balance,1030);assert.deepEqual(answer.sides[ana.userId].keys,[]);
  assert.equal(answer.sides[bob.userId].vehicles[0].id,moto);
  // A key passes with the bike exactly as it was: a broken part stays broken.
  assert.equal(answer.sides[bob.userId].vehicles[0].parts,broken);assert.equal(answer.sides[bob.userId].vehicles[0].mileage,1234);
  // The same request again, however many times.
  for(let i=0;i<3;i++){
    const again=await commit(s,ana,offer({items:[{itemId:'agua',quantity:2}],vehicles:[moto]}),bob,offer({coins:30,items:[{itemId:'coxinha',quantity:2}]}),id);
    assert.equal(again.statusCode,200,again.body);assert.equal(again.json().replayed,true);
  }
  assert.equal(await coinsOf(s,ana),1030);assert.equal(await coinsOf(s,bob),20);
  assert.deepEqual(await itemsOf(s,ana),{agua:1,coxinha:2});assert.deepEqual(await itemsOf(s,bob),{agua:2});
  assert.equal((await s.db.select().from(trades)).length,1);
  // The same id with something else on the table is not that trade.
  assert.equal((await commit(s,ana,offer({coins:1}),bob,offer(),id)).statusCode,409);
  assert.equal(await coinsOf(s,ana),1030);
  // Every coin and item has its two sides in the books, and the statements read as a trade.
  const ledger=await s.db.select().from(currencyLedger).where(sql`${currencyLedger.reason} like 'trade:%'`);
  assert.equal(ledger.reduce((sum,row)=>sum+row.amount,0),0);assert.equal(ledger.length,2);
  const items=await s.db.select().from(inventoryLedger).where(eq(inventoryLedger.reason,'trade'));
  assert.equal(items.reduce((sum,row)=>sum+row.quantity,0),0);assert.equal(items.length,4);
  const bank=await s.app.inject({method:'GET',url:'/api/phone/bank',headers:{cookie:bob.cookie}});
  assert.equal(bank.json().entries.find((entry:{reason:string})=>entry.reason.startsWith('trade:')).peer,'ana');
  // The backpack shows the key from then on.
  const pack=await s.app.inject({method:'GET',url:'/api/inventory',headers:{cookie:bob.cookie}});
  assert.equal(pack.json().keys[0].vehicleId,moto);assert.ok(PLATE.test(pack.json().keys[0].plate)||pack.json().keys[0].plate.length===7);
});

test('anything that does not hold up refuses the whole trade and changes nothing',async t=>{
  const s=await setup(t),ana=await s.player('ana2',100),bob=await s.player('bob2',100),eve=await s.player('eve2',0);
  await give(s,ana,'agua',2);await give(s,bob,'cafe',2);
  const hers=await bike(s,ana),his=await bike(s,bob);
  const before=async()=>{
    assert.equal(await coinsOf(s,ana),100);assert.equal(await coinsOf(s,bob),100);
    assert.deepEqual(await itemsOf(s,ana),{agua:2});assert.deepEqual(await itemsOf(s,bob),{cafe:2});
    assert.equal(await ownerOf(s,hers),ana.userId);assert.equal(await ownerOf(s,his),bob.userId);
    assert.equal((await s.db.select().from(trades)).length,0);
  };
  const refused=async(oa:TradeOffer,ob:TradeOffer,status:number,pattern?:RegExp)=>{
    const answer=await commit(s,ana,oa,bob,ob);
    assert.equal(answer.statusCode,status,answer.body);
    if(pattern)assert.match(answer.json().error,pattern);
    await before();
  };
  // More than they have, on either side, even with the other half valid.
  await refused(offer({coins:101}),offer({coins:1}),409,/moedas/);
  await refused(offer({coins:1}),offer({coins:101}),409,/moedas/);
  await refused(offer({items:[{itemId:'agua',quantity:3}]}),offer({coins:1}),409,/Água mineral/);
  await refused(offer({items:[{itemId:'coxinha',quantity:1}]}),offer(),409);
  // What the trade itself would bring cannot pay for it: the same coins do not go round.
  await refused(offer({coins:150}),offer({coins:60}),409);
  // Somebody else's key, a key that does not exist, one's own key offered by the other.
  await refused(offer({vehicles:[his]}),offer(),409,/chaves/);
  await refused(offer({vehicles:[randomUUID()]}),offer(),409,/chaves/);
  await refused(offer(),offer({vehicles:[hers]}),409,/chaves/);
  // Malformed: nothing about them reaches the database.
  await refused(offer({coins:-5}),offer(),400);
  await refused(offer({coins:1.5}),offer(),400);
  await refused(offer({items:[{itemId:'agua',quantity:1},{itemId:'agua',quantity:1}]}),offer(),400,/repetido/);
  await refused(offer({vehicles:[hers,hers]}),offer(),400,/repetido/);
  await refused(offer({items:[{itemId:'agua',quantity:0}]}),offer(),400);
  await refused(offer({items:[{itemId:'barra-de-ouro',quantity:1} as never]}),offer(),400);
  await refused(offer(),offer(),400,/vazia/);
  const self=await s.app.inject({method:'POST',url:'/api/internal/trades/commit',headers:s.internal,payload:{id:randomUUID(),a:{userId:ana.userId,sessionId:ana.sessionId,offer:offer({coins:1})},b:{userId:ana.userId,sessionId:ana.sessionId,offer:offer()}}});
  assert.equal(self.statusCode,400);
  // Only the world may ask.
  assert.equal((await s.app.inject({method:'POST',url:'/api/internal/trades/commit',payload:{}})).statusCode,401);
  // A session that ended, or an account banned since.
  await s.db.delete(sessions).where(eq(sessions.userId,eve.userId));
  const ended=await commit(s,ana,offer({coins:1}),eve,offer());assert.equal(ended.statusCode,401);
  await s.db.insert(moderationActions).values({id:randomUUID(),actorId:ana.userId,userId:bob.userId,action:'ban',reason:'teste'});
  await refused(offer({coins:1}),offer(),401);
});

test('what would not fit refuses it too: full backpack, a stack past its limit, the most vehicles, the most coins',async t=>{
  const s=await setup(t),ana=await s.player('ana3',100),bob=await s.player('bob3',0);
  await give(s,ana,'agua',1);await give(s,ana,'curativo',2);
  // Bob's backpack with every slot taken, and one of them water at its limit.
  const fill=ITEM_CATALOG.slice(0,INVENTORY_CAPACITY);
  for(const item of fill)if(item.id!=='curativo')await give(s,bob,item.id,1);
  await give(s,bob,'agua',10);
  const before=await itemsOf(s,bob);
  const stack=await commit(s,ana,offer({items:[{itemId:'agua',quantity:1}]}),bob,offer());
  assert.equal(stack.statusCode,409);assert.match(stack.json().error,/máximo de 10/);
  // Giving something away in the same trade makes room: both ends count, not the order.
  const swap=await commit(s,ana,offer({items:[{itemId:'curativo',quantity:1}]}),bob,offer({items:[{itemId:'cafe',quantity:1}]}));
  assert.equal(swap.statusCode,200,swap.body);
  assert.equal((await itemsOf(s,bob)).curativo,1);assert.equal((await itemsOf(s,bob)).cafe,undefined);
  assert.notDeepEqual(await itemsOf(s,bob),before);
  // Vehicles: one past the most is refused, and the key stays where it was.
  for(let i=0;i<GARAGE.VEHICLE_LIMIT;i++)await bike(s,bob);
  const extra=await bike(s,ana),past=await commit(s,ana,offer({vehicles:[extra]}),bob,offer());
  assert.equal(past.statusCode,409);assert.equal(await ownerOf(s,extra),ana.userId);
  // Coins: past the wallet's ceiling nothing is rounded away.
  await s.db.update(wallets).set({balance:1_000_000_000}).where(eq(wallets.userId,bob.userId));
  const rich=await commit(s,ana,offer({coins:1}),bob,offer());
  assert.equal(rich.statusCode,409);assert.equal(await coinsOf(s,ana),100);
});

test('at the same moment: one trade sent many times happens once, and the same coins, item or key cannot be promised twice',async t=>{
  const s=await setup(t),ana=await s.player('ana4',100),bob=await s.player('bob4',0),eve=await s.player('eve4',0);
  await give(s,ana,'curativo',2);
  const moto=await bike(s,ana);
  // The world retrying a trade while the first copy is still running.
  const id=randomUUID(),copies=await Promise.all(Array.from({length:8},()=>commit(s,ana,offer({coins:10}),bob,offer(),id)));
  assert.ok(copies.every(copy=>copy.statusCode===200),copies.map(copy=>copy.statusCode).join());
  assert.equal(copies.filter(copy=>!copy.json().replayed).length,1);
  assert.equal(await coinsOf(s,ana),90);assert.equal(await coinsOf(s,bob),10);
  // The whole wallet promised to both at once: one gets it, the other nothing.
  const coins=await Promise.all([commit(s,ana,offer({coins:90}),bob,offer()),commit(s,ana,offer({coins:90}),eve,offer())]);
  assert.deepEqual(coins.map(each=>each.statusCode).sort(),[200,409]);
  assert.equal(await coinsOf(s,ana),0);assert.equal(await coinsOf(s,bob)+await coinsOf(s,eve),100);
  // The last two of an item, to each of two people.
  const items=await Promise.all([commit(s,ana,offer({items:[{itemId:'curativo',quantity:2}]}),bob,offer()),commit(s,ana,offer({items:[{itemId:'curativo',quantity:2}]}),eve,offer())]);
  assert.deepEqual(items.map(each=>each.statusCode).sort(),[200,409]);
  const held=[(await itemsOf(s,ana)).curativo??0,(await itemsOf(s,bob)).curativo??0,(await itemsOf(s,eve)).curativo??0];
  assert.equal(held.reduce((sum,value)=>sum+value,0),2);assert.equal(held[0],0);
  // The one key, sold to two people at the same instant: it has one owner, because it has one row.
  const keys=await Promise.all([commit(s,ana,offer({vehicles:[moto]}),bob,offer()),commit(s,ana,offer({vehicles:[moto]}),eve,offer())]);
  assert.deepEqual(keys.map(each=>each.statusCode).sort(),[200,409]);
  assert.ok([bob.userId,eve.userId].includes((await ownerOf(s,moto))!));
  assert.equal((await s.db.select().from(playerVehicles).where(eq(playerVehicles.id,moto))).length,1);
});

test('a trade against everything else that spends: a drink used, a Pix sent and a purchase made at the same moment never add up to more',async t=>{
  const s=await setup(t),ana=await s.player('ana5',1000),bob=await s.player('bob5',0);
  await give(s,ana,'curativo',1);
  const [session]=[ana.sessionId],uses=await Promise.all([
    commit(s,ana,offer({items:[{itemId:'curativo',quantity:1}]}),bob,offer()),
    s.app.inject({method:'POST',url:'/api/internal/inventory',headers:s.internal,payload:{sessionId:session,userId:ana.userId,itemId:'curativo',quantity:1,reason:'faint',requestId:randomUUID()}}),
  ]);
  // Either the trade took it or the faint did. Never both.
  assert.equal(uses.filter(answer=>answer.statusCode===200).length,1,uses.map(answer=>`${answer.statusCode} ${answer.body.slice(0,80)}`).join(' | '));
  const left=(await itemsOf(s,ana)).curativo??0,got=(await itemsOf(s,bob)).curativo??0;
  assert.ok(left+got<=1);
  const spent=await Promise.all([
    commit(s,ana,offer({coins:1000}),bob,offer()),
    s.app.inject({method:'POST',url:'/api/internal/wallet',headers:s.internal,payload:{sessionId:session,userId:ana.userId,amount:-1000,reason:'counter:copo',requestId:randomUUID()}}),
  ]);
  assert.equal(spent.filter(answer=>answer.statusCode===200).length,1);
  assert.equal(await coinsOf(s,ana),0);
  assert.ok((await coinsOf(s,bob))===0||(await coinsOf(s,bob))===1000);
});

test('a storm of random trades between four people: coins and items are never made or lost, and every key has one holder',async t=>{
  const s=await setup(t),people=await Promise.all(['p1','p2','p3','p4'].map(name=>s.player(`tempestade_${name}`,5000)));
  const pool=['agua','cafe','coxinha','pastel'] as const;
  for(const person of people)for(const itemId of pool)await give(s,person,itemId,5);
  const motos=await Promise.all(people.flatMap(person=>[bike(s,person),bike(s,person)]));
  const totalItems=async()=>{const rows=await s.db.select().from(itemInventory);return rows.reduce((sum,row)=>sum+row.quantity,0);};
  const totalCoins=async()=>{const rows=await s.db.select().from(wallets);return rows.reduce((sum,row)=>sum+row.balance,0);};
  const coins0=await totalCoins(),items0=await totalItems();
  // A fixed sequence, so a failure can be told apart from bad luck.
  let seed=1234567;const random=()=>(seed=(seed*1103515245+12345)&0x7fffffff)/0x7fffffff,pick=<T,>(list:readonly T[])=>list[Math.floor(random()*list.length)]!;
  const randomOffer=(who:Who):TradeOffer=>({coins:random()<.5?Math.floor(random()*2000):0,items:random()<.6?[{itemId:pick(pool),quantity:1+Math.floor(random()*6)}]:[],vehicles:random()<.3?[pick(motos)]:[]});
  let happened=0,refused=0;
  for(let round=0;round<12;round++){
    const batch=await Promise.all(Array.from({length:6},()=>{
      const a=pick(people);let b=pick(people);while(b===a)b=pick(people);
      const oa=randomOffer(a),ob=randomOffer(b);
      // Sometimes asking for the same key from both ends.
      return (ob.vehicles[0]&&ob.vehicles[0]===oa.vehicles[0]?commit(s,a,oa,b,{...ob,vehicles:[]}):commit(s,a,oa,b,ob));
    }));
    for(const answer of batch){
      if(answer.statusCode===200)happened++;
      else if(answer.statusCode===409||answer.statusCode===400)refused++;
      else assert.fail(`${answer.statusCode}: ${answer.body}`);
    }
    assert.equal(await totalCoins(),coins0,`round ${round}`);assert.equal(await totalItems(),items0,`round ${round}`);
    const owners=await s.db.select({id:playerVehicles.id,userId:playerVehicles.userId}).from(playerVehicles);
    assert.equal(owners.length,motos.length);assert.ok(owners.every(row=>people.some(person=>person.userId===row.userId)));
    const lows=await s.db.select().from(wallets);assert.ok(lows.every(row=>row.balance>=0));
    const stacks=await s.db.select().from(itemInventory);assert.ok(stacks.every(row=>row.quantity>0&&row.quantity<=10));
  }
  assert.ok(happened>5&&refused>5,`${happened} done, ${refused} refused`);
  assert.equal((await s.db.select().from(trades)).length,happened);
});

test('buying: each vehicle gets its own plate and its key, the same click buys once, and there is a most',async t=>{
  const s=await setup(t),ana=await s.player('ana6',35_000);
  const buy=(requestId=randomUUID())=>s.app.inject({method:'POST',url:'/api/vehicles/buy',headers:{cookie:ana.cookie},payload:{requestId}});
  const requestId=randomUUID(),first=await buy(requestId);
  assert.equal(first.statusCode,200,first.body);assert.equal(first.json().balance,25_000);assert.equal(first.json().vehicles.length,1);
  assert.ok(PLATE.test(first.json().vehicles[0].plate),first.json().vehicles[0].plate);
  assert.equal((await buy(requestId)).json().balance,25_000);
  const second=await buy();assert.equal(second.json().balance,15_000);assert.equal(second.json().vehicles.length,2);
  assert.notEqual(second.json().vehicles[0].plate,second.json().vehicles[1].plate);
  const pack=(await s.app.inject({method:'GET',url:'/api/inventory',headers:{cookie:ana.cookie}})).json();
  // Keys take no slot, and nothing in the catalogue can be a key: there is nothing to discard or lose.
  assert.equal(pack.keys.length,2);assert.equal(pack.usedSlots,0);assert.equal(pack.stacks.length,0);
  assert.match(VEHICLE_KEY.description,/nunca cai/);
  assert.equal(ITEM_CATALOG.some(item=>(item.name as string)===VEHICLE_KEY.name),false);
  const access=await s.app.inject({method:'POST',url:'/api/internal/validate',headers:s.internal,payload:{sessionId:ana.sessionId,userId:ana.userId}});
  assert.equal(access.json().vehicles.length,2);
  // At the most, even with the coins.
  for(let i=0;i<GARAGE.VEHICLE_LIMIT-2;i++)await bike(s,ana);
  await s.db.update(wallets).set({balance:50_000}).where(eq(wallets.userId,ana.userId));
  const over=await buy();assert.equal(over.statusCode,409);assert.equal(await coinsOf(s,ana),50_000);
});
