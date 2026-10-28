import {test,expect} from '@playwright/test';
import {fileURLToPath} from 'node:url';
import {DAY_NIGHT,gameHour} from '../../apps/web/src/engine/day-night';
import type {EnvironmentLighting} from '../../apps/web/src/engine/environment-lighting';
import {previewPath} from './preview-path';
type EnvironmentStatus=ReturnType<EnvironmentLighting['telemetry']>;
const fixture='/@fs/'+fileURLToPath(new URL('../fixtures/environment.html',import.meta.url)).replaceAll('\\','/');

test('the authored skewer cart has visible geometry below its fire and smoke FX',async({page})=>{
  await page.goto(fixture);await page.evaluate(()=>(window as any).fixture.ready);
  expect(await page.evaluate(()=>(window as any).fixture.scene.getMapStatus().cartRenders)).toBeGreaterThan(0);
  await page.evaluate(()=>(window as any).fixture.view([8.7,1.45,4.4],[8.7,.85,1.5]));
  await page.screenshot({path:'test-results/carrinho-espeto.png'});
  await page.evaluate(()=>(window as any).fixture.scene.destroy());
});

test('full map renders through daylight, dusk and night with correct light directions, shadows and border fog',async({page})=>{
  test.setTimeout(180000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto(fixture);await page.evaluate(()=>(window as any).fixture.ready);
  const status=():Promise<EnvironmentStatus>=>page.evaluate(()=>(window as any).fixture.scene.getEnvironmentStatus());
  const luminance=async()=>{
    const data:number[]=await page.evaluate(()=>(window as any).fixture.pixels());
    let sum=0;for(let i=0;i<data.length;i+=4)sum+=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];return sum/(data.length/4)/255;
  };
  await expect.poll(async()=>(await status()).sun?.enabled).toBe(true);
  await page.waitForTimeout(1000);const day=await status(),dayBrightness=await luminance();
  expect(day.hour).toBeCloseTo(12);expect(day.sun!.direction[1]).toBeLessThan(-.9);expect(day.sun!.cascades).toBe(2);
  expect(day.lamps.filter(l=>l.outside).every(l=>!l.enabled)).toBe(true);
  expect(day.lamps.filter(l=>!l.outside).every(l=>l.shadows&&l.direction[1]<-.99)).toBe(true);
  expect(day.lamps.filter(l=>l.street).length).toBe(12);
  expect(day.realtimeLocalShadows).toBe(0);
  await page.screenshot({path:previewPath('day-night-noon.png')});
  await page.evaluate(()=>(window as any).fixture.hour(18));await expect.poll(async()=>(await status()).hour).toBeCloseTo(18);
  await page.screenshot({path:previewPath('day-night-dusk.png')});
  await page.evaluate(()=>(window as any).fixture.hour(0));await expect.poll(async()=>(await status()).moon?.enabled).toBe(true);
  const night=await status(),nightBrightness=await luminance();expect(night.sun!.enabled).toBe(false);expect(night.moon!.direction[1]).toBeLessThan(-.9);
  expect(night.lamps.every(l=>l.enabled&&l.shadows)).toBe(true);expect(nightBrightness).toBeLessThan(dayBrightness);expect(nightBrightness).toBeGreaterThan(.04);
  await page.screenshot({path:previewPath('day-night-midnight.png')});
  await page.evaluate(()=>(window as any).fixture.view([10,2.4,-4.5],[15,1.2,-8]));
  await page.screenshot({path:previewPath('day-night-interior.png')});
  const moonBefore=(await status()).moon!.intensity;
  await page.evaluate(()=>(window as any).fixture.event('BLACKOUT'));await expect.poll(async()=>(await status()).electrical,{timeout:20000}).toBeLessThan(.04);
  expect((await status()).moon!.intensity).toBeCloseTo(moonBefore);expect((await status()).lamps.every(l=>l.intensity<.2)).toBe(true);
  await page.evaluate(()=>(window as any).fixture.event('PARTY'));await expect.poll(async()=>(await status()).party,{timeout:20000}).toBeGreaterThan(.95);
  await page.evaluate(()=>(window as any).fixture.event(''));await expect.poll(async()=>(await status()).electrical,{timeout:20000}).toBeGreaterThan(.98);
  await page.evaluate(()=>{(window as any).fixture.hour(12);(window as any).fixture.view([-101,4,-13],[-112,1,-13]);});
  await page.screenshot({path:previewPath('day-night-border-fog.png')});
  const rim:number[]=await page.evaluate(()=>(window as any).fixture.pixels());
  for(let channel=0;channel<3;channel++)expect(Math.abs(rim[channel]-rim[rim.length-4+channel])).toBeLessThan(3);
  expect((await status()).edgeFogWidth).toBe(8);
  // The sky must respect the depth-written alpha aperture used by the real YouTube TV.
  await page.evaluate(()=>{const f=(window as any).fixture;f.view([7.3,2.33,-10.3],[7.3,2.33,-11.447]);f.scene.showTelevision('tv-hall',true);});
  const aperture:number[]=await page.evaluate(()=>(window as any).fixture.pixels());
  expect(aperture[(16*48+24)*4+3]).toBe(0);
  await page.evaluate(()=>(window as any).fixture.scene.showTelevision('tv-hall',false));
  const opaque:number[]=await page.evaluate(()=>(window as any).fixture.pixels());expect(opaque[(16*48+24)*4+3]).toBe(255);
  expect(errors).toEqual([]);
  await page.evaluate(()=>(window as any).fixture.scene.destroy());
});

