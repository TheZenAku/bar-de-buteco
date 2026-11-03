import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';import {WebSocketTransport} from '@colyseus/ws-transport';import {Client,type Room} from '@colyseus/sdk';
import {DELIVERY_SPOTS,GARAGES,HIGHFOOD,HIGHFOOD_CUSTOMERS,HIGHFOOD_NPC_PREFIX,MOTO,MOTO_ENGINE,NEW_MOTO_PARTS,PICKUP_POINTS,defaultPrices,gpsRoute,nearestPickup,type HighfoodState} from '@bar/shared';
import {signTicket} from '@bar/shared/tickets';
import {BarRoom} from '../src/BarRoom.js';
import {HighfoodDesk,customerLine} from '../src/world/highfood.js';

async function until(check:()=>boolean,ms=8000):Promise<void>{const deadline=Date.now()+ms;while(!check()){if(Date.now()>deadline)throw new Error('Timed out');await new Promise(r=>setTimeout(r,20));}}
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const people=HIGHFOOD_CUSTOMERS.map(person=>({...person,image:null,active:true})),prices=defaultPrices({});
const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

test('the desk: orders come after a wait, wait for an answer, and three ignored in a row end the shift',()=>{
  let now=1_000_000,random=.5;
  const desk=new HighfoodDesk(()=>people,()=>prices,()=>random),where=()=>({x:HIGHFOOD.BASE.x,z:HIGHFOOD.BASE.z});
  desk.start('ana',null,now);
  assert.equal(desk.stateOf('ana').status,'waiting');
  assert.deepEqual(desk.update(now+1000,where),[]);
  // Never before the shortest wait.
  now+=HIGHFOOD.WAIT_MIN_MS-1000;assert.deepEqual(desk.update(now,where),[]);
  now+=HIGHFOOD.WAIT_MAX_MS;
  assert.deepEqual(desk.update(now,where),[{kind:'changed',userId:'ana'}]);
  const state=desk.stateOf('ana');
  assert.equal(state.status,'offer');assert.ok(state.offer&&state.offer.length>=HIGHFOOD.ROUTE_MIN&&state.offer.length<=HIGHFOOD.ROUTE_MAX,`${state.offer?.length} m`);
  assert.equal(state.offer!.expiresAt,now+HIGHFOOD.OFFER_MS);
  assert.ok(state.offer!.pay>=12&&state.offer!.pay<=40);
  // The way that pays is the one from the pickup point nearest the courier, and the code only comes with the order.
  assert.equal(state.offer!.pickup.address,'Rua Dona Margarida, 24');assert.equal(state.offer!.stage,'pickup');assert.equal(state.offer!.code,'');
  const kerb=gpsRoute({x:state.offer!.pickup.parkX,z:state.offer!.pickup.parkZ},{x:state.offer!.parkX,z:state.offer!.parkZ})!;
  assert.equal(state.offer!.length,Math.round(kerb.length));
  // Nobody answers, three times.
  for(let i=0;i<HIGHFOOD.MAX_IGNORED;i++){
    now+=HIGHFOOD.OFFER_MS+1;
    const events=desk.update(now,where);
    assert.equal(events[0]!.kind,'missed');
    if(i<HIGHFOOD.MAX_IGNORED-1){now+=HIGHFOOD.WAIT_MAX_MS*2;desk.update(now,where);}
    else assert.deepEqual(events,[{kind:'missed',userId:'ana',offline:true}]);
  }
  assert.equal(desk.stateOf('ana').status,'off');
  random=.1;
});

