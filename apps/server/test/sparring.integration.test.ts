import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';import {WebSocketTransport} from '@colyseus/ws-transport';import {Client,type Room} from '@colyseus/sdk';
import {SPARRING,SPARRING_FOE_PREFIX,TICK_MS,punchAim,type SparringDialog,type SparringResult,type SparringState} from '@bar/shared';import {signTicket} from '@bar/shared/tickets';
import {BarRoom} from '../src/BarRoom.js';
async function until(check:()=>boolean,ms=10000):Promise<void>{const deadline=Date.now()+ms;while(!check()){if(Date.now()>deadline)throw new Error('Timed out');await new Promise(r=>setTimeout(r,10));}}
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));

test("Zeca's sparring over real WebSockets: the talk, the count, a foe that hits the fight's life and never the real one, the win and its prize, and a fight given up",{timeout:120000},async()=>{
  const previous=process.env.API_INTERNAL_URL,asked:string[]=[];
  const api=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;res.setHeader('content-type','application/json');
    if(req.url?.endsWith('/validate')){res.end(JSON.stringify({valid:true,blocked:[],role:'user',equippedSkin:'nathan',ownedSkins:['nathan'],ownedSkills:[],balance:0,inventory:[]}));return;}
    if(req.url?.endsWith('/sparring/status')){asked.push('status');res.end(JSON.stringify({tier:0,cooldownMs:0,unlimited:false}));return;}
    if(req.url?.endsWith('/sparring/win')){asked.push(`win:${JSON.parse(raw).userId}`);res.end(JSON.stringify({tier:1,cooldownMs:21_600_000,unlimited:false,prize:100,balance:100,beaten:0}));return;}
    res.end('{}');});
  await new Promise<void>(r=>api.listen(0,'127.0.0.1',r));process.env.API_INTERNAL_URL=`http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});let room!:BarRoom;
  server.define('bar',BarRoom).on('create',created=>{room=created as BarRoom;});await server.listen(0,'127.0.0.1');
  const client=new Client(`http://127.0.0.1:${(http.address() as AddressInfo).port}`),rooms:Room[]=[];
  try{
    const joined=await client.joinOrCreate('bar',{ticket:signTicket({userId:'a',sessionId:'session-a',displayName:'a',role:'user',color:'#aa8844'})});rooms.push(joined);
    const dialogs:SparringDialog[]=[],states:SparringState[]=[],results:SparringResult[]=[],errors:string[]=[],messages:string[]=[];
    joined.onMessage('sparring.dialog',m=>dialogs.push(m));joined.onMessage('sparring.state',m=>states.push(m));joined.onMessage('sparring.result',m=>results.push(m));
    joined.onMessage('sparring.start',()=>messages.push('start'));joined.onMessage('error',m=>errors.push(m.message));
    for(const type of ['chat.message','inventory.state','job.state','wallet.state','prices','admin.world','death.scene','death.screen','player.kicked','fight.hit'])joined.onMessage(type,()=>{});
    await until(()=>!!room.state.players.get('a'));
    const me=()=>room.state.players.get('a')!;
    let seq=0,n=0;
    const input=(extra:Record<string,unknown>={})=>{joined.send('player.input',{seq:++seq,dx:0,dz:0,running:false,rotation:me().rotation,fight:true,...extra});};
    me().assign({x:SPARRING.spot.x,y:SPARRING.spot.y,z:SPARRING.spot.z+2.4,rotation:Math.PI,interactionState:'',animationState:'idle',currentTableId:''});
    assert.equal(room.state.npcs.has('sparring'),true,'Zeca is on the terrace');

    // The talk: he challenges; no word of difficulty.
    joined.send('sparring.talk',{});
    await until(()=>dialogs.length===1);
    assert.equal(dialogs[0]!.can,true);assert.doesNotMatch(dialogs[0]!.line,/fácil|médio|difícil|nível/i);

    // Accepting: the count, Zeca's body in the room, the idle one gone.
    joined.send('sparring.accept',{});
    await until(()=>messages.includes('start')&&states.length>0);
    assert.equal(states[0]!.phase,'countdown');
    const foe=room.state.players.get(SPARRING_FOE_PREFIX+'a')!;
    assert.ok(foe,'the foe is a body of the room');assert.equal(room.state.npcs.has('sparring'),false);
    assert.equal(errors.length,0,errors.join());
    // With the guard up through the count and the first blows: the fight's life goes down, the real one does not.
    const real=me().hp+me().hpCore;
    const stop=Date.now()+14_000;
    while(Date.now()<stop&&!(states.at(-1)?.you.hp!<states[0]!.you.max)){input();await pause(TICK_MS);}
    assert.equal(states.at(-1)!.phase,'fight');
    assert.ok(states.at(-1)!.you.hp<states[0]!.you.max,'the foe hit the fight\'s life');
    assert.equal(me().hp+me().hpCore,real,'the real life was never touched');

    // Winning: the foe nearly down, a jab ends it; the room asks the API for the prize once and tells the player.
    foe.hp=1;
    const win=Date.now()+15_000;
    while(Date.now()<win&&!results.length){
      const aim=punchAim(me().skin,'jab',me(),me().rotation,[{id:foe.id,x:foe.x,y:foe.y,z:foe.z,skin:foe.skin}]);
      input({punch:{m:'jab',n:++n&255,lunge:aim.lunge,seen:room.state.serverTime,ago:0},rotation:aim.yaw});
      for(let i=0;i<14&&!results.length;i++){await pause(TICK_MS);input({rotation:aim.yaw});}
    }
    await until(()=>results.length===1);
    assert.deepEqual([results[0]!.won,results[0]!.reason,results[0]!.prize,results[0]!.balance],[true,'ko',100,100]);
    assert.deepEqual(asked.filter(a=>a.startsWith('win')),['win:a'],'the prize was asked once');
    assert.equal(states.at(-1)!.phase,'won');
    // The foe lies down and steps off; Zeca is back.
    await until(()=>!room.state.players.has(SPARRING_FOE_PREFIX+'a')&&room.state.npcs.has('sparring'),SPARRING.afterMs+4000);

    // A second fight, given up: lost, nothing asked.
    results.length=0;states.length=0;messages.length=0;
    me().assign({x:SPARRING.spot.x,y:SPARRING.spot.y,z:SPARRING.spot.z+2.4,rotation:Math.PI,interactionState:''});
    joined.send('sparring.accept',{});
    await until(()=>messages.includes('start'));
    joined.send('sparring.quit',{});
    await until(()=>results.length===1);
    assert.deepEqual([results[0]!.won,results[0]!.reason,results[0]!.prize],[false,'left',0]);
    assert.equal(asked.filter(a=>a.startsWith('win')).length,1);
  }finally{
    for(const joined of rooms)await joined.leave().catch(()=>{});
    await server.gracefullyShutdown(false).catch(()=>{});api.close();
    if(previous===undefined)delete process.env.API_INTERNAL_URL;else process.env.API_INTERNAL_URL=previous;
  }
});
