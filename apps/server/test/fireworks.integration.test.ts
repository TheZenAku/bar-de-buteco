import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {Client,type Room} from '@colyseus/sdk';
import {FIREWORK,INVENTORY_CAPACITY,type FireworkShot,type InventoryStack} from '@bar/shared';
import {signTicket} from '@bar/shared/tickets';
import {BarRoom} from '../src/BarRoom.js';

async function until(check:()=>boolean,ms=5000):Promise<void>{const deadline=Date.now()+ms;while(!check()){if(Date.now()>deadline)throw new Error('Timed out');await new Promise(resolve=>setTimeout(resolve,20));}}

test('equip is free, each approved shot consumes once, and spectators see the same flight',{timeout:25000},async()=>{
  const previous=process.env.API_INTERNAL_URL;
  let stacks:InventoryStack[]=[{itemId:'rojao',quantity:2}],calls=0,fail=false;
  const api=createServer(async(req,res)=>{
    let raw='';for await(const chunk of req)raw+=chunk;
    const body=raw?JSON.parse(raw):{};res.setHeader('content-type','application/json');
    if(req.url?.endsWith('/validate'))return void res.end(JSON.stringify({valid:true,blocked:[],role:'user',ownedSkins:['nathan'],inventory:body.userId==='fireworks-player'?stacks:[]}));
    if(req.url?.endsWith('/inventory')){
      calls++;
      if(fail){res.statusCode=503;return void res.end(JSON.stringify({error:'Compra indisponível'}));}
      await new Promise(resolve=>setTimeout(resolve,80));
      const stack=stacks.find(s=>s.itemId===body.itemId)!;stack.quantity-=body.quantity;stacks=stacks.filter(s=>s.quantity>0);
      return void res.end(JSON.stringify({stacks,capacity:INVENTORY_CAPACITY,usedSlots:stacks.length,balance:0,history:[]}));
    }
    if(req.url?.endsWith('/controls'))return void res.end(JSON.stringify({controls:[]}));
    res.end(JSON.stringify({ok:true}));
  });
  await new Promise<void>(resolve=>api.listen(0,'127.0.0.1',resolve));process.env.API_INTERNAL_URL=`http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});let authoritative!:BarRoom;
  server.define('bar',BarRoom).on('create',room=>{authoritative=room as BarRoom;});await server.listen(0,'127.0.0.1');
  const client=new Client(`http://127.0.0.1:${(http.address() as AddressInfo).port}`),rooms:Room[]=[];
  try{
    for(const userId of ['fireworks-player','fireworks-observer'])rooms.push(await client.joinOrCreate('bar',{ticket:signTicket({userId,sessionId:userId,displayName:userId,role:'user',color:'#aa8844'})}));
    const [room,observer]=rooms as [Room,Room],shots:FireworkShot[]=[],seen:FireworkShot[]=[],errors:string[]=[];
    room.onMessage('firework.shot',shot=>shots.push(shot));observer.onMessage('firework.shot',shot=>seen.push(shot));room.onMessage('error',e=>errors.push(e.message));
    await until(()=>!!authoritative.state.players.get('fireworks-player'));
    const player=authoritative.state.players.get('fireworks-player')!;
    player.assign({x:10000,y:0,z:10000,rotation:0});
    room.send('firework.fire',{direction:{x:0,y:1,z:0}});await until(()=>errors.length===1);assert.equal(calls,0);
    room.send('inventory.use',{itemId:'rojao'});await until(()=>player.fireworkEquipped);assert.equal(calls,0);
    room.send('firework.stow',{});await until(()=>!player.fireworkEquipped);assert.equal(stacks[0]!.quantity,2);
    room.send('inventory.use',{itemId:'rojao'});await until(()=>player.fireworkEquipped);
    room.send('firework.fire',{direction:{x:0,y:100,z:0}});await until(()=>errors.length===2);assert.equal(calls,0);
    room.send('firework.fire',{direction:{x:0,y:1,z:0}});room.send('firework.fire',{direction:{x:0,y:1,z:0}});
    await until(()=>shots.length===1&&seen.length===1);
    assert.equal(calls,1);assert.equal(stacks[0]!.quantity,1);assert.deepEqual(shots,seen);
    assert.deepEqual(shots[0]!.direction,{x:0,y:1,z:0});assert.ok(shots[0]!.origin.x>10000&&shots[0]!.origin.x<10001);assert.equal(shots[0]!.flightMs,FIREWORK.flightMs);
    player.interactionState='seat';await until(()=>!player.fireworkEquipped);player.interactionState='';
    await new Promise(resolve=>setTimeout(resolve,FIREWORK.cooldownMs));
    room.send('inventory.use',{itemId:'rojao'});await until(()=>player.fireworkEquipped);
    const failures=errors.length;fail=true;room.send('firework.fire',{direction:{x:1,y:0,z:0}});await until(()=>calls===2);await until(()=>errors.length>failures);
    assert.equal(shots.length,1);assert.equal(stacks[0]!.quantity,1,'API failure cannot spend a rocket or show a shot');
    fail=false;room.send('firework.fire',{direction:{x:1,y:0,z:0}});await until(()=>shots.length===2&&seen.length===2);
    assert.equal(stacks.length,0);assert.equal(player.fireworkEquipped,false,'the final shot empties the hand');
    observer.send('inventory.use',{itemId:'rojao'});await new Promise(resolve=>setTimeout(resolve,100));assert.equal(authoritative.state.players.get('fireworks-observer')!.fireworkEquipped,false);
  }finally{
    for(const room of rooms)if(room.connection?.isOpen)await room.leave();await server.gracefullyShutdown(false);await new Promise<void>(resolve=>api.close(()=>resolve()));
    if(previous===undefined)delete process.env.API_INTERNAL_URL;else process.env.API_INTERNAL_URL=previous;
  }
});
