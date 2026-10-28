import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {previewPath} from './preview-path';
const controllerFixture='/@fs/'+fileURLToPath(new URL('../fixtures/jukebox-controller.html',import.meta.url)).replaceAll('\\','/');
const tvFixture='/@fs/'+fileURLToPath(new URL('../fixtures/tv-controller.html',import.meta.url)).replaceAll('\\','/');
async function walkTo(page:Page,x:number,z:number,tolerance=.22):Promise<void>{
  const trail:string[]=[];
  for(let step=0;step<180;step++){
    const p=await page.evaluate(()=>{const s=(window as any).barDebug.snapshot();return s.world.players[s.localId];});
    const dx=x-p.x,dz=z-p.z;if(Math.hypot(dx,dz)<tolerance)return;
    // Keys move relative to the camera, which the TV view may have turned.
    const yaw=await page.evaluate(()=>(window as any).barDebug.listener()?.yaw??.15);
    const h=dx*Math.cos(yaw)-dz*Math.sin(yaw),f=-dx*Math.sin(yaw)-dz*Math.cos(yaw),key=Math.abs(h)>Math.abs(f)?h>0?'d':'a':f>0?'w':'s';
    trail.push(`${p.x.toFixed(2)},${p.z.toFixed(2)} yaw ${yaw.toFixed(2)} ${key}`);if(trail.length>8)trail.shift();
    await page.keyboard.press(key,{delay:60});await expect.poll(()=>page.evaluate(()=>(window as any).barDebug.network().pending),{intervals:[30,60,100]}).toBe(0);
  }throw new Error(`Unable to reach ${x},${z}: ${trail.join(' | ')}`);
}
test('real YouTube: jukebox and TV are independent sources, physical interaction, TV screen, controls and two listeners',async({page,browser,request})=>{
  test.setTimeout(480000);
  await expect.poll(async()=>{try{return (await request.get('/api/health')).ok()&&(await request.get('http://localhost:2677/health')).ok();}catch{return false;}}).toBe(true);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const suffix=Date.now().toString(36),password='JukeboxTeste2026!';
  const account=async(p:Page,name:string)=>{
    expect((await p.request.post('/api/auth/register',{headers:{'X-Forwarded-For':'::1'},data:{email:`${name}_${suffix}@example.com`,username:`${name}_${suffix}`,displayName:name,password}})).ok()).toBe(true);
    // Forwarded identity is for our API only. Sending it to YouTube/Googlevideo
    // adds unsupported CORS preflights to fonts, icons and actual video streams.
    await p.context().setExtraHTTPHeaders({});
    await p.goto('/');await p.getByRole('button',{name:'Entrar no bar'}).click();await expect(p.locator('#waiting')).toBeHidden({timeout:60000});
    await expect.poll(()=>p.evaluate(()=>!!(window as any).barDebug.snapshot().world?.jukeboxes?.jukebox)).toBe(true);
  };
  const telemetry=(p=page)=>p.evaluate(()=>(window as any).barDebug.jukebox());
  const shared=(p=page)=>p.evaluate(()=>(window as any).barDebug.snapshot().world.jukeboxes.jukebox);
  const tvTelemetry=(p=page)=>p.evaluate(()=>(window as any).barDebug.television());
  const tvShared=(p=page)=>p.evaluate(()=>(window as any).barDebug.snapshot().world.televisions['tv-main']);
  await account(page,'musica');
  for(const [x,z] of [[14.8,1],[14.8,-2.6],[15.3,-4.6],[15,-9.3],[15.7,-10.56]])await walkTo(page,x,z);
  await expect(page.locator('#context-label')).toHaveText('Tocar a jukebox');await page.keyboard.press('e');
  await expect(page.locator('#modal-title')).toHaveText('JUKEBOX');
  const before=await page.evaluate(()=>{const s=(window as any).barDebug.snapshot();return s.world.players[s.localId];});
  await page.keyboard.press('w',{delay:200});
  const after=await page.evaluate(()=>{const s=(window as any).barDebug.snapshot();return s.world.players[s.localId];});expect(after.x).toBeCloseTo(before.x);expect(after.z).toBeCloseTo(before.z);expect(after.animationState).not.toBe('dance');
  await page.locator('#jukebox-url').fill('https://evil.test/watch?v=M7lc1UVf-VE');await page.getByRole('button',{name:'Tocar',exact:true}).click();await expect(page.locator('#jukebox-error')).toContainText('válido');
  expect(await telemetry()).toEqual([]);
  await page.locator('#jukebox-url').fill('https://youtu.be/M7lc1UVf-VE');await page.getByRole('button',{name:'Tocar',exact:true}).click();
  await expect.poll(async()=>(await shared()).status).toBe('playing');
  await expect.poll(async()=>(await telemetry())[0]?.ready,{timeout:45000}).toBe(true);
  await expect.poll(async()=>['playing','blocked','error'].includes((await telemetry())[0]?.status),{timeout:25000}).toBe(true);
  if((await telemetry())[0]?.status==='blocked')await page.getByRole('button',{name:'Ativar reprodução neste navegador',exact:true}).click();
  await expect.poll(async()=>(await telemetry())[0]?.status,{timeout:40000}).toBe('playing');
  await expect.poll(async()=>(await telemetry())[0]?.currentTime,{timeout:20000}).toBeGreaterThan(1);
  // The jukebox is sound only: its player never shows, no corner card exists, and it drives no TV.
  expect(await page.locator('.jukebox-player.audio-only iframe').count()).toBe(1);expect(await page.locator('.tv-player iframe').count()).toBe(0);
  expect(await page.locator('.jukebox-player').evaluate(element=>getComputedStyle(element).opacity)).toBe('0');expect(await page.locator('.tv-dock').count()).toBe(0);
  expect((await telemetry())[0].mode).toBe('audio');await expect(page.getByRole('button',{name:'Assistir na TV',exact:true})).toHaveCount(0);
  expect((await tvShared()).status).toBe('off');
  await page.screenshot({path:previewPath('jukebox-controls.png')});
  // The ground floor's TVs: their own panel, link and players, while the jukebox keeps playing.
  await page.keyboard.press('Escape');await page.locator('#world').click({position:{x:470,y:240}});
  for(const [x,z] of [[14.2,-10.62],[12.3,-10.62],[11.5,-10.95],[10.2,-10.95],[8.9,-10.95],[7.3,-10.95],[7.3,-11.1]])await walkTo(page,x,z,.12);
  await expect(page.locator('#context-label')).toHaveText('Usar a TV do salão');await page.keyboard.press('e');
  await expect(page.locator('#modal-title')).toHaveText('TVS DO SALÃO');
  await page.locator('#tv-url').fill('https://www.youtube.com/watch?v=aqz-KE-bpKQ');await page.getByRole('button',{name:'Tocar',exact:true}).click();
  await expect.poll(async()=>(await tvShared()).status).toBe('playing');
  await expect.poll(async()=>(await tvTelemetry())[0]?.ready,{timeout:45000}).toBe(true);
  await expect.poll(async()=>['playing','blocked','error'].includes((await tvTelemetry())[0]?.status),{timeout:25000}).toBe(true);
  if((await tvTelemetry())[0]?.status==='blocked')await page.getByRole('button',{name:'Ativar reprodução neste navegador',exact:true}).click();
  await expect.poll(async()=>(await tvTelemetry())[0]?.status,{timeout:40000}).toBe('playing');
  expect((await shared()).videoId).toBe('M7lc1UVf-VE');expect((await telemetry())[0].videoId).toBe('M7lc1UVf-VE');
  // One player per screen of the group, all on the same video; the sound comes from the nearest screen only.
  expect(await page.locator('.tv-player iframe').count()).toBe(3);expect(await page.locator('.jukebox-player iframe').count()).toBe(1);
  expect((await tvTelemetry()).map((p:any)=>p.screen)).toEqual(['tv-hall','tv-left','tv-counter']);
  await expect.poll(async()=>(await tvTelemetry()).every((p:any)=>p.videoId==='aqz-KE-bpKQ')).toBe(true);
  expect((await tvTelemetry()).filter((p:any)=>p.audible).map((p:any)=>p.screen)).toEqual(['tv-hall']);
  const hall=page.locator('.tv-player[data-screen="tv-hall"]');
  await page.getByRole('button',{name:'Assistir na TV',exact:true}).click();
  await expect(page.locator('#modal')).toBeHidden();await expect.poll(async()=>(await tvTelemetry())[0]?.mode).toBe('tv');
  const box=await hall.locator('iframe').boundingBox();expect(box!.height).toBeGreaterThanOrEqual(200);expect(box!.width).toBeGreaterThanOrEqual(200);
  await page.screenshot({path:previewPath('jukebox-tv.png')});
  const firstTime=(await tvTelemetry())[0].currentTime;await page.waitForTimeout(1300);expect((await tvTelemetry())[0].currentTime).toBeGreaterThan(firstTime+.5);
  const straight=await hall.evaluate(element=>element.style.transform);
  await page.mouse.move(90,320);await page.mouse.down();await page.mouse.move(160,335,{steps:8});await page.mouse.up();
  await expect.poll(()=>hall.evaluate(element=>element.style.transform)).not.toBe(straight);
  expect((await tvTelemetry())[0].mode).toBe('tv');await page.screenshot({path:previewPath('jukebox-tv-angle.png')});
  await page.keyboard.press('Escape');await page.locator('#world').click({position:{x:470,y:240}});await page.keyboard.press('e');await expect(page.locator('#modal-title')).toHaveText('TVS DO SALÃO');
  // Pausing and switching the TV off leave the jukebox playing.
  await page.getByRole('button',{name:'Pausar',exact:true}).click();await expect.poll(async()=>(await tvTelemetry())[0]?.status).toBe('paused');
  expect((await shared()).status).toBe('playing');expect((await telemetry())[0].status).toBe('playing');
  await page.getByRole('button',{name:'Desligar TV',exact:true}).click();await expect.poll(()=>tvTelemetry()).toEqual([]);
  expect((await shared()).status).toBe('playing');expect((await telemetry())[0].videoId).toBe('M7lc1UVf-VE');
  await page.keyboard.press('Escape');await page.locator('#world').click({position:{x:470,y:240}});
  for(const [x,z] of [[7.3,-10.95],[8.9,-10.95],[10.2,-10.95],[11.5,-10.95],[12.3,-10.62],[14.2,-10.62],[15.7,-10.56]])await walkTo(page,x,z,.12);
  await page.keyboard.press('e');await expect(page.locator('#modal-title')).toHaveText('JUKEBOX');
  await page.getByRole('button',{name:'Pausar',exact:true}).click();await expect.poll(async()=>(await telemetry())[0]?.status).toBe('paused');
  const paused=(await telemetry())[0].currentTime;await page.waitForTimeout(1200);expect((await telemetry())[0].currentTime).toBeCloseTo(paused,0);
  await page.getByRole('button',{name:'Continuar',exact:true}).click();await expect.poll(async()=>(await telemetry())[0]?.status).toBe('playing');
  const context=await browser.newContext({viewport:{width:640,height:480}}),other=await context.newPage();other.on('pageerror',e=>errors.push(e.message));
  try {
    await account(other,'ouvinte');await expect.poll(async()=>(await shared(other)).videoId).toBe('M7lc1UVf-VE');await expect.poll(async()=>(await telemetry(other))[0]?.ready,{timeout:45000}).toBe(true);
    // No card to click: if the browser blocked autoplay, any click in the game releases it.
    await expect.poll(async()=>['playing','blocked'].includes((await telemetry(other))[0]?.status),{timeout:30000}).toBe(true);
    if((await telemetry(other))[0]?.status==='blocked')await other.locator('#world').click({position:{x:320,y:240}});
    await expect.poll(async()=>(await telemetry(other))[0]?.status,{timeout:30000}).toBe('playing');
    await other.getByRole('button',{name:'Sua conta',exact:true}).click();await page.bringToFront();
    const near=(await telemetry())[0].volume,far=(await telemetry(other))[0].volume;expect(near).toBeGreaterThan(far);
    await page.getByRole('button',{name:'Pausar',exact:true}).click();await expect.poll(async()=>(await telemetry(other))[0]?.status).toBe('paused');
    await page.getByRole('button',{name:'Continuar',exact:true}).click();await expect.poll(async()=>(await telemetry(other))[0]?.status).toBe('playing');
    await page.locator('#jukebox-url').fill('https://www.youtube.com/watch?v=aqz-KE-bpKQ');await page.getByRole('button',{name:'Tocar',exact:true}).click();
    await expect.poll(async()=>(await telemetry())[0]?.videoId).toBe('aqz-KE-bpKQ');await expect.poll(async()=>(await telemetry(other))[0]?.videoId).toBe('aqz-KE-bpKQ');
    await expect.poll(async()=>(await telemetry())[0]?.status,{timeout:40000}).toBe('playing');await expect.poll(async()=>(await telemetry())[0]?.currentTime,{timeout:15000}).toBeGreaterThan(.5);
    expect(await page.locator('.jukebox-player iframe').count()).toBe(1);
    await page.setViewportSize({width:390,height:844});await page.locator('#jukebox-volume').fill('35');await expect.poll(async()=>(await telemetry())[0].volume).toBe(35);
    await expect(page.getByRole('button',{name:'Fechar janela'})).toBeInViewport();
    expect(await page.locator('.jukebox-player iframe').count()).toBe(1);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:previewPath('jukebox-mobile.png')});await page.setViewportSize({width:960,height:640});
    await page.getByRole('button',{name:'Parar',exact:true}).click();await expect.poll(async()=>(await shared()).status).toBe('stopped');await expect.poll(async()=>['stopped','paused'].includes((await telemetry())[0]?.status)).toBe(true);
    await page.getByRole('button',{name:'Desligar jukebox',exact:true}).click();await expect.poll(()=>telemetry()).toEqual([]);await expect.poll(()=>telemetry(other)).toEqual([]);
    await page.keyboard.press('Escape');await page.keyboard.press('s',{delay:150});const moved=await page.evaluate(()=>{const s=(window as any).barDebug.snapshot();return s.world.players[s.localId];});expect(Math.hypot(moved.x-before.x,moved.z-before.z)).toBeGreaterThan(.15);
    expect(errors).toEqual([]);
  }finally{await context.close();}
});

