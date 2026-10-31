import {test,expect} from '@playwright/test';
import {fileURLToPath} from 'node:url';
import {heard,open,paste,realPlatform,shared,telemetry,type RealPlatform} from './media-fixture';
import {previewPath} from './preview-path';
import {walk} from './walk';

// A tone in memory: a real file for the browser's own element, with no outside site involved.
function wav(seconds:number):Buffer{
  const rate=8000,samples=rate*seconds,data=Buffer.alloc(44+samples);
  data.write('RIFF',0);data.writeUInt32LE(36+samples,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);data.writeUInt32LE(rate,24);data.writeUInt32LE(rate,28);data.writeUInt16LE(1,32);data.writeUInt16LE(8,34);data.write('data',36);data.writeUInt32LE(samples,40);
  for(let i=0;i<samples;i++)data[44+i]=128+Math.round(40*Math.sin(i/6));
  return data;
}

test('a direct file plays on the TV screens, follows pause, seek and volume, and the queue moves between platforms',async({page})=>{
  test.setTimeout(120000);
  await page.route('https://media.bar-fixture.net/**',route=>{
    const url=route.request().url();
    if(url.endsWith('.wav')){
      // The browser seeks a file by asking for parts of it.
      const body=wav(/curto/.test(url)?3:60),range=/bytes=(\d+)-(\d*)/.exec(route.request().headers().range??'');
      if(!range)return route.fulfill({status:200,contentType:'audio/wav',headers:{'accept-ranges':'bytes'},body});
      const from=Number(range[1]),to=range[2]?Number(range[2]):body.length-1;
      return route.fulfill({status:206,contentType:'audio/wav',headers:{'accept-ranges':'bytes','content-range':`bytes ${from}-${to}/${body.length}`},body:body.subarray(from,to+1)});
    }
    return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><p>uma página, não um vídeo'});
  });
  await page.addInitScript({path:fileURLToPath(new URL('../fixtures/youtube-api-mock.js',import.meta.url))});
  await open(page);
  // A page is no media: the check refuses it and nothing is sent.
  await paste(page,'https://media.bar-fixture.net/pagina');
  await expect(page.locator('#tv-error')).toContainText('não é um vídeo ou áudio válido');
  expect(await page.evaluate(()=>(window as any).fixture.sent.length)).toBe(0);
  // Addresses no public site answers to never get that far, and neither do platforms with no controllable player.
  for(const [url,reason] of [['http://media.bar-fixture.net/a.mp4','https://'],['https://192.168.0.1/a.mp4','válido'],['https://localhost/a.mp4','válido'],['https://www.dailymotion.com/video/x84sh87','Dailymotion'],['https://www.facebook.com/watch/?v=1','Facebook']] as const){
    await paste(page,url);await expect(page.locator('#tv-error')).toContainText(reason);
  }
  await page.locator('#tv-url').fill('https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl');await expect(page.locator('#tv-hint')).toContainText('Spotify');
  await page.locator('#tv-url').fill('');await expect(page.locator('#tv-hint')).toBeHidden();

  await paste(page,'https://media.bar-fixture.net/musica_boa.wav');
  await expect.poll(async()=>(await shared(page)).provider).toBe('file');
  expect((await shared(page)).title).toBe('musica boa');
  await expect.poll(async()=>(await heard(page))?.status,{timeout:30000}).toBe('playing');
  await expect(page.locator('#tv-platform')).toHaveText('Link direto');
  // Three screens, three elements; only the nearest has sound.
  const elements=await page.locator('.tv-player video').evaluateAll(all=>all.map(v=>({muted:(v as HTMLVideoElement).muted,volume:(v as HTMLVideoElement).volume})));
  expect(elements.filter(v=>!v.muted).length).toBe(1);expect(elements.length).toBe(3);
  // On the TV's screen, under the canvas, not in a window.
  expect((await heard(page)).mode).toBe('tv');await expect(page.locator('.media-window')).toHaveCount(0);
  await expect.poll(async()=>(await heard(page)).currentTime).toBeGreaterThan(1);
  await page.locator('[data-media=pause]').click();
  await expect.poll(async()=>(await heard(page)).status).toBe('paused');
  await page.locator('[data-media=resume]').click();await expect.poll(async()=>(await heard(page)).status).toBe('playing');
  await page.locator('[data-media-step="1"]').click();
  await expect.poll(async()=>(await heard(page)).currentTime).toBeGreaterThan(10);
  // Next in the queue: another platform, whose players replace these; the first entry's owner sees its platform in the list.
  await paste(page,'https://youtu.be/aqz-KE-bpKQ');
  await expect.poll(async()=>(await shared(page)).queue.length).toBe(1);
  await expect(page.locator('#tv-queue')).toContainText('YouTube');
  await page.locator('[data-media=skip]').click();
  await expect.poll(async()=>(await shared(page)).provider).toBe('youtube');
  await expect.poll(async()=>(await heard(page))?.status,{timeout:20000}).toBe('playing');
  await expect(page.locator('.tv-player video')).toHaveCount(0);await expect(page.locator('.tv-player iframe')).toHaveCount(3);
  // And back: a direct link after YouTube; a short one ends on its own and the source switches off.
  await paste(page,'https://media.bar-fixture.net/curto.wav');
  await expect.poll(async()=>(await shared(page)).queue.length).toBe(1);
  await page.locator('[data-media=skip]').click();
  await expect.poll(async()=>(await heard(page))?.provider).toBe('file');
  await expect.poll(async()=>(await shared(page)).status,{timeout:30000}).toBe('off');
  await expect.poll(async()=>(await telemetry(page)).length).toBe(0);
  await expect(page.locator('.tv-player')).toHaveCount(0);
  await page.evaluate(()=>(window as any).fixture.teardown());
});

