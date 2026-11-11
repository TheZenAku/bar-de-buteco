import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {Client,type Room} from '@colyseus/sdk';
import {signTicket} from '@bar/shared/tickets';
import {BarRoom} from '../src/BarRoom.js';

const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function until(check:()=>boolean,ms=4000){
  const deadline=Date.now()+ms;
  while(!check()){if(Date.now()>deadline)throw new Error('Timed out');await pause(10);}
}

test('jump is authoritative, visible to observers, keeps falling without inputs, and rejects repeated or incompatible jumps',{timeout:20000},async()=>{
  const previous=process.env.API_INTERNAL_URL;
  const api=createServer((req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(req.url?.endsWith('/validate')?
    {valid:true,blocked:[],role:'user',equippedSkin:'nathan',ownedSkins:['nathan'],balance:1000}:req.url?.endsWith('/controls')?{controls:[]}:{ok:true}));});
  await new Promise<void>(r=>api.listen(0,'127.0.0.1',r));
  process.env.API_INTERNAL_URL=`http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});
  let world!:BarRoom;
  server.define('bar',BarRoom).on('create',room=>{world=room as BarRoom;});await server.listen(0,'127.0.0.1');
  const sdk=new Client(`http://127.0.0.1:${(http.address() as AddressInfo).port}`),rooms:Room[]=[];
  const join=async(id:string)=>{
    const ticket=signTicket({userId:id,sessionId:id,displayName:id,color:'#fff',role:'user'});
    const room=await sdk.joinOrCreate('bar',{ticket});rooms.push(room);room.onMessage('error',()=>{});room.onMessage('*',()=>{});
    await until(()=>!!world?.state.players.get(id));return room;
  };
  try{
    const a=await join('jumper'),b=await join('observer'),player=world.state.players.get('jumper')!;
    player.assign({x:0,y:0,z:7});world.state.players.get('observer')!.assign({x:1,y:0,z:7});
    const send=(seq:number,jump:boolean,dx=0)=>a.send('player.input',{seq,dx,dz:0,running:false,rotation:0,jump});
    send(1,true);await until(()=>player.animationState==='jump');
    assert.ok(player.verticalVelocity>0&&!player.grounded);
    await until(()=>b.state.players?.get('jumper')?.animationState==='jump');
    assert.ok(b.state.players.get('jumper').y>0,'observer sees replicated altitude');
    a.send('player.emote',{emote:'dance'});await pause(60);
    assert.notEqual(player.animationState,'dance','incompatible actions cannot steal the airborne body');
    send(1,true);assert.equal(player.lastProcessedInput,1,'duplicate sequence cannot apply a second impulse');
    await until(()=>player.animationState==='fall');
    assert.ok(player.verticalVelocity<=0);
    await until(()=>player.grounded);assert.equal(player.y,0,'gravity continues without any further inputs');
    send(2,true);await pause(120);assert.equal(player.y,0,'Space still held cannot trigger another jump');
    send(3,false);await until(()=>player.lastProcessedInput===3);send(4,true,1);
    await until(()=>player.animationState==='jump');assert.ok(player.x>0,'horizontal movement survives takeoff');
    send(5,false);await until(()=>player.lastProcessedInput===5);
    const speed=player.verticalVelocity;send(6,true);await until(()=>player.lastProcessedInput===6);
    assert.ok(player.verticalVelocity<speed,'a second press in the air cannot reapply impulse');
    await until(()=>player.grounded);await until(()=>player.animationState==='idle');
    player.interactionState='seat-test';player.animationState='sit';
    send(7,false);await until(()=>player.lastProcessedInput===7);send(8,true);await until(()=>player.lastProcessedInput===8);
    assert.equal(player.y,0);assert.equal(player.animationState,'sit');
  }finally{
    await Promise.allSettled(rooms.filter(room=>room.connection?.isOpen).map(room=>room.leave()));
    await server.gracefullyShutdown(false);await new Promise<void>(r=>api.close(()=>r()));
    if(previous===undefined)delete process.env.API_INTERNAL_URL;else process.env.API_INTERNAL_URL=previous;
  }
});
