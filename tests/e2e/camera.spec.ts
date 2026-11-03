import {test,expect,type Page} from '@playwright/test';
import {previewPath} from './preview-path';

interface CameraState {mode:'first'|'third';distance:number;reach:number;boom:number;pitch:number;position:number[]}
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
