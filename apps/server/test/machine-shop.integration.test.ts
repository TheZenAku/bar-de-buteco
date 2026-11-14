import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {Client as BrowserClient,type Room as ClientRoom} from '@colyseus/sdk';
import {RIBEIRO_COMPUTER,RIBEIRO_CUTTERS,RIBEIRO_PREP,type RibeiroGameChallenge} from '@bar/shared';
import {signTicket} from '@bar/shared/tickets';
import {BarRoom} from '../src/BarRoom.js';

const eventually=async(check:()=>boolean,timeout=5_000)=>{const end=Date.now()+timeout;while(!check()){if(Date.now()>end)throw new Error('Condition timed out');await new Promise(resolve=>setTimeout(resolve,20));}};

test('Ribeiro na sala real: retirar a peça e apertar E no corte abre e conclui o minigame',{timeout:20_000},async()=>{
  const previous=process.env.API_INTERNAL_URL;
  const internal=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;const body=raw?JSON.parse(raw):{};res.setHeader('content-type','application/json');const url=req.url??'';
    if(url==='/api/internal/validate')res.end(JSON.stringify({valid:true,blocked:[],role:'user',balance:0,equippedSkin:'nathan',ownedSkins:['nathan'],ownedSkills:[]}));
    else if(url==='/api/internal/controls')res.end('{"controls":[]}');
    else if(url==='/api/internal/machine-shop')res.end(body.action==='load'?'{"state":null}':'{"saved":true}');
    else if(url==='/api/internal/factory'&&body.action==='orders')res.end('{"orders":[]}');
    else if(url==='/api/internal/factory'&&body.action==='shipment.list')res.end('{"shipments":[]}');
    else if(url==='/api/internal/factory'&&body.action==='finance.get')res.end('{"finance":{}}');
    else if(url==='/api/internal/factory'&&body.action==='treasury.get')res.end('{"balance":0,"ledger":[]}');
    else if(url==='/api/internal/factory'&&body.action==='shipment.summary')res.end('{"summary":{}}');
    else res.end('{}');});
  await new Promise<void>(resolve=>internal.listen(0,'127.0.0.1',resolve));process.env.API_INTERNAL_URL=`http://127.0.0.1:${(internal.address() as AddressInfo).port}`;
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});let authoritative:BarRoom|undefined;server.define('bar',BarRoom).on('create',room=>{authoritative=room as BarRoom;});await server.listen(0,'127.0.0.1');
  const browser=new BrowserClient(`http://127.0.0.1:${(http.address() as AddressInfo).port}`);let client:ClientRoom|undefined;
  try{
    client=await browser.joinOrCreate('bar',{ticket:signTicket({userId:'machine-player',sessionId:'machine-session',displayName:'Operador',role:'user',color:'#34d399'})});client.reconnection.minUptime=0;
    const results:Array<{ok:boolean;message:string}>=[],games:Array<{action:string;challenge?:RibeiroGameChallenge;ok?:boolean}>=[];client.onMessage('machine.result',value=>results.push(value));client.onMessage('machine.game',value=>games.push(value));client.onMessage('*',()=>{});
    await eventually(()=>!!authoritative?.state.players.get('machine-player'));await new Promise(resolve=>setTimeout(resolve,80));
    const player=authoritative!.state.players.get('machine-player')!,shop=authoritative!.machineShop;for(const material of ['ACO','ALUMINIO','POLIMERO','MOLAS'] as const)shop.addMaterial(material,100);
    Object.assign(player,RIBEIRO_COMPUTER);client.send('machine.order.start',{customer:'Cliente X',items:[{weapon:'pistola',quantity:2}],requestId:crypto.randomUUID()});await eventually(()=>results.length===1);assert.equal(results[0]!.ok,true,results[0]!.message);assert.equal(shop.state.orders.length,2);assert.equal(shop.state.orders[0]!.customer,'Cliente X');
    // Hands busy (a delivery bag): the part is not handed over.
    Object.assign(player,RIBEIRO_PREP);player.parcel='bag';client.send('machine.interact',{stationId:'preparation'});await eventually(()=>results.length===2);assert.equal(results[1]!.ok,false);assert.equal(player.ribeiroPart,'');assert.equal(shop.state.orders.filter(order=>order.status==='queued').length,2);
    // The employee picks the second OP of the lot, not the oldest one.
    const chosen=shop.state.orders[1]!;player.parcel='';client.send('machine.interact',{stationId:'preparation',orderId:chosen.id});await eventually(()=>results.length===3);assert.equal(results[2]!.ok,true,results[2]!.message);assert.equal(chosen.status,'to-cut');assert.equal(shop.state.orders[0]!.status,'queued');
    // Everyone's copy of the state shows the part in the hands, and a hand holding a part cannot raise the guard or draw a gun.
    assert.equal(player.ribeiroPart,'raw');await eventually(()=>client!.state.players.get('machine-player')?.ribeiroPart==='raw');
    const refusals=authoritative as unknown as {guardRefusal(player:unknown):string;gunRefusal(player:unknown):string};assert.match(refusals.guardRefusal(player),/Largue/);assert.match(refusals.gunRefusal(player),/Largue/);
    Object.assign(player,RIBEIRO_CUTTERS[0]);client.send('machine.interact',{stationId:'cut-1'});await eventually(()=>games.some(game=>game.action==='start'));
    const game=games.find(item=>item.action==='start')!.challenge!;assert.equal(game.kind,'cut');client.send('machine.game.answer',{id:game.id,answer:game.target});await eventually(()=>games.some(item=>item.action==='end'&&item.ok));
    assert.equal(shop.state.jobs.some(job=>job.stationId==='cut-1'&&job.stage==='cut'),true);
    // Put into the machine: the hands are empty again, for everyone.
    assert.equal(player.ribeiroPart,'');await eventually(()=>client!.state.players.get('machine-player')?.ribeiroPart==='');
  }finally{if(client)await client.leave();await server.gracefullyShutdown(false);await new Promise<void>(resolve=>internal.close(()=>resolve()));process.env.API_INTERNAL_URL=previous;}
});
