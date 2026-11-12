import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {Client as BrowserClient,type Room as ClientRoom} from '@colyseus/sdk';
import {CITY_MARKERS,SKINS} from '@bar/shared';
import {signTicket} from '@bar/shared/tickets';
import {BarRoom} from '../src/BarRoom.js';

async function eventually(check:()=>boolean,timeout=4000):Promise<void> {
  const deadline=Date.now()+timeout;
  while(!check()){if(Date.now()>deadline)throw new Error('Condition timed out');await new Promise(resolve=>setTimeout(resolve,20));}
}
const at=(name:string)=>CITY_MARKERS[name]!;

test('EMPRESA BRASIL na sala real: expediente, EPI, pegar/despejar saco, comandos por estação, pagamento e estado empurrado',{timeout:30_000},async()=>{
  const previousApi=process.env.API_INTERNAL_URL;
  const wallet:Array<{amount:number;reason:string}>=[],earned:number[]=[];
  let shift:null|{startedAt:string;earned:number;station:string}=null,saved=0;const orders:Array<Record<string,unknown>>=[];
  const internal=createServer(async(req,res)=>{
    let data='';for await(const chunk of req)data+=chunk;
    const body=data?JSON.parse(data):{};res.setHeader('content-type','application/json');
    const url=req.url??'';
    if(url==='/api/internal/validate')res.end(JSON.stringify({valid:body.sessionId==='session-alice',blocked:[],role:'user',balance:1000,equippedSkin:'nathan',ownedSkins:SKINS.map(s=>s.id),ownedSkills:[]}));
    else if(url==='/api/internal/controls')res.end('{"controls":[]}');
    else if(url==='/api/internal/wallet'){wallet.push({amount:body.amount,reason:body.reason});res.end(JSON.stringify({balance:1000+body.amount,applied:body.amount}));}
    else if(url==='/api/internal/employment'){
      if(body.action==='view')res.end(JSON.stringify({employment:{jobId:'spray-dry-operator',status:'hired',hiredAt:new Date().toISOString()},shift,config:{}}));
      else if(body.action==='start'){shift={startedAt:new Date().toISOString(),earned:0,station:body.station};res.end(JSON.stringify({shift}));}
      else if(body.action==='stop'){if(!shift){res.statusCode=409;res.end('{"error":"Você não está em expediente."}');}else{const old=shift;shift=null;res.end(JSON.stringify({shift:old}));}}
      else if(body.action==='shift.earn'){earned.push(body.amount);res.end('{"ok":true}');}
      else res.end('{"closed":0}');
    }else if(url==='/api/internal/factory'){
      if(body.action==='view')res.end(JSON.stringify({state:null,revision:0,slots:[],settings:[]}));
      else if(body.action==='save'){saved++;res.end('{"applied":true}');}
      else if(body.action==='orders')res.end(JSON.stringify({orders}));
      else if(body.action==='order.create'){orders.push({id:crypto.randomUUID(),kind:body.kind,material:body.material,pallets:body.pallets,price:body.price,status:'open',updatedAt:new Date().toISOString()});res.end('{"order":{}}');}
      else res.end('{"ok":true}');
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
    alice.reconnection.minUptime=0;
    const results:Array<{action:string;ok:boolean;message:string;pay?:number;material?:string}>=[],states:Array<Record<string,any>>=[],paid:unknown[]=[];
    alice.onMessage('factory.result',message=>results.push(message));alice.onMessage('factory.state',message=>states.push(message));alice.onMessage('factory.paid',message=>paid.push(message));
    alice.onMessage('error',()=>{});alice.onMessage('employment.state',()=>{});alice.onMessage('factory.ppe',()=>{});alice.onMessage('chat.message',()=>{});
    await eventually(()=>alice!.state?.players?.has('alice'));
    const player=room!.state.players.get('alice')!,factory=room!.factory;
    const stand=(marker:string)=>{const p=at(marker);Object.assign(player,{x:p.x,y:p.y,z:p.z});};
    const lastResult=()=>results.at(-1)!;
    const send=async(type:string,payload:unknown,count=results.length+1)=>{alice!.send(type,payload);await eventually(()=>results.length>=count);return lastResult();};

    // The plant recovers once the API answers, seeds its starting stock, and offers raw material orders when it runs low.
    await eventually(()=>factory.seeded);
    assert.equal(factory.slots.find(slot=>slot.marker==='Ponto_EB_Rack_V1N1P1')?.quantity,18);

    // Working needs a shift and the PPE, each said in its own words.
    stand('Ponto_EB_Entrada_Pessoal');
    let result=await send('factory.take',{marker:'Ponto_EB_Rack_V1N1P1',requestId:crypto.randomUUID()});
    assert.equal(result.ok,false);assert.match(result.message,/expediente/i);
    result=await send('employment.shift',{on:true,requestId:crypto.randomUUID()});
    assert.equal(result.ok,true);assert.equal(factory.snapshot().activeOperators,1);
    result=await send('factory.take',{marker:'Ponto_EB_Rack_V1N1P1',requestId:crypto.randomUUID()});
    assert.equal(result.ok,false);assert.match(result.message,/EPI/);
    result=await send('factory.ppe',{on:true});assert.equal(result.ok,true);

    // Watching the plant: its state is pushed (with who is looking), with no polling.
    alice.send('factory.watch',{on:true});await eventually(()=>states.length>0);
    assert.equal(states.at(-1)!.me.ppe,true);assert.equal(states.at(-1)!.me.onShift,true);assert.equal(states.at(-1)!.me.carrying,null);

    // A bag from the rack: the lowest level with bags, whichever marker of the column was asked for.
    stand('Ponto_EB_Rack_V1N1P1');
    result=await send('factory.take',{marker:'Ponto_EB_Rack_V1N3P1',requestId:crypto.randomUUID()});
    assert.equal(result.ok,true);assert.equal(result.material,'MALTE');
    assert.equal(factory.slots.find(slot=>slot.marker==='Ponto_EB_Rack_V1N1P1')?.quantity,17);
    await eventually(()=>states.at(-1)?.me.carrying==='MALTE');
    // Taking again is refused while the hands are full.
    result=await send('factory.take',{marker:'Ponto_EB_Rack_V1N1P1',requestId:crypto.randomUUID()});assert.equal(result.ok,false);

    // The tank refuses a bag until it is ready, and says why; the bag stays in the hands.
    stand('Ponto_EB_Tanque_1_Operador');
    result=await send('factory.pour',{tank:1,requestId:crypto.randomUUID()});assert.equal(result.ok,false);assert.match(result.message,/tampa|agitador|água|insumos|etapa/i);
    assert.equal(states.at(-1)?.me.carrying,'MALTE');
    // Nothing is produced without a production order: first the tank refuses, then the firm approves one and an employee starts it at the control room.
    result=await send('factory.cmd',{action:'tank1.water',requestId:crypto.randomUUID()});assert.equal(result.ok,false);assert.match(result.message,/Sem ordem de produção/);
    const offer=factory.drawOffers('Dono')[0]!;factory.approveOffer(offer.id,'Gerente');
    stand('Ponto_EB_Entrada_Pessoal');result=await send('factory.cmd',{action:'op.start',requestId:crypto.randomUUID()});assert.equal(result.ok,false);assert.match(result.message,/computador da sala de controle/);
    stand('Ponto_EB_Painel');result=await send('factory.cmd',{action:'op.start',requestId:crypto.randomUUID()});assert.equal(result.ok,true,result.message);assert.equal(factory.board.active?.status,'running');
    stand('Ponto_EB_Tanque_1_Operador');
    // A tank is operated from its own platform; from the entrance it is not.
    result=await send('factory.cmd',{action:'tank1.water',requestId:crypto.randomUUID()});assert.equal(result.ok,true);assert.match(result.message,/água/);
    stand('Ponto_EB_Entrada_Pessoal');
    result=await send('factory.cmd',{action:'tank1.agitator',requestId:crypto.randomUUID()});assert.equal(result.ok,false);assert.match(result.message,/painel|plataforma/i);
    // The panel reaches everything near it.
    stand('Ponto_EB_Painel');
    result=await send('factory.cmd',{action:'dryer.preheat',requestId:crypto.randomUUID()});assert.equal(result.ok,true);

    // Putting the bag back: it must be at a shelf; the shift ending returns it by itself.
    stand('Ponto_EB_Entrada_Pessoal');
    result=await send('factory.drop',{requestId:crypto.randomUUID()});assert.equal(result.ok,false);
    stand('Ponto_EB_Rack_V1N1P1');
    result=await send('factory.drop',{requestId:crypto.randomUUID()});assert.equal(result.ok,true);
    assert.equal(factory.slots.find(slot=>slot.marker==='Ponto_EB_Rack_V1N1P1')?.quantity,18);

    // Wages: a bag stacked pays the operator (job pay, the wallet's rule) and the shift keeps the total.
    stand('Ponto_EB_Painel');
    factory.balance.timeScale=1;factory.bagging={...factory.bagging,state:'AGUARDANDO_EMPILHAR',palletBags:4,weightKg:25};
    // The control room's computer does not reach the bagging controls: they are at the bagging station.
    result=await send('factory.cmd',{action:'bag.stack',requestId:crypto.randomUUID()});assert.equal(result.ok,false);assert.match(result.message,/estação de ensaque/);
    stand('Ponto_EB_Ensaque');
    result=await send('factory.cmd',{action:'bag.stack',requestId:crypto.randomUUID()});assert.equal(result.ok,true);assert.equal(result.pay,3);
    await eventually(()=>paid.length>0);await eventually(()=>earned.length>0);
    assert.ok(wallet.some(entry=>entry.amount===3&&/^job:factory-bag-stack:/.test(entry.reason)),JSON.stringify(wallet));
    assert.equal(earned[0],3);
    await new Promise(resolve=>setTimeout(resolve,1100)); // the room allows 8 factory commands a second: a silent drop looks like a hang

    // A retry of the same request does nothing twice.
    const again=crypto.randomUUID();factory.bagging={...factory.bagging,state:'AGUARDANDO_EMPILHAR'};
    result=await send('factory.cmd',{action:'bag.stack',requestId:again});assert.equal(result.ok,true);const made=factory.bagging.producedBags;
    factory.bagging={...factory.bagging,state:'AGUARDANDO_EMPILHAR'};
    result=await send('factory.cmd',{action:'bag.stack',requestId:again});assert.equal(factory.bagging.producedBags,made);

    // The plant does not ask for raw material by itself any more: the owners buy it (company.purchase).
    for(const slot of factory.slots)if(slot.material==='MIX')slot.quantity=0;
    await (room as unknown as {dispatchFactoryOrders:()=>Promise<void>}).dispatchFactoryOrders();
    assert.ok(!orders.some(order=>order.kind==='purchase'),'nenhuma ordem de compra sozinha');

    // Cleaning is timed work at the dirty place: it needs the spot, takes its seconds and pays; washing a tank from the panel is refused.
    factory.soil('floor-doca',.8);stand('Ponto_EB_Painel');
    result=await send('factory.clean',{task:'floor-doca',requestId:crypto.randomUUID()});assert.equal(result.ok,false);assert.match(result.message,/perto/i);
    await new Promise(resolve=>setTimeout(resolve,1100));
    result=await send('factory.cmd',{action:'tank1.wash',requestId:crypto.randomUUID()});assert.equal(result.ok,false);assert.match(result.message,/plataforma/);
    stand('Ponto_EB_Doca');result=await send('factory.clean',{task:'floor-doca',requestId:crypto.randomUUID()});assert.equal(result.ok,true,result.message);
    await eventually(()=>factory.dirt.levels['floor-doca']===0,15_000);

    // Ending the shift takes the PPE off and closes the shift.
    stand('Ponto_EB_Entrada_Pessoal');
    result=await send('employment.shift',{on:false,requestId:crypto.randomUUID()});assert.equal(result.ok,true);
    assert.equal(factory.snapshot().activeOperators,0);assert.equal(shift,null);
    await eventually(()=>saved>0,9000);
  }finally{
    await alice?.leave().catch(()=>{});await server.gracefullyShutdown(false).catch(()=>{});await new Promise<void>(resolve=>internal.close(()=>resolve()));
    if(previousApi===undefined)delete process.env.API_INTERNAL_URL;else process.env.API_INTERNAL_URL=previousApi;
  }
});
