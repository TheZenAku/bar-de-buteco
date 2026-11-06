import {test,expect} from '@playwright/test';
import {fileURLToPath} from 'node:url';
import {DEFAULT_ENVIRONMENT,lightningAt,weatherAt} from '@bar/shared/environment';

const fixture='/@fs/'+fileURLToPath(new URL('../fixtures/environment.html',import.meta.url)).replaceAll('\\','/');
test('rain and storms render outdoors, roofs shelter the camera and lightning follows the shared clock',async({page})=>{
  test.setTimeout(120000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(fixture);await page.evaluate(()=>(window as any).fixture.ready);
  await page.evaluate(()=>{const f=(window as any).fixture;f.view([12,2,8],[12,3,-4]);f.hour(12);});
  const clear=await page.evaluate(()=>(window as any).fixture.scene.getEnvironmentStatus());
  await page.evaluate(state=>(window as any).fixture.weather(state),{...DEFAULT_ENVIRONMENT,weather:'rain'});
  const status=()=>page.evaluate(()=>(window as any).fixture.scene.getEnvironmentStatus());
  await expect.poll(async()=>(await status()).weather).toMatchObject({kind:'rain',enabled:true,sheltered:false,rain:.55});
  await page.mouse.click(600,400);
  await expect.poll(async()=>(await status()).weather.sound.state).toBe('running');
  expect((await status()).sun.intensity).toBeLessThan(clear.sun.intensity);
  expect((await status()).weather.drops).toBeGreaterThan(200);
  const rainPixels=await page.evaluate(()=>(window as any).fixture.pixels());
  await page.screenshot({path:'test-results/previews/weather-rain.png'});
  await page.evaluate(state=>(window as any).fixture.weather(state),{...DEFAULT_ENVIRONMENT,weather:'storm'});
  await expect.poll(async()=>(await status()).weather.rain).toBe(1);
  const stormPixels=await page.evaluate(()=>(window as any).fixture.pixels());expect(stormPixels).not.toEqual(rainPixels);
  await page.screenshot({path:'test-results/previews/weather-storm.png'});
  const time=await page.evaluate(()=>(window as any).fixture.now());
  const strike=lightningAt(time,weatherAt(time,{...DEFAULT_ENVIRONMENT,weather:'storm'}));
  await page.evaluate(at=>{const f=(window as any).fixture;f.advance(at-f.now());},strike.strikeAt+20);
  await expect.poll(async()=>(await status()).weather.flash).toBeGreaterThan(.5);
  await page.screenshot({path:'test-results/previews/weather-lightning.png'});
  await page.evaluate(at=>{const f=(window as any).fixture;f.advance(at-f.now());},strike.thunderAt-100);
  await expect.poll(async()=>(await status()).weather.flash).toBe(0);
  await page.evaluate(()=>(window as any).fixture.advance(200));
  await expect.poll(async()=>(await status()).weather.sound.thunder).toBe(strike.strikeAt);
  await page.evaluate(()=>{const f=(window as any).fixture;f.view([14,1.7,-6],[16,1.7,-5]);f.advance(1000);});
  await expect.poll(async()=>(await status()).weather.sheltered).toBe(true);
  await page.screenshot({path:'test-results/previews/weather-sheltered.png'});
  await page.evaluate(state=>(window as any).fixture.weather(state),{...DEFAULT_ENVIRONMENT,weather:'clear'});
  await expect.poll(async()=>(await status()).weather.enabled).toBe(false);
  // The city reading controls density directly; auto no longer runs an invented weather cycle.
  const cityTime=await page.evaluate(()=>(window as any).fixture.now());
  await page.evaluate(state=>(window as any).fixture.weather(state),{...DEFAULT_ENVIRONMENT,
    realWeatherAt:cityTime,realRain:.15,realCloud:.8,realWind:.2,realPrecipitationMmH:.5});
  await expect.poll(async()=>(await status()).weather.rain).toBe(.15);
  const drizzleDrops=(await status()).weather.drops;
  await page.evaluate(state=>(window as any).fixture.weather(state),{...DEFAULT_ENVIRONMENT,
    realWeatherAt:cityTime,realRain:.8,realCloud:1,realWind:.6,realPrecipitationMmH:10});
  await expect.poll(async()=>(await status()).weather.rain).toBe(.8);
  expect((await status()).weather.drops).toBeGreaterThan(drizzleDrops*4);
  await page.evaluate(state=>(window as any).fixture.weather(state),{...DEFAULT_ENVIRONMENT,realWeatherAt:cityTime,realCloud:.8});
  await expect.poll(async()=>(await status()).weather.enabled).toBe(false);
  expect(errors).toEqual([]);
});
