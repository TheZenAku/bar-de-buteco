import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {Client,type Room} from '@colyseus/sdk';
import {signTicket} from '@bar/shared/tickets';
import {HORSE_REAR,MOTO_ENGINE} from '@bar/shared';
import {BarRoom} from '../src/BarRoom';

const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const until=async(check:()=>boolean)=>{const end=Date.now()+6000;while(!check()){assert.ok(Date.now()<end,'Condition timed out');await pause(20);}};

test('horns and wheelies belong to the driver, stop on stale input, and a horse rear is replicated once per press',{timeout:35000},async()=>{
  const previous=process.env.API_INTERNAL_URL;
  const api=createServer(async(req,res)=>{
    let raw='';for await(const part of req)raw+=part;const body=raw?JSON.parse(raw):{};
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify(req.url?.endsWith('/validate')?{valid:true,blocked:[],role:body.userId==='driver'?'admin':'user',equippedSkin:'tiao',ownedSkins:['nathan','tiao'],ownedSkills:body.userId==='driver'?['horse']:[],balance:0}:{}));
  });
  await new Promise<void>(r=>api.listen(0,'127.0.0.1',r));process.env.API_INTERNAL_URL=`http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});let room!:BarRoom;
  server.define('bar',BarRoom).on('create',r=>{room=r as BarRoom;});await server.listen(0,'127.0.0.1');
  const client=new Client(`http://127.0.0.1:${(http.address() as AddressInfo).port}`),clients:Room[]=[];
  const join=async(id:string)=>{const r=await client.joinOrCreate('bar',{ticket:signTicket({userId:id,sessionId:`actions-${id}`,displayName:id,role:id==='driver'?'admin':'user',color:'#999999'})});clients.push(r);for(const type of ['error','chat.message','inventory.state','wallet.state','prices','food.state','job.state'])r.onMessage(type,()=>{});return r;};
  try{
    const driver=await join('driver'),viewer=await join('viewer');await until(()=>!!room.state.players.get('viewer'));
    const p=room.state.players.get('driver')!;p.assign({x:60,y:0,z:7,rotation:-Math.PI/2});
    driver.send('admin.moto.spawn',{});await until(()=>room.state.motos.size===1);
    let moto=[...room.state.motos.values()][0]!;
    p.assign({x:moto.x,y:moto.y,z:moto.z+.75});driver.send('moto.mount',{motoId:moto.id});await until(()=>moto.riderId==='driver');await until(()=>moto.engine===MOTO_ENGINE.ON);
    let seq=0;
    for(let i=0;i<35;i++){
      driver.send('moto.input',{seq:++seq,throttle:1,steer:0,brake:false,horn:true,wheelie:true});await pause(50);
    }
    await until(()=>moto.horn&&moto.wheelie>.5);
    await until(()=>viewer.state.motos.get(moto.id)?.wheelie>.5&&viewer.state.motos.get(moto.id)?.horn);
    viewer.send('moto.input',{seq:1,throttle:0,steer:0,brake:false,horn:false,wheelie:false});await pause(80);
    assert.equal(moto.horn,true,'A viewer cannot release the driver horn');
    // No more driver packets: a held horn must not get stuck after a lost connection.
    await until(()=>!moto.horn);await until(()=>moto.wheelie<.02);
    // Space has its own replicated state; service braking must not masquerade as it.
    const checkHandbrake=async()=>{
      for(let i=0;i<6;i++){driver.send('moto.input',{seq:++seq,throttle:0,steer:0,brake:true});await pause(50);}
      await until(()=>moto.handbrake&&viewer.state.motos.get(moto.id)?.handbrake);
      viewer.send('moto.input',{seq:2,throttle:0,steer:0,brake:false});await pause(60);
      assert.equal(moto.handbrake,true,'A viewer cannot release the handbrake');
      driver.send('moto.input',{seq:++seq,throttle:0,steer:0,brake:false});await until(()=>!moto.handbrake&&!viewer.state.motos.get(moto.id)?.handbrake);
      driver.send('moto.input',{seq:++seq,throttle:0,steer:0,brake:true});await until(()=>moto.handbrake);
      await until(()=>!moto.handbrake);await until(()=>!viewer.state.motos.get(moto.id)?.handbrake);
    };
    await checkHandbrake();
    driver.send('admin.moto.despawn',{});await until(()=>room.state.motos.size===0);
    p.assign({x:60,y:0,z:7,rotation:-Math.PI/2});driver.send('admin.moto.spawn',{model:'carro-hatch'});await until(()=>room.state.motos.size===1);
    moto=[...room.state.motos.values()][0]!;p.assign({x:moto.x,y:moto.y,z:moto.z+.9});driver.send('moto.mount',{motoId:moto.id});await until(()=>moto.riderId==='driver');
    driver.send('moto.input',{seq:++seq,throttle:0,steer:0,brake:false,horn:true,wheelie:true});await until(()=>moto.horn);assert.equal(moto.wheelie,0,'Cars cannot wheelie');
    await checkHandbrake();
    driver.send('admin.moto.despawn',{});await until(()=>room.state.motos.size===0);
    p.assign({x:60,y:0,z:7,rotation:0});room.state.players.get('viewer')!.assign({x:60,y:0,z:10});driver.send('player.skill',{skill:'horse'});await until(()=>p.interactionState==='horse');
    const start={x:p.x,z:p.z};driver.send('player.input',{seq:++seq,dx:0,dz:1,running:true,rear:true,rotation:0});
    await until(()=>p.animationState==='horse-rear');const rearAt=p.horseRearAt;
    await until(()=>viewer.state.players.get('driver')?.horseRearAt===rearAt);
    assert.equal(p.x,start.x);assert.equal(p.z,start.z,'The rear is stationary');
    driver.send('player.input',{seq:++seq,dx:0,dz:0,running:true,rear:true,rotation:0});await pause(100);assert.equal(p.horseRearAt,rearAt);
    await until(()=>p.animationState==='horse-idle');await pause(HORSE_REAR.cooldownMs-HORSE_REAR.durationMs+100);
    driver.send('player.input',{seq:++seq,dx:0,dz:0,running:true,rear:true,rotation:0});await pause(100);assert.equal(p.horseRearAt,rearAt,'Holding Shift never repeats a rear');
    driver.send('player.input',{seq:++seq,dx:0,dz:0,running:false,rear:false,rotation:0});await pause(70);
    driver.send('player.input',{seq:++seq,dx:0,dz:0,running:true,rear:true,rotation:0});await until(()=>p.horseRearAt>rearAt);
    driver.send('player.interact',{objectId:'stand'});await until(()=>p.interactionState==='');assert.equal(p.horseRearAt,0);
    viewer.send('player.input',{seq:2,dx:0,dz:0,running:true,rear:true,rotation:0});await pause(100);assert.equal(room.state.players.get('viewer')!.horseRearAt,0);
  }finally{
    await Promise.allSettled(clients.map(c=>c.leave()));await server.gracefullyShutdown(false);api.close();
    if(previous===undefined)delete process.env.API_INTERNAL_URL;else process.env.API_INTERNAL_URL=previous;
  }
});
