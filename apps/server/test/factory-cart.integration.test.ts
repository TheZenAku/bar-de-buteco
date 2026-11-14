import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {Client as BrowserClient,type Room as ClientRoom} from '@colyseus/sdk';
import {CITY_MARKERS,SKINS,isWalkable} from '@bar/shared';
import {CART_FOLLOW,CLEAN_TASKS,FACTORY_CART,type CartView} from '@bar/shared/factory';
import {signTicket} from '@bar/shared/tickets';
import {BarRoom} from '../src/BarRoom.js';

async function eventually(check:()=>boolean,timeout=4000):Promise<void> {
  const deadline=Date.now()+timeout;
  while(!check()){if(Date.now()>deadline)throw new Error('Condition timed out');await new Promise(resolve=>setTimeout(resolve,20));}
}
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const at=(name:string)=>CITY_MARKERS[name]!;
let room:BarRoom|undefined;
const cart=()=>room!.factory.cart;
const RACK_MALTE='Ponto_EB_Rack_V1N1P1',RACK_MIX='Ponto_EB_Rack_V3N1P1';

test('carrinho de plataforma na sala real: 6 sacos, o 7º recusa, descarrega para as mãos e despeja no tanque, EPI/expediente, escada, solta automática, um empurrador',{timeout:90_000},async()=>{
  const previousApi=process.env.API_INTERNAL_URL;
  const hired=new Set(['alice','carol']);
  let shift:null|{startedAt:string;earned:number;station:string}=null;
  const internal=createServer(async(req,res)=>{
    let data='';for await(const chunk of req)data+=chunk;
    const body=data?JSON.parse(data):{};res.setHeader('content-type','application/json');
    const url=req.url??'';
    if(url==='/api/internal/validate')res.end(JSON.stringify({valid:/^session-(alice|bob|carol)$/.test(body.sessionId),blocked:[],role:'user',balance:1000,equippedSkin:'nathan',ownedSkins:SKINS.map(s=>s.id),ownedSkills:[]}));
    else if(url==='/api/internal/controls')res.end('{"controls":[]}');
    else if(url==='/api/internal/wallet')res.end(JSON.stringify({balance:1000,applied:0}));
    else if(url==='/api/internal/company'&&body.action==='role')res.end(JSON.stringify({role:body.userId==='alice'?'owner':null}));
    else if(url==='/api/internal/employment'){
      if(body.action==='view')res.end(JSON.stringify({employment:hired.has(body.userId)?{jobId:'spray-dry-operator',status:'hired',hiredAt:new Date().toISOString()}:null,shift:body.userId==='alice'?shift:null,config:{}}));
      else if(body.action==='start'){shift={startedAt:new Date().toISOString(),earned:0,station:body.station};res.end(JSON.stringify({shift}));}
      else if(body.action==='stop'){const old=shift;shift=null;res.end(JSON.stringify({shift:old}));}
      else res.end('{"closed":0}');
    }else if(url==='/api/internal/factory'){
      if(body.action==='view')res.end(JSON.stringify({state:null,revision:0,slots:[],settings:[]}));
      else if(body.action==='orders')res.end(JSON.stringify({orders:[]}));
      else res.end('{"applied":true}');
    }else res.end('{"ok":true}');
  });
  await new Promise<void>(resolve=>internal.listen(0,'127.0.0.1',resolve));
  process.env.API_INTERNAL_URL=`http://127.0.0.1:${(internal.address() as AddressInfo).port}`;
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});
  server.define('bar',BarRoom).on('create',created=>{room=created as BarRoom;});
  await server.listen(0,'127.0.0.1');
  const client=new BrowserClient(`http://127.0.0.1:${(http.address() as AddressInfo).port}`);
  const rooms:ClientRoom[]=[];
  try{
    type Result={action:string;ok:boolean;message:string};
    const join=async(name:string)=>{
      const joined=await client.joinOrCreate('bar',{ticket:signTicket({userId:name,sessionId:`session-${name}`,displayName:name,role:'user',color:'#aa8844'})});
      joined.reconnection.minUptime=0;rooms.push(joined);
      const results:Result[]=[],carts:CartView[]=[];
      joined.onMessage('factory.result',message=>results.push(message));
      joined.onMessage('factory.cart',message=>carts.push(message));
      for(const type of ['error','employment.state','factory.ppe','chat.message','factory.state'])joined.onMessage(type,()=>{});
      await eventually(()=>joined.state?.players?.has(name));
      const player=room!.state.players.get(name)!;
      const stand=(x:number,z:number,y=.17,rotation=0)=>{Object.assign(player,{x,y,z,rotation});};
      // The room limits these commands to a few a second: every send waits a beat and for its own answer.
      const send=async(type:string,payload:unknown={})=>{await sleep(260);const count=results.length+1;joined.send(type,type==='factory.ppe'?payload:{requestId:crypto.randomUUID(),...payload as object});await eventually(()=>results.length>=count);return results.at(-1)!;};
      return {joined,player,results,carts,stand,send,standAt:(marker:string)=>{const p=at(marker);stand(p.x,p.z,p.y);}};
    };
    const alice=await join('alice'),carol=await join('carol'),bob=await join('bob');
    await eventually(()=>room!.factory.seeded);
    const stockOf=(material:string)=>room!.factory.slots.filter(slot=>slot.material===material).reduce((sum,slot)=>sum+slot.quantity,0);
    assert.equal(stockOf('MALTE'),36);assert.equal(stockOf('MIX'),18);
    const park=FACTORY_CART.park;
    assert.deepEqual([cart().x,cart().z,cart().bags.length,cart().pusher],[park.x,park.z,0,null],'nasce estacionado e vazio');

    // Without a shift and the PPE nobody touches it (and it does not move).
    alice.stand(park.x,park.z-1.2);
    let result=await alice.send('factory.cart.push');assert.equal(result.ok,false);assert.match(result.message,/expediente/i);
    for(const who of [alice,carol]){
      who.standAt('Ponto_EB_Entrada_Pessoal');
      result=await who.send('employment.shift',{on:true});assert.equal(result.ok,true,result.message);
      result=await who.send('factory.ppe',{on:true});assert.equal(result.ok,true,result.message);
    }
    alice.joined.send('factory.watch',{on:true});

    // Far from it, it does not answer; near it, push: one at a time.
    alice.stand(park.x,park.z+8);
    result=await alice.send('factory.cart.push');assert.equal(result.ok,false);assert.match(result.message,/perto do carrinho/);
    alice.stand(park.x,park.z-1.2);carol.stand(park.x-1,park.z-1.5);
    result=await alice.send('factory.cart.push');assert.equal(result.ok,true,result.message);assert.equal(cart().pusher,'alice');
    await eventually(()=>alice.carts.at(-1)?.pusher==='alice');
    result=await carol.send('factory.cart.push');assert.equal(result.ok,false);assert.match(result.message,/alice já está empurrando/);
    assert.equal(cart().pusher,'alice','um empurrador por vez');
    // Pushing, the hands are on the handle: taking a sack from the cart is refused.
    result=await alice.send('factory.cart.unload');assert.equal(result.ok,false);assert.match(result.message,/Solte o carrinho/);

    // It follows 0.95 m ahead, on the way the pusher faces.
    const open=(from:{x:number;z:number})=>{
      for(let k=0;k<16;k++){const rotation=k*Math.PI/8,dx=Math.sin(rotation),dz=Math.cos(rotation);
        if(Array.from({length:21},(_,i)=>i/4).every(d=>isWalkable(from.x+dx*d,from.z+dz*d,park.y)))return {rotation,dx,dz};}
      throw new Error('sem trecho livre');
    };
    const start={x:park.x,z:park.z-1.2},way=open(start);
    for(let step=1;step<=8;step++){alice.stand(start.x+way.dx*.3*step,start.z+way.dz*.3*step,.17,way.rotation);await sleep(80);}
    const here=alice.player;
    await eventually(()=>Math.abs(Math.hypot(cart().x-here.x,cart().z-here.z)-CART_FOLLOW)<.1,3000);
    assert.ok(Math.abs((cart().x-here.x)-way.dx*CART_FOLLOW)<.15&&Math.abs((cart().z-here.z)-way.dz*CART_FOLLOW)<.15,'à frente, na direção do olhar');
    await eventually(()=>Math.abs(alice.carts.at(-1)!.x-cart().x)<.05,2000);

    // It does not climb: the pusher on a platform (2 m up) leaves it where it was.
    const resting={x:cart().x,y:cart().y,z:cart().z,yaw:cart().yaw};
    alice.stand(here.x+.4,here.z,.17+2,way.rotation);await sleep(300);
    assert.deepEqual({x:cart().x,y:cart().y,z:cart().z,yaw:cart().yaw},resting,'o carrinho não sobe escada');
    assert.equal(cart().pusher,'alice','perto ainda, não solta');
    alice.stand(here.x,here.z,.17,way.rotation);

    // Safety: no PPE off, no end of shift, no cleaning while pushing the cart.
    alice.standAt('Ponto_EB_Entrada_Pessoal');Object.assign(cart(),{x:at('Ponto_EB_Entrada_Pessoal').x,z:at('Ponto_EB_Entrada_Pessoal').z+.95,y:.17,yaw:-Math.PI/2});
    alice.player.rotation=0;
    result=await alice.send('factory.ppe',{on:false});assert.equal(result.ok,false);assert.match(result.message,/Solte o carrinho/);
    result=await alice.send('employment.shift',{on:false});assert.equal(result.ok,false);assert.match(result.message,/Solte o carrinho/);
    assert.equal(cart().pusher,'alice');
    result=await alice.send('factory.clean',{task:CLEAN_TASKS[0]!.id});assert.equal(result.ok,false);assert.match(result.message,/Solte o carrinho/);
    result=await alice.send('factory.cart.release');assert.equal(result.ok,true,result.message);assert.equal(cart().pusher,null);
    await eventually(()=>alice.carts.at(-1)?.pusher===null);
    const parked={x:cart().x,z:cart().z};await sleep(200);assert.deepEqual({x:cart().x,z:cart().z},parked,'solto, fica onde está');
    result=await alice.send('factory.cart.release');assert.equal(result.ok,false);

    // Loading: with the cart within reach a shelf's E puts the sack on it, never in the arms; six fit, the seventh does not.
    const rack=at(RACK_MALTE),rackMix=at(RACK_MIX);
    const place=(marker:string)=>{const p=at(marker);alice.stand(p.x,p.z+.6);Object.assign(cart(),{x:p.x+.4,z:p.z+1.6,y:.17});};
    place(RACK_MALTE);
    for(let i=1;i<=3;i++){result=await alice.send('factory.take',{marker:RACK_MALTE});assert.equal(result.ok,true,result.message);assert.match(result.message,new RegExp(`Saco de MALTE no carrinho \\(${i}/6\\)`));}
    assert.equal(alice.player.factoryBag,'','o saco foi para o carrinho, não para as mãos');
    place(RACK_MIX);
    for(let i=4;i<=6;i++){result=await alice.send('factory.take',{marker:RACK_MIX});assert.equal(result.ok,true,result.message);assert.match(result.message,new RegExp(`Saco de MIX no carrinho \\(${i}/6\\)`));}
    assert.deepEqual(cart().bags.map(bag=>bag.material),['MALTE','MALTE','MALTE','MIX','MIX','MIX'],'materiais misturam');
    assert.equal(stockOf('MALTE'),33);assert.equal(stockOf('MIX'),15);
    result=await alice.send('factory.take',{marker:RACK_MIX});assert.equal(result.ok,false);assert.match(result.message,/O carrinho está cheio \(6\/6\)/);
    assert.equal(stockOf('MIX'),15,'a recusa não tira saco da prateleira');assert.equal(alice.player.factoryBag,'');
    await eventually(()=>alice.carts.at(-1)?.bags.length===6);
    void rack;void rackMix;

    // Unloading: the top sack goes to the hands (with its shelf), and from there to a tank.
    result=await alice.send('factory.cart.unload');assert.equal(result.ok,true,result.message);
    assert.equal(alice.player.factoryBag,'MIX');assert.equal(cart().bags.length,5);
    result=await alice.send('factory.cart.unload');assert.equal(result.ok,false);assert.match(result.message,/já está com um saco/);
    result=await alice.send('factory.cart.put');assert.equal(result.ok,true,result.message);assert.equal(cart().bags.length,6);assert.equal(alice.player.factoryBag,'');
    result=await alice.send('factory.cart.put');assert.equal(result.ok,false);assert.match(result.message,/nenhum saco/);
    result=await alice.send('factory.cart.unload');assert.equal(result.ok,true,result.message);
    // Away from the cart it is out of reach.
    const bag=room!.state.players.get('alice')!;void bag;
    const tank1=at('Ponto_EB_Tanque_1_Operador'),order=room!.factory.eff.recipe;
    alice.stand(tank1.x,tank1.z,tank1.y);
    room!.factory.tanks[0]={...room!.factory.tanks[0]!,state:'AGUARDANDO_INSUMOS',waterL:order.waterL,temperatureC:60};
    result=await alice.send('factory.pour',{tank:1});assert.equal(result.ok,true,result.message);assert.match(result.message,/MIX despejado no TQ-101/);
    assert.equal(room!.factory.tanks[0]!.mixBags,1);assert.equal(alice.player.factoryBag,'');assert.equal(cart().bags.length,5);
    // Up on the platform the cart (on the floor) is out of reach: unload is refused, with the cart's own words.
    result=await alice.send('factory.cart.unload');assert.equal(result.ok,false);assert.match(result.message,/perto do carrinho/);
    // The stock never disappears: what is on the cart is saved as if it were still on its shelves (one MIX is in the tank).
    const saved=(material:string)=>room!.factory.persistentSlots().filter(slot=>slot.material===material).reduce((sum,slot)=>sum+slot.quantity,0);
    assert.equal(saved('MALTE'),36);assert.equal(saved('MIX'),17);

    // Automatic release: the PPE gone, the pusher left behind, a disconnect. The sacks stay on the cart.
    alice.stand(cart().x-1.2,cart().z,.17);
    result=await alice.send('factory.cart.push');assert.equal(result.ok,true,result.message);
    const presence=(room as unknown as {sessions:{getByUser(id:string):{factoryPpe?:boolean}}}).sessions.getByUser('alice');
    presence.factoryPpe=false;await eventually(()=>cart().pusher===null);
    await eventually(()=>alice.results.some(each=>each.action==='cart.release'&&!each.ok&&/EPI/.test(each.message)));
    presence.factoryPpe=true;
    alice.stand(cart().x-1.2,cart().z,.17);
    result=await alice.send('factory.cart.push');assert.equal(result.ok,true,result.message);
    alice.stand(cart().x-9,cart().z);await eventually(()=>cart().pusher===null);
    await eventually(()=>alice.results.some(each=>each.action==='cart.release'&&!each.ok&&/ficou para trás/.test(each.message)));
    assert.equal(cart().bags.length,5);
    // bob has no shift: he cannot push, load or unload.
    bob.stand(cart().x-1.2,cart().z);
    for(const type of ['factory.cart.push','factory.cart.unload'])assert.equal((await bob.send(type)).ok,false);
    // carol pushes; her leaving the game lets it go where it is, sacks and all.
    carol.stand(cart().x-1.2,cart().z);
    result=await carol.send('factory.cart.push');assert.equal(result.ok,true,result.message);assert.equal(cart().pusher,'carol');
    const where={x:cart().x,z:cart().z};
    await carol.joined.leave();await eventually(()=>cart().pusher===null);
    assert.deepEqual({x:cart().x,z:cart().z,bags:cart().bags.length},{...where,bags:5});
    assert.equal(saved('MALTE'),36,'sair do jogo não perde o estoque do carrinho');
    // A reset of the plant parks the cart empty.
    room!.factory.reset();assert.deepEqual([cart().x,cart().z,cart().bags.length,cart().pusher],[park.x,park.z,0,null]);
  }catch(error){
    console.error('FALHOU:',error instanceof Error?error.stack:error);throw error;
  }finally{
    for(const joined of rooms)await Promise.race([joined.leave().catch(()=>{}),sleep(1500)]);
    await server.gracefullyShutdown(false).catch(()=>{});await new Promise<void>(resolve=>internal.close(()=>resolve()));
    if(previousApi===undefined)delete process.env.API_INTERNAL_URL;else process.env.API_INTERNAL_URL=previousApi;
  }
});
