import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';import {WebSocketTransport} from '@colyseus/ws-transport';import {Client,type Room} from '@colyseus/sdk';
import {eq} from 'drizzle-orm';import {CAR_MODEL,FUEL_PUMPS,NEW_CAR_PARTS,parkedMoto} from '@bar/shared';
import {createApi} from '../../api/src/app.js';import {readConfig} from '../../api/src/config.js';import {wallets,currencyLedger} from '../../api/src/database/schema.js';
import {BarRoom} from '../src/BarRoom.js';import {Moto} from '../src/state.js';
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function until(check:()=>boolean,ms=25000){const end=Date.now()+ms;while(!check()){if(Date.now()>end)throw new Error('Timed out');await pause(25);}}

test('real room locks driving and exiting, replicates the NPC sequence and charges the existing wallet only after docking',{timeout:45000},async()=>{
  const previous=process.env.API_INTERNAL_URL,api=await createApi({config:{...readConfig(),dataPath:'memory://',databaseUrl:undefined,autoVerifyEmail:true},rateLimit:false,migrate:true});await api.app.listen({host:'127.0.0.1',port:0});
  process.env.API_INTERNAL_URL=`http://127.0.0.1:${(api.app.server.address() as AddressInfo).port}`;
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});let world!:BarRoom,room:Room|undefined;
  server.define('bar',BarRoom).on('create',r=>{world=r as BarRoom;});await server.listen(0,'127.0.0.1');
  try{
    const registered=await api.app.inject({method:'POST',url:'/api/auth/register',payload:{username:'station_driver',displayName:'Station Driver',email:'driver@station.test',password:'SenhaBoaDeTeste2026!'}});assert.equal(registered.statusCode,201,registered.body);
    const id=registered.json().user.id as string,cookie=`${registered.cookies[0]!.name}=${registered.cookies[0]!.value}`;
    await api.app.inject({method:'GET',url:'/api/inventory',headers:{cookie}});await api.db.update(wallets).set({balance:50}).where(eq(wallets.userId,id));
    const ticket=await api.app.inject({method:'POST',url:'/api/game-ticket',headers:{cookie},payload:{}});
    room=await new Client(`http://127.0.0.1:${(http.address() as AddressInfo).port}`).joinOrCreate('bar',{ticket:ticket.json().ticket});const errors:string[]=[],receipts:unknown[]=[];
    room.onMessage('error',m=>errors.push(m.message));room.onMessage('fuel.receipt',m=>receipts.push(m));
    for(const type of ['prices','inventory.state','wallet.state','chat.message','food.state','job.state','food.owned'])room.onMessage(type,()=>{});
    await until(()=>!!world.state.players.get(id));
    const pump=FUEL_PUMPS[0]!,car=new Moto().assign({...parkedMoto({id:'fuel-car',x:pump.x-3.3,y:pump.y,z:pump.z-1,yaw:Math.PI}),model:CAR_MODEL,parts:NEW_CAR_PARTS,riderId:id,fuel:98,engine:0,ignition:true});world.state.motos.set(car.id,car);
    world.state.players.get(id)!.assign({x:car.x,y:car.y,z:car.z,interactionState:`moto:${car.id}`,animationState:'ride'});
    const state=world.state.fuelServices.get(pump.id)!,balance=async()=>(await api.db.select().from(wallets).where(eq(wallets.userId,id)))[0]!.balance;
    room.send('vehicle.control',{vehicleId:car.id,action:'refuel'});await until(()=>{assert.deepEqual(errors,[]);return state.phase==='to-pump';});assert.equal(await balance(),50);
    room.send('player.interact',{objectId:'stand'});room.send('vehicle.control',{vehicleId:car.id,action:'engine'});room.send('moto.input',{seq:1,throttle:1,steer:1,brake:false});
    const at={x:car.x,z:car.z};await pause(250);assert.equal(car.riderId,id);assert.equal(car.engine,0);assert.equal(car.x,at.x);assert.equal(car.z,at.z);assert.equal(errors.filter(s=>/frentista/.test(s)).length,2);
    await until(()=>state.phase==='fueling');assert.equal(await balance(),50);assert.equal(receipts.length,0);
    await until(()=>car.fuel>98);assert.ok(car.fuel<100);
    await until(()=>state.phase==='replace');assert.equal(await balance(),50,'no debit until nozzle is returned');
    await until(()=>receipts.length===1);assert.equal(await balance(),44);assert.equal(car.fuel,100);assert.equal(receipts.length,1);
    await until(()=>state.phase==='idle');await until(()=>room!.state.fuelServices.get(pump.id)?.phase==='idle');
    assert.equal(room.state.npcs.get(pump.npcId)?.animationState,'idle');assert.equal((await api.db.select().from(currencyLedger).where(eq(currencyLedger.userId,id))).filter(r=>r.reason.startsWith('fuel:')).length,1);
    room.send('vehicle.control',{vehicleId:car.id,action:'refuel'});await until(()=>errors.some(e=>/cheio/.test(e)));assert.equal(await balance(),44);
  }finally{if(room?.connection?.isOpen)await room.leave();await server.gracefullyShutdown(false);await api.app.close();if(previous===undefined)delete process.env.API_INTERNAL_URL;else process.env.API_INTERNAL_URL=previous;}
});
