import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';import {WebSocketTransport} from '@colyseus/ws-transport';import {Client,type Room} from '@colyseus/sdk';
import {KICKS} from '@bar/shared';import {signTicket} from '@bar/shared/tickets';
import {BarRoom} from '../src/BarRoom.js';
async function until(check:()=>boolean,ms=8000):Promise<void>{const deadline=Date.now()+ms;while(!check()){if(Date.now()>deadline)throw new Error('Timed out');await new Promise(r=>setTimeout(r,10));}}
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));

test('a kick throws who it touches, takes some life and lets them get up, over real WebSockets',{timeout:120000},async()=>{
  const previous=process.env.API_INTERNAL_URL;
  const api=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;res.setHeader('content-type','application/json');
    if(req.url?.endsWith('/validate')){const skin=raw.includes('rafa')?'rafael':'nathan';res.end(JSON.stringify({valid:true,blocked:[],role:'user',equippedSkin:skin,ownedSkins:[skin],ownedSkills:skin==='rafael'?['karate','air-kick']:[],balance:0,inventory:[]}));return;}
    res.end('{}');});
  await new Promise<void>(r=>api.listen(0,'127.0.0.1',r));process.env.API_INTERNAL_URL=`http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});let room!:BarRoom;
  server.define('bar',BarRoom).on('create',created=>{room=created as BarRoom;});await server.listen(0,'127.0.0.1');
  const client=new Client(`http://127.0.0.1:${(http.address() as AddressInfo).port}`),rooms:Room[]=[];
  const join=async(id:string)=>{
    const joined=await client.joinOrCreate('bar',{ticket:signTicket({userId:id,sessionId:`session-${id}`,displayName:id,role:'user',color:'#aa8844'})});rooms.push(joined);
    const errors:string[]=[],kicked:Array<{hp:number;by:string}>=[];joined.onMessage('error',m=>errors.push(m.message));joined.onMessage('player.kicked',m=>kicked.push(m));
    for(const type of ['chat.message','inventory.state','job.state','wallet.state','prices','admin.world'])joined.onMessage(type,()=>{});
    await until(()=>!!room.state.players.get(id));
    return {room:joined,errors,kicked,player:()=>room.state.players.get(id)!,kick:(skill:string)=>joined.send('player.skill',{skill})};
  };
  // Open street, facing +Z unless a test says otherwise.
  const at=(who:{player:()=>{assign:(p:object)=>unknown}},x:number,z:number,rotation=0)=>who.player().assign({x,y:0,z,rotation,interactionState:'',animationState:'idle',currentTableId:''});
  const X=60,Z=7;
  const finished=(who:{player:()=>{animationState:string}})=>until(()=>who.player().animationState==='idle',12000);
  try{
    const rafa=await join('rafa'),victim=await join('victim'),other=await join('other');
    at(other,X+40,Z);

    // Nothing in reach: the kick is thrown at the air, and nobody is the worse for it.
    at(rafa,X,Z);at(victim,X,Z+6);
    const before=victim.player().hp;
    rafa.kick('karate');await until(()=>rafa.player().animationState==='kick');
    await pause(KICKS.karate!.swingMs+600);
    assert.equal(victim.player().animationState,'idle','Out of reach');
    assert.equal(victim.kicked.length,0);
    await finished(rafa);

    // In reach: thrown away from the kicker, losing a little life, and told so.
    at(victim,X,Z+1.15,Math.PI);
    rafa.kick('karate');
    await until(()=>victim.player().animationState==='ragdoll',3000);
    const started=rafa.player().animationStartedAt,body=room.state.ragdolls.get('victim')!;
    assert.ok(body.startedAt-started>=400&&body.startedAt-started<=900,`It landed ${body.startedAt-started} ms into the kick, while the leg was out`);
    assert.equal(body.by,'rafa');
    assert.equal(body.seated,false);
    assert.equal(body.lift,KICKS.karate!.lift);
    assert.ok(body.vz>6,`Sent away at ${body.vz.toFixed(1)} m/s`);
    await until(()=>victim.kicked.length===1,2000);
    assert.deepEqual(victim.kicked[0],{hp:KICKS.karate!.hp,by:'rafa'});
    assert.equal(victim.player().hp,before-KICKS.karate!.hp,'A little life, at once');
    // Down, nobody can be kicked again, and the room carries the body to where it lands.
    await until(()=>victim.player().z>Z+1.15+4,4000);
    await until(()=>victim.player().animationState==='recover',10000);
    assert.equal(room.state.ragdolls.has('victim'),true,'The body is there until getting up ends');
    const fell=victim.player().z;
    assert.ok(fell>Z+4,`It lies far away: z ${fell.toFixed(1)}`);
    await until(()=>victim.player().animationState==='idle',8000);
    assert.equal(room.state.ragdolls.has('victim'),false);
    assert.equal(victim.player().interactionState,'');

    // Just up, the next kick lands: no grace for kicks.
    at(victim,X,Z+1.15,Math.PI);at(rafa,X,Z);await finished(rafa);
    rafa.kick('karate');
    await until(()=>victim.kicked.length===2,3000);
    await until(()=>victim.player().animationState==='idle',16000);
    await finished(rafa);

    // Not who is seated, nor busy with something a kick must not cut short.
    for(const busy of ['job','toilet-1']){
      victim.player().interactionState=busy;
      rafa.kick('karate');await pause(KICKS.karate!.swingMs+600);
      assert.equal(victim.player().interactionState,busy,`${busy}: left alone`);
      await finished(rafa);
    }
    victim.player().interactionState='';
    victim.player().currentTableId='mesa';
    rafa.kick('karate');await pause(KICKS.karate!.swingMs+600);
    assert.equal(victim.player().animationState,'idle','Seated at a table: left alone');
    victim.player().currentTableId='';
    await finished(rafa);

    // The aim: facing a little off, the kick turns to who is there and lands (the kicks before carried Rafael forward: back to his spot).
    at(rafa,X,Z);at(victim,X+.7,Z+1,Math.PI);
    rafa.player().rotation=0;
    rafa.kick('air-kick');
    await until(()=>rafa.player().animationState==='kick');
    assert.ok(Math.abs(rafa.player().rotation-Math.atan2(.7,1))<1e-6,`Turned to ${rafa.player().rotation}`);
    await until(()=>victim.player().animationState==='ragdoll',4000);
    const flying=room.state.ragdolls.get('victim')!;
    assert.equal(flying.lift,KICKS['air-kick']!.lift);
    // It takes more, and nobody is hit twice by one kick.
    await until(()=>victim.kicked.length===3,2000);
    assert.equal(victim.kicked[2]!.hp,KICKS['air-kick']!.hp);
    await pause(400);assert.equal(victim.kicked.length,3,'One kick, one blow');
    await until(()=>victim.player().animationState==='idle',16000);
    await finished(rafa);

    // A kick never takes the last point of life.
    at(rafa,X,Z);at(other,X,Z+1.15,Math.PI);
    other.player().hp=3;
    rafa.kick('karate');
    await until(()=>other.player().animationState==='ragdoll',3000);
    await until(()=>other.player().animationState==='recover',12000);
    assert.ok(other.player().hp>=1,`Left with ${other.player().hp} of life`);
    assert.equal(other.player().condition==='fainted',false,'On the floor, not out cold');
    await until(()=>other.player().animationState==='idle',8000);
    await finished(rafa);

    // Only Rafael has the kick; walls stop it; somebody gone is left alone.
    victim.kick('karate');await until(()=>victim.errors.length>0,2000);
    assert.match(victim.errors[0]!,/skin/);
    // Skills are bought: the card alone does not kick.
    const kicker=(room as any).sessions.getByUser(rafa.player().id);kicker.skills=new Set();
    rafa.errors.length=0;rafa.kick('karate');await until(()=>rafa.errors.length>0,2000);
    assert.match(rafa.errors[0]!,/Compre/);assert.equal(rafa.player().animationState,'idle');
    kicker.skills=new Set(['karate','air-kick']);rafa.errors.length=0;
    at(victim,X,Z+1.15,Math.PI);victim.player().connected=false;
    rafa.kick('karate');await pause(KICKS.karate!.swingMs+600);
    assert.equal(victim.player().animationState,'idle','An absent avatar is not a target');
    victim.player().connected=true;
    await finished(rafa);

    // Someone in the middle of a kick of their own can be hit too, and that kick ends there.
    at(victim,X,Z+1.15,Math.PI);
    victim.player().assign({interactionState:'kick',animationState:'kick',animationStartedAt:Date.now(),skill:'karate'});
    rafa.kick('karate');
    await until(()=>victim.player().animationState==='ragdoll',3000);
    assert.equal(rafa.errors.length,0);
  }finally{
    await Promise.allSettled(rooms.filter(r=>r.connection?.isOpen).map(r=>r.leave()));
    await server.gracefullyShutdown(false).catch(()=>{});api.close();
    if(previous===undefined)delete process.env.API_INTERNAL_URL;else process.env.API_INTERNAL_URL=previous;
  }
});
