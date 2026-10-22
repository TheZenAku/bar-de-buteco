import test from 'node:test';
import assert from 'node:assert/strict';
import {youtubeVideoId,initialJukebox,commandJukebox,jukeboxTime,jukeboxGain,jukeboxCommandSchema,JUKEBOX_SYSTEMS,TELEVISIONS} from '@bar/shared';
const id='M7lc1UVf-VE';
test('YouTube URLs: official domains and four formats, no executable or ambiguous URLs',()=>{
  for(const url of [`https://www.youtube.com/watch?v=${id}&t=25`,`https://youtube.com/watch?v=${id}`,`https://m.youtube.com/watch?v=${id}`,`https://youtu.be/${id}?si=share`,`https://www.youtube.com/shorts/${id}`,`https://www.youtube.com/embed/${id}`])assert.equal(youtubeVideoId(url),id,url);
  for(const url of [`javascript:alert(1)`,`https://youtube.com.evil.test/watch?v=${id}`,`https://evil.test/?v=${id}`,`https://youtube.com@evil.test/watch?v=${id}`,`https://user@youtube.com/watch?v=${id}`,`https://www.youtube.com:444/watch?v=${id}`,`https://www.youtube.com/watch?v=${id}&v=aaaaaaaaaaa`,`https://youtu.be/${id}/junk`,`https://www.youtube.com/playlist?list=${id}`,`https://youtu.be/short`,`https://youtu.be/${id}\n`,`https://youtu.be\\@evil.test/${id}`,`https://www.youtube.com/watch?v=<script>`,id])assert.equal(youtubeVideoId(url),null,url);
});
test('authoritative timeline, pause/resume/stop/off and compare-and-swap',()=>{
  let state=initialJukebox('jukebox','tv-hall');
  state=commandJukebox(state,{id:state.id,revision:0,action:'play',url:`https://youtu.be/${id}`},'alice',1000);
  assert.equal(jukeboxTime(state,6000),5);assert.equal(jukeboxTime(state,0),0);
  assert.throws(()=>commandJukebox(state,{id:state.id,revision:0,action:'off'},'bob',6000),/Outra pessoa/);
  state=commandJukebox(state,{id:state.id,revision:1,action:'pause'},'bob',6000);
  assert.equal(state.position,5);assert.equal(jukeboxTime(state,15000),5);
  state=commandJukebox(state,{id:state.id,revision:2,action:'resume'},'bob',16000);
  assert.equal(jukeboxTime(state,19000),8);
  state=commandJukebox(state,{id:state.id,revision:3,action:'stop'},'alice',19000);
  assert.equal(state.position,0);assert.equal(state.status,'stopped');assert.equal(state.videoId,id);
  state=commandJukebox(state,{id:state.id,revision:4,action:'off'},'alice',20000);
  assert.equal(state.status,'off');assert.equal(state.videoId,'');assert.equal(state.revision,5);
  assert.throws(()=>commandJukebox(state,{id:state.id,revision:5,action:'resume'},'alice',20001),/primeiro/);
  assert.equal(jukeboxCommandSchema.safeParse({id:'jukebox',revision:NaN,action:'play',url:'x'}).success,false);
  assert.equal(jukeboxCommandSchema.safeParse({id:'jukebox',revision:0,action:'play',position:999}).success,false);
});
test('proximity attenuation is continuous, bounded, per-listener and silent outside 20m',()=>{
  const source={x:0,y:0,z:0};let previous=1;
  for(let d=0;d<=21;d+=.01){const value=jukeboxGain({x:d,y:0,z:0},source);assert.ok(value>=0&&value<=1&&value<=previous+1e-9);previous=value;}
  assert.equal(jukeboxGain({x:5,y:0,z:0},source),1);assert.ok(Math.abs(jukeboxGain({x:15,y:0,z:0},source)-.07)<1e-9);
  assert.equal(jukeboxGain({x:20,y:0,z:0},source),0);assert.equal(jukeboxGain({x:0,y:21,z:0},source),0);
  assert.ok(JUKEBOX_SYSTEMS.every(system=>TELEVISIONS.some(tv=>tv.id===system.tvId)));
  assert.equal(new Set(TELEVISIONS.map(tv=>tv.id)).size,TELEVISIONS.length);
});
