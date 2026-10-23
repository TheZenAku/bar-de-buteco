import {test,expect,type Page} from '@playwright/test';
import {DEFAULT_CHARACTER} from '../../packages/shared/src/character';

async function walkTo(page:Page,x:number,z:number,tolerance=.12):Promise<void>{
  const trail:string[]=[];
  for(let step=0;step<200;step++){
    const p=await page.evaluate(()=>{const s=(window as any).barDebug.snapshot();return s.world.players[s.localId];});
    const dx=x-p.x,dz=z-p.z;if(Math.hypot(dx,dz)<tolerance)return;
    const yaw=await page.evaluate(()=>(window as any).barDebug.listener()?.yaw??.15);
    const h=dx*Math.cos(yaw)-dz*Math.sin(yaw),f=-dx*Math.sin(yaw)-dz*Math.cos(yaw),key=Math.abs(h)>Math.abs(f)?h>0?'d':'a':f>0?'w':'s';
    trail.push(`${p.x.toFixed(2)},${p.z.toFixed(2)} ${key}`);if(trail.length>6)trail.shift();
    // Hold the key for the distance, with short taps near the target.
    await page.keyboard.press(key,{delay:Math.max(15,Math.min(300,Math.max(Math.abs(h),Math.abs(f))/3.5*800))});await expect.poll(()=>page.evaluate(()=>(window as any).barDebug.network().pending),{intervals:[30,60,100]}).toBe(0);
  }throw new Error(`Unable to reach ${x},${z}: ${trail.join(' | ')}`);
}
const me=(page:Page)=>page.evaluate(()=>{const s=(window as any).barDebug.snapshot();return s.world.players[s.localId];});
const leaf=(page:Page,id:string)=>page.evaluate(id=>(window as any).barDebug.map().doorOpenness[id],id);
const door=(page:Page,id:string)=>page.evaluate(id=>(window as any).barDebug.snapshot().world.doors?.[id],id);
// From the pavement into the hall, between the table columns, to the men's room door at the back wall.
const TO_WC=[[14.8,1],[14.8,-2.6],[15.3,-4.4],[12,-4.4],[9,-4.4],[6.7,-4.4],[6.7,-7],[6.7,-9],[6.7,-10.95],[5.45,-10.95],[5.45,-11.25]] as const;

test('doors swing on their own hinges for everyone, block when closed and let people through when open',async({page,browser,request})=>{
  test.setTimeout(420000);
  await expect.poll(async()=>{try{return (await request.get('/api/health')).ok()&&(await request.get('http://localhost:2677/health')).ok();}catch{return false;}}).toBe(true);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const suffix=Date.now().toString(36),password='PortaTeste2026!';
  const account=async(p:Page,name:string)=>{
    expect((await p.request.post('/api/auth/register',{data:{email:`${name}_${suffix}@example.com`,username:`${name}_${suffix}`,displayName:name,password}})).ok()).toBe(true);
    expect((await p.request.post('/api/character',{data:DEFAULT_CHARACTER})).ok()).toBe(true);
    await p.goto('/');await p.getByRole('button',{name:'Entrar no bar'}).click();await expect(p.locator('#waiting')).toBeHidden({timeout:60000});
    await expect.poll(()=>p.evaluate(()=>(window as any).barDebug.map().doors),{timeout:60000}).toBe(16);
  };
  await account(page,'porteiro');
  // Doors start open, as exported from the map.
  expect(await door(page,'Porta_WC_Masc')).toMatchObject({open:true});expect(await leaf(page,'Porta_WC_Masc')).toBe(1);
  for(const [x,z] of TO_WC)await walkTo(page,x,z);
  await expect(page.locator('#context-label')).toHaveText('Fechar a porta · Banheiro masculino');
  const context=await browser.newContext({viewport:{width:640,height:480}}),other=await context.newPage();other.on('pageerror',e=>errors.push(e.message));
  try{
    await account(other,'vizinho');
    // The on-screen action button does what E does, without depending on keyboard focus between two windows.
    await page.bringToFront();await page.locator('#context').click();
    await expect.poll(async()=>(await door(page,'Porta_WC_Masc'))?.open,{timeout:45000}).toBe(false);
    // Both clients swing the leaf about its hinge to the closed heading.
    await expect.poll(()=>leaf(page,'Porta_WC_Masc'),{timeout:45000}).toBe(0);await expect.poll(()=>leaf(other,'Porta_WC_Masc'),{timeout:45000}).toBe(0);
    expect(await leaf(page,'Porta_WC_Fem')).toBe(1);
    await context.close();
    await page.screenshot({path:'docs/previews/door-closed.png'});
    await expect(page.locator('#context-label')).toHaveText('Abrir a porta · Banheiro masculino');
    // Closed: walking into the room stops at the leaf.
    // Forward, towards the back wall (the camera looks to −z): into the closed door.
    await page.keyboard.down('w');await page.waitForTimeout(700);await page.keyboard.up('w');
    await expect.poll(()=>page.evaluate(()=>(window as any).barDebug.network().pending)).toBe(0);
    const stopped=await me(page);expect(stopped.z).toBeGreaterThan(-11.575+.33);expect(stopped.z).toBeLessThan(-11.0);
    // Back in front of the doorway (pushing slides the body along the closed leaf).
    await walkTo(page,5.45,-11.15);
    // Open again: the doorway is free.
    await page.locator('#context').click();await expect.poll(async()=>(await door(page,'Porta_WC_Masc'))?.open,{timeout:45000}).toBe(true);
    await expect.poll(()=>leaf(page,'Porta_WC_Masc'),{timeout:45000}).toBe(1);
    // Off-centre is fine: the body is guided into the open doorway.
    await walkTo(page,5.3,-11.0);await walkTo(page,5.45,-12.1,.25);
    expect((await me(page)).z).toBeLessThan(-12);
    await page.screenshot({path:'docs/previews/door-open.png'});
    expect(errors).toEqual([]);
  }finally{await context.close();}
});
