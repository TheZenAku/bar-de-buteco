import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {eq} from 'drizzle-orm';
import {PHONE,PHONE_NUMBER} from '@bar/shared';
import {createApi} from '../src/app.js';
import {readConfig} from '../src/config.js';
import {wallets} from '../src/database/schema.js';

// The smallest valid JPEG header and end marker around some filler: the API checks the signature and the size only.
const jpeg=(size=400)=>`data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xff,0xd8,0xff,0xe0]),Buffer.alloc(size,7),Buffer.from([0xff,0xd9])]).toString('base64')}`;

test('the phone: numbers, contacts, Highzap, Highgram and Pix, with blocks hiding people both ways',async t=>{
  const config={...readConfig(),dataPath:'memory://',databaseUrl:undefined,autoVerifyEmail:true};
  const api=await createApi({config,rateLimit:false,migrate:true});t.after(()=>api.app.close());
  const register=async(name:string)=>{
    const response=await api.app.inject({method:'POST',url:'/api/auth/register',payload:{email:`${name}@example.com`,username:name,displayName:name[0]!.toUpperCase()+name.slice(1),password:'CelularSeguro2026!'}});
    assert.equal(response.statusCode,201,response.body);
    const cookie=`${response.cookies[0]!.name}=${response.cookies[0]!.value}`,id=response.json().user.id as string;
    const call=(method:'GET'|'POST'|'DELETE',url:string,payload?:unknown)=>api.app.inject({method,url,headers:{cookie},...(payload===undefined?{}:{payload:payload as object})});
    return {id,call};
  };
  const ana=await register('ana'),bia=await register('bia'),caio=await register('caio');

  // Numbers: nine digits, one per account, the same on every read.
  const anaPhone=(await ana.call('GET','/api/phone')).json(),biaPhone=(await bia.call('GET','/api/phone')).json();
  assert.match(anaPhone.number,PHONE_NUMBER);assert.notEqual(anaPhone.number,biaPhone.number);
  assert.equal((await ana.call('GET','/api/phone')).json().number,anaPhone.number);
  assert.equal((await api.app.inject({method:'GET',url:'/api/phone'})).statusCode,401,'needs a session');
  const found=await ana.call('GET',`/api/phone/lookup?number=${biaPhone.number}`);
  assert.equal(found.json().id,bia.id);assert.equal(found.json().name,'Bia');
  assert.equal((await ana.call('GET','/api/phone/lookup?number=900000000')).statusCode,404);

  // Contacts by number or by account; never yourself.
  let profile=(await ana.call('POST','/api/phone/contacts',{number:biaPhone.number})).json();
  assert.deepEqual(profile.contacts.map((c:{id:string})=>c.id),[bia.id]);
  profile=(await ana.call('POST','/api/phone/contacts',{userId:caio.id})).json();
  assert.deepEqual(profile.contacts.map((c:{name:string})=>c.name),['Bia','Caio']);
  assert.equal((await ana.call('POST','/api/phone/contacts',{userId:ana.id})).statusCode,400);
  profile=(await ana.call('DELETE',`/api/phone/contacts/${caio.id}`)).json();
  assert.equal(profile.contacts.length,1);

  // Highzap: sent once per requestId, unread until opened, then read.
  const requestId=randomUUID();
  const sent=await Promise.all([ana.call('POST',`/api/phone/zap/${bia.id}`,{text:'  Chega no bar?  ',requestId}),ana.call('POST',`/api/phone/zap/${bia.id}`,{text:'Chega no bar?',requestId})]);
  assert.ok(sent.every(r=>r.statusCode===200));assert.equal(sent[0]!.json().id,sent[1]!.json().id);assert.equal(sent[0]!.json().text,'Chega no bar?');
  await ana.call('POST',`/api/phone/zap/${bia.id}`,{text:'Tô na mesa 5',requestId:randomUUID()});
  assert.equal((await bia.call('POST',`/api/phone/zap/${ana.id}`,{text:'x',requestId})).statusCode,409,'a request id belongs to its sender');
  assert.equal((await ana.call('POST',`/api/phone/zap/${bia.id}`,{text:' ',requestId:randomUUID()})).statusCode,400);
  assert.equal((await ana.call('POST',`/api/phone/zap/${ana.id}`,{text:'eu',requestId:randomUUID()})).statusCode,400);
  assert.equal((await bia.call('GET','/api/phone')).json().unread,2);
  let threads=(await bia.call('GET','/api/phone/zap')).json().threads;
  assert.equal(threads.length,1);assert.equal(threads[0].peer.id,ana.id);assert.equal(threads[0].unread,2);assert.equal(threads[0].last.text,'Tô na mesa 5');
  const opened=(await bia.call('GET',`/api/phone/zap/${ana.id}`)).json();
  assert.equal(opened.read,2);assert.deepEqual(opened.messages.map((m:{text:string})=>m.text),['Chega no bar?','Tô na mesa 5']);
  assert.equal((await bia.call('GET','/api/phone')).json().unread,0);
  assert.ok((await ana.call('GET',`/api/phone/zap/${bia.id}`)).json().messages.every((m:{readAt?:number})=>m.readAt),'the sender sees them read');

  // Highgram: post, photo, like (once), comments, profile.
  const post=await ana.call('POST','/api/phone/gram/posts',{image:jpeg(),caption:'Noite boa no Highland',requestId:randomUUID()});
  assert.equal(post.statusCode,200,post.body);const postId=post.json().id as string;
  assert.equal((await ana.call('POST','/api/phone/gram/posts',{image:'data:image/png;base64,AAAA',requestId:randomUUID()})).statusCode,400);
  assert.equal((await ana.call('POST','/api/phone/gram/posts',{image:jpeg(PHONE.photoMaxBytes),requestId:randomUUID()})).statusCode,413);
  const photo=await bia.call('GET',`/api/phone/gram/photos/${postId}`);
  assert.equal(photo.statusCode,200);assert.equal(photo.headers['content-type'],'image/jpeg');assert.match(String(photo.headers['cache-control']),/immutable/);
  assert.equal(photo.rawPayload[0],0xff);
  let liked=(await bia.call('POST',`/api/phone/gram/posts/${postId}/like`,{liked:true})).json();
  assert.deepEqual(liked,{likes:1,liked:true,notify:ana.id},'a new like pings the author');
  liked=(await bia.call('POST',`/api/phone/gram/posts/${postId}/like`,{liked:true})).json();
  assert.deepEqual(liked,{likes:1,liked:true},'liking twice counts once and pings once');
  const comment=(await bia.call('POST',`/api/phone/gram/posts/${postId}/comments`,{text:'Que foto!',requestId:randomUUID()})).json();
  assert.equal(comment.notify,ana.id);assert.equal(comment.comments[0].text,'Que foto!');
  let feed=(await bia.call('GET','/api/phone/gram')).json().posts;
  assert.equal(feed.length,1);assert.deepEqual({likes:feed[0].likes,liked:feed[0].liked,comments:feed[0].comments,mine:feed[0].mine,name:feed[0].author.name},{likes:1,liked:true,comments:1,mine:false,name:'Ana'});
  assert.equal(feed[0].image,undefined,'the feed never carries the photos');
  const anaGram=(await caio.call('GET',`/api/phone/gram/users/${ana.id}`)).json();
  assert.equal(anaGram.posts.length,1);assert.equal(anaGram.likes,1);
  assert.equal((await bia.call('DELETE',`/api/phone/gram/posts/${postId}`)).statusCode,403,'only the author deletes');

  // Blocks hide each other's messages, posts and photos, both ways.
  await caio.call('POST','/api/blocks',{playerId:ana.id});
  assert.equal((await caio.call('GET','/api/phone/gram')).json().posts.length,0);
  assert.equal((await caio.call('GET',`/api/phone/gram/photos/${postId}`)).statusCode,404);
  assert.equal((await ana.call('POST',`/api/phone/zap/${caio.id}`,{text:'oi',requestId:randomUUID()})).statusCode,403);
  assert.equal((await ana.call('POST','/api/phone/bank/pix',{userId:caio.id,amount:1,requestId:randomUUID()})).statusCode,403);

  // Pix: both wallets in one transaction, once per requestId, within the daily limit.
  await ana.call('GET','/api/phone/bank');
  await api.db.update(wallets).set({balance:PHONE.pixDailyMax+500}).where(eq(wallets.userId,ana.id));
  const pixId=randomUUID();
  const pix=await Promise.all([ana.call('POST','/api/phone/bank/pix',{number:biaPhone.number,amount:300,requestId:pixId}),ana.call('POST','/api/phone/bank/pix',{number:biaPhone.number,amount:300,requestId:pixId})]);
  assert.ok(pix.every(r=>r.statusCode===200),pix[0]!.body);assert.deepEqual(pix.map(r=>r.json().balance),[PHONE.pixDailyMax+200,PHONE.pixDailyMax+200]);
  const biaBank=(await bia.call('GET','/api/phone/bank')).json();
  assert.equal(biaBank.balance,300);assert.equal(biaBank.entries[0].amount,300);assert.equal(biaBank.entries[0].peer,'Ana');
  const anaBank=(await ana.call('GET','/api/phone/bank')).json();
  assert.equal(anaBank.sentToday,300);assert.equal(anaBank.entries.find((e:{amount:number})=>e.amount===-300).peer,'Bia');
  assert.equal((await ana.call('POST','/api/phone/bank/pix',{userId:bia.id,amount:PHONE.pixMax+1,requestId:randomUUID()})).statusCode,400);
  assert.equal((await ana.call('POST','/api/phone/bank/pix',{userId:ana.id,amount:5,requestId:randomUUID()})).statusCode,400);
  assert.equal((await bia.call('POST','/api/phone/bank/pix',{userId:ana.id,amount:301,requestId:randomUUID()})).statusCode,409,'never more than the balance');
  for(let sent=300;sent+PHONE.pixMax<=PHONE.pixDailyMax;sent+=PHONE.pixMax)assert.equal((await ana.call('POST','/api/phone/bank/pix',{userId:bia.id,amount:PHONE.pixMax,requestId:randomUUID()})).statusCode,200);
  const over=await ana.call('POST','/api/phone/bank/pix',{userId:bia.id,amount:PHONE.pixMax,requestId:randomUUID()});
  assert.equal(over.statusCode,409);assert.match(over.json().error,/Limite diário/);

  // Deleting a post takes its likes and comments along.
  assert.equal((await ana.call('DELETE',`/api/phone/gram/posts/${postId}`)).statusCode,200);
  assert.equal((await bia.call('GET','/api/phone/gram')).json().posts.length,0);
  threads=(await ana.call('GET','/api/phone/zap')).json().threads;assert.equal(threads[0].unread,0);
  feed=(await ana.call('GET','/api/phone/gram')).json().posts;assert.equal(feed.length,0);
});

