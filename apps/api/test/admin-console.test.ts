import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {eq} from 'drizzle-orm';
import {verifyTicket} from '@bar/shared/tickets';
import {createApi} from '../src/app.js';
import {readConfig} from '../src/config.js';
import {OWNER_EMAIL} from '../src/admin-policy.js';
import {controls,economyPrices,users,wallets} from '../src/database/schema.js';

const password='ConsoleTestsOnly2026!';
test('administration console: prices for the whole game, player file and changes, reports, logs, economy and server',async t=>{
  const config={...readConfig(),production:false,databaseUrl:undefined,dataPath:'memory://',autoVerifyEmail:true};
  const service=await createApi({config,rateLimit:false,migrate:true});t.after(()=>service.app.close());
  const inject=(method:'GET'|'POST',url:string,payload?:object,cookie?:string)=>service.app.inject({method,url,...(payload?{payload}:{}),headers:cookie?{cookie}:{}});
  const internal=(method:'GET'|'POST',url:string,payload?:object)=>service.app.inject({method,url,...(payload?{payload}:{}),headers:{'x-internal-secret':config.internalSecret}});
  async function register(username:string,email=`${username}@console.test`){
    const response=await inject('POST','/api/auth/register',{username,email,displayName:username,password});assert.equal(response.statusCode,201,response.body);
    return {cookie:`${response.cookies[0].name}=${response.cookies[0].value}`,id:response.json().user.id as string};
  }
  const owner=await register('dono',OWNER_EMAIL),staff=await register('equipe'),player=await register('cliente');
  await inject('POST','/api/admin/role',{playerId:staff.id,role:'admin',reason:'Equipe do console'},owner.cookie);
  await service.db.update(wallets).set({balance:1000}).where(eq(wallets.userId,player.id));
  await inject('GET','/api/inventory',undefined,player.cookie);
  await service.db.update(wallets).set({balance:1000}).where(eq(wallets.userId,player.id));

  await t.test('only administrators reach the console; anyone reads the prices',async()=>{
    for(const url of ['/api/admin/summary','/api/admin/prices','/api/admin/logs','/api/admin/economy','/api/admin/server','/api/admin/reports',`/api/admin/players/${player.id}`])
      assert.equal((await inject('GET',url,undefined,player.cookie)).statusCode,403,url);
    assert.equal((await inject('POST','/api/admin/prices',{changes:[{key:'item:agua',value:1}],reason:'Tentativa indevida'},player.cookie)).statusCode,403);
    assert.equal((await inject('POST','/api/admin/player',{playerId:player.id,op:'verify',reason:'Tentativa indevida'},player.cookie)).statusCode,403);
    const prices=(await inject('GET','/api/prices')).json().prices;
    assert.equal(prices['item:coxinha'],22);assert.equal(prices['media:telao'],50);assert.equal(prices['job:bar'],6);
    assert.equal((await service.app.inject({url:'/api/internal/prices'})).statusCode,401,'internal secret required');
    assert.equal((await internal('GET','/api/internal/prices')).json().prices['item:coxinha'],22);
  });

  await t.test('a price change applies to purchases at once, is audited, tells the world and can go back to the default',async()=>{
    assert.equal((await inject('POST','/api/admin/prices',{changes:[{key:'item:nada',value:1}],reason:'Chave inválida'},staff.cookie)).statusCode,400);
    assert.equal((await inject('POST','/api/admin/prices',{changes:[{key:'item:agua',value:10_001}],reason:'Acima do limite'},staff.cookie)).statusCode,400);
    const change=await inject('POST','/api/admin/prices',{changes:[{key:'item:agua',value:40},{key:'skin:rafael',value:2000},{key:'cap:job-daily',value:10}],reason:'Conter a inflação'},staff.cookie);
    assert.equal(change.statusCode,200,change.body);assert.equal(change.json().changed,3);
    assert.equal((await inject('GET','/api/prices')).json().prices['item:agua'],40);
    const bought=await inject('POST','/api/inventory/buy',{itemId:'agua',quantity:2,requestId:randomUUID()},player.cookie);
    assert.equal(bought.statusCode,200,bought.body);assert.equal(bought.json().balance,920,'two waters at the new price');
    assert.equal((await inject('GET','/api/wardrobe',undefined,player.cookie)).json().catalog.find((s:{id:string})=>s.id==='rafael').price,2000);
    const view=(await inject('GET','/api/admin/prices',undefined,staff.cookie)).json();
    const agua=view.rows.find((r:{key:string})=>r.key==='item:agua');
    assert.deepEqual([agua.value,agua.defaultValue,agua.override,agua.updatedBy],[40,12,true,'equipe']);
    assert.match(view.changes[0].reason,/Conter a inflação · .*Água mineral: 12 → 40/);
    assert.ok((await service.db.select().from(controls)).some(c=>(c.payload as {action?:string}).action==='prices'),'the world is told to reload');
    // The work cap follows the price table.
    const ticket=await inject('POST','/api/game-ticket',{},player.cookie),{sessionId}=verifyTicket(ticket.json().ticket,config.authSecret);
    const paid=await internal('POST','/api/internal/wallet',{sessionId,userId:player.id,amount:6,reason:'job:bar:s1:0',requestId:randomUUID()});
    const capped=await internal('POST','/api/internal/wallet',{sessionId,userId:player.id,amount:6,reason:'job:bar:s1:1',requestId:randomUUID()});
    assert.deepEqual([paid.json().applied,capped.json().applied],[6,4]);
    // Back to the default: the override is removed; the same value twice changes nothing.
    assert.equal((await inject('POST','/api/admin/prices',{changes:[{key:'item:agua',value:12}],reason:'Voltar ao padrão'},staff.cookie)).json().changed,1);
    assert.equal((await service.db.select().from(economyPrices).where(eq(economyPrices.key,'item:agua'))).length,0);
    assert.equal((await inject('POST','/api/admin/prices',{changes:[{key:'item:agua',value:null}],reason:'Nada muda'},staff.cookie)).json().changed,0);
  });

  await t.test('the player file and its changes: name, items, skins, e-mail and sessions, with the main account protected',async()=>{
    const file=(await inject('GET',`/api/admin/players/${player.id}`,undefined,staff.cookie)).json();
    assert.equal(file.account.username,'cliente');assert.equal(file.wallet.balance,930);
    assert.ok(file.wallet.ledger.some((row:{source:string;label:string})=>row.source==='mochila'&&row.label.includes('Água mineral')));
    assert.equal(file.inventory.find((i:{itemId:string})=>i.itemId==='agua').quantity,4);
    const change=(body:object,cookie=staff.cookie)=>inject('POST','/api/admin/player',{playerId:player.id,reason:'Teste do console',...body},cookie);
    assert.equal((await change({op:'rename',displayName:'<b>'})).statusCode,400);
    assert.equal((await change({op:'rename',displayName:'Cliente Novo'})).statusCode,200);
    assert.equal((await inject('GET','/api/auth/me',undefined,player.cookie)).json().user.displayName,'Cliente Novo');
    assert.equal((await change({op:'item',itemId:'agua',quantity:7})).statusCode,409,'beyond the stack limit');
    assert.equal((await change({op:'item',itemId:'agua',quantity:-5})).statusCode,409,'more than the player has');
    assert.equal((await change({op:'item',itemId:'pastel',quantity:3})).statusCode,200);
    assert.equal((await change({op:'item',itemId:'agua',quantity:-4})).statusCode,200);
    const items=(await inject('GET','/api/inventory',undefined,player.cookie)).json().stacks;
    assert.equal(items.find((s:{itemId:string})=>s.itemId==='pastel').quantity,3);assert.equal(items.some((s:{itemId:string})=>s.itemId==='agua'),false);
    assert.ok((await service.db.select().from(controls)).some(c=>(c.payload as {action?:string;playerId?:string}).action==='sync'&&(c.payload as {playerId?:string}).playerId===player.id),'the world reads the backpack again');
    assert.equal((await change({op:'skin',skinId:'read',grant:true})).statusCode,200);
    assert.equal((await change({op:'skin',skinId:'read',grant:true})).statusCode,409);
    assert.equal((await inject('GET','/api/wardrobe',undefined,player.cookie)).json().catalog.find((s:{id:string})=>s.id==='read').owned,true);
    assert.equal((await change({op:'skin',skinId:'read',grant:false})).statusCode,200);
    assert.equal((await change({op:'verify'})).statusCode,409,'already confirmed');
    await service.db.update(users).set({verified:false}).where(eq(users.id,player.id));
    assert.equal((await change({op:'verify'})).statusCode,200);
    assert.equal((await inject('POST','/api/admin/player',{playerId:owner.id,op:'rename',displayName:'Outro',reason:'Tentativa contra a principal'},staff.cookie)).statusCode,403);
    assert.equal((await inject('POST','/api/admin/player',{playerId:staff.id,op:'logout',reason:'A si mesma'},staff.cookie)).statusCode,400);
    const history=(await inject('GET',`/api/admin/players/${player.id}`,undefined,staff.cookie)).json().history.map((h:{action:string})=>h.action);
    for(const action of ['player-rename','items-add','items-remove','skin-grant','skin-revoke','player-verify'])assert.ok(history.includes(action),action);
    const second=await inject('POST','/api/auth/login',{email:'cliente@console.test',password});
    const extra=`${second.cookies[0].name}=${second.cookies[0].value}`;
    assert.equal((await change({op:'logout'})).statusCode,200);
    assert.equal((await inject('GET','/api/auth/me',undefined,extra)).statusCode,401,'every session ended');
    const again=await inject('POST','/api/auth/login',{email:'cliente@console.test',password});
    player.cookie=`${again.cookies[0].name}=${again.cookies[0].value}`;
  });

  await t.test('reports are listed by state, resolved with a decision and reopened',async()=>{
    assert.equal((await inject('POST','/api/reports',{playerId:staff.id,reason:'Falou palavrão no chat'},player.cookie)).statusCode,201);
    const open=(await inject('GET','/api/admin/reports?status=open',undefined,owner.cookie)).json().reports;
    assert.equal(open.length,1);assert.equal(open[0].targetId,staff.id);assert.equal(open[0].reporterName,'Cliente Novo');
    assert.equal((await inject('POST','/api/admin/reports/resolve',{reportId:open[0].id,resolution:'Advertência por mensagem'},owner.cookie)).statusCode,200);
    assert.equal((await inject('POST','/api/admin/reports/resolve',{reportId:open[0].id,resolution:'De novo'},owner.cookie)).statusCode,409);
    const resolved=(await inject('GET','/api/admin/reports?status=resolved',undefined,owner.cookie)).json().reports[0];
    assert.equal(resolved.resolution,'Advertência por mensagem');assert.equal(resolved.resolvedByName,'dono');
    assert.equal((await inject('POST','/api/admin/reports/resolve',{reportId:open[0].id,resolution:null},owner.cookie)).statusCode,200);
    assert.equal((await inject('GET','/api/admin/summary',undefined,owner.cookie)).json().reportsOpen,1);
  });

  await t.test('one log for everything, filtered by type, player, text and period, page by page',async()=>{
    const recorded=await internal('POST','/api/internal/logs',{events:[{event:'join',userId:player.id,details:{},at:Date.now()-1000},{event:'job_end',userId:player.id,details:{jobId:'bar',tasks:3,earned:18},at:Date.now()}]});
    assert.equal(recorded.statusCode,200,recorded.body);
    const logs=async(query:string)=>{const r=await inject('GET',`/api/admin/logs?${query}`,undefined,owner.cookie);assert.equal(r.statusCode,200,r.body);return r.json();};
    const world=await logs(`categories=mundo&player=${player.id}`);
    assert.deepEqual(world.entries.map((e:{title:string})=>e.title),['Terminou o turno','Entrou no bar']);
    assert.match(world.entries[0].detail,/3 tarefa\(s\) · 18 moedas/);assert.equal(world.entries[0].playerName,'Cliente Novo');
    const access=(await logs('categories=acessos')).entries.map((e:{kind:string})=>e.kind);
    assert.ok(access.includes('login')&&access.includes('register'));
    const coins=await logs(`categories=moedas&q=${encodeURIComponent('Cliente')}`);
    assert.ok(coins.entries.length>0&&coins.entries.every((e:{playerId:string})=>e.playerId===player.id));
    assert.ok((await logs('categories=admin&q=inflação')).entries.some((e:{kind:string})=>e.kind==='price-set'));
    assert.equal((await logs(`categories=admin,moedas&since=${new Date(Date.now()+60_000).toISOString()}`)).entries.length,0);
    // Pages: every entry once, newest first, until `next` is null.
    const seen:string[]=[];let before='';
    for(let page=0;page<50;page++){const r=await logs(`limit=5${before?`&before=${encodeURIComponent(before)}`:''}`);seen.push(...r.entries.map((e:{id:string})=>e.id));if(!r.next)break;before=r.next;}
    const all=await logs('limit=200');
    assert.equal(new Set(seen).size,seen.length,'no entry twice');assert.equal(seen.length,all.entries.length);
  });

  await t.test('economy, summary and server answer with consistent numbers',async()=>{
    const economy=(await inject('GET','/api/admin/economy?days=7',undefined,owner.cookie)).json();
    const balances=(await service.db.select().from(wallets)).reduce((s,w)=>s+w.balance,0);
    assert.equal(economy.supply.total,balances);assert.equal(economy.series.length,7);assert.equal(economy.series.at(-1).supply,balances);
    assert.ok(economy.sources.some((s:{source:string})=>s.source==='mochila'));
    // The index weighs what was bought in the period (water only), against the defaults.
    assert.equal(economy.inflation.priceIndex,100,'water is back at its default');assert.equal(economy.inflation.priceChanges,2);
    await inject('POST','/api/admin/prices',{changes:[{key:'item:agua',value:24}],reason:'Dobrar a água'},owner.cookie);
    assert.equal((await inject('GET','/api/admin/economy?days=7',undefined,owner.cookie)).json().inflation.priceIndex,200);
    assert.equal((await inject('GET','/api/admin/economy?days=5',undefined,owner.cookie)).statusCode,400);
    const summary=(await inject('GET','/api/admin/summary',undefined,owner.cookie)).json();
    assert.equal(summary.accounts.total,3);assert.equal(summary.accounts.admins,2);assert.equal(summary.economy.supply,balances);
    const server=(await inject('GET','/api/admin/server',undefined,owner.cookie)).json();
    assert.equal(server.database.driver,'pglite');assert.ok(server.database.tables.some((t:{name:string;rows:number})=>t.name==='users'&&t.rows===3));
    assert.ok(server.api.requests>0);assert.ok(server.host.totalMem>0);
    const list=(await inject('GET',`/api/admin/overview?filter=online&online=${player.id}`,undefined,owner.cookie)).json();
    assert.deepEqual(list.users.map((u:{id:string})=>u.id),[player.id]);
    assert.equal((await inject('GET','/api/admin/overview?filter=admins&sort=name',undefined,owner.cookie)).json().total,2);
  });
});
