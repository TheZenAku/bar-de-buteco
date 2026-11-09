import {nameLabel,seeName} from './names';
import {test,expect,type Browser,type Page} from '@playwright/test';
import {menuItem,closeMenu} from './menu';
// Chromium's fake microphone (launch flags in playwright.config.ts) beeps about once a second.
const password='ButecoTeste2026!';
test.beforeEach(async({request})=>{
  await expect.poll(async()=>{try{return (await request.get('/api/ready')).ok()&&(await request.get(process.env.PLAYWRIGHT_GAME_HEALTH_URL||'http://localhost:2677/health')).ok();}catch{return false;}},{timeout:60000}).toBe(true);
});

test('administrators without owner status fly with B in both voice modes and use Alt+B for push-to-talk',async({page,context})=>{
  test.setTimeout(150000);
  await context.grantPermissions(['microphone']);
  await page.addInitScript(()=>localStorage.setItem('bar:settings:v1',JSON.stringify({voiceMode:'ptt'})));
  const login=await page.request.post('/api/auth/login',{data:{email:'admin@bar.local',password:'ButecoDemo2026!'}});
  expect(login.ok(),await login.text()).toBe(true);
  const {user}=await (await page.request.get('/api/auth/me')).json();
  expect(user.role).toBe('admin');expect(user.isOwner).toBe(false);
  await page.goto('/');await page.getByRole('button',{name:'Entrar no bar'}).click();
  await expect(page.locator('#game')).toBeVisible();await expect(page.locator('#waiting')).toBeHidden({timeout:60000});
  const animation=()=>page.evaluate(()=>{const d=(window as any).barDebug.snapshot();return d.world?.players[d.localId]?.animationState??'';});
  await page.keyboard.press('m');
  await expect.poll(async()=>(await voice(page)).mic).toBe(true);
  await expect(page.locator('#voice-mic')).toHaveAttribute('title',/Alt\+B/);
  await page.keyboard.down('b');
  await expect.poll(animation).toMatch(/^fly/);
  expect((await voice(page)).transmitting).toBe(false);
  await page.keyboard.up('b');
  await page.keyboard.down('Alt');await page.keyboard.down('b');
  await expect.poll(async()=>(await voice(page)).transmitting).toBe(true);
  expect(await animation()).not.toBe('fly-fall');
  await page.keyboard.up('b');await page.keyboard.up('Alt');
  await expect.poll(async()=>(await voice(page)).transmitting).toBe(false);
  await page.keyboard.press('b');await expect.poll(animation).not.toMatch(/^fly/);
  await menuItem(page,'Ajustes','Voz');
  await expect(page.locator('[data-setting="voiceMode"] option[value="ptt"]')).toHaveText('Segurando Alt+B');
  await page.locator('[data-setting="voiceMode"]').selectOption('open');await closeMenu(page);
  await page.keyboard.press('b');await expect.poll(animation).toMatch(/^fly/);
  await page.keyboard.press('b');await expect.poll(animation).not.toMatch(/^fly/);
});

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
  await page.getByLabel('Confirmar senha',{exact:true}).fill(password);
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
  await seeName(b.page,nameLabel(b.page,'Falante','.speaking'),10000);
  // Other voices off: nothing more is played.
  const voices=b.page.locator('#pause-menu [data-pm-entry="voices"]');
  await menuItem(b.page,'Galera','Ouvir vozes');await expect(voices).toHaveAttribute('aria-checked','false');
  await b.page.waitForTimeout(1000);const silenced=await played(b.page,a.id);await b.page.waitForTimeout(2500);
  expect(await played(b.page,a.id)).toBe(silenced);
  await voices.click();await expect(voices).toHaveAttribute('aria-checked','true');
  await expect.poll(()=>played(b.page,a.id),{timeout:15000}).toBeGreaterThan(5);
  // Per-person mute from the people window.
  await menuItem(b.page,'Galera','Pessoas no bar');
  await b.page.locator('.person').filter({hasText:'Falante'}).getByRole('button',{name:'Silenciar voz'}).click();
  await b.page.keyboard.press('Escape');
  await expect.poll(async()=>(await voice(b.page)).peers.find((p:any)=>p.id===a.id)?.gain??0).toBe(0);
  // Push-to-talk on A, from the menu (Ajustes › Voz).
  await menuItem(a.page,'Ajustes','Voz');
  await a.page.locator('#pause-menu [data-setting="voiceMode"]').selectOption('ptt');
  await closeMenu(a.page);await a.page.waitForTimeout(800);
  expect((await voice(a.page)).transmitting).toBe(false);
  await a.page.keyboard.down('b');
  await expect.poll(async()=>(await voice(a.page)).transmitting).toBe(true);
  expect(await a.page.evaluate(()=>{const d=(window as any).barDebug.snapshot();return d.world.players[d.localId].animationState.startsWith('fly');})).toBe(false);
  await a.page.keyboard.up('b');
  await expect.poll(async()=>(await voice(a.page)).transmitting).toBe(false);
  // M switches the microphone off and everyone sees it.
  await a.page.keyboard.press('m');
  await expect.poll(()=>b.page.evaluate(id=>(window as any).barDebug.snapshot().world.players[id]?.voice,a.id)).toBe(false);
});
