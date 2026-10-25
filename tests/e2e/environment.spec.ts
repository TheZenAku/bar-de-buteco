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
