import {test} from 'node:test';import assert from 'node:assert/strict';
import {ACHIEVEMENT_SERIES,ACHIEVEMENT_TIERS,BADGE_ICONS,PROFILE,achievementBadges,achievementOfBadge,crossedLevels} from '@bar/shared';
import {internalSecret} from '@bar/shared/tickets';
import {readFile,readdir} from 'node:fs/promises';import {join} from 'node:path';
import {eq} from 'drizzle-orm';import {PGlite} from '@electric-sql/pglite';
import {createApi} from '../src/app.js';import {readConfig} from '../src/config.js';import {OWNER_EMAIL} from '../src/admin-policy.js';
import {defaultMigrationFolder} from '../src/database/index.js';import {wallets} from '../src/database/schema.js';

test('the catalog: four rising goals per series, and badges the database accepts',()=>{
  assert.ok(ACHIEVEMENT_SERIES.length>=20);
  assert.equal(new Set(ACHIEVEMENT_SERIES.map(series=>series.id)).size,ACHIEVEMENT_SERIES.length);
  for(const series of ACHIEVEMENT_SERIES){
    assert.equal(series.goals.length,ACHIEVEMENT_TIERS.length,series.id);
    assert.ok(series.goals.every((goal,level)=>goal>0&&(level===0||goal>series.goals[level-1]!)),`${series.id}: the goals rise`);
    assert.ok((BADGE_ICONS as readonly string[]).includes(series.icon),`${series.id}: the administration must be able to save its icon`);
    assert.ok(series.text.includes('{n}'),series.id);
  }
  for(const badge of achievementBadges()){
    assert.match(badge.id,/^[a-z0-9][a-z0-9-]*$/);assert.ok(badge.id.length<=40);
    assert.ok(badge.name.length<=PROFILE.badgeNameMax,badge.name);assert.ok(badge.description.length<=PROFILE.badgeDescriptionMax,badge.description);
    assert.equal(achievementOfBadge(badge.id)?.series.id,badge.id.replace(/-\d$/,''));
  }
  assert.equal(achievementOfBadge('fundador'),undefined);assert.equal(achievementOfBadge('boemio-2'),undefined);
  const bebum=ACHIEVEMENT_SERIES.find(series=>series.id==='bebum')!;
  assert.deepEqual(crossedLevels(bebum,9,10),[0]);assert.deepEqual(crossedLevels(bebum,10,49),[]);assert.deepEqual(crossedLevels(bebum,0,300),[0,1,2]);
  // Stored in metres, goals in km.
  assert.deepEqual(crossedLevels(ACHIEVEMENT_SERIES.find(series=>series.id==='andarilho')!,999,1000),[0]);
});

test('the migration counts what the database already knows, and leaves earlier badges untold',async t=>{
  // Run by hand: the migrator refuses a schema older than this code, and the point here is the data from before.
  const db=new PGlite();await db.waitReady;t.after(()=>db.close());
  const names=(await readdir(defaultMigrationFolder)).filter(name=>name.endsWith('.sql')).sort();
  const run=async(wanted:(name:string)=>boolean)=>{for(const name of names.filter(wanted))await db.exec(await readFile(join(defaultMigrationFolder,name),'utf8'));};
  await run(name=>name<'012');
  for(const id of ['ana','bia'])await db.query("INSERT INTO users(id,username,email,password_hash) VALUES ($1,$1,$1||'@test.local','hash')",[id]);
  await db.query("INSERT INTO game_statistics(user_id,blackjack_wins) VALUES ('ana',30),('bia',0)");
  for(let i=0;i<26;i++)await db.query("INSERT INTO phone_messages(id,sender_id,recipient_id,body) VALUES ($1,'ana','bia','oi')",[`m${i}`]);
  await db.query("INSERT INTO gram_posts(id,author_id,image) VALUES ('p1','bia','x')");
  await db.query("INSERT INTO currency_ledger(id,user_id,amount,reason) VALUES ('l1','ana',-5,'pix:out:bia'),('l2','bia',5,'pix:in:ana'),('l3','ana',-5,'media:jukebox')");
  await db.query("INSERT INTO user_badges(user_id,badge_id,shown_at) VALUES ('ana','fundador',0)");
  await run(name=>name>='012');
  const counters=(await db.query<{user_id:string;series:string;value:number}>('SELECT user_id,series,value FROM user_achievements ORDER BY user_id,series')).rows.map(row=>`${row.user_id}:${row.series}=${row.value}`);
  assert.deepEqual(counters,['ana:fofoqueiro=26','ana:pix=1','ana:rei-do-21=30','bia:influencer=1']);
  const given=(await db.query<{user_id:string;badge_id:string;notified_at:Date|null}>('SELECT user_id,badge_id,notified_at FROM user_badges ORDER BY user_id,badge_id')).rows;
  assert.deepEqual(given.map(row=>`${row.user_id}:${row.badge_id}`),['ana:fofoqueiro-1','ana:fundador','ana:pix-1','ana:rei-do-21-1','ana:rei-do-21-2','bia:influencer-1']);
  assert.ok(given.find(row=>row.badge_id==='fundador')!.notified_at,'a badge from before is not news');
  assert.equal(given.find(row=>row.badge_id==='pix-1')!.notified_at,null,'one the migration gives is');
});

