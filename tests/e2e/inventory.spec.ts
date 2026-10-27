import {test,expect} from '@playwright/test';
import {DEFAULT_CHARACTER} from '../../packages/shared/src/character';

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
  expect((await page.request.post('/api/character',{data:DEFAULT_CHARACTER})).ok()).toBe(true);

  await page.goto('/');
  await page.getByRole('button',{name:'Entrar no bar'}).click();
  await expect(page.locator('#game')).toBeVisible();
  await expect(page.locator('#waiting')).toBeHidden({timeout:60000});
  await expect.poll(()=>page.evaluate(()=>{const state=(window as any).barDebug.snapshot();return state.world?.players?.[state.localId]?.connected===true;}),{timeout:30000}).toBe(true);

  await page.keyboard.press('i');
  await expect(page.getByRole('heading',{name:'Mochila',exact:true})).toBeVisible();
  await expect(page.locator('.inventory-summary')).toContainText('3 / 12 pilhas');
  await expect(page.locator('.item-card')).toHaveCount(3);
  const soda=page.locator('.shop-item').filter({hasText:'Refrigerante'});
  await soda.getByRole('button',{name:'Comprar'}).click();
  // Purchases, use and discards show up in the backpack itself, without a notice.
  await expect(page.locator('.item-card').filter({hasText:'Refrigerante'})).toContainText('×1');
  await expect(page.locator('#toasts')).toBeEmpty();

  await page.locator('.item-card').filter({hasText:'Coxinha'}).getByRole('button',{name:'Usar'}).click();
  await page.keyboard.press('i');
  await expect(page.locator('.item-card').filter({hasText:'Coxinha'})).toHaveCount(0);
  // The backpack only changes once the character has finished eating.
  await expect.poll(()=>page.evaluate(()=>{const state=(window as any).barDebug.snapshot();return state.world.players[state.localId].interactionState;}),{timeout:20000}).toBe('');
  await page.locator('.item-card').filter({hasText:'Água mineral'}).getByRole('button',{name:'Descartar'}).click();
  await page.getByRole('button',{name:'Descartar 1'}).click();
  await page.keyboard.press('i');
  await expect(page.locator('.item-card').filter({hasText:'Água mineral'})).toContainText('×1');
});
