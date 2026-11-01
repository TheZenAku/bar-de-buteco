import test from 'node:test';import assert from 'node:assert/strict';
import {createServer,request as httpRequest} from 'node:http';import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';import {WebSocketTransport} from '@colyseus/ws-transport';import {Client,type Room} from '@colyseus/sdk';
import {eq} from 'drizzle-orm';
import {GARAGE,GARAGES,MOTO_PARTS,NEW_MOTO_PARTS,PLATE,TRADE,readMotoParts,type GarageView,type InventoryView,type TradeClosed,type TradeInvite,type TradeView} from '@bar/shared';
import {signTicket} from '@bar/shared/tickets';
import {BarRoom} from '../src/BarRoom.js';
import {createApi} from '../../api/src/app.js';import {readConfig} from '../../api/src/config.js';
import {itemInventory,playerVehicles,sessions,trades,wallets} from '../../api/src/database/schema.js';

async function until(check:()=>boolean|Promise<boolean>,ms=8000):Promise<void>{const deadline=Date.now()+ms;while(!await check()){if(Date.now()>deadline)throw new Error('Timed out');await new Promise(r=>setTimeout(r,20));}}
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
process.env.NODE_ENV='test';

/**
 * The real thing end to end: this API on a real (in-memory) database behind a proxy that can lose answers, and rooms over real WebSockets. `restart` throws the room
 * away and starts another, as a world that went down would.
 */
