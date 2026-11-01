import {test,expect,type Page} from '@playwright/test';

async function enter(page:Page):Promise<void>{
  const name=`mouse_${Date.now().toString(36)}`;
  const response=await page.request.post('/api/auth/register',{data:{username:name,displayName:'Mouse',email:`${name}@example.com`,password:'MousePreso2026!'}});
  expect(response.ok()).toBe(true);
  await page.goto('/');await page.getByRole('button',{name:'Entrar no bar'}).click();
  await expect(page.locator('#waiting')).toBeHidden({timeout:60_000});
  await expect.poll(()=>page.evaluate(()=>{const d=(window as any).barDebug.snapshot();return d.world?.players?.[d.localId]?.connected===true;}),{timeout:30_000}).toBe(true);
}
const locked=(page:Page)=>page.evaluate(()=>(document.pointerLockElement as HTMLElement|null)?.id??'');
const yaw=(page:Page):Promise<number>=>page.evaluate(()=>(window as any).barDebug.camera().yaw);
/** The browser's menu opens unless the page refuses it: the right button at a point, and whether it was refused. */
async function menuRefused(page:Page,x:number,y:number):Promise<boolean>{
  await page.evaluate(()=>{(window as any).lastMenu=undefined;addEventListener('contextmenu',event=>{(window as any).lastMenu=event;},{once:true,capture:true});});
  await page.mouse.click(x,y,{button:'right'});
  await expect.poll(()=>page.evaluate(()=>!!(window as any).lastMenu)).toBe(true);
  return page.evaluate(()=>(window as any).lastMenu.defaultPrevented);
}
/** The view eases towards where the mouse sent it: its yaw once it has arrived, counted in frames, since a slow page can show none between two looks. */
async function settled(page:Page):Promise<number>{
  const frames=()=>page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(done)))));
  let last=await yaw(page);
  await expect.poll(async()=>{await frames();const now=await yaw(page),moved=Math.abs(now-last);last=now;return moved;},{timeout:20_000,intervals:[100]}).toBeLessThan(.0005);
  return last;
}
const centre=async(page:Page,selector:string)=>{const box=(await page.locator(selector).first().boundingBox())!;return [box.x+box.width/2,box.y+box.height/2] as const;};

test.beforeEach(async({request})=>{await expect.poll(async()=>{try{return (await request.get('/api/health')).ok()&&(await request.get('http://localhost:2677/health')).ok();}catch{return false;}},{timeout:30_000}).toBe(true);});
// A screen larger than the window: this viewport does not read as the browser's full screen (see nova-ui.spec).
test.use({viewport:{width:1280,height:720},screen:{width:2560,height:1440}});

test('the right button never opens the browser menu in the game, except on text boxes',async({page})=>{
  test.setTimeout(120_000);
  await enter(page);
  expect(await menuRefused(page,640,300),'Over the view').toBe(true);
  for(const selector of ['[data-panel="actions"]','[data-action="chat"]','.game-logo,.hud-logo,[data-panel="logo"]'])
    if(await page.locator(selector).count()){const [x,y]=await centre(page,selector);expect(await menuRefused(page,x,y),`Over ${selector}`).toBe(true);}
  await page.keyboard.press('t');await expect(page.locator('#chat-input')).toBeFocused();
  const [x,y]=await centre(page,'#chat-input');expect(await menuRefused(page,x,y),'A text box keeps paste and copy').toBe(false);
});

test('full screen holds the mouse: the scroll button lets it go and takes it again, and windows get the cursor back',async({page})=>{
  test.setTimeout(180_000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await enter(page);
  // In a window nothing changes: the scroll button does nothing, and the mouse only looks while dragging.
  await page.mouse.move(640,300);await page.mouse.down({button:'middle'});await page.mouse.up({button:'middle'});
  expect(await locked(page)).toBe('');
  const still=await yaw(page);await page.mouse.move(700,320);await page.waitForTimeout(200);expect(await yaw(page)).toBe(still);

  await page.getByRole('button',{name:'Painéis',exact:true}).click();
  await page.locator('#panel-menu [data-fullscreen]').click();
  await expect.poll(()=>page.evaluate(()=>document.fullscreenElement?.tagName)).toBe('HTML');
  await expect.poll(()=>locked(page),{timeout:10_000}).toBe('world');
  await expect(page.locator('.comanda').filter({hasText:'botão do scroll'}).first()).toBeVisible();

  // Looks around with no button held.
  const before=await yaw(page);
  await page.mouse.move(760,330,{steps:4});
  await expect.poll(()=>yaw(page)).not.toBeCloseTo(before,3);

  // The scroll button, as many times as wanted.
  await page.mouse.down({button:'middle'});await page.mouse.up({button:'middle'});
  await expect.poll(()=>locked(page)).toBe('');
  const free=await settled(page);
  await page.mouse.move(500,300,{steps:4});await page.waitForTimeout(400);
  expect(await yaw(page),'A free cursor does not turn the view').toBeCloseTo(free,2);
  await page.mouse.down({button:'middle'});await page.mouse.up({button:'middle'});
  await expect.poll(()=>locked(page)).toBe('world');

  // A window gets the cursor, and closing it takes the mouse again.
  await page.keyboard.press('i');await expect(page.locator('#modal')).toBeVisible();
  await expect.poll(()=>locked(page)).toBe('');
  await page.mouse.down({button:'middle'});await page.mouse.up({button:'middle'});
  expect(await locked(page),'The scroll button does not take the mouse from a window').toBe('');
  await page.keyboard.press('Escape');await expect(page.locator('#modal')).toBeHidden();
  await expect.poll(()=>locked(page),{timeout:10_000}).toBe('world');
  await page.keyboard.press('k');
  await expect.poll(()=>locked(page)).toBe('');
  await page.keyboard.press('k');
  await expect.poll(()=>locked(page),{timeout:10_000}).toBe('world');

  // Asked for the cursor: a window opening and closing does not take it away again.
  await page.mouse.down({button:'middle'});await page.mouse.up({button:'middle'});
  await expect.poll(()=>locked(page)).toBe('');
  await page.keyboard.press('i');await expect(page.locator('#modal')).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.locator('#modal')).toBeHidden();
  await page.waitForTimeout(1500);
  expect(await locked(page)).toBe('');

  // Leaving full screen lets it go for good.
  await page.mouse.down({button:'middle'});await page.mouse.up({button:'middle'});
  await expect.poll(()=>locked(page)).toBe('world');
  await page.evaluate(()=>document.exitFullscreen());
  await expect.poll(()=>locked(page),{timeout:10_000}).toBe('');
  await page.waitForTimeout(1500);
  expect(await locked(page)).toBe('');
  expect(errors).toEqual([]);
});
