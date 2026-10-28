import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';import {WebSocketTransport} from '@colyseus/ws-transport';import {Client,type Room} from '@colyseus/sdk';
import {DOORS,PLAYER_RADIUS,inDoorSweep,isDoorOpen,isWalkable,setDoorStates} from '@bar/shared';import {signTicket} from '@bar/shared/tickets';
import {BarRoom} from '../src/BarRoom.js';
async function until(check:()=>boolean):Promise<void>{const deadline=Date.now()+4000;while(!check()){if(Date.now()>deadline)throw new Error('Timed out');await new Promise(r=>setTimeout(r,20));}}

test('doors: synced swing, nobody is crushed, the user steps back, and the ordered drink is shared', {timeout:20000},async()=>{
  const previous=process.env.API_INTERNAL_URL;
  const wallets=new Map<string,number>(),applied=new Map<string,number>(),charges:Array<{userId:string;amount:number;reason:string}>=[];
  const api=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;res.setHeader('content-type','application/json');
    if(req.url?.endsWith('/wallet')){const body=JSON.parse(raw),balance=wallets.get(body.userId)??1000;
      if(applied.has(body.requestId)){res.end(JSON.stringify({balance,applied:applied.get(body.requestId)}));return;}
      if(balance+body.amount<0){res.statusCode=409;res.end(JSON.stringify({error:'Moedas insuficientes.'}));return;}
      wallets.set(body.userId,balance+body.amount);applied.set(body.requestId,body.amount);charges.push({userId:body.userId,amount:body.amount,reason:body.reason});res.end(JSON.stringify({balance:balance+body.amount,applied:body.amount}));return;}
    res.end(JSON.stringify(req.url?.endsWith('/validate')?{valid:true,blocked:[],role:'user',equippedSkin:'nathan',ownedSkins:['nathan'],balance:1000}:req.url?.endsWith('/controls')?{controls:[]}:{ok:true}));});
  await new Promise<void>(r=>api.listen(0,'127.0.0.1',r));process.env.API_INTERNAL_URL=`http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});let authoritative:BarRoom;
  server.define('bar',BarRoom).on('create',room=>{authoritative=room as BarRoom;});await server.listen(0,'127.0.0.1');
  const client=new Client(`http://127.0.0.1:${(http.address() as AddressInfo).port}`),rooms:Room[]=[];
  const join=async(id:string)=>{const room=await client.joinOrCreate('bar',{ticket:signTicket({userId:id,sessionId:`session-${id}`,displayName:id,role:'user',color:'#aa8844'})});rooms.push(room);room.onMessage('chat.message',()=>{});await until(()=>!!authoritative?.state.players.get(id));return room;};
  try {
    const a=await join('door-a'),b=await join('door-b'),errors:string[]=[];a.onMessage('error',m=>errors.push(m.message));
    const door=DOORS.find(d=>d.id==='Porta_WC_Masc')!,player=authoritative!.state.players.get('door-a')!,other=authoritative!.state.players.get('door-b')!;
    await until(()=>b.state.doors?.get(door.id)?.open===true);
    assert.equal(b.state.doors.size,DOORS.length,'Every door is in the shared state, open as authored');
    // Beside the doorway in the hall, out of the swing.
    player.assign({x:6.05,y:.3,z:-11.2});other.assign({x:12,y:.3,z:-6});
    assert.equal(inDoorSweep(door,player,PLAYER_RADIUS),false);
    a.send('player.interact',{objectId:door.id});
    await until(()=>b.state.doors.get(door.id).open===false);
    assert.equal(player.animationState,'use','Opening a door has a synced hand action');
    assert.ok(b.state.doors.get(door.id).changedAt>0);
    assert.equal(isDoorOpen(door.id),false,'The server physics follows the door state');
    assert.equal(b.state.doors.get('Porta_WC_Fem').open,true,'Other doors are untouched');
    // Someone else in the doorway: the door will not swing open through them.
    other.assign({x:door.x,y:.3,z:door.z-.45});
    await new Promise(r=>setTimeout(r,250));
    a.send('player.interact',{objectId:door.id});await until(()=>errors.some(e=>e.includes('alguém')));
    assert.equal(b.state.doors.get(door.id).open,false);
    // Only the user in the way: they step back, out of the swing, onto free floor.
    // The door swings into the room (−z), so the user stands inside it.
    other.assign({x:12,y:.3,z:-6});player.assign({x:door.x,y:.3,z:door.z-.45});
    assert.equal(inDoorSweep(door,player,PLAYER_RADIUS),true);
    await new Promise(r=>setTimeout(r,250));
    a.send('player.interact',{objectId:door.id});await until(()=>b.state.doors.get(door.id).open===true);
    assert.equal(inDoorSweep(door,player,PLAYER_RADIUS),false);assert.ok(isWalkable(player.x,player.z,player.y));
    // Movement keeps being simulated and acknowledged after doors change.
    for(let seq=0;seq<12;seq++)a.send('player.input',{seq,dx:0,dz:-1,running:false,rotation:Math.PI});
    await until(()=>player.lastProcessedInput===11);
    // The ordered drink travels with the order (bottle unless the glass is chosen).
    player.assign({x:16.9,y:.3,z:-7.5});
    await new Promise(r=>setTimeout(r,250));
    a.send('player.interact',{objectId:'counter',item:'copo'});
    await until(()=>b.state.players.get('door-a')?.drinkItem==='copo');
    assert.equal(player.interactionState,'counter');
    a.send('player.interact',{objectId:'stand'});await until(()=>player.drinkItem==='');
  } finally {
    await Promise.allSettled(rooms.filter(room=>room.connection?.isOpen).map(room=>room.leave()));await server.gracefullyShutdown(false);await new Promise<void>(r=>api.close(()=>r()));
    setDoorStates(DOORS.map(d=>[d.id,true] as const));
    if(previous===undefined)delete process.env.API_INTERNAL_URL;else process.env.API_INTERNAL_URL=previous;
  }
});
