import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';import {WebSocketTransport} from '@colyseus/ws-transport';import {Client,type Room} from '@colyseus/sdk';
import {eq} from 'drizzle-orm';import {CAR_MODEL,GARAGES,MOTO_ENGINE,PLAYER_RADIUS,STOPPED_VEHICLE,vehicleSpeed,boxContains,inputSchema,motoObstacle,readCarParts,writeCarParts,vehicleOccupants} from '@bar/shared';
import {createApi} from '../../api/src/app.js';import {readConfig} from '../../api/src/config.js';import {itemInventory,playerVehicles,wallets} from '../../api/src/database/schema.js';
import {BarRoom} from '../src/BarRoom.js';
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function until(check:()=>boolean|Promise<boolean>,ms=6000){const end=Date.now()+ms;while(!await check()){if(Date.now()>end)throw new Error('Timed out');await pause(20);}}
test('four people share one car; only the driver moves it, a fifth is refused, and garage, repainting and repairs keep its state',{timeout:90000},async()=>{
  const previous=process.env.API_INTERNAL_URL,api=await createApi({config:{...readConfig(),dataPath:'memory://',databaseUrl:undefined,autoVerifyEmail:true},rateLimit:false,migrate:true});await api.app.listen({host:'127.0.0.1',port:0});
  process.env.API_INTERNAL_URL=`http://127.0.0.1:${(api.app.server.address() as AddressInfo).port}`;
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});let world!:BarRoom;
  server.define('bar',BarRoom).on('create',r=>{world=r as BarRoom;});await server.listen(0,'127.0.0.1');
  const client=new Client(`http://127.0.0.1:${(http.address() as AddressInfo).port}`),joined:Room[]=[];
  async function player(name:string){
    const registered=await api.app.inject({method:'POST',url:'/api/auth/register',payload:{username:name,displayName:name,email:`${name}@car.test`,password:'SenhaBoaDeTeste2026!'}});
    assert.equal(registered.statusCode,201,registered.body);const id=registered.json().user.id as string,cookie=`${registered.cookies[0]!.name}=${registered.cookies[0]!.value}`;
    await api.app.inject({method:'GET',url:'/api/inventory',headers:{cookie}});await api.db.update(wallets).set({balance:100000}).where(eq(wallets.userId,id));
    const ticket=await api.app.inject({method:'POST',url:'/api/game-ticket',headers:{cookie},payload:{}});assert.equal(ticket.statusCode,200,ticket.body);
    const room=await client.joinOrCreate('bar',{ticket:ticket.json().ticket});joined.push(room);const errors:string[]=[];
    room.onMessage('error',m=>errors.push(m.message));for(const type of ['prices','inventory.state','wallet.state','chat.message','food.state','job.state','garage.taken','garage.state','moto.locked','food.owned'])room.onMessage(type,()=>{});
    await until(()=>!!world.state.players.get(id));return {id,cookie,room,errors,state:()=>world.state.players.get(id)!};
  }
  try{
    const owner=await player('car_driver'),people=await Promise.all(['car_pass1','car_pass2','car_pass3','car_fifth'].map(player));
    const buy=await api.app.inject({method:'POST',url:'/api/vehicles/buy',headers:{cookie:owner.cookie},payload:{requestId:crypto.randomUUID(),model:CAR_MODEL,color:'#2233cc'}});assert.equal(buy.statusCode,200,buy.body);const row=buy.json().vehicles[0];
    owner.room.send('inventory.sync',{});await pause(300);const garage=GARAGES[0];owner.state().assign({x:garage.x,y:garage.y,z:garage.z});await pause(100);
    owner.room.send('garage.take',{garageId:garage.id,vehicleId:row.id});await until(()=>{assert.deepEqual(owner.errors,[]);return world.state.motos.size===1;});const car=[...world.state.motos.values()][0]!;
    assert.equal(car.model,CAR_MODEL);assert.equal(car.color,'#2233cc');assert.equal(car.locked,true);
    for(const p of [owner,...people])p.state().assign({x:car.x+Math.cos(car.yaw)*1.2,y:car.y,z:car.z-Math.sin(car.yaw)*1.2});await pause(150);
    people[0]!.room.send('moto.mount',{motoId:car.id,seat:1});await until(()=>people[0]!.errors.length>0);assert.match(people[0]!.errors.at(-1)!,/trancad/);
    owner.room.send('moto.lock',{locked:false});await until(()=>!car.locked);
    owner.room.send('moto.mount',{motoId:car.id,seat:0});for(let i=0;i<3;i++)people[i]!.room.send('moto.mount',{motoId:car.id,seat:i+1});
    await until(()=>vehicleOccupants(car).filter(Boolean).length===4);assert.equal(car.riderId,owner.id);
    await until(()=>car.engine===MOTO_ENGINE.ON);const fifth=people[3]!;fifth.room.send('moto.mount',{motoId:car.id,seat:3});await until(()=>fifth.errors.length>0);assert.match(fifth.errors[0]!,/ocupado|quatro/);
    people[0]!.room.send('vehicle.control',{vehicleId:car.id,action:'hood'});await until(()=>people[0]!.errors.length>1);assert.equal(car.hood,false);
    people[0]!.room.send('moto.input',{seq:1,throttle:1,steer:1,brake:false});await pause(300);assert.equal(car.speed,0,'a passenger cannot drive');
    const control=async(action:string)=>{owner.room.send('vehicle.control',{vehicleId:car.id,action});await pause(260);};
    await control('headlights');await control('wipers');assert.equal(car.headlights,2);assert.equal(car.wipers,true);
    await control('engine');assert.equal(car.engine,MOTO_ENGINE.OFF);assert.equal(car.headlights,0);assert.equal(car.wipers,false);assert.equal(car.lights,0);
    owner.room.send('moto.input',{seq:1,throttle:0,steer:0,brake:true,lights:15});await pause(150);assert.equal(car.lights,0,'braking and stale switches cannot light an engine-off car');
    await control('ignition');assert.equal(car.ignition,false);
    owner.room.send('moto.input',{seq:2,throttle:1,steer:0,brake:false});await pause(200);assert.equal(car.engine,MOTO_ENGINE.OFF,'W cannot bypass the empty ignition slot');
    await control('ignition');await control('engine');await until(()=>car.engine===MOTO_ENGINE.ON);
    car.fuel=.000001;await until(()=>car.engine===MOTO_ENGINE.OFF);assert.equal(car.fuel,0);assert.equal(car.headlights,0);
    await control('refuel');assert.equal(car.fuel,100,'the garage supplies fuel while parked with engine off');
    await control('engine');await until(()=>car.engine===MOTO_ENGINE.ON);
    await until(()=>car.fuel<100);assert.ok(car.fuel<100,'idling consumes real fuel');
    car.assign({x:50,y:0,z:7,yaw:Math.PI/2});let seq=2;
    for(let i=0;i<18;i++){owner.room.send('moto.input',{seq:++seq,throttle:1,steer:0,brake:false});await pause(55);}
    assert.ok(car.x>51);for(let i=0;i<3;i++){const p=people[i]!.state();assert.ok(Math.hypot(p.x-car.x,p.z-car.z)<1.5);}
    await until(()=>people[2]!.room.state.motos.get(car.id)?.passengers[0]===people[0]!.id);
    for(let i=0;i<16;i++){owner.room.send('moto.input',{seq:++seq,throttle:0,steer:0,brake:true});await pause(55);}await until(()=>car.speed===0);
    // Exercise real input messages and replication of the transient dynamics.
    car.assign({x:50,y:0,z:7,yaw:Math.PI/2,speed:10,lateralSpeed:0,yawRate:0,steer:0});
    for(let i=0;i<5;i++){owner.room.send('moto.input',{seq:++seq,throttle:0,steer:1,brake:false});await pause(55);}
    assert.ok(car.yawRate<-.2);const ordinarySlip=Math.abs(car.lateralSpeed);
    let mostSlip=ordinarySlip;
    for(let i=0;i<8;i++){owner.room.send('moto.input',{seq:++seq,throttle:0,steer:1,brake:true});await pause(55);mostSlip=Math.max(mostSlip,Math.abs(car.lateralSpeed));}
    assert.ok(mostSlip>ordinarySlip+.2,'the rear brake produces real lateral slip');
    await until(()=>Math.abs(people[2]!.room.state.motos.get(car.id)?.lateralSpeed??0)>.2);
    assert.ok(Number.isFinite(people[2]!.room.state.motos.get(car.id)!.yawRate));
    assert.equal(car.passengers.filter(Boolean).length,3,'a slide keeps all passengers seated');
    for(let i=0;i<30;i++){owner.room.send('moto.input',{seq:++seq,throttle:0,steer:0,brake:true});await pause(55);}
    await until(()=>!vehicleSpeed(car)&&!car.yawRate);
    car.assign({x:55,y:0,z:7,yaw:Math.PI/2,...STOPPED_VEHICLE});
    assert.ok(Number.isFinite((world as any).ownedMotos.get(owner.id).mileage),'braking to rest must preserve a finite odometer');
    fifth.state().assign({x:car.x-4,y:car.y,z:car.z});
    for(let i=0;i<30;i++){fifth.room.send('player.input',{seq:i+1,dx:1,dz:0,running:true,rotation:Math.PI/2});await pause(55);}
    assert.ok(fifth.state().x<car.x-2,'authoritative pedestrian movement cannot cross the car');
    // The curbside stop follows many complete turns, for every seat, then head-only inputs and walking.
    car.assign({x:13.6,y:0,z:3.85,yaw:12*Math.PI-Math.PI/2});
    await pause(150);
    for(const p of people.slice(0,3))p.room.send('player.interact',{objectId:'stand'});await until(()=>car.passengers.every(id=>!id));
    owner.room.send('player.interact',{objectId:'stand'});await until(()=>!car.riderId);assert.equal(owner.state().interactionState,'');
    for(const p of [owner,...people.slice(0,3)]){
      assert.ok(!boxContains(motoObstacle(car),p.state().x,p.state().z,PLAYER_RADIUS),'exit clears the actual car hull');
      assert.ok(Math.abs(p.state().rotation)<=Math.PI,'the vehicle does not leak accumulated turns to a pedestrian');
      const next=p.state().lastProcessedInput+1;
      const look={seq:next,dx:0,dz:0,running:false,rotation:p.state().rotation,headYaw:.5,headPitch:.2};
      assert.ok(inputSchema.safeParse(look).success);p.room.send('player.input',look);
      await until(()=>p.state().lastProcessedInput===next);
      const before={x:p.state().x,z:p.state().z};
      p.room.send('player.input',{...look,seq:next+1,dx:1,dz:0,rotation:Math.PI/2,running:true});
      await until(()=>p.state().lastProcessedInput===next+1);
      assert.ok(Math.hypot(p.state().x-before.x,p.state().z-before.z)>.05,'walking along the curb works immediately after exiting and looking around');
      assert.ok(!p.errors.includes('Comando inválido.'));
    }
    car.parts=writeCarParts({...readCarParts(car.parts),pneu_de:0,farol:12});await api.db.insert(itemInventory).values({userId:owner.id,itemId:'peca_carro',quantity:2});owner.room.send('inventory.sync',{});await pause(300);
    owner.state().assign({x:car.x+1.2,y:car.y,z:car.z});await pause(120);
    owner.room.send('moto.repair',{motoId:car.id,part:'bau'});await until(()=>owner.errors.some(e=>e.includes('modelo')));
    await pause(400);owner.room.send('moto.repair',{motoId:car.id,part:'pneu_de'});await until(()=>readCarParts(car.parts).pneu_de===40,7000);
    const paint=await api.app.inject({method:'POST',url:'/api/vehicles/paint',headers:{cookie:owner.cookie},payload:{vehicleId:row.id,color:'#aa5522'}});assert.equal(paint.statusCode,200,paint.body);owner.room.send('inventory.sync',{});await until(()=>car.color==='#aa5522');
    owner.state().assign({x:garage.x,y:garage.y,z:garage.z});await pause(100);owner.room.send('garage.store',{garageId:garage.id,recall:true});await until(()=>world.state.motos.size===0);
    await until(async()=>readCarParts((await api.db.select().from(playerVehicles).where(eq(playerVehicles.id,row.id)))[0]!.parts).pneu_de===40);
    const persisted=(await api.db.select().from(playerVehicles).where(eq(playerVehicles.id,row.id)))[0]!;assert.equal(persisted.color,'#aa5522');assert.equal(readCarParts(persisted.parts).farol,12);assert.ok(persisted.mileage>0);
    assert.ok(persisted.fuel>0&&persisted.fuel<100);
    owner.room.send('garage.take',{garageId:garage.id,vehicleId:row.id});await until(()=>world.state.motos.size===1);const restored=[...world.state.motos.values()][0]!;assert.equal(restored.color,'#aa5522');assert.equal(readCarParts(restored.parts).pneu_de,40);
    assert.equal(restored.fuel,persisted.fuel);assert.equal(restored.lateralSpeed,0);assert.equal(restored.yawRate,0);
  }finally{await Promise.allSettled(joined.filter(r=>r.connection?.isOpen).map(r=>r.leave()));await server.gracefullyShutdown(false);await api.app.close();if(previous===undefined)delete process.env.API_INTERNAL_URL;else process.env.API_INTERNAL_URL=previous;}
});