test('API double: errors, autoplay, volume bounds, local distance, rapid replacement and teardown',async({page})=>{
  const mock=await readFile(new URL('../fixtures/youtube-api-mock.js',import.meta.url),'utf8');
  await page.route('https://www.youtube.com/iframe_api',route=>route.fulfill({contentType:'application/javascript',body:mock}));
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(controllerFixture);await page.locator('#jukebox-url').fill('https://youtu.be/M7lc1UVf-VE');await page.getByRole('button',{name:'Tocar',exact:true}).click();
  await expect(page.locator('#jukebox-state')).toContainText('Neste navegador: Reproduzindo');
  await expect(page.locator('#jukebox-title')).toContainText('<img src=x>');expect(await page.locator('#jukebox-title img').count()).toBe(0);
  expect(await page.evaluate(()=>(window as any).fixtureCreated)).toBe(1);
  for(const [code,message] of [[100,'removido'],[101,'não permite'],[150,'não permite'],[153,'não identificou'],[5,'Não foi possível']] as const){
    await page.evaluate(code=>(window as any).fixturePlayers.at(-1).options.events.onError({data:code}),code);await expect(page.locator('#jukebox-error')).toContainText(message);
  }
  await page.getByRole('button',{name:'Tentar conectar novamente'}).click();await expect(page.locator('#jukebox-state')).toContainText('Neste navegador: Reproduzindo');
  expect(await page.locator('.jukebox-player iframe').count()).toBe(1);
  await page.evaluate(()=>(window as any).fixturePlayers.at(-1).options.events.onAutoplayBlocked());await expect(page.getByRole('button',{name:'Ativar reprodução neste navegador',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Ativar reprodução neste navegador',exact:true}).click();await expect(page.locator('#jukebox-state')).toContainText('Neste navegador: Reproduzindo');
  await page.locator('#jukebox-volume').fill('100');
  await page.evaluate(()=>(window as any).fixture.position(15.7,.3,-11.29));
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.controller.telemetry()[0].volume)).toBe(100);
  await page.evaluate(()=>(window as any).fixture.position(15.7,.3,10));await expect.poll(()=>page.evaluate(()=>(window as any).fixture.controller.telemetry()[0].volume)).toBe(0);
  expect(await page.evaluate(()=>(window as any).fixturePlayers.at(-1).muted)).toBe(true);
  await page.evaluate(()=>(window as any).fixturePlayers.at(-1).unMute());await expect.poll(()=>page.evaluate(()=>(window as any).fixturePlayers.at(-1).isMuted())).toBe(true);
  await page.evaluate(()=>(window as any).fixture.position(15.7,.3,-10.56));
  await page.getByRole('button',{name:'Pausar',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).fixtureAmbient)).toBe(true);
  await page.locator('#jukebox-url').fill('https://www.youtube.com/shorts/aqz-KE-bpKQ');await page.getByRole('button',{name:'Tocar',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.controller.telemetry()[0].videoId)).toBe('aqz-KE-bpKQ');
  expect(await page.evaluate(()=>(window as any).fixtureCreated)).toBe(2); // one explicit retry, no player for replacement
  await page.evaluate(()=>(window as any).fixture.close());expect(await page.locator('.jukebox-player iframe').count()).toBe(1);
  await page.evaluate(()=>(window as any).fixture.open());await expect(page.locator('#jukebox-title')).toContainText('Vídeo de teste');
  await page.evaluate(()=>(window as any).fixture.connection(false));await expect.poll(()=>page.evaluate(()=>(window as any).fixture.controller.telemetry()[0].status)).toBe('hidden');
  await page.evaluate(()=>(window as any).fixture.connection(true));await expect.poll(()=>page.evaluate(()=>(window as any).fixture.controller.telemetry()[0].status)).toBe('playing');
  await page.getByRole('button',{name:'Desligar jukebox',exact:true}).click();await expect(page.locator('.jukebox-player iframe')).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).fixtureDestroyed)).toBe(2);await page.evaluate(()=>(window as any).fixture.teardown());expect(errors).toEqual([]);
});

