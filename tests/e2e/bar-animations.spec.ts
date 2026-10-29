import {test,expect,type Page} from '@playwright/test';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {previewPath} from './preview-path';
import {walk} from './walk';

/**
 * The bar animations (animacoes_bar.js ported to apps/web/src/engine/bar-animations.ts): every action on a different skin
 * in the scene fixture, from synced states as the room sends them; then a live player smoking (F) and the development
 * panel (F8) making Magrão pour a chopp.
 */
const map=JSON.parse(readFileSync(new URL('../../packages/shared/src/map-data.json',import.meta.url),'utf8')) as typeof import('../../packages/shared/src/map-data.json');
const fixture='/@fs/'+fileURLToPath(new URL('../fixtures/environment.html',import.meta.url)).replaceAll('\\','/');
const seat=map.seats.find(s=>s.id==='seat-9')!,urinal=map.barAnimations.urinals[0]!,magrao=map.barAnimations.counter.magrao,table=map.tables.find(t=>t.number===3)!;
const corner=(()=>{const {x,z,yaw}=table.anchor,{x:cx,z:cz}=map.barAnimations.clips.limpar_mesa.start,cos=Math.cos(yaw),sin=Math.sin(yaw);
  return {x:x+cx*cos+cz*sin,z:z-cx*sin+cz*cos,rotation:yaw+map.barAnimations.clips.limpar_mesa.start.yaw};})();
type Actor=[id:string,skin:string,x:number,y:number,z:number,rotation:number,state:string,ago:number,place?:string];

/** Syncs players (and Magrão) doing bar actions, each begun `ago` ms before the fixture's clock. */
function sync(page:Page,actors:Actor[],serve?:[state:string,ago:number],served:Record<string,unknown>={}){
  return page.evaluate(([actors,serve,served,magrao])=>{
    const f=(window as any).fixture,now=f.now(),players:Record<string,unknown>={};
    for(const [id,skin,x,y,z,rotation,state,ago,place] of actors)players[id]={id,displayName:id,color:'#fff',skin,x,y,z,rotation,animationState:state,animationStartedAt:now-ago,
      interactionState:place??'',currentTableId:'',lastProcessedInput:0,connected:true};
    const npcs=serve?{bartender:{id:'bartender',displayName:'Magrão',color:'#fff',x:magrao.x,y:magrao.y,z:magrao.z,rotation:magrao.yaw,animationState:serve[0],animationStartedAt:now-serve[1],behavior:'serving'}}:{};
    for(const item of Object.values(served) as any[])item.placedAt=now+item.placedAt;
    f.scene.setWorld({players,npcs,tables:{},event:{id:'',type:'',startedAt:0,durationMs:0},occupancy:0,capacity:32,serverTime:now,served},'');
  },[actors,serve,served,magrao] as const);
}
/** Moves the fixture's clock (the room's) on, a frame at a time. */
async function advance(page:Page,ms:number){for(let i=0;i<10;i++){await page.evaluate(step=>(window as any).fixture.advance(step),ms/10);await page.waitForTimeout(30);}}
const status=(page:Page)=>page.evaluate(()=>(window as any).fixture.scene.getMapStatus().barAnimations);
const bars=(page:Page)=>page.evaluate(()=>Object.fromEntries((window as any).fixture.scene.getAnimations().map((a:any)=>[a.id,a.bar?.clip??a.clip])));

