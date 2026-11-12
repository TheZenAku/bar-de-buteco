import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import type {AddressInfo} from 'node:net';
import {Server} from '@colyseus/core';import {WebSocketTransport} from '@colyseus/ws-transport';import {Client,type Room} from '@colyseus/sdk';
import {NEEDS,INTERACTABLES,consumeMs,type Badge} from '@bar/shared';import {signTicket} from '@bar/shared/tickets';
import {BarRoom} from '../src/BarRoom.js';
import {AchievementTracker} from '../src/world/achievements.js';
async function until(check:()=>boolean,ms=8000):Promise<void>{const deadline=Date.now()+ms;while(!check()){if(Date.now()>deadline)throw new Error('Timed out');await new Promise(r=>setTimeout(r,20));}}
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));

test('tracker: parts add up to whole numbers, repeats too close do not count, a failed report comes back',()=>{
  const tracker=new AchievementTracker();
  for(let i=0;i<20;i++)tracker.add('a','bebum',.05);
  assert.deepEqual(tracker.take(),[{userId:'a',series:'bebum',amount:1}],'twenty sips of 5% are one beer, despite the rounding');
  assert.deepEqual(tracker.take(),[]);
  tracker.add('a','andarilho',2.5);
  assert.deepEqual(tracker.take(),[{userId:'a',series:'andarilho',amount:2}]);
  tracker.add('a','andarilho',.5);
  assert.deepEqual(tracker.take(),[{userId:'a',series:'andarilho',amount:1}],'what was left over is not lost');
  // A wave counts once every ten seconds, each player on their own.
  tracker.add('a','gente-boa',1,1000);tracker.add('a','gente-boa',1,2000);tracker.add('b','gente-boa',1,2000);tracker.add('a','gente-boa',1,11001);
  assert.deepEqual(tracker.take(),[{userId:'a',series:'gente-boa',amount:2},{userId:'b',series:'gente-boa',amount:1}]);
  tracker.add('a','nao-existe');tracker.add('a','bebum',0);
  assert.deepEqual(tracker.take(),[]);
  tracker.giveBack([{userId:'a',series:'bebum',amount:3}]);
  assert.deepEqual(tracker.take(),[{userId:'a',series:'bebum',amount:3}]);
});

const BADGE:Badge={id:'bebum-1',name:'Bebum I',description:'Tomou 10 cervejas.',icon:'beer',color:'#aeb6c8',rarity:'common',image:null};