test('unreachable YouTube API reports connection failure and permits a clean retry',async({page})=>{
  await page.route('https://www.youtube.com/iframe_api',route=>route.abort());
  await page.goto(controllerFixture);await page.locator('#jukebox-url').fill('https://youtu.be/M7lc1UVf-VE');await page.getByRole('button',{name:'Tocar',exact:true}).click();
  await expect(page.locator('#jukebox-error')).toContainText('conectar');
  const mock=await readFile(new URL('../fixtures/youtube-api-mock.js',import.meta.url),'utf8');
  await page.unroute('https://www.youtube.com/iframe_api');await page.route('https://www.youtube.com/iframe_api',route=>route.fulfill({contentType:'application/javascript',body:mock}));
  await page.getByRole('button',{name:'Tentar conectar novamente'}).click();await expect(page.locator('#jukebox-state')).toContainText('Neste navegador: Reproduzindo');expect(await page.locator('.jukebox-player iframe').count()).toBe(1);
  await page.evaluate(()=>(window as any).fixture.teardown());
});

test('API double: a TV group plays one video on every screen, heard from the nearest, never leaving its screens',async({page})=>{
  const mock=await readFile(new URL('../fixtures/youtube-api-mock.js',import.meta.url),'utf8');
  await page.route('https://www.youtube.com/iframe_api',route=>route.fulfill({contentType:'application/javascript',body:mock}));
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const tv=()=>page.evaluate(()=>(window as any).fixture.controller.telemetry());
  await page.goto(tvFixture);await page.locator('#tv-url').fill('https://youtu.be/M7lc1UVf-VE');await page.getByRole('button',{name:'Tocar',exact:true}).click();
  // One player per screen of the ground floor, all on the shared video; upstairs stays off.
  await expect.poll(async()=>(await tv()).map((p:any)=>[p.screen,p.videoId,p.status])).toEqual([['tv-hall','M7lc1UVf-VE','playing'],['tv-left','M7lc1UVf-VE','playing'],['tv-counter','M7lc1UVf-VE','playing']]);
  expect(await page.evaluate(()=>(window as any).fixtureCreated)).toBe(3);
  // Only the screen nearest to the listener is heard; the others are muted, so the sound never doubles.
  await expect.poll(async()=>(await tv()).map((p:any)=>p.audible)).toEqual([true,false,false]);
  await expect.poll(()=>page.evaluate(()=>(window as any).fixturePlayers.map((p:any)=>p.muted))).toEqual([false,true,true]);
  await page.evaluate(()=>(window as any).fixture.stand('tv-counter'));
  await expect.poll(async()=>(await tv()).map((p:any)=>p.audible)).toEqual([false,false,true]);
  await expect.poll(()=>page.evaluate(()=>(window as any).fixturePlayers.map((p:any)=>p.muted))).toEqual([true,true,false]);
  // The picture is always on its screen: any projected size, even tiny or partly off the page; no corner card.
  const quad=(x:number,y:number,w:number,h:number)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
  const hall=page.locator('.tv-player[data-screen="tv-hall"]');
  for(const points of [quad(120,80,400,225),quad(300,200,40,22),quad(-150,-40,300,170)]){
    await page.evaluate(points=>(window as any).fixture.project('tv-hall',points),points);
    await expect.poll(async()=>(await tv())[0].mode).toBe('tv');
    await expect.poll(()=>hall.evaluate(element=>element.style.transform)).toMatch(/^matrix3d/);
    expect(await hall.evaluate(element=>element.style.visibility)).toBe('');
  }
  expect(await page.evaluate(()=>(window as any).fixture.shown['tv-hall'])).toBe(true);
  // Seen from behind there is no projection: the picture is not drawn, and playback goes on.
  await page.evaluate(()=>(window as any).fixture.project('tv-hall',null));
  await expect.poll(async()=>(await tv())[0].mode).toBe('hidden');expect(await hall.evaluate(element=>element.style.visibility)).toBe('hidden');
  expect((await tv())[0].status).toBe('playing');expect(await page.evaluate(()=>(window as any).fixture.shown['tv-hall'])).toBe(false);
  expect(await page.locator('.tv-dock').count()).toBe(0);
  // Only the player being heard reports the end of the video.
  await page.evaluate(()=>{const players=(window as any).fixturePlayers;players[0].emit(0);players[2].emit(0);});
  expect(await page.evaluate(()=>(window as any).fixture.sent.filter((m:any)=>m.type==='tv.ended').length)).toBe(1);
  await page.getByRole('button',{name:'Desligar TV',exact:true}).click();await expect(page.locator('.tv-player')).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).fixtureDestroyed)).toBe(3);await page.evaluate(()=>(window as any).fixture.teardown());expect(errors).toEqual([]);
});

