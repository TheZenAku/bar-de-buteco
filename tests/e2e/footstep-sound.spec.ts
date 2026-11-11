import {test,expect} from '@playwright/test';
import {fileURLToPath} from 'node:url';

test('recorded footsteps follow terrain and speed and stop without actual travel',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/@fs/'+fileURLToPath(new URL('../fixtures/footstep-sound.html',import.meta.url)).replaceAll('\\','/'));
  await page.getByRole('button',{name:'Ativar áudio'}).click();
  await page.evaluate(()=>{
    const f=(window as any).fixture;f.analyser=f.sounds.context.createAnalyser();f.analyser.fftSize=2048;f.sounds.bus.connect(f.analyser);
  });
  const status=()=>page.evaluate(()=>(window as any).fixture.sounds.telemetry());
  const steps=async()=>((await status()).walkers[0]?.steps??0) as number;
  const rms=()=>page.evaluate(()=>{
    const analyser=(window as any).fixture.analyser,samples=new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(samples);return Math.sqrt(samples.reduce((sum,n)=>sum+n*n,0)/samples.length);
  });
  await expect.poll(async()=>(await status()).ready).toBe(15);
  expect(await steps()).toBe(0);
  await page.evaluate(()=>(window as any).fixture.moving=true);
  await expect.poll(steps).toBeGreaterThan(1);
  await expect.poll(rms,{intervals:[20]}).toBeGreaterThan(.001);
  expect((await status()).walkers[0].surface).toBe('tile');
  await page.evaluate(()=>(window as any).fixture.moving=false);
  await expect.poll(async()=>(await status()).voices).toBe(0);
  const stopped=await steps();await page.waitForTimeout(400);expect(await steps()).toBe(stopped);
  // A large reconciliation snap makes no sound.
  await page.evaluate(()=>(window as any).fixture.walker.x=60);
  await page.waitForTimeout(100);expect(await steps()).toBe(stopped);
  const set=async(x:number,y:number,z:number,animation='walk',speed=3.5)=>page.evaluate(values=>{
    const f=(window as any).fixture;Object.assign(f.walker,values);f.speed=values.speed;f.moving=true;
  },{x,y,z,animation,speed});
  await set(60,.15,25);
  await expect.poll(async()=>(await status()).walkers[0]?.surface).toBe('dirt');
  await set(47,.15,20,'walk',.475);
  await expect.poll(async()=>(await status()).walkers[0]?.surface).toBe('grass');
  // Equal simulated time avoids rounding a one-step cadence difference across browser timer jitter.
  const cadence=await page.evaluate(()=>{
    const f=(window as any).fixture;f.manual=true;
    const count=(animation:string,speed:number,contacts?:number)=>{
      f.sounds.setActive(false);f.sounds.setActive(true);
      Object.assign(f.walker,{x:5,y:.3,z:-4,animation,contacts});
      const update=(dt:number)=>f.sounds.update(dt,[f.walker],{x:f.walker.x,y:1.5,z:-3},{x:0,y:0,z:-1},{x:0,y:1,z:0});
      update(0);const before=f.sounds.telemetry().walkers[0].steps;
      for(let i=0;i<180;i++){f.walker.x+=speed/60;update(1/60);}
      return f.sounds.telemetry().walkers[0].steps-before;
    };
    const walking=count('walk',1.6),running=count('run',6),stuck=count('walk',1.6,0);f.walker.contacts=undefined;f.speed=6;f.manual=false;return {walking,running,stuck};
  });
  expect(cadence.running).toBeGreaterThan(cadence.walking);
  // Legs that report no touchdown at all must not silence the steps: the distance takes over.
  expect(cadence.stuck).toBeGreaterThan(0);
  await page.evaluate(()=>(window as any).fixture.volume=0);
  await expect.poll(rms).toBeLessThan(.00001);
  expect((await status()).voices).toBe(0);
  await page.evaluate(()=>(window as any).fixture.volume=1);
  await expect.poll(steps).toBeGreaterThan(0);
  await page.evaluate(()=>{
    Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(rms).toBeLessThan(.00001);
  expect((await status()).voices).toBe(0);
  await page.evaluate(()=>{
    Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(steps).toBeGreaterThan(0);
  await page.evaluate(()=>(window as any).fixture.walker.blocked=true);
  await expect.poll(async()=>(await status()).walkers.length).toBe(0);
  await page.evaluate(()=>(window as any).fixture.walker.blocked=false);
  for(const animation of ['idle','ride','horse-gallop','sit','dance','fallen']){
    await page.evaluate(animation=>(window as any).fixture.walker.animation=animation,animation);
    await expect.poll(async()=>(await status()).walkers.length).toBe(0);
    await expect.poll(async()=>(await status()).voices).toBe(0);
  }
  await page.evaluate(()=>{const f=(window as any).fixture;f.walker.animation='run';f.sounds.setActive(false);});
  await expect.poll(rms).toBeLessThan(.00001);
  await page.evaluate(()=>(window as any).fixture.sounds.destroy());
  await expect.poll(async()=>(await status()).state).toBe('closed');
  expect(errors).toEqual([]);
});
