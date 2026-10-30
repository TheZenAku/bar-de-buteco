import {test,expect,type Page} from '@playwright/test';

const password='AdminBrowserTests2026!';
test.beforeEach(async({request})=>{
  await expect.poll(async()=>{try{return (await request.get('/api/health')).ok()&&(await request.get(process.env.PLAYWRIGHT_GAME_HEALTH_URL||'http://localhost:2677/health')).ok();}catch{return false;}},{timeout:30000}).toBe(true);
});
async function enter(page:Page,username:string,email:string){
  const created=await page.request.post('/api/auth/register',{data:{username,email,displayName:username,password}});
  if(created.status()===409){const login=await page.request.post('/api/auth/login',{data:{email,password}});expect(login.ok()).toBe(true);}
  else expect(created.status()).toBe(201);
  await page.goto('/');await page.getByRole('button',{name:'Entrar no bar'}).click();await ready(page);
}
async function ready(page:Page){
  await expect(page.locator('#game')).toBeVisible();await expect(page.locator('#waiting')).toBeHidden({timeout:60000});
  await expect.poll(()=>page.evaluate(()=>{const d=(window as any).barDebug.snapshot();return d.world?.players?.[d.localId]?.connected;})).toBe(true);
}
/** A category of the administration (the menu on the left) and a tab of the player's file. */
const section=(page:Page,id:string)=>page.locator(`[data-admin-nav="${id}"]`).click();
const fileTab=(page:Page,name:RegExp|string)=>page.getByRole('tab',{name}).click();

