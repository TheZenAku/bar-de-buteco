import fs from 'node:fs';
import {test,expect,type Page} from '@playwright/test';
import {enterAsAdmin,lastOfBody,walkTo} from './moto-helpers';

const SHOTS=process.env.KICK_SHOTS||'test-results/kick';
const errorsOf=(page:Page)=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&!/Failed to load resource|favicon/.test(message.text()))errors.push(message.text());});
  return errors;
};
// The world arrives a moment after the page shows.
const self=(page:Page)=>page.evaluate(()=>{const d=(window as any).barDebug.snapshot();return d.world?.players?.[d.localId];});
const blows=(page:Page)=>page.evaluate(()=>(window as any).barDebug.blows());
const worldOf=(page:Page)=>page.evaluate(()=>(window as any).barDebug.snapshot().world);
/** The frames being drawn, right now: screenshots take seconds here, and by then a flying body has landed. */
async function film(page:Page,name:string,count:number,gapMs:number):Promise<void> {
  fs.mkdirSync(SHOTS,{recursive:true});
  // Encoded only at the end: that is what takes the time.
  const frames:string[]=await page.evaluate(async({count,gapMs})=>{
    const world=document.querySelector('#world') as HTMLCanvasElement,taken:HTMLCanvasElement[]=[];
    for(let i=0;i<count;i++){
      await new Promise<void>(done=>requestAnimationFrame(()=>{
        const canvas=document.createElement('canvas');canvas.width=960;canvas.height=540;
        canvas.getContext('2d')!.drawImage(world,0,0,960,540);taken.push(canvas);done();
      }));
      await new Promise(done=>setTimeout(done,gapMs));
    }
    return taken.map(canvas=>canvas.toDataURL('image/jpeg',.8));
  },{count,gapMs});
  frames.forEach((frame,i)=>fs.writeFileSync(`${SHOTS}/${name}-${String(i).padStart(2,'0')}.jpg`,Buffer.from(frame.split(',')[1]!,'base64')));
}
/** In the middle of the street, the two a little apart along it: the body flies along it with nothing in the way, side on to the camera. */
const KICKER={x:0,z:6},TARGET={x:1.15,z:6};
async function facingOff(kicker:Page,victim:Page,gap=TARGET.x-KICKER.x):Promise<void> {
  await walkTo(victim,KICKER.x+gap,KICKER.z,.15);
  await walkTo(kicker,KICKER.x,KICKER.z,.2);
  // A touch of the key towards the other, since the walk may have ended on a step back: the aim only corrects what is about in front.
  await kicker.keyboard.down('d');await kicker.waitForTimeout(70);await kicker.keyboard.up('d');
  await expect.poll(async()=>Math.abs(Math.sin((await self(kicker)).rotation)),{timeout:5000}).toBeGreaterThan(.7);
  await kicker.waitForTimeout(300);
}

