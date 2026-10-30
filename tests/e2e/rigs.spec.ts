import {test,expect} from '@playwright/test';

test('all six rendered rigs return to the same pose after actions without resetting their skeletons',async({page})=>{
  test.setTimeout(120000);
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto('/rigs.html');
  await page.evaluate(()=>(window as any).rigFixture.ready);
  await expect(page.locator('#skin option')).toHaveCount(7);

  // Use the actual loaded render entities and AnimComponent. The inspector normally resets
  // between selections for visual comparison; these transitions deliberately keep the graph.
  const comparisons=await page.evaluate(async()=>{
    const fixture=(window as any).rigFixture;
    const frame=()=>new Promise<void>(resolve=>fixture.app.once('postrender',resolve));
    const results:Array<{from:string;to:string;skin:string;maxError:number;bone:string}>=[];
    for(const [from,to] of [['Fallen','Idle'],['Fallen','Run'],['Drink','Walk'],['OldCaneWalk','Drink'],['Sit','Pose']]){
      await fixture.select(`bank:${to}`);
      fixture.pose(.4);
      await frame();
      const clean=new Map<string,Record<string,number[]>>(fixture.snapshot().map((actor:any)=>[actor.id,actor.bones]));
      for(const actor of fixture.actors.values()){
        const anim=actor.model.anim;
        for(const name of [from,to]){
          const track=actor.tracks.get(name);
          if(!track)throw new Error(`Missing ${name} for ${actor.root.name}`);
          anim.assignAnimation(`Regression ${name}`,track,undefined,1,false);
        }
        anim.speed=0;anim.playing=true;anim.baseLayer.playing=true;
        anim.baseLayer.transition(`Regression ${from}`,0);
        anim.baseLayer.activeStateCurrentTime=.7;
      }
      await frame();
      for(const actor of fixture.actors.values()){
        const anim=actor.model.anim;
        anim.baseLayer.transition(`Regression ${to}`,0);
        anim.baseLayer.activeStateCurrentTime=.4;
      }
      await frame();
      for(const actor of fixture.snapshot()){
        let maxError=0,bone='';
        for(const [name,position] of Object.entries(actor.bones) as Array<[string,number[]]>){
          const expected=clean.get(actor.id)![name]!;
          const error=Math.hypot(...position.map((value,index)=>value-expected[index]!));
          if(!Number.isFinite(error))throw new Error(`${actor.id}/${name} has non-finite coordinates`);
          if(error>maxError){maxError=error;bone=name;}
        }
        results.push({from,to,skin:actor.id,maxError,bone});
      }
    }
    return results;
  });
  expect(comparisons).toHaveLength(30);
  for(const {from,to,skin,maxError,bone} of comparisons)
    expect(maxError,`${skin}: ${bone} retained a pose from ${from} when entering ${to}`).toBeLessThan(.0001);
  expect(errors).toEqual([]);
});
