import test from 'node:test';
import assert from 'node:assert/strict';
import {appendFileSync,existsSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {FileOutbox} from '../src/world/outbox.js';
import {ControlRelay,ResultRelay,type MatchResult} from '../src/world/relays.js';
import {InternalApiError,type Control} from '../src/internal.js';
import {readWorldConfig,WorldConfigError} from '../src/config.js';
import {internalSecret} from '@bar/shared/tickets';

type Result={roundId:string;userId:string;result:MatchResult};
function directory(t:test.TestContext){const dir=mkdtempSync(join(tmpdir(),'bar-outbox-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));return dir;}
/** A fake API with the real one's idempotency: a result counts once per roundId:userId. */
function statsApi(){const counted=new Map<string,MatchResult>();let down=false,failAfterCommit=false,reject=0;
  const send=async<T>(path:string,body?:unknown):Promise<T>=>{
    assert.equal(path,'stats');if(down)throw new Error('ECONNREFUSED');if(reject)throw new InternalApiError(reject,`API interna indisponível (${reject}).`);
    const {roundId,results}=body as {roundId:string;results:{userId:string;result:MatchResult}[]};
    for(const r of results)if(!counted.has(`${roundId}:${r.userId}`))counted.set(`${roundId}:${r.userId}`,r.result);
    // The API committed but the answer was lost (timeout): the world must send again, the API must not count twice.
    if(failAfterCommit){failAfterCommit=false;throw new Error('timeout');}
    return {ok:true} as T;};
  return {send,counted,set:(o:{down?:boolean;failAfterCommit?:boolean;reject?:number})=>{down=o.down??down;failAfterCommit=o.failAfterCommit??failAfterCommit;reject=o.reject??reject;}};}

test('results survive an API outage and a world restart, and are counted once',async t=>{
  const path=join(directory(t),'outbox.jsonl'),api=statsApi();
  let relay=new ResultRelay(new FileOutbox<Result>(path),api.send);
  relay.record('round-1','ana','win');relay.record('round-1','bia','loss');relay.record('round-1','ana','win');
  assert.equal(relay.pending,2,'Recording the same seat twice keeps one record');
  api.set({down:true});await assert.rejects(relay.flush());assert.equal(relay.pending,2);
  // The world crashes and comes back: nothing was lost.
  relay=new ResultRelay(new FileOutbox<Result>(path),api.send);assert.equal(relay.pending,2);
  api.set({down:false,failAfterCommit:true});await assert.rejects(relay.flush());assert.equal(relay.pending,2,'Unconfirmed: still waiting');
  await relay.flush();assert.equal(relay.pending,0);
  assert.deepEqual([...api.counted],[['round-1:ana','win'],['round-1:bia','loss']],'Sent twice, counted once');
  assert.equal(new FileOutbox<Result>(path).size,0,'Confirmed records leave the file');
});

test('a refused result (4xx) goes to the dead letter file instead of blocking the rest',async t=>{
  const path=join(directory(t),'outbox.jsonl'),api=statsApi(),relay=new ResultRelay(new FileOutbox<Result>(path),api.send);
  relay.record('bad-round','not-a-uuid','draw');
  api.set({reject:400});await relay.flush();assert.equal(relay.pending,0);
  const dead=readFileSync(`${path}.failed`,'utf8').trim().split('\n').map(line=>JSON.parse(line));
  assert.deepEqual(dead.map(r=>[r.id,r.reason]),[['bad-round:not-a-uuid','API interna indisponível (400).']]);
  api.set({reject:503});relay.record('later','ana','win');await assert.rejects(relay.flush());assert.equal(relay.pending,1,'A 5xx is retried later');
});

test('a torn last line (crash in the middle of a write) is skipped; the rest is kept',async t=>{
  const path=join(directory(t),'outbox.jsonl'),logs:string[]=[];
  new FileOutbox<Result>(path).add('blackjack-result','r:ana',{roundId:'r',userId:'ana',result:'win'});
  appendFileSync(path,'{"id":"r:bia","kind":"blackjack-res');
  const outbox=new FileOutbox<Result>(path,event=>logs.push(event));
  assert.deepEqual(outbox.pending().map(r=>r.id),['r:ana']);assert.deepEqual(logs,['outbox_line_skipped']);
  outbox.complete(['r:ana']);assert.equal(readFileSync(path,'utf8'),'');assert.equal(existsSync(`${path}.tmp`),false);
});

test('controls are applied once even when delivered again, rejections are reported, and confirmations name the owner',async()=>{
  const sent:{path:string;body:any}[]=[];let deliver:Control[]=[];
  const relay=new ControlRelay('world-a',async<T>(path:string,body?:unknown)=>{sent.push({path,body});return (path==='controls/lease'?{controls:deliver}:{}) as T;});
  const applied:string[]=[];
  const apply=(control:Control)=>{if(control.eventType==='TORNADO')throw new Error('Evento desconhecido: TORNADO');applied.push(control.id);};
  deliver=[{id:'k1',action:'kick',playerId:'p'},{id:'e1',action:'event',eventType:'TORNADO'}];
  assert.deepEqual(await relay.poll(apply),{applied:['k1'],failed:['e1']});
  assert.deepEqual(sent.at(-1),{path:'controls/ack',body:{owner:'world-a',applied:['k1'],failed:[{id:'e1',error:'Evento desconhecido: TORNADO'}]}});
  deliver=[{id:'k1',action:'kick',playerId:'p'}];await relay.poll(apply);
  assert.deepEqual(applied,['k1'],'Redelivered: confirmed, not applied again');assert.deepEqual(sent.at(-1)!.body.applied,['k1']);
  deliver=[];const before=sent.length;await relay.poll(apply);assert.equal(sent.length,before+1,'Nothing leased: no confirmation request');
  // An older API that answers without a list does not break the world.
  const old=new ControlRelay('w',async<T>()=>({ok:true}) as T);assert.deepEqual(await old.poll(apply),{applied:[],failed:[]});
});

test('world configuration: invalid values stop the start; empty means unset; the previous limits still apply',()=>{
  const base={NODE_TEST_CONTEXT:undefined};
  const config=readWorldConfig({...base,GAME_PORT:'',ROOM_CAPACITY:'500',BLACKJACK_TURN_MS:'1000',EVENT_MIN_MS:'2000',EVENT_MAX_MS:'1500',API_INTERNAL_URL:'http://api:3001/'});
  assert.equal(config.port,2567);assert.equal(config.capacity,128);assert.equal(config.blackjackTurnMs,5000);
  assert.equal(config.eventMinMs,2000);assert.equal(config.eventMaxMs,2000);assert.equal(config.apiInternalUrl,'http://api:3001');
  assert.equal(readWorldConfig({BAR_CAPACITY:'12'}).capacity,12,'Old variable name still honoured');
  assert.match(readWorldConfig({}).outboxPath,/[\\/]\.data[\\/]world[\\/]outbox\.jsonl$/);
  assert.notEqual(readWorldConfig({NODE_TEST_CONTEXT:'child'}).outboxPath,readWorldConfig({}).outboxPath,'Tests never write to the development outbox');
  for(const env of [{GAME_PORT:'abc'},{GAME_PORT:'70000'},{ROOM_CAPACITY:'2.5'},{API_INTERNAL_URL:'ftp://api'},{EVENT_MIN_MS:'soon'}])
    assert.throws(()=>readWorldConfig(env),WorldConfigError,JSON.stringify(env));
  assert.throws(()=>readWorldConfig({GAME_PORT:'abc'}),/GAME_PORT/);
});

test('world production configuration requires separate strong secrets; development keeps the legacy fallback',()=>{
  const auth='auth-production-secret-with-more-than-thirty-two-characters';
  const internal='internal-production-secret-with-more-than-thirty-two-characters';
  assert.equal(internalSecret({NODE_ENV:'development',AUTH_SECRET:'legacy-development-secret'}),'legacy-development-secret');
  assert.throws(()=>readWorldConfig({NODE_ENV:'production',AUTH_SECRET:auth}),/INTERNAL_SECRET/);
  assert.throws(()=>readWorldConfig({NODE_ENV:'production',AUTH_SECRET:auth,INTERNAL_SECRET:auth}),/diferente de AUTH_SECRET/);
  assert.doesNotThrow(()=>readWorldConfig({NODE_ENV:'production',AUTH_SECRET:auth,INTERNAL_SECRET:internal}));
});
