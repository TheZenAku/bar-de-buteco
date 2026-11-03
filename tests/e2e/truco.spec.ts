import {test,expect,type Browser,type Page} from '@playwright/test';
// Route validated by tests/integration/map.test.ts up the stairs, then along the far side of the pool tables to the truco table.
const TO_UPSTAIRS=[[14.8,1],[14.8,-2.6],[15.3,-4.6],[15.3,-10.2],[14,-10.2],[14,-14.3],[15.85,-14.3],[15.85,-11.2],[15.85,-9]] as const;
// Short legs: a long straight walk drifts with the camera's yaw until it snags on a pool table.
const TO_TABLE=[[14,-9.6],[12,-9.6],[10,-9.6],[8,-9.6],[6,-9.6],[4.6,-9.6],[4.6,-7.5],[4.6,-5.2]] as const;

test('two people walk to the truco table, bet at a level against its NPCs, each sees only their own cards, a card goes face down, and leaving loses the stake',async({browser})=>{
  test.setTimeout(1_000_000);
  const errors:string[]=[];
  const ana=await enter(browser,'admin@bar.local',errors);
  await expect.poll(async()=>(await ana.request.get('http://localhost:2677/health').catch(()=>undefined))?.ok()??false,{timeout:90_000,intervals:[500]}).toBe(true);
  await toTable(ana);
  await ana.screenshot({path:'test-results/truco-table.png'});
  await ana.keyboard.press('e');
  const panel=ana.locator('#truco');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.tc')).toHaveAttribute('data-phase','lobby');
  await expect(panel.locator('.tc-lobby-seat.self')).toContainText('Você');
  // The second person lands across from the first: partners.
  const bia=await enter(browser,'jogador1@bar.local',errors);
  await toTable(bia);
  await bia.keyboard.press('e');
  const other=bia.locator('#truco');
  await expect(other).toBeVisible();
  await expect(panel.locator('[data-tc="mode"]')).toContainText('2 pessoas');
  const seats=async(page:Page)=>page.evaluate(()=>{const {world,localId}=(window as any).barDebug.snapshot();return world.players[localId].interactionState as string;});
  expect(await seats(ana)).toBe('truco:truco-1');
  await expect(panel.locator('.tc-seat.top [data-tc="team"]')).toHaveText('Parceiro');

  // People on both teams: from 400. Back to partners: the level's stake.
  await other.locator('.tc-lobby-seat[data-tc-seat="1"],.tc-lobby-seat[data-tc-seat="3"]').first().click();
  await expect(panel.locator('.tc-stake b')).toHaveText('400');
  await expect(panel.locator('.tc-lobby-sum')).toContainText('800');
  await other.locator('.tc-lobby-seat[data-tc-seat="2"]').click();
  await expect(panel.locator('.tc-stake')).toHaveCount(0);
  await expect(panel.locator('.tc-seat.top [data-tc="name"]')).not.toHaveText('Lugar livre');
  await panel.locator('[data-tc-level="medio"]').click();
  await expect(panel.locator('.tc-lobby-sum')).toContainText('150');
  const balanceOf=async(box:typeof panel)=>Number((await box.locator('[data-tc="balance"]').textContent())!.replace(/\D/g,''));
  const before=[await balanceOf(panel),await balanceOf(other)];
  // Everyone says yes: only then the coins go.
  await panel.locator('[data-tc-do="ready"]').click();
  await expect(panel.locator('[data-tc-do="unready"]')).toBeVisible();
  await expect(panel.locator('.tc')).toHaveAttribute('data-phase','lobby');
  await other.locator('[data-tc-do="ready"]').click();
  await expect(panel.locator('.tc')).not.toHaveAttribute('data-phase','lobby');
  await expect(other.locator('.tc')).not.toHaveAttribute('data-phase','lobby');
  await expect(panel.locator('[data-tc="mode"]')).toContainText('2 NPCs');
  await expect(panel.locator('[data-tc="mode"]')).toContainText('Nível Médio');
  await expect.poll(()=>balanceOf(panel)).toBe(before[0]!-150);
  await expect.poll(()=>balanceOf(other)).toBe(before[1]!-150);
  await expect(panel.locator('[data-tc="stake"]')).toContainText('150');
  await expect(panel.locator('.tc-hand .tc-card')).toHaveCount(3,{timeout:15_000});
  await expect(other.locator('.tc-hand .tc-card')).toHaveCount(3,{timeout:15_000});

  // Each hand on its own screen: nobody's page holds another's cards, and rivals' seats show only backs.
  const faces=(page:Page)=>page.locator('.tc-hand .tc-card').evaluateAll(cards=>cards.map(c=>c.getAttribute('aria-label')));
  const [mine,hers]=[await faces(ana),await faces(bia)];
  for(const card of mine)expect(hers).not.toContain(card);
  await expect(panel.locator('.tc-seat.top .tc-card:not(.down)')).toHaveCount(0);
  await expect(panel.locator('.tc-seat.left .tc-card:not(.down)')).toHaveCount(0);

  // A face: neutral beside everyone; yours flashes, on both screens, and goes back.
  const neutral='😐';
  await expect(panel.locator('.tc-seat.top [data-tc="face"]')).toHaveText(neutral);
  await panel.locator('[data-tc="face"].mine').click();
  await panel.locator('[data-tc-signal="zap"]').click();
  await expect(other.locator('.tc-seat.top [data-tc="face"]')).toHaveText('😉');
  await expect(other.locator('.tc-seat.top [data-tc="face"]')).toHaveText(neutral,{timeout:5000});

  // Both play through the panels until a hand ends: answering what comes, and playing with the keyboard and the mouse.
  const scored=async()=>Number(await panel.locator('[data-tc="score-us"]').textContent())+Number(await panel.locator('[data-tc="score-them"]').textContent());
  const deadline=Date.now()+180_000;
  let hid=false;
  await expect(panel.locator('[data-tc-do="hide"]')).toHaveCount(0);
  while(await scored()===0&&Date.now()<deadline){
    for(const [page,box] of [[ana,panel],[bia,other]] as const){
      const answer=box.locator('[data-tc-do="accept"]');
      if(await answer.count()){await answer.click({timeout:1500}).catch(()=>{});continue;}
      const eleven=box.locator('[data-tc-do="play-eleven"]');
      if(await eleven.count()){await eleven.click({timeout:1500}).catch(()=>{});continue;}
      if(await box.locator('[data-tc-do="play"]').count()){
        const card=box.locator('.tc-hand .tc-card').first();
        await card.click({timeout:1500}).catch(()=>{});
        // From the second trick on: one card goes face down, and the other screen shows only its back.
        if(!hid&&await box.locator('[data-tc-do="hide"]').count()){
          await page.keyboard.press('6');
          const watcher=page===ana?other:panel;
          await expect(watcher.locator('.tc-slot .tc-card.down').first()).toBeVisible({timeout:5000});
          hid=true;
          continue;
        }
        await page.keyboard.press('4');
      }
    }
    await ana.waitForTimeout(250);
  }
  expect(await scored()).toBeGreaterThan(0);
  expect(hid,'a card went face down').toBe(true);
  await panel.screenshot({path:'test-results/truco-panel.png'});

  // Up from the table: E asks first in a match, an NPC takes the seat and the match goes on for the partner.
  await bia.keyboard.press('e');
  await other.getByRole('button',{name:'Sair mesmo assim'}).click({timeout:15_000});
  await expect(other).toBeHidden();
  await expect.poll(()=>seats(bia)).toBe('');
  await expect(panel.locator('.tc-seat.top [data-tc="kind"]')).toContainText('Médio');
  await ana.keyboard.press('e');
  await panel.getByRole('button',{name:'Sair mesmo assim'}).click({timeout:15_000});
  await expect(panel).toBeHidden();
  // Back at the table: everything from zero, on the first screen.
  await touchTable(ana);
  await ana.keyboard.press('e');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.tc')).toHaveAttribute('data-phase','lobby');
  await expect(panel.locator('.tc-lobby')).toBeVisible();
  await expect(panel.locator('.tc-end')).toBeHidden();
  await expect(panel.locator('[data-tc="stake"]')).toHaveText('—');
  await panel.locator('[data-tc-tool="leave"]').click();
  await expect(panel).toBeHidden();
  expect(errors).toEqual([]);
  await ana.request.post('/api/auth/logout').catch(()=>{});
  await bia.request.post('/api/auth/logout').catch(()=>{});
});

