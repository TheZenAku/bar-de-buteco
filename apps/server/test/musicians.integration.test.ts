import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';import {WebSocketTransport} from '@colyseus/ws-transport';import {Client,type Room} from '@colyseus/sdk';
import {INTERACTABLES,STAGE_SPOTS,canInteract,isWalkable,musicianPhase,onStage,phaseMs,stageSpot,type Position} from '@bar/shared';import {signTicket} from '@bar/shared/tickets';
import {BarRoom} from '../src/BarRoom.js';
async function until(check:()=>boolean,ms=8000):Promise<void>{const deadline=Date.now()+ms;while(!check()){if(Date.now()>deadline)throw new Error('Timed out');await new Promise(r=>setTimeout(r,25));}}
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
/** A free spot on the deck from which E reaches the musician's spot (the drums' own spot is inside the kit). */
function standingNear(spotId:string):Required<Position> {
  const spot=stageSpot(spotId)!,object=INTERACTABLES.find(i=>i.id===`palco-${spotId}`)!;
  for(let d=.5;d<=1.3;d+=.1)for(let a=0;a<360;a+=15){
    const p={x:spot.x+Math.sin(a*Math.PI/180)*d,y:spot.y,z:spot.z+Math.cos(a*Math.PI/180)*d};
    if(isWalkable(p.x,p.z,p.y)&&onStage(p)&&canInteract(object,p))return p;
  }
  throw new Error(`Nowhere to stand near ${spotId}`);
}
test('the stage musicians over real WebSockets: four spots, one player each, late joiners, stopping and dropped connections',{timeout:90000},async()=>{
  const previous={api:process.env.API_INTERNAL_URL,drop:process.env.MUSICIAN_DROP_MS};
  const api=createServer(async(req,res)=>{for await(const _ of req);res.setHeader('content-type','application/json');
    res.end(JSON.stringify(req.url?.endsWith('/validate')?{valid:true,blocked:[],role:'user',equippedSkin:'nathan',ownedSkins:['nathan'],balance:1000}:req.url?.endsWith('/controls')?{controls:[]}:{ok:true}));});
  await new Promise<void>(r=>api.listen(0,'127.0.0.1',r));process.env.API_INTERNAL_URL=`http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  process.env.MUSICIAN_DROP_MS='300';
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});let room!:BarRoom;
  server.define('bar',BarRoom).on('create',created=>{room=created as BarRoom;});await server.listen(0,'127.0.0.1');
  const client=new Client(`http://127.0.0.1:${(http.address() as AddressInfo).port}`),rooms:Room[]=[];
  const join=async(id:string)=>{
    const joined=await client.joinOrCreate('bar',{ticket:signTicket({userId:id,sessionId:`session-${id}`,displayName:id,role:'user',color:'#aa8844'})});rooms.push(joined);
    const errors:string[]=[];joined.onMessage('error',m=>errors.push(m.message));
    for(const type of ['chat.message','inventory.state','job.state','wallet.state'])joined.onMessage(type,()=>{});
    await until(()=>!!room?.state.players.get(id));
    return {id,room:joined,errors,player:()=>room.state.players.get(id)!};
  };
  try{
    const players=await Promise.all(STAGE_SPOTS.map(spot=>join(`musician-${spot.id}`)));
    const bia=await join('bia');
    // Each one walks up close to a spot (with a pass) and presses E: the room puts the avatar on the spot, facing its +Z.
    const started=Date.now();
    for(const [i,spot] of STAGE_SPOTS.entries()){
      const musician=players[i]!;musician.player().assign({...standingNear(spot.id),stageUntil:Date.now()+600_000});
      musician.room.send('player.interact',{objectId:`palco-${spot.id}`});
    }
    await until(()=>STAGE_SPOTS.every(spot=>room.state.musicians.get(spot.id)?.playerId===`musician-${spot.id}`));
    for(const spot of STAGE_SPOTS){
      const state=room.state.musicians.get(spot.id)!,player=room.state.players.get(state.playerId)!;
      assert.equal(state.phase,'entrando');assert.ok(state.startedAt>=started&&state.startedAt<=Date.now());
      assert.deepEqual([player.interactionState,player.animationState],[`stage-${spot.id}`,'stage']);
      assert.ok(Math.hypot(player.x-spot.x,player.z-spot.z)<1e-3&&Math.abs(player.y-spot.y)<1e-3,`${spot.id}: on the spot`);
      assert.ok(Math.abs(Math.atan2(Math.sin(player.rotation-spot.yaw*Math.PI/180),Math.cos(player.rotation-spot.yaw*Math.PI/180)))<1e-3,`${spot.id}: facing the spot's +Z`);
    }
    // Every browser sees who plays where and since when ({ lugar, jogadorId, fase, inicio }).
    await until(()=>bia.room.state.musicians?.get('violao')?.playerId==='musician-violao');
    assert.deepEqual(bia.room.state.musicians.get('bateria').toJSON(),room.state.musicians.get('bateria')!.toJSON());
    // Playing locks movement.
    const drummer=players[STAGE_SPOTS.findIndex(s=>s.id==='bateria')]!,before={x:drummer.player().x,z:drummer.player().z};
    for(let seq=0;seq<6;seq++){drummer.room.send('player.input',{seq,dx:1,dz:0,running:false,rotation:0});await pause(55);}
    await pause(150);assert.deepEqual({x:drummer.player().x,z:drummer.player().z},before,'the musician stays on the spot');
    // A second player cannot take a spot in use.
    bia.player().assign({...standingNear('violao'),stageUntil:Date.now()+600_000});bia.room.send('player.interact',{objectId:'palco-violao'});
    await until(()=>bia.errors.some(e=>e.includes('já tem músico')));
    assert.equal(room.state.musicians.get('violao')!.playerId,'musician-violao');assert.equal(bia.player().interactionState,'');
    // From the ground, or out of reach, nothing is taken.
    bia.player().assign({x:26.65,y:.3,z:-21});await pause(1100);bia.room.send('player.interact',{objectId:'palco-vocal'});
    await until(()=>bia.errors.some(e=>e.includes('Chegue mais perto')));
    // The take and start clips run into the loop by themselves.
    const loopAt=Math.max(...STAGE_SPOTS.map(spot=>room.state.musicians.get(spot.id)!.startedAt+phaseMs(spot,'entrando')+phaseMs(spot,'comecando')));
    await until(()=>STAGE_SPOTS.every(spot=>room.state.musicians.get(spot.id)!.phase==='loop'),loopAt-Date.now()+2000);
    // Someone arriving now sees the show already going: the loop, and how long it has been playing.
    const late=await join('late');
    await until(()=>late.room.state.musicians?.get('vocal')?.phase==='loop');
    for(const spot of STAGE_SPOTS){
      const seen=late.room.state.musicians.get(spot.id),now=Date.now(),current=musicianPhase(seen.toJSON(),now)!;
      assert.equal(current.phase,'loop');assert.ok(now-current.startedAt>=0&&now-current.startedAt<4000,`${spot.id}: the loop's start`);
    }
    // E again: the stop clip plays, then the spot is free and the player stands, free to move.
    for(const musician of players)musician.room.send('player.interact',{objectId:'stand'});
    await until(()=>STAGE_SPOTS.every(spot=>room.state.musicians.get(spot.id)!.phase==='saindo'));
    const freeAt=Math.max(...STAGE_SPOTS.map(spot=>room.state.musicians.get(spot.id)!.startedAt+phaseMs(spot,'saindo')));
    await until(()=>STAGE_SPOTS.every(spot=>!room.state.musicians.get(spot.id)!.playerId),freeAt-Date.now()+2000);
    assert.ok(Date.now()>=freeAt-60,'not before the stop clip ended');
    for(const musician of players){
      const player=musician.player();
      assert.deepEqual([player.interactionState,player.animationState],['','idle']);
      assert.ok(isWalkable(player.x,player.z,player.y)&&onStage(player),`${musician.id} stands on free floor of the stage`);
      assert.deepEqual(musician.errors,[]);
    }
    assert.ok(Math.hypot(drummer.player().x-stageSpot('bateria')!.x,drummer.player().z-stageSpot('bateria')!.z)>.3,'the drummer steps out of the kit');
    // A dropped connection: after MUSICIAN_DROP_MS the stop clip plays and the spot frees itself.
    const singer=players[STAGE_SPOTS.findIndex(s=>s.id==='vocal')]!;
    singer.player().assign(standingNear('vocal'));await pause(1100);singer.room.send('player.interact',{objectId:'palco-vocal'});
    await until(()=>room.state.musicians.get('vocal')!.playerId===singer.id);
    const vocal=stageSpot('vocal')!,loop=room.state.musicians.get('vocal')!.startedAt+phaseMs(vocal,'entrando')+phaseMs(vocal,'comecando');
    await until(()=>room.state.musicians.get('vocal')!.phase==='loop',loop-Date.now()+2000);
    singer.room.reconnection.enabled=false;
    (room.clients.find(c=>c.sessionId===singer.room.sessionId)!.ref as unknown as {terminate():void}).terminate();
    await until(()=>singer.player().connected===false);
    await until(()=>room.state.musicians.get('vocal')!.phase==='saindo',3000);
    await until(()=>!room.state.musicians.get('vocal')!.playerId,phaseMs(vocal,'saindo')+2000);
    assert.equal(singer.player().interactionState,'','the avatar left in the bar stands again');
  }finally{
    await Promise.allSettled(rooms.filter(r=>r.connection?.isOpen).map(r=>r.leave()));
    await server.gracefullyShutdown(false).catch(()=>{});api.close();
    for(const [key,value] of [['API_INTERNAL_URL',previous.api],['MUSICIAN_DROP_MS',previous.drop]] as const)if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
});
