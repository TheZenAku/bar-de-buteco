import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';import {WebSocketTransport} from '@colyseus/ws-transport';import {Client,type Room} from '@colyseus/sdk';
import {VOICE,VOICE_CODECS,encodeVoicePacket,unwrapVoice} from '@bar/shared';import {signTicket} from '@bar/shared/tickets';
import {BarRoom} from '../src/BarRoom.js';
async function until(check:()=>boolean):Promise<void>{const deadline=Date.now()+4000;while(!check()){if(Date.now()>deadline)throw new Error('Timed out');await new Promise(r=>setTimeout(r,20));}}
const settle=(ms=150)=>new Promise(r=>setTimeout(r,ms));

test('proximity voice: only switched-on speakers, relayed to listeners in earshot who have not blocked them', {timeout:20000},async()=>{
  const previous=process.env.API_INTERNAL_URL;
  // voice-d has blocked voice-a.
  const api=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;const userId=body?JSON.parse(body).userId:'';res.setHeader('content-type','application/json');
    res.end(JSON.stringify(req.url?.endsWith('/validate')?{valid:true,blocked:userId==='voice-d'?['voice-a']:[],role:'user',equippedSkin:'nathan',ownedSkins:['nathan']}:req.url?.endsWith('/controls')?{controls:[]}:{ok:true}));});
  await new Promise<void>(r=>api.listen(0,'127.0.0.1',r));process.env.API_INTERNAL_URL=`http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});let authoritative:BarRoom;
  server.define('bar',BarRoom).on('create',room=>{authoritative=room as BarRoom;});await server.listen(0,'127.0.0.1');
  const client=new Client(`http://127.0.0.1:${(http.address() as AddressInfo).port}`),rooms:Room[]=[];
  const heard=new Map<string,Array<{speakerId:string;packet:Uint8Array}>>();
  const join=async(id:string)=>{
    const room=await client.joinOrCreate('bar',{ticket:signTicket({userId:id,sessionId:`session-${id}`,displayName:id,role:'user',color:'#aa8844'})});rooms.push(room);
    heard.set(id,[]);room.onMessage('chat.message',()=>{});room.onMessage('voice',(bytes:Uint8Array)=>{const frame=unwrapVoice(bytes);if(frame)heard.get(id)!.push(frame);});
    await until(()=>!!authoritative?.state.players.get(id));return room;
  };
  try {
    const [a,b,c,d]=[await join('voice-a'),await join('voice-b'),await join('voice-c'),await join('voice-d')];
    const place=(id:string,x:number,z:number)=>authoritative!.state.players.get(id)!.assign({x,y:.3,z});
    place('voice-a',14.8,1);place('voice-b',16,1);place('voice-c',14.8,1+VOICE.maxDistance+2);place('voice-d',13.8,1);
    const packet=encodeVoicePacket(VOICE_CODECS.opus,7,[new Uint8Array([1,2,3]),new Uint8Array([4,5])]);
    a.sendBytes('voice',packet);await settle();
    assert.equal(heard.get('voice-b')!.length,0,'A switched-off microphone is never relayed');
    a.send('voice.state',{mic:true,listen:true});
    await until(()=>b.state.players.get('voice-a')?.voice===true);
    a.sendBytes('voice',packet);
    await until(()=>heard.get('voice-b')!.length===1);await settle();
    assert.equal(heard.get('voice-b')![0]!.speakerId,'voice-a');
    assert.deepEqual([...heard.get('voice-b')![0]!.packet],[...packet]);
    assert.equal(heard.get('voice-c')!.length,0,'Beyond earshot');
    assert.equal(heard.get('voice-d')!.length,0,'Blocked the speaker');
    assert.equal(heard.get('voice-a')!.length,0,'Speakers do not hear themselves');
    // Malformed packets are dropped.
    a.sendBytes('voice',new Uint8Array([9,0,0,1,0,1,0]));await settle();
    assert.equal(heard.get('voice-b')!.length,1);
    // Switching other voices off stops the relay to that listener.
    b.send('voice.state',{mic:false,listen:false});await settle();
    a.sendBytes('voice',packet);await settle();
    assert.equal(heard.get('voice-b')!.length,1);
    b.send('voice.state',{mic:false,listen:true});await settle(1100);
    // A flood is capped per second.
    for(let i=0;i<VOICE.maxPacketsPerSecond+20;i++)a.sendBytes('voice',encodeVoicePacket(VOICE_CODECS.opus,i,[new Uint8Array([i&255])]));
    await settle(400);
    assert.ok(heard.get('voice-b')!.length-1<=VOICE.maxPacketsPerSecond,`Relayed ${heard.get('voice-b')!.length-1} packets in one second`);
    // A dropped session no longer speaks.
    await a.leave();await until(()=>b.state.players.get('voice-a')?.voice===false);
    void c;void d;
  } finally {
    await Promise.allSettled(rooms.filter(room=>room.connection?.isOpen).map(room=>room.leave()));await server.gracefullyShutdown(false);await new Promise<void>(r=>api.close(()=>r()));
    if(previous===undefined)delete process.env.API_INTERNAL_URL;else process.env.API_INTERNAL_URL=previous;
  }
});
