import fs from 'node:fs';
import {test,expect,type Browser,type Page} from '@playwright/test';
import {enterAsAdmin,orbit,selfOf as self} from './moto-helpers';

/**
 * Garages, keys and trades in two real browsers: buying, the key's mark in the backpack, a ring and its list, plate and lock, right click and Negociar, the window
 * on both sides, and a bike changing hands. docs/sistemas/garagem.md, docs/sistemas/troca.md. Pictures go to test-results/garage-trade.
 */
const SHOTS=process.env.GARAGE_SHOTS||'test-results/garage-trade';
const shot=async(page:Page,name:string)=>{fs.mkdirSync(SHOTS,{recursive:true});await page.screenshot({path:`${SHOTS}/${name}.png`});};
const errorsOf=(page:Page)=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&!/Failed to load resource|favicon/.test(message.text()))errors.push(message.text());});
  return errors;
};
const place=async(page:Page,x:number,y:number,z:number)=>{
  await page.evaluate(at=>(window as any).barDebug.send('test.player.place',at),{x,y,z});
  await expect.poll(async()=>{const at=await self(page);return Math.hypot(at.x-x,at.z-z);},{timeout:10_000}).toBeLessThan(.3);
  await page.waitForTimeout(250);
};
const ownBike=(page:Page,id:string)=>page.evaluate(owner=>Object.values((window as any).barDebug.snapshot().world.motos??{}).find((moto:any)=>moto.ownerId===owner) as any,id);
const motoOnScreen=(page:Page)=>page.evaluate(()=>(window as any).barDebug.motos()[0]);
const labelOf=(page:Page,name:string)=>page.evaluate(wanted=>{
  const label=[...document.querySelectorAll<HTMLElement>('.world-label')].find(node=>node.textContent===wanted);
  if(!label)return null;
  const box=label.getBoundingClientRect();
  return {x:box.x+box.width/2,y:box.y+box.height+40};
},name);
/** Right click on someone's body, under the label that follows them. */
const menuOnPlayer=async(page:Page,name:string)=>{
  await expect(async()=>{
    const at=await labelOf(page,name);
    expect(at).not.toBeNull();
    await page.mouse.click(at!.x,at!.y,{button:'right',delay:30});
    await expect(page.locator('.world-menu [data-world-menu="profile"]')).toBeVisible({timeout:800});
  }).toPass({timeout:20_000,intervals:[500]});
};

