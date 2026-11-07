import {buyCard,showCard} from './collection-helpers';
import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {CAR_MODEL,VEHICLE_CATALOG} from '../../packages/shared/src/vehicle-models';

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
  await expect.poll(()=>page.evaluate(()=>{const d=(window as any).barDebug?.snapshot();return d?.world?.players?.[d.localId]?.connected;})).toBe(true);
}
/** A category of the administration (the menu on the left) and a tab of the player's file. */
const section=(page:Page,id:string)=>page.locator(`[data-admin-nav="${id}"]`).click();
const fileTab=(page:Page,name:RegExp|string)=>page.getByRole('tab',{name}).click();

test('veículos: gerenciar contas offline, reparar todos, transferir a chave e excluir pela administração',async({page,playwright})=>{
  test.setTimeout(150000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await enter(page,'primary_admin','rafaelrodrigues-2017@hotmail.com');
  const accounts=await playwright.request.newContext({baseURL:'http://localhost:5273'});
  try{
    const register=async(username:string)=>{
      const data={username,email:`${username}@vehicle-ui.test`,displayName:username,password};
      const created=await accounts.post('/api/auth/register',{data});
      const response=created.status()===409?await accounts.post('/api/auth/login',{data:{email:data.email,password}}):created;
      expect(response.ok()).toBe(true);return (await response.json()).user.id as string;
    };
    const source=await register('vehicle_source_ui'),target=await register('vehicle_target_ui');
    for(const id of [source,target]){
      const vehicles=(await (await page.request.get(`/api/admin/vehicles?ownerId=${id}`)).json()).vehicles;
      if(vehicles.length)expect((await page.request.post('/api/admin/vehicles',{data:{operation:'delete',ids:vehicles.map((v:any)=>v.id),requestId:crypto.randomUUID(),reason:'Limpar fixture de veículos'}})).ok()).toBe(true);
    }
    expect((await page.request.post('/api/admin/highfood/vehicle',{data:{playerId:source,owned:true,reason:'Veículo para teste da interface'}})).ok()).toBe(true);
    const vehicle=(await (await page.request.get(`/api/admin/vehicles?ownerId=${source}`)).json()).vehicles[0];
    await page.getByRole('button',{name:'Administração',exact:true}).click();await section(page,'vehicles');
    await page.getByLabel('Buscar veículos',{exact:true}).fill(vehicle.plate);
    await page.locator('[data-owned-form="search"]').getByRole('button',{name:'Buscar',exact:true}).click();
    await expect(page.locator('[data-owned-vehicles]')).toContainText('vehicle_source_ui');
    await page.getByRole('button',{name:'Reparar todos os veículos',exact:true}).click();
    await page.getByLabel('Motivo da alteração nos veículos').fill('Reparar frota de teste');
    await page.getByRole('button',{name:'Reparar todas as peças · todos',exact:true}).click();
    await expect(page.locator('.admin-feedback')).toContainText('veículo(s) atualizado(s)');
    await page.getByRole('button',{name:'Gerenciar',exact:true}).click();
    await page.getByLabel('Ação nos veículos',{exact:true}).selectOption('transfer');
    await page.getByLabel('Buscar destinatário',{exact:true}).fill('vehicle_target_ui');
    await page.getByRole('button',{name:'Buscar jogador',exact:true}).click();
    await expect(page.getByLabel('Novo proprietário',{exact:true}).locator('option')).toHaveCount(2);
    await page.getByLabel('Novo proprietário',{exact:true}).selectOption(target);
    await page.getByLabel('Motivo da alteração nos veículos').fill('Transferir veículo para destinatário offline');
    await page.getByRole('button',{name:'Transferir proprietário · 1',exact:true}).click();
    await expect(page.locator('[data-owned-vehicles]')).toContainText('vehicle_target_ui');
    await page.getByRole('button',{name:'Gerenciar',exact:true}).click();
    await page.getByLabel('Ação nos veículos',{exact:true}).selectOption('delete');
    await expect(page.locator('[data-owned-action]')).toContainText('Exclusão permanente');
    await page.getByLabel('Motivo da alteração nos veículos').fill('Excluir veículo da fixture');
    await page.getByRole('button',{name:'Excluir definitivamente · 1',exact:true}).click();
    await expect(page.locator('[data-owned-vehicles]')).toContainText('Nenhum veículo encontrado.');
    expect((await (await page.request.get(`/api/admin/vehicles?ownerId=${target}`)).json()).total).toBe(0);
    expect(errors).toEqual([]);
    await page.screenshot({path:'test-results/previews/admin-player-vehicles.png'});
  }finally{await accounts.dispose();}
});

test('veículos: registrar para jogador, personalizar placa e spawnar todos os modelos do catálogo',async({page,playwright})=>{
  test.setTimeout(150000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await enter(page,'primary_admin','rafaelrodrigues-2017@hotmail.com');
  const accounts=await playwright.request.newContext({baseURL:'http://localhost:5273'});
  try{
    const data={username:'vehicle_registered_ui',email:'vehicle_registered_ui@vehicle-ui.test',displayName:'vehicle_registered_ui',password};
    const created=await accounts.post('/api/auth/register',{data});
    const response=created.status()===409?await accounts.post('/api/auth/login',{data:{email:data.email,password}}):created;
    expect(response.ok()).toBe(true);const playerId=(await response.json()).user.id;
    const list=async()=>(await (await page.request.get(`/api/admin/vehicles?ownerId=${playerId}`)).json()).vehicles;
    const old=await list();if(old.length)expect((await page.request.post('/api/admin/vehicles',{data:{operation:'delete',ids:old.map((v:any)=>v.id),reason:'Limpar registro de teste',requestId:crypto.randomUUID()}})).ok()).toBe(true);
    await page.getByRole('button',{name:'Administração',exact:true}).click();await section(page,'vehicles');
    await expect(page.getByRole('tablist',{name:'Gerenciamento de veículos'}).getByRole('tab')).toHaveCount(3);
    await page.getByRole('tab',{name:'Registrar veículo',exact:true}).click();
    await page.getByLabel('Buscar jogador para registro',{exact:true}).fill(data.username);
    await page.getByRole('button',{name:'Buscar jogador',exact:true}).click();
    await expect(page.getByLabel('Proprietário do veículo',{exact:true}).locator('option')).toHaveCount(2);
    await page.getByLabel('Proprietário do veículo',{exact:true}).selectOption(playerId);
    await expect(page.getByLabel('Modelo para registro',{exact:true}).locator('option')).toHaveCount(VEHICLE_CATALOG.length);
    await page.getByLabel('Modelo para registro',{exact:true}).selectOption(CAR_MODEL);
    await page.getByLabel('Placa do registro (opcional)',{exact:true}).fill('UIR1A23');
    await page.getByLabel('Motivo do registro',{exact:true}).fill('Registrar carro para jogador offline');
    await page.getByRole('button',{name:'Registrar veículo',exact:true}).click();
    await expect(page.locator('.admin-feedback')).toContainText('Veículo registrado na garagem');
    expect((await list())[0]).toMatchObject({ownerId:playerId,model:CAR_MODEL,plate:'UIR1A23'});
    await page.getByRole('tab',{name:'Veículos dos jogadores',exact:true}).click();
    await page.getByLabel('Buscar veículos',{exact:true}).fill('UIR1A23');
    await page.locator('[data-owned-form="search"]').getByRole('button',{name:'Buscar',exact:true}).click();
    await page.getByRole('button',{name:'Gerenciar',exact:true}).click();
    await page.getByLabel('Ação nos veículos',{exact:true}).selectOption('plate');
    await page.getByLabel('Nova placa',{exact:true}).fill('UIR2B34');
    await page.getByLabel('Motivo da alteração nos veículos',{exact:true}).fill('Personalizar emplacamento do carro');
    await page.getByRole('button',{name:'Personalizar placa · 1',exact:true}).click();
    await expect(page.locator('.admin-feedback')).toContainText('1 veículo(s) atualizado(s)');
    expect((await list())[0].plate).toBe('UIR2B34');
    await page.getByRole('button',{name:'Fechar janela',exact:true}).click();
    await page.evaluate(()=>(window as any).barDebug.send('test.player.place',{x:60,y:0,z:7,rotation:0}));
    await expect.poll(()=>page.evaluate(()=>{const s=(window as any).barDebug.snapshot();return s.world.players[s.localId].x;})).toBeCloseTo(60,1);
    await page.getByRole('button',{name:'Administração',exact:true}).click();await section(page,'vehicles');
    await page.getByRole('tab',{name:'Spawn',exact:true}).click();
    await expect(page.getByLabel('Modelo para spawn',{exact:true}).locator('option')).toHaveCount(VEHICLE_CATALOG.length);
    for(const vehicle of VEHICLE_CATALOG){
      await page.getByLabel('Modelo para spawn',{exact:true}).selectOption(vehicle.model);
      await page.getByRole('button',{name:'Spawnar veículo',exact:true}).click();
      await expect(page.locator('.admin-feedback')).toContainText(`${vehicle.name} spawnado`);
      await expect(page.locator('[data-spawn-list]')).toContainText(vehicle.name);
      await page.locator('[data-vehicle="despawn-all"]').click();
      await expect(page.locator('[data-spawn-list]')).toContainText('Nenhum veículo no mapa.');
    }
    await page.screenshot({path:'test-results/previews/admin-vehicle-spawn.png'});expect(errors).toEqual([]);
  }finally{await accounts.dispose();}
});

test('tempo e clima: administração altera hora, pausa, velocidade e tempestade para a sala',async({page})=>{
  test.setTimeout(150000);
  await enter(page,'primary_admin','rafaelrodrigues-2017@hotmail.com');
  await page.getByRole('button',{name:'Administração',exact:true}).click();await section(page,'environment');
  await expect(page.getByLabel('Horário',{exact:true})).toBeVisible();
  await page.getByLabel('Horário',{exact:true}).fill('18:30');
  await page.getByLabel('Duração do dia (minutos reais)',{exact:true}).fill('60');
  await page.getByLabel('Pausar passagem do tempo',{exact:true}).check();
  await page.getByRole('button',{name:'Aplicar horário',exact:true}).click();
  await expect(page.locator('[data-environment-clock]')).toHaveText('18:30');
  await expect(page.getByRole('button',{name:'Retomar relógio',exact:true})).toBeVisible();
  await page.getByLabel('Condição do tempo',{exact:true}).selectOption('storm');
  await page.getByRole('button',{name:'Aplicar clima',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).barDebug.snapshot().world.environment.weather)).toBe('storm');
  await expect.poll(()=>page.evaluate(()=>(window as any).barDebug.environment().weather.rain),{timeout:25000}).toBe(1);
  await page.screenshot({path:'test-results/previews/admin-environment.png'});
  await page.getByRole('button',{name:'Meio-dia',exact:true}).click();
  await expect(page.locator('[data-environment-clock]')).toHaveText('12:00');
  await page.getByRole('button',{name:'Restaurar tempo e clima',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).barDebug.snapshot().world.environment)).toMatchObject({weather:'auto',paused:false,dayDurationMs:2400000});
});

