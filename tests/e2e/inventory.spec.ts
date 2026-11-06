import {test,expect} from '@playwright/test';
const SHOP_SPOT={x:18.79,y:.3,z:-15.45};

const password='InventarioBrowser2026!';

test('rojão da loja equipa na mão, dispara com a mira e guarda sem gastar',async({page})=>{
  test.setTimeout(150000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&/shader|firework/i.test(message.text()))errors.push(message.text());});
  const suffix=`firework_${Date.now().toString(36)}`;
  const registered=await page.request.post('/api/auth/register',{data:{email:`${suffix}@example.com`,username:suffix,displayName:'Festeiro',password}});expect(registered.ok()).toBe(true);
  await page.goto('/');await page.getByRole('button',{name:'Entrar no bar'}).click();
  await expect(page.locator('#waiting')).toBeHidden({timeout:60000});
  await expect.poll(()=>page.evaluate(()=>{const s=(window as any).barDebug?.snapshot();return !!s?.world?.players?.[s.localId]?.connected;}),{timeout:30000}).toBe(true);
  await page.evaluate(at=>(window as any).barDebug.send('test.player.place',at),SHOP_SPOT);
  await expect.poll(()=>page.evaluate(()=>{const s=(window as any).barDebug.snapshot();return s.world.players[s.localId].x;})).toBeCloseTo(SHOP_SPOT.x,1);
  await page.keyboard.press('e');await expect(page.getByRole('heading',{name:'Loja da casa',exact:true})).toBeVisible();
  const card=page.locator('.shop-item').filter({hasText:'Rojão de festa'});
  await expect.poll(()=>card.locator('img').evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBeGreaterThan(0);
  const purchase=()=>page.waitForResponse(r=>r.url().endsWith('/inventory/buy')&&r.request().method()==='POST');
  let bought=purchase();await card.getByRole('button',{name:'Comprar',exact:true}).click();expect((await bought).ok()).toBe(true);
  await expect(card.getByRole('button',{name:'Comprar',exact:true})).toBeEnabled();
  bought=purchase();await card.getByRole('button',{name:'Comprar',exact:true}).click();expect((await bought).ok()).toBe(true);
  await page.keyboard.press('Escape');await page.keyboard.press('i');
  const slot=page.locator('.inventory-slot[data-item="rojao"]');await slot.click();await expect(page.locator('.item-detail')).toContainText('×2');
  await page.getByRole('button',{name:'Equipar na mão',exact:true}).click();
  const hud=page.getByRole('region',{name:'Rojão equipado'});
  await expect(hud).toBeVisible();await expect(page.locator('#firework-count')).toHaveText('2');
  await expect.poll(()=>page.evaluate(()=>(window as any).barDebug.fireworks()?.equipped)).toBe(true);
  await page.keyboard.press('r');await expect(hud).toBeHidden();
  let view=await (await page.request.get('/api/inventory')).json();expect(view.stacks.find((s:any)=>s.itemId==='rojao').quantity).toBe(2);
  await page.keyboard.press('i');await slot.click();await page.getByRole('button',{name:'Equipar na mão',exact:true}).click();await expect(hud).toBeVisible();
  // Aim from the open yard, away from the shop's canopy, and lift the view towards the sky.
  await page.evaluate(()=>(window as any).barDebug.send('test.player.place',{x:22,y:.3,z:-16}));
  await page.locator('#world').hover({position:{x:500,y:250}});
  await page.mouse.down({button:'right'});await page.mouse.move(500,50,{steps:12});await page.mouse.up({button:'right'});
  await page.waitForTimeout(800);
  await page.screenshot({path:'test-results/fireworks-equipped.png'});
  await hud.getByRole('button',{name:'Soltar',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).barDebug.fireworks()?.showing)).toBe(1);
  await expect(page.locator('#firework-count')).toHaveText('1');
  await page.waitForTimeout(2500);await page.screenshot({path:'test-results/fireworks.png'});
  await expect.poll(()=>page.evaluate(()=>(window as any).barDebug.fireworks()?.showing),{timeout:10000}).toBe(0);
  // A simple left click on the view fires; dragging it to aim must not fire.
  const canvas=page.locator('#world'),box=(await canvas.boundingBox())!;
  await page.mouse.move(box.x+box.width*.6,box.y+box.height*.4);await page.mouse.down();await page.mouse.move(box.x+box.width*.6+60,box.y+box.height*.4,{steps:5});await page.mouse.up();
  view=await (await page.request.get('/api/inventory')).json();expect(view.stacks.find((s:any)=>s.itemId==='rojao').quantity).toBe(1);
  await canvas.click({position:{x:box.width*.6,y:box.height*.4}});await expect(hud).toBeHidden();
  await expect.poll(async()=>{const v=await (await page.request.get('/api/inventory')).json();return v.stacks.some((s:any)=>s.itemId==='rojao');}).toBe(false);
  expect(errors).toEqual([]);
});