test('the lit facade keeps its colours, the map jukebox lights up with the video and the job objective is drawn',async({page})=>{
  test.setTimeout(180000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto(fixture);await page.evaluate(()=>(window as any).fixture.ready);
  const status=():Promise<EnvironmentStatus>=>page.evaluate(()=>(window as any).fixture.scene.getEnvironmentStatus());
  const block=async()=>{
    const data:number[]=await page.evaluate(()=>(window as any).fixture.pixels());let r=0,g=0,b=0,n=0;
    for(let y=12;y<20;y++)for(let x=20;x<28;x++){const i=(y*48+x)*4;r+=data[i]!;g+=data[i+1]!;b+=data[i+2]!;n++;}
    return [r/n,g/n,b/n];
  };
  // The facade (13_fachada.py): emission held at the authored colour on screen, exposure included; the halo at night.
  await expect.poll(async()=>(await status()).facade.materials.length).toBe(3);
  const noon=await status();
  expect(noon.facade.materials.map(m=>m.name).sort()).toEqual(['Letreiro_Highland','Neon_Magenta','Placa_Highland']);
  for(const material of noon.facade.materials)expect(material.intensity*noon.exposure).toBeCloseTo(1,2);
  expect(noon.facade.light).toMatchObject({type:'omni',enabled:false});
  await page.evaluate(()=>{const f=(window as any).fixture;f.hour(0);f.view([-4.6,5.2,1.4],[3.08,5.05,-3.08]);});
  await expect.poll(async()=>(await status()).facade.light?.enabled).toBe(true);
  const sign=await block();expect(Math.max(...sign)).toBeGreaterThan(110);
  await page.screenshot({path:previewPath('facade-night.png')});
  await page.evaluate(()=>{const f=(window as any).fixture;f.hour(12);f.view([-4.5,3.2,9],[6,2.6,-3]);});
  await page.waitForTimeout(800);await page.screenshot({path:previewPath('facade-day.png')});
  // The jukebox is the map's: dark while off, lit with the colours of the video while it plays, dimmed when paused.
  const jukebox=()=>page.evaluate(()=>(window as any).fixture.scene.getMapStatus().jukebox);
  const play=(status:string)=>page.evaluate(status=>{const f=(window as any).fixture,now=f.now();
    f.scene.setWorld({players:{},npcs:{},tables:{},event:{id:'',type:'',startedAt:0,durationMs:0},occupancy:0,capacity:32,serverTime:now,
      jukeboxes:{jukebox:{id:'jukebox',videoId:'M7lc1UVf-VE',status,position:30,updatedAt:now,updatedBy:'fixture',revision:1}}},'');},status);
  await page.evaluate(()=>{const f=(window as any).fixture;f.hour(21);f.view([15.7,1.35,-8.9],[15.7,1.05,-11.29]);});
  await expect.poll(async()=>(await status()).facade.light?.enabled).toBe(true);
  expect(await jukebox()).toMatchObject({lit:false,light:false});
  const off=await block();await page.screenshot({path:previewPath('jukebox-off.png')});
  await play('playing');
  await expect.poll(async()=>(await jukebox()).palette,{timeout:20000}).toBe(true);
  await expect.poll(async()=>(await jukebox()).level,{timeout:10000}).toBeGreaterThan(.97);
  const lit=await jukebox();expect(lit).toMatchObject({lit:true,light:true,videoId:'M7lc1UVf-VE'});
  expect(lit.colors.some((c:string)=>c!=='#ffad47'),'the video colours replace the idle amber').toBe(true);
  const on=await block();expect(on.reduce((a,b)=>a+b)).toBeGreaterThan(off.reduce((a,b)=>a+b)+12);
  await page.screenshot({path:previewPath('jukebox-playing.png')});
  // The colours run along the tubes with the song.
  await page.evaluate(()=>(window as any).fixture.advance(1300));await page.waitForTimeout(300);
  await page.screenshot({path:previewPath('jukebox-playing-2.png')});
  await play('paused');await expect.poll(async()=>(await jukebox()).level,{timeout:10000}).toBeLessThan(.33);
  await play('off');await expect.poll(async()=>(await jukebox()).lit,{timeout:10000}).toBe(false);
  // The worker's objective: a marker on the station only while one is set, projected for the on-screen blip.
  await page.evaluate(()=>{const f=(window as any).fixture,now=f.now();
    f.scene.setWorld({players:{me:{id:'me',displayName:'Eu',color:'#fff',skin:'nathan',x:10.6,y:.3,z:-5.9,rotation:0,animationState:'idle',animationStartedAt:0,interactionState:'',currentTableId:'',lastProcessedInput:0,connected:true}},
      npcs:{},tables:{},event:{id:'',type:'',startedAt:0,durationMs:0},occupancy:1,capacity:32,serverTime:now},'me');
    f.view([10.6,2.5,-4.4],[10.6,.9,-7.6]);f.scene.setObjective({x:10.6,y:.3,z:-7.6,top:1.078});});
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.scene.projectObjective()?.onScreen)).toBe(true);
  const blip=await page.evaluate(()=>(window as any).fixture.scene.projectObjective());expect(blip.distance).toBeCloseTo(1.7,1);
  await page.screenshot({path:previewPath('job-objective.png')});
  await page.evaluate(()=>(window as any).fixture.scene.setObjective(null));
  expect(await page.evaluate(()=>(window as any).fixture.scene.projectObjective())).toBeNull();
  // The next task moves the same marker. A marker rebuilt here drew the ring mesh freed with the old one: every
  // frame threw and the view froze (pixels() waits for a finished frame).
  await page.evaluate(()=>(window as any).fixture.scene.setObjective({x:13.2,y:.3,z:-7.6,top:1.078}));
  await page.evaluate(()=>(window as any).fixture.pixels());
  expect(await page.evaluate(()=>(window as any).fixture.scene.getMapStatus().objective)).toMatchObject({x:13.2,z:-7.6,visible:true});
  expect(await page.evaluate(()=>(window as any).fixture.scene.projectObjective())).not.toBeNull();
  await page.evaluate(()=>(window as any).fixture.scene.setObjective(null));
  expect(await page.evaluate(()=>(window as any).fixture.scene.projectObjective())).toBeNull();
  expect(errors).toEqual([]);
  await page.evaluate(()=>(window as any).fixture.scene.destroy());
});

