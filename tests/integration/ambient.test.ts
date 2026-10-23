import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AmbientQueue,fadeCurve,AMBIENT_MIX,type AmbientTrack} from '../../apps/web/src/ambient-mix';
import catalog from '../../apps/web/src/assets/ambient.json';
import {stat} from 'node:fs/promises';

test('ambient shuffle exhausts each bag and never repeats at its boundary',()=>{
  const tracks=['a','b','c','d'].map(id=>({id,url:id,duration:60}));
  for(const random of [()=>0,()=>.999,Math.random]){
    const queue=new AmbientQueue(tracks,random),excluded=new Set<string>();
    const ids=Array.from({length:100},()=>queue.next(excluded)!.id);
    for(let i=1;i<ids.length;i++)assert.notEqual(ids[i],ids[i-1]);
    for(let i=0;i<ids.length;i+=4)assert.equal(new Set(ids.slice(i,i+4)).size,4);
  }
});
test('ambient queue tolerates empty, failed and single-track catalogs without retry loops',()=>{
  const tracks:AmbientTrack[]=[{id:'a',url:'a',duration:60},{id:'b',url:'b',duration:60}];
  const queue=new AmbientQueue(tracks,()=>0),failed=new Set(['a']);
  assert.equal(queue.next(failed)!.id,'b');assert.equal(queue.next(failed)!.id,'b');
  failed.add('b');assert.equal(queue.next(failed),undefined);
  assert.equal(new AmbientQueue([]).next(new Set()),undefined);
});
test('ambient crossfade preserves equal power, endpoints and quiet headroom',()=>{
  const incoming=fadeCurve(true),outgoing=fadeCurve(false);
  assert.equal(incoming[0],0);assert.equal(incoming.at(-1),1);assert.equal(outgoing[0],1);
  assert.ok(outgoing.at(-1)!<1e-6);
  for(let i=0;i<incoming.length;i++)assert.ok(Math.abs(incoming[i]**2+outgoing[i]**2-1)<1e-6);
  assert.ok(AMBIENT_MIX.gain<.2);assert.ok(AMBIENT_MIX.duck>0&&AMBIENT_MIX.duck<1);
});
test('all six unique ambient recordings are published, with useful lengths and browser URLs',async()=>{
  assert.equal(catalog.length,6);assert.equal(new Set(catalog.map(t=>t.id)).size,6);
  for(const track of catalog){
    assert.ok(track.duration>60);assert.match(track.url,/^\/audio\/ambient\/[\w-]+\.m4a$/);
    const file=new URL(`../../apps/web/public${track.url}`,import.meta.url);
    assert.ok((await stat(file)).size>100_000);
  }
});
