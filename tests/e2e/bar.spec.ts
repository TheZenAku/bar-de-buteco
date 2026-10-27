import {test,expect,type Page} from '@playwright/test';
import map from '../../packages/shared/src/map-data.json' with {type:'json'};
// Route validated by tests/integration/map.test.ts: pavement, veranda east opening, counter aisle, both stair flights.
const TO_UPSTAIRS=[[14.8,1],[14.8,-2.6],[15.3,-4.6],[15.3,-10.2],[14,-10.2],[14,-14.3],[15.85,-14.3],[15.85,-11.2],[15.85,-9]] as const;

const password='ButecoTeste2026!';
test('Boteco interface uses live state and its action bar works at desktop and narrow widths',async({page})=>{
  test.setTimeout(120000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await createAccount(page,`ui_${Date.now().toString(36)}`);
  await expect(page.locator('#hud-name')).not.toHaveText('Chegando…');
  await expect(page.locator('#hud-status')).toHaveText('Na área!');
  await expect(page.locator('#occupancy')).toContainText('/ 32');
  await page.getByRole('button',{name:/Pedir gelada/}).click();
  await expect(page.locator('#toasts')).toContainText('Chegue ao balcão');
  await page.getByRole('button',{name:/Dançar/}).click();
  await expect(page.locator('#dance-button')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#hud-activity')).toHaveText('No passinho');
  await page.getByRole('button',{name:/Dançar/}).click();
  await expect(page.locator('#dance-button')).toHaveAttribute('aria-pressed','false');
  await page.locator('#dance-button').focus();await page.keyboard.press('Enter');
  await expect(page.locator('#dance-button')).toHaveAttribute('aria-pressed','true');
  await page.keyboard.press('Enter');
  await expect(page.locator('#dance-button')).toHaveAttribute('aria-pressed','false');
  await page.getByRole('button',{name:'Recolher chat'}).click();
  await expect(page.locator('#chat-body')).toBeHidden();
  await expect(page.locator('#chat-toggle')).toHaveAttribute('aria-expanded','false');
  await page.getByRole('button',{name:/Resenhar/}).click();
  await expect(page.locator('#chat-input')).toBeFocused();
  await expect(page.locator('#chat-toggle')).toHaveAttribute('aria-expanded','true');
  await page.keyboard.type('wasdx');
  await expect(page.locator('#chat-input')).toHaveValue('wasdx');
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:/Meu visual/}).click();
  await selectSkin(page,'Rafael');
  await expect(page.locator('#hud-skin')).toContainText('Rafael');
  await expect(page.locator('#kick-button')).toBeVisible();
  for(let visit=0;visit<2;visit++){
    await page.getByRole('button',{name:'Pessoas no bar'}).click();
    await expect(page.locator('#modal-content')).toContainText('Você vê as pessoas próximas');
    await page.getByRole('button',{name:'Fechar janela'}).click();
  }
  for(const width of [1440,960,390]){
    await page.setViewportSize({width,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    for(const selector of ['.game-tools','#kick-button','#dance-button','#chat-input']){
      const box=await page.locator(selector).boundingBox();expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(width);
    }
  }
  await page.locator('#kick-button').click();
  await expect(page.locator('#hud-activity')).toHaveText('Karatê!');
  await page.getByRole('button',{name:'Sua conta',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button',{name:'Voltar à entrada'}).click();
  await expect(page.locator('#lobby')).toBeVisible();
  expect(errors).toEqual([]);
});

async function walkTo(page:Page,x:number,z:number,tolerance=.22):Promise<void>{
  for(let step=0;step<140;step++){
    const position=await page.evaluate(()=>{const {world,localId}=(window as any).barDebug.snapshot();return world.players[localId] as {x:number;y:number;z:number};});
    const dx=x-position.x,dz=z-position.z,distance=Math.hypot(dx,dz);
    if(distance<tolerance){
      await expect.poll(()=>page.evaluate(()=>(window as any).barDebug.network().pending),{intervals:[25,50,100],timeout:5000}).toBe(0);
      return;
    }
    const horizontal=dx*Math.cos(.15)-dz*Math.sin(.15),forward=-dx*Math.sin(.15)-dz*Math.cos(.15);
    const key=Math.abs(horizontal)>Math.abs(forward)?horizontal>0?'d':'a':forward>0?'w':'s';
    // Long stretches use a held key and the last metre returns to single-tick precision. This still exercises
    // browser input, prediction and authoritative collision, without recording hundreds of identical trace frames.
    const pulse=distance>2?350:distance>.85?180:65;
    await page.keyboard.press(key,{delay:pulse});
    await expect.poll(()=>page.evaluate(()=>(window as any).barDebug.network().pending),{intervals:[25,50,100],timeout:5000}).toBeLessThanOrEqual(2);
  }
  throw new Error(`Could not reach ${x},${z}: ${JSON.stringify(await page.evaluate(()=>(window as any).barDebug.snapshot()))}`);
}

async function gameReady(page:Page):Promise<void>{
  await expect(page.locator('#game')).toBeVisible();
  await expect(page.locator('#waiting')).toBeHidden({timeout:60000});
  // The connected callback precedes the first Colyseus state patch.
  await expect.poll(()=>page.evaluate(()=>{const state=(window as any).barDebug.snapshot();return state.world?.players?.[state.localId]?.connected===true;}),{timeout:30000}).toBe(true);
}

test('BarBoteco map loads fully; keyboard enters the bar, climbs stairs, returns and uses the counter and seats',async({page})=>{
  test.setTimeout(300000);await page.setViewportSize({width:960,height:640});
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await page.getByLabel('E-mail',{exact:true}).fill('jogador1@bar.local');
  await page.getByLabel('Senha',{exact:true}).fill(process.env.DEMO_PASSWORD||'ButecoDemo2026!');
  await page.getByRole('button',{name:'Entrar no bar'}).click();
  await gameReady(page);
  await expect.poll(()=>page.evaluate(()=>(window as any).barDebug.map())).toMatchObject({loaded:true,colliders:map.colliders.length,surfaces:map.surfaces.length,cartRenders:1,lights:14,
    effects:{fire:true,smoke:true,embers:true,taps:2,particles:19}});
  await page.screenshot({path:'test-results/map-exterior.png'});
  for(const [x,z] of TO_UPSTAIRS)await walkTo(page,x,z,.12);
  const height=()=>page.evaluate(()=>{const {world,localId}=(window as any).barDebug.snapshot();return world.players[localId].y;});
  await expect.poll(height).toBeCloseTo(3.45,1);
  await page.screenshot({path:'test-results/map-upper-floor.png'});
  for(const [x,z] of [...[...TO_UPSTAIRS].reverse().slice(1,6),[15.3,-7.5]])await walkTo(page,x,z,.12);
  await expect.poll(height).toBeCloseTo(.3,1);
  // Objects are used by touching them: lean on the counter.
  await expect(page.locator('#context')).toBeHidden();
  await walkTo(page,16.9,-7.5,.12);
  await expect(page.locator('#context-label')).toHaveText('Pedir uma bebida');
  // Seu Zé wears Magrão (not offered in the selector) and works the counter.
  const bartender=()=>page.evaluate(()=>(window as any).barDebug.animations().find((a:any)=>a.id==='bartender'));
  await expect.poll(async()=>(await bartender())?.skin).toBe('magrao');
  await page.keyboard.press('e');
  // Bottle or glass: the choice travels with the order and shows in the hand.
  await expect(page.locator('#modal-title')).toHaveText('PEDIR AO SEU ZÉ');
  await page.getByRole('button',{name:/Long neck/}).click();
  // He prepares the order facing the player; the drink comes only when he is done.
  await expect(page.locator('#context-label')).toHaveText('Cancelar pedido');
  await expect.poll(async()=>(await bartender())?.clip,{timeout:15000}).toBe('Bartend');
  await expect.poll(()=>page.evaluate(()=>(window as any).barDebug.map().effects?.pouring)).toBe(true);
  const ownClip=()=>page.evaluate(()=>{const d=(window as any).barDebug;return d.animations().find((a:any)=>a.id===d.snapshot().localId)?.clip;});
  expect(await ownClip()).not.toBe('Drink');
  await expect.poll(ownClip,{timeout:30000}).toBe('Drink');
  await expect.poll(()=>page.evaluate(()=>{const d=(window as any).barDebug;return d.animations().find((a:any)=>a.id===d.snapshot().localId)?.drink?.item;})).toBe('garrafa');
  expect((await bartender())?.clip).not.toBe('Bartend');
  await expect.poll(()=>page.evaluate(()=>(window as any).barDebug.map().effects?.pouring)).toBe(false);
  await page.keyboard.press('e');
  await walkTo(page,14.45,-7.6,.12);
  await expect(page.locator('#context-label')).toHaveText('Sentar');await page.keyboard.press('e');
  await expect(page.locator('#context-label')).toHaveText('Levantar / encerrar');
  // Common chairs play plain sitting (no glass until there is an inventory).
  await expect.poll(ownClip).toBe('Sit');
  await page.keyboard.press('e');
  await walkTo(page,14.6,-6.6,.18);
  expect(errors).toEqual([]);
});
test('new skeletal clips load on every skin and the keyboard plays the authored actions',async({page})=>{
  // Every skin swap loads both a character model and its full animation bank; software WebGL in CI is slow.
  test.setTimeout(360000);
  await page.setViewportSize({width:960,height:640});
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await createAccount(page,`anim_${Date.now().toString(36)}`);
  const id=await page.evaluate(()=>(window as any).barDebug.snapshot().localId);
  for(const skin of ['Nathan','Leandro','Rafael','Read']){
    await page.keyboard.press('c');
    // Magrão is Seu Zé's; players choose among the other four.
    await expect(page.locator('.skin-card')).toHaveCount(4);
    await selectSkin(page,skin);
    await expect.poll(()=>page.evaluate((id)=>(window as any).barDebug.animations().find((a:any)=>a.id===id)?.skin,id),{timeout:60000}).toBe(skin.toLowerCase());
    await expect.poll(()=>page.evaluate((id)=>{
      const tracks=(window as any).barDebug.animations().find((a:any)=>a.id===id)?.tracks??[];
      return ['Walk','Run','DrunkIdle','DrunkWalk','Dance','Sit','Wave','Use','Wait','Recover','Drink'].every(name=>tracks.includes(name));
    },id)).toBe(true);
    if(skin==='Leandro'){
      const height=await page.evaluate((id)=>(window as any).barDebug.animations().find((a:any)=>a.id===id)?.height,id);
      expect(height).toBeGreaterThan(1.4);expect(height).toBeLessThan(2.1);
      await page.keyboard.down('d');
      try{await expect.poll(()=>page.evaluate((id)=>(window as any).barDebug.animations().find((a:any)=>a.id===id)?.clip,id)).toBe('Walk');}
      finally{await page.keyboard.up('d');}
      await page.keyboard.down('Shift');await page.keyboard.down('d');
      try{await expect.poll(()=>page.evaluate((id)=>(window as any).barDebug.animations().find((a:any)=>a.id===id)?.clip,id)).toBe('Run');}
      finally{await page.keyboard.up('d');await page.keyboard.up('Shift');}
      // Finish the movement queue before sending an emote, which movement cancels.
      await expect.poll(()=>page.evaluate((id)=>(window as any).barDebug.snapshot().world.players[id]?.animationState,id)).toBe('idle');
      await expect.poll(()=>page.evaluate(()=>(window as any).barDebug.network().pending)).toBe(0);
      await page.keyboard.press('g');
      await expect.poll(()=>page.evaluate((id)=>(window as any).barDebug.animations().find((a:any)=>a.id===id)?.clip,id)).toBe('Dance');
      await page.screenshot({path:'test-results/leandro-accurig.png'});
      await page.keyboard.press('g');
      await expect.poll(()=>page.evaluate((id)=>(window as any).barDebug.animations().find((a:any)=>a.id===id)?.clip,id)).toBe('Idle');
      await page.keyboard.press('v');
      await expect.poll(()=>page.evaluate((id)=>(window as any).barDebug.animations().find((a:any)=>a.id===id)?.clip,id)).toBe('Wave');
      await expect.poll(()=>page.evaluate((id)=>(window as any).barDebug.animations().find((a:any)=>a.id===id)?.clip,id)).toBe('Idle');
    }
    // Respect the authoritative skin-change rate limit.
    await page.waitForTimeout(600);
  }
  await page.keyboard.press('c');await selectSkin(page,'Rafael');
  await expect(page.locator('#kick-button')).toBeVisible();
  await page.getByLabel('Mensagem por proximidade').focus();
  await page.keyboard.press('x');
  expect(await page.evaluate((id)=>(window as any).barDebug.snapshot().world.players[id].animationState,id)).not.toBe('kick');
  await page.keyboard.press('Escape');await page.locator('#chat-input').blur();
  await page.keyboard.press('x');
  await expect.poll(()=>page.evaluate((id)=>(window as any).barDebug.animations().find((a:any)=>a.id===id)?.clip,id)).toBe('Kick');
  await page.screenshot({path:'test-results/rafael-karate.png'});
  await expect.poll(()=>page.evaluate((id)=>(window as any).barDebug.snapshot().world.players[id].animationState,id)).toBe('idle');
  await expect.poll(()=>page.evaluate((id)=>(window as any).barDebug.animations().find((a:any)=>a.id===id)?.clip,id)).toBe('Idle');
  await page.keyboard.press('x');
  await expect.poll(()=>page.evaluate((id)=>(window as any).barDebug.animations().find((a:any)=>a.id===id)?.clip,id)).toBe('Kick');
  expect(errors).toEqual([]);
});
test.beforeEach(async({request})=>{
  await expect.poll(async()=>{
    try{return (await request.get('/api/health')).ok()&&(await request.get(process.env.PLAYWRIGHT_GAME_HEALTH_URL||'http://localhost:2567/health')).ok();}catch{return false;}
  },{timeout:30000}).toBe(true);
});
test.afterEach(async({page})=>{await page.request.post('/api/auth/logout',{data:{}}).catch(()=>{});});
async function createAccount(page:Page,suffix:string,customize?:(page:Page)=>Promise<void>):Promise<string>{
  const email=`${suffix}@example.com`;
  await page.goto('/');
  await page.getByRole('button',{name:'Criar conta',exact:true}).click();
  await page.getByLabel('Seu nome',{exact:true}).fill(suffix);
  await page.getByLabel('Usuário',{exact:true}).fill(suffix);
  await page.getByLabel('E-mail',{exact:true}).fill(email);
  await page.getByLabel('Senha',{exact:true}).fill(password);
  const registrationResponse=page.waitForResponse(response=>response.url().endsWith('/api/auth/register')&&response.request().method()==='POST');
  await page.getByRole('button',{name:'Criar minha conta'}).click();
  const registration=await registrationResponse;
  expect(registration.ok()).toBe(true);
  const {verificationRequired}=await registration.json();
  await expect(page.getByRole('heading',{name:'Monte seu personagem'})).toBeVisible();
  if(customize)await customize(page);
  await page.getByRole('button',{name:'Criar personagem e continuar'}).click();
  if(verificationRequired){
    await page.getByRole('button',{name:'Caixa de e-mail local'}).click();
    const mail=page.locator('.mail-message').filter({has:page.locator('small',{hasText:email})});
    await mail.getByRole('button',{name:'Confirmar e-mail'}).click();
    await expect(page.locator('#auth-message')).toContainText('E-mail confirmado');
  }
  if(verificationRequired)await page.getByRole('button',{name:'Entrar no bar'}).click();
  await gameReady(page);
  return email;
}

test('leaving while admission data is loading cannot reconnect the player behind the lobby',async({page})=>{
  let release!:()=>void;
  const held=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/api/blocks',async route=>{await held;await route.continue();});
  await page.goto('/');
  await page.getByLabel('E-mail',{exact:true}).fill('jogador1@bar.local');
  await page.getByLabel('Senha',{exact:true}).fill(process.env.DEMO_PASSWORD||'ButecoDemo2026!');
  const loading=page.waitForRequest(request=>request.url().endsWith('/api/blocks'));
  await page.getByRole('button',{name:'Entrar no bar'}).click();
  await loading;
  await page.locator('#waiting').getByRole('button',{name:'Voltar à entrada'}).click();
  await expect(page.locator('#lobby')).toBeVisible();
  release();
  await expect.poll(()=>page.evaluate(()=>(window as any).barDebug.snapshot().world),{timeout:10000}).toBeUndefined();
  await expect(page.locator('#game')).toBeHidden();
});

async function selectSkin(page:Page,name:string):Promise<void>{
  const card=page.locator('.skin-card').filter({has:page.locator('b',{hasText:name})});
  await card.click();
  if(await page.getByRole('heading',{name:`Comprar ${name}`,exact:true}).isVisible()){
    await page.getByRole('button',{name:'Confirmar compra'}).click();
    await card.click();
  }
}

test('new accounts create a persistent custom character; previews, premium skins and remote changes stay separate',async({browser,page})=>{
  test.setTimeout(240000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const email=await createAccount(page,`char_${Date.now().toString(36)}`,async page=>{
    await page.getByLabel('Corpo',{exact:true}).selectOption('female');
    await page.getByLabel('Cabelo',{exact:true}).selectOption('long');
    await page.getByLabel('Tom de pele 6',{exact:true}).check({force:true});
    await page.getByLabel('Cor do cabelo 5',{exact:true}).check({force:true});
    await page.getByLabel('Cor dos olhos 3',{exact:true}).check({force:true});
    await page.getByLabel('Roupa base 3',{exact:true}).check({force:true});
    await expect(page.locator('#preview-status')).toHaveText('');
    await page.setViewportSize({width:1280,height:1100});
    await page.screenshot({path:'test-results/character-creator.png'});
    await page.setViewportSize({width:390,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await expect.poll(()=>page.locator('#character-preview').evaluate(canvas=>Math.abs(canvas.clientWidth-canvas.parentElement!.clientWidth)<2&&canvas.clientHeight===280)).toBe(true);
    await page.setViewportSize({width:960,height:640});
  });
  const id=await page.evaluate(()=>(window as any).barDebug.snapshot().localId);
  const appearance=(p:Page)=>p.evaluate((id)=>{const player=(window as any).barDebug.snapshot().world?.players?.[id];return {skin:player?.skin,character:player?.character??'{}'};},id);
  await expect.poll(async()=>JSON.parse((await appearance(page)).character).body).toBe('female');
  await expect.poll(()=>page.evaluate((id)=>(window as any).barDebug.animations().find((a:any)=>a.id===id)?.skin,id)).toBe('base-female');
  const original=(await appearance(page)).character;expect(JSON.parse(original).hair).toBe('long');
  const otherContext=await browser.newContext({viewport:{width:640,height:480}});const other=await otherContext.newPage();other.on('pageerror',e=>errors.push(e.message));
  try{
    await createAccount(other,`look_${Date.now().toString(36)}`);
    await expect.poll(async()=>(await appearance(other)).character).toBe(original);
    await expect.poll(()=>other.evaluate((id)=>(window as any).barDebug.animations().find((a:any)=>a.id===id)?.skin,id)).toBe('base-female');
    await page.keyboard.press('c');await page.getByRole('button',{name:'Personalizar',exact:true}).click();
    await page.getByLabel('Cabelo',{exact:true}).selectOption('none');
    await page.getByRole('button',{name:'Fechar janela'}).click();expect((await appearance(page)).character).toBe(original);
    await page.keyboard.press('c');await selectSkin(page,'Rafael');
    await expect.poll(async()=>(await appearance(other)).skin).toBe('rafael');
    expect((await appearance(page)).character).toBe(original);
    await page.keyboard.press('c');await page.locator('.custom-character-card').getByRole('button',{name:'Vestir',exact:true}).click();
    await expect.poll(async()=>(await appearance(other)).skin).toBe('custom');
    await page.keyboard.press('c');await page.getByRole('button',{name:'Personalizar',exact:true}).click();
    await expect(page.getByLabel('Cabelo',{exact:true})).toHaveValue('long');
    await page.getByLabel('Cabelo',{exact:true}).selectOption('buns');
    await page.getByRole('button',{name:'Salvar personagem'}).click();
    await expect.poll(async()=>JSON.parse((await appearance(other)).character).hair).toBe('buns');
    await page.screenshot({path:'test-results/character-in-game.png'});
    await page.getByRole('button',{name:'Sua conta',exact:true}).click();await page.getByRole('button',{name:'Sair da conta',exact:true}).click();
    await page.getByLabel('E-mail',{exact:true}).fill(email);await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar no bar'}).click();
    await gameReady(page);await expect.poll(async()=>JSON.parse((await appearance(page)).character).hair).toBe('buns');
    expect((await appearance(page)).skin).toBe('custom');expect(errors).toEqual([]);
  }finally{await other.request.post('/api/auth/logout',{data:{}}).catch(()=>{});await other.goto('about:blank');await otherContext.close();}
});

test('two independent accounts register, share a 3D bar, chat, block/report and reconnect',async({browser,page})=>{
  // Two character creators and two map loads on software WebGL take most of the default 90 s.
  test.setTimeout(180000);
  const errors:string[]=[];page.on('pageerror',err=>errors.push(err.message));
  const unique=Date.now().toString(36),name1=`ana_${unique}`,name2=`bia_${unique}`;
  await page.goto('/');await page.screenshot({path:'test-results/lobby.png'});
  await createAccount(page,name1);
  const otherContext=await browser.newContext({viewport:{width:640,height:480}});const other=await otherContext.newPage();other.on('pageerror',err=>errors.push(err.message));
  try{
    await createAccount(other,name2);
    await expect(page.locator('#occupancy')).toHaveText('2 / 32');
    await expect(other.locator('#occupancy')).toHaveText('2 / 32');
    await page.getByLabel('Mensagem por proximidade').fill('Boa noite, vizinha!');
    await page.locator('#chat-form').getByRole('button').click();
    await expect(other.locator('#messages')).toContainText('Boa noite, vizinha!');
    await page.getByRole('button',{name:'Pessoas no bar'}).click();
    const person=page.locator('.person').filter({hasText:name2});
    await expect(person).toBeVisible();
    await person.getByRole('button',{name:'Bloquear',exact:true}).click();
    await expect(person.getByRole('button',{name:'Desbloquear',exact:true})).toBeVisible();
    await person.getByRole('button',{name:'Denunciar',exact:true}).click();
    await page.getByLabel('Motivo',{exact:true}).fill('Relato de teste de integração.');
    await page.getByRole('button',{name:'Enviar denúncia'}).click();
    await expect(page.locator('#toasts')).toContainText('Denúncia registrada');
    await page.screenshot({path:'test-results/bar-multiplayer.png'});
    await page.keyboard.down('w');await page.waitForTimeout(700);await page.keyboard.up('w');
    await expect(page.locator('#waiting')).toBeHidden();
    await page.context().setOffline(true);await page.waitForTimeout(1000);await page.context().setOffline(false);
    await expect(page.locator('#waiting')).toBeHidden({timeout:20000});
    await expect(page.locator('#occupancy')).toHaveText('2 / 32');
    expect(errors).toEqual([]);
  }finally{
    await Promise.allSettled([page.request.post('/api/auth/logout',{data:{}}),other.request.post('/api/auth/logout',{data:{}})]);
    await otherContext.close();
  }
});

test('password recovery mail changes the password and permits a fresh login',async({page})=>{
  const name=`rec_${Date.now().toString(36)}`;
  const email=await createAccount(page,name);
  await page.getByRole('button',{name:'Sua conta'}).click();
  await page.getByRole('button',{name:'Sair da conta',exact:true}).click();
  await page.getByRole('button',{name:'Esqueci minha senha'}).click();
  await page.getByLabel('E-mail da conta').fill(email);
  await page.getByRole('button',{name:'Recuperar acesso'}).click();
  await expect(page.locator('#auth-message')).toContainText('receberá um link');
  await page.getByRole('button',{name:'Caixa de e-mail local'}).click();
  const mail=page.locator('.mail-message').filter({has:page.locator('small',{hasText:email})}).filter({hasText:'Redefina sua senha'});
  await mail.getByRole('button',{name:'Criar nova senha'}).click();
  await page.getByLabel('Nova senha',{exact:true}).fill('NovaSenhaButeco2026!');
  await page.getByRole('button',{name:'Salvar nova senha'}).click();
  await expect(page.locator('#auth-message')).toContainText('Senha atualizada');
  await page.getByLabel('E-mail',{exact:true}).fill(email);await page.getByLabel('Senha',{exact:true}).fill('NovaSenhaButeco2026!');
  await page.getByRole('button',{name:'Entrar no bar'}).click();await gameReady(page);
  await page.request.post('/api/auth/logout',{data:{}});
});

test('keyboard movement reaches blackjack, a full round settles and admin events reach the scene',async({page})=>{
  test.setTimeout(180000);
  const errors:string[]=[];page.on('pageerror',err=>errors.push(err.message));
  await page.goto('/');
  await page.getByLabel('E-mail',{exact:true}).fill('admin@bar.local');
  await page.getByLabel('Senha',{exact:true}).fill(process.env.DEMO_PASSWORD||'ButecoDemo2026!');
  await page.getByRole('button',{name:'Entrar no bar'}).click();
  await gameReady(page);
  await expect(page.locator('#admin-button')).toBeVisible();
  for(const [x,z] of [...TO_UPSTAIRS,[15.85,-7.4],[16.28,-7.4]])await walkTo(page,x,z,.12);
  // Movement arrives in fixed ticks; touch the table edge instead of oscillating around a sub-tick target.
  await page.keyboard.press('d',{delay:150});
  await expect(page.locator('#context-label')).toHaveText('Jogar blackjack');
  await page.keyboard.press('e');await expect(page.locator('#blackjack')).toBeVisible();
  await page.getByRole('button',{name:'Começar rodada'}).click();
  await expect(page.locator('#blackjack h2')).not.toHaveText('Puxe uma cadeira');
  const stop=page.getByRole('button',{name:'Parar',exact:true});
  if(await stop.isVisible())await stop.click();
  await expect(page.locator('#blackjack h2')).toHaveText('A rodada fechou');
  await expect.poll(async()=>{const response=await page.request.get('/api/stats');return (await response.json()).gamesPlayed;}).toBeGreaterThan(0);
  await page.screenshot({path:'test-results/blackjack.png'});
  await page.getByRole('button',{name:'Sair da mesa'}).click();
  for(const [button,title] of [['Apagão','Quem esqueceu de pagar a luz?'],['O inconveniente','O Zé acordou inspirado.'],['Festa','Essa rodada é de dança!']]){
    await page.getByRole('button',{name:'Administração',exact:true}).click();
    await page.getByRole('button',{name:button}).click();
    await page.getByRole('button',{name:'Fechar janela'}).click();
    await expect(page.locator('#event-banner')).toContainText(title);
    await page.screenshot({path:`test-results/event-${button.toLowerCase().replaceAll(' ','-')}.png`});
  }
  const metrics=await page.evaluate(()=>(window as any).barDebug.performance());
  console.log('Browser rendering sample:',JSON.stringify(metrics));
  expect(errors).toEqual([]);
  await page.getByRole('button',{name:'Sua conta'}).click();
  await page.getByRole('button',{name:'Sair da conta',exact:true}).click();
});
