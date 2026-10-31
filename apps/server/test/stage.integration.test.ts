import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';import {WebSocketTransport} from '@colyseus/ws-transport';import {Client,type Room} from '@colyseus/sdk';
import {STAGE_ENTRY,STAGE_PASS,TV_SPOTS,onStage} from '@bar/shared';import {signTicket} from '@bar/shared/tickets';
import {BarRoom} from '../src/BarRoom.js';
async function until(check:()=>boolean,ms=6000):Promise<void>{const deadline=Date.now()+ms;while(!check()){if(Date.now()>deadline)throw new Error('Timed out');await new Promise(r=>setTimeout(r,25));}}
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
test('the stage over real WebSockets: a paid pass opens its steps, it runs out, and its screen costs apart',{timeout:60000},async()=>{
  const previous=process.env.API_INTERNAL_URL;
  const wallets=new Map<string,number>([['broke',150]]),applied=new Map<string,number>(),charges:Array<{userId:string;amount:number;reason:string}>=[];
  const api=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;res.setHeader('content-type','application/json');
    if(req.url?.endsWith('/wallet')){const body=JSON.parse(raw),balance=wallets.get(body.userId)??1000;
      if(applied.has(body.requestId)){res.end(JSON.stringify({balance,applied:applied.get(body.requestId)}));return;}
      if(balance+body.amount<0){res.statusCode=409;res.end(JSON.stringify({error:'Moedas insuficientes.'}));return;}
      wallets.set(body.userId,balance+body.amount);applied.set(body.requestId,body.amount);charges.push({userId:body.userId,amount:body.amount,reason:body.reason});
      res.end(JSON.stringify({balance:balance+body.amount,applied:body.amount}));return;}
    const id=raw?JSON.parse(raw).userId:undefined;
    res.end(JSON.stringify(req.url?.endsWith('/validate')?{valid:true,blocked:[],role:'user',equippedSkin:'nathan',ownedSkins:['nathan'],balance:wallets.get(id)??1000}:req.url?.endsWith('/controls')?{controls:[]}:{ok:true}));});
  await new Promise<void>(r=>api.listen(0,'127.0.0.1',r));process.env.API_INTERNAL_URL=`http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});let room!:BarRoom;
  server.define('bar',BarRoom).on('create',created=>{room=created as BarRoom;});await server.listen(0,'127.0.0.1');
  const client=new Client(`http://127.0.0.1:${(http.address() as AddressInfo).port}`),rooms:Room[]=[];
  const join=async(id:string)=>{
    const joined=await client.joinOrCreate('bar',{ticket:signTicket({userId:id,sessionId:`session-${id}`,displayName:id,role:'user',color:'#aa8844'})});rooms.push(joined);
    const seen={errors:[] as string[],stage:[] as any[],balance:[] as number[],tv:[] as any[]};
    joined.onMessage('error',m=>seen.errors.push(m.message));joined.onMessage('stage.open',m=>seen.stage.push({...m,open:true}));joined.onMessage('stage.state',m=>seen.stage.push(m));
    joined.onMessage('wallet.state',m=>seen.balance.push(m.balance));joined.onMessage('tv.result',m=>seen.tv.push(m));
    for(const type of ['chat.message','inventory.state','job.state','tv.open'])joined.onMessage(type,()=>{});
    let seq=0;
    // Holds a direction like a key for `ticks` server steps, then returns where the room put the avatar.
    const walk=async(dx:number,dz:number,ticks:number)=>{for(let i=0;i<ticks;i++){joined.send('player.input',{seq:seq++,dx,dz,running:false,rotation:0});await pause(55);}await pause(150);return room.state.players.get(id)!;};
    return {room:joined,seen,walk,player:()=>room.state.players.get(id)!};
  };
  try{
    const singer=await join('singer');await until(()=>singer.seen.balance.length>0);
    // Without a pass the steps stop the body, like a wall.
    singer.player().assign({...STAGE_ENTRY});
    let at=await singer.walk(1,-.08,14);
    assert.ok(!onStage(at)&&Math.abs(at.y-.3)<.05,`Kept off the stage at ${at.x},${at.y},${at.z}`);
    // Touching the steps opens the pass; it is bought only there.
    singer.room.send('player.interact',{objectId:'stage'});await until(()=>singer.seen.stage.some(s=>s.open));
    assert.deepEqual(singer.seen.stage.find(s=>s.open),{until:0,price:STAGE_PASS.price,open:true});
    singer.player().assign({x:12,y:.15,z:1.6});singer.room.send('stage.buy',{});await until(()=>singer.seen.errors.some(e=>e.includes('escada do palco')));
    assert.equal(charges.length,0,'Nothing is charged away from the stage');
    // Past the one-second window of the refused buy, so both clicks below reach the room (two per second).
    singer.player().assign({...STAGE_ENTRY});await pause(1100);
    // A double click while the first charge is on its way buys one pass, not two.
    singer.room.send('stage.buy',{});singer.room.send('stage.buy',{});await until(()=>singer.player().stageUntil>0);
    await until(()=>singer.seen.errors.some(e=>e.includes('Aguarde')||e.includes('ainda está valendo')));
    assert.deepEqual(charges.map(c=>[c.userId,c.amount,c.reason]),[['singer',-STAGE_PASS.price,'stage:pass']]);
    assert.ok(Math.abs(singer.player().stageUntil-Date.now()-STAGE_PASS.durationMs)<5000,'The pass lasts its duration');
    await until(()=>singer.seen.stage.some(s=>!s.open&&s.until>0));
    await pause(1100);singer.room.send('stage.buy',{});await until(()=>singer.seen.errors.some(e=>e.includes('ainda está valendo')));
    assert.equal(charges.length,1,'A valid pass is never sold twice');
    // With it, up the steps, between the left PA and the sound desk.
    at=await singer.walk(1,-.08,22);
    assert.ok(onStage(at)&&Math.abs(at.y-.9)<.05,`On the stage at ${at.x},${at.y},${at.z}`);
    // It runs out up there: free to stay and to come down, but not to go back up.
    singer.player().stageUntil=Date.now()-1;
    await until(()=>singer.player().stageUntil===0&&singer.seen.stage.some(s=>s.message?.includes('até descer')));
    at=await singer.walk(-1,.08,24);
    assert.ok(!onStage(at)&&Math.abs(at.y-.3)<.05,`Came down to ${at.x},${at.y},${at.z}`);
    at=await singer.walk(1,-.08,22);
    assert.ok(!onStage(at),'Without a new pass the steps stop the body again');
    // Not enough coins: the wallet refuses and no pass is given.
    const broke=await join('broke');await until(()=>broke.seen.balance.length>0);broke.player().assign({...STAGE_ENTRY,z:STAGE_ENTRY.z+.3});
    await pause(300);broke.room.send('stage.buy',{});await until(()=>broke.seen.errors.some(e=>e.includes('insuficientes')));
    assert.equal(broke.player().stageUntil,0);
    // The stage screen is used at the front of the stage, without a pass, and a new video costs its own price.
    singer.player().assign({...TV_SPOTS.telao!});await pause(300);
    singer.room.send('tv.command',{id:'telao',revision:0,action:'play',url:'https://youtu.be/M7lc1UVf-VE'});
    await until(()=>singer.seen.tv.length>0);
    assert.equal(room.state.televisions.get('telao')!.status,'playing');
    assert.deepEqual(charges.filter(c=>c.reason==='media:telao').map(c=>c.amount),[-50]);
    // Up on the deck, at its front edge (0.6 m above the backyard), the telão is in reach too.
    singer.player().assign({x:25.5,y:.9,z:-21.85});await pause(300);
    assert.ok(onStage(singer.player()));
    const errors=singer.seen.errors.length;
    singer.room.send('tv.command',{id:'telao',revision:room.state.televisions.get('telao')!.revision,action:'play',url:'https://youtu.be/aqz-KE-bpKQ'});
    await until(()=>singer.seen.tv.length>1||singer.seen.errors.length>errors);
    assert.deepEqual(singer.seen.errors.slice(errors),[]);
    // With a video playing, the new one waits in the queue, paid as well.
    assert.equal(room.state.televisions.get('telao')!.videoId,'M7lc1UVf-VE');
    assert.deepEqual(room.state.televisions.get('telao')!.queue.map(entry=>entry.videoId),['aqz-KE-bpKQ']);
    assert.deepEqual(charges.filter(c=>c.reason==='media:telao').map(c=>c.amount),[-50,-50]);
  }finally{
    await Promise.allSettled(rooms.filter(r=>r.connection?.isOpen).map(r=>r.leave()));
    await server.gracefullyShutdown(false).catch(()=>{});api.close();
    if(previous===undefined)delete process.env.API_INTERNAL_URL;else process.env.API_INTERNAL_URL=previous;
  }
});
