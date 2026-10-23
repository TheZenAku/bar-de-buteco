import {test,expect,type Page} from '@playwright/test';
import {DEFAULT_CHARACTER} from '../../packages/shared/src/character';

const password='AdminBrowserTests2026!';
test.beforeEach(async({request})=>{
  await expect.poll(async()=>{try{return (await request.get('/api/health')).ok()&&(await request.get(process.env.PLAYWRIGHT_GAME_HEALTH_URL||'http://localhost:2677/health')).ok();}catch{return false;}},{timeout:30000}).toBe(true);
});
async function enter(page:Page,username:string,email:string){
  const created=await page.request.post('/api/auth/register',{data:{username,email,displayName:username,password}});
  if(created.status()===409){const login=await page.request.post('/api/auth/login',{data:{email,password}});expect(login.ok()).toBe(true);}
  else expect(created.status()).toBe(201);
  expect((await page.request.post('/api/character',{data:DEFAULT_CHARACTER})).ok()).toBe(true);
  await page.goto('/');await page.getByRole('button',{name:'Entrar no bar'}).click();await ready(page);
}
async function ready(page:Page){
  await expect(page.locator('#game')).toBeVisible();await expect(page.locator('#waiting')).toBeHidden({timeout:60000});
  await expect.poll(()=>page.evaluate(()=>{const d=(window as any).barDebug.snapshot();return d.world?.players?.[d.localId]?.connected;})).toBe(true);
}

