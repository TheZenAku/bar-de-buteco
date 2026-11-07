import {test,expect} from '@playwright/test';
import {fileURLToPath} from 'node:url';
import {enterAsAdmin} from './moto-helpers';
const fixture='/@fs/'+fileURLToPath(new URL('../fixtures/truck.html',import.meta.url)).replaceAll('\\','/');

test('Space plays recorded brakes on every model, stays silent under acceleration, and releases at rest',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/@fs/'+fileURLToPath(new URL('../fixtures/vehicle-brake.html',import.meta.url)).replaceAll('\\','/'));
  await page.getByRole('button',{name:'Ativar áudio'}).click();
  const status=()=>page.evaluate(()=>{const f=(window as any).fixture;return f.sounds.telemetry(f.views[f.selected].state.id);});
  const rms=()=>page.evaluate(()=>{const a=(window as any).fixture.analyser,s=new Float32Array(a.fftSize);a.getFloatTimeDomainData(s);return Math.sqrt(s.reduce((sum,n)=>sum+n*n,0)/s.length);});
  const motion=(speed:number,lateralSpeed=0)=>page.evaluate(v=>{const f=(window as any).fixture;Object.assign(f.views[f.selected],v);},{speed,lateralSpeed});
  await expect.poll(async()=>(await status()).ready).toBe(3);
  const count=await page.evaluate(()=>(window as any).fixture.views.length);
  for(let i=0;i<count;i++){
    await page.evaluate(index=>(window as any).fixture.selected=index,i);
    await motion(16);await page.waitForTimeout(100);
    expect((await status()).voice).toBeUndefined();await expect.poll(rms).toBeLessThan(.00001);
    await motion(0);await page.keyboard.down('Space');
    await expect.poll(async()=>(await status()).voice?.clip).toBe('aciona');
    expect((await status()).voice?.skidding).toBe(false);await expect.poll(rms,{intervals:[20]}).toBeGreaterThan(.001);
    await motion(12);await expect.poll(async()=>(await status()).voice?.skidding).toBe(true);
    await expect.poll(rms).toBeGreaterThan(.005);
    await page.waitForTimeout(600);
    expect((await status()).played.filter((p:any)=>p.id===`brake-${i}`&&p.clip==='aciona')).toHaveLength(1);
    await motion(0);await expect.poll(async()=>(await status()).voice?.skidding).toBe(false);await expect.poll(rms).toBeLessThan(.00001);
    await page.keyboard.up('Space');await expect.poll(async()=>(await status()).voice?.clip).toBe('solta');
    await expect.poll(async()=>(await status()).playing).toBe(0);await expect.poll(rms).toBeLessThan(.00001);
  }
  await motion(-3);await page.keyboard.down('Space');await expect.poll(async()=>(await status()).voice?.skidding).toBe(true);
  await motion(0,4);await expect.poll(async()=>(await status()).voice?.level).toBeGreaterThan(0);
  await page.evaluate(()=>(window as any).fixture.volume=0);await expect.poll(rms).toBeLessThan(.00001);
  await page.evaluate(()=>(window as any).fixture.volume=1);await expect.poll(rms).toBeGreaterThan(.005);
  await page.evaluate(()=>{(window as any).fixture.active=false;Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  await expect.poll(rms).toBeLessThan(.00001);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));(window as any).fixture.active=true;});
  await expect.poll(rms).toBeGreaterThan(.005);
  await page.evaluate(()=>(window as any).fixture.ear.x=100);await expect.poll(async()=>(await status()).playing).toBe(0);await expect.poll(rms).toBeLessThan(.00001);
  await page.keyboard.up('Space');await page.evaluate(()=>{const f=(window as any).fixture;f.ear.x=0;f.views=[];});await expect.poll(rms).toBeLessThan(.00001);
  expect(await page.evaluate(()=>(window as any).fixture.sounds.telemetry().errors)).toEqual([]);
  await page.evaluate(()=>{const f=(window as any).fixture;f.active=false;f.sounds.destroy();});
  expect(await page.evaluate(()=>(window as any).fixture.sounds.telemetry().state)).toBe('closed');expect(errors).toEqual([]);
});