test('a bike out of the garage, its key in the backpack and the same bike sold to another player, with real browsers',async({browser}:{browser:Browser})=>{
  test.setTimeout(420_000);
  const sellerContext=await browser.newContext({viewport:{width:1280,height:720}}),buyerContext=await browser.newContext({viewport:{width:1280,height:720}});
  const page=await sellerContext.newPage(),other=await buyerContext.newPage(),errors=errorsOf(page),otherErrors=errorsOf(other);
  await enterAsAdmin(page);
  await other.goto('/');
  await other.getByLabel('E-mail',{exact:true}).fill('jogador2@bar.local');
  await other.getByLabel('Senha',{exact:true}).fill(process.env.DEMO_PASSWORD||'ButecoDemo2026!');
  await other.getByRole('button',{name:'Entrar no bar'}).click();
  await expect(other.locator('#waiting')).toBeHidden({timeout:60_000});
  await expect.poll(()=>other.evaluate(()=>{const state=(window as any).barDebug.snapshot();return state.world?.players?.[state.localId]?.connected===true;}),{timeout:30_000}).toBe(true);
  const seller=(await self(page)) as {id:string;displayName:string},buyer=(await self(other)) as {id:string;displayName:string};
  // Coins for both, the bike the seller will have sold at the end.
  for(const [id,amount] of [[seller.id,11_000],[buyer.id,1500]] as const){
    const funded=await page.request.post('/api/admin/wallet',{data:{playerId:id,operation:'add',amount,reason:'Teste de garagem e troca',requestId:crypto.randomUUID()}});
    expect(funded.ok(),await funded.text()).toBe(true);
  }
  const bought=await page.request.post('/api/vehicles/buy',{data:{requestId:crypto.randomUUID()}});
  expect(bought.ok(),await bought.text()).toBe(true);
  const vehicles=bought.json().then((body:any)=>body.vehicles as Array<{id:string;plate:string}>),plate=(await vehicles).at(-1)!.plate,vehicleId=(await vehicles).at(-1)!.id;
  await page.evaluate(()=>(window as any).barDebug.syncWallet());await other.evaluate(()=>(window as any).barDebug.syncWallet());
  await page.waitForTimeout(800);

  // The key in the backpack: a slot of its own, a strong border no other item has, and the explanation on hover and on a click, with no way to throw it out.
  await page.keyboard.press('i');
  const key=page.locator(`.inventory-slot.vehicle-key[data-item="key:${vehicleId}"]`);
  await expect(key).toBeVisible();
  const look=await key.evaluate(node=>getComputedStyle(node).boxShadow);
  expect(look).toContain('rgb(23, 212, 244)');
  const plain=await page.locator('.inventory-slot.empty').first().evaluate(node=>getComputedStyle(node).boxShadow);
  expect(plain).not.toContain('rgb(23, 212, 244)');
  expect(await key.getAttribute('title')).toContain('nunca cai');
  await key.hover();
  await expect(page.locator('.key-detail')).toContainText('nunca cai da mochila',{timeout:3000});
  await key.click();
  await expect(page.locator('.key-detail')).toContainText('nunca cai da mochila, nem quando você desmaia');
  await expect(page.locator('.key-detail')).toContainText(plate);
  await expect(page.locator('.key-detail [data-action="inventory-discard"]')).toHaveCount(0);
  await expect(page.locator('.key-detail [data-action="inventory-use"]')).toHaveCount(0);
  await shot(page,'01-chave-na-mochila');
  await page.keyboard.press('i');

  // The garage: its ring, the list and the bike coming out. On the street there was nothing before that.
  expect(await ownBike(page,seller.id)).toBeUndefined();
  await place(page,-13.25,.15,-5.5);
  await page.waitForTimeout(800);
  await shot(page,'02-aneis-da-garagem');
  await place(page,-13.25,.15,-8.3);
  await expect.poll(async()=>(await page.locator('#context-label').textContent())??'',{timeout:15_000}).toContain('Garagem');
  await page.keyboard.press('e');
  await expect(page.locator(`.garage-vehicle[data-plate="${plate}"]`)).toBeVisible({timeout:10_000});
  await shot(page,'03-painel-da-garagem');
  await page.locator(`.garage-vehicle[data-plate="${plate}"] [data-action="garage-take"]`).click();
  await expect.poll(async()=>!!(await ownBike(page,seller.id)),{timeout:15_000}).toBe(true);
  await expect(page.locator('.modal')).toBeHidden();
  const parked=await ownBike(page,seller.id);
  expect(parked.plate).toBe(plate);expect(parked.locked).toBe(true);expect(parked.ownerName).toBe(seller.displayName);
  await shot(page,'03b-moto-na-rua');
  // Out in the open, and behind it, close, to read the plate.
  await page.evaluate(()=>(window as any).barDebug.send('test.moto.place',{x:10,z:7.5}));
  await expect.poll(async()=>(await ownBike(page,seller.id)).x,{timeout:8000}).toBeCloseTo(10,1);
  const bike=await ownBike(page,seller.id);
  await place(page,bike.x-Math.sin(bike.yaw)*2+Math.cos(bike.yaw)*1.5,bike.y,bike.z-Math.cos(bike.yaw)*2-Math.sin(bike.yaw)*1.5);
  for(let i=0;i<4;i++){
    const yaw=await page.evaluate(()=>(window as any).barDebug.camera().yaw),turn=Math.atan2(Math.sin(yaw-(bike.yaw+Math.PI)),Math.cos(yaw-(bike.yaw+Math.PI)));
    if(Math.abs(turn)<.08)break;
    await orbit(page,turn/.006);await page.waitForTimeout(300);
  }
  const framed=await page.evaluate(()=>(window as any).barDebug.camera());
  expect(framed.mode).toBe('third');
  await page.mouse.wheel(0,-900);
  await page.waitForTimeout(1500);
  await shot(page,'04-placa');
  await page.mouse.wheel(0,900);
  await page.waitForTimeout(600);

  // The other player, up close: the right click says whose it is and it cannot be ridden. Only the key holder gets the lock on the menu.
  await place(other,bike.x+1.2,bike.y,bike.z);
  await other.waitForTimeout(800);
  await expect(async()=>{
    const {screen}=await motoOnScreen(other);
    await other.mouse.click(screen[0],screen[1],{button:'right',delay:30});
    await expect(other.locator('.world-menu-head')).toContainText(plate,{timeout:800});
  }).toPass({timeout:20_000,intervals:[500]});
  await expect(other.locator('.world-menu-head')).toContainText(seller.displayName);
  await expect(other.locator('[data-world-menu="lock"]')).toHaveCount(0);
  await shot(other,'05-menu-na-moto-de-outro');
  await other.mouse.click(20,300);
  await other.keyboard.press('e');await other.waitForTimeout(500);
  expect((await self(other)).interactionState).toBe('');
  // The key holder: unlock from the menu, and the other can get on; locked again, and they cannot. L does the same.
  await expect(async()=>{
    const {screen}=await motoOnScreen(page);
    await page.mouse.click(screen[0],screen[1],{button:'right',delay:30});
    await expect(page.locator('[data-world-menu="lock"]')).toBeVisible({timeout:800});
  }).toPass({timeout:20_000,intervals:[500]});
  await shot(page,'06-menu-do-dono');
  await page.locator('[data-world-menu="lock"]').click();
  await expect.poll(async()=>(await ownBike(page,seller.id)).locked,{timeout:8000}).toBe(false);
  await expect(page.locator('#toasts')).toContainText('Destrancada');
  await page.keyboard.press('l');
  await expect.poll(async()=>(await ownBike(page,seller.id)).locked,{timeout:8000}).toBe(true);

  // Face to face. Right click: Negociar is there for someone else, and not for oneself.
  await place(page,4,0.3,4);await place(other,5,0.3,4);
  await page.waitForTimeout(800);
  await menuOnPlayer(page,buyer.displayName);
  await expect(page.locator('[data-world-menu="trade"]')).toBeVisible();
  await shot(page,'07-menu-negociar');
  await page.locator('[data-world-menu="trade"]').click();
  await expect(other.locator('.trade-invite')).toContainText(seller.displayName,{timeout:10_000});
  await shot(other,'08-convite');
  await other.locator('[data-trade-invite="yes"]').click();
  await expect(page.locator('.trade-window')).toBeVisible({timeout:10_000});
  await expect(other.locator('.trade-window')).toBeVisible();
  // The seller puts the key on the table, the buyer the coins; each sees the other's side as it changes.
  await page.locator(`.trade-pack [data-trade-add="vehicle"][data-id="${vehicleId}"]`).click();
  await expect(other.locator('[data-trade-them] .trade-key')).toContainText(plate,{timeout:8000});
  await other.locator('input[name="trade-coins"]').fill('1000');
  await expect(page.locator('[data-trade-them]')).toContainText('1.000',{timeout:8000});
  await expect(page.locator('[data-trade-them].changed')).toBeVisible();
  await shot(page,'09-oferta-vendedor');
  await shot(other,'10-oferta-comprador');
  // Ready on one side: the other changes the offer, and that agreement is gone.
  await page.locator('[data-trade="ready"]').click();
  await expect(other.locator('[data-trade-them] .trade-pill.ok')).toBeVisible({timeout:8000});
  await other.locator('input[name="trade-coins"]').fill('900');
  await expect(page.locator('[data-trade="ready"]')).toBeEnabled({timeout:8000});
  await expect(page.locator('[data-trade-them]')).toContainText('900');
  await other.locator('input[name="trade-coins"]').fill('1000');
  await expect(page.locator('[data-trade-them]')).toContainText('1.000',{timeout:8000});
  // Both agree: frozen, a moment to read, then the last yes on each side.
  await page.locator('[data-trade="ready"]').click();
  await other.locator('[data-trade="ready"]').click();
  await expect(page.locator('[data-trade="confirm"]')).toBeVisible({timeout:8000});
  await expect(page.locator('[data-trade="confirm"]')).toBeDisabled();
  await expect(page.locator('.trade-window')).toContainText('Você vai entregar uma chave');
  await shot(page,'11-confirmacao-vendedor');
  await shot(other,'12-confirmacao-comprador');
  await expect(page.locator('[data-trade="confirm"]')).toBeEnabled({timeout:8000});
  const before=await page.request.get('/api/inventory').then(response=>response.json());
  await page.locator('[data-trade="confirm"]').click();
  await page.waitForTimeout(400);
  // One yes moves nothing.
  expect((await page.request.get('/api/inventory').then(response=>response.json())).balance).toBe(before.balance);
  await other.locator('[data-trade="confirm"]').click();
  await expect(page.locator('.trade-window')).toBeHidden({timeout:15_000});
  await expect(other.locator('.trade-window')).toBeHidden({timeout:15_000});
  await expect(page.locator('#toasts')).toContainText('Troca feita');
  await expect(other.locator('#toasts')).toContainText('Troca feita');
  await shot(other,'13-troca-feita');
  // The books.
  const sellerAfter=await page.request.get('/api/inventory').then(response=>response.json()),buyerAfter=await other.request.get('/api/inventory').then(response=>response.json());
  expect(sellerAfter.balance).toBe(before.balance+1000);
  expect(sellerAfter.keys.some((each:any)=>each.vehicleId===vehicleId)).toBe(false);
  expect(buyerAfter.keys.some((each:any)=>each.vehicleId===vehicleId)).toBe(true);
  // It was out on the street: it went to the garage, and the new owner takes it from there.
  await expect.poll(async()=>await ownBike(page,seller.id)).toBeUndefined();
  await other.keyboard.press('i');
  await expect(other.locator(`.inventory-slot.vehicle-key[data-item="key:${vehicleId}"]`)).toBeVisible();
  await shot(other,'14-chave-com-o-comprador');
  await other.keyboard.press('i');
  await place(other,-13.16,.15,-2.93);
  await other.keyboard.press('e');
  await expect(other.locator(`.garage-vehicle[data-plate="${plate}"]`)).toBeVisible({timeout:10_000});
  await other.locator(`.garage-vehicle[data-plate="${plate}"] [data-action="garage-take"]`).click();
  await expect.poll(async()=>(await ownBike(other,buyer.id))?.plate,{timeout:15_000}).toBe(plate);
  const sold=await ownBike(other,buyer.id);
  await other.waitForTimeout(800);
  await shot(other,'15-moto-com-o-comprador');
  // And it rides. Stores it again on the way out, for the next run.
  await place(other,sold.x+Math.cos(sold.yaw)*.8,sold.y,sold.z-Math.sin(sold.yaw)*.8);
  await expect.poll(async()=>(await other.locator('#context-label').textContent())??'',{timeout:15_000}).toContain('subir');
  await other.keyboard.press('e');
  await expect.poll(async()=>(await self(other)).animationState,{timeout:10_000}).toBe('ride');
  await other.waitForTimeout(1200);
  await other.evaluate(()=>(window as any).barDebug.send('player.interact',{objectId:'stand'}));
  await expect.poll(async()=>(await self(other)).animationState,{timeout:10_000}).not.toBe('ride');
  await place(other,-13.16,.15,-2.93);
  await other.keyboard.press('e');
  await expect(other.locator(`.garage-vehicle[data-plate="${plate}"] [data-action="garage-store"]`)).toBeVisible({timeout:10_000});
  await other.locator(`.garage-vehicle[data-plate="${plate}"] [data-action="garage-store"]`).click();
  await expect.poll(async()=>await ownBike(other,buyer.id),{timeout:10_000}).toBeUndefined();
  await other.keyboard.press('Escape');
  expect(errors,errors.join('\n')).toEqual([]);expect(otherErrors,otherErrors.join('\n')).toEqual([]);
  await sellerContext.close();await buyerContext.close();
});
