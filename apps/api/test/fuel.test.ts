import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {eq} from 'drizzle-orm';
import {verifyTicket} from '@bar/shared/tickets';
import {createApi} from '../src/app.js';import {readConfig} from '../src/config.js';import {wallets,currencyLedger} from '../src/database/schema.js';

test('fuel reservation does not debit, protects concurrent spending, settles once after logout and frees unused funds',async t=>{
  const config={...readConfig(),dataPath:'memory://',databaseUrl:undefined,autoVerifyEmail:true},api=await createApi({config,migrate:true,rateLimit:false});t.after(()=>api.app.close());
  const registered=await api.app.inject({method:'POST',url:'/api/auth/register',payload:{username:'fuel_test',displayName:'Fuel test',email:'fuel@test.local',password:'CarteiraSegura2026!'}});
  assert.equal(registered.statusCode,201,registered.body);
  const userId=registered.json().user.id as string,cookie=`${registered.cookies[0]!.name}=${registered.cookies[0]!.value}`;
  await api.app.inject({method:'GET',url:'/api/inventory',headers:{cookie}});await api.db.update(wallets).set({balance:100}).where(eq(wallets.userId,userId));
  const ticket=await api.app.inject({method:'POST',url:'/api/game-ticket',headers:{cookie},payload:{}}),{sessionId}=verifyTicket(ticket.json().ticket,config.authSecret),headers={'x-internal-secret':config.internalSecret};
  const id=randomUUID(),reserve=(holdId=id,maximum=80)=>api.app.inject({method:'POST',url:'/api/internal/fuel/reserve',headers,payload:{userId,sessionId,id:holdId,maximum}});
  const settle=(total:number,holdId=id)=>api.app.inject({method:'POST',url:'/api/internal/fuel/settle',headers,payload:{userId,id:holdId,total}});
  const balance=async()=>(await api.db.select().from(wallets).where(eq(wallets.userId,userId)))[0]!.balance;
  assert.equal((await reserve()).json().budget,80);assert.equal(await balance(),100);
  assert.equal((await reserve()).json().budget,80,'retry authorizes once');
  const spend=await api.app.inject({method:'POST',url:'/api/internal/wallet',headers,payload:{userId,sessionId,amount:-30,requestId:randomUUID(),reason:'media:jukebox'}});
  assert.equal(spend.statusCode,409,spend.body);assert.equal(await balance(),100,'concurrent debit cannot consume the held funds');
  assert.equal((await settle(81)).statusCode,409);
  const extra=randomUUID();assert.equal((await reserve(extra,80)).json().budget,20,'authorization uses only unreserved funds');
  assert.equal((await reserve(randomUUID(),1)).statusCode,409,'no service starts without available coins');
  assert.equal((await settle(0,extra)).statusCode,200,'cancelling before dispensing releases the entire hold');
  const late=randomUUID();assert.equal((await settle(0,late)).statusCode,200);assert.equal((await reserve(late)).statusCode,409,'late authorization cannot resurrect a cancelled reservation');
  await api.app.inject({method:'POST',url:'/api/auth/logout',headers:{cookie},payload:{}});
  const twice=await Promise.all([settle(24),settle(24)]);assert.ok(twice.every(r=>r.statusCode===200),twice.map(r=>r.body).join());assert.equal(await balance(),76);
  assert.equal((await api.db.select().from(currencyLedger).where(eq(currencyLedger.id,`fuel:${id}`))).length,1);
  const cancelled=randomUUID();assert.equal((await settle(0,cancelled)).statusCode,200);
  assert.equal((await reserve(cancelled)).statusCode,401,'expired session cannot authorize');
});
