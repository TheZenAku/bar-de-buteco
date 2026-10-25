import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {writeFile,mkdir} from 'node:fs/promises';
import {cpus,platform,totalmem} from 'node:os';
import type {AddressInfo} from 'node:net';
import {monitorEventLoopDelay} from 'node:perf_hooks';
import {Server} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {Client,type Room} from '@colyseus/sdk';
import {createApi} from '../../apps/api/src/app.js';
import {readConfig} from '../../apps/api/src/config.js';
import * as schema from '../../apps/api/src/database/schema.js';
import {createSession,hashPassword} from '../../apps/api/src/auth/service.js';
import {BarRoom} from '../../apps/server/src/BarRoom.js';
import {signTicket} from '@bar/shared/tickets';
import {DEFAULT_CHARACTER} from '@bar/shared';

const count=Math.max(2,Math.min(64,Number(process.env.LOAD_CLIENTS)||32));
const durationMs=Math.max(5000,Number(process.env.LOAD_DURATION_MS)||30000);
process.env.ROOM_CAPACITY=String(count);
const config={...readConfig(),production:false,dataPath:'memory://',databaseUrl:undefined,mailEnabled:true,smtpHost:undefined};
const {app,db}=await createApi({config,rateLimit:false,migrate:true});
await app.listen({port:0,host:'127.0.0.1'});
process.env.API_INTERNAL_URL=`http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
const http=createServer();
const server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});
server.define('bar',BarRoom);
await server.listen(0,'127.0.0.1');
const client=new Client(`http://127.0.0.1:${(http.address() as AddressInfo).port}`);
const rooms:Array<{room:Room;id:string;seq:number}>=[];
const rtts:number[]=[],failures:string[]=[];
let patches=0,timer:ReturnType<typeof setInterval>|undefined,pingTimer:ReturnType<typeof setInterval>|undefined;
const loop=monitorEventLoopDelay({resolution:10});loop.enable();
const passwordHash=await hashPassword('LoadTestOnly2026!');
const began=Date.now();
try{
  for(let i=0;i<count;i++){
    const id=randomUUID();
    await db.insert(schema.users).values({id,email:`load-${id}@example.com`,username:`load_${id.slice(0,8)}`,passwordHash,verified:true});
    await db.insert(schema.profiles).values({userId:id,displayName:`Teste ${i+1}`,avatarConfig:{color:'#ae884e'},characterConfig:DEFAULT_CHARACTER});
    const session=await createSession(db,id);
    const ticket=signTicket({userId:id,sessionId:session.session.id,displayName:`Teste ${i+1}`,color:'#ae884e',role:'user'},config.authSecret);
    const room=await client.joinOrCreate('bar',{ticket});
    room.onMessage('error',message=>failures.push(message.message));room.onMessage('chat.message',()=>{});
    room.onMessage('pong',message=>rtts.push(Date.now()-message.at));room.onStateChange(()=>patches++);
    room.onError((_code,message)=>failures.push(message||'room error'));
    rooms.push({room,id,seq:0});
  }
  const joinedMs=Date.now()-began;
  timer=setInterval(()=>rooms.forEach(({room},index)=>{
    const item=rooms[index],phase=Math.floor((Date.now()-began)/2500)%4;
    room.send('player.input',{seq:++item.seq,dx:phase===0?1:phase===2?-1:0,dz:phase===1?-1:phase===3?1:0,running:index%2===0,rotation:0});
  }),50);
  pingTimer=setInterval(()=>rooms.forEach(({room})=>room.send('ping',{at:Date.now()})),1000);
  await new Promise(resolve=>setTimeout(resolve,durationMs));
  if(rooms.some(({room})=>room.state.occupancy!==count))failures.push('Occupancy differs across clients');
  if(new Set(rooms.map(({room})=>room.roomId)).size!==1)failures.push('Clients split across rooms');
  rtts.sort((a,b)=>a-b);
  const percentile=(p:number)=>rtts[Math.min(rtts.length-1,Math.floor(rtts.length*p))]??null;
  const report={timestamp:new Date().toISOString(),scenario:'API + PostgreSQL embutido + Colyseus + SDK no mesmo processo, loopback; sem renderização 3D',clients:count,durationMs,joinedMs,patches,rttSamples:rtts.length,rttMedianMs:percentile(.5),rttP95Ms:percentile(.95),rttMaxMs:rtts.at(-1),eventLoopP95Ms:Number((loop.percentile(95)/1e6).toFixed(2)),rssMiB:Math.round(process.memoryUsage().rss/1024/1024),hardware:{platform:platform(),cpu:cpus()[0]?.model,logicalCpus:cpus().length,ramGiB:Math.round(totalmem()/1024**3)},failures};
  await mkdir('test-results',{recursive:true});await writeFile('test-results/load-report.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));if(failures.length)process.exitCode=1;
}finally{clearInterval(timer);clearInterval(pingTimer);loop.disable();await Promise.allSettled(rooms.map(({room})=>room.leave()));await server.gracefullyShutdown(false);await app.close();}
