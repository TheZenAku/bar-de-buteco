import {test} from 'node:test';
import assert from 'node:assert/strict';
import {eq} from 'drizzle-orm';
import {createApi} from '../src/app.js';
import {readConfig} from '../src/config.js';
import {OWNER_EMAIL} from '../src/admin-policy.js';
import {controls,gameLogs,skinInventory,wallets} from '../src/database/schema.js';

const password='MorteTestsOnly2026!';
test('the Morte is never sold: hidden by default, refused on purchase, granted and taken back only by the administration; the kill button is guarded',async t=>{
  const config={...readConfig(),production:false,databaseUrl:undefined,dataPath:'memory://',autoVerifyEmail:true};
  const service=await createApi({config,rateLimit:false,migrate:true});t.after(()=>service.app.close());
  const inject=(method:'GET'|'POST',url:string,payload?:object,cookie?:string)=>service.app.inject({method,url,...(payload?{payload}:{}),headers:cookie?{cookie}:{}});
  async function register(username:string,email=`${username}@morte.test`){
    const response=await inject('POST','/api/auth/register',{username,email,displayName:username,password});assert.equal(response.statusCode,201,response.body);
    return {cookie:`${response.cookies[0].name}=${response.cookies[0].value}`,id:response.json().user.id as string};
  }
  const owner=await register('dono',OWNER_EMAIL),staff=await register('equipe'),player=await register('cliente');
  await inject('POST','/api/admin/role',{playerId:staff.id,role:'admin',reason:'Equipe do teste'},owner.cookie);
  await inject('GET','/api/wardrobe',undefined,player.cookie);
  await service.db.update(wallets).set({balance:1_000_000}).where(eq(wallets.userId,player.id));

  await t.test('not in the store, and the purchase refuses it even with coins',async()=>{
    const view=(await inject('GET','/api/wardrobe',undefined,player.cookie)).json();
    assert.equal(view.catalog.some((card:{id:string})=>card.id==='morte'),false,'hidden from whoever does not own it');
    const refused=await inject('POST','/api/wardrobe/buy',{skin:'morte'},player.cookie);
    assert.equal(refused.statusCode,409,refused.body);
    assert.equal((await service.db.select().from(skinInventory).where(eq(skinInventory.skinId,'morte'))).length,0);
    assert.equal((await inject('GET','/api/wardrobe',undefined,player.cookie)).json().balance,1_000_000,'nothing was charged');
    assert.equal((await inject('POST','/api/wardrobe/equip',{skin:'morte'},player.cookie)).statusCode,403,'cannot wear what is not owned');
    // The administration's Coleção lists it as hidden, legendary, free.
    const entry=(await inject('GET','/api/admin/collection',undefined,staff.cookie)).json().entries.find((row:{id:string;kind:string})=>row.id==='morte'&&row.kind==='skin');
    assert.deepEqual([entry.availability,entry.rarity,entry.price],['hidden','legendary',0]);
    // Even putting it on sale in the Coleção does not make it buyable.
    const onSale=await inject('POST','/api/admin/collection',{key:'skin:morte',rarity:'legendary',description:'Texto de teste da carta.',availability:'sale',price:10,reason:'Tentar vender a Morte'},staff.cookie);
    assert.equal(onSale.statusCode,200,onSale.body);
    assert.equal((await inject('POST','/api/wardrobe/buy',{skin:'morte'},player.cookie)).statusCode,409,'adminOnly beats the catalog row');
  });

  await t.test('the administration grants it, the owner sees it and wears it, and taking it back puts the default on',async()=>{
    const grant=await inject('POST','/api/admin/player',{playerId:player.id,op:'skin',skinId:'morte',grant:true,reason:'Conceder a Morte'},staff.cookie);
    assert.equal(grant.statusCode,200,grant.body);
    assert.equal((await inject('POST','/api/admin/player',{playerId:player.id,op:'skin',skinId:'morte',grant:true,reason:'Conceder de novo'},staff.cookie)).statusCode,409);
    const view=(await inject('GET','/api/wardrobe',undefined,player.cookie)).json();
    assert.deepEqual(view.catalog.find((card:{id:string})=>card.id==='morte')&&[view.catalog.find((card:{id:string})=>card.id==='morte').owned],[true]);
    assert.equal((await inject('POST','/api/wardrobe/equip',{skin:'morte'},player.cookie)).statusCode,200);
    const revoke=await inject('POST','/api/admin/player',{playerId:player.id,op:'skin',skinId:'morte',grant:false,reason:'Retirar a Morte'},staff.cookie);
    assert.equal(revoke.statusCode,200,revoke.body);
    assert.equal((await inject('GET','/api/auth/me',undefined,player.cookie)).json().user.equippedSkin,'nathan');
    const detail=(await inject('GET',`/api/admin/players/${player.id}`,undefined,staff.cookie)).json();
    assert.equal(detail.skins.some((skin:{id:string;owned:boolean})=>skin.id==='morte'&&!skin.owned),true,'listed in the player file, not owned');
  });

  await t.test('kill: only administrators, never the main account, a control for the world, a reason, and 409 while dead',async()=>{
    assert.equal((await inject('POST','/api/admin/player',{playerId:player.id,op:'kill',reason:'Sem permissão'},player.cookie)).statusCode,403);
    assert.equal((await inject('POST','/api/admin/player',{playerId:owner.id,op:'kill',reason:'Conta principal'},staff.cookie)).statusCode,403);
    assert.equal((await inject('POST','/api/admin/player',{playerId:owner.id,op:'kill',reason:'Teste pelo menu'},owner.cookie)).statusCode,200,'the main account may kill itself');
    assert.equal((await inject('POST','/api/admin/player',{playerId:player.id,op:'kill',reason:''},staff.cookie)).statusCode,400,'a reason is required');
    const killed=await inject('POST','/api/admin/player',{playerId:player.id,op:'kill',reason:'Testar a sequência'},staff.cookie);
    assert.equal(killed.statusCode,200,killed.body);
    assert.ok((await service.db.select().from(controls)).some(row=>{const c=row.payload as {action?:string;playerId?:string};return c.action==='kill'&&c.playerId===player.id;}),'the room is told');
    const history=(await inject('GET',`/api/admin/players/${player.id}`,undefined,staff.cookie)).json().history;
    assert.ok(history.some((row:{action:string;reason:string})=>row.action==='player-kill'&&/Testar a sequência/.test(row.reason)),'recorded with the reason');
    // The same click twice, before the room's log arrives.
    assert.equal((await inject('POST','/api/admin/player',{playerId:player.id,op:'kill',reason:'Duas vezes'},staff.cookie)).statusCode,409);
    // The room says the death started and has not ended: dead. When it ends, the next order works (the grace window aside).
    await service.db.update((await import('../src/database/schema.js')).moderationActions).set({createdAt:new Date(Date.now()-60_000)}).where(eq((await import('../src/database/schema.js')).moderationActions.action,'player-kill'));
    await service.db.insert(gameLogs).values({id:'death-1',source:'world',event:'death_start',userId:player.id,details:{},createdAt:new Date()});
    assert.equal((await inject('POST','/api/admin/player',{playerId:player.id,op:'kill',reason:'Ainda morto'},staff.cookie)).statusCode,409);
    await service.db.insert(gameLogs).values({id:'death-2',source:'world',event:'death_end',userId:player.id,details:{},createdAt:new Date(Date.now()+1000)});
    assert.equal((await inject('POST','/api/admin/player',{playerId:player.id,op:'kill',reason:'De volta, de novo'},staff.cookie)).statusCode,200);
  });
});
