import test from 'node:test';
import assert from 'node:assert/strict';
import {youtubeVideoId,initialJukebox,commandJukebox,clearMedia,endMedia,failMedia,liveMedia,jukeboxTime,jukeboxGain,mediaGain,nearestMediaSource,areaMix,jukeboxCommandSchema,mediaEndedSchema,mediaFailedSchema,mediaLiveSchema,
  MEDIA_MAX_SECONDS,MEDIA_QUEUE,PLAYBACK_REFUSED,JUKEBOX_SYSTEMS,TV_SYSTEMS,TELEVISIONS,TV_SPOTS,STAGE,JUKEBOX,COLLIDERS,INTERACTABLES,isWalkable,type JukeboxState} from '@bar/shared';
const id='M7lc1UVf-VE';
test('YouTube URLs: official domains and four formats, no executable or ambiguous URLs',()=>{
  for(const url of [`https://www.youtube.com/watch?v=${id}&t=25`,`https://youtube.com/watch?v=${id}`,`https://m.youtube.com/watch?v=${id}`,`https://youtu.be/${id}?si=share`,`https://www.youtube.com/shorts/${id}`,`https://www.youtube.com/embed/${id}`])assert.equal(youtubeVideoId(url),id,url);
  for(const url of [`javascript:alert(1)`,`https://youtube.com.evil.test/watch?v=${id}`,`https://evil.test/?v=${id}`,`https://youtube.com@evil.test/watch?v=${id}`,`https://user@youtube.com/watch?v=${id}`,`https://www.youtube.com:444/watch?v=${id}`,`https://www.youtube.com/watch?v=${id}&v=aaaaaaaaaaa`,`https://youtu.be/${id}/junk`,`https://www.youtube.com/playlist?list=${id}`,`https://youtu.be/short`,`https://youtu.be/${id}\n`,`https://youtu.be\\@evil.test/${id}`,`https://www.youtube.com/watch?v=<script>`,id])assert.equal(youtubeVideoId(url),null,url);
});
test('live links and music.youtube.com are accepted',()=>{
  assert.equal(youtubeVideoId(`https://www.youtube.com/live/${id}?si=share`),id);assert.equal(youtubeVideoId(`https://music.youtube.com/watch?v=${id}`),id);
  assert.equal(youtubeVideoId(`https://www.youtube.com/live/${id}/junk`),null);
});
const alice={id:'alice',name:'Alice'},bob={id:'bob',name:'Bob'},carol={id:'carol',name:'Carol'};
const play=(state:JukeboxState,video:string,who=alice,now=0,key=`${who.id}-${video}`)=>commandJukebox(state,{id:state.id,revision:state.revision,action:'play',url:`https://youtu.be/${video}`},who,now,{key,title:`Título ${video}`});
test('authoritative timeline: pause, resume, seek and compare-and-swap, by whoever controls the video',()=>{
  let state=play(initialJukebox('jukebox'),id,alice,1000);
  assert.deepEqual([state.status,state.videoId,state.title,state.by,state.byName,state.revision],['playing',id,`Título ${id}`,'alice','Alice',1]);
  assert.equal(jukeboxTime(state,6000),5);assert.equal(jukeboxTime(state,0),0);
  assert.throws(()=>commandJukebox(state,{id:state.id,revision:0,action:'pause'},alice,6000),/Outra pessoa/);
  // Only the video's controller works it.
  assert.throws(()=>commandJukebox(state,{id:state.id,revision:1,action:'pause'},bob,6000),/Quem controla este vídeo é Alice/);
  state=commandJukebox(state,{id:state.id,revision:1,action:'pause'},alice,6000);
  assert.equal(state.position,5);assert.equal(jukeboxTime(state,15000),5);
  assert.throws(()=>commandJukebox(state,{id:state.id,revision:2,action:'pause'},alice,7000),/pausado/);
  state=commandJukebox(state,{id:state.id,revision:2,action:'resume'},alice,16000);
  assert.equal(jukeboxTime(state,19000),8);
  // A jump forward (or back), playing or paused.
  state=commandJukebox(state,{id:state.id,revision:3,action:'seek',position:600},alice,19000);
  assert.deepEqual([state.status,jukeboxTime(state,21000),state.revision],['playing',602,4]);
  // Nobody controls a video whose owner left the bar (the server clears `by`): anyone's command takes it over.
  state={...state,by:'',byName:''};
  state=commandJukebox(state,{id:state.id,revision:4,action:'pause'},bob,22000);
  assert.deepEqual([state.by,state.byName,state.status],['bob','Bob','paused']);
  assert.throws(()=>commandJukebox(state,{id:state.id,revision:5,action:'resume'},alice,22001),/Quem controla este vídeo é Bob/);
  // Skipping the last video switches the source off.
  state=commandJukebox(state,{id:state.id,revision:5,action:'skip'},bob,23000);
  assert.deepEqual([state.status,state.videoId,state.by,state.revision],['off','','',6]);
  assert.throws(()=>commandJukebox(state,{id:state.id,revision:6,action:'resume'},alice,23001),/Nada está tocando/);
  for(const command of [{id:'jukebox',revision:NaN,action:'play',url:'x'},{id:'jukebox',revision:0,action:'play',position:999},{id:'jukebox',revision:0,action:'play'},
    {id:'jukebox',revision:0,action:'seek'},{id:'jukebox',revision:0,action:'seek',position:-1},{id:'jukebox',revision:0,action:'seek',position:Infinity},{id:'jukebox',revision:0,action:'stop'},
    {id:'jukebox',revision:0,action:'pause',url:'https://youtu.be/x'},{id:'jukebox',revision:0,action:'remove'}])assert.equal(jukeboxCommandSchema.safeParse(command).success,false,JSON.stringify(command));
  assert.equal(jukeboxCommandSchema.safeParse({id:'jukebox',revision:0,action:'seek',position:7200.5}).success,true);
});
test('the queue: added behind the video playing, limited, one\'s own taken out, and played in order',()=>{
  let state=play(initialJukebox('tv-main'),id,alice,0);
  // Adding never conflicts with a newer revision, and never touches the playback.
  state=commandJukebox(state,{id:state.id,revision:0,action:'play',url:'https://www.youtube.com/watch?v=aqz-KE-bpKQ'},bob,1000,{key:'b1',title:'Big Buck Bunny'});
  assert.deepEqual(state.queue,[{key:'b1',provider:'youtube',videoId:'aqz-KE-bpKQ',title:'Big Buck Bunny',thumb:'',by:'bob',byName:'Bob'}]);
  assert.deepEqual([state.videoId,state.revision,state.by],[id,1,'alice'],'the video playing and its controller stay');
  assert.throws(()=>play(state,'aqz-KE-bpKQ',carol),/já está na fila/);assert.throws(()=>play(state,id,carol),/já está na fila/);
  // Three per person, twenty in all.
  state=play(play(state,'bbbbbbbbbb2',bob),'bbbbbbbbbb3',bob);
  assert.throws(()=>play(state,'bbbbbbbbbb4',bob),/3 vídeos na fila/);
  for(let i=0;state.queue.length<MEDIA_QUEUE.max;i++)state=play(state,`q${String(i).padStart(10,'0')}`,{id:`p${Math.floor(i/3)}`,name:'P'});
  assert.throws(()=>play(state,'zzzzzzzzzzz',carol),/fila está cheia/);
  // Only its owner takes a video out.
  assert.throws(()=>commandJukebox(state,{id:state.id,revision:0,action:'remove',entry:'b1'},carol,2000),/Só quem pôs/);
  state=commandJukebox(state,{id:state.id,revision:0,action:'remove',entry:'b1'},bob,2000);
  assert.ok(!state.queue.some(entry=>entry.key==='b1'));assert.equal(state.revision,1);
  assert.throws(()=>commandJukebox(state,{id:state.id,revision:0,action:'remove',entry:'b1'},bob,2000),/já saiu/);
  // The controller skips: the next one starts from 0, controlled by whoever queued it.
  const next=state.queue[0]!;state=commandJukebox(state,{id:state.id,revision:1,action:'skip'},alice,3000);
  assert.deepEqual([state.videoId,state.key,state.by,state.title,state.position,state.updatedAt,state.status,state.revision,state.live],[next.videoId,next.key,next.by,next.title,0,3000,'playing',2,false]);
  assert.equal(state.queue.length,MEDIA_QUEUE.max-2);
  // The administration empties it all.
  state=clearMedia(state,4000,'admin');assert.deepEqual([state.status,state.videoId,state.queue.length,state.revision],['off','',0,3]);
});
test('reports from the players: the end, a refusal and a live broadcast, from the controller only, never stale',()=>{
  let state=play(play(initialJukebox('telao'),id,alice,0),'aqz-KE-bpKQ',bob,0,'b1');
  const report={id:'telao',revision:1,videoId:id};
  // The end: from the controller, at the revision and video it saw, not long before the timeline gets there.
  assert.equal(endMedia(state,{...report,duration:300},'bob',300_000),null,'bob does not control it');
  assert.equal(endMedia(state,{...report,duration:300},'alice',100_000),null,'too early');
  assert.equal(endMedia(state,{...report,revision:0,duration:300},'alice',300_000),null,'stale');
  assert.equal(endMedia(state,{...report,videoId:'aqz-KE-bpKQ',duration:300},'alice',300_000),null,'another video');
  // Long past its end (nobody was there to tell) still counts.
  const ended=endMedia(state,{...report,duration:300},'alice',900_000)!;
  assert.deepEqual([ended.videoId,ended.by,ended.revision,ended.queue.length],['aqz-KE-bpKQ','bob',2,0]);
  // While nobody controls it, anyone may report.
  assert.ok(endMedia({...state,by:''},{...report,duration:300},'carol',300_000));
  // Refused by YouTube: only its "cannot play here" errors skip it.
  assert.equal(failMedia(state,{...report,code:5},'alice',1000),null);
  assert.equal(failMedia(state,{...report,code:150},'bob',1000),null);
  assert.equal(failMedia(state,{...report,code:150},'alice',1000)!.videoId,'aqz-KE-bpKQ');
  assert.deepEqual(PLAYBACK_REFUSED,[2,100,101,150]);
  // A live broadcast: the timeline jumps to its live edge (the stream's elapsed seconds, past a day) and runs from there.
  const live=liveMedia(state,{...report,edge:200_000},'alice',5000)!;
  assert.deepEqual([live.live,live.position,live.revision,live.status],[true,200_000,2,'playing']);
  assert.equal(jukeboxTime(live,15000),200_010);
  assert.equal(liveMedia(live,{...report,revision:2,edge:300_000},'alice',6000),null,'once');
  assert.equal(liveMedia(state,{...report,edge:200_000},'bob',5000),null);
  // The next video starts as an ordinary one.
  assert.equal(commandJukebox(live,{id:'telao',revision:2,action:'skip'},alice,7000).live,false);
  for(const [schema,payload] of [[mediaEndedSchema,{...report,duration:MEDIA_MAX_SECONDS+1}],[mediaFailedSchema,{...report,code:1.5}],[mediaLiveSchema,{...report,edge:-1}],[mediaLiveSchema,{...report,videoId:'<script>x>',edge:1}]] as const)
    assert.equal(schema.safeParse(payload).success,false);
  assert.equal(mediaLiveSchema.safeParse({...report,edge:3e8}).success,true);
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
  // It is the map's own jukebox (12_jukebox.py), with its exported solid volume.
  const volume=COLLIDERS.find(c=>c.id==='COL_Int_Jukebox')!;
  assert.deepEqual([JUKEBOX.x,JUKEBOX.z,JUKEBOX.hx,JUKEBOX.hz,JUKEBOX.maxY],[volume.x,volume.z,volume.hx,volume.hz,volume.maxY]);
  assert.equal(COLLIDERS.filter(c=>/jukebox/i.test(c.id)).length,1,'one jukebox volume');
  // Its back touches the face of the stair base, and nothing else occupies its place.
  assert.ok(Math.abs(back-(stairBase.z+stairBase.hz))<.03,'against the stair base');
  assert.ok(JUKEBOX.x-JUKEBOX.hx>=stairBase.x-stairBase.hx&&JUKEBOX.x+JUKEBOX.hx<=stairBase.x+stairBase.hx,'within the stair base face');
  const overlapping=COLLIDERS.filter(c=>c!==volume&&Math.abs(c.x-JUKEBOX.x)<c.hx+JUKEBOX.hx-.01&&Math.abs(c.z-JUKEBOX.z)<c.hz+JUKEBOX.hz-.01
    &&(c.minY??-Infinity)<JUKEBOX.maxY-.01&&(c.maxY??Infinity)>JUKEBOX.y+.01);
  assert.deepEqual(overlapping.map(c=>c.id),[]);
  // The corridor opening (x 11.1–13.1) and the foot of the steps (x 13.25–14.75) stay free.
  assert.ok(JUKEBOX.x-JUKEBOX.hx>14.75);
  const spot=INTERACTABLES.find(i=>i.id==='jukebox')!;assert.ok(isWalkable(spot.x,spot.z,spot.y),'the use spot in front is walkable');
});
test('the stage screen is the map\'s Telao_Tela, and its sound never plays over the bar\'s',()=>{
  // 15_palco.py: a 16:9 LED screen on the back truss, facing the audience; used at the stage's front edge.
  const telao=TELEVISIONS.find(tv=>tv.id==='telao')!;
  assert.deepEqual([telao.x,telao.y,telao.z,telao.width,telao.height,telao.yaw],[STAGE.screen.x,STAGE.screen.y,STAGE.screen.z,5.76,3.24,0]);
  assert.ok(Math.abs(telao.width/telao.height-16/9)<1e-3);
  const stage=TV_SYSTEMS.find(s=>s.id==='telao')!,bar=[JUKEBOX_SYSTEMS[0]!,...TV_SYSTEMS.filter(s=>s.id!=='telao')];
  assert.equal(stage.area,'stage');assert.ok(bar.every(s=>s.area==='bar'));
  // Alone, every source plays as loud as its distance allows.
  const front=TV_SPOTS.telao!,jukeboxSpot=INTERACTABLES.find(i=>i.id==='jukebox')!;
  assert.equal(areaMix(front,JUKEBOX_SYSTEMS[0]!,[JUKEBOX_SYSTEMS[0]!]),1,'a stage screen that is not playing never quiets the bar');
  // Both playing: in front of the stage only the stage is heard; at the jukebox only the jukebox.
  const both=[JUKEBOX_SYSTEMS[0]!,stage];
  assert.ok(mediaGain(front,JUKEBOX_SYSTEMS[0]!)>0,'the jukebox would reach the stage on its own');
  assert.equal(areaMix(front,JUKEBOX_SYSTEMS[0]!,both),0);assert.equal(areaMix(front,stage,both),1);
  assert.ok(mediaGain(jukeboxSpot,stage)>0,'the stage would reach the jukebox on its own');
  assert.equal(areaMix(jukeboxSpot,stage,both),0);assert.equal(areaMix(jukeboxSpot,JUKEBOX_SYSTEMS[0]!,both),1);
  // Walking from one to the other the two cross-fade: never both loud, never a jump.
  let previous=1;
  for(let t=0;t<=1;t+=.01){
    const p={x:front.x+(jukeboxSpot.x-front.x)*t,y:.3,z:front.z+(jukeboxSpot.z-front.z)*t};
    const stageShare=areaMix(p,stage,both),barShare=areaMix(p,JUKEBOX_SYSTEMS[0]!,both);
    assert.ok(stageShare<=previous+1e-9,'the stage only fades out on the way');previous=stageShare;
    assert.ok(Math.abs(stageShare+barShare-1)<1e-9,`the two shares always add up to one, at ${t}`);
  }
});
