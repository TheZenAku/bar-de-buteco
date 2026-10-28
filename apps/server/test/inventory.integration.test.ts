import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {Client,type Room} from '@colyseus/sdk';
import {INVENTORY_CAPACITY,type InventoryStack} from '@bar/shared';
import {signTicket} from '@bar/shared/tickets';
import {BarRoom} from '../src/BarRoom.js';

async function until(check:()=>boolean,ms=5000):Promise<void>{const deadline=Date.now()+ms;while(!check()){if(Date.now()>deadline)throw new Error('Timed out');await new Promise(resolve=>setTimeout(resolve,20));}}

test('room keeps inventory private, removes through the API and applies an item only after its action', {timeout:20000},async()=>{
  const previous=process.env.API_INTERNAL_URL;
  let stacks:InventoryStack[]=[{itemId:'coxinha',quantity:1},{itemId:'agua',quantity:2}],inventoryCalls=0;
  const api=createServer(async(req,res)=>{
    let raw='';for await(const chunk of req)raw+=chunk;
    const body=raw?JSON.parse(raw):{};
    res.setHeader('content-type','application/json');
    if(req.url?.endsWith('/validate'))return void res.end(JSON.stringify({valid:true,blocked:[],role:'user',equippedSkin:'nathan',ownedSkins:['nathan'],inventory:stacks}));
    if(req.url?.endsWith('/inventory')){
      inventoryCalls++;
      const current=stacks.find(stack=>stack.itemId===body.itemId);
      if(!current||current.quantity<body.quantity){res.statusCode=409;return void res.end(JSON.stringify({error:'Item ausente'}));}
      current.quantity-=body.quantity;stacks=stacks.filter(stack=>stack.quantity>0);
      return void res.end(JSON.stringify({stacks,capacity:INVENTORY_CAPACITY,usedSlots:stacks.length,balance:0,history:[]}));
    }
    if(req.url?.endsWith('/controls'))return void res.end(JSON.stringify({controls:[]}));
    res.end(JSON.stringify({ok:true}));
  });
  await new Promise<void>(resolve=>api.listen(0,'127.0.0.1',resolve));process.env.API_INTERNAL_URL=`http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});let authoritative!:BarRoom;
  server.define('bar',BarRoom).on('create',room=>{authoritative=room as BarRoom;});await server.listen(0,'127.0.0.1');
  const client=new Client(`http://127.0.0.1:${(http.address() as AddressInfo).port}`);let room:Room|undefined;
  try{
    room=await client.joinOrCreate('bar',{ticket:signTicket({userId:'inventory-player',sessionId:'inventory-session',displayName:'Mochileiro',role:'user',color:'#aa8844'})});
    const states:any[]=[],results:any[]=[],errors:string[]=[];
    room.onMessage('inventory.state',message=>states.push(message));room.onMessage('inventory.result',message=>results.push(message));room.onMessage('error',message=>errors.push(message.message));
    await until(()=>!!authoritative.state.players.get('inventory-player'));
    room.send('inventory.sync',{});await until(()=>states.length>0);
    assert.deepEqual(states.at(-1).stacks,stacks);assert.equal(states.at(-1).capacity,INVENTORY_CAPACITY);
    assert.equal('inventory' in room.state,false,'private inventory must not be exposed in the room schema');

    const player=authoritative.state.players.get('inventory-player')!,needs=authoritative.needs.state(player.id);needs.hunger=10;
    room.send('inventory.use',{itemId:'coxinha'});
    await until(()=>inventoryCalls===1&&player.interactionState==='inventory');
    assert.equal(player.animationState,'use');assert.ok(needs.hunger<=10&&needs.hunger>9.9,'only passive decay runs before the synced action finishes');
    await until(()=>results.some(result=>result.action==='use'),4000);
    assert.ok(needs.hunger>=44&&needs.hunger<=46);assert.equal(player.interactionState,'');
    assert.equal(states.at(-1).stacks.some((stack:any)=>stack.itemId==='coxinha'),false);

    room.send('inventory.use',{itemId:'coxinha'});await until(()=>errors.some(error=>error.toLowerCase().includes('mochila')));
    assert.equal(inventoryCalls,1,'an absent item is rejected before reaching the API');
    room.send('inventory.discard',{itemId:'agua',quantity:1});await until(()=>results.some(result=>result.action==='discard'));
    assert.equal(inventoryCalls,2);assert.deepEqual(states.at(-1).stacks,[{itemId:'agua',quantity:1}]);
  }finally{
    if(room?.connection?.isOpen)await room.leave();await server.gracefullyShutdown(false);await new Promise<void>(resolve=>api.close(()=>resolve()));
    if(previous===undefined)delete process.env.API_INTERNAL_URL;else process.env.API_INTERNAL_URL=previous;
  }
});
