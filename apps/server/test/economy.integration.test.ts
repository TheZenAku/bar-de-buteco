import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';import {WebSocketTransport} from '@colyseus/ws-transport';import {Client,type Room} from '@colyseus/sdk';
import {INTERACTABLES,JOBS,canInteract,isWalkable,floorHeight,stationInteractable,type JobStation} from '@bar/shared';import {signTicket} from '@bar/shared/tickets';
import {BarRoom} from '../src/BarRoom.js';
async function until(check:()=>boolean,ms=6000):Promise<void>{const deadline=Date.now()+ms;while(!check()){if(Date.now()>deadline)throw new Error('Timed out');await new Promise(r=>setTimeout(r,25));}}
/** A free spot on the floor from which the station can be touched. */
function besideStation(station:JobStation){
  for(let r=.3;r<1.6;r+=.05)for(let a=0;a<Math.PI*2;a+=Math.PI/16){
    const x=station.x+Math.sin(a)*r,z=station.z+Math.cos(a)*r,y=floorHeight(x,z,station.y);
    if(y!==undefined&&isWalkable(x,z,y)&&canInteract(stationInteractable(station),{x,y,z}))return {x,y,z};
  }
  throw new Error(`No spot beside ${station.id}`);
}
test('economy over real WebSockets: Tonico delivers paid table orders, refunds dropped ones, and job tasks pay with slots and cooldown',{timeout:90000},async()=>{
  const previous=process.env.API_INTERNAL_URL;
  const wallets=new Map<string,number>([['broke',10]]),applied=new Map<string,number>(),charges:Array<{userId:string;amount:number;reason:string}>=[];
  const api=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;res.setHeader('content-type','application/json');
    if(req.url?.endsWith('/wallet')){const body=JSON.parse(raw),balance=wallets.get(body.userId)??1000;
      if(applied.has(body.requestId)){res.end(JSON.stringify({balance,applied:applied.get(body.requestId)}));return;}
      if(balance+body.amount<0){res.statusCode=409;res.end(JSON.stringify({error:'Moedas insuficientes.'}));return;}
      wallets.set(body.userId,balance+body.amount);applied.set(body.requestId,body.amount);charges.push({userId:body.userId,amount:body.amount,reason:body.reason});
      res.end(JSON.stringify({balance:balance+body.amount,applied:body.amount}));return;}
    const id=raw?JSON.parse(raw).userId:undefined;
    res.end(JSON.stringify(req.url?.endsWith('/validate')?{valid:true,blocked:[],role:'user',equippedSkin:'nathan',ownedSkins:['nathan'],balance:wallets.get(id)??1000}:req.url?.endsWith('/controls')?{controls:[]}:{ok:true}));});
  await new Promise<void>(r=>api.listen(0,'127.0.0.1',r));process.env.API_INTERNAL_URL=`http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});let room!:BarRoom;
  server.define('bar',BarRoom).on('create',created=>{room=created as BarRoom;});await server.listen(0,'127.0.0.1');
  const client=new Client(`http://127.0.0.1:${(http.address() as AddressInfo).port}`),rooms:Room[]=[];
  const join=async(id:string)=>{
    const joined=await client.joinOrCreate('bar',{ticket:signTicket({userId:id,sessionId:`session-${id}`,displayName:id,role:'user',color:'#aa8844'})});rooms.push(joined);
    const seen={errors:[] as string[],table:[] as any[],jobs:[] as any[],balance:[] as number[]};
    joined.onMessage('error',m=>seen.errors.push(m.message));joined.onMessage('table.state',m=>seen.table.push(m));joined.onMessage('job.state',m=>seen.jobs.push(m));
    joined.onMessage('wallet.state',m=>seen.balance.push(m.balance));for(const type of ['chat.message','inventory.state'])joined.onMessage(type,()=>{});
    return {room:joined,seen,player:()=>room.state.players.get(id)!};
  };
  try{
    // A seat near the counter, so Tonico's walk stays short.
    const seat=INTERACTABLES.filter(i=>i.type==='seat'&&Math.abs((i.y??0)-.3)<.1).sort((a,b)=>Math.hypot(a.x-16,a.z+7)-Math.hypot(b.x-16,b.z+7))[0]!;
    const eater=await join('eater');await until(()=>eater.seen.balance.length>0);
    eater.room.send('table.order',{items:['coxinha']});await until(()=>eater.seen.errors.some(e=>e.includes('Sente-se')));
    assert.equal(charges.length,0,'Nothing is charged to someone standing');
    eater.player().assign({x:seat.x,y:seat.y,z:seat.z});eater.room.send('player.interact',{objectId:seat.id});await until(()=>eater.player().animationState==='sit');
    eater.room.send('table.order',{items:['coxinha','refrigerante'],price:0});await until(()=>eater.seen.errors.some(e=>e.includes('inválido')));
    eater.room.send('table.order',{items:['curativo']});await until(()=>eater.seen.errors.some(e=>e.includes('inválido')||e.includes('cardápio')));
    // Stay below the real two-orders/second limit.
    await new Promise(r=>setTimeout(r,1050));
    eater.room.send('table.order',{items:['coxinha','refrigerante']});
    await until(()=>eater.seen.table.some(s=>s.status==='ordered'));
    assert.deepEqual(charges.map(c=>[c.userId,c.amount,c.reason]),[['eater',-40,'table:coxinha-refrigerante']],'The price comes from the catalogue, never from the client');
    assert.equal(eater.seen.balance.at(-1),960);
    assert.ok(!('owner' in eater.seen.table[0].order)&&!JSON.stringify(eater.seen.table).includes('session-'),'The browser never sees the session an order was charged to');
    await new Promise(r=>setTimeout(r,1050));
    eater.room.send('table.order',{items:['agua']});await until(()=>eater.seen.errors.some(e=>e.includes('já está com o Tonico')));
    await until(()=>room.state.npcs.get('tonico')!.behavior==='serving');
    const thirst=eater.player().thirst;
    await until(()=>eater.seen.table.some(s=>s.status==='delivered'),60000);
    const tonico=room.state.npcs.get('tonico')!;
    assert.ok(Math.hypot(tonico.x-seat.x,tonico.z-seat.z)<1.6,'Tonico hands the order over at the table');
    assert.ok(eater.player().thirst>=thirst,'The delivered drink is consumed at the table');
    assert.equal(eater.player().animationState,'sit','The customer stays seated');
    // What he brought stays on the customer's table, for everyone to see.
    await until(()=>(eater.room.state as any).served?.size===2);
    const onTable=[...(eater.room.state as any).served.values()] as Array<{item:string;table:number;y:number}>;
    assert.deepEqual(onTable.map(i=>i.item).sort(),['coxinha','refrigerante']);
    assert.ok(onTable.every(i=>i.table===seat.table&&i.y>1),'On the table top');
    assert.equal(tonico.carrying,'','His tray is empty again');
    // A second order dropped by standing up is refunded once.
    eater.room.send('table.order',{items:['agua']});await until(()=>eater.seen.table.filter(s=>s.status==='ordered').length===2);
    eater.room.send('player.interact',{objectId:'stand'});
    await until(()=>charges.some(c=>c.reason.startsWith('refund:')));
    const order=eater.seen.table.filter(s=>s.status==='ordered')[1].order;
    assert.deepEqual(charges.filter(c=>c.reason.startsWith('refund:')).map(c=>[c.amount,c.reason]),[[12,`refund:${order.id}`]]);
    // Someone without enough coins is refused by the wallet and nothing is queued.
    const broke=await join('broke');broke.player().assign({x:seat.x,y:seat.y,z:seat.z});broke.room.send('player.interact',{objectId:seat.id});
    await until(()=>broke.player().animationState==='sit');broke.room.send('table.order',{items:['torresmo']});
    await until(()=>broke.seen.errors.some(e=>e.includes('insuficientes')));
    assert.equal(room['waiter'].pending,0);
    // Leaving the bar with an order on its way refunds it, even though the session is gone afterwards.
    const other=INTERACTABLES.filter(i=>i.type==='seat'&&i.id!==seat.id&&Math.abs((i.y??0)-.3)<.1)[0]!;
    const leaver=await join('leaver');leaver.player().assign({x:other.x,y:other.y,z:other.z});leaver.room.send('player.interact',{objectId:other.id});
    await until(()=>leaver.player().animationState==='sit');leaver.room.send('table.order',{items:['pastel']});await until(()=>leaver.seen.table.some(s=>s.status==='ordered'));
    await leaver.room.leave();await until(()=>charges.some(c=>c.userId==='leaver'&&c.reason.startsWith('refund:')));
    assert.deepEqual(charges.filter(c=>c.userId==='leaver').map(c=>c.amount),[-25,25]);

    // Jobs: two slots, start at the counter, the task is paid once, then a cooldown.
    const job=JOBS[0]!,workers=await Promise.all(['work-a','work-b','work-c'].map(join));
    const far=workers[0]!;far.player().assign({x:12,y:.15,z:1.6});far.room.send('job.start',{jobId:job.id});await until(()=>far.seen.errors.some(e=>e.includes('balcão')));
    for(const w of workers)w.player().assign({...job.start});
    workers[0]!.room.send('job.start',{jobId:job.id});await until(()=>workers[0]!.seen.jobs.some(j=>j.task));
    workers[1]!.room.send('job.start',{jobId:job.id});await until(()=>workers[1]!.seen.jobs.some(j=>j.task));
    workers[2]!.room.send('job.start',{jobId:job.id});await until(()=>workers[2]!.seen.errors.some(e=>e.includes('vagas')));
    await until(()=>workers[2]!.room.state.jobs.get(job.id)?.workers===2); // everyone sees the slots taken
    // Tables are the trickiest stations (chairs around them): always exercise one, whatever the draw was.
    const worker=workers[0]!,station=job.stations.find(s=>s.id.startsWith('mesa-'))!;room.jobs.shift('work-a')!.task.station=station;
    worker.room.send('job.work',{});await until(()=>worker.seen.errors.some(e=>e.includes('Chegue perto')));
    worker.player().assign(besideStation(station));worker.room.send('job.work',{});
    await until(()=>worker.player().interactionState==='job');
    await until(()=>charges.some(c=>c.userId==='work-a'&&c.reason.startsWith('job:')),station.durationMs+3000);
    const pay=charges.filter(c=>c.userId==='work-a');
    assert.equal(pay.length,1);assert.equal(pay[0]!.amount,job.pay);assert.match(pay[0]!.reason,new RegExp(`^job:${job.id}:[0-9a-f-]+:0$`));
    await until(()=>worker.seen.jobs.at(-1)?.task?.tasks===1);
    assert.notEqual(worker.seen.jobs.at(-1).task.stationId,station.id,'The next task is at another station');
    worker.room.send('job.stop',{});await until(()=>worker.seen.jobs.at(-1)?.task===null);
    assert.equal(worker.player().job,'');
    worker.player().assign({...job.start});worker.room.send('job.start',{jobId:job.id});await until(()=>worker.seen.errors.some(e=>e.includes('Descanse')));
  }finally{
    // A room already left never answers another leave().
    await Promise.allSettled(rooms.filter(r=>r.connection?.isOpen).map(r=>r.leave()));
    await server.gracefullyShutdown(false).catch(()=>{});api.close();
    if(previous===undefined)delete process.env.API_INTERNAL_URL;else process.env.API_INTERNAL_URL=previous;
  }
});