async function stack(t:{after(fn:()=>Promise<void>|void):void}){
  const config={...readConfig(),dataPath:'memory://',databaseUrl:undefined,autoVerifyEmail:true};
  const api=await createApi({config,rateLimit:false,migrate:true});
  await api.app.listen({port:0,host:'127.0.0.1'});
  const apiPort=(api.app.server.address() as AddressInfo).port;
  // Answers to trades/commit can be swallowed after the API did the work: the worst moment for a connection to fail.
  const faults={loseAnswers:0,commits:0};
  const proxy=createServer((req,res)=>{
    const lose=req.url?.endsWith('/trades/commit')&&faults.loseAnswers>0;
    if(req.url?.endsWith('/trades/commit'))faults.commits++;
    if(lose)faults.loseAnswers--;
    const forward=httpRequest({host:'127.0.0.1',port:apiPort,path:req.url,method:req.method,headers:req.headers},answer=>{
      if(lose){answer.resume();answer.on('end',()=>res.destroy());return;}
      res.writeHead(answer.statusCode??500,answer.headers);answer.pipe(res);
    });
    req.pipe(forward);
  });
  await new Promise<void>(r=>proxy.listen(0,'127.0.0.1',r));
  const previous=process.env.API_INTERNAL_URL;
  process.env.API_INTERNAL_URL=`http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
  let world:{server:Server;http:ReturnType<typeof createServer>;room:BarRoom;client:Client;rooms:Room[]};
  const boot=async()=>{
    const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});let room!:BarRoom;
    server.define('bar',BarRoom).on('create',created=>{room=created as BarRoom;});await server.listen(0,'127.0.0.1');
    world={server,http,get room(){return room;},client:new Client(`http://127.0.0.1:${(http.address() as AddressInfo).port}`),rooms:[]};
  };
  await boot();
  const halt=async()=>{for(const joined of world.rooms)await Promise.race([joined.leave().catch(()=>{}),pause(800)]);await world.server.gracefullyShutdown(false).catch(()=>{});world.http.close();};
  t.after(async()=>{await halt();proxy.close();await api.app.close();process.env.API_INTERNAL_URL=previous;});
  const account=async(username:string,coins:number)=>{
    const response=await api.app.inject({method:'POST',url:'/api/auth/register',payload:{username,email:`${username}@teste.test`,displayName:username,password:'SenhaBoaDeTeste2026!'}});
    assert.equal(response.statusCode,201,response.body);
    const cookie=`${response.cookies[0]!.name}=${response.cookies[0]!.value}`,userId=response.json().user.id as string;
    await api.app.inject({method:'GET',url:'/api/inventory',headers:{cookie}});
    await api.db.update(wallets).set({balance:coins}).where(eq(wallets.userId,userId));
    await api.db.delete(itemInventory).where(eq(itemInventory.userId,userId));
    const [session]=await api.db.select({id:sessions.id}).from(sessions).where(eq(sessions.userId,userId));
    return {username,cookie,userId,sessionId:session!.id};
  };
  type Who=Awaited<ReturnType<typeof account>>;
  const join=async(who:Who)=>{
    const joined=await world.client.joinOrCreate('bar',{ticket:signTicket({userId:who.userId,sessionId:who.sessionId,displayName:who.username,role:'user',color:'#aa8844'})});world.rooms.push(joined);
    const got={errors:[] as string[],garage:[] as GarageView[],invites:[] as TradeInvite[],trade:[] as TradeView[],closed:[] as TradeClosed[],notices:[] as string[],inventory:[] as Partial<InventoryView>[],wallet:[] as Array<{balance:number}>,locks:[] as Array<{locked:boolean}>};
    joined.onMessage('error',m=>got.errors.push(m.message));joined.onMessage('garage.state',m=>got.garage.push(m));joined.onMessage('trade.invite',m=>got.invites.push(m));
    joined.onMessage('trade.state',m=>got.trade.push(m));joined.onMessage('trade.closed',m=>got.closed.push(m));joined.onMessage('trade.notice',m=>got.notices.push(m.text));
    joined.onMessage('inventory.state',m=>got.inventory.push(m));joined.onMessage('wallet.state',m=>got.wallet.push(m));joined.onMessage('moto.locked',m=>got.locks.push(m));
    for(const type of ['chat.message','job.state','prices','food.state','food.owned','garage.taken','trade.sent','trade.uninvite','moto.towed','food.notice','achievement.unlocked'])joined.onMessage(type,()=>{});
    await until(()=>!!world.room.state.players.get(who.userId));
    return {...who,room:joined,got,player:()=>world.room.state.players.get(who.userId)!,trade:()=>got.trade.at(-1)!};
  };
  const buy=async(who:Who)=>{const answer=await api.app.inject({method:'POST',url:'/api/vehicles/buy',headers:{cookie:who.cookie},payload:{requestId:crypto.randomUUID()}});assert.equal(answer.statusCode,200,answer.body);return answer.json().vehicles.at(-1) as {id:string;plate:string};};
  const row=async(id:string)=>(await api.db.select().from(playerVehicles).where(eq(playerVehicles.id,id)))[0];
  const coins=async(who:Who)=>(await api.db.select().from(wallets).where(eq(wallets.userId,who.userId)))[0]!.balance;
  const items=async(who:Who)=>Object.fromEntries((await api.db.select().from(itemInventory).where(eq(itemInventory.userId,who.userId))).map(each=>[each.itemId,each.quantity]));
  const give=async(who:Who,itemId:string,quantity:number)=>{await api.db.insert(itemInventory).values({userId:who.userId,itemId,quantity});};
  return {api,faults,get room(){return world.room;},account,join,buy,row,coins,items,give,restart:async()=>{await halt();await boot();}};
}
const at=async(who:{player():{assign(v:object):unknown}},x:number,y:number,z:number)=>{who.player().assign({x,y,z});await pause(120);};
const beside=(other:{x:number;y:number;z:number},gap=1.5)=>[other.x+gap,other.y,other.z] as const;
const near=(who:{player():{assign(v:object):unknown}},other:{x:number;y:number;z:number})=>at(who,...beside(other));

