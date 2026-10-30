import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';import {WebSocketTransport} from '@colyseus/ws-transport';import {Client,type Room} from '@colyseus/sdk';
import {PHONE,VOICE,VOICE_CODECS,encodeVoicePacket,unwrapVoice,type PhoneCallView,type PhonePing} from '@bar/shared';import {signTicket} from '@bar/shared/tickets';
import {BarRoom} from '../src/BarRoom.js';
import {PhoneCalls} from '../src/world/phone-calls.js';
async function until(check:()=>boolean):Promise<void>{const deadline=Date.now()+4000;while(!check()){if(Date.now()>deadline)throw new Error('Timed out');await new Promise(r=>setTimeout(r,20));}}
const settle=(ms=150)=>new Promise(r=>setTimeout(r,ms));

test('phone calls ring one player at a time, expire unanswered and end once',()=>{
  const calls=new PhoneCalls(1000);
  const call=calls.start('a','b',0);
  assert.throws(()=>calls.start('c','b',0),/ocupada/);assert.throws(()=>calls.start('a','c',0),/já está/);assert.throws(()=>calls.start('c','c',0));
  assert.equal(calls.peerOf('a'),undefined,'no voice before it is answered');
  assert.throws(()=>calls.answer(call.id,'a',10),'only the one called answers');
  assert.deepEqual(calls.expire(999),[]);
  assert.deepEqual(calls.expire(1000).map(c=>c.id),[call.id]);assert.equal(calls.of('a'),undefined);assert.equal(calls.size,0);
  const second=calls.start('a','b',2000);calls.answer(second.id,'b',2100);
  assert.equal(calls.peerOf('a'),'b');assert.equal(calls.peerOf('b'),'a');assert.deepEqual(calls.expire(9e9),[],'answered calls do not expire');
  assert.equal(calls.end(second.id)?.id,second.id);assert.equal(calls.end(second.id),undefined);
});

