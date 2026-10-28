import {test} from 'node:test';import assert from 'node:assert/strict';
import {verifyTicket} from '@bar/shared/tickets';
import {SKINS} from '@bar/shared';
import {createApi} from '../src/app.js';import {readConfig} from '../src/config.js';import {sessions} from '../src/database/schema.js';

test('development bots: a ticket marked as a bot for an account made on first use, with every skin, coins and one reused session',async t=>{
  const config={...readConfig(),dataPath:'memory://',databaseUrl:undefined};
  const api=await createApi({config,rateLimit:false,migrate:true});t.after(()=>api.app.close());
  const bot=(index:number,secret=config.internalSecret)=>api.app.inject({method:'POST',url:'/api/internal/dev/bot',payload:{index},headers:{'x-internal-secret':secret}});
  assert.equal((await bot(1,'wrong')).statusCode,401,'Only the world and the bot script, with the internal secret');
  assert.equal((await bot(0)).statusCode,400);
  const first=(await bot(2)).json(),claims=verifyTicket(first.ticket,config.authSecret);
  assert.equal(claims.bot,true);assert.equal(claims.userId,first.userId);assert.equal(first.displayName,'Bot Tião');
  const validation=(await api.app.inject({method:'POST',url:'/api/internal/validate',headers:{'x-internal-secret':config.internalSecret},payload:{sessionId:claims.sessionId,userId:claims.userId}})).json();
  assert.equal(validation.valid,true);assert.equal(validation.balance,5000);
  assert.deepEqual(validation.ownedSkins,SKINS.map(s=>s.id));assert.equal(validation.equippedSkin,SKINS[1].id,'Each bot wears the next skin');
  const again=(await bot(2)).json();
  assert.equal(again.userId,first.userId);assert.equal(verifyTicket(again.ticket,config.authSecret).sessionId,claims.sessionId,'The session is reused');
  assert.equal((await api.db.select().from(sessions)).length,1);
  assert.equal((await api.app.inject({method:'POST',url:'/api/auth/login',payload:{email:'bot-02@bots.bar.local',password:'anything-at-all'}})).statusCode,401,'Nobody logs in as a bot');
});

test('production has no bot route',async t=>{
  const development=await createApi({config:{...readConfig(),dataPath:'memory://',databaseUrl:undefined},rateLimit:false,migrate:true});t.after(()=>development.app.close());
  const config={...readConfig(),production:true,mailEnabled:false};
  const api=await createApi({config,database:development.db,rateLimit:false});t.after(()=>api.app.close());
  assert.equal((await api.app.inject({method:'POST',url:'/api/internal/dev/bot',payload:{index:1},headers:{'x-internal-secret':config.internalSecret}})).statusCode,404);
});