test('the garage: lists, takes out, plates and locks, keeps what broke across a world that goes down, and takes it back',{timeout:180_000},async t=>{
  const s=await stack(t),ana=await s.account('ana_garagem',25_000),bob=await s.account('bob_garagem',0);
  const first=await s.buy(ana);
  assert.ok(PLATE.test(first.plate));
  let a=await s.join(ana),b=await s.join(bob);
  // Bought is in the garage: nothing on the map until someone takes it out, and no free ride to the base any more.
  assert.equal(s.room.state.motos.size,0);
  const [garage,other]=[GARAGES[0],GARAGES[1]];
  assert.deepEqual([garage.x,garage.z,other.x,other.z],[-13.25,-8.3,-13.16,-2.93]);
  // From afar neither the panel nor the bike.
  await at(a,garage.x+6,garage.y,garage.z);
  a.room.send('player.interact',{objectId:garage.id});await until(()=>a.got.errors.some(e=>e.includes('mais perto')));
  a.room.send('garage.take',{garageId:garage.id,vehicleId:first.id});await until(()=>a.got.errors.some(e=>e.includes('Vá até a garagem')));
  // On the ring: the list.
  await at(a,garage.x,garage.y,garage.z);
  a.room.send('player.interact',{objectId:garage.id});await until(()=>a.got.garage.length>0);
  assert.equal(a.got.garage.at(-1)!.vehicles.length,1);assert.equal(a.got.garage.at(-1)!.vehicles[0]!.out,false);assert.equal(a.got.garage.at(-1)!.vehicles[0]!.plate,first.plate);
  // Somebody else's key is not in anyone's list.
  await at(b,garage.x+.5,garage.y,garage.z);
  b.room.send('garage.take',{garageId:garage.id,vehicleId:first.id});await until(()=>b.got.errors.some(e=>e.includes('chave')));
  assert.equal(s.room.state.motos.size,0);
  // Out, locked, plated and in its owner's name, on the street by the garage. Both garages work.
  a.room.send('garage.take',{garageId:garage.id,vehicleId:first.id});await until(()=>s.room.state.motos.size===1);
  const moto=()=>[...s.room.state.motos.values()][0]!;
  assert.equal(moto().plate,first.plate);assert.equal(moto().ownerId,ana.userId);assert.equal(moto().ownerName,ana.username);assert.equal(moto().locked,true);
  assert.ok(Math.hypot(moto().x-garage.x,moto().z-garage.z)<12,`At ${moto().x},${moto().z}`);
  // On the road in front of the ring, pointing away from the wall behind it, with room to ride off.
  assert.ok(moto().x>garage.x,`At ${moto().x}`);assert.ok(Math.sin(moto().yaw)>.5,`Yaw ${moto().yaw}`);
  // Off the rings, so E beside it gets on it rather than opening the garage.
  for(const each of GARAGES)assert.ok(Math.hypot(moto().x-each.x,moto().z-each.z)>GARAGE.REACH+1.5,`Too close to ${each.id}: ${moto().x},${moto().z}`);
  // One out at a time.
  const second=await s.buy(ana);
  await until(()=>true);
  a.room.send('inventory.sync',{});await pause(300);
  a.room.send('garage.take',{garageId:garage.id,vehicleId:second.id});await until(()=>a.got.errors.some(e=>e.includes('já está na rua')));
  // Locked: only the key gets on. Unlocked: anyone rides, and it stays hers. Only the key holder can touch the lock.
  await near(b,moto());
  await pause(1100);b.room.send('moto.mount',{motoId:moto().id});await until(()=>b.got.errors.some(e=>e.includes('trancada')&&e.includes(first.plate)));
  assert.equal(moto().riderId,'');
  b.room.send('moto.lock',{locked:false});await until(()=>b.got.errors.some(e=>e.includes('não está na rua')));assert.equal(moto().locked,true);
  a.room.send('moto.lock',{locked:false});await until(()=>a.got.locks.at(-1)?.locked===false);assert.equal(moto().locked,false);
  await at(b,moto().x+Math.cos(moto().yaw)*1.1,moto().y,moto().z-Math.sin(moto().yaw)*1.1);
  await pause(1100);b.room.send('moto.mount',{motoId:moto().id});await until(()=>moto().riderId===bob.userId);
  // From too far the button does nothing. Close, it locks again, with the borrower still on: no one is thrown off.
  a.room.send('moto.lock',{locked:true});await until(()=>a.got.locks.at(-1)?.locked===true);
  assert.equal(moto().riderId,bob.userId);assert.equal(moto().ownerId,ana.userId);
  b.room.send('player.interact',{objectId:'stand'});await until(()=>moto().riderId==='');
  // A broken headlight is written down within moments.
  const parts=readMotoParts(NEW_MOTO_PARTS),broken=MOTO_PARTS.map(part=>part.id==='farol'?0:parts[part.id]).join(',');
  a.room.send('test.moto.parts',{parts:broken});
  await until(async()=>(await s.row(first.id))!.parts===broken,3000);
  // The world goes down without a goodbye, taking the bike off the map.
  await s.restart();
  a=await s.join(ana);b=await s.join(bob);
  assert.equal(s.room.state.motos.size,0);
  await at(a,other.x,other.y,other.z);
  a.room.send('player.interact',{objectId:other.id});await until(()=>a.got.garage.length>0);
  const listed=a.got.garage.at(-1)!.vehicles.find(each=>each.id===first.id)!;
  assert.equal(listed.parts,broken,'Still broken after the restart');assert.equal(listed.out,false);assert.equal(a.got.garage.at(-1)!.vehicles.length,2);
  a.room.send('garage.take',{garageId:other.id,vehicleId:first.id});await until(()=>s.room.state.motos.size===1);
  assert.equal(moto().parts,broken,'And out on the street as it was');assert.equal(readMotoParts(moto().parts).farol,0);
  // Back in, for free, from close by: off the map, and the list says so.
  await at(a,other.x,other.y,other.z);
  a.room.send('garage.store',{garageId:other.id,recall:false});await until(()=>s.room.state.motos.size===0);
  assert.equal(await s.coins(ana),5000);
  await until(()=>a.got.garage.at(-1)!.vehicles.every(each=>!each.out));
  // From across the city: refused unless the tow truck is asked for, and then it costs what the tow costs.
  a.room.send('garage.take',{garageId:other.id,vehicleId:first.id});await until(()=>s.room.state.motos.size===1);
  moto().assign({x:other.x+GARAGE.STORE_REACH+30,z:other.z});
  a.room.send('garage.store',{garageId:other.id,recall:false});await until(()=>a.got.errors.some(e=>e.includes('longe')));
  assert.equal(s.room.state.motos.size,1);assert.equal(await s.coins(ana),5000);
  a.room.send('garage.store',{garageId:other.id,recall:true});await until(()=>s.room.state.motos.size===0);
  await until(async()=>await s.coins(ana)===4970);
});