test('truck recorded audio: delayed loading, diesel states, horn, reverse, distance, mute and cleanup',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/caminhao/sound/*.wav',async route=>{await new Promise(resolve=>setTimeout(resolve,250));await route.continue();});
  await page.goto('/@fs/'+fileURLToPath(new URL('../fixtures/truck-sound.html',import.meta.url)).replaceAll('\\','/'));
  await page.getByRole('button',{name:'Ativar áudio'}).click();
  const status=()=>page.evaluate(()=>(window as any).fixture.sounds.telemetry('truck'));
  const set=(patch:Record<string,unknown>)=>page.evaluate(v=>(window as any).fixture.set(v),patch);
  const rms=()=>page.evaluate(()=>{const a=(window as any).fixture.analyser,s=new Float32Array(a.fftSize);a.getFloatTimeDomainData(s);return Math.sqrt(s.reduce((sum,n)=>sum+n*n,0)/s.length);});
  await expect.poll(async()=>(await status()).ready).toBe(7);
  await expect.poll(async()=>(await status()).played).toContain('partida');
  await set({engine:2});await expect.poll(async()=>(await status()).voice?.loops).toContain('idle');
  await expect.poll(rms).toBeGreaterThan(.005);
  await set({gas:true});await expect.poll(async()=>(await status()).voice?.rpm).toBeGreaterThan(1400);
  await page.evaluate(()=>(window as any).fixture.view.speed=8);
  await expect.poll(async()=>(await status()).voice?.gear).toBe(3);
  await page.evaluate(()=>(window as any).fixture.view.speed=-2);
  await expect.poll(async()=>(await status()).voice?.reverse).toBe(true);
  await set({horn:true});await expect.poll(async()=>(await status()).horn.playing).toBe(true);
  await set({horn:false});await expect.poll(async()=>(await status()).horn.playing).toBe(false);
  await page.evaluate(()=>(window as any).fixture.view.speed=0);
  await expect.poll(async()=>(await status()).voice?.reverse).toBe(false);
  await page.evaluate(()=>(window as any).fixture.volume=0);await expect.poll(rms).toBeLessThan(.00001);
  await page.evaluate(()=>(window as any).fixture.volume=1);await expect.poll(rms).toBeGreaterThan(.005);
  // Visibility must mute even if the game draws no further frames.
  await page.evaluate(()=>{const f=(window as any).fixture;f.active=false;Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  await expect.poll(rms).toBeLessThan(.00001);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));(window as any).fixture.active=true;});
  await expect.poll(rms).toBeGreaterThan(.005);
  await page.evaluate(()=>(window as any).fixture.ear.x=100);await expect.poll(async()=>(await status()).playing).toBe(0);await expect.poll(rms).toBeLessThan(.00001);
  await page.evaluate(()=>(window as any).fixture.ear.x=0);await expect.poll(async()=>(await status()).playing).toBe(1);
  await set({engine:0,gas:false});await expect.poll(async()=>(await status()).voice?.clip).toBe('desliga');
  // Restarting while shutdown is playing cancels that tail.
  await set({engine:2});await expect.poll(async()=>(await status()).voice?.clip).toBe('');
  await set({engine:1,crank:3});await expect.poll(async()=>(await status()).voice?.loops).toContain('arranque');
  await set({engine:0});await expect.poll(async()=>(await status()).playing).toBe(0);
  await expect.poll(rms).toBeLessThan(.00001);
  // Even while switched off the real horn works, and the nearest four have bounded sources.
  await set({horn:true});await expect.poll(async()=>(await status()).horn.playing).toBe(true);
  await page.evaluate(()=>{const f=(window as any).fixture;f.trucks=Array.from({length:8},(_,i)=>({...f.view,x:i,state:{...f.state,id:`truck-${i}`,engine:2,horn:false}}));});
  await expect.poll(async()=>(await status()).playing).toBe(4);
  await page.evaluate(()=>(window as any).fixture.trucks=[]);await expect.poll(async()=>(await status()).playing).toBe(0);await expect.poll(rms).toBeLessThan(.00001);
  expect(await page.evaluate(()=>(window as any).fixture.oscillators)).toBe(0);
  expect((await status()).errors).toEqual([]);
  await page.evaluate(()=>{const f=(window as any).fixture;f.active=false;f.sounds.destroy();});await expect.poll(async()=>(await status()).state).toBe('closed');
  expect(errors).toEqual([]);
});

test('truck rig: two seats, individual paint and plate, doors, the roll-up door and the crates that follow the load',async({page})=>{
  test.setTimeout(150000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(fixture);await page.evaluate(()=>(window as any).fixture.ready);
  const truck=()=>page.evaluate(()=>(window as any).fixture.status().find((v:any)=>v.id==='truck'));
  const scale=(name:string)=>page.evaluate((n:string)=>{const t=[...(window as any).fixture.scene.motos.all()].find((v:any)=>v.state.id==='truck');return t.rig.ponto(n).getLocalScale().toArray();},name);
  await expect.poll(async()=>!!await truck()).toBe(true);await expect.poll(async()=>(await truck()).rig.plate).toBe('BAR1T60');
  await page.locator('canvas').click({position:{x:40,y:40}});
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.scene.motos.soundTelemetry('truck').ready)).toBe(7);
  expect(await page.evaluate(()=>{const m=(window as any).fixture.scene.motos;return {model:m.soundTelemetry('truck').model,car:m.carSounds.engines.has('truck'),horn:m.horns.voices.has('truck')};})).toEqual({model:'caminhao-bau',car:false,horn:false});
  await page.evaluate(()=>(window as any).fixture.set({handbrake:true,speed:4}));
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.scene.motos.soundTelemetry('truck').brake.voice?.skidding)).toBe(true);
  await page.evaluate(()=>(window as any).fixture.set({handbrake:false,speed:0}));
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.scene.motos.soundTelemetry('truck').brake.playing)).toBe(0);
  // The driver's Space reaches the sound before a room patch changes handbrake.
  await page.evaluate(()=>{const f=(window as any).fixture,t=[...f.scene.motos.all()].find((v:any)=>v.state.id==='truck');f.scene.setEnabled(true);f.scene.predictMoto('truck',{...t.state,speed:4});});
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.scene.chasing)).toBe(true);
  await page.keyboard.down('Space');
  expect(await page.evaluate(()=>(window as any).fixture.scene.getMotoInput().brake)).toBe(true);
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.scene.motos.soundTelemetry('truck').brake.voice?.skidding)).toBe(true);
  await page.keyboard.up('Space');
  expect(await page.evaluate(()=>(window as any).fixture.scene.getMotoInput().brake)).toBe(false);
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.scene.motos.soundTelemetry('truck').brake.voice?.skidding??false)).toBe(false);
  await page.evaluate(()=>{const f=(window as any).fixture;f.scene.predictMoto('truck',undefined);f.scene.setEnabled(false);});
  await page.screenshot({path:'test-results/previews/truck-day.png'});
  // The paint is this truck's alone.
  await page.evaluate(()=>(window as any).fixture.set({color:'#17a856'}));
  await expect.poll(async()=>(await truck()).rig.paint).toBe('#17a856');
  expect(await page.evaluate(()=>(window as any).fixture.status().find((v:any)=>v.id==='other').rig.paint)).toBe('#245db7');
  // The box: its roll-up door goes up into the roof (the bone's Y scale) and the lamp inside lights.
  expect((await scale('porta_bau'))[1]).toBeCloseTo(1,2);
  await page.evaluate(()=>(window as any).fixture.set({trunk:true,load:0}));
  await expect.poll(async()=>(await scale('porta_bau'))[1]).toBeLessThan(.08);
  expect((await truck()).rig.trunk).toBeGreaterThan(.9);
  // The crates follow the load (0..3), and none shows while empty.
  for(const [load,shown] of [[0,[0,0,0]],[1,[1,0,0]],[2,[1,1,0]],[3,[1,1,1]]] as const){
    await page.evaluate((value:number)=>(window as any).fixture.set({load:value}),load);
    await expect.poll(async()=>[(await scale('carga_1'))[0],(await scale('carga_2'))[0],(await scale('carga_3'))[0]]).toEqual(shown);
  }
  await page.evaluate(()=>(window as any).fixture.view('rear'));
  await page.screenshot({path:'test-results/previews/truck-hold-open.png'});
  // The doors, wipers and the wheel turning with the front wheels.
  await page.evaluate(()=>(window as any).fixture.set({trunk:false,doors:3,wipers:true}));
  await expect.poll(async()=>(await truck()).rig.doors[0]).toBeGreaterThan(.9);
  await expect.poll(async()=>(await scale('porta_bau'))[1]).toBeGreaterThan(.95);
  await page.screenshot({path:'test-results/previews/truck-doors.png'});
  await page.evaluate(()=>{const f=(window as any).fixture;f.view('outside');f.set({doors:0,wipers:false});f.drive(true,1);});
  await expect.poll(async()=>(await truck()).rig.guidao).toBeGreaterThan(2);await expect.poll(async()=>(await truck()).speed).toBeGreaterThan(.5);
  await page.screenshot({path:'test-results/previews/truck-turn.png'});
  await page.evaluate(()=>{const f=(window as any).fixture;f.stop();f.view('inside');});
  await page.waitForTimeout(600);await page.screenshot({path:'test-results/previews/truck-interior.png'});
  const seated=await page.evaluate(()=>[...(window as any).fixture.scene.actors.values()].filter((a:any)=>a.riding).map((a:any)=>a.root.getPosition().toArray()));
  expect(seated).toHaveLength(2);expect(new Set(seated.map((p:number[])=>p.map(v=>v.toFixed(2)).join())).size).toBe(2);
  expect(errors).toEqual([]);
});

test('truck in the actual game: bought in HighMotors, taken from the garage, its hold opens at the back, moves items and closes',async({page})=>{
  test.setTimeout(240000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await enterAsAdmin(page);
  const change=await page.request.post('/api/admin/prices',{data:{changes:[{key:'vehicle:caminhao',value:1000}],reason:'Preço temporário do teste do caminhão'}});expect(change.ok()).toBe(true);
  try{
    const username=`truck_buy_${Date.now().toString(36)}`;
    const registered=await page.request.post('/api/auth/register',{data:{username,displayName:'Dono do caminhão',email:`${username}@truck.test`,password:'SenhaBoaDeTeste2026!'}});expect(registered.status()).toBe(201);
    await page.goto('/');await page.getByRole('button',{name:'Entrar no bar'}).click();await expect(page.locator('#waiting')).toBeHidden({timeout:60000});
    await expect.poll(()=>page.evaluate(()=>{const d=(window as any).barDebug.snapshot();return !!d.world?.players?.[d.localId]?.connected;})).toBe(true);
    await page.keyboard.press('k');await page.locator('[data-app="highmotors"]').first().click();
    await page.getByRole('tab',{name:'Loja',exact:true}).click();await page.locator('[data-hm="offer"][data-model="caminhao-bau"]').click();
    await page.getByRole('heading',{name:'Caminhão Baú',exact:true}).waitFor();
    await page.getByRole('button',{name:'Comprar veículo',exact:true}).click();await page.getByRole('button',{name:'Confirmar compra',exact:true}).click();await expect(page.getByText('O veículo é seu!',{exact:true})).toBeVisible();
    await page.screenshot({path:'test-results/previews/truck-purchased.png'});await page.keyboard.press('Escape');
    const stock=await page.request.get('/api/vehicles'),owned=(await stock.json()).vehicles.filter((v:any)=>v.model==='caminhao-bau').at(-1);expect(owned.load).toBe(0);
    await page.evaluate(()=>{const d=(window as any).barDebug;d.send('inventory.sync',{});d.send('test.player.place',{x:-13.25,y:.15,z:-8.3});});
    await expect.poll(()=>page.evaluate(()=>(window as any).barDebug.snapshot().world.players[(window as any).barDebug.snapshot().localId].x)).toBeCloseTo(-13.25,1);
    await page.keyboard.press('e');await page.locator(`[data-plate="${owned.plate}"] [data-action="garage-take"]`).click();
    const mine=()=>page.evaluate(()=>{const d=(window as any).barDebug.snapshot();return Object.values(d.world.motos??{}).find((m:any)=>m.ownerId===d.localId&&m.model==='caminhao-bau') as any;});
    await expect.poll(async()=>!!await mine(),{timeout:20000}).toBe(true);
    await page.waitForTimeout(1500);
    // Standing beside the truck there is no hold to open; behind it, E opens it.
    const behind=async(metres:number)=>{const t=await mine();return {x:t.x-Math.sin(t.yaw)*(2.78+metres),z:t.z-Math.cos(t.yaw)*(2.78+metres)+0,y:t.y};};
    const place=async(point:{x:number;z:number;y:number})=>page.evaluate((p)=>(window as any).barDebug.send('test.player.place',p),point);
    const side=await mine();await place({x:side.x+Math.cos(side.yaw)*2.3,z:side.z-Math.sin(side.yaw)*2.3,y:side.y});await page.waitForTimeout(500);
    await expect(page.locator('#context-label')).toContainText('subir');await expect(page.locator('.storage-panel')).toBeHidden();   // beside it, E boards
    await place(await behind(1.2));await page.waitForTimeout(700);
    await expect(page.locator('#context-label')).toContainText('baú');
    await page.keyboard.press('e');
    await expect(page.locator('.storage-panel')).toBeVisible();await expect.poll(async()=>(await mine()).trunk).toBe(true);
    await page.screenshot({path:'test-results/previews/truck-storage-panel.png'});
    // Move one water from the backpack to the hold and back.
    await page.locator('.storage-panel [data-side="bag"][data-item="agua"]').click();
    await page.getByRole('button',{name:'Guardar 1',exact:true}).click();
    await expect(page.locator('.storage-panel [data-side="hold"][data-item="agua"] b')).toHaveText('1');
    await expect.poll(async()=>(await mine()).load).toBe(1);
    await page.screenshot({path:'test-results/previews/truck-storage-stored.png'});
    await page.locator('.storage-panel [data-side="hold"][data-item="agua"]').click();
    await page.getByRole('button',{name:'Retirar 1',exact:true}).click();
    await expect(page.locator('.storage-panel [data-side="hold"][data-item="agua"]')).toHaveCount(0);
    await expect.poll(async()=>(await mine()).load).toBe(0);
    // Closing the panel puts the door down; walking away from an open one does the same.
    await page.keyboard.press('Escape');await expect(page.locator('.storage-panel')).toBeHidden();await expect.poll(async()=>(await mine()).trunk).toBe(false);
    await page.keyboard.press('e');await expect(page.locator('.storage-panel')).toBeVisible();
    await place(await behind(9));await expect(page.locator('.storage-panel')).toBeHidden({timeout:10000});await expect.poll(async()=>(await mine()).trunk).toBe(false);
    expect(errors).toEqual([]);
  }finally{await page.request.post('/api/admin/prices',{data:{changes:[{key:'vehicle:caminhao',value:60000}],reason:'Preço do caminhão restaurado'}}).catch(()=>undefined);}
});
