import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';import {WebSocketTransport} from '@colyseus/ws-transport';import {Client,type Room} from '@colyseus/sdk';
import {JUKEBOX,INTERACTABLES} from '@bar/shared';import {signTicket} from '@bar/shared/tickets';
import {BarRoom} from '../src/BarRoom.js';
async function until(check:()=>boolean):Promise<void>{const deadline=Date.now()+4000;while(!check()){if(Date.now()>deadline)throw new Error('Timed out');await new Promise(r=>setTimeout(r,20));}}
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
test('real room: queue, embedding check, one controller, refunds, reports and late join', {timeout:40000},async()=>{
  const previous={api:process.env.API_INTERNAL_URL,oembed:process.env.YOUTUBE_OEMBED_URL};
  const wallets=new Map<string,number>(),applied=new Map<string,number>(),charges:Array<{userId:string;amount:number;reason:string}>=[],asked:string[]=[];
  const api=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;res.setHeader('content-type','application/json');
    // YouTube's oEmbed: 401 when the owner turned embedding off, 404 for a video that does not exist.
    if(req.url?.startsWith('/oembed')){const video=new URL(new URL(req.url,'http://x').searchParams.get('url')!).searchParams.get('v')!;asked.push(video);
      if(video==='blockedvid0'){res.statusCode=401;res.end('Unauthorized');return;}
      if(video==='missingvid0'){res.statusCode=404;res.end('Not Found');return;}
      if(video==='flakyvideo0'){res.statusCode=503;res.end('');return;}
      res.end(JSON.stringify({title:`Título\n <b>${video}</b>`,author_name:'Canal'}));return;}
    if(req.url?.endsWith('/wallet')){const body=JSON.parse(raw),balance=wallets.get(body.userId)??1000;
      if(applied.has(body.requestId)){res.end(JSON.stringify({balance,applied:applied.get(body.requestId)}));return;}
      if(balance+body.amount<0){res.statusCode=409;res.end(JSON.stringify({error:'Moedas insuficientes.'}));return;}
      wallets.set(body.userId,balance+body.amount);applied.set(body.requestId,body.amount);charges.push({userId:body.userId,amount:body.amount,reason:body.reason.replace(/[0-9a-f-]{36}/,'<key>')});res.end(JSON.stringify({balance:balance+body.amount,applied:body.amount}));return;}
    res.end(JSON.stringify(req.url?.endsWith('/validate')?{valid:true,blocked:[],role:'user',equippedSkin:'nathan',ownedSkins:['nathan'],balance:1000}:req.url?.endsWith('/controls')?{controls:[]}:{ok:true}));});
  await new Promise<void>(r=>api.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  process.env.API_INTERNAL_URL=base;process.env.YOUTUBE_OEMBED_URL=`${base}/oembed`;
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});let authoritative:BarRoom;
  server.define('bar',BarRoom).on('create',room=>{authoritative=room as BarRoom;});await server.listen(0,'127.0.0.1');
  const client=new Client(`http://127.0.0.1:${(http.address() as AddressInfo).port}`),rooms:Room[]=[];
  const join=async(id:string)=>{const room=await client.joinOrCreate('bar',{ticket:signTicket({userId:id,sessionId:`session-${id}`,displayName:id,role:'user',color:'#aa8844'})});rooms.push(room);
    for(const type of ['chat.message','jukebox.result','tv.result','tv.open','wallet.state'])room.onMessage(type,()=>{});return room;};
  // Below the four-command/second limit of each kind.
  const send=async(room:Room,type:string,payload:unknown)=>{await pause(270);room.send(type,payload);};
  try {
    const a=await join('music-a'),errors:string[]=[],opens:string[]=[];a.onMessage('error',m=>errors.push(m.message));a.onMessage('jukebox.open',m=>opens.push(m.id));
    await until(()=>!!a.state?.jukeboxes?.has('jukebox'));
    const jukebox=()=>a.state.jukeboxes.get('jukebox'),play=(video:string)=>({id:'jukebox',revision:jukebox().revision,action:'play',url:`https://youtu.be/${video}`});
    await send(a,'jukebox.command',play('M7lc1UVf-VE'));await until(()=>errors.some(e=>e.includes('perto')));assert.equal(jukebox().status,'off');
    const player=authoritative!.state.players.get('music-a')!,point=INTERACTABLES.find(i=>i.id==='jukebox')!;
    player.assign({x:point.x,y:point.y,z:point.z});
    await send(a,'player.interact',{objectId:'jukebox'});await until(()=>opens.length===1);assert.equal(player.animationState,'use');assert.equal(player.interactionState,'');
    // An idle source plays the first video at once; the title is YouTube's, as one line of text.
    await send(a,'jukebox.command',play('M7lc1UVf-VE'));await until(()=>jukebox().revision===1);
    assert.deepEqual([jukebox().videoId,jukebox().status,jukebox().by,jukebox().byName,jukebox().title],['M7lc1UVf-VE','playing','music-a','music-a','Título <b>M7lc1UVf-VE</b>']);
    // A late joiner sees it; at the jukebox they cannot work someone else's video, only queue their own.
    const b=await join('music-b'),otherErrors:string[]=[];b.onMessage('error',m=>otherErrors.push(m.message));
    await until(()=>b.state?.jukeboxes?.get('jukebox')?.revision===1);
    const other=authoritative!.state.players.get('music-b')!;other.assign({x:point.x,y:point.y,z:point.z});
    await send(b,'jukebox.command',{id:'jukebox',revision:1,action:'pause'});await until(()=>otherErrors.some(e=>e.includes('Quem controla este vídeo é music-a')));
    assert.equal(jukebox().status,'playing');
    await send(b,'jukebox.command',{...play('aqz-KE-bpKQ'),revision:0});await until(()=>jukebox().queue.length===1);
    const queued=jukebox().queue[0];assert.deepEqual([queued.videoId,queued.title,queued.by,queued.byName],['aqz-KE-bpKQ','Título <b>aqz-KE-bpKQ</b>','music-b','music-b']);
    assert.equal(jukebox().revision,1,'queueing never touches the playback');
    // A video YouTube does not let play on other sites (or that does not exist) never enters the queue, and costs nothing.
    otherErrors.length=0;
    await send(b,'jukebox.command',play('blockedvid0'));await until(()=>otherErrors.some(e=>e.includes('não deixa este vídeo tocar fora')));
    await send(b,'jukebox.command',play('missingvid0'));await until(()=>otherErrors.some(e=>e.includes('removido')));
    await send(b,'jukebox.command',play('aqz-KE-bpKQ'));await until(()=>otherErrors.some(e=>e.includes('já está na fila')));
    // Without an answer from YouTube the video goes through (the players' own error skips it).
    await send(b,'jukebox.command',play('flakyvideo0'));await until(()=>jukebox().queue.length===2);
    assert.equal(jukebox().queue[1].title,'');
    // The controller pauses, seeks; a stale revision is refused.
    await send(a,'jukebox.command',{id:'jukebox',revision:1,action:'pause'});await until(()=>jukebox().status==='paused');
    errors.length=0;await send(a,'jukebox.command',{id:'jukebox',revision:1,action:'resume'});await until(()=>errors.some(e=>e.includes('Outra pessoa')));
    // From wherever they hear it, even away from the jukebox; out of earshot, no.
    player.assign({z:JUKEBOX.z+8});
    await send(a,'jukebox.command',{id:'jukebox',revision:2,action:'seek',position:95});await until(()=>jukebox().revision===3);
    assert.deepEqual([jukebox().position,jukebox().status],[95,'paused']);
    player.assign({z:JUKEBOX.z+30});errors.length=0;
    await send(a,'jukebox.command',{id:'jukebox',revision:3,action:'resume'});await until(()=>errors.some(e=>e.includes('Chegue mais perto da jukebox para controlar')));
    player.assign({x:point.x,y:point.y,z:point.z});
    // Taking one's own video out gives its coins back; another person's cannot be taken out.
    const flaky=jukebox().queue[1].key;
    errors.length=0;await send(a,'jukebox.command',{id:'jukebox',revision:3,action:'remove',entry:flaky});await until(()=>errors.some(e=>e.includes('Só quem pôs')));
    await send(b,'jukebox.command',{id:'jukebox',revision:3,action:'remove',entry:flaky});await until(()=>jukebox().queue.length===1);
    await until(()=>charges.some(c=>c.userId==='music-b'&&c.amount===15));
    // Skipping plays the next one, controlled by whoever queued it.
    await send(a,'jukebox.command',{id:'jukebox',revision:3,action:'skip'});await until(()=>jukebox().revision===4);
    assert.deepEqual([jukebox().videoId,jukebox().status,jukebox().by,jukebox().position,jukebox().queue.length],['aqz-KE-bpKQ','playing','music-b',0,0]);
    // Reports: only from the controller, at its revision. A refusal within the first seconds skips it and refunds it.
    await send(a,'jukebox.failed',{id:'jukebox',revision:4,videoId:'aqz-KE-bpKQ',code:150});await pause(150);assert.equal(jukebox().revision,4);
    await send(b,'jukebox.failed',{id:'jukebox',revision:4,videoId:'aqz-KE-bpKQ',code:5});await pause(150);assert.equal(jukebox().revision,4,'not a "cannot play here" error');
    await send(b,'jukebox.failed',{id:'jukebox',revision:4,videoId:'aqz-KE-bpKQ',code:150});await until(()=>jukebox().status==='off');
    await until(()=>otherErrors.some(e=>e.includes('O YouTube não deixou "Título <b>aqz-KE-bpKQ</b>" tocar aqui')&&e.includes('moedas voltaram')));
    await until(()=>charges.filter(c=>c.userId==='music-b'&&c.amount===15).length===2);
    // A live broadcast: the timeline jumps to its live edge, past a day of seconds.
    await send(b,'jukebox.command',play('aqz-KE-bpKQ'));await until(()=>jukebox().revision===6);
    await send(a,'jukebox.live',{id:'jukebox',revision:6,videoId:'aqz-KE-bpKQ',edge:250_000});await pause(150);assert.equal(jukebox().live,false);
    await send(b,'jukebox.live',{id:'jukebox',revision:6,videoId:'aqz-KE-bpKQ',edge:250_000});await until(()=>jukebox().live);
    assert.deepEqual([jukebox().position,jukebox().revision],[250_000,7]);
    // An end long before the timeline gets there is not believed; a real one switches the source off (queue empty).
    await send(b,'jukebox.ended',{id:'jukebox',revision:7,videoId:'aqz-KE-bpKQ',duration:300_000});await pause(150);assert.equal(jukebox().status,'playing');
    await send(b,'jukebox.ended',{id:'jukebox',revision:7,videoId:'aqz-KE-bpKQ',duration:250_001});await until(()=>jukebox().status==='off');
    // Leaving the bar gives the control up: anyone at the jukebox takes it over with their first command.
    await send(b,'jukebox.command',play('M7lc1UVf-VE'));await until(()=>jukebox().revision===9);assert.equal(jukebox().by,'music-b');
    await b.leave();await until(()=>jukebox().by==='');
    await send(a,'jukebox.command',{id:'jukebox',revision:9,action:'pause'});await until(()=>jukebox().status==='paused');assert.equal(jukebox().by,'music-a');
    // Only choosing a video costs coins: a's first, b's three queued or played; refunds for the one taken out and the refused one.
    assert.deepEqual(charges.map(c=>[c.userId,c.amount,c.reason]),[['music-a',-15,'media:jukebox'],['music-b',-15,'media:jukebox'],['music-b',-15,'media:jukebox'],['music-b',15,'refund:<key>'],
      ['music-b',15,'refund:<key>'],['music-b',-15,'media:jukebox'],['music-b',-15,'media:jukebox']]);
    // The TVs are separate sources: own state map, messages and reach. Nothing crosses over.
    const tvOpens:string[]=[];a.onMessage('tv.open',m=>tvOpens.push(m.id));errors.length=0;
    const tv=(id='tv-main')=>a.state.televisions.get(id);
    await send(a,'tv.command',{id:'tv-main',revision:0,action:'play',url:'https://youtu.be/aqz-KE-bpKQ'});await until(()=>errors.some(e=>e.includes('perto da TV')));
    assert.equal(tv().status,'off');
    const hall=INTERACTABLES.find(i=>i.id==='tv-hall')!;player.assign({x:hall.x,y:hall.y,z:hall.z});
    await send(a,'player.interact',{objectId:'tv-hall'});await until(()=>tvOpens.length===1);assert.equal(tvOpens[0],'tv-main','Each screen opens its group');
    await send(a,'tv.command',{id:'tv-main',revision:0,action:'play',url:'https://youtu.be/aqz-KE-bpKQ'});await until(()=>tv().revision===1);
    assert.deepEqual([jukebox().videoId,jukebox().status],['M7lc1UVf-VE','paused'],'The TV never changes the jukebox');
    assert.deepEqual([...a.state.televisions.keys()].sort(),['telao','tv-main','tv-upstairs']);
    assert.equal(tv('telao').status,'off');assert.equal(tv('tv-upstairs').status,'off');
    // Upstairs is another group with its own panel.
    const upstairs=INTERACTABLES.find(i=>i.id==='tv-upstairs')!;player.assign({x:upstairs.x,y:upstairs.y,z:upstairs.z});
    await send(a,'player.interact',{objectId:'tv-upstairs'});await until(()=>tvOpens.length===2);assert.equal(tvOpens[1],'tv-upstairs');
    // A jukebox id is not a TV.
    errors.length=0;await send(a,'tv.command',{id:'jukebox',revision:10,action:'skip'});await until(()=>errors.some(e=>e.includes('desconhecido')));assert.equal(jukebox().status,'paused');
    // YouTube is asked once per video: its answers are reused.
    assert.equal(asked.filter(video=>video==='aqz-KE-bpKQ').length,1);
  } finally {
    await Promise.allSettled(rooms.filter(room=>room.connection?.isOpen).map(room=>room.leave()));await server.gracefullyShutdown(false);await new Promise<void>(r=>api.close(()=>r()));
    for(const [key,value] of [['API_INTERNAL_URL',previous.api],['YOUTUBE_OEMBED_URL',previous.oembed]] as const)if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
});
