import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';import {WebSocketTransport} from '@colyseus/ws-transport';import {Client,type Room} from '@colyseus/sdk';
import {LIGHT_DESK,STAGE,showMoment,type StageShowState} from '@bar/shared';import {signTicket} from '@bar/shared/tickets';
import {BarRoom} from '../src/BarRoom.js';
async function until(check:()=>boolean,ms=8000):Promise<void>{const deadline=Date.now()+ms;while(!check()){if(Date.now()>deadline)throw new Error('Timed out');await new Promise(r=>setTimeout(r,25));}}
// Where the admin stood at the desk, a centimetre off the sound desk.
const AT_DESK={x:LIGHT_DESK.x,y:LIGHT_DESK.y,z:LIGHT_DESK.z+.01};
test('the light desk over real WebSockets: opened from the stage, settings and cues for everyone, refused away from it',{timeout:60000},async()=>{
  const previous=process.env.API_INTERNAL_URL;
  const api=createServer(async(req,res)=>{for await(const _ of req);res.setHeader('content-type','application/json');
    res.end(JSON.stringify(req.url?.endsWith('/validate')?{valid:true,blocked:[],role:'user',equippedSkin:'nathan',ownedSkins:['nathan'],balance:1000}:req.url?.endsWith('/controls')?{controls:[]}:{ok:true}));});
  await new Promise<void>(r=>api.listen(0,'127.0.0.1',r));process.env.API_INTERNAL_URL=`http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});let room!:BarRoom;
  server.define('bar',BarRoom).on('create',created=>{room=created as BarRoom;});await server.listen(0,'127.0.0.1');
  const client=new Client(`http://127.0.0.1:${(http.address() as AddressInfo).port}`),rooms:Room[]=[];
  const join=async(id:string)=>{
    const joined=await client.joinOrCreate('bar',{ticket:signTicket({userId:id,sessionId:`session-${id}`,displayName:id,role:'user',color:'#aa8844'})});rooms.push(joined);
    const errors:string[]=[],opened:number[]=[];joined.onMessage('error',m=>errors.push(m.message));joined.onMessage('lights.open',()=>opened.push(Date.now()));
    for(const type of ['chat.message','inventory.state','job.state','wallet.state'])joined.onMessage(type,()=>{});
    await until(()=>!!room?.state.players.get(id));
    return {id,room:joined,errors,opened,player:()=>room.state.players.get(id)!};
  };
  try{
    const dj=await join('dj'),bia=await join('bia');
    const shown=(who:typeof dj)=>who.room.state.stageShow?.toJSON() as StageShowState|undefined;
    // Everyone starts with the house show.
    await until(()=>shown(bia)?.preset==='casa');
    assert.deepEqual([shown(bia)!.power,shown(bia)!.bpm,shown(bia)!.text],['auto',124,'HIGHLAND']);
    // Down in the backyard nobody touches the show.
    dj.player().assign({x:STAGE.deck.x,y:STAGE.deck.minY,z:STAGE.deck.z+STAGE.deck.hz+1});
    dj.room.send('show.set',{power:'on'});
    await until(()=>dj.errors.some(e=>e.includes('mesa de luz')));
    dj.room.send('player.interact',{objectId:'light-desk'});
    await until(()=>dj.errors.some(e=>e.includes('Chegue mais perto')));
    assert.equal(room.state.stageShow.power,'auto');
    // Up at the desk (with a pass), E opens the panel, facing the sound desk.
    dj.player().assign({...AT_DESK,rotation:0,stageUntil:Date.now()+600_000});
    dj.room.send('player.interact',{objectId:'light-desk'});
    await until(()=>dj.opened.length===1);
    assert.ok(Math.abs(dj.player().rotation-LIGHT_DESK.rotation)<1e-3);
    // A change is everyone's: the letreiro fixed, a new tempo and text.
    const before=Date.now();
    dj.room.send('show.set',{mode:'fixed',program:'letreiro',bpm:140,text:'Boa noite!',palette:'brasil',strobe:30});
    await until(()=>shown(bia)?.program==='letreiro'&&shown(bia)?.text==='BOA NOITE!');
    const seen=shown(bia)!;
    assert.deepEqual([seen.mode,seen.bpm,seen.palette,seen.strobe,seen.updatedBy,seen.preset],['fixed',140,'brasil',30,'dj','']);
    assert.ok(seen.updatedAt>=before&&seen.revision>=1);
    assert.equal(showMoment(seen,Date.now()).program,'letreiro');
    // A scene comes with its name; a cue fires for everyone at once.
    dj.room.send('show.set',{power:'on',mode:'cycle',playlist:['ceu','foco'],bars:4,preset:'minha:Fim de noite'});
    await until(()=>shown(bia)?.preset==='minha:Fim de noite');
    dj.room.send('show.cue',{cue:'drop'});
    await until(()=>shown(bia)?.cue==='drop');
    assert.ok(Math.abs(shown(bia)!.cueAt-Date.now())<2000);assert.equal(showMoment(shown(bia)!,Date.now()).cue?.id,'drop');
    // What the desk cannot send is refused, and the show stays as it was.
    const errors=dj.errors.length,revision=room.state.stageShow.revision;
    dj.room.send('show.set',{bpm:400});dj.room.send('show.cue',{cue:'fogos'});
    await until(()=>dj.errors.length>=errors+2);
    assert.ok(dj.errors.slice(errors).every(e=>e==='Comando inválido.'));assert.equal(room.state.stageShow.revision,revision);
    // Leaving the desk ends the control.
    dj.player().assign({x:LIGHT_DESK.x+3,y:LIGHT_DESK.y,z:LIGHT_DESK.z+1});
    const refused=dj.errors.length;dj.room.send('show.set',{power:'off'});
    await until(()=>dj.errors.length>refused);assert.equal(room.state.stageShow.power,'on');
  }finally{
    await Promise.allSettled(rooms.filter(r=>r.connection?.isOpen).map(r=>r.leave()));
    await server.gracefullyShutdown(false).catch(()=>{});api.close();
    if(previous===undefined)delete process.env.API_INTERNAL_URL;else process.env.API_INTERNAL_URL=previous;
  }
});