test('a trade over real sockets: asked for and answered, changes take back the agreement, nothing moves before both confirm, and it happens once',{timeout:180_000},async t=>{
  const s=await stack(t),ana=await s.account('ana_troca',20_000),bob=await s.account('bob_troca',500),eve=await s.account('eve_troca',0);
  await s.give(bob,'curativo',3);
  const moto=await s.buy(ana);
  const a=await s.join(ana),b=await s.join(bob),c=await s.join(eve);
  await at(a,0,.3,0);await at(b,0,.3,20);
  // Too far to ask.
  a.room.send('trade.request',{playerId:bob.userId});await until(()=>a.got.errors.some(e=>e.includes('mais perto')));
  await at(b,1,.3,0);await at(c,1.5,.3,1);
  // Refused: nothing opens, and asking again right away is held off.
  a.room.send('trade.request',{playerId:bob.userId});await until(()=>b.got.invites.length===1);
  b.room.send('trade.respond',{inviteId:b.got.invites[0]!.id,accept:false});await until(()=>a.got.notices.some(text=>text.includes('recusou')));
  assert.equal(a.got.trade.length,0);
  a.room.send('trade.request',{playerId:bob.userId});await until(()=>a.got.errors.some(e=>e.includes('recusar')));
  // Someone else's invitation cannot be answered by a third person, and the same person is not asked twice at once.
  b.room.send('trade.request',{playerId:ana.userId});await until(()=>a.got.invites.length===1);
  c.room.send('trade.respond',{inviteId:a.got.invites[0]!.id,accept:true});await until(()=>c.got.errors.some(e=>e.includes('convite')));
  c.room.send('trade.request',{playerId:ana.userId});await until(()=>c.got.errors.some(e=>e.includes('outra negociação')));
  a.room.send('trade.respond',{inviteId:a.got.invites[0]!.id,accept:true});await until(()=>a.got.trade.length>0&&b.got.trade.length>0);
  const id=a.trade().id;
  // An offer beyond what one has never reaches the table; a third person cannot touch it.
  a.room.send('trade.offer',{tradeId:id,offer:{coins:30_000,items:[],vehicles:[]}});await until(()=>a.got.errors.some(e=>e.includes('moedas')));
  b.room.send('trade.offer',{tradeId:id,offer:{coins:0,items:[{itemId:'curativo',quantity:4}],vehicles:[]}});await until(()=>b.got.errors.some(e=>e.includes('Curativo')));
  a.room.send('trade.offer',{tradeId:id,offer:{coins:0,items:[],vehicles:[crypto.randomUUID()]}});await until(()=>a.got.errors.some(e=>e.includes('chave')));
  c.room.send('trade.offer',{tradeId:id,offer:{coins:0,items:[],vehicles:[]}});await until(()=>c.got.errors.some(e=>e.includes('terminou')));
  // Malformed never gets as far as the desk.
  const invalid=a.got.errors.length;a.room.send('trade.offer',{tradeId:id,offer:{coins:-1,items:[],vehicles:[]}});await until(()=>a.got.errors.length>invalid);
  // The real offers.
  a.room.send('trade.offer',{tradeId:id,offer:{coins:0,items:[],vehicles:[moto.id]}});await until(()=>b.trade().them.vehicles.length===1);
  assert.equal(b.trade().them.vehicles[0]!.plate,moto.plate);
  b.room.send('trade.offer',{tradeId:id,offer:{coins:500,items:[{itemId:'curativo',quantity:3}],vehicles:[]}});await until(()=>a.trade().them.offer.coins===500);
  // Empty handed agreements and old versions do not count. The swindle: Bob agrees, Ana takes the key off the table at the last moment, and Bob's agreement goes with it.
  const seen=a.trade().version;
  b.room.send('trade.ready',{tradeId:id,version:seen,ready:true});await until(()=>a.trade().them.ready);
  a.room.send('trade.offer',{tradeId:id,offer:{coins:0,items:[],vehicles:[]}});await until(()=>a.trade().me.offer.vehicles.length===0);
  await until(()=>!b.trade().me.ready);assert.ok(b.trade().version>seen);
  // Ana's quick yes to the version Bob agreed to is refused: the table is not what it was.
  a.room.send('trade.ready',{tradeId:id,version:seen,ready:true});await until(()=>a.got.errors.some(e=>e.includes('mudou')));
  assert.equal(a.trade().stage,'offer');
  a.room.send('trade.offer',{tradeId:id,offer:{coins:0,items:[],vehicles:[moto.id]}});await until(()=>b.trade().them.vehicles.length===1);
  const version=a.trade().version;
  a.room.send('trade.ready',{tradeId:id,version,ready:true});b.room.send('trade.ready',{tradeId:id,version,ready:true});
  await until(()=>a.trade().stage==='review'&&b.trade().stage==='review');
  // Frozen now: changing means going back. And nobody confirms before having had the time to read.
  a.room.send('trade.offer',{tradeId:id,offer:{coins:0,items:[],vehicles:[]}});await until(()=>a.got.errors.some(e=>e.includes('Volte')));
  a.room.send('trade.confirm',{tradeId:id,version});await until(()=>a.got.errors.some(e=>e.includes('Confira a troca')));
  a.room.send('trade.confirm',{tradeId:id,version:version-1});await until(()=>a.got.errors.some(e=>e.includes('mudou')));
  await pause(TRADE.REVIEW_MS+100);
  // One yes moves nothing.
  a.room.send('trade.confirm',{tradeId:id,version});await until(()=>a.trade().me.confirmed);
  assert.equal(await s.coins(bob),500);assert.equal((await s.row(moto.id))!.userId,ana.userId);
  // The second: done, and everything is where it should be. The answer is lost on the way back twice: it is asked again with the same id, and still happens once.
  s.faults.loseAnswers=2;const before=s.faults.commits;
  b.room.send('trade.confirm',{tradeId:id,version});b.room.send('trade.confirm',{tradeId:id,version});
  await until(()=>a.got.closed.length>0&&b.got.closed.length>0,30_000);
  assert.ok(s.faults.commits-before>=3,`${s.faults.commits-before} calls`);
  assert.equal(a.got.closed.at(-1)!.status,'done');assert.equal(b.got.closed.at(-1)!.status,'done');
  assert.equal(await s.coins(ana),10_500);assert.equal(await s.coins(bob),0);
  assert.deepEqual(await s.items(ana),{curativo:3});assert.deepEqual(await s.items(bob),{});
  assert.equal((await s.row(moto.id))!.userId,bob.userId);
  assert.equal((await s.api.db.select().from(trades).where(eq(trades.id,id))).length,1);
  // Both are told, and both rooms' copies agree: the new owner can take it out, the old one cannot.
  await until(()=>(b.got.inventory.at(-1)?.keys??[]).some(key=>key.vehicleId===moto.id));
  await until(()=>(a.got.inventory.at(-1)?.keys??[]).length===0);
  const garage=GARAGES[0];
  await at(a,garage.x,garage.y,garage.z);await pause(1200);
  a.room.send('garage.take',{garageId:garage.id,vehicleId:moto.id});await until(()=>a.got.errors.some(e=>e.includes('chave')));
  await at(b,garage.x,garage.y,garage.z);
  b.room.send('garage.take',{garageId:garage.id,vehicleId:moto.id});await until(()=>s.room.state.motos.size===1);
  assert.equal([...s.room.state.motos.values()][0]!.ownerId,bob.userId);assert.equal([...s.room.state.motos.values()][0]!.plate,moto.plate);
  // Sold with it out on the street: off the map, to the garage, and the new owner gets it as it was.
  const worn=MOTO_PARTS.map(part=>part.id==='lanterna'?12:100).join(',');
  b.room.send('test.moto.parts',{parts:worn});await until(async()=>(await s.row(moto.id))!.parts===worn,3000);
  b.room.send('trade.request',{playerId:ana.userId});await at(a,garage.x+1,garage.y,garage.z);
  await pause(200);
  b.room.send('trade.request',{playerId:ana.userId});await until(()=>a.got.invites.length===2);
  a.room.send('trade.respond',{inviteId:a.got.invites[1]!.id,accept:true});await until(()=>a.trade().id!==id);
  const again=a.trade().id;
  b.room.send('trade.offer',{tradeId:again,offer:{coins:0,items:[],vehicles:[moto.id]}});await until(()=>a.trade().them.vehicles.length===1);
  const v2=a.trade().version;
  a.room.send('trade.ready',{tradeId:again,version:v2,ready:true});b.room.send('trade.ready',{tradeId:again,version:v2,ready:true});await until(()=>a.trade().stage==='review');
  await pause(TRADE.REVIEW_MS+100);
  a.room.send('trade.confirm',{tradeId:again,version:v2});b.room.send('trade.confirm',{tradeId:again,version:v2});
  await until(()=>a.got.closed.at(-1)?.id===again&&b.got.closed.at(-1)?.id===again,15_000);
  assert.equal(a.got.closed.at(-1)!.status,'done');assert.equal(s.room.state.motos.size,0);
  const back=await s.row(moto.id);assert.equal(back!.userId,ana.userId);assert.equal(back!.parts,worn);
  await until(()=>(a.got.inventory.at(-1)?.keys??[]).some(key=>key.vehicleId===moto.id));
});

