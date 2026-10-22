import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {DEFAULT_CHARACTER,MAX_COIN_BALANCE} from '@bar/shared';
import {createApi} from '../src/app.js';
import {readConfig} from '../src/config.js';
import {OWNER_EMAIL,ensureOwnerAdministrator} from '../src/admin-policy.js';
import {connectDatabase} from '../src/database/index.js';
import {users,wallets,currencyLedger,moderationActions} from '../src/database/schema.js';

const password='AdminTestsOnly2026!';
test('primary account manages administrators, wallets and moderation with persistent authorization',async t=>{
  const config={...readConfig(),production:false,databaseUrl:undefined,dataPath:'memory://',autoVerifyEmail:true};
  const service=await createApi({config,rateLimit:false});t.after(()=>service.app.close());
  const post=(url:string,payload:object,cookie?:string)=>service.app.inject({method:'POST',url,payload,headers:cookie?{cookie}:{}});
  const get=(url:string,cookie?:string)=>service.app.inject({url,headers:cookie?{cookie}:{}});
  async function register(username:string,email=`${username}@admin.test`){
    const response=await post('/api/auth/register',{username,email,displayName:username,password});assert.equal(response.statusCode,201,response.body);
    const cookie=`${response.cookies[0].name}=${response.cookies[0].value}`;
    assert.equal((await post('/api/character',DEFAULT_CHARACTER,cookie)).statusCode,200);
    return {cookie,user:response.json().user};
  }
  const owner=await register('owner',OWNER_EMAIL),staff=await register('staff'),player=await register('player');
  assert.equal(owner.user.role,'admin');assert.equal(owner.user.isOwner,true);
  assert.equal(staff.user.role,'user');assert.equal(staff.user.isOwner,false);
  await ensureOwnerAdministrator(service.db);await ensureOwnerAdministrator(service.db);
  assert.equal((await service.db.select().from(moderationActions)).filter(a=>a.action==='owner-bootstrap').length,1);
  await t.test('ordinary accounts cannot use administrative routes or forge a grant at registration',async()=>{
    assert.equal((await get('/api/admin/overview')).statusCode,401);
    assert.equal((await get('/api/admin/overview',player.cookie)).statusCode,403);
    assert.equal((await post('/api/admin/role',{playerId:player.user.id,role:'admin',reason:'Self grant'},player.cookie)).statusCode,403);
    assert.equal((await post('/api/admin/wallet',{playerId:player.user.id,operation:'add',amount:1,reason:'Self funds',requestId:randomUUID()},player.cookie)).statusCode,403);
    assert.equal((await post('/api/auth/register',{username:'forged',email:'forged@admin.test',displayName:'Forged',password,role:'admin',isOwner:true})).statusCode,400);
  });
  await t.test('owner grants and revokes permissions on the same existing session; primary account remains protected',async()=>{
    assert.equal((await post('/api/admin/role',{playerId:staff.user.id,role:'admin',reason:'Equipe de teste'},owner.cookie)).statusCode,200);
    assert.equal((await get('/api/auth/me',staff.cookie)).json().user.role,'admin');
    const view=(await get('/api/admin/overview?search=STAFF&limit=1',owner.cookie)).json();assert.equal(view.total,1);assert.equal(view.users[0].id,staff.user.id);assert.equal(view.canManageAdmins,true);
    assert.equal((await get('/api/admin/overview',staff.cookie)).json().canManageAdmins,false);
    assert.equal((await post('/api/admin/role',{playerId:player.user.id,role:'admin',reason:'Tentativa indevida'},staff.cookie)).statusCode,403);
    assert.equal((await post('/api/admin/role',{playerId:owner.user.id,role:'user',reason:'Tentativa de remoção'},owner.cookie)).statusCode,403);
    assert.equal((await post('/api/admin/action',{action:'ban',playerId:owner.user.id,reason:'Tentativa contra principal'},staff.cookie)).statusCode,403);
    assert.equal((await post('/api/admin/wallet',{playerId:owner.user.id,operation:'add',amount:1,reason:'Carteira protegida',requestId:randomUUID()},staff.cookie)).statusCode,403);
    assert.equal((await post('/api/admin/action',{action:'event',eventType:'PARTY'},staff.cookie)).statusCode,200);
  });
  await t.test('wallet changes are bounded, auditable and idempotent, including simultaneous retries',async()=>{
    const body={playerId:player.user.id,operation:'add',amount:1500,reason:'Comprar skins para teste',requestId:randomUUID()};
    const responses=await Promise.all([0,1,2].map(()=>post('/api/admin/wallet',body,owner.cookie)));
    assert.ok(responses.every(r=>r.statusCode===200),responses.map(r=>r.body).join('\n'));
    const balance=async()=>(await get('/api/wardrobe',player.cookie)).json().balance;
    assert.equal(await balance(),1500);
    assert.equal((await service.db.select().from(currencyLedger)).filter(r=>r.id===`admin-wallet:${body.requestId}`).length,1);
    assert.equal((await service.db.select().from(moderationActions)).filter(r=>r.action==='coins-add').length,1);
    assert.equal((await post('/api/admin/wallet',{...body,amount:1501},owner.cookie)).statusCode,409);
    const adjust=(values:object)=>post('/api/admin/wallet',{...body,requestId:randomUUID(),...values},owner.cookie);
    assert.equal((await adjust({amount:-1})).statusCode,400);assert.equal((await adjust({amount:1.2})).statusCode,400);
    assert.equal((await adjust({amount:MAX_COIN_BALANCE})).statusCode,409);
    assert.equal((await adjust({operation:'remove',amount:2000})).statusCode,409);
    assert.equal((await adjust({operation:'set',amount:10})).statusCode,400);
    assert.equal((await adjust({operation:'set',amount:10,expectedBalance:1400})).statusCode,409);
    assert.equal(await balance(),1500);
    assert.equal((await adjust({operation:'remove',amount:200})).statusCode,200);assert.equal(await balance(),1300);
    assert.equal((await adjust({operation:'set',amount:0,expectedBalance:1300})).statusCode,200);assert.equal(await balance(),0);
    assert.equal((await adjust({operation:'add',amount:2000})).statusCode,200);
    const price=(await get('/api/wardrobe',player.cookie)).json().catalog.find((s:{id:string})=>s.id==='rafael').price;
    const race=await Promise.all([adjust({amount:500}),post('/api/wardrobe/buy',{skin:'rafael'},player.cookie)]);
    assert.ok(race.every(r=>r.statusCode===200));assert.equal(await balance(),2500-price);
    const [stored]=await service.db.select().from(wallets).where(eq(wallets.userId,player.user.id));assert.equal(stored.balance,2500-price);
  });
  await t.test('kick/ban controls are delivered once; ban revokes sessions; removed administrators lose API access immediately',async()=>{
    assert.equal((await post('/api/admin/action',{action:'kick',playerId:player.user.id,reason:'Teste de expulsão'},staff.cookie)).statusCode,200);
    const headers={'x-internal-secret':config.authSecret};
    const queued=(await service.app.inject({url:'/api/internal/controls',headers})).json().controls;
    assert.ok(queued.some((c:{action:string;playerId:string})=>c.action==='kick'&&c.playerId===player.user.id));
    assert.equal((await service.app.inject({url:'/api/internal/controls',headers})).json().controls.length,0);
    assert.equal((await post('/api/admin/action',{action:'ban',playerId:player.user.id,reason:'Teste de banimento'},staff.cookie)).statusCode,200);
    assert.equal((await get('/api/auth/me',player.cookie)).statusCode,401);
    assert.equal((await post('/api/auth/login',{email:player.user.email,password})).statusCode,403);
    assert.equal((await post('/api/admin/role',{playerId:player.user.id,role:'admin',reason:'Conta banida'},owner.cookie)).statusCode,409);
    assert.equal((await post('/api/admin/action',{action:'unban',playerId:player.user.id,reason:'Fim do teste'},owner.cookie)).statusCode,200);
    assert.equal((await post('/api/auth/login',{email:player.user.email,password})).statusCode,200);
    assert.equal((await post('/api/admin/role',{playerId:staff.user.id,role:'user',reason:'Fim da permissão de teste'},owner.cookie)).statusCode,200);
    assert.equal((await get('/api/admin/overview',staff.cookie)).statusCode,403);
    assert.equal((await post('/api/admin/action',{action:'event',eventType:'PARTY'},staff.cookie)).statusCode,403);
    const audit=(await get('/api/admin/overview',owner.cookie)).json().logs;
    assert.ok(audit.some((a:{action:string;actorName:string;targetName:string})=>a.action==='admin-revoke'&&a.actorName==='owner'&&a.targetName==='staff'));
  });
});

