import {test,expect,type Page} from '@playwright/test';
import {fileURLToPath} from 'node:url';
import {previewPath} from './preview-path';

async function ready(page:Page){await expect(page.locator('#waiting')).toBeHidden({timeout:60000});await expect.poll(()=>page.evaluate(()=>{const d=(window as any).barDebug.snapshot();return d.world?.players?.[d.localId]?.connected===true;}),{timeout:30000}).toBe(true);}
async function enter(page:Page,prefix:string){
  const name=`${prefix}_${Date.now().toString(36)}`;
  const response=await page.request.post('/api/auth/register',{data:{username:name,displayName:prefix,email:`${name}@example.com`,password:'NovaInterface2026!'}});expect(response.ok()).toBe(true);
  const id=(await response.json()).user.id;
  await page.goto('/');await page.getByRole('button',{name:'Entrar no bar'}).click();await ready(page);return id;
}
test.beforeEach(async({request})=>{await expect.poll(async()=>{try{return (await request.get('/api/health')).ok()&&(await request.get('http://localhost:2677/health')).ok();}catch{return false;}},{timeout:30000}).toBe(true);});

test('nova UI persists panel positions, locks and visibility per account, handles broken storage and fits narrow screens',async({page})=>{
  test.setTimeout(180000);await page.setViewportSize({width:1440,height:900});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const id=await enter(page,'Layout');
  try{
    // Six panels, plus the job panel that only shows during a shift.
    await expect(page.locator('[data-panel]')).toHaveCount(7);await expect(page.locator('[data-panel="job"]')).toBeHidden();
    const wardrobe=await(await page.request.get('/api/wardrobe')).json();await expect(page.locator('#hud-balance')).toHaveText(wardrobe.balance.toLocaleString('pt-BR'));
    const panel=page.locator('[data-panel="status"]'),header=panel.locator('.panel-heading');const before=(await panel.boundingBox())!;
    const drag=async(dx:number,dy:number)=>{const box=(await header.boundingBox())!;await page.mouse.move(box.x+20,box.y+20);await page.mouse.down();await page.mouse.move(box.x+20+dx,box.y+20+dy,{steps:8});await page.mouse.up();};
    await drag(90,70);const moved=(await panel.boundingBox())!;expect(moved.x).toBeCloseTo(before.x+90,0);expect(moved.y).toBeCloseTo(before.y+70,0);
    await page.reload();await page.getByRole('button',{name:'Entrar no bar'}).click();await ready(page);
    expect((await panel.boundingBox())!.x).toBeCloseTo(moved.x,0);expect((await panel.boundingBox())!.y).toBeCloseTo(moved.y,0);
    await page.getByRole('button',{name:'Travar painéis',exact:true}).click();await drag(40,40);expect((await panel.boundingBox())!.x).toBeCloseTo(moved.x,0);
    await page.getByRole('button',{name:'Painéis',exact:true}).click();await page.locator('[data-hud-visible="chat"]').click();await expect(page.locator('[data-panel="chat"]')).toBeHidden();
    await page.locator('.boteco-logo').click();await page.getByRole('button',{name:/Resenhar/}).click();await expect(page.locator('#chat-input')).toBeFocused();await page.keyboard.press('Escape');
    await page.screenshot({path:previewPath('nova-ui-desktop.png')});
    for(const width of [960,760,640,390]){
      await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      for(const item of await page.locator('[data-panel]:visible').all()){const box=(await item.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);expect(box.y).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(844);}
    }
    await page.screenshot({path:previewPath('nova-ui-mobile.png')});
    await page.getByRole('button',{name:'Painéis',exact:true}).click();await page.locator('[data-hud-reset]').click();await expect(page.getByRole('button',{name:'Travar painéis',exact:true})).toBeVisible();
    await page.evaluate(id=>localStorage.setItem(`bar:nova-ui:hud:v1:${id}:desktop`,'{"panels":{"status":{"x":"broken"}}'),id);
    await page.setViewportSize({width:1440,height:900});await page.reload();await page.getByRole('button',{name:'Entrar no bar'}).click();await ready(page);await expect(page.locator('[data-panel="status"]')).toBeVisible();
    expect(errors).toEqual([]);
  }finally{await page.request.post('/api/auth/logout',{data:{}});}
});

