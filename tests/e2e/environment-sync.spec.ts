import {test,expect,type Page} from '@playwright/test';
import {formatWorldDate,worldCalendarDate} from '@bar/shared/environment';

const status=(page:Page)=>page.evaluate(()=>(window as any).barDebug.environment());
async function enter(page:Page):Promise<void> {
  await page.goto('/');await page.getByRole('button',{name:'Entrar no bar',exact:true}).click();
  await expect(page.locator('#waiting')).toBeHidden({timeout:60000});
  await expect.poll(()=>page.evaluate(()=>!!(window as any).barDebug?.snapshot().world?.serverTime)).toBe(true);
}

test('two players share day, night, weather and dates despite different computer clocks and time zones',async({browser})=>{
  test.setTimeout(180000);
  const a=await browser.newContext({timezoneId:'Asia/Tokyo',extraHTTPHeaders:{'X-Forwarded-For':'127.0.0.21'}}),
    b=await browser.newContext({timezoneId:'Pacific/Honolulu',extraHTTPHeaders:{'X-Forwarded-For':'127.0.0.22'}});
  const contexts=[a,b],pages:Page[]=[],errors:string[]=[];
  try{
    for(const [index,context] of contexts.entries()){
      await context.addInitScript(skew=>{
        const original=Date,state=window as any;state.clockSkew=skew;
        state.Date=new Proxy(original,{
          get:(target,key)=>key==='now'?()=>original.now()+state.clockSkew:Reflect.get(target,key),
          construct:(target,args)=>Reflect.construct(target,args.length?args:[original.now()+state.clockSkew]),
        });
      },index===0?7*86_400_000:-9*3_600_000);
      const page=await context.newPage();pages.push(page);page.on('pageerror',error=>errors.push(error.message));
    }
    const [first,second]=pages as [Page,Page],password='AdminBrowserTests2026!';
    await expect.poll(async()=>(await a.request.get('/api/ready').catch(()=>undefined))?.ok()??false,{timeout:60000}).toBe(true);
    const registered=await a.request.post('/api/auth/register',{data:{username:'primary_admin',displayName:'Admin',email:'rafaelrodrigues-2017@hotmail.com',password}});
    if(registered.status()===409)expect((await a.request.post('/api/auth/login',{data:{email:'rafaelrodrigues-2017@hotmail.com',password}})).ok()).toBe(true);
    else expect(registered.status()).toBe(201);
    expect((await b.request.post('/api/auth/login',{data:{email:'jogador2@bar.local',password:process.env.DEMO_PASSWORD||'ButecoDemo2026!'}})).ok()).toBe(true);
    await enter(first);
    await first.evaluate(()=>(window as any).barDebug.send('admin.environment',{hour:12,paused:true,dayMinutes:40,weather:'clear'}));
    await expect.poll(async()=>(await status(first)).hour).toBe(12);
    // Arrival at a different time still uses the existing room's clock.
    await enter(second);
    for(const page of pages){
      await expect.poll(async()=>(await status(page)).hour).toBe(12);
      await page.keyboard.press('k');await expect(page.locator('#phone .ph-time')).toHaveText('12:00');
      await expect(page.locator('#phone [data-widget="clock"] span')).toContainText(formatWorldDate(Date.now(),{weekday:'short',day:'numeric',month:'short'}));
      await page.locator('#phone .ph-icon[data-app="calendario"]').click();
      await expect(page.locator('#phone .cal-grid .today')).toHaveText(String(worldCalendarDate(Date.now()).getUTCDate()));
      await page.keyboard.press('Escape');
    }
    expect((await status(first)).date).toBe((await status(second)).date);
    expect(Math.abs((await status(first)).serverTime-(await status(second)).serverTime)).toBeLessThan(500);
    // Changing a computer's date while already connected cannot move the sun or calendar.
    await first.evaluate(()=>{(window as any).clockSkew-=90*86_400_000;});
    await second.evaluate(()=>{(window as any).clockSkew+=365*86_400_000;});
    for(const page of pages)await expect.poll(async()=>(await status(page)).hour).toBe(12);
    await first.evaluate(()=>(window as any).barDebug.send('admin.environment',{hour:0,weather:'storm'}));
    for(const page of pages){
      await expect.poll(async()=>(await status(page)).hour).toBe(0);
      await expect.poll(async()=>(await status(page)).sun.intensity).toBeLessThan(.001);
      await expect.poll(async()=>(await status(page)).weather.rain,{timeout:25000}).toBe(1);
    }
    // Reload/reconnect does not start a personal clock or change the room's climate.
    await enter(second);
    await expect.poll(async()=>(await status(second)).hour).toBe(0);
    await expect.poll(async()=>(await status(second)).weather.rain).toBe(1);
    await second.getByRole('button',{name:'Pessoas no bar',exact:true}).click();
    await second.getByRole('tab',{name:'Seu lugar no bar'}).click();await second.locator('#modal [data-action="leave"]').click();
    await expect(second.locator('#lobby')).toBeVisible();
    expect((await status(second)).hour).toBe(0);expect((await status(second)).weather.kind).toBe('storm');
    await first.evaluate(()=>(window as any).barDebug.send('admin.environment',{reset:true}));
    await expect.poll(()=>first.evaluate(()=>(window as any).barDebug.snapshot().world.environment)).toMatchObject({dayDurationMs:2400000,paused:false,weather:'auto'});
    expect(errors).toEqual([]);
  }finally{
    await pages[0]?.evaluate(()=>(window as any).barDebug?.send('admin.environment',{reset:true})).catch(()=>{});
    await Promise.all(contexts.map(context=>context.close()));
  }
});