test('a trade falls through with nothing moved: walking off, dropping out, passing out, and what was spent while it was on the table',{timeout:180_000},async t=>{
  const s=await stack(t),ana=await s.account('ana_queda',1000),bob=await s.account('bob_queda',1000);
  await s.give(ana,'cafe',1);
  const a=await s.join(ana),b=await s.join(bob);
  const open=async()=>{
    await at(a,0,.3,0);await at(b,1,.3,0);await pause(TRADE.REFUSED_MS>0?0:0);
    const invites=b.got.invites.length,trades=a.got.trade.length;
    a.room.send('trade.request',{playerId:bob.userId});await until(()=>b.got.invites.length>invites);
    b.room.send('trade.respond',{inviteId:b.got.invites.at(-1)!.id,accept:true});await until(()=>a.got.trade.length>trades);
    return a.trade().id;
  };
  const closed=async(pattern:RegExp)=>{await until(()=>pattern.test(a.got.closed.at(-1)?.message??'')&&pattern.test(b.got.closed.at(-1)?.message??''));assert.equal(a.got.closed.at(-1)!.status,'cancelled');};
  // Walking away.
  await open();await at(b,1,.3,TRADE.LEAVE_REACH+3);await closed(/afastaram/);
  // Cancelling.
  await open();const cancelled=a.trade().id;a.room.send('trade.cancel',{tradeId:cancelled});await closed(/cancelou/);
  // Out cold.
  await open();const needs=(s.room as unknown as {needs:{state(id:string):{condition:string;conditionUntil:number}}}).needs.state(ana.userId);needs.condition='fainted';needs.conditionUntil=Date.now()+60_000;await closed(/sentidos/);needs.condition='normal';needs.conditionUntil=0;await pause(1500);
  // Thrown off their feet.
  await open();a.player().assign({interactionState:'thrown'});await closed(/chão/);a.player().assign({interactionState:''});
  assert.equal(await s.coins(ana),1000);assert.equal(await s.coins(bob),1000);
  // Spent while on the table: the offer was fine when it was made, and the API says no at the end. Everybody is told, nothing moves.
  const id=await open();
  a.room.send('trade.offer',{tradeId:id,offer:{coins:1000,items:[{itemId:'cafe',quantity:1}],vehicles:[]}});await until(()=>b.trade().them.offer.coins===1000);
  const version=a.trade().version;
  a.room.send('trade.ready',{tradeId:id,version,ready:true});b.room.send('trade.ready',{tradeId:id,version,ready:true});await until(()=>a.trade().stage==='review');
  await s.api.db.update(wallets).set({balance:400}).where(eq(wallets.userId,ana.userId));
  await pause(TRADE.REVIEW_MS+100);
  a.room.send('trade.confirm',{tradeId:id,version});b.room.send('trade.confirm',{tradeId:id,version});
  await until(()=>a.got.closed.at(-1)?.id===id&&b.got.closed.at(-1)?.id===id,15_000);
  assert.equal(a.got.closed.at(-1)!.status,'failed');assert.match(a.got.closed.at(-1)!.message,/nada mudou/);
  assert.equal(await s.coins(ana),400);assert.equal(await s.coins(bob),1000);assert.deepEqual(await s.items(ana),{cafe:1});assert.deepEqual(await s.items(bob),{});
  assert.equal((await s.api.db.select().from(trades)).length,0);
  // The room reads the real numbers again.
  await until(()=>a.got.wallet.at(-1)?.balance===400);
  // Dropping out: gone from the room, the other is told and the window closes.
  await s.api.db.update(wallets).set({balance:1000}).where(eq(wallets.userId,ana.userId));
  const leaving=await open();assert.ok(leaving);
  await a.room.leave();
  await until(()=>/saiu|caiu/.test(b.got.closed.at(-1)?.message??''));assert.equal(b.got.closed.at(-1)!.status,'cancelled');
});