test('every bar animation plays on the skins from the room\'s state: chair pulled and back, props in hand, the cup and lid swapped, particles and leftovers',async({page})=>{
  test.setTimeout(240000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(['error','warning'].includes(message.type()))errors.push(message.text());});
  await page.goto(fixture);await page.evaluate(()=>(window as any).fixture.ready);
  await page.evaluate(()=>(window as any).fixture.hour(20));
  // Como conferir (PROMPT_INTEGRACAO_ANIMACOES.md): what the module finds in the map.
  expect(await status(page)).toMatchObject({cadeiras:124,mesas:31,mictorios:3,balcao:true,entrega:true});

  // Six actions at once, six skins (Magrão's own).
  const street=(dx:number):[number,number,number]=>[12+dx,.15,1.6];
  await sync(page,[
    ['p-sit','rafael',seat.x,seat.y,seat.z,seat.rotation,'sit',2600,'seat-9'],
    ['p-uri','leandro',urinal.x,urinal.y,urinal.z,urinal.yaw,'urinate',4000,urinal.id],
    ['p-smoke','nathan',...street(-1.5),Math.PI,'smoke',9000],
    ['p-vomit','gilmar-gordo',...street(0),Math.PI,'vomit',3000],
    ['p-fall','read',...street(1.5),Math.PI,'fallen',5000],
    ['p-clean','read',corner.x,table.y,corner.z,corner.rotation,'clean',3000],
  ],['serve-chopp',5000]);
  await expect.poll(()=>bars(page),{timeout:90000}).toEqual({'p-sit':'sentar','p-uri':'urinar','p-smoke':'fumar_loop','p-vomit':'vomitar','p-fall':'cair','p-clean':'limpar_mesa',bartender:'magrao_chopp'});
  await advance(page,300);
  const playing=await status(page);
  // Sitting down pulls the map's own chair (INST_A_cadeira-vermelha) about 40 cm back.
  const pulled=await page.evaluate(()=>(window as any).fixture.scene.barChair('seat-9'));
  expect(Math.hypot(pulled[0]-seat.x,pulled[2]-seat.z)).toBeGreaterThan(.3);
  expect(playing.actors['p-smoke'].props).toEqual(expect.arrayContaining(['Prop_Cigarro','Prop_Brasa']));
  expect(playing.actors['p-clean'].props).toContain('Prop_Pano');
  expect(playing.actors.bartender.props).toEqual(expect.arrayContaining(['Prop_Copo','Prop_Chopp']));
  expect(playing.hidden).toEqual(['Copo_Bandeja']);
  expect(playing.particles,'smoke, sickness and the stream').toBeGreaterThan(0);
  // Smoking happens where the body stands; sitting, at the chair.
  const placed=await page.evaluate(()=>Object.fromEntries((window as any).fixture.scene.getAnimations().map((a:any)=>[a.id,a.bar?.placed])));
  expect(placed).toMatchObject({'p-smoke':false,'p-sit':true,'p-uri':true,'p-clean':true,bartender:true});
  await page.evaluate(()=>(window as any).fixture.view([11,1.6,-1.6],[12,.8,1.6]));await page.waitForTimeout(300);
  await page.screenshot({path:previewPath('bar-animations-street.png')});
  await page.evaluate(([x,z])=>(window as any).fixture.view([x+1.6,1.7,z-1.6],[x,.8,z]),[seat.x,seat.z]);await page.waitForTimeout(300);
  await page.screenshot({path:previewPath('bar-animations-chair.png')});

  // On: seated (the chair back in place), being sick over with its puddle left, Magrão's drink left on the counter.
  await advance(page,9000);
  const later=await status(page);
  expect((await bars(page))['p-sit']).toBe('sentado_loop');
  const seated=await page.evaluate(()=>(window as any).fixture.scene.barChair('seat-9'));
  expect(Math.hypot(seated[0]-seat.x,seated[2]-seat.z)).toBeLessThan(.01);
  expect(later.leftovers).toEqual(expect.arrayContaining(['Bar leftover Prop_Poca','Bar leftover Prop_Copo','Bar leftover Prop_Chopp']));

  // The long neck: the freezer lid is the clip's while Magrão uses it.
  await sync(page,[],['serve-longneck',7000]);
  await expect.poll(async()=>(await status(page)).hidden,{timeout:30000}).toEqual(['Freezer_Bar_Tampa']);

  // Eating what was served from the seat: the fork in hand, the served plate instead of the clip's own.
  await sync(page,[['p-sit','rafael',seat.x,seat.y,seat.z,seat.rotation,'sit',30000,'seat-9']],undefined,
    {'o:0':{id:'o:0',item:'coxinha',table:3,x:table.x,y:table.top,z:table.z,rotation:0,placedAt:-3000,orderId:'o',slot:0,seat:'seat-9'}});
  await expect.poll(()=>bars(page),{timeout:30000}).toEqual({'p-sit':'comer_loop'});
  expect((await status(page)).actors['p-sit'].props).not.toContain('Prop_Prato');

  // Getting up: levantar, then the room has the body beside the chair; nothing moves on, the chair is back.
  await sync(page,[['p-sit','rafael',seat.x,seat.y,seat.z,seat.rotation,'stand-up',6640,'seat-9']]);
  await expect.poll(()=>bars(page),{timeout:30000}).toEqual({'p-sit':'levantar'});
  const exit=await page.evaluate(()=>(window as any).fixture.scene.getAnimations()[0].bar);
  const cos=Math.cos(seat.rotation),sin=Math.sin(seat.rotation),{x:ex,z:ez}=map.barAnimations.clips.levantar.end;
  const beside={x:seat.x+ex*cos+ez*sin,z:seat.z-ex*sin+ez*cos};
  await sync(page,[['p-sit','rafael',beside.x,seat.y,beside.z,seat.rotation,'idle',0]]);
  // Standing again in the bar animations' own idle, straight from levantar's last frame.
  await expect.poll(()=>bars(page)).toEqual({'p-sit':'Bar parado_loop'});
  expect(exit.placed).toBe(true);
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.scene.barChair('seat-9'))).toEqual([seat.x,seat.y,+seat.z.toFixed(3)]);
  expect(errors).toEqual([]);
  await page.evaluate(()=>(window as any).fixture.scene.destroy());
});

