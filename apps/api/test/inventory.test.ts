import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {and,eq} from 'drizzle-orm';
import {verifyTicket} from '@bar/shared/tickets';
import {createApi} from '../src/app.js';
import {readConfig} from '../src/config.js';
import {currencyLedger,inventoryLedger,itemInventory,wallets,weaponArsenal} from '../src/database/schema.js';

test('fireworks purchases persist, respect the stack limit and charge only once on retry',async t=>{
  const config={...readConfig(),dataPath:'memory://',databaseUrl:undefined,autoVerifyEmail:true};
  const api=await createApi({config,rateLimit:false,migrate:true});t.after(()=>api.app.close());
  const register=await api.app.inject({method:'POST',url:'/api/auth/register',payload:{email:'fireworks@example.com',username:'fireworks',displayName:'Festeiro',password:'InventarioSeguro2026!'}});
  assert.equal(register.statusCode,201);
  const cookie=`${register.cookies[0].name}=${register.cookies[0].value}`,userId=register.json().user.id as string;
  const get=()=>api.app.inject({method:'GET',url:'/api/inventory',headers:{cookie}});
  await get();await api.db.update(wallets).set({balance:500}).where(eq(wallets.userId,userId));
  const requestId=randomUUID(),buy=()=>api.app.inject({method:'POST',url:'/api/inventory/buy',headers:{cookie},payload:{itemId:'rojao',quantity:10,requestId}});
  const bought=await Promise.all([buy(),buy()]);assert.ok(bought.every(response=>response.statusCode===200));
  const view=(await get()).json();assert.equal(view.balance,150);assert.equal(view.stacks.find((s:any)=>s.itemId==='rojao').quantity,10);
  assert.equal(view.history.filter((entry:any)=>entry.itemId==='rojao'&&entry.reason==='purchase').length,1);
  const full=await api.app.inject({method:'POST',url:'/api/inventory/buy',headers:{cookie},payload:{itemId:'rojao',quantity:1,requestId:randomUUID()}});
  assert.equal(full.statusCode,409);assert.equal((await get()).json().balance,150);
});

test('inventory persists starters and makes purchases and removals atomic and idempotent',async t=>{
  const config={...readConfig(),dataPath:'memory://',databaseUrl:undefined,autoVerifyEmail:true};
  const api=await createApi({config,rateLimit:false,migrate:true});t.after(()=>api.app.close());
  const account={email:'inventory@example.com',username:'inventory',displayName:'Mochileiro',password:'InventarioSeguro2026!'};
  const register=await api.app.inject({method:'POST',url:'/api/auth/register',payload:account});
  assert.equal(register.statusCode,201);
  const cookie=`${register.cookies[0].name}=${register.cookies[0].value}`,userId=register.json().user.id as string;
  const get=()=>api.app.inject({method:'GET',url:'/api/inventory',headers:{cookie}});
  const post=(url:string,payload:object)=>api.app.inject({method:'POST',url,payload,headers:{cookie}});

  const first=(await get()).json();
  assert.deepEqual(first.stacks,[{itemId:'agua',quantity:2},{itemId:'coxinha',quantity:1},{itemId:'curativo',quantity:1}]);
  assert.equal(first.usedSlots,3);assert.equal(first.capacity,12);assert.equal(first.balance,0);
  assert.equal(first.history.filter((entry:any)=>entry.reason==='starter').length,3);
  await get();
  assert.equal((await api.db.select().from(itemInventory).where(eq(itemInventory.userId,userId))).length,3,'reading twice cannot duplicate the starter kit');

  assert.equal((await post('/api/inventory/buy',{itemId:'agua',quantity:1,requestId:randomUUID()})).statusCode,409,'the wallet cannot go negative');
  await api.db.update(wallets).set({balance:100}).where(eq(wallets.userId,userId));

  const duplicateId=randomUUID();
  const duplicates=await Promise.all([0,1].map(()=>post('/api/inventory/buy',{itemId:'agua',quantity:8,requestId:duplicateId})));
  assert.ok(duplicates.every(response=>response.statusCode===200));
  let view=(await get()).json();
  assert.equal(view.balance,4);assert.equal(view.stacks.find((stack:any)=>stack.itemId==='agua').quantity,10);
  assert.equal((await post('/api/inventory/buy',{itemId:'agua',quantity:1,requestId:randomUUID()})).statusCode,409,'a stack cannot exceed its catalogue limit');
  assert.equal((await post('/api/inventory/buy',{itemId:'agua',quantity:1,price:0,requestId:randomUUID()})).statusCode,400,'the client cannot choose a price');
  assert.equal((await post('/api/inventory/buy',{itemId:'inexistente',quantity:1,requestId:randomUUID()})).statusCode,400);

  const ticket=await post('/api/game-ticket',{}),claims=verifyTicket(ticket.json().ticket,config.authSecret);
  const removeId=randomUUID(),remove={sessionId:claims.sessionId,userId,itemId:'agua',quantity:3,reason:'use',requestId:removeId};
  const internal=(payload:object)=>api.app.inject({method:'POST',url:'/api/internal/inventory',headers:{'x-internal-secret':config.internalSecret},payload});
  assert.equal((await internal(remove)).statusCode,200);
  assert.equal((await internal(remove)).statusCode,200,'repeating the same room command is harmless');
  view=(await get()).json();assert.equal(view.stacks.find((stack:any)=>stack.itemId==='agua').quantity,7);
  assert.equal((await internal({...remove,requestId:randomUUID(),sessionId:randomUUID()})).statusCode,401,'only the live session can consume items');

  const charges=(await api.db.select().from(currencyLedger)).filter(row=>row.reason==='item:agua:8');
  const movements=await api.db.select().from(inventoryLedger).where(eq(inventoryLedger.userId,userId));
  assert.equal(charges.length,1);assert.equal(charges[0]?.amount,-96);
  assert.equal(movements.filter(row=>row.reason==='purchase').length,1);
  assert.equal(movements.filter(row=>row.reason==='use').length,1);
});

