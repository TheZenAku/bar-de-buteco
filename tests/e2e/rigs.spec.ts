import {test,expect} from '@playwright/test';

test('camera gaze preserves skull geometry on the loaded rigs and releases the animated neck and head',async({page})=>{
  test.setTimeout(120000);
  await page.goto('/rigs.html');
  await page.evaluate(()=>(window as any).rigFixture.ready);
  const results=await page.evaluate(async()=>{
    const module='/src/engine/head-look.ts', {HeadLookPose}=await import(module);
    const fixture=(window as any).rigFixture;
    await fixture.select('bank:Idle');fixture.pose(.4);
    await new Promise<void>(resolve=>fixture.app.once('postrender',resolve));
    const results=[];
    for(const [id,actor] of fixture.actors){
      const head=actor.model.findByName('head'),neck=head.parent,look=new HeadLookPose();
      const Vec3=head.getPosition().constructor,Mat4=head.getWorldTransform().constructor;
      const headBase=head.getLocalRotation().clone(),neckBase=neck.getLocalRotation().clone();
      const samples:Array<{position:any;joints:number[];weights:number[];skin:any;original:any}>=[];
      const point=(sample:any)=>{
        const world=new Vec3(),matrix=new Mat4();
        for(let k=0;k<4;k++)if(sample.weights[k]){
          const joint=sample.joints[k];matrix.mul2(sample.skin.bones[joint].getWorldTransform(),sample.skin.skin.inverseBindPose[joint]);
          world.add(matrix.transformPoint(sample.position).mulScalar(sample.weights[k]));
        }
        return new Mat4().copy(head.getWorldTransform()).invert().transformPoint(world);
      };
      if(id!=='nathan')for(const render of actor.model.findComponents('render'))for(const instance of render.meshInstances){
        const skin=instance.skinInstance;if(!skin)continue;
        const positions:number[]=[],joints:number[]=[],weights:number[]=[];
        instance.mesh.getPositions(positions);instance.mesh.getVertexStream('BLENDINDICES',joints);instance.mesh.getVertexStream('BLENDWEIGHT',weights);
        for(let i=0;i<positions.length/3;i++){
          const sample={position:new Vec3(...positions.slice(i*3,i*3+3)),joints:joints.slice(i*4,i*4+4),weights:weights.slice(i*4,i*4+4),skin,original:undefined as any};
          const world=new Mat4().mul2(head.getWorldTransform(),skin.skin.inverseBindPose[skin.bones.indexOf(head)]).transformPoint(sample.position);
          if(world.y<head.getPosition().y+.03)continue;
          if(sample.weights.some((w,k)=>w>0&&!/^(head|head_end|neck|spine_0[23]|shoulder_[lr])$/.test(skin.bones[sample.joints[k]!].name)))continue;
          sample.original=point(sample);samples.push(sample);
        }
      }
      let deformation=0,restoreError=0;
      for(const [yaw,pitch] of [[80,50],[-80,-50],[80,-50],[-80,50]]){
        look.apply(head,0,{headYaw:yaw!*Math.PI/180,headPitch:pitch!*Math.PI/180},1);
        for(const sample of samples)deformation=Math.max(deformation,point(sample).distance(sample.original));
        look.restore();
        restoreError=Math.max(restoreError,1-Math.abs(head.getLocalRotation().dot(headBase)),1-Math.abs(neck.getLocalRotation().dot(neckBase)));
      }
      results.push({id,samples:samples.length,deformation,restoreError});
    }
    return results;
  });
  expect(results).toHaveLength(12);
  for(const result of results){
    if(result.id!=='nathan')expect(result.samples,result.id).toBeGreaterThan(100);
    expect(result.deformation,`${result.id}: skull deformation`).toBeLessThan(.0001);
    expect(result.restoreError,`${result.id}: animation restoration`).toBeLessThan(.000001);
  }
});

test('all rendered rigs return to the same pose after actions without resetting their skeletons',async({page})=>{
  test.setTimeout(120000);
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto('/rigs.html');
  await page.evaluate(()=>(window as any).rigFixture.ready);
  const rigs=await page.evaluate(()=>(window as any).rigFixture.actors.size);
  await expect(page.locator('#skin option')).toHaveCount(rigs+1);

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
  expect(comparisons).toHaveLength(rigs*5);
  for(const {from,to,skin,maxError,bone} of comparisons)
    expect(maxError,`${skin}: ${bone} retained a pose from ${from} when entering ${to}`).toBeLessThan(.0001);
  expect(errors).toEqual([]);
});


