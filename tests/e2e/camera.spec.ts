import {test,expect,type Page} from '@playwright/test';
import {previewPath} from './preview-path';
import {wearCard} from './collection-helpers';
import {aimCamera} from './camera-helpers';

interface CameraState {mode:'first'|'third';distance:number;reach:number;boom:number;yaw:number;pitch:number;position:number[]}
const camera=(page:Page):Promise<CameraState>=>page.evaluate(()=>(window as any).barDebug.camera());
const saved=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('bar:settings:v1')!));

async function ready(page:Page):Promise<void>{
  await expect(page.locator('#game')).toBeVisible();
  await expect(page.locator('#waiting')).toBeHidden({timeout:60000});
  await expect.poll(()=>page.evaluate(()=>{const state=(window as any).barDebug?.snapshot();return state?.world?.players?.[state.localId]?.connected===true;}),{timeout:30000}).toBe(true);
}

test.beforeEach(async({request})=>{
  await expect.poll(async()=>{try{return (await request.get('/api/health')).ok()&&(await request.get('http://localhost:2677/health')).ok();}catch{return false;}},{timeout:30000}).toBe(true);
});

test('only the head follows the camera, the body still follows travel, and the updated Tiao works',async({page})=>{
  test.setTimeout(180000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const username=`head_${Date.now().toString(36)}`;
  const response=await page.request.post('/api/auth/register',{data:{username,displayName:'Cabeca',email:`${username}@example.com`,password:'CameraLivre2026!'}});
  expect(response.ok()).toBe(true);
  await page.goto('/');await page.getByRole('button',{name:'Entrar no bar'}).click();await ready(page);
  const state=()=>page.evaluate(()=>{
    const debug=(window as any).barDebug,{world,localId}=debug.snapshot(),self=world.players[localId];
    const drawn=debug.animations().find((actor:{id:string})=>actor.id===localId);
    return {x:self.x,z:self.z,body:self.rotation,headYaw:self.headYaw,headPitch:self.headPitch,drawn};
  });
  const aim=(yaw:number,pitch:number)=>aimCamera(page,yaw,pitch);
  // Walking inputs can still be awaiting the room after a released key. Check stationary poses only after its stop.
  const stopped=()=>expect.poll(()=>page.evaluate(()=>{
    const debug=(window as any).barDebug,{world,localId}=debug.snapshot();
    return world.players[localId].animationState==='idle'&&debug.network().pending===0;
  })).toBe(true);
  try{
    for(const skin of ['nathan','tiao']){
      if(skin==='tiao')await wearCard(page,skin);
      await expect.poll(async()=>(await state()).drawn?.skin).toBe(skin);
      for(const mode of ['third','first'] as const){
        if((await camera(page)).mode!==mode)await page.keyboard.press('q');
        await stopped();
        const start=await state(),yaw=start.body-Math.PI;
        await aim(yaw+.5,.3);
        await expect.poll(async()=>{const s=await state();return Math.max(Math.abs(s.headYaw-.5),Math.abs(s.headPitch-.3),Math.abs(s.drawn.look.yaw-.5),Math.abs(s.drawn.look.pitch-.3));}).toBeLessThan(.03);
        const looked=await state();
        expect(looked.body).toBe(start.body);expect(looked.x).toBe(start.x);expect(looked.z).toBe(start.z);
        expect(Math.abs(looked.drawn.facing-start.body)).toBeLessThan(.01);
        await aim(yaw-.5,-.3);
        await expect.poll(async()=>{const s=await state();return Math.max(Math.abs(s.headYaw+.5),Math.abs(s.headPitch+.3),Math.abs(s.drawn.look.yaw+.5),Math.abs(s.drawn.look.pitch+.3));}).toBeLessThan(.03);
        const other=await state();
        expect(other.body).toBe(start.body);expect(other.x).toBe(start.x);expect(other.z).toBe(start.z);
        expect(Math.abs(other.drawn.facing-start.body)).toBeLessThan(.01);
        const dot=other.drawn.look.bone.reduce((sum:number,value:number,i:number)=>sum+value*looked.drawn.look.bone[i],0);
        expect(Math.abs(dot),'The actual head bone changed, rather than only telemetry').toBeLessThan(.98);
        // Multiple complete camera turns must never rotate or move the body, in either view.
        for(const turns of [-1,2]){
          await aim(yaw+.5+turns*2*Math.PI,.3);
          await expect.poll(async()=>{const s=await state();return Math.max(Math.abs(s.headYaw-.5),Math.abs(s.drawn.look.yaw-.5));}).toBeLessThan(.03);
          const turned=await state();
          expect(turned.body).toBe(start.body);expect(turned.x).toBe(start.x);expect(turned.z).toBe(start.z);
          expect(Math.abs(turned.drawn.facing-start.body)).toBeLessThan(.01);
        }
      }
      const yaw=(await camera(page)).yaw;
      await page.keyboard.press('d',{delay:250});
      await stopped();
      await expect.poll(async()=>{const body=(await state()).body;return Math.abs(Math.atan2(Math.sin(body-(Math.PI/2+yaw)),Math.cos(body-(Math.PI/2+yaw))));}).toBeLessThan(.03);
      if((await camera(page)).mode!=='third')await page.keyboard.press('q');
    }
    await page.screenshot({path:previewPath('head-look-tiao.png')});
    expect(errors).toEqual([]);
  }finally{await page.request.post('/api/auth/logout',{data:{}});}
});

test('camera steps between three zooms, rotates, restores preferences and changes views silently',async({page})=>{
  test.setTimeout(180000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const username=`camera_${Date.now().toString(36)}`;
  const response=await page.request.post('/api/auth/register',{data:{username,displayName:'Lente',email:`${username}@example.com`,password:'CameraLivre2026!'}});
  expect(response.ok()).toBe(true);
  await page.goto('/');await page.getByRole('button',{name:'Entrar no bar'}).click();await ready(page);
  try{
    // Record transient notices too: a camera toast must never appear and then expire unnoticed.
    await page.evaluate(()=>{
      (window as any).cameraNotices=[];
      new MutationObserver(()=>{for(const notice of document.querySelectorAll('.comanda'))if(notice.textContent?.includes('Câmera'))(window as any).cameraNotices.push(notice.textContent);})
        .observe(document.querySelector('#toasts')!,{childList:true,subtree:true,characterData:true});
    });
    await page.getByRole('button',{name:'Configurações',exact:true}).click();
    const distance=page.locator('[data-setting="cameraDistance"]'),mode=page.locator('[data-setting="camera"]');
    await expect(mode.locator('option')).toHaveCount(2);
    await expect(distance.locator('option')).toHaveText(['Perto','Médio','Longe']);
    await distance.selectOption('2.5');
    await expect.poll(()=>camera(page)).toMatchObject({mode:'third',distance:2.5,reach:2.5});
    await expect.poll(()=>saved(page)).toMatchObject({camera:'third',cameraDistance:2.5});
    await page.screenshot({path:previewPath('camera-settings.png')});

    await mode.selectOption('first');
    await expect.poll(()=>camera(page)).toMatchObject({mode:'first',distance:0,reach:2.5});
    await expect.poll(()=>saved(page)).toMatchObject({camera:'first',cameraDistance:2.5});
    await mode.selectOption('third');await expect(distance).toHaveValue('2.5');
    await page.keyboard.press('Escape');

    const canvas=page.locator('#world');
    await canvas.dispatchEvent('wheel',{deltaY:100,deltaMode:0});
    expect((await camera(page)).distance).toBe(4.2);
    await canvas.dispatchEvent('wheel',{deltaY:100,deltaMode:0});
    expect((await camera(page)).distance).toBe(6.5);
    await canvas.dispatchEvent('wheel',{deltaY:100,deltaMode:0});
    expect((await camera(page)).distance,'Longe is the limit').toBe(6.5);
    await expect.poll(()=>saved(page)).toMatchObject({camera:'third',cameraDistance:6.5});
    const chosen=6.5;

    await page.keyboard.press('q');
    await expect.poll(()=>camera(page)).toMatchObject({mode:'first',distance:0,reach:chosen});
    await page.keyboard.press('q');
    await expect.poll(()=>camera(page)).toMatchObject({mode:'third',distance:chosen,reach:chosen});

    // Start a real pointer capture, then send a large vertical movement through the canvas event handler.
    const point=await page.evaluate(()=>{
      for(const x of [.5,.65,.8])for(const y of [.45,.6,.75])if(document.elementFromPoint(innerWidth*x,innerHeight*y)?.id==='world')return {x:innerWidth*x,y:innerHeight*y};
      throw new Error('No unobscured canvas point for the camera drag');
    });
    await page.mouse.move(point.x,point.y);await page.mouse.down({button:'right'});
    await canvas.dispatchEvent('pointermove',{movementX:0,movementY:1500,buttons:2,pointerId:1,pointerType:'mouse'});
    await page.mouse.up({button:'right'});
    // Third person stops short of the pole, however far the mouse goes.
    await expect.poll(async()=>(await camera(page)).pitch).toBeCloseTo(1.35,1);
    expect((await camera(page)).position.every(Number.isFinite)).toBe(true);

    await expect(page.locator('.comanda').filter({hasText:'Câmera'})).toHaveCount(0);
    expect(await page.evaluate(()=>(window as any).cameraNotices)).toEqual([]);
    await page.reload();await page.getByRole('button',{name:'Entrar no bar'}).click();await ready(page);
    await expect.poll(()=>camera(page)).toMatchObject({mode:'third',distance:chosen,reach:chosen});
    await page.getByRole('button',{name:'Configurações',exact:true}).click();
    await expect(page.locator('[data-setting="cameraDistance"]')).toHaveValue(String(chosen));
    expect(errors).toEqual([]);
  }finally{await page.request.post('/api/auth/logout',{data:{}});}
});
