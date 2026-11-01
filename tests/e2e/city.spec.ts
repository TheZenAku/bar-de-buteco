import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {test,expect,type Page} from '@playwright/test';
import {enterAsAdmin,spawnBikeOnStreet} from './moto-helpers';

const SHOTS=process.env.CITY_SHOTS||'test-results/city';
const PASSWORD=process.env.DEMO_PASSWORD||'ButecoDemo2026!';
const fixture='/@fs/'+fileURLToPath(new URL('../fixtures/environment.html',import.meta.url)).replaceAll('\\','/');
const errorsOf=(page:Page)=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(['error','warning'].includes(message.type())&&!/Failed to load resource|favicon|GL Driver Message|GPU stall|WebGL|Folha de porta/.test(message.text()))errors.push(message.text());});
  return errors;
};
const shot=async(page:Page,name:string)=>{fs.mkdirSync(SHOTS,{recursive:true});await page.screenshot({path:`${SHOTS}/${name}.png`,timeout:120_000});};
const city=(page:Page)=>page.evaluate(()=>(window as any).fixture.scene.getMapStatus().city);
const goTo=(page:Page,x:number,z:number,y=2.5)=>page.evaluate(([x,z,y])=>{const f=(window as any).fixture;f.view([x,y,z],[x+20,y-1,z-20]);f.focus(x,z);},[x!,z!,y!]);
const settled=async(page:Page)=>{
  await expect.poll(async()=>{const c=await city(page);return !!c?.manifest&&c.pending===0&&c.backdrops===2;},{timeout:120_000,intervals:[500]}).toBe(true);
  return city(page);
};

test('the city streams around any point: nine sectors in full, LODs beyond, nothing grows, the bar untouched',async({page})=>{
  test.setTimeout(420_000);
  const errors=errorsOf(page);
  await page.goto(fixture);await page.evaluate(()=>(window as any).fixture.ready);
  await goTo(page,12,8);
  await expect.poll(async()=>(await city(page))?.fullShown??0,{timeout:120_000}).toBeGreaterThanOrEqual(9);
  await settled(page);
  // The old backdrop is gone, the bar's nodes are all there.
  const bar=await page.evaluate(()=>{
    const {scene}=(window as any).fixture,map=scene.mapEntity,status=scene.getMapStatus();
    return {old:!!map.findByName('Fundo_Distante'),doors:status.doors,cart:status.cartRenders,colliders:status.colliders};
  });
  expect(bar).toEqual({old:false,doors:16,cart:expect.any(Number),colliders:1553});
  expect(bar.cart).toBeGreaterThan(0);
  await shot(page,'1-bar');
  const nodes=await page.evaluate(()=>{
    const {scene}=(window as any).fixture,textures=scene.city.textures;
    return {shared:textures.size,names:[...textures.keys()].sort()};
  });
  expect(nodes.shared).toBe(18);
  for(const [name,x,z,y] of [['2-centro',16,-150,4],['3-olaria',-30,240,2],['4-conceicao',-250,-110,3],['5-industrial',230,-60,3],['6-norte',0,-390,2],['7-limite-oeste',-395,0,2]] as const){
    await goTo(page,x,z,y);
    await page.waitForTimeout(1500);
    const c=await settled(page);
    expect(c.fullShown,`${name}: at most 3 × 3 and what the reach of Alto adds`).toBeLessThanOrEqual(16);
    expect(c.fullShown+c.lodShown,`${name}: never both for a sector`).toBeLessThanOrEqual(64);
    expect(c.failures).toBe(0);
    await page.waitForTimeout(800);
    await shot(page,name);
  }
  // Three laps over the same sectors leave the same things loaded, on the page and on the GPU.
  const route=[[150,-50],[350,-50],[350,-250],[-50,-250],[-250,-250],[-350,150],[-50,350],[350,350],[12,8]] as const;
  const counters=()=>page.evaluate(()=>{
    const {scene}=(window as any).fixture,device=scene.app.graphicsDevice,c=scene.getMapStatus().city;
    return {assets:c.assets,fullLoaded:c.fullLoaded,lodLoaded:c.lodLoaded,textures:device.textures.length,buffers:device.buffers.length,vb:device._vram.vb,ib:device._vram.ib,tex:device._vram.tex};
  });
  const laps=[];
  for(let lap=0;lap<3;lap++){
    for(const [x,z] of route){await goTo(page,x,z);await page.waitForTimeout(1200);}
    // Past RETAIN_MS: only what is around remains.
    await page.waitForTimeout(10_000);
    await settled(page);
    laps.push(await counters());
  }
  expect(laps[1]).toEqual(laps[0]);expect(laps[2]).toEqual(laps[0]);
  expect(laps[0]!.fullLoaded).toBeLessThanOrEqual(16);
  expect(errors).toEqual([]);
  await page.evaluate(()=>(window as any).fixture.scene.destroy());
});