test('phone calls through the room: busy lines, answering, voice at any distance, hanging up and pings',{timeout:20000},async()=>{
  const previous=process.env.API_INTERNAL_URL;
  // phone-d has blocked phone-a.
  const api=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;const userId=body?JSON.parse(body).userId:'';res.setHeader('content-type','application/json');
    res.end(JSON.stringify(req.url?.endsWith('/validate')?{valid:true,blocked:userId==='phone-d'?['phone-a']:[],role:'user',equippedSkin:'nathan',ownedSkins:['nathan']}:req.url?.endsWith('/controls')?{controls:[]}:{ok:true}));});
  await new Promise<void>(r=>api.listen(0,'127.0.0.1',r));process.env.API_INTERNAL_URL=`http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  // The production socket limit (apps/server/src/index.ts): a video frame has to fit in one message.
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http,maxPayload:8192}),greet:false,gracefullyShutdown:false});let authoritative:BarRoom;
  server.define('bar',BarRoom).on('create',room=>{authoritative=room as BarRoom;});await server.listen(0,'127.0.0.1');
  const client=new Client(`http://127.0.0.1:${(http.address() as AddressInfo).port}`),rooms:Room[]=[];
  const calls=new Map<string,PhoneCallView[]>(),pings=new Map<string,PhonePing[]>(),heard=new Map<string,string[]>(),seen=new Map<string,number[]>();
  const join=async(id:string)=>{
    const room=await client.joinOrCreate('bar',{ticket:signTicket({userId:id,sessionId:`session-${id}`,displayName:id.toUpperCase(),role:'user',color:'#aa8844'})});rooms.push(room);
    calls.set(id,[]);pings.set(id,[]);heard.set(id,[]);seen.set(id,[]);
    room.onMessage('phone.video',(bytes:Uint8Array)=>seen.get(id)!.push(bytes.length));
    room.onMessage('phone.call',(view:PhoneCallView)=>calls.get(id)!.push(view));room.onMessage('phone.ping',(ping:PhonePing)=>pings.get(id)!.push(ping));
    room.onMessage('voice',(bytes:Uint8Array)=>{const frame=unwrapVoice(bytes);if(frame)heard.get(id)!.push(frame.speakerId);});
    room.onMessage('chat.message',()=>{});room.onMessage('error',()=>{});
    await until(()=>!!authoritative?.state.players.get(id));return room;
  };
  const last=(id:string)=>calls.get(id)!.at(-1);
  try {
    const [a,b,c,d]=[await join('phone-a'),await join('phone-b'),await join('phone-c'),await join('phone-d')];
    const place=(id:string,x:number,z:number)=>authoritative!.state.players.get(id)!.assign({x,y:.3,z});
    place('phone-a',14.8,1);place('phone-b',14.8,1+VOICE.maxDistance+20);place('phone-c',14.8,1-VOICE.maxDistance-20);place('phone-d',14.8,2);

    // Refused calls never ring the other side.
    a.send('phone.call',{to:'phone-d'});await until(()=>last('phone-a')?.state==='ended');
    assert.equal(last('phone-a')!.reason,'blocked');assert.equal(calls.get('phone-d')!.length,0);
    a.send('phone.call',{to:'phone-x'});await until(()=>last('phone-a')?.reason==='offline');
    // Two calls a second at most.
    await settle(1000);a.send('phone.call',{to:'phone-a'});await until(()=>last('phone-a')?.reason==='self');

    a.send('phone.call',{to:'phone-b'});
    await until(()=>last('phone-b')?.state==='incoming');
    assert.equal(last('phone-a')!.state,'outgoing');assert.equal(last('phone-b')!.peerId,'phone-a');assert.equal(last('phone-b')!.peerName,'PHONE-A');
    const id=last('phone-b')!.id;
    c.send('phone.call',{to:'phone-b'});await until(()=>last('phone-c')?.reason==='busy');
    // Before answering, nothing of the caller's voice crosses the distance.
    a.send('voice.state',{mic:true,listen:true});await until(()=>authoritative!.state.players.get('phone-a')!.voice);
    const packet=encodeVoicePacket(VOICE_CODECS.opus,1,[new Uint8Array([1,2,3])]);
    a.sendBytes('voice',packet);await settle();assert.equal(heard.get('phone-b')!.length,0);
    // A video frame is a whole JPEG; nothing crosses before the call is answered either.
    const frame=(size=1200)=>{const bytes=new Uint8Array(size).fill(7);bytes.set([0xff,0xd8,0xff]);return bytes;};
    a.sendBytes('phone.video',frame());await settle();assert.equal(seen.get('phone-b')!.length,0);

    c.send('phone.answer',{id});await settle();assert.equal(last('phone-a')!.state,'outgoing','only the one called answers');
    b.send('voice.state',{mic:true,listen:false});
    b.send('phone.answer',{id});
    await until(()=>last('phone-a')?.state==='active'&&last('phone-b')?.state==='active');
    assert.ok(last('phone-a')!.answeredAt);
    await until(()=>authoritative!.state.players.get('phone-a')!.phone==='call'&&authoritative!.state.players.get('phone-b')!.phone==='call');
    // On the line, the voice crosses the bar both ways, even with other voices switched off.
    a.sendBytes('voice',packet);await until(()=>heard.get('phone-b')!.length===1);
    b.sendBytes('voice',packet);await until(()=>heard.get('phone-a')!.length===1);
    await settle();
    assert.deepEqual(heard.get('phone-c'),[],'others far away hear nothing');
    assert.deepEqual(heard.get('phone-d'),[],'a block still cuts the voice');
    // The camera: to the other end only, never anything but a JPEG under the frame limit, at the video rate.
    a.sendBytes('phone.video',frame());await until(()=>seen.get('phone-b')!.length===1);
    a.sendBytes('phone.video',new Uint8Array(900).fill(1));a.sendBytes('phone.video',frame(PHONE.videoFrameMaxBytes+1));
    await settle(1100);assert.equal(seen.get('phone-b')!.length,1);
    for(let i=0;i<PHONE.videoFps*3;i++)b.sendBytes('phone.video',frame(400));
    await settle(400);
    assert.ok(seen.get('phone-a')!.length>=PHONE.videoFps&&seen.get('phone-a')!.length<=PHONE.videoFps+4,`at most ${PHONE.videoFps+4} frames a second, got ${seen.get('phone-a')!.length}`);
    assert.deepEqual([seen.get('phone-c'),seen.get('phone-d')],[[],[]]);

    // Pings: forwarded with the sender, unless one side blocked the other.
    a.send('phone.ping',{to:'phone-b',kind:'zap'});await until(()=>pings.get('phone-b')!.length===1);
    assert.deepEqual(pings.get('phone-b')![0],{kind:'zap',from:'phone-a',fromName:'PHONE-A'});
    a.send('phone.ping',{to:'phone-d',kind:'zap'});d.send('phone.ping',{to:'phone-a',kind:'pix'});await settle();
    assert.equal(pings.get('phone-d')!.length,0);assert.equal(pings.get('phone-a')!.length,0);

    b.send('phone.hangup',{id});
    await until(()=>last('phone-a')?.state==='ended'&&last('phone-b')?.state==='ended');
    assert.equal(last('phone-a')!.reason,'hangup');
    assert.equal(authoritative!.state.players.get('phone-a')!.phone,'');
    const count=heard.get('phone-b')!.length;a.sendBytes('voice',packet);await settle();assert.equal(heard.get('phone-b')!.length,count,'the line is closed');

    // The caller giving up is a missed call for the other side; leaving drops an answered call. A video call says so to both.
    await settle(500);a.send('phone.call',{to:'phone-c',video:true});await until(()=>last('phone-c')?.state==='incoming');
    assert.equal(last('phone-c')!.video,true);assert.equal(last('phone-a')!.video,true);
    const missed=last('phone-c')!.id;a.send('phone.hangup',{id:missed});
    await until(()=>last('phone-c')?.state==='ended');assert.equal(last('phone-c')!.reason,'missed');
    c.send('phone.call',{to:'phone-a'});await until(()=>last('phone-a')?.state==='incoming');
    a.send('phone.answer',{id:last('phone-a')!.id});await until(()=>last('phone-c')?.state==='active');
    await a.leave();
    await until(()=>last('phone-c')?.state==='ended');assert.equal(last('phone-c')!.reason,'dropped');
  } finally {
    await Promise.allSettled(rooms.filter(room=>room.connection?.isOpen).map(room=>room.leave()));await server.gracefullyShutdown(false);await new Promise<void>(r=>api.close(()=>r()));if(previous===undefined)delete process.env.API_INTERNAL_URL;else process.env.API_INTERNAL_URL=previous;
  }
});
