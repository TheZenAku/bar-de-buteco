import fs from 'node:fs';
import {test,expect,type Page} from '@playwright/test';
import {enterAsAdmin,selfOf,inVehicles,orbit} from './moto-helpers';

const shots='test-results/vehicle-actions';
const shot=async(page:Page,name:string)=>{fs.mkdirSync(shots,{recursive:true});await page.screenshot({path:`${shots}/${name}.png`});};
const place=async(page:Page,x:number,z:number,rotation=-Math.PI/2)=>{
  await page.evaluate(at=>(window as any).barDebug.send('test.player.place',at),{x,y:0,z,rotation});
  await expect.poll(async()=>Math.hypot((await selfOf(page)).x-x,(await selfOf(page)).z-z)).toBeLessThan(.2);
};
const state=(page:Page,id:string)=>page.evaluate(id=>(window as any).barDebug.snapshot().world.motos[id],id);
const drawn=(page:Page,id:string)=>page.evaluate(id=>(window as any).barDebug.motos().find((m:any)=>m.id===id),id);

test('delivery bag transfers to v4, both vehicles honk, Shift raises the motorcycle and the horse neighs for nearby players',async({browser,page})=>{
  test.setTimeout(240_000);
  const errors:string[]=[];const listen=(p:Page)=>{p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});};
  listen(page);await page.setViewportSize({width:1280,height:900});await enterAsAdmin(page);
  const context=await browser.newContext({viewport:{width:960,height:720},extraHTTPHeaders:{'X-Forwarded-For':'127.0.0.17'}}),observer=await context.newPage();listen(observer);
  const me=await selfOf(page);
  try{
    expect((await observer.request.post('/api/auth/login',{data:{email:'jogador2@bar.local',password:process.env.DEMO_PASSWORD||'ButecoDemo2026!'}})).ok()).toBe(true);
    await observer.goto('/');await observer.getByRole('button',{name:'Entrar no bar'}).click();await expect(observer.locator('#waiting')).toBeHidden({timeout:60000});
    await expect.poll(()=>selfOf(observer).then(s=>!!s?.connected)).toBe(true);
    await page.bringToFront();
    expect((await page.request.post('/api/admin/wallet',{data:{playerId:me.id,operation:'add',amount:50000,reason:'Teste isolado de ações dos veículos',requestId:crypto.randomUUID()}})).ok()).toBe(true);
    const purchase=await page.request.post('/api/vehicles/buy',{data:{model:'moto-delivery',requestId:crypto.randomUUID()}});expect(purchase.ok(),await purchase.text()).toBe(true);
    const vehicle=(await purchase.json()).vehicles.filter((v:any)=>v.model==='moto-delivery').at(-1);
    await page.evaluate(()=>(window as any).barDebug.syncWallet());
    await place(page,-13.25,-8.3);await page.keyboard.press('e');
    const row=page.locator(`.garage-vehicle[data-plate="${vehicle.plate}"]`);await expect(row).toBeVisible();await row.locator('[data-action="garage-take"]').click();
    const own=()=>page.evaluate(id=>Object.values((window as any).barDebug.snapshot().world.motos).find((m:any)=>m.ownerId===id) as any,me.id);
    await expect.poll(async()=>!!(await own())).toBe(true);
    const bikeId=(await own()).id;
    await page.evaluate(()=>(window as any).barDebug.send('test.moto.place',{x:60,z:7}));
    await expect.poll(async()=>(await state(page,bikeId)).x).toBeCloseTo(60,1);
    await place(page,-3.99,-13.97);await page.keyboard.press('e');await expect(page.locator('[data-action="food-start"]')).toBeVisible();await page.locator('[data-action="food-start"]').click();await page.keyboard.press('Escape');
    await expect.poll(()=>selfOf(page).then(s=>s.courier)).toBe(true);
    const bike=await state(page,bikeId);
    await place(observer,60,10);await place(page,bike.x+Math.cos(bike.yaw)*.9,bike.z-Math.sin(bike.yaw)*.9);
    await page.keyboard.press('l');await expect.poll(async()=>(await state(page,bikeId)).locked).toBe(false);
    await expect(page.locator('#context-label')).toHaveText('para subir');await page.keyboard.press('e');
    await expect.poll(async()=>(await state(page,bikeId)).riderId).toBe(me.id);
    for(const p of [page,observer])await expect.poll(async()=>(await drawn(p,bikeId))?.rig.bag?.parent).toBe('ponto_bau');
    await orbit(page,230);await shot(page,'01-highfood-bag-na-moto');
    await page.keyboard.down('f');
    for(const p of [page,observer]){
      await expect.poll(async()=>(await state(p,bikeId)).horn).toBe(true);
      await expect.poll(async()=>(await drawn(p,bikeId)).sound.horn.playing).toBe(true);
    }
    await shot(page,'02-moto-buzina');await page.keyboard.up('f');
    await expect.poll(async()=>(await state(observer,bikeId)).horn).toBe(false);
    await page.keyboard.down('w');await expect.poll(async()=>(await drawn(page,bikeId)).speed).toBeGreaterThan(2);
    await page.keyboard.down('Shift');
    for(const p of [page,observer])await expect.poll(async()=>(await drawn(p,bikeId)).rig.grau).toBeGreaterThan(15);
    const wheelie=await drawn(page,bikeId);expect(wheelie.rig.frontWheelY-wheelie.rig.rearWheelY).toBeGreaterThan(.3);
    expect(Math.abs(wheelie.rig.rearWheelY-(await state(page,bikeId)).y-.3)).toBeLessThan(.05);
    await page.keyboard.up('w');await orbit(page,240);await shot(page,'03-moto-grau-com-bag');await page.keyboard.up('Shift');await page.keyboard.down('Space');
    await expect.poll(async()=>Math.abs((await drawn(page,bikeId)).speed)).toBeLessThan(.1);await page.keyboard.up('Space');
    await expect.poll(async()=>(await drawn(page,bikeId)).rig.grau).toBeLessThan(1);
    await page.keyboard.press('e');await expect.poll(()=>selfOf(page).then(s=>s.animationState)).not.toBe('ride');
    for(const p of [page,observer])await expect.poll(async()=>(await drawn(p,bikeId)).rig.bag).toBeNull();
    await shot(page,'04-highfood-desmontou');await page.evaluate(()=>(window as any).barDebug.send('food.stop',{}));

    await place(page,85,7);
    await inVehicles(page,async()=>{await page.getByLabel('Modelo para spawn',{exact:true}).selectOption('carro-hatch');await page.locator('[data-vehicle="spawn"]').click();await expect(page.locator('.admin-feedback')).toContainText('Hatch 80 spawnado');});
    const car=await page.evaluate(()=>Object.values((window as any).barDebug.snapshot().world.motos).find((m:any)=>m.model==='carro-hatch') as any);
    await place(observer,car.x,car.z+3);
    await place(page,car.x+Math.cos(car.yaw)*1.1,car.z-Math.sin(car.yaw)*1.1);await page.keyboard.press('e');
    await expect.poll(async()=>(await state(page,car.id)).riderId).toBe(me.id);
    await page.keyboard.down('f');
    for(const p of [page,observer])await expect.poll(async()=>(await drawn(p,car.id)).sound.horn.playing).toBe(true);
    await page.keyboard.down('Shift');await page.waitForTimeout(350);expect((await state(page,car.id)).wheelie).toBe(0);
    await shot(page,'05-carro-buzina');await page.keyboard.up('Shift');await page.keyboard.up('f');
    await expect.poll(async()=>(await drawn(observer,car.id)).sound.horn.playing).toBe(false);
    await page.keyboard.press('e');await expect.poll(()=>selfOf(page).then(s=>s.animationState)).not.toBe('ride');

    for(const [url,data] of [['/api/wardrobe/buy',{skin:'tiao'}],['/api/wardrobe/equip',{skin:'tiao'}],['/api/wardrobe/skill',{skill:'horse'}]] as const){const r=await page.request.post(url,{data});expect(r.ok()||r.status()===409,await r.text()).toBe(true);}
    await page.evaluate(()=>(window as any).barDebug.send('player.appearance',{}));await expect.poll(()=>selfOf(page).then(s=>s.skin)).toBe('tiao');
    await place(page,60,7);await place(observer,60,10);await page.bringToFront();
    const skillKey=(await page.locator('#skill-button kbd').textContent())!.trim().toLowerCase();await page.keyboard.press(skillKey);
    await expect.poll(()=>selfOf(page).then(s=>s.interactionState)).toBe('horse');
    for(const p of [page,observer])await expect.poll(()=>p.evaluate(id=>(window as any).barDebug.horses().some((h:any)=>h.id===id),me.id)).toBe(true);
    await orbit(page,240);await page.keyboard.down('Shift');
    await expect.poll(()=>selfOf(page).then(s=>s.animationState)).toBe('horse-rear');
    for(const p of [page,observer]){
      await expect.poll(()=>p.evaluate(id=>(window as any).barDebug.horses().find((h:any)=>h.id===id)?.rearAngle??0,me.id),{intervals:[50]}).toBeGreaterThan(20);
      await expect.poll(()=>p.evaluate(id=>(window as any).barDebug.horses().find((h:any)=>h.id===id)?.sound.neighAt??0,me.id),{intervals:[50]}).toBeGreaterThan(0);
    }
    const rearAt=(await selfOf(page)).horseRearAt;await shot(page,'06-cavalo-empina-relincha');
    await expect.poll(()=>selfOf(page).then(s=>s.animationState)).toBe('horse-idle');await page.waitForTimeout(1500);
    expect((await selfOf(page)).horseRearAt).toBe(rearAt);await page.keyboard.up('Shift');
    await page.waitForTimeout(200);await orbit(page,240);await page.keyboard.down('Shift');await expect.poll(()=>selfOf(page).then(s=>s.horseRearAt)).toBeGreaterThan(rearAt);
    await expect.poll(()=>page.evaluate(id=>(window as any).barDebug.horses().find((h:any)=>h.id===id)?.rearAngle??0,me.id),{intervals:[50]}).toBeGreaterThan(30);
    await shot(page,'06-cavalo-empina-relincha');await page.keyboard.up('Shift');
    await page.keyboard.press('e');await expect.poll(()=>selfOf(page).then(s=>s.interactionState)).toBe('');
    expect(errors).toEqual([]);
    fs.writeFileSync(`${shots}/verification.json`,JSON.stringify({wheelie,rearAt,errors},null,2));
  }finally{for(const key of ['w','Shift','f','Space'])await page.keyboard.up(key).catch(()=>{});await context.close();}
});
