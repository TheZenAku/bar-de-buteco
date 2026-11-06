import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createFrameReceiver} from '../../apps/web/src/phone/frame-receiver';
import {createFrameEncoder} from '../../apps/web/src/phone/frame-encoder';

const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
const frame=(id:number)=>({id,closed:false,close(){this.closed=true;}});

test('video: a slow decoder keeps only the latest waiting frame, closes replaced bitmaps and recovers from bad frames',async()=>{
  const decoded:number[]=[],painted:number[]=[],waiting:Array<(value:ReturnType<typeof frame>)=>void>=[];
  const receiver=createFrameReceiver(async bytes=>{
    decoded.push(bytes[0]!);
    if(bytes[0]===4)throw new Error('damaged JPEG');
    return new Promise<ReturnType<typeof frame>>(resolve=>waiting.push(resolve));
  },bitmap=>painted.push(bitmap.id));
  receiver.receive(new Uint8Array([1]));receiver.receive(new Uint8Array([2]));receiver.receive(new Uint8Array([3]));
  assert.deepEqual(decoded,[1],'only one decode is in flight');
  const first=frame(1);waiting.shift()!(first);await tick();
  assert.deepEqual(decoded,[1,3],'the superseded waiting frame was skipped');
  const last=frame(3);waiting.shift()!(last);await tick();
  assert.deepEqual(painted,[1,3]);assert.ok(first.closed);assert.equal(receiver.current,last);
  receiver.receive(new Uint8Array([4]));await tick();receiver.receive(new Uint8Array([5]));
  waiting.shift()!(frame(5));await tick();assert.deepEqual(painted,[1,3,5]);assert.ok(last.closed);
  const current=receiver.current!;receiver.clear();assert.ok(current.closed);assert.equal(receiver.current,undefined);
});

test('video: ending a call discards its pending frames and an unfinished decode cannot paint into the next call',async()=>{
  const painted:number[]=[],waiting:Array<(value:ReturnType<typeof frame>)=>void>=[];
  const receiver=createFrameReceiver(()=>new Promise<ReturnType<typeof frame>>(resolve=>waiting.push(resolve)),bitmap=>painted.push(bitmap.id));
  receiver.receive(new Uint8Array([1]));receiver.receive(new Uint8Array([2]));receiver.clear();
  receiver.receive(new Uint8Array([3]));
  const old=frame(1);waiting.shift()!(old);await tick();assert.ok(old.closed);assert.deepEqual(painted,[]);
  waiting.shift()!(frame(3));await tick();assert.deepEqual(painted,[3]);receiver.clear();
});

test('video: an encoder worker that stops responding is terminated and releases the capture',async t=>{
  let terminated=false;
  t.mock.timers.enable({apis:['setTimeout']});
  for(const key of ['Worker','OffscreenCanvas'] as const){
    const original=Object.getOwnPropertyDescriptor(globalThis,key);
    t.after(()=>{if(original)Object.defineProperty(globalThis,key,original);else Reflect.deleteProperty(globalThis,key);});
  }
  Object.defineProperty(globalThis,'Worker',{configurable:true,value:class {postMessage(){}terminate(){terminated=true;}}});
  Object.defineProperty(globalThis,'OffscreenCanvas',{configurable:true,value:class {}});
  const encoder=createFrameEncoder();
  const encoded=encoder.encode({} as ImageBitmap,.6);
  t.mock.timers.tick(1500);
  assert.equal(await encoded,null);assert.ok(terminated);encoder.close();
});
