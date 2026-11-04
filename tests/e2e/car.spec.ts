import {test,expect} from '@playwright/test';
import {fileURLToPath} from 'node:url';
import {enterAsAdmin,orbit} from './moto-helpers';
const fixture='/@fs/'+fileURLToPath(new URL('../fixtures/car.html',import.meta.url)).replaceAll('\\','/');
test('hatch rig: four occupants, individual paint and plates, lights at night, steering, reverse, doors and interior',async({page})=>{
  test.setTimeout(150000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(fixture);await page.evaluate(()=>(window as any).fixture.ready);
  const car=()=>page.evaluate(()=>(window as any).fixture.status().find((v:any)=>v.id==='hatch'));
  await expect.poll(async()=>!!await car()).toBe(true);await expect.poll(async()=>(await car()).rig.plate).toBe('BAR1C80');
  await page.evaluate(()=>(window as any).fixture.hour(0));await expect.poll(async()=>(await car()).lights.headlight).toBe(true);
  await page.screenshot({path:'test-results/previews/car-night.png'});
  await page.evaluate(()=>(window as any).fixture.set({engine:0,headlights:2,lights:15,speed:-1,wipers:true}));
  await expect.poll(async()=>(await car()).lights.headlight).toBe(false);
  await expect.poll(async()=>(await car()).lights.tail).toBe(false);
  await expect.poll(async()=>(await car()).lights.lens.re).toBe(false);
  expect((await car()).lights.levels).toEqual({head:0,tail:0});
  const bikeLamps=await page.evaluate(()=>(window as any).fixture.checkBikeLamps());
  expect(bikeLamps.braking.headlight).toBe(false);expect(bikeLamps.braking.tail).toBe(true);expect(bikeLamps.braking.lens.tail).toBe(true);
  expect(bikeLamps.off.headlight).toBe(false);expect(bikeLamps.off.tail).toBe(false);expect(Object.values(bikeLamps.off.lens).some(Boolean)).toBe(false);
  await page.evaluate(()=>(window as any).fixture.set({engine:2,headlights:1,lights:0,speed:0}));
  await page.evaluate(()=>(window as any).fixture.set({color:'#17a856',doors:3,hood:true,trunk:true,wipers:true}));
  await expect.poll(async()=>(await car()).rig.doors[0]).toBeGreaterThan(.9);
  await expect.poll(async()=>(await car()).rig.paint).toBe('#17a856');
  expect(await page.evaluate(()=>(window as any).fixture.status().find((v:any)=>v.id==='other').rig.paint)).toBe('#245db7');
  await page.screenshot({path:'test-results/previews/car-doors.png'});
  const headHeights=await page.evaluate(()=>[...(window as any).fixture.scene.actors.values()].filter((a:any)=>a.riding).map((a:any)=>a.skin.bones.head.getPosition().y));
  expect(headHeights).toHaveLength(4);expect(Math.max(...headHeights)).toBeLessThan(1.35);
  await page.evaluate(()=>{const f=(window as any).fixture;f.hour(12);f.set({doors:0,hood:false,trunk:false});f.drive(true,1);});
  await expect.poll(async()=>(await car()).rig.guidao).toBeGreaterThan(2);await expect.poll(async()=>(await car()).speed).toBeGreaterThan(1);
  await page.screenshot({path:'test-results/previews/car-turn-right.png'});
  await page.evaluate(()=>{const f=(window as any).fixture;f.stop();f.set({x:18,z:7,yaw:Math.PI/2});f.drive(true,0,true);});
  await expect.poll(async()=>(await car()).speed).toBeLessThan(-.2);await expect.poll(async()=>(await car()).lights.lens.re).toBe(true);
  await page.screenshot({path:'test-results/previews/car-reverse.png'});
  await page.evaluate(()=>{const f=(window as any).fixture;f.stop();f.view('inside');});
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.scene.actors.get('driver').skin.bones.head.children.every((node:any)=>node.getLocalScale().x<.01))).toBe(true);
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.scene.actors.get('driver').skin.bones.head.parent.getLocalScale().x)).toBeLessThan(.01);
  await page.screenshot({path:'test-results/previews/car-interior.png'});
  const seated=await page.evaluate(()=>[...(window as any).fixture.scene.actors.values()].filter((a:any)=>a.riding).map((a:any)=>a.root.getPosition().toArray()));expect(seated).toHaveLength(4);expect(new Set(seated.map((p:number[])=>p.map(v=>v.toFixed(2)).join())).size).toBe(4);
  expect(errors).toEqual([]);
});

