import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';import {WebSocketTransport} from '@colyseus/ws-transport';import {Client,type Room} from '@colyseus/sdk';
import {DEFAULT_CHARACTER,JUKEBOX,INTERACTABLES} from '@bar/shared';import {signTicket} from '@bar/shared/tickets';
import {BarRoom} from '../src/BarRoom.js';
async function until(check:()=>boolean):Promise<void>{const deadline=Date.now()+4000;while(!check()){if(Date.now()>deadline)throw new Error('Timed out');await new Promise(r=>setTimeout(r,20));}}
test('real room: proximity, late join, shared controls, conflicting revisions and stale ends', {timeout:20000},async()=>{
  const previous=process.env.API_INTERNAL_URL;
  const api=createServer(async(req,res)=>{for await(const _ of req){}res.setHeader('content-type','application/json');res.end(JSON.stringify(req.url?.endsWith('/validate')?{valid:true,blocked:[],role:'user',character:DEFAULT_CHARACTER,equippedSkin:'custom',ownedSkins:[]}:req.url?.endsWith('/controls')?{controls:[]}:{ok:true}));});
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
    a.send('player.interact',{objectId:'jukebox'});await until(()=>opens.length===1);assert.notEqual(player.animationState,'dance');assert.equal(player.interactionState,'');
    a.send('jukebox.command',command);await until(()=>a.state.jukeboxes.get('jukebox').revision===1);
    const b=await join('music-b'),otherErrors:string[]=[];b.onMessage('error',m=>otherErrors.push(m.message));
    await until(()=>b.state?.jukeboxes?.get('jukebox')?.revision===1);
    assert.equal(b.state.jukeboxes.get('jukebox').videoId,'M7lc1UVf-VE');assert.equal(b.state.jukeboxes.get('jukebox').tvId,'','The jukebox has no TV: it plays on its own');
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
    a.send('tv.command',{id:'tv-hall',revision:0,action:'play',url:'https://youtu.be/aqz-KE-bpKQ'});await until(()=>errors.some(e=>e.includes('perto da TV')));
    assert.equal(a.state.televisions.get('tv-hall').status,'off');
    const tv=INTERACTABLES.find(i=>i.id==='tv-hall')!;player.assign({x:tv.x,y:tv.y,z:tv.z});
    a.send('player.interact',{objectId:'tv-hall'});await until(()=>tvOpens.length===1);
    a.send('tv.command',{id:'tv-hall',revision:0,action:'play',url:'https://youtu.be/aqz-KE-bpKQ'});await until(()=>b.state.televisions.get('tv-hall')?.revision===1);
    assert.equal(b.state.televisions.get('tv-hall').videoId,'aqz-KE-bpKQ');
    assert.deepEqual([b.state.jukeboxes.get('jukebox').videoId,b.state.jukeboxes.get('jukebox').status,b.state.jukeboxes.get('jukebox').revision],['M7lc1UVf-VE','playing',3],'The TV never changes the jukebox');
    a.send('tv.command',{id:'tv-hall',revision:1,action:'pause'});await until(()=>b.state.televisions.get('tv-hall').status==='paused');
    assert.equal(b.state.jukeboxes.get('jukebox').status,'playing','Pausing the TV leaves the jukebox playing');
    for(const id of ['tv-left','tv-counter','tv-upstairs'])assert.equal(b.state.televisions.get(id).status,'off','Each TV keeps its own state');
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
