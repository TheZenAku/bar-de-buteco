import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';import {WebSocketTransport} from '@colyseus/ws-transport';import {Client,type Room} from '@colyseus/sdk';
import {DRINK_DURATION_MS,INTERACTABLES,MAP_MARKERS,NEEDS,distance} from '@bar/shared';import {signTicket} from '@bar/shared/tickets';
import {BarRoom} from '../src/BarRoom.js';
async function until(check:()=>boolean,ms=4000):Promise<void>{const deadline=Date.now()+ms;while(!check()){if(Date.now()>deadline)throw new Error('Timed out');await new Promise(r=>setTimeout(r,20));}}
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));

test('needs: stamina gates running, beer and toilet, faints block actions and wake, one alcohol rescue, synced to others',{timeout:60000},async()=>{
  const previous=process.env.API_INTERNAL_URL;
  const api=createServer(async(req,res)=>{for await(const _ of req){}res.setHeader('content-type','application/json');res.end(JSON.stringify(req.url?.endsWith('/validate')?{valid:true,blocked:[],role:'user',equippedSkin:'nathan',ownedSkins:['nathan']}:req.url?.endsWith('/controls')?{controls:[]}:{ok:true}));});
  await new Promise<void>(r=>api.listen(0,'127.0.0.1',r));process.env.API_INTERNAL_URL=`http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});let authoritative!:BarRoom;
  server.define('bar',BarRoom).on('create',room=>{authoritative=room as BarRoom;});await server.listen(0,'127.0.0.1');
  const client=new Client(`http://127.0.0.1:${(http.address() as AddressInfo).port}`),rooms:Room[]=[],chat:string[]=[];
  const join=async(id:string)=>{const room=await client.joinOrCreate('bar',{ticket:signTicket({userId:id,sessionId:`session-${id}`,displayName:id,role:'user',color:'#aa8844'})});rooms.push(room);room.onMessage('chat.message',m=>{if(id==='need-b')chat.push(m.text);});await until(()=>!!authoritative?.state.players.get(id));return room;};
  let seq=0;
  /** Sends inputs at the client's rate (one per server tick); returns the animations seen. */
  const walk=async(room:Room,ticks:number,running:boolean)=>{const seen=new Set<string>();for(let i=0;i<ticks;i++){const s=seq++;room.send('player.input',{seq:s,dx:Math.floor(s/8)%2?1:-1,dz:0,running,rotation:0});await pause(50);seen.add(authoritative.state.players.get('need-a')!.animationState);}return seen;};
  try {
    const a=await join('need-a'),b=await join('need-b'),errors:string[]=[],lost:string[]=[];
    a.onMessage('error',m=>errors.push(m.message));a.onMessage('needs.itemLost',m=>lost.push(m.item));
    const player=authoritative!.state.players.get('need-a')!,needs=authoritative!.needs.state('need-a'),seen=()=>b.state.players?.get("need-a");
    await until(()=>seen()?.hp===100&&seen()?.stamina===100&&seen()?.drunk===0);
    // Side by side, so each one is in the other's view.
    const other=authoritative.state.players.get('need-b')!;
    player.assign({x:12,y:.3,z:-6});other.assign({x:12,y:.3,z:-4});await until(()=>seen()?.x===12);

    // Running drains stamina (seen by the other player); at zero the character walks, never runs.
    assert.ok((await walk(a,30,true)).has('run'));
    await until(()=>(seen()?.stamina??100)<=96);
    needs.stamina=0;needs.exhausted=true;
    const tired=await walk(a,16,true);
    assert.equal(tired.has('run'),false,'Exhausted: running input becomes a walk');
    assert.ok(tired.has('walk'));
    await until(()=>seen()?.exhausted===true);

    // Beer: drunkenness and bladder change separately; half a drink counts half.
    player.assign({interactionState:'counter',animationState:'drink',drinkItem:'garrafa',animationStartedAt:Date.now()-DRINK_DURATION_MS/2});
    a.send('player.interact',{objectId:'stand'});
    await until(()=>player.drinkItem===''&&(seen()?.drunk??0)>0);
    assert.ok(Math.abs(needs.drunk-6)<1.5,`half a long neck: ${needs.drunk}`);
    assert.ok(Math.abs(needs.bladder-9)<1.5,`bladder ${needs.bladder}`);
    assert.equal(seen()?.bladder,Math.round(needs.bladder));

    // The toilet empties the bladder after its time; only one person at a time.
    needs.bladder=80;const toilet=INTERACTABLES.find(i=>i.id==='toilet-1')!;
    player.assign({x:toilet.x,y:toilet.y,z:toilet.z+.7});other.assign({x:toilet.x,y:toilet.y,z:toilet.z+.7});
    await pause(150);
    a.send('player.interact',{objectId:'toilet-1'});await until(()=>player.interactionState==='toilet-1');
    assert.equal(player.animationState,'toilet','The restroom has a neutral dedicated action instead of an unrelated idle');
    const bErrors:string[]=[];b.onMessage('error',m=>bErrors.push(m.message));
    b.send('player.interact',{objectId:'toilet-1'});await until(()=>bErrors.some(e=>e.includes('Ocupado')));
    await until(()=>seen()?.bladder===0,NEEDS.bladder.toiletSeconds*1000+2000);
    assert.equal(player.interactionState,'');
    other.assign({x:12,y:.3,z:-4});

    // HP faint: fallen, actions refused, inputs ignored; wakes recovered. Without an inventory nothing is lost.
    player.assign({x:12,y:.3,z:-6});
    authoritative.needs.damage(player,1000,Date.now());
    await until(()=>seen()?.condition==='fainted'&&seen()?.animationState==='fallen'&&seen()?.faintCause==='hp');
    assert.ok(chat.some(t=>t.includes('desmaiou')));
    a.send('player.emote',{emote:'dance'});await until(()=>errors.includes('Você está desacordado.'));
    const at={x:player.x,z:player.z};await walk(a,6,false);
    assert.deepEqual({x:player.x,z:player.z},at,'A fainted body does not move');
    assert.deepEqual(lost,[],'NO_INVENTORY: nothing to lose and nothing breaks');
    needs.conditionUntil=Date.now()+200;
    await until(()=>seen()?.condition==='recovering'&&seen()?.animationState==='recover');
    assert.equal(seen()?.hp,NEEDS.hp.recoverTo);
    needs.conditionUntil=Date.now();await until(()=>seen()?.condition==='normal');

    // The inventory hook: with a (fake) inventory, the 80% roll removes an eligible item and tells the player.
    const removed:string[]=[];
    authoritative.needs.inventory={eligibleItems:()=>['isqueiro'],remove:(_id,item)=>{removed.push(item);return true;}};
    Object.assign(authoritative.needs,{random:()=>0});
    authoritative.needs.damage(player,1000,Date.now());
    await until(()=>lost.length===1);
    assert.deepEqual(lost,['isqueiro']);assert.deepEqual(removed,['isqueiro']);
    needs.conditionUntil=Date.now();await until(()=>seen()?.condition==='recovering');
    needs.conditionUntil=Date.now();await until(()=>seen()?.condition==='normal');

    // Alcohol faint: taken once to the recovery point, wakes soberer.
    player.assign({x:12,y:.3,z:-6});needs.drunk=95;
    await until(()=>seen()?.condition==='fainted'&&seen()?.faintCause==='alcohol');
    assert.ok(chat.some(t=>t.includes('bebeu demais')));
    const marker=MAP_MARKERS[NEEDS.faint.alcoholRecoveryMarker as keyof typeof MAP_MARKERS]!;
    await until(()=>distance(player,marker)<3,NEEDS.faint.moveAfterSeconds*1000+2000);
    other.assign({x:marker.x+1.5,y:marker.y,z:marker.z});
    const rescued={x:player.x,z:player.z};await pause(1200);
    assert.deepEqual({x:player.x,z:player.z},rescued,'Moved once, not every tick');
    assert.equal(chat.filter(t=>t.includes('tomar um ar')).length,1);
    needs.conditionUntil=Date.now();
    await until(()=>seen()?.condition==='recovering');
    assert.ok(needs.drunk<=NEEDS.drunk.soberAfterFaintTo);
    await pause(400);assert.equal(chat.filter(t=>t.includes('tomar um ar')).length,1,'No second rescue');
    for(const key of ['hp','stamina','hunger','thirst','bladder','drunk'] as const)assert.ok(Number.isFinite(seen()![key])&&seen()![key]>=0&&seen()![key]<=100,key);
  } finally {
    await Promise.allSettled(rooms.filter(room=>room.connection?.isOpen).map(room=>room.leave()));await server.gracefullyShutdown(false);await new Promise<void>(r=>api.close(()=>r()));
    if(previous===undefined)delete process.env.API_INTERNAL_URL;else process.env.API_INTERNAL_URL=previous;
  }
});