async function enter(browser:Browser,email:string,errors:string[]):Promise<Page>{
  const context=await browser.newContext({viewport:{width:1366,height:768}}),page=await context.newPage();
  page.on('pageerror',err=>errors.push(err.message));
  await expect.poll(async()=>(await page.request.get('/api/ready').catch(()=>undefined))?.ok()??false,{timeout:90_000,intervals:[500]}).toBe(true);
  await page.goto('/');
  await page.getByLabel('E-mail',{exact:true}).fill(email);
  await page.getByLabel('Senha',{exact:true}).fill(process.env.DEMO_PASSWORD||'ButecoDemo2026!');
  await page.getByRole('button',{name:'Entrar no bar'}).click();
  await expect(page.locator('#game')).toBeVisible();
  await expect(page.locator('#waiting')).toBeHidden({timeout:60000});
  await expect.poll(()=>page.evaluate(()=>{const state=(window as any).barDebug.snapshot();return state.world?.players?.[state.localId]?.connected===true;}),{timeout:30000}).toBe(true);
  return page;
}
async function toTable(page:Page):Promise<void>{
  for(const [x,z] of TO_UPSTAIRS)await walkTo(page,x,z,.12);
  for(const [x,z] of TO_TABLE)await walkTo(page,x,z,.3);
  await touchTable(page);
}
/** From the west of the table, short taps towards it until it can be touched. */
async function touchTable(page:Page):Promise<void>{
  await walkTo(page,4.6,-5.2,.3);
  const label=page.locator('#context-label');
  for(let tap=0;tap<24&&await label.textContent()!=='Jogar truco';tap++){await page.keyboard.press('d',{delay:50});await page.waitForTimeout(200);}
  await expect(label).toHaveText('Jogar truco',{timeout:8000});
}
async function walkTo(page:Page,x:number,z:number,tolerance=.22):Promise<void>{
  for(let step=0;step<160;step++){
    const position=await page.evaluate(()=>{const {world,localId}=(window as any).barDebug.snapshot();return world.players[localId] as {x:number;y:number;z:number};});
    const dx=x-position.x,dz=z-position.z,distance=Math.hypot(dx,dz);
    if(distance<tolerance){
      await expect.poll(()=>page.evaluate(()=>(window as any).barDebug.network().pending),{intervals:[25,50,100],timeout:20000}).toBe(0);
      return;
    }
    const horizontal=dx*Math.cos(.15)-dz*Math.sin(.15),forward=-dx*Math.sin(.15)-dz*Math.cos(.15);
    const key=Math.abs(horizontal)>Math.abs(forward)?horizontal>0?'d':'a':forward>0?'w':'s';
    const pulse=distance>2?350:distance>.85?180:65;
    await page.keyboard.press(key,{delay:pulse});
    await expect.poll(()=>page.evaluate(()=>(window as any).barDebug.network().pending),{intervals:[25,50,100],timeout:20000}).toBeLessThanOrEqual(2);
  }
  throw new Error(`Could not reach ${x},${z}`);
}
