import {test,expect,type Page} from '@playwright/test';
// Route validated by tests/integration/map.test.ts (pavement, veranda, counter aisle, both stair flights), then between
// the last pool table and the blackjack table to the room's side of pebolim table 2.
const TO_UPSTAIRS=[[14.8,1],[14.8,-2.6],[15.3,-4.6],[15.3,-10.2],[14,-10.2],[14,-14.3],[15.85,-14.3],[15.85,-11.2],[15.85,-9]] as const;
const TO_TABLE=[[15.85,-7.4],[15.85,-6.1],[15.6,-5.74]] as const;

test('keyboard reaches a pebolim table, Zé do Totó fills the other side, the match plays in the panel and the player leaves',async({page})=>{
  test.setTimeout(240_000);
  const errors:string[]=[];page.on('pageerror',err=>errors.push(err.message));
  // The stack's Vite answers before its API and world do (tests/e2e/server.mjs): wait for both.
  await expect.poll(async()=>(await page.request.get('/api/ready').catch(()=>undefined))?.ok()??false,{timeout:90_000,intervals:[500]}).toBe(true);
  await expect.poll(async()=>(await page.request.get('http://localhost:2677/health').catch(()=>undefined))?.ok()??false,{timeout:90_000,intervals:[500]}).toBe(true);
  await page.goto('/');
  await page.getByLabel('E-mail',{exact:true}).fill('admin@bar.local');
  await page.getByLabel('Senha',{exact:true}).fill(process.env.DEMO_PASSWORD||'ButecoDemo2026!');
  await page.getByRole('button',{name:'Entrar no bar'}).click();
  await gameReady(page);
  for(const [x,z] of [...TO_UPSTAIRS,...TO_TABLE])await walkTo(page,x,z,.12);
  // Touch the table's edge, towards +z (S with the default camera; movement comes in ticks).
  await page.keyboard.press('s',{delay:120});
  await expect(page.locator('#context-label')).toHaveText('Jogar pebolim · mesa 2');
  await page.keyboard.press('e');
  const panel=page.locator('#foosball');
  await expect(panel).toBeVisible();
  // The lobby: the player holds the red place and opened the table, so the rules are theirs.
  await expect(panel.locator('.fb-slot.mine')).toContainText('Você');
  await panel.getByRole('button',{name:'3',exact:true}).click();
  await expect(panel.getByRole('button',{name:'3',exact:true})).toHaveAttribute('aria-pressed','true');
  await panel.getByRole('button',{name:'Sóbrio'}).click();
  await panel.getByRole('button',{name:'Chamar o Zé'}).click();
  await expect(panel.locator('.fb-slot.blue')).toContainText('Zé do Totó');
  await panel.getByRole('button',{name:'Estou pronto'}).click();
  // The serve's countdown, then the match: frames arrive and the canvas draws the table.
  await expect(panel.locator('.fb-count')).toBeVisible({timeout:10_000});
  await expect(panel.locator('.fb')).toHaveAttribute('data-phase','playing',{timeout:10_000});
  const canvas=panel.locator('.fb-canvas'),box=(await canvas.boundingBox())!;
  // The pointer moves the rods; a long press charges a kick (the meter shows), and the release sends it.
  await page.mouse.move(box.x+box.width/2,box.y+box.height*.3);
  await page.mouse.move(box.x+box.width/2,box.y+box.height*.65,{steps:6});
  await page.mouse.down();await page.waitForTimeout(350);
  await expect(panel).toHaveClass(/fb-charging/);
  await page.mouse.up();
  await expect(panel).not.toHaveClass(/fb-charging/);
  // Zé (sober) plays: within a while somebody scores.
  await expect.poll(async()=>Number(await panel.locator('[data-fb="score-red"]').textContent())+Number(await panel.locator('[data-fb="score-blue"]').textContent()),{timeout:90_000,intervals:[1000]}).toBeGreaterThan(0);
  // The panel as it looks mid-match (for a human look at the run).
  await panel.screenshot({path:'test-results/foosball.png'});
  // E asks first in a match (a friendly: Zé takes the place), then the player stands on the room's side.
  await page.keyboard.press('e');
  await panel.getByRole('button',{name:'Sair mesmo assim'}).click();
  await expect(panel).toBeHidden();
  await expect.poll(()=>page.evaluate(()=>{const {world,localId}=(window as any).barDebug.snapshot();return world.players[localId].interactionState;})).toBe('');
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
    const pulse=distance>2?350:distance>.85?180:65;
    await page.keyboard.press(key,{delay:pulse});
    await expect.poll(()=>page.evaluate(()=>(window as any).barDebug.network().pending),{intervals:[25,50,100],timeout:5000}).toBeLessThanOrEqual(2);
  }
  throw new Error(`Could not reach ${x},${z}: ${JSON.stringify(await page.evaluate(()=>(window as any).barDebug.snapshot()))}`);
}

async function gameReady(page:Page):Promise<void>{
  await expect(page.locator('#game')).toBeVisible();
  await expect(page.locator('#waiting')).toBeHidden({timeout:60000});
  await expect.poll(()=>page.evaluate(()=>{const state=(window as any).barDebug.snapshot();return state.world?.players?.[state.localId]?.connected===true;}),{timeout:30000}).toBe(true);
}