test('the live game follows the server clock and keeps the cycle when returning to the lobby',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  expect((await page.request.post('/api/auth/login',{data:{email:'jogador2@bar.local',password:process.env.DEMO_PASSWORD||'ButecoDemo2026!'}})).ok()).toBe(true);
  await page.goto('/');await page.getByRole('button',{name:'Entrar no bar'}).click();
  await expect(page.locator('#waiting')).toBeHidden({timeout:60000});
  await expect.poll(()=>page.evaluate(()=>!!(window as any).barDebug.snapshot().world?.serverTime)).toBe(true);
  const {world,hour}=await page.evaluate(()=>({world:(window as any).barDebug.snapshot().world,hour:(window as any).barDebug.environment().hour}));
  // The 12.5 MB neighbourhood can briefly delay the first rendered sample behind the latest world packet.
  expect(Math.abs(hour-gameHour(world.serverTime))).toBeLessThan(.06);
  const before=await page.evaluate(()=>({hour:(window as any).barDebug.environment().hour,time:Date.now()}));
  await page.getByRole('button',{name:'Sua conta',exact:true}).click();await page.locator('#modal [data-action="leave"]').click();
  await expect(page.locator('#lobby')).toBeVisible();
  const after=await page.evaluate(()=>({hour:(window as any).barDebug.environment().hour,time:Date.now()}));
  const expected=(before.hour+(after.time-before.time)/DAY_NIGHT.durationMs*24)%24,difference=Math.abs(after.hour-expected);
  expect(Math.min(difference,24-difference)).toBeLessThan(.03);
  expect(errors).toEqual([]);
});
