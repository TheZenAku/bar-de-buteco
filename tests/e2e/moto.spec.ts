import fs from 'node:fs';
import {test,expect,type Browser,type Page} from '@playwright/test';

const SHOTS=process.env.MOTO_SHOTS||'test-results/moto';
const PASSWORD=process.env.DEMO_PASSWORD||'ButecoDemo2026!';
const errorsOf=(page:Page)=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&!/Failed to load resource|favicon/.test(message.text()))errors.push(message.text());});
  return errors;
};
async function enter(page:Page,email:string):Promise<void>{
  await expect.poll(async()=>(await page.request.get('/api/ready').catch(()=>undefined))?.ok()??false,{timeout:90_000,intervals:[500]}).toBe(true);
  await page.goto('/');
  await page.getByLabel('E-mail',{exact:true}).fill(email);
  await page.getByLabel('Senha',{exact:true}).fill(PASSWORD);
  await page.getByRole('button',{name:'Entrar no bar'}).click();
  await expect(page.locator('#game')).toBeVisible();
  await expect(page.locator('#waiting')).toBeHidden({timeout:60000});
  await expect.poll(()=>page.evaluate(()=>{const state=(window as any).barDebug.snapshot();return state.world?.players?.[state.localId]?.connected===true;}),{timeout:30000}).toBe(true);
  await expect.poll(()=>page.evaluate(()=>(window as any).barDebug.motos()?.length??0),{timeout:30000}).toBeGreaterThan(0);
}
const moto=(page:Page)=>page.evaluate(()=>(window as any).barDebug.motos()[0]);
const self=(page:Page)=>page.evaluate(()=>{const d=(window as any).barDebug.snapshot();return d.world.players[d.localId];});
const roomMoto=(page:Page)=>page.evaluate(()=>Object.values((window as any).barDebug.snapshot().world.motos)[0] as any);
/**
 * Short presses towards a point, keys relative to the camera, looking again after each: a slow page does not overshoot.
 * Stopped by something (a bin, a tree), a step to the side first.
 */
async function walkTo(page:Page,x:number,z:number,tolerance=.25):Promise<void>{
  const press=async(keys:string[],ms:number)=>{for(const key of keys)await page.keyboard.down(key);await page.waitForTimeout(ms);for(const key of keys)await page.keyboard.up(key);};
  const deadline=Date.now()+45_000;
  let last={x:Infinity,z:Infinity},side=1;
  while(Date.now()<deadline){
    const at=await self(page),yaw=await page.evaluate(()=>(window as any).barDebug.camera().yaw),dx=x-at.x,dz=z-at.z,length=Math.hypot(dx,dz);
    if(length<=tolerance)break;
    if(Math.hypot(at.x-last.x,at.z-last.z)<.02){await press([side>0?'w':'s',side>0?'a':'d'],300);side=-side;last={x:Infinity,z:Infinity};continue;}
    last=at;
    const across=(Math.cos(yaw)*dx-Math.sin(yaw)*dz)/length,ahead=(-Math.sin(yaw)*dx-Math.cos(yaw)*dz)/length,keys:string[]=[];
    if(across>.38)keys.push('d');if(across<-.38)keys.push('a');if(ahead>.38)keys.push('w');if(ahead<-.38)keys.push('s');
    await press(keys,Math.min(250,length/3.5*800));
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(250);
}
const shot=async(page:Page,name:string)=>{fs.mkdirSync(SHOTS,{recursive:true});await page.screenshot({path:`${SHOTS}/${name}.png`});};
/** Orbits the free camera by dragging over the canvas. */
async function orbit(page:Page,dx:number,dy=0):Promise<void>{
  const box=(await page.locator('canvas').first().boundingBox())!,x=box.x+box.width/2,y=box.y+box.height/3;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:8});await page.mouse.up();
}
const dot=(a:number[],b:number[])=>a[0]!*b[0]!+a[2]!*b[2]!;
const minus=(a:number[],b:number[])=>[a[0]!-b[0]!,a[1]!-b[1]!,a[2]!-b[2]!];

