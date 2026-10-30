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

test('nova UI lays out logo, wallet, chat, hotbar and meters, persists panel positions, locks and visibility per account, handles broken storage and fits narrow screens',async({page})=>{
  test.setTimeout(180000);await page.setViewportSize({width:1440,height:900});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const id=await enter(page,'Layout');
  try{
    // The hotbar and the chat, plus the job panel that only shows during a shift. The player's state is not a panel: five
    // meters (drunkenness only when drunk) in the bottom-right corner. The occupancy is in the people window.
    await expect(page.locator('[data-panel]')).toHaveCount(3);await expect(page.locator('[data-panel="job"]')).toBeHidden();
    await expect(page.locator('.status-hud .need:visible')).toHaveCount(5);await expect(page.locator('#hud-activity')).toHaveCount(0);
    const corner=(await page.locator('.status-hud').boundingBox())!;
    expect(corner.x+corner.width).toBeCloseTo(1440-16,0);expect(corner.y+corner.height).toBeCloseTo(900-16,0);
    // Top left: the logo and the chat under it. Top right: the toolbar and, last, the wallet. No key hints, mailbox,
    // account badge or connection chip over the game: the connection and the account are in the people window.
    const logo=(await page.locator('.boteco-logo img').boundingBox())!,wallet=(await page.locator('.game-header .hud-wallet').boundingBox())!,chat=(await page.locator('[data-panel="chat"]').boundingBox())!;
    expect(await page.locator('.boteco-logo img').evaluate(img=>(img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    expect(logo.x).toBeLessThan(30);expect(logo.height).toBeLessThanOrEqual(60);expect(wallet.x+wallet.width).toBeCloseTo(1440-16,0);expect(wallet.y).toBeLessThan(20);
    expect(chat.x).toBeLessThan(30);expect(chat.y).toBeGreaterThan(logo.y+logo.height);expect(chat.y).toBeLessThan(120);
    await expect(page.locator('.player-badge,.net-status,#hud-status')).toHaveCount(0);
    await expect(page.locator('.world-hint')).toHaveCount(0);await expect(page.locator('.dev-mail')).toBeHidden();
    // The actions are a one-row hotbar at the bottom centre: names show on hover.
    const hotbar=(await page.locator('[data-panel="actions"]').boundingBox())!;
    expect(hotbar.height).toBeLessThan(60);expect(hotbar.y+hotbar.height).toBeCloseTo(900-12,0);expect(Math.abs(hotbar.x+hotbar.width/2-720)).toBeLessThan(2);
    await page.locator('[data-action="dance"]').hover();await expect(page.locator('[data-action="dance"] .tip')).toHaveCSS('opacity','1');
    await expect(page.locator('#occupancy')).toHaveCount(0);
    await page.getByRole('button',{name:'Pessoas no bar',exact:true}).click();await expect(page.locator('#occupancy')).toHaveText(/^\d+ \/ 32$/);await expect(page.locator('#hud-status')).toHaveText('Na área!');
    await page.getByRole('tab',{name:'Seu lugar no bar'}).click();await expect(page.locator('#hud-name')).toHaveText('Layout');await expect(page.locator('#occupancy')).toHaveCount(0);
    await page.getByRole('button',{name:'Fechar janela'}).click();
    const wardrobe=await(await page.request.get('/api/wardrobe')).json();await expect(page.locator('#hud-balance')).toHaveText(wardrobe.balance.toLocaleString('pt-BR'));
    const panel=page.locator('[data-panel="chat"]'),header=panel.locator('.panel-heading');const before=(await panel.boundingBox())!;
    const drag=async(dx:number,dy:number)=>{const box=(await header.boundingBox())!;await page.mouse.move(box.x+20,box.y+20);await page.mouse.down();await page.mouse.move(box.x+20+dx,box.y+20+dy,{steps:8});await page.mouse.up();};
    await drag(90,70);const moved=(await panel.boundingBox())!;expect(moved.x).toBeCloseTo(before.x+90,0);expect(moved.y).toBeCloseTo(before.y+70,0);
    await page.reload();await page.getByRole('button',{name:'Entrar no bar'}).click();await ready(page);
    expect((await panel.boundingBox())!.x).toBeCloseTo(moved.x,0);expect((await panel.boundingBox())!.y).toBeCloseTo(moved.y,0);
    await expect(page.locator('.game-tools [data-hud-lock]')).toHaveCount(0);
    await page.getByRole('button',{name:'Painéis',exact:true}).click();await page.getByRole('button',{name:'Travar painéis',exact:true}).click();
    await expect(page.locator('#panel-menu [data-hud-lock]')).toHaveAttribute('aria-pressed','true');await page.keyboard.press('Escape');await drag(40,40);expect((await panel.boundingBox())!.x).toBeCloseTo(moved.x,0);
    await page.getByRole('button',{name:'Painéis',exact:true}).click();await page.locator('[data-hud-visible="chat"]').click();await expect(page.locator('[data-panel="chat"]')).toBeHidden();
    await page.locator('.boteco-logo').click();await page.getByRole('button',{name:/Resenhar/}).click();await expect(page.locator('#chat-input')).toBeFocused();await page.keyboard.press('Escape');
    await page.screenshot({path:previewPath('nova-ui-desktop.png')});
    for(const width of [960,760,640,390]){
      // Two frames: the page has handled the resize (and laid the panels out again) before anything is measured.
      await page.setViewportSize({width,height:844});await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      // Each width range's default layout leaves the corner meters uncovered.
      const meters=(await page.locator('.status-hud').boundingBox())!;
      for(const item of await page.locator('[data-panel]:visible').all()){const box=(await item.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);expect(box.y).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(844);
        expect(box.x>=meters.x+meters.width||box.x+box.width<=meters.x||box.y>=meters.y+meters.height||box.y+box.height<=meters.y,`a panel covers the meters at ${width}px`).toBe(true);}
    }
    await page.screenshot({path:previewPath('nova-ui-mobile.png')});
    await page.getByRole('button',{name:'Painéis',exact:true}).click();await page.locator('[data-hud-reset]').click();await expect(page.locator('#panel-menu [data-hud-lock]')).toHaveAttribute('aria-pressed','false');
    await page.evaluate(id=>localStorage.setItem(`bar:nova-ui:hud:v2:${id}:desktop`,'{"panels":{"chat":{"x":"broken"}}'),id);
    await page.setViewportSize({width:1440,height:900});await page.reload();await page.getByRole('button',{name:'Entrar no bar'}).click();await ready(page);await expect(page.locator('[data-panel="chat"]')).toBeVisible();await expect(page.locator('.status-hud')).toBeVisible();
    expect(errors).toEqual([]);
  }finally{await page.request.post('/api/auth/logout',{data:{}});}
});

test('real proximity messages appear safely in the chat only, and blocking hides them',async({page,browser})=>{
  test.setTimeout(180000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await enter(page,'Recados');await page.getByRole('button',{name:'Pessoas no bar',exact:true}).click();await page.getByRole('tab',{name:'Seu lugar no bar'}).click();
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

test('the entry shows the Highland logo as a live sign beside the menu, toasts on a click and keeps it above the menu on narrow screens',async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('img',{name:'Logo do Highland Bar'})).toBeVisible();
  await expect.poll(()=>page.locator('.hero-logo img').evaluate(img=>(img as HTMLImageElement).naturalWidth)).toBe(720);
  await expect(page.locator('.lobby-bubbles i')).toHaveCount(22);await expect(page.locator('.hero-eq i')).toHaveCount(18);
  // Wide: beside the menu. After the entrance it is a 480 px sign.
  await page.waitForTimeout(1300);
  const logo=(await page.locator('.hero-logo').boundingBox())!,menu=(await page.locator('.menu-section').boundingBox())!;
  expect(logo.x).toBeGreaterThan(menu.x+menu.width);expect(Math.round(logo.width)).toBe(480);
  await page.screenshot({path:previewPath('nova-ui-lobby.png')});
  // A click is a toast: the cheer and a burst that clears itself; quick clicks keep the round going.
  await page.locator('.hero-logo').click();await expect(page.locator('.hero-cheer')).toHaveText('Saúde!');
  await page.locator('.hero-logo').click();await page.locator('.hero-logo').click();await expect(page.locator('.hero-cheer')).toHaveText('Mais uma! ×3');
  await expect(page.locator('.hero-burst > *')).toHaveCount(0,{timeout:3000});
  // Narrow: between the title and the tabs, without a horizontal scroll.
  for(const width of [1100,760,390]){
    await page.setViewportSize({width,height:844});await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
    expect(await page.evaluate(()=>document.querySelector('#lobby')!.scrollWidth<=innerWidth)).toBe(true);
    const sign=(await page.locator('.hero-logo').boundingBox())!,title=(await page.locator('.menu-title').boundingBox())!,tabs=(await page.locator('.menu-tabs').boundingBox())!;
    expect(sign.y).toBeGreaterThan(title.y+title.height);expect(sign.y+sign.height).toBeLessThan(tabs.y);
  }
  // Without motion the click still toasts, and nothing is left behind.
  await page.emulateMedia({reducedMotion:'reduce'});await page.locator('.hero-logo').click();await expect(page.locator('.hero-cheer')).toBeVisible();
  await expect(page.locator('.hero-burst > *')).toHaveCount(0,{timeout:3000});
  expect(errors).toEqual([]);
});

test.describe('full screen',()=>{
  // A screen larger than the window, as in a normal browser window. Playwright's setViewportSize makes the screen the
  // window's size, which is what the browser's own full screen (F11) looks like to the page.
  test.use({viewport:{width:1600,height:860},screen:{width:2560,height:1440}});
  test('Painéis opens and leaves full screen, and the scene and the panels follow the window into full screen and back',async({page})=>{
    test.setTimeout(180000);
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await enter(page,'Telao');
    const box=async(selector:string)=>(await page.locator(selector).boundingBox())!;
    const settle=()=>page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
    // Painéis → Tela cheia puts the whole page in full screen, and the same row leaves it.
    const menu=page.getByRole('button',{name:'Painéis',exact:true}),row=page.locator('#panel-menu [data-fullscreen]');
    await menu.click();await expect(row).toHaveAttribute('aria-pressed','false');await expect(row).toHaveText('Tela cheia');
    await row.click();
    await expect.poll(()=>page.evaluate(()=>document.fullscreenElement?.tagName)).toBe('HTML');
    await expect(row).toHaveAttribute('aria-pressed','true');await expect(row).toHaveText('Sair da tela cheia');
    await row.click();
    await expect.poll(()=>page.evaluate(()=>document.fullscreenElement?.tagName??'none')).toBe('none');
    await expect(row).toHaveAttribute('aria-pressed','false');await page.keyboard.press('Escape');
    // Moved near the right side, the chat keeps its distance from that side.
    const start=await box('[data-panel="chat"] .panel-heading');
    await page.mouse.move(start.x+40,start.y+15);await page.mouse.down();await page.mouse.move(start.x+40+1100,start.y+15+60,{steps:8});await page.mouse.up();await settle();
    const chat=await box('[data-panel="chat"]'),gap=1600-(chat.x+chat.width);
    expect(gap).toBeGreaterThan(8);expect(gap).toBeLessThan(400);
    // The window grows as with F11, shrinks to a laptop's and grows again: the scene always fills it, the hotbar stays
    // centred 12 px over the bottom, and the chat keeps its gap to the right side and its height from the top.
    for(const [width,height] of [[1920,1080],[1366,768],[1920,1080]] as const){
      await page.setViewportSize({width,height});await settle();
      const world=await box('#world');expect([world.x,world.y,world.width,world.height]).toEqual([0,0,width,height]);
      expect(await page.locator('#world').evaluate((canvas:HTMLCanvasElement)=>canvas.height/canvas.width)).toBeCloseTo(height/width,2);
      const hotbar=await box('[data-panel="actions"]');
      expect(hotbar.y+hotbar.height).toBeCloseTo(height-12,0);expect(Math.abs(hotbar.x+hotbar.width/2-width/2)).toBeLessThan(2);
      const moved=await box('[data-panel="chat"]');expect(width-(moved.x+moved.width)).toBeCloseTo(gap,0);expect(moved.y).toBeCloseTo(chat.y,0);
    }
    // Now the window is the screen, as in the browser's full screen: the row says so, and a page cannot leave it.
    await menu.click();await expect(row).toHaveAttribute('aria-pressed','true');await expect(row).toHaveText('Sair da tela cheia');
    await row.click();await expect(page.locator('.comanda')).toContainText('aperte F11');
    expect(await page.evaluate(()=>document.fullscreenElement)).toBeNull();
    expect(errors).toEqual([]);
  });
});
