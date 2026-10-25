import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {eq} from 'drizzle-orm';
import {DEFAULT_CHARACTER} from '@bar/shared';
import {verifyTicket} from '@bar/shared/tickets';
import {createApi} from '../src/app.js';
import {readConfig} from '../src/config.js';
import {currencyLedger,inventoryLedger,itemInventory,wallets} from '../src/database/schema.js';

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

  const requestId=randomUUID();
  assert.equal((await post('/api/inventory/buy',{itemId:'agua',quantity:1,requestId})).statusCode,409,'a character is required before shopping');
  assert.equal((await post('/api/character',DEFAULT_CHARACTER)).statusCode,200);
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