// The platforms' real players. Third parties can take a video down or be unreachable: a failure here says which one.
const REAL:RealPlatform[]=[
  {name:'YouTube',provider:'youtube',url:'https://www.youtube.com/watch?v=aqz-KE-bpKQ',seek:true},
  {name:'SoundCloud',provider:'soundcloud',url:'https://soundcloud.com/forss/flickermood',seek:true},
  {name:'Mixcloud',provider:'mixcloud',url:'https://www.mixcloud.com/spartacus/party-time/',seek:true},
  {name:'Spotify',provider:'spotify',url:'https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl',seek:false},
  {name:'TikTok',provider:'tiktok',url:'https://www.tiktok.com/@scout2015/video/6718335390845095173',seek:false},
  {name:'MP4 direto',provider:'file',url:'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4',seek:false},
  {name:'HLS',provider:'file',url:'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',seek:true},
  {name:'Rádio',provider:'file',url:'https://stream.radioparadise.com/mp3-128',seek:false,stream:true},
];
for(const platform of REAL)test(`real ${platform.name}: plays under the canvas, pauses, resumes, and leaves no player behind`,realPlatform(platform));
test('real Twitch: a channel opens in a window over the game; it can be closed here and brought back',async({page})=>{
  test.setTimeout(150000);
  await open(page);
  // Only channels on the air play; one of these usually is.
  let live='';
  for(const channel of ['gaules','riotgames','ibai','esl_csgo','kaicenat','loud_coringa']){
    await paste(page,`https://www.twitch.tv/${channel}`);
    await expect.poll(async()=>(await shared(page)).provider,{timeout:15000}).toBe('twitch');
    const status=await expect.poll(async()=>{const p=await telemetry(page);return p[0]?.status;},{timeout:30000}).toBe('playing').then(()=>'playing',()=>'');
    if(status){live=channel;break;}
    // Off the air: the report skips it and the source goes off.
    await expect.poll(async()=>(await shared(page)).status,{timeout:20000}).toBe('off');
  }
  test.skip(!live,'nenhum canal testado estava no ar');
  const card=page.locator('.media-window');
  await expect(card).toHaveCount(1);
  const box=(await card.boundingBox())!;expect(box.width).toBeGreaterThanOrEqual(400);expect(box.height).toBeGreaterThanOrEqual(300);
  const p=(await telemetry(page))[0];expect(p.mode).toBe('window');
  expect((await shared(page)).live).toBe(true);
  // Only one player for the three screens, and the TVs keep their standby picture.
  await expect(page.locator('.tv-player iframe')).toHaveCount(1);
  const shown=await page.evaluate(()=>(window as any).fixture.shown);expect(Object.values(shown).some(Boolean)).toBe(false);
  await card.getByRole('button',{name:'Fechar'}).click();await expect(card).toBeHidden();
  await expect(page.locator('#tv-state')).toContainText('janela fechada');
  await page.locator('[data-media-local=activate]').click();await expect(card).toBeVisible();
  await expect.poll(async()=>(await telemetry(page))[0]?.status,{timeout:20000}).toBe('playing');
  await page.locator('[data-media=skip]').click();
  await expect.poll(async()=>(await telemetry(page)).length,{timeout:15000}).toBe(0);
  await page.evaluate(()=>(window as any).fixture.teardown());
});

