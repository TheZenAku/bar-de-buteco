import {test,expect,type Browser,type Page} from '@playwright/test';
// Chromium's fake microphone (launch flags in playwright.config.ts) beeps about once a second.
const password='ButecoTeste2026!';
async function enter(browser:Browser,name:string):Promise<{page:Page;id:string}>{
  const context=await browser.newContext({permissions:['microphone']});const page=await context.newPage();
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const id=`${name}_${Date.now().toString(36)}`,email=`${id}@example.com`;
  await page.goto('/');
  await page.getByRole('button',{name:'Criar conta',exact:true}).click();
  await page.getByLabel('Seu nome',{exact:true}).fill(name);
  await page.getByLabel('Usuário',{exact:true}).fill(id.slice(0,24));
  await page.getByLabel('E-mail',{exact:true}).fill(email);
  await page.getByLabel('Senha',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Criar minha conta'}).click();
  await expect(page.locator('#game')).toBeVisible({timeout:60000});await expect(page.locator('#waiting')).toBeHidden({timeout:60000});
  return {page,id:await page.evaluate(()=>(window as any).barDebug.snapshot().localId)};
}
const voice=(page:Page)=>page.evaluate(()=>(window as any).barDebug.voice());
const played=async(page:Page,speaker:string)=>((await voice(page)).peers.find((p:any)=>p.id===speaker)?.played as number)??0;

test('proximity voice: microphone, relay, spatial playback, muting and push-to-talk',async({browser})=>{
  test.setTimeout(180000);
  const a=await enter(browser,'Falante'),b=await enter(browser,'Ouvinte');
  await a.page.keyboard.press('m');
  await expect.poll(async()=>(await voice(a.page)).mic).toBe(true);
  expect((await voice(a.page)).codec).toBe('opus');
  await expect(a.page.locator('#voice-mic')).toHaveAttribute('aria-pressed','true');
  await expect.poll(()=>b.page.evaluate(id=>(window as any).barDebug.snapshot().world.players[id]?.voice,a.id)).toBe(true);
  // Heard nearby, loud, and the label lights up while speaking.
  await expect.poll(()=>played(b.page,a.id),{timeout:20000}).toBeGreaterThan(20);
  expect((await voice(b.page)).peers.find((p:any)=>p.id===a.id).gain).toBeGreaterThan(.5);
  await expect(b.page.locator('.world-label.speaking').filter({hasText:'Falante'})).toBeVisible({timeout:10000});
  // Other voices off: nothing more is played.
  await b.page.locator('#voice-listen').click();await expect(b.page.locator('#voice-listen')).toHaveAttribute('aria-pressed','false');
  await b.page.waitForTimeout(1000);const silenced=await played(b.page,a.id);await b.page.waitForTimeout(2500);
  expect(await played(b.page,a.id)).toBe(silenced);
  await b.page.locator('#voice-listen').click();
  await expect.poll(()=>played(b.page,a.id),{timeout:15000}).toBeGreaterThan(5);
  // Per-person mute from the people window.
  await b.page.locator('[data-action="people"]').first().click();
  await b.page.locator('.person').filter({hasText:'Falante'}).getByRole('button',{name:'Silenciar voz'}).click();
  await b.page.keyboard.press('Escape');
  await expect.poll(async()=>(await voice(b.page)).peers.find((p:any)=>p.id===a.id)?.gain??0).toBe(0);
  // Push-to-talk on A, from the settings window.
  await a.page.locator('[data-action="settings"]').click();
  await expect(a.page.getByRole('heading',{name:'Configurações'})).toBeVisible();
  await a.page.locator('label').filter({has:a.page.locator('[data-setting="voiceMode"][value="ptt"]')}).click();
  await a.page.keyboard.press('Escape');await a.page.waitForTimeout(800);
  expect((await voice(a.page)).transmitting).toBe(false);
  await a.page.keyboard.down('b');
  await expect.poll(async()=>(await voice(a.page)).transmitting).toBe(true);
  await a.page.keyboard.up('b');
  await expect.poll(async()=>(await voice(a.page)).transmitting).toBe(false);
  // M switches the microphone off and everyone sees it.
  await a.page.keyboard.press('m');
  await expect.poll(()=>b.page.evaluate(id=>(window as any).barDebug.snapshot().world.players[id]?.voice,a.id)).toBe(false);
});
