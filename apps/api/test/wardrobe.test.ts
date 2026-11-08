import {test} from 'node:test';import assert from 'node:assert/strict';import {eq} from 'drizzle-orm';
import {verifyTicket} from '@bar/shared/tickets';
import {createApi} from '../src/app.js';import {readConfig} from '../src/config.js';import {wallets,skinInventory,currencyLedger} from '../src/database/schema.js';

test('Nathan is free for new accounts; purchases persist and duplicate/racing requests cannot mint coins or duplicate charges',async t=>{
  const config={...readConfig(),dataPath:'memory://',databaseUrl:undefined,autoVerifyEmail:true};
  const api=await createApi({config,rateLimit:false,migrate:true});t.after(()=>api.app.close());
  const account={email:'wardrobe@example.com',username:'wardrobe',displayName:'Coleção',password:'ColecaoSegura2026!'};
  const register=await api.app.inject({method:'POST',url:'/api/auth/register',payload:account});assert.equal(register.statusCode,201);
  const cookie=`${register.cookies[0].name}=${register.cookies[0].value}`,userId=register.json().user.id;
  const post=(url:string,payload:object)=>api.app.inject({method:'POST',url,payload,headers:{cookie}});
  const get=(url:string)=>api.app.inject({url,headers:{cookie}});
  assert.equal(register.json().user.equippedSkin,'nathan');assert.equal('character' in register.json().user,false);
  assert.equal((await post('/api/game-ticket',{})).statusCode,200,'A new account enters the bar without any appearance step');
  let view=(await get('/api/wardrobe')).json();assert.equal(view.balance,0);
  assert.deepEqual(view.catalog.map((s:any)=>[s.id,s.owned,s.price]),[['nathan',true,0],['leandro',false,750],['rafael',false,1000],['rafael-rose',false,2500],['read',false,850],['gilmar-gordo',false,900],['gabriel',false,900],['flavio-hipotetico',false,900],['tiao',false,900],['primo',false,1000]]);
  assert.deepEqual(view.catalog.filter((s:any)=>s.base==='rafael').map((s:any)=>[s.id,s.variant,s.rarity]),[['rafael','Original','epic'],['rafael-rose','Rosé','legendary']]);
  assert.deepEqual(view.skills.map((s:any)=>[s.id,s.skin,s.owned,s.price,s.available]),[['horse','tiao',false,800,true],['karate','rafael',false,500,true],['air-kick','rafael',false,800,true]]);
  assert.deepEqual((({day,claimed,coins})=>[day,claimed,coins])((await get('/api/daily')).json()),[1,false,0],'Day one of the run, XP only by default');
  const dailyClaims=await Promise.all([0,1].map(()=>post('/api/daily',{})));
  assert.ok(dailyClaims.every(r=>r.statusCode===200));assert.equal(dailyClaims.filter(r=>r.json().gained).length,1,'Once a day, however many ask at once');
  assert.deepEqual(dailyClaims.find(r=>r.json().gained)!.json().gained,{xp:50,coins:0});assert.equal((await get('/api/daily')).json().claimed,true);
  assert.equal((await get(`/api/profile/${userId}`)).json().xp,50,'The XP of the bonus counts in the profile');
  assert.equal((await post('/api/wardrobe/buy',{skin:'nathan'})).statusCode,200,'Buying the free skin is a no-op');
  assert.equal((await post('/api/wardrobe/equip',{skin:'rafael'})).statusCode,403);
  assert.equal((await post('/api/wardrobe/equip',{skin:'custom'})).statusCode,400);
  assert.equal((await post('/api/wardrobe/buy',{skin:'rafael',price:0})).statusCode,400);
  assert.equal((await post('/api/wardrobe/buy',{skin:'leandro'})).statusCode,409,'Insufficient coins');
  await api.db.update(wallets).set({balance:1000}).where(eq(wallets.userId,userId)); // Controlled test funds, never a public route.
  const duplicates=await Promise.all([0,1,2].map(()=>post('/api/wardrobe/buy',{skin:'leandro'})));
  assert.ok(duplicates.every(r=>r.statusCode===200));
  view=(await get('/api/wardrobe')).json();assert.equal(view.balance,250);assert.deepEqual(view.catalog.filter((s:any)=>s.owned).map((s:any)=>s.id),['nathan','leandro']);
  assert.equal((await api.db.select().from(skinInventory)).length,1);
  assert.equal((await api.db.select().from(currencyLedger)).filter(r=>r.reason.startsWith('skin:')).length,1);
  assert.equal((await post('/api/wardrobe/equip',{skin:'leandro'})).statusCode,200);
  assert.equal((await get('/api/auth/me')).json().user.equippedSkin,'leandro');
  const ticket=await post('/api/game-ticket',{}),claims=verifyTicket(ticket.json().ticket,config.authSecret);
  const validation=(await api.app.inject({method:'POST',url:'/api/internal/validate',headers:{'x-internal-secret':config.internalSecret},payload:{sessionId:claims.sessionId,userId}})).json();
  assert.deepEqual(validation.ownedSkins,['nathan','leandro']);assert.equal(validation.equippedSkin,'leandro');assert.equal('character' in validation,false);
  assert.equal((await post('/api/wardrobe/equip',{skin:'nathan'})).statusCode,200);
  await api.db.update(wallets).set({balance:1000}).where(eq(wallets.userId,userId));
  const race=await Promise.all(['rafael','read'].map(skin=>post('/api/wardrobe/buy',{skin})));
  assert.equal(race.filter(r=>r.statusCode===200).length,1);assert.equal(race.filter(r=>r.statusCode===409).length,1);
  assert.ok((await get('/api/wardrobe')).json().balance>=0);
  await post('/api/auth/logout',{});
  const login=await api.app.inject({method:'POST',url:'/api/auth/login',payload:{email:account.email,password:account.password}});
  assert.equal(login.json().user.equippedSkin,'nathan','the selection survives logging in again');
});

