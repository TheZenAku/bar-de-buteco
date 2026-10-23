import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {Client,type Room} from '@colyseus/sdk';
import {DEFAULT_CHARACTER} from '@bar/shared';
import {signTicket} from '@bar/shared/tickets';
import {BarRoom} from '../src/BarRoom.js';
import type {Control} from '../src/internal.js';

const eventually=async(check:()=>boolean)=>{const until=Date.now()+4000;while(!check()){if(Date.now()>until)throw new Error('Timed out');await new Promise(resolve=>setTimeout(resolve,20));}};
test('moderation over real WebSockets: old kicks cannot remove a new join; event undo cannot stop a newer event',async()=>{
  const previous=process.env.API_INTERNAL_URL,queued:Control[]=[],rooms:Room[]=[];
  let banned=false,authority:BarRoom|undefined;
  const api=createServer(async(req,res)=>{
    for await(const _ of req){}res.setHeader('content-type','application/json');
    if(req.url==='/api/internal/validate')res.end(JSON.stringify({valid:!banned,banned,role:'user',blocked:[],character:DEFAULT_CHARACTER,equippedSkin:'custom',ownedSkins:[]}));
    else if(req.url==='/api/internal/controls')res.end(JSON.stringify({controls:queued.splice(0)}));
    else res.end('{"ok":true}');
  });
  await new Promise<void>(resolve=>api.listen(0,'127.0.0.1',resolve));
  process.env.API_INTERNAL_URL=`http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});
  server.define('bar',BarRoom).on('create',room=>{authority=room as BarRoom;});await server.listen(0,'127.0.0.1');
  const browser=new Client(`http://127.0.0.1:${(http.address() as AddressInfo).port}`),removed:{kind:string;reason:string}[]=[];
  const join=async()=>{const room=await browser.joinOrCreate('bar',{ticket:signTicket({userId:'moderated',sessionId:'same-session',displayName:'Jogador',role:'user',color:'#abcdee'})});
    rooms.push(room);room.onMessage('error',()=>{});room.onMessage('chat.message',()=>{});room.onMessage('moderation.removed',message=>removed.push(message));await eventually(()=>!!room.state?.players?.get('moderated')?.connected);return room;};
  const maintain=()=> (authority as any).maintenance() as Promise<void>;
  try{
    const first=await join();let left=false;first.onLeave(()=>{left=true;});
    queued.push({id:'old-kick',action:'kick',playerId:'moderated',issuedAt:0});await maintain();assert.equal(left,false);assert.equal(removed.length,0);
    queued.push({id:'current-kick',action:'kick',playerId:'moderated',issuedAt:Date.now(),reason:'Expulsão atual'});await maintain();await eventually(()=>left);
    assert.equal(removed[0].kind,'kick');const second=await join();
    queued.push({id:'old-after-return',action:'kick',playerId:'moderated',issuedAt:0});await maintain();assert.ok(second.connection.isOpen);
    queued.push({id:'party-one',action:'event',eventType:'PARTY'});await maintain();assert.equal(authority!.state.event.type,'PARTY');
    queued.push({id:'party-two',action:'event',eventType:'BLACKOUT'});await maintain();assert.equal(authority!.state.event.type,'BLACKOUT');
    queued.push({id:'undo-one',action:'event',eventType:'STOP',expectedControlId:'party-one'});await maintain();assert.equal(authority!.state.event.type,'BLACKOUT');
    queued.push({id:'undo-two',action:'event',eventType:'STOP',expectedControlId:'party-two'});await maintain();assert.equal(authority!.state.event.type,'');
    let bannedLeft=false;second.onLeave(()=>{bannedLeft=true;});banned=true;await maintain();await eventually(()=>bannedLeft);assert.equal(removed.at(-1)!.kind,'ban');
    banned=false;const third=await join();assert.ok(third.connection.isOpen);
  }finally{
    await Promise.allSettled(rooms.filter(room=>room.connection?.isOpen).map(room=>room.leave()));await server.gracefullyShutdown(false);
    await new Promise<void>(resolve=>api.close(()=>resolve()));if(previous===undefined)delete process.env.API_INTERNAL_URL;else process.env.API_INTERNAL_URL=previous;
  }
});