test('desempenho: coleta real, HUD fora da administração, pausas, preferências e relatório',async({page})=>{
  test.setTimeout(180000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await enter(page,'primary_admin','rafaelrodrigues-2017@hotmail.com');
  await page.getByRole('button',{name:'Administração',exact:true}).click();await section(page,'performance');
  const collect=page.getByRole('checkbox',{name:'Coletar desempenho',exact:true});
  await collect.check();
  await page.getByLabel('Cenário desta análise',{exact:true}).fill('Validação do relatório detalhado');
  await page.getByLabel('Cenário desta análise',{exact:true}).blur();
  await page.getByRole('checkbox',{name:'Mostrar HUD de desempenho',exact:true}).check();
  await page.getByRole('checkbox',{name:'Memória JS do cliente',exact:true}).check();
  for(const checkbox of await page.locator('[data-perf-metric]').all())await checkbox.check();
  await page.getByLabel('Posição do HUD',{exact:true}).selectOption('top-left');
  await page.getByRole('button',{name:'Zerar análise',exact:true}).click();
  await expect(page.locator('[data-perf-server]')).toContainText('RAM do processo (RSS)');
  await expect(page.locator('[data-perf-status]')).toContainText('pausada');
  await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'test-results/previews/admin-performance.png'});
  await page.getByRole('button',{name:'Fechar janela',exact:true}).click();
  const overlay=page.locator('#performance-hud');
  await expect(overlay).toBeVisible();await expect(overlay).toHaveAttribute('data-corner','top-left');
  await expect(overlay).toContainText('Memória JS do cliente');
  await expect(overlay.locator('footer')).not.toContainText('· 0 frames',{timeout:30000});
  await page.screenshot({path:'test-results/previews/performance-hud.png'});
  await page.setViewportSize({width:960,height:640});
  expect(await overlay.evaluate(el=>el.scrollHeight<=el.clientHeight)).toBe(true);
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(await overlay.evaluate(el=>el.scrollHeight<=el.clientHeight)).toBe(true);
  await page.setViewportSize({width:960,height:640});
  // One real main-thread stall must remain measurable above the engine's clamped delta time.
  await page.evaluate(()=>{const start=performance.now();while(performance.now()-start<180){/* deliberate test stall */}});
  await expect(overlay.locator('header')).toContainText('AO VIVO');
  await page.getByRole('button',{name:'Administração',exact:true}).click();
  await expect(page.locator('[data-perf-status]')).toContainText('pausada');
  await expect(page.locator('[data-perf-events-count]')).not.toHaveText(/^0 registros/);
  await page.getByRole('button',{name:'Marcar ponto no relatório',exact:true}).click();
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Exportar relatório JSON',exact:true}).click()]);
  const report=JSON.parse(await readFile((await download.path())!,'utf8'));
  expect(report.frames.samples).toBeGreaterThan(0);expect(report.frames.max).toBeGreaterThan(100);expect(report.collecting).toBe(false);expect(report.server.tick.targetHz).toBe(20);
  expect(report.server.process.rss).toBeGreaterThan(0);expect(report.events.some((event:{ms:number})=>event.ms>=100)).toBe(true);
  expect(report.preferences.corner).toBe('top-left');expect(report.preferences.metrics).toContain('memory');
  expect(report.version).toBe(2);expect(report.inventoryError).toBeNull();
  expect(report.recording.totalFrames).toBeGreaterThan(0);expect(report.recording.totalStutters).toBeGreaterThan(0);
  expect(report.recording.buckets.some((b:any)=>b.phases.avatars?.samples>0&&b.details.minimap?.samples>0)).toBe(true);
  expect(report.inventory.engine.version).toBe('2.23.3');expect(report.inventory.scene.uniqueMeshes).toBeGreaterThan(0);
  expect(report.inventory.textures.items.length).toBeGreaterThan(0);expect(report.inventory.characters.items.length).toBeGreaterThan(0);
  expect(report.inventory.materials.items.some((m:any)=>m.textures.length>0)).toBe(true);
  expect(report.inventory.textures.items.find((t:any)=>t.name.includes('nathan_diffuse'))?.source).toBe('/models/nathan.glb');
  expect(report.session.scenario).toBe('Validação do relatório detalhado');expect(report.session.markers).toHaveLength(1);
  expect(report.serverSamples.length).toBeGreaterThan(0);expect(report.contextSamples.length).toBeGreaterThan(0);
  expect(report.environment.build.commit).toMatch(/^[0-9a-f]{40}$/);expect(report.claudePrompt).toContain('PlayCanvas');
  expect(report.analysis.phaseRanking.length).toBeGreaterThan(0);
  await download.saveAs('test-results/performance-report-example.json');
  await page.getByRole('button',{name:'Zerar análise',exact:true}).click();await expect(page.locator('[data-perf-status]')).toContainText('0 frames');
  await page.reload();await page.getByRole('button',{name:'Entrar no bar',exact:true}).click();await ready(page);
  await expect(overlay).toBeVisible();await expect(overlay).toHaveAttribute('data-corner','top-left');
  await page.getByRole('button',{name:'Administração',exact:true}).click();await section(page,'performance');
  await expect(collect).toBeChecked();await expect(page.getByRole('checkbox',{name:'Memória JS do cliente',exact:true})).toBeChecked();
  await collect.uncheck();await expect(overlay).toBeHidden();
  expect(errors).toEqual([]);
});

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
    await showCard(other,'rafael');
    await expect(other.getByRole('button',{name:'Moedas insuficientes',exact:true})).toBeDisabled();
    await adjust('add',2000);
    await expect(other.locator('#wallet-balance')).toHaveText('2.000 moedas',{timeout:20000});
    await expect(other.locator('.cl-buy [data-cl="buy"]')).toBeEnabled();
    await page.setViewportSize({width:1280,height:1000});await page.screenshot({path:'test-results/admin-panel.png'});
    await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.setViewportSize({width:960,height:640});
    await buyCard(other,'rafael');await other.locator('.cl-buy [data-cl="equip"]').click();await expect(other.locator('.cl-buy .cl-cta')).toHaveText(/Vestindo/);
    await other.locator('[data-skill="karate"] [data-cl="skill-buy"]').click();await other.locator('[data-skill="karate"] [data-cl="skill-confirm"]').click();
    await expect(other.locator('[data-skill="karate"]')).toContainText('Liberada');
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
