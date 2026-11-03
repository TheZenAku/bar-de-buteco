import {expect,test,type Page} from '@playwright/test';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {enterAsAdmin} from './moto-helpers';
import {showCard,wearCard} from './collection-helpers';

const fixture=`/@fs/${path.join(fileURLToPath(new URL('../fixtures/collection.html',import.meta.url))).replace(/\\/g,'/')}`;
const self=(page:Page)=>page.evaluate(()=>{const d=(window as any).barDebug.snapshot();return d.world?.players?.[d.localId];});

test.describe('the collection, on its own',()=>{
  test.beforeEach(async({page})=>{await page.goto(fixture);await expect(page.locator('.sc-big')).toBeVisible();});

  test('one card per character, variants beside the one in focus, and the keys go through them',async({page})=>{
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await expect(page.locator('.cl-hand-card')).toHaveCount(8);
    await expect(page.locator('.cl-hand-card[aria-selected="true"]')).toHaveAttribute('data-base','rafael');
    await expect(page.locator('.cl-variant')).toHaveCount(2);
    await expect(page.locator('.cl-name')).toHaveText('Rafael');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.cl-name')).toHaveText('Rafael Rosé');
    await expect(page.locator('.sc-big')).toHaveAttribute('data-rarity','legendary');
    await expect(page.locator('.sc-big .sc-studs')).toBeVisible();
    await expect(page.locator('.cl-buy [data-cl="buy"]')).toContainText('2.500');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.cl-name')).toHaveText('Read');
    await expect(page.locator('.cl-variants')).toHaveClass(/alone/);
    await page.keyboard.press('ArrowLeft');
    // Back on Rafael, on the variant last looked at.
    await expect(page.locator('.cl-name')).toHaveText('Rafael Rosé');
    expect(errors).toEqual([]);
  });

  test('buying takes two clicks, the reveal lands on its face, and Enter wears it',async({page})=>{
    await page.keyboard.press('ArrowDown');
    await page.locator('.cl-buy [data-cl="buy"]').click();
    await expect(page.locator('#wallet-balance')).toHaveText('3.400 moedas');
    await page.locator('.cl-buy [data-cl="buy-confirm"]').click();
    await expect(page.locator('.cl-reveal.landed')).toBeVisible({timeout:5000});
    await expect(page.locator('.cl-reveal-label')).toContainText('Lendário');
    await expect.poll(()=>page.locator('#wallet-balance').textContent(),{timeout:4000}).toBe('900 moedas');
    await page.keyboard.press('Enter');
    await expect(page.locator('.cl-reveal')).toHaveCount(0);
    await expect(page.locator('.cl-buy .cl-cta')).toHaveText(/Vestindo/);
    await expect(page.locator('.cl-progress small')).toHaveText('3 de 9 cartas');
    // The hand shows what is being worn.
    await expect(page.locator('.cl-hand-card[data-base="rafael"] .sc-card')).toHaveAttribute('data-skin','rafael-rose');
  });

  test('what cannot be bought says why, and a skill takes a card of its character first',async({page})=>{
    await page.evaluate(()=>(window as any).fixture.open({balance:100},'rafael-rose'));
    await expect(page.locator('.cl-buy .cl-cta')).toHaveText('Moedas insuficientes');
    await expect(page.locator('.cl-buy .cl-cta')).toBeDisabled();
    await expect(page.locator('[data-skill="air-kick"] [data-cl="skill-buy"]')).toBeDisabled();
    await page.evaluate(()=>{const f=(window as any).fixture;f.open({balance:5000});});
    await expect(page.locator('[data-skill="karate"]')).toContainText('Liberada');
    await page.locator('[data-skill="air-kick"] [data-cl="skill-buy"]').click();
    await page.locator('[data-skill="air-kick"] [data-cl="skill-confirm"]').click();
    await expect(page.locator('[data-skill="air-kick"]')).toContainText('Liberada');
    await expect.poll(()=>page.locator('#wallet-balance').textContent(),{timeout:4000}).toBe('4.200 moedas');
  });

  test('dragging the card turns the character, and it comes back to the sharp picture',async({page})=>{
    const box=(await page.locator('.cl-flip').boundingBox())!;
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
    // The sheet is only asked for once the pointer is over the card.
    await expect.poll(()=>page.locator('.sc-big .sc-sprite').evaluate(node=>(node as HTMLElement).style.backgroundImage),{timeout:10_000}).toContain('turn/rafael');
    await page.mouse.down();await page.mouse.move(box.x+box.width/2-108,box.y+box.height/2,{steps:6});
    await expect.poll(()=>page.locator('.sc-big .sc-sprite').evaluate(node=>getComputedStyle(node).visibility)).toBe('visible');
    expect(await page.locator('.sc-big .sc-art').evaluate(node=>getComputedStyle(node).visibility)).toBe('hidden');
    await page.mouse.up();await page.mouse.move(4,4);
    await expect.poll(()=>page.locator('.sc-big .sc-art').evaluate(node=>getComputedStyle(node).visibility),{timeout:8000}).toBe('visible');
  });

  test('the card in focus is the only thing moving, and it goes on running smoothly',async({page})=>{
    const stats=await page.evaluate(()=>new Promise<{layers:number;gaps:number}>(resolve=>{
      let last=performance.now(),gaps=0,frames=0;
      const step=(now:number)=>{if(now-last>100)gaps++;last=now;if(++frames<60)requestAnimationFrame(step);else resolve({layers:document.querySelectorAll('.sc-big').length,gaps});};
      requestAnimationFrame(step);
    }));
    expect(stats.layers).toBe(1);
    expect(stats.gaps).toBeLessThan(6);
  });

  test('it fits a phone with no sideways scroll',async({page})=>{
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await expect(page.locator('.cl-buy .cl-cta')).toBeVisible();
  });
});

