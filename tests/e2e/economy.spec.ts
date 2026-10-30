import {test,expect,type Page} from '@playwright/test';
import {fileURLToPath} from 'node:url';
import {walk} from './walk';

const password='EconomiaBrowser2026!';
test.beforeEach(async({request})=>{
  await expect.poll(async()=>{try{return (await request.get('/api/health')).ok()&&(await request.get(process.env.PLAYWRIGHT_GAME_HEALTH_URL||'http://localhost:2677/health')).ok();}catch{return false;}},{timeout:30000}).toBe(true);
});
async function enter(page:Page){
  const unique=Date.now().toString(36);
  expect((await page.request.post('/api/auth/register',{data:{username:`eco_${unique}`,email:`eco_${unique}@example.com`,displayName:'Economia',password}})).status()).toBe(201);
  await page.goto('/');await page.getByRole('button',{name:'Entrar no bar'}).click();
  await expect(page.locator('#waiting')).toBeHidden({timeout:60000});
  await expect.poll(()=>page.evaluate(()=>{const d=(window as any).barDebug.snapshot();return d.world?.players?.[d.localId]?.connected;})).toBe(true);
}

test('jobs, the table menu and the graphics options are wired to the live room and the scene',async({page})=>{
  test.setTimeout(180000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await enter(page);
  // Jobs show the room's live slots; starting away from the counter is refused by the server.
  await page.keyboard.press('KeyJ');
  await expect(page.locator('#modal-title')).toHaveText('Trabalhar no bar');
  await expect(page.locator('.job-card')).toContainText('Ajudante do Magrão');
  await expect(page.locator('.job-meta')).toContainText('0/2 vagas');
  await page.getByRole('button',{name:'Começar turno'}).click();
  await expect(page.locator('#toasts')).toContainText('balcão');
  await expect(page.locator('[data-panel="job"]')).toBeHidden();await expect(page.locator('.game-tools [data-hud-visible="job"]')).toBeHidden();
  // Standing, P explains how to order from Tonico instead of opening the menu.
  await page.keyboard.press('KeyP');
  await expect(page.locator('#toasts')).toContainText('Sente-se');
  await expect(page.locator('#modal')).toBeHidden();
  await expect(page.locator('#table-cta')).toBeHidden();
  // Graphics: a preset applies all of its values to the scene at once; any change becomes Personalizado.
  await page.getByRole('button',{name:'Configurações'}).click();
  await page.locator('[data-setting="graphics.preset"]').selectOption('low');
  await expect.poll(()=>page.evaluate(()=>(window as any).barDebug.graphics())).toMatchObject({preset:'low',shadows:'off',fpsCap:30,renderScale:.6});
  expect((await page.evaluate(()=>(window as any).barDebug.environment())).sun?.shadows).toBe(false);
  await page.locator('[data-setting="graphics.shadows"]').selectOption('high');
  await expect.poll(()=>page.evaluate(()=>(window as any).barDebug.graphics())).toMatchObject({preset:'custom',shadows:'high'});
  await expect(page.locator('[data-setting="graphics.preset"]')).toHaveValue('custom');
  // Saved in this browser and applied again after a reload.
  await page.reload();await page.getByRole('button',{name:'Entrar no bar'}).click();await expect(page.locator('#waiting')).toBeHidden({timeout:60000});
  await expect.poll(()=>page.evaluate(()=>(window as any).barDebug.graphics())).toMatchObject({preset:'custom',shadows:'high',fpsCap:30});
  expect(errors).toEqual([]);
});

const source=(path:string)=>'/@fs/'+fileURLToPath(new URL(path,import.meta.url)).replaceAll('\\','/');
/**
 * The room's own rules inside the page, served by Vite (Node's loader refuses the shared map JSON): the A* path from
 * the player to a goal ('counter' or a job station id) and whether the player already reaches it.
 */
async function installPlanner(page:Page){
  await page.evaluate(`Promise.all([import(${JSON.stringify(source('../../packages/shared/src/index.ts'))}),import(${JSON.stringify(source('../../apps/server/src/world/navigation.ts'))})]).then(([shared,navigation])=>{
    const job=shared.JOBS[0],goal=target=>target==='counter'?job.start:job.stations.find(s=>s.id===target);
    const reaches=(target,p,slack)=>target==='counter'?Math.hypot(p.x-job.start.x,p.z-job.start.z)<2.5&&Math.abs(p.y-job.start.y)<.5:shared.canInteract(shared.stationInteractable(goal(target)),p,slack);
    const here=()=>{const d=window.barDebug.snapshot(),p=d.world.players[d.localId];return {x:p.x,y:p.y,z:p.z};};
    window.planner={goal:target=>({x:goal(target).x,z:goal(target).z,durationMs:goal(target).durationMs??0}),reached:target=>reaches(target,here(),0),
      path:target=>navigation.findPath(here(),p=>reaches(target,p,.1),goal(target),300000)?.map(p=>({x:p.x,z:p.z}))};
  })`);
}
test('a shift: the job panel moves, hides and comes back, and the next task draws its marker without freezing the view',async({page})=>{
  test.setTimeout(240000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await enter(page);await installPlanner(page);
  const panel=page.locator('[data-panel="job"]'),toggle=page.locator('.game-tools [data-hud-visible="job"]');
  await walk(page,'counter');
  await page.keyboard.press('KeyJ');await page.getByRole('button',{name:'Começar turno'}).click();
  await expect(panel).toBeVisible();await expect(toggle).toBeVisible();
  // Off the middle of the view, whole on screen.
  const viewport=page.viewportSize()!,box=(await panel.boundingBox())!;
  expect(box.x).toBeGreaterThan(viewport.width/2);expect(box.y+box.height).toBeLessThanOrEqual(viewport.height);
  // Dragged by its title; hidden from its header and shown again from the toolbar, where it was.
  const header=(await panel.locator('.panel-heading').boundingBox())!;
  await page.mouse.move(header.x+60,header.y+15);await page.mouse.down();await page.mouse.move(header.x-300,header.y-200,{steps:8});await page.mouse.up();
  const moved=(await panel.boundingBox())!;expect(moved.x).toBeCloseTo(box.x-360,0);
  await panel.locator('[data-hud-hide="job"]').click();await expect(panel).toBeHidden();
  await expect(toggle).toHaveAttribute('aria-pressed','false');await expect(toggle).toBeFocused();
  await toggle.click();await expect(panel).toBeVisible();expect((await panel.boundingBox())!.x).toBeCloseTo(moved.x,0);
  // Collapsed, the header keeps the countdown.
  await panel.locator('[data-hud-collapse="job"]').click();await expect(page.locator('#job-summary')).toHaveText(/^\d+s$/);
  await panel.locator('[data-hud-collapse="job"]').click();
  // One task: go to the station, E, get paid; the next one gets the marker back and the scene keeps drawing.
  const station:string=await page.evaluate(()=>(window as any).barDebug.job().stationId);
  const {durationMs}:{durationMs:number}=await page.evaluate(t=>(window as any).planner.goal(t),station);
  await walk(page,station);
  await expect(page.locator('#job-blip')).toBeVisible();
  await page.keyboard.press('KeyE');
  await expect.poll(()=>page.evaluate(()=>!!(window as any).barDebug.job()?.startedAt)).toBe(true);
  await expect(page.locator('#job-blip')).toBeHidden();
  await expect.poll(()=>page.evaluate(()=>(window as any).barDebug.job()?.tasks),{timeout:durationMs+10000}).toBe(1);
  await expect.poll(()=>page.evaluate(()=>(window as any).barDebug.map().objective?.visible)).toBe(true);
  // A frame that fails to draw throws from the render loop, every frame: a second of frames is plenty to see it.
  await page.waitForTimeout(1000);expect(errors).toEqual([]);
  await expect(panel).toContainText('1 tarefa');
  await page.keyboard.press('KeyJ');await page.getByRole('button',{name:'Encerrar turno'}).click();
  await expect(panel).toBeHidden();await expect(toggle).toBeHidden();await expect(page.locator('#job-blip')).toBeHidden();
  expect(errors).toEqual([]);
});
