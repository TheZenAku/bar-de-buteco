import fs from 'node:fs';
import {test,expect,type Browser,type Page} from '@playwright/test';
import {enterAsAdmin,selfOf as self,spawnBikeOnStreet,walkTo} from './moto-helpers';

const SHOTS=process.env.MOTO_SHOTS||'test-results/moto-parts';
const errorsOf=(page:Page)=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&!/Failed to load resource|favicon/.test(message.text()))errors.push(message.text());});
  return errors;
};
const moto=(page:Page)=>page.evaluate(()=>(window as any).barDebug.motos()[0]);
const roomMoto=(page:Page)=>page.evaluate(()=>Object.values((window as any).barDebug.snapshot().world.motos)[0] as any);
const feel=(page:Page)=>page.evaluate(()=>(window as any).barDebug.camera());
const shot=async(page:Page,name:string)=>{fs.mkdirSync(SHOTS,{recursive:true});await page.screenshot({path:`${SHOTS}/${name}.png`});};
/** Right click on where the bike is drawn, and Informações do veículo. */
const openPanel=async(page:Page)=>{
  await expect.poll(async()=>{
    const {screen}=await moto(page);
    await page.mouse.click(screen[0],screen[1],{button:'right'});
    return page.locator('.world-menu').isVisible();
  },{timeout:15_000,intervals:[500]}).toBe(true);
  await page.locator('[data-world-menu="moto"]').click();
  await expect(page.locator('.moto-panel')).toBeVisible();
};
/** Exactly this many pieces in the admin's backpack (the test database outlives a run), through the administration, since a new account has no coins. */
const setPieces=async(page:Page,quantity:number)=>{
  const id=(await self(page)).id as string;
  const status=await page.evaluate(async({id,quantity})=>{
    const view=await (await fetch('/api/inventory',{credentials:'include'})).json(),have=view.stacks.find((stack:any)=>stack.itemId==='peca_moto')?.quantity??0;
    if(have===quantity)return 200;
    return (await fetch('/api/admin/player',{method:'POST',headers:{'content-type':'application/json','x-requested-with':'fetch'},credentials:'include',body:JSON.stringify({playerId:id,reason:'Teste das peças da moto',op:'item',itemId:'peca_moto',quantity:quantity-have})})).status;
  },{id,quantity});
  expect(status).toBeLessThan(300);
  await page.waitForTimeout(1200);
};
const partValue=async(page:Page,id:string)=>Number((await page.locator(`.moto-part[data-part="${id}"] b`).textContent())?.replace('%',''));

