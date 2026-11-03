import {expect,test,type Page} from '@playwright/test';
import {enterAsAdmin,selfOf,walkTo} from './moto-helpers';

const shots='test-results/highfood';
const shot=async(page:Page,name:string)=>{await page.screenshot({path:`${shots}/${name}.png`,timeout:60_000}).catch(()=>{});};
const food=(page:Page)=>page.evaluate(()=>(window as any).barDebug.food());
const wallet=(page:Page)=>page.request.get('/api/wardrobe').then(response=>response.json()).then(view=>view.balance as number);
const ownBike=(page:Page,id:string)=>page.evaluate(owner=>Object.values((window as any).barDebug.snapshot().world.motos??{}).find((moto:any)=>moto.ownerId===owner) as any,id);
/** A point beside the bike, `side` metres to one side of it. */
const besideBike=(moto:{x:number;z:number;yaw:number},side:number)=>({x:moto.x+Math.cos(moto.yaw)*side,z:moto.z-Math.sin(moto.yaw)*side});

/**
 * Rides along the GPS's line with key events from inside the page, as Playwright's round trips are too slow to steer a bike with: looks ahead on the line, slows for
 * corners, backs off when stopped by something. Thrown off, it gets up, lifts the bike and goes on, as anyone would.
 */
async function rideGps(page:Page,id:string,arrive:number,span=170_000):Promise<void>{
  const deadline=Date.now()+span;
  while(Date.now()<deadline){
    const outcome:string=await page.evaluate(async({owner,arrive,span})=>{
      const debug=(window as any).barDebug,held=new Set<string>();
      const key=(code:string,on:boolean)=>{if(on===held.has(code))return;if(on)held.add(code);else held.delete(code);window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,key:code.slice(3).toLowerCase(),bubbles:true}));};
      const until=performance.now()+Math.min(span,60_000);
      let moved=performance.now(),last={x:Infinity,z:Infinity},reverseUntil=0;
      try{
        while(performance.now()<until){
          await new Promise(r=>setTimeout(r,40));
          const gps=debug.gps(),bike:any=Object.values(debug.snapshot().world.motos??{}).find((m:any)=>m.ownerId===owner),route:number[][]=gps.route as number[][];
          if(!bike||bike.phase||bike.riderId!==owner)return 'fell';
          if(route.length<2)return 'no-route';
          if(gps.remaining<=arrive){key('KeyW',false);key('KeyA',false);key('KeyD',false);key('KeyS',bike.speed>.5);if(Math.abs(bike.speed)<2.5){key('KeyS',false);return 'arrived';}continue;}
          let look=route[1]!;for(let i=1;i<route.length;i++){look=route[i]!;if(Math.hypot(look[0]!-bike.x,look[1]!-bike.z)>3+Math.abs(bike.speed)*.35)break;}
          const want=Math.atan2(look[0]!-bike.x,look[1]!-bike.z),turn=Math.atan2(Math.sin(want-bike.yaw),Math.cos(want-bike.yaw));
          if(performance.now()<reverseUntil){key('KeyW',false);key('KeyS',true);key('KeyA',turn<0);key('KeyD',turn>0);continue;}
          let corner=0;
          // The line's second point only joins the way just ahead: the next corner is the first one further off.
          const bend=route.findIndex((point,i)=>i>0&&Math.hypot(point[0]!-bike.x,point[1]!-bike.z)>5);
          if(bend>0&&route[bend+1]&&Math.hypot(route[bend]![0]!-bike.x,route[bend]![1]!-bike.z)<16){const d1=Math.atan2(route[bend]![0]!-bike.x,route[bend]![1]!-bike.z),d2=Math.atan2(route[bend+1]![0]!-route[bend]![0]!,route[bend+1]![1]!-route[bend]![1]!);corner=Math.abs(Math.atan2(Math.sin(d2-d1),Math.cos(d2-d1)));}
          const fast=gps.remaining<arrive+14?2.5:corner>.5?4:Math.abs(turn)<.4?10:Math.abs(turn)<.8?6:3;
          key('KeyA',turn>.05);key('KeyD',turn<-.05);key('KeyW',bike.speed<fast);key('KeyS',bike.speed>fast+1.5);
          if(Math.hypot(bike.x-last.x,bike.z-last.z)>.4){last={x:bike.x,z:bike.z};moved=performance.now();}
          else if(performance.now()-moved>2500){reverseUntil=performance.now()+1300;moved=performance.now()+1300;}
        }
        return 'more';
      }finally{for(const code of [...held])key(code,false);}
    },{owner:id,arrive,span});
    if(outcome==='arrived')return;
    if(outcome==='no-route')throw new Error(`O pedido acabou no caminho: ${JSON.stringify(await food(page))}`);
    if(outcome==='fell'){
      await expect.poll(async()=>{const self=await selfOf(page);return !['ragdoll','recover'].includes(self.animationState)&&!self.interactionState;},{timeout:40_000}).toBe(true);
      await expect.poll(async()=>{const moto=await ownBike(page,id);return moto.phase===''||moto.phase==='down';},{timeout:20_000}).toBe(true);
      const fallen=await ownBike(page,id);
      await walkTo(page,fallen.x+Math.cos(fallen.yaw)*.85,fallen.z-Math.sin(fallen.yaw)*.85,.3);
      await page.keyboard.press('e');await page.waitForTimeout(2300);
      if((await ownBike(page,id)).riderId!==id){await page.keyboard.press('e');await page.waitForTimeout(800);}
      await page.waitForTimeout(1000);
    }
  }
  if(span===170_000)throw new Error('A viagem passou do tempo');
}

