import test from 'node:test';
import assert from 'node:assert/strict';
import {ServerPerformanceSampler} from '../src/performance.js';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {Client,type Room} from '@colyseus/sdk';
import {signTicket} from '@bar/shared/tickets';
import type {ServerPerformance} from '@bar/shared';
import {BarRoom} from '../src/BarRoom.js';

const world={players:2,capacity:32,npcs:3,motos:1,walletRetries:0,resultOutbox:0,logQueue:0,apiAgeMs:100};
test('server telemetry distinguishes tick work from tick frequency and expires its thirty-second window',()=>{
  const sampler=new ServerPerformanceSampler();
  try{
    for(let i=0;i<100;i++)sampler.record(i===99?100:2,1000+i*50);
    sampler.record(NaN,5950);
    const s=sampler.snapshot(world,5950);
    assert.equal(s.tick.samples,100);assert.equal(s.tick.actualHz,20);assert.equal(s.tick.p95Ms,2);assert.equal(s.tick.maxMs,100);assert.equal(s.tick.overBudget,1);
    assert.ok(s.process.rss>0);assert.ok(s.host.totalMem>0);assert.deepEqual(s.world,world);
    const expired=sampler.snapshot(world,40000);assert.equal(expired.tick.samples,0);assert.equal(expired.tick.p95Ms,null);assert.equal(expired.tick.actualHz,0);
  }finally{sampler.destroy();}
});

test('performance telemetry is available over the game connection only to current administrators',{timeout:20000},async()=>{
  const previous=process.env.API_INTERNAL_URL;let staffRole='admin';
  const api=createServer(async(req,res)=>{
    let raw='';for await(const chunk of req)raw+=chunk;res.setHeader('content-type','application/json');
    res.end(JSON.stringify(req.url?.endsWith('/validate')?{valid:true,blocked:[],role:raw.includes('perf-staff')?staffRole:'user',equippedSkin:'nathan',ownedSkins:['nathan'],balance:0}:{}));
  });
  await new Promise<void>(resolve=>api.listen(0,'127.0.0.1',resolve));process.env.API_INTERNAL_URL=`http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});
  let room!:BarRoom;server.define('bar',BarRoom).on('create',created=>{room=created as BarRoom;});await server.listen(0,'127.0.0.1');
  const endpoint=`http://127.0.0.1:${(http.address() as AddressInfo).port}`,rooms:Room[]=[];
  const until=async(check:()=>boolean)=>{const deadline=Date.now()+6000;while(!check()){if(Date.now()>deadline)throw new Error('Timed out');await new Promise(r=>setTimeout(r,25));}};
  try{
    const join=async(id:string)=>{
      const joined=await new Client(endpoint).joinOrCreate('bar',{ticket:signTicket({userId:id,sessionId:`session-${id}`,displayName:id,role:'admin',color:'#abcdef'})});rooms.push(joined);
      const snapshots:ServerPerformance[]=[],errors:string[]=[];
      joined.onMessage('*',()=>{});joined.onMessage('admin.performance',s=>snapshots.push(s));joined.onMessage('error',e=>errors.push(e.message));
      return {joined,snapshots,errors};
    };
    const staff=await join('perf-staff'),player=await join('perf-player');
    player.joined.send('admin.performance',{});await until(()=>player.errors.length>0);
    assert.match(player.errors[0]!,/exclusivo/);assert.equal(player.snapshots.length,0,'the signed role cannot override the role persisted by the API');
    staff.joined.send('admin.performance',{});await until(()=>staff.snapshots.length>0);
    assert.ok(staff.snapshots[0]!.process.rss>0);assert.equal(staff.snapshots[0]!.world.players,2);assert.equal(staff.snapshots[0]!.tick.targetHz,20);
    staffRole='user';await (room as any).maintenance();
    // The command's one-second rate window must finish before testing the new role.
    await new Promise(r=>setTimeout(r,1100));staff.joined.send('admin.performance',{});await until(()=>staff.errors.some(e=>e.includes('exclusivo')));
    assert.equal(staff.snapshots.length,1,'revoking the role stops future diagnostic replies');
  }finally{
    await Promise.allSettled(rooms.filter(r=>r.connection?.isOpen).map(r=>r.leave()));await server.gracefullyShutdown(false);
    await new Promise<void>(resolve=>api.close(()=>resolve()));if(previous===undefined)delete process.env.API_INTERNAL_URL;else process.env.API_INTERNAL_URL=previous;
  }
});