test('the bike\'s sounds, its panel, the view at speed, running someone over and fixing what broke, with real keys',async({browser}:{browser:Browser})=>{
  test.setTimeout(300_000);
  const context=await browser.newContext({viewport:{width:1280,height:720}}),page=await context.newPage(),errors=errorsOf(page);
  const watcher=await browser.newContext({viewport:{width:1280,height:720}}),other=await watcher.newPage(),otherErrors=errorsOf(other);
  await enterAsAdmin(page);
  await other.goto('/');
  await other.getByLabel('E-mail',{exact:true}).fill('jogador2@bar.local');
  await other.getByLabel('Senha',{exact:true}).fill(process.env.DEMO_PASSWORD||'ButecoDemo2026!');
  await other.getByRole('button',{name:'Entrar no bar'}).click();
  await expect(other.locator('#waiting')).toBeHidden({timeout:60_000});
  await setPieces(page,0);
  await spawnBikeOnStreet(page);
  const parked=await roomMoto(page);
  expect(parked.engine,'Parked, the engine is off').toBe(0);

  // Right click: the menu, the panel, and every part at 100%. A click anywhere else closes the menu.
  await walkTo(page,parked.x+.45,parked.z-.8);
  await shot(page,'1-parada');
  const {screen}=await moto(page);
  await page.mouse.click(screen[0],screen[1],{button:'right'});
  await expect(page.locator('.world-menu')).toBeVisible();
  await shot(page,'2-menu');
  await page.mouse.click(40,300);
  await expect(page.locator('.world-menu')).toBeHidden();
  // Nowhere near it, a right click shows nothing.
  await page.mouse.click(30,30,{button:'right'});
  await expect(page.locator('.world-menu')).toBeHidden();
  await openPanel(page);
  await expect(page.locator('.moto-part')).toHaveCount(12);
  for(const part of ['motor','bateria','pneu_dianteiro','bau'])expect(await partValue(page,part)).toBe(100);
  await expect(page.locator('[data-moto-overall]')).toHaveText('100%');
  await expect(page.locator('[data-moto-engine]')).toHaveText('Desligado');
  await expect(page.locator('[data-action="moto-repair"]')).toBeDisabled();
  await expect(page.locator('.item-blocked')).toHaveText('Esta parte está perfeita.');
  await page.locator('.moto-part[data-part="carenagem"]').click();
  await expect(page.locator('.moto-detail h3')).toHaveText('Carenagem');
  await shot(page,'3-painel-novo');
  await page.getByRole('button',{name:'Fechar janela'}).click();

  // Someone stands in the street, ahead of the bike.
  const standAt={x:parked.x-26,z:parked.z};
  await walkTo(other,standAt.x,standAt.z,.4);
  const before=await self(other);
  expect(Math.hypot(before.x-standAt.x,before.z-standAt.z)).toBeLessThan(1);

  // Getting on starts the engine: LIGA, then the loops; W answers after it has caught.
  await page.mouse.click(40,300);
  await page.keyboard.press('e');
  await expect.poll(async()=>(await roomMoto(page)).riderId).not.toBe('');
  await expect.poll(async()=>(await moto(page)).sound.played,{timeout:5000}).toContain('liga');
  await expect.poll(async()=>(await roomMoto(page)).engine,{timeout:5000}).toBe(2);
  await expect.poll(async()=>(await moto(page)).sound.voice?.loops,{timeout:15_000}).toBe(true);
  await page.waitForTimeout(1200);
  const idle=(await moto(page)).sound;
  expect(idle.state).toBe('running');
  expect(idle.ready,'All nine clips arrived').toBe(9);
  expect(idle.voice.idle,`Idling: ${JSON.stringify(idle.voice)}`).toBeGreaterThan(.3);
  expect(idle.voice.drive).toBeLessThan(.05);
  await expect.poll(async()=>(await moto(other)).sound.played,{timeout:5000}).toContain('liga');
  await shot(page,'4-ligada');

  // W: the riding loop takes over, higher as it goes; the view pulls back and the edges blur.
  const still=await feel(page);
  expect(still.rush).toBe(0);expect(still.fov).toBe(57);
  const drawnBefore=still.blur;
  // A short pull and letting go: the revs falling (PARANDO).
  await page.keyboard.down('w');await page.waitForTimeout(1300);await page.keyboard.up('w');
  await expect.poll(async()=>(await moto(page)).sound.played,{timeout:4000}).toContain('parando');
  expect((await moto(page)).sound.voice.coast,'It covers the riding loop').toBeGreaterThan(.5);
  await expect.poll(async()=>(await moto(other)).sound.played,{timeout:4000}).toContain('parando');
  await page.keyboard.down('w');
  let fastest=0,rushed=0,widest=0,rate=0,drive=0,boom=0,caught=false;
  await expect.poll(async()=>{
    const [now,view,state]=await Promise.all([moto(page),feel(page),self(page)]);
    fastest=Math.max(fastest,Math.abs(now.speed));rushed=Math.max(rushed,view.rush);widest=Math.max(widest,view.fov);
    if(now.sound.voice){rate=Math.max(rate,now.sound.voice.rate);drive=Math.max(drive,now.sound.voice.drive);}
    boom=Math.max(boom,Math.hypot(view.position[0]-now.position[0],view.position[2]-now.position[2]));
    if(!caught&&view.rush>.3){caught=true;await shot(page,'5-velocidade');}
    return state.animationState;
  },{timeout:40_000,intervals:[60]}).toBe('ragdoll');
  await page.keyboard.up('w');
  // The walker first: the body is up again in a few seconds, and a screenshot here can take that long.
  await expect.poll(async()=>(await self(other)).interactionState,{timeout:4000,intervals:[60]}).toBe('thrown');
  await expect(other.locator('.notice, .toast, [class*=notice]').filter({hasText:'Atropelado'}).first()).toBeVisible({timeout:5000});
  await shot(other,'7-atropelado');
  await shot(page,'6-atropelou');
  expect(fastest,'Fast enough').toBeGreaterThan(9);
  expect(rushed,`The feeling of speed came in at ${fastest} m/s`).toBeGreaterThan(.2);
  expect(widest).toBeGreaterThan(57.5);
  expect(rate).toBeGreaterThan(.8);
  expect(drive).toBeGreaterThan(.4);
  expect((await feel(page)).blur,'The blur was drawn').toBeGreaterThan(drawnBefore+5);

  // The walker lost life by the speed, and the rider's feeling of speed went away.
  await expect.poll(async()=>(await self(other)).hp).toBeLessThan(before.hp-15);
  const hit=(await self(other)).hp;
  expect(hit,'Not dead from one hit').toBeGreaterThan(0);
  await expect.poll(async()=>(await feel(page)).rush,{timeout:8000}).toBeLessThan(.05);
  await expect.poll(async()=>(await feel(page)).fov,{timeout:5000}).toBeLessThan(58);
  // Down: the engine off, with DESLIGA, for both.
  await expect.poll(async()=>(await roomMoto(page)).phase,{timeout:30_000,intervals:[200]}).toBe('down');
  expect((await roomMoto(page)).engine).toBe(0);
  await expect.poll(async()=>(await moto(page)).sound.played).toContain('desliga');
  await expect.poll(async()=>(await moto(other)).sound.played).toContain('desliga');
  await expect.poll(async()=>(await self(page)).interactionState,{timeout:30_000,intervals:[200]}).toBe('');

  // The panel now tells what the blow did.
  const lying=await roomMoto(page);
  // Right up to it (a bike is no obstacle on foot): wherever it landed, there may be a wall or a car on any one side.
  await walkTo(page,lying.x,lying.z,.6);
  await page.waitForTimeout(500);
  await openPanel(page);
  await shot(page,'8-painel-batida');
  const worn={front:await partValue(page,'pneu_dianteiro'),rear:await partValue(page,'pneu_traseiro'),shell:await partValue(page,'carenagem')};
  expect(worn.shell,`After the crash: ${JSON.stringify(worn)}`).toBeLessThan(100);
  expect(worn.front).toBeLessThan(100);
  expect(Number((await page.locator('[data-moto-overall]').textContent())?.replace('%',''))).toBeLessThan(100);
  await page.locator('.moto-part[data-part="carenagem"]').click();
  await expect(page.locator('.item-blocked')).toContainText('peça de moto');
  await page.getByRole('button',{name:'Fechar janela'}).click();

  // With pieces in the backpack the panel counts them, and the button works.
  await setPieces(page,2);
  await openPanel(page);
  await expect(page.locator('[data-moto-pieces]')).toHaveText('2',{timeout:10_000});
  await page.locator('.moto-part[data-part="carenagem"]').click();
  const shell=await partValue(page,'carenagem');
  await expect(page.locator('[data-action="moto-repair"]')).toBeEnabled();
  await page.locator('[data-action="moto-repair"]').click();
  await expect(page.locator('.moto-work')).toBeVisible();
  await shot(page,'9-consertando');
  await expect.poll(()=>partValue(page,'carenagem'),{timeout:10_000}).toBe(Math.min(100,shell+40));
  await expect(page.locator('[data-moto-pieces]')).toHaveText('1');
  await expect(page.locator('.moto-work')).toBeHidden();
  await shot(page,'10-consertada');
  await page.getByRole('button',{name:'Fechar janela'}).click();

  // Lifted and ridden again: the engine comes back, and getting off plays DESLIGA once more.
  await page.keyboard.press('e');
  await expect.poll(async()=>(await roomMoto(page)).phase,{timeout:10_000}).toBe('lifting');
  await expect.poll(async()=>(await roomMoto(page)).phase,{timeout:10_000}).toBe('');
  await expect.poll(async()=>(await self(page)).interactionState).toBe('');
  await page.keyboard.press('e');
  await expect.poll(async()=>(await roomMoto(page)).engine,{timeout:6000}).toBe(2);
  // Reverse is the way out of wherever it landed; letting go at speed is covered on the street above.
  await page.keyboard.down('s');await page.waitForTimeout(700);await page.keyboard.up('s');
  await page.keyboard.down('Space');await page.waitForTimeout(800);await page.keyboard.up('Space');
  const heard=(await moto(page)).sound.played.length;
  await page.keyboard.press('e');
  await expect.poll(async()=>(await roomMoto(page)).riderId,{timeout:8000}).toBe('');
  await expect.poll(async()=>(await moto(page)).sound.played.length).toBeGreaterThan(heard);
  expect((await moto(page)).sound.played.at(-1)).toBe('desliga');
  expect(errors,'No errors in the rider\'s page').toEqual([]);
  expect(otherErrors,'No errors in the other page').toEqual([]);
  await context.close();await watcher.close();
});