test('saved session resolves before the entry button can submit an empty login form',async({page,request})=>{
  await expect.poll(async()=>{try{return (await request.get('/api/health')).ok()&&(await request.get('http://localhost:2677/health')).ok();}catch{return false;}}).toBe(true);
  expect((await page.request.post('/api/auth/login',{data:{email:'admin@bar.local',password:process.env.DEMO_PASSWORD||'ButecoDemo2026!'}})).ok()).toBe(true);
  let release!:()=>void,requested=false,tickets=0;
  const gate=new Promise<void>(resolve=>release=resolve);
  await page.route('**/api/auth/me',async route=>{if(!requested){requested=true;await gate;}await route.continue();});
  page.on('request',request=>{if(request.url().endsWith('/api/game-ticket'))tickets++;});
  await page.goto('/');await expect.poll(()=>requested).toBe(true);
  const button=page.getByRole('button',{name:'Entrar no bar'});await expect(button).toBeDisabled();await expect(page.locator('#auth-content')).toHaveAttribute('aria-busy','true');
  const entry=button.click();release();await entry;
  await expect(page.locator('#waiting')).toBeHidden({timeout:60000});
  await expect.poll(()=>page.evaluate(()=>{const s=(window as any).barDebug.snapshot();return s.world?.players[s.localId]?.connected===true;})).toBe(true);
  expect(tickets).toBe(1);await page.request.post('/api/auth/logout',{data:{}});
});
