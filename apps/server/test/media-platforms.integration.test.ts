import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';import {WebSocketTransport} from '@colyseus/ws-transport';import {Client,type Room} from '@colyseus/sdk';
import {INTERACTABLES} from '@bar/shared';import {signTicket} from '@bar/shared/tickets';
import {BarRoom} from '../src/BarRoom.js';
async function until(check:()=>boolean):Promise<void>{const deadline=Date.now()+4000;while(!check()){if(Date.now()>deadline)throw new Error('Timed out');await new Promise(r=>setTimeout(r,20));}}
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));

/** A real room, its wallet API and one player at the jukebox. */
async function room(providers:string|undefined,run:(tools:{client:Room;play:(url:string)=>Promise<void>;errors:string[];charges:number[];jukebox:()=>any;authoritative:BarRoom})=>Promise<void>):Promise<void> {
  const previous={api:process.env.API_INTERNAL_URL,providers:process.env.MEDIA_PROVIDERS},charges:number[]=[],applied=new Map<string,number>();let balance=1000;
  const api=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;res.setHeader('content-type','application/json');
    if(req.url?.endsWith('/wallet')){const body=JSON.parse(raw);if(!applied.has(body.requestId)){balance+=body.amount;applied.set(body.requestId,body.amount);charges.push(body.amount);}res.end(JSON.stringify({balance,applied:applied.get(body.requestId)}));return;}
    res.end(JSON.stringify(req.url?.endsWith('/validate')?{valid:true,blocked:[],role:'user',equippedSkin:'nathan',ownedSkins:['nathan'],balance}:req.url?.endsWith('/controls')?{controls:[]}:{ok:true}));});
  await new Promise<void>(r=>api.listen(0,'127.0.0.1',r));
  process.env.API_INTERNAL_URL=`http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  if(providers===undefined)delete process.env.MEDIA_PROVIDERS;else process.env.MEDIA_PROVIDERS=providers;
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});let authoritative:BarRoom;
  server.define('bar',BarRoom).on('create',created=>{authoritative=created as BarRoom;});await server.listen(0,'127.0.0.1');
  const client=await new Client(`http://127.0.0.1:${(http.address() as AddressInfo).port}`).joinOrCreate('bar',{ticket:signTicket({userId:'music-a',sessionId:'session-a',displayName:'music-a',role:'user',color:'#aa8844'})});
  for(const type of ['chat.message','jukebox.result','tv.result','tv.open','wallet.state','jukebox.open'])client.onMessage(type,()=>{});
  const errors:string[]=[];client.onMessage('error',m=>errors.push(m.message));
  try {
    await until(()=>!!client.state?.jukeboxes?.has('jukebox'));
    const point=INTERACTABLES.find(i=>i.id==='jukebox')!;authoritative!.state.players.get('music-a')!.assign({x:point.x,y:point.y,z:point.z});
    const jukebox=()=>client.state.jukeboxes.get('jukebox');
    await run({client,errors,charges,jukebox,authoritative:authoritative!,play:async url=>{await pause(270);client.send('jukebox.command',{id:'jukebox',revision:jukebox().revision,action:'play',url});}});
  } finally {
    if(client.connection?.isOpen)await client.leave().catch(()=>{});await server.gracefullyShutdown(false);await new Promise<void>(r=>api.close(()=>r()));
    for(const [key,value] of [['API_INTERNAL_URL',previous.api],['MEDIA_PROVIDERS',previous.providers]] as const)if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
}

test('real room: links of other platforms reach every client, are charged and refunded like any other',{timeout:30000},()=>room(undefined,async({client,play,errors,charges,jukebox})=>{
  await play('https://soundcloud.com/forss/flickermood');await until(()=>jukebox().status==='playing');
  assert.deepEqual([jukebox().provider,jukebox().videoId],['soundcloud','forss/flickermood']);
  assert.equal(charges.length,1);
  await play('https://www.twitch.tv/gaules');await until(()=>jukebox().queue.length===1);
  await play('https://cdn.example.com/show%20boa.mp3?token=abc');await until(()=>jukebox().queue.length===2);
  assert.deepEqual(jukebox().queue.map((entry:any)=>[entry.provider,entry.videoId,entry.title]),[['twitch','channel:gaules','Twitch: gaules'],['file','https://cdn.example.com/show%20boa.mp3?token=abc','show boa']]);
  assert.equal(charges.length,3);
  // What cannot play here is told at once, and costs nothing.
  errors.length=0;await play('https://www.facebook.com/watch/?v=1');await until(()=>errors.some(e=>e.includes('Facebook')));
  errors.length=0;await play('https://192.168.0.1/a.mp4');await until(()=>errors.some(e=>e.includes('válido')));
  assert.equal(charges.length,3);
  // A skip brings the next platform; a channel is live from the start.
  await pause(270);client.send('jukebox.command',{id:'jukebox',revision:jukebox().revision,action:'skip'});await until(()=>jukebox().provider==='twitch');
  assert.equal(jukebox().live,true);
  // A channel off the air (its player's report) moves on, with the coins back, and the message names the platform.
  errors.length=0;await pause(270);client.send('jukebox.failed',{id:'jukebox',revision:jukebox().revision,videoId:jukebox().videoId,code:150});
  await until(()=>jukebox().provider==='file');await until(()=>errors.some(e=>e.startsWith('A Twitch não deixou')));
  assert.equal(charges.length,4);assert.ok(charges[3]!>0,'refunded');
  assert.equal(jukebox().live,false);
  // A report may carry a long address; the end of the last one switches off and clears the platform.
  await pause(270);client.send('jukebox.ended',{id:'jukebox',revision:jukebox().revision,videoId:jukebox().videoId,duration:1});
  await until(()=>jukebox().status==='off');assert.deepEqual([jukebox().provider,jukebox().videoId],['','']);
}));

test('real room: MEDIA_PROVIDERS switches platforms off, before any coin moves',{timeout:30000},()=>room('youtube,soundcloud',async({play,errors,charges,jukebox})=>{
  await play('https://cdn.example.com/a.mp4');await until(()=>errors.some(e=>e.includes('Link direto')&&e.includes('desativados')));
  await play('https://www.twitch.tv/gaules');await until(()=>errors.some(e=>e.includes('Twitch')&&e.includes('desativados')));
  assert.equal(jukebox().status,'off');assert.equal(charges.length,0);
  await play('https://soundcloud.com/forss/flickermood');await until(()=>jukebox().provider==='soundcloud');
  assert.equal(charges.length,1);
}));
