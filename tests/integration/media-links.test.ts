import test from 'node:test';
import assert from 'node:assert/strict';
import {MEDIA_PLATFORMS,commandJukebox,endMedia,initialJukebox,liveMedia,mediaEndedSchema,mediaIsStream,mediaLinkUrl,parseMediaLink,type MediaProvider} from '../../packages/shared/src/index.js';

const link=(url:string)=>{const parsed=parseMediaLink(url);assert.ok(!('error' in parsed),`${url}: ${'error' in parsed?parsed.error:''}`);return parsed;};
const refused=(url:string,reason:RegExp)=>{const parsed=parseMediaLink(url);assert.ok('error' in parsed,`${url} should be refused`);assert.match(parsed.error,reason,url);};

test('each platform: every form of a link reads as the same id, and comes back as its own address',()=>{
  const cases:[MediaProvider,string,string[],string][]=[
    ['youtube','aqz-KE-bpKQ',['https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=3','https://youtu.be/aqz-KE-bpKQ?si=x','https://music.youtube.com/watch?v=aqz-KE-bpKQ','https://www.youtube.com/shorts/aqz-KE-bpKQ'],'https://www.youtube.com/watch?v=aqz-KE-bpKQ'],
    ['vimeo','1084537',['https://vimeo.com/1084537','https://player.vimeo.com/video/1084537','https://vimeo.com/channels/staffpicks/1084537','https://vimeo.com/groups/x/videos/1084537/'],'https://vimeo.com/1084537'],
    ['vimeo','1084537:abc123',['https://vimeo.com/1084537/abc123','https://player.vimeo.com/video/1084537?h=abc123'],'https://vimeo.com/1084537/abc123'],
    ['soundcloud','forss/flickermood',['https://soundcloud.com/forss/flickermood','https://m.soundcloud.com/forss/flickermood/?si=x'],'https://soundcloud.com/forss/flickermood'],
    ['soundcloud','forss/flickermood/s-AbC1',['https://soundcloud.com/forss/flickermood/s-AbC1'],'https://soundcloud.com/forss/flickermood/s-AbC1'],
    ['mixcloud','spartacus/party-time',['https://www.mixcloud.com/spartacus/party-time/','https://mixcloud.com/spartacus/party-time'],'https://www.mixcloud.com/spartacus/party-time/'],
    ['spotify','track:11dFghVXANMlKmJXsNCbNl',['https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl?si=x','https://open.spotify.com/intl-pt/track/11dFghVXANMlKmJXsNCbNl','spotify:track:11dFghVXANMlKmJXsNCbNl'],'https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl'],
    ['spotify','episode:7makk4oTQel546B0PZlDM5',['https://open.spotify.com/episode/7makk4oTQel546B0PZlDM5'],'https://open.spotify.com/episode/7makk4oTQel546B0PZlDM5'],
    ['tiktok','6718335390845095173',['https://www.tiktok.com/@scout2015/video/6718335390845095173?lang=pt','https://www.tiktok.com/player/v1/6718335390845095173','https://m.tiktok.com/@a.b/video/6718335390845095173'],'https://www.tiktok.com/player/v1/6718335390845095173'],
    ['twitch','channel:gaules',['https://www.twitch.tv/gaules','https://twitch.tv/Gaules/','https://m.twitch.tv/gaules','https://player.twitch.tv/?channel=gaules&parent=x'],'https://www.twitch.tv/gaules'],
    ['twitch','video:202020487',['https://www.twitch.tv/videos/202020487?t=1h','https://www.twitch.tv/gaules/v/202020487','https://player.twitch.tv/?video=v202020487'],'https://www.twitch.tv/videos/202020487'],
  ];
  for(const [provider,id,urls,own] of cases){
    for(const url of urls){const parsed=link(url);assert.equal(parsed.provider,provider,url);assert.equal(parsed.id,id,url);}
    assert.equal(mediaLinkUrl(provider,id),own);
    assert.equal(link(own).id,id,`${own} reads back`);
  }
});

test('what a platform cannot play here is told at once, and why',()=>{
  for(const url of ['https://soundcloud.com/forss/sets/album','https://open.spotify.com/album/11dFghVXANMlKmJXsNCbNl','https://open.spotify.com/playlist/11dFghVXANMlKmJXsNCbNl'])refused(url,/álbu/i);
  refused('https://www.twitch.tv/gaules/clip/Abc-123',/clipes/);refused('https://clips.twitch.tv/Abc-123',/clipes/);
  for(const url of ['https://www.twitch.tv/directory','https://www.twitch.tv/videos','https://www.mixcloud.com/discover/house/','https://soundcloud.com/discover/sets','https://vimeo.com/channels/staffpicks','https://www.tiktok.com/@scout2015','https://www.youtube.com/playlist?list=abc','https://youtu.be/short'])assert.ok('error' in parseMediaLink(url),url);
  for(const url of ['https://vm.tiktok.com/ZM1234/','https://on.soundcloud.com/abc','https://spotify.link/abc'])refused(url,/endereço completo/);
  for(const url of ['https://www.dailymotion.com/video/x84sh87','https://dai.ly/x84sh87','https://www.facebook.com/watch/?v=1','https://fb.watch/abc','https://www.instagram.com/reel/abc','https://x.com/a/status/1','https://kick.com/xqc','https://www.netflix.com/watch/1','https://music.apple.com/br/album/x/1','https://drive.google.com/file/d/abc/view','https://www.deezer.com/track/1'])refused(url,/não tem um player/);
});

