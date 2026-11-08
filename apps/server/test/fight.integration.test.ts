import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';import {WebSocketTransport} from '@colyseus/ws-transport';import {Client,type Room} from '@colyseus/sdk';
import {FIGHT,FIGHT_MOVES,TICK_MS,fistPath,punchAim,type FightHit,type PunchId} from '@bar/shared';import {signTicket} from '@bar/shared/tickets';
import {BarRoom} from '../src/BarRoom.js';
async function until(check:()=>boolean,ms=8000):Promise<void>{const deadline=Date.now()+ms;while(!check()){if(Date.now()>deadline)throw new Error('Timed out');await new Promise(r=>setTimeout(r,10));}}
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));

test('the fist fight over real WebSockets: the guard, a jab that lands, the chain, a refusal, and a knockout that ends with the Morte',{timeout:120000},async()=>{
  const previous=process.env.API_INTERNAL_URL;
  const api=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;res.setHeader('content-type','application/json');
    if(req.url?.endsWith('/validate')){res.end(JSON.stringify({valid:true,blocked:[],role:'user',equippedSkin:'nathan',ownedSkins:['nathan'],ownedSkills:[],balance:0,inventory:[]}));return;}
    res.end('{}');});
  await new Promise<void>(r=>api.listen(0,'127.0.0.1',r));process.env.API_INTERNAL_URL=`http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});let room!:BarRoom;
  server.define('bar',BarRoom).on('create',created=>{room=created as BarRoom;});await server.listen(0,'127.0.0.1');
  const client=new Client(`http://127.0.0.1:${(http.address() as AddressInfo).port}`),rooms:Room[]=[];
  const join=async(id:string)=>{
    const joined=await client.joinOrCreate('bar',{ticket:signTicket({userId:id,sessionId:`session-${id}`,displayName:id,role:'user',color:'#aa8844'})});rooms.push(joined);
    const errors:string[]=[],hits:FightHit[]=[];joined.onMessage('error',m=>errors.push(m.message));joined.onMessage('fight.hit',m=>hits.push(m));
    for(const type of ['chat.message','inventory.state','job.state','wallet.state','prices','admin.world','death.scene','death.screen','player.kicked'])joined.onMessage(type,()=>{});
    await until(()=>!!room.state.players.get(id));
    let seq=0;
    /** One input, as the browser sends them in the guard: every tick, `fight` on each, a punch on the one that throws it. */
    const input=(extra:Record<string,unknown>={})=>{const self=room.state.players.get(id)!;joined.send('player.input',{seq:++seq,dx:0,dz:0,running:false,rotation:self.rotation,...extra});return seq;};
    return {room:joined,errors,hits,player:()=>room.state.players.get(id)!,input,get seq(){return seq;}};
  };
  type Joined=Awaited<ReturnType<typeof join>>;
  const at=(who:Joined,x:number,z:number,rotation=0)=>who.player().assign({x,y:0,z,rotation,interactionState:'',animationState:'idle',currentTableId:''});
  /** Inputs in the guard for `ms`, a tick apart (as the browser's timer), the first one carrying `extra`. */
  const guardFor=async(who:Joined,ms:number,extra:Record<string,unknown>={})=>{
    who.input({fight:true,...extra});
    for(let left=ms-TICK_MS;left>0;left-=TICK_MS){await pause(TICK_MS);who.input({fight:true});}
  };
  const punch=(who:Joined,target:Joined,m:PunchId)=>{
    const self=who.player(),other=target.player();
    const aim=punchAim(self.skin,m,self,self.rotation,[{id:other.id,x:other.x,y:other.y,z:other.z,skin:other.skin}]);
    return {punch:{m,n:7,lunge:aim.lunge,seen:room.state.serverTime,ago:0},rotation:aim.yaw};
  };
  const X=60,Z=7,ideal=fistPath('nathan','jab').reach+FIGHT.bodyRadius;
  try{
    const a=await join('a'),b=await join('b');
    at(a,X,Z,0);at(b,X,Z+ideal,Math.PI);

    // The guard rides on the inputs; the browsers see it in the nested state.
    await guardFor(a,300);
    await until(()=>a.player().fist.fight);
    await until(()=>(a.room.state as {players:Map<string,{fist?:{fight?:boolean}}>}).players.get('a')?.fist?.fight===true);

    // A jab at B: it lands once, both are told, B loses the jab's life and is held for its stun.
    const life=b.player().hp+b.player().hpCore;
    await guardFor(a,FIGHT_MOVES.jab.lockSteps*TICK_MS+200,punch(a,b,'jab'));
    await until(()=>a.hits.length===1&&b.hits.length===1);
    const hit=a.hits[0]!;
    assert.deepEqual([hit.by,hit.to,hit.move,hit.n,hit.damage,hit.ko],['a','b','jab',7,FIGHT_MOVES.jab.damage,false]);
    assert.equal(b.player().hp+b.player().hpCore,life-FIGHT_MOVES.jab.damage);
    assert.equal(b.player().fist.hit,'HitLight');
    assert.ok(hit.stunUntil>hit.at);
    assert.equal(a.player().fist.punch,'jab');assert.equal(a.player().fist.n,7);

    // The chain: free feet, a light punch is the cross.
    at(b,X,Z+fistPath('nathan','cross').reach+FIGHT.bodyRadius,Math.PI);
    await guardFor(a,FIGHT_MOVES.cross.lockSteps*TICK_MS+200,{...punch(a,b,'cross'),punch:{...punch(a,b,'cross').punch,n:8}});
    await until(()=>a.hits.length===2);
    assert.equal(a.hits[1]!.move,'cross');assert.equal(a.hits[1]!.damage,FIGHT_MOVES.cross.damage);

    // A cross out of turn (the chain was not there) is not thrown.
    await pause(FIGHT_MOVES.cross.chainSteps*TICK_MS);
    const before=a.hits.length;
    await guardFor(a,600,{...punch(a,b,'cross'),punch:{...punch(a,b,'cross').punch,n:9}});
    assert.equal(a.player().fist.n,8,'refused: the room kept the last punch it took');
    assert.equal(a.hits.length,before);

    // The guard does not go up with a drink in hand: refused once, with the reason.
    b.player().assign({holding:'copo',holdingSince:Date.now(),holdingUntil:Date.now()+60_000});
    await guardFor(b,300);
    assert.equal(b.player().fist.fight,false);
    await until(()=>b.errors.some(message=>/Largue/.test(message)));
    assert.equal(b.errors.filter(message=>/Largue/.test(message)).length,1,'told once');
    b.player().assign({holding:'',holdingSince:0,holdingUntil:0});

    // The knockout: life and the heart's reserve below the haymaker's blow. The body flies, and once it lies still the Morte comes for it.
    room.needs.damage(b.player(),b.player().hp+b.player().hpCore-5,Date.now());
    await pause(300);
    at(b,X,Z+fistPath('nathan','heavy').reach+FIGHT.bodyRadius,Math.PI);
    await pause(FIGHT_MOVES.cross.chainSteps*TICK_MS);
    await guardFor(a,FIGHT_MOVES.heavy.lockSteps*TICK_MS+200,{...punch(a,b,'heavy'),punch:{...punch(a,b,'heavy').punch,n:10}});
    await until(()=>a.hits.some(h=>h.ko));
    assert.equal(a.hits.at(-1)!.move,'heavy');
    await until(()=>b.player().interactionState==='thrown'||b.player().interactionState==='death',4000);
    await until(()=>b.player().interactionState==='death',15000);
    assert.equal(a.player().fist.fight,true,'the puncher keeps the guard');
  }finally{
    for(const joined of rooms)await joined.leave().catch(()=>{});
    await server.gracefullyShutdown(false).catch(()=>{});api.close();
    if(previous===undefined)delete process.env.API_INTERNAL_URL;else process.env.API_INTERNAL_URL=previous;
  }
});
