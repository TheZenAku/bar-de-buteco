import {test,expect,type Browser,type Page} from '@playwright/test';
import {fileURLToPath} from 'node:url';
import {walk} from './walk';

const password='PalcoBrowser2026!';
test.beforeEach(async({request})=>{
  await expect.poll(async()=>{try{return (await request.get('/api/health')).ok()&&(await request.get(process.env.PLAYWRIGHT_GAME_HEALTH_URL||'http://localhost:2677/health')).ok();}catch{return false;}},{timeout:30000}).toBe(true);
});
const source=(path:string)=>'/@fs/'+fileURLToPath(new URL(path,import.meta.url)).replaceAll('\\','/');
/** A player in a browser of their own: registered, in the bar, with the room's rules to walk to an object (the stage's steps, a musician's spot). */
async function player(browser:Browser,baseURL:string|undefined,name:string){
  // Contexts made here do not take the project's options: the address, the size and a client address of its own.
  const context=await browser.newContext({baseURL,viewport:{width:800,height:520},extraHTTPHeaders:{'X-Forwarded-For':'127.0.0.4'}});
  // Two worlds drawn at once starve the 50 ms input loop: both browsers on the Baixo graphics preset.
  await context.addInitScript(()=>localStorage.setItem('bar:settings:v1',JSON.stringify({graphics:{preset:'low',renderScale:.6,dynamicResolution:true,shadows:'off',fog:'dense',fpsCap:30,pixelRatioCap:1}})));
  const page=await context.newPage();
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  const unique=`${name}_${Date.now().toString(36)}`;
  expect((await page.request.post('/api/auth/register',{data:{username:unique,email:`${unique}@example.com`,displayName:name,password}})).status()).toBe(201);
  await page.goto('/');await page.getByRole('button',{name:'Entrar no bar'}).click();
  await expect(page.locator('#waiting')).toBeHidden({timeout:60000});
  await expect.poll(()=>page.evaluate(()=>{const d=(window as any).barDebug.snapshot();return d.world?.players?.[d.localId]?.connected;})).toBe(true);
  await page.evaluate(`Promise.all([import(${JSON.stringify(source('../../packages/shared/src/index.ts'))}),import(${JSON.stringify(source('../../apps/server/src/world/navigation.ts'))})]).then(([shared,navigation])=>{
    const object=id=>shared.INTERACTABLES.find(i=>i.id===id);
    const reaches=(id,p,slack)=>shared.canInteract(object(id),p,slack)&&(object(id).type!=='musician'||shared.onStage(p));
    const here=()=>{const d=window.barDebug.snapshot(),p=d.world.players[d.localId];return {x:p.x,y:p.y,z:p.z};};
    // A straight walk from here that never changes floor (see walk.ts).
    const flat=to=>{const from=here(),end=navigation.walkSegment(from,to);return !!end&&Math.abs(end.y-from.y)<.05;};
    // The A* lattice (0.35 m) is anchored where the search starts, and the top of the stage's steps leaves a gap of
    // about 10 cm between the handrail, the left PA and the sound desk: from a few centimetres aside it lines up.
    const path=id=>{const from=here(),goal={x:object(id).x,y:object(id).y??.3,z:object(id).z};
      for(const [dx,dz] of [[0,0],[0,.1],[0,-.1],[.1,0],[-.1,0],[0,.2],[0,-.2],[.2,0],[-.2,0]]){
        const start=dx||dz?navigation.walkSegment(from,{x:from.x+dx,z:from.z+dz}):from,found=start&&navigation.findPath(start,p=>reaches(id,p,.1),goal,300000);
        if(found)return [from,...found].map(p=>({x:p.x,z:p.z}));
      }};
    window.planner={goal:id=>({x:object(id).x,z:object(id).z}),reached:id=>reaches(id,here(),0),flat,path};
  })`);
  await faceNorth(page);
  const debug=<T>(expression:string)=>page.evaluate(expression) as Promise<T>;
  return {page,errors,context,
    id:()=>debug<string>('window.barDebug.snapshot().localId'),
    musicians:()=>debug<Record<string,{playerId:string;phase:string}>>('window.barDebug.snapshot().world.musicians'),
    clipOf:(id:string)=>page.evaluate(id=>(window as any).barDebug.animations().find((a:any)=>a.id===id)?.clip as string|undefined,id),
    guitar:()=>debug<{instrument:boolean;props:boolean|null}>('window.barDebug.map().musicians.violao'),
    /** To the foot of the steps, E, the pass bought there (the e2e wallets start with plenty of coins), and up. */
    async climb(){
      await walk(page,'stage');await page.keyboard.press('KeyE');
      await expect(page.locator('#modal-title')).toHaveText('PALCO');await page.locator('[data-action="stage-buy"]').click();
      await expect.poll(()=>debug<number>('window.barDebug.snapshot().world.players[window.barDebug.snapshot().localId].stageUntil')).toBeGreaterThan(0);
      await upTheSteps(page);
    },
  };
}

/**
 * Turns the camera to look due north (yaw 0), so W, A, S and D walk along the world's axes, like the bar's walls and
 * doorways: at the default angle, holding W drifts 15 cm a metre sideways, into the jamb of the back door.
 */