test('a variant is its own card, skills are bought once per character, and the administration runs the catalog',async t=>{
  const config={...readConfig(),dataPath:'memory://',databaseUrl:undefined,autoVerifyEmail:true};
  const api=await createApi({config,rateLimit:false,migrate:true});t.after(()=>api.app.close());
  const enter=async(tag:string)=>{
    const register=await api.app.inject({method:'POST',url:'/api/auth/register',payload:{email:`${tag}@example.com`,username:tag,displayName:tag,password:'ColecaoSegura2026!'}});
    const cookie=`${register.cookies[0].name}=${register.cookies[0].value}`,id=register.json().user.id as string;
    return {id,post:(url:string,payload:object)=>api.app.inject({method:'POST',url,payload,headers:{cookie}}),get:(url:string)=>api.app.inject({url,headers:{cookie}})};
  };
  const ana=await enter('ana_collection'),view=async()=>(await ana.get('/api/wardrobe')).json();
  const validation=async()=>{
    const ticket=await ana.post('/api/game-ticket',{}),claims=verifyTicket(ticket.json().ticket,config.authSecret);
    return (await api.app.inject({method:'POST',url:'/api/internal/validate',headers:{'x-internal-secret':config.internalSecret},payload:{sessionId:claims.sessionId,userId:ana.id}})).json();
  };
  await view();await api.db.update(wallets).set({balance:5000}).where(eq(wallets.userId,ana.id));

  // A skill takes a card of its character.
  assert.equal((await ana.post('/api/wardrobe/skill',{skill:'karate'})).statusCode,403);
  assert.equal((await ana.post('/api/wardrobe/skill',{skill:'nada'})).statusCode,400);
  assert.equal((await ana.post('/api/wardrobe/skill',{skill:'karate',price:0})).statusCode,400);
  assert.equal((await view()).balance,5000);

  // The variant alone: the original stays locked, and wearing the variant is allowed.
  assert.equal((await ana.post('/api/wardrobe/buy',{skin:'rafael-rose'})).statusCode,200);
  let now=await view();assert.equal(now.balance,2500);
  assert.deepEqual(now.catalog.filter((s:any)=>s.base==='rafael').map((s:any)=>[s.id,s.owned]),[['rafael',false],['rafael-rose',true]]);
  assert.equal((await ana.post('/api/wardrobe/equip',{skin:'rafael'})).statusCode,403);
  assert.equal((await ana.post('/api/wardrobe/equip',{skin:'rafael-rose'})).statusCode,200);

  // Skills: the profile and the room read them; the second buy is free of charge and double requests do not charge twice.
  let validated=await validation();assert.deepEqual(validated.ownedSkills,[]);assert.equal(validated.equippedSkin,'rafael-rose');
  assert.equal((await ana.post('/api/profile/skill',{skill:'karate',key:'KeyR'})).statusCode,403,'Not bought yet');
  const twice=await Promise.all([0,1,2].map(()=>ana.post('/api/wardrobe/skill',{skill:'karate'})));
  assert.ok(twice.every(r=>r.statusCode===200));
  now=await view();assert.equal(now.balance,2000);assert.deepEqual(now.skills.filter((s:any)=>s.owned).map((s:any)=>s.id),['karate']);
  validated=await validation();assert.deepEqual(validated.ownedSkills,['karate']);
  // The choice belongs to the character: it follows every variant.
  const chosen=(await ana.post('/api/profile/skill',{skill:'karate',key:'KeyR'})).json();
  assert.deepEqual(chosen.loadouts,{rafael:{skill:'karate',key:'KeyR'}});assert.deepEqual(chosen.ownedSkills,['karate']);
  const ledger=await api.db.select().from(currencyLedger).where(eq(currencyLedger.userId,ana.id));
  assert.deepEqual(ledger.filter(r=>r.reason.startsWith('skill:')||r.reason.startsWith('skin:')).map(r=>[r.reason,r.amount]).sort(),[['skill:karate',-500],['skin:rafael-rose',-2500]]);

  // The administration.
  assert.equal((await ana.get('/api/admin/collection')).statusCode,403);
  const {OWNER_EMAIL}=await import('../src/admin-policy.js');
  const register=await api.app.inject({method:'POST',url:'/api/auth/register',payload:{email:OWNER_EMAIL,username:'owner_collection',displayName:'Dono',password:'ColecaoSegura2026!'}});
  const owner=`${register.cookies[0].name}=${register.cookies[0].value}`;
  const admin={post:(url:string,payload:object)=>api.app.inject({method:'POST',url,payload,headers:{cookie:owner}}),get:(url:string)=>api.app.inject({url,headers:{cookie:owner}})};
  const entries=(await admin.get('/api/admin/collection')).json().entries;
  const rose=entries.find((e:any)=>e.key==='skin:rafael-rose');
  assert.equal(rose.owners,1);assert.equal(rose.wearing,1);assert.equal(rose.revenue,2500);assert.equal(rose.price,2500);assert.equal(rose.defaultPrice,2500);
  assert.equal(entries.find((e:any)=>e.key==='skill:karate').revenue,500);
  const save=(payload:object)=>admin.post('/api/admin/collection',{reason:'Teste da coleção',description:'Texto novo.',rarity:'rare',availability:'sale',price:900,...payload});
  assert.equal((await save({key:'skin:nada'})).statusCode,404);
  assert.equal((await save({key:'skin:nathan',availability:'hidden',price:0})).statusCode,400,'The free card stays');
  assert.equal((await save({key:'skin:nathan',price:50})).statusCode,400,'The free card stays free');
  assert.equal((await save({key:'skin:gabriel',availability:'closed',price:1234})).statusCode,200);
  now=await view();
  const gabriel=now.catalog.find((s:any)=>s.id==='gabriel');
  assert.deepEqual([gabriel.rarity,gabriel.description,gabriel.price,gabriel.available],['rare','Texto novo.',1234,false]);
  assert.equal((await ana.post('/api/wardrobe/buy',{skin:'gabriel'})).statusCode,409,'Closed');
  // Hidden: gone for those who do not have it, kept by those who do.
  assert.equal((await save({key:'skin:gabriel',availability:'hidden',price:1234})).statusCode,200);
  assert.equal((await save({key:'skin:rafael-rose',availability:'hidden',price:2500,rarity:'legendary'})).statusCode,200);
  now=await view();
  assert.equal(now.catalog.some((s:any)=>s.id==='gabriel'),false);
  assert.equal(now.catalog.find((s:any)=>s.id==='rafael-rose').owned,true);
  assert.equal((await save({key:'skill:air-kick',availability:'closed',price:800})).statusCode,200);
  assert.equal((await ana.post('/api/wardrobe/skill',{skill:'air-kick'})).statusCode,409);
  // Taken away, a card can be bought again (its old ledger row does not stand in the way).
  assert.equal((await save({key:'skin:rafael-rose',availability:'sale',price:100,rarity:'legendary'})).statusCode,200);
  const change=(op:object)=>admin.post('/api/admin/player',{playerId:ana.id,reason:'Teste da coleção',...op});
  assert.equal((await change({op:'skin',skinId:'rafael-rose',grant:false})).statusCode,200);
  assert.equal((await view()).equippedSkin,'nathan');
  assert.equal((await ana.post('/api/wardrobe/buy',{skin:'rafael-rose'})).statusCode,200);
  assert.equal((await view()).catalog.find((s:any)=>s.id==='rafael-rose').owned,true);
  // The administration gives and takes skills, and says so in the player's file.
  assert.equal((await change({op:'skill',skillId:'air-kick',grant:true})).statusCode,200);
  assert.equal((await change({op:'skill',skillId:'air-kick',grant:true})).statusCode,409);
  assert.equal((await change({op:'skill',skillId:'nada',grant:true})).statusCode,400);
  const file=(await admin.get(`/api/admin/players/${ana.id}`)).json();
  assert.deepEqual(file.skills.filter((s:any)=>s.owned).map((s:any)=>s.id),['karate','air-kick']);
  assert.ok(file.wallet.ledger.some((row:any)=>/habilidade Golpe de karatê/.test(row.label)));
  assert.equal((await change({op:'skill',skillId:'air-kick',grant:false})).statusCode,200);
});
