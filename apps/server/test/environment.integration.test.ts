import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {Client,type Room} from '@colyseus/sdk';
import {gameHour,type EnvironmentState} from '@bar/shared';
import {signTicket} from '@bar/shared/tickets';
import {BarRoom} from '../src/BarRoom.js';

const until=async(check:()=>boolean)=>{const end=Date.now()+6000;while(!check()){if(Date.now()>end)throw new Error('Timed out');await new Promise(r=>setTimeout(r,20));}};
test('only administrators control the shared clock and weather; observers and late arrivals receive the same state',{timeout:30000},async()=>{
  const previous=process.env.API_INTERNAL_URL,api=createServer(async(req,res)=>{
    let raw='';for await(const chunk of req)raw+=chunk;const body=raw?JSON.parse(raw):{};
    res.setHeader('content-type','application/json');
    if(req.url==='/api/internal/validate')res.end(JSON.stringify({valid:true,blocked:[],role:body.userId==='admin'?'admin':'user',ownedSkins:['nathan'],inventory:[],balance:1000}));
    else res.end(JSON.stringify({ok:true,controls:[],prices:{}}));
  });
  await new Promise<void>(r=>api.listen(0,'127.0.0.1',r));process.env.API_INTERNAL_URL=`http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});
  let world!:BarRoom;server.define('bar',BarRoom).on('create',r=>{world=r as BarRoom;});await server.listen(0,'127.0.0.1');
  const client=new Client(`http://127.0.0.1:${(http.address() as AddressInfo).port}`),rooms:Room[]=[],errors:string[]=[],snapshots:any[]=[];
  async function join(id:string,admin=false){
    const room=await client.joinOrCreate('bar',{ticket:signTicket({userId:id,sessionId:`session-${id}`,displayName:id,role:admin?'admin':'user',color:'#aa8844'})});rooms.push(room);
    room.onMessage('error',m=>errors.push(m.message));room.onMessage('admin.world',m=>snapshots.push(m));
    for(const name of ['prices','inventory.state','chat.message','wallet.state','food.state','job.state'])room.onMessage(name,()=>{});
    await until(()=>!!room.state?.environment);return room;
  }
  try{
    const admin=await join('admin',true),observer=await join('observer');
    observer.send('admin.environment',{weather:'storm'});await until(()=>errors.length===1);
    assert.match(errors[0]!,/administra/);assert.equal(world.state.environment.weather,'auto');
    admin.send('admin.environment',{hour:18.5,paused:true,dayMinutes:60,weather:'storm'});
    await until(()=>snapshots.length>0&&observer.state.environment.weather==='storm');
    assert.equal(snapshots.at(-1).environment.currentHour,18.5);assert.equal(snapshots.at(-1).environment.paused,true);
    const late=await join('late');assert.equal(late.state.environment.weather,'storm');
    assert.equal(gameHour(Date.now()+60_000,late.state.environment as EnvironmentState),18.5);
    assert.equal(late.state.environment.weatherChangedAt,observer.state.environment.weatherChangedAt);
    admin.send('admin.environment',{hour:99});await until(()=>errors.length===2);assert.match(errors[1]!,/inválido/);
    assert.equal(world.state.environment.hour,18.5);
    admin.send('admin.environment',{reset:true});await until(()=>observer.state.environment.weather==='auto');
    assert.equal(world.state.environment.paused,false);assert.equal(world.state.environment.dayDurationMs,40*60_000);
    assert.ok((world as any).logQueue.some((entry:any)=>entry.event==='admin_environment'&&entry.userId==='admin'));
  }finally{
    await Promise.allSettled(rooms.filter(r=>r.connection?.isOpen).map(r=>r.leave()));await server.gracefullyShutdown(false);
    await new Promise<void>(r=>api.close(()=>r()));if(previous===undefined)delete process.env.API_INTERNAL_URL;else process.env.API_INTERNAL_URL=previous;
  }
});