test('car purchase from HighMotors, garage, personal colour and the full parts panel in the actual game',async({page})=>{
  test.setTimeout(180000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await enterAsAdmin(page);
  const adminCookies=await page.context().cookies();
  const change=await page.request.post('/api/admin/prices',{data:{changes:[{key:'vehicle:carro',value:1000}],reason:'Preço temporário do teste de carro'}});expect(change.ok()).toBe(true);
  try{
    const username=`car_buy_${Date.now().toString(36)}`;
    const registered=await page.request.post('/api/auth/register',{data:{username,displayName:'Comprador do hatch',email:`${username}@car.test`,password:'SenhaBoaDeTeste2026!'}});expect(registered.status()).toBe(201);
    await page.goto('/');await page.getByRole('button',{name:'Entrar no bar'}).click();await expect(page.locator('#waiting')).toBeHidden({timeout:60000});
    await expect.poll(()=>page.evaluate(()=>{const d=(window as any).barDebug.snapshot();return !!d.world?.players?.[d.localId]?.connected;})).toBe(true);
    await page.keyboard.press('k');await page.locator('[data-app="highmotors"]').first().click();
    await page.getByRole('tab',{name:'Loja',exact:true}).click();await page.locator('[data-hm="offer"][data-model="carro-hatch"]').click();
    await page.getByRole('heading',{name:'Hatch 80',exact:true}).waitFor();await page.getByLabel('Cor da pintura',{exact:true}).fill('#8a2c9e');
    await page.getByRole('button',{name:'Comprar veículo',exact:true}).click();await page.getByRole('button',{name:'Confirmar compra',exact:true}).click();await expect(page.getByText('O veículo é seu!',{exact:true})).toBeVisible();
    await page.screenshot({path:'test-results/previews/car-purchased.png'});await page.keyboard.press('Escape');
    const stock=await page.request.get('/api/vehicles'),owned=(await stock.json()).vehicles.filter((v:any)=>v.model==='carro-hatch').at(-1);expect(owned.color).toBe('#8a2c9e');
    await page.evaluate(()=>{const d=(window as any).barDebug;d.send('inventory.sync',{});d.send('test.player.place',{x:-13.25,y:.15,z:-8.3});});
    await expect.poll(()=>page.evaluate(()=>(window as any).barDebug.snapshot().world.players[(window as any).barDebug.snapshot().localId].x)).toBeCloseTo(-13.25,1);
    await page.keyboard.press('e');await page.locator(`[data-plate="${owned.plate}"] [data-action="garage-take"]`).click();
    const vehicle=()=>page.evaluate(id=>Object.values((window as any).barDebug.snapshot().world.motos).find((v:any)=>v.vehicleId===id) as any,owned.id);
    await expect.poll(async()=>!!await vehicle()).toBe(true);if(await page.getByRole('button',{name:'Fechar janela',exact:true}).isVisible())await page.getByRole('button',{name:'Fechar janela',exact:true}).click();
    const car=await vehicle();await page.evaluate(at=>(window as any).barDebug.send('test.player.place',at),{x:car.x+Math.cos(car.yaw)*1.3,y:car.y,z:car.z-Math.sin(car.yaw)*1.3});
    await page.waitForTimeout(300);await page.keyboard.press('e');await expect.poll(async()=>(await vehicle()).riderId).not.toBe('');
    await expect(page.locator('#vehicle-hud')).toBeVisible();await expect(page.locator('[data-panel="actions"]')).toBeHidden();
    await expect.poll(async()=>(await vehicle()).engine).toBe(2);
    await page.locator('#vehicle-hud [data-vcontrol="engine"]').click();await expect.poll(async()=>(await vehicle()).engine).toBe(0);
    await expect.poll(async()=>(await vehicle()).headlights).toBe(0);
    await page.locator('#vehicle-hud [data-vcontrol="ignition"]').click();await expect.poll(async()=>(await vehicle()).ignition).toBe(false);
    await expect(page.locator('#vehicle-hud [data-vcontrol="engine"]')).toBeDisabled();
    await page.locator('#vehicle-hud [data-vcontrol="ignition"]').click();await expect.poll(async()=>(await vehicle()).ignition).toBe(true);
    await page.locator('#vehicle-hud [data-vcontrol="engine"]').click();await expect.poll(async()=>(await vehicle()).engine).toBe(2);
    await page.keyboard.press('h');await expect.poll(async()=>(await vehicle()).headlights).toBe(2);
    await page.keyboard.press('n');await expect.poll(async()=>(await vehicle()).wipers).toBe(true);
    await page.screenshot({path:'test-results/previews/car-driving-hud.png'});
    await page.keyboard.press('e');await expect.poll(async()=>(await vehicle()).riderId).toBe('');
    await expect(page.locator('#vehicle-hud')).toBeHidden();await expect(page.locator('[data-panel="actions"]')).toBeVisible();
    await expect.poll(()=>page.evaluate(()=>(window as any).barDebug.motos().some((v:any)=>v.model==='carro-hatch'))).toBe(true);
    const screen=await page.evaluate(id=>(window as any).barDebug.motos().find((v:any)=>v.id===id).screen,car.id);await page.mouse.click(screen[0],screen[1],{button:'right'});
    await page.getByRole('menuitem',{name:'Informações do veículo',exact:true}).click();
    await expect(page.getByRole('group',{name:'Partes do carro'})).toBeVisible();await expect(page.locator('[data-car-panel] [data-action="moto-part"]')).toHaveCount(18);
    await page.getByLabel('Cor da pintura',{exact:true}).fill('#d87520');await page.getByRole('button',{name:'Aplicar cor',exact:true}).click();await expect.poll(async()=>(await vehicle()).color).toBe('#d87520');
    await page.screenshot({path:'test-results/previews/car-status-panel.png'});expect(errors).toEqual([]);
  }finally{await page.context().addCookies(adminCookies);await page.request.post('/api/admin/prices',{data:{changes:[{key:'vehicle:carro',value:null}],reason:'Restaurar preço depois do teste'}});}
});

test('curbside exit after accumulated car turns keeps camera, walking and stop inputs valid in the renderer',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(fixture);await page.evaluate(()=>(window as any).fixture.ready);
  await page.evaluate(()=>{const f=(window as any).fixture;f.set({x:13.6,y:0,z:3.85,yaw:12*Math.PI+.4});f.view('inside');});
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.scene.actors.get('driver').riding)).toBe(true);
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.inputValid())).toBe(true);
  await page.evaluate(()=>(window as any).fixture.exit());
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.scene.actors.get('driver').riding)).toBe(false);
  for(let i=0;i<16;i++){
    expect(await page.evaluate(()=>{const f=(window as any).fixture;f.scene.rig.yaw+=.3;return f.inputValid();})).toBe(true);
  }
  await page.keyboard.down('w');
  const walking=await page.evaluate(()=>{const f=(window as any).fixture;return {input:f.scene.getInput(),valid:f.inputValid()};});
  expect(walking.valid).toBe(true);expect(Math.hypot(walking.input.dx,walking.input.dz)).toBeGreaterThan(.9);
  await page.keyboard.up('w');
  expect(await page.evaluate(()=>(window as any).fixture.inputValid())).toBe(true);
  expect(errors).toEqual([]);
});

