import {expect,test} from '@playwright/test';

test('o jogo real usa o Avatar V2 no criador, mundo e movimento',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error'&&!message.text().startsWith('Failed to load resource:'))errors.push(message.text());});page.on('response',response=>{if(response.status()>=400)errors.push(`HTTP ${response.status()} ${response.url()}`);});
  const suffix=Date.now().toString(36),password='AvatarV2Live2026!';
  const response=await page.request.post('/api/auth/register',{headers:{'X-Forwarded-For':'127.0.0.44'},data:{email:`avatarv2_${suffix}@example.com`,username:`avatarv2_${suffix}`,displayName:'Avatar V2',password}});
  expect(response.ok(),await response.text()).toBeTruthy();
  await page.goto('/');await expect(page.getByRole('heading',{name:'Monte seu personagem'})).toBeVisible();
  await expect(page.locator('#character-clothing')).toBeVisible();await expect(page.locator('.clothing-v2-badge').first()).toBeVisible();
  await expect(page.locator('#preview-status')).toHaveText('',{timeout:60000});
  await page.locator('#character-preview').screenshot({path:'test-results/avatar-v2/game-creator-v2.png'});
  await page.getByRole('button',{name:'Criar personagem e continuar'}).click();
  await expect(page.locator('#waiting')).toBeHidden({timeout:60000});
  const current=()=>page.evaluate(()=>{const debug=(window as unknown as {barDebug:{snapshot:()=>{localId:string};animations:()=>Array<{id:string;skin?:string;clip?:string;tracks:string[]}>}}).barDebug;const id=debug.snapshot().localId;return debug.animations().find(value=>value.id===id);});
  await expect.poll(current,{timeout:60000}).toMatchObject({skin:'v2-male',clip:'Idle'});
  expect((await current())!.tracks).toHaveLength(18);
  await page.keyboard.down('w');await expect.poll(async()=>(await current())?.clip,{timeout:15000}).toBe('Walk');await page.waitForTimeout(500);await page.keyboard.up('w');
  await page.locator('#world').screenshot({path:'test-results/avatar-v2/game-world-v2.png'});
  expect(errors).toEqual([]);
});
