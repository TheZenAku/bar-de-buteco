import {test,expect,type Page} from '@playwright/test';

/** Touch play (docs/sistemas/toque.md): a phone on its side, the real game, fingers instead of keys. */
test.afterEach(async({page})=>{await page.request.post('/api/auth/logout').catch(()=>{});});

async function enter(page:Page):Promise<void>{
  const name=`touch_${Date.now().toString(36)}`;
  const response=await page.request.post('/api/auth/register',{data:{username:name,displayName:'Toque',email:`${name}@example.com`,password:'ToqueDedo2026!'}});
  expect(response.ok()).toBe(true);
  await page.goto('/');await page.getByRole('button',{name:'Entrar no bar'}).click();
  await expect(page.locator('#waiting')).toBeHidden({timeout:60_000});
  await expect.poll(()=>page.evaluate(()=>{const d=(window as any).barDebug.snapshot();return d.world?.players?.[d.localId]?.connected===true;}),{timeout:30_000}).toBe(true);
}
const me=(page:Page)=>page.evaluate(()=>{const d=(window as any).barDebug.snapshot(),p=d.world.players[d.localId];return {x:p.x as number,z:p.z as number};});
const yaw=(page:Page)=>page.evaluate(()=>(window as any).barDebug.camera().yaw as number);
const reach=(page:Page)=>page.evaluate(()=>(window as any).barDebug.camera().reach as number);
/** Real touch events through the browser's own input pipeline (page.touchscreen only taps). */
const sessions=new WeakMap<Page,Promise<import('@playwright/test').CDPSession>>();
async function fingers(page:Page,type:'touchStart'|'touchMove'|'touchEnd',points:Array<[number,number]>):Promise<void>{
  // One session for the whole gesture: the browser keeps the touch points in it.
  if(!sessions.has(page))sessions.set(page,page.context().newCDPSession(page));
  await (await sessions.get(page)!).send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y],id)=>({x,y,id}))});
}
async function tap(page:Page,selector:string):Promise<void>{
  const box=(await page.locator(selector).first().boundingBox())!;
  await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
}

test.describe('on a phone',()=>{
  test.use({hasTouch:true,isMobile:true,viewport:{width:844,height:390},deviceScaleFactor:2});

  test('the stick walks, a drag turns the view, a pinch zooms, and the buttons press the keys',async({page})=>{
    test.setTimeout(180_000);
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await enter(page);
    await expect(page.locator('html')).toHaveClass(/touch-ui/);
    await expect(page.locator('.tp')).toBeVisible();
    // The keyboard hotbar gives way to the buttons.
    await expect(page.locator('[data-panel="actions"]')).toBeHidden();

    // The stick: press low on the left, push up; the body walks, and stands still once the finger lifts.
    const from=await me(page);
    await fingers(page,'touchStart',[[170,300]]);
    await fingers(page,'touchMove',[[170,262]]);
    await expect.poll(async()=>{const now=await me(page);return Math.hypot(now.x-from.x,now.z-from.z);},{timeout:20_000}).toBeGreaterThan(1);
    await fingers(page,'touchEnd',[]);

    // One finger on the view looks around.
    const before=await yaw(page);
    await fingers(page,'touchStart',[[460,160]]);
    for(let step=1;step<=8;step++)await fingers(page,'touchMove',[[460+step*14,160]]);
    await fingers(page,'touchEnd',[]);
    await expect.poll(async()=>Math.abs((await yaw(page))-before),{timeout:10_000}).toBeGreaterThan(.3);

    // Two fingers spreading bring the view closer.
    const far=await reach(page);
    await fingers(page,'touchStart',[[400,200],[440,200]]);
    for(let step=1;step<=10;step++)await fingers(page,'touchMove',[[400-step*12,200],[440+step*12,200]]);
    await fingers(page,'touchEnd',[]);
    await expect.poll(()=>reach(page),{timeout:10_000}).toBeLessThan(far);

    // Papo: the chat opens with its box focused, as T does.
    await tap(page,'[data-tp="chat"]');
    await expect(page.locator('#chat-input')).toBeFocused();
    await page.keyboard.press('Escape');

    // Mais: the sheet, and a window it opens (the finger that chose it must not close it again by clicking the backdrop).
    await tap(page,'[data-tp="more"]');
    await expect(page.locator('[data-tp-sheet]')).toBeVisible();
    await tap(page,'[data-tile="bag"]');
    await expect(page.locator('#modal-title')).toHaveText('Mochila');
    await page.waitForTimeout(800);
    await expect(page.locator('#modal-title')).toHaveText('Mochila');
    // A window in front takes the controls away.
    await expect(page.locator('.tp')).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(page.locator('.tp')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('the phone opens big enough to use, and a finger can put it away (X, home bar, power button)',async({page})=>{
    test.setTimeout(150_000);
    await enter(page);
    const phone=page.locator('#phone');
    const open=async()=>{await tap(page,'[data-tp="more"]');await tap(page,'[data-tile="phone"]');await expect(phone).toHaveClass(/open/);await page.waitForTimeout(1000);};
    await open();
    // On its side the device is shorter, so it is bigger: its apps are readable and fit the screen.
    await expect(phone).toHaveClass(/compact/);
    const box=(await phone.boundingBox())!;
    expect(box.height).toBeGreaterThan(330);expect(box.y).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(390);
    // The X.
    await tap(page,'#phone .ph-x');
    await expect(phone).not.toHaveClass(/open/);
    await expect(page.locator('.tp')).toBeVisible();
    // The home bar closes it from the home screen (and goes home from an app).
    await open();
    await tap(page,'#phone .ph-home .ph-icon[data-app="calculadora"]');
    await expect(page.locator('#phone .ph-app-calculadora')).toBeVisible();
    await tap(page,'#phone [data-phone-home]');
    await expect(page.locator('#phone .ph-app-calculadora')).toHaveCount(0);
    await expect(phone).toHaveClass(/open/);
    await tap(page,'#phone [data-phone-home]');
    await expect(phone).not.toHaveClass(/open/);
    // The side power button.
    await open();
    await page.locator('#phone .ph-power').dispatchEvent('click');
    await expect(phone).not.toHaveClass(/open/);
  });

  test('the player can turn the controls off in Configurações',async({page})=>{
    test.setTimeout(120_000);
    await enter(page);
    await page.evaluate(()=>(document.querySelector('[data-action="settings"]') as HTMLElement).click());
    await page.locator('select[data-setting="touchUi"]').selectOption('off');
    await expect(page.locator('html')).not.toHaveClass(/touch-ui/);
    await page.keyboard.press('Escape');
    await expect(page.locator('.tp')).toBeHidden();
    await expect(page.locator('[data-panel="actions"]')).toBeVisible();
  });
});

test.describe('on a desktop',()=>{
  test.use({viewport:{width:1280,height:720}});
  test('nothing of the touch controls shows, and the keyboard still walks',async({page})=>{
    test.setTimeout(120_000);
    await enter(page);
    await expect(page.locator('html')).not.toHaveClass(/touch-ui/);
    await expect(page.locator('.tp')).toBeHidden();
    await expect(page.locator('[data-panel="actions"]')).toBeVisible();
    const from=await me(page);
    await page.keyboard.down('w');
    await expect.poll(async()=>{const now=await me(page);return Math.hypot(now.x-from.x,now.z-from.z);},{timeout:20_000}).toBeGreaterThan(1);
    await page.keyboard.up('w');
  });
});
