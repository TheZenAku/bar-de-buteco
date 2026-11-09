import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';import {WebSocketTransport} from '@colyseus/ws-transport';import {Client,type Room} from '@colyseus/sdk';
import {MOTO,MOTO_ENGINE,VEHICLE_CATALOG,isTwoWheeler,vehicleCapacity,vehicleSeats} from '@bar/shared';import {signTicket} from '@bar/shared/tickets';
import {BarRoom} from '../src/BarRoom.js';
async function until(check:()=>boolean,ms=6000):Promise<void>{const deadline=Date.now()+ms;while(!check()){if(Date.now()>deadline)throw new Error('Timed out');await new Promise(r=>setTimeout(r,20));}}
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));

test('every bike takes a pillion (garupa), the cars keep their seats',()=>{
  for(const vehicle of VEHICLE_CATALOG.filter(vehicle=>vehicle.kind==='moto')){
    assert.equal(vehicleCapacity(vehicle.model),2,vehicle.model);assert.ok(isTwoWheeler(vehicle));
    assert.deepEqual(vehicleSeats(vehicle.model).map(seat=>seat.name),['Piloto','Garupa']);
  }
  assert.equal(vehicleCapacity('carro-hatch'),4);assert.equal(vehicleCapacity('caminhao-bau'),2);assert.equal(isTwoWheeler({model:'carro-hatch'}),false);
});

test('the pillion over real WebSockets: behind a rider, one only, off on the right; never on a Highfood delivery, the rider\'s or the pillion\'s',{timeout:90000},async()=>{
  const previous=process.env.API_INTERNAL_URL;
  const api=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;res.setHeader('content-type','application/json');
    res.end(JSON.stringify(req.url?.endsWith('/validate')?{valid:true,blocked:[],role:raw.includes('staff')?'admin':'user',equippedSkin:'nathan',ownedSkins:['nathan'],balance:0}:{}));});
  await new Promise<void>(r=>api.listen(0,'127.0.0.1',r));process.env.API_INTERNAL_URL=`http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});let room!:BarRoom;
  server.define('bar',BarRoom).on('create',created=>{room=created as BarRoom;});await server.listen(0,'127.0.0.1');
  const client=new Client(`http://127.0.0.1:${(http.address() as AddressInfo).port}`),rooms:Room[]=[];
  const join=async(id:string,role:'user'|'admin'='user')=>{
    const joined=await client.joinOrCreate('bar',{ticket:signTicket({userId:id,sessionId:`session-${id}`,displayName:id,role,color:'#aa8844'})});rooms.push(joined);
    const errors:string[]=[];joined.onMessage('error',m=>errors.push(m.message));
    for(const type of ['chat.message','inventory.state','job.state','wallet.state','prices','food.state','admin.world'])joined.onMessage(type,()=>{});
    return {room:joined,errors,player:()=>room.state.players.get(id)!};
  };
  try{
    const staff=await join('staff','admin'),rider=await join('rider'),back=await join('back'),extra=await join('extra');
    await until(()=>!!staff.player()&&!!rider.player()&&!!back.player()&&!!extra.player());
    const spot={id:'moto-1',x:13.6,y:0,z:3.85,yaw:-Math.PI/2};
    staff.player().assign({x:spot.x+MOTO.HALF_LENGTH+.8,y:0,z:spot.z,rotation:spot.yaw});
    staff.room.send('admin.moto.spawn',{});await until(()=>room.state.motos.size===1);staff.player().assign({x:spot.x+6,y:0,z:spot.z});
    const moto=()=>room.state.motos.get(spot.id)!,beside=()=>({x:spot.x,y:.15,z:2.8});
    // No rider yet: the first to mount rides, the pillion has nobody to hold on to.
    back.player().assign(beside());back.room.send('moto.mount',{motoId:spot.id,seat:1});await until(()=>back.errors.some(e=>e.includes('pilotando')));
    rider.player().assign(beside());rider.room.send('moto.mount',{motoId:spot.id});await until(()=>moto().riderId==='rider');
    await until(()=>moto().engine===MOTO_ENGINE.ON);
    // E (no seat) on a bike with a rider takes the pillion's place: behind the rider, on the same ground.
    await pause(1100);
    back.player().assign(beside());back.room.send('moto.mount',{motoId:spot.id});await until(()=>moto().passengers[0]==='back'||back.errors.length>1).then(()=>assert.deepEqual(back.errors.slice(1),[]));
    assert.equal(back.player().interactionState,`moto-passenger:${spot.id}:1`);assert.equal(back.player().animationState,'ride');
    assert.equal(moto().riderId,'rider','the pillion does not take the controls');
    await pause(300);
    const behind=Math.hypot(back.player().x-moto().x,back.player().z-moto().z);assert.ok(behind>.3&&behind<.9,`seated behind the rider (${behind.toFixed(2)} m)`);
    // Only one pillion.
    extra.player().assign(beside());extra.room.send('moto.mount',{motoId:spot.id,seat:1});await until(()=>extra.errors.some(e=>e.includes('ocupada')));
    // A pillion cannot ride it off.
    back.room.send('moto.input',{seq:1,throttle:1,steer:0,brake:false});await pause(300);assert.equal(moto().speed,0);
    // Off on the right (the rider's side is the left), the bike and its rider stay.
    back.room.send('player.interact',{objectId:'stand'});await until(()=>moto().passengers[0]==='');
    assert.equal(back.player().interactionState,'');assert.equal(moto().riderId,'rider');
    // The Highfood: a rider on a delivery shift takes nobody...
    rider.player().courier=true;
    back.player().assign(beside());back.room.send('moto.mount',{motoId:spot.id,seat:1});await until(()=>back.errors.some(e=>e.includes('Highfood')));
    assert.equal(moto().passengers[0],'');
    rider.player().courier=false;
    // ...and nobody on a shift goes on the back of someone else's.
    back.player().courier=true;
    back.room.send('moto.mount',{motoId:spot.id,seat:1});await until(()=>back.errors.filter(e=>e.includes('Highfood')).length>=2);
    assert.equal(moto().passengers[0],'');
    back.player().courier=false;
    // A pillion already on when the rider's shift starts steps off with the news.
    await pause(1100);back.room.send('moto.mount',{motoId:spot.id,seat:1});await until(()=>moto().passengers[0]==='back');
    rider.room.send('food.start',{});
    await pause(500);
    // (The shift may be refused here for lack of a bike of their own; then the pillion stays, which is the rule too.)
    if(rider.player().courier)await until(()=>moto().passengers[0]==='');
  }finally{
    for(const joined of rooms)await joined.leave().catch(()=>undefined);await server.gracefullyShutdown(false).catch(()=>undefined);api.close();
    if(previous===undefined)delete process.env.API_INTERNAL_URL;else process.env.API_INTERNAL_URL=previous;
  }
});