test('administração ingame: moedas, loja sincronizada, delegação, expulsão e banimento',async({page,browser})=>{
  test.setTimeout(360000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const context=await browser.newContext({viewport:{width:640,height:480}}),other=await context.newPage();other.on('pageerror',error=>errors.push(error.message));
  const name=`staff_${Date.now().toString(36)}`,email=`${name}@example.com`;
  await page.addInitScript(()=>Object.defineProperty(crypto,'randomUUID',{value:undefined,configurable:true}));
  try{
    await enter(page,'primary_admin','rafaelrodrigues-2017@hotmail.com');
    await page.getByRole('button',{name:'Administração',exact:true}).click();
    // The administrator is using the panel while the other browser joins; avoid rendering
    // two full 3D worlds simultaneously on the test machine's software GPU.
    await enter(other,name,email);await expect(other.locator('#admin-button')).toBeHidden();
    await page.route(/\/api\/admin\/overview\?/,async route=>{if(new URL(route.request().url()).searchParams.get('search')===email)await new Promise(resolve=>setTimeout(resolve,350));await route.continue();});
    await page.getByLabel('Buscar jogador',{exact:true}).fill(email);await page.getByRole('button',{name:'Buscar',exact:true}).click();
    await expect(page.getByLabel('Operação de moedas')).toBeDisabled();
    await expect(page.locator('.admin-player-detail h3')).toHaveText(name);
    const adjust=async(operation:string,amount:number)=>{
      const form=page.locator('.admin-wallet-form');await form.getByLabel('Operação de moedas').selectOption(operation);
      await form.getByLabel('Quantidade de moedas').fill(String(amount));await form.getByLabel('Motivo do ajuste').fill('Teste de carteira pelo painel in-game');
      await form.getByRole('button',{name:'Aplicar ajuste'}).click();await expect(page.locator('.admin-feedback')).toHaveText('Carteira atualizada.');
    };
    await adjust('set',0);await expect(page.locator('.admin-current-balance b')).toHaveText('0 moedas');
    await other.keyboard.press('c');await expect(other.locator('#wallet-balance')).toHaveText('0 moedas');
    const rafael=other.locator('.skin-card').filter({has:other.locator('b',{hasText:'Rafael'})});await rafael.click();
    await expect(other.getByRole('button',{name:'Moedas insuficientes',exact:true})).toBeDisabled();
    await adjust('add',1500);
    await expect(other.locator('#purchase-balance')).toHaveText('1.500',{timeout:20000});
    await expect(other.getByRole('button',{name:'Confirmar compra'})).toBeEnabled();
    await page.setViewportSize({width:1280,height:1000});await page.screenshot({path:'test-results/admin-panel.png'});
    await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.setViewportSize({width:960,height:640});
    await other.getByRole('button',{name:'Confirmar compra'}).click();await rafael.click();
    await expect(other.locator('#kick-button')).toBeVisible();await other.keyboard.press('c');
    await expect(other.locator('#wallet-balance')).toHaveText('500 moedas');
    await page.getByRole('button',{name:'Atualizar painel'}).click();await expect(page.locator('.admin-current-balance b')).toHaveText('500 moedas');
    await adjust('remove',200);await expect(other.locator('#wallet-balance')).toHaveText('300 moedas',{timeout:20000});
    await page.locator('.admin-actions-history summary').click();
    const removal=page.locator('.admin-actions-history article').filter({has:page.locator('b',{hasText:'Moedas removidas'})}).first();
    await removal.getByRole('button',{name:'Devolver moedas removidas',exact:true}).click();
    await page.getByLabel('Motivo da reversão',{exact:true}).fill('Devolver ajuste de teste sem desfazer a compra');await page.getByRole('button',{name:'Confirmar reversão',exact:true}).click();
    await expect(page.locator('.admin-feedback')).toHaveText('Ação desfeita e reversão registrada.');
    await expect(other.locator('#wallet-balance')).toHaveText('500 moedas',{timeout:20000});
    await expect(page.locator('.admin-actions-history')).toContainText('Desfeita em');
    await other.getByRole('button',{name:'Fechar janela'}).click();
    await page.getByRole('button',{name:'Dar administrador',exact:true}).click();
    await page.getByLabel('Motivo da ação',{exact:true}).fill('Delegar testes de moderação');
    await page.getByRole('button',{name:'Conceder administrador',exact:true}).click();
    await expect(other.locator('#admin-button')).toBeVisible({timeout:20000});
    await other.getByRole('button',{name:'Administração',exact:true}).click();
    await expect(other.locator('.admin-panel .modal-description')).toContainText('Administração ·');
    await expect(other.getByRole('button',{name:'Dar administrador',exact:true})).toHaveCount(0);
    await page.getByRole('button',{name:'Remover administrador',exact:true}).click();
    await page.getByLabel('Motivo da ação',{exact:true}).fill('Encerrar permissão de teste');
    await page.locator('.admin-confirmation').getByRole('button',{name:'Remover administrador',exact:true}).click();
    await expect(other.locator('#admin-button')).toBeHidden({timeout:20000});await expect(other.getByRole('dialog')).toBeHidden();
    await page.getByRole('button',{name:'Expulsar',exact:true}).click();await page.getByLabel('Motivo da ação',{exact:true}).fill('Testar encerramento da participação');
    await page.getByRole('button',{name:'Expulsar jogador',exact:true}).click();
    await expect(other.locator('#lobby')).toBeVisible({timeout:20000});await expect(other.locator('#auth-message')).toContainText('Sua conta não está banida');
    await page.locator('.admin-player-actions').getByRole('button',{name:'Desfazer expulsão',exact:true}).click();
    await page.getByLabel('Motivo da ação',{exact:true}).fill('Cancelar registro de expulsão');await page.locator('.admin-confirmation').getByRole('button',{name:'Desfazer expulsão',exact:true}).click();
    await expect(page.locator('.admin-player-actions').getByRole('button',{name:'Desfazer expulsão',exact:true})).toHaveCount(0);
    await other.getByRole('button',{name:'Entrar no bar'}).click();await ready(other);
    await page.getByRole('button',{name:'Banir',exact:true}).click();await page.getByLabel('Motivo da ação',{exact:true}).fill('Testar bloqueio de acesso');
    await page.getByRole('button',{name:'Banir jogador',exact:true}).click();await expect(other.locator('#lobby')).toBeVisible({timeout:20000});await expect(other.locator('#auth-message')).toContainText('Conta banida');
    const ban=page.locator('.admin-actions-history article').filter({hasText:'Testar bloqueio de acesso'}).first();
    await ban.getByRole('button',{name:'Desbanir',exact:true}).click();await page.getByLabel('Motivo da reversão',{exact:true}).fill('Desbanir pelo histórico');await page.getByRole('button',{name:'Confirmar reversão',exact:true}).click();
    await expect(page.locator('.admin-feedback')).toHaveText('Ação desfeita e reversão registrada.');
    await page.locator('.admin-player-actions').getByRole('button',{name:'Banir',exact:true}).click();await page.getByLabel('Motivo da ação',{exact:true}).fill('Conferir botão de desbanir no cadastro');await page.getByRole('button',{name:'Banir jogador',exact:true}).click();
    await page.locator('.admin-player-actions').getByRole('button',{name:'Desbanir',exact:true}).click();await page.getByLabel('Motivo da ação',{exact:true}).fill('Finalizar teste de banimento');
    await page.getByRole('button',{name:'Remover banimento',exact:true}).click();
    await other.getByLabel('E-mail',{exact:true}).fill(email);await other.getByLabel('Senha',{exact:true}).fill(password);
    await other.getByRole('button',{name:'Entrar no bar'}).click();await ready(other);
    await expect(page.locator('.admin-actions-history')).toContainText('Moedas adicionadas');
    expect(errors).toEqual([]);
  }finally{
    await Promise.allSettled([page.request.post('/api/auth/logout',{data:{}}),other.request.post('/api/auth/logout',{data:{}})]);
    await other.goto('about:blank');await context.close();
  }
});
