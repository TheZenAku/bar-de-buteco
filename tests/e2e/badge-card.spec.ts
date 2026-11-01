import {fileURLToPath} from 'node:url';
import {test,expect,type Page} from '@playwright/test';

const fixture='/@fs/'+fileURLToPath(new URL('../fixtures/badge-card.html',import.meta.url)).replaceAll('\\','/');
const shots=process.env.PROFILE_SHOTS;
const shot=async(page:Page,name:string)=>{if(shots)await page.screenshot({path:`${shots}/${name}.png`});};
const open=async(page:Page,rarity:string,extra={})=>{
  await page.evaluate(([rarity,extra])=>(window as any).fixture.open(rarity,extra),[rarity,extra] as const);
  await expect(page.locator('.bc-card')).toBeVisible();
  await page.waitForTimeout(500);
};
const tilt=(page:Page)=>page.locator('.bc-card').evaluate(card=>{const m=new DOMMatrix(getComputedStyle(card).transform);return {x:m.m13,y:m.m23,glare:getComputedStyle(card).getPropertyValue('--px')};});

test.beforeEach(async({page})=>{await page.goto(fixture);await page.waitForFunction(()=>(window as any).fixture);});

test('the card tilts toward the pointer, its glare follows, and it settles back when the pointer leaves',async({page})=>{
  await open(page,'rare');
  const box=(await page.locator('.bc-scene').boundingBox())!;
  await page.mouse.move(box.x+box.width*.92,box.y+box.height*.5);
  await expect.poll(async()=>(await tilt(page)).x,{message:'the side under the pointer comes forward'}).toBeGreaterThan(.15);
  expect(Number.parseFloat((await tilt(page)).glare)).toBeGreaterThan(70);
  await page.mouse.move(box.x+box.width*.08,box.y+box.height*.5);
  await expect.poll(async()=>(await tilt(page)).x).toBeLessThan(-.15);
  await page.mouse.move(box.x+box.width*.5,box.y+box.height*.92);
  await expect.poll(async()=>(await tilt(page)).y,{message:'and so does the bottom'}).toBeGreaterThan(.15);
  await shot(page,'card-rare-tilted');
  // Away from it, only a small sway remains.
  await page.mouse.move(5,5);
  await expect.poll(async()=>Math.abs((await tilt(page)).x)).toBeLessThan(.12);
});

test('only the rarest is studded, and its stones change with the tilt',async({page})=>{
  for(const rarity of ['common','uncommon','rare','epic']){
    await open(page,rarity);
    await expect(page.locator('.bc-studs')).toHaveCount(0);
    await expect(page.locator('.bc-holo')).toHaveCount(0);
    await expect(page.locator('.bc-rarity b.on')).toHaveCount(['common','uncommon','rare','epic'].indexOf(rarity)+1);
    await shot(page,`card-${rarity}`);
    await page.keyboard.press('Escape');
    await expect(page.locator('.bc-backdrop')).toHaveCount(0);
  }
  await open(page,'legendary');
  await expect(page.locator('.bc-rarity')).toContainText('Lendário');
  await expect(page.locator('.bc-rarity b.on')).toHaveCount(5);
  const box=(await page.locator('.bc-scene').boundingBox())!;
  const at=async(x:number,y:number)=>{await page.mouse.move(box.x+box.width*x,box.y+box.height*y);await page.waitForTimeout(700);return page.evaluate(()=>(window as any).fixture.studs());};
  const one=await at(.9,.1),other=await at(.1,.9);
  expect(one.lit,'the stones are there even out of the light').toBeGreaterThan(300);
  expect(one.bright,'some flare').toBeGreaterThan(10);
  expect(one.print,'and others take their turn').not.toBe(other.print);
  await shot(page,'card-legendary-tilted');
});

test('Esc, the X and a click outside close it; a click on the card does not',async({page})=>{
  let closed=0;
  await page.exposeFunction('escapeReachedTheGame',()=>{closed++;});
  await page.evaluate(()=>document.addEventListener('keydown',event=>{if(event.key==='Escape')(window as any).escapeReachedTheGame();}));
  await open(page,'epic');
  // By the mouse: the card never stands still long enough for a locator's click.
  const box=(await page.locator('.bc-scene').boundingBox())!;
  await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
  await page.waitForTimeout(300);
  await expect(page.locator('.bc-backdrop')).toHaveCount(1);
  await page.mouse.click(5,300);
  await expect(page.locator('.bc-backdrop')).toHaveCount(0);
  await open(page,'epic');
  await page.locator('.bc-close').click();
  await expect(page.locator('.bc-backdrop')).toHaveCount(0);
  await open(page,'epic');
  await page.keyboard.press('Escape');
  await expect(page.locator('.bc-backdrop')).toHaveCount(0);
  expect(closed,'the window behind the card stays open').toBe(0);
  await expect(page.locator('#from'),'the focus goes back to the badge').toBeFocused();
});

test('it fits a phone, with the longest text there is',async({page})=>{
  await page.setViewportSize({width:360,height:600});
  await open(page,'legendary',{name:'M'.repeat(32),description:'Palavra '.repeat(17).trim()+' fim.'});
  const scene=(await page.locator('.bc-scene').boundingBox())!;
  expect(scene.x).toBeGreaterThanOrEqual(0);expect(scene.x+scene.width).toBeLessThanOrEqual(360);expect(scene.y+scene.height).toBeLessThanOrEqual(600);
  const fits=await page.locator('.bc-card').evaluate(card=>{const text=card.querySelector('.bc-text')!,art=card.querySelector('.bc-art')!;return {text:text.scrollHeight<=text.clientHeight+1,art:art.getBoundingClientRect().height};});
  expect(fits.text).toBe(true);expect(fits.art).toBeGreaterThan(50);
  await shot(page,'card-phone');
});

test.describe('with reduced motion',()=>{
  test.use({reducedMotion:'reduce'});
  test('the card opens still, and the stones are drawn once',async({page})=>{
    await page.goto(fixture);
    await open(page,'legendary');
    const first=await tilt(page);
    await page.waitForTimeout(400);
    expect((await tilt(page)).x).toBe(first.x);
    expect(await page.evaluate(()=>(window as any).fixture.studs().lit)).toBeGreaterThan(300);
    await page.keyboard.press('Escape');
    await expect(page.locator('.bc-backdrop')).toHaveCount(0);
  });
});
