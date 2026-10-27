import test from 'node:test';
import assert from 'node:assert/strict';
import {youtubeVideoId,initialJukebox,commandJukebox,jukeboxTime,jukeboxGain,mediaGain,nearestMediaSource,jukeboxCommandSchema,JUKEBOX_SYSTEMS,TV_SYSTEMS,TELEVISIONS,JUKEBOX,COLLIDERS,INTERACTABLES,isWalkable} from '@bar/shared';
const id='M7lc1UVf-VE';
test('YouTube URLs: official domains and four formats, no executable or ambiguous URLs',()=>{
  for(const url of [`https://www.youtube.com/watch?v=${id}&t=25`,`https://youtube.com/watch?v=${id}`,`https://m.youtube.com/watch?v=${id}`,`https://youtu.be/${id}?si=share`,`https://www.youtube.com/shorts/${id}`,`https://www.youtube.com/embed/${id}`])assert.equal(youtubeVideoId(url),id,url);
  for(const url of [`javascript:alert(1)`,`https://youtube.com.evil.test/watch?v=${id}`,`https://evil.test/?v=${id}`,`https://youtube.com@evil.test/watch?v=${id}`,`https://user@youtube.com/watch?v=${id}`,`https://www.youtube.com:444/watch?v=${id}`,`https://www.youtube.com/watch?v=${id}&v=aaaaaaaaaaa`,`https://youtu.be/${id}/junk`,`https://www.youtube.com/playlist?list=${id}`,`https://youtu.be/short`,`https://youtu.be/${id}\n`,`https://youtu.be\\@evil.test/${id}`,`https://www.youtube.com/watch?v=<script>`,id])assert.equal(youtubeVideoId(url),null,url);
});
test('authoritative timeline, pause/resume/stop/off and compare-and-swap',()=>{
  let state=initialJukebox('jukebox');
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
  // The jukebox and the TVs are separate sources: the jukebox drives no screen.
  assert.deepEqual(JUKEBOX_SYSTEMS.map(s=>[s.id,s.kind,s.screens.length]),[['jukebox','jukebox',0]]);
  // The TVs are quieter than the jukebox; only the stage screen fills the backyard.
  assert.ok(TV_SYSTEMS.every(s=>s.kind==='tv'&&(s.id==='telao'?s.audio.maxDistance>JUKEBOX_SYSTEMS[0]!.audio.maxDistance:s.audio.maxDistance<JUKEBOX_SYSTEMS[0]!.audio.maxDistance)));
  assert.equal(new Set(TELEVISIONS.map(tv=>tv.id)).size,TELEVISIONS.length);
});
test('TV groups: the ground floor shares one video on all its screens; upstairs has its own',()=>{
  assert.deepEqual(TV_SYSTEMS.map(s=>[s.id,[...s.screens]]),[['tv-main',['tv-hall','tv-left','tv-counter']],['tv-upstairs',['tv-upstairs']],['telao',['telao']]]);
  // Every screen belongs to exactly one group, and its sound comes from its own position.
  assert.deepEqual(TV_SYSTEMS.flatMap(s=>s.screens).sort(),TELEVISIONS.map(tv=>tv.id).sort());
  for(const system of TV_SYSTEMS)system.screens.forEach((screen,i)=>{const tv=TELEVISIONS.find(t=>t.id===screen)!;assert.deepEqual(system.sources[i],{x:tv.x,y:tv.y,z:tv.z});});
  // A group sounds from the screen closest to the listener.
  const main=TV_SYSTEMS[0]!,counter=TELEVISIONS.find(t=>t.id==='tv-counter')!,listener={x:counter.x,y:.3,z:counter.z-2};
  assert.equal(main.screens[nearestMediaSource(main,listener).index],'tv-counter');
  assert.equal(mediaGain(listener,main),jukeboxGain(listener,{x:counter.x,y:counter.y,z:counter.z},main.audio));
});
test('the jukebox stands against the wall at the foot of the stairs, reachable and clear of the corridor',()=>{
  const back=JUKEBOX.z-JUKEBOX.hz,stairBase=COLLIDERS.find(c=>c.id==='COL_Predio_Escada_Base')!;
  // Its back touches the face of the stair base and it fits under the upper flight.
  assert.ok(Math.abs(back-(stairBase.z+stairBase.hz))<.03,'against the stair base');
  assert.ok(JUKEBOX.x-JUKEBOX.hx>=stairBase.x-stairBase.hx&&JUKEBOX.x+JUKEBOX.hx<=stairBase.x+stairBase.hx,'within the stair base face');
  assert.ok(JUKEBOX.y+1.55<(stairBase.maxY??0),'below the upper flight');
  // The corridor opening (x 11.1–13.1) and the foot of the steps (x 13.25–14.75) stay free.
  assert.ok(JUKEBOX.x-JUKEBOX.hx>14.75);
  const spot=INTERACTABLES.find(i=>i.id==='jukebox')!;assert.ok(isWalkable(spot.x,spot.z,spot.y),'the use spot in front is walkable');
});
