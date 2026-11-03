import {test,expect,type APIRequestContext,type Browser,type Page} from '@playwright/test';
import {internalSecret} from '@bar/shared/tickets';
import {enterAsAdmin} from './moto-helpers';

const API='http://127.0.0.1:3111';
const shots=process.env.PROFILE_SHOTS;
const shot=async(page:Page,name:string)=>{if(shots)await page.screenshot({path:`${shots}/${name}.png`});};
/** What the world reports every few seconds, sent by hand: a thousand real beers take days. */
const report=(request:APIRequestContext,userId:string,series:string,amount:number)=>request.post(`${API}/api/internal/achievements`,{headers:{'x-internal-secret':internalSecret()},data:{events:[{userId,series,amount}],online:[]}});
async function enter(browser:Browser,name:string):Promise<Page> {
  const context=await browser.newContext({viewport:{width:1280,height:800}});const page=await context.newPage();
  const username=`${name}_${Date.now().toString(36)}`.slice(0,24).toLowerCase();
  await page.goto('/');
  await page.getByRole('button',{name:'Criar conta',exact:true}).click();
  await page.getByLabel('Seu nome',{exact:true}).fill(name);
  await page.getByLabel('Usuário',{exact:true}).fill(username);
  await page.getByLabel('E-mail',{exact:true}).fill(`${username}@example.com`);
  await page.getByLabel('Senha',{exact:true}).fill('ButecoTeste2026!');
  await page.getByRole('button',{name:'Criar minha conta'}).click();
  await expect(page.locator('#game')).toBeVisible({timeout:60000});await expect(page.locator('#waiting')).toBeHidden({timeout:60000});
  return page;
}
const toast=(page:Page,title:string)=>page.locator('.comanda[data-variant="conquista"]').filter({has:page.locator('.comanda__title',{hasText:new RegExp(`^${title}$`)})});

