import {test,expect} from '@playwright/test';
import {fileURLToPath} from 'node:url';

/**
 * VR (docs/sistemas/vr.md) without a headset: the fixture runs the real session code with the head as `pose` and no
 * controllers. What a headset adds (WebXR frames, the controllers' buttons, haptics) is not covered here.
 */
const fixture='/@fs/'+fileURLToPath(new URL('../fixtures/vr.html',import.meta.url)).replaceAll('\\','/');
const f=(page:import('@playwright/test').Page)=>({
  call:<T>(fn:(fixture:any)=>T)=>page.evaluate(`(${fn.toString()})(window.fixture)`) as Promise<Awaited<T>>,
});

test('VR session: eyes on the avatar, heading from the head, the interface on a screen with a laser and a keyboard',async({page})=>{
  test.setTimeout(120000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(fixture);await page.waitForFunction(()=>(window as any).fixture);await page.evaluate(()=>(window as any).fixture.ready);
  const {call}=f(page);
  expect(await call(x=>x.start())).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.classList.contains('vr-active'))).toBe(true);

  // The eyes are over the avatar's feet at about head height, whichever way the head faces.
  await expect.poll(()=>call(x=>{const eye=x.eye();return Math.hypot(eye[0]-18,eye[2]-7)<.05&&eye[1]>1.4&&eye[1]<2;})).toBe(true);

  // The heading the game walks by is the head's (plus the turn): forward is where the nose points.
  await call(x=>{x.vrSession().pose.yaw=.9;});
  await expect.poll(()=>call(x=>{const s=x.state();return Math.abs(s.camera.yaw-s.vr.viewYaw)<1e-3&&Math.abs(s.vr.viewYaw-s.vr.turn-.9)<.01;})).toBe(true);
  // ... and the avatar's head follows it (the room is told the head's yaw and pitch).
  expect(await call(x=>typeof x.state().input.headYaw)).toBe('number');

  // The screen: the page drawn as a picture, and the laser clicks the real button under it.
  await call(x=>x.open());
  await expect.poll(()=>call(x=>x.panels().screen.ready)).toBe(true);
  const over=await call(x=>x.laser(.45,.435,false));
  expect(over.clickable).toBe(true);
  await call(x=>x.laser(.45,.435,true));await call(x=>x.laser(.45,.435,false));
  await expect.poll(()=>call(x=>x.clicks())).toBe(1);

  // A text field takes the keyboard of the screen, which types into it.
  await call(x=>x.laser(.45,.585,true));await call(x=>x.laser(.45,.585,false));
  await expect.poll(()=>call(x=>x.vrSession().keyboard.visible)).toBe(true);
  await page.evaluate(()=>{document.querySelector<HTMLButtonElement>('#vr-keyboard [data-key="o"]')!.click();document.querySelector<HTMLButtonElement>('#vr-keyboard [data-key="i"]')!.click();});
  expect(await page.inputValue('#probe-input')).toBe('oi');

  // Leaving gives the camera back to the world.
  await call(x=>{x.scene.exitVr();});
  expect(await page.evaluate(()=>document.documentElement.classList.contains('vr-active'))).toBe(false);
  expect(errors).toEqual([]);
});
