import {test,expect,type Page} from '@playwright/test';
import {fileURLToPath} from 'node:url';
import {DEFAULT_CHARACTER} from '../../packages/shared/src/character';
import catalog from '../../apps/web/src/assets/ambient.json' with {type:'json'};
const fixture='/@fs/'+fileURLToPath(new URL('../fixtures/ambient.html',import.meta.url)).replaceAll('\\','/');
const state=(page:Page)=>page.evaluate(()=>(window as any).fixture.audio.telemetry());

test('real AAC streams: quiet output, smooth crossfade, ducking, pause, persistent mute and teardown',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(fixture);
  expect((await state(page)).context).toBe('uninitialized');
  await page.locator('#enter').click();
  await expect.poll(async()=>(await state(page)).decks.filter((d:any)=>!d.paused).length).toBe(1);
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.rms())).toBeGreaterThan(.00001);
  expect(await page.evaluate(()=>(window as any).fixture.rms())).toBeLessThan(.08);
  await expect.poll(async()=>(await state(page)).decks.find((d:any)=>!d.paused)?.gain??0).toBeGreaterThan(.999);
  const first=(await state(page)).decks.find((d:any)=>d.id).id;
  await page.evaluate(()=>(window as any).fixture.seekEnd(5));
  await expect.poll(async()=>(await state(page)).crossfading).toBe(true);
  const crossing=await state(page);expect(crossing.decks.every((d:any)=>!d.paused)).toBe(true);
  expect(crossing.decks[0].id).not.toBe(crossing.decks[1].id);
  expect(crossing.decks.reduce((sum:number,d:any)=>sum+d.gain*d.gain,0)).toBeCloseTo(1,1);
  await expect.poll(async()=>(await state(page)).crossfading,{timeout:10000}).toBe(false);
  expect((await state(page)).decks.find((d:any)=>d.id).id).not.toBe(first);
  expect((await state(page)).decks.filter((d:any)=>d.id).length).toBe(1);
  await page.evaluate(()=>(window as any).fixture.audio.setSuppressed(true));
  expect((await state(page)).target).toBeCloseTo(.18*.3);
  await page.evaluate(()=>(window as any).fixture.audio.setSuppressed(false));
  expect((await state(page)).target).toBeCloseTo(.18);
  await page.evaluate(()=>(window as any).fixture.hidden(true));
  await expect.poll(async()=>(await state(page)).context).toBe('suspended');
  expect((await state(page)).decks.every((d:any)=>d.paused)).toBe(true);
  await page.evaluate(()=>(window as any).fixture.hidden(false));
  await expect.poll(async()=>(await state(page)).decks.some((d:any)=>!d.paused)).toBe(true);
  await page.locator('#toggle').click();await expect.poll(async()=>(await state(page)).context).toBe('suspended');
  await page.reload();await page.locator('#enter').click();expect((await state(page)).enabled).toBe(false);
  expect((await state(page)).decks.every((d:any)=>!d.id)).toBe(true);
  await page.locator('#toggle').click();await expect.poll(async()=>(await state(page)).decks.some((d:any)=>!d.paused)).toBe(true);
  await page.locator('#leave').click();await expect.poll(async()=>(await state(page)).context).toBe('suspended');
  expect((await state(page)).decks.every((d:any)=>!d.id&&d.paused)).toBe(true);
  await page.evaluate(()=>(window as any).fixture.audio.destroy());expect((await state(page)).decks).toEqual([]);
  expect(errors).toEqual([]);
});

test('missing recordings are skipped; every published AAC is actually decodable',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  let missing='';
  await page.route('**/audio/ambient/*.m4a',route=>{
    if(!missing)missing=new URL(route.request().url()).pathname;
    return new URL(route.request().url()).pathname===missing?route.fulfill({status:404}):route.continue();
  });
  await page.goto(fixture);await page.locator('#enter').click();
  await expect.poll(async()=>(await state(page)).failed.length).toBe(1);
  await expect.poll(async()=>(await state(page)).decks.some((d:any)=>!d.paused)).toBe(true);
  await page.unroute('**/audio/ambient/*.m4a');
  for(const track of catalog){
    const result=await page.evaluate(async url=>{
      const media=new Audio(url);
      try{await new Promise<void>((resolve,reject)=>{media.onloadeddata=()=>resolve();media.onerror=()=>reject(new Error('AAC decode failed'));media.load();});return media.duration;}
      finally{media.pause();media.removeAttribute('src');media.load();}
    },track.url);
    expect(result).toBeCloseTo(track.duration,0);
  }
  await page.evaluate(()=>(window as any).fixture.audio.destroy());expect(errors).toEqual([]);
});

