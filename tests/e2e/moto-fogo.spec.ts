import {test,expect} from '@playwright/test';
import {fileURLToPath} from 'node:url';
const fixture='/@fs/'+fileURLToPath(new URL('../fixtures/moto-fogo.html',import.meta.url)).replaceAll('\\','/');

test('Caveira em Chamas: round wheels on their axles, lamps on the model itself, plate, fire and no delivery bag',async({page})=>{
  test.setTimeout(150000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(fixture);await page.evaluate(()=>(window as any).fixture.ready);
  const bike=()=>page.evaluate(()=>(window as any).fixture.status().find((v:any)=>v.id==='fogo'));
  const fire=()=>page.evaluate(()=>(window as any).fixture.fire());
  const wheels=()=>page.evaluate(()=>(window as any).fixture.wheels());
  await expect.poll(async()=>!!await bike()).toBe(true);
  const parked=await bike();expect(parked.model).toBe('moto-fogo');expect(parked.rig.bag).toBeNull();
  // the axles sit at the wheels' radius and stay there rolling (the wheels were made round on their real centre)
  expect(parked.rig.frontWheelY).toBeCloseTo(.297,3);expect(parked.rig.rearWheelY).toBeCloseTo(.297,3);
  // no generated lens anywhere: the lamps are the model's meshes, the plate and panel lamps are not drawn
  const lamps=await page.evaluate(()=>{const b=[...(window as any).fixture.scene.motos.all()].find((v:any)=>v.state.id==='fogo');
    const names:string[]=[];b.entity.forEach((e:any)=>names.push(e.name));return names;});
  expect(lamps.filter(n=>n.startsWith('Lente '))).toEqual([]);
  for(const mesh of ['Luz_Farol','Luz_Seta_E','Luz_Seta_D','Luz_Lanterna','Moto_Rodas'])expect(lamps).toContain(mesh);
  // the headlight is one lamp per eye (orange, the colour of the flames): two beams and two halos, none at the skull's centre
  expect(lamps.filter(n=>n.startsWith('Halo eye')).sort()).toEqual(['Halo eyeD','Halo eyeE']);expect(lamps).not.toContain('Halo head');
  const eyes=await page.evaluate(()=>{const b=[...(window as any).fixture.scene.motos.all()].find((v:any)=>v.state.id==='fogo');const found:any[]=[];
    b.entity.forEach((e:any)=>{if(e.light&&/^Olho/.test(e.name))found.push({name:e.name,parent:e.parent.name,type:e.light.type,colour:e.light.color.toString()});});return found;});
  expect(eyes.map((e:any)=>e.parent).sort()).toEqual(['ponto_olho_D','ponto_olho_E']);expect(eyes.every((e:any)=>e.type==='spot'&&e.colour.startsWith('#ff'))).toBe(true);
  await page.evaluate(()=>(window as any).fixture.hour(0));
  await expect.poll(async()=>(await bike()).rig.luzes.Luz_Farol).toBeGreaterThan(0);
  const tail=(await bike()).rig.luzes.Luz_Lanterna;expect(tail).toBeGreaterThan(0);
  await page.evaluate(()=>(window as any).fixture.brake(true));
  await expect.poll(async()=>(await bike()).rig.luzes.Luz_Lanterna).toBeGreaterThan(tail*2);
  await page.evaluate(()=>(window as any).fixture.brake(false));
  // the plate hangs under the tail, upright, 2,5 cm above its tip
  const w=await wheels();expect(w.plate[1]).toBeGreaterThan(.35);expect(w.plate[1]).toBeLessThan(.45);
  await page.screenshot({path:'test-results/previews/moto-fogo-night.png'});
  const idle=await fire();expect(idle.wheels.map((r:any)=>r.parent)).toEqual(['fogo_diant','fogo_tras']);expect(idle.wheels.every((r:any)=>r.visible)).toBe(true);
  await page.evaluate(()=>(window as any).fixture.drive(true,0));
  await expect.poll(async()=>(await bike()).speed).toBeGreaterThan(8);
  await expect.poll(async()=>(await fire()).level).toBeGreaterThan(.9);
  for(let i=0;i<6;i++){const now=await wheels();expect(now.front[1]).toBeCloseTo(.297,3);expect(now.rear[1]).toBeCloseTo(.297,3);await page.waitForTimeout(70);}
  await page.screenshot({path:'test-results/previews/moto-fogo-riding.png'});
  // tail pipes: smoke on the throttle, now and then a backfire
  await page.evaluate(()=>{(window as any).fixture.set({gas:true});});
  await expect.poll(async()=>(await page.evaluate(()=>(window as any).fixture.exhaustTelemetry())).density).toBeGreaterThan(.9);
  await page.evaluate(()=>(window as any).fixture.exhaust().backfire());
  const spit=await page.evaluate(()=>(window as any).fixture.exhaustTelemetry());expect(spit.pipes.map((p:any)=>p.parent)).toEqual(['ponto_escape_1','ponto_escape_2']);expect(spit.pipes.every((p:any)=>p.flame)).toBe(true);
  await page.evaluate(()=>(window as any).fixture.drive(true,1));
  await expect.poll(async()=>(await bike()).rig.guidao).toBeGreaterThan(10);
  await page.evaluate(()=>{(window as any).fixture.stop();(window as any).fixture.set({engine:0});});
  await expect.poll(async()=>(await fire()).wheels.some((r:any)=>r.visible)).toBe(false);
  // the owner's colour goes to the reds only; the default leaves the texture as it came
  await page.evaluate(()=>(window as any).fixture.set({color:'#1f6fe0'}));
  await expect.poll(async()=>(await page.evaluate(()=>(window as any).fixture.paintTelemetry())).colour).toBe('#1f6fe0');
  await page.evaluate(()=>(window as any).fixture.set({color:'#6b1d1d'}));
  await expect.poll(async()=>(await page.evaluate(()=>(window as any).fixture.paintTelemetry())).colour).toBe('');
  expect(errors).toEqual([]);
});

test('HighMotors: the Caveira em Chamas is sold in the colour the buyer picks, with the photo repainted',async({page})=>{
  test.setTimeout(120000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const models=[{model:'moto-delivery',name:'Highland Bar Delivery',price:10000,seats:1,photo:'moto/foto-v4.webp'},{model:'moto-fogo',name:'Caveira em Chamas',price:25000,seats:1,photo:'moto/foto-fogo.webp'}];
  const data={model:'moto-delivery',name:'Highland Bar Delivery',price:10000,tow:30,owned:false,limit:10,models,vehicles:[]};
  const posts:any[]=[];
  await page.route('**/api/vehicles',route=>route.fulfill({json:data}));
  await page.route('**/api/vehicles/buy',route=>{posts.push(route.request().postDataJSON());route.fulfill({json:{...data,balance:0,vehicles:[]}});});
  await page.goto('/@fs/'+fileURLToPath(new URL('../fixtures/highmotors.html',import.meta.url)).replaceAll('\\','/'));
  await page.getByRole('tab',{name:'Loja'}).click();
  await page.locator('[data-hm="offer"][data-model="moto-fogo"]').click();
  const photo=page.locator('.hm-detail-photo img');
  await expect(photo).toHaveAttribute('src',/foto-fogo\.webp$/);await expect(page.locator('[name="hm-color"]')).toHaveValue('#6b1d1d');
  await page.evaluate(()=>{const input=document.querySelector<HTMLInputElement>('[name="hm-color"]')!;input.value='#1f6fe0';input.dispatchEvent(new Event('input',{bubbles:true}));});
  await expect(photo).toHaveAttribute('src',/^data:image\/jpeg/);
  await page.locator('[data-hm="paint-reset"]').click();await expect(photo).toHaveAttribute('src',/foto-fogo\.webp$/);
  await page.evaluate(()=>{const input=document.querySelector<HTMLInputElement>('[name="hm-color"]')!;input.value='#e8c21a';input.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.locator('[data-hm="buy"]').click();await page.locator('[data-hm="confirm"]').click();
  await expect.poll(()=>posts.length).toBe(1);expect(posts[0]).toMatchObject({model:'moto-fogo',color:'#e8c21a'});
  expect(errors).toEqual([]);
});