async function faceNorth(page:Page){
  for(let i=0;i<5;i++){
    const yaw=await page.evaluate(()=>(window as any).barDebug.listener().yaw as number);if(Math.abs(yaw)<.02)return;
    await page.mouse.move(400,200);await page.mouse.down();await page.mouse.move(400+Math.round(yaw/.006),200,{steps:4});await page.mouse.up();
  }
}

/**
 * From the foot of the steps up onto the deck. At the top, the end of the handrail and the left PA leave the body
 * 18 cm of play (z -23.02 to -22.84), about one 50 ms input step of a normal walk: facing north, D walks due east, so
 * the cane's slow gait (/velho, 2.4 cm a step) lines the body up and D takes it straight up.
 */
async function upTheSteps(page:Page){
  const here=()=>page.evaluate(()=>{const d=(window as any).barDebug.snapshot(),p=d.world.players[d.localId];return {x:p.x as number,y:p.y as number,z:p.z as number,old:!!p.oldWalk};});
  const cane=async(on:boolean)=>{
    await page.keyboard.press('Enter');await page.locator('#chat-input').fill('/velho');await page.locator('#chat-input').press('Enter');
    await expect.poll(async()=>(await here()).old).toBe(on);
  };
  await faceNorth(page);await cane(true);
  // Back onto the open floor in front of the steps (they and their handrails start at x 20.9), where nothing is in the way.
  const tap=async(key:string)=>{await page.keyboard.down(key);await page.waitForTimeout(60);await page.keyboard.up(key);await page.waitForTimeout(250);};
  for(let i=0;i<40&&(await here()).x>20.55;i++)await tap('KeyA');
  for(let i=0;i<40;i++){
    const {z}=await here();if(Math.abs(z+22.93)<.03)break;
    await tap(z>-22.93?'KeyW':'KeyS');
  }
  await page.keyboard.down('KeyD');
  await expect.poll(async()=>{const p=await here();return p.x>22.2&&Math.abs(p.y-.9)<.02;},{timeout:20000}).toBe(true);
  await page.keyboard.up('KeyD');
  await cane(false);
}

test('on the stage: one player takes the guitar and plays, another arriving later sees the show and cannot take it, and it goes back on its stand',async({browser,baseURL})=>{
  test.setTimeout(480000);
  const musician=await player(browser,baseURL,'Violeiro'),fan=await player(browser,baseURL,'Plateia');
  try{
    // Up the stage with a pass, near the guitar: E offers it, and takes it.
    await musician.climb();
    await walk(musician.page,'palco-violao');
    await expect(musician.page.locator('#context-label')).toHaveText('Tocar violão');
    await musician.page.keyboard.press('KeyE');
    const me=await musician.id();
    await expect.poll(async()=>(await musician.musicians()).violao?.playerId).toBe(me);
    await expect(musician.page.locator('#context-label')).toHaveText('Parar de tocar');
    await expect.poll(()=>musician.clipOf(me),{timeout:30000}).toMatch(/^Palco violao (entrando|comecando|loop)$/);
    await expect.poll(musician.guitar).toMatchObject({instrument:false,props:true});
    // Playing locks movement: holding W goes nowhere.
    const at=await musician.page.evaluate(()=>{const d=(window as any).barDebug.snapshot(),p=d.world.players[d.localId];return [p.x,p.z];});
    await musician.page.keyboard.down('KeyW');await musician.page.waitForTimeout(1200);await musician.page.keyboard.up('KeyW');
    expect(await musician.page.evaluate(()=>{const d=(window as any).barDebug.snapshot(),p=d.world.players[d.localId];return [p.x,p.z];})).toEqual(at);
    // Someone arriving later walks to the stage and finds the show going on: the guitarist in the loop, guitar in hand.
    await fan.climb();
    await expect.poll(()=>fan.clipOf(me),{timeout:60000}).toBe('Palco violao loop');
    await expect.poll(fan.guitar).toMatchObject({instrument:false,props:true});
    // Up there, the guitar in use is not offered, and E does not take it.
    await walk(fan.page,'palco-violao');
    await expect(fan.page.locator('#context-label')).not.toHaveText('Tocar violão');
    await fan.page.keyboard.press('KeyE');await fan.page.waitForTimeout(1500);
    expect((await fan.musicians()).violao?.playerId).toBe(me);
    // E again: the guitar is put back (the stop clip), then the player is free and the guitar on its stand, for everyone.
    await musician.page.keyboard.press('KeyE');
    await expect.poll(async()=>(await musician.musicians()).violao?.phase).toBe('saindo');
    await expect(musician.page.locator('#context-label')).toHaveText('Guardando o instrumento…');
    await expect.poll(async()=>(await fan.musicians()).violao?.playerId,{timeout:15000}).toBe('');
    for(const someone of [musician,fan])await expect.poll(someone.guitar).toMatchObject({instrument:true,props:false});
    await expect.poll(()=>musician.clipOf(me)).toBe('Idle');
    // Free again: the fan, still next to it, is offered the guitar now.
    await expect(fan.page.locator('#context-label')).toHaveText('Tocar violão');
    expect(musician.errors).toEqual([]);expect(fan.errors).toEqual([]);
  }finally{await musician.context.close();await fan.context.close();}
});