test('Ribeiro grants finished weapons to the backpack and equipping moves one atomically into the wheel',async t=>{
  const config={...readConfig(),dataPath:'memory://',databaseUrl:undefined,autoVerifyEmail:true};
  const api=await createApi({config,rateLimit:false,migrate:true});t.after(()=>api.app.close());
  const register=await api.app.inject({method:'POST',url:'/api/auth/register',payload:{email:'ribeiro-stock@example.com',username:'ribeiro_stock',displayName:'Estoquista',password:'InventarioSeguro2026!'}});
  assert.equal(register.statusCode,201,register.body);const userId=register.json().user.id as string,requestId=randomUUID();
  const grant=(quantity:number,id=requestId)=>api.app.inject({method:'POST',url:'/api/internal/inventory/grant',headers:{'x-internal-secret':config.internalSecret},payload:{userId,itemId:'arma_pistola',quantity,reason:'ribeiro',requestId:id}});
  const first=await grant(4);assert.equal(first.statusCode,200,first.body);assert.equal(first.json().applied,true);assert.equal(first.json().view.stacks.find((stack:any)=>stack.itemId==='arma_pistola').quantity,4);
  const retry=await grant(4);assert.equal(retry.statusCode,200,retry.body);assert.equal(retry.json().applied,false);assert.equal(retry.json().view.stacks.find((stack:any)=>stack.itemId==='arma_pistola').quantity,4);
  const tooMany=await grant(7,randomUUID());assert.equal(tooMany.statusCode,409,tooMany.body);
  let [stored]=await api.db.select().from(itemInventory).where(and(eq(itemInventory.userId,userId),eq(itemInventory.itemId,'arma_pistola')));assert.equal(stored?.quantity,4);
  const equipId=randomUUID(),equip=()=>api.app.inject({method:'POST',url:'/api/internal/inventory/equip-weapon',headers:{'x-internal-secret':config.internalSecret},payload:{userId,itemId:'arma_pistola',weapon:'pistola',requestId:equipId}});
  const equippedResponses=await Promise.all([equip(),equip()]);assert.ok(equippedResponses.every(response=>response.statusCode===200));const equipped=equippedResponses[0]!;assert.equal(equipped.json().applied,true);
  assert.equal(equipped.json().view.stacks.find((stack:any)=>stack.itemId==='arma_pistola').quantity,3);
  assert.equal(equipped.json().arsenal.weapons.find((weapon:any)=>weapon.id==='pistola').equipped,true);
  stored=(await api.db.select().from(itemInventory).where(and(eq(itemInventory.userId,userId),eq(itemInventory.itemId,'arma_pistola'))))[0];assert.equal(stored?.quantity,3);
  const [owned]=await api.db.select().from(weaponArsenal).where(and(eq(weaponArsenal.userId,userId),eq(weaponArsenal.weaponId,'pistola')));assert.equal(owned?.equipped,true);
  const duplicate=await api.app.inject({method:'POST',url:'/api/internal/inventory/equip-weapon',headers:{'x-internal-secret':config.internalSecret},payload:{userId,itemId:'arma_pistola',weapon:'pistola',requestId:randomUUID()}});
  assert.equal(duplicate.statusCode,409);assert.equal(duplicate.json().error,'Esta arma já está no seu arsenal.');
});
