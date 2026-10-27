import {test,expect,type Page} from '@playwright/test';
import {DEFAULT_CHARACTER} from '../../packages/shared/src/character';

const password='EconomiaBrowser2026!';
test.beforeEach(async({request})=>{
  await expect.poll(async()=>{try{return (await request.get('/api/health')).ok()&&(await request.get(process.env.PLAYWRIGHT_GAME_HEALTH_URL||'http://localhost:2677/health')).ok();}catch{return false;}},{timeout:30000}).toBe(true);
});
async function enter(page:Page){
  const unique=Date.now().toString(36);
  expect((await page.request.post('/api/auth/register',{data:{username:`eco_${unique}`,email:`eco_${unique}@example.com`,displayName:'Economia',password}})).status()).toBe(201);
  expect((await page.request.post('/api/character',{data:DEFAULT_CHARACTER})).ok()).toBe(true);
  await page.goto('/');await page.getByRole('button',{name:'Entrar no bar'}).click();
  await expect(page.locator('#waiting')).toBeHidden({timeout:60000});
  await expect.poll(()=>page.evaluate(()=>{const d=(window as any).barDebug.snapshot();return d.world?.players?.[d.localId]?.connected;})).toBe(true);
}

test('jobs, the table menu and the graphics options are wired to the live room and the scene',async({page})=>{
  test.setTimeout(180000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await enter(page);
  // Jobs show the room's live slots; starting away from the counter is refused by the server.
  await page.keyboard.press('KeyJ');
  await expect(page.locator('#modal-title')).toHaveText('Trabalhar no bar');
  await expect(page.locator('.job-card')).toContainText('Ajudante do Magrão');
  await expect(page.locator('.job-meta')).toContainText('0/2 vagas');
  await page.getByRole('button',{name:'Começar turno'}).click();
  await expect(page.locator('#toasts')).toContainText('balcão');
  await expect(page.locator('#job-hud')).toBeHidden();
  // Standing, T explains how to order from Tonico instead of opening the menu.
  await page.keyboard.press('KeyT');
  await expect(page.locator('#toasts')).toContainText('Sente-se');
  await expect(page.locator('#modal')).toBeHidden();
  await expect(page.locator('#table-cta')).toBeHidden();
  // Graphics: a preset applies all of its values to the scene at once; any change becomes Personalizado.
  await page.getByRole('button',{name:'Configurações'}).click();
  await page.locator('[data-setting="graphics.preset"]').selectOption('low');
  await expect.poll(()=>page.evaluate(()=>(window as any).barDebug.graphics())).toMatchObject({preset:'low',shadows:'off',fpsCap:30,renderScale:.6});
  expect((await page.evaluate(()=>(window as any).barDebug.environment())).sun?.shadows).toBe(false);
  await page.locator('[data-setting="graphics.shadows"]').selectOption('high');
  await expect.poll(()=>page.evaluate(()=>(window as any).barDebug.graphics())).toMatchObject({preset:'custom',shadows:'high'});
  await expect(page.locator('[data-setting="graphics.preset"]')).toHaveValue('custom');
  // Saved in this browser and applied again after a reload.
  await page.reload();await page.getByRole('button',{name:'Entrar no bar'}).click();await expect(page.locator('#waiting')).toBeHidden({timeout:60000});
  await expect.poll(()=>page.evaluate(()=>(window as any).barDebug.graphics())).toMatchObject({preset:'custom',shadows:'high',fpsCap:30});
  expect(errors).toEqual([]);
});