test('drinking overlays an already playing gait on every rig and releases it cleanly',async({page})=>{
  test.setTimeout(120000);
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/rigs.html');
  await page.evaluate(()=>(window as any).rigFixture.ready);
  const comparisons=await page.evaluate(async()=>{
    // Exercise the game's layer creation after the base clips have already bound their joints,
    // as happens when the animation bank arrives after the avatar starts walking.
    const sceneModule='/src/engine/BarScene.ts';
    const {BarScene}=await import(sceneModule);
    const fixture=(window as any).rigFixture;
    const frame=()=>new Promise<void>(resolve=>fixture.app.once('postrender',resolve));
    const masked=['shoulder_l','upperarm_l','lowerarm_l','hand_l','neck','head'];
    const body=['hip','spine_01','spine_02','spine_03','upperarm_r','lowerarm_r','hand_r','upperleg_l','lowerleg_l','foot_l','upperleg_r','lowerleg_r','foot_r'];
    const rotations=(actor:any,names:string[])=>Object.fromEntries(names.map(name=>{
      const q=actor.model.findByName(name).getLocalRotation();return [name,[q.x,q.y,q.z,q.w]];
    }));
    await fixture.select('bank:Drink');fixture.pose(3);
    await frame();
    const drink=new Map<string,Record<string,number[]>>([...fixture.actors].map(([id,actor]:any)=>[id,rotations(actor,masked)]));
    await fixture.select('bank:Walk');fixture.pose(.4);
    await frame();
    for(const actor of fixture.actors.values()){
      const bones=Object.fromEntries(['upperarm_l','head'].map(name=>[name,actor.model.findByName(name)]));
      for(const clip of ['Idle','Walk','Run','DrunkIdle','DrunkWalk','OldCaneWalk','OldCaneHold'])
        actor.model.anim.assignAnimation(clip,actor.tracks.get(clip));
      actor.handSkin={model:actor.model,bones};
      (BarScene.prototype as any).addHandLayer.call({},actor.handSkin,actor.tracks.get('Drink'));
      actor.handSkin.handLayer.transition('Drink',0);
      actor.model.anim.baseLayer.playing=true;
    }
    const results:Array<{skin:string;clip:string;phase:string;bone:string;error:number}>=[];
    const compare=(skin:string,clip:string,phase:string,actual:Record<string,number[]>,expected:Record<string,number[]>)=>{
      for(const [bone,q] of Object.entries(expected)){
        const a=actual[bone]!;
        const dot=Math.abs(a.reduce((sum,value,index)=>sum+value*q[index]!,0));
        results.push({skin,clip,phase,bone,error:1-Math.min(1,dot)});
      }
    };
    for(const clip of ['Idle','Walk','Run','DrunkIdle','DrunkWalk','OldCaneWalk','OldCaneHold']){
      for(const [id,actor] of fixture.actors){
        const anim=actor.model.anim,layer=actor.handSkin.handLayer;
        anim.baseLayer.transition(clip,0);anim.baseLayer.activeStateCurrentTime=.4;
        layer.weight=0;anim.update(0);
        const clean=rotations(actor,[...masked,...body]);
        layer.weight=1;layer.activeStateCurrentTime=3;anim.update(0);
        compare(id,clip,'sip',rotations(actor,masked),drink.get(id)!);
        compare(id,clip,'body',rotations(actor,body),Object.fromEntries(body.map(name=>[name,clean[name]!])));
        layer.weight=0;anim.update(0);
        compare(id,clip,'released',rotations(actor,[...masked,...body]),clean);
      }
    }
    return {rigs:fixture.actors.size,results};
  });
  expect(comparisons.rigs).toBe(12);
  expect(comparisons.results).toHaveLength(12*7*(6+13+19));
  for(const {skin,clip,phase,bone,error} of comparisons.results)
    expect(error,`${skin}/${clip}/${phase}: ${bone}`).toBeLessThan(.000001);
  expect(errors).toEqual([]);
});
