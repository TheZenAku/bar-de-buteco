import fs from 'node:fs';
import {test,expect,type Browser,type Page} from '@playwright/test';
import {enterAsAdmin,inVehicles,lastOfBody,selfOf as self,spawnBikeOnStreet,walkTo} from './moto-helpers';

const SHOTS=process.env.MOTO_SHOTS||'test-results/moto-crash';
const errorsOf=(page:Page)=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&!/Failed to load resource|favicon/.test(message.text()))errors.push(message.text());});
  return errors;
};
const moto=(page:Page)=>page.evaluate(()=>(window as any).barDebug.motos()[0]);
const roomMoto=(page:Page)=>page.evaluate(()=>Object.values((window as any).barDebug.snapshot().world.motos)[0] as any);
const ragdolls=(page:Page)=>page.evaluate(()=>(window as any).barDebug.ragdolls());
const shot=async(page:Page,name:string)=>{fs.mkdirSync(SHOTS,{recursive:true});await page.screenshot({path:`${SHOTS}/${name}.png`});};
const hold=async(page:Page,key:string,ms:number)=>{await page.keyboard.down(key);await page.waitForTimeout(ms);await page.keyboard.up(key);};

test('all the lamps, then a crash with real keys: thrown off with the bike\'s speed, a body that falls, the bike rolling on and down, lifted by hand and ridden again',async({browser}:{browser:Browser})=>{
  test.setTimeout(240_000);
  const context=await browser.newContext({viewport:{width:1280,height:720}}),page=await context.newPage(),errors=errorsOf(page);
  // Someone else on the street sees it all: the room's lamps, and the same body falling the same way.
  const watcher=await browser.newContext({viewport:{width:1280,height:720}}),other=await watcher.newPage(),otherErrors=errorsOf(other);
  await enterAsAdmin(page);
  await other.goto('/');
  await other.getByLabel('E-mail',{exact:true}).fill('jogador2@bar.local');
  await other.getByLabel('Senha',{exact:true}).fill(process.env.DEMO_PASSWORD||'ButecoDemo2026!');
  await other.getByRole('button',{name:'Entrar no bar'}).click();
  await expect(other.locator('#waiting')).toBeHidden({timeout:60_000});
  await spawnBikeOnStreet(page);
  const parked=await roomMoto(page);
  expect((await moto(page)).lights.lit,'Parked with nobody on it: all off').toBe(false);
  await walkTo(page,parked.x+.45,parked.z-.8);
  await expect(page.locator('#context-label')).toHaveText('para subir');
  await page.keyboard.press('e');
  await expect.poll(async()=>(await roomMoto(page)).riderId).not.toBe('');
  await page.waitForTimeout(1200);

  // Riding: headlight, tail, plate and dials on, the beam goes where the bike points.
  const on=await moto(page);
  expect(on.lights.lit).toBe(true);
  expect(on.lights.headlight).toBe(true);
  expect(on.lights.tail).toBe(true);
  expect(on.lights.lens.head&&on.lights.lens.tail&&on.lights.lens.plate&&on.lights.lens.panel).toBe(true);
  const beam=on.lights.beam,along=beam[0]*on.front[0]+beam[2]*on.front[2];
  expect(along,`Beam ${beam} against ${on.front}`).toBeGreaterThan(.95);
  expect(beam[1]).toBeLessThan(0);
  // Brake pedal, blinkers (one at a time, both for hazard), high beam: seen by the room too, so by everybody.
  await page.keyboard.down('Space');
  await expect.poll(async()=>(await moto(page)).lights.brake).toBe(true);
  await expect.poll(async()=>(await roomMoto(page)).lights&1).toBe(1);
  await page.keyboard.up('Space');
  await expect.poll(async()=>(await moto(page)).lights.brake).toBe(false);
  await page.keyboard.press('z');
  await expect.poll(async()=>(await roomMoto(page)).lights&6).toBe(2);
  expect((await moto(page)).lights.left).toBe(true);
  await page.keyboard.press('c');
  await expect.poll(async()=>(await roomMoto(page)).lights&6).toBe(4);
  await page.keyboard.press('c');
  await expect.poll(async()=>(await roomMoto(page)).lights&6).toBe(0);
  await page.keyboard.press('x');
  await expect.poll(async()=>(await roomMoto(page)).lights&6).toBe(6);
  // The other player's copy of the bike blinks too, from the room's state.
  await expect.poll(async()=>{const seen=await moto(other);return [seen.lights.lit,seen.lights.left,seen.lights.right];}).toEqual([true,true,true]);
  await page.keyboard.press('x');
  await page.keyboard.press('h');
  await expect.poll(async()=>(await roomMoto(page)).lights&8).toBe(8);
  await page.keyboard.press('h');
  await expect.poll(async()=>(await roomMoto(page)).lights&8).toBe(0);
  await shot(page,'1-montado');

  // Flat out along the street until the parked car ahead: nothing but W.
  const local=(await self(page)).id as string;
  await page.evaluate(()=>{const w=window as any;w.__crash=[];const tick=()=>{const d=w.barDebug,s=d.snapshot(),m=d.motos()[0],me=s.world.players[s.localId],r=d.ragdolls()[0];w.__crash.push({t:performance.now(),anim:me.animationState,interaction:me.interactionState,x:me.x,z:me.z,speed:m?.speed,phase:m?.phase,up:m?.up,bike:m?.position,pelvis:r?.pelvis,head:r?.head,foot:r?.foot});if(w.__crash.length<6000)w.__crashTimer=requestAnimationFrame(tick);};w.__crashTimer=requestAnimationFrame(tick);});
  const bodies=[lastOfBody(page,local),lastOfBody(other,local)];
  await page.keyboard.down('w');
  let top=0;
  await expect.poll(async()=>{const state=await self(page),now=await moto(page);top=Math.max(top,Math.abs(now.speed));return state.animationState;},{timeout:40_000,intervals:[60]}).toBe('ragdoll');
  await page.keyboard.up('w');
  // Before the screenshot, which takes seconds here: by its end the body may already be up.
  const thrown=await ragdolls(page);
  expect(thrown.map((r:any)=>r.id)).toContain(local);
  await shot(page,'2-voando');
  // Far away, the other player is shown the same body: the same steps from the same start give the same place on the ground.
  const [mine,theirs]=await Promise.all(bodies);
  expect(mine&&theirs,'Both drew the body').toBeTruthy();
  expect(Math.hypot(mine![0]!-theirs![0]!,mine![2]!-theirs![2]!),`${mine} and ${theirs}`).toBeLessThan(.02);
  expect(top,'Going fast enough to be thrown').toBeGreaterThan(5);
  expect((await roomMoto(page)).riderId,'Nobody on the bike any more').toBe('');
  await expect(page.locator('#context')).toBeHidden();
  await page.waitForTimeout(400);await shot(page,'3-caindo');
  await page.waitForTimeout(500);await shot(page,'4-no-chao');
  // E does nothing on the ground.
  await page.keyboard.press('e');
  // The bike comes to rest on its side; the body gets up by itself.
  await expect.poll(async()=>(await roomMoto(page)).phase,{timeout:30_000,intervals:[200]}).toBe('down');
  const fallen=await moto(page);
  expect(fallen.up,'It lies on its side').toBeLessThan(.6);
  expect(fallen.lights.lit,'Its lamps went out').toBe(false);
  await expect.poll(async()=>(await self(page)).animationState,{timeout:30_000,intervals:[100]}).toBe('recover');
  await shot(page,'5-levantando-do-chao');
  await page.waitForTimeout(700);
  await shot(page,'6-levantando-do-chao');
  await expect.poll(async()=>(await self(page)).interactionState,{timeout:30_000,intervals:[200]}).toBe('');
  const recording=await page.evaluate(()=>{const w=window as any;cancelAnimationFrame(w.__crashTimer);return w.__crash;}) as Array<any>;
  fs.mkdirSync(SHOTS,{recursive:true});fs.writeFileSync(`${SHOTS}/recording.json`,JSON.stringify(recording));
  // The body flew on from where the bike stopped, in the way it was going, never under the ground.
  const flying=recording.filter(r=>r.pelvis);
  expect(flying.length).toBeGreaterThan(10);
  for(const r of flying)expect(r.pelvis[1],`Pelvis in the ground at ${r.t}`).toBeGreaterThan(-.02);
  // Limbs in one piece while it fell: the feet stay a body's length from the pelvis.
  for(const r of flying)if(r.foot)expect(Math.hypot(r.foot[0]-r.pelvis[0],r.foot[1]-r.pelvis[1],r.foot[2]-r.pelvis[2])).toBeLessThan(1.3);

  // Beside it: E lifts it, the rider's hands on it, and it stands on its wheels again.
  const lying=await roomMoto(page);
  await walkTo(page,lying.x+.9,lying.z+.9,.4);
  await expect(page.locator('#context-label')).toHaveText('para levantar a moto');
  await shot(page,'7-moto-caida');
  await page.keyboard.press('e');
  await expect.poll(async()=>(await roomMoto(page)).phase).toBe('lifting');
  await expect(page.locator('#context-label')).toHaveText('Levantando a moto…');
  await page.waitForTimeout(500);await shot(page,'8-levantando-a-moto');
  await page.waitForTimeout(500);await shot(page,'9-levantando-a-moto');
  await expect.poll(async()=>(await roomMoto(page)).phase,{timeout:10_000}).toBe('');
  await expect.poll(async()=>(await moto(page)).up).toBeGreaterThan(.97);
  await expect.poll(async()=>(await self(page)).interactionState).toBe('');
  await shot(page,'10-moto-de-pe');
  // And rides.
  await expect(page.locator('#context-label')).toHaveText('para subir');
  await page.keyboard.press('e');
  await expect.poll(async()=>(await roomMoto(page)).riderId).toBe(local);
  await hold(page,'s',1200);
  await expect.poll(async()=>Math.abs((await roomMoto(page)).speed)).toBeGreaterThan(0);
  await page.keyboard.down('Space');await page.waitForTimeout(600);await page.keyboard.up('Space');
  await page.keyboard.press('e');
  await expect.poll(async()=>(await roomMoto(page)).riderId).toBe('');
  await inVehicles(page,async()=>{await page.locator('[data-vehicle="despawn"]').click();await expect(page.locator('.admin-empty')).toHaveText('Nenhuma moto no mapa.');});
  await page.request.post('/api/auth/logout').catch(()=>undefined);
  expect(errors).toEqual([]);
  expect(otherErrors).toEqual([]);
  await context.close();await watcher.close();
});
