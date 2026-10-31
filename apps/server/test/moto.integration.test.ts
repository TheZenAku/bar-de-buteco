import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';import {WebSocketTransport} from '@colyseus/ws-transport';import {Client,type Room} from '@colyseus/sdk';
import {MOTO,MOTOS,stepMoto,type MotoBody} from '@bar/shared';import {signTicket} from '@bar/shared/tickets';
import {BarRoom} from '../src/BarRoom.js';
async function until(check:()=>boolean,ms=6000):Promise<void>{const deadline=Date.now()+ms;while(!check()){if(Date.now()>deadline)throw new Error('Timed out');await new Promise(r=>setTimeout(r,20));}}
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
test('the delivery bike over real WebSockets: mount, ride as predicted, one rider, get off on the left, let go when the rider drops',{timeout:60000},async()=>{
  const previous=process.env.API_INTERNAL_URL;
  const api=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;res.setHeader('content-type','application/json');
    res.end(JSON.stringify(req.url?.endsWith('/validate')?{valid:true,blocked:[],role:'user',equippedSkin:'nathan',ownedSkins:['nathan'],balance:0}:{}));});
  await new Promise<void>(r=>api.listen(0,'127.0.0.1',r));process.env.API_INTERNAL_URL=`http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});let room!:BarRoom;
  server.define('bar',BarRoom).on('create',created=>{room=created as BarRoom;});await server.listen(0,'127.0.0.1');
  const client=new Client(`http://127.0.0.1:${(http.address() as AddressInfo).port}`),rooms:Room[]=[];
  const join=async(id:string)=>{
    const joined=await client.joinOrCreate('bar',{ticket:signTicket({userId:id,sessionId:`session-${id}`,displayName:id,role:'user',color:'#aa8844'})});rooms.push(joined);
    const errors:string[]=[];joined.onMessage('error',m=>errors.push(m.message));
    for(const type of ['chat.message','inventory.state','job.state','wallet.state','prices'])joined.onMessage(type,()=>{});
    return {room:joined,errors,player:()=>room.state.players.get(id)!};
  };
  try{
    const spot=MOTOS[0],moto=()=>room.state.motos.get(spot.id)!;
    const rider=await join('rider');await until(()=>!!rider.player());
    assert.ok(Math.abs(moto().x-spot.x)<1e-5);assert.equal(moto().riderId,'');
    // From too far, the room refuses.
    rider.player().assign({x:spot.x,y:.15,z:-1});
    rider.room.send('moto.mount',{motoId:spot.id});await until(()=>rider.errors.some(e=>e.includes('Chegue mais perto')));
    await pause(1100);
    rider.player().assign({x:spot.x,y:.15,z:2.8});
    rider.room.send('moto.mount',{motoId:spot.id});
    await until(()=>moto().riderId==='rider');
    assert.equal(rider.player().interactionState,`moto:${spot.id}`);assert.equal(rider.player().animationState,'ride');
    // Walking inputs do not move a rider; the bike's do, one a tick, the same steps a browser predicts.
    rider.room.send('player.input',{seq:1,dx:1,dz:0,running:false,rotation:0});await pause(120);
    assert.equal(rider.player().x,spot.x);
    let seq=10,predicted:MotoBody={x:spot.x,y:spot.y,z:spot.z,yaw:spot.yaw,pitch:0,speed:0,steer:0};
    for(let i=0;i<30;i++){const input={seq:++seq,throttle:1,steer:0,brake:false};predicted=stepMoto(predicted,input);rider.room.send('moto.input',input);await pause(55);}
    await until(()=>rider.player().lastProcessedInput===seq);
    assert.ok(Math.abs(moto().x-predicted.x)<1e-3,`Room ${moto().x}, prediction ${predicted.x}`);
    assert.ok(moto().x<spot.x-1,'It went where it points (−X)');
    assert.equal(rider.player().x,moto().x,'The rider goes with it, for chat, voice and the areas of interest');
    // Too fast to get off; and nobody else gets on.
    const other=await join('other');await until(()=>!!other.player());
    other.player().assign({x:moto().x,y:0,z:moto().z+1});await pause(100);
    other.room.send('moto.mount',{motoId:spot.id});await until(()=>other.errors.some(e=>e.includes('Alguém já está')));
    await pause(1100);
    rider.room.send('player.interact',{objectId:'stand'});await until(()=>rider.errors.some(e=>e.includes('Diminua')));
    assert.equal(moto().riderId,'rider');
    // Brakes, stops, gets off on the bike's left (+Z when facing −X).
    for(let i=0;i<40&&Math.abs(moto().speed)>.01;i++){rider.room.send('moto.input',{seq:++seq,throttle:0,steer:0,brake:true});await pause(55);}
    assert.ok(Math.abs(moto().speed)<MOTO.DISMOUNT_SPEED);
    await pause(1100);
    rider.room.send('player.interact',{objectId:'stand'});await until(()=>moto().riderId==='');
    assert.equal(rider.player().interactionState,'');assert.equal(rider.player().animationState,'idle');
    assert.ok(rider.player().z>moto().z+.5&&Math.abs(rider.player().x-moto().x)<.1,`Off at ${rider.player().x},${rider.player().z}`);
    // Nobody rides it: it stays there.
    const parked=moto().x;await pause(200);assert.equal(moto().x,parked);
    // Fainting (anything that changes the rider's state) lets the bike go, and the bike stops by itself.
    other.player().assign({x:moto().x,y:0,z:moto().z+1});await pause(100);
    other.room.send('moto.mount',{motoId:spot.id});await until(()=>moto().riderId==='other');
    moto().speed=10;other.player().interactionState='fainted';
    await until(()=>moto().riderId==='');
    await until(()=>moto().speed===0,4000);
    assert.equal(other.player().interactionState,'fainted','Its state stays with the player');
    other.player().interactionState='';
    // The connection dropping does too, and the rider stands beside the bike.
    rider.player().assign({x:moto().x,y:0,z:moto().z+1});await pause(100);
    rider.room.send('moto.mount',{motoId:spot.id});await until(()=>moto().riderId==='rider');
    rider.room.reconnection.enabled=false;
    (room.clients.getById(rider.room.sessionId)!.ref as unknown as {terminate():void}).terminate();
    await until(()=>moto().riderId==='',8000);
    assert.equal(rider.player().interactionState,'');
    assert.ok(Math.hypot(rider.player().x-moto().x,rider.player().z-moto().z)>.5);
  }finally{
    await Promise.allSettled(rooms.filter(r=>r.connection?.isOpen).map(r=>r.leave()));
    await server.gracefullyShutdown(false).catch(()=>{});api.close();
    if(previous===undefined)delete process.env.API_INTERNAL_URL;else process.env.API_INTERNAL_URL=previous;
  }
});