test('the desk: taking an order, the promise, and the customer who gets tired of waiting',()=>{
  let now=5_000_000;
  const desk=new HighfoodDesk(()=>people,()=>prices),where=()=>({x:0,z:-40});
  desk.start('bia',4.8,now);
  now+=HIGHFOOD.WAIT_MAX_MS+1;desk.update(now,where);
  const offer=desk.stateOf('bia').offer!;
  assert.throws(()=>desk.accept('bia',uuid(9),now,where()),/não está mais/);
  // Gone somewhere else since the offer: the GPS takes them to the point nearest from there, and what was offered stands.
  const moved=PICKUP_POINTS[7]!,from={x:moved.parkX+12,z:moved.parkZ},offered={length:offer.length,pay:offer.pay};
  const order=desk.accept('bia',offer.id,now,from);
  assert.equal(order.pickup.parkX,nearestPickup(from)!.point.parkX);assert.equal(order.pickup.parkZ,nearestPickup(from)!.point.parkZ);
  assert.deepEqual({length:order.length,pay:order.pay},offered);
  const way=gpsRoute({x:order.pickup.parkX,z:order.pickup.parkZ},{x:order.parkX,z:order.parkZ})!.length;
  assert.equal(order.promiseAt,now+HIGHFOOD.PROMISE_START_MS+HIGHFOOD.PICKUP_MS+(order.pickup.length+way)/HIGHFOOD.PROMISE_SPEED*1000);
  assert.match(order.code,/^\d{4}$/);assert.equal(desk.stateOf('bia').order!.code,order.code);assert.equal(order.stage,'pickup');
  assert.ok(order.parkX!==undefined&&DELIVERY_SPOTS.some(spot=>spot.x===order.x&&spot.z===order.z));
  assert.equal(desk.stateOf('bia').status,'order');
  // Nothing on board yet, nothing to knock about.
  assert.equal(desk.crashed('bia'),false);assert.equal(order.crashes,0);
  order.stage='going';
  assert.equal(desk.crashed('bia'),true);assert.equal(desk.orderOf('bia')!.crashes,1);assert.equal(desk.crashed('ninguem'),false);
  const line=customerLine(order,'Bia Souza');assert.ok(line.length>3);assert.ok(!line.includes('{nome}'));assert.ok(!line.includes('{item}'));
  const giveUp=order.acceptedAt+(order.promiseAt-order.acceptedAt)*HIGHFOOD.GIVE_UP_FACTOR;
  assert.deepEqual(desk.update(giveUp-1,where),[]);
  const events=desk.update(giveUp,where);
  assert.equal(events[0]!.kind,'gave-up');assert.equal(desk.stateOf('bia').status,'waiting');
  // Two couriers never get the same person, or the same door.
  const crowd=new HighfoodDesk(()=>people,()=>prices);
  crowd.start('a',null,0);crowd.start('b',null,0);crowd.update(HIGHFOOD.WAIT_MAX_MS*2,where);
  const one=crowd.stateOf('a').offer!,two=crowd.stateOf('b').offer!;
  assert.notEqual(one.customer.id,two.customer.id);assert.ok(Math.hypot(one.x-two.x,one.z-two.z)>=15);
});

