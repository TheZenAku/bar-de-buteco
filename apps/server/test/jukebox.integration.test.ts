import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';import {WebSocketTransport} from '@colyseus/ws-transport';import {Client,type Room} from '@colyseus/sdk';
import {DEFAULT_CHARACTER,JUKEBOX,INTERACTABLES} from '@bar/shared';import {signTicket} from '@bar/shared/tickets';
import {BarRoom} from '../src/BarRoom.js';
async function until(check:()=>boolean):Promise<void>{const deadline=Date.now()+4000;while(!check()){if(Date.now()>deadline)throw new Error('Timed out');await new Promise(r=>setTimeout(r,20));}}
test('real room: proximity, late join, shared controls, conflicting revisions and stale ends', {timeout:20000},async()=>{
  const previous=process.env.API_INTERNAL_URL;
  const wallets=new Map<string,number>(),applied=new Map<string,number>(),charges:Array<{userId:string;amount:number;reason:string}>=[];
  const api=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;res.setHeader('content-type','application/json');
    if(req.url?.endsWith('/wallet')){const body=JSON.parse(raw),balance=wallets.get(body.userId)??1000;
      if(applied.has(body.requestId)){res.end(JSON.stringify({balance,applied:applied.get(body.requestId)}));return;}
      if(balance+body.amount<0){res.statusCode=409;res.end(JSON.stringify({error:'Moedas insuficientes.'}));return;}
      wallets.set(body.userId,balance+body.amount);applied.set(body.requestId,body.amount);charges.push({userId:body.userId,amount:body.amount,reason:body.reason});res.end(JSON.stringify({balance:balance+body.amount,applied:body.amount}));return;}
    res.end(JSON.stringify(req.url?.endsWith('/validate')?{valid:true,blocked:[],role:'user',character:DEFAULT_CHARACTER,equippedSkin:'custom',ownedSkins:[],balance:1000}:req.url?.endsWith('/controls')?{controls:[]}:{ok:true}));});
  await new Promise<void>(r=>api.listen(0,'127.0.0.1',r));process.env.API_INTERNAL_URL=`http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});let authoritative:BarRoom;
  server.define('bar',BarRoom).on('create',room=>{authoritative=room as BarRoom;});await server.listen(0,'127.0.0.1');
  const client=new Client(`http://127.0.0.1:${(http.address() as AddressInfo).port}`),rooms:Room[]=[];
  const join=async(id:string)=>{const room=await client.joinOrCreate('bar',{ticket:signTicket({userId:id,sessionId:`session-${id}`,displayName:id,role:'user',color:'#aa8844'})});rooms.push(room);room.onMessage('chat.message',()=>{});room.onMessage('jukebox.result',()=>{});room.onMessage('tv.result',()=>{});room.onMessage('tv.open',()=>{});return room;};
  try {
    const a=await join('music-a'),errors:string[]=[],opens:string[]=[];a.onMessage('error',m=>errors.push(m.message));a.onMessage('jukebox.open',m=>opens.push(m.id));
    await until(()=>!!a.state?.jukeboxes?.has('jukebox'));
    const command={id:'jukebox',revision:0,action:'play',url:'https://youtu.be/M7lc1UVf-VE'};
    a.send('jukebox.command',command);await until(()=>errors.some(e=>e.includes('perto')));assert.equal(a.state.jukeboxes.get('jukebox').status,'off');
    const player=authoritative!.state.players.get('music-a')!,point=INTERACTABLES.find(i=>i.id==='jukebox')!;
    player.assign({x:point.x,y:point.y,z:point.z});
    a.send('player.interact',{objectId:'jukebox'});await until(()=>opens.length===1);assert.equal(player.animationState,'use');assert.equal(player.interactionState,'');
    a.send('jukebox.command',command);await until(()=>a.state.jukeboxes.get('jukebox').revision===1);
    const b=await join('music-b'),otherErrors:string[]=[];b.onMessage('error',m=>otherErrors.push(m.message));
    await until(()=>b.state?.jukeboxes?.get('jukebox')?.revision===1);
    assert.equal(b.state.jukeboxes.get('jukebox').videoId,'M7lc1UVf-VE');
    const other=authoritative!.state.players.get('music-b')!;other.assign({x:point.x,y:point.y,z:point.z});
    b.send('jukebox.command',{id:'jukebox',revision:1,action:'pause'});await until(()=>a.state.jukeboxes.get('jukebox').status==='paused');
    a.send('jukebox.command',{id:'jukebox',revision:1,action:'stop'});await until(()=>errors.some(e=>e.includes('Outra pessoa')));assert.equal(a.state.jukeboxes.get('jukebox').status,'paused');
    // Stay below the real four-command/second limit.
    await new Promise(r=>setTimeout(r,1050));
    a.send('jukebox.command',{...command,revision:2,url:'https://evil.test/watch?v=M7lc1UVf-VE'});await until(()=>errors.some(e=>e.includes('válido')));
    a.send('jukebox.command',{id:'jukebox',revision:2,action:'resume'});await until(()=>b.state.jukeboxes.get('jukebox').revision===3);
    // The TVs are separate sources: own state map, own messages, own reach. Nothing crosses over.
    await new Promise(r=>setTimeout(r,1050));
    const tvOpens:string[]=[];a.onMessage('tv.open',m=>tvOpens.push(m.id));
    // The ground floor's screens share one state (tv-main); upstairs has its own.
    a.send('tv.command',{id:'tv-main',revision:0,action:'play',url:'https://youtu.be/aqz-KE-bpKQ'});await until(()=>errors.some(e=>e.includes('perto da TV')));
    assert.equal(a.state.televisions.get('tv-main').status,'off');
    const tv=INTERACTABLES.find(i=>i.id==='tv-hall')!;player.assign({x:tv.x,y:tv.y,z:tv.z});
    a.send('player.interact',{objectId:'tv-hall'});await until(()=>tvOpens.length===1);assert.equal(tvOpens[0],'tv-main','Each screen opens its group');
    a.send('tv.command',{id:'tv-main',revision:0,action:'play',url:'https://youtu.be/aqz-KE-bpKQ'});await until(()=>b.state.televisions.get('tv-main')?.revision===1);
    assert.equal(b.state.televisions.get('tv-main').videoId,'aqz-KE-bpKQ');
    assert.deepEqual([b.state.jukeboxes.get('jukebox').videoId,b.state.jukeboxes.get('jukebox').status,b.state.jukeboxes.get('jukebox').revision],['M7lc1UVf-VE','playing',3],'The TV never changes the jukebox');
    // Another screen of the same group controls the same video.
    const counter=INTERACTABLES.find(i=>i.id==='tv-counter')!;player.assign({x:counter.x,y:counter.y,z:counter.z});
    a.send('tv.command',{id:'tv-main',revision:1,action:'pause'});await until(()=>b.state.televisions.get('tv-main').status==='paused');
    assert.equal(b.state.jukeboxes.get('jukebox').status,'playing','Pausing the TV leaves the jukebox playing');
    assert.deepEqual([...b.state.televisions.keys()].sort(),['telao','tv-main','tv-upstairs']);
    // Only choosing a video costs coins: one jukebox play and one TV play so far; pause, resume and stop are free.
    assert.deepEqual(charges.map(c=>[c.userId,c.amount,c.reason]),[['music-a',-15,'media:jukebox'],['music-a',-25,'media:tv-main']]);
    assert.equal(b.state.televisions.get('telao').status,'off','The stage screen keeps its own state');
    assert.equal(b.state.televisions.get('tv-upstairs').status,'off','Upstairs keeps its own state');
    // Upstairs cannot control the ground floor's group.
    await new Promise(r=>setTimeout(r,1050));
    const upstairs=INTERACTABLES.find(i=>i.id==='tv-upstairs')!;player.assign({x:upstairs.x,y:upstairs.y,z:upstairs.z});errors.length=0;
    a.send('tv.command',{id:'tv-main',revision:2,action:'resume'});await until(()=>errors.some(e=>e.includes('perto da TV')));
    assert.equal(b.state.televisions.get('tv-main').status,'paused');
    // A jukebox id is not a TV and the reverse.
    a.send('tv.command',{id:'jukebox',revision:3,action:'stop'});await new Promise(r=>setTimeout(r,150));
    assert.equal(b.state.jukeboxes.get('jukebox').status,'playing');
    b.send('jukebox.ended',{id:'jukebox',revision:1,videoId:'M7lc1UVf-VE',duration:1});
    player.z=JUKEBOX.z+10;
    a.send('jukebox.command',{id:'jukebox',revision:3,action:'off'});await new Promise(r=>setTimeout(r,150));assert.equal(b.state.jukeboxes.get('jukebox').status,'playing');
    b.send('jukebox.command',{id:'jukebox',revision:3,action:'off'});await until(()=>a.state.jukeboxes.get('jukebox').status==='off');assert.equal(a.state.jukeboxes.get('jukebox').videoId,'');
  } finally {
    await Promise.allSettled(rooms.map(room=>room.leave()));await server.gracefullyShutdown(false);await new Promise<void>(r=>api.close(()=>r()));
    if(previous===undefined)delete process.env.API_INTERNAL_URL;else process.env.API_INTERNAL_URL=previous;
  }
});
