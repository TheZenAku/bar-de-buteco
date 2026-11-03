import {fileURLToPath} from 'node:url';
import {expect,test,type Page} from '@playwright/test';

const fixture='/@fs/'+fileURLToPath(new URL('../fixtures/admin-badges.html',import.meta.url)).replaceAll('\\','/');
const writes=(page:Page)=>page.evaluate(()=>(window as any).fixture.writes);
test.beforeEach(async({page})=>{await page.goto(fixture);await expect(page.locator('.admin-badge-item')).toHaveCount(8);});

test('the catalog is paginated, searches without accents, combines filters and only loads holders when requested',async({page})=>{
  await expect(page.locator('[data-badge-form]')).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).fixture.requests)).toEqual(['/admin/badges']);
  await page.locator('[name="badge-query"]').fill('descricao do emblema manual');
  await expect(page.locator('[name="badge-query"]')).toBeFocused();
  await expect(page.locator('.admin-pagination')).toContainText('Página 1 de 4');
  await page.locator('[data-badge="next"]').click();
  await expect(page.locator('.admin-pagination')).toContainText('Página 2 de 4');
  await page.locator('[name="badge-rarity"]').selectOption('legendary');
  await expect(page.locator('.admin-badge-item')).toHaveCount(5);
  await expect(page.locator('.admin-pagination')).toContainText('Página 1 de 1');
  await page.locator('[name="badge-sort"]').selectOption('holders');
  await expect(page.locator('.admin-badge-item').first()).toHaveAttribute('data-badge-id','manual-24');
  await page.locator('[name="badge-origin"]').selectOption('automatic');
  await expect(page.locator('.admin-badge-item')).toHaveCount(0);
  await expect(page.locator('[data-badge-results]')).toContainText('Nenhum emblema encontrado');
  await page.locator('[data-badge="clear"]').click();
  await expect(page.locator('.admin-badge-item')).toHaveCount(8);
  await expect(page.locator('[name="badge-query"]')).toHaveValue('');
});

test('editing opens at the top, keeps all fields across appearance and holder changes, and returns to the same catalog page',async({page})=>{
  await page.locator('[name="badge-query"]').fill('emblema manual');
  await page.locator('[data-badge="next"]').click();
  const edit=page.locator('[data-badge="edit"]').last(),id=await edit.getAttribute('data-id');
  await edit.scrollIntoViewIfNeeded();
  const scroll=await page.locator('#admin-section').evaluate(root=>root.scrollTop);
  await edit.click();
  await expect(page.locator('[name="name"]')).toBeFocused();
  expect(await page.locator('#admin-section').evaluate(root=>root.scrollTop)).toBe(0);
  await expect(page.locator('.admin-badge-item')).toHaveCount(0);
  await page.locator('[name="name"]').fill('Nome editado');
  await page.locator('[name="description"]').fill('Descrição editada');
  await page.locator('[name="reason"]').fill('Motivo preservado');
  await page.locator('[data-badge-rarity="legendary"]').click();
  await page.locator('[data-badge-icon="heart"]').click();
  await page.locator('[data-badge-color="#17d4f4"]').click();
  await expect(page.locator('[name="reason"]')).toHaveValue('Motivo preservado');
  await page.locator('[data-badge="tab-holders"]').click();
  await expect(page.locator('[data-badge-form="grant"]')).toBeVisible();
  await expect(page.locator('[data-badge-form="save"]')).toHaveCount(0);
  await page.locator('[data-badge="tab-edit"]').click();
  await expect(page.locator('[name="name"]')).toHaveValue('Nome editado');
  await expect(page.locator('[name="description"]')).toHaveValue('Descrição editada');
  await expect(page.locator('[name="reason"]')).toHaveValue('Motivo preservado');
  await page.locator('[data-badge-form="save"] button[type="submit"]').click();
  await expect(page.locator('.admin-pagination')).toContainText('Página 2 de 3');
  await expect(page.locator('[name="badge-query"]')).toHaveValue('emblema manual');
  const saved=(await writes(page)).at(-1);
  expect(saved.data).toMatchObject({id,name:'Nome editado',description:'Descrição editada',reason:'Motivo preservado',rarity:'legendary',icon:'heart',color:'#17d4f4'});
  // A return without saving also restores where the administrator was browsing.
  await page.locator('[data-badge="edit"]').last().click();
  await page.locator('[data-badge="back"]').click();
  expect(await page.locator('#admin-section').evaluate(root=>root.scrollTop)).toBeGreaterThanOrEqual(Math.min(scroll,20));
});

