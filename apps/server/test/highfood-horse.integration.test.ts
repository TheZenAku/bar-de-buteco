import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {Client,type Room} from '@colyseus/sdk';
import {GARAGES,HIGHFOOD,HIGHFOOD_NPC_PREFIX,NEW_MOTO_PARTS,readMotoParts,writeMotoParts,type HighfoodState,type OwnedVehicle} from '@bar/shared';
import {signTicket} from '@bar/shared/tickets';
import {BarRoom} from '../src/BarRoom.js';
import type {HighfoodDesk} from '../src/world/highfood.js';

const until=async(check:()=>boolean,ms=5000)=>{const end=Date.now()+ms;while(!check()){if(Date.now()>end)throw new Error('Condition timed out');await new Promise(r=>setTimeout(r,20));}};
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));

test('horse courier without a motorcycle: eligibility, pickup, backpack, remount, delivery once, cancellation and loss of access',{timeout:60000},async()=>{
  const previous=process.env.API_INTERNAL_URL;
  const equipped:Record<string,string>={rider:'tiao',viewer:'nathan'};
  let boughtHorse=false;
  let vehicles:OwnedVehicle[]=[];
  const calls:Array<{path:string;body:Record<string,unknown>}>=[];
  const api=createServer(async(req,res)=>{
    let raw='';for await(const part of req)raw+=part;
    const body=raw?JSON.parse(raw):{},path=req.url?.replace('/api/internal/','')??'';
    calls.push({path,body});res.setHeader('content-type','application/json');
    if(path==='validate'||path==='equip'){
      if(body.skin)equipped[body.userId]=body.skin;
      res.end(JSON.stringify({valid:true,blocked:[],role:'user',balance:1000,equippedSkin:equipped[body.userId],ownedSkins:['nathan','tiao'],ownedSkills:body.userId==='viewer'||boughtHorse?['horse']:[],vehicles:body.userId==='rider'?vehicles:[],inventory:[]}));
    }else if(path==='highfood/complete')res.end(JSON.stringify({orderId:body.orderId,pay:{base:12,distance:18,bonus:6,lost:0,total:36,reduced:false},paid:36,stars:5,balance:1036,customer:body.customer,capped:false,line:''}));
    else if(path==='highfood/rating')res.end('{"rating":5}');
    else if(path==='controls')res.end('{"controls":[]}');
    else res.end('{}');
  });
  await new Promise<void>(r=>api.listen(0,'127.0.0.1',r));
  process.env.API_INTERNAL_URL=`http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});let room!:BarRoom;
  server.define('bar',BarRoom).on('create',r=>{room=r as BarRoom;});await server.listen(0,'127.0.0.1');
  const client=new Client(`http://127.0.0.1:${(http.address() as AddressInfo).port}`),joined:Room[]=[];
  const join=async(id:string)=>{
    const socket=await client.joinOrCreate('bar',{ticket:signTicket({userId:id,sessionId:`food-horse-${id}`,displayName:id,role:'user',color:'#aa8844'})});joined.push(socket);
    const errors:string[]=[],states:HighfoodState[]=[],notices:string[]=[],receipts:unknown[]=[],base:Array<{owned:boolean;state:HighfoodState}>=[],ownership:boolean[]=[];
    socket.onMessage('error',m=>errors.push(m.message));socket.onMessage('food.state',m=>states.push(m));
    socket.onMessage('food.notice',m=>notices.push(m.text));socket.onMessage('food.receipt',m=>receipts.push(m));socket.onMessage('food.base',m=>base.push(m));
    socket.onMessage('food.owned',m=>ownership.push(m.owned));
    for(const type of ['chat.message','inventory.state','job.state','wallet.state','prices','food.delivered','food.locker','food.code','food.dialog','achievement.unlocked','garage.taken'])socket.onMessage(type,()=>{});
    await until(()=>!!room.state.players.get(id));
    return {socket,errors,notices,receipts,base,ownership,food:()=>states.at(-1),player:()=>room.state.players.get(id)!};
  };
  try{
    const rider=await join('rider'),viewer=await join('viewer');
    rider.player().assign({x:0,y:0,z:6,rotation:Math.PI/2});viewer.player().assign({x:3,y:0,z:6});
    rider.socket.send('food.start',{});viewer.socket.send('food.start',{});
    await until(()=>rider.errors.some(e=>e.includes('habilidade Cavalo'))&&viewer.errors.some(e=>e.includes('habilidade Cavalo')));
    assert.equal(rider.player().courier,false);assert.equal(viewer.player().courier,false);
    // Buying the skill while in the room immediately makes the app and the base available.
    boughtHorse=true;rider.socket.send('player.appearance',{});
    await until(()=>rider.food()?.horseAvailable===true);
    rider.player().assign(HIGHFOOD.BASE);rider.socket.send('player.interact',{objectId:'highfood-base'});
    await until(()=>rider.base.length===1);assert.equal(rider.base[0]!.owned,false);assert.equal(rider.base[0]!.state.horseAvailable,true);
    rider.player().assign({x:0,y:0,z:6,rotation:Math.PI/2});
    rider.socket.send('food.start',{});await until(()=>rider.food()?.status==='waiting');
    assert.equal(room.state.motos.size,0);assert.ok(!rider.notices.some(text=>text.includes('garagem')));
    rider.socket.send('inventory.sync',{});await until(()=>calls.filter(c=>c.path==='validate'&&c.body.userId==='rider').length>=3);
    await pause(100);assert.equal(rider.player().courier,true,'inventory sync must not stop a horse courier without vehicles');
    rider.socket.send('player.skill',{skill:'horse'});await until(()=>rider.player().interactionState==='horse');
    const desk=(room as unknown as {highfood:HighfoodDesk}).highfood;
    const offer=async()=>{desk.of('rider')!.nextAt=Date.now();await until(()=>rider.food()?.status==='offer');const next=rider.food()!.offer!;rider.socket.send('food.accept',{orderId:next.id});await until(()=>rider.food()?.order?.id===next.id);return rider.food()!.order!;};
    const order=await offer();assert.equal(order.transport,'horse');
    assert.equal(viewer.food()?.order,undefined);
    rider.socket.send('food.locker',{});await until(()=>rider.errors.some(e=>e.includes('ação atual')));
    rider.socket.send('player.interact',{objectId:'stand'});await until(()=>rider.player().interactionState==='');
    rider.player().assign({x:order.pickup.standX,y:order.pickup.y,z:order.pickup.standZ});
    rider.socket.send('food.locker',{});await until(()=>rider.player().interactionState==='food-locker');
    rider.socket.send('food.code',{orderId:order.id,code:order.code});
    await until(()=>rider.food()?.order?.stage==='carrying'&&rider.player().parcel==='bag');
    // The delivery bag is stowed, freeing both hands for the reins.
    rider.player().assign({x:0,y:0,z:6,rotation:Math.PI/2});
    rider.socket.send('player.skill',{skill:'horse'});await until(()=>rider.player().interactionState==='horse');
    await until(()=>rider.food()?.order?.stage==='going');assert.equal(rider.player().parcel,'');
    await until(()=>viewer.socket.state?.players.get('rider')?.courier===true&&viewer.socket.state?.players.get('rider')?.parcel==='');
    // Dismounting far away leaves it in the backpack; on foot near the address E takes it out.
    rider.socket.send('player.skill',{skill:'horse'});await until(()=>rider.player().interactionState==='');
    assert.equal(rider.food()!.order!.stage,'going');
    rider.socket.send('food.unload',{});await until(()=>rider.errors.some(e=>e.includes('endereço da entrega')));
    rider.player().assign({x:order.x+3,y:order.y,z:order.z});
    rider.socket.send('food.unload',{});await until(()=>rider.player().interactionState==='food-unload');
    await until(()=>rider.food()?.order?.stage==='carrying'&&rider.player().parcel==='bag');
    // Remount with the same parcel, then dismount near the door to unload automatically.
    rider.player().assign({x:0,y:0,z:6,rotation:Math.PI/2});
    rider.socket.send('player.skill',{skill:'horse'});await until(()=>rider.player().interactionState==='horse');
    rider.player().assign({x:order.parkX,y:0,z:order.parkZ});
    rider.socket.send('player.interact',{objectId:'stand'});await until(()=>rider.player().interactionState==='food-unload');
    await until(()=>rider.food()?.order?.stage==='carrying'&&rider.player().parcel==='bag');
    rider.player().assign({x:order.x+1,y:order.y,z:order.z});
    rider.socket.send('food.talk',{});await until(()=>rider.player().interactionState==='food-talk');
    rider.socket.send('food.deliver',{orderId:order.id});await until(()=>rider.receipts.length===1);
    const payments=()=>calls.filter(c=>c.path==='highfood/complete');
    assert.equal(payments().length,1);assert.equal(payments()[0]!.body.wornBox,false);assert.equal(payments()[0]!.body.crashes,0);
    assert.equal(rider.player().parcel,'');assert.equal(room.state.npcs.get(HIGHFOOD_NPC_PREFIX+order.id)!.parcel,'bag');
    assert.equal(rider.food()!.done,1);assert.equal(rider.food()!.earned,36);
    rider.socket.send('food.deliver',{orderId:order.id});await until(()=>rider.errors.some(e=>e.includes('não está mais')));assert.equal(payments().length,1);
    // Cancel while collecting: no ghost bag appears when the animation ends.
    rider.player().assign({x:0,y:0,z:6});const cancelled=await offer();
    rider.player().assign({x:cancelled.pickup.standX,y:cancelled.pickup.y,z:cancelled.pickup.standZ});
    rider.socket.send('food.locker',{});await until(()=>rider.player().interactionState==='food-locker');
    rider.socket.send('food.code',{orderId:cancelled.id,code:cancelled.code});await until(()=>rider.food()?.order?.stage==='collect');
    rider.socket.send('food.cancel',{});await until(()=>rider.food()?.status==='waiting');
    await pause(HIGHFOOD.UNLOAD_MS+100);assert.equal(rider.player().parcel,'');assert.equal(rider.player().interactionState,'');
    // Keeping the skin but losing the skill also removes delivery eligibility and closes the order.
    const lost=await offer();boughtHorse=false;rider.socket.send('player.appearance',{});
    await until(()=>rider.food()?.status==='off'&&rider.food()?.horseAvailable===false);assert.equal(rider.player().courier,false);
    await until(()=>calls.some(c=>c.path==='highfood/lost'&&c.body.orderId===lost.id));
    // Switching skin while mounted removes both the horse and the shift when there is no bike alternative.
    boughtHorse=true;rider.socket.send('player.appearance',{});await until(()=>rider.food()?.horseAvailable===true);
    rider.player().assign({x:0,y:0,z:6,rotation:Math.PI/2});rider.socket.send('food.start',{});await until(()=>rider.food()?.status==='waiting');
    rider.socket.send('player.skill',{skill:'horse'});await until(()=>rider.player().interactionState==='horse');
    rider.socket.send('player.skin',{skin:'nathan'});await until(()=>rider.food()?.status==='off'&&rider.player().skin==='nathan');
    assert.equal(rider.player().interactionState,'');assert.equal(rider.player().parcel,'');assert.equal(rider.food()!.horseAvailable,false);
    // With both transports, switching moves the bag; a worn motorcycle box never penalizes the horse's backpack.
    vehicles=[{id:'00000000-0000-4000-8000-000000000077',model:'moto-delivery',name:'Moto',plate:'ABC1D23',parts:writeMotoParts({...readMotoParts(NEW_MOTO_PARTS),bau:0}),mileage:0,boughtAt:0}];
    rider.socket.send('inventory.sync',{});await until(()=>rider.ownership.at(-1)===true);
    rider.socket.send('player.skin',{skin:'tiao'});await until(()=>rider.food()?.horseAvailable===true);
    rider.socket.send('food.start',{});await until(()=>rider.food()?.status==='waiting');
    const garage=GARAGES[0];rider.player().assign({x:garage.x,y:garage.y,z:garage.z});
    rider.socket.send('garage.take',{garageId:garage.id,vehicleId:vehicles[0]!.id});
    await until(()=>[...room.state.motos.values()].some(m=>m.ownerId==='rider'));
    const bike=[...room.state.motos.values()].find(m=>m.ownerId==='rider')!;
    const mixed=await offer();assert.equal(mixed.transport,'moto');
    rider.player().assign({x:mixed.pickup.standX,y:mixed.pickup.y,z:mixed.pickup.standZ});
    rider.socket.send('food.locker',{});await until(()=>rider.player().interactionState==='food-locker');
    rider.socket.send('food.code',{orderId:mixed.id,code:mixed.code});await until(()=>rider.player().parcel==='bag');
    rider.player().assign({x:0,y:0,z:6,rotation:Math.PI/2});
    rider.socket.send('player.skill',{skill:'horse'});await until(()=>rider.food()?.order?.transport==='horse'&&rider.player().interactionState==='horse');
    rider.socket.send('player.interact',{objectId:'stand'});await until(()=>rider.player().interactionState==='');
    rider.player().assign({x:bike.x+Math.cos(bike.yaw)*.8,y:bike.y,z:bike.z-Math.sin(bike.yaw)*.8});
    rider.socket.send('moto.mount',{motoId:bike.id});await until(()=>rider.food()?.order?.transport==='moto'&&bike.riderId==='rider');
    rider.socket.send('player.interact',{objectId:'stand'});await until(()=>!rider.player().interactionState);
    rider.player().assign({x:0,y:0,z:6,rotation:Math.PI/2});
    rider.socket.send('player.skill',{skill:'horse'});await until(()=>rider.player().interactionState==='horse');
    rider.player().assign({x:mixed.parkX,y:0,z:mixed.parkZ});
    rider.socket.send('player.interact',{objectId:'stand'});await until(()=>rider.player().parcel==='bag');
    rider.player().assign({x:mixed.x+1,y:mixed.y,z:mixed.z});
    rider.socket.send('food.talk',{});await until(()=>rider.player().interactionState==='food-talk');
    rider.socket.send('food.deliver',{orderId:mixed.id});await until(()=>rider.receipts.length===2);
    assert.equal(payments().at(-1)!.body.wornBox,false);assert.equal(rider.food()!.done,1);
    const keptVehicles=vehicles;vehicles=[];
    rider.socket.send('inventory.sync',{});await until(()=>rider.ownership.at(-1)===false);
    assert.equal(rider.food()!.status,'waiting','losing the last bike must not stop a horse courier');
    // The equip response may be the first time the room learns about a newly acquired motorcycle.
    vehicles=keptVehicles;
    rider.socket.send('player.skin',{skin:'nathan'});await until(()=>rider.food()?.horseAvailable===false);
    assert.equal(rider.food()!.status,'waiting','an owned bike keeps the shift available after leaving Tião');
  }finally{
    await Promise.allSettled(joined.filter(r=>r.connection?.isOpen).map(r=>r.leave()));
    await server.gracefullyShutdown(false);await new Promise<void>(r=>api.close(()=>r()));
    if(previous===undefined)delete process.env.API_INTERNAL_URL;else process.env.API_INTERNAL_URL=previous;
  }
});