test('the city follows the night: its lamps and few real lights come on, without shadows; the panorama darkens',async({page})=>{
  test.setTimeout(240_000);
  const errors=errorsOf(page);
  await page.goto(fixture);await page.evaluate(()=>(window as any).fixture.ready);
  const status=()=>page.evaluate(()=>(window as any).fixture.scene.getEnvironmentStatus());
  // Luz_Centro_2 and Luz_Terminal are in sectors around the Terminal.
  await goTo(page,62,-170);
  await settled(page);
  await expect.poll(async()=>(await status()).cityLights.length,{timeout:60_000}).toBeGreaterThan(0);
  const day=await status();
  expect(day.cityLights.every((light:{enabled:boolean})=>!light.enabled)).toBe(true);
  const dayGlow=await page.evaluate(()=>(window as any).fixture.scene.environment.cityLampMaterial?.emissiveIntensity);
  await shot(page,'8-dia');
  await page.evaluate(()=>(window as any).fixture.hour(0));
  await expect.poll(async()=>(await status()).cityLights.every((light:{enabled:boolean})=>light.enabled),{timeout:60_000}).toBe(true);
  const night=await status();
  expect(night.cityLights.every((light:{shadows:boolean;intensity:number})=>!light.shadows&&light.intensity>.1)).toBe(true);
  expect(night.cityLights.length).toBeLessThanOrEqual(9);
  const nightGlow=await page.evaluate(()=>(window as any).fixture.scene.environment.cityLampMaterial?.emissiveIntensity);
  expect(nightGlow).toBeGreaterThan(dayGlow);
  await shot(page,'9-noite');
  // The bar's blackout takes the street with it, as it always did; then it all comes back.
  await page.evaluate(()=>(window as any).fixture.event('BLACKOUT'));
  await expect.poll(async()=>(await status()).electrical,{timeout:30_000}).toBeLessThan(.04);
  await expect.poll(async()=>(await status()).cityLights.every((light:{enabled:boolean})=>!light.enabled),{timeout:10_000}).toBe(true);
  await page.evaluate(()=>(window as any).fixture.event(''));
  await expect.poll(async()=>(await status()).electrical,{timeout:30_000}).toBeGreaterThan(.98);
  expect(errors).toEqual([]);
  await page.evaluate(()=>(window as any).fixture.scene.destroy());
});

test('a sector that fails to load stays covered by its LOD and the game goes on',async({page})=>{
  test.setTimeout(180_000);
  const warnings:string[]=[];
  page.on('console',message=>{if(message.type()==='warning'&&message.text().startsWith('Cidade:'))warnings.push(message.text());});
  const pageErrors:string[]=[];page.on('pageerror',error=>pageErrors.push(error.message));
  await page.route('**/maps/cidade/setores/cidade_S05_04.gltf',route=>route.abort());
  await page.goto(fixture);await page.evaluate(()=>(window as any).fixture.ready);
  await goTo(page,120,-50);
  await expect.poll(()=>warnings.some(text=>text.includes('S05_04')&&text.includes('full')),{timeout:60_000}).toBe(true);
  const c=await city(page);
  expect(c.failures).toBeGreaterThanOrEqual(1);
  expect(c.fullShown).toBeGreaterThanOrEqual(8);
  expect(pageErrors).toEqual([]);
  await page.evaluate(()=>(window as any).fixture.scene.destroy());
});

