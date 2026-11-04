import {test,expect,type Page} from '@playwright/test';
import {fileURLToPath} from 'node:url';
import {walkTo,selfOf} from './moto-helpers';
import {aimCamera} from './camera-helpers';
import {previewPath} from './preview-path';

const fixture='/@fs/'+fileURLToPath(new URL('../fixtures/environment.html',import.meta.url)).replaceAll('\\','/');
const horses=(p:Page)=>p.evaluate(()=>(window as any).barDebug.horses());
test('the actual horse rig loops, holds Tião on the saddle at every heading and releases his standing pose',async({page})=>{
  test.setTimeout(120000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(fixture);await page.waitForFunction(()=>(window as any).fixture?.scene);await page.evaluate(()=>(window as any).fixture.ready);
  await page.evaluate(()=>{
    const f=(window as any).fixture;
    f.view([4,2.5,10],[0,1.3,6]);
    f.scene.updateState({players:[{id:'rider',skin:'tiao',x:0,y:0,z:6,rotation:0,animation:'horse-idle',interactionState:'horse',courier:true}],npcs:[]},'');
  });
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.scene.getHorses()[0]?.clip)).toBe('HorseIdle');
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.scene.getAnimations()[0]?.clip)).toBe('Sit');
  const standingHeight=await page.evaluate(()=>(window as any).fixture.scene.getHorses()[0].saddle[1]);
  await page.screenshot({path:previewPath('tiao-horse-idle.png')});
  const samples=await page.evaluate(async()=>{
    const scene=(window as any).fixture.scene,avatar=scene.actors.get('rider'),samples:any[]=[];
    for(const rotation of [0,Math.PI/2,Math.PI,-Math.PI/2]){
      avatar.actor.rotation=rotation;avatar.actor.animation='horse-walk';
      for(let i=0;i<8;i++){
        await new Promise<void>(done=>scene.app.once('postrender',done));
        const horse=avatar.horse,hip=avatar.skin.hip.getPosition(),saddle=horse.saddle.getPosition();
        samples.push({error:Math.hypot(hip.x-saddle.x,hip.y-saddle.y-.105,hip.z-saddle.z),feet:[avatar.skin.bones.foot_l.getPosition().y,avatar.skin.bones.foot_r.getPosition().y],clip:horse.telemetry().clip,packVisible:avatar.packProp?.enabled,packDistance:avatar.packProp?.getPosition().distance(avatar.spine.getPosition())});
      }
    }
    return samples;
  });
  for(const sample of samples){expect(sample.error).toBeLessThan(.001);expect(sample.feet.every((y:number)=>Number.isFinite(y)&&y>.4&&y<1.2)).toBe(true);expect(sample.clip).toBe('HorseWalk');expect(sample.packVisible).toBe(true);expect(sample.packDistance).toBeLessThan(.25);}
  await page.screenshot({path:previewPath('tiao-horse-walk.png')});
  const gallop=await page.evaluate(async()=>{
    const f=(window as any).fixture,scene=f.scene,avatar=scene.actors.get('rider'),samples:any[]=[];
    const update=avatar.horse.update.bind(avatar.horse);
    avatar.horse.update=(_speed:number,state:string,resting:boolean)=>{
      update(9,state,resting);
      const layer=avatar.horse.model.anim.baseLayer;
      layer.playing=f.horsePhase===undefined;
      if(f.horsePhase!==undefined)layer.activeStateCurrentTime=layer.activeStateDuration*f.horsePhase;
    };
    avatar.actor.animation='horse-gallop';
    for(const rotation of [0,Math.PI/2,Math.PI,-Math.PI/2]){
      avatar.actor.rotation=rotation;
      for(let i=0;i<30;i++){
        await new Promise<void>(done=>scene.app.once('postrender',done));
        const horse=avatar.horse,hip=avatar.skin.hip.getPosition(),saddle=horse.saddle.getPosition();
        samples.push({error:Math.hypot(hip.x-saddle.x,hip.y-saddle.y-.105,hip.z-saddle.z),feet:[avatar.skin.bones.foot_l.getPosition().y,avatar.skin.bones.foot_r.getPosition().y],clip:horse.telemetry().clip,saddle:saddle.y,rate:horse.telemetry().rate});
      }
    }
    avatar.actor.rotation=0;return samples;
  });
  for(const sample of gallop){expect(sample.clip).toBe('HorseGallop');expect(sample.error).toBeLessThan(.001);expect(sample.feet.every((y:number)=>Number.isFinite(y)&&y>.3&&y<1.3)).toBe(true);expect(sample.saddle).toBeGreaterThan(standingHeight-.12);expect(sample.rate).toBeGreaterThan(1.9);expect(sample.rate).toBeLessThan(2.2);}
  await page.screenshot({path:previewPath('tiao-horse-gallop.png')});
  for(const [name,phase] of [['push',.1],['support',.45],['flight',.84]] as const){
    await page.evaluate(phase=>new Promise<void>(done=>{
      const f=(window as any).fixture,avatar=f.scene.actors.get('rider');
      f.view([5.5,2.4,6],[0,1.35,6]);avatar.actor.rotation=0;avatar.yaw=0;f.horsePhase=phase;
      f.scene.app.once('postrender',()=>done());
    }),phase);
    await page.screenshot({path:previewPath(`tiao-horse-gallop-${name}.png`)});
  }
  await page.evaluate(()=>{const s=(window as any).fixture.scene,a=s.actors.get('rider');a.actor.interactionState='';a.actor.animation='idle';});
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.scene.getHorses().length)).toBe(0);
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.scene.actors.get('rider').body.getLocalPosition().length())).toBeLessThan(.001);
  expect(errors).toEqual([]);
});