test('Highfood over real WebSockets: the bike and the base, an order from the app to the customer\'s hands, paid once, and the bike only for its owner',{timeout:120000},async()=>{
  const previous=process.env.API_INTERNAL_URL,calls:Array<{path:string;body:Record<string,unknown>}>=[];
  let owned=true,parts=NEW_MOTO_PARTS,balance=500;
  const api=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;res.setHeader('content-type','application/json');
    const path=req.url?.replace('/api/internal/','')??'',body=raw?JSON.parse(raw):{};
    if(path==='validate'){res.end(JSON.stringify({valid:true,blocked:[],role:'user',equippedSkin:'nathan',ownedSkins:['nathan'],balance,vehicles:owned&&String(body.userId)===uuid(1)?[{id:uuid(77),model:'moto-delivery',name:'Moto',plate:'ABC1D23',parts,mileage:0,boughtAt:0}]:[]}));return;}
    calls.push({path,body});
    if(path==='highfood/complete'){balance+=36;res.end(JSON.stringify({orderId:body.orderId,pay:{base:12,distance:18,bonus:6,lost:0,total:36,reduced:false},paid:36,stars:5,balance,customer:body.customer,capped:false,line:''}));return;}
    if(path==='highfood/rating'){res.end(JSON.stringify({rating:4.8}));return;}
    if(path==='highfood/customers'){res.end(JSON.stringify({customers:[]}));return;}
    if(path==='wallet'){balance+=Number(body.amount);res.end(JSON.stringify({balance,applied:body.amount}));return;}
    res.end('{}');});
  await new Promise<void>(r=>api.listen(0,'127.0.0.1',r));process.env.API_INTERNAL_URL=`http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});let room!:BarRoom;
  server.define('bar',BarRoom).on('create',created=>{room=created as BarRoom;});await server.listen(0,'127.0.0.1');
  const client=new Client(`http://127.0.0.1:${(http.address() as AddressInfo).port}`),rooms:Room[]=[];
  const join=async(id:string)=>{
    const joined=await client.joinOrCreate('bar',{ticket:signTicket({userId:id,sessionId:`00000000-0000-4000-8000-${id.slice(-12)}`,displayName:'Ana Lima',role:'user',color:'#aa8844'})});rooms.push(joined);
    const errors:string[]=[],got={lockers:[] as unknown[],codes:[] as Array<{ok:boolean}>,food:[] as HighfoodState[],dialogs:[] as unknown[],receipts:[] as Array<{paid:number}>,base:[] as unknown[],notices:[] as unknown[]};
    joined.onMessage('error',m=>errors.push(m.message));joined.onMessage('food.state',m=>got.food.push(m));joined.onMessage('food.dialog',m=>got.dialogs.push(m));joined.onMessage('food.locker',m=>got.lockers.push(m));joined.onMessage('food.code',m=>got.codes.push(m));joined.onMessage('food.receipt',m=>got.receipts.push(m));joined.onMessage('food.base',m=>got.base.push(m));joined.onMessage('food.notice',m=>got.notices.push(m));
    for(const type of ['chat.message','inventory.state','job.state','wallet.state','prices','food.delivered','moto.towed','food.owned','garage.state','garage.taken','achievement.unlocked'])joined.onMessage(type,()=>{});
    return {room:joined,errors,got,food:()=>got.food.at(-1)!,player:()=>room.state.players.get(id)!};
  };
  try{
    const ana=await join(uuid(1)),bob=await join(uuid(2));await until(()=>!!ana.player()&&!!bob.player());
    const id=uuid(1),base=HIGHFOOD.BASE;
    // Without a bike, no shift, anywhere.
    bob.player().assign({x:base.x,y:base.y,z:base.z});bob.room.send('food.start',{});await until(()=>bob.errors.some(e=>e.includes('HighMotors')));
    bob.room.send('player.interact',{objectId:'highfood-base'});await until(()=>bob.got.base.length>0);
    assert.equal((bob.got.base[0] as {owned:boolean}).owned,false);
    // Online from anywhere, from the app, far from the base and with the bike in the garage: no order comes up until it is out.
    ana.player().assign({x:base.x+40,y:0,z:base.z-40});ana.room.send('food.start',{});
    await until(()=>ana.food()?.status==='waiting');
    assert.equal(ana.player().courier,true);
    assert.ok(ana.got.notices.some(notice=>JSON.stringify(notice).includes('garagem')),'Told where the bike is');
    assert.equal([...room.state.motos.values()].filter(moto=>moto.ownerId===id).length,0);
    const shift=(room as unknown as {highfood:HighfoodDesk}).highfood.of(id)!;
    shift.nextAt=Date.now();await pause(400);
    assert.equal(ana.food().status,'waiting');
    // Out of the garage: on the street by it, locked.
    const garage=GARAGES[0];
    ana.player().assign({x:garage.x,y:garage.y,z:garage.z});await pause(120);
    ana.room.send('garage.take',{garageId:garage.id,vehicleId:uuid(77)});
    await until(()=>[...room.state.motos.values()].some(moto=>moto.ownerId===id));
    const bike=[...room.state.motos.values()].find(moto=>moto.ownerId===id)!;
    assert.ok(Math.hypot(bike.x-garage.x,bike.z-garage.z)<12,`The bike waits by the garage: ${bike.x},${bike.z}`);assert.equal(bike.locked,true);assert.equal(bike.plate,'ABC1D23');
    // Someone else cannot ride it.
    bob.player().assign({x:bike.x+Math.cos(bike.yaw)*1.1,y:bike.y,z:bike.z-Math.sin(bike.yaw)*1.1});
    await pause(1100);bob.room.send('moto.mount',{motoId:bike.id});await until(()=>bob.errors.some(e=>e.includes('trancada')));
    // The next order is due now; it shows only for its courier.
    shift.nextAt=Date.now();
    await until(()=>ana.food()?.status==='offer');
    const offer=ana.food().offer!;
    assert.equal(bob.got.food.at(-1)?.offer,undefined);
    assert.ok(offer.items.length>=1&&offer.address.includes(','));
    ana.room.send('food.accept',{orderId:offer.id});
    await until(()=>ana.food()?.status==='order');
    const npc=()=>room.state.npcs.get(HIGHFOOD_NPC_PREFIX+offer.id);
    await until(()=>!!npc());
    assert.equal(npc()!.behavior,'customer');assert.equal(npc()!.displayName,offer.customer.name);assert.ok(npc()!.skin);
    assert.ok(Math.abs(npc()!.x-offer.x)<.01&&Math.abs(npc()!.z-offer.z)<.01);
    // The others' customers do not get in the way of the bar's NPCs.
    await pause(200);assert.ok(room.state.npcs.get('tonico'));
    // Not yet: the order is still at the pickup point, nothing to hand over or take out of the box.
    const taken=ana.food().order!,pickup=taken.pickup,lockerStand={x:pickup.standX,y:pickup.y,z:pickup.standZ};
    assert.match(taken.code,/^\d{4}$/);assert.equal(taken.stage,'pickup');assert.equal(offer.code,'');
    assert.equal(bob.got.food.at(-1)?.order,undefined);
    ana.room.send('food.talk',{});await until(()=>ana.errors.some(e=>e.includes('ponto de retirada')));
    ana.room.send('food.unload',{});await until(()=>ana.errors.some(e=>e.includes('pegar no baú')));
    // Far from the screen, or behind it, it does not open; in front of it, it does and holds the player there.
    ana.errors.length=0;
    ana.room.send('food.locker',{});await until(()=>ana.errors.some(e=>e.includes('tela do ponto')));
    ana.errors.length=0;
    ana.player().assign({x:pickup.x-pickup.frontX*1.2,y:pickup.y,z:pickup.z-pickup.frontZ*1.2});await pause(300);
    ana.room.send('food.locker',{});await until(()=>ana.errors.some(e=>e.includes('tela do ponto')));
    ana.player().assign(lockerStand);await pause(300);
    ana.room.send('food.locker',{});await until(()=>ana.got.lockers.length===1);
    assert.deepEqual(ana.got.lockers[0],{orderId:offer.id});assert.equal(ana.player().interactionState,'food-locker');
    // A wrong code, or a malformed one, opens nothing and can be typed again; leaving closes the screen.
    const wrong=taken.code==='0000'?'0001':'0000';
    ana.room.send('food.code',{orderId:offer.id,code:wrong});await until(()=>ana.got.codes.length===1);
    assert.equal(ana.got.codes[0]!.ok,false);assert.equal(ana.player().interactionState,'food-locker');assert.equal(ana.food().order!.stage,'pickup');
    ana.errors.length=0;
    ana.room.send('food.code',{orderId:offer.id,code:'12'});await until(()=>ana.errors.includes('Comando inválido.'));
    ana.room.send('food.leave',{});await until(()=>ana.player().interactionState==='');
    assert.equal(ana.got.lockers.at(-1),null);assert.equal(ana.food().order!.stage,'pickup');
    // The code without the screen open does nothing.
    ana.errors.length=0;
    ana.room.send('food.code',{orderId:offer.id,code:taken.code});await until(()=>ana.errors.some(e=>e.includes('não está mais')));
    assert.equal(ana.food().order!.stage,'pickup');
    await pause(300);ana.room.send('food.locker',{});await until(()=>ana.player().interactionState==='food-locker');
    ana.room.send('food.code',{orderId:offer.id,code:taken.code});await until(()=>ana.got.codes.at(-1)!.ok);
    assert.equal(ana.player().interactionState,'food-unload');await until(()=>ana.food().order!.stage==='collect');
    await until(()=>ana.player().parcel==='bag',HIGHFOOD.UNLOAD_MS+2500);
    await until(()=>ana.food().order!.stage==='carrying');assert.equal(ana.player().interactionState,'');
    await until(()=>ana.got.notices.length>1);
    assert.ok(ana.got.notices.some(notice=>JSON.stringify(notice).includes('Pedido retirado')));
    // Ride there: the bike is put at the kerb, on it, and getting off takes the bag out.
    ana.player().assign({x:bike.x+Math.cos(bike.yaw)*.8,y:bike.y,z:bike.z-Math.sin(bike.yaw)*.8});await pause(350);ana.room.send('moto.mount',{motoId:bike.id});
    await until(()=>bike.riderId===id);
    // Up on the bike, the bag goes in the box.
    assert.equal(ana.player().parcel,'');await until(()=>ana.food().order!.stage==='going');
    await until(()=>bike.engine===MOTO_ENGINE.ON);
    const fits=offer.parkX,fitz=offer.parkZ;bike.assign({x:fits,z:fitz,speed:0});
    await pause(120);
    ana.room.send('player.interact',{objectId:'stand'});
    await until(()=>ana.player().interactionState==='food-unload');
    assert.equal(ana.food().order!.stage,'unload');
    await until(()=>ana.player().parcel==='bag',HIGHFOOD.UNLOAD_MS+2500);
    await until(()=>ana.food().order!.stage==='carrying');
    // Off the bike and walking: still too far is refused, close enough opens the dialog.
    ana.player().assign({x:offer.x+6,y:offer.y,z:offer.z});
    await pause(300);ana.room.send('food.talk',{});await until(()=>ana.errors.some(e=>e.includes('Chegue mais perto')));
    ana.player().assign({x:offer.x+1,y:offer.y,z:offer.z});
    await pause(300);ana.room.send('food.talk',{});
    await until(()=>ana.got.dialogs.length>0);
    const dialog=ana.got.dialogs.at(-1) as {orderId:string;line:string;customer:{name:string}};
    assert.equal(dialog.orderId,offer.id);assert.equal(dialog.customer.name,offer.customer.name);assert.ok(dialog.line.length>3);
    assert.equal(ana.player().interactionState,'food-talk');
    // "Agora não" closes it and nothing changes.
    ana.room.send('food.leave',{});await until(()=>ana.player().interactionState==='');
    assert.equal(ana.food().order!.stage,'carrying');
    await pause(300);ana.room.send('food.talk',{});await until(()=>ana.player().interactionState==='food-talk');
    ana.room.send('food.deliver',{orderId:offer.id});
    await until(()=>ana.got.receipts.length===1);
    assert.equal(ana.got.receipts[0]!.paid,36);
    assert.equal(ana.player().parcel,'');
    assert.equal(npc()!.parcel,'bag');
    const paid=calls.filter(call=>call.path==='highfood/complete');
    assert.equal(paid.length,1);assert.equal(paid[0]!.body.orderId,offer.id);assert.equal(paid[0]!.body.onTime,true);assert.equal(paid[0]!.body.crashes,0);
    // Back to waiting, and the customer leaves in a while.
    assert.equal(ana.food().status,'waiting');assert.ok(ana.food().nextAt!>Date.now());assert.equal(ana.food().done,1);assert.equal(ana.food().earned,36);
    await until(()=>!npc(),HIGHFOOD.LEAVE_MS+3000);
    // Twice is refused.
    ana.room.send('food.deliver',{orderId:offer.id});await pause(150);assert.equal(calls.filter(call=>call.path==='highfood/complete').length,1);
    // A crash with an order on board counts against it, and the bag goes back; the tow brings the bike for the price.
    shift.nextAt=Date.now();await until(()=>ana.food()?.status==='offer');
    const second=ana.food().offer!;ana.room.send('food.accept',{orderId:second.id});await until(()=>ana.food()?.status==='order');
    ana.room.send('food.cancel',{});await until(()=>calls.some(call=>call.path==='highfood/lost')||ana.food().status==='waiting');
    assert.equal(ana.food().status,'waiting');
    await until(()=>calls.some(call=>call.path==='highfood/lost'),6000);
    assert.equal(calls.find(call=>call.path==='highfood/lost')!.body.reason,'cancelled');
    // Cancelling with the door already open: nobody stays stuck taking out a bag that no longer exists.
    shift.nextAt=Date.now();await until(()=>ana.food()?.status==='offer');
    const third=ana.food().offer!;ana.player().assign({x:base.x,y:base.y,z:base.z});await pause(300);
    ana.room.send('food.accept',{orderId:third.id});await until(()=>ana.food()?.status==='order');
    const thirdOrder=ana.food().order!;
    ana.player().assign({x:thirdOrder.pickup.standX,y:thirdOrder.pickup.y,z:thirdOrder.pickup.standZ});await pause(300);
    ana.room.send('food.locker',{});await until(()=>ana.player().interactionState==='food-locker');
    ana.room.send('food.code',{orderId:third.id,code:thirdOrder.code});await until(()=>ana.player().interactionState==='food-unload');
    ana.room.send('food.cancel',{});await until(()=>ana.food().status==='waiting');
    assert.equal(ana.player().interactionState,'');assert.equal(ana.player().parcel,'');
    ana.player().assign({x:-60,y:0,z:-60});bike.assign({x:base.x-2,z:base.z});
    await pause(2200);
    ana.room.send('moto.tow',{});
    await until(()=>{const moto=[...room.state.motos.values()].find(each=>each.ownerId===id);return !!moto&&Math.hypot(moto.x+60,moto.z+60)<31;});
    assert.ok(calls.some(call=>call.path==='wallet'&&call.body.reason==='vehicle:tow'&&call.body.amount===-30),'The tow is charged');
    assert.equal([...room.state.motos.values()].filter(each=>each.ownerId===id).length,1);
    // Offline ends it all. Wear is saved for the API.
    ana.room.send('food.stop',{});await until(()=>ana.player().courier===false);
    assert.equal(ana.food().status,'off');
    void MOTO;void parts;parts=NEW_MOTO_PARTS;owned=true;
  }finally{
    for(const joined of rooms)await joined.leave().catch(()=>{});
    await server.gracefullyShutdown(false).catch(()=>{});
    api.close();http.close();
    process.env.API_INTERNAL_URL=previous;
  }
});