test('the game itself: the bike leaves the old neighbourhood by the street, the sectors change, walls hold it',async({browser})=>{
  test.setTimeout(300_000);
  const context=await browser.newContext({viewport:{width:1280,height:720}}),page=await context.newPage(),errors=errorsOf(page);
  await expect.poll(async()=>(await page.request.get('/api/ready').catch(()=>undefined))?.ok()??false,{timeout:90_000,intervals:[500]}).toBe(true);
  await enterAsAdmin(page);
  await spawnBikeOnStreet(page);
  const status=()=>page.evaluate(()=>{const d=(window as any).barDebug.snapshot(),me=d.world.players[d.localId],bike=Object.values(d.world.motos??{})[0] as any;return {me,bike,localId:d.localId};});
  await shot(page,'10-nascimento');
  // Up to the bike, on foot.
  const press=async(keys:string[],ms:number)=>{for(const key of keys)await page.keyboard.down(key);await page.waitForTimeout(ms);for(const key of keys)await page.keyboard.up(key);};
  const near=async()=>{const {me,bike}=await status();return Math.hypot(me.x-bike.x,me.z-bike.z);};
  const deadline=Date.now()+60_000;
  let {bike}=await status(),last={x:Infinity,z:Infinity},side=1;
  while(Date.now()<deadline&&await near()>1.3){
    const {me}=await status(),yaw=await page.evaluate(()=>(window as any).barDebug.camera().yaw),dx=bike.x-me.x,dz=bike.z-me.z,length=Math.hypot(dx,dz);
    if(Math.hypot(me.x-last.x,me.z-last.z)<.02){await press([side>0?'w':'s',side>0?'a':'d'],300);side=-side;last={x:Infinity,z:Infinity};continue;}
    last=me;
    const across=(Math.cos(yaw)*dx-Math.sin(yaw)*dz)/length,ahead=(-Math.sin(yaw)*dx-Math.cos(yaw)*dz)/length,keys:string[]=[];
    if(across>.38)keys.push('d');if(across<-.38)keys.push('a');if(ahead>.38)keys.push('w');if(ahead<-.38)keys.push('s');
    await press(keys,250);
    await page.waitForTimeout(100);
  }
  expect(await near()).toBeLessThan(1.6);
  await page.keyboard.press('e');
  await expect.poll(async()=>(await status()).bike.riderId===(await status()).localId,{timeout:15_000}).toBe(true);
  // West along the middle of the street (the parked sedan at x -26 stops whoever keeps to the kerb), towards the old limit at
  // x = -103 and the old map's edge at -141. A steers towards +z here, D towards -z.
  const start=(await status()).bike,sectors=new Set<string>();
  await page.keyboard.down('w');
  let held='';
  const steer=async(key:string)=>{if(held===key)return;if(held)await page.keyboard.up(held);if(key)await page.keyboard.down(key);held=key;};
  let stopped=0;
  for(let i=0;i<400;i++){
    // Gently: full lock at walking pace would turn it into the kerb on the other side. On a slow page the keys lag behind, so
    // whatever it runs into, it backs off with the wheel turned and tries again.
    const {bike:now}=await status(),wanted=-Math.PI/2+Math.max(-.2,Math.min(.2,(8-now.z)*.08)),error=Math.atan2(Math.sin(wanted-now.yaw),Math.cos(wanted-now.yaw));
    stopped=Math.abs(now.speed)<.5?stopped+1:0;
    if(stopped>12&&i>20){
      await steer('');await page.keyboard.up('w');
      await page.keyboard.down('s');await page.waitForTimeout(900);await page.keyboard.up('s');
      await page.keyboard.down('w');stopped=0;
      continue;
    }
    await steer(now.speed<7?'':error>.03?'a':error<-.03?'d':'');
    const c=await page.evaluate(()=>(window as any).barDebug.city());
    if(c?.sector)sectors.add(c.sector);
    if(now.x<-125)break;
    await page.waitForTimeout(60);
  }
  await steer('');
  await page.keyboard.up('w');
  await page.waitForTimeout(1500);
  const end=(await status()).bike;
  await shot(page,'11-moto-fora-do-bairro');
  expect(end.x,`rode west from ${start.x} to ${end.x}`).toBeLessThan(-103);
  expect(Math.abs(end.y)).toBeLessThan(.3);
  // The way out crossed the sector lines, and what stands around the bike is its 3 × 3.
  expect(sectors.size,[...sectors].join()).toBeGreaterThan(1);
  await expect.poll(async()=>{const c=await page.evaluate(()=>(window as any).barDebug.city());return c.sector.startsWith('S02')&&c.fullShown>=9&&c.pending===0;},{timeout:60_000}).toBe(true);
  await shot(page,'12-moto-na-cidade');
  expect(errors).toEqual([]);
  await page.request.post('/api/auth/logout').catch(()=>undefined);
  await context.close();
});
