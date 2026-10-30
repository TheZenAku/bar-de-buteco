import {test,expect} from '@playwright/test';

const password='InventarioBrowser2026!';

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
  // While eating, a progress bar names it above the key prompts.
  await expect(page.locator('#consuming')).toContainText('Comendo');await expect(page.locator('#consuming')).toContainText('Coxinha');
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
