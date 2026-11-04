import {expect,type Page} from '@playwright/test';

/** Aim through the real canvas controls, including the saved mouse sensitivity. Angles use the camera rig's convention. */
export async function aimCamera(page:Page,yaw:number,pitch?:number):Promise<void>{
  const {before,point,sensitivity}=await page.evaluate(()=>{
    const before=(window as any).barDebug.camera();
    const sensitivity=JSON.parse(localStorage.getItem('bar:settings:v1')??'{}').cameraFeel?.sensitivity??1;
    for(const x of [.5,.65,.8])for(const y of [.45,.6,.75])
      if(document.elementFromPoint(innerWidth*x,innerHeight*y)?.id==='world')return {before,point:{x:innerWidth*x,y:innerHeight*y},sensitivity};
    throw new Error('No unobscured canvas point for the camera drag');
  });
  const elevation:number=pitch??before.pitch;
  const movementX=(before.yaw-yaw)/(.006*sensitivity),movementY=(elevation-before.pitch)/(.004*sensitivity);
  // Real mouse events are small; the game deliberately clamps implausible jumps in a single event.
  const steps=Math.max(1,Math.ceil(Math.max(Math.abs(movementX),Math.abs(movementY))/250));
  await page.mouse.move(point.x,point.y);await page.mouse.down();
  try{
    for(let step=0;step<steps;step++)await page.locator('#world').dispatchEvent('pointermove',{
      movementX:Math.round(movementX*(step+1)/steps)-Math.round(movementX*step/steps),
      movementY:Math.round(movementY*(step+1)/steps)-Math.round(movementY*step/steps),
      buttons:1,pointerId:1,pointerType:'mouse',
    });
  }finally{await page.mouse.up();}
  await expect.poll(()=>page.evaluate(yaw=>Math.abs((window as any).barDebug.camera().yaw-yaw),yaw)).toBeLessThan(.01);
  await expect.poll(()=>page.evaluate(pitch=>Math.abs((window as any).barDebug.camera().pitch-pitch),elevation)).toBeLessThan(.01);
}