test('reserved primary e-mail receives no privileges before verification; existing verified account is promoted at startup',async t=>{
  const connection=await connectDatabase({path:'memory://'});t.after(()=>connection.close());
  const config={...readConfig(),production:false,databaseUrl:undefined,autoVerifyEmail:false,mailEnabled:true,smtpHost:undefined};
  const first=await createApi({config,database:connection.db,rateLimit:false});t.after(()=>first.app.close());
  const registered=await first.app.inject({method:'POST',url:'/api/auth/register',payload:{username:'primary',displayName:'Principal',email:OWNER_EMAIL.toUpperCase(),password}});
  const cookie=`${registered.cookies[0].name}=${registered.cookies[0].value}`;
  assert.equal(registered.json().user.role,'user');assert.equal(registered.json().user.isOwner,false);
  assert.equal((await first.app.inject({url:'/api/admin/overview',headers:{cookie}})).statusCode,403);
  const token=new URL(first.mailer.messages[0].text.split('\n').find(line=>line.startsWith('http'))!).searchParams.get('verify');
  assert.equal((await first.app.inject({method:'POST',url:'/api/auth/verify',payload:{token}})).statusCode,200);
  const me=(await first.app.inject({url:'/api/auth/me',headers:{cookie}})).json().user;
  assert.equal(me.role,'admin');assert.equal(me.isOwner,true);
  const [before]=await connection.db.select().from(users).where(eq(users.id,me.id));
  await connection.db.update(users).set({role:'player'}).where(eq(users.id,me.id)); // Simulates an existing verified account from before this feature.
  await first.app.close();
  const second=await createApi({config,database:connection.db,rateLimit:false});t.after(()=>second.app.close());
  const [after]=await connection.db.select().from(users).where(eq(users.id,me.id));
  assert.equal(after.role,'admin');assert.equal(after.passwordHash,before.passwordHash);
});
