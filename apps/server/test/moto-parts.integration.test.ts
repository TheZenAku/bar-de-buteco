import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';import {WebSocketTransport} from '@colyseus/ws-transport';import {Client,type Room} from '@colyseus/sdk';
import {MAP_COLLIDERS,MOTO,MOTO_ENGINE,MOTO_REPAIR,motoHandling,motoStrikeHp,readMotoParts,stepMoto,writeMotoParts,type MotoBody,type MotoParts} from '@bar/shared';import {signTicket} from '@bar/shared/tickets';
import {BarRoom} from '../src/BarRoom.js';
async function until(check:()=>boolean,ms=8000):Promise<void>{const deadline=Date.now()+ms;while(!check()){if(Date.now()>deadline)throw new Error('Timed out');await new Promise(r=>setTimeout(r,10));}}
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));

test('the engine, the wear, being run over and fixing a part, over real WebSockets',{timeout:120000},async()=>{
  const previous=process.env.API_INTERNAL_URL;
  // The backpack: the room asks the API, and this one has what the test puts in it.
  const backpacks=new Map<string,number>([['mechanic',2]]);
  const api=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;res.setHeader('content-type','application/json');
    if(req.url?.endsWith('/validate')){const user=['mechanic','staff','rider','walker','tired'].find(name=>raw.includes(name))??'';res.end(JSON.stringify({valid:true,blocked:[],role:raw.includes('staff')?'admin':'user',equippedSkin:'nathan',ownedSkins:['nathan'],balance:0,inventory:backpacks.get(user)?[{itemId:MOTO_REPAIR.item,quantity:backpacks.get(user)}]:[]}));return;}
    if(req.url?.endsWith('/inventory')){const body=JSON.parse(raw),left=(backpacks.get('mechanic')??0)-body.quantity;backpacks.set('mechanic',left);res.end(JSON.stringify({stacks:left>0?[{itemId:body.itemId,quantity:left}]:[],capacity:12,usedSlots:left>0?1:0,balance:0,history:[]}));return;}
    res.end('{}');});
  await new Promise<void>(r=>api.listen(0,'127.0.0.1',r));process.env.API_INTERNAL_URL=`http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});let room!:BarRoom;
  server.define('bar',BarRoom).on('create',created=>{room=created as BarRoom;});await server.listen(0,'127.0.0.1');
  const client=new Client(`http://127.0.0.1:${(http.address() as AddressInfo).port}`),rooms:Room[]=[];
  const join=async(id:string,role:'user'|'admin'='user')=>{
    const joined=await client.joinOrCreate('bar',{ticket:signTicket({userId:id,sessionId:`session-${id}`,displayName:id,role,color:'#aa8844'})});rooms.push(joined);
    const errors:string[]=[],struck:Array<{hp:number;by:string}>=[];joined.onMessage('error',m=>errors.push(m.message));joined.onMessage('moto.struck',m=>struck.push(m));
    for(const type of ['chat.message','inventory.state','job.state','wallet.state','prices','admin.world'])joined.onMessage(type,()=>{});
    return {room:joined,errors,struck,player:()=>room.state.players.get(id)!};
  };
  const randomly=Math.random;
  try{
    const staff=await join('staff','admin'),rider=await join('rider');
    await until(()=>!!staff.player()&&!!rider.player());
    staff.player().assign({x:60,y:0,z:7,rotation:Math.PI/2});
    staff.room.send('admin.moto.spawn',{});await until(()=>room.state.motos.size===1);
    const moto=[...room.state.motos.values()][0]!;
    moto.assign({x:50,y:0,z:7,yaw:Math.PI/2});
    const near=(player:{assign:(p:object)=>unknown},side=1.2)=>player.assign({x:moto.x,y:moto.y,z:moto.z+side});
    const wear=(changes:Partial<MotoParts>)=>{moto.parts=writeMotoParts({...readMotoParts(moto.parts),...changes});};
    assert.equal(moto.engine,MOTO_ENGINE.OFF,'A parked bike is off');
    assert.equal(readMotoParts(moto.parts).motor,100);
    // Getting on starts it; it does not pull until it catches.
    near(rider.player());await pause(100);
    rider.room.send('moto.mount',{motoId:moto.id});await until(()=>moto.riderId==='rider');
    assert.equal(moto.engine,MOTO_ENGINE.CRANKING);assert.equal(moto.crank,0,'Healthy: it will catch');
    let seq=10;const input=(throttle:number,steer=0)=>{const value={seq:++seq,throttle,steer,brake:false};rider.room.send('moto.input',value);return value;};
    const startedAt=moto.engineAt;
    assert.ok(startedAt>0);
    await until(()=>moto.engine===MOTO_ENGINE.ON,2000);
    assert.ok(Date.now()-startedAt<1200);
    // The throttle is seen by everyone, for the sound.
    for(let i=0;i<6;i++){input(1);await pause(55);}
    assert.equal(moto.gas,true);assert.ok(moto.speed>0);
    for(let i=0;i<40&&moto.speed>.01;i++){rider.room.send('moto.input',{seq:++seq,throttle:0,steer:0,brake:true});await pause(55);}
    await pause(350);
    assert.equal(moto.gas,false,'Let go, and with no input arriving');
    // Getting off stops it; a bike with a worn engine rides as the prediction says.
    wear({motor:20,direcao:10});
    let predicted:MotoBody={x:moto.x,y:moto.y,z:moto.z,yaw:moto.yaw,pitch:moto.pitch,speed:moto.speed,steer:moto.steer};
    await until(()=>rider.player().lastProcessedInput===seq);
    predicted={x:moto.x,y:moto.y,z:moto.z,yaw:moto.yaw,pitch:moto.pitch,speed:moto.speed,steer:moto.steer};
    const handling=motoHandling(moto);
    assert.ok(handling.power<1&&handling.pull!==0);
    // No dying during the comparison.
    Math.random=()=>.999;
    for(let i=0;i<20;i++){predicted=stepMoto(predicted,input(1),.05,[],handling);await pause(55);}
    await until(()=>rider.player().lastProcessedInput===seq);
    assert.ok(Math.abs(moto.x-predicted.x)<1e-2&&Math.abs(moto.z-predicted.z)<1e-2,`Room ${moto.x},${moto.z}; prediction ${predicted.x},${predicted.z}`);
    assert.ok(Math.abs(moto.yaw-Math.PI/2)>.01,'A bent fork pulled it off the line');
    // The engine dying by itself: the rider stays on, W does nothing until it restarts.
    Math.random=()=>0;
    await until(()=>moto.engine===MOTO_ENGINE.OFF,2000);
    Math.random=()=>.999;
    assert.equal(moto.riderId,'rider');assert.equal(moto.gas,false);
    for(let i=0;i<40&&moto.speed>.01;i++){rider.room.send('moto.input',{seq:++seq,throttle:0,steer:0,brake:true});await pause(55);}
    // A dead engine: W tries again and again, and it never catches; the failure's clip says how.
    wear({motor:0});
    const tried=moto.engineAt;
    await pause(600);
    input(1);await until(()=>moto.engine===MOTO_ENGINE.CRANKING&&moto.engineAt!==tried,2000);
    assert.ok([1,3,4].includes(moto.crank),`Turned over with no catch: ${moto.crank}`);
    const from={x:moto.x,z:moto.z};
    for(let i=0;i<10;i++){input(1);await pause(55);}
    assert.equal(moto.x,from.x,'It does not move while cranking');
    assert.equal(moto.gas,false);
    wear({motor:100,direcao:100,bateria:0});
    // Back from that failure: a dead battery only clicks.
    await until(()=>moto.engine===MOTO_ENGINE.OFF,9000);
    await pause(600);
    input(1);await until(()=>moto.engine===MOTO_ENGINE.CRANKING,2000);
    assert.equal(moto.crank,2,'Dead battery: the relay');
    await until(()=>moto.engine===MOTO_ENGINE.OFF,4000);
    wear({bateria:100});
    await pause(600);input(1);await until(()=>moto.engine===MOTO_ENGINE.ON,3000);
    Math.random=randomly;
    // Getting off shuts it down.
    for(let i=0;i<40&&moto.speed>.01;i++){rider.room.send('moto.input',{seq:++seq,throttle:0,steer:0,brake:true});await pause(55);}
    await until(()=>rider.player().lastProcessedInput===seq);
    rider.room.send('player.interact',{objectId:'stand'});await until(()=>moto.riderId==='');
    assert.equal(moto.engine,MOTO_ENGINE.OFF);
    // Run over at speed: a ragdoll, life lost by how hard, and told who did it.
    const walker=await join('walker');await until(()=>!!walker.player());
    near(rider.player());await pause(100);
    rider.room.send('moto.mount',{motoId:moto.id});await until(()=>moto.riderId==='rider');
    await until(()=>moto.engine===MOTO_ENGINE.ON,2000);
    moto.assign({speed:12,yaw:Math.PI/2});
    walker.player().assign({x:moto.x+3,y:moto.y,z:moto.z});
    const healthy=walker.player().hp;
    for(let i=0;i<30&&walker.player().animationState!=='ragdoll';i++){input(1);await pause(55);}
    assert.equal(walker.player().animationState,'ragdoll');
    await until(()=>walker.struck.length===1,2000);
    const struck=walker.struck[0]!;
    assert.equal(struck.by,'rider');
    assert.ok(struck.hp>=motoStrikeHp(10)&&struck.hp<=motoStrikeHp(MOTO.TOP_SPEED),`It took ${struck.hp}`);
    await until(()=>walker.player().hp===healthy-struck.hp,2000);
    const worn=readMotoParts(moto.parts);
    assert.ok(worn.carenagem<100,'And it marked the bike');
    await until(()=>walker.player().interactionState===''&&rider.player().interactionState==='',20000);
    await until(()=>moto.phase==='down',20000);
    assert.equal(moto.engine,MOTO_ENGINE.OFF,'Down, it is off');
    // A slower hit takes less.
    assert.ok(motoStrikeHp(5)<struck.hp);
    // A blow that would kill: the body flies first and faints where it lands.
    const needs=(room as unknown as {needs:{damage:(p:unknown,n:number,now:number)=>void}}).needs;
    (room as unknown as {needs:{state:(id:string)=>{hpCore:number}}}).needs.state('walker').hpCore=0;
    needs.damage(walker.player(),walker.player().hp-3,Date.now());
    staff.room.send('admin.moto.despawn',{});await until(()=>room.state.motos.size===0);
    await pause(250);
    staff.room.send('admin.moto.spawn',{});await until(()=>room.state.motos.size===1);
    const next=[...room.state.motos.values()][0]!;
    next.assign({x:50,y:0,z:7,yaw:Math.PI/2});
    rider.player().assign({x:next.x,y:next.y,z:next.z+1.2});await pause(100);
    rider.room.send('moto.mount',{motoId:next.id});await until(()=>next.riderId==='rider');await until(()=>next.engine===MOTO_ENGINE.ON,2000);
    next.assign({speed:12});
    walker.player().assign({x:next.x+3,y:next.y,z:next.z});
    for(let i=0;i<30&&walker.player().animationState!=='ragdoll';i++){input(1);await pause(55);}
    assert.equal(walker.player().animationState,'ragdoll');
    await pause(100);
    assert.equal(walker.player().hp,1,'Alive in the air');
    assert.equal(walker.player().condition,'normal');
    await until(()=>(room as unknown as {deaths:{isDead:(id:string)=>boolean}}).deaths.isDead('walker'),15000);
    assert.equal(walker.player().hp,0);
    assert.equal(room.state.ragdolls.has('walker'),false,'The death took over from the body');
    await until(()=>rider.player().interactionState==='',20000);await until(()=>next.phase==='down',20000);
    // The wear of a head-on crash: the front goes first.
    await pause(1200);
    next.assign({phase:'',speed:0,qx:0,qy:0,qz:0,qw:1,x:0,y:0,z:0});
    staff.room.send('admin.moto.despawn',{});await until(()=>room.state.motos.size===0);await pause(250);
    staff.room.send('admin.moto.spawn',{});await until(()=>room.state.motos.size===1);
    const third=[...room.state.motos.values()][0]!;
    const car=MAP_COLLIDERS.find(c=>c.id==='COL_Ext_Arquibancada')!,fromCar=car.x-car.hx-MOTO.HALF_LENGTH-3;
    rider.player().assign({x:fromCar,y:0,z:car.z+1.2});third.assign({x:fromCar,y:0,z:car.z,yaw:Math.PI/2});await pause(100);
    rider.room.send('moto.mount',{motoId:third.id});await until(()=>third.riderId==='rider');await until(()=>third.engine===MOTO_ENGINE.ON,2000);
    third.assign({speed:14,x:fromCar,z:car.z,yaw:Math.PI/2});rider.player().assign({x:fromCar,y:0,z:car.z});
    for(let i=0;i<30&&rider.player().animationState==='ride';i++){input(1);await pause(55);}
    assert.equal(rider.player().animationState,'ragdoll');
    const crash=readMotoParts(third.parts);
    assert.ok(crash.pneu_dianteiro<crash.pneu_traseiro,`Front tyre ${crash.pneu_dianteiro}, rear ${crash.pneu_traseiro}`);
    assert.ok(crash.farol<crash.lanterna,`Headlight ${crash.farol}, tail lamp ${crash.lanterna}`);
    assert.ok(crash.motor>50&&crash.motor<100,`Engine ${crash.motor}`);
    await until(()=>third.phase==='down',20000);await until(()=>rider.player().interactionState==='',20000);
    // Fixing: too far, no piece, someone on it; then one piece, a few seconds, and that part is better.
    const mechanic=await join('mechanic'),tired=await join('tired');await until(()=>!!mechanic.player()&&!!tired.player());
    mechanic.player().assign({x:third.x,y:third.y,z:third.z+6});await pause(100);
    mechanic.room.send('moto.repair',{motoId:third.id,part:'pneu_dianteiro'});await until(()=>mechanic.errors.some(e=>e.includes('Chegue mais perto')));
    await pause(1100);
    tired.player().assign({x:third.x,y:third.y,z:third.z+1.2});await pause(100);
    tired.room.send('moto.repair',{motoId:third.id,part:'pneu_dianteiro'});await until(()=>tired.errors.some(e=>e.includes('peça de moto')));
    mechanic.player().assign({x:third.x,y:third.y,z:third.z+1.2});await pause(100);
    assert.ok(readMotoParts(third.parts).pneu_dianteiro<100);
    mechanic.room.send('moto.repair',{motoId:third.id,part:'pneu_dianteiro'});
    await until(()=>mechanic.player().interactionState===`moto-repair:${third.id}:pneu_dianteiro`,3000);
    assert.equal(mechanic.player().animationState,'use');
    // Nobody lifts it or starts on it meanwhile, and walking does not move the mechanic.
    await pause(1100);
    rider.player().assign({x:third.x,y:third.y,z:third.z+1.2});await pause(100);
    rider.room.send('moto.mount',{motoId:third.id});await until(()=>rider.errors.some(e=>e.includes('consertando')));
    const standing={x:mechanic.player().x,z:mechanic.player().z};
    mechanic.room.send('player.input',{seq:1,dx:1,dz:0,running:false,rotation:0});await pause(150);
    assert.equal(mechanic.player().x,standing.x);assert.equal(mechanic.player().z,standing.z);
    const before=readMotoParts(third.parts).pneu_dianteiro;
    await until(()=>mechanic.player().interactionState==='',MOTO_REPAIR.ms+2000);
    assert.equal(readMotoParts(third.parts).pneu_dianteiro,Math.min(100,Math.round(before+MOTO_REPAIR.amount)));
    assert.equal(mechanic.player().animationState,'idle');
    assert.equal(backpacks.get('mechanic'),1,'One piece gone');
    // A part already whole takes no piece.

    const whole=readMotoParts(third.parts);whole.bau=100;third.parts=writeMotoParts(whole);
    await pause(1100);
    mechanic.room.send('moto.repair',{motoId:third.id,part:'bau'});await until(()=>mechanic.errors.some(e=>e.includes('perfeita')));
    assert.equal(backpacks.get('mechanic'),1);
    // The piece is not for eating.
    await pause(1100);
    mechanic.room.send('inventory.use',{itemId:MOTO_REPAIR.item});await until(()=>mechanic.errors.some(e=>e.includes('se usa na moto')));
  }finally{
    Math.random=randomly;
    await Promise.allSettled(rooms.filter(r=>r.connection?.isOpen).map(r=>r.leave()));
    await server.gracefullyShutdown(false).catch(()=>{});api.close();
    if(previous===undefined)delete process.env.API_INTERNAL_URL;else process.env.API_INTERNAL_URL=previous;
  }
});