test('badges earned by playing: the notice, the card, the progress tab and the collection',async({browser,request})=>{
  test.setTimeout(240000);
  const page=await enter(browser,'Conquistador'),errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  const me=await page.evaluate(()=>(window as any).barDebug.snapshot().localId as string);

  // A real action, from a real key: the wave reaches the API in the world's next report.
  await page.keyboard.press('v');
  const progress=async(series:string)=>(await (await page.request.get('/api/profile/achievements')).json()).achievements.find((each:any)=>each.id===series);
  await expect.poll(async()=>(await progress('gente-boa')).value,{timeout:20000}).toBe(1);
  // Nine beers: nothing to say yet.
  await report(request,me,'bebum',9);await page.waitForTimeout(4000);
  await expect(page.locator('.comanda[data-variant="conquista"]')).toHaveCount(0);

  // The tenth: the notice with its medal, and the card a click away.
  await report(request,me,'bebum',1);
  await expect(toast(page,'Bebum I')).toBeVisible({timeout:15000});
  await expect(toast(page,'Bebum I')).toContainText('Tomou 10 cervejas.');
  await expect(toast(page,'Bebum I').locator('.pf-medal-level')).toHaveText('I');
  await shot(page,'achievement-toast');
  await toast(page,'Bebum I').locator('.comanda__action').click();
  await expect(page.locator('.bc-card h2')).toHaveText('Bebum I');
  await page.waitForTimeout(500);await shot(page,'achievement-card');
  await page.keyboard.press('Escape');await expect(page.locator('.bc-backdrop')).toHaveCount(0);

  // Your own profile: the tab with every series, what was started first.
  await page.getByRole('button',{name:'Pessoas no bar',exact:true}).click();await page.getByRole('tab',{name:'Seu lugar no bar'}).click();
  await page.getByRole('button',{name:'Seu perfil'}).click();
  await expect(page.locator('.pf-profile h2')).toHaveText('Conquistador',{timeout:20000});
  await page.locator('.pf-tabs [data-tab="achievements"]').click();
  const bebum=page.locator('.pf-ach[data-series="bebum"]');
  await expect(bebum.locator('small')).toHaveText('10 de 50 cervejas');
  await expect(page.locator('.pf-panel .pf-lead')).toContainText('de 108 emblemas');
  await expect(page.locator('.pf-panel .pf-lead b')).toHaveText('1');
  await expect(bebum.locator('button.pf-ach-medal')).toHaveCount(1);await expect(bebum.locator('span.pf-ach-medal')).toHaveCount(3);
  // A started series comes before one nobody touched.
  const order=await page.locator('.pf-ach').evaluateAll(rows=>rows.map(row=>(row as HTMLElement).dataset.series));
  expect(order.indexOf('bebum')).toBeLessThan(order.indexOf('boca-nervosa'));
  expect(order.indexOf('gente-boa')).toBeLessThan(order.indexOf('boca-nervosa'));
  await shot(page,'achievement-tab');
  // Dark ones say what they ask for; only earned ones open.
  await bebum.locator('span.pf-ach-medal').first().hover();
  await expect(page.locator('.pf-tip')).toContainText('Tomou 50 cervejas.');
  await bebum.locator('button.pf-ach-medal').click();
  await expect(page.locator('.bc-card h2')).toHaveText('Bebum I');
  await page.keyboard.press('Escape');

  // Arriving with the tab open, it follows; the top of a series is the studded card, told to the whole bar.
  await report(request,me,'bebum',990);
  await expect(toast(page,'Bebum IV')).toBeVisible({timeout:15000});
  await expect(toast(page,'Bebum II')).toBeVisible();await expect(toast(page,'Bebum III')).toBeVisible();
  await expect(bebum.locator('small')).toHaveText('1.000 cervejas: série completa');
  await expect(bebum.locator('button.pf-ach-medal')).toHaveCount(4);
  await expect(page.locator('#messages')).toContainText('emblema lendário Bebum IV');
  await toast(page,'Bebum IV').locator('.comanda__action').click();
  await expect(page.locator('.bc-studs')).toBeVisible();
  await page.waitForTimeout(600);await shot(page,'achievement-legendary');
  await page.keyboard.press('Escape');await expect(page.locator('.bc-backdrop')).toHaveCount(0);

  // Into the collection, and on show like any other.
  await page.locator('.pf-tabs [data-tab="profile"]').click();
  await page.locator('[data-pf="badges"]').click();
  for(const id of ['bebum-1','bebum-4'])await page.locator(`[data-pick="${id}"]`).click();
  await shot(page,'achievement-picker');
  await page.locator('[data-pick-save]').click();
  await expect(page.locator('.pf-slot.filled')).toHaveCount(2);
  await expect(page.locator('.pf-slot.filled .pf-medal-level').nth(1)).toHaveText('IV');
  await shot(page,'achievement-profile');
  expect(errors).toEqual([]);
  await page.request.post('/api/auth/logout');
  await page.context().close();
});

test('the administration: what gives a badge by itself, and a manual grant reaches the player the same way',async({browser})=>{
  test.setTimeout(240000);
  const context=await browser.newContext({viewport:{width:1280,height:800},extraHTTPHeaders:{'X-Forwarded-For':'127.0.0.9'}});
  const page=await context.newPage();
  await enterAsAdmin(page);
  const me=await page.evaluate(()=>(window as any).barDebug.snapshot().localId as string);
  await page.request.post('/api/admin/badges/grant',{data:{playerId:me,badgeId:'motoboy-3',grant:false,reason:'Volta ao começo'}});
  await page.request.post('/api/admin/badges/grant',{data:{playerId:me,badgeId:'motoboy-3',grant:true,reason:'Teste da conquista'}});
  await expect(toast(page,'Motoboy III')).toBeVisible({timeout:15000});
  await page.getByRole('button',{name:'Administração'}).click();
  await page.locator('[data-admin-nav="badges"]').click();
  await expect(page.locator('#admin-section')).toContainText('Automático, ao chegar a 1.000 cervejas');
  await shot(page,'achievement-admin');
  await context.close();
});
