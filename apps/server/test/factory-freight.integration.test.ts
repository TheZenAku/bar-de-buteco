import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {Client as BrowserClient,type Room as ClientRoom} from '@colyseus/sdk';
import {CITY_MARKERS,SKINS,TRUCK_MODEL} from '@bar/shared';
import {signTicket} from '@bar/shared/tickets';
import {BarRoom} from '../src/BarRoom.js';
import {Moto} from '../src/state.js';

async function eventually(check:()=>boolean,timeout=5000):Promise<void> {
  const deadline=Date.now()+timeout;
  while(!check()){if(Date.now()>deadline)throw new Error('Condition timed out');await new Promise(resolve=>setTimeout(resolve,20));}
}
const at=(name:string)=>CITY_MARKERS[name]!;

test('matéria-prima: pedido no computador, oferta no app do caminhoneiro, aceite ao volante e entrega por NPC quando ninguém pega',{timeout:40_000},async()=>{
  const previousApi=process.env.API_INTERNAL_URL;
  const calls:Array<Record<string,any>>=[];const companyCalls:Array<Record<string,any>>=[];const orders:Array<Record<string,any>>=[];let shipments:Array<Record<string,any>>=[];
  const truckId='33333333-3333-4333-8333-333333333333',dockPoint=at('Ponto_EB_Doca');
  const internal=createServer(async(req,res)=>{
    let data='';for await(const chunk of req)data+=chunk;
    const body=data?JSON.parse(data):{};res.setHeader('content-type','application/json');const url=req.url??'';
    if(url==='/api/internal/validate')res.end(JSON.stringify({valid:body.sessionId==='session-alice',blocked:[],role:'user',balance:1000,equippedSkin:'nathan',ownedSkins:SKINS.map(s=>s.id),ownedSkills:[],
      vehicles:[{id:truckId,model:TRUCK_MODEL,name:'Caminhão Baú',plate:'ABC1D23',parts:'',mileage:0,boughtAt:Date.now()}]}));
    else if(url==='/api/internal/controls')res.end('{"controls":[]}');
    else if(url==='/api/internal/company'){
      companyCalls.push(body);
      if(body.action==='role')res.end('{"role":"owner"}');
      else if(body.action==='purchase'){orders.push({id:crypto.randomUUID(),kind:'purchase',material:body.material,pallets:body.pallets,price:30000,tax:4500,status:'open',dueAt:body.dueAt,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),paidBy:body.userId});res.end(JSON.stringify({applied:true,total:34500,balance:0}));}
      else if(body.action==='admin.state')res.end('{"balance":0,"members":[],"ledger":[]}');
      else res.end('{"ok":true}');
    }
    else if(url==='/api/internal/employment'){
      if(body.action==='view')res.end(JSON.stringify({employment:{jobId:'spray-dry-operator',status:'hired',hiredAt:new Date().toISOString()},shift:null,config:{}}));
      else if(body.action==='start')res.end(JSON.stringify({shift:{startedAt:new Date().toISOString(),earned:0,station:'entrada'}}));else res.end('{"closed":0}');
    }else if(url==='/api/internal/factory'){
      calls.push(body);
      if(body.action==='view')res.end(JSON.stringify({state:null,revision:0,slots:[],settings:[]}));
      else if(body.action==='orders')res.end(JSON.stringify({orders}));
      else if(body.action==='order.create'){orders.push({id:crypto.randomUUID(),kind:body.kind,material:body.material,pallets:body.pallets,price:body.price,status:'open',dueAt:body.dueAt??null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});res.end('{"order":{}}');}
      else if(body.action==='order.status'){const order=orders.find(each=>each.id===body.id);if(order)Object.assign(order,{status:body.status,updatedAt:new Date().toISOString()});res.end('{"order":{}}');}
      else if(body.action==='shipment.list')res.end(JSON.stringify({shipments}));
      else if(body.action==='finance.get')res.end(JSON.stringify({finance:{palletPrice:5000,taxPercent:15,employeeFee:2000,ownerUserId:'',freightBase:400,freightPerKm:1500,freightPerPallet:200,purchaseFreight:600,maxPalletsPerTruck:10,deliveryRadius:14}}));
      else if(body.action==='treasury.get')res.end('{"balance":0,"ledger":[]}');
      else if(body.action==='shipment.summary')res.end('{"summary":{}}');
      else if(body.action==='shipment.accept'){
        const order=orders.find(each=>each.id===body.orderId)!;Object.assign(order,{status:'accepted',acceptedBy:body.driverId,updatedAt:new Date().toISOString()});
        const shipment={id:'44444444-4444-4444-8444-444444444444',kind:'purchase',status:'to_supplier',vehicleId:body.vehicleId,plate:body.plate,driverId:body.driverId,driverName:'alice',loaderId:'',loaderName:'',material:order.material,pallets:order.pallets,bags:order.pallets*18,orderId:order.id,destX:body.dest.x,destZ:body.dest.z,destLabel:body.dest.label,distanceM:body.dest.distanceM,gross:0,tax:0,staff:0,owner:0,freight:1200,ownerId:'',createdAt:new Date().toISOString(),departedAt:null,deliveredAt:null};
        shipments=[shipment];res.end(JSON.stringify({shipment}));
      }else if(body.action==='shipment.driver')res.end('{"applied":true}');
      else if(body.action==='shipment.collect'){shipments=shipments.map(trip=>({...trip,status:'returning'}));res.end(JSON.stringify({applied:true,shipment:shipments[0]}));}
      else if(body.action==='shipment.unload'){
        shipments=shipments.map(trip=>({...trip,status:'delivered',deliveredAt:new Date().toISOString()}));const order=orders.find(each=>each.id===shipments[0]!.orderId);if(order)order.status='completed';
        res.end(JSON.stringify({applied:true,shipment:shipments[0],payouts:[{userId:'alice',amount:1200,balance:2200}]}));
      }else res.end('{"ok":true}');
    }else res.end('{"ok":true}');
  });
  await new Promise<void>(resolve=>internal.listen(0,'127.0.0.1',resolve));
  process.env.API_INTERNAL_URL=`http://127.0.0.1:${(internal.address() as AddressInfo).port}`;
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});
  let room:BarRoom|undefined;server.define('bar',BarRoom).on('create',created=>{room=created as BarRoom;});
  await server.listen(0,'127.0.0.1');
  const client=new BrowserClient(`http://127.0.0.1:${(http.address() as AddressInfo).port}`);
  let alice:ClientRoom|undefined;
  try{
    alice=await client.joinOrCreate('bar',{ticket:signTicket({userId:'alice',sessionId:'session-alice',displayName:'alice',role:'user',color:'#aa8844'})});
    const results:Array<{action:string;ok:boolean;message:string}>=[],freight:Array<Record<string,any>>=[];
    const cresults:Array<{action:string;ok:boolean;message:string}>=[];alice.onMessage('factory.result',message=>results.push(message));alice.onMessage('company.result',message=>cresults.push(message));alice.onMessage('company.state',()=>{});alice.onMessage('freight.state',message=>freight.push(message));
    alice.onMessage('error',()=>{});for(const name of ['employment.state','factory.ppe','chat.message','wallet.state','factory.state','factory.paid','factory.route'])alice.onMessage(name,()=>{});
    await eventually(()=>alice!.state?.players?.has('alice'));
    const player=room!.state.players.get('alice')!,factory=room!.factory;
    const stand=(marker:string)=>{const p=at(marker);Object.assign(player,{x:p.x,y:p.y,z:p.z});};
    const buy=async(material:string,pallets:number)=>{await new Promise(resolve=>setTimeout(resolve,400));const count=cresults.length+1;alice!.send('company.purchase',{material,pallets,requestId:crypto.randomUUID()});await eventually(()=>cresults.length>=count,3000);return cresults.at(-1)!;};
    const send=async(type:string,payload:unknown)=>{await new Promise(resolve=>setTimeout(resolve,400));const count=results.length+1;alice!.send(type,payload);await eventually(()=>results.length>=count,3000);return results.at(-1)!;};
    await eventually(()=>factory.seeded);

    // The app exists for whoever holds a truck key, even with the truck in the garage.
    await eventually(()=>freight.some(state=>state.eligible===true),4000);assert.equal(freight.at(-1)!.driving,null);

    // The request is made at the control room's computer, by someone on shift with the PPE.
    stand('Ponto_EB_Entrada_Pessoal');
    // The plant's computer no longer takes the order: the owners buy (company.purchase), which costs the firm's wallet.
    let result=await send('factory.order.request',{material:'MALTE',pallets:1,requestId:crypto.randomUUID()});assert.equal(result.ok,false);assert.match(result.message,/dono da empresa/);
    assert.equal((await send('employment.shift',{on:true,requestId:crypto.randomUUID()})).ok,true);assert.equal((await send('factory.ppe',{on:true})).ok,true);
    stand('Ponto_EB_Doca');
    stand('Ponto_EB_Painel');
    // Shelves that cannot take what is asked refuse the request.
    for(const slot of factory.slots)if(slot.material==='MALTE')slot.quantity=slot.capacity;
    result=await buy('MALTE',1);assert.equal(result.ok,false);assert.match(result.message,/vaga/);
    for(const slot of factory.slots)if(slot.material==='MALTE')slot.quantity=0;
    result=await buy('MALTE',2);assert.equal(result.ok,true,result.message);
    const created=companyCalls.find(call=>call.action==='purchase'&&call.pallets===2);assert.ok(created);
    const wait=Date.parse(created.dueAt)-Date.now();assert.ok(wait>29*60_000&&wait<=30*60_000+2000,`prazo do NPC ${wait} ms`);
    // The open request reaches the driver's app with the time the supplier's driver would come.
    // (The plant no longer opens requests by itself: only what an owner bought is offered.)
    const mine=()=>freight.at(-1)!.offers.find((each:Record<string,any>)=>each.material==='MALTE'&&each.pallets===2);
    await eventually(()=>!!mine(),4000);
    const offer=mine();assert.equal(offer.bags,36);assert.ok(offer.npcAt>Date.now()+29*60_000);

    // Accepting needs the wheel of a truck.
    result=await send('freight.accept',{orderId:offer.id,requestId:crypto.randomUUID()});assert.equal(result.ok,false);assert.match(result.message,/ao volante/);
    const truck=new Moto();Object.assign(truck,{id:'t9',model:TRUCK_MODEL,vehicleId:truckId,ownerId:'alice',ownerName:'alice',plate:'ABC1D23',x:dockPoint.x+40,y:dockPoint.y,z:dockPoint.z,riderId:'alice'});room!.state.motos.set('t9',truck);player.interactionState='moto:t9';
    await eventually(()=>freight.at(-1)!.driving?.vehicleId===truckId,4000);
    result=await send('freight.accept',{orderId:offer.id,requestId:crypto.randomUUID()});assert.equal(result.ok,true,result.message);
    const accept=calls.find(call=>call.action==='shipment.accept');assert.ok(accept);assert.equal(accept.vehicleId,truckId);assert.equal(accept.driverId,'alice');assert.ok(accept.dest.distanceM>=140);
    await eventually(()=>!mine()&&freight.at(-1)!.trip?.status==='to_supplier',4000);
    // Taking it twice is refused.
    result=await send('freight.accept',{orderId:offer.id,requestId:crypto.randomUUID()});assert.equal(result.ok,false);

    // Back at the dock with the cargo: with nobody on shift to unload, the dock crew does it and the racks get the bags.
    // The truck reaches the supplier (the cargo goes in the hold), then comes back and parks at the dock.
    truck.x=accept.dest.x;truck.z=accept.dest.z;
    await eventually(()=>calls.some(call=>call.action==='shipment.collect'),4000);await eventually(()=>freight.at(-1)!.trip?.status==='returning',4000);
    truck.x=dockPoint.x+2;truck.z=dockPoint.z;
    await send('employment.shift',{on:false,requestId:crypto.randomUUID()}).catch(()=>undefined);
    const malteBefore=factory.slots.filter(slot=>slot.material==='MALTE').reduce((sum,slot)=>sum+slot.quantity,0);
    await eventually(()=>calls.some(call=>call.action==='shipment.unload'),16_000);
    await eventually(()=>factory.slots.filter(slot=>slot.material==='MALTE').reduce((sum,slot)=>sum+slot.quantity,0)===malteBefore+36,4000);
    player.interactionState='';truck.riderId='';room!.state.motos.delete('t9');

    // Nobody takes this one: after the deadline the supplier's driver (an NPC) delivers and the order is closed.
    stand('Ponto_EB_Entrada_Pessoal');assert.equal((await send('employment.shift',{on:true,requestId:crypto.randomUUID()})).ok,true);assert.equal((await send('factory.ppe',{on:true})).ok,true);stand('Ponto_EB_Painel');
    result=await buy('MIX',1);assert.equal(result.ok,true,result.message);
    const mixBefore=factory.slots.filter(slot=>slot.material==='MIX').reduce((sum,slot)=>sum+slot.quantity,0);
    for(const order of orders)if(order.status==='open'&&order.material==='MIX'&&order.pallets===1&&order.dueAt!==null&&Date.parse(order.dueAt)<Date.now()+60_000*29)order.status='cancelled';
    await (room as any).refreshFactoryOrders();
    const mixOrder=orders.filter(order=>order.material==='MIX'&&order.status==='open').at(-1)!;for(const order of orders)if(order!==mixOrder&&order.status==='open')order.status='cancelled';mixOrder.dueAt=new Date(Date.now()-1000).toISOString();await (room as any).refreshFactoryOrders();
    await (room as any).dispatchFactoryOrders();
    assert.equal(mixOrder.status,'completed');assert.equal(factory.slots.filter(slot=>slot.material==='MIX').reduce((sum,slot)=>sum+slot.quantity,0),mixBefore+18);
    assert.ok(factory.events.some(event=>/motorista do fornecedor/.test(event.text)));
  }finally{
    await alice?.leave().catch(()=>{});await server.gracefullyShutdown(false).catch(()=>{});await new Promise<void>(resolve=>internal.close(()=>resolve()));
    if(previousApi===undefined)delete process.env.API_INTERNAL_URL;else process.env.API_INTERNAL_URL=previousApi;
  }
});