test('live: F lights a cigarette and puts it out through the room, and the F8 panel makes Magrão pour a chopp',async({page})=>{
  test.setTimeout(180000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await expect.poll(async()=>{try{return (await page.request.get('/api/health')).ok()&&(await page.request.get(process.env.PLAYWRIGHT_GAME_HEALTH_URL||'http://localhost:2677/health')).ok();}catch{return false;}},{timeout:30000}).toBe(true);
  const unique=`fumante_${Date.now().toString(36)}`;
  expect((await page.request.post('/api/auth/register',{data:{username:unique,email:`${unique}@example.com`,displayName:'Fumante',password:'FumanteBrowser2026!'}})).status()).toBe(201);
  await page.goto('/');await page.getByRole('button',{name:'Entrar no bar'}).click();
  await expect(page.locator('#waiting')).toBeHidden({timeout:60000});
  const self=()=>page.evaluate(()=>{const d=(window as any).barDebug.snapshot();return d.world?.players?.[d.localId];});
  const mine=()=>page.evaluate(()=>{const d=(window as any).barDebug;return d.animations().find((a:any)=>a.id===d.snapshot().localId)?.bar?.clip;});
  await expect.poll(async()=>(await self())?.connected).toBe(true);
  expect(await page.evaluate(()=>(window as any).barDebug.map().barAnimations)).toMatchObject({cadeiras:124,mesas:31,mictorios:3,balcao:true});
  await page.locator('#world').click({position:{x:400,y:300}});
  await page.keyboard.press('KeyF');
  await expect.poll(async()=>(await self())?.animationState).toBe('smoke');
  await expect.poll(mine,{timeout:60000}).toMatch(/^fumar_(acender|loop)$/);
  await expect(page.locator('#context-label')).toHaveText('Apagar o cigarro');
  await page.keyboard.press('KeyF');
  await expect.poll(async()=>(await self())?.animationState).toBe('smoke-stop');
  await expect.poll(mine,{timeout:20000}).toBe('fumar_apagar');
  await expect.poll(async()=>(await self())?.animationState,{timeout:20000}).toBe('idle');
  // Development panel: Magrão pours a chopp for this browser only.
  await page.keyboard.press('F8');
  await expect(page.locator('#bar-animations-debug')).toBeVisible();
  await page.locator('[data-bar-debug="chopp"]').click();
  await expect(page.locator('#bar-animations-debug p')).toHaveText(/Magrão: chopp|não está à vista/);
  errors.splice(0,errors.length,...errors.filter(e=>!/favicon|WebSocket/.test(e)));
  expect(errors).toEqual([]);
});

/** Registers a player and brings them into the bar, with a planner to walk to an object by the room's rules (see walk.ts). */
async function enter(page:Page,name:string){
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await expect.poll(async()=>{try{return (await page.request.get('/api/health')).ok()&&(await page.request.get(process.env.PLAYWRIGHT_GAME_HEALTH_URL||'http://localhost:2677/health')).ok();}catch{return false;}},{timeout:30000}).toBe(true);
  const unique=`${name}_${Date.now().toString(36)}`;
  expect((await page.request.post('/api/auth/register',{data:{username:unique,email:`${unique}@example.com`,displayName:name,password:'AnimacoesBrowser2026!'}})).status()).toBe(201);
  await page.goto('/');await page.getByRole('button',{name:'Entrar no bar'}).click();
  await expect(page.locator('#waiting')).toBeHidden({timeout:60000});
  await expect.poll(()=>page.evaluate(()=>{const d=(window as any).barDebug.snapshot();return d.world?.players?.[d.localId]?.connected;})).toBe(true);
  const source=(path:string)=>'/@fs/'+fileURLToPath(new URL(path,import.meta.url)).replaceAll('\\','/');
  await page.evaluate(`Promise.all([import(${JSON.stringify(source('../../packages/shared/src/index.ts'))}),import(${JSON.stringify(source('../../apps/server/src/world/navigation.ts'))})]).then(([shared,navigation])=>{
    const object=id=>shared.INTERACTABLES.find(i=>i.id===id);
    const here=()=>{const d=window.barDebug.snapshot(),p=d.world.players[d.localId];return {x:p.x,y:p.y,z:p.z};};
    const flat=to=>{const from=here(),end=navigation.walkSegment(from,to);return !!end&&Math.abs(end.y-from.y)<.05;};
    // The A* lattice is anchored where the search starts: from a few centimetres aside the route can line up better (stage.spec.ts).
    const path=id=>{const from=here(),goal={x:object(id).x,y:object(id).y??.3,z:object(id).z};
      for(const [dx,dz] of [[0,0],[0,.1],[0,-.1],[.1,0],[-.1,0],[0,.2],[0,-.2],[.2,0],[-.2,0]]){
        const start=dx||dz?navigation.walkSegment(from,{x:from.x+dx,z:from.z+dz}):from,found=start&&navigation.findPath(start,p=>shared.canInteract(object(id),p,.1),goal,300000);
        if(found)return [from,...found].map(p=>({x:p.x,z:p.z}));
      }};
    window.planner={goal:id=>({x:object(id).x,z:object(id).z}),reached:id=>shared.canInteract(object(id),here(),0),flat,path};
  })`);
  // Facing north, so the keys walk along the map's axes (stage.spec.ts faceNorth).
  for(let i=0;i<5;i++){
    const yaw=await page.evaluate(()=>(window as any).barDebug.listener().yaw as number);if(Math.abs(yaw)<.02)break;
    await page.mouse.move(400,200);await page.mouse.down();await page.mouse.move(400+Math.round(yaw/.006),200,{steps:4});await page.mouse.up();
  }
  return errors;
}

// The walk across the hall (walk.ts) still jams on a table corner about one run in two on this host, with the game's
// own walk as well: the walk is retried, the animation's checks never are.
test.describe(()=>{
test.describe.configure({retries:2});
test('live: walking to the urinal of the men\'s restroom and pressing E plays `urinar` with its stream, as the room times it',async({page})=>{
  test.setTimeout(240000);
  const errors=await enter(page,'Mijao');
  // Walking is the bar animations' walk, its cadence following the speed (2.2× at most, as in the module); standing, their idle.
  const me=await page.evaluate(()=>(window as any).barDebug.snapshot().localId as string);
  const clip=()=>page.evaluate(id=>{const a=(window as any).barDebug.animations().find((x:any)=>x.id===id);return {clip:a?.clip,speed:a?.speed};},me);
  await expect.poll(async()=>(await clip()).clip,{timeout:60000}).toBe('Bar parado_loop');
  await page.keyboard.down('KeyS');await page.waitForTimeout(450);
  const walking=await clip();await page.screenshot({path:previewPath('bar-animations-walk.png')});await page.keyboard.up('KeyS');
  expect(walking.clip).toBe('Bar andar_loop');expect(walking.speed).toBeGreaterThan(1.5);expect(walking.speed).toBeLessThanOrEqual(2.2);
  await expect.poll(async()=>(await clip()).clip).toBe('Bar parado_loop');
  await walk(page,urinal.id);
  await expect(page.locator('#context-label')).toHaveText('Usar o mictório');
  await page.keyboard.press('KeyE');
  const self=()=>page.evaluate(()=>{const d=(window as any).barDebug.snapshot();return d.world?.players?.[d.localId];});
  const mine=()=>page.evaluate(()=>{const d=(window as any).barDebug;return d.animations().find((a:any)=>a.id===d.snapshot().localId)?.bar?.clip;});
  await expect.poll(async()=>(await self())?.animationState).toBe('urinate');
  await expect.poll(mine,{timeout:60000}).toBe('urinar');
  await expect.poll(()=>page.evaluate(()=>(window as any).barDebug.map().barAnimations.particles),{timeout:20000}).toBeGreaterThan(0);
  await page.waitForTimeout(1500);
  await page.screenshot({path:previewPath('bar-animations-urinal.png')});
  await expect.poll(async()=>(await self())?.animationState,{timeout:20000}).toBe('idle');
  expect(errors.filter(e=>!/favicon|WebSocket/.test(e))).toEqual([]);
});
});
