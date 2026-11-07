import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';import {WebSocketTransport} from '@colyseus/ws-transport';import {Client,type Room} from '@colyseus/sdk';
import {eq} from 'drizzle-orm';import {GARAGES,MOTO_ENGINE,STORAGE,TRUCK,TRUCK_MODEL,carSpec,vehicleOccupants,vehiclePhysics} from '@bar/shared';
import {createApi} from '../../api/src/app.js';import {readConfig} from '../../api/src/config.js';import {itemInventory,vehicleStorage,wallets} from '../../api/src/database/schema.js';
import {BarRoom} from '../src/BarRoom.js';
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function until(check:()=>boolean|Promise<boolean>,ms=6000){const end=Date.now()+ms;while(!await check()){if(Date.now()>end)throw new Error('Timed out');await pause(20);}}

test('the truck seats two, its hold opens only for the key holder at its back, closes by itself and keeps what it holds',{timeout:120000},async()=>{
  const previous=process.env.API_INTERNAL_URL,api=await createApi({config:{...readConfig(),dataPath:'memory://',databaseUrl:undefined,autoVerifyEmail:true},rateLimit:false,migrate:true});await api.app.listen({host:'127.0.0.1',port:0});
  process.env.API_INTERNAL_URL=`http://127.0.0.1:${(api.app.server.address() as AddressInfo).port}`;
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});let world!:BarRoom;
  server.define('bar',BarRoom).on('create',r=>{world=r as BarRoom;});await server.listen(0,'127.0.0.1');
  const client=new Client(`http://127.0.0.1:${(http.address() as AddressInfo).port}`),joined:Room[]=[];
  async function player(name:string){
    const registered=await api.app.inject({method:'POST',url:'/api/auth/register',payload:{username:name,displayName:name,email:`${name}@truck.test`,password:'SenhaBoaDeTeste2026!'}});
    assert.equal(registered.statusCode,201,registered.body);const id=registered.json().user.id as string,cookie=`${registered.cookies[0]!.name}=${registered.cookies[0]!.value}`;
    await api.app.inject({method:'GET',url:'/api/inventory',headers:{cookie}});await api.db.update(wallets).set({balance:200000}).where(eq(wallets.userId,id));
    const ticket=await api.app.inject({method:'POST',url:'/api/game-ticket',headers:{cookie},payload:{}});assert.equal(ticket.statusCode,200,ticket.body);
    const room=await client.joinOrCreate('bar',{ticket:ticket.json().ticket});joined.push(room);
    const errors:string[]=[],storage:any[]=[],closed:any[]=[],inventory:any[]=[];
    room.onMessage('error',m=>errors.push(m.message));room.onMessage('storage.state',m=>storage.push(m));room.onMessage('storage.closed',m=>closed.push(m));room.onMessage('inventory.state',m=>inventory.push(m));
    for(const type of ['prices','wallet.state','chat.message','food.state','job.state','garage.taken','garage.state','moto.locked','food.owned'])room.onMessage(type,()=>{});
    await until(()=>!!world.state.players.get(id));return {id,cookie,room,errors,storage,closed,inventory,state:()=>world.state.players.get(id)!};
  }
  try{
    const owner=await player('truck_driver'),guest=await player('truck_guest');
    const buy=await api.app.inject({method:'POST',url:'/api/vehicles/buy',headers:{cookie:owner.cookie},payload:{requestId:crypto.randomUUID(),model:TRUCK_MODEL,color:'#ffffff'}});assert.equal(buy.statusCode,200,buy.body);
    const row=buy.json().vehicles[0];
    owner.room.send('inventory.sync',{});await pause(300);const garage=GARAGES[0];owner.state().assign({x:garage.x,y:garage.y,z:garage.z});await pause(100);
    owner.room.send('garage.take',{garageId:garage.id,vehicleId:row.id});await until(()=>{assert.deepEqual(owner.errors,[]);return world.state.motos.size===1;});
    const truck=[...world.state.motos.values()][0]!;
    assert.equal(truck.model,TRUCK_MODEL);assert.equal(truck.load,0);assert.equal(truck.trunk,false);assert.equal(vehiclePhysics(TRUCK_MODEL).HALF_LENGTH,TRUCK.HALF_LENGTH);
    const sin=()=>Math.sin(truck.yaw),cos=()=>Math.cos(truck.yaw);
    /** A point in the truck's frame: +z forward, +x left. */
    const at=(x:number,z:number)=>({x:truck.x+cos()*x+sin()*z,y:truck.y,z:truck.z-sin()*x+cos()*z});
    const rear=TRUCK.CENTRE_Z-TRUCK.HALF_LENGTH;

    // Two seats: the key holder drives, one passenger rides, a third is refused. Nobody but its key holder boards a locked one.
    guest.state().assign(at(TRUCK.HALF_WIDTH+.9,0));owner.state().assign(at(TRUCK.HALF_WIDTH+.9,0));await pause(150);
    guest.room.send('moto.mount',{motoId:truck.id,seat:1});await until(()=>guest.errors.length>0);assert.match(guest.errors.at(-1)!,/trancad/);
    owner.room.send('moto.lock',{locked:false});await until(()=>!truck.locked);
    owner.room.send('moto.mount',{motoId:truck.id,seat:0});guest.room.send('moto.mount',{motoId:truck.id,seat:1});
    await until(()=>vehicleOccupants(truck).filter(Boolean).length===2);assert.equal(truck.riderId,owner.id);assert.equal(truck.passengers[0],guest.id);
    await until(()=>truck.engine===MOTO_ENGINE.ON);
    owner.state().assign(at(-TRUCK.HALF_WIDTH-.9,0));await pause(100);
    // Everyone gets off (the driver asks for it by mounting again? no: by the same interaction as the car's exit).
    owner.room.send('player.interact',{objectId:'stand'});guest.room.send('player.interact',{objectId:'stand'});
    await until(()=>vehicleOccupants(truck).filter(Boolean).length===0,8000);
    owner.errors.length=0;guest.errors.length=0;

    // The hold: not for a guest, not from the side, not while moving, not for a truck without a plate.
    guest.state().assign(at(0,rear-1.2));await pause(120);
    guest.room.send('storage.open',{motoId:truck.id});await until(()=>guest.errors.length>0);assert.match(guest.errors.at(-1)!,/chave/);assert.equal(truck.trunk,false);
    owner.state().assign(at(TRUCK.HALF_WIDTH+1.2,0));await pause(120);
    owner.room.send('storage.open',{motoId:truck.id});await until(()=>owner.errors.length>0);assert.match(owner.errors.at(-1)!,/traseira/);assert.equal(truck.trunk,false);
    owner.errors.length=0;
    owner.state().assign(at(0,rear-1.2));truck.speed=3;await pause(120);
    owner.room.send('storage.open',{motoId:truck.id});await until(()=>owner.errors.length>0);assert.match(owner.errors.at(-1)!,/parar/);assert.equal(truck.trunk,false);
    truck.assign({speed:0,lateralSpeed:0,yawRate:0});owner.errors.length=0;

    // Opening: the door goes up, the room answers with the hold, the guest standing there still cannot move anything.
    owner.room.send('storage.open',{motoId:truck.id});await until(()=>owner.storage.length>0);
    assert.equal(truck.trunk,true);assert.equal(owner.storage[0].storage.capacity,STORAGE.SLOTS);assert.equal(owner.storage[0].storage.stacks.length,0);
    const request=crypto.randomUUID();
    owner.room.send('storage.move',{motoId:truck.id,itemId:'agua',quantity:2,direction:'deposit',requestId:request});await until(()=>owner.storage.length>1);
    assert.deepEqual(owner.storage.at(-1).storage.stacks,[{itemId:'agua',quantity:2}]);assert.equal(truck.load,1);
    await until(()=>owner.inventory.some(view=>!view.stacks.some((stack:any)=>stack.itemId==='agua')));
    // The same request, sent twice by a nervous finger, moves nothing more.
    owner.room.send('storage.move',{motoId:truck.id,itemId:'agua',quantity:2,direction:'deposit',requestId:request});await until(()=>owner.storage.length>2);
    assert.deepEqual(owner.storage.at(-1).storage.stacks,[{itemId:'agua',quantity:2}]);
    guest.room.send('storage.move',{motoId:truck.id,itemId:'agua',quantity:1,direction:'withdraw',requestId:crypto.randomUUID()});await until(()=>guest.errors.length>1);assert.match(guest.errors.at(-1)!,/Abra o baú/);
    owner.room.send('storage.move',{motoId:truck.id,itemId:'agua',quantity:1,direction:'withdraw',requestId:crypto.randomUUID()});await until(()=>owner.storage.length>3);
    assert.deepEqual(owner.storage.at(-1).storage.stacks,[{itemId:'agua',quantity:1}]);
    owner.room.send('storage.move',{motoId:truck.id,itemId:'agua',quantity:5,direction:'withdraw',requestId:crypto.randomUUID()});await until(()=>owner.errors.length>0);assert.match(owner.errors.at(-1)!,/não tem/);
    // Closing puts the door down.
    owner.room.send('storage.close',{motoId:truck.id});await until(()=>owner.closed.length>0);assert.equal(owner.closed[0].why,'closed');assert.equal(truck.trunk,false);

    // Walking away closes it by itself, and so does the truck moving.
    await pause(1100);owner.room.send('storage.open',{motoId:truck.id});await until(()=>owner.storage.length>4&&truck.trunk);
    owner.state().assign(at(0,rear-9));await until(()=>owner.closed.length>1);assert.equal(owner.closed[1].why,'away');assert.equal(truck.trunk,false);
    owner.state().assign(at(0,rear-1.2));await pause(1100);   // the room allows four 'open' a second
    owner.room.send('storage.open',{motoId:truck.id});await until(()=>owner.storage.length>5&&truck.trunk);
    truck.phase='down';await until(()=>owner.closed.length>2);assert.equal(truck.trunk,false);truck.phase='';   // a truck that is not on its wheels has no door to open (its speed is the shared tests')
    // Moves after that are refused: the door is down.
    owner.errors.length=0;owner.room.send('storage.move',{motoId:truck.id,itemId:'agua',quantity:1,direction:'withdraw',requestId:crypto.randomUUID()});
    await until(()=>owner.errors.length>0);assert.match(owner.errors.at(-1)!,/Abra o baú/);

    // What is inside survives the truck going back to the garage and out again, with its crates drawn.
    owner.state().assign({x:garage.x,y:garage.y,z:garage.z});await pause(100);owner.room.send('garage.store',{garageId:garage.id,recall:true});await until(()=>world.state.motos.size===0);
    assert.equal((await api.db.select().from(vehicleStorage).where(eq(vehicleStorage.vehicleId,row.id)))[0]?.quantity,1);
    owner.room.send('garage.take',{garageId:garage.id,vehicleId:row.id});await until(()=>world.state.motos.size===1);
    const again=[...world.state.motos.values()][0]!;assert.equal(again.load,1);assert.equal(again.trunk,false);
    // Disconnecting with it open closes it (nothing stays up for a player who is gone).
    const there=(x:number,z:number)=>({x:again.x+Math.cos(again.yaw)*x+Math.sin(again.yaw)*z,y:again.y,z:again.z-Math.sin(again.yaw)*x+Math.cos(again.yaw)*z});
    owner.state().assign(there(0,rear-1.2));await pause(120);owner.room.send('storage.open',{motoId:again.id});await until(()=>again.trunk);
    await owner.room.leave();await until(()=>!again.trunk);
    assert.equal(carSpec(TRUCK_MODEL).SEATS,2);assert.ok((await api.db.select().from(itemInventory).where(eq(itemInventory.userId,owner.id))).every(row=>row.quantity>0));
  }finally{await Promise.allSettled(joined.filter(r=>r.connection?.isOpen).map(r=>r.leave()));await server.gracefullyShutdown(false);await api.app.close();if(previous===undefined)delete process.env.API_INTERNAL_URL;else process.env.API_INTERNAL_URL=previous;}
});
