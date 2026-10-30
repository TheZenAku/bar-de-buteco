import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';import {WebSocketTransport} from '@colyseus/ws-transport';import {Client,type Room} from '@colyseus/sdk';
import {INTERACTABLES,MAGRAO_SPOT,NEEDS,URINALS,barClipMs,consumeMs,seatExit,standUpSpot} from '@bar/shared';import {signTicket} from '@bar/shared/tickets';
import {BarRoom} from '../src/BarRoom.js';
async function until(check:()=>boolean,ms=4000):Promise<void>{const deadline=Date.now()+ms;while(!check()){if(Date.now()>deadline)throw new Error('Timed out');await new Promise(r=>setTimeout(r,20));}}
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));

test('bar animations over real WebSockets: urinal, chair in and out, a cigarette, Magrão at the counter and being sick, timed by the clips and seen by others',{timeout:120000},async()=>{
  const previous=process.env.API_INTERNAL_URL;
  const api=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;res.setHeader('content-type','application/json');
    if(req.url?.endsWith('/wallet')){const body=JSON.parse(raw);res.end(JSON.stringify({balance:1000+body.amount,applied:body.amount}));return;}
    res.end(JSON.stringify(req.url?.endsWith('/validate')?{valid:true,blocked:[],role:'user',equippedSkin:'nathan',ownedSkins:['nathan'],balance:1000}:req.url?.endsWith('/controls')?{controls:[]}:{ok:true}));});
  await new Promise<void>(r=>api.listen(0,'127.0.0.1',r));process.env.API_INTERNAL_URL=`http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});let room!:BarRoom;
  server.define('bar',BarRoom).on('create',created=>{room=created as BarRoom;});await server.listen(0,'127.0.0.1');
  const client=new Client(`http://127.0.0.1:${(http.address() as AddressInfo).port}`),rooms:Room[]=[];
  const join=async(id:string)=>{
    const joined=await client.joinOrCreate('bar',{ticket:signTicket({userId:id,sessionId:`session-${id}`,displayName:id,role:'user',color:'#aa8844'})});rooms.push(joined);
    const errors:string[]=[],chat:string[]=[];joined.onMessage('error',m=>errors.push(m.message));joined.onMessage('chat.message',m=>chat.push(m.text));
    for(const type of ['wallet.state','job.state','inventory.state','table.state'])joined.onMessage(type,()=>{});
    await until(()=>!!room?.state.players.get(id));
    return {room:joined,errors,chat,player:()=>room.state.players.get(id)!,presence:()=>room['sessions'].getByUser(id)!};
  };
  try{
    const a=await join('anim-a'),b=await join('anim-b');
    // What the other browser sees of A.
    const seenA=()=>b.room.state.players?.get('anim-a');

    // Urinal: the body stands at Mictorio_Lugar_1 facing it for the whole `urinar` clip; one person at a time.
    const urinal=URINALS[0]!,object=INTERACTABLES.find(i=>i.id===urinal.id)!;
    assert.equal(object.type,'urinal');
    a.player().assign({x:urinal.x-.3,y:urinal.y,z:urinal.z});b.player().assign({x:urinal.x-.3,y:urinal.y,z:urinal.z+.3});
    room.needs.state('anim-a').bladder=80;await pause(150);
    a.room.send('player.interact',{objectId:urinal.id});await until(()=>a.player().animationState==='urinate');
    assert.deepEqual([a.player().x,a.player().z,a.player().rotation].map(v=>+v.toFixed(3)),[urinal.x,urinal.z,+urinal.yaw.toFixed(3)]);
    await until(()=>seenA()?.animationState==='urinate');
    b.room.send('player.interact',{objectId:urinal.id});await until(()=>b.errors.some(e=>e.includes('Ocupado')));
    const urinating=Date.now();
    await until(()=>a.player().animationState==='idle',barClipMs('urinar')+2000);
    assert.ok(Date.now()-urinating>=barClipMs('urinar')-300,'Free only once the clip has played');
    assert.ok(room.needs.state('anim-a').bladder<1,'Emptied');

    // A chair: getting up asked for while sitting down waits for `sentar`, then `levantar` leaves the body beside the chair.
    const seat=INTERACTABLES.find(i=>i.type==='seat'&&i.id==='seat-9')!,exit=standUpSpot(seat.id)!;
    assert.ok(Math.hypot(exit.x-seatExit(seat.id)!.x,exit.z-seatExit(seat.id)!.z)<.11);
    a.player().assign({x:exit.x,y:exit.y,z:exit.z});await pause(150);
    a.room.send('player.interact',{objectId:seat.id});await until(()=>a.player().animationState==='sit');
    const sat=a.player().animationStartedAt;
    assert.equal(a.player().rotation,seat.rotation,'Facing as the chair faces');
    a.room.send('player.interact',{objectId:'stand'});await until(()=>a.player().animationState==='stand-up');
    assert.equal(a.player().animationStartedAt,sat+barClipMs('sentar'),'Getting up starts once seated');
    assert.equal(a.player().interactionState,seat.id,'The chair stays taken while getting up');
    await until(()=>seenA()?.animationState==='stand-up');
    await until(()=>a.player().animationState==='idle',barClipMs('sentar')+barClipMs('levantar')+2000);
    assert.ok(Date.now()-sat>=barClipMs('sentar')+barClipMs('levantar')-300);
    assert.ok(Math.hypot(a.player().x-exit.x,a.player().z-exit.z)<.01,`Where levantar leaves the body: ${a.player().x},${a.player().z}`);

    // A picnic bench (mesa 27): reached from behind it, sat on at once, left at once behind it; one person per place.
    const bench=INTERACTABLES.find(i=>i.type==='seat'&&i.bench&&i.table===27)!,behind=standUpSpot(bench.id)!;
    a.player().assign({x:behind.x,y:behind.y,z:behind.z});b.player().assign({x:behind.x+.6,y:behind.y,z:behind.z});await pause(150);
    a.room.send('player.interact',{objectId:bench.id});await until(()=>a.player().animationState==='sit');
    assert.deepEqual([a.player().x,a.player().z,a.player().rotation],[bench.x,bench.z,bench.rotation],'On the bench, facing the table');
    b.room.send('player.interact',{objectId:bench.id});await until(()=>b.errors.some(e=>e.includes('ocupado')));
    a.room.send('player.interact',{objectId:'stand'});await until(()=>a.player().animationState==='idle',1000);
    assert.equal(a.player().interactionState,'');
    assert.ok(Math.hypot(a.player().x-behind.x,a.player().z-behind.z)<.01,'Behind the bench, on free floor');

    // A cigarette: lit, smoked with the body held still, put out on request (once lit) and stepped on.
    a.room.send('player.emote',{emote:'smoke'});await until(()=>a.player().animationState==='smoke');
    const lit=a.player().animationStartedAt,{x,z}=a.player();
    a.room.send('player.input',{seq:a.presence().lastReceived+1,dx:1,dz:0,running:false,rotation:0});await pause(200);
    assert.deepEqual([a.player().x,a.player().z],[x,z],'Smoking holds the body');
    a.room.send('player.emote',{emote:'dance'});await until(()=>a.errors.some(e=>e.includes('Levante-se')));
    a.room.send('player.emote',{emote:'smoke'});await until(()=>a.player().animationState==='smoke-stop');
    assert.equal(a.player().animationStartedAt,lit+barClipMs('fumar_acender'),'Put out only once lit');
    await until(()=>a.player().animationState==='idle',barClipMs('fumar_acender')+barClipMs('fumar_apagar')+2000);
    assert.equal(a.player().interactionState,'');

    // A whole cigarette (Shift+F): held still for all of `fumar_mixamo`, seen by others, not cut short; free where it began.
    a.room.send('player.emote',{emote:'cigarette'});await until(()=>a.player().animationState==='cigarette');
    const smoked=a.player().animationStartedAt,held=[a.player().x,a.player().z];
    assert.equal(a.player().interactionState,'cigarette');
    assert.equal(a.presence().interactionEndsAt,smoked+barClipMs('fumar_mixamo'),'Free when the clip ends');
    await until(()=>seenA()?.animationState==='cigarette');
    a.room.send('player.input',{seq:a.presence().lastReceived+1,dx:1,dz:0,running:false,rotation:0});
    a.room.send('player.interact',{objectId:'stand'});a.room.send('player.emote',{emote:'smoke'});await pause(200);
    assert.deepEqual([a.player().x,a.player().z],held,'Smoking it holds the body');
    assert.equal(a.player().animationState,'cigarette','E and F wait for the butt to be stepped on');
    // Its 17.9 s, fast-forwarded.
    a.presence().interactionEndsAt=Date.now();
    await until(()=>a.player().animationState==='idle');
    assert.equal(a.player().interactionState,'');
    assert.deepEqual([a.player().x,a.player().z],held,'The step onto the butt comes back');

    // Magrão: pours the chopp from his place behind the counter; when the clip ends it goes into the customer's hand, who
    // is free to walk away with it and has it over the same time as at a table.
    const counter=INTERACTABLES.find(i=>i.id==='counter')!,bartender=room.state.npcs.get('bartender')!;
    assert.deepEqual([bartender.x,bartender.z].map(v=>+v.toFixed(3)),[MAGRAO_SPOT.x,MAGRAO_SPOT.z]);
    b.player().assign({x:16.9,y:.3,z:-7.75});await pause(150);
    b.room.send('player.interact',{objectId:counter.id,item:'copo'});await until(()=>bartender.animationState==='serve-chopp');
    const poured=bartender.animationStartedAt;
    await until(()=>a.room.state.npcs?.get('bartender')?.animationState==='serve-chopp');
    await until(()=>b.player().holding==='copo',barClipMs('magrao_chopp')+2000);
    assert.ok(Date.now()-poured>=barClipMs('magrao_chopp')-300);
    assert.equal(bartender.animationState,'idle');
    assert.deepEqual([b.player().interactionState,b.player().animationState,b.player().drinkItem],['','idle','']);
    assert.equal(b.player().holdingUntil-b.player().holdingSince,consumeMs('copo'));

    // Too drunk: finishing the drink brings it back up, the body held for `vomitar`, a little less drunk afterwards.
    const needs=room.needs.state('anim-b');needs.drunk=75;Object.assign(room.needs,{random:()=>0});
    b.player().holdingUntil=Date.now();
    await until(()=>b.player().animationState==='vomit');
    assert.equal(b.player().holding,'','the finished drink leaves the hand');
    // The chopp's alcohol went in (+7), and more than that came back up.
    assert.ok(needs.drunk<75&&needs.drunk>75-NEEDS.drunk.vomit.drunkRelief,`drunk ${needs.drunk}`);
    assert.ok(needs.nextVomitAt>Date.now(),'Not again before the cooldown');
    await until(()=>a.chat.some(t=>t.includes('passou mal')));
    await until(()=>b.player().animationState==='idle',barClipMs('vomitar')+2000);
  }finally{
    await Promise.allSettled(rooms.filter(joined=>joined.connection?.isOpen).map(joined=>joined.leave()));await server.gracefullyShutdown(false);await new Promise<void>(r=>api.close(()=>r()));
    if(previous===undefined)delete process.env.API_INTERNAL_URL;else process.env.API_INTERNAL_URL=previous;
  }
});
