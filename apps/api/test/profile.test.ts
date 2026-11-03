import {test} from 'node:test';import assert from 'node:assert/strict';import {deflateSync} from 'node:zlib';
import {createApi} from '../src/app.js';import {readConfig} from '../src/config.js';import {OWNER_EMAIL} from '../src/admin-policy.js';import {profiles,skillInventory,skinInventory} from '../src/database/schema.js';

test('profile: status, badges on show, skills per skin and the administration of badges',async t=>{
  const config={...readConfig(),dataPath:'memory://',databaseUrl:undefined,autoVerifyEmail:true};
  const api=await createApi({config,rateLimit:false,migrate:true});t.after(()=>api.app.close());
  async function register(username:string,email=`${username}@profile.test`){
    const response=await api.app.inject({method:'POST',url:'/api/auth/register',payload:{email,username,displayName:username,password:'PerfilSegura2026!'}});assert.equal(response.statusCode,201);
    const cookie=`${response.cookies[0].name}=${response.cookies[0].value}`;
    return {id:response.json().user.id as string,
      get:(url:string)=>api.app.inject({url,headers:{cookie}}),
      post:(url:string,payload:object)=>api.app.inject({method:'POST',url,payload,headers:{cookie}})};
  }
  const owner=await register('dono',OWNER_EMAIL),ana=await register('ana'),bia=await register('bia');

  // What anyone sees, and what only the owner of the profile gets.
  let mine=(await ana.get(`/api/profile/${ana.id}`)).json();
  assert.equal(mine.mine,true);assert.equal(mine.skin,'nathan');assert.deepEqual(mine.badges,[]);assert.deepEqual(mine.owned,[]);assert.ok(mine.handle);
  let seen=(await bia.get(`/api/profile/${ana.id}`)).json();
  assert.equal(seen.mine,false);assert.equal('owned' in seen,false);assert.equal('loadouts' in seen,false);

  // The status is the owner's, short and on one line.
  assert.equal((await ana.post('/api/profile/status',{status:'  Sextou no boteco  '})).json().status,'Sextou no boteco');
  assert.equal((await bia.get(`/api/profile/${ana.id}`)).json().status,'Sextou no boteco');
  assert.equal((await ana.post('/api/profile/status',{status:'x'.repeat(61)})).statusCode,400);
  assert.equal((await ana.post('/api/profile/status',{status:'duas\nlinhas'})).statusCode,400);

  // Only an administrator manages the catalog, and every change needs a reason.
  assert.equal((await ana.get('/api/admin/badges')).statusCode,403);
  assert.equal((await owner.post('/api/admin/badges',{name:'Sem motivo',description:'Nenhum motivo dado.',icon:'heart',color:'#ea2fdc'})).statusCode,400);
  const badge=(name:string,icon='heart')=>({name,description:`Descrição de ${name}.`,icon,color:'#ea2fdc',reason:'Teste do catálogo'});
  const catalog=(await owner.post('/api/admin/badges',badge('Boêmio'))).json().badges;
  assert.ok(catalog.some((row:any)=>row.id==='boemio'&&row.holders===0),'the id comes from the name, without accents');
  assert.ok(catalog.some((row:any)=>row.id==='fundador'&&row.holders===0),'the first badge comes with the migration');
  assert.equal((await owner.post('/api/admin/badges',badge('Boêmio'))).json().badges.filter((row:any)=>row.id.startsWith('boemio')).length,2,'the same name gets another id');
  assert.equal((await owner.post('/api/admin/badges',{...badge('Ícone'),icon:'naoexiste'})).statusCode,400);
  const edited=(await owner.post('/api/admin/badges',{...badge('Boêmio de raiz'),id:'boemio-2'})).json().badges.find((row:any)=>row.id==='boemio-2');
  assert.equal(edited.name,'Boêmio de raiz');
  // Rarity: a badge starts common, an edit that does not mention it keeps it, and only the known ones are accepted.
  assert.equal(edited.rarity,'common');
  const rarityOf=async(payload:object)=>(await owner.post('/api/admin/badges',{...badge('Boêmio de raiz'),id:'boemio-2',...payload})).json().badges.find((row:any)=>row.id==='boemio-2').rarity;
  assert.equal(await rarityOf({rarity:'legendary'}),'legendary');
  assert.equal(await rarityOf({}),'legendary');
  assert.equal((await owner.post('/api/admin/badges',{...badge('Boêmio de raiz'),id:'boemio-2',rarity:'mitico'})).statusCode,400);
  const grant=(playerId:string,badgeId:string,on=true)=>owner.post('/api/admin/badges/grant',{playerId,badgeId,grant:on,reason:'Teste de concessão'});
  assert.equal((await grant(ana.id,'boemio')).statusCode,200);
  assert.equal((await grant(ana.id,'boemio')).statusCode,409);
  assert.equal((await grant(ana.id,'fundador')).statusCode,200);
  assert.deepEqual((await owner.get('/api/admin/badges/boemio/holders')).json().holders.map((row:any)=>row.id),[ana.id]);

  // On show: only what the player has, in the order chosen, six at most.
  assert.equal((await ana.post('/api/profile/badges',{badges:['boemio-2']})).statusCode,403);
  assert.equal((await ana.post('/api/profile/badges',{badges:['boemio','boemio']})).statusCode,400);
  assert.equal((await ana.post('/api/profile/badges',{badges:Array.from({length:7},(_,i)=>`b${i}`)})).statusCode,400);
  mine=(await ana.post('/api/profile/badges',{badges:['fundador','boemio']})).json();
  assert.deepEqual(mine.badges.map((row:any)=>row.id),['fundador','boemio']);assert.equal(mine.owned.length,2);
  seen=(await bia.get(`/api/profile/${ana.id}`)).json();
  assert.deepEqual(seen.badges.map((row:any)=>row.id),['fundador','boemio']);
  assert.deepEqual(seen.badges.map((row:any)=>row.rarity),['common','common']);
  await owner.post('/api/admin/badges',{...badge('Boêmio'),id:'boemio',rarity:'epic'});
  assert.equal((await bia.get(`/api/profile/${ana.id}`)).json().badges.find((row:any)=>row.id==='boemio').rarity,'epic','anyone sees the rarity');
  assert.equal((await ana.get(`/api/profile/${ana.id}`)).json().owned.find((row:any)=>row.id==='boemio').rarity,'epic');
  // Revoked or deleted, it leaves the profile.
  assert.equal((await grant(ana.id,'boemio',false)).statusCode,200);
  assert.deepEqual((await bia.get(`/api/profile/${ana.id}`)).json().badges.map((row:any)=>row.id),['fundador']);
  assert.equal((await grant(ana.id,'boemio',false)).statusCode,409);
  assert.equal((await owner.post('/api/admin/badges/delete',{id:'fundador',reason:'Teste de remoção'})).statusCode,200);
  assert.deepEqual((await bia.get(`/api/profile/${ana.id}`)).json().badges,[]);
  assert.equal((await owner.post('/api/admin/badges/delete',{id:'fundador',reason:'Teste de remoção'})).statusCode,404);
  const history=(await owner.get('/api/admin/logs?categories=admin')).json().entries.map((entry:any)=>entry.title);
  for(const title of ['Emblema criado','Emblema editado','Emblema concedido','Emblema retirado','Emblema apagado'])assert.ok(history.some((line:string)=>line.includes(title)),title);

  // Skills belong to the skin being worn; the key cannot be one the game uses.
  assert.equal((await ana.post('/api/profile/skill',{skill:'karate',key:'KeyX'})).statusCode,400,'Nathan has no skills');
  await api.db.insert(skinInventory).values({userId:ana.id,skinId:'rafael'});
  await api.db.update(profiles).set({equippedSkin:'rafael'});
  assert.equal((await ana.post('/api/profile/skill',{skill:'air-kick',key:'KeyR'})).statusCode,403,'Skills are bought first');
  await api.db.insert(skillInventory).values({userId:ana.id,skillId:'air-kick'});
  assert.equal((await ana.post('/api/profile/skill',{skill:'air-kick',key:'KeyW'})).statusCode,400);
  assert.equal((await ana.post('/api/profile/skill',{skill:'air-kick',key:'Escape'})).statusCode,400);
  assert.equal((await ana.post('/api/profile/skill',{skill:'nada',key:'KeyR'})).statusCode,400);
  mine=(await ana.post('/api/profile/skill',{skill:'air-kick',key:'KeyR'})).json();
  assert.deepEqual(mine.loadouts,{rafael:{skill:'air-kick',key:'KeyR'}});
  assert.deepEqual((await ana.get(`/api/profile/${ana.id}`)).json().loadouts,{rafael:{skill:'air-kick',key:'KeyR'}});
});