const source=(path:string)=>'/@fs/'+fileURLToPath(new URL(path,import.meta.url)).replaceAll('\\','/');
test('in the game: another platform plays on the real TV screen, and its title comes from the server',async({page,request})=>{
  test.setTimeout(300000);
  await expect.poll(async()=>{try{return (await request.get('/api/health')).ok()&&(await request.get('http://localhost:2677/health')).ok();}catch{return false;}},{timeout:60000}).toBe(true);
  const suffix=Date.now().toString(36),name=`tv_${suffix}`;
  const created=await page.request.post('/api/auth/register',{headers:{'X-Forwarded-For':'::1'},data:{email:`${name}@example.com`,username:name,displayName:'Televisao',password:'JukeboxTeste2026!'}});
  expect(created.ok(),await created.text()).toBe(true);
  await page.context().setExtraHTTPHeaders({});
  await page.goto('/');await page.getByRole('button',{name:'Entrar no bar'}).click();await expect(page.locator('#waiting')).toBeHidden({timeout:60000});
  await expect.poll(()=>page.evaluate(()=>!!(window as any).barDebug.snapshot().world?.televisions?.['tv-main'])).toBe(true);
  await page.evaluate(`Promise.all([import(${JSON.stringify(source('../../packages/shared/src/index.ts'))}),import(${JSON.stringify(source('../../apps/server/src/world/navigation.ts'))})]).then(([shared,navigation])=>{
    const object=id=>shared.INTERACTABLES.find(i=>i.id===id);
    // On the object's own spot: at the edge of its reach, a chair nearby can be what the key offers.
    const reaches=(id,p,slack)=>shared.canInteract(object(id),p,slack)&&Math.hypot(p.x-object(id).x,p.z-object(id).z)<.55;
    const here=()=>{const d=window.barDebug.snapshot(),p=d.world.players[d.localId];return {x:p.x,y:p.y,z:p.z};};
    window.planner={goal:id=>({x:object(id).x,z:object(id).z}),reached:id=>reaches(id,here(),0),path:id=>navigation.findPath(here(),p=>reaches(id,p,.1),object(id),300000)?.map(p=>({x:p.x,z:p.z}))};
  })`);
  await walk(page,'tv-hall');
  await expect(page.locator('#context-label')).toHaveText('Usar a TV do salão');await page.keyboard.press('e');
  await expect(page.locator('#modal-title')).toHaveText('TVS DO SALÃO');
  const tvs=()=>page.evaluate(()=>(window as any).barDebug.snapshot().world.televisions['tv-main']);
  const players=()=>page.evaluate(()=>(window as any).barDebug.television());
  // An earlier test's video may still be on, with its owner gone: anyone at the screen can move it along.
  const clear=async(read:()=>Promise<any>)=>{
    for(let state=await read();state.status!=='off';state=await read()){
      await page.locator('[data-media=skip]').click();
      await expect.poll(async()=>(await read()).revision).not.toBe(state.revision);
    }
  };
  await clear(tvs);
  await page.locator('#tv-url').fill('https://soundcloud.com/forss/flickermood');await expect(page.locator('#tv-hint')).toContainText('SoundCloud');
  await page.locator('#tv-form button').click();
  await expect.poll(async()=>(await tvs()).provider,{timeout:30000}).toBe('soundcloud');
  await expect.poll(async()=>(await players()).find((p:any)=>p.audible)?.status,{timeout:60000}).toBe('playing');
  // The wallet charged it and the panel, the queue and the lights get what the server asked SoundCloud.
  await expect.poll(async()=>(await tvs()).title).toBe('Flickermood by Forss');await expect(page.locator('#tv-title')).toHaveText('Flickermood by Forss');
  expect((await tvs()).thumb).toMatch(/^https:\/\//);
  await expect(page.locator('#tv-platform')).toHaveText('SoundCloud');
  // Under the canvas, on the screen in front of us, heard from the nearest.
  const nearest=(await players()).find((p:any)=>p.audible);expect(nearest.screen).toBe('tv-hall');expect(nearest.mode).toBe('tv');expect(nearest.volume).toBeGreaterThan(0);
  await expect(page.locator('#tv-hint')).toBeHidden();
  await page.screenshot({path:previewPath('media-soundcloud-panel.png')});
  // Next: a direct file, whose picture shows through the same screen.
  await page.locator('#tv-url').fill('https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4');await page.locator('#tv-form button').click();
  await expect.poll(async()=>(await tvs()).queue.length,{timeout:30000}).toBe(1);
  await page.locator('[data-media=skip]').click();
  await expect.poll(async()=>(await tvs()).provider,{timeout:15000}).toBe('file');
  await expect.poll(async()=>(await players()).find((p:any)=>p.audible)?.status,{timeout:60000}).toBe('playing');
  // Up close, through the panel's own button: the picture on the screen, in the room.
  await page.getByRole('button',{name:'Assistir na TV',exact:true}).click();await page.waitForTimeout(2500);
  await page.screenshot({path:previewPath('media-file-tv.png')});
  const shown=await page.locator('.tv-player[data-screen="tv-hall"]').evaluate(frame=>({transform:(frame as HTMLElement).style.transform,visibility:getComputedStyle(frame).visibility,video:!!frame.querySelector('video')}));
  expect(shown.video).toBe(true);expect(shown.visibility).toBe('visible');expect(shown.transform).toContain('matrix3d');
  // The other screens' players never show at the page's corner, through this screen's aperture.
  const others=await page.locator('.tv-player:not([data-screen="tv-hall"])').evaluateAll(frames=>frames.map(frame=>({visibility:getComputedStyle(frame).visibility,transform:(frame as HTMLElement).style.transform})));
  expect(others.length).toBe(2);for(const other of others)expect(other.visibility==='hidden'||other.transform.includes('matrix3d'),JSON.stringify(other)).toBe(true);
  await page.keyboard.press('Escape');await expect(page.locator('#leave-tv')).toBeHidden();
  if(await page.locator('#modal-title').isVisible())await page.keyboard.press('Escape');
  await expect(page.locator('#modal-title')).toBeHidden();
  // The jukebox, sound only: the same link plays in its hidden player, and its lights take their colours from the track's cover.
  await walk(page,'jukebox');
  await expect(page.locator('#context-label')).toHaveText('Tocar a jukebox');await page.keyboard.press('e');
  await expect(page.locator('#modal-title')).toHaveText('JUKEBOX');
  await clear(()=>page.evaluate(()=>(window as any).barDebug.snapshot().world.jukeboxes.jukebox));
  await page.locator('#jukebox-url').fill('https://soundcloud.com/forss/flickermood');await page.locator('#jukebox-form button').click();
  const jukebox=()=>page.evaluate(()=>(window as any).barDebug.jukebox());
  await expect.poll(async()=>(await jukebox())[0]?.status,{timeout:60000}).toBe('playing');
  const hiddenPlayer=(await jukebox())[0];expect(hiddenPlayer.provider).toBe('soundcloud');expect(hiddenPlayer.mode).toBe('audio');expect(hiddenPlayer.volume).toBeGreaterThan(0);
  await expect.poll(()=>page.evaluate(()=>(window as any).barDebug.map().jukebox?.palette),{timeout:30000}).toBe(true);
});
