import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {Client,type Room} from '@colyseus/sdk';
import {POOL_TABLES,TRUCO,newRack,type AchievementEvent} from '@bar/shared';
import {signTicket} from '@bar/shared/tickets';
import {BarRoom} from '../src/BarRoom.js';
import type {PoolTable} from '../src/minigames/pool.js';
import type {TrucoTable} from '../src/minigames/truco.js';

test('sinuca and truco count completed victories once, exclude losers, quitters and bots, and report them to the API',{timeout:60000},async()=>{
  const previous=process.env.API_INTERNAL_URL,reports:AchievementEvent[][]=[];
  const api=createServer(async(req,res)=>{
    let raw='';for await(const chunk of req)raw+=chunk;
    const body=raw?JSON.parse(raw):{};
    res.setHeader('content-type','application/json');
    if(req.url?.endsWith('/achievements')){reports.push(body.events);res.end('{"unlocked":[]}');}
    else if(req.url?.endsWith('/validate'))res.end(JSON.stringify({valid:true,blocked:[],role:'user',balance:10000,equippedSkin:'nathan',ownedSkins:['nathan']}));
    else if(req.url?.endsWith('/wallet'))res.end(JSON.stringify({balance:10000,applied:body.amount}));
    else if(req.url?.endsWith('/controls/lease'))res.end('{"controls":[]}');
    else res.end('{"ok":true}');
  });
  await new Promise<void>(resolve=>api.listen(0,'127.0.0.1',resolve));
  process.env.API_INTERNAL_URL=`http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});
  let room!:BarRoom;server.define('bar',BarRoom).on('create',created=>{room=created as BarRoom;});await server.listen(0,'127.0.0.1');
  const client=new Client(`http://127.0.0.1:${(http.address() as AddressInfo).port}`),clients:Room[]=[];
  try{
    for(const id of ['ana','bia','caio','duda','bot']){
      const connection=await client.joinOrCreate('bar',{ticket:signTicket({userId:id,sessionId:`session-${id}`,displayName:id,role:'user',color:'#aa8844',...(id==='bot'?{bot:true}:{})})});
      connection.onMessage('*',()=>{});clients.push(connection);
    }
    // Keep clocks under test control; all the real table hooks, bank and reporting remain connected.
    room.clock.clear();
    const runtime=room as unknown as {truco:TrucoTable;pool:Map<string,PoolTable>;flushAchievements():Promise<void>};
    const events=async()=>{
      const start=reports.length;await runtime.flushAchievements();
      return reports.slice(start).flat().filter(event=>event.series==='mestre-da-sinuca'||event.series==='rei-do-truco').sort((a,b)=>a.userId.localeCompare(b.userId));
    };
    const sit=(id:string,interaction:string)=>{room.state.players.get(id)!.interactionState=interaction;};
    const truco=runtime.truco;
    const joinTruco=(...ids:string[])=>{for(const id of ids){sit(id,'truco:truco-1');truco.join({id,name:id,color:'#aa8844'});}};
    const readyTruco=async()=>{for(const person of truco.people)await truco.ready(person.id,true,Date.now());};
    const endTruco=(score:[number,number])=>{
      const now=Date.now(),game=truco.game!;game.score=score;game.phase='hand-end';truco.tick(now);truco.tick(now+TRUCO.handEndMs+1);
    };
    const leaveTruco=()=>{for(const person of [...truco.people]){truco.leave(person.id);sit(person.id,'');}};

    joinTruco('ana','bia','caio','duda');await readyTruco();
    endTruco([1,0]);assert.deepEqual(await events(),[],'a hand is not a match');
    endTruco([12,2]);
    truco.refresh('ana');truco.tick(Date.now()+TRUCO.handEndMs+100);
    assert.deepEqual(await events(),[{userId:'ana',series:'rei-do-truco',amount:1},{userId:'bia',series:'rei-do-truco',amount:1}],'both winning partners, neither opposing player');
    assert.deepEqual(await events(),[],'the result is not counted again');
    truco.again('ana');await readyTruco();truco.leave('bia');sit('bia','');endTruco([12,2]);
    assert.deepEqual(await events(),[{userId:'ana',series:'rei-do-truco',amount:1}],'a partner who left cannot collect the victory');
    leaveTruco();joinTruco('bot');await readyTruco();endTruco([12,2]);
    assert.deepEqual(await events(),[],'a bot winning against NPCs earns nothing');leaveTruco();
    joinTruco('ana','bia');await readyTruco();leaveTruco();
    assert.deepEqual(await events(),[],'an abandoned match has no victory');

    const pool=runtime.pool.get(POOL_TABLES[0]!.id)!;
    const joinPool=(id:string)=>{sit(id,`pool:${pool.id}`);pool.join(id,id);};
    const readyPool=async()=>{for(const human of pool.humans)await pool.ready(human.playerId,true);};
    const finishPool=async(early=false)=>{
      // A straight shot on the last 8, with draw so the cue stays on the cloth. The real physics and judge decide.
      pool.phase='aim';pool.choice=null;pool.placing=false;pool.rack={...newRack(0),breaking:false,groups:['solids','stripes']};
      pool.balls=[{n:0,x:0,y:0},{n:8,x:0,y:.25},{n:early?1:9,x:.7,y:0}];
      const shooter=pool.seats[0]!.playerId;
      pool.shoot(shooter,{shot:pool.shot,angle:Math.PI/2,power:.28,spinX:0,spinY:-.5,elevation:0});
      pool.tick(pool.deadline+1);
      assert.equal(pool.phase,'finished');
      pool.tick(pool.deadline-1);
      assert.throws(()=>pool.shoot(shooter,{shot:pool.shot-1,angle:0,power:.5,spinX:0,spinY:0,elevation:0}));
    };
    joinPool('ana');joinPool('caio');await readyPool();await finishPool();
    assert.equal(pool.rack.winner,0);
    assert.deepEqual(await events(),[{userId:'ana',series:'mestre-da-sinuca',amount:1}],'only the winner of a played rack');
    assert.deepEqual(await events(),[]);
    pool.tick(pool.deadline+1);await readyPool();pool.leave('caio');sit('caio','');
    assert.deepEqual(await events(),[],'giving up does not farm the winner achievement');
    pool.leave('ana');sit('ana','');
    joinPool('ana');pool.cpu('ana',true);await readyPool();await finishPool();
    assert.deepEqual(await events(),[{userId:'ana',series:'mestre-da-sinuca',amount:1}],'beating Juca counts too');
    pool.tick(pool.deadline+1);await readyPool();await finishPool(true);
    assert.equal(pool.rack.winner,1,'an early 8 awards the rack to Juca');
    assert.deepEqual(await events(),[],'a CPU win gives no player an achievement');
    pool.leave('ana');sit('ana','');joinPool('bot');pool.cpu('bot',true);await readyPool();await finishPool();
    assert.deepEqual(await events(),[],'a development bot cannot earn a sinuca badge');
  }finally{
    await Promise.allSettled(clients.filter(client=>client.connection?.isOpen).map(client=>client.leave()));
    await server.gracefullyShutdown(false);await new Promise<void>(resolve=>api.close(()=>resolve()));
    if(previous===undefined)delete process.env.API_INTERNAL_URL;else process.env.API_INTERNAL_URL=previous;
  }
});
