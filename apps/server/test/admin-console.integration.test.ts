import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {Client,type Room} from '@colyseus/sdk';
import {INTERACTABLES,defaultPrices} from '@bar/shared';
import {signTicket} from '@bar/shared/tickets';
import {BarRoom} from '../src/BarRoom.js';
import type {Control} from '../src/internal.js';

const until=async(check:()=>boolean,ms=4000)=>{const deadline=Date.now()+ms;while(!check()){if(Date.now()>deadline)throw new Error('Timed out');await new Promise(r=>setTimeout(r,20));}};
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));

test('the administration reaches the world: live prices, a player read again and the event log',{timeout:30000},async()=>{
  const previous=process.env.API_INTERNAL_URL,queued:Control[]=[],charges:number[]=[],logs:Array<{event:string;userId?:string;details:Record<string,unknown>}>=[];
  let prices:Record<string,number>={...defaultPrices(),'item:copo':99,'job:bar':9},inventory=[{itemId:'agua',quantity:1}],validations=0,logsDown=true;
  const api=createServer(async(req,res)=>{
    let raw='';for await(const chunk of req)raw+=chunk;res.setHeader('content-type','application/json');
    const body=raw?JSON.parse(raw):{};
    if(req.url==='/api/internal/validate'){validations++;res.end(JSON.stringify({valid:true,blocked:[],role:'user',equippedSkin:'nathan',ownedSkins:['nathan'],inventory,balance:1000}));}
    else if(req.url==='/api/internal/prices')res.end(JSON.stringify({prices}));
    else if(req.url==='/api/internal/logs'){if(logsDown){res.statusCode=503;res.end('{}');return;}logs.push(...body.events);res.end(JSON.stringify({recorded:body.events.length}));}
    else if(req.url==='/api/internal/wallet'){charges.push(body.amount);res.end(JSON.stringify({balance:1000+body.amount,applied:body.amount}));}
    else if(req.url==='/api/internal/controls/lease')res.end(JSON.stringify({controls:queued.splice(0)}));
    else if(req.url==='/api/internal/controls/ack')res.end('{"applied":0,"failed":0}');
    else res.end('{"ok":true}');
  });
  await new Promise<void>(resolve=>api.listen(0,'127.0.0.1',resolve));
  process.env.API_INTERNAL_URL=`http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});
  let room!:BarRoom;server.define('bar',BarRoom).on('create',created=>{room=created as BarRoom;});await server.listen(0,'127.0.0.1');
  const client=new Client(`http://127.0.0.1:${(http.address() as AddressInfo).port}`),rooms:Room[]=[];
  const maintain=()=>(room as any).maintenance() as Promise<void>;
  try{
    const joined=await client.joinOrCreate('bar',{ticket:signTicket({userId:'priced',sessionId:'session-priced',displayName:'Freguês',role:'user',color:'#aa8844'})});rooms.push(joined);
    const tables:Array<Record<string,number>>=[],inventories:Array<{stacks:unknown[]}>=[],errors:string[]=[];
    joined.onMessage('prices',m=>tables.push(m.prices));joined.onMessage('inventory.state',m=>inventories.push(m));joined.onMessage('error',m=>errors.push(m.message));
    for(const type of ['wallet.state','job.state','table.state','chat.message'])joined.onMessage(type,()=>{});
    await until(()=>!!room?.state.players.get('priced')&&tables.length>0);
    assert.equal(tables[0]!['item:copo'],20,'the defaults until the API answers');

    // The first maintenance reads the table: everyone is told, and the job pays its price.
    await maintain();await until(()=>tables.length>1);
    assert.equal(tables.at(-1)!['item:copo'],99);assert.equal(room.jobs.slots().find(j=>j.id==='bar')!.pay,9);
    const counter=INTERACTABLES.find(i=>i.id==='counter')!;
    room.state.players.get('priced')!.assign({x:16.9,y:.3,z:-7.75});await pause(150);
    joined.send('player.interact',{objectId:counter.id,item:'copo'});await until(()=>charges.length>0);
    assert.deepEqual(charges,[-99],'Magrão charges the live price');

    // A price change (the `prices` control) is read again and sent; without a change nothing is broadcast.
    prices={...prices,'item:copo':25};queued.push({id:'p1',action:'prices'});await maintain();await until(()=>tables.at(-1)!['item:copo']===25);
    const sent=tables.length;queued.push({id:'p2',action:'prices'});await maintain();await pause(100);assert.equal(tables.length,sent);

    // `sync`: the administration changed the backpack; the world reads it again and sends it.
    inventory=[{itemId:'agua',quantity:1},{itemId:'pastel',quantity:3}];const before=validations,seen=inventories.length;
    queued.push({id:'s1',action:'sync',playerId:'priced'});await maintain();await until(()=>inventories.length>seen);
    assert.ok(validations>before);assert.deepEqual(inventories.at(-1)!.stacks,[{itemId:'agua',quantity:1},{itemId:'pastel',quantity:3}]);

    // The log: kept while the API refuses it, then sent with real ids; doors stay out.
    assert.equal(logs.length,0);logsDown=false;await maintain();
    const join=logs.find(l=>l.event==='join');assert.equal(join?.userId,'priced');
    assert.ok(!logs.some(l=>l.event==='door'||l.event==='maintenance_retry'));
    assert.equal((room as any).logQueue.length,0);assert.deepEqual(errors,[]);
  }finally{
    await Promise.allSettled(rooms.filter(r=>r.connection?.isOpen).map(r=>r.leave()));await server.gracefullyShutdown(false);
    await new Promise<void>(resolve=>api.close(()=>resolve()));if(previous===undefined)delete process.env.API_INTERNAL_URL;else process.env.API_INTERNAL_URL=previous;
  }
});
