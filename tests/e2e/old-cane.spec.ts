import {test,expect,type Page} from '@playwright/test';
import {DEFAULT_CHARACTER} from '../../packages/shared/src/character';

test('chat toggles only the cane and gait, replicates to other players and works with existing skins',async({browser,page,request})=>{
  test.setTimeout(240000);
  await expect.poll(async()=>{try{return (await request.get('/api/health')).ok()&&(await request.get('http://localhost:2677/health')).ok();}catch{return false;}},{timeout:30000}).toBe(true);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const suffix=Date.now().toString(36),password='CaneTeste2026!';
  const account=async(p:Page,name:string)=>{
    const response=await p.request.post('/api/auth/register',{data:{email:`${name}_${suffix}@example.com`,username:`${name}_${suffix}`,displayName:name,password}});expect(response.ok()).toBe(true);
    const id=(await response.json()).user.id;
    expect((await p.request.post('/api/character',{data:{...DEFAULT_CHARACTER,top:'sweater',bottom:'trousers',footwear:'derby',accessory:'glasses'}})).ok()).toBe(true);
    await p.goto('/');await p.getByRole('button',{name:'Entrar no bar'}).click();
    await expect(p.locator('#waiting')).toBeHidden({timeout:60000});
    await expect.poll(()=>p.evaluate(()=>{const s=(window as any).barDebug.snapshot();return !!s.world?.players?.[s.localId]?.connected;}),{timeout:30000}).toBe(true);
    return id;
  };
  const id=await account(page,'bengala');
  const animation=(p:Page)=>p.evaluate(id=>(window as any).barDebug.animations().find((a:any)=>a.id===id),id);
  const appearance=(p:Page)=>p.evaluate(id=>{const p=(window as any).barDebug.snapshot().world.players[id];return {skin:p.skin,character:p.character,oldWalk:p.oldWalk};},id);
  const command=async()=>{await page.getByLabel('Mensagem por proximidade').fill('/velho');await page.locator('#chat-form').getByRole('button').click();};
  await expect.poll(async()=>(await animation(page))?.cane?.enabled).toBe(false);
  const original=await appearance(page);
  const context=await browser.newContext({viewport:{width:640,height:480}}),other=await context.newPage();other.on('pageerror',e=>errors.push(e.message));
  try{
    await account(other,'vizinho');await other.getByRole('button',{name:'Sua conta',exact:true}).click();await page.bringToFront();
    await command();await expect.poll(async()=>(await appearance(other)).oldWalk).toBe(true);
    await expect.poll(async()=>(await animation(other))?.cane).toMatchObject({enabled:true,parent:'hand_r',renders:1});
    await expect.poll(async()=>(await animation(page))?.clip).toBe('OldCaneHold');
    expect(await appearance(page)).toMatchObject({skin:original.skin,character:original.character});
    await page.locator('#world').hover();await page.mouse.wheel(0,-700);
    await page.keyboard.down('Shift');await page.keyboard.down('d');
    try{
      await expect.poll(async()=>(await animation(other))?.clip).toBe('OldCaneWalk');
      await expect.poll(async()=>(await animation(page))?.speed).toBeCloseTo(1,3);
      await page.screenshot({path:'docs/previews/old-cane.png'});
    }finally{await page.keyboard.up('d');await page.keyboard.up('Shift');}
    await expect.poll(async()=>(await animation(page))?.clip).toBe('OldCaneHold');
    for(const skin of ['Nathan','Leandro','Rafael','Read']){
      await page.keyboard.press('c');const card=page.locator('.skin-card').filter({has:page.locator('b',{hasText:skin})});await card.click();
      await page.getByRole('button',{name:'Confirmar compra'}).click();await card.click();
      await expect.poll(async()=>(await animation(other))?.skin).toBe(skin.toLowerCase());
      await expect.poll(async()=>(await animation(other))?.cane?.enabled).toBe(true);
      await expect.poll(async()=>(await animation(other))?.clip).toBe('OldCaneHold');
      expect((await appearance(page)).character).toBe(original.character);
    }
    await command();await expect.poll(async()=>(await appearance(other)).oldWalk).toBe(false);
    await expect.poll(async()=>(await animation(other))?.cane?.enabled).toBe(false);
    await expect.poll(async()=>(await animation(page))?.clip).toBe('Idle');
    expect((await appearance(page)).skin).toBe('read');expect((await appearance(page)).character).toBe(original.character);
    const wardrobe=await (await page.request.get('/api/wardrobe')).json();expect(wardrobe.character).toEqual(JSON.parse(original.character));
    expect(errors).toEqual([]);
  }finally{
    await Promise.allSettled([page.request.post('/api/auth/logout',{data:{}}),other.request.post('/api/auth/logout',{data:{}})]);
    await other.goto('about:blank');await context.close();
  }
});
