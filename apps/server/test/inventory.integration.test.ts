import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {Client,type Room} from '@colyseus/sdk';
import {consumeMs,INVENTORY_CAPACITY,SHOP_SPOT,type InventoryStack} from '@bar/shared';
import {signTicket} from '@bar/shared/tickets';
import {BarRoom} from '../src/BarRoom.js';

async function until(check:()=>boolean,ms=5000):Promise<void>{const deadline=Date.now()+ms;while(!check()){if(Date.now()>deadline)throw new Error('Timed out');await new Promise(resolve=>setTimeout(resolve,20));}}

test('room keeps inventory private and applies full effects at the start, never again on completion or interruption', {timeout:20000},async()=>{
  const previous=process.env.API_INTERNAL_URL;
  let stacks:InventoryStack[]=[{itemId:'coxinha',quantity:1},{itemId:'agua',quantity:2},{itemId:'curativo',quantity:1},{itemId:'arma_pistola',quantity:1}],inventoryCalls=0,equipCalls=0;
  const api=createServer(async(req,res)=>{
    let raw='';for await(const chunk of req)raw+=chunk;
    const body=raw?JSON.parse(raw):{};
    res.setHeader('content-type','application/json');
    if(req.url?.endsWith('/validate'))return void res.end(JSON.stringify({valid:true,blocked:[],role:'user',equippedSkin:'nathan',ownedSkins:['nathan'],inventory:stacks}));
    if(req.url?.endsWith('/inventory/equip-weapon')){
      equipCalls++;stacks=stacks.filter(stack=>stack.itemId!=='arma_pistola');
      return void res.end(JSON.stringify({applied:true,view:{stacks,capacity:INVENTORY_CAPACITY,usedSlots:stacks.length,balance:0,history:[]},arsenal:{test:false,infinite:false,weapons:[{id:'pistola',equipped:true,parts:{},upgrades:{}}],parts:[],ammo:{}}}));
    }
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

    const player=authoritative.state.players.get('inventory-player')!,needs=authoritative.needs.state(player.id);needs.hunger=100;needs.hungerCore=10;needs.hpCore=10;needs.staminaCore=10;
    // Keep nutrition recovery inactive so these checks isolate the item's single immediate dose.
    needs.thirstCore=0;
    // A snack goes into the hand: had over the same time as at a table, the player free to move meanwhile.
    room.send('inventory.use',{itemId:'coxinha'});
    await until(()=>inventoryCalls===1&&player.holding==='coxinha');
    assert.equal(player.interactionState,'');assert.equal(player.holdingUntil-player.holdingSince,consumeMs('coxinha'));
    await until(()=>results.some(result=>result.action==='use'),4000);
    assert.ok(needs.hungerCore>44&&needs.hungerCore<=45,'all hunger points apply at the start');
    assert.equal(needs.hpCore,15,'the heart reserve fills immediately');assert.equal(needs.staminaCore,30);
    await until(()=>room!.state.players.get(player.id)?.hpCore===15);
    player.holdingUntil=Date.now();await until(()=>player.holding==='');
    assert.ok(needs.hungerCore>44&&needs.hungerCore<=45,'finishing must not apply it twice');assert.equal(needs.hpCore,15);
    assert.equal(states.at(-1).stacks.some((stack:any)=>stack.itemId==='coxinha'),false);

    room.send('inventory.use',{itemId:'coxinha'});await until(()=>errors.some(error=>error.toLowerCase().includes('mochila')));
    assert.equal(inventoryCalls,1,'an absent item is rejected before reaching the API');
    room.send('inventory.discard',{itemId:'agua',quantity:1});await until(()=>results.some(result=>result.action==='discard'));
    assert.equal(inventoryCalls,2);assert.deepEqual(states.at(-1).stacks,[{itemId:'agua',quantity:1},{itemId:'curativo',quantity:1},{itemId:'arma_pistola',quantity:1}]);

    needs.hungerCore=0;needs.thirstCore=10;needs.bladder=0;
    room.send('inventory.use',{itemId:'agua'});await until(()=>player.holding==='agua');
    assert.ok(needs.thirstCore>41&&needs.thirstCore<=42,'the whole drink applies immediately');assert.equal(needs.bladder,14);
    (authoritative as any).dropHolding(player);
    assert.equal(needs.bladder,14,'dropping the drink does not apply or reverse its effects');
    // Respect the room's three inventory-use commands per second, including the rejected snack request.
    await new Promise(resolve=>setTimeout(resolve,1000));
    needs.hpCore=10;
    room.send('inventory.use',{itemId:'curativo'});await until(()=>player.animationState==='use');
    assert.equal(needs.hpCore,38,'a bandage also fills the heart before its animation ends');
    const presence=(authoritative as any).sessions.getByUser(player.id);
    (authoritative as any).consumePart(player,presence,Date.now());
    assert.equal(needs.hpCore,38,'interruption does not grant another dose');
    presence.interactionEndsAt=Date.now();await until(()=>player.interactionState==='');
    assert.equal(needs.hpCore,38,'completion does not grant another dose');assert.equal(inventoryCalls,4);

    await new Promise(resolve=>setTimeout(resolve,1000));
    room.send('inventory.use',{itemId:'arma_pistola'});await until(()=>equipCalls===1&&results.some(result=>result.itemId==='arma_pistola'));
    assert.equal(states.at(-1).stacks.some((stack:any)=>stack.itemId==='arma_pistola'),false,'equipping moves the physical weapon out of the backpack');
    assert.equal(player.gun.on,true,'equipping a real weapon activates its wheel without the admin-only /armas command');

    // The house's shop opens only for someone standing on its blip: the room checks the reach.
    const opened:unknown[]=[];room.onMessage('shop.open',message=>opened.push(message));
    player.assign({x:SHOP_SPOT.x+2,y:SHOP_SPOT.y,z:SHOP_SPOT.z});room.send('player.interact',{objectId:'shop'});
    await until(()=>errors.some(error=>error.includes('Chegue mais perto')));assert.equal(opened.length,0);
    player.assign({x:SHOP_SPOT.x,y:SHOP_SPOT.y,z:SHOP_SPOT.z});room.send('player.interact',{objectId:'shop'});
    await until(()=>opened.length===1);
  }finally{
    if(room?.connection?.isOpen)await room.leave();await server.gracefullyShutdown(false);await new Promise<void>(resolve=>api.close(()=>resolve()));
    if(previous===undefined)delete process.env.API_INTERNAL_URL;else process.env.API_INTERNAL_URL=previous;
  }
});
