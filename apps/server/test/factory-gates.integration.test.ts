import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {Client as BrowserClient,type Room as ClientRoom} from '@colyseus/sdk';
import {CITY_MARKERS,SKINS,solidColliders} from '@bar/shared';
import {FACTORY_GATES,FACTORY_INTERCOM,gateById} from '@bar/shared/factory';
import {signTicket} from '@bar/shared/tickets';
import {BarRoom} from '../src/BarRoom.js';

async function eventually(check:()=>boolean,timeout=4000):Promise<void> {
  const deadline=Date.now()+timeout;
  while(!check()){if(Date.now()>deadline)throw new Error('Condition timed out');await new Promise(resolve=>setTimeout(resolve,20));}
}
const at=(name:string)=>CITY_MARKERS[name]!;
const GATE=gateById('EB_Portao')!,WORKSHOP=gateById('EB_Oficina_Porta')!,ROLLER=gateById('EB_Oficina_Portao_Enrolar')!;
/** The room's private hold-open clock of the vehicle gate (staff's ring): wound back to skip the 30 s. */
let room:BarRoom|undefined;
const hold=()=>(room as unknown as {gateHoldUntil:number});
const boxOf=(id:string)=>solidColliders().find(box=>box.id===id)!;

test('portão e portas da EMPRESA BRASIL na sala real: interfone por vínculo, visitante só chama, menu com expediente e EPI, porta manual por E',{timeout:40_000},async()=>{
  const previousApi=process.env.API_INTERNAL_URL;
  // alice owns the firm; carol is a hired employee (not on shift); bob has nothing to do with the firm.
  const roles:Record<string,string|null>={alice:'owner'};
  const hired=new Set(['alice','carol']);
  let shift:null|{startedAt:string;earned:number;station:string}=null;
  const internal=createServer(async(req,res)=>{
    let data='';for await(const chunk of req)data+=chunk;
    const body=data?JSON.parse(data):{};res.setHeader('content-type','application/json');
    const url=req.url??'';
    if(url==='/api/internal/validate')res.end(JSON.stringify({valid:/^session-(alice|bob|carol)$/.test(body.sessionId),blocked:[],role:'user',balance:1000,equippedSkin:'nathan',ownedSkins:SKINS.map(s=>s.id),ownedSkills:[]}));
    else if(url==='/api/internal/controls')res.end('{"controls":[]}');
    else if(url==='/api/internal/wallet')res.end(JSON.stringify({balance:1000,applied:0}));
    else if(url==='/api/internal/company'&&body.action==='role')res.end(JSON.stringify({role:roles[body.userId]??null}));
    else if(url==='/api/internal/employment'){
      if(body.action==='view')res.end(JSON.stringify({employment:hired.has(body.userId)?{jobId:'spray-dry-operator',status:'hired',hiredAt:new Date().toISOString()}:null,shift:body.userId==='alice'?shift:null,config:{}}));
      else if(body.action==='start'){shift={startedAt:new Date().toISOString(),earned:0,station:body.station};res.end(JSON.stringify({shift}));}
      else if(body.action==='stop'){const old=shift;shift=null;res.end(JSON.stringify({shift:old}));}
      else res.end('{"closed":0}');
    }else if(url==='/api/internal/factory'){
      if(body.action==='view')res.end(JSON.stringify({state:null,revision:0,slots:[],settings:[]}));
      else if(body.action==='orders')res.end(JSON.stringify({orders:[]}));
      else res.end('{"applied":true}');
    }else res.end('{"ok":true}');
  });
  await new Promise<void>(resolve=>internal.listen(0,'127.0.0.1',resolve));
  process.env.API_INTERNAL_URL=`http://127.0.0.1:${(internal.address() as AddressInfo).port}`;
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});
  server.define('bar',BarRoom).on('create',created=>{room=created as BarRoom;});
  await server.listen(0,'127.0.0.1');
  const client=new BrowserClient(`http://127.0.0.1:${(http.address() as AddressInfo).port}`);
  const rooms:ClientRoom[]=[];
  try{
    type Result={action:string;ok:boolean;message:string};
    const join=async(name:string)=>{
      const joined=await client.joinOrCreate('bar',{ticket:signTicket({userId:name,sessionId:`session-${name}`,displayName:name,role:'user',color:'#aa8844'})});
      joined.reconnection.minUptime=0;rooms.push(joined);
      const results:Result[]=[];
      joined.onMessage('factory.result',message=>results.push(message));
      for(const type of ['error','employment.state','factory.ppe','chat.message','factory.state'])joined.onMessage(type,()=>{});
      await eventually(()=>joined.state?.players?.has(name));
      const player=room!.state.players.get(name)!;
      const stand=(x:number,z:number,y=.17)=>{Object.assign(player,{x,y,z});};
      const send=async(type:string,payload:unknown={})=>{const count=results.length+1;joined.send(type,payload);await eventually(()=>results.length>=count);return results.at(-1)!;};
      return {joined,player,results,stand,send,standAt:(marker:string)=>{const p=at(marker);stand(p.x,p.z,p.y);}};
    };
    const alice=await join('alice'),bob=await join('bob'),carol=await join('carol');
    const door=(id:string)=>room!.state.doors.get(id)!;
    const seen=(id:string)=>alice.joined.state.doors.get(id)!;
    assert.equal(door(GATE.id).open,false,'o portão começa fechado');

    // The gate does not open for proximity: people and a vehicle at its mouth change nothing.
    bob.stand(GATE.centre.x+2,GATE.centre.z);await new Promise(resolve=>setTimeout(resolve,700));
    assert.equal(door(GATE.id).open,false,'ninguém abre o portão só chegando perto');

    // A visitor rings: nobody is on shift, so nobody answers (and the gate stays shut).
    bob.stand(FACTORY_INTERCOM.x,FACTORY_INTERCOM.z);
    let result=await bob.send('factory.ring');
    assert.equal(result.ok,false);assert.match(result.message,/Ninguém atendeu/);assert.equal(door(GATE.id).open,false);
    // Far from the post, the intercom does not answer to anyone.
    carol.stand(FACTORY_INTERCOM.x+40,FACTORY_INTERCOM.z);result=await carol.send('factory.ring');assert.equal(result.ok,false);assert.match(result.message,/perto do interfone/);

    // The firm's owner and a hired employee: the game recognises them and the gate opens (for 30 s, shutting once the doorway is free).
    alice.stand(FACTORY_INTERCOM.x,FACTORY_INTERCOM.z);
    result=await alice.send('factory.ring');
    assert.equal(result.ok,true);assert.equal(result.message,'Abrindo para você, alice.');
    await eventually(()=>seen(GATE.id)?.open===true);
    assert.equal(door(GATE.id).open,true);assert.ok(hold().gateHoldUntil>Date.now()+25_000,'fica aberto por cerca de 30 s');
    // Its box follows the leaf: a moment later it is no longer where it was shut.
    await new Promise(resolve=>setTimeout(resolve,1200));
    assert.ok(boxOf(GATE.id).z<GATE.collider.z-.1,`a caixa saiu do lugar (z=${boxOf(GATE.id).z.toFixed(2)})`);
    // Somebody in the doorway keeps it open past the time; once clear, it shuts by itself.
    hold().gateHoldUntil=Date.now()-1;bob.stand(GATE.collider.x,GATE.collider.z+1);
    await new Promise(resolve=>setTimeout(resolve,700));assert.equal(door(GATE.id).open,true,'tem gente no vão: não fecha');
    bob.stand(GATE.collider.x+30,GATE.collider.z);
    await eventually(()=>door(GATE.id).open===false);await eventually(()=>seen(GATE.id)?.open===false);
    carol.stand(FACTORY_INTERCOM.x,FACTORY_INTERCOM.z);result=await carol.send('factory.ring');
    assert.equal(result.ok,true,'funcionário contratado também abre');assert.match(result.message,/Abrindo para você, carol/);
    hold().gateHoldUntil=Date.now()-1;await eventually(()=>door(GATE.id).open===false,6000);

    // The menu: refused without a shift and the PPE, and away from the panel.
    alice.standAt('Ponto_EB_Painel');
    result=await alice.send('factory.gate',{action:'open'});assert.equal(result.ok,false);assert.match(result.message,/expediente/i);
    alice.standAt('Ponto_EB_Entrada_Pessoal');
    result=await alice.send('employment.shift',{on:true,requestId:crypto.randomUUID()});assert.equal(result.ok,true,result.message);
    alice.standAt('Ponto_EB_Painel');
    result=await alice.send('factory.gate',{action:'open'});assert.equal(result.ok,false);assert.match(result.message,/EPI/);
    alice.standAt('Ponto_EB_Entrada_Pessoal');result=await alice.send('factory.ppe',{on:true});assert.equal(result.ok,true,result.message);
    alice.stand(at('Ponto_EB_Painel').x+30,at('Ponto_EB_Painel').z);result=await alice.send('factory.gate',{action:'open'});assert.equal(result.ok,false);assert.match(result.message,/computador da sala de controle/);
    assert.equal(door(GATE.id).open,false);
    // Now with a visitor waiting: the call reaches the operator; dismissing tells the visitor; opening opens, and it stays open until someone shuts it.
    bob.stand(FACTORY_INTERCOM.x,FACTORY_INTERCOM.z);alice.standAt('Ponto_EB_Painel');
    (room as unknown as {sessions:{getByUser(id:string):{ringAt?:number}}}).sessions.getByUser('bob').ringAt=0;// the earlier call's cooldown
    result=await bob.send('factory.ring');assert.equal(result.ok,true);assert.match(result.message,/Chamando/);
    await eventually(()=>alice.results.some(each=>each.action==='ring'&&/bob/.test(each.message)));
    result=await alice.send('factory.gate',{action:'dismiss'});assert.equal(result.ok,true);
    await eventually(()=>bob.results.some(each=>each.action==='ring.sent'&&!each.ok&&/não vai abrir/.test(each.message)));
    await new Promise(resolve=>setTimeout(resolve,1100));// the room limits these commands to 4 a second
    result=await alice.send('factory.gate',{action:'open'});assert.equal(result.ok,true,result.message);
    await eventually(()=>door(GATE.id).open===true);
    hold().gateHoldUntil=0;await new Promise(resolve=>setTimeout(resolve,800));assert.equal(door(GATE.id).open,true,'aberto pelo menu fica aberto');
    result=await alice.send('factory.gate',{action:'close'});assert.equal(result.ok,true);
    await eventually(()=>door(GATE.id).open===false);

    // E on a manual door (the workshop's): the bar's door mechanism, the leaf's box turning with it; somebody behind it refuses.
    const c=WORKSHOP.collider;
    alice.stand(c.x-.14,c.z+1.4);
    alice.joined.send('player.interact',{objectId:WORKSHOP.id});
    await eventually(()=>door(WORKSHOP.id).open===true);await eventually(()=>seen(WORKSHOP.id)?.open===true);
    await new Promise(resolve=>setTimeout(resolve,WORKSHOP.seconds*1000+300));
    assert.ok(boxOf(WORKSHOP.id).turn,`a caixa girou com a folha (${JSON.stringify(boxOf(WORKSHOP.id).turn)})`);
    bob.stand(WORKSHOP.origin[0]-.4,WORKSHOP.origin[2]+.4);
    const errors:string[]=[];alice.joined.onMessage('error',message=>errors.push(message.message));
    alice.joined.send('player.interact',{objectId:WORKSHOP.id});await eventually(()=>errors.some(message=>/Tem alguém no caminho da porta/.test(message)));
    assert.equal(door(WORKSHOP.id).open,true,'não fecha em cima de quem está no arco');
    bob.stand(c.x+30,c.z);
    alice.joined.send('player.interact',{objectId:WORKSHOP.id});await eventually(()=>door(WORKSHOP.id).open===false);
    assert.equal(FACTORY_GATES.filter(gate=>gate.mode==='manual').length,3);void ROLLER;
  }finally{
    for(const joined of rooms)await joined.leave().catch(()=>{});
    await server.gracefullyShutdown(false).catch(()=>{});await new Promise<void>(resolve=>internal.close(()=>resolve()));
    if(previousApi===undefined)delete process.env.API_INTERNAL_URL;else process.env.API_INTERNAL_URL=previousApi;
  }
});
