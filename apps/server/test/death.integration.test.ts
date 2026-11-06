import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {Client,type Room} from '@colyseus/sdk';
import {signTicket} from '@bar/shared/tickets';
import {DEATH,DEATH_GONE_STATE,DEATH_STATE,deathDurationMs,isWalkable,type DeathPlan,type DeathScreen} from '@bar/shared';
import {BarRoom} from '../src/BarRoom.js';
import type {Control} from '../src/internal.js';

const eventually=async(check:()=>boolean,what='condition')=>{const until=Date.now()+4000;while(!check()){if(Date.now()>until)throw new Error(`Timed out: ${what}`);await new Promise(resolve=>setTimeout(resolve,15));}};
test('death over real WebSockets: kill → scene to the ones near → dark → wrong press → new sequence → right press → respawn on walkable ground; every press is judged by the room',{timeout:40_000},async()=>{
  process.env.ACCESS_RECHECK_MS='0';
  const previous=process.env.API_INTERNAL_URL,queued:Control[]=[],rooms:Room[]=[];
  let authority:BarRoom|undefined;
  const api=createServer(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk;res.setHeader('content-type','application/json');
    if(req.url==='/api/internal/validate')res.end(JSON.stringify({valid:true,role:'user',blocked:[],equippedSkin:'nathan',ownedSkins:['nathan']}));
    else if(req.url==='/api/internal/controls/lease')res.end(JSON.stringify({controls:queued.splice(0)}));
    else if(req.url==='/api/internal/controls/ack')res.end('{"applied":0,"failed":0}');
    else res.end('{"ok":true}');
  });
  await new Promise<void>(resolve=>api.listen(0,'127.0.0.1',resolve));
  process.env.API_INTERNAL_URL=`http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});
  server.define('bar',BarRoom).on('create',room=>{authority=room as BarRoom;});await server.listen(0,'127.0.0.1');
  const browser=new Client(`http://127.0.0.1:${(http.address() as AddressInfo).port}`);
  const heard=new Map<string,{scenes:DeathPlan[];screens:DeathScreen[];errors:string[]}>();
  const join=async(userId:string)=>{
    const log={scenes:[] as DeathPlan[],screens:[] as DeathScreen[],errors:[] as string[]};heard.set(userId,log);
    const room=await browser.joinOrCreate('bar',{ticket:signTicket({userId,sessionId:`s-${userId}`,displayName:userId==='victim'?'Zeca':'Vizinho',role:'user',color:'#abcdee'})});
    rooms.push(room);room.onMessage('error',(m:{message:string})=>log.errors.push(m.message));room.onMessage('chat.message',()=>{});
    room.onMessage('death.scene',(plan:DeathPlan)=>log.scenes.push(plan));room.onMessage('death.screen',(screen:DeathScreen)=>log.screens.push(screen));
    await eventually(()=>!!room.state?.players?.get(userId)?.connected,'joined');return room;
  };
  const maintain=()=>(authority as any).maintenance() as Promise<void>;
  const screenOf=(user:string,phase:DeathScreen['phase'])=>[...heard.get(user)!.screens].reverse().find(s=>s.phase===phase) as any;
  try{
    const victimRoom=await join('victim'),neighbour=await join('neighbour');
    const body=()=>authority!.state.players.get('victim')!;
    const spawn={x:body().x,z:body().z};
    // The room's clock is Date; the test moves it, instead of waiting for twenty-four real seconds of scene.
    mock.timers.enable({apis:['Date'],now:Date.now()});
    queued.push({id:'kill-1',action:'kill',playerId:'victim',issuedAt:Date.now()});await maintain();
    await eventually(()=>heard.get('victim')!.scenes.length>0,'scene to the victim');
    await eventually(()=>heard.get('neighbour')!.scenes.length>0,'scene to the one standing near');
    assert.equal(heard.get('neighbour')!.scenes[0]!.victim,'victim');
    assert.equal(body().interactionState,DEATH_STATE,'still and out of everything');
    assert.equal(body().animationState,'ragdoll','death immediately releases the body into physics');
    const ragdoll=authority!.state.ragdolls.get('victim')!;
    assert.ok(ragdoll,'the room publishes the death ragdoll');
    assert.equal(ragdoll.startedAt,body().animationStartedAt);
    await eventually(()=>!!neighbour.state.ragdolls.get('victim'),'the neighbour receives the same ragdoll');
    assert.equal(neighbour.state.ragdolls.get('victim').seed,ragdoll.seed);
    // Even after physics settles, death must never take the crash's automatic get-up path.
    for(let i=0;i<180;i++)(authority as any).stepThrown(Date.now());
    assert.equal((authority as any).thrown.get('victim').sim.asleep,true);
    assert.equal(body().interactionState,DEATH_STATE);
    assert.equal(body().animationState,'ragdoll');
    assert.equal(authority!.state.ragdolls.get('victim'),ragdoll);
    assert.equal(body().hp,0,'the kill takes the ring');assert.equal(body().hpCore,0,'and the heart');
    // A second order while dying does nothing (no second scene).
    queued.push({id:'kill-2',action:'kill',playerId:'victim',issuedAt:Date.now()});await maintain();
    const plan=heard.get('victim')!.scenes[0]!;assert.equal(heard.get('victim')!.scenes.length,1);
    // The dead do nothing but press: an emote is refused, the body does not move.
    victimRoom.send('player.emote',{emote:'dance'});await new Promise(resolve=>setTimeout(resolve,80));
    assert.equal(body().interactionState,DEATH_STATE);assert.notEqual(body().animationState,'dance');
    // Its inputs go unanswered otherwise: a client with 12 waiting sends no more, and would stand frozen after coming back.
    for(let seq=1;seq<=20;seq++)victimRoom.send('player.input',{seq,dx:0,dz:0,running:false,rotation:0});
    await eventually(()=>body().lastProcessedInput===20,'the dead are answered, so the client queue drains');
    // Only the victim gets the dark and the buttons.
    mock.timers.tick(deathDurationMs(plan)-1000);await new Promise(resolve=>setTimeout(resolve,100));
    await eventually(()=>body().interactionState===DEATH_GONE_STATE,'the body is taken by the cloud');
    assert.equal(authority!.state.ragdolls.has('victim'),false,'the taken body no longer runs physics');
    assert.equal((authority as any).thrown.has('victim'),false);
    assert.equal(heard.get('victim')!.screens.length,0,'no dark before the scene ends');
    mock.timers.tick(1000);
    await eventually(()=>!!screenOf('victim','blackout'),'blackout');
    assert.equal(heard.get('neighbour')!.screens.length,0,'the neighbour sees the scene, not the dark');
    const dark=screenOf('victim','blackout');assert.equal(typeof dark.phrase,'string');assert.ok(dark.phrase.length>10);assert.equal(dark.until-Date.now(),DEATH.blackoutMs);
    mock.timers.tick(DEATH.blackoutMs);
    await eventually(()=>!!screenOf('victim','play'),'sequence');
    const first=screenOf('victim','play');assert.equal(first.sequence.length,4);
    // Early presses (the sequence is still being shown) are not judged.
    victimRoom.send('death.input',{button:(first.sequence[0]+1)%4});await new Promise(resolve=>setTimeout(resolve,80));assert.equal(screenOf('victim','error'),undefined);
    mock.timers.tick(first.inputFrom-Date.now()+5);
    // The client reports a button; the room decides. A wrong one: the red phrase, 2 s, then another sequence.
    victimRoom.send('death.input',{button:(first.sequence[0]+1)%4});
    await eventually(()=>!!screenOf('victim','error'),'error');
    assert.equal(screenOf('victim','error').until-Date.now(),DEATH.errorHoldMs);
    victimRoom.send('death.input',{button:first.sequence[0]});await new Promise(resolve=>setTimeout(resolve,80));
    assert.equal(heard.get('victim')!.screens.filter(s=>s.phase==='press').length,0,'nothing counts while the red phrase is up');
    const plays=()=>heard.get('victim')!.screens.filter(s=>s.phase==='play').length;
    mock.timers.tick(DEATH.errorHoldMs);await eventually(()=>plays()===2,'a new sequence');
    const second=screenOf('victim','play');assert.equal(second.sequence.length,4);
    assert.equal(body().interactionState,DEATH_GONE_STATE,'not back until it is right');
    mock.timers.tick(second.inputFrom-Date.now()+5);
    for(const button of second.sequence as number[]){victimRoom.send('death.input',{button});await new Promise(resolve=>setTimeout(resolve,25));}
    await eventually(()=>!!screenOf('victim','won'),'won');
    await eventually(()=>body().interactionState==='','back on their feet');
    assert.ok(isWalkable(body().x,body().z,body().y),'respawn on walkable ground');
    assert.equal(body().animationState,'idle');
    assert.equal(authority!.state.ragdolls.has('victim'),false,'respawn has no leftover ragdoll');
    assert.equal(body().hp,35,'alive again, with the ring at the configured value');assert.equal(body().hpCore,0);
    assert.ok(Math.hypot(body().x-plan.ax,body().z-plan.az)>=1,'not where the Morte stood');
    void spawn;
    // Alive again: the room takes commands from the victim again, and a new death is possible.
    (authority as any).startThrown(body(),{x:body().x,y:body().y,z:body().z,yaw:body().rotation,vx:2,vz:0,closing:2,seated:false,seed:123});
    const crash=authority!.state.ragdolls.get('victim'),crashBody=(authority as any).thrown.get('victim');
    queued.push({id:'kill-3',action:'kill',playerId:'victim',issuedAt:Date.now()});await maintain();
    assert.equal(authority!.state.ragdolls.get('victim'),crash,'a fatal crash keeps the existing fall');
    assert.equal((authority as any).thrown.get('victim'),crashBody);
    assert.equal(body().animationState,'ragdoll');
    await eventually(()=>heard.get('victim')!.scenes.length===2,'a second death');
    // Leaving during a death ends it: back alive at the respawn point.
    await victimRoom.leave();
    await eventually(()=>(authority as any).deaths.isDead('victim')===false,'death ended on leaving');
    assert.equal(authority!.state.players.get('victim')!.interactionState,'');
    assert.equal(authority!.state.ragdolls.has('victim'),false,'leaving also clears the corpse');
  }finally{
    mock.timers.reset();
    await Promise.allSettled(rooms.filter(room=>room.connection?.isOpen).map(room=>room.leave()));await server.gracefullyShutdown(false);
    await new Promise<void>(resolve=>api.close(()=>resolve()));delete process.env.ACCESS_RECHECK_MS;if(previous===undefined)delete process.env.API_INTERNAL_URL;else process.env.API_INTERNAL_URL=previous;
  }
});
