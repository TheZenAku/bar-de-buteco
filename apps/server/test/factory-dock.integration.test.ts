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
import {pickDeliveryTarget} from '../src/world/factory/route.js';

async function eventually(check:()=>boolean,timeout=5000):Promise<void> {
  const deadline=Date.now()+timeout;
  while(!check()){if(Date.now()>deadline)throw new Error('Condition timed out');await new Promise(resolve=>setTimeout(resolve,20));}
}
const at=(name:string)=>CITY_MARKERS[name]!;

test('destino aleatório da carga: um cruzamento de rua longe da doca, com nome',()=>{
  const dock=at('Ponto_EB_Doca'),seen=new Set<string>();
  for(let i=0;i<40;i++){
    const target=pickDeliveryTarget({x:dock.x,z:dock.z});
    assert.ok(target.distanceM>=140&&target.distanceM<=640,`distância ${target.distanceM}`);assert.ok(target.label.length>0);seen.add(`${target.x},${target.z}`);
  }
  assert.ok(seen.size>3,'a rota muda a cada carga');
});

test('doca na sala real: só caminhão de motorista parado carrega, falha devolve o produto, a venda se acerta quando o caminhão sai',{timeout:30_000},async()=>{
  const previousApi=process.env.API_INTERNAL_URL;
  const calls:Array<Record<string,any>>=[];let shipments:Array<Record<string,any>>=[],failLoad=false;
  const truckId='11111111-1111-4111-8111-111111111111',dockPoint=at('Ponto_EB_Doca');
  const internal=createServer(async(req,res)=>{
    let data='';for await(const chunk of req)data+=chunk;
    const body=data?JSON.parse(data):{};res.setHeader('content-type','application/json');const url=req.url??'';
    if(url==='/api/internal/validate')res.end(JSON.stringify({valid:body.sessionId==='session-alice',blocked:[],role:'user',balance:1000,equippedSkin:'nathan',ownedSkins:SKINS.map(s=>s.id),ownedSkills:[]}));
    else if(url==='/api/internal/controls')res.end('{"controls":[]}');
    else if(url==='/api/internal/employment'){
      if(body.action==='view')res.end(JSON.stringify({employment:{jobId:'spray-dry-operator',status:'hired',hiredAt:new Date().toISOString()},shift:null,config:{}}));
      else if(body.action==='start')res.end(JSON.stringify({shift:{startedAt:new Date().toISOString(),earned:0,station:'entrada'}}));else res.end('{"closed":0}');
    }else if(url==='/api/internal/factory'){
      calls.push(body);
      if(body.action==='view')res.end(JSON.stringify({state:null,revision:0,slots:[],settings:[]}));
      else if(body.action==='orders')res.end('{"orders":[]}');
      else if(body.action==='shipment.list')res.end(JSON.stringify({shipments}));
      else if(body.action==='finance.get')res.end(JSON.stringify({finance:{palletPrice:5000,taxPercent:15,employeeFee:2000,ownerUserId:'',freightBase:400,freightPerKm:1500,freightPerPallet:200,purchaseFreight:600,maxPalletsPerTruck:10,deliveryRadius:14}}));
      else if(body.action==='treasury.get')res.end('{"balance":0,"ledger":[]}');
      else if(body.action==='shipment.summary')res.end('{"summary":{}}');
      else if(body.action==='shipment.load'){
        if(failLoad){res.statusCode=409;res.end('{"error":"O baú do caminhão não comporta essa carga."}');return;}
        const shipment={id:'22222222-2222-4222-8222-222222222222',kind:'sale',status:'loaded',vehicleId:body.vehicleId,plate:'ABC1D23',driverId:body.driverId??'',driverName:'',loaderId:body.loaderId,loaderName:'alice',material:'PRODUTO',pallets:body.pallets,bags:body.pallets*18,orderId:null,destX:body.dest.x,destZ:body.dest.z,destLabel:body.dest.label,distanceM:body.dest.distanceM,gross:0,tax:0,staff:0,owner:0,freight:0,ownerId:'',createdAt:new Date().toISOString(),departedAt:null,deliveredAt:null};
        shipments=[shipment];res.end(JSON.stringify({shipment}));
      }else if(body.action==='shipment.driver'){
        shipments=shipments.map(trip=>trip.id===body.id?{...trip,driverId:body.driverId}:trip);res.end('{"applied":true}');
      }else if(body.action==='shipment.depart'){
        const shipment={...shipments[0]!,status:'in_transit',gross:10000,tax:1500,staff:2000,owner:6500,freight:1800};shipments=[shipment];
        res.end(JSON.stringify({applied:true,shipment,payouts:[{userId:'alice',amount:2000,balance:3000}],tax:1500}));
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
    const results:Array<{action:string;ok:boolean;message:string}>=[],paid:Array<{amount:number;label:string}>=[],states:Array<Record<string,any>>=[];
    alice.onMessage('factory.result',message=>results.push(message));alice.onMessage('factory.paid',message=>paid.push(message));const routes:Array<Record<string,any>|null>=[];alice.onMessage('factory.route',message=>routes.push(message));alice.onMessage('factory.state',message=>states.push(message));
    alice.onMessage('error',(m:any)=>console.log('ERRMSG',JSON.stringify(m)));for(const name of ['employment.state','factory.ppe','chat.message','wallet.state'])alice.onMessage(name,()=>{});
    await eventually(()=>alice!.state?.players?.has('alice'));
    const player=room!.state.players.get('alice')!,factory=room!.factory;
    const stand=(marker:string)=>{const p=at(marker);Object.assign(player,{x:p.x,y:p.y,z:p.z});};
    const send=async(type:string,payload:unknown)=>{await new Promise(resolve=>setTimeout(resolve,400));const count=results.length+1;alice!.send(type,payload);try{await eventually(()=>results.length>=count,2500);}catch(e){console.log('NO ANSWER to',type,JSON.stringify(payload),'results so far',JSON.stringify(results),'trucks',JSON.stringify((room as any).dockTrucks()),'moto',room!.state.motos.size);throw e;}return results.at(-1)!;};
    await eventually(()=>factory.seeded);
    stand('Ponto_EB_Entrada_Pessoal');
    assert.equal((await send('employment.shift',{on:true,requestId:crypto.randomUUID()})).ok,true);assert.equal((await send('factory.ppe',{on:true})).ok,true);
    for(const slot of factory.slots)if(slot.material==='PRODUTO'&&slot.marker!=='Ponto_EB_PA_Ensaque')slot.quantity=slot.marker==='Ponto_EB_PA_1'||slot.marker==='Ponto_EB_PA_2'?18:0;
    const product=()=>factory.slots.filter(slot=>slot.material==='PRODUTO').reduce((sum,slot)=>sum+slot.quantity,0);
    stand('Ponto_EB_Painel');

    // A truck that belongs to a driver, parked at the dock.
    const truck=new Moto();Object.assign(truck,{id:'t1',model:TRUCK_MODEL,vehicleId:truckId,ownerId:'bob',ownerName:'Bob',plate:'ABC1D23',x:dockPoint.x+2,y:dockPoint.y,z:dockPoint.z});room!.state.motos.set('t1',truck);

    // Away from the dock the truck cannot be loaded; and not enough product is said as it is.
    truck.x=dockPoint.x+30;
    let result=await send('factory.dock.load',{vehicleId:truckId,pallets:1,requestId:crypto.randomUUID()});assert.equal(result.ok,false);assert.match(result.message,/estacionado/);
    truck.x=dockPoint.x+2;
    result=await send('factory.dock.load',{vehicleId:truckId,pallets:3,requestId:crypto.randomUUID()});assert.equal(result.ok,false);assert.match(result.message,/Só há 36/);assert.equal(product(),36);

    // The API refusing the load gives the product back.
    failLoad=true;result=await send('factory.dock.load',{vehicleId:truckId,pallets:2,requestId:crypto.randomUUID()});assert.equal(result.ok,false);assert.match(result.message,/baú/);assert.equal(product(),36);
    failLoad=false;
    result=await send('factory.dock.load',{vehicleId:truckId,pallets:2,requestId:crypto.randomUUID()});assert.equal(result.ok,true,result.message);assert.equal(product(),0);
    const load=calls.find(call=>call.action==='shipment.load'&&call.pallets===2&&call.dest);assert.ok(load);assert.equal(load.loaderId,'alice');assert.ok(load.dest.distanceM>=140);

    // Nothing is settled while the truck stays at the dock; when it leaves, the sale is divided and the operator hears about their fee.
    await new Promise(resolve=>setTimeout(resolve,1300));assert.equal(calls.filter(call=>call.action==='shipment.depart').length,0);
    truck.x=dockPoint.x+60;
    await eventually(()=>calls.some(call=>call.action==='shipment.depart'),4000);
    await eventually(()=>paid.some(entry=>entry.amount===2000),3000);assert.equal(paid.find(entry=>entry.amount===2000)!.label,'Taxa de carga');
    // The plant keeps no copy of the product that left.
    assert.equal(product(),0);
    // The panel's state carries the dock and the money the operator needs to see.
    alice.send('factory.watch',{on:true});await eventually(()=>states.some(state=>state.finance&&state.shipments));
    assert.equal(states.at(-1)!.finance.employeeFee,2000);

    // Any truck works, even one the administration spawned (no owner, no garage id, no plate): it is loaded at the dock, and whoever gets in gets the route.
    shipments=[];room!.state.motos.delete('t1');for(const slot of factory.slots)if(slot.marker==='Ponto_EB_PA_1')slot.quantity=18;
    const spawned=new Moto();Object.assign(spawned,{id:'t2',model:TRUCK_MODEL,x:dockPoint.x-3,y:dockPoint.y,z:dockPoint.z+1});room!.state.motos.set('t2',spawned);
    result=await send('factory.dock.load',{vehicleId:'moto:t2',pallets:1,requestId:crypto.randomUUID()});assert.equal(result.ok,true,result.message);
    assert.equal(calls.filter(call=>call.action==='shipment.load').at(-1)!.vehicleId,'moto:t2');
    assert.equal(routes.filter(route=>route&&route.status==='loaded').length,0,'sem motorista, ninguém recebe a rota ainda');
    spawned.riderId='alice';player.interactionState='moto:t2';
    await eventually(()=>routes.some(route=>route&&route.status==='loaded'&&route.label.length>0),4000);
    assert.ok(calls.some(call=>call.action==='shipment.driver'&&call.driverId==='alice'));
    const route=routes.filter(each=>each).at(-1)!;assert.ok(Number.isFinite(route.x)&&Number.isFinite(route.z));
    // Getting out and someone else in hands the trip over; and the same truck can be loaded again after the trip.
    spawned.riderId='';player.interactionState='';
  }finally{
    await alice?.leave().catch(()=>{});await server.gracefullyShutdown(false).catch(()=>{});await new Promise<void>(resolve=>internal.close(()=>resolve()));
    if(previousApi===undefined)delete process.env.API_INTERNAL_URL;else process.env.API_INTERNAL_URL=previousApi;
  }
});