test('creation, granting, revocation and a failed deletion can all be completed in their own views',async({page})=>{
  await page.locator('[data-badge="new"]').click();
  await page.locator('[name="name"]').fill('Emblema novo');
  await page.locator('[name="description"]').fill('Descrição nova');
  await page.locator('[name="reason"]').fill('Criar para teste');
  await page.locator('[data-badge-form="save"] button[type="submit"]').click();
  await expect(page.locator('.admin-badge-toolbar')).toBeVisible();
  await page.locator('[name="badge-query"]').fill('Emblema novo');
  await page.locator('[data-badge="select"]').click();
  await page.locator('[name="search"]').fill('jogador');
  await page.locator('[data-badge-target]').click();
  await page.locator('[name="reason"]').fill('Conceder para teste');
  await page.locator('[data-badge-form="grant"] button[type="submit"]').click();
  await expect(page.locator('.admin-table')).toContainText('jogador');
  await page.locator('[data-badge="revoke"]').click();
  await page.locator('[data-badge-form="remove"] [name="reason"]').fill('Retirar para teste');
  await page.locator('[data-badge-form="remove"] button[type="submit"]').click();
  await expect(page.locator('.admin-table')).toHaveCount(0);
  await page.locator('[data-badge="back"]').click();
  await page.locator('[data-badge="delete"]').click();
  await expect(page.locator('[data-badge-form="remove"] [name="reason"]')).toBeFocused();
  await page.locator('[data-badge-form="remove"] [name="reason"]').fill('Apagar para teste');
  await page.evaluate(()=>(window as any).fixture.fail());
  await page.locator('[data-badge-form="remove"] button[type="submit"]').click();
  await expect(page.locator('.admin-feedback')).toContainText('Falha temporária');
  await page.locator('[data-badge-form="remove"] button[type="submit"]').click();
  await expect(page.locator('.admin-badge-item')).toHaveCount(0);
  expect((await writes(page)).map((write:any)=>write.path)).toEqual(['/admin/badges','/admin/badges/grant','/admin/badges/grant','/admin/badges/delete','/admin/badges/delete']);
});

test('a slow account search cannot overwrite the latest results',async({page})=>{
  await page.locator('[data-badge="select"]').first().click();
  await page.locator('[name="search"]').fill('anterior');
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.requests.some((path:string)=>path.includes('search=anterior')))).toBe(true);
  await page.locator('[name="search"]').fill('atual');
  await expect(page.locator('[data-badge-target]')).toHaveText(/atual/);
  await page.waitForTimeout(700);
  await expect(page.locator('[data-badge-target]')).toHaveText(/atual/);
});

test('catalog and editor fit mobile, tablet and desktop without sideways scrolling',async({page})=>{
  for(const width of [360,768,1280]){
    await page.setViewportSize({width,height:800});
    const fits=()=>page.locator('#admin-section').evaluate(root=>root.scrollWidth<=root.clientWidth+1);
    expect(await fits()).toBe(true);
    await page.locator('[data-badge="edit"]').first().click();
    expect(await fits()).toBe(true);
    const name=await page.locator('[name="name"]').boundingBox();
    const section=await page.locator('#admin-section').boundingBox();
    expect(name!.y).toBeGreaterThanOrEqual(section!.y);expect(name!.y).toBeLessThan(section!.y+300);
    await page.locator('[name="reason"]').fill('Motivo no celular');
    await page.locator('[data-badge-rarity="rare"]').click();
    await expect(page.locator('[name="reason"]')).toHaveValue('Motivo no celular');
    await page.locator('[data-badge="back"]').click();
  }
});