/**
 * The whole job in a real browser, with real keys and a real ride along the GPS: the bike bought on the phone, the map's waypoint, the base, the order showing only in the
 * app with the vibration in the pocket, the bag, the customer's dialog, the pay, the history, and the customer's profile with an uploaded picture in the administration.
 */
test('Highfood: buy the bike, take an order in the app, ride the GPS, hand it over, get paid',async({page})=>{
  test.setTimeout(480_000);
  const problems:string[]=[];
  page.on('pageerror',error=>problems.push(error.message));
  await enterAsAdmin(page);
  const me=await selfOf(page);
  await page.evaluate(()=>{const original=AudioBufferSourceNode.prototype.start;(window as any).__buzz=0;AudioBufferSourceNode.prototype.start=function(...args:any[]){if(Math.abs((this.buffer?.duration??0)-1.32)<.02)(window as any).__buzz++;return original.apply(this,args as any);};});
  const funded=await page.request.post('/api/admin/wallet',{data:{playerId:me.id,operation:'add',amount:11_000,reason:'Teste do Highfood',requestId:crypto.randomUUID()}});
  expect(funded.ok(),await funded.text()).toBe(true);
  await page.waitForTimeout(500);
  await page.evaluate(()=>(window as any).barDebug.syncWallet?.());
  await page.keyboard.press('k');
  await expect(page.locator('#phone.open')).toBeVisible();
  // HighMotors.
  await page.locator('[data-app="highmotors"]').click();
  await expect(page.locator('.ph-app-highmotors')).toBeVisible();
  await page.waitForTimeout(800);
  await shot(page,'01-highmotors');
  const bought=(await page.request.get('/api/vehicles').then(r=>r.json())).owned;
  if(!bought){
    await page.locator('[data-hm="buy"]').click();
    await shot(page,'02-confirm');
    await page.locator('[data-hm="confirm"]').click();
    await expect(page.locator('[data-hm="highfood"]')).toBeVisible({timeout:15_000});
    await shot(page,'02b-bought');
  }
  await page.locator('[data-phone-home]').click();
  // The phone's map: a tap marks a waypoint, and the line appears.
  await page.locator('[data-app="mapas"]').click();
  const map=page.locator('.map-view canvas');await expect(map).toBeVisible();
  const box=(await map.boundingBox())!;
  await page.mouse.click(box.x+box.width*.7,box.y+box.height*.32);
  await expect(page.locator('.map-card')).toContainText('pelas ruas',{timeout:8000});
  await page.waitForTimeout(800);
  await shot(page,'03-map-waypoint');
  await page.locator('[data-map="city"]').click();await page.waitForTimeout(500);
  await shot(page,'04-map-city');
  await page.locator('[data-map="clear-target"]').click();
  await page.keyboard.press('k');
  // The base.
  // Along the pavement in front of the bar, then up the street at its side.
  const start=await selfOf(page);
  await walkTo(page,start.x,5.4,.6);
  await walkTo(page,-3.2,5.4,.6);
  await walkTo(page,-3.2,-13.97,.6);
  await walkTo(page,-3.99,-13.97,.5);
  await expect.poll(async()=>{const at=await selfOf(page);return Math.hypot(at.x+3.99,at.z+13.97);},{timeout:30_000}).toBeLessThan(1.6);
  await page.waitForTimeout(500);
  await shot(page,'05-base');
  await page.keyboard.press('e');
  await expect(page.locator('.hf-panel-logo')).toBeVisible({timeout:10_000});
  await expect(page.locator('[data-action="food-start"]')).toBeVisible({timeout:10_000});
  await shot(page,'06-base-panel');
  await page.keyboard.press('Escape');
  // The bike lives in the garage now: from its ring, E, and out it comes.
  await walkTo(page,-13.25,-8.3,.45);
  await expect.poll(async()=>(await page.locator('#context-label').textContent())??'',{timeout:15_000}).toContain('Garagem');
  await page.keyboard.press('e');
  await expect(page.locator('.garage-vehicle').first()).toBeVisible({timeout:10_000});
  await shot(page,'06b-garage');
  await page.locator('[data-action="garage-take"]').first().click();
  await expect.poll(async()=>!!(await ownBike(page,me.id)),{timeout:15_000}).toBe(true);
  // Online from the app, not from the base.
  await page.keyboard.press('k');
  await expect(page.locator('#phone.open')).toBeVisible();
  await page.locator('[data-phone-home]').click().catch(()=>{});
  await page.locator('[data-app="highfood"]').click();
  await expect(page.locator('.hf-logo-img')).toBeVisible({timeout:10_000});
  await shot(page,'06c-app-offline');
  await page.locator('[data-hf="online"]').click();
  await expect.poll(async()=>(await food(page)).status,{timeout:10_000}).toBe('waiting');
  await page.waitForTimeout(600);
  await shot(page,'07-waiting');
  // Put away: the order comes and only the vibration tells.
  await page.keyboard.press('k');
  await expect.poll(async()=>(await food(page)).status,{timeout:100_000,intervals:[500]}).toBe('offer');
  await expect.poll(()=>page.evaluate(()=>(window as any).__buzz),{timeout:10_000}).toBeGreaterThan(0);
  await expect(page.locator('[data-action="phone"] .phone-badge')).toBeVisible();
  await expect(page.locator('#toasts')).not.toContainText('pedido');
  // Looking at the app shows it, and the buzzing stops.
  await page.keyboard.press('k');
  await page.waitForTimeout(500);
  await shot(page,'08-phone-home-offer');
  await page.locator('[data-app="highfood"]').click();
  await expect(page.locator('.hf-offer')).toBeVisible();
  await page.waitForTimeout(500);
  await shot(page,'09-offer');
  const before=await page.evaluate(()=>(window as any).__buzz);
  await page.locator('[data-hf="accept"]').click();
  await expect.poll(async()=>(await food(page)).status,{timeout:10_000}).toBe('order');
  await page.waitForTimeout(700);
  await shot(page,'10-order');
  await page.locator('[data-hf="map"]').click();await page.waitForTimeout(1000);
  await shot(page,'11-order-map');
  await page.keyboard.press('k');
  await page.waitForTimeout(800);
  expect(await page.evaluate(()=>(window as any).__buzz)).toBe(before);
  const order=(await food(page)).order,pickup=order.pickup;
  expect(order.stage).toBe('pickup');expect(order.code).toMatch(/^\d{4}$/);
  // The GPS goes first to the pickup point, the nearest one: the kerb in front of the locker.
  await expect.poll(()=>page.evaluate(()=>(window as any).barDebug.gps().route.length),{timeout:8000}).toBeGreaterThan(1);
  await expect.poll(()=>page.evaluate(()=>(window as any).barDebug.gps().target?.label)).toContain('Ponto de retirada');
  expect((await page.evaluate(()=>(window as any).barDebug.gps().target)).x).toBe(pickup.parkX);
  await shot(page,'12-minimap-route');
  // To the bike and up.
  const bike=await ownBike(page,me.id);
  // Whichever side of it has room (one may be against a wall).
  await walkTo(page,bike.x+Math.cos(bike.yaw)*.8,bike.z-Math.sin(bike.yaw)*.8,.25);
  await page.waitForTimeout(600);
  if(!((await page.locator('#context-label').textContent())??'').includes('subir'))await walkTo(page,bike.x-Math.cos(bike.yaw)*.8,bike.z+Math.sin(bike.yaw)*.8,.25);
  await expect.poll(async()=>(await page.locator('#context-label').textContent())??'',{timeout:15_000}).toContain('subir');
  await page.keyboard.press('e');
  await expect.poll(async()=>(await selfOf(page)).animationState,{timeout:10_000}).toBe('ride');
  await page.waitForTimeout(1000);
  // At the pickup point: off the bike, up to the screen, E. It takes the code in the order and nothing else.
  await page.evaluate(({x,z})=>(window as any).barDebug.send('test.moto.place',{x,z}),{x:pickup.parkX,z:pickup.parkZ});
  await expect.poll(async()=>{const at=await selfOf(page);return Math.hypot(at.x-pickup.parkX,at.z-pickup.parkZ);},{timeout:10_000}).toBeLessThan(3);
  await page.waitForTimeout(800);
  await page.keyboard.press('e');
  await expect.poll(async()=>(await selfOf(page)).animationState,{timeout:10_000}).not.toBe('ride');
  expect((await food(page)).order.stage).toBe('pickup');
  await walkTo(page,pickup.standX,pickup.standZ,.4);
  await expect.poll(async()=>(await page.locator('#context-label').textContent())??'',{timeout:15_000}).toContain('Retirar o pedido');
  await page.waitForTimeout(400);
  await shot(page,'12b-at-locker');
  await page.keyboard.press('e');
  await expect(page.locator('#food-locker.open')).toBeVisible({timeout:10_000});
  await expect(page.locator('.locker-title')).toHaveText('RETIRE SEU PEDIDO');
  await page.waitForTimeout(300);
  await shot(page,'12c-locker');
  // The phone opens over the screen, with the code in the order.
  await page.keyboard.press('k');
  await expect(page.locator('#phone.open')).toBeVisible();
  await page.locator('[data-phone-home]').click().catch(()=>{});
  await page.locator('[data-app="highfood"]').click();
  await expect(page.locator('.hf-code')).toContainText([...order.code].join(''),{timeout:10_000});
  await page.waitForTimeout(400);
  await shot(page,'12d-locker-and-code');
  await page.keyboard.press('k');
  await expect(page.locator('#food-locker.open')).toBeVisible();
  // A wrong code is refused and cleared.
  const wrong=order.code==='1111'?'2222':'1111';
  await page.keyboard.type(wrong.slice(0,2));
  await page.waitForTimeout(300);
  await shot(page,'12e-locker-typing');
  await page.keyboard.type(wrong.slice(2));
  await page.keyboard.press('Enter');
  await expect(page.locator('.locker-sub')).toContainText('incorreto',{timeout:8000});
  await expect(page.locator('.locker-code span').first()).toHaveText('');
  await shot(page,'12f-locker-wrong');
  expect((await food(page)).order.stage).toBe('pickup');
  // The right one, from the screen's own keys.
  for(const digit of order.code)await page.locator(`.locker-keys [data-locker-key="${digit}"]`).click();
  await page.locator('.locker-open').click();
  await expect(page.locator('.locker-done')).toBeVisible({timeout:8000});
  await shot(page,'12g-locker-open');
  await expect(page.locator('#food-locker')).toBeHidden({timeout:8000});
  await expect.poll(async()=>(await food(page)).order?.stage,{timeout:15_000}).toBe('carrying');
  expect((await selfOf(page)).parcel).toBe('bag');
  await page.waitForTimeout(400);
  await shot(page,'12h-collected');
  // Back on the bike, the bag goes in the box and the GPS turns to the customer.
  await walkTo(page,besideBike(await ownBike(page,me.id),.8).x,besideBike(await ownBike(page,me.id),.8).z,.25);
  await page.waitForTimeout(600);
  if(!((await page.locator('#context-label').textContent())??'').includes('subir')){const moto=await ownBike(page,me.id);await walkTo(page,besideBike(moto,-.8).x,besideBike(moto,-.8).z,.25);}
  await expect.poll(async()=>(await page.locator('#context-label').textContent())??'',{timeout:15_000}).toContain('subir');
  await page.keyboard.press('e');
  await expect.poll(async()=>(await selfOf(page)).animationState,{timeout:10_000}).toBe('ride');
  await expect.poll(async()=>(await food(page)).order?.stage,{timeout:10_000}).toBe('going');
  expect((await selfOf(page)).parcel).toBe('');
  await expect.poll(()=>page.evaluate(()=>(window as any).barDebug.gps().target?.x)).toBe(order.parkX);
  await page.waitForTimeout(1000);
  // The ride, for real.
  // A stretch of the ride with real keys: the line gets shorter as the bike follows it. The rest of the city is covered by the tests of the routes.
  await page.keyboard.down('w');await page.waitForTimeout(600);await page.keyboard.up('w');
  await shot(page,'13-riding');
  const leftBefore:number=await page.evaluate(()=>(window as any).barDebug.gps().remaining);
  await rideGps(page,me.id,Math.max(5,leftBefore-45),25_000);
  expect(await page.evaluate(()=>(window as any).barDebug.gps().remaining)).toBeLessThan(leftBefore-10);
  await shot(page,'13b-riding-on');
  await page.evaluate(({x,z})=>(window as any).barDebug.send('test.moto.place',{x,z}),{x:order.parkX,z:order.parkZ});
  await expect.poll(async()=>{const at=await selfOf(page);return Math.hypot(at.x-order.parkX,at.z-order.parkZ);},{timeout:10_000}).toBeLessThan(3);
  await page.waitForTimeout(1500);
  await shot(page,'14a-at-door');
  await shot(page,'14-arrived');
  await page.keyboard.press('e');
  await expect.poll(async()=>(await food(page)).order?.stage,{timeout:15_000}).toBe('carrying');
  await page.waitForTimeout(400);
  await shot(page,'15-bag');
  // On foot, to the customer waiting on the pavement.
  const npcId=`cliente-${order.id}`;
  await expect.poll(()=>page.evaluate(id=>!!(window as any).barDebug.snapshot().world.npcs[id],npcId),{timeout:10_000}).toBe(true);
  await walkTo(page,order.x+Math.sin(order.parkX-order.x?0:0)*0+(order.parkX-order.x)/Math.hypot(order.parkX-order.x,order.parkZ-order.z)*1.2,order.z+(order.parkZ-order.z)/Math.hypot(order.parkX-order.x,order.parkZ-order.z)*1.2,.4);
  await expect.poll(async()=>(await page.locator('#context-label').textContent())??'',{timeout:15_000}).toContain('Entregar o pedido');
  await page.waitForTimeout(400);
  await shot(page,'16-customer');
  await page.keyboard.press('e');
  await expect(page.locator('#food-dialog.open')).toBeVisible({timeout:10_000});
  await expect(page.locator('#food-dialog')).toContainText(order.customer.name);
  await page.waitForTimeout(1500);
  await shot(page,'17-dialog');
  const coins=await wallet(page);
  await page.keyboard.press('e');
  await expect(page.locator('#food-dialog')).toBeHidden({timeout:5000});
  await expect(page.locator('#toasts')).toContainText('Entrega feita',{timeout:15_000});
  await page.waitForTimeout(700);
  await shot(page,'18-delivered');
  await expect.poll(()=>wallet(page),{timeout:10_000}).toBeGreaterThan(coins);
  await expect.poll(async()=>(await food(page)).status,{timeout:5000}).toBe('waiting');
  // In the app: what was earned and the history.
  await page.keyboard.press('k');
  await page.locator('[data-app="highfood"]').click();
  await page.locator('[data-hf-tab="orders"]').click();await expect(page.locator('.hf-entry').first()).toContainText(order.customer.name,{timeout:8000});
  await page.waitForTimeout(300);await shot(page,'19-orders');
  await page.locator('[data-hf-tab="earnings"]').click();await expect(page.locator('.hf-chart')).toBeVisible();
  await page.waitForTimeout(300);await shot(page,'20-earnings');
  await page.locator('[data-hf-tab="profile"]').click();await expect(page.locator('.hf-profile')).toBeVisible();
  await page.waitForTimeout(300);await shot(page,'21-profile');
  await page.locator('[data-hf="offline"]').click();
  await expect.poll(async()=>(await food(page)).status,{timeout:8000}).toBe('off');
  await page.keyboard.press('k');
  // The customers in the administration, with a picture.
  await page.getByRole('button',{name:'Administração',exact:true}).click();
  await page.locator('[data-admin-nav="highfood"]').click();
  await expect(page.locator('.admin-food-table')).toBeVisible({timeout:15_000});
  await page.locator('[data-food="edit"]').first().click();
  await expect(page.locator('[data-food-form]')).toBeVisible();
  await page.waitForTimeout(400);await shot(page,'22-admin');
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64');
  await page.locator('[data-food-file]').setInputFiles({name:'cliente.png',mimeType:'image/png',buffer:png});
  await expect(page.locator('.admin-feedback')).toContainText('Foto salva',{timeout:10_000});
  await page.getByRole('button',{name:'Fechar janela'}).click();
  expect(problems,problems.join('\n')).toEqual([]);
});