test('vehicle dashboard adapts to car, passenger, motorcycle and horse, restores actions and fits a phone',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const url='/@fs/'+fileURLToPath(new URL('../fixtures/vehicle-hud.html',import.meta.url)).replaceAll('\\','/');
  await page.setViewportSize({width:1440,height:900});await page.goto(url);
  const panel=page.locator('#vehicle-hud');await expect(panel).toBeVisible();await expect(page.locator('[data-panel="actions"]')).toBeHidden();
  await expect(panel.locator('[data-vh-speed]')).toHaveText('60');await expect(panel.locator('meter')).toHaveAttribute('value','42');
  await page.evaluate(()=>(window as any).fixture.set({speed:-3,lateralSpeed:4}));
  await expect(panel.locator('[data-vh-speed]')).toHaveText('18');await expect(panel.locator('[data-vh-gear]')).toHaveText('R');
  await page.evaluate(()=>(window as any).fixture.set({speed:16.7,lateralSpeed:0}));
  await panel.locator('[data-vcontrol="headlights"]').click();expect(await page.evaluate(()=>(window as any).fixture.actions)).toEqual(['headlights']);
  await page.screenshot({path:'test-results/previews/vehicle-hud-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  const box=await panel.boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(390);
  expect(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.screenshot({path:'test-results/previews/vehicle-hud-mobile.png'});
  await page.evaluate(()=>(window as any).fixture.passenger());await expect(panel.locator('[data-vcontrol="engine"]')).toBeDisabled();await expect(panel.getByText('Passageiro da frente',{exact:false})).toBeVisible();
  await page.evaluate(()=>(window as any).fixture.moto());await expect(panel.locator('[data-vcontrol="wipers"]')).toHaveCount(0);await expect(panel.locator('[data-vcontrol="doors"]')).toHaveCount(0);await expect(panel.locator('[data-vcontrol="battery"]')).toBeVisible();
  await page.evaluate(()=>(window as any).fixture.horse());await expect(panel).toHaveAttribute('data-kind','horse');await expect(panel.locator('[data-vcontrol="engine"]')).toHaveCount(0);await expect(panel.getByText('Seu fôlego')).toBeVisible();
  await page.evaluate(()=>(window as any).fixture.unmount());await expect(panel).toBeHidden();await expect(page.locator('[data-panel="actions"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('arcade car steering and handbrake are predicted by the driver and replicated to an observer',async({page,browser})=>{
  test.setTimeout(150000);
  const context=await browser.newContext({viewport:{width:960,height:640}}),observer=await context.newPage();
  let carId='';
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));observer.on('pageerror',error=>errors.push(error.message));
  try{
    await enterAsAdmin(page);
    expect((await observer.request.post('/api/auth/login',{data:{email:'jogador2@bar.local',password:process.env.DEMO_PASSWORD||'ButecoDemo2026!'}})).ok()).toBe(true);
    await observer.goto('/');await observer.getByRole('button',{name:'Entrar no bar'}).click();
    await expect(observer.locator('#waiting')).toBeHidden({timeout:60000});
    await expect.poll(()=>observer.evaluate(()=>!!(window as any).barDebug?.snapshot().localId)).toBe(true);
    await page.evaluate(()=>{
      const d=(window as any).barDebug;d.send('admin.moto.despawn',{});d.send('test.player.place',{x:50,y:0,z:7,rotation:Math.PI/2});
    });
    await expect.poll(()=>page.evaluate(()=>Object.keys((window as any).barDebug.snapshot().world.motos).length)).toBe(0);
    await expect.poll(()=>page.evaluate(()=>{const d=(window as any).barDebug,s=d.snapshot();return s.world.players[s.localId].x;})).toBeCloseTo(50,1);
    await expect.poll(()=>page.evaluate(()=>{const d=(window as any).barDebug,s=d.snapshot();return s.world.players[s.localId].rotation;})).toBeCloseTo(Math.PI/2,2);
    await page.evaluate(()=>(window as any).barDebug.send('admin.moto.spawn',{model:'carro-hatch'}));
    const car=(p=page)=>p.evaluate(id=>Object.values((window as any).barDebug.snapshot().world.motos).find((v:any)=>id?v.id===id:v.model==='carro-hatch') as any,carId);
    await expect.poll(async()=>!!await car()).toBe(true);const parked=await car();carId=parked.id;
    await observer.evaluate(at=>(window as any).barDebug.send('test.player.place',at),{x:parked.x+8,y:0,z:parked.z-3});
    await expect.poll(()=>observer.evaluate(()=>{const d=(window as any).barDebug,s=d.snapshot();return s.world.players[s.localId].x;})).toBeCloseTo(parked.x+8,1);
    await page.evaluate(at=>(window as any).barDebug.send('test.player.place',at),{x:parked.x+Math.cos(parked.yaw)*1.3,y:parked.y,z:parked.z-Math.sin(parked.yaw)*1.3});
    await page.waitForTimeout(300);await page.keyboard.press('e');
    await expect.poll(async()=>(await car())?.riderId??'').not.toBe('');
    await page.keyboard.down('w');await expect.poll(async()=>(await car())?.speed??0,{timeout:12000}).toBeGreaterThan(8);
    await page.keyboard.down('d');await expect.poll(async()=>(await car()).steer).toBeGreaterThan(.8);await page.keyboard.up('w');
    await page.evaluate(()=>{const w=window as any;w.handlingSamples=[];w.handlingTimer=setInterval(()=>{const m=Object.values(w.barDebug.snapshot().world.motos).find((v:any)=>v.model==='carro-hatch') as any;if(m)w.handlingSamples.push({lateral:m.lateralSpeed,yawRate:m.yawRate});},30);});
    await page.keyboard.down('Space');
    await expect.poll(()=>page.evaluate(()=>(window as any).handlingSamples.some((v:any)=>Math.abs(v.lateral)>.3&&Math.abs(v.yawRate)>.2)),{timeout:6000}).toBe(true);
    await page.screenshot({path:'test-results/previews/car-arcade-handbrake-driver.png'});
    await page.keyboard.up('d');await page.keyboard.up('Space');
    const samples=await page.evaluate(()=>{const w=window as any;clearInterval(w.handlingTimer);return w.handlingSamples;});
    expect(samples.some((v:any)=>Math.abs(v.lateral)>.3&&Math.abs(v.yawRate)>.2)).toBe(true);
    await test.info().attach('handling-samples',{body:JSON.stringify(samples,null,2),contentType:'application/json'});
    await expect.poll(async()=>Number.isFinite((await car(observer))?.lateralSpeed)).toBe(true);
    await expect.poll(()=>observer.evaluate(id=>(window as any).barDebug.motos().some((v:any)=>v.id===id),carId)).toBe(true);
    await page.keyboard.down('Space');await expect.poll(async()=>{const v=await car();return Math.hypot(v.speed,v.lateralSpeed);}).toBeLessThan(.05);await page.keyboard.up('Space');
    await expect.poll(async()=>Math.abs((await car()).yawRate)).toBeLessThan(.01);
    const target=await car(observer),view=await observer.evaluate(()=>{const d=(window as any).barDebug,s=d.snapshot();return {...s.world.players[s.localId],cameraYaw:d.camera().yaw};});
    const wanted=Math.atan2(-(target.x-view.x),-(target.z-view.z));
    const turn=Math.atan2(Math.sin(view.cameraYaw-wanted),Math.cos(view.cameraYaw-wanted));
    await orbit(observer,Math.round(turn/.006));
    await expect.poll(()=>observer.evaluate(id=>{const v=(window as any).barDebug.motos().find((v:any)=>v.id===id);return !!v&&v.screen[0]>0&&v.screen[0]<innerWidth&&v.screen[1]>0&&v.screen[1]<innerHeight;},carId)).toBe(true);
    await observer.screenshot({path:'test-results/previews/car-arcade-handbrake-observer.png'});
    expect(errors).toEqual([]);
  }finally{
    await page.keyboard.up('w');await page.keyboard.up('d');await page.keyboard.up('Space');
    if(carId)await page.evaluate(id=>(window as any).barDebug.send('admin.moto.despawn',{id}),carId).catch(()=>{});
    await context.close();
  }
});