test('achievements: counters, badges at each goal, told once, and what the phone counts',async t=>{
  const config={...readConfig(),dataPath:'memory://',databaseUrl:undefined,autoVerifyEmail:true};
  const api=await createApi({config,rateLimit:false,migrate:true});t.after(()=>api.app.close());
  async function register(username:string,email=`${username}@achievements.test`){
    const response=await api.app.inject({method:'POST',url:'/api/auth/register',payload:{email,username,displayName:username,password:'ConquistaSegura2026!'}});assert.equal(response.statusCode,201);
    const cookie=`${response.cookies[0].name}=${response.cookies[0].value}`;
    return {id:response.json().user.id as string,
      get:(url:string)=>api.app.inject({url,headers:{cookie}}),
      post:(url:string,payload:object)=>api.app.inject({method:'POST',url,payload,headers:{cookie}})};
  }
  const owner=await register('dono',OWNER_EMAIL),ana=await register('ana'),bia=await register('bia');
  const report=async(events:object[],online:string[]=[])=>{
    const response=await api.app.inject({method:'POST',url:'/api/internal/achievements',payload:{events,online},headers:{'x-internal-secret':internalSecret()}});
    assert.equal(response.statusCode,200,response.body);return response.json().unlocked as Array<{userId:string;badge:{id:string;name:string;rarity:string}}>;
  };
  const series=async(who:typeof ana,id:string)=>(await who.get('/api/profile/achievements')).json().achievements.find((each:any)=>each.id===id);
  const owned=async(who:typeof ana)=>(await who.get(`/api/profile/${who.id}`)).json().owned.map((badge:any)=>badge.id) as string[];

  // Every badge of the catalog comes with the migration, as the catalog says.
  const catalog=(await owner.get('/api/admin/badges')).json().badges as Array<{id:string;name:string;rarity:string;description:string;icon:string}>;
  for(const badge of achievementBadges()){
    const row=catalog.find(each=>each.id===badge.id);assert.ok(row,`${badge.id} is in the migration`);
    assert.deepEqual([row.name,row.rarity,row.description,row.icon],[badge.name,badge.rarity,badge.description,badge.icon]);
  }

  // Only the world reports.
  assert.equal((await api.app.inject({method:'POST',url:'/api/internal/achievements',payload:{events:[],online:[]}})).statusCode,401);
  assert.equal((await ana.post('/api/internal/achievements',{events:[{userId:ana.id,series:'bebum',amount:1000}],online:[]})).statusCode,401);

  // Nothing yet; below the goal, no badge.
  assert.deepEqual((await series(ana,'bebum')).tiers.map((tier:any)=>tier.goal),[10,50,200,1000]);
  assert.equal((await series(ana,'bebum')).value,0);
  assert.deepEqual(await report([{userId:ana.id,series:'bebum',amount:9}],[ana.id]),[]);
  assert.equal((await series(ana,'bebum')).value,9);assert.deepEqual(await owned(ana),[]);

  // The tenth beer: one badge, told once, to the player who is here, only if they are here.
  assert.deepEqual(await report([{userId:ana.id,series:'bebum',amount:1}],[bia.id]),[]);
  const told=await report([],[ana.id]);
  assert.deepEqual(told.map(each=>[each.userId,each.badge.id,each.badge.name,each.badge.rarity]),[[ana.id,'bebum-1','Bebum I','common']]);
  assert.deepEqual(await report([],[ana.id]),[]);
  assert.deepEqual(await owned(ana),['bebum-1']);

  // A big jump passes several goals; the same report adds up per player.
  await report([{userId:ana.id,series:'bebum',amount:100},{userId:ana.id,series:'bebum',amount:100},{userId:bia.id,series:'bebum',amount:1}]);
  assert.deepEqual((await report([],[ana.id,bia.id])).map(each=>each.badge.id).sort(),['bebum-2','bebum-3']);
  assert.equal((await series(ana,'bebum')).value,210);assert.equal((await series(bia,'bebum')).value,1);
  // On the fourth level the card is the rarest.
  await report([{userId:ana.id,series:'bebum',amount:790}]);
  const top=await report([],[ana.id]);assert.deepEqual(top.map(each=>[each.badge.id,each.badge.rarity]),[['bebum-4','legendary']]);
  assert.ok((await series(ana,'bebum')).tiers.every((tier:any)=>tier.owned));

  // Series counted in another unit: metres stored, km shown.
  await report([{userId:ana.id,series:'andarilho',amount:1500}]);
  assert.equal((await series(ana,'andarilho')).value,1);assert.ok((await owned(ana)).includes('andarilho-1'));

  // What makes no sense counts for nothing, and does not hold the rest of the report back.
  await report([{userId:'ninguem',series:'bebum',amount:5},{userId:ana.id,series:'nao-existe',amount:5},{userId:ana.id,series:'rei-do-21',amount:5}]);
  assert.ok((await owned(ana)).includes('rei-do-21-1'));
  const invalid=await api.app.inject({method:'POST',url:'/api/internal/achievements',payload:{events:[{userId:ana.id,series:'bebum',amount:-5}],online:[]},headers:{'x-internal-secret':internalSecret()}});
  assert.equal(invalid.statusCode,400);

  // A badge taken away is not given back by the next beer; its counter stays. The manual grant is told too.
  const grant=(badgeId:string,on:boolean)=>owner.post('/api/admin/badges/grant',{playerId:bia.id,badgeId,grant:on,reason:'Teste das conquistas'});
  await report([{userId:bia.id,series:'fumante',amount:5}],[bia.id]);
  assert.equal((await grant('fumante-1',false)).statusCode,200);
  await report([{userId:bia.id,series:'fumante',amount:1}],[bia.id]);
  assert.equal((await owned(bia)).includes('fumante-1'),false);assert.equal((await series(bia,'fumante')).value,6);
  assert.equal((await grant('fumante-1',true)).statusCode,200);
  assert.deepEqual((await report([],[bia.id])).map(each=>each.badge.id),['fumante-1']);

  // A badge the administration deleted stops being given, and leaves the player's list.
  assert.equal((await owner.post('/api/admin/badges/delete',{id:'cafeinado-1',reason:'Teste das conquistas'})).statusCode,200);
  await report([{userId:bia.id,series:'cafeinado',amount:5}]);
  assert.equal((await owned(bia)).includes('cafeinado-1'),false);
  assert.deepEqual((await series(bia,'cafeinado')).tiers.map((tier:any)=>tier.goal),[25,100,500]);
  // One edited keeps its goal, with the name it was given.
  assert.equal((await owner.post('/api/admin/badges',{id:'cafeinado-2',name:'Viciado',description:'Café demais.',icon:'bolt',color:'#ea2fdc',reason:'Teste das conquistas'})).statusCode,200);
  await report([{userId:bia.id,series:'cafeinado',amount:20}]);
  assert.deepEqual((await report([],[bia.id])).map(each=>each.badge.name),['Viciado']);

  // Your own, only: the route is about whoever asks.
  assert.equal((await api.app.inject({url:'/api/profile/achievements'})).statusCode,401);

  // The phone counts by itself, once per request id.
  const anaLine=(await ana.get('/api/phone')).json(),biaLine=(await bia.get('/api/phone')).json();
  assert.ok(anaLine.number&&biaLine.number);
  assert.equal((await ana.post('/api/phone/contacts',{userId:bia.id})).statusCode,200);
  const send=async(requestId:string)=>assert.equal((await ana.post(`/api/phone/zap/${bia.id}`,{text:'E aí?',requestId})).statusCode,200);
  const first='00000000-0000-4000-8000-000000000001';
  await send(first);await send(first);await send('00000000-0000-4000-8000-000000000002');
  assert.equal((await series(ana,'fofoqueiro')).value,2);
  const pix=async(requestId:string)=>assert.equal((await ana.post('/api/phone/bank/pix',{userId:bia.id,amount:1,requestId})).statusCode,200);
  const firstPix='00000000-0000-4000-8000-000000000003';
  await ana.get('/api/wardrobe');await api.db.update(wallets).set({balance:50}).where(eq(wallets.userId,ana.id));
  await pix(firstPix);await pix(firstPix);
  assert.equal((await series(ana,'pix')).value,1);assert.ok((await owned(ana)).includes('pix-1'));
});