test('the phone, social: Highgram profiles, follows, search, suggestions, the player card and Highzap media between contacts',async t=>{
  const config={...readConfig(),dataPath:'memory://',databaseUrl:undefined,autoVerifyEmail:true};
  const api=await createApi({config,rateLimit:false,migrate:true});t.after(()=>api.app.close());
  const register=async(name:string)=>{
    const response=await api.app.inject({method:'POST',url:'/api/auth/register',payload:{email:`${name}@example.com`,username:name,displayName:name[0]!.toUpperCase()+name.slice(1),password:'CelularSeguro2026!'}});
    assert.equal(response.statusCode,201,response.body);
    const cookie=`${response.cookies[0]!.name}=${response.cookies[0]!.value}`,id=response.json().user.id as string;
    const call=(method:'GET'|'POST'|'PATCH'|'DELETE',url:string,payload?:unknown)=>api.app.inject({method,url,headers:{cookie},...(payload===undefined?{}:{payload:payload as object})});
    const raw=(url:string,type:string,payload:Buffer)=>api.app.inject({method:'POST',url,headers:{cookie,'content-type':type},payload});
    return {id,call,raw};
  };
  const ana=await register('ana'),bia=await register('bia'),caio=await register('caio'),duda=await register('duda');

  // Profiles start from the account (username as handle, bar name) and can change name, handle, bio and photo.
  let anaGram=(await ana.call('GET',`/api/phone/gram/users/${ana.id}`)).json();
  assert.deepEqual({handle:anaGram.author.handle,name:anaGram.author.name,bio:anaGram.bio,mine:anaGram.mine,photo:anaGram.author.photo},{handle:'ana',name:'Ana',bio:'',mine:true,photo:undefined});
  anaGram=(await ana.call('PATCH','/api/phone/gram/me',{name:'Ana do Samba',handle:'@Ana.Samba',bio:'Mesa 5, sempre.',photo:jpeg(900)})).json();
  assert.deepEqual({handle:anaGram.author.handle,name:anaGram.author.name,bio:anaGram.bio},{handle:'ana.samba',name:'Ana do Samba',bio:'Mesa 5, sempre.'});
  assert.ok(anaGram.author.photo>0,'the photo has a version');
  const avatar=await bia.call('GET',`/api/phone/gram/avatars/${ana.id}?v=${anaGram.author.photo}`);
  assert.equal(avatar.statusCode,200);assert.equal(avatar.headers['content-type'],'image/jpeg');assert.equal(avatar.rawPayload[0],0xff);
  assert.equal((await bia.call('PATCH','/api/phone/gram/me',{handle:'ana.samba'})).statusCode,409,'handles are unique');
  assert.equal((await bia.call('PATCH','/api/phone/gram/me',{handle:'Bi'})).statusCode,400);
  assert.equal((await bia.call('PATCH','/api/phone/gram/me',{photo:'data:image/png;base64,AAAA'})).statusCode,400);
  assert.equal((await bia.call('PATCH','/api/phone/gram/me',{name:' '})).statusCode,400);
  // Contacts and threads carry the photo version too.
  await bia.call('POST','/api/phone/contacts',{userId:ana.id});
  assert.equal((await bia.call('GET','/api/phone')).json().contacts[0].photo,anaGram.author.photo);

  // Follows: once, with a ping for the new follower; the counts and both lists follow.
  let follow=(await bia.call('POST',`/api/phone/gram/users/${ana.id}/follow`,{followed:true})).json();
  assert.deepEqual(follow,{followed:true,followers:1,notify:ana.id});
  follow=(await bia.call('POST',`/api/phone/gram/users/${ana.id}/follow`,{followed:true})).json();
  assert.deepEqual(follow,{followed:true,followers:1},'following twice pings once');
  assert.equal((await bia.call('POST',`/api/phone/gram/users/${bia.id}/follow`,{followed:true})).statusCode,400);
  await caio.call('POST',`/api/phone/gram/users/${ana.id}/follow`,{followed:true});
  await caio.call('POST',`/api/phone/gram/users/${duda.id}/follow`,{followed:true});
  anaGram=(await bia.call('GET',`/api/phone/gram/users/${ana.id}`)).json();
  assert.deepEqual({followers:anaGram.followers,following:anaGram.following,followed:anaGram.followed,followsYou:anaGram.followsYou,mine:anaGram.mine},{followers:2,following:0,followed:true,followsYou:false,mine:false});
  assert.deepEqual((await ana.call('GET',`/api/phone/gram/users/${ana.id}/followers`)).json().people.map((p:{author:{handle:string}})=>p.author.handle).sort(),['bia','caio']);
  assert.deepEqual((await ana.call('GET',`/api/phone/gram/users/${caio.id}/following`)).json().people.map((p:{author:{id:string}})=>p.author.id).sort(),[ana.id,duda.id].sort());

  // Home shows who you follow and yourself; Explorar shows the whole bar.
  for(const [who,caption] of [[ana,'da Ana'],[duda,'da Duda'],[bia,'da Bia']] as const)assert.equal((await who.call('POST','/api/phone/gram/posts',{image:jpeg(),caption,requestId:randomUUID()})).statusCode,200);
  const captions=async(scope:string)=>(await bia.call('GET',`/api/phone/gram?scope=${scope}`)).json().posts.map((p:{caption:string})=>p.caption).sort();
  assert.deepEqual(await captions('following'),['da Ana','da Bia']);
  assert.deepEqual(await captions('all'),['da Ana','da Bia','da Duda']);

  // Search by handle or name, never yourself.
  assert.deepEqual((await bia.call('GET','/api/phone/gram/search?q=samba')).json().people.map((p:{author:{id:string};followed:boolean})=>[p.author.id,p.followed]),[[ana.id,true]]);
  assert.deepEqual((await bia.call('GET','/api/phone/gram/search?q=%40duda')).json().people.map((p:{author:{handle:string}})=>p.author.handle),['duda']);
  assert.deepEqual((await bia.call('GET','/api/phone/gram/search?q=bia')).json().people,[]);

  // Suggestions: who follows you first, then who the people you follow follow, contacts, the bar; never someone you follow.
  const suggested=(await ana.call('GET',`/api/phone/gram/suggestions?here=${duda.id},not-an-id`)).json().people as Array<{author:{id:string};reason:string}>;
  assert.deepEqual(suggested.slice(0,2).map(p=>p.reason),['Segue você','Segue você']);
  assert.ok(suggested.some(p=>p.author.id===duda.id),'someone in the bar');
  await bia.call('POST',`/api/phone/gram/users/${caio.id}/follow`,{followed:true});
  const forBia=(await bia.call('GET','/api/phone/gram/suggestions')).json().people as Array<{author:{id:string};reason:string}>;
  assert.equal(forBia.find(p=>p.author.id===duda.id)?.reason,'Seguido por @caio');
  assert.ok(!forBia.some(p=>p.author.id===ana.id||p.author.id===caio.id||p.author.id===bia.id),'not those already followed, nor yourself');

  // The player card: the number to save, whether it is saved, and the Highgram summary.
  const card=(await caio.call('GET',`/api/phone/card/${ana.id}`)).json();
  const anaNumber=(await ana.call('GET','/api/phone')).json().number;
  assert.deepEqual({name:card.name,number:card.number,saved:card.saved,mine:card.mine,handle:card.gram.author.handle,followers:card.gram.followers,posts:card.gram.posts,followed:card.gram.followed},
    {name:'Ana',number:anaNumber,saved:false,mine:false,handle:'ana.samba',followers:2,posts:1,followed:true});
  assert.equal((await ana.call('GET',`/api/phone/card/${ana.id}`)).json().mine,true);

  // Highzap reaches contacts only; whoever was written to can answer without saving the number.
  assert.equal((await caio.call('POST',`/api/phone/zap/${ana.id}`,{text:'oi',requestId:randomUUID()})).statusCode,403);
  await caio.call('POST','/api/phone/contacts',{number:anaNumber});
  assert.equal((await caio.call('POST',`/api/phone/zap/${ana.id}`,{text:'oi, Ana',requestId:randomUUID()})).statusCode,200);
  assert.equal((await ana.call('POST',`/api/phone/zap/${caio.id}`,{text:'oi!',requestId:randomUUID()})).statusCode,200,'a reply needs no contact');
  const anaThreads=(await ana.call('GET','/api/phone/zap')).json().threads;
  assert.deepEqual(anaThreads.map((thread:{peer:{id:string};saved:boolean})=>[thread.peer.id,thread.saved]),[[caio.id,false]]);

  // Media: raw bytes with their type, once per requestId, readable by the two ends only.
  const photoId=randomUUID(),photo=Buffer.from(jpeg(500).split(',')[1]!,'base64');
  const sentPhoto=await caio.raw(`/api/phone/zap/${ana.id}/media?kind=photo&requestId=${photoId}`,'image/jpeg',photo);
  assert.equal(sentPhoto.statusCode,200,sentPhoto.body);
  const again=await caio.raw(`/api/phone/zap/${ana.id}/media?kind=photo&requestId=${photoId}`,'image/jpeg',photo);
  assert.equal(again.json().media.id,sentPhoto.json().media.id,'a retry sends nothing new');
  const voice=await caio.raw(`/api/phone/zap/${ana.id}/media?kind=audio&ms=4200&requestId=${randomUUID()}`,'audio/webm',Buffer.alloc(2000,3));
  assert.equal(voice.statusCode,200,voice.body);assert.deepEqual({kind:voice.json().media.kind,ms:voice.json().media.ms,text:voice.json().text},{kind:'audio',ms:4200,text:''});
  const long=await caio.raw(`/api/phone/zap/${ana.id}/media?kind=video&ms=45000&requestId=${randomUUID()}`,'video/webm',Buffer.alloc(3000,1));
  assert.equal(long.statusCode,200,long.body);assert.equal(long.json().media.ms,PHONE.videoMaxMs,'durations are clamped');
  assert.equal((await caio.raw(`/api/phone/zap/${ana.id}/media?kind=audio&requestId=${randomUUID()}`,'video/webm',Buffer.alloc(50,1))).statusCode,415);
  assert.equal((await caio.raw(`/api/phone/zap/${ana.id}/media?kind=photo&requestId=${randomUUID()}`,'image/jpeg',Buffer.alloc(80,1))).statusCode,400);
  assert.equal((await caio.raw(`/api/phone/zap/${ana.id}/media?kind=audio&requestId=${randomUUID()}`,'audio/webm',Buffer.alloc(PHONE.audioMaxBytes+1,1))).statusCode,413);
  assert.equal((await caio.raw(`/api/phone/zap/${bia.id}/media?kind=audio&requestId=${randomUUID()}`,'audio/webm',Buffer.alloc(10,1))).statusCode,403,'contacts only');
  const thread=(await ana.call('GET',`/api/phone/zap/${caio.id}`)).json().messages as Array<{media?:{id:string;kind:string}}>;
  assert.deepEqual(thread.map(m=>m.media?.kind??'text'),['text','text','photo','audio','video']);
  const fetched=await ana.call('GET',`/api/phone/zap/media/${thread[3]!.media!.id}`);
  assert.equal(fetched.statusCode,200);assert.equal(fetched.headers['content-type'],'audio/webm');assert.equal(fetched.rawPayload.length,2000);
  assert.equal((await caio.call('GET',`/api/phone/zap/media/${thread[3]!.media!.id}`)).statusCode,200,'the sender too');
  assert.equal((await bia.call('GET',`/api/phone/zap/media/${thread[3]!.media!.id}`)).statusCode,404,'nobody else');

  // Blocks: no card, no follow, no search result.
  await duda.call('POST','/api/blocks',{playerId:bia.id});
  assert.equal((await bia.call('GET',`/api/phone/card/${duda.id}`)).statusCode,403);
  assert.equal((await bia.call('POST',`/api/phone/gram/users/${duda.id}/follow`,{followed:true})).statusCode,403);
  assert.deepEqual((await bia.call('GET','/api/phone/gram/search?q=duda')).json().people,[]);
});
