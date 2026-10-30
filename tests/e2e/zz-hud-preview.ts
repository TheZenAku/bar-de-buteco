// Temporary scratch script (not a spec): walk to the house shop's blip and open it. Deleted after use.
import {chromium,expect} from '@playwright/test';
import {fileURLToPath} from 'node:url';
import {walk} from './walk';

const out=process.argv[2]!;
const source=(path:string)=>'/@fs/'+fileURLToPath(new URL(path,import.meta.url)).replaceAll('\\','/');
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=d3d11','--enable-gpu']});
const context=await browser.newContext({baseURL:'http://localhost:5273',viewport:{width:1440,height:900},extraHTTPHeaders:{'X-Forwarded-For':'127.0.0.19'}});
const page=await context.newPage();
const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
const unique=`hud_${Date.now().toString(36)}`;
expect((await page.request.post('/api/auth/register',{data:{username:unique,email:`${unique}@example.com`,displayName:'Rafa',password:'HudPreview2026!'}})).status()).toBe(201);
await page.goto('/');await page.getByRole('button',{name:'Entrar no bar'}).click();
await expect(page.locator('#waiting')).toBeHidden({timeout:90000});
await expect.poll(()=>page.evaluate(()=>{const d=(window as any).barDebug.snapshot();return d.world?.players?.[d.localId]?.connected;}),{timeout:30000}).toBe(true);
await page.waitForTimeout(2000);
await page.evaluate(`Promise.all([import(${JSON.stringify(source('../../packages/shared/src/index.ts'))}),import(${JSON.stringify(source('../../apps/server/src/world/navigation.ts'))})]).then(([shared,navigation])=>{
  const rings={'ring-shop':shared.SHOP_SPOT,'near-shop':{...shared.SHOP_SPOT,z:shared.SHOP_SPOT.z+2.2}};
  const here=()=>{const d=window.barDebug.snapshot(),p=d.world.players[d.localId];return {x:p.x,y:p.y,z:p.z};};
  const reaches=(id,p,slack)=>Math.hypot(p.x-rings[id].x,p.z-rings[id].z)<(id==='ring-shop'?.25:.5)+slack;
  const flat=to=>{const from=here(),end=navigation.walkSegment(from,to);return !!end&&Math.abs(end.y-from.y)<.05;};
  const path=id=>{const from=here(),goal=rings[id];
    for(const [dx,dz] of [[0,0],[0,.1],[0,-.1],[.1,0],[-.1,0]]){
      const begin=dx||dz?navigation.walkSegment(from,{x:from.x+dx,z:from.z+dz}):from,found=begin&&navigation.findPath(begin,p=>reaches(id,p,.1),goal,300000);
      if(found)return [from,...found].map(p=>({x:p.x,z:p.z}));
    }};
  window.planner={goal:id=>({x:rings[id].x,z:rings[id].z}),reached:id=>reaches(id,here(),0),flat,path};
})`);
for(let i=0;i<5;i++){
  const yaw=await page.evaluate(()=>(window as any).barDebug.listener().yaw as number);if(Math.abs(yaw)<.02)break;
  await page.mouse.move(700,300);await page.mouse.down();await page.mouse.move(700+Math.round(yaw/.006),300,{steps:4});await page.mouse.up();
}
await walk(page,'near-shop');await page.waitForTimeout(800);
console.log('near: shop blip visible',!(await page.locator('#shop-blip').evaluate(c=>(c as HTMLCanvasElement).hidden)),JSON.stringify(await page.evaluate(()=>(window as any).barDebug.map().stageBlips?.shop)));
await page.screenshot({path:`${out}/v9-near.png`});
await walk(page,'ring-shop');await page.waitForTimeout(800);
console.log('on ring: label',!(await page.locator('#shop-blip').evaluate(c=>(c as HTMLCanvasElement).hidden)),'prompt:',await page.locator('#context-label').innerText());
await page.screenshot({path:`${out}/v9-on.png`});
await page.keyboard.press('KeyE');await expect(page.locator('#modal-title')).toHaveText('Loja da casa',{timeout:10000});await page.waitForTimeout(800);
await page.screenshot({path:`${out}/v9-shop.png`});
await page.locator('.shop-item').filter({hasText:'Coxinha'}).getByRole('button',{name:'Comprar'}).click();await page.waitForTimeout(1500);
console.log('after buy:',(await page.locator('#modal-content .modal-description').innerText()).replace(/\s+/g,' '));
console.log('errors',JSON.stringify(errors));
await page.request.post('/api/auth/logout',{data:{}});
await browser.close();
