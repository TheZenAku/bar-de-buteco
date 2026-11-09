import test from 'node:test';import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';import {eq} from 'drizzle-orm';
import {SPARRING,SPARRING_TIERS} from '@bar/shared';import {internalSecret} from '@bar/shared/tickets';
import {createApi} from '../src/app.js';import {readConfig} from '../src/config.js';
import {currencyLedger,sparringProgress,users,wallets} from '../src/database/schema.js';

test("Zeca's ladder: each win pays its step and moves up, the hardest starts it over, the wait is 6 h for players and none for administrators, a retry pays once",{timeout:120000},async t=>{
  const api=await createApi({config:{...readConfig(),dataPath:'memory://',databaseUrl:undefined,autoVerifyEmail:true},rateLimit:false,migrate:true});t.after(()=>api.app.close());
  const internal={'x-internal-secret':internalSecret()};
  async function account(name:string){
    const registered=await api.app.inject({method:'POST',url:'/api/auth/register',payload:{username:name,displayName:name,email:`${name}@zeca.test`,password:'SenhaBoaDeTeste2026!'}});assert.equal(registered.statusCode,201,registered.body);
    const userId=registered.json().user.id as string,cookie=`${registered.cookies[0]!.name}=${registered.cookies[0]!.value}`;
    await api.app.inject({method:'GET',url:'/api/inventory',headers:{cookie}});return {userId};
  }
  const player=await account('zeca_player'),admin=await account('zeca_admin');
  await api.db.update(users).set({role:'admin'}).where(eq(users.id,admin.userId));
  const status=async(userId:string)=>(await api.app.inject({method:'POST',url:'/api/internal/sparring/status',headers:internal,payload:{userId}})).json();
  const win=(userId:string,requestId=randomUUID())=>api.app.inject({method:'POST',url:'/api/internal/sparring/win',headers:internal,payload:{userId,requestId}});
  const balance=async(userId:string)=>(await api.db.select().from(wallets).where(eq(wallets.userId,userId)))[0]!.balance;
  const ago=(ms:number)=>api.db.update(sparringProgress).set({lastWinAt:new Date(Date.now()-ms)}).where(eq(sparringProgress.userId,player.userId));

  // Not authorized from outside; a new player is on the first step with no wait.
  assert.equal((await api.app.inject({method:'POST',url:'/api/internal/sparring/win',headers:{},payload:{userId:player.userId,requestId:randomUUID()}})).statusCode,401);
  assert.deepEqual(await status(player.userId),{tier:0,cooldownMs:0,unlimited:false});

  // The first win pays 100 and moves them to the second step; the same fight again pays nothing more.
  const start=await balance(player.userId),id=randomUUID(),first=await win(player.userId,id);
  assert.equal(first.statusCode,200,first.body);
  assert.deepEqual([first.json().prize,first.json().beaten,first.json().tier,first.json().balance],[SPARRING_TIERS[0]!.prize,0,1,start+SPARRING_TIERS[0]!.prize]);
  assert.equal(SPARRING_TIERS[0]!.prize,100);
  const again=await win(player.userId,id);
  assert.equal(again.statusCode,200);assert.equal(again.json().prize,SPARRING_TIERS[0]!.prize);
  assert.equal(await balance(player.userId),start+SPARRING_TIERS[0]!.prize,'paid once');
  assert.equal((await api.db.select().from(currencyLedger).where(eq(currencyLedger.id,`sparring:${id}`))).length,1);

  // Within the wait, another fight is not worth a prize (409) and nothing moves.
  const waiting=await status(player.userId);
  assert.equal(waiting.tier,1);assert.ok(waiting.cooldownMs>SPARRING.cooldownMs-60_000&&waiting.cooldownMs<=SPARRING.cooldownMs);
  const early=await win(player.userId);assert.equal(early.statusCode,409);
  assert.equal(await balance(player.userId),start+100);assert.equal((await status(player.userId)).tier,1);

  // After the wait, the second step pays more; then the third; and after the hardest the ladder starts over.
  await ago(SPARRING.cooldownMs+1000);
  assert.equal((await status(player.userId)).cooldownMs,0);
  const second=(await win(player.userId)).json();
  assert.deepEqual([second.prize,second.beaten,second.tier],[SPARRING_TIERS[1]!.prize,1,2]);
  await ago(SPARRING.cooldownMs+1000);
  const third=(await win(player.userId)).json();
  assert.deepEqual([third.prize,third.beaten,third.tier],[SPARRING_TIERS[2]!.prize,2,0]);
  assert.ok(SPARRING_TIERS[0]!.prize<SPARRING_TIERS[1]!.prize&&SPARRING_TIERS[1]!.prize<SPARRING_TIERS[2]!.prize,'the prize grows with each step');
  assert.equal(await balance(player.userId),start+100+200+300);
  assert.equal((await api.db.select().from(sparringProgress).where(eq(sparringProgress.userId,player.userId)))[0]!.wins,3);

  // 5 h 59 min is still a wait; 6 h is not.
  await ago(SPARRING.cooldownMs-60_000);assert.equal((await win(player.userId)).statusCode,409);
  await ago(SPARRING.cooldownMs);assert.equal((await win(player.userId)).statusCode,200);

  // An administrator has no wait: back to back, up the ladder.
  assert.deepEqual(await status(admin.userId),{tier:0,cooldownMs:0,unlimited:true});
  const prizes:number[]=[];
  for(let i=0;i<4;i++){const answer=await win(admin.userId);assert.equal(answer.statusCode,200,answer.body);prizes.push(answer.json().prize);}
  assert.deepEqual(prizes,[100,200,300,100]);
  assert.equal((await status(admin.userId)).cooldownMs,0);

  // An unknown account has nothing to win.
  assert.equal((await api.app.inject({method:'POST',url:'/api/internal/sparring/status',headers:internal,payload:{userId:randomUUID()}})).statusCode,404);
});