test.beforeEach(async({request})=>{
  await expect.poll(async()=>{
    try{return (await request.get('/api/health')).ok()&&(await request.get(process.env.PLAYWRIGHT_GAME_HEALTH_URL||'http://localhost:2567/health')).ok();}catch{return false;}
  },{timeout:30000}).toBe(true);
});

test('mochila compra, usa e descarta itens com estado persistido',async({page})=>{
  test.setTimeout(120000);
  const suffix=`bag_${Date.now().toString(36)}`;
  const registered=await page.request.post('/api/auth/register',{data:{email:`${suffix}@example.com`,username:suffix,displayName:'Mochileiro',password}});
  expect(registered.ok()).toBe(true);

  await page.goto('/');
  await page.getByRole('button',{name:'Entrar no bar'}).click();
  await expect(page.locator('#game')).toBeVisible();
  await expect(page.locator('#waiting')).toBeHidden({timeout:60000});
  await expect.poll(()=>page.evaluate(()=>{const state=(window as any).barDebug.snapshot();return state.world?.players?.[state.localId]?.connected===true;}),{timeout:30000}).toBe(true);

  await page.keyboard.press('i');
  await expect(page.getByRole('heading',{name:'Mochila',exact:true})).toBeVisible();
  await expect(page.locator('.inventory-summary')).toContainText('3 / 12 pilhas');
  // Slots like a game's inventory (the starter kit and the empty rest) and the chosen item's card; no shop in the backpack.
  const slot=(id:string)=>page.locator(`.inventory-slot[data-item="${id}"]`),detail=page.locator('.item-detail');
  await expect(page.locator('.inventory-slot')).toHaveCount(12);await expect(page.locator('button.inventory-slot')).toHaveCount(3);
  await expect(page.locator('.shop-item')).toHaveCount(0);await expect(page.getByRole('heading',{name:'Venda da casa'})).toHaveCount(0);
  // The house's shop is out of the backpack, kept for the selling points to come: its API still sells.
  const bought=await page.request.post('/api/inventory/buy',{data:{itemId:'refrigerante',quantity:1,requestId:crypto.randomUUID()}});expect(bought.ok()).toBe(true);
  await page.keyboard.press('i');await page.keyboard.press('i');
  // Purchases, use and discards show up in the backpack itself, without a notice.
  await slot('refrigerante').click();await expect(slot('refrigerante')).toHaveAttribute('aria-pressed','true');
  await expect(detail).toContainText('Refrigerante');await expect(detail).toContainText('×1');await expect(detail).toContainText('dura 2:30');
  await expect(page.locator('#toasts')).toBeEmpty();

  await slot('coxinha').click();await detail.getByRole('button',{name:'Usar'}).click();
  // While eating, its tile (named by its label) drains above the key prompts.
  await expect(page.locator('#consuming').getByRole('progressbar',{name:'Comendo Coxinha'})).toBeVisible();
  await page.keyboard.press('i');
  await expect(slot('coxinha')).toHaveCount(0);
  // The snack is in hand, had over the table's time, and the player is free meanwhile; one thing at a time, so the
  // backpack's drinks and snacks wait (the bandage does not), and the card says why.
  expect(await page.evaluate(()=>{const state=(window as any).barDebug.snapshot(),me=state.world.players[state.localId];return [me.holding,me.interactionState];})).toEqual(['coxinha','']);
  await slot('agua').click();await expect(detail.getByRole('button',{name:'Usar'})).toBeDisabled();await expect(detail).toContainText('Ainda na mão: Coxinha');
  await slot('curativo').click();await expect(detail.getByRole('button',{name:'Usar'})).toBeEnabled();
  await slot('agua').click();await detail.getByRole('button',{name:'Descartar'}).click();
  await page.getByRole('button',{name:'Descartar 1'}).click();
  await page.keyboard.press('i');
  await slot('agua').click();await expect(detail).toContainText('×1');
});
