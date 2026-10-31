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

test('a blackjack round is paid once, only against its own bets on the ledger, never above 2.5 times them',async t=>{
  const config={...readConfig(),dataPath:'memory://',databaseUrl:undefined,autoVerifyEmail:true};
  const api=await createApi({config,rateLimit:false,migrate:true});t.after(()=>api.app.close());
  const register=await api.app.inject({method:'POST',url:'/api/auth/register',payload:{email:'mesa@example.com',username:'mesa21',displayName:'Mesa',password:'CarteiraSegura2026!'}});
  const cookie=`${register.cookies[0].name}=${register.cookies[0].value}`,userId=register.json().user.id as string;
  const ticket=await api.app.inject({method:'POST',url:'/api/game-ticket',headers:{cookie},payload:{}}),{sessionId}=verifyTicket(ticket.json().ticket,config.authSecret);
  const headers={'x-internal-secret':config.internalSecret};
  const bet=(roundId:string,amount:number,requestId=randomUUID())=>api.app.inject({method:'POST',url:'/api/internal/wallet',headers,payload:{sessionId,userId,amount:-amount,reason:`blackjack:bet:${roundId}`,requestId}}).then(r=>({status:r.statusCode,requestId}));
  const settle=(roundId:string,payout:number,stakes:string[],voids:string[]=[])=>api.app.inject({method:'POST',url:'/api/internal/blackjack/settle',headers,payload:{userId,roundId,payout,stakes,voids}});
  await api.app.inject({method:'GET',url:'/api/inventory',headers:{cookie}});
  await api.db.update(wallets).set({balance:1000}).where(eq(wallets.userId,userId));

  assert.equal((await api.app.inject({method:'POST',url:'/api/internal/wallet',headers,payload:{sessionId,userId,amount:500,reason:'blackjack:payout:x',requestId:randomUUID()}})).statusCode,403,'the plain wallet route never pays a bet');
  const round=randomUUID(),main=await bet(round,100),double=await bet(round,100);
  assert.deepEqual([main.status,double.status],[200,200]);
  assert.equal((await settle(round,501,[main.requestId,double.requestId])).statusCode,409,'above 2.5 times the stakes');
  assert.equal((await settle(round,400,[main.requestId,randomUUID()])).statusCode,409,'a stake that is not on the ledger');
  const other=randomUUID(),foreign=await bet(other,50);
  assert.equal((await settle(round,100,[foreign.requestId])).statusCode,409,'a bet of another round');
  const paid=await settle(round,400,[main.requestId,double.requestId]);
  assert.deepEqual(paid.json(),{balance:1150,applied:400});
  const again=await Promise.all([settle(round,400,[main.requestId,double.requestId]),settle(round,250,[main.requestId,double.requestId])]);
  assert.ok(again.every(r=>r.json().balance===1150&&r.json().applied===400),'once per round and player');
  // A crash left the other round in play: its unanswered stakes come back for exactly what was taken.
  const refund=await settle(other,0,[],[foreign.requestId,randomUUID()]);
  assert.deepEqual(refund.json(),{balance:1200,applied:50});
  const ledger=await api.db.select().from(currencyLedger).where(eq(currencyLedger.userId,userId));
  assert.ok(ledger.some(row=>row.reason===`blackjack:payout:${round}`&&row.amount===400));
  assert.ok(ledger.some(row=>row.reason===`blackjack:refund:${other}`&&row.amount===50));
  assert.equal((await api.app.inject({method:'POST',url:'/api/internal/blackjack/settle',payload:{userId,roundId:round,payout:1,stakes:[],voids:[]}})).statusCode,401,'internal secret required');
});

test('a pebolim match pays its winners against the match stakes on the ledger: at most twice each, never above the pot',async t=>{
  const config={...readConfig(),dataPath:'memory://',databaseUrl:undefined,autoVerifyEmail:true};
  const api=await createApi({config,rateLimit:false,migrate:true});t.after(()=>api.app.close());
  const headers={'x-internal-secret':config.internalSecret};
  // Three players: Ana and Bia win a 2x2 against Caio (whose partner never paid in this test).
  const players=await Promise.all(['ana','bia','caio'].map(async name=>{
    const register=await api.app.inject({method:'POST',url:'/api/auth/register',payload:{email:`${name}@pebolim.example`,username:`${name}_toto`,displayName:name,password:'CarteiraSegura2026!'}});
    const cookie=`${register.cookies[0].name}=${register.cookies[0].value}`,userId=register.json().user.id as string;
    const ticket=await api.app.inject({method:'POST',url:'/api/game-ticket',headers:{cookie},payload:{}}),{sessionId}=verifyTicket(ticket.json().ticket,config.authSecret);
    await api.app.inject({method:'GET',url:'/api/inventory',headers:{cookie}});
    await api.db.update(wallets).set({balance:500}).where(eq(wallets.userId,userId));
    return {userId,sessionId};
  }));
  const match=randomUUID();
  const stake=async(p:{userId:string;sessionId:string},amount:number)=>{const requestId=randomUUID();const r=await api.app.inject({method:'POST',url:'/api/internal/wallet',headers,payload:{sessionId:p.sessionId,userId:p.userId,amount:-amount,reason:`foosball:bet:${match}`,requestId}});assert.equal(r.statusCode,200);return requestId;};
  const settle=(p:{userId:string},payout:number,stakes:string[],voids:string[]=[])=>api.app.inject({method:'POST',url:'/api/internal/foosball/settle',headers,payload:{userId:p.userId,roundId:match,payout,stakes,voids}});
  const [ana,bia,caio]=players as [typeof players[0],typeof players[0],typeof players[0]];
  const stakes=[await stake(ana,100),await stake(bia,100),await stake(caio,100)];
  assert.equal((await settle(ana,201,[stakes[0]!])).statusCode,409,'above twice the stake');
  assert.equal((await settle(ana,200,[stakes[1]!])).statusCode,409,'another player\'s stake');
  assert.deepEqual((await settle(ana,200,[stakes[0]!])).json(),{balance:600,applied:200});
  // The pot holds 300: Ana took 200, so Bia's 200 would take more than the match had.
  assert.equal((await settle(bia,200,[stakes[1]!])).statusCode,409,'never above the pot');
  assert.deepEqual((await settle(bia,100,[stakes[1]!])).json(),{balance:500,applied:100});
  assert.deepEqual((await settle(caio,0,[stakes[2]!])).json(),{balance:400,applied:0},'the loser settles at zero');
  assert.deepEqual((await settle(ana,200,[stakes[0]!])).json(),{balance:600,applied:200},'once per match and player');
  const ledger=await api.db.select().from(currencyLedger).where(eq(currencyLedger.userId,ana.userId));
  assert.ok(ledger.some(row=>row.reason===`foosball:payout:${match}`&&row.amount===200));
});
