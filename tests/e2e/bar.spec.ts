import {test,expect,type Page} from '@playwright/test';

const password='ButecoTeste2026!';
test.beforeEach(async({request})=>{
  await expect.poll(async()=>{
    try{return (await request.get('/api/health')).ok()&&(await request.get('http://localhost:2567/health')).ok();}catch{return false;}
  },{timeout:30000}).toBe(true);
});
test.afterEach(async({page})=>{await page.request.post('/api/auth/logout',{data:{}}).catch(()=>{});});
async function createAccount(page:Page,suffix:string):Promise<string>{
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
  await expect(page.locator('#auth-message')).toContainText('Conta criada');
  await expect(page.getByLabel('E-mail',{exact:true})).toHaveValue(email);
  if(verificationRequired){
    await page.getByRole('button',{name:'Caixa de e-mail local'}).click();
    const mail=page.locator('.mail-message').filter({has:page.locator('small',{hasText:email})});
    await mail.getByRole('button',{name:'Confirmar e-mail'}).click();
    await expect(page.locator('#auth-message')).toContainText('E-mail confirmado');
  }
  await page.getByLabel('E-mail',{exact:true}).fill(email);
  await page.getByLabel('Senha',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Entrar no bar'}).click();
  await expect(page.locator('#game')).toBeVisible();
  await expect(page.locator('#waiting')).toBeHidden();
  return email;
}

test('two independent accounts register, share a 3D bar, chat, block/report and reconnect',async({browser,page})=>{
  const errors:string[]=[];page.on('pageerror',err=>errors.push(err.message));
  const unique=Date.now().toString(36),name1=`ana_${unique}`,name2=`bia_${unique}`;
  await page.goto('/');await page.screenshot({path:'test-results/lobby.png'});
  await createAccount(page,name1);
  const otherContext=await browser.newContext();const other=await otherContext.newPage();other.on('pageerror',err=>errors.push(err.message));
  try{
    await createAccount(other,name2);
    await expect(page.locator('#occupancy')).toHaveText('2 / 32');
    await expect(other.locator('#occupancy')).toHaveText('2 / 32');
    await page.getByLabel('Mensagem por proximidade').fill('Boa noite, vizinha!');
    await page.locator('#chat-form').getByRole('button').click();
    await expect(other.locator('#messages')).toContainText('Boa noite, vizinha!');
    await page.getByRole('button',{name:'Pessoas no bar'}).click();
    await expect(page.locator('.person')).toContainText(name2);
    await page.getByRole('button',{name:'Bloquear',exact:true}).click();
    await expect(page.getByRole('button',{name:'Desbloquear',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Denunciar',exact:true}).click();
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
    await Promise.allSettled([page.request.post('/api/auth/logout',{data:{}}),other.request.post('http://localhost:5173/api/auth/logout',{data:{}})]);
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
  await page.getByRole('button',{name:'Entrar no bar'}).click();await expect(page.locator('#waiting')).toBeHidden();
  await page.request.post('/api/auth/logout',{data:{}});
});

test('keyboard movement reaches blackjack, a full round settles and admin events reach the scene',async({page})=>{
  const errors:string[]=[];page.on('pageerror',err=>errors.push(err.message));
  await page.goto('/');
  await page.getByLabel('E-mail',{exact:true}).fill('admin@bar.local');
  await page.getByLabel('Senha',{exact:true}).fill(process.env.DEMO_PASSWORD||'ButecoDemo2026!');
  await page.getByRole('button',{name:'Entrar no bar'}).click();
  await expect(page.locator('#waiting')).toBeHidden();
  await expect(page.locator('#admin-button')).toBeVisible();
  // Read copies of development telemetry; every movement/action still uses keyboard and UI.
  const playerPosition=()=>page.evaluate(()=>{const {world,localId}=(window as any).barDebug.snapshot();return world?.players[localId] as {x:number;z:number}|undefined;});
  await expect.poll(playerPosition).toBeTruthy();
  async function walkTo(x:number,z:number){
    for(let step=0;step<100;step++){
      const position=(await playerPosition())!;const dx=x-position.x,dz=z-position.z;
      if(Math.hypot(dx,dz)<0.55)return;
      const horizontal=dx*Math.cos(.15)-dz*Math.sin(.15),forward=-dx*Math.sin(.15)-dz*Math.cos(.15);
      const key=Math.abs(horizontal)>Math.abs(forward)?horizontal>0?'d':'a':forward>0?'w':'s';
      await page.keyboard.down(key);await page.waitForTimeout(150);await page.keyboard.up(key);
    }
    throw new Error(`Could not reach ${x},${z}: ${JSON.stringify(await playerPosition())}`);
  }
  await walkTo(1,1);await walkTo(5,-1);
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
