import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';import {WebSocketTransport} from '@colyseus/ws-transport';import {Client,type Room} from '@colyseus/sdk';
import {CROWD,readCrowd} from '@bar/shared';import {signTicket} from '@bar/shared/tickets';
import {BarRoom} from '../src/BarRoom.js';
async function until(check:()=>boolean,ms=8000):Promise<void>{const deadline=Date.now()+ms;while(!check()){if(Date.now()>deadline)throw new Error('Timed out');await new Promise(r=>setTimeout(r,10));}}

test('the crowd reaches a client as bytes: players beyond the models are sprites, the far ones are nothing, and walking up turns a sprite into a model',{timeout:60000},async()=>{
  const previous=process.env.API_INTERNAL_URL;
  const api=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;res.setHeader('content-type','application/json');
    if(req.url?.endsWith('/validate'))res.end(JSON.stringify({valid:true,blocked:[],role:'user',equippedSkin:'nathan',ownedSkins:['nathan'],ownedSkills:[],balance:0,inventory:[]}));else res.end('{}');});
  await new Promise<void>(r=>api.listen(0,'127.0.0.1',r));process.env.API_INTERNAL_URL=`http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});let room!:BarRoom;
  server.define('bar',BarRoom).on('create',created=>{room=created as BarRoom;});await server.listen(0,'127.0.0.1');
  const client=new Client(`http://127.0.0.1:${(http.address() as AddressInfo).port}`),rooms:Room[]=[];
  const join=async(id:string)=>{
    const joined=await client.joinOrCreate('bar',{ticket:signTicket({userId:id,sessionId:`session-${id}`,displayName:id,role:'user',color:'#aa8844'})});rooms.push(joined);
    let latest:ReturnType<typeof readCrowd>|undefined;
    joined.onMessage('crowd',(bytes:Uint8Array)=>{latest=readCrowd(bytes);});
    for(const type of ['error','chat.message','inventory.state','job.state','wallet.state','prices','admin.world','food.state'])joined.onMessage(type,()=>{});
    await until(()=>!!room.state.players.get(id));
    return {player:()=>room.state.players.get(id)!,crowd:()=>latest,heldByClient:()=>[...(joined.state.players?.keys?.()??[])]};
  };
  const at=(who:{player:()=>{assign:(p:object)=>unknown}},x:number,z:number)=>who.player().assign({x,y:0,z,rotation:0,interactionState:'',animationState:'idle',currentTableId:''});
  try{
    const a=await join('a'),b=await join('b'),c=await join('c');
    at(a,60,7);at(b,100,7);at(c,60+CROWD.radius+100,7);
    const slotOf=(who:{player:()=>{slot:number}})=>who.player().slot;
    assert.ok(slotOf(a)>0&&slotOf(a)!==slotOf(b)&&slotOf(b)!==slotOf(c),'every avatar has its own slot');
    // 40 m away: not in the room's view, but a sprite. 240 m away: nothing.
    await until(()=>!!a.crowd()?.some(r=>r.slot===slotOf(b)));
    assert.ok(!a.crowd()!.some(r=>r.slot===slotOf(c)),'beyond the crowd radius there is nothing');
    assert.ok(!a.heldByClient().includes('b'),'a sprite is not in the schema view');
    const record=a.crowd()!.find(r=>r.slot===slotOf(b))!;
    assert.ok(Math.abs(record.x-100)<.2&&Math.abs(record.z-7)<.2);
    // Walks up to 8 m: a model now, and no longer a sprite.
    at(b,68,7);
    await until(()=>a.heldByClient().includes('b'));
    await until(()=>!a.crowd()?.some(r=>r.slot===slotOf(b)));
  }finally{
    await Promise.allSettled(rooms.filter(r=>r.connection?.isOpen).map(r=>r.leave()));await server.gracefullyShutdown(false);
    await new Promise<void>(r=>api.close(()=>r()));if(previous===undefined)delete process.env.API_INTERNAL_URL;else process.env.API_INTERNAL_URL=previous;
  }
});