test('the delivery bike with real keys: E to get on, W rides where the headlight points, D turns right, walls stop it, the others see it, E to get off',async({browser}:{browser:Browser})=>{
  test.setTimeout(240_000);
  const context=await browser.newContext({viewport:{width:1280,height:720}}),page=await context.newPage(),errors=errorsOf(page);
  const watcher=await browser.newContext({viewport:{width:1280,height:720}}),other=await watcher.newPage(),otherErrors=errorsOf(other);
  await enter(page,'jogador1@bar.local');
  await enter(other,'jogador2@bar.local');
  const parked=await roomMoto(page);
  expect(parked.riderId).toBe('');
  await walkTo(page,parked.x+.9,parked.z-2.85);
  await expect(page.locator('#context')).toBeHidden();

  // Walk up to it from the pavement: the prompt says "E para subir".
  await walkTo(page,parked.x+.45,parked.z-1);
  await expect(page.locator('#context')).toBeVisible();
  await expect(page.locator('#context')).toContainText('E');
  await expect(page.locator('#context-label')).toHaveText('para subir');
  await shot(page,'1-parada');
  // Stand the watcher on the pavement too, a little ahead of it.
  await walkTo(other,parked.x-2.6,parked.z-.75);
  // Its camera turned along the street, towards where the bike will go.
  await orbit(other,-150);

  // Parked, from both sides: the logo on the box.
  const zoom=async(delta:number)=>{await page.mouse.move(640,240);await page.mouse.wheel(0,delta);await page.waitForTimeout(300);};
  await zoom(-900);
  const yawBefore=await page.evaluate(()=>(window as any).barDebug.camera().yaw);
  await orbit(page,Math.round((yawBefore-Math.PI*.15)/.006));await page.waitForTimeout(500);await shot(page,'2-bau-lado-a');
  await orbit(page,Math.round(Math.PI/.006));await page.waitForTimeout(500);await shot(page,'3-bau-lado-b');

  await page.keyboard.press('e');
  await page.waitForTimeout(1500);
  // The riding pose from the side, before the view swings behind the bike; then back to the chase distance.
  await orbit(page,Math.round(Math.PI*.5/.006));await page.waitForTimeout(400);await shot(page,'4a-montado-lado-a');
  await orbit(page,Math.round(Math.PI/.006));await page.waitForTimeout(400);await shot(page,'4b-montado-lado-b');
  await zoom(400);
  const local=(await self(page)).id as string;
  await expect.poll(async()=>(await roomMoto(page)).riderId).toBe(local);
  expect((await self(page)).animationState).toBe('ride');
  await expect(page.locator('#context-label')).toHaveText('para descer');
  await expect.poll(()=>page.evaluate(()=>(window as any).barDebug.animations().find((a:any)=>a.clip==='Sit')?.clip)).toBe('Sit');
  await page.waitForTimeout(2800);
  await shot(page,'4-montado-parado');
  const camera=await page.evaluate(()=>(window as any).barDebug.camera());
  expect(camera.mode).toBe('third');
  const rest=await moto(page);
  // Behind the bike: the camera on the side its tail points to.
  expect(dot(minus(camera.position,rest.position),rest.front)).toBeLessThan(-2);

  // W: where the headlight points. The wheels turn forward.
  const before=await moto(page);
  const headlightAhead=dot(minus(before.points.ponto_farol,before.position),before.front);
  expect(headlightAhead).toBeGreaterThan(.4);
  // Off the throttle for each screenshot: they take seconds here, and the street ends in a parked car 38 m ahead.
  await page.keyboard.down('w');await page.waitForTimeout(1800);
  const riding=await moto(page);
  await page.keyboard.up('w');
  await shot(page,'5-andando');
  const moved=minus(riding.position,before.position);
  expect(Math.hypot(moved[0]!,moved[2]!)).toBeGreaterThan(4);
  expect(dot(moved,before.front)/Math.hypot(moved[0]!,moved[2]!)).toBeGreaterThan(.99);
  expect(riding.speed).toBeGreaterThan(4);
  // Rolling forward: the angle only grows, and at that angle the top of the real bone is that far towards the headlight.
  const wheel=riding.rig;
  expect(wheel.rodas).toBeGreaterThan(0);
  expect(Math.abs(wheel.topoRoda-Math.sin(wheel.rodas*Math.PI/180))).toBeLessThan(.08);
  // Stopped on the handbrake: seen by the other player, with no physics of their own, following the room's bike with the
  // rider on it.
  await page.keyboard.down('Space');
  await expect.poll(async()=>{const seen=await moto(other);return seen.riderId;}).toBe(local);
  await expect.poll(async()=>{const seen=await moto(other),mine=await roomMoto(other);return Math.hypot(seen.position[0]-mine.x,seen.position[2]-mine.z);}).toBeLessThan(2.5);
  await expect.poll(()=>other.evaluate(id=>(window as any).barDebug.animations().find((a:any)=>a.id===id)?.clip,local)).toBe('Sit');
  await shot(other,'6-visto-por-outro-jogador');
  await page.keyboard.up('Space');

  // D: right. The handlebar turns right (the left grip goes forward), it leans into the curve, the nose comes round.
  await page.keyboard.down('w');await page.waitForTimeout(1200);
  const straight=await moto(page);
  const gripAhead=(m:any)=>dot(minus(m.points.ponto_mao_E,m.position),m.front)-dot(minus(m.points.ponto_mao_D,m.position),m.front);
  await page.keyboard.down('d');await page.waitForTimeout(650);
  const turning=await moto(page);
  await page.keyboard.up('w');
  await shot(page,'7-virando-direita');
  await page.keyboard.up('d');
  expect(turning.speed).toBeGreaterThan(3);
  expect(turning.steer).toBeGreaterThan(.5);
  expect(turning.rig.guidao).toBeGreaterThan(1);
  expect(turning.rig.inclinacao).toBeGreaterThan(1);
  expect(gripAhead(turning)).toBeGreaterThan(gripAhead(straight)+.02);
  // Right of −X is −Z: the yaw goes down.
  expect(Math.atan2(Math.sin(turning.yaw-straight.yaw),Math.cos(turning.yaw-straight.yaw))).toBeLessThan(-.05);
  // S brakes it; on foot nothing moves until it is slow enough (E is refused at speed).
  await page.keyboard.down('s');await page.waitForTimeout(1200);await page.keyboard.up('s');
  expect(Math.abs((await moto(page)).speed)).toBeLessThan(4);

  // Against a wall: it never crosses it and it stays upright (the room's own bike, whatever the camera shows).
  await page.keyboard.down('w');
  const hits:number[]=[];let last=await roomMoto(page);
  const started=Date.now();
  while(Date.now()-started<9000){last=await roomMoto(page);hits.push(Math.abs(last.speed));await page.waitForTimeout(100);}
  await page.keyboard.up('w');
  await shot(page,'8-contra-a-parede');
  expect(Math.min(...hits.slice(-10))).toBeLessThan(2);
  const stopped=await moto(page);
  expect(stopped.position[1]).toBeGreaterThanOrEqual(-.01);
  await page.waitForTimeout(600);

  // S and Space, then E: off on the left, standing, the bike stays.
  await page.keyboard.down('Space');await page.waitForTimeout(700);await page.keyboard.up('Space');
  await page.waitForTimeout(300);
  await page.keyboard.press('e');
  await expect.poll(async()=>(await roomMoto(page)).riderId).toBe('');
  const off=await self(page),left=await roomMoto(page);
  expect(off.interactionState).toBe('');
  const left_x=Math.cos(left.yaw),left_z=-Math.sin(left.yaw);
  expect((off.x-left.x)*left_x+(off.z-left.z)*left_z).toBeGreaterThan(.5);
  await page.waitForTimeout(600);
  await shot(page,'9-desceu');
  expect(errors).toEqual([]);
  expect(otherErrors).toEqual([]);
  await context.close();await watcher.close();
});
