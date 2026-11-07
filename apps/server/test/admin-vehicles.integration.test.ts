import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {Client,type Room} from '@colyseus/sdk';
import {eq} from 'drizzle-orm';
import {GARAGES,MOTO_MODEL,NEW_MOTO_PARTS,VEHICLE_CATALOG,motoInteraction,type OwnedVehicle} from '@bar/shared';
import {createApi} from '../../api/src/app.js';
import {readConfig} from '../../api/src/config.js';
import {OWNER_EMAIL} from '../../api/src/admin-policy.js';
import {playerVehicles} from '../../api/src/database/schema.js';
import {BarRoom} from '../src/BarRoom.js';

process.env.NODE_ENV='test';
async function until(check:()=>boolean|Promise<boolean>):Promise<void>{const deadline=Date.now()+8000;while(!await check()){if(Date.now()>deadline)throw new Error('Timed out');await new Promise(r=>setTimeout(r,20));}}

test('administrative vehicle changes reach the running world, survive saves and move keys while ejecting the driver',{timeout:30000},async()=>{
  const config={...readConfig(),production:false,dataPath:'memory://',databaseUrl:undefined,autoVerifyEmail:true};
  const api=await createApi({config,rateLimit:false,migrate:true});await api.app.listen({port:0,host:'127.0.0.1'});
  const previous=process.env.API_INTERNAL_URL;process.env.API_INTERNAL_URL=`http://127.0.0.1:${(api.app.server.address() as AddressInfo).port}`;
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});
  let room!:BarRoom;server.define('bar',BarRoom).on('create',created=>{room=created as BarRoom;});await server.listen(0,'127.0.0.1');
  const client=new Client(`http://127.0.0.1:${(http.address() as AddressInfo).port}`),joined:Room[]=[];
  const register=async(username:string,email=`${username}@admin-vehicles.test`)=>{
    const response=await api.app.inject({method:'POST',url:'/api/auth/register',payload:{username,email,displayName:username,password:'VehicleWorldTests2026!'}});
    assert.equal(response.statusCode,201,response.body);return {id:response.json().user.id,cookie:`${response.cookies[0]!.name}=${response.cookies[0]!.value}`};
  };
  try{
    const owner=await register('vehicleadmin',OWNER_EMAIL),driver=await register('vehicledriver'),receiver=await register('vehiclereceiver');
    const id=randomUUID(),damaged=NEW_MOTO_PARTS.replace(/^100/,'0');
    await api.db.insert(playerVehicles).values({id,plate:'ADM1A23',userId:driver.id,model:MOTO_MODEL,parts:damaged,fuel:12,mileage:10000});
    for(const person of [driver,receiver]){
      const ticket=await api.app.inject({method:'POST',url:'/api/game-ticket',headers:{cookie:person.cookie}});assert.equal(ticket.statusCode,200,ticket.body);
      const connection=await client.joinOrCreate('bar',{ticket:ticket.json().ticket});joined.push(connection);
      for(const type of ['inventory.state','food.owned','food.state','prices','wallet.state','error','job.state','chat.message'])connection.onMessage(type,()=>{});
    }
    await until(()=>!!room?.state.players.get(driver.id));
    const internalRoom=room as any,player=room.state.players.get(driver.id)!,presence=internalRoom.sessions.getByUser(driver.id);
    const stored=presence.vehicles[0] as OwnedVehicle,moto=internalRoom.placeOwned(driver.id,stored,GARAGES[0],0);
    const owned=internalRoom.ownedMotos.get(driver.id);moto.fuel=8;owned.mileage=10023;
    const change=async(operation:string,extra:object={})=>{
      const response=await api.app.inject({method:'POST',url:'/api/admin/vehicles',headers:{cookie:owner.cookie},payload:{operation,ids:[id],reason:'Teste no mundo em uso',requestId:randomUUID(),...extra}});
      assert.equal(response.statusCode,200,response.body);await internalRoom.maintenance();
    };
    const saved=async()=>(await api.db.select().from(playerVehicles).where(eq(playerVehicles.id,id)))[0];
    await change('repair');await until(()=>moto.parts===NEW_MOTO_PARTS&&owned.revision===1);
    assert.equal(moto.fuel,8,'repair preserves fuel used since the last automatic save');
    await internalRoom.saveVehicles();assert.equal((await saved())!.parts,NEW_MOTO_PARTS);assert.equal((await saved())!.mileage,10023);
    // A delayed save captured before the repair is harmless, even if it arrives after the control was applied.
    await api.app.inject({method:'POST',url:'/api/internal/vehicles',headers:{'x-internal-secret':config.internalSecret},payload:{updates:[{vehicleId:id,parts:damaged,mileage:1,fuel:0,revision:0}]}});
    assert.equal((await saved())!.parts,NEW_MOTO_PARTS);
    await change('refuel');await until(()=>moto.fuel===100&&owned.revision===2);
    await change('plate',{plate:'NEW1B23'});await until(()=>moto.plate==='NEW1B23'&&owned.revision===3);
    await until(()=>presence.vehicles.find((v:OwnedVehicle)=>v.id===id)?.plate==='NEW1B23');
    assert.equal((await saved())!.plate,'NEW1B23');
    const registered=await api.app.inject({method:'POST',url:'/api/admin/vehicles/register',headers:{cookie:owner.cookie},payload:{playerId:receiver.id,model:VEHICLE_CATALOG.at(-1)!.model,plate:'REG1C23',reason:'Entregar chave para jogador online',requestId:randomUUID()}});
    assert.equal(registered.statusCode,200,registered.body);await internalRoom.maintenance();
    await until(()=>internalRoom.sessions.getByUser(receiver.id).vehicles.some((v:OwnedVehicle)=>v.id===registered.json().vehicleId));
    moto.riderId=driver.id;player.interactionState=motoInteraction(moto.id);player.assign({x:moto.x,y:moto.y,z:moto.z});
    await change('transfer',{targetId:receiver.id});await until(()=>!room.state.motos.has(moto.id)&&player.interactionState==='');
    await until(()=>!presence.vehicles.some((v:OwnedVehicle)=>v.id===id)&&internalRoom.sessions.getByUser(receiver.id).vehicles.some((v:OwnedVehicle)=>v.id===id));
    assert.equal((await saved())!.userId,receiver.id);assert.equal((await saved())!.fuel,100);
    const next=internalRoom.placeOwned(receiver.id,internalRoom.sessions.getByUser(receiver.id).vehicles.find((v:OwnedVehicle)=>v.id===id),GARAGES[0],0);
    await change('delete');await until(()=>!room.state.motos.has(next.id));await internalRoom.saveVehicles();assert.equal(await saved(),undefined);
    // The wire schema and spawn path use the same catalogue, including the chosen paint colour.
    room.state.players.get(driver.id)!.assign({x:60,y:0,z:7,rotation:0});internalRoom.sessions.getByUser(driver.id).ticket.role='admin';
    for(const definition of VEHICLE_CATALOG){
      joined[0]!.send('admin.moto.spawn',{model:definition.model,...(definition.paintable?{color:'#224466'}:{})});
      await until(()=>[...room.state.motos.values()].some(v=>v.model===definition.model&&!v.ownerId));
      const spawned=[...room.state.motos.values()].find(v=>v.model===definition.model&&!v.ownerId)!;
      assert.equal(spawned.color,definition.paintable?'#224466':definition.defaultColor);
      internalRoom.despawnMoto(spawned.id);
    }
  }finally{
    await Promise.allSettled(joined.filter(r=>r.connection?.isOpen).map(r=>r.leave()));await server.gracefullyShutdown(false);await api.app.close();
    if(previous===undefined)delete process.env.API_INTERNAL_URL;else process.env.API_INTERNAL_URL=previous;
  }
});
