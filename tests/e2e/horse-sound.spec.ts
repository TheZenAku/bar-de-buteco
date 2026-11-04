import {test,expect} from '@playwright/test';
import {fileURLToPath} from 'node:url';

test('recorded gallop produces audio, follows speed and position, and stops on idle, dismount, distance, mute and disposal',async({page})=>{
  const errors:string[]=[],requests:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',request=>{if(request.url().endsWith('/mounts/sound/gallop.wav'))requests.push(request.url());});
  await page.goto('/@fs/'+fileURLToPath(new URL('../fixtures/horse-sound.html',import.meta.url)).replaceAll('\\','/'));
  await page.getByRole('button',{name:'Ativar áudio'}).click();
  const status=()=>page.evaluate(()=>(window as any).fixture.sounds.telemetry('rider'));
  const setHorse=(animation:string,speed=9,x=0)=>page.evaluate(({animation,speed,x})=>{
    (window as any).fixture.horses=[{id:'rider',animation,speed,x,y:.2,z:-2}];
  },{animation,speed,x});
  await setHorse('horse-idle',0);
  expect((await status()).state).toBe('');expect(requests).toHaveLength(0);
  await setHorse('horse-gallop',6);
  await expect.poll(async()=>(await status()).playing).toBe(true);
  await expect.poll(async()=>(await status()).state).toBe('running');
  await expect.poll(async()=>(await status()).rate).toBeCloseTo(.64,2);
  // Inspect actual PCM output rather than just the controller's state.
  await page.evaluate(()=>{
    const f=(window as any).fixture;
    f.analyser=f.sounds.context.createAnalyser();f.analyser.fftSize=2048;f.sounds.bus.connect(f.analyser);
  });
  const rms=()=>page.evaluate(()=>{
    const analyser=(window as any).fixture.analyser,samples=new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(samples);return Math.sqrt(samples.reduce((sum,value)=>sum+value*value,0)/samples.length);
  });
  await expect.poll(rms).toBeGreaterThan(.005);
  await setHorse('horse-gallop',9,5);
  await expect.poll(async()=>(await status()).rate).toBeCloseTo(.96,2);
  const position=(await status()).position!;
  [5,.2,-2].forEach((value,i)=>expect(position[i]).toBeCloseTo(value,5));
  await page.evaluate(()=>(window as any).fixture.volume=0);
  await expect.poll(rms).toBeLessThan(.00001);
  await page.evaluate(()=>(window as any).fixture.volume=1);
  await expect.poll(rms).toBeGreaterThan(.005);
  for(const animation of ['horse-idle','horse-walk']){
    await setHorse(animation);
    await expect.poll(async()=>(await status()).voices).toBe(0);
    await expect.poll(rms).toBeLessThan(.00001);
    await setHorse('horse-gallop');await expect.poll(async()=>(await status()).playing).toBe(true);
  }
  await setHorse('horse-gallop',0);
  await expect.poll(async()=>(await status()).voices).toBe(0);
  await setHorse('horse-gallop',9,46);
  await expect.poll(async()=>(await status()).voices).toBe(0);
  await expect.poll(rms).toBeLessThan(.00001);
  await setHorse('horse-gallop');await expect.poll(async()=>(await status()).playing).toBe(true);
  await page.evaluate(()=>(window as any).fixture.horses=[]);
  await expect.poll(async()=>(await status()).voices).toBe(0);
  await expect.poll(rms).toBeLessThan(.00001);
  await page.evaluate(()=>{
    (window as any).fixture.horses=Array.from({length:6},(_,i)=>({id:i?'other-'+i:'rider',animation:'horse-gallop',speed:9,x:i,y:.2,z:-2}));
  });
  await expect.poll(async()=>(await status()).voices).toBe(4);
  await page.evaluate(()=>(window as any).fixture.sounds.destroy());
  await expect.poll(async()=>(await status()).state).toBe('closed');
  expect((await status()).voices).toBe(0);expect(requests).toHaveLength(1);expect(errors).toEqual([]);
});
