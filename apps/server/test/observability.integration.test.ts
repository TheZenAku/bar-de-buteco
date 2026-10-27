import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import type {AddressInfo} from 'node:net';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {Server} from '@colyseus/core';import {WebSocketTransport} from '@colyseus/ws-transport';
import {authSecret,internalSecret} from '@bar/shared/tickets';
import {BarRoom} from '../src/BarRoom.js';
import {worldRouter} from '../src/http.js';
import {health,logLine,pseudonym} from '../src/observability.js';

const until=async(check:()=>boolean|Promise<boolean>)=>{const deadline=Date.now()+5000;while(!await check()){if(Date.now()>deadline)throw new Error('Timed out');await new Promise(r=>setTimeout(r,25));}};

test('world readiness, protected metrics and correlated internal requests',{timeout:30000},async()=>{
  const previous=process.env.API_INTERNAL_URL,previousAuth=process.env.AUTH_SECRET,previousInternal=process.env.INTERNAL_SECRET,requestIds:string[]=[],internalKeys:string[]=[];let apiUp=true;
  process.env.AUTH_SECRET='world-auth-secret-distinct-and-at-least-thirty-two-characters';
  process.env.INTERNAL_SECRET='world-internal-secret-distinct-and-at-least-thirty-two-characters';
  const api=createServer(async(req,res)=>{for await(const _ of req){}
    requestIds.push(String(req.headers['x-request-id']));
    internalKeys.push(String(req.headers['x-internal-secret']));
    if(!apiUp){res.statusCode=503;res.end('{}');return;}
    res.setHeader('content-type','application/json');res.end(req.url?.endsWith('/controls/lease')?'{"controls":[]}':'{"ok":true}');});
  await new Promise<void>(r=>api.listen(0,'127.0.0.1',r));process.env.API_INTERNAL_URL=`http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});
  server.router=worldRouter();let room:BarRoom|undefined;
  server.define('bar',BarRoom).on('create',created=>{room=created as BarRoom;});
  await server.listen(0,'127.0.0.1');const base=`http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  try{
    health.apiOkAt=0;
    assert.equal((await fetch(`${base}/health`)).status,200);
    const before=await fetch(`${base}/ready`);assert.equal(before.status,503,'No bar yet: not ready');
    assert.deepEqual((await before.json()).checks.room,false);
    // Create the bar the way a player would; then the first maintenance round trip makes it ready.
    const {matchMaker}=await import('@colyseus/core');await matchMaker.createRoom('bar',{});
    await until(()=>!!room);await (room as any).maintenance();
    const ready=await fetch(`${base}/ready`);assert.equal(ready.status,200,JSON.stringify(await ready.clone().json()));
    // Every internal call carries its own correlation id.
    assert.ok(requestIds.length>=1&&requestIds.every(id=>/^world-[0-9a-f-]{36}$/.test(id)),JSON.stringify(requestIds));
    assert.ok(internalKeys.every(secret=>secret===internalSecret()),'World-to-API calls use INTERNAL_SECRET, never the ticket key');
    // The API stops answering: the world reports it is not ready (after the freshness window).
    apiUp=false;await (room as any).maintenance();health.apiOkAt=Date.now()-60_000;
    assert.ok(requestIds.length>=2);assert.equal(new Set(requestIds).size,requestIds.length,'One id per request');
    assert.equal((await fetch(`${base}/ready`)).status,503);
    assert.equal((await fetch(`${base}/metrics`)).status,404,'Metrics need the internal secret');
    assert.equal((await fetch(`${base}/metrics`,{headers:{'x-internal-secret':'wrong'}})).status,404);
    assert.equal((await fetch(`${base}/metrics`,{headers:{'x-internal-secret':authSecret()}})).status,404,'AUTH_SECRET cannot read internal metrics');
    await new Promise(r=>setTimeout(r,200));
    const metrics=await (await fetch(`${base}/metrics`,{headers:{'x-internal-secret':internalSecret()}})).text();
    assert.match(metrics,/bar_world_tick_ms\{quantile="0.95"\} [\d.]+/);
    assert.match(metrics,/bar_world_maintenance_failures_total [1-9]/);
    assert.match(metrics,/bar_world_players_connected 0/);
    assert.match(metrics,/bar_world_result_outbox_pending 0/);
  }finally{
    await server.gracefullyShutdown(false);await new Promise<void>(r=>api.close(()=>r()));
    if(previous===undefined)delete process.env.API_INTERNAL_URL;else process.env.API_INTERNAL_URL=previous;
    if(previousAuth===undefined)delete process.env.AUTH_SECRET;else process.env.AUTH_SECRET=previousAuth;
    if(previousInternal===undefined)delete process.env.INTERNAL_SECRET;else process.env.INTERNAL_SECRET=previousInternal;
  }
});

test('log lines carry the room and pseudonyms, never raw account ids; the operator tool finds them',()=>{
  const id='4f6d2c1e-1111-4222-8333-944455556666',line=JSON.parse(logLine('join',{playerId:id,door:'Porta_1'},'room-1'));
  assert.equal(line.roomId,'room-1');assert.equal(line.playerId,pseudonym(id));assert.equal(line.door,'Porta_1');
  assert.ok(!JSON.stringify(line).includes(id));assert.match(line.playerId,/^[0-9a-f]{12}$/);
  const tool=fileURLToPath(new URL('../../../tools/ops/pseudonym.mjs',import.meta.url));
  const output=execFileSync(process.execPath,[tool,id],{env:{...process.env,INTERNAL_SECRET:internalSecret()}}).toString().trim();
  assert.equal(output,`${id} ${pseudonym(id)}`);
});
