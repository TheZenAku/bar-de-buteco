import fs from 'node:fs';
import {test,expect,type Page} from '@playwright/test';
import {enterAsAdmin,spawnBikeOnStreet,orbit,selfOf} from './moto-helpers';

const SHOTS='test-results/moto-v4';
const moto=(page:Page)=>page.evaluate(()=>(window as any).barDebug.motos()[0]);
const distance=(a:number[],b:number[])=>Math.hypot(...a.map((v,i)=>v-b[i]!));
const shot=async(page:Page,name:string)=>{fs.mkdirSync(SHOTS,{recursive:true});await page.screenshot({path:`${SHOTS}/${name}.png`});};

test('v4: real server, keys, rider contacts, lamps and separate v3 bag in motion',async({page})=>{
  test.setTimeout(240_000);
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.setViewportSize({width:1440,height:900});
  await enterAsAdmin(page);
  const observations=[];
  for(const withBag of [false,true]){
    await spawnBikeOnStreet(page,{directPlacement:true});
    const parked=await moto(page);
    expect(parked.rig.bag).toBeNull();
    // Only the initial walking position is a fixture; spawn/mount/drive use the player controls.
    await page.evaluate(p=>(window as any).barDebug.send('test.player.place',{x:p[0]+.5,y:p[1],z:p[2]-.8,rotation:-Math.PI/2}),parked.position);
    await expect(page.locator('#context-label')).toHaveText('para subir');
    await page.keyboard.press('e');
    await expect.poll(async()=>(await selfOf(page)).animationState).toBe('ride');
    await page.waitForTimeout(1800);
    if(withBag){
      await page.evaluate(()=>(window as any).barDebug.motoBag('attach'));
      await expect.poll(async()=>(await moto(page)).rig.bag?.parent).toBe('ponto_bau');
      expect((await moto(page)).rig.bag.local).toEqual([0,0,0]);
    }
    const label=withBag?'com-bag':'sem-bag';
    // Use the player's far zoom so the dashboard does not hide the wheels/foot pegs.
    await page.mouse.move(720,300);await page.mouse.wheel(0,200);await page.mouse.wheel(0,200);
    await orbit(page,230);await page.waitForTimeout(600);
    await shot(page,`${label}-parada`);
    const pose=await moto(page);
    for(const [bone,point] of [['hand_l','ponto_mao_E'],['hand_r','ponto_mao_D'],['foot_l','ponto_pe_E'],['foot_r','ponto_pe_D']]){
      expect(distance(pose.rider[bone!],pose.points[point!]),`${label}: ${bone} touches ${point}`).toBeLessThan(.16);
    }
    if(withBag){
      await orbit(page,Math.PI/.006);await page.waitForTimeout(400);await shot(page,'com-bag-logo-outro-lado');
      await orbit(page,Math.PI/2/.006);await page.waitForTimeout(400);await shot(page,'com-bag-logo-atras');
      await page.evaluate(()=>(window as any).barDebug.motoBag('open'));
      await expect.poll(async()=>Math.abs((await moto(page)).rig.bag.tampa)).toBeGreaterThan(90);
      await shot(page,'com-bag-tampa-aberta');
      await page.evaluate(()=>(window as any).barDebug.motoBag('close'));
    }
    await page.keyboard.down('w');
    await expect.poll(async()=>(await moto(page)).speed,{intervals:[100]}).toBeGreaterThan(3);
    await page.keyboard.up('w');
    const moving=await moto(page);
    await shot(page,`${label}-andando`);
    const dx=moving.position[0]-pose.position[0],dz=moving.position[2]-pose.position[2];
    expect((dx*pose.front[0]+dz*pose.front[2])/Math.hypot(dx,dz)).toBeGreaterThan(.98);
    expect(moving.rig.rodas).toBeGreaterThanOrEqual(0);
    expect(Math.abs(moving.rig.topoRoda-Math.sin(moving.rig.rodas*Math.PI/180))).toBeLessThan(.1);
    await page.keyboard.down('Space');
    await expect.poll(async()=>(await moto(page)).speed,{intervals:[50]}).toBeLessThan(2.5);
    await page.keyboard.up('Space');
    await page.keyboard.down('d');await page.keyboard.down('w');
    await page.waitForTimeout(350);
    await page.keyboard.up('w');
    const turning=await moto(page);
    await shot(page,`${label}-direita`);
    await page.keyboard.up('d');await page.keyboard.up('w');
    expect(turning.rig.guidao).toBeGreaterThan(1);
    expect(turning.rig.inclinacao).toBeGreaterThan(1);
    expect(turning.up).toBeGreaterThan(.99);
    expect(turning.position[1]).toBeGreaterThanOrEqual(-.01);
    expect(Math.atan2(Math.sin(turning.yaw-moving.yaw),Math.cos(turning.yaw-moving.yaw))).toBeLessThan(-.02);
    await page.keyboard.down('Space');
    await expect.poll(async()=>Math.abs((await moto(page)).speed)).toBeLessThan(.1);
    await expect.poll(async()=>(await moto(page)).rig.luzes.Luz_Freio).toBeGreaterThan(0);
    expect((await moto(page)).rig.mergulho).toBeGreaterThan(.01);
    await shot(page,`${label}-freio`);
    await page.keyboard.up('Space');
    expect((await selfOf(page)).animationState).toBe('ride');
    expect((await moto(page)).rig.luzes.Luz_Farol).toBeGreaterThan(0);
    expect((await moto(page)).rig.luzes.Luz_Lanterna).toBeGreaterThan(0);
    await page.keyboard.press('z');
    await expect.poll(async()=>(await moto(page)).rig.luzes.Luz_Seta_E,{intervals:[80]}).toBeGreaterThan(0);
    await page.keyboard.press('c');
    await expect.poll(async()=>(await moto(page)).rig.luzes.Luz_Seta_D,{intervals:[80]}).toBeGreaterThan(0);
    await shot(page,`${label}-seta-direita`);
    await page.keyboard.press('c');
    observations.push({withBag,pose,moving,turning,final:await moto(page)});
    if(withBag){
      // Approach the buildings on the north side at walking speed, using real steering/throttle.
      // Repeated pushes against the same face must leave the rider upright and the hull outside it.
      const deadline=Date.now()+45_000,hits:number[]=[];let held='',pushes=0;
      while(Date.now()<deadline){
        const current=await moto(page),off=Math.atan2(Math.sin(Math.PI-current.yaw),Math.cos(Math.PI-current.yaw));
        const key=off>.08?'a':off<-.08?'d':'';
        if(key!==held){if(held)await page.keyboard.up(held);if(key)await page.keyboard.down(key);held=key;}
        if(Math.abs(current.speed)>2.3){await page.keyboard.up('w');await page.keyboard.down('Space');await page.waitForTimeout(70);await page.keyboard.up('Space');}
        else{await page.keyboard.down('w');await page.waitForTimeout(90);await page.keyboard.up('w');pushes++;}
        hits.push(Math.abs(current.speed));
        if(pushes>25&&Math.abs(off)<.2&&Math.max(...hits.slice(-10))<.3)break;
        await page.waitForTimeout(60);
      }
      if(held)await page.keyboard.up(held);await page.keyboard.up('w');
      expect(pushes).toBeGreaterThan(25);
      expect(Math.max(...hits.slice(-10)),'Repeated low-speed pushes are blocked').toBeLessThan(.3);
      expect((await selfOf(page)).animationState).toBe('ride');
      expect((await moto(page)).up).toBeGreaterThan(.99);
      await shot(page,'com-bag-parede');
      observations.push({wall:await moto(page),hits});
      await page.evaluate(()=>(window as any).barDebug.motoBag('remove'));
      expect((await moto(page)).rig.bag).toBeNull();
      await shot(page,'bag-removida');
    }
    await page.keyboard.press('e');
    await expect.poll(async()=>(await selfOf(page)).animationState).not.toBe('ride');
  }
  fs.writeFileSync(`${SHOTS}/observations.json`,JSON.stringify({observations,errors},null,2));
  expect(errors).toEqual([]);
});
