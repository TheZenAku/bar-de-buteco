import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {eq} from 'drizzle-orm';
import {JOB_DAILY_CAP} from '@bar/shared';
import {verifyTicket} from '@bar/shared/tickets';
import {createApi} from '../src/app.js';
import {readConfig} from '../src/config.js';
import {currencyLedger,wallets} from '../src/database/schema.js';

test('the world wallet charges, refunds once, caps job pay per day and only for the live session',async t=>{
  const config={...readConfig(),dataPath:'memory://',databaseUrl:undefined,autoVerifyEmail:true};
  const api=await createApi({config,rateLimit:false,migrate:true});t.after(()=>api.app.close());
  const register=await api.app.inject({method:'POST',url:'/api/auth/register',payload:{email:'wallet@example.com',username:'carteira',displayName:'Carteira',password:'CarteiraSegura2026!'}});
  const cookie=`${register.cookies[0].name}=${register.cookies[0].value}`,userId=register.json().user.id as string;
  const ticket=await api.app.inject({method:'POST',url:'/api/game-ticket',headers:{cookie},payload:{}}),{sessionId}=verifyTicket(ticket.json().ticket,config.authSecret);
  const wallet=(amount:number,reason:string,requestId=randomUUID(),session=sessionId)=>api.app.inject({method:'POST',url:'/api/internal/wallet',headers:{'x-internal-secret':config.internalSecret},payload:{sessionId:session,userId,amount,reason,requestId}});
  await api.app.inject({method:'GET',url:'/api/inventory',headers:{cookie}});
  await api.db.update(wallets).set({balance:100}).where(eq(wallets.userId,userId));

  assert.equal((await wallet(-200,'media:jukebox')).statusCode,409,'never below zero');
  const debit=randomUUID();
  const twice=await Promise.all([wallet(-30,'table:coxinha',debit),wallet(-30,'table:coxinha',debit)]);
  assert.ok(twice.every(r=>r.statusCode===200));
  assert.deepEqual(twice.map(r=>r.json().balance),[70,70],'the same request is charged once');
  assert.equal((await wallet(-1,'qualquer:coisa')).statusCode,400,'unknown reasons are refused');
  assert.equal((await wallet(50,'media:jukebox')).statusCode,403,'the world only pays for work or refunds');
  assert.equal((await wallet(-5,'media:jukebox',randomUUID(),randomUUID())).statusCode,401,'only the live session');
  assert.equal((await api.app.inject({method:'POST',url:'/api/internal/wallet',payload:{sessionId,userId,amount:-1,reason:'media:tv',requestId:randomUUID()}})).statusCode,401,'internal secret required');

  // Refunds: at most what was charged, once, and only an existing debit.
  let refund=await wallet(999,`refund:${debit}`);
  assert.equal(refund.statusCode,200);assert.deepEqual(refund.json(),{balance:100,applied:30});
  refund=await wallet(30,`refund:${debit}`);assert.deepEqual(refund.json(),{balance:100,applied:30},'a second refund changes nothing');
  assert.equal((await wallet(10,`refund:${randomUUID()}`)).statusCode,409);

  // Job pay stops at the daily cap; a capped task is still recorded so it is never paid later.
  let total=0;for(let i=0;total<JOB_DAILY_CAP;i++){const r=(await wallet(60,`job:bar:shift:${i}`)).json();total+=r.applied;}
  assert.equal(total,JOB_DAILY_CAP);
  const capped=await wallet(6,'job:bar:shift:extra');assert.equal(capped.json().applied,0);
  assert.equal(capped.json().balance,100+JOB_DAILY_CAP);
  const ledger=await api.db.select().from(currencyLedger).where(eq(currencyLedger.userId,userId));
  assert.ok(ledger.some(row=>row.reason==='job:bar:shift:extra'&&row.amount===0));
});
