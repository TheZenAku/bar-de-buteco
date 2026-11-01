import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';import {WebSocketTransport} from '@colyseus/ws-transport';import {Client,type Room} from '@colyseus/sdk';
import {MAP_COLLIDERS,MOTO,MOTO_ENGINE,Ragdoll,motoHandling,stepMoto,type MotoBody} from '@bar/shared';import {signTicket} from '@bar/shared/tickets';
import {BarRoom} from '../src/BarRoom.js';
async function until(check:()=>boolean,ms=6000):Promise<void>{const deadline=Date.now()+ms;while(!check()){if(Date.now()>deadline)throw new Error('Timed out');await new Promise(r=>setTimeout(r,20));}}
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
test('the delivery bike over real WebSockets: spawned by an administrator, mount, ride as predicted, one rider, get off on the left, let go when the rider drops, despawn',{timeout:90000},async()=>{
  const previous=process.env.API_INTERNAL_URL;
  const api=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;res.setHeader('content-type','application/json');
    res.end(JSON.stringify(req.url?.endsWith('/validate')?{valid:true,blocked:[],role:raw.includes('staff')?'admin':'user',equippedSkin:'nathan',ownedSkins:['nathan'],balance:0}:{}));});
  await new Promise<void>(r=>api.listen(0,'127.0.0.1',r));process.env.API_INTERNAL_URL=`http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});let room!:BarRoom;
  server.define('bar',BarRoom).on('create',created=>{room=created as BarRoom;});await server.listen(0,'127.0.0.1');
  const client=new Client(`http://127.0.0.1:${(http.address() as AddressInfo).port}`),rooms:Room[]=[];
  const join=async(id:string,role:'user'|'admin'='user')=>{
    const joined=await client.joinOrCreate('bar',{ticket:signTicket({userId:id,sessionId:`session-${id}`,displayName:id,role,color:'#aa8844'})});rooms.push(joined);
    const errors:string[]=[];joined.onMessage('error',m=>errors.push(m.message));
    const snapshots:Array<{motos:Array<{id:string;riderId:string;rider:string;x:number;z:number}>}>=[];joined.onMessage('admin.world',m=>snapshots.push(m));
    for(const type of ['chat.message','inventory.state','job.state','wallet.state','prices'])joined.onMessage(type,()=>{});
    return {room:joined,errors,snapshots,player:()=>room.state.players.get(id)!};
  };
  try{
    const rider=await join('rider');await until(()=>!!rider.player());
    // The map starts with no bike, and players cannot bring one.
    assert.equal(room.state.motos.size,0);
    rider.room.send('admin.moto.spawn',{});await until(()=>rider.errors.some(e=>e.includes('exclusivo')));
    rider.room.send('admin.moto.despawn',{});await pause(100);
    assert.equal(room.state.motos.size,0);
    // An administrator spawns it just ahead, on the street, pointing the same way.
    const staff=await join('staff','admin');await until(()=>!!staff.player());
    const spot={id:'moto-1',x:13.6,y:0,z:3.85,yaw:-Math.PI/2};
    staff.player().assign({x:spot.x+MOTO.HALF_LENGTH+.8,y:0,z:spot.z,rotation:spot.yaw});
    staff.room.send('admin.moto.spawn',{});await until(()=>room.state.motos.size===1);
    const moto=()=>room.state.motos.get(spot.id)!;
    assert.ok(Math.abs(moto().x-spot.x)<.01&&Math.abs(moto().z-spot.z)<.01,`Spawned at ${moto().x},${moto().z}`);
    assert.ok(Math.abs(moto().yaw-spot.yaw)<1e-5);assert.equal(moto().riderId,'');
    await until(()=>staff.snapshots.at(-1)?.motos[0]?.id===spot.id);
    staff.player().assign({x:spot.x+6,y:0,z:spot.z});
    // From too far, the room refuses.
    rider.player().assign({x:spot.x,y:.15,z:-1});
    rider.room.send('moto.mount',{motoId:spot.id});await until(()=>rider.errors.some(e=>e.includes('Chegue mais perto')));
    await pause(1100);
    rider.player().assign({x:spot.x,y:.15,z:2.8});
    rider.room.send('moto.mount',{motoId:spot.id});
    await until(()=>moto().riderId==='rider');
    assert.equal(rider.player().interactionState,`moto:${spot.id}`);assert.equal(rider.player().animationState,'ride');
    // It pulls once the engine has caught.
    await until(()=>moto().engine===MOTO_ENGINE.ON);
    // Walking inputs do not move a rider; the bike's do, one a tick, the same steps a browser predicts.
    rider.room.send('player.input',{seq:1,dx:1,dz:0,running:false,rotation:0});await pause(120);
    assert.equal(rider.player().x,spot.x);
    let seq=10,predicted:MotoBody={x:spot.x,y:spot.y,z:spot.z,yaw:spot.yaw,pitch:0,speed:0,steer:0};
    for(let i=0;i<30;i++){const input={seq:++seq,throttle:1,steer:0,brake:false};predicted=stepMoto(predicted,input);rider.room.send('moto.input',input);await pause(55);}
    await until(()=>rider.player().lastProcessedInput===seq);
    assert.ok(Math.abs(moto().x-predicted.x)<1e-3,`Room ${moto().x}, prediction ${predicted.x}`);
    assert.ok(moto().x<spot.x-1,'It went where it points (−X)');
    assert.equal(rider.player().x,moto().x,'The rider goes with it, for chat, voice and the areas of interest');
    // Too fast to get off; and nobody else gets on.
    const other=await join('other');await until(()=>!!other.player());
    other.player().assign({x:moto().x,y:0,z:moto().z+1});await pause(100);
    other.room.send('moto.mount',{motoId:spot.id});await until(()=>other.errors.some(e=>e.includes('Alguém já está')));
    await pause(1100);
    rider.room.send('player.interact',{objectId:'stand'});await until(()=>rider.errors.some(e=>e.includes('Diminua')));
    assert.equal(moto().riderId,'rider');
    // Brakes, stops, gets off on the bike's left (+Z when facing −X).
    for(let i=0;i<40&&Math.abs(moto().speed)>.01;i++){rider.room.send('moto.input',{seq:++seq,throttle:0,steer:0,brake:true});await pause(55);}
    assert.ok(Math.abs(moto().speed)<MOTO.DISMOUNT_SPEED);
    await pause(1100);
    rider.room.send('player.interact',{objectId:'stand'});await until(()=>moto().riderId==='');
    assert.equal(rider.player().interactionState,'');assert.equal(rider.player().animationState,'idle');
    assert.ok(rider.player().z>moto().z+.5&&Math.abs(rider.player().x-moto().x)<.1,`Off at ${rider.player().x},${rider.player().z}`);
    // Nobody rides it: it stays there.
    const parked=moto().x;await pause(200);assert.equal(moto().x,parked);
    // Fainting (anything that changes the rider's state) lets the bike go: slow, it stops by itself on its wheels.
    other.player().assign({x:moto().x,y:0,z:moto().z+1});await pause(100);
    other.room.send('moto.mount',{motoId:spot.id});await until(()=>moto().riderId==='other');
    moto().speed=2;other.player().interactionState='fainted';
    await until(()=>moto().riderId==='');
    await until(()=>moto().speed===0,4000);
    assert.equal(moto().phase,'');
    assert.equal(other.player().interactionState,'fainted','Its state stays with the player');
    other.player().interactionState='';
    // Fast, it goes on by itself, nobody can get on, and it ends up on the ground; lifted by hand, it can be ridden again.
    await pause(1100);
    other.player().assign({x:moto().x,y:0,z:moto().z+1});await pause(100);
    other.room.send('moto.mount',{motoId:spot.id});await until(()=>moto().riderId==='other');
    moto().speed=9;other.player().interactionState='fainted';
    await until(()=>moto().phase==='loose');
    assert.equal(moto().riderId,'');
    const going=moto().x;await pause(300);
    assert.ok(moto().x<going-.5,'It keeps rolling by itself');
    assert.ok(moto().speed>0,'On its way');
    other.player().interactionState='';
    await pause(1100);
    other.room.send('moto.mount',{motoId:spot.id});await until(()=>other.errors.some(e=>e.includes('Espere a moto parar')||e.includes('Chegue mais perto')));
    await until(()=>moto().phase==='down',25000);
    assert.ok(1-2*(moto().qx**2+moto().qz**2)<.6,'It lies on its side');
    assert.equal(moto().speed,0);
    await pause(1100);
    other.player().assign({x:moto().x+6,y:0,z:moto().z+1});await pause(100);
    const refused=other.errors.length;
    other.room.send('moto.mount',{motoId:spot.id});await until(()=>other.errors.length>refused);
    assert.ok(other.errors.at(-1)!.includes('Chegue mais perto'),other.errors.at(-1));
    assert.equal(moto().phase,'down');
    await pause(1100);
    other.player().assign({x:moto().x+.2,y:moto().y,z:moto().z+1.2});await pause(100);
    other.room.send('moto.mount',{motoId:spot.id});await until(()=>moto().phase==='lifting');
    assert.equal(moto().lifterId,'other');assert.equal(other.player().animationState,'moto-lift');
    assert.equal(moto().riderId,'','Lifting is not riding');
    await pause(MOTO.LIFT_MS/2);
    assert.ok(1-2*(moto().qx**2+moto().qz**2)>.3,'On its way up');
    await until(()=>moto().phase==='',5000);
    assert.equal(other.player().interactionState,'');assert.equal(other.player().animationState,'idle');
    assert.equal(moto().lifterId,'');
    await pause(1100);
    // Inputs arriving unevenly all run, none is lost and none runs ahead of the clock.
    other.player().assign({x:moto().x,y:moto().y,z:moto().z+1});await pause(100);
    await pause(1100);
    other.room.send('moto.mount',{motoId:spot.id});await until(()=>moto().riderId==='other');await until(()=>moto().engine===MOTO_ENGINE.ON);
    // The wait for the engine piled up steps the clock allows: spent at rest, so the first burst does not run all at once and leave a gap.
    let burstSeq=5000;
    for(let i=0;i<12;i++)other.room.send('moto.input',{seq:++burstSeq,throttle:0,steer:0,brake:false});
    await until(()=>other.player().lastProcessedInput===burstSeq);
    let burst:MotoBody={x:moto().x,y:moto().y,z:moto().z,yaw:moto().yaw,pitch:moto().pitch,speed:0,steer:0};
    for(let round=0;round<3;round++){
      for(let i=0;i<8;i++){const input={seq:++burstSeq,throttle:1,steer:0,brake:false};burst=stepMoto(burst,input,.05,[],motoHandling(moto()));other.room.send('moto.input',input);}
      await pause(450);
    }
    await until(()=>other.player().lastProcessedInput===burstSeq);
    assert.ok(Math.abs(moto().x-burst.x)<1e-3,`Room ${moto().x}, prediction ${burst.x}: every input ran`);
    // Far more than the clock allows in one go: the rest has to wait.
    const flood=burstSeq,from=Date.now();
    for(let i=0;i<12;i++)other.room.send('moto.input',{seq:++burstSeq,throttle:0,steer:0,brake:false});
    await until(()=>other.player().lastProcessedInput===burstSeq);
    assert.ok(Date.now()-from>=100||burstSeq-flood<=10,'No faster than real time');
    for(let i=0;i<60&&Math.abs(moto().speed)>.01;i++){other.room.send('moto.input',{seq:++burstSeq,throttle:0,steer:0,brake:true});await pause(55);}
    await pause(1100);
    other.room.send('player.interact',{objectId:'stand'});await until(()=>moto().riderId==='');
    // The connection dropping lets it go as well, and the rider stands beside the bike.
    rider.player().assign({x:moto().x,y:0,z:moto().z+1});await pause(100);
    rider.room.send('moto.mount',{motoId:spot.id});await until(()=>moto().riderId==='rider');
    rider.room.reconnection.enabled=false;
    (room.clients.getById(rider.room.sessionId)!.ref as unknown as {terminate():void}).terminate();
    await until(()=>moto().riderId==='',8000);
    assert.equal(rider.player().interactionState,'');
    assert.ok(Math.hypot(rider.player().x-moto().x,rider.player().z-moto().z)>.5);
    // Despawned with somebody on it: they stand beside where it was, told why, and nobody can get on it any more.
    await pause(1100);
    other.player().assign({x:moto().x,y:0,z:moto().z+1});await pause(100);
    other.room.send('moto.mount',{motoId:spot.id});await until(()=>moto()?.riderId==='other');
    const count=staff.snapshots.length;
    staff.room.send('admin.moto.despawn',{id:spot.id});await until(()=>room.state.motos.size===0);
    await until(()=>staff.snapshots.length>count&&staff.snapshots.at(-1)!.motos.length===0);
    assert.equal(other.player().interactionState,'');assert.equal(other.player().animationState,'idle');
    await until(()=>other.errors.some(e=>e.includes('recolheu')));
    await pause(1100);
    other.room.send('moto.mount',{motoId:spot.id});await until(()=>other.errors.some(e=>e.includes('não está aqui')));
    await pause(250);
    staff.room.send('admin.moto.despawn',{id:spot.id});await until(()=>staff.errors.some(e=>e.includes('já saiu')));
    // A crash: flat out into a parked car the rider is thrown on with the bike's speed, nothing they press counts while on the ground, the
    // bike falls, and the body gets up by itself near where it stopped. Slowly into the same car nothing happens.
    const car=MAP_COLLIDERS.find(c=>c.id==='COL_Ext_Carro_Prata')!;
    staff.player().assign({x:car.x-car.hx-2.5,y:0,z:car.z-3,rotation:Math.PI/2});
    staff.room.send('admin.moto.spawn',{});await until(()=>room.state.motos.size===1);
    const crashed=()=>[...room.state.motos.values()][0]!;
    await pause(1100);
    rider.room.reconnection.enabled=true;
    const driver=await join('driver');await until(()=>!!driver.player());
    driver.player().assign({x:crashed().x,y:crashed().y,z:crashed().z+1});await pause(100);
    driver.room.send('moto.mount',{motoId:crashed().id});await until(()=>crashed().riderId==='driver');
    const fromCar=car.x-car.hx-MOTO.HALF_LENGTH-.7;
    crashed().assign({x:fromCar,y:0,z:car.z,yaw:Math.PI/2,speed:2.2,steer:0});driver.player().assign({x:fromCar,y:0,z:car.z});
    let driveSeq=9000;const drive=(throttle:number)=>driver.room.send('moto.input',{seq:++driveSeq,throttle,steer:0,brake:false});
    for(let i=0;i<14;i++){drive(0);await pause(55);}
    assert.equal(driver.player().animationState,'ride','A slow knock leaves the rider on');
    assert.equal(crashed().riderId,'driver');assert.equal(crashed().phase,'');
    const hitAt=crashed().x;
    crashed().assign({x:fromCar-3,y:0,z:car.z,yaw:Math.PI/2,speed:14,steer:0});driver.player().assign({x:fromCar-3,y:0,z:car.z});
    for(let i=0;i<30&&driver.player().animationState==='ride';i++){drive(1);await pause(55);}
    assert.equal(driver.player().animationState,'ragdoll');assert.equal(driver.player().interactionState,'thrown');
    assert.equal(crashed().riderId,'','Nobody on the bike');
    assert.equal(crashed().phase,'tumble');
    const start=room.state.ragdolls.get('driver')!;
    assert.ok(start.seated&&start.vx>10,`Thrown as it was going: ${start.vx}`);
    assert.ok(start.closing>10);
    // The room runs the same body a browser would.
    const body=new Ragdoll({x:start.x,y:start.y,z:start.z,yaw:start.yaw,vx:start.vx,vz:start.vz,closing:start.closing,seated:start.seated,seed:start.seed});
    while(!body.asleep)body.advance(.05);
    const rest=body.rest();
    const thrownSeq=driver.player().lastProcessedInput;
    driver.room.send('player.input',{seq:thrownSeq+100,dx:1,dz:0,running:false,rotation:0});
    driver.room.send('player.interact',{objectId:'stand'});
    await until(()=>driver.player().animationState==='recover',12000);
    // Against the car the nearest place to stand can be well off where the body lies: measured over 400 seeds, up to 1.82 m.
    assert.ok(Math.hypot(driver.player().x-rest.x,driver.player().z-rest.z)<2,`Up where the body stopped: ${driver.player().x},${driver.player().z} and ${rest.x},${rest.z}`);
    assert.ok(driver.player().x<car.x-car.hx,'On the near side of the car: it never crossed it');
    assert.equal(driver.player().interactionState,'thrown','Still getting up');
    await until(()=>driver.player().interactionState==='',12000);
    assert.equal(driver.player().animationState,'idle');
    assert.equal(room.state.ragdolls.has('driver'),false);
    await until(()=>crashed().phase==='down',15000);
    assert.ok(hitAt<=car.x-car.hx);
    // Someone on foot in the way of a bike going fast: both go down.
    await pause(1100);
    staff.room.send('admin.moto.despawn',{});await until(()=>room.state.motos.size===0);
    await pause(250);
    staff.player().assign({x:40,y:0,z:7,rotation:Math.PI/2});
    staff.room.send('admin.moto.spawn',{});await until(()=>room.state.motos.size===1);
    const free=crashed();
    driver.player().assign({x:free.x,y:free.y,z:free.z+1});await pause(100);
    await pause(1100);
    driver.room.send('moto.mount',{motoId:free.id});await until(()=>free.riderId==='driver');
    free.assign({yaw:Math.PI/2,speed:10,steer:0});
    const walker=await join('walker');await until(()=>!!walker.player());
    walker.player().assign({x:free.x+3,y:free.y,z:free.z});
    for(let i=0;i<30&&walker.player().animationState!=='ragdoll';i++){drive(1);await pause(55);}
    assert.equal(walker.player().animationState,'ragdoll','The walker was hit');
    assert.equal(driver.player().animationState,'ragdoll','And the rider came off');
    assert.ok(room.state.ragdolls.get('walker')!.vx>5,'Sent the way the bike was going');
    assert.equal(free.phase,'loose','Glanced off, the bike goes on by itself');
    await until(()=>free.phase==='down',20000);
    await until(()=>walker.player().interactionState===''&&driver.player().interactionState==='',20000);
    staff.room.send('admin.moto.despawn',{});await until(()=>room.state.motos.size===0);
    await pause(250);
    // Every bike at once, and never more than the limit.
    staff.player().assign({x:spot.x+6,y:0,z:spot.z});
    for(let i=0;i<MOTO.LIMIT;i++){staff.room.send('admin.moto.spawn',{});await pause(210);}
    await until(()=>room.state.motos.size===MOTO.LIMIT,15000);
    assert.equal(new Set([...room.state.motos.keys()]).size,MOTO.LIMIT);
    staff.room.send('admin.moto.spawn',{});await until(()=>staff.errors.some(e=>e.includes(`já tem ${MOTO.LIMIT} motos`)));
    await pause(250);
    staff.room.send('admin.moto.despawn',{});await until(()=>room.state.motos.size===0);
  }finally{
    await Promise.allSettled(rooms.filter(r=>r.connection?.isOpen).map(r=>r.leave()));
    await server.gracefullyShutdown(false).catch(()=>{});api.close();
    if(previous===undefined)delete process.env.API_INTERNAL_URL;else process.env.API_INTERNAL_URL=previous;
  }
});
