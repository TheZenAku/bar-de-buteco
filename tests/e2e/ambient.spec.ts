import {test,expect,type Page} from '@playwright/test';
import {fileURLToPath} from 'node:url';
import catalog from '../../apps/web/src/assets/city-sounds.json' with {type:'json'};
import {menuItem} from './menu';
const fixture='/@fs/'+fileURLToPath(new URL('../fixtures/ambient.html',import.meta.url)).replaceAll('\\','/');
const state=(page:Page)=>page.evaluate(()=>(window as any).fixture.audio.telemetry());
const beds=async(page:Page)=>Object.fromEntries(((await state(page)).city?.beds??[]).map((bed:any)=>[bed.id,bed]));
const set=(page:Page,values:object)=>page.evaluate(v=>(window as any).fixture.set(v),values);

test('the city plays from real AAC: the layers follow hour, weather and roof; one-offs come and go; ducking, pause and teardown',async({page})=>{
  test.setTimeout(120000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(fixture);
  expect((await state(page)).context).toBe('uninitialized');
  await page.locator('#enter').click();
  await expect.poll(async()=>(await state(page)).context).toBe('running');
  // Midday in the middle of town: the day's layers load and come up, the night's stay out of memory.
  await expect.poll(async()=>Object.values(await beds(page)).filter((bed:any)=>bed.loaded&&bed.gain>.1).length,{timeout:20000}).toBeGreaterThanOrEqual(2);
  let now=await beds(page);
  expect(now['dia-a'].loaded).toBe(true);expect(now['grilos-a'].loaded).toBe(false);expect(now['salao'].loaded).toBe(false);
  const level=await page.evaluate(()=>(window as any).fixture.rms());
  expect(level).toBeGreaterThan(.002);expect(level).toBeLessThan(.05);
  // Night: the crickets come in and the day goes out.
  await set(page,{hour:23.5,night:1});
  await expect.poll(async()=>(await beds(page))['grilos-a'].gain,{timeout:20000}).toBeGreaterThan(.1);
  await expect.poll(async()=>(await beds(page))['dia-a'].gain,{timeout:20000}).toBeLessThan(.05);
  // A room: the street's layers drop, the room's own tone comes up.
  const outdoors=(await beds(page))['noite-a'].gain;
  await set(page,{enclosed:1});
  await expect.poll(async()=>(await beds(page))['salao'].gain,{timeout:20000}).toBeGreaterThan(.2);
  await expect.poll(async()=>(await beds(page))['noite-a'].gain,{timeout:20000}).toBeLessThan(outdoors*.5);
  await set(page,{enclosed:0});
  // One-offs are scheduled, placed in the world and finish by themselves.
  expect(await page.evaluate(()=>(window as any).fixture.audio.trigger('cao'))).toBe(true);
  // At night dogs also bark on their own, so at least the one asked for.
  await expect.poll(async()=>(await state(page)).city.played.cao??0).toBeGreaterThanOrEqual(1);
  expect((await state(page)).city.voices.length).toBeGreaterThan(0);
  expect(await page.evaluate(()=>(window as any).fixture.audio.trigger('nao-existe'))).toBe(false);
  await expect.poll(async()=>(await state(page)).city.voices.length,{timeout:30000}).toBe(0);
  expect((await state(page)).city.failed).toEqual([]);
  // Ducking for the jukebox and TVs.
  await page.evaluate(()=>(window as any).fixture.audio.setSuppressed(true));
  expect((await state(page)).target).toBeCloseTo(.5*.3);
  await page.evaluate(()=>(window as any).fixture.audio.setSuppressed(false));
  expect((await state(page)).target).toBeCloseTo(.5);
  // A hidden tab goes quiet and stops; coming back resumes.
  await page.evaluate(()=>(window as any).fixture.hidden(true));
  await expect.poll(async()=>(await state(page)).context).toBe('suspended');
  await page.evaluate(()=>(window as any).fixture.hidden(false));
  await expect.poll(async()=>(await state(page)).context).toBe('running');
  expect((await state(page)).city.running).toBe(true);
  // The mute is remembered across reloads and keeps the world silent.
  await page.locator('#toggle').click();await expect.poll(async()=>(await state(page)).context).toBe('suspended');
  await page.reload();await page.locator('#enter').click();expect((await state(page)).enabled).toBe(false);
  await expect.poll(async()=>(await state(page)).target).toBe(0);
  await page.locator('#toggle').click();await expect.poll(async()=>(await state(page)).context).toBe('running');
  // Leaving the bar lets go of every layer.
  await page.locator('#leave').click();await expect.poll(async()=>(await state(page)).context).toBe('suspended');
  await expect.poll(async()=>((await state(page)).city.beds as any[]).some(bed=>bed.loaded)).toBe(false);
  await page.evaluate(()=>(window as any).fixture.audio.destroy());
  expect(errors).toEqual([]);
});

test('a missing recording is skipped without a retry loop, and every published AAC decodes at its stated length',async({page})=>{
  test.setTimeout(120000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  let requests=0;
  await page.route('**/audio/cidade/dia-a-*.m4a',route=>{requests++;return route.fulfill({status:404});});
  await page.goto(fixture);await page.locator('#enter').click();
  await expect.poll(async()=>(await beds(page))['dia-a'].failed).toBe(true);
  // The other day layer still plays, and the failed one is not asked for again.
  await expect.poll(async()=>(await beds(page))['dia-b'].gain,{timeout:20000}).toBeGreaterThan(.1);
  const asked=requests;await page.waitForTimeout(1500);expect(requests).toBe(asked);
  await page.unroute('**/audio/cidade/dia-a-*.m4a');
  const lengths=await page.evaluate(async list=>{
    const context=new AudioContext({sampleRate:32000}),out:Record<string,number>={};
    for(const entry of list){const bytes=await (await fetch(entry.url)).arrayBuffer();out[entry.id]=(await context.decodeAudioData(bytes)).duration;}
    await context.close();return out;
  },[...catalog.beds,...catalog.spots].map(entry=>({id:entry.id,url:entry.url})));
  for(const entry of [...catalog.beds,...catalog.spots])expect(lengths[entry.id],entry.id).toBeCloseTo(entry.duration,0);
  await page.evaluate(()=>(window as any).fixture.audio.destroy());expect(errors).toEqual([]);
});

test('autoplay rejection recovers on a gesture',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(fixture);
  await page.evaluate(()=>{
    const original=AudioContext.prototype.resume;let blocked=false;
    AudioContext.prototype.resume=function(){if(!blocked){blocked=true;return Promise.reject(new DOMException('Gesture required','NotAllowedError'));}return original.call(this);};
  });
  await page.locator('#enter').click();await expect.poll(async()=>(await state(page)).blocked).toBe(true);
  await page.locator('#enter').click();await expect.poll(async()=>(await state(page)).context).toBe('running');
  expect((await state(page)).blocked).toBe(false);
  await page.evaluate(()=>(window as any).fixture.audio.destroy());expect(errors).toEqual([]);
});

test('in-game: the bar reports where the listener is, settings scale the city, voice stays independent, the lobby silences it',async({page})=>{
  test.setTimeout(120000);
  const suffix=Date.now().toString(36);
  expect((await page.request.post('/api/auth/register',{data:{email:`amb_${suffix}@example.com`,username:`amb_${suffix}`,displayName:'Ambiente',password:'AmbienteTeste2026!'}})).ok()).toBe(true);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');await page.getByRole('button',{name:'Entrar no bar'}).click();
  await expect(page.locator('#waiting')).toBeHidden({timeout:60000});
  const ambient=()=>page.evaluate(()=>(window as any).barDebug.ambient());
  await expect.poll(async()=>(await ambient()).city?.beds.some((bed:any)=>bed.loaded),{timeout:30000}).toBe(true);
  const world=(await ambient()).city.world;
  // Standing in the middle of town: the scene's probe reached the model (a hour of the game's day and a neighbourhood, not the defaults).
  expect(world.urban).toBe(1);expect(world.hour).not.toBe(12);
  await menuItem(page,'Ajustes','Som');
  await page.locator('[data-setting="music"]').fill('35');expect((await ambient()).target).toBeCloseTo(.5*.35);
  await page.locator('[data-setting="master"]').fill('50');expect((await ambient()).target).toBeCloseTo(.5*.35*.5);
  await page.locator('[data-setting="music"]').fill('0');await expect.poll(async()=>(await ambient()).context).toBe('suspended');
  expect(await page.evaluate(()=>(window as any).barDebug.voice().settings.voicesEnabled)).toBe(true);
  await page.locator('[data-setting="music"]').fill('35');await expect.poll(async()=>(await ambient()).context).toBe('running');
  await page.locator('#pause-menu [data-pm-act="sound"]').click();await expect.poll(async()=>(await ambient()).context).toBe('suspended');
  expect((await ambient()).enabled).toBe(false);await page.locator('#pause-menu [data-pm-act="sound"]').click();
  await expect.poll(async()=>(await ambient()).context).toBe('running');
  await menuItem(page,'Galera','Pessoas no bar');await page.getByRole('tab',{name:'Seu lugar no bar'}).click();await page.locator('#modal [data-action="leave"]').click();
  await expect(page.locator('#lobby')).toBeVisible();await expect.poll(async()=>(await ambient()).context).toBe('suspended');
  await expect.poll(async()=>((await ambient()).city.beds as any[]).some(bed=>bed.loaded)).toBe(false);
  expect(errors).toEqual([]);
});
