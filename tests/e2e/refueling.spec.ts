import {test,expect} from '@playwright/test';import {fileURLToPath} from 'node:url';
const fixture='/@fs/'+fileURLToPath(new URL('../fixtures/refueling.html',import.meta.url)).replaceAll('\\','/');
test('physical pump: animated walk, hand-bound nozzle, tank insertion, return and missing-animation fallback',async({page})=>{
  test.setTimeout(150000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(fixture);await page.evaluate(()=>(window as any).fixture.ready);
  const status=()=>page.evaluate(()=>(window as any).fixture.status()[0]);
  await expect.poll(status).toBeTruthy();
  await expect.poll(()=>page.evaluate(()=>!!(window as any).fixture.scene.actors.get((window as any).fixture.pump.npcId)?.skin)).toBe(true);
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.scene.actors.get((window as any).fixture.pump.npcId)?.skinId)).toBe('frentista');
  await page.evaluate(()=>(window as any).fixture.walk());
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.scene.actors.get((window as any).fixture.pump.npcId).skin.clip)).toBe('Walk');
  await page.screenshot({path:'test-results/previews/fuel-walking.png'});
  for(const phase of ['take','to-car','insert','fueling','remove','return','replace']){
    await page.evaluate(phase=>(window as any).fixture.phase(phase,phase==='take'?.85:phase==='replace'?.3:.5),phase);
    await expect.poll(async()=>(await status())?.phase).toBe(phase);
    await expect.poll(async()=>(await status())?.nozzle).toBe(true);
    await expect.poll(async()=>(await status())?.gripError).toBeLessThan(.001);
    if(phase==='fueling'){
      await expect.poll(async()=>(await status())?.tipError,{timeout:15000}).toBeLessThan(.09);
      await page.screenshot({path:'test-results/previews/fuel-in-tank.png'});
    }
  }
  await page.evaluate(()=>(window as any).fixture.phase('idle'));await expect.poll(async()=>(await status()).phase).toBe('idle');
  await page.screenshot({path:'test-results/previews/fuel-docked.png'});
  await page.evaluate(()=>{const f=(window as any).fixture;f.missingClips();f.phase('fueling');});
  await expect.poll(async()=>(await status()).tipError).toBeLessThan(.09);await expect.poll(async()=>(await status()).gripError).toBeLessThan(.001);
  await page.screenshot({path:'test-results/previews/fuel-missing-clips.png'});
  expect(errors).toEqual([]);
});
