import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {Client as BrowserClient,type Room as ClientRoom} from '@colyseus/sdk';
import {CITY_MARKERS,FACTORY_UNIFORM,SKINS,skinSchema} from '@bar/shared';
import {signTicket} from '@bar/shared/tickets';
import {BarRoom} from '../src/BarRoom.js';

async function eventually(check:()=>boolean,timeout=5000):Promise<void> {
  const deadline=Date.now()+timeout;
  while(!check()){if(Date.now()>deadline)throw new Error('Condition timed out');await new Promise(resolve=>setTimeout(resolve,20));}
}
const at=(name:string)=>CITY_MARKERS[name]!;

test('the uniform is not a card: the client schema cannot ask for it and the collection does not hold it',()=>{
  assert.equal(skinSchema.safeParse(FACTORY_UNIFORM).success,false);
  assert.equal(SKINS.some(skin=>(skin.id as string)===FACTORY_UNIFORM),false);
});

test('EMPRESA BRASIL uniform: worn exactly while the PPE is on during a shift, whatever ends it, and the account skin comes back',{timeout:40_000},async()=>{
  const previousApi=process.env.API_INTERNAL_URL;
  let equipped='rafael';const equipCalls:string[]=[];
  const internal=createServer(async(req,res)=>{
    let data='';for await(const chunk of req)data+=chunk;
    const body=data?JSON.parse(data):{};res.setHeader('content-type','application/json');const url=req.url??'';
    const access=()=>({valid:body.sessionId==='session-alice',blocked:[],role:'user',balance:1000,equippedSkin:equipped,ownedSkins:SKINS.map(s=>s.id),ownedSkills:[]});
    if(url==='/api/internal/validate')res.end(JSON.stringify(access()));
    else if(url==='/api/internal/equip'){equipCalls.push(body.skin);equipped=body.skin;res.end(JSON.stringify(access()));}
    else if(url==='/api/internal/controls')res.end('{"controls":[]}');
    else if(url==='/api/internal/employment'){
      if(body.action==='view')res.end(JSON.stringify({employment:{jobId:'spray-dry-operator',status:'hired',hiredAt:new Date().toISOString()},shift:null,config:{}}));
      else if(body.action==='start')res.end(JSON.stringify({shift:{startedAt:new Date().toISOString(),earned:0,station:'entrada'}}));else res.end('{"closed":0}');
    }else if(url==='/api/internal/factory'){
      if(body.action==='view')res.end(JSON.stringify({state:null,revision:0,slots:[],settings:[]}));
      else if(body.action==='orders')res.end('{"orders":[]}');
      else if(body.action==='shipment.list')res.end('{"shipments":[]}');
      else if(body.action==='finance.get')res.end(JSON.stringify({finance:{palletPrice:5000,taxPercent:15,employeeFee:2000,ownerUserId:'',freightBase:400,freightPerKm:1500,freightPerPallet:200,purchaseFreight:600,maxPalletsPerTruck:10,deliveryRadius:14}}));
      else if(body.action==='treasury.get')res.end('{"balance":0,"ledger":[]}');
      else if(body.action==='shipment.summary')res.end('{"summary":{}}');
      else res.end('{"ok":true}');
    }else res.end('{"ok":true}');
  });
  await new Promise<void>(resolve=>internal.listen(0,'127.0.0.1',resolve));
  process.env.API_INTERNAL_URL=`http://127.0.0.1:${(internal.address() as AddressInfo).port}`;
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});
  let room:BarRoom|undefined;server.define('bar',BarRoom).on('create',created=>{room=created as BarRoom;});
  await server.listen(0,'127.0.0.1');
  const client=new BrowserClient(`http://127.0.0.1:${(http.address() as AddressInfo).port}`);
  let alice:ClientRoom|undefined;
  try{
    alice=await client.joinOrCreate('bar',{ticket:signTicket({userId:'alice',sessionId:'session-alice',displayName:'alice',role:'user',color:'#aa8844'})});
    const results:Array<{action:string;ok:boolean;message:string}>=[],errors:string[]=[],ppeMessages:boolean[]=[];
    alice.onMessage('factory.result',message=>results.push(message));alice.onMessage('error',(m:{message:string})=>errors.push(m.message));alice.onMessage('factory.ppe',(m:{on:boolean})=>ppeMessages.push(m.on));
    for(const name of ['employment.state','chat.message','wallet.state','factory.state','factory.paid','food.state'])alice.onMessage(name,()=>{});
    await eventually(()=>alice!.state?.players?.has('alice'));
    const player=room!.state.players.get('alice')!,factory=room!.factory,presence=()=>(room as any).sessions.getByUser('alice');
    await eventually(()=>player.skin==='rafael');
    const stand=(marker:string)=>{const p=at(marker);Object.assign(player,{x:p.x,y:p.y,z:p.z});};
    // The room's answer to what the player did (the rate limits are per message and second: a pause keeps every command inside them).
    const send=async(type:string,payload:unknown)=>{await new Promise(resolve=>setTimeout(resolve,400));const count=results.length+1;alice!.send(type,payload);await eventually(()=>results.length>=count,3000);return results[results.length-1]!;};
    await eventually(()=>factory.seeded);
    stand('Ponto_EB_Entrada_Pessoal');

    // 1. Without a shift the PPE is refused and nothing changes: the uniform never leaves the plant on an off-shift player.
    let result=await send('factory.ppe',{on:true});
    assert.equal(result.ok,false);assert.match(result.message,/expediente/i);assert.equal(player.skin,'rafael');assert.equal(presence().factoryPpe,undefined);

    // 2. On shift, taking the PPE changes the skin at once, and the account's own skin is remembered by the room only.
    assert.equal((await send('employment.shift',{on:true,requestId:crypto.randomUUID()})).ok,true);
    assert.equal(player.skin,'rafael','the shift alone changes nothing');
    result=await send('factory.ppe',{on:true});assert.equal(result.ok,true,result.message);
    assert.equal(player.skin,FACTORY_UNIFORM);assert.equal(presence().civilSkin,'rafael');assert.equal(equipped,'rafael','the account keeps its own skin');
    await eventually(()=>alice!.state.players.get('alice')?.skin===FACTORY_UNIFORM);

    // 3. A client cannot ask for the uniform, and equipping another skin meanwhile only changes what comes back.
    alice.send('player.skin',{skin:FACTORY_UNIFORM});await new Promise(resolve=>setTimeout(resolve,400));
    assert.equal(equipCalls.length,0,'the API is never asked to equip the uniform');assert.equal(player.skin,FACTORY_UNIFORM);
    alice.send('player.skin',{skin:'leandro'});await eventually(()=>equipCalls.includes('leandro'));await new Promise(resolve=>setTimeout(resolve,200));
    assert.equal(player.skin,FACTORY_UNIFORM,'the uniform stays on while the PPE is on');assert.equal(presence().civilSkin,'leandro');

    // 4. Taking the PPE off gives the account's skin back (the one equipped last).
    result=await send('factory.ppe',{on:false});assert.equal(result.ok,true,result.message);
    assert.equal(player.skin,'leandro');assert.equal(presence().factoryPpe,false);assert.equal(room!.state.players.get('alice')!.skin,'leandro');

    // 5. Not while the body is busy: seated or riding keeps its model, and the PPE is not put on.
    player.interactionState='moto:t1';
    result=await send('factory.ppe',{on:true});assert.equal(result.ok,false);assert.match(result.message,/trocar de roupa/);assert.equal(player.skin,'leandro');assert.notEqual(presence().factoryPpe,true);
    player.interactionState='';

    // 6. Ending the shift (the button) takes the uniform off together with the PPE.
    result=await send('factory.ppe',{on:true});assert.equal(result.ok,true,result.message);assert.equal(player.skin,FACTORY_UNIFORM);
    result=await send('employment.shift',{on:false,requestId:crypto.randomUUID()});assert.equal(result.ok,true);
    assert.equal(player.skin,'leandro');assert.equal(presence().factoryPpe,false);assert.equal((room as any).uniformed.has('alice'),false);

    // 7. A shift that ends some other way (the administration dismisses, the schedule closes) cannot leave the uniform on: the room reconciles on its own.
    assert.equal((await send('employment.shift',{on:true,requestId:crypto.randomUUID()})).ok,true);
    result=await send('factory.ppe',{on:true});assert.equal(result.ok,true,result.message);assert.equal(player.skin,FACTORY_UNIFORM);
    (room as any).factoryWorkers.delete('alice');
    await eventually(()=>player.skin==='leandro');assert.equal(presence().factoryPpe,false,'the PPE does not outlive the shift');
    // ... and a later shift does not bring the old PPE back.
    assert.equal((await send('employment.shift',{on:true,requestId:crypto.randomUUID()})).ok,true);
    await new Promise(resolve=>setTimeout(resolve,200));assert.equal(player.skin,'leandro');

    // 8. Leaving the game in uniform leaves the avatar in the bar in its own clothes.
    result=await send('factory.ppe',{on:true});assert.equal(result.ok,true,result.message);assert.equal(player.skin,FACTORY_UNIFORM);
    await alice.leave();alice=undefined;
    await eventually(()=>!(room as any).sessions.getByUser('alice'));
    assert.equal(room!.state.players.get('alice')?.skin,'leandro');assert.equal((room as any).uniformed.has('alice'),false);
    assert.deepEqual(errors.filter(message=>/inválido/i.test(message)).length,1,'only the forged uniform request was refused as invalid');
  }finally{
    await alice?.leave().catch(()=>{});await server.gracefullyShutdown(false).catch(()=>{});await new Promise<void>(resolve=>internal.close(()=>resolve()));
    if(previousApi===undefined)delete process.env.API_INTERNAL_URL;else process.env.API_INTERNAL_URL=previousApi;
  }
});