test('autoplay rejection recovers on a gesture; unavailable next tracks fade out without a request loop',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(fixture);
  await page.evaluate(()=>{
    const original=HTMLMediaElement.prototype.play;let blocked=false;
    HTMLMediaElement.prototype.play=function(){if(!blocked){blocked=true;return Promise.reject(new DOMException('Gesture required','NotAllowedError'));}return original.call(this);};
  });
  await page.locator('#enter').click();await expect.poll(async()=>(await state(page)).blocked).toBe(true);
  expect((await state(page)).failed).toEqual([]);
  await page.locator('#enter').click();await expect.poll(async()=>(await state(page)).decks.some((d:any)=>!d.paused)).toBe(true);
  let requests=0;
  await page.route('**/audio/ambient/*.m4a',route=>{requests++;return route.fulfill({status:404});});
  await page.evaluate(()=>(window as any).fixture.seekEnd(1.2));
  await expect.poll(async()=>(await state(page)).decks.find((d:any)=>!d.paused)?.gain??1).toBeLessThan(.1);
  await expect.poll(async()=>(await state(page)).failed.length).toBe(6);
  const exhausted=requests;await page.waitForTimeout(1200);expect(requests).toBe(exhausted);
  await page.evaluate(()=>(window as any).fixture.audio.destroy());expect(errors).toEqual([]);
});

test('in-game ambience starts on entry, follows settings, leaves voice independent and stops at the lobby',async({page})=>{
  test.setTimeout(120000);
  const suffix=Date.now().toString(36);
  expect((await page.request.post('/api/auth/register',{data:{email:`amb_${suffix}@example.com`,username:`amb_${suffix}`,displayName:'Ambiente',password:'AmbienteTeste2026!'}})).ok()).toBe(true);
  expect((await page.request.post('/api/character',{data:DEFAULT_CHARACTER})).ok()).toBe(true);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');await page.getByRole('button',{name:'Entrar no bar'}).click();
  await expect(page.locator('#waiting')).toBeHidden({timeout:60000});
  const ambient=()=>page.evaluate(()=>(window as any).barDebug.ambient());
  await expect.poll(async()=>(await ambient()).decks.some((d:any)=>!d.paused)).toBe(true);
  await page.locator('[data-action="settings"]').click();
  await page.locator('[data-setting="music"]').fill('35');expect((await ambient()).target).toBeCloseTo(.18*.35);
  await page.locator('[data-setting="master"]').fill('50');expect((await ambient()).target).toBeCloseTo(.18*.35*.5);
  await page.locator('[data-setting="music"]').fill('0');await expect.poll(async()=>(await ambient()).context).toBe('suspended');
  expect(await page.evaluate(()=>(window as any).barDebug.voice().settings.voicesEnabled)).toBe(true);
  await page.locator('[data-setting="music"]').fill('35');await expect.poll(async()=>(await ambient()).decks.some((d:any)=>!d.paused)).toBe(true);
  await page.keyboard.press('Escape');await page.locator('#audio-button').click();await expect.poll(async()=>(await ambient()).context).toBe('suspended');
  expect((await ambient()).enabled).toBe(false);await page.locator('#audio-button').click();
  await expect.poll(async()=>(await ambient()).decks.some((d:any)=>!d.paused)).toBe(true);
  await page.getByRole('button',{name:'Sua conta',exact:true}).click();await page.locator('#modal [data-action="leave"]').click();
  await expect(page.locator('#lobby')).toBeVisible();await expect.poll(async()=>(await ambient()).context).toBe('suspended');
  expect((await ambient()).decks.every((d:any)=>!d.id&&d.paused)).toBe(true);expect(errors).toEqual([]);
});
