import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {AddressInfo} from 'node:net';
import {Client,type Room} from '@colyseus/sdk';
import {signTicket} from '@bar/shared/tickets';

const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const until=async<T>(check:()=>Promise<T|undefined|false>|T|undefined|false,ms=60000):Promise<T>=>{const end=Date.now()+ms;for(;;){const value=await check();if(value)return value;if(Date.now()>end)throw new Error('Timed out');await wait(200);}};

test('WORLD_SHARDS=2: the gateway spreads players over two world processes and routes each socket to its own',async()=>{
  const api=createServer((req,res)=>{
    res.setHeader('content-type','application/json');
    if(req.url==='/api/internal/validate')res.end(JSON.stringify({valid:true,banned:false,role:'user',blocked:[],equippedSkin:'nathan',ownedSkins:['nathan']}));
    else if(req.url==='/api/internal/controls/lease')res.end('{"controls":[]}');
    else res.end('{"ok":true}');
  });
  await new Promise<void>(resolve=>api.listen(0,'127.0.0.1',resolve));
  // Three consecutive free ports: the gateway on the first, the worlds after it.
  const probe=createServer();await new Promise<void>(resolve=>probe.listen(0,'127.0.0.1',resolve));
  const port=(probe.address() as AddressInfo).port;await new Promise(resolve=>probe.close(resolve));
  const gateway=spawn(process.execPath,[...process.execArgv,join(import.meta.dirname,'../src/index.ts')],{stdio:'inherit',env:{...process.env,NODE_ENV:'test',GAME_PORT:String(port),HOST:'127.0.0.1',WORLD_SHARDS:'2',ROOM_CAPACITY:'2',
    API_INTERNAL_URL:`http://127.0.0.1:${(api.address() as AddressInfo).port}`,WORLD_OUTBOX_PATH:join(tmpdir(),`bar-gateway-test-${process.pid}.jsonl`),YOUTUBE_OEMBED_URL:'off',ACCESS_RECHECK_MS:'0'}});
  const rooms:Room[]=[];
  const health=async()=>{try{return await (await fetch(`http://127.0.0.1:${port}/health`)).json() as {ok:boolean;shards:{up:boolean;players:number}[]};}catch{return undefined;}};
  try{
    await until(async()=>{const h=await health();return h?.shards.every(s=>s.up)?h:undefined;});
    const client=new Client(`http://127.0.0.1:${port}`);
    const join=async(name:string)=>{
      const room=await client.joinOrCreate('bar',{ticket:signTicket({userId:name,sessionId:`s-${name}`,displayName:name,role:'user',color:'#abcdee'})});
      rooms.push(room);room.onMessage('error',()=>{});room.onMessage('chat.message',()=>{});
      await until(()=>room.state?.players?.get(name)?.connected);return room;
    };
    const first=await join('p1');
    // The gateway counts who it sent since the last poll, so the second player goes to the other world.
    const second=await join('p2');
    assert.notEqual(first.roomId,second.roomId);
    const spread=await until(async()=>{const h=await health();return h&&h.shards.every(s=>s.players===1)?h:undefined;});
    assert.equal(spread.shards.length,2);
    // Two more fill both worlds (2 each); a fifth finds no place.
    await join('p3');await join('p4');
    await assert.rejects(()=>join('p5'),/cheio|BAR_FULL|full/i);
    // Each socket stays in its own world: everyone is still connected and sees only their world's people.
    assert.ok(rooms.every(room=>room.connection.isOpen));assert.equal(first.state.players.size,2);
  }finally{
    await Promise.allSettled(rooms.filter(room=>room.connection?.isOpen).map(room=>room.leave()));
    gateway.kill();await new Promise<void>(resolve=>api.close(()=>resolve()));
  }
});
