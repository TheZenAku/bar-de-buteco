import {test} from 'node:test';import assert from 'node:assert/strict';import {eq} from 'drizzle-orm';
import {DEFAULT_CHARACTER} from '@bar/shared';import {verifyTicket} from '@bar/shared/tickets';
import {createApi} from '../src/app.js';import {readConfig} from '../src/config.js';import {wallets,skinInventory,currencyLedger} from '../src/database/schema.js';

test('creator, ownership and purchases persist; duplicate/racing requests cannot mint coins or duplicate charges',async t=>{
  const config={...readConfig(),dataPath:'memory://',databaseUrl:undefined,autoVerifyEmail:true};
  const api=await createApi({config,rateLimit:false});t.after(()=>api.app.close());
  const account={email:'character@example.com',username:'character',displayName:'Personagem',password:'PersonagemSeguro2026!'};
  const register=await api.app.inject({method:'POST',url:'/api/auth/register',payload:account});assert.equal(register.statusCode,201);
  const cookie=`${register.cookies[0].name}=${register.cookies[0].value}`,userId=register.json().user.id;
  const post=(url:string,payload:object)=>api.app.inject({method:'POST',url,payload,headers:{cookie}});
  const get=(url:string)=>api.app.inject({url,headers:{cookie}});
  assert.equal(register.json().user.character,null);
  assert.equal((await post('/api/game-ticket',{})).statusCode,409);
  assert.equal((await post('/api/character',{...DEFAULT_CHARACTER,hair:'unavailable'})).statusCode,400);
  assert.equal((await post('/api/character',{...DEFAULT_CHARACTER,balance:900000})).statusCode,400);
  const character={...DEFAULT_CHARACTER,body:'female',hair:'buns',beard:true};
  assert.equal((await post('/api/character',character)).statusCode,200);
  let view=(await get('/api/wardrobe')).json();assert.equal(view.balance,0);assert.ok(view.catalog.every((s:any)=>!s.owned));
  assert.equal((await post('/api/wardrobe/daily',{})).statusCode,409,'No income is enabled by default');
  assert.equal((await post('/api/wardrobe/buy',{skin:'nathan'})).statusCode,409);
  assert.equal((await post('/api/wardrobe/equip',{skin:'rafael'})).statusCode,403);
  assert.equal((await post('/api/wardrobe/buy',{skin:'rafael',price:0})).statusCode,400);
  await api.db.update(wallets).set({balance:1000}).where(eq(wallets.userId,userId)); // Controlled test funds, never a public route.
  const duplicates=await Promise.all([0,1,2].map(()=>post('/api/wardrobe/buy',{skin:'nathan'})));
  assert.ok(duplicates.every(r=>r.statusCode===200));
  view=(await get('/api/wardrobe')).json();assert.equal(view.balance,500);assert.equal(view.catalog.filter((s:any)=>s.owned).length,1);
  assert.equal((await api.db.select().from(skinInventory)).length,1);
  assert.equal((await api.db.select().from(currencyLedger)).filter(r=>r.reason==='skin:nathan').length,1);
  assert.equal((await post('/api/wardrobe/equip',{skin:'nathan'})).statusCode,200);
  assert.equal((await get('/api/auth/me')).json().user.equippedSkin,'nathan');
  assert.deepEqual((await get('/api/auth/me')).json().user.character,character);
  const ticket=await post('/api/game-ticket',{}),claims=verifyTicket(ticket.json().ticket,config.authSecret);
  const validation=await api.app.inject({method:'POST',url:'/api/internal/validate',headers:{'x-internal-secret':config.authSecret},payload:{sessionId:claims.sessionId,userId}});
  assert.deepEqual(validation.json().ownedSkins,['nathan']);assert.deepEqual(validation.json().character,character);
  assert.equal((await post('/api/wardrobe/equip',{skin:'custom'})).statusCode,200);
  assert.deepEqual((await get('/api/wardrobe')).json().character,character,'Equipping a premium skin must preserve the custom character');
  await api.db.update(wallets).set({balance:1000}).where(eq(wallets.userId,userId));
  const race=await Promise.all(['leandro','rafael'].map(skin=>post('/api/wardrobe/buy',{skin})));
  assert.equal(race.filter(r=>r.statusCode===200).length,1);assert.equal(race.filter(r=>r.statusCode===409).length,1);
  assert.ok((await get('/api/wardrobe')).json().balance>=0);
  await post('/api/auth/logout',{});
  const login=await api.app.inject({method:'POST',url:'/api/auth/login',payload:{email:account.email,password:account.password}});
  assert.deepEqual(login.json().user.character,character);assert.equal(login.json().user.equippedSkin,'custom');
  const newCookie=`${login.cookies[0].name}=${login.cookies[0].value}`;
  const dressed={...DEFAULT_CHARACTER,top:'sweater',bottom:'trousers',footwear:'derby',accessory:'glasses',topColor:'#873e37',bottomColor:'#111820',footwearColor:'#d7d5d0'};
  assert.equal((await api.app.inject({method:'POST',url:'/api/character',headers:{cookie:newCookie},payload:{...dressed,top:'not-installed'}})).statusCode,400);
  assert.equal((await api.app.inject({method:'POST',url:'/api/character',headers:{cookie:newCookie},payload:dressed})).statusCode,200);
  for(const skin of ['nathan','custom']){
    assert.equal((await api.app.inject({method:'POST',url:'/api/wardrobe/equip',headers:{cookie:newCookie},payload:{skin}})).statusCode,200);
    const wardrobe=await api.app.inject({url:'/api/wardrobe',headers:{cookie:newCookie}});assert.deepEqual(wardrobe.json().character,dressed);
  }
  await api.app.inject({method:'POST',url:'/api/auth/logout',headers:{cookie:newCookie},payload:{}});
  const dressedLogin=await api.app.inject({method:'POST',url:'/api/auth/login',payload:{email:account.email,password:account.password}});
  assert.deepEqual(dressedLogin.json().user.character,dressed,'garment slots and independent colors survive logging in again');
});