test('purchased horse skill uses real keys and replicates riding, stopping, dismounting, a remapped key and skin changes',async({browser,page})=>{
  test.setTimeout(300000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const context=await browser.newContext({viewport:{width:960,height:640},extraHTTPHeaders:{'X-Forwarded-For':'127.0.0.17'}}),observer=await context.newPage();observer.on('pageerror',e=>errors.push(e.message));
  const suffix=Date.now().toString(36);
  const register=async(p:Page,name:string)=>{
    const response=await p.request.post('/api/auth/register',{data:{email:`horse_${name}_${suffix}@example.com`,username:`horse_${name}_${suffix}`,displayName:`horse_${name}`,password:'HorseTeste2026!'}});expect(response.status()).toBe(201);
    return (await response.json()).user.id as string;
  };
  const enter=async(p:Page)=>{await p.goto('/');await p.getByRole('button',{name:'Entrar no bar'}).click();await expect(p.locator('#waiting')).toBeHidden({timeout:60000});await expect.poll(()=>selfOf(p).then(s=>s?.connected)).toBe(true);};
  const post=async(p:Page,url:string,data:unknown)=>expect((await p.request.post(url,{data})).ok()).toBe(true);
  try{
    await expect.poll(async()=>(await page.request.get('/api/ready').catch(()=>undefined))?.ok()??false,{timeout:90_000,intervals:[500]}).toBe(true);
    const id=await register(page,'owner');await register(observer,'viewer');
    await post(page,'/api/wardrobe/buy',{skin:'tiao'});await post(page,'/api/wardrobe/equip',{skin:'tiao'});
    await post(page,'/api/wardrobe/skill',{skill:'horse'});
    await enter(page);await enter(observer);
    await page.bringToFront();await walkTo(page,10,5,.3);
    await expect(page.locator('#skill-button .tip')).toHaveText('Cavalo do Tião');
    await page.keyboard.press('x');
    await expect.poll(()=>selfOf(page).then(s=>s.interactionState)).toBe('horse');
    for(const p of [page,observer])await expect.poll(async()=>(await horses(p)).find((h:any)=>h.id===id)?.clip).toBe('HorseIdle');
    await expect(page.locator('#context-label')).toHaveText('Desmontar do cavalo');
    // A forged skill request from another skin is refused by the real room.
    await observer.evaluate(()=>(window as any).barDebug.send('player.skill',{skill:'horse'}));
    await observer.waitForTimeout(300);expect((await selfOf(observer)).interactionState).not.toBe('horse');
    const before=await selfOf(page);
    await page.keyboard.down('d');
    try{await expect.poll(async()=>(await horses(observer)).find((h:any)=>h.id===id)?.clip).toBe('HorseWalk');await expect.poll(async()=>Math.hypot((await selfOf(page)).x-before.x,(await selfOf(page)).z-before.z)).toBeGreaterThan(.4);}finally{await page.keyboard.up('d');}
    await expect.poll(async()=>(await horses(observer)).find((h:any)=>h.id===id)?.clip).toBe('HorseIdle');
    // Follow the open street: at the higher speed a side press can reach the bar's kerb during polling.
    await aimCamera(page,0);
    const gallopStart=await selfOf(page);
    await page.keyboard.down('Shift');await page.keyboard.down('a');
    try{
      for(const p of [page,observer])await expect.poll(async()=>(await horses(p)).find((h:any)=>h.id===id)?.clip).toBe('HorseGallop');
      await expect.poll(async()=>(await horses(page)).find((h:any)=>h.id===id)?.sound.playing).toBe(true);
      await expect.poll(async()=>Math.hypot((await selfOf(page)).x-gallopStart.x,(await selfOf(page)).z-gallopStart.z)).toBeGreaterThan(1);
      await page.screenshot({path:previewPath('tiao-horse-gallop-multiplayer.png')});
      await page.keyboard.up('Shift');
      for(const p of [page,observer])await expect.poll(async()=>(await horses(p)).find((h:any)=>h.id===id)?.clip).toBe('HorseWalk');
    }finally{await page.keyboard.up('a');await page.keyboard.up('Shift');}
    for(const p of [page,observer])await expect.poll(async()=>(await horses(p)).find((h:any)=>h.id===id)?.clip).toBe('HorseIdle');
    await expect.poll(async()=>(await horses(page)).find((h:any)=>h.id===id)?.sound.playing).toBe(false);
    await page.screenshot({path:previewPath('tiao-horse-multiplayer.png')});
    await page.keyboard.press('e');await expect.poll(()=>selfOf(page).then(s=>s.interactionState)).toBe('');
    for(const p of [page,observer])await expect.poll(async()=>(await horses(p)).length).toBe(0);
    await page.keyboard.press('x');await expect.poll(()=>selfOf(page).then(s=>s.interactionState)).toBe('horse');
    await page.keyboard.press('x');await expect.poll(()=>selfOf(page).then(s=>s.interactionState)).toBe('');
    await post(page,'/api/profile/skill',{skill:'horse',key:'KeyR'});await page.reload();
    await page.getByRole('button',{name:'Entrar no bar'}).click();await expect(page.locator('#waiting')).toBeHidden({timeout:60000});
    await expect(page.locator('#skill-button kbd')).toHaveText('R');
    await page.keyboard.press('r');await expect.poll(()=>selfOf(page).then(s=>s.interactionState)).toBe('horse');
    await post(page,'/api/wardrobe/equip',{skin:'nathan'});await page.evaluate(()=>(window as any).barDebug.send('player.appearance',{}));
    await expect.poll(()=>selfOf(page).then(s=>({skin:s.skin,state:s.interactionState}))).toEqual({skin:'nathan',state:''});
    for(const p of [page,observer])await expect.poll(async()=>(await horses(p)).length).toBe(0);
    expect(errors).toEqual([]);
  }finally{await Promise.allSettled([page.request.post('/api/auth/logout',{data:{}}),observer.request.post('/api/auth/logout',{data:{}})]);await context.close();}
});

test('Tião goes online in Highfood without a motorcycle and the app updates when his horse skill becomes available',async({page})=>{
  test.setTimeout(120000);
  const suffix=Date.now().toString(36),errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await expect.poll(async()=>(await page.request.get('/api/ready').catch(()=>undefined))?.ok()??false,{timeout:90000,intervals:[500]}).toBe(true);
  const registration=await page.request.post('/api/auth/register',{data:{email:`horse_food_${suffix}@example.com`,username:`horse_food_${suffix}`,displayName:'Tião Entregador',password:'HorseFood2026!'}});
  expect(registration.status()).toBe(201);
  try{
    expect((await page.request.post('/api/wardrobe/buy',{data:{skin:'tiao'}})).ok()).toBe(true);
    expect((await page.request.post('/api/wardrobe/equip',{data:{skin:'tiao'}})).ok()).toBe(true);
    await page.goto('/');await page.getByRole('button',{name:'Entrar no bar'}).click();
    await expect(page.locator('#waiting')).toBeHidden({timeout:60000});
    expect((await (await page.request.get('/api/vehicles')).json()).owned).toBe(false);
    await page.keyboard.press('k');await page.locator('[data-app="highfood"]').click();
    await expect(page.locator('[data-hf="online"]')).toHaveCount(0);
    await expect(page.locator('.hf-off')).toContainText('habilidade Cavalo');
    // Purchase during the same session, with the app already open.
    expect((await page.request.post('/api/wardrobe/skill',{data:{skill:'horse'}})).ok()).toBe(true);
    await page.evaluate(()=>(window as any).barDebug.send('player.appearance',{}));
    await expect(page.locator('.hf-off')).toContainText('cavalo do Tião');
    await page.locator('[data-hf="online"]').click();
    await expect(page.locator('.hf-off h3')).toHaveText('Procurando pedidos…');
    await expect(page.locator('[data-hf="to-garage"]')).toHaveCount(0);
    await expect.poll(()=>selfOf(page).then(s=>s.courier)).toBe(true);
    await page.locator('[data-hf-tab="profile"]').click();
    await expect(page.locator('.hf-body')).toContainText('Cavalo do Tião disponível');
    await page.locator('[data-hf="offline"]').click();
    await page.locator('[data-hf-tab="home"]').click();
    await expect(page.locator('[data-hf="online"]')).toBeVisible();
    expect(errors).toEqual([]);
  }finally{await page.request.post('/api/auth/logout',{data:{}});}
});
