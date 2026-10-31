import {test,expect,type Page} from '@playwright/test';
import {fileURLToPath} from 'node:url';
const tvFixture='/@fs/'+fileURLToPath(new URL('../fixtures/tv-controller.html',import.meta.url)).replaceAll('\\','/');
const PIXELS=[{x:620,y:60},{x:900,y:60},{x:900,y:220},{x:620,y:220}];
/** The TV panel with a canvas over the whole page and the player small on its screen, as in the game. */
export async function open(page:Page):Promise<void>{
  // Forwarded identity is for our API only: it adds CORS preflights to the platforms' own requests.
  await page.context().setExtraHTTPHeaders({});
  await page.goto(tvFixture);await expect.poll(()=>page.evaluate(()=>!!(window as any).fixture)).toBe(true);
  await page.addStyleTag({content:'#world{position:fixed;inset:0;width:100%;height:100%;opacity:0}'});
  await page.evaluate(points=>{for(const screen of ['tv-hall','tv-left','tv-counter'])(window as any).fixture.project(screen,points);},PIXELS);
}
export const telemetry=(page:Page)=>page.evaluate(()=>(window as any).fixture.controller.telemetry());
export const shared=(page:Page)=>page.evaluate(()=>(window as any).fixture.world.televisions['tv-main']);
export const heard=async(page:Page)=>(await telemetry(page)).find((p:any)=>p.audible);
export async function paste(page:Page,url:string):Promise<void>{
  await page.locator('#tv-url').fill(url);await page.locator('#tv-form button').click();
}

/** The full round on a platform's real player, pasted in the panel. */
export interface RealPlatform {name:string;provider:string;url:string;seek:boolean;stream?:boolean}
export const realPlatform=(platform:RealPlatform)=>async({page}:{page:Page})=>{
  test.setTimeout(150000);
  await open(page);
  await paste(page,platform.url);
  await expect.poll(async()=>(await shared(page)).provider,{timeout:30000}).toBe(platform.provider);
  await expect.poll(async()=>{
    const p=await heard(page);
    if(p?.status==='blocked')await page.locator('[data-media-local=activate]').click();
    return p?.status==='error'?`error: ${p.error}`:p?.status;
  },{timeout:60000}).toBe('playing');
  const first=(await heard(page)).currentTime;
  await expect.poll(async()=>(await heard(page)).currentTime,{timeout:20000}).toBeGreaterThan(first+1);
  if(platform.stream)await expect.poll(async()=>(await shared(page)).live,{timeout:15000}).toBe(true);
  // Seen from behind, a screen draws nothing and its player is hidden: it keeps playing, and is heard.
  await page.evaluate(()=>{const {fixture}=window as any;for(const screen of ['tv-hall','tv-left','tv-counter'])fixture.project(screen,null);});
  await expect.poll(()=>page.locator('.tv-player').first().evaluate(frame=>getComputedStyle(frame).visibility)).toBe('hidden');
  const hidden=(await heard(page)).currentTime;
  await expect.poll(async()=>(await heard(page)).currentTime,{timeout:20000}).toBeGreaterThan(hidden+1);
  await page.evaluate(points=>{const {fixture}=window as any;for(const screen of ['tv-hall','tv-left','tv-counter'])fixture.project(screen,points);},PIXELS);
  if(platform.seek){
    await page.locator('[data-media-step="1"]').click();
    await expect.poll(async()=>(await heard(page)).currentTime,{timeout:20000}).toBeGreaterThan(first+8);
  }
  await page.locator('[data-media=pause]').click();
  await expect.poll(async()=>(await heard(page)).status,{timeout:20000}).toBe('paused');
  await page.locator('[data-media=resume]').click();
  await expect.poll(async()=>(await heard(page)).status,{timeout:20000}).toBe('playing');
  await page.locator('[data-media=skip]').click();
  await expect.poll(async()=>(await telemetry(page)).length,{timeout:15000}).toBe(0);
  await page.evaluate(()=>(window as any).fixture.teardown());
};