test('Rafael\'s kicks, with real keys: the one touched flies far with sound, star and shake, loses some life and gets up; thrown at the air, nobody is hurt',async({browser})=>{
  test.setTimeout(300_000);
  const kickerContext=await browser.newContext({viewport:{width:1280,height:720}}),kicker=await kickerContext.newPage(),kickerErrors=errorsOf(kicker);
  const victimContext=await browser.newContext({viewport:{width:1280,height:720}}),victim=await victimContext.newPage(),victimErrors=errorsOf(victim);
  await enterAsAdmin(kicker);
  for(const [url,data] of [['/api/wardrobe/buy',{skin:'rafael'}],['/api/wardrobe/equip',{skin:'rafael'}],['/api/wardrobe/skill',{skill:'karate'}],['/api/profile/skill',{skill:'karate',key:'KeyX'}]] as const)await kicker.request.post(url,{data});
  await kicker.reload();
  await kicker.getByRole('button',{name:'Entrar no bar'}).click();
  await expect(kicker.locator('#waiting')).toBeHidden({timeout:60_000});
  await expect.poll(()=>self(kicker).then(me=>me?.skin),{timeout:30_000}).toBe('rafael');
  await victim.goto('/');
  await victim.getByLabel('E-mail',{exact:true}).fill('jogador2@bar.local');
  await victim.getByLabel('Senha',{exact:true}).fill(process.env.DEMO_PASSWORD||'ButecoDemo2026!');
  await victim.getByRole('button',{name:'Entrar no bar'}).click();
  await expect(victim.locator('#waiting')).toBeHidden({timeout:60_000});
  await expect(kicker.locator('#skill-button kbd')).toHaveText('X');
  await expect.poll(async()=>!!await self(victim),{timeout:30_000}).toBe(true);

  // Thrown at the air: the leg is heard, and that is all.
  await facingOff(kicker,victim,5);
  const untouched=(await self(victim)).hp;
  await kicker.keyboard.press('x');
  await expect.poll(async()=>(await self(kicker)).animationState,{timeout:5000}).toBe('kick');
  await expect.poll(async()=>(await blows(kicker)).played.some((clip:string)=>clip.startsWith('ar-')),{timeout:5000}).toBe(true);
  await expect.poll(async()=>(await self(kicker)).animationState,{timeout:6000}).toBe('idle');
  expect((await self(victim)).animationState).not.toBe('ragdoll');
  expect((await self(victim)).hp).toBe(untouched);
  expect((await blows(kicker)).played.some((clip:string)=>clip.startsWith('chute')),'Nothing to land on').toBe(false);

  // The karate kick, seen by both.
  await facingOff(kicker,victim);
  const hp=(await self(victim)).hp,start=await self(victim);
  const bodies=[lastOfBody(kicker,start.id),lastOfBody(victim,start.id)];
  const filming=film(kicker,'karate',22,50);
  await kicker.keyboard.press('x');
  await expect.poll(async()=>(await self(victim)).animationState,{timeout:5000}).toBe('ragdoll');
  await filming;
  const world=await worldOf(kicker),me=await self(kicker);
  expect(world.ragdolls[start.id].by,'Who did it travels with the body').toBe(me.id);
  await expect(victim.locator('.comanda',{hasText:'-6 de vida'})).toContainText('Chutado',{timeout:5000});
  expect((await self(victim)).hp).toBe(hp-6);
  // Both hear it and both see the same body.
  for(const page of [kicker,victim])await expect.poll(async()=>(await blows(page)).played.some((clip:string)=>clip.startsWith('chute-')),{timeout:5000}).toBe(true);
  for(const page of [kicker,victim])await expect.poll(async()=>(await blows(page)).played.some((clip:string)=>clip.startsWith('queda-')),{timeout:8000}).toBe(true);
  await expect.poll(async()=>(await self(victim)).animationState,{timeout:12_000}).toBe('recover');
  fs.mkdirSync(SHOTS,{recursive:true});
  await kicker.screenshot({path:`${SHOTS}/karate-lying.png`});
  // Getting up, and nothing left behind.
  await expect.poll(async()=>(await self(victim)).animationState,{timeout:12_000}).toBe('idle');
  const [watched,felt]=await Promise.all(bodies);
  expect(watched&&felt,'Both drew the body').toBeTruthy();
  expect(Math.hypot(watched![0]!-felt![0]!,watched![2]!-felt![2]!),'The same body on both machines').toBeLessThan(.2);
  const flew=Math.hypot(felt![0]!-start.x,felt![2]!-start.z);
  expect(flew,`It flew ${flew.toFixed(1)} m`).toBeGreaterThan(5);
  expect((await worldOf(victim)).ragdolls[start.id]).toBeUndefined();
  await expect.poll(async()=>(await self(kicker)).animationState,{timeout:6000}).toBe('idle');

  // The flying kick, with both feet: more life, further, and with the weight in the sound.
  await kicker.request.post('/api/wardrobe/skill',{data:{skill:'air-kick'}});
  await kicker.request.post('/api/profile/skill',{data:{skill:'air-kick',key:'KeyX'}});
  await kicker.reload();
  await kicker.getByRole('button',{name:'Entrar no bar'}).click();
  await expect(kicker.locator('#waiting')).toBeHidden({timeout:60_000});
  await expect(kicker.locator('#skill-button .tip')).toContainText('Chute voador');
  await expect.poll(async()=>!!await self(kicker),{timeout:30_000}).toBe(true);
  await victim.waitForTimeout(3000);
  await facingOff(kicker,victim);
  const again=(await self(victim)).hp,before=await self(victim);
  // A key press also unlocks the sound after the reload; let its clips arrive.
  await kicker.keyboard.press('g');await kicker.waitForTimeout(1500);
  await expect.poll(async()=>(await blows(kicker)).ready,{timeout:15_000}).toBeGreaterThan(12);
  const air=film(kicker,'air',32,50);
  await kicker.keyboard.press('x');
  await expect.poll(async()=>(await self(victim)).animationState,{timeout:6000}).toBe('ragdoll');
  await air;
  await expect.poll(async()=>(await self(victim)).hp,{timeout:5000}).toBe(again-10);
  await expect.poll(async()=>(await blows(kicker)).played,{timeout:5000}).toContain('chute-peso');
  expect((await blows(kicker)).played).toContain('ar-longo');
  // The film takes its time: by now the body may have come to rest and be getting up, where it lies.
  await expect.poll(async()=>(await self(victim)).animationState,{timeout:12_000}).not.toBe('ragdoll');
  const lying=await self(victim),further=Math.hypot(lying.x-before.x,lying.z-before.z);
  expect(further,`It flew ${further.toFixed(1)} m`).toBeGreaterThan(6);

  expect(kickerErrors,'The kicker\'s page').toEqual([]);
  expect(victimErrors,'The victim\'s page').toEqual([]);
});
