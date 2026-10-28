import {expect,type Page} from '@playwright/test';

/**
 * Walks a player there with WASD along the A* path of the page's `planner` (installed by the spec: path, goal and
 * reached for a named target), keys relative to the camera, from the listener's yaw.
 */
export async function walk(page:Page,target:string){
  const me=()=>page.evaluate(()=>{const d=(window as any).barDebug.snapshot(),p=d.world.players[d.localId];return {x:p.x as number,z:p.z as number,yaw:((window as any).barDebug.listener()?.yaw??0) as number};});
  const reached=()=>page.evaluate(t=>(window as any).planner.reached(t) as boolean,target);
  // Inputs still on their way move the body after the keys are up: judge where it ends once the room has them all.
  const settled=async()=>{await expect.poll(()=>page.evaluate(()=>(window as any).barDebug.network().pending as number)).toBe(0);return reached();};
  const held=new Set<string>();
  const hold=async(keys:Set<string>)=>{for(const k of [...held])if(!keys.has(k)){await page.keyboard.up(k);held.delete(k);}for(const k of keys)if(!held.has(k)){await page.keyboard.down(k);held.add(k);}};
  type Spot={x:number;z:number;yaw:number};
  const keysTo=(p:Spot,x:number,z:number)=>{const dx=x-p.x,dz=z-p.z,length=Math.hypot(dx,dz)||1,c=Math.cos(p.yaw),s=Math.sin(p.yaw);
    const side=(c*dx-s*dz)/length,ahead=(-s*dx-c*dz)/length,keys=new Set<string>();
    if(side>.38)keys.add('d');if(side<-.38)keys.add('a');if(ahead>.38)keys.add('w');if(ahead<-.38)keys.add('s');return keys;};
  const steer=(p:Spot,x:number,z:number)=>hold(keysTo(p,x,z));
  /** Where those keys take the body in `metres` (the scene's own mapping of keys and camera to a direction). */
  const step=(p:Spot,keys:Set<string>,metres:number)=>{const h=Number(keys.has('d'))-Number(keys.has('a')),v=Number(keys.has('w'))-Number(keys.has('s'));
    const length=Math.hypot(h,v)||1,c=Math.cos(p.yaw),s=Math.sin(p.yaw);return {x:p.x+(c*h-s*v)/length*metres,z:p.z+(-s*h-c*v)/length*metres};};
  const goal:{x:number;z:number}=await page.evaluate(t=>(window as any).planner.goal(t),target);
  const distance=(a:{x:number;z:number},b:{x:number;z:number})=>Math.hypot(a.x-b.x,a.z-b.z);
  // A slow page overshoots single waypoints: aim a little ahead of the closest path point, and plan again from wherever it
  // stopped, or stuck for a second and a half (against a door jamb): a side step first, alternately left and right of
  // where it was heading, then a new search, whose lattice starts where the body is.
  // A minute and a half per walk, so a starved machine fails here with a clear message instead of eating the whole test.
  const deadline=Date.now()+90_000,flat=await page.evaluate(()=>!!(window as any).planner.flat);
  let sidesteps=0;
  for(let attempt=0;attempt<6&&Date.now()<deadline&&!await reached();attempt++){
    const path:Array<{x:number;z:number}>|undefined=await page.evaluate(t=>(window as any).planner.path(t),target);expect(path,'a walkable path').toBeTruthy();
    for(let index=0,moved={x:NaN,z:NaN,at:Date.now()};Date.now()<deadline;){
      const p=await me();
      if(!(distance(p,moved)<.05))moved={x:p.x,z:p.z,at:Date.now()};
      else if(Date.now()-moved.at>1500){
        const ahead=path![Math.min(path!.length-1,index+1)]!,side=sidesteps++%2?1:-1;
        await steer(p,p.x-(ahead.z-p.z)*side,p.z+(ahead.x-p.x)*side);await page.waitForTimeout(250);await hold(new Set());break;
      }
      for(let j=index+1;j<Math.min(path!.length,index+7);j++)if(distance(path![j]!,p)<distance(path![index]!,p))index=j;
      if(distance(path!.at(-1)!,p)<.3)break;
      // Not through what lies in between, though: with a planner that has `flat` (a straight walk from the body that stays
      // on its floor), the furthest of the next waypoints both in a straight line and along the keys' own direction (only
      // eight of them), else the closest one. Without it, the line cut up the indoor stairs' ramp onto the landing, into
      // the wall beside a doorway after cutting a corner, or W alone pressed the body against the veranda's railing.
      const candidates=[index+2,index+1,index].map(i=>path![Math.min(path!.length-1,i)]!);
      const options=candidates.map(aim=>({aim,step:step(p,keysTo(p,aim.x,aim.z),.6)}));
      const aim=candidates[!flat?0:await page.evaluate(options=>{const planner=(window as any).planner;
        const clear=options.findIndex((o:{aim:{x:number;z:number};step:{x:number;z:number}})=>planner.flat(o.aim)&&planner.flat(o.step));
        return clear<0?options.length-1:clear;},options)]!;
      await steer(p,aim.x,aim.z);await page.waitForTimeout(70);
    }
    await hold(new Set());
    // The last steps in short taps, until the client's own reach rule holds.
    for(let i=0;i<12&&Date.now()<deadline&&!await settled();i++){await steer(await me(),goal.x,goal.z);await page.waitForTimeout(90);await hold(new Set());await page.waitForTimeout(150);}
  }
  await hold(new Set());expect(await settled(),`reached ${target} within 90 s`).toBe(true);
}
