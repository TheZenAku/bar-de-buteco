import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {Client as BrowserClient,type Room as ClientRoom} from '@colyseus/sdk';
import {signTicket} from '@bar/shared/tickets';
import {BarRoom} from '../src/BarRoom.js';

const eventually=async(check:()=>boolean,timeout=5_000)=>{const end=Date.now()+timeout;while(!check()){if(Date.now()>end)throw new Error('Condition timed out');await new Promise(resolve=>setTimeout(resolve,20));}};
const ADMIN='11111111-1111-4111-8111-111111111111',VISITOR='22222222-2222-4222-8222-222222222222',STRANGER='33333333-3333-4333-8333-333333333333',UNKNOWN='44444444-4444-4444-8444-444444444444',PURCHASE='f0000001-0000-4000-8000-000000000000';
interface World {ribeiro?:{materials:Record<string,number>;stock:Record<string,number>;members:Array<{userId:string;role:string;name:string}>;statusCount:Record<string,number>;purchaseOrders:Array<{status:string;material:string}>};ribeiroResult?:{requestId:string;ok:boolean;message:string}}

test('Administração › Ribeiro: o admin muda equipe, insumos, estoque e OPs pela sala; um jogador comum é recusado',{timeout:30_000},async()=>{
  const previous=process.env.API_INTERNAL_URL,orders:Array<Record<string,unknown>>=[],created:Array<Record<string,unknown>>=[];
  const internal=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;const body=raw?JSON.parse(raw):{};res.setHeader('content-type','application/json');const url=req.url??'';
    if(url==='/api/internal/validate')res.end(JSON.stringify({valid:true,blocked:[],role:body.userId===ADMIN?'admin':'user',balance:0,equippedSkin:'nathan',ownedSkins:['nathan'],ownedSkills:[]}));
    else if(url==='/api/internal/controls')res.end('{"controls":[]}');
    else if(url==='/api/internal/machine-shop')res.end(body.action==='load'?'{"state":null}':'{"saved":true}');
    else if(url==='/api/internal/factory'&&body.action==='orders')res.end(JSON.stringify({orders}));
    else if(url==='/api/internal/factory'&&body.action==='order.create'){created.push(body);orders.push({id:PURCHASE,kind:body.kind,material:body.material,pallets:body.pallets,status:'open',createdAt:new Date().toISOString()});res.end('{"order":{}}');}
    else if(url==='/api/internal/factory'&&body.action==='order.status'){const order=orders.find(each=>each.id===body.id);if(order)order.status=body.status;res.end('{}');}
    else if(url==='/api/internal/factory'&&body.action==='shipment.list')res.end('{"shipments":[]}');
    else if(url==='/api/internal/factory'&&body.action==='finance.get')res.end('{"finance":{}}');
    else if(url==='/api/internal/factory'&&body.action==='treasury.get')res.end('{"balance":0,"ledger":[]}');
    else if(url==='/api/internal/factory'&&body.action==='shipment.summary')res.end('{"summary":{}}');
    else res.end('{}');});
  await new Promise<void>(resolve=>internal.listen(0,'127.0.0.1',resolve));process.env.API_INTERNAL_URL=`http://127.0.0.1:${(internal.address() as AddressInfo).port}`;
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});let authoritative:BarRoom|undefined;server.define('bar',BarRoom).on('create',room=>{authoritative=room as BarRoom;});await server.listen(0,'127.0.0.1');
  const browser=new BrowserClient(`http://127.0.0.1:${(http.address() as AddressInfo).port}`);let admin:ClientRoom|undefined,visitor:ClientRoom|undefined;
  try{
    admin=await browser.joinOrCreate('bar',{ticket:signTicket({userId:ADMIN,sessionId:'admin-session',displayName:'Admin',role:'admin',color:'#34d399'})});admin.reconnection.minUptime=0;
    visitor=await browser.joinOrCreate('bar',{ticket:signTicket({userId:VISITOR,sessionId:'visitor-session',displayName:'Visitante',role:'user',color:'#34d399'})});visitor.reconnection.minUptime=0;
    const worlds:World[]=[],visitorErrors:string[]=[],adminErrors:string[]=[];
    admin.onMessage('admin.world',(value:World)=>worlds.push(value));admin.onMessage('error',(value:{message:string})=>adminErrors.push(value.message));admin.onMessage('*',()=>{});visitor.onMessage('error',(value:{message:string})=>visitorErrors.push(value.message));visitor.onMessage('*',()=>{});
    await eventually(()=>authoritative?.state.players.get(ADMIN)?.connected===true&&authoritative?.state.players.get(VISITOR)?.connected===true);await new Promise(resolve=>setTimeout(resolve,80));
    const shop=authoritative!.machineShop;
    const ask=async(payload:Record<string,unknown>):Promise<World>=>{await new Promise(resolve=>setTimeout(resolve,280));/* the room allows 4 of these a second */const requestId=crypto.randomUUID();admin!.send('admin.ribeiro',{requestId,reason:'Teste da administração',...payload});await eventually(()=>worlds.some(world=>world.ribeiroResult?.requestId===requestId)||adminErrors.length>0);if(adminErrors.length)throw new Error(`A sala recusou: ${adminErrors.join(' | ')}`);return worlds.find(world=>world.ribeiroResult?.requestId===requestId)!;};
    // a person who is not an administrator is refused and nothing changes
    visitor.send('admin.ribeiro',{requestId:crypto.randomUUID(),reason:'Tentando',op:'material',material:'ACO',delta:50});await eventually(()=>visitorErrors.length===1);assert.equal(shop.state.materials.ACO,0);
    // team: the visitor (known to the room) becomes the first owner, then a manager is added by id and name
    let world=await ask({op:'role',userId:VISITOR,role:'owner'});assert.equal(world.ribeiroResult!.ok,true,world.ribeiroResult!.message);
    assert.equal(world.ribeiro!.members.find(member=>member.userId===VISITOR)?.role,'owner');assert.equal(world.ribeiro!.members[0]!.name,'Visitante','o nome vem da sala');
    world=await ask({op:'role',userId:STRANGER,role:'manager',name:'Fora do jogo'});assert.equal(world.ribeiroResult!.ok,true);assert.equal(shop.roleOf(STRANGER),'manager');
    world=await ask({op:'role',userId:UNKNOWN,role:'employee'});assert.equal(world.ribeiroResult!.ok,false,'alguém que a sala nunca viu e sem nome não entra');
    world=await ask({op:'role',userId:VISITOR,role:null});assert.equal(world.ribeiroResult!.ok,false,'o único dono não sai havendo equipe');
    // raw material and finished weapons
    world=await ask({op:'material',material:'ACO',delta:54});assert.equal(world.ribeiroResult!.ok,true);assert.equal(world.ribeiro!.materials.ACO,54);
    world=await ask({op:'material',material:'ACO',delta:-100});assert.equal(world.ribeiroResult!.ok,false);assert.equal(shop.state.materials.ACO,54);
    world=await ask({op:'stock',weapon:'pistola',delta:2});assert.equal(world.ribeiro!.stock.pistola,2);
    // orders: open one and cancel it (the material comes back); open another and drop it
    for(const material of ['ACO','ALUMINIO','POLIMERO','MOLAS'] as const)shop.addMaterial(material,50);
    shop.start('pistola','p','Operador');const first=shop.state.orders[0]!.id,before=shop.state.materials.ACO;
    world=await ask({op:'order.cancel',id:first});assert.equal(world.ribeiroResult!.ok,true);assert.equal(world.ribeiro!.statusCount.cancelled,1);assert.ok(shop.state.materials.ACO>before,'a matéria-prima voltou');
    shop.start('revolver','p','Operador');const second=shop.state.orders[1]!.id;
    world=await ask({op:'order.abort',id:second});assert.equal(world.ribeiroResult!.ok,true);assert.equal(shop.state.orders[1]!.status,'cancelled');
    // the HighCargo request: published once per material, then cancelled while still open
    world=await ask({op:'purchase',material:'MOLAS',pallets:2});assert.equal(world.ribeiroResult!.ok,true,world.ribeiroResult!.message);assert.equal(created.length,1);assert.equal(created[0]!.kind,'ribeiro-purchase');
    assert.equal(world.ribeiro!.purchaseOrders[0]!.material,'MOLAS');
    world=await ask({op:'purchase',material:'MOLAS',pallets:1});assert.equal(world.ribeiroResult!.ok,false,'já há um pedido ativo desse material');
    world=await ask({op:'purchase.cancel',id:PURCHASE});assert.equal(world.ribeiroResult!.ok,true,world.ribeiroResult!.message);assert.equal(orders[0]!.status,'cancelled');
    // a polled snapshot carries the shop but no verdict
    const count=worlds.length;admin.send('admin.world',{});await eventually(()=>worlds.length>count);assert.equal(worlds.at(-1)!.ribeiroResult,undefined);assert.ok(worlds.at(-1)!.ribeiro);
  }finally{if(admin)await admin.leave();if(visitor)await visitor.leave();await server.gracefullyShutdown(false);await new Promise<void>(resolve=>internal.close(()=>resolve()));process.env.API_INTERNAL_URL=previous;}
});