test('administração ingame: moedas, loja sincronizada, delegação, expulsão e banimento',async({page,browser})=>{
  test.setTimeout(360000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const context=await browser.newContext({viewport:{width:640,height:480}}),other=await context.newPage();other.on('pageerror',error=>errors.push(error.message));
  const name=`staff_${Date.now().toString(36)}`,email=`${name}@example.com`;
  await page.addInitScript(()=>Object.defineProperty(crypto,'randomUUID',{value:undefined,configurable:true}));
  try{
    await enter(page,'primary_admin','rafaelrodrigues-2017@hotmail.com');
    await page.getByRole('button',{name:'Administração',exact:true}).click();
    await expect(page.locator('.admin-nav-head')).toContainText('Conta principal');
    // The administrator is using the panel while the other browser joins; avoid rendering
    // two full 3D worlds simultaneously on the test machine's software GPU.
    await enter(other,name,email);await expect(other.locator('#admin-button')).toBeHidden();
    await section(page,'players');
    await page.route(/\/api\/admin\/overview\?/,async route=>{if(new URL(route.request().url()).searchParams.get('search')===email)await new Promise(resolve=>setTimeout(resolve,350));await route.continue();});
    await page.getByLabel('Buscar jogador',{exact:true}).fill(email);await page.getByRole('button',{name:'Buscar',exact:true}).click();
    await expect(page.getByRole('button',{name:'Buscar',exact:true})).toBeDisabled();
    await expect(page.locator('.admin-player-detail h3')).toHaveText(name);
    await fileTab(page,'Carteira');
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
    await fileTab(page,/Histórico/);
    const removal=page.locator('.admin-actions-history article').filter({has:page.locator('b',{hasText:'Moedas removidas'})}).first();
    await removal.getByRole('button',{name:'Devolver moedas removidas',exact:true}).click();
    await page.getByLabel('Motivo da reversão',{exact:true}).fill('Devolver ajuste de teste sem desfazer a compra');await page.getByRole('button',{name:'Confirmar reversão',exact:true}).click();
    await expect(page.locator('.admin-feedback')).toHaveText('Ação desfeita e reversão registrada.');
    await expect(other.locator('#wallet-balance')).toHaveText('500 moedas',{timeout:20000});
    await expect(page.locator('.admin-actions-history')).toContainText('Desfeita em');
    await other.getByRole('button',{name:'Fechar janela'}).click();
    // Items: given in the file, in the other player's backpack.
    await fileTab(page,'Itens e skins');
    const items=page.locator('form[data-admin-form="item"]');await items.getByLabel('Item',{exact:true}).selectOption('pastel');
    await items.getByLabel('Quantidade de itens').fill('2');await items.getByLabel('Motivo da mudança na mochila').fill('Prêmio do quiz');
    await items.getByRole('button',{name:'Entregar'}).click();await expect(page.locator('.admin-feedback')).toHaveText('Pastel entregue na mochila.');
    await expect.poll(async()=>(await other.request.get('/api/inventory')).json().then(v=>v.stacks.find((s:{itemId:string})=>s.itemId==='pastel')?.quantity),{timeout:20000}).toBe(2);
    await fileTab(page,'Moderação');
    await page.getByRole('button',{name:'Dar administrador',exact:true}).click();
    await page.getByLabel('Motivo da ação',{exact:true}).fill('Delegar testes de moderação');
    await page.getByRole('button',{name:'Conceder administrador',exact:true}).click();
    await expect(other.locator('#admin-button')).toBeVisible({timeout:20000});
    await other.getByRole('button',{name:'Administração',exact:true}).click();
    await expect(other.locator('.admin-nav-head')).toContainText('Administrador');
    await section(other,'players');await expect(other.locator('.admin-player-detail h3')).toBeVisible();await fileTab(other,'Moderação');
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
    await fileTab(page,/Histórico/);
    const ban=page.locator('.admin-actions-history article').filter({hasText:'Testar bloqueio de acesso'}).first();
    await ban.getByRole('button',{name:'Desbanir',exact:true}).click();await page.getByLabel('Motivo da reversão',{exact:true}).fill('Desbanir pelo histórico');await page.getByRole('button',{name:'Confirmar reversão',exact:true}).click();
    await expect(page.locator('.admin-feedback')).toHaveText('Ação desfeita e reversão registrada.');
    await fileTab(page,'Moderação');
    await page.locator('.admin-player-actions').getByRole('button',{name:'Banir',exact:true}).click();await page.getByLabel('Motivo da ação',{exact:true}).fill('Conferir botão de desbanir no cadastro');await page.getByRole('button',{name:'Banir jogador',exact:true}).click();
    await page.locator('.admin-player-actions').getByRole('button',{name:'Desbanir',exact:true}).click();await page.getByLabel('Motivo da ação',{exact:true}).fill('Finalizar teste de banimento');
    await page.getByRole('button',{name:'Remover banimento',exact:true}).click();
    await other.getByLabel('E-mail',{exact:true}).fill(email);await other.getByLabel('Senha',{exact:true}).fill(password);
    await other.getByRole('button',{name:'Entrar no bar'}).click();await ready(other);
    await fileTab(page,/Histórico/);await expect(page.locator('.admin-actions-history')).toContainText('Moedas adicionadas');

    // Preços: a new price reaches the API, the world and the other player's browser; then back to the default.
    await section(page,'prices');
    await page.getByLabel('Novo valor de Água mineral').fill('13');
    await page.getByLabel('Motivo da alteração de preços').fill('Teste de preço ponta a ponta');
    await page.getByRole('button',{name:'Salvar preços',exact:true}).click();
    await expect(page.locator('.admin-feedback')).toContainText('Preços atualizados');
    expect((await (await page.request.get('/api/prices')).json()).prices['item:agua']).toBe(13);
    await expect.poll(()=>other.evaluate(()=>(window as any).barDebug.price('item:agua')),{timeout:20000}).toBe(13);
    await page.locator('[data-price-reset="item:agua"]').click();
    await page.getByLabel('Motivo da alteração de preços').fill('Voltar ao padrão depois do teste');
    await page.getByRole('button',{name:'Salvar preços',exact:true}).click();
    await expect.poll(()=>other.evaluate(()=>(window as any).barDebug.price('item:agua')),{timeout:20000}).toBe(12);
    // Logs: the price change and the ban, filtered by type and by text.
    await section(page,'logs');
    await page.locator('[data-log-category="admin"]').click();
    await page.getByLabel('Buscar nos logs').fill('ponta a ponta');await page.getByRole('button',{name:'Filtrar'}).click();
    await expect(page.locator('.admin-log tbody tr').first()).toContainText('Preços alterados');
    expect(errors).toEqual([]);
  }finally{
    await Promise.allSettled([page.request.post('/api/auth/logout',{data:{}}),other.request.post('/api/auth/logout',{data:{}})]);
    await other.goto('about:blank');await context.close();
  }
});
