import {test,expect,type Page} from '@playwright/test';
import {DEFAULT_CHARACTER,MALE_CLOTHING} from '../../packages/shared/src/character';
import {previewPath} from './preview-path';

test('male clothing previews, animates, persists and replicates independently of other characters and premium skins',async({page,browser,request})=>{
  test.setTimeout(240000);
  await expect.poll(async()=>{try{return (await request.get('/api/health')).ok()&&(await request.get('http://localhost:2677/health')).ok();}catch{return false;}},{timeout:30000}).toBe(true);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const unique=Date.now().toString(36),email=`clothes_${unique}@example.com`,password='ClothingTeste2026!';
  const registered=await page.request.post('/api/auth/register',{data:{email,password,username:`cloth_${unique}`,displayName:'Teste de roupas'}});expect(registered.ok()).toBe(true);
  const id=(await registered.json()).user.id;
  const ready=async(p:Page)=>{await expect(p.locator('#waiting')).toBeHidden({timeout:60000});await expect.poll(()=>p.evaluate(()=>{const s=(window as any).barDebug.snapshot();return !!s.world?.players[s.localId]?.connected;}),{timeout:30000}).toBe(true);};
  const rendered=(p:Page,target=id)=>p.evaluate(id=>(window as any).barDebug.animations().find((a:any)=>a.id===id),target);
  const clothing={tee:{enabled:false},pants:{enabled:false},sneakers:{enabled:false},sweater:{enabled:true,skinned:true,color:'#873e37'},trousers:{enabled:true,skinned:true,color:'#111820'},derby:{enabled:true,skinned:true,color:'#d7d5d0'},glasses:{enabled:true,skinned:true,color:'#111820'}};
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Monte seu personagem'})).toBeVisible();
  await expect(page.locator('#male-clothing select')).toHaveCount(0);
  for(const {id} of MALE_CLOTHING){
    await expect(page.locator(`[data-clothing-image="${id}"]`)).toBeVisible();
    await expect.poll(()=>page.locator(`[data-clothing-image="${id}"]`).evaluate((image:HTMLImageElement)=>image.complete&&image.naturalWidth>=256)).toBe(true);
  }
  const originalThumbnail=await page.locator('[data-clothing-image="tee"]').getAttribute('src');
  await chooseClothing(page,'top','sweater');
  await chooseClothing(page,'bottom','trousers');
  await chooseClothing(page,'footwear','derby');await chooseClothing(page,'accessory','glasses');
  await page.getByLabel('Cor da blusa 4',{exact:true}).check({force:true});
  await expect.poll(()=>page.locator('[data-clothing-image="tee"]').getAttribute('src')).not.toBe(originalThumbnail);
  await page.getByLabel('Cor da calça 2',{exact:true}).check({force:true});
  await page.getByLabel('Corpo',{exact:true}).selectOption('female');await expect(page.locator('#male-clothing')).toBeHidden();
  await expect(page.locator('#preview-status')).toHaveText('');
  await page.getByLabel('Corpo',{exact:true}).selectOption('male');await expect(page.getByRole('radio',{name:'Suéter',exact:true})).toBeChecked();
  await expect(page.locator('#preview-status')).toHaveText('');
  await page.setViewportSize({width:1100,height:1000});await page.locator('#character-preview').scrollIntoViewIfNeeded();
  await page.locator('#character-preview').screenshot({path:previewPath('male-clothing.png')});
  await page.locator('#male-clothing').scrollIntoViewIfNeeded();await page.screenshot({path:previewPath('clothing-menu.png')});
  await page.setViewportSize({width:390,height:844});await page.getByRole('group',{name:'Calçados',exact:true}).scrollIntoViewIfNeeded();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Criar personagem e continuar'}).click();await ready(page);
  await expect.poll(async()=>(await rendered(page))?.clothing).toMatchObject(clothing);
  const wardrobe=(await (await page.request.get('/api/wardrobe')).json());expect(wardrobe.character).toMatchObject({top:'sweater',bottom:'trousers',footwear:'derby',accessory:'glasses',topColor:'#873e37',bottomColor:'#111820'});
  await page.setViewportSize({width:960,height:640});
  const context=await browser.newContext({viewport:{width:640,height:480}}),other=await context.newPage();other.on('pageerror',e=>errors.push(e.message));
  try{
    const response=await other.request.post('/api/auth/register',{data:{email:`observer_${unique}@example.com`,password,username:`obs_${unique}`,displayName:'Observador'}});expect(response.ok()).toBe(true);
    const otherId=(await response.json()).user.id;
    expect((await other.request.post('/api/character',{data:DEFAULT_CHARACTER})).ok()).toBe(true);
    await other.goto('/');await other.getByRole('button',{name:'Entrar no bar'}).click();await ready(other);
    await expect.poll(async()=>(await rendered(other))?.clothing).toMatchObject(clothing);
    await expect.poll(async()=>(await rendered(other,otherId))?.clothing).toMatchObject(Object.fromEntries(MALE_CLOTHING.map(item=>[item.id,{enabled:false}])));
    // Keep the observer connected, with its world updating behind a modal, while
    // avoiding two full map renderers competing on the software WebGL runner.
    await other.getByRole('button',{name:'Sua conta',exact:true}).click();await page.bringToFront();
    await page.keyboard.down('d');try{await expect.poll(async()=>(await rendered(other))?.clip).toBe('Walk');}finally{await page.keyboard.up('d');}
    await expect.poll(async()=>(await rendered(other))?.clip).toBe('Idle');
    await page.keyboard.press('g');await expect.poll(async()=>(await rendered(other))?.clip).toBe('Dance');
    await expect.poll(async()=>(await rendered(other))?.clothing).toMatchObject(clothing);await page.keyboard.press('g');
    await page.keyboard.press('c');const premium=page.locator('.skin-card').filter({has:page.locator('b',{hasText:'Rafael'})});await premium.click();
    await page.getByRole('button',{name:'Confirmar compra'}).click();await premium.click();await expect.poll(async()=>(await rendered(other))?.skin).toBe('rafael');
    await page.keyboard.press('c');await page.locator('.custom-character-card').getByRole('button',{name:'Vestir',exact:true}).click();
    await expect.poll(async()=>(await rendered(other))?.clothing).toMatchObject(clothing);
    await page.keyboard.press('c');await page.getByRole('button',{name:'Personalizar',exact:true}).click();
    for(const slot of ['top','bottom','footwear','accessory'])await chooseClothing(page,slot,'none');
    await page.getByRole('button',{name:'Salvar personagem'}).click();
    await expect.poll(async()=>(await rendered(other))?.clothing).toMatchObject(Object.fromEntries(MALE_CLOTHING.map(item=>[item.id,{enabled:false}])));
    await page.keyboard.press('c');await page.getByRole('button',{name:'Personalizar',exact:true}).click();
    await chooseClothing(page,'top','sweater');await chooseClothing(page,'bottom','trousers');await chooseClothing(page,'footwear','derby');await chooseClothing(page,'accessory','glasses');
    await page.getByRole('button',{name:'Salvar personagem'}).click();await expect.poll(async()=>(await rendered(other))?.clothing).toMatchObject(clothing);
    await page.getByRole('button',{name:'Sua conta',exact:true}).click();await page.getByRole('button',{name:'Sair da conta',exact:true}).click();
    await page.getByLabel('E-mail',{exact:true}).fill(email);await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar no bar'}).click();await ready(page);
    await expect.poll(async()=>(await rendered(page))?.clothing).toMatchObject(clothing);expect(errors).toEqual([]);
  }finally{
    await Promise.allSettled([page.request.post('/api/auth/logout',{data:{}}),other.request.post('/api/auth/logout',{data:{}})]);
    await other.goto('about:blank');await context.close();
  }
});

async function chooseClothing(page:Page,slot:string,id:string){
  const radio=page.locator(`input[type="radio"][name="${slot}"][value="${id}"]`);
  await radio.locator("..").click();await expect(radio).toBeChecked();
}
