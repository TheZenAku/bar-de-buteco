import {expect,type Page} from '@playwright/test';

const ADMIN_PASSWORD='AdminBrowserTests2026!';
/** Into the bar on the main account (the one admin.spec uses): the bikes only come from the administration. */
export async function enterAsAdmin(page:Page):Promise<void>{
  await expect.poll(async()=>(await page.request.get('/api/ready').catch(()=>undefined))?.ok()??false,{timeout:90_000,intervals:[500]}).toBe(true);
  const email='rafaelrodrigues-2017@hotmail.com';
  // Logging in first: only a new database spends one of the registrations an address may make.
  if(!(await page.request.post('/api/auth/login',{data:{email,password:ADMIN_PASSWORD}})).ok())
    expect((await page.request.post('/api/auth/register',{data:{username:'primary_admin',email,displayName:'primary_admin',password:ADMIN_PASSWORD}})).status()).toBe(201);
  await page.goto('/');
  await page.getByRole('button',{name:'Entrar no bar'}).click();
  await expect(page.locator('#game')).toBeVisible();
  await expect(page.locator('#waiting')).toBeHidden({timeout:60_000});
  await expect.poll(()=>page.evaluate(()=>{const state=(window as any).barDebug.snapshot();return state.world?.players?.[state.localId]?.connected===true;}),{timeout:30_000}).toBe(true);
}
export const selfOf=(page:Page)=>page.evaluate(()=>{const d=(window as any).barDebug.snapshot();return d.world.players[d.localId];});
/**
 * Short presses towards a point, keys relative to the camera, looking again after each: a slow page does not overshoot.
 * Stopped by something (a bin, a tree), a step to the side first.
 */
export async function walkTo(page:Page,x:number,z:number,tolerance=.25):Promise<void>{
  const press=async(keys:string[],ms:number)=>{for(const key of keys)await page.keyboard.down(key);await page.waitForTimeout(ms);for(const key of keys)await page.keyboard.up(key);};
  const deadline=Date.now()+45_000;
  let last={x:Infinity,z:Infinity},side=1;
  while(Date.now()<deadline){
    const at=await selfOf(page),yaw=await page.evaluate(()=>(window as any).barDebug.camera().yaw),dx=x-at.x,dz=z-at.z,length=Math.hypot(dx,dz);
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
/**
 * Where this page last drew a body before it got up. Watched frame by frame: a body at rest starts getting up on the room's very next tick, too short a moment
 * for anything polling from outside.
 */
export const lastOfBody=(page:Page,id:string)=>page.evaluate(id=>new Promise<number[]|undefined>(done=>{
  const deadline=performance.now()+25_000;
  let last:number[]|undefined;
  const look=()=>{
    const body=(window as any).barDebug.ragdolls().find((each:any)=>each.id===id);
    if(body)last=body.pelvis;
    if((last&&!body)||performance.now()>deadline){done(last);return;}
    requestAnimationFrame(look);
  };
  look();
}),id);
/** Orbits the free camera by dragging over the canvas. */
export async function orbit(page:Page,dx:number,dy=0):Promise<void>{
  const box=(await page.locator('canvas').first().boundingBox())!,x=box.x+box.width/2,y=box.y+box.height/3;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:8});await page.mouse.up();
}
/** Opens Veículos in the administration, does `act` and closes the window. */
export async function inVehicles(page:Page,act:()=>Promise<void>):Promise<void>{
  await page.getByRole('button',{name:'Administração',exact:true}).click();
  await page.locator('[data-admin-nav="vehicles"]').click();
  await act();
  await page.getByRole('button',{name:'Fechar janela'}).click();
}
/**
 * A bike on the kerb in front of the bar, nose to −X along the street: the admin stands on the street facing that way (the camera
 * turned first, so A is exactly −X) and spawns it just ahead, by the real button.
 */
export async function spawnBikeOnStreet(page:Page):Promise<void>{
  // The room lives as long as the stack: what an earlier spec left goes first.
  await inVehicles(page,async()=>{
    const despawn=page.locator('[data-vehicle="despawn"]');
    await expect(page.locator('[data-vehicle="spawn"]')).toBeVisible();
    for(let left=await despawn.count();left>0;left--){await despawn.first().click();await expect(despawn).toHaveCount(left-1);}
  });
  // A drag can land on a label or be cut by a slow frame: look again until the view really is square to the street.
  const heading=(yaw:number)=>Math.atan2(Math.sin(yaw),Math.cos(yaw));
  const squareView=async()=>{
    const yaw=heading(await page.evaluate(()=>(window as any).barDebug.camera().yaw));
    if(Math.abs(yaw)>.02){await orbit(page,Math.round(yaw/.006));await page.waitForTimeout(500);}
    return Math.abs(yaw);
  };
  await expect.poll(async()=>{
    await expect.poll(squareView,{timeout:15_000}).toBeLessThan(.02);
    await walkTo(page,15.8,3.85); // the silver car starts at x 16.5
    await page.keyboard.down('a');await page.waitForTimeout(220);await page.keyboard.up('a');
    await page.waitForTimeout(400);
    return Math.abs(heading((await selfOf(page)).rotation+Math.PI/2));
  },{timeout:60_000}).toBeLessThan(.03);
  await inVehicles(page,async()=>{
    await page.locator('[data-vehicle="spawn"]').click();
    await expect(page.locator('.admin-feedback')).toContainText('Moto spawnada');
  });
  await expect.poll(()=>page.evaluate(()=>(window as any).barDebug.motos()?.length??0),{timeout:30_000}).toBeGreaterThan(0);
}
