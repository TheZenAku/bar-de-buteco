import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {Client,type Room as ClientRoom} from '@colyseus/sdk';
import {signTicket} from '@bar/shared/tickets';
import {HORSE,horseFits,inputSchema,moveHorse} from '@bar/shared';
import {BarRoom} from '../src/BarRoom.js';

const eventually=async(check:()=>boolean)=>{const until=Date.now()+4000;while(!check()){if(Date.now()>until)throw new Error('Condition timed out');await new Promise(r=>setTimeout(r,20));}};
test('horse ownership, authority, observer state, indoor rejection and dismount cleanup over real WebSockets',{timeout:20000},async()=>{
  const previous=process.env.API_INTERNAL_URL;
  const equipped:Record<string,string>={rider:'tiao',viewer:'tiao'};
  const api=createServer(async(req,res)=>{
    let text='';for await(const part of req)text+=part;
    const body=text?JSON.parse(text):{};res.setHeader('content-type','application/json');
    if(req.url==='/api/internal/validate'||req.url==='/api/internal/equip'){
      if(body.skin)equipped[body.userId]=body.skin;
      res.end(JSON.stringify({valid:true,blocked:[],role:'user',balance:1000,equippedSkin:equipped[body.userId],ownedSkins:['nathan','tiao'],ownedSkills:body.userId==='rider'?['horse']:[]}));
    }else if(req.url==='/api/internal/controls')res.end('{"controls":[]}');else res.end('{"ok":true}');
  });
  await new Promise<void>(r=>api.listen(0,'127.0.0.1',r));process.env.API_INTERNAL_URL=`http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});let room:BarRoom|undefined;
  server.define('bar',BarRoom).on('create',r=>{room=r as BarRoom;});await server.listen(0,'127.0.0.1');
  const client=new Client(`http://127.0.0.1:${(http.address() as AddressInfo).port}`),joined:ClientRoom[]=[];
  const ticket=(userId:string)=>signTicket({userId,sessionId:`horse-${userId}`,displayName:userId,role:'user',color:'#aa8844'});
  try{
    const rider=await client.joinOrCreate('bar',{ticket:ticket('rider')}),viewer=await client.joinOrCreate('bar',{ticket:ticket('viewer')});joined.push(rider,viewer);
    const riderErrors:string[]=[],viewerErrors:string[]=[];rider.onMessage('error',e=>riderErrors.push(e.message));viewer.onMessage('error',e=>viewerErrors.push(e.message));
    await eventually(()=>rider.state?.players?.size===2&&viewer.state?.players?.size===2);
    const p=room!.state.players.get('rider')!,other=room!.state.players.get('viewer')!;
    p.assign({x:0,y:0,z:6,rotation:Math.PI/2,oldWalk:true});other.assign({x:3,y:0,z:6});
    viewer.send('player.skill',{skill:'horse'});await eventually(()=>viewerErrors.some(e=>e.includes('Compre esta habilidade')));
    rider.send('player.skill',{skill:'horse'});await eventually(()=>viewer.state.players.get('rider').interactionState==='horse');
    assert.equal(p.animationState,'horse-idle');
    // Unlike kicks, a mount stays active; it has no interaction expiry.
    await new Promise(r=>setTimeout(r,1100));assert.equal(p.interactionState,'horse');
    rider.send('player.input',{seq:0,dx:1,dz:0,running:false,rotation:Math.PI/2});await eventually(()=>p.lastProcessedInput===0);
    assert.ok(Math.abs(p.x-HORSE.walkSpeed*.05)<1e-6,'the horse overrides /velho movement speed');
    assert.equal(p.animationState,'horse-walk');
    await eventually(()=>p.animationState==='horse-idle');
    rider.send('player.emote',{emote:'dance'});await eventually(()=>riderErrors.some(e=>e.includes('Levante-se')));assert.equal(p.interactionState,'horse');
    const x=p.x;rider.send('player.input',{seq:1,dx:1,dz:0,running:true,rotation:Math.PI/2});await eventually(()=>p.lastProcessedInput===1);assert.ok(Math.abs(p.x-x-HORSE.fastSpeed*.05)<1e-6);
    await eventually(()=>viewer.state.players.get('rider').animationState==='horse-gallop');
    rider.send('player.input',{seq:2,dx:1,dz:0,running:false,rotation:Math.PI/2});await eventually(()=>viewer.state.players.get('rider').animationState==='horse-walk');
    rider.send('player.input',{seq:3,dx:1,dz:0,running:true,rotation:Math.PI/2});await eventually(()=>viewer.state.players.get('rider').animationState==='horse-gallop');
    await eventually(()=>viewer.state.players.get('rider').animationState==='horse-idle');
    rider.send('player.input',{seq:4,dx:0,dz:0,running:true,rotation:Math.PI/2});await eventually(()=>p.lastProcessedInput===4);assert.equal(p.animationState,'horse-idle');
    // Predicted headings feed the following input when keys are released.
    let seq=4;
    const errorsBefore=riderErrors.length;
    for(let i=0;i<16;i++){
      const angle=i*Math.PI/4,rotation=Math.atan2(Math.sin(angle),Math.cos(angle));
      rider.send('player.input',{seq:++seq,dx:0,dz:0,running:false,rotation});await eventually(()=>p.lastProcessedInput===seq);
      assert.ok(Math.abs(p.rotation)<=Math.PI,'the replicated heading stays normalized');
    }
    const stop={seq:++seq,dx:0,dz:0,running:false,rotation:p.rotation};
    assert.equal(inputSchema.safeParse(stop).success,true);
    rider.send('player.input',stop);await eventually(()=>p.lastProcessedInput===seq);
    // Reach a real forbidden-ground corner, hold against it, then back away without dismounting.
    let edge={x:-8,y:0,z:-24,rotation:Math.PI/4};
    const dx=Math.SQRT1_2,dz=Math.SQRT1_2;
    for(let i=0;i<150;i++)edge=moveHorse(edge,edge.rotation,{dx,dz,running:true,rotation:Math.PI/4});
    p.assign(edge);other.assign({x:edge.x-3,y:edge.y,z:edge.z});
    for(let i=0;i<8;i++){
      rider.send('player.input',{seq:++seq,dx,dz,running:true,rotation:Math.PI/4});await eventually(()=>p.lastProcessedInput===seq);
      assert.equal(horseFits(p,p.rotation),true);
    }
    assert.equal(p.animationState,'horse-idle');
    for(let i=0;i<20;i++){
      rider.send('player.input',{seq:++seq,dx:-dx,dz:-dz,running:false,rotation:-3*Math.PI/4});await eventually(()=>p.lastProcessedInput===seq);
      assert.equal(horseFits(p,p.rotation),true);
    }
    assert.ok(Math.hypot(p.x-edge.x,p.z-edge.z)>1,'the real room lets the rider retreat');
    await eventually(()=>{const seen=viewer.state.players.get('rider');return !!seen&&Math.hypot(seen.x-edge.x,seen.z-edge.z)>1;});
    assert.equal(p.interactionState,'horse');assert.equal(riderErrors.length,errorsBefore,'blocked movement and retreat emit no command errors');
    p.assign({x:0,y:0,z:6});other.assign({x:3,y:0,z:6});
    rider.send('player.interact',{objectId:'stand'});await eventually(()=>viewer.state.players.get('rider').interactionState==='');assert.equal(p.skill,'');
    p.assign({x:18,y:.3,z:-4});rider.send('player.skill',{skill:'horse'});await eventually(()=>riderErrors.some(e=>e.includes('rua ou calçada')));assert.equal(p.interactionState,'');
    p.assign({x:0,y:0,z:6});rider.send('player.skill',{skill:'horse'});await eventually(()=>p.interactionState==='horse');
    rider.send('player.skin',{skin:'nathan'});await eventually(()=>p.skin==='nathan');assert.equal(p.interactionState,'');assert.equal(p.animationState,'idle');
  }finally{
    await Promise.allSettled(joined.filter(r=>r.connection?.isOpen).map(r=>r.leave()));await server.gracefullyShutdown(false);await new Promise<void>(r=>api.close(()=>r()));
    if(previous===undefined)delete process.env.API_INTERNAL_URL;else process.env.API_INTERNAL_URL=previous;
  }
});