test('real proximity messages appear safely in the chat only, and blocking hides them',async({page,browser})=>{
  test.setTimeout(180000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await enter(page,'Recados');await page.getByRole('button',{name:'Sua conta',exact:true}).click();
  const context=await browser.newContext({viewport:{width:640,height:480}}),other=await context.newPage();other.on('pageerror',e=>errors.push(e.message));
  try{
    const sender=await enter(other,'Vizinho');
    const send=async(text:string)=>{await other.getByRole('button',{name:/Resenhar/}).click();await other.getByLabel('Mensagem por proximidade').fill(text);await other.locator('#chat-form button').click();};
    const text='Oi <img src=x onerror="window.toastInjected=1">!';await send(text);
    // Chat lives in its panel: a message never becomes a notice.
    await expect(page.locator('#messages')).toContainText(text);await expect(page.locator('#messages img')).toHaveCount(0);expect(await page.evaluate(()=>(window as any).toastInjected)).toBeUndefined();
    await expect(page.locator('.comanda')).toHaveCount(0);
    await page.getByRole('button',{name:'Fechar janela'}).click();await page.getByRole('button',{name:'Pessoas no bar',exact:true}).click();await page.locator(`[data-action="block"][data-id="${sender}"]`).click();
    await page.getByRole('button',{name:'Fechar janela'}).click();for(const close of await page.locator('.comanda__close').all())await close.click();
    await send('Este recado está bloqueado');await expect(other.locator('#messages')).toContainText('Este recado está bloqueado');await expect(page.locator('#messages')).not.toContainText('Este recado está bloqueado');await expect(page.locator('#toasts')).not.toContainText('Este recado está bloqueado');
    await page.getByRole('button',{name:/Resenhar/}).click();await page.getByLabel('Mensagem por proximidade').fill('/velho');await page.locator('#chat-form button').click();await expect(page.locator('#messages')).toContainText('Bengala equipada');await expect(page.locator('.comanda')).toHaveCount(0);
    await page.screenshot({path:previewPath('nova-ui-toast.png')});expect(errors).toEqual([]);
  }finally{await Promise.allSettled([page.request.post('/api/auth/logout',{data:{}}),other.request.post('/api/auth/logout',{data:{}})]);await other.goto('about:blank').catch(()=>{});await context.close();}
});

test('comanda notices are bounded, deduplicated, dismissible and pause expiry during hover and keyboard focus',async({page})=>{
  const fixture=fileURLToPath(new URL('../fixtures/notifications.html',import.meta.url)).replaceAll('\\','/');await page.goto(`/@fs/${fixture}`);await page.waitForFunction(()=>(window as any).fixture);
  await page.evaluate(()=>{for(let i=0;i<6;i++)(window as any).fixture.show({title:`Recado ${i}`,duration:15000});});await expect(page.locator('.comanda')).toHaveCount(4);await expect(page.locator('.comanda').first()).toContainText('Recado 2');
  await page.evaluate(()=>{(window as any).fixture.clear();(window as any).fixture.show({title:'Pausado',duration:1000,id:'one'});(window as any).fixture.show({title:'Duplicado',id:'one'});});await expect(page.locator('.comanda')).toHaveCount(1);
  await page.locator('.comanda').dispatchEvent('pointerenter');await page.evaluate(()=>(window as any).fixture.advance(1200));await expect(page.locator('.comanda')).toBeVisible();await page.locator('.comanda').dispatchEvent('pointerleave');await page.evaluate(()=>(window as any).fixture.advance(1000));await expect(page.locator('.comanda')).toHaveCount(0);
  await page.evaluate(()=>(window as any).fixture.show({title:'Teclado',duration:1000}));await page.getByRole('button',{name:'Fechar aviso'}).focus();await page.evaluate(()=>(window as any).fixture.advance(1200));await expect(page.locator('.comanda')).toBeVisible();await page.locator('#outside').focus();await page.evaluate(()=>(window as any).fixture.advance(1000));await expect(page.locator('.comanda')).toHaveCount(0);
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>(window as any).fixture.show({variant:'aviso',title:'Erro real',text:'Tente novamente.',duration:15000}));await expect(page.getByRole('alert')).toContainText('Erro real');await page.getByRole('button',{name:'Fechar aviso'}).click();await expect(page.locator('.comanda')).toHaveCount(0);
});
