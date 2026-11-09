import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';import {WebSocketTransport} from '@colyseus/ws-transport';import {Client,type Room} from '@colyseus/sdk';
import {TICK_MS,arsenalStats,bodyZones,eyeOf,normalize,testArsenal,type ArsenalView,type GunInput,type ShotCommand,type Vec3,type WeaponHitEvent,type WeaponShotEvent} from '@bar/shared';import {signTicket} from '@bar/shared/tickets';
import {BarRoom} from '../src/BarRoom.js';
import {TARGETS} from '../src/world/targets.js';
async function until(check:()=>boolean,ms=8000):Promise<void>{const deadline=Date.now()+ms;while(!check()){if(Date.now()>deadline)throw new Error('Timed out');await new Promise(r=>setTimeout(r,10));}}
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));

test('firearms over real WebSockets: /armas for admins only (and /armas todos), drawing and shooting on the inputs, hits, a knockout, and /alvos dummies that fall and get up',{timeout:120000},async()=>{
  const previous=process.env.API_INTERNAL_URL;
  // The API stub knows no arsenal: the room falls back to the test kit in memory.
  const api=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;const body=raw?JSON.parse(raw):{};res.setHeader('content-type','application/json');
    if(req.url?.endsWith('/validate')){res.end(JSON.stringify({valid:true,blocked:[],role:body.userId==='admin'?'admin':'user',equippedSkin:'nathan',ownedSkins:['nathan'],ownedSkills:[],balance:0,inventory:[]}));return;}
    if(req.url?.endsWith('/lease')){res.end(JSON.stringify({controls:[]}));return;}
    res.end('{}');});
  await new Promise<void>(r=>api.listen(0,'127.0.0.1',r));process.env.API_INTERNAL_URL=`http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});let room!:BarRoom;
  server.define('bar',BarRoom).on('create',created=>{room=created as BarRoom;});await server.listen(0,'127.0.0.1');
  const client=new Client(`http://127.0.0.1:${(http.address() as AddressInfo).port}`),rooms:Room[]=[];
  const join=async(id:string)=>{
    const joined=await client.joinOrCreate('bar',{ticket:signTicket({userId:id,sessionId:`session-${id}`,displayName:id,role:id==='admin'?'admin':'user',color:'#aa8844'})});rooms.push(joined);
    const errors:string[]=[],chat:string[]=[],hits:WeaponHitEvent[]=[],shots:WeaponShotEvent[]=[],arsenals:ArsenalView[]=[];
    joined.onMessage('*',()=>{});
    joined.onMessage('error',m=>errors.push(m.message));joined.onMessage('chat.message',m=>chat.push(m.text));
    joined.onMessage('weapon.hit',m=>hits.push(m));joined.onMessage('weapon.shot',m=>shots.push(m));joined.onMessage('weapon.arsenal',m=>arsenals.push(m));
    await until(()=>!!room.state.players.get(id));
    let seq=0;
    const input=(gun?:GunInput)=>{const self=room.state.players.get(id)!;joined.send('player.input',{seq:++seq,dx:0,dz:0,running:false,rotation:self.rotation,...(gun?{gun}:{})});};
    /** Inputs a tick apart for `ms`, each carrying the gun (the first one `first`). */
    const hold=async(ms:number,gun:GunInput,first:GunInput=gun)=>{input(first);for(let left=ms-TICK_MS;left>0;left-=TICK_MS){await pause(TICK_MS);input(gun);}};
    return {room:joined,errors,chat,hits,shots,arsenals,input,hold,player:()=>room.state.players.get(id)!};
  };
  const shotAt=(shooter:{x:number;y:number;z:number;skin:string;rotation:number},point:Vec3,n:number):ShotCommand=>{
    const eye=eyeOf(shooter.skin,shooter),d=normalize([point[0]-eye[0],point[1]-eye[1],point[2]-eye[2]]);
    return {n,o:[eye[0]-d[0]*2,eye[1]-d[1]*2,eye[2]-d[2]*2],d,sp:0,seen:room.state.serverTime,ago:0,dt:10_000};
  };
  const chest=(target:{x:number;y:number;z:number;skin:string;rotation:number}):Vec3=>{const zones=bodyZones(target.skin,target);return [(zones.torso.a[0]+zones.torso.b[0])/2,(zones.torso.a[1]+zones.torso.b[1])/2,(zones.torso.a[2]+zones.torso.b[2])/2];};
  // A clear line of the street (the chain-link fence at z 16 on x 60 stops bullets).
  const X=40,Z=0,pistol=arsenalStats(testArsenal(),'pistola')!;
  try{
    const admin=await join('admin'),b=await join('b');
    const place=(who:typeof admin,x:number,z:number,rotation:number)=>who.player().assign({x,y:0,z,rotation,interactionState:'',animationState:'idle',currentTableId:''});
    place(admin,X,Z,0);place(b,X,Z+10,Math.PI);

    // A player who is not of the administration cannot; the admin can, and gets the arsenal with the pistol to draw.
    b.room.send('chat.send',{text:'/armas'});
    await until(()=>b.errors.length===1);
    assert.match(b.errors[0]!,/só a administração/);
    assert.equal(b.player().gun.on,false);
    admin.room.send('chat.send',{text:'/armas'});
    await until(()=>admin.arsenals.length===1);
    assert.equal(admin.arsenals[0]!.draw,'pistola');assert.equal(admin.arsenals[0]!.test,true);assert.equal(admin.arsenals[0]!.weapons.length,10);
    assert.equal(admin.player().gun.on,true);
    assert.ok(admin.chat.some(text=>text.startsWith('Armas de teste liberadas.')));
    await until(()=>(admin.room.state as {players:Map<string,{gun?:{on?:boolean}}>}).players.get('admin')?.gun?.on===true);

    // Drawn on the inputs; the guard is refused with the gun in hand.
    await admin.hold(pistol.drawMs+150,{w:'pistola',r:0});
    await until(()=>admin.player().gun.w==='pistola');
    assert.equal(admin.player().gun.mag,pistol.mag);
    admin.room.send('player.input',{seq:9999,dx:0,dz:0,running:false,rotation:0,fight:true,gun:{w:'pistola',r:0}});
    await until(()=>admin.errors.includes('Guarde a arma antes de levantar a guarda.'));
    assert.equal(admin.player().fist.fight,false);

    // A shot at B: B hears it (the shooter does not get its own shot back), both are told of the hit, B's life goes down.
    const life=b.player().hp+b.player().hpCore;
    admin.room.send('player.input',{seq:10_000,dx:0,dz:0,running:false,rotation:0,gun:{w:'pistola',r:0,s:[shotAt(admin.player(),chest(b.player()),1)]}});
    await until(()=>admin.hits.length===1&&b.hits.length===1&&b.shots.length===1);
    const hit=admin.hits[0]!;
    assert.deepEqual([hit.by,hit.to,hit.w,hit.n,hit.ko],['admin','b','pistola',1,false]);
    assert.equal(b.player().hp+b.player().hpCore,life-hit.damage);
    assert.equal(hit.hp,life-hit.damage);
    assert.equal(admin.shots.length,0);
    assert.deepEqual([admin.player().gun.mag,admin.player().gun.shots],[pistol.mag-1,1]);

    // A knockout (the sniper rifle in the head): the body flies.
    for(let i=0;i<Math.ceil((arsenalStats(testArsenal(),'precisao')!.drawMs+200)/TICK_MS);i++){admin.room.send('player.input',{seq:10_001+i,dx:0,dz:0,running:false,rotation:0,gun:{w:'precisao',r:0}});await pause(TICK_MS);}
    await until(()=>admin.player().gun.w==='precisao');
    admin.room.send('player.input',{seq:10_100,dx:0,dz:0,running:false,rotation:0,gun:{w:'precisao',r:0,s:[shotAt(admin.player(),bodyZones(b.player().skin,b.player()).head.c,2)]}});
    await until(()=>admin.hits.length===2);
    assert.equal(admin.hits[1]!.ko,true);
    await until(()=>room.state.ragdolls.has('b'));
    assert.equal(b.player().interactionState==='thrown'||b.player().animationState==='ragdoll',true);

    // /armas todos opens them to everyone; closing takes them back from who is not an admin.
    admin.room.send('chat.send',{text:'/armas todos'});
    await until(()=>admin.chat.some(text=>text.includes('liberou as armas de teste')));
    const c=await join('c');
    c.room.send('chat.send',{text:'/armas'});
    await until(()=>c.arsenals.length===1);
    assert.equal(c.player().gun.on,true);
    admin.room.send('chat.send',{text:'/armas todos'});
    await until(()=>c.chat.includes('As armas de teste foram recolhidas pela administração.'));
    assert.equal(c.player().gun.on,false);
    assert.equal(admin.player().gun.on,true,'the admin keeps them');

    // /alvos: dummies in front of the admin, bodies of the room; a hit takes their own lives, a knockout throws them and they get up whole.
    place(admin,X,Z,0);
    admin.room.send('chat.send',{text:'/alvos'});
    await until(()=>[...room.state.players.keys()].some(id=>id.startsWith(TARGETS.prefix)));
    await pause(200);
    const dummies=[...room.state.players.values()].filter(p=>p.id.startsWith(`${TARGETS.prefix}admin:`));
    assert.ok(dummies.length>=1,'at least one dummy found a place');
    assert.ok(admin.chat.some(text=>text.includes('alvos de treino na sua frente')));
    const dummy=dummies.find(p=>p.id.endsWith(':1'))??dummies[0]!;
    const home={x:dummy.x,z:dummy.z};
    dummy.assign({hp:20,hpCore:0});
    await pause(400);
    admin.room.send('player.input',{seq:10_200,dx:0,dz:0,running:false,rotation:Math.atan2(dummy.x-admin.player().x,dummy.z-admin.player().z),
      gun:{w:'precisao',r:0,s:[shotAt(admin.player(),chest(dummy),3)]}});
    await until(()=>admin.hits.some(item=>item.to===dummy.id));
    const dummyHit=admin.hits.find(item=>item.to===dummy.id)!;
    assert.equal(dummyHit.ko,true);
    await until(()=>room.state.ragdolls.has(dummy.id));
    assert.equal(dummy.animationState,'ragdoll');
    await until(()=>!room.state.ragdolls.has(dummy.id),TARGETS.downMs+3000);
    assert.deepEqual([dummy.hp,dummy.hpCore,dummy.interactionState],[TARGETS.hp,TARGETS.hpCore,'']);
    if(!dummy.id.endsWith(':2')&&!dummy.id.endsWith(':3'))assert.ok(Math.hypot(dummy.x-home.x,dummy.z-home.z)<.01,'back home');
    // Again: they go.
    admin.room.send('chat.send',{text:'/alvos'});
    await until(()=>![...room.state.players.keys()].some(id=>id.startsWith(TARGETS.prefix)));
    assert.ok(admin.chat.includes('Alvos de treino removidos.'));

    // /armas again turns them off.
    admin.room.send('chat.send',{text:'/armas'});
    await until(()=>admin.player().gun.on===false);
    assert.equal(admin.player().gun.w,'');
  }finally{
    for(const joined of rooms)await joined.leave().catch(()=>{});
    await server.gracefullyShutdown(false).catch(()=>{});api.close();
    if(previous===undefined)delete process.env.API_INTERNAL_URL;else process.env.API_INTERNAL_URL=previous;
  }
});