test('in the game: a variant is its own purchase, skills are bought and work in every variant, and the panel manages the cards',async({page})=>{
  test.setTimeout(420_000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await enterAsAdmin(page);
  const id=(await self(page)).id as string;
  // The test database survives runs.
  const player=(op:object)=>page.request.post('/api/admin/player',{data:{playerId:id,reason:'Volta ao começo',...op}});
  for(const skin of ['rafael','rafael-rose'])await player({op:'skin',skinId:skin,grant:false});
  for(const skill of ['karate','air-kick'])await player({op:'skill',skillId:skill,grant:false});
  await page.request.post('/api/admin/collection',{data:{key:'skin:rafael-rose',rarity:'legendary',availability:'sale',price:2500,description:'O mesmo pé pesado, de quimono escuro e faixa vermelha.',reason:'Volta ao começo'}});
  await page.request.post('/api/admin/wallet',{data:{playerId:id,operation:'add',amount:5000,reason:'Saldo do teste',requestId:crypto.randomUUID()}});
  await page.reload();await page.getByRole('button',{name:'Entrar no bar'}).click();
  await expect(page.locator('#waiting')).toBeHidden({timeout:60_000});
  await expect.poll(async()=>(await self(page))?.skin,{timeout:30_000}).toBeTruthy();

  await wearCard(page,'rafael-rose');
  await expect.poll(async()=>(await self(page))?.skin,{timeout:30_000}).toBe('rafael-rose');
  // The rosé card alone: the original is still locked, and the skills are not on the hotbar yet.
  await showCard(page,'rafael');
  await expect(page.locator('.cl-buy [data-cl="buy"]')).toContainText('1.000');
  await expect(page.locator('#skill-button')).toBeHidden();
  await page.keyboard.press('c');
  await page.keyboard.press('x');await page.waitForTimeout(400);
  expect((await self(page))?.animationState,'A skill that was not bought does nothing').not.toBe('kick');

  await showCard(page,'rafael-rose');
  await page.locator('[data-skill="karate"] [data-cl="skill-buy"]').click();
  await page.locator('[data-skill="karate"] [data-cl="skill-confirm"]').click();
  await expect(page.locator('[data-skill="karate"]')).toContainText('Liberada',{timeout:15_000});
  await page.keyboard.press('c');
  await expect(page.locator('#skill-button')).toBeVisible();
  // The room knows at once, on the variant too.
  await expect.poll(async()=>{await page.keyboard.press('x');await page.waitForTimeout(250);return (await self(page))?.animationState;},{timeout:15_000}).toBe('kick');
  await expect.poll(async()=>(await self(page))?.animationState,{timeout:15_000}).not.toBe('kick');

  // The administration closes a card and moves its price; the player sees it next time.
  await page.getByRole('button',{name:'Administração',exact:false}).first().click();
  await page.locator('[data-admin-nav="collection"]').click();
  const row=page.locator('.admin-coll-card[data-key="skin:rafael"]');await row.click();
  await expect(page.locator('[data-coll-form]')).toBeVisible();
  await page.locator('[data-coll-rarity="rare"]').click();
  await page.locator('[data-admin-chip="availability"][data-value="closed"]').click();
  await expect(page.locator('[data-coll-preview] .sc-card')).toHaveAttribute('data-rarity','rare');
  await page.locator('[data-coll-form] input[name="price"]').fill('1234');
  await page.locator('[data-coll-form] textarea[name="reason"]').fill('Teste da coleção');
  await page.locator('[data-coll-form] button[type="submit"]').click();
  await expect(page.locator('.admin-feedback')).toContainText('atualizada');
  await page.getByRole('button',{name:'Fechar janela'}).click();
  await showCard(page,'rafael');
  await expect(page.locator('.sc-big')).toHaveAttribute('data-rarity','rare');
  await expect(page.locator('.cl-buy .cl-cta')).toHaveText(/Fora de venda/);
  await page.keyboard.press('c');
  await page.request.post('/api/admin/collection',{data:{key:'skin:rafael',rarity:'epic',availability:'sale',price:1000,description:'Quimono, faixa na cintura e pé pesado.',reason:'Volta ao começo'}});
  expect(errors).toEqual([]);
  await page.request.post('/api/auth/logout',{data:{}}).catch(()=>{});
});