test('the world reports what players do, and tells them about their badges',{timeout:180000},async()=>{
  const previous=process.env.API_INTERNAL_URL,reports:Array<{events:Array<{userId:string;series:string;amount:number}>;online:string[]}>=[];
  let unlocked:Array<{userId:string;badge:Badge}>=[],down=false;
  const api=createServer(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk;
    res.setHeader('content-type','application/json');
    if(req.url?.endsWith('/achievements')){
      if(down){res.statusCode=503;res.end('{}');return;}
      reports.push(JSON.parse(body));res.end(JSON.stringify({unlocked}));unlocked=[];return;
    }
    res.end(JSON.stringify(req.url?.endsWith('/validate')?{valid:true,blocked:[],role:'user',equippedSkin:'nathan',ownedSkins:['nathan']}:req.url?.endsWith('/controls/lease')?{controls:[]}:{ok:true}));
  });
  await new Promise<void>(r=>api.listen(0,'127.0.0.1',r));process.env.API_INTERNAL_URL=`http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});let authoritative!:BarRoom;
  server.define('bar',BarRoom).on('create',room=>{authoritative=room as BarRoom;});await server.listen(0,'127.0.0.1');
  const client=new Client(`http://127.0.0.1:${(http.address() as AddressInfo).port}`),rooms:Room[]=[];
  const join=async(id:string,extra:object={})=>{const room=await client.joinOrCreate('bar',{ticket:signTicket({userId:id,sessionId:`session-${id}`,displayName:id,role:'user',color:'#aa8844',...extra})});rooms.push(room);await until(()=>!!authoritative?.state.players.get(id));return room;};
  const total=(userId:string,series:string)=>reports.flatMap(report=>report.events).filter(event=>event.userId===userId&&event.series===series).reduce((sum,event)=>sum+event.amount,0);
  /** A whole round trip with the API after what was just done. */
  const reported=async()=>{const seen=reports.length;await until(()=>reports.length>=seen+2);};
  try {
    const a=await join('ach-a'),b=await join('ach-b'),got:Badge[]=[],chatB:string[]=[];
    a.onMessage('achievement.unlocked',(message:{badge:Badge})=>got.push(message.badge));
    b.onMessage('chat.message',m=>chatB.push(m.text));
    const player=authoritative.state.players.get('ach-a')!,other=authoritative.state.players.get('ach-b')!;
    player.assign({x:12,y:.3,z:-6});other.assign({x:12,y:.3,z:-4});
    await reported();
    assert.ok(reports.at(-1)!.online.includes('ach-a'),'who is here goes in the report');

    // Having something counts at the start, in full (startHolding applies the effects); spilling it later takes nothing back.
    const have=(item:string)=>(authoritative as unknown as {startHolding(p:unknown,i:string,now:number):void}).startHolding(player,item,Date.now());
    const finish=async()=>{player.holdingUntil=Date.now();await until(()=>!player.holding);};
    have('garrafa');await finish();
    have('copo');await until(()=>authoritative.needs.state('ach-a').drunk>0);await pause(100);(authoritative as unknown as {dropHolding(p:unknown):void}).dropHolding(player);
    await reported();
    assert.equal(total('ach-a','bebum'),2,'a beer and a spilled glass: both were had');
    // Other things in hand count where they belong.
    have('cafe');await finish();await reported();
    assert.equal(total('ach-a','cafeinado'),1);assert.equal(total('ach-a','bebum'),2);

    // A wave counts once, however many are sent; chat only with someone to hear it.
    a.send('player.emote',{emote:'wave'});a.send('player.emote',{emote:'wave'});
    a.send('chat.send',{text:'Alguém aí?'});
    await until(()=>chatB.includes('Alguém aí?'));await reported();
    assert.equal(total('ach-a','gente-boa'),1);assert.equal(total('ach-a','resenha'),1);
    other.assign({x:80,y:.3,z:80});await pause(100);
    b.send('chat.send',{text:'Só eu aqui.'});await reported();
    assert.equal(total('ach-b','resenha'),0,'nobody around: it does not count');
    other.assign({x:12,y:.3,z:-4});

    // Walking is the distance really covered, on the server's own positions.
    for(let seq=0;seq<30;seq++){a.send('player.input',{seq,dx:seq%16<8?1:-1,dz:0,running:false,rotation:0});await pause(50);}
    await pause(200);player.assign({x:12,y:.3,z:-6});
    await reported();
    const metres=total('ach-a','andarilho');
    assert.ok(metres>=1&&metres<40,`walked ${metres} m in 1.5 s, in whole metres`);

    // The toilet: a full visit with something in the bladder. An empty one counts for nothing.
    const toilet=INTERACTABLES.find(i=>i.id==='toilet-1')!;
    authoritative.needs.state('ach-a').bladder=0;await pause(100);
    player.assign({x:toilet.x,y:toilet.y,z:toilet.z+.7});await pause(100);
    a.send('player.interact',{objectId:'toilet-1'});await until(()=>player.interactionState==='toilet-1');
    await until(()=>player.interactionState==='',NEEDS.bladder.toiletSeconds*1000+2000);
    await reported();assert.equal(total('ach-a','bexiga-solta'),0);
    authoritative.needs.state('ach-a').bladder=80;await until(()=>player.bladder===80);
    a.send('player.interact',{objectId:'toilet-1'});await until(()=>player.interactionState==='toilet-1');
    await until(()=>player.interactionState==='',NEEDS.bladder.toiletSeconds*1000+2000);
    await reported();assert.equal(total('ach-a','bexiga-solta'),1);
    player.assign({x:12,y:.3,z:-6});

    // Time: being here and dancing, read every few seconds.
    a.send('player.emote',{emote:'dance'});await until(()=>player.animationState==='dance');
    await pause(5600);await reported();
    assert.ok(total('ach-a','frequentador')>=5,`${total('ach-a','frequentador')} s in the city`);
    assert.ok(total('ach-a','pe-de-valsa')>=4,`${total('ach-a','pe-de-valsa')} s dancing`);
    assert.equal(total('ach-b','pe-de-valsa'),0);
    a.send('player.emote',{emote:'idle'});

    // The API out for a while: nothing is lost.
    const before=total('ach-a','gente-boa');down=true;await pause(3500);
    have('garrafa');await finish();await pause(3500);down=false;
    await reported();assert.equal(total('ach-a','bebum'),3);assert.equal(total('ach-a','gente-boa'),before);

    // A badge: the player hears it, the common one stays between them.
    unlocked=[{userId:'ach-a',badge:BADGE}];
    await until(()=>got.length===1);assert.deepEqual(got[0],BADGE);
    assert.equal(chatB.some(text=>text.includes('Bebum I')),false);
    // The room no longer announces badges in the chat (system messages were removed): rare and legendary ones reach only their owner.
    unlocked=[{userId:'ach-a',badge:{...BADGE,name:'Bebum III',rarity:'rare'}}];await until(()=>got.length===2);
    unlocked=[{userId:'ach-a',badge:{...BADGE,name:'Bebum IV',rarity:'legendary'}}];await until(()=>got.length===3);
    await pause(200);assert.equal(chatB.some(text=>text.includes('Bebum')),false);

    // Development bots earn nothing and are never asked about.
    const bot=await join('ach-bot',{bot:true});const botPlayer=authoritative.state.players.get('ach-bot')!;
    bot.send('player.emote',{emote:'wave'});await until(()=>botPlayer.animationState==='wave');await reported();
    assert.equal(total('ach-bot','gente-boa'),0);assert.equal(reports.at(-1)!.online.includes('ach-bot'),false);
  } finally {
    await Promise.allSettled(rooms.filter(room=>room.connection?.isOpen).map(room=>room.leave()));await server.gracefullyShutdown(false);await new Promise<void>(r=>api.close(()=>r()));
    if(previous===undefined)delete process.env.API_INTERNAL_URL;else process.env.API_INTERNAL_URL=previous;
  }
});