/** A real file's structure: signature, IHDR, IDAT, IEND. The API reads the chunks and leaves the decoding to the browser. */
function png(width:number,height:number,fill=0):Buffer {
  const chunk=(type:string,data:Buffer)=>{const head=Buffer.alloc(8);head.writeUInt32BE(data.length,0);head.write(type,4,'latin1');return Buffer.concat([head,data,Buffer.alloc(4)]);};
  const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  return Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.alloc(32,fill))),chunk('IEND',Buffer.alloc(0))]);
}

test('badge images: a PNG goes to the server, the medal shows it, and it stays there',async t=>{
  const config={...readConfig(),dataPath:'memory://',databaseUrl:undefined,autoVerifyEmail:true};
  const api=await createApi({config,rateLimit:false,migrate:true});t.after(()=>api.app.close());
  async function register(username:string,email=`${username}@images.test`){
    const response=await api.app.inject({method:'POST',url:'/api/auth/register',payload:{email,username,displayName:username,password:'PerfilSegura2026!'}});assert.equal(response.statusCode,201);
    const cookie=`${response.cookies[0].name}=${response.cookies[0].value}`;
    return {id:response.json().user.id as string,
      get:(url:string)=>api.app.inject({url,headers:{cookie}}),
      post:(url:string,payload:object)=>api.app.inject({method:'POST',url,payload,headers:{cookie}}),
      send:(body:Buffer,type='image/png')=>api.app.inject({method:'POST',url:'/api/admin/badges/images',payload:body,headers:{cookie,'content-type':type}})};
  }
  const owner=await register('dono',OWNER_EMAIL),ana=await register('ana');
  const file=png(64,64);

  // Only an administrator, only a whole PNG, and no bigger than the medal needs.
  assert.equal((await ana.send(file)).statusCode,403);
  assert.equal((await owner.send(file,'image/gif')).statusCode,415);
  assert.equal((await owner.send(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).statusCode,400);
  assert.equal((await owner.send(file.subarray(0,file.length-12))).statusCode,400,'cut before the end of the file');
  assert.equal((await owner.send(png(0,64))).statusCode,400);
  assert.equal((await owner.send(png(257,64))).statusCode,400);
  assert.equal((await owner.send(Buffer.concat([file,Buffer.alloc(300_000)]))).statusCode,413);

  // Saved, once per file, and on the list.
  const sent=await owner.send(file);assert.equal(sent.statusCode,200);
  const {id}=sent.json();assert.match(id,/^[0-9a-f]{64}$/);
  assert.equal((await owner.send(file)).json().id,id,'the same file is the same image');
  assert.deepEqual((await owner.get('/api/admin/badges')).json().images,[id]);
  assert.equal((await ana.get('/api/admin/badges')).statusCode,403);

  // Anyone logged in sees it; the browser keeps it.
  const served=await ana.get(`/api/badges/images/${id}`);
  assert.equal(served.statusCode,200);assert.ok(served.rawPayload.equals(file));
  assert.equal(served.headers['content-type'],'image/png');assert.match(String(served.headers['cache-control']),/immutable/);assert.equal(served.headers['x-content-type-options'],'nosniff');
  assert.equal((await api.app.inject({url:`/api/badges/images/${id}`})).statusCode,401);
  assert.equal((await ana.get(`/api/badges/images/${'0'.repeat(64)}`)).statusCode,404);
  assert.equal((await ana.get('/api/badges/images/..%2F..%2Fetc')).statusCode,400);

  // In a badge: the profile carries it, an edit without it keeps it, null takes it off.
  const badge={name:'Com imagem',description:'Tem um PNG no lugar do ícone.',icon:'heart',color:'#ea2fdc',reason:'Teste das imagens'};
  assert.equal((await owner.post('/api/admin/badges',{...badge,image:'f'.repeat(64)})).statusCode,404);
  assert.equal((await owner.post('/api/admin/badges',{...badge,image:'nao-e-um-id'})).statusCode,400);
  const row=(await owner.post('/api/admin/badges',{...badge,image:id})).json().badges.find((each:any)=>each.id==='com-imagem');
  assert.equal(row.image,id);assert.equal((await owner.get('/api/admin/badges')).json().badges.find((each:any)=>each.id==='fundador').image,null);
  await owner.post('/api/admin/badges/grant',{playerId:ana.id,badgeId:'com-imagem',grant:true,reason:'Teste das imagens'});
  await ana.post('/api/profile/badges',{badges:['com-imagem']});
  assert.equal((await owner.get(`/api/profile/${ana.id}`)).json().badges[0].image,id);
  assert.equal((await owner.post('/api/admin/badges',{...badge,id:'com-imagem',name:'Renomeado'})).json().badges.find((each:any)=>each.id==='com-imagem').image,id);

  // In use, it cannot be deleted; a deleted badge leaves the image on the server.
  const remove=(as=owner)=>as.post('/api/admin/badges/images/delete',{id,reason:'Teste das imagens'});
  assert.equal((await remove(ana)).statusCode,403);
  assert.equal((await remove()).statusCode,409);
  assert.equal((await owner.post('/api/admin/badges',{...badge,id:'com-imagem',image:null})).json().badges.find((each:any)=>each.id==='com-imagem').image,null);
  assert.equal((await owner.post('/api/admin/badges',{...badge,id:'com-imagem',image:id})).statusCode,200);
  assert.equal((await owner.post('/api/admin/badges/delete',{id:'com-imagem',reason:'Teste das imagens'})).statusCode,200);
  assert.deepEqual((await owner.get('/api/admin/badges')).json().images,[id]);
  assert.equal((await ana.get(`/api/badges/images/${id}`)).statusCode,200);
  assert.deepEqual((await remove()).json().images,[]);
  assert.equal((await remove()).statusCode,404);
  assert.equal((await ana.get(`/api/badges/images/${id}`)).statusCode,404);

  const history=(await owner.get('/api/admin/logs?categories=admin')).json().entries.map((entry:any)=>entry.title);
  for(const title of ['Imagem de emblema enviada','Imagem de emblema apagada'])assert.ok(history.some((line:string)=>line.includes(title)),title);
});