test('a direct link: https on a public address only, with a readable name',()=>{
  const file=link('https://cdn.example.com/filmes/Meu_filme%20bom.mp4?token=abc#frag');
  assert.deepEqual(file,{provider:'file',id:'https://cdn.example.com/filmes/Meu_filme%20bom.mp4?token=abc',title:'Meu filme bom'});
  // A radio has no extension, and may have a port.
  assert.equal(link('https://stream.radioparadise.com:8443/mp3-128').provider,'file');
  assert.equal(link('https://stream.radioparadise.com/').title,'stream.radioparadise.com');
  assert.equal(link('https://www.dropbox.com/scl/fi/abc/musica.mp3?rlkey=x&dl=0').id,'https://www.dropbox.com/scl/fi/abc/musica.mp3?rlkey=x&raw=1');
  refused('http://cdn.example.com/a.mp4',/https/);
  // Nobody's router, nobody's own machine: however the address is written.
  for(const url of ['https://localhost/a.mp4','https://127.0.0.1/a.mp4','https://192.168.0.1/a.mp4','https://10.0.0.5:8080/stream','https://2130706433/a.mp4','https://0x7f.0.0.1/a.mp4','https://[::1]/a.mp4','https://intranet/a.mp4','https://nas.local/a.mp4','https://printer.lan/a.mp4','https://a.internal/b.mp4','https://evil.test/a.mp4'])refused(url,/válido/);
  for(const url of ['javascript:alert(1)','data:video/mp4;base64,AAAA','file:///c:/a.mp4','blob:https://a.com/b','ftp://a.com/b.mp4','https://user:pw@cdn.example.com/a.mp4','nada','',' ','https://cdn.example.com/a b.mp4',`https://cdn.example.com/${'a'.repeat(2050)}.mp4`])refused(url,/válido/);
  // A look-alike is no platform, so it gets none of a platform's trust.
  for(const url of ['https://youtube.com.evil.net/watch?v=aqz-KE-bpKQ','https://vimeo.com.evil.net/1084537'])assert.equal(link(url).provider,'file',url);
});

test('every platform: the queue carries it, and a link of any platform plays like any other',()=>{
  const actor={id:'ana',name:'Ana'},bob={id:'bob',name:'Bob'};
  let state=commandJukebox(initialJukebox('tv-main'),{id:'tv-main',revision:0,action:'play',url:'https://soundcloud.com/forss/flickermood'},actor,1000,{key:'a',title:'Flickermood',thumb:'https://i1.sndcdn.com/a.jpg'});
  assert.equal(state.status,'playing');assert.equal(state.provider,'soundcloud');assert.equal(state.videoId,'forss/flickermood');assert.equal(state.thumb,'https://i1.sndcdn.com/a.jpg');assert.equal(state.live,false);
  // The same link, pasted another way, is the same video.
  assert.throws(()=>commandJukebox(state,{id:'tv-main',revision:state.revision,action:'play',url:'https://m.soundcloud.com/forss/flickermood?si=1'},bob,1100),/já está na fila/);
  state=commandJukebox(state,{id:'tv-main',revision:state.revision,action:'play',url:'https://www.twitch.tv/gaules'},bob,1200,{key:'b',title:''});
  state=commandJukebox(state,{id:'tv-main',revision:state.revision,action:'play',url:'https://cdn.example.com/show.mp4'},bob,1300,{key:'c',title:''});
  assert.deepEqual(state.queue.map(entry=>[entry.provider,entry.title]),[['twitch','Twitch: gaules'],['file','show']]);
  // A platform's own title wins over the one read from the link; a channel is on the air from its first moment.
  state=commandJukebox(state,{id:'tv-main',revision:state.revision,action:'skip'},actor,2000);
  assert.equal(state.provider,'twitch');assert.equal(state.live,true);assert.equal(mediaIsStream(state.provider,state.videoId),true);assert.equal(state.thumb,'');
  // No second jump for what already reads as live.
  assert.equal(liveMedia(state,{id:'tv-main',revision:state.revision,videoId:state.videoId,edge:0},'bob',2100),null);
  state=commandJukebox(state,{id:'tv-main',revision:state.revision,action:'skip'},bob,3000);
  assert.equal(state.provider,'file');assert.equal(state.live,false);
  // A radio tells it is live, with no timeline to jump to.
  state=liveMedia(state,{id:'tv-main',revision:state.revision,videoId:state.videoId,edge:0},'bob',3100)!;assert.equal(state.live,true);assert.equal(state.position,0);
  // A long address is a valid report; the end clears the provider.
  const report=mediaEndedSchema.parse({id:'tv-main',revision:state.revision,videoId:state.videoId,duration:1});
  const off=endMedia(state,report,'bob',9000)!;assert.equal(off.status,'off');assert.equal(off.provider,'');assert.equal(off.videoId,'');assert.equal(off.thumb,'');
  assert.throws(()=>commandJukebox(off,{id:'tv-main',revision:off.revision,action:'play',url:'https://www.facebook.com/watch/?v=1'},bob,9100),/Facebook/);
});

test('the platforms say what they cannot do',()=>{
  for(const provider of Object.keys(MEDIA_PLATFORMS) as MediaProvider[]){
    const platform=MEDIA_PLATFORMS[provider];
    assert.ok(platform.label&&platform.named);
    // Whoever pastes a link is told when it will not fade with distance, or will not show on the screen.
    if(platform.volume!=='level'||platform.window)assert.ok(platform.note,provider);
  }
});
