import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {Client,type Room} from '@colyseus/sdk';
import {signTicket} from '@bar/shared/tickets';
import {BarRoom} from '../src/BarRoom.js';

const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check:()=>boolean){const deadline=Date.now()+5000;while(!check()){if(Date.now()>deadline)throw new Error('Timed out');await pause(20);}}

test('god: server-only admin access, self and named targets, panel control, faint/death recovery, replication and one-shot effects',{timeout:30000},async()=>{
  const previous=process.env.API_INTERNAL_URL;
  const api=createServer(async(req,res)=>{
    let raw='';for await(const chunk of req)raw+=chunk;
    const body=raw?JSON.parse(raw):{};
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify(req.url?.endsWith('/validate')?{valid:true,blocked:[],role:body.userId==='admin'?'admin':'user',equippedSkin:'nathan',ownedSkins:['nathan']}:req.url?.endsWith('/lease')?{controls:[]}:{ok:true}));
  });
  await new Promise<void>(resolve=>api.listen(0,'127.0.0.1',resolve));
  process.env.API_INTERNAL_URL=`http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});
  let room!:BarRoom;
  server.define('bar',BarRoom).on('create',created=>{room=created as BarRoom;});
  await server.listen(0,'127.0.0.1');
  const client=new Client(`http://127.0.0.1:${(http.address() as AddressInfo).port}`),clients:Room[]=[],errors:Record<string,string[]>={},chat:Record<string,string[]>={};
  const join=async(id:string,name=id)=>{
    const joined=await client.joinOrCreate('bar',{ticket:signTicket({userId:id,sessionId:`session-${id}`,displayName:name,role:id==='admin'?'admin':'user',color:'#aa8844'})});
    clients.push(joined);errors[id]=[];chat[id]=[];
    joined.onMessage('*',()=>{});
    joined.onMessage('error',message=>errors[id]!.push(message.message));
    joined.onMessage('chat.message',message=>chat[id]!.push(message.text));
    await until(()=>!!room?.state.players.get(id));
    room.state.players.get(id)!.assign({x:12,y:.3,z:-6});
    return joined;
  };
  const healthy=(p:any)=>p&&['hp','stamina','hunger','thirst','hpCore','staminaCore','hungerCore','thirstCore'].every(key=>p[key]===100)&&p.bladder===0&&p.drunk===0&&!p.exhausted&&p.condition==='normal';
  const deplete=(id:string)=>{
    const state=room.needs.state(id);
    Object.assign(state,{hp:25,stamina:0,hunger:10,thirst:10,hpCore:0,staminaCore:0,hungerCore:0,thirstCore:0,bladder:95,drunk:80,exhausted:true,restAt:Date.now()+60000});
    room.needs.sync(room.state.players.get(id)!,Date.now());
    return state;
  };
  try{
    const admin=await join('admin'),target=await join('target','João da Silva');
    const player=room.state.players.get('target')!;
    await until(()=>!!admin.state.players?.get('target'));
    deplete('target');target.send('chat.send',{text:'/god'});
    await until(()=>errors.target!.some(message=>message.includes('administração')));
    assert.ok(player.hp<100,'regular players cannot restore themselves');

    deplete('admin');admin.send('chat.send',{text:'/GoD'});
    await until(()=>healthy(room.state.players.get('admin')));
    assert.ok(!healthy(player),'self recovery does not affect other players');

    admin.send('chat.send',{text:'/god jOÃO dA sILVA'});
    await until(()=>healthy(admin.state.players.get('target'))&&chat.admin!.some(message=>message.includes('God aplicado em João da Silva')));
    assert.ok(chat.target!.some(message=>message.includes('God recebido')));
    assert.ok(!chat.target!.some(message=>message.startsWith('/god')),'commands are private');

    await pause(1100); // The chat's existing rate limit still applies to administrative commands.
    const missing=errors.admin!.length;
    admin.send('chat.send',{text:'/god nobody'});await until(()=>errors.admin!.length>missing);
    assert.match(errors.admin!.at(-1)!,/não encontrado/);
    await join('duplicate','João da Silva');
    const ambiguous=errors.admin!.length;
    admin.send('chat.send',{text:'/god João da Silva'});await until(()=>errors.admin!.length>ambiguous);
    assert.match(errors.admin!.at(-1)!,/Use \/god seguido do ID/);

    const state=deplete('target');
    state.condition='fainted';state.conditionUntil=Date.now()+60000;state.faintCause='alcohol';
    player.interactionState='fainted';player.animationState='fallen';
    (room as any).sessions.getByUser('target').recoveryMoveAt=Date.now()+1000;
    admin.send('chat.send',{text:'/god target'});
    await until(()=>healthy(player)&&player.interactionState==='');
    assert.equal(player.animationState,'idle');assert.equal(state.faintCause,undefined);
    assert.equal((room as any).sessions.getByUser('target').recoveryMoveAt,undefined);

    // The queued panel action uses the same recovery and preserves active maximum-life bonuses.
    deplete('target');state.bonuses=[{source:'test',amount:25,until:Date.now()+60000}];
    (room as any).applyControl({id:'god-panel',action:'god',playerId:'target',actorId:'admin'});
    assert.equal(player.hp,125);assert.equal(player.hpMax,125);assert.equal(player.hpCore,100);
    assert.ok((room as any).logQueue.some((entry:any)=>entry.event==='admin_god'&&entry.userId==='target'&&entry.details.actorId==='admin'));

    await pause(1100);
    (room as any).deaths.kill('admin','admin');room.needs.kill(room.state.players.get('admin')!,Date.now());
    admin.send('chat.send',{text:'/god'});
    await until(()=>!(room as any).deaths.isDead('admin')&&healthy(room.state.players.get('admin')));
    assert.equal(room.state.players.get('admin')!.interactionState,'','death hold is released');

    const impaired=deplete('target');impaired.drunk=95;
    await until(()=>player.condition==='fainted');
    (room as any).deaths.kill('target','admin');room.needs.kill(player,Date.now());
    (room as any).applyControl({id:'god-revive',action:'god',playerId:'target',actorId:'admin'});
    assert.equal((room as any).deaths.isDead('target'),false);
    assert.equal(player.condition,'normal');assert.equal(player.interactionState,'');
    assert.equal(player.hp,125);assert.equal(player.stamina,100);
    impaired.stamina=17;impaired.staminaCore=0;
    await pause(300);
    assert.ok(impaired.stamina<20,'normal needs resume after god; there is no persistent invulnerability');
  }finally{
    await Promise.allSettled(clients.filter(joined=>joined.connection?.isOpen).map(joined=>joined.leave()));
    await server.gracefullyShutdown(false);await new Promise<void>(resolve=>api.close(()=>resolve()));
    if(previous===undefined)delete process.env.API_INTERNAL_URL;else process.env.API_INTERNAL_URL=previous;
  }
});
