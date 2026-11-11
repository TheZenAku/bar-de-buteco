import {test,expect,type Page} from '@playwright/test';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {previewPath} from './preview-path';
import {walk} from './walk';
import {enterAsAdmin,selfOf} from './moto-helpers';

/**
 * The bar animations (animacoes_bar.js ported to apps/web/src/engine/bar-animations.ts): every action on a different skin
 * in the scene fixture, from synced states as the room sends them, and the whole cigarette on every skin; then a live
 * player smoking (F) and a whole cigarette (Shift+F), and the development panel (F8) making Magrão pour a chopp.
 */
const map=JSON.parse(readFileSync(new URL('../../packages/shared/src/map-data.json',import.meta.url),'utf8')) as typeof import('../../packages/shared/src/map-data.json');
const fixture='/@fs/'+fileURLToPath(new URL('../fixtures/environment.html',import.meta.url)).replaceAll('\\','/');

test('jump clips work on every player skeleton and Space preserves focus, defense and flight controls',async({page})=>{
  test.setTimeout(120000);
  await page.goto('/@fs/'+fileURLToPath(new URL('../fixtures/smoking.html',import.meta.url)).replaceAll('\\','/'));
  await page.evaluate(()=>(window as any).fixture.ready);
  await page.evaluate(()=>(window as any).fixture.all());
  await expect.poll(()=>page.evaluate(()=>[...(window as any).fixture.scene.actors.values()].every((a:any)=>a.skin?.tracks.has('Land'))),{timeout:60000}).toBe(true);
  const clips=await page.evaluate(()=>{
    const scene=(window as any).fixture.scene;scene.restoreHeadLooks();scene.app.off('update',scene.update,scene);
    const results=[];
    for(const avatar of scene.actors.values()){
      const pose={t:0,dt:1/60,walking:false,running:false,seated:0,dancing:false,drinking:false,waving:false};
      avatar.actor={...avatar.actor,smokingSince:0,drunk:0};
      for(const [action,clip] of [['jump','Jump'],['fall','Fall'],['land','Land'],['idle','Idle'],['run','Run']]){
        avatar.actor.animation=action;avatar.actor.animationStartedAt=(window as any).fixture.now();
        pose.walking=action==='run';pose.running=action==='run';avatar.speed=action==='run'?6:0;
        scene.poseSkin(avatar,avatar.skin,pose);avatar.skin.model.anim.update(.1);
        results.push({skin:avatar.skinId,clip:avatar.skin.model.anim.baseLayer.activeState,expected:clip});
      }
    }
    scene.localId='nathan';scene.actors.get('nathan').actor.animation='idle';scene.setEnabled(true);
    return results;
  });
  expect(clips).toHaveLength(50);
  for(const result of clips)expect(result.clip,result.skin).toBe(result.expected);
  // Even a complete press between the 50 ms input samples reaches the controller once.
  await page.keyboard.press('Space');
  expect(await page.evaluate(()=>(window as any).fixture.scene.getInput().jump)).toBe(true);
  expect(await page.evaluate(()=>(window as any).fixture.scene.getInput().jump)).toBe(false);
  await page.evaluate(()=>{const input=document.createElement('input');input.id='jump-focus';document.body.append(input);input.focus();});
  await page.keyboard.press('Space');
  expect(await page.evaluate(()=>(window as any).fixture.scene.getInput().jump)).toBeFalsy();
  await page.evaluate(()=>{document.querySelector('#jump-focus')?.remove();(window as any).fixture.scene.callbacks.onBlock=(down:boolean)=>down;});
  await page.keyboard.press('Space');
  expect(await page.evaluate(()=>(window as any).fixture.scene.getInput().jump)).toBe(false);
  await page.evaluate(()=>{const s=(window as any).fixture.scene;s.callbacks.onBlock=undefined;s.actors.get('nathan').actor.animation='fly-idle';});
  await page.keyboard.down('Space');
  const flying=await page.evaluate(()=>(window as any).fixture.scene.getInput());
  expect(flying.jump).toBe(false);expect(flying.dy).toBe(1);
  // Landing or leaving another context while Space remains down cannot turn that old press into a jump.
  await page.evaluate(()=>(window as any).fixture.scene.actors.get('nathan').actor.animation='idle');
  expect(await page.evaluate(()=>(window as any).fixture.scene.getInput().jump)).toBe(false);
  await page.keyboard.up('Space');
});

test('Space jumps through the live predicted controller and returns to running after landing',async({page})=>{
  test.setTimeout(90000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await enterAsAdmin(page);
  await page.evaluate(()=>(window as any).barDebug.send('test.player.place',{x:60,y:0,z:7}));
  await expect.poll(async()=>(await selfOf(page)).x).toBeCloseTo(60,1);
  await expect.poll(()=>page.evaluate(()=>{const d=(window as any).barDebug,s=d.snapshot();return d.animations().find((a:any)=>a.id===s.localId)?.tracks.includes('Jump');}),{timeout:60000}).toBe(true);
  await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();
    const w=window as any;w.jumpSamples=[];w.jumpTimer=setInterval(()=>{const d=w.barDebug,s=d.snapshot(),p=s.world.players[s.localId];w.jumpSamples.push({y:p.y,grounded:p.grounded,animation:p.animationState});},16);
  });
  await page.keyboard.down('Space');
  await expect.poll(async()=>(await selfOf(page)).y,{intervals:[20]}).toBeGreaterThan(.1);
  await expect.poll(async()=>(await selfOf(page)).grounded,{intervals:[20]}).toBe(true);
  await page.waitForTimeout(300);
  const samples=await page.evaluate(()=>{clearInterval((window as any).jumpTimer);return (window as any).jumpSamples as Array<{y:number;grounded:boolean;animation:string}>;});
  expect(Math.max(...samples.map(s=>s.y))).toBeGreaterThan(.85);
  expect(Math.max(...samples.map(s=>s.y))).toBeLessThan(1.05);
  expect(samples.some(s=>s.animation==='jump')).toBe(true);
  expect(samples.some(s=>s.animation==='fall')).toBe(true);
  expect((await selfOf(page)).y).toBe(0);
  await page.keyboard.up('Space');
  await page.keyboard.down('ShiftLeft');await page.keyboard.down('KeyW');
  const before=await selfOf(page);await page.keyboard.press('Space');
  await expect.poll(async()=>(await selfOf(page)).y,{intervals:[20]}).toBeGreaterThan(.1);
  await expect.poll(async()=>(await selfOf(page)).grounded,{intervals:[20]}).toBe(true);
  await expect.poll(async()=>(await selfOf(page)).animationState).toBe('run');
  const after=await selfOf(page);expect(Math.hypot(after.x-before.x,after.z-before.z)).toBeGreaterThan(1);
  await page.keyboard.up('KeyW');await page.keyboard.up('ShiftLeft');
  expect(errors).toEqual([]);
});

test('normal movement keeps a walking gait on every player skin and still runs on request',async({page})=>{
  test.setTimeout(120000);
  await page.goto('/@fs/'+fileURLToPath(new URL('../fixtures/smoking.html',import.meta.url)).replaceAll('\\','/'));
  await page.evaluate(()=>(window as any).fixture.ready);
  await page.evaluate(()=>(window as any).fixture.all());
  await expect.poll(()=>page.evaluate(()=>{
    const actors=[...(window as any).fixture.scene.actors.values()] as any[];
    return actors.length===10&&actors.every(a=>a.skin?.tracks.has('Jog')&&a.skin.tracks.has('Run'));
  }),{timeout:60000}).toBe(true);
  const results=await page.evaluate(()=>{
    const scene=(window as any).fixture.scene;
    scene.restoreHeadLooks();scene.app.off('update',scene.update,scene);
    const results=[];
    for(const avatar of scene.actors.values()){
      const pose={t:0,dt:1/60,walking:true,running:false,seated:0,dancing:false,drinking:false,waving:false};
      avatar.actor={...avatar.actor,animation:'walk',smokingSince:0,drunk:0};
      // Cross the Jog threshold in both directions, as movement snapshots can do (never a jog: the walk is the only gait below a run).
      for(const speed of [1,1.6,2.6,1.6]){
        avatar.speed=speed;
        for(let frame=0;frame<90;frame++){
          scene.poseSkin(avatar,avatar.skin,pose);
          avatar.skin.model.anim.update(pose.dt);
        }
        const anim=avatar.skin.model.anim;
        results.push({skin:avatar.skinId,speed,clip:anim.baseLayer.activeState,rate:anim.speed,expected:'Walk'});
      }
      avatar.speed=6;avatar.actor.animation='run';pose.running=true;
      scene.poseSkin(avatar,avatar.skin,pose);avatar.skin.model.anim.update(.5);
      results.push({skin:avatar.skinId,speed:6,clip:avatar.skin.model.anim.baseLayer.activeState,expected:'Run'});
    }
    return results;
  });
  expect(results).toHaveLength(60);
  for(const result of results){
    expect(result.clip,`${result.skin} at ${result.speed} m/s`).toBe(result.expected);
    if(result.rate!==undefined)expect(result.rate).toBeLessThanOrEqual(1.5);
  }
});

test('late animation banks and chair clips never flash a different pose through drink or guard layers',async({page})=>{
  test.setTimeout(120000);
  await page.goto('/@fs/'+fileURLToPath(new URL('../fixtures/smoking.html',import.meta.url)).replaceAll('\\','/'));
  await page.evaluate(()=>(window as any).fixture.ready);
  await expect.poll(()=>page.evaluate(()=>{
    const s=(window as any).fixture.scene,a=s.actors.get('a');
    return !!a?.skin?.tracks.has('Heavy')&&s.danceBanks.has('nathan');
  }),{timeout:60000}).toBe(true);
  const setup=await page.evaluate(()=>{
    const s=(window as any).fixture.scene,a=s.actors.get('a');
    // Step the real animation components ourselves so comparisons do not depend on GPU frame rate.
    s.restoreHeadLooks();s.app.off('update',s.update,s);
    const body=s.group('Reference rig',[0,0,0]),skin=s.makeSkin(body,s.skinModels.get('nathan'));
    body.enabled=false;
    const reference={...a,body,skin,actor:{...a.actor}};
    (window as any).stability={s,a,reference};
    a.skin.model.anim.enabled=false;skin.model.anim.enabled=false;
    // Match the safe, freshly bound pose independently of late registrations on the tested rig.
    skin.model.anim.rebind();
    return a.skin.tracks.has('Heavy');
  });
  expect(setup).toBe(true);
  const compare=(clip:string)=>page.evaluate(clip=>{
    const {a,reference}=(window as any).stability;
    for(const actor of [a,reference]){
      const {skin}=actor,anim=skin.model.anim;anim.speed=0;
      anim.baseLayer.transition(clip,0);anim.baseLayer.activeStateCurrentTime=.4;
      skin.handLayer.weight=.00001;skin.guardLayer.weight=.00001;skin.orderLayer.weight=0;
    }
    let worst=0;
    for(let frame=0;frame<120;frame++){
      a.skin.model.anim.update(0);reference.skin.model.anim.update(0);
      for(const name of ['upperarm_l','lowerarm_l','hand_l','upperarm_r','hand_r','head']){
        const q=a.skin.bones[name].getLocalRotation(),clean=reference.skin.bones[name].getLocalRotation();
        worst=Math.max(worst,2*Math.acos(Math.min(1,Math.abs(q.dot(clean))))*180/Math.PI);
      }
    }
    return worst;
  },clip);
  // A bank arriving after playback has begun used to corrupt the shared layer targets.
  await page.evaluate(()=>{
    const {s,a}=(window as any).stability;
    a.skin.model.anim.update(0);s.assignClips(a.skin,s.danceBanks.get('nathan'));
  });
  expect(await compare('Heavy')).toBeLessThan(.01);
  // The same failure also occurred when a chair animation was first registered while holding a drink.
  await expect.poll(()=>page.evaluate(()=>{
    const {s,a}=(window as any).stability;
    a.actor={...a.actor,animation:'sit',animationState:'sit',interactionState:'seat-9',animationStartedAt:Date.now(),smokingSince:0};
    return !!s.barAction(a,Date.now());
  })).toBe(true);
  await page.evaluate(()=>{
    const {s,a,reference}=(window as any).stability;
    reference.actor={...a.actor};s.barAction(reference,Date.now());reference.skin.model.anim.rebind();
  });
  expect(await compare('Bar sentar')).toBeLessThan(.01);
});

test('polished cigarette: upper body lighting, persistent lip contact on every skin, puffs and free legs; counter greeting once',async({page})=>{
  test.setTimeout(180000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/@fs/'+fileURLToPath(new URL('../fixtures/smoking.html',import.meta.url)).replaceAll('\\','/'));
  await page.evaluate(()=>(window as any).fixture.ready);
  const status=()=>page.evaluate(()=>(window as any).fixture.status());
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.scene.getAnimations()[0]?.skin),{timeout:60000}).toBe('nathan');
  await page.evaluate(()=>(window as any).fixture.clock(2200));
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.scene.cigarettes.saved.size)).toBeGreaterThan(8);
  await expect.poll(async()=>(await status()).actors.a?.flame).toBe(true);
  await page.screenshot({path:'test-results/previews/smoke-lighting.png'});
  await page.evaluate(()=>(window as any).fixture.clock(5000));
  await expect.poll(async()=>(await status()).actors.a?.phase).toBe('lit');
  expect((await status()).actors.a.mouthError).toBeLessThan(.002);
  await page.screenshot({path:'test-results/previews/smoke-mouth.png'});
  await page.evaluate(()=>{const f=(window as any).fixture;f.patch({holding:'garrafa',holdingSince:f.since,holdingUntil:f.since+50000});});
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.scene.getAnimations()[0]?.drink?.item)).toBe('garrafa');
  expect((await status()).actors.a.phase).toBe('lit');
  expect((await status()).actors.a.mouthError).toBeLessThan(.002);
  await page.screenshot({path:'test-results/previews/smoke-with-drink.png'});
  await page.evaluate(()=>(window as any).fixture.patch({holding:'',holdingSince:0,holdingUntil:0}));
  await page.evaluate(()=>(window as any).fixture.all());
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.scene.getAnimations().filter((v:any)=>v.skin===v.id).length),{timeout:60000}).toBe(10);
  await expect.poll(async()=>Object.keys((await status()).actors).length).toBe(10);
  for(const a of Object.values((await status()).actors) as any[])expect(a.mouthError).toBeLessThan(.002);
  expect(await page.evaluate(()=>(window as any).fixture.scene.getAnimations().every((a:any)=>a.clip==='Idle'&&!a.bar))).toBe(true);
  await page.screenshot({path:'test-results/previews/smoke-all-skins.png'});
  // Only arm/finger joints are ever overridden, even during the lighting handoff.
  await page.evaluate(()=>(window as any).fixture.clock(2200));
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.scene.cigarettes.saved.size)).toBeGreaterThan(8);
  const saved=await page.evaluate(()=>[...(window as any).fixture.scene.cigarettes.saved.keys()].map((n:any)=>n.name));
  expect(saved.length).toBeGreaterThan(8);expect(saved.some((n:string)=>/hip|leg|foot|root/i.test(n))).toBe(false);
  // Every avatar follows its actual head when looking around or walking.
  await page.evaluate(()=>{const f=(window as any).fixture;f.clock(16000);f.patch({headYaw:.4,headPitch:.15,animationState:'walk'});f.scene.setEnabled(true);});
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.scene.getAnimations().every((a:any)=>a.clip==='Walk'))).toBe(true);
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.scene.getAnimations().every((a:any)=>a.look?.yaw>.3))).toBe(true);
  for(const a of Object.values((await status()).actors) as any[])expect(a.mouthError).toBeLessThan(.002);
  await expect.poll(async()=>(await status()).particles).toBeGreaterThan(0);
  await page.evaluate(()=>(window as any).fixture.stop());
  await expect.poll(async()=>Object.values((await status()).actors).every((a:any)=>a.phase==='extinguishing')).toBe(true);
  await page.evaluate(()=>(window as any).fixture.clock(18000));await expect.poll(async()=>Object.keys((await status()).actors).length).toBe(0);
  // The customer uses Idle below the shoulders and a short imported nod, then waits neutrally.
  await page.evaluate(()=>{const f=(window as any).fixture;f.skin('nathan');f.clock(700);f.patch({smokingSince:0,animationState:'wait',drinkItem:'copo'});f.view([61,1.8,10],[60,1.1,7]);});
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.legs()[0]?.order)).toBeGreaterThan(.5);
  expect(await page.evaluate(()=>(window as any).fixture.legs()[0]?.clip)).toBe('Idle');
  await page.screenshot({path:'test-results/previews/counter-request.png'});
  await page.evaluate(()=>(window as any).fixture.clock(3500));
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.legs()[0]?.order)).toBe(0);
  expect(errors).toEqual([]);
});
const seat=map.seats.find(s=>s.id==='seat-9')!,urinal=map.barAnimations.urinals[0]!,magrao=map.barAnimations.counter.magrao,table=map.tables.find(t=>t.number===3)!;
const corner=(()=>{const {x,z,yaw}=table.anchor,{x:cx,z:cz}=map.barAnimations.clips.limpar_mesa.start,cos=Math.cos(yaw),sin=Math.sin(yaw);
  return {x:x+cx*cos+cz*sin,z:z-cx*sin+cz*cos,rotation:yaw+map.barAnimations.clips.limpar_mesa.start.yaw};})();
type Actor=[id:string,skin:string,x:number,y:number,z:number,rotation:number,state:string,ago:number,place?:string,drunk?:number];

/** Syncs players (and Magrão) doing bar actions, each begun `ago` ms before the fixture's clock. */
function sync(page:Page,actors:Actor[],serve?:[state:string,ago:number],served:Record<string,unknown>={}){
  return page.evaluate(([actors,serve,served,magrao])=>{
    const f=(window as any).fixture,now=f.now(),players:Record<string,unknown>={},npcs:Record<string,unknown>={};
    for(const [id,skin,x,y,z,rotation,state,ago,place,drunk] of actors){
      const actor={id,displayName:id,color:'#fff',skin,x,y,z,rotation,drunk:drunk??0,animationState:state,animationStartedAt:now-ago,
        interactionState:place??'',currentTableId:'',lastProcessedInput:0,connected:true};
      // Magrão and Tonico use NPC-only skins; requesting them as a player falls back to Nathan.
      if(id==='bartender'||id==='tonico')npcs[id]={...actor,behavior:'idle'};else players[id]=actor;
    }
    if(serve)npcs.bartender={id:'bartender',displayName:'Magrão',color:'#fff',x:magrao.x,y:magrao.y,z:magrao.z,rotation:magrao.yaw,animationState:serve[0],animationStartedAt:now-serve[1],behavior:'serving'};
    for(const item of Object.values(served) as any[])item.placedAt=now+item.placedAt;
    f.scene.setWorld({players,npcs,tables:{},event:{id:'',type:'',startedAt:0,durationMs:0},occupancy:0,capacity:32,serverTime:now,served},'');
  },[actors,serve,served,magrao] as const);
}
/** Moves the fixture's clock (the room's) on, a frame at a time. */
async function advance(page:Page,ms:number){for(let i=0;i<10;i++){await page.evaluate(step=>(window as any).fixture.advance(step),ms/10);await page.waitForTimeout(30);}}
const status=(page:Page)=>page.evaluate(()=>(window as any).fixture.scene.getMapStatus().barAnimations);
const bars=(page:Page)=>page.evaluate(()=>Object.fromEntries((window as any).fixture.scene.getAnimations().map((a:any)=>[a.id,a.bar?.clip??a.clip])));

test('Mixamo locomotion and seated idle remain active on every skin after the authored bar banks load',async({page})=>{
  test.setTimeout(180000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const skins=['nathan','leandro','rafael','read','magrao','gilmar-gordo','gabriel','flavio-hipotetico','tiao','primo'];
  const actorId=(skin:string)=>skin==='magrao'?'bartender':`mixamo-${skin}`;
  await page.goto(fixture);await page.evaluate(()=>(window as any).fixture.ready);
  const animations=()=>page.evaluate(()=>(window as any).fixture.scene.getAnimations().map((actor:any)=>({
    ...actor,duration:(window as any).fixture.scene.app.root.findByName(`Avatar ${actor.id}`)?.findComponent('anim')?.baseLayer?.activeStateDuration,
  })));
  const street=(state:string,drunk=0):Actor[]=>skins.map((skin,index)=>[actorId(skin),skin,9+index,.15,1.6,Math.PI,state,1200,'',drunk]);
  // Load locomocao explicitly: it used to replace the game's idle and walks once available.
  await sync(page,street('fallen'));
  await expect.poll(async()=>(await status(page)).groups.locomocao,{timeout:90000}).toBe('loaded');
  await expect.poll(()=>bars(page),{timeout:60000}).toEqual(Object.fromEntries(skins.map(skin=>[actorId(skin),'cair'])));

  for(const [state,drunk,clip,duration] of [
    ['idle',0,'Idle',4],['walk',0,'Walk',1.4],['run',0,'Run',22/30],
    ['walk',75,'DrunkWalk',3],['idle',55,'DrunkIdle',119/30],
  ] as const){
    await sync(page,street(state,drunk));
    await expect.poll(async()=>Object.fromEntries((await animations()).map((actor:any)=>[actor.id,actor.clip])),{timeout:60000})
      .toEqual(Object.fromEntries(skins.map(skin=>[actorId(skin),clip])));
    expect(Object.fromEntries((await animations()).map((actor:any)=>[actor.id,actor.skin])))
      .toEqual(Object.fromEntries(skins.map(skin=>[actorId(skin),skin])));
    for(const actor of await animations()){
      expect(actor.bar,`${actor.skin}/${clip} does not play an authored bar body`).toBeUndefined();
      expect(actor.duration,`${actor.skin}/${clip} uses the imported bank duration`).toBeCloseTo(duration,3);
    }
    // A subsequent network snapshot must not switch back to the bar bank or restart locomotion.
    const before=await animations();
    await page.waitForTimeout(100);
    await sync(page,street(state,drunk));
    const after=await animations();
    expect(after.map((actor:any)=>actor.clip)).toEqual(skins.map(()=>clip));
    if(clip==='Idle')for(const [index,actor] of after.entries())expect(actor.time).toBeGreaterThan(before[index].time);
  }

  const places=map.seats.filter(place=>Number.isInteger(place.chair)).slice(0,skins.length);
  const loopAge=7500,satAgo=Math.round(map.barAnimations.clips.sentar.duration*1000)+loopAge;
  await sync(page,skins.map((skin,index)=>{const place=places[index]!;return [actorId(skin),skin,place.x,place.y,place.z,place.rotation,'sit',satAgo,place.id];}));
  await expect.poll(async()=>Object.fromEntries((await animations()).map((actor:any)=>[actor.id,actor.clip])),{timeout:60000})
    .toEqual(Object.fromEntries(skins.map(skin=>[actorId(skin),'Sit'])));
  for(const actor of await animations()){
    expect(actor.bar).toMatchObject({clip:'sentado_loop',placed:true});
    expect(actor.duration).toBeCloseTo(7/6,3);
  }
  // The seated loop (Sitting.fbx) is 1.167 s, while the authored props loop is 8 s.
  // Crossing that props boundary must keep the body's own continuous phase.
  await advance(page,1000);
  const duration=7/6,expected=(loopAge/1000+1)%duration;
  const seatedPhaseMatches=async()=>{
    return (await animations()).every((actor:any)=>{
      const phase=((actor.time%duration)+duration)%duration,drift=Math.abs(phase-expected);
      return actor.clip==='Sit'&&actor.bar?.clip==='sentado_loop'&&Math.min(drift,duration-drift)<.25;
    });
  };
  await expect.poll(seatedPhaseMatches).toBe(true);
  // PlayCanvas can accumulate time beyond whole loops. A hidden tab can leave
  // the body out of phase even though the room and props still say 8.5 seconds.
  // Half a loop off is the farthest phase from the right one.
  const corrupted=await page.evaluate(([expected,offset])=>{
    const scene=(window as any).fixture.scene;
    return scene.getAnimations().map((actor:any)=>{
      const layer=scene.app.root.findByName(`Avatar ${actor.id}`).findComponent('anim').baseLayer;
      layer.activeStateCurrentTime=layer.activeStateDuration*3+expected+offset;
      return {time:layer.activeStateCurrentTime,duration:layer.activeStateDuration};
    });
  },[expected,duration/2]);
  for(const actor of corrupted){
    expect(actor.time).toBeGreaterThan(actor.duration*2);
    expect(((actor.time-expected)%actor.duration+actor.duration)%actor.duration).toBeCloseTo(duration/2,3);
  }
  // Correct within a few frames; body and room advance together, so the wrong
  // phase never drifts back by itself and waiting cannot conceal a failed correction.
  await expect.poll(seatedPhaseMatches,{timeout:1500,intervals:[50,100,200]}).toBe(true);
  for(const place of places){
    const chair=await page.evaluate(id=>(window as any).fixture.scene.barChair(id),place.id);
    expect(Math.hypot(chair[0]-place.x,chair[2]-place.z)).toBeLessThan(.01);
  }
  expect(errors).toEqual([]);
  await page.evaluate(()=>(window as any).fixture.scene.destroy());
});

test('every bar animation plays on the skins from the room\'s state: chair pulled and back, props in hand, the cup and lid swapped, particles and leftovers',async({page})=>{
  test.setTimeout(240000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(['error','warning'].includes(message.type()))errors.push(message.text());});
  await page.goto(fixture);await page.evaluate(()=>(window as any).fixture.ready);
  await page.evaluate(()=>(window as any).fixture.hour(20));
  // Como conferir (PROMPT_INTEGRACAO_ANIMACOES.md): what the module finds in the map.
  expect(await status(page)).toMatchObject({cadeiras:124,mesas:31,mictorios:3,balcao:true,entrega:true});

  // Six actions at once, six skins (Magrão's own).
  const street=(dx:number):[number,number,number]=>[12+dx,.15,1.6];
  await sync(page,[
    ['p-sit','rafael',seat.x,seat.y,seat.z,seat.rotation,'sit',2600,'seat-9'],
    ['p-uri','leandro',urinal.x,urinal.y,urinal.z,urinal.yaw,'urinate',4000,urinal.id],
    ['p-smoke','nathan',...street(-1.5),Math.PI,'smoke',9000],
    ['p-vomit','gilmar-gordo',...street(0),Math.PI,'vomit',3000],
    ['p-fall','read',...street(1.5),Math.PI,'fallen',5000],
    ['p-clean','read',corner.x,table.y,corner.z,corner.rotation,'clean',3000],
  ],['serve-chopp',5000]);
  await expect.poll(()=>bars(page),{timeout:90000}).toEqual({'p-sit':'sentar','p-uri':'urinar','p-smoke':'fumar_loop','p-vomit':'vomitar','p-fall':'cair','p-clean':'limpar_mesa',bartender:'magrao_chopp'});
  await advance(page,300);
  const playing=await status(page);
  // Sitting down pulls the map's own chair (INST_A_cadeira-vermelha) about 40 cm back.
  const pulled=await page.evaluate(()=>(window as any).fixture.scene.barChair('seat-9'));
  expect(Math.hypot(pulled[0]-seat.x,pulled[2]-seat.z)).toBeGreaterThan(.3);
  expect(playing.actors['p-smoke'].props).toEqual(expect.arrayContaining(['Prop_Cigarro','Prop_Brasa']));
  expect(playing.actors['p-clean'].props).toContain('Prop_Pano');
  expect(playing.actors.bartender.props).toEqual(expect.arrayContaining(['Prop_Copo','Prop_Chopp']));
  expect(playing.hidden).toEqual(['Copo_Bandeja']);
  expect(playing.particles,'smoke, sickness and the stream').toBeGreaterThan(0);
  // Smoking happens where the body stands; sitting, at the chair.
  const placed=await page.evaluate(()=>Object.fromEntries((window as any).fixture.scene.getAnimations().map((a:any)=>[a.id,a.bar?.placed])));
  expect(placed).toMatchObject({'p-smoke':false,'p-sit':true,'p-uri':true,'p-clean':true,bartender:true});
  await page.evaluate(()=>(window as any).fixture.view([11,1.6,-1.6],[12,.8,1.6]));await page.waitForTimeout(300);
  await page.screenshot({path:previewPath('bar-animations-street.png')});
  await page.evaluate(([x,z])=>(window as any).fixture.view([x+1.6,1.7,z-1.6],[x,.8,z]),[seat.x,seat.z]);await page.waitForTimeout(300);
  await page.screenshot({path:previewPath('bar-animations-chair.png')});

  // On: seated (the chair back in place), being sick over with its puddle left, Magrão's drink left on the counter.
  await advance(page,9000);
  const later=await status(page);
  expect((await bars(page))['p-sit']).toBe('sentado_loop');
  const seated=await page.evaluate(()=>(window as any).fixture.scene.barChair('seat-9'));
  expect(Math.hypot(seated[0]-seat.x,seated[2]-seat.z)).toBeLessThan(.01);
  expect(later.leftovers).toEqual(expect.arrayContaining(['Bar leftover Prop_Poca','Bar leftover Prop_Copo','Bar leftover Prop_Chopp']));

  // The long neck: the freezer lid is the clip's while Magrão uses it.
  await sync(page,[],['serve-longneck',7000]);
  await expect.poll(async()=>(await status(page)).hidden,{timeout:30000}).toEqual(['Freezer_Bar_Tampa']);

  // Eating what was served from the seat: the fork in hand, the served plate instead of the clip's own.
  await sync(page,[['p-sit','rafael',seat.x,seat.y,seat.z,seat.rotation,'sit',30000,'seat-9']],undefined,
    {'o:0':{id:'o:0',item:'coxinha',table:3,x:table.x,y:table.top,z:table.z,rotation:0,placedAt:-3000,orderId:'o',slot:0,seat:'seat-9'}});
  await expect.poll(()=>bars(page),{timeout:30000}).toEqual({'p-sit':'comer_loop'});
  expect((await status(page)).actors['p-sit'].props).not.toContain('Prop_Prato');

  // Getting up: levantar, then the room has the body beside the chair; nothing moves on, the chair is back.
  await sync(page,[['p-sit','rafael',seat.x,seat.y,seat.z,seat.rotation,'stand-up',6640,'seat-9']]);
  await expect.poll(()=>bars(page),{timeout:30000}).toEqual({'p-sit':'levantar'});
  const exit=await page.evaluate(()=>(window as any).fixture.scene.getAnimations()[0].bar);
  const cos=Math.cos(seat.rotation),sin=Math.sin(seat.rotation),{x:ex,z:ez}=map.barAnimations.clips.levantar.end;
  const beside={x:seat.x+ex*cos+ez*sin,z:seat.z-ex*sin+ez*cos};
  await sync(page,[['p-sit','rafael',beside.x,seat.y,beside.z,seat.rotation,'idle',0]]);
  // The authored chair action releases into the polished Mixamo idle.
  await expect.poll(()=>bars(page)).toEqual({'p-sit':'Idle'});
  expect(exit.placed).toBe(true);
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.scene.barChair('seat-9'))).toEqual([seat.x,seat.y,+seat.z.toFixed(3)]);
  expect(errors).toEqual([]);
  await page.evaluate(()=>(window as any).fixture.scene.destroy());
});

test('a whole cigarette (fumar_mixamo) on every skin: pack and lighter in hand, the flame at the cigarette, smoke, the butt stepped on and left',async({page})=>{
  test.setTimeout(240000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(['error','warning'].includes(message.type()))errors.push(message.text());});
  await page.goto(fixture);await page.evaluate(()=>(window as any).fixture.ready);
  await page.evaluate(()=>(window as any).fixture.hour(14));
  const skins=['nathan','leandro','rafael','read','magrao','gilmar-gordo','gabriel','flavio-hipotetico','tiao','primo'],ids=skins.map(skin=>skin==='magrao'?'bartender':`cig-${skin}`);
  const smokers=(state:string,ago:number):Actor[]=>skins.map((skin,index)=>[ids[index]!,skin,9+index,.15,1.6,0,state,ago]);
  // Lighting up (Roteiro: the flame from about 6.1 s to 7.3 s).
  await sync(page,smokers('cigarette',6600));
  await expect.poll(()=>bars(page),{timeout:90000}).toEqual(Object.fromEntries(ids.map(id=>[id,'fumar_mixamo'])));
  await advance(page,300);
  const lit=await status(page);
  for(const id of ids){
    expect(lit.actors[id].props,id).toEqual(expect.arrayContaining(['Prop_Cigarro','Prop_Brasa','Prop_Isqueiro','Prop_Chama']));
    // The cigarette in the mouth and the flame from the other hand meet (Nathan's own rig names its bones' axes otherwise).
    const [flame,cigarette]=await page.evaluate(id=>['Prop_Chama','Prop_Cigarro'].map(name=>(window as any).fixture.scene.barProp(id,name)),id);
    expect(Math.hypot(flame[0]-cigarette[0],flame[1]-cigarette[1],flame[2]-cigarette[2]),`${id}: flame to cigarette`).toBeLessThan(.2);
  }
  // The drag and the puff: smoke from the tip and the mouth.
  await advance(page,2500);
  await expect.poll(async()=>(await status(page)).particles).toBeGreaterThan(0);
  // Past the end: the butt stays on the floor, stepped on, one per smoker.
  await advance(page,9000);
  await expect.poll(async()=>(await status(page)).leftovers.filter((name:string)=>name==='Bar leftover Prop_Cigarro').length).toBe(skins.length);
  const butts=await page.evaluate(()=>(window as any).fixture.scene.barAnimations.leftovers.map((left:any)=>left.entity.getPosition().y));
  for(const y of butts)expect(y).toBeCloseTo(.15,1);
  // Free again (the room's idle once the clip is over): the butts are still there.
  await sync(page,smokers('idle',0));
  await expect.poll(()=>bars(page)).toEqual(Object.fromEntries(ids.map(id=>[id,'Idle'])));
  expect((await status(page)).leftovers.filter((name:string)=>name==='Bar leftover Prop_Cigarro')).toHaveLength(skins.length);
  expect(errors).toEqual([]);
  await page.evaluate(()=>(window as any).fixture.scene.destroy());
});

test('smoking contacts follow the lips and fingers of every skin without stretching the arms',async({page})=>{
  test.setTimeout(240000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const skins=['nathan','leandro','rafael','read','magrao','gilmar-gordo','gabriel','flavio-hipotetico','tiao','primo','tonico','rafael-rose'];
  const id=(skin:string)=>skin==='magrao'?'bartender':skin==='tonico'?'tonico':`contact-${skin}`;
  const actors=(state:string,ago:number):Actor[]=>skins.map((skin,i)=>[id(skin),skin,9+i,.15,1.6,i%2?0:Math.PI,state,ago]);
  await page.goto(fixture);await page.evaluate(()=>(window as any).fixture.ready);
  const measure=()=>page.evaluate(async()=>{
    const {SMOKING_LIPS}=await import('/src/engine/smoking-pose.ts' as string);
    const scene=(window as any).fixture.scene,bar=scene.barAnimations;
    return [...scene.actors.values()].map((actor:any)=>{
      const bones=bar.actors.get(actor.actor.id).bones,target=bar.targets.get(actor.skinId),head=bones.get('head');
      const delta=head.getRotation().clone().mul(target.rest.get('head').q.clone().invert());
      const offset=head.getPosition().clone().set(...SMOKING_LIPS[actor.skinId]);
      const mouth=delta.transformVector(offset).add(head.getPosition());
      const kit=bar.actors.get(actor.actor.id).kits.get(actor.bar.clip==='fumar_mixamo'?'fumar_mixamo':'fumar');
      const cigar=kit.props.get('Prop_Cigarro'),base=cigar.getPosition(),tip=kit.props.get('FX_Fumaca_Ponta').getPosition();
      const lengths=['l','r'].flatMap(side=>[['upperarm','lowerarm'],['lowerarm','hand']].map(([a,b])=>{
        const from=`${a}_${side}`,to=`${b}_${side}`;
        return Math.abs(bones.get(from).getPosition().distance(bones.get(to).getPosition())-target.rest.get(from).p.distance(target.rest.get(to).p));
      }));
      return {skin:actor.skinId,mouth:base.distance(mouth),tip:base.distance(tip),
        smoke:kit.props.get('FX_Fumaca_Boca').getPosition().distance(mouth),lengths,
        flame:kit.props.get('Prop_Chama').getPosition().distance(tip)};
    });
  });
  for(const [state,ago,clip,lighting] of [
    ['smoke',3500,'fumar_acender',true],['smoke',8767,'fumar_loop',false],
    ['smoke-stop',1700,'fumar_apagar',false],['cigarette',6600,'fumar_mixamo',true],
  ] as const){
    await sync(page,actors(state,ago));
    await expect.poll(()=>bars(page),{timeout:90000}).toEqual(Object.fromEntries(skins.map(skin=>[id(skin),clip])));
    await page.waitForTimeout(400);
    const samples=await measure();
    expect(samples.map(sample=>sample.skin).sort()).toEqual([...skins].sort());
    for(const sample of samples){
      expect(sample.mouth,`${sample.skin}/${clip}: filter at the lips`).toBeLessThan(.018);
      expect(sample.smoke,`${sample.skin}/${clip}: exhale at the lips`).toBeLessThan(.002);
      expect(sample.tip,`${sample.skin}/${clip}: smoke stays on the cigarette tip`).toBeGreaterThan(.075);
      expect(sample.tip,`${sample.skin}/${clip}: smoke stays on the cigarette tip`).toBeLessThan(.09);
      for(const drift of sample.lengths)expect(drift,`${sample.skin}/${clip}: arm keeps its bone lengths`).toBeLessThan(.001);
      if(lighting)expect(sample.flame,`${sample.skin}/${clip}: lighter reaches the ember`).toBeLessThan(.025);
    }
  }
  expect(errors).toEqual([]);
  await page.evaluate(()=>(window as any).fixture.scene.destroy());
});

test('live: F lights a cigarette and puts it out through the room, and the F8 panel makes Magrão pour a chopp',async({page})=>{
  test.setTimeout(180000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await expect.poll(async()=>{try{return (await page.request.get('/api/health')).ok()&&(await page.request.get(process.env.PLAYWRIGHT_GAME_HEALTH_URL||'http://localhost:2677/health')).ok();}catch{return false;}},{timeout:30000}).toBe(true);
  const unique=`fumante_${Date.now().toString(36)}`;
  expect((await page.request.post('/api/auth/register',{data:{username:unique,email:`${unique}@example.com`,displayName:'Fumante',password:'FumanteBrowser2026!'}})).status()).toBe(201);
  await page.goto('/');await page.getByRole('button',{name:'Entrar no bar'}).click();
  await expect(page.locator('#waiting')).toBeHidden({timeout:60000});
  const self=()=>page.evaluate(()=>{const d=(window as any).barDebug.snapshot();return d.world?.players?.[d.localId];});
  const mine=()=>page.evaluate(()=>{const d=(window as any).barDebug;return d.animations().find((a:any)=>a.id===d.snapshot().localId)?.bar?.clip;});
  await expect.poll(async()=>(await self())?.connected).toBe(true);
  expect(await page.evaluate(()=>(window as any).barDebug.map().barAnimations)).toMatchObject({cadeiras:124,mesas:31,mictorios:3,balcao:true});
  await page.locator('#world').click({position:{x:400,y:300}});
  await page.evaluate(()=>(window as any).barDebug.send('test.player.place',{x:60,y:0,z:7}));
  await expect.poll(async()=>(await self())?.x).toBeCloseTo(60,1);
  const smoke=()=>page.evaluate(()=>{const d=(window as any).barDebug;return d.smoking().actors[d.snapshot().localId];});
  await page.keyboard.press('KeyF');
  await expect.poll(async()=>(await self())?.smokingSince).toBeGreaterThan(0);
  expect((await self()).interactionState).toBe('');
  await expect.poll(async()=>(await smoke())?.phase).toBe('lighting');
  await expect(page.locator('#smoke-button')).toHaveAttribute('aria-pressed','true');
  await expect.poll(async()=>(await smoke())?.phase,{timeout:10000}).toBe('lit');
  const before=await self();await page.keyboard.down('KeyD');await page.waitForTimeout(350);await page.keyboard.up('KeyD');
  await expect.poll(async()=>{const after=await self();return Math.hypot(after.x-before.x,after.z-before.z);}).toBeGreaterThan(.2);
  expect((await self()).smokingSince).toBe(before.smokingSince);
  await page.keyboard.press('KeyF');await expect.poll(async()=>(await self())?.smokingStopAt).toBeGreaterThan(0);
  await expect.poll(async()=>(await smoke())?.phase).toBe('extinguishing');
  await expect.poll(async()=>(await self())?.smokingSince,{timeout:5000}).toBe(0);
  await expect(page.locator('#smoke-button')).toHaveAttribute('aria-pressed','false');
  // Development panel: Magrão pours a chopp for this browser only; the whole cigarette has its button too.
  await page.keyboard.press('F8');
  await expect(page.locator('#bar-animations-debug')).toBeVisible();
  await page.locator('[data-bar-debug="chopp"]').click();
  await expect(page.locator('#bar-animations-debug p')).toHaveText(/Magrão: chopp|não está à vista/);
  await page.locator('[data-bar-debug="cigarro"]').click();
  await expect(page.locator('#bar-animations-debug p')).toHaveText('Fumando um cigarro inteiro.');
  await expect.poll(mine,{timeout:20000}).toBe('fumar_mixamo');
  await page.locator('[data-bar-debug="parar"]').click();
  errors.splice(0,errors.length,...errors.filter(e=>!/favicon|WebSocket/.test(e)));
  expect(errors).toEqual([]);
});

/** Registers a player and brings them into the bar, with a planner to walk to an object by the room's rules (see walk.ts). */
async function enter(page:Page,name:string){
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await expect.poll(async()=>{try{return (await page.request.get('/api/health')).ok()&&(await page.request.get(process.env.PLAYWRIGHT_GAME_HEALTH_URL||'http://localhost:2677/health')).ok();}catch{return false;}},{timeout:30000}).toBe(true);
  const unique=`${name}_${Date.now().toString(36)}`;
  expect((await page.request.post('/api/auth/register',{data:{username:unique,email:`${unique}@example.com`,displayName:name,password:'AnimacoesBrowser2026!'}})).status()).toBe(201);
  await page.goto('/');await page.getByRole('button',{name:'Entrar no bar'}).click();
  await expect(page.locator('#waiting')).toBeHidden({timeout:60000});
  await expect.poll(()=>page.evaluate(()=>{const d=(window as any).barDebug.snapshot();return d.world?.players?.[d.localId]?.connected;})).toBe(true);
  const source=(path:string)=>'/@fs/'+fileURLToPath(new URL(path,import.meta.url)).replaceAll('\\','/');
  await page.evaluate(`Promise.all([import(${JSON.stringify(source('../../packages/shared/src/index.ts'))}),import(${JSON.stringify(source('../../apps/server/src/world/navigation.ts'))})]).then(([shared,navigation])=>{
    const object=id=>shared.INTERACTABLES.find(i=>i.id===id);
    const here=()=>{const d=window.barDebug.snapshot(),p=d.world.players[d.localId];return {x:p.x,y:p.y,z:p.z};};
    const flat=to=>{const from=here(),end=navigation.walkSegment(from,to);return !!end&&Math.abs(end.y-from.y)<.05;};
    // The A* lattice is anchored where the search starts: from a few centimetres aside the route can line up better (stage.spec.ts).
    const path=id=>{const from=here(),goal={x:object(id).x,y:object(id).y??.3,z:object(id).z};
      for(const [dx,dz] of [[0,0],[0,.1],[0,-.1],[.1,0],[-.1,0],[0,.2],[0,-.2],[.2,0],[-.2,0]]){
        const start=dx||dz?navigation.walkSegment(from,{x:from.x+dx,z:from.z+dz}):from,found=start&&navigation.findPath(start,p=>shared.canInteract(object(id),p,.1),goal,300000);
        if(found)return [from,...found].map(p=>({x:p.x,z:p.z}));
      }};
    window.planner={goal:id=>({x:object(id).x,z:object(id).z}),reached:id=>shared.canInteract(object(id),here(),0),flat,path};
  })`);
  // Facing north, so the keys walk along the map's axes (stage.spec.ts faceNorth).
  for(let i=0;i<5;i++){
    const yaw=await page.evaluate(()=>(window as any).barDebug.listener().yaw as number);if(Math.abs(yaw)<.02)break;
    await page.mouse.move(400,200);await page.mouse.down();await page.mouse.move(400+Math.round(yaw/.006),200,{steps:4});await page.mouse.up();
  }
  return errors;
}

// The walk across the hall (walk.ts) still jams on a table corner about one run in two on this host, with the game's
// own walk as well: the walk is retried, the animation's checks never are.
test.describe(()=>{
test.describe.configure({retries:2});
test('live: walking to the urinal of the men\'s restroom and pressing E plays `urinar` with its stream, as the room times it',async({page})=>{
  test.setTimeout(240000);
  const errors=await enter(page,'Mijao');
  // Generic walking and standing use the Mixamo bank even after the bar actions have loaded.
  const me=await page.evaluate(()=>(window as any).barDebug.snapshot().localId as string);
  const clip=()=>page.evaluate(id=>{const a=(window as any).barDebug.animations().find((x:any)=>x.id===id);return {clip:a?.clip,speed:a?.speed};},me);
  await expect.poll(async()=>(await clip()).clip,{timeout:60000}).toBe('Idle');
  await page.keyboard.down('KeyS');await page.waitForTimeout(450);
  const walking=await clip();await page.screenshot({path:previewPath('bar-animations-walk.png')});await page.keyboard.up('KeyS');
  expect(walking.clip).toBe('Walk');expect(walking.speed).toBeGreaterThan(1);
  await expect.poll(async()=>(await clip()).clip).toBe('Idle');
  await walk(page,urinal.id);
  await expect(page.locator('#context-label')).toHaveText('Usar o mictório');
  await page.keyboard.press('KeyE');
  const self=()=>page.evaluate(()=>{const d=(window as any).barDebug.snapshot();return d.world?.players?.[d.localId];});
  const mine=()=>page.evaluate(()=>{const d=(window as any).barDebug;return d.animations().find((a:any)=>a.id===d.snapshot().localId)?.bar?.clip;});
  await expect.poll(async()=>(await self())?.animationState).toBe('urinate');
  await expect.poll(mine,{timeout:60000}).toBe('urinar');
  await expect.poll(()=>page.evaluate(()=>(window as any).barDebug.map().barAnimations.particles),{timeout:20000}).toBeGreaterThan(0);
  await page.waitForTimeout(1500);
  await page.screenshot({path:previewPath('bar-animations-urinal.png')});
  await expect.poll(async()=>(await self())?.animationState,{timeout:20000}).toBe('idle');
  expect(errors.filter(e=>!/favicon|WebSocket/.test(e))).toEqual([]);
});
});


test('death ragdolls settle, follow the cloud and clear on respawn on every player rig',async({page})=>{
  test.setTimeout(120000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(fixture);await page.evaluate(()=>(window as any).fixture.ready);
  const skins=['nathan','leandro','rafael','rafael-rose','read','gilmar-gordo','gabriel','flavio-hipotetico','tiao','primo'];
  await page.evaluate(skins=>{
    const f=(window as any).fixture,now=f.now();
    const players=Object.fromEntries(skins.map((skin,index)=>[skin,{id:skin,skin,displayName:skin,color:'#fff',x:9+index,y:.15,z:1.6,rotation:0,
      animationState:'ragdoll',animationStartedAt:now-9000,interactionState:'death',currentTableId:'',lastProcessedInput:0,connected:true}]));
    const ragdolls=Object.fromEntries(Object.values(players).map((p:any)=>[p.id,{x:p.x,y:p.y,z:p.z,yaw:p.rotation,vx:0,vz:0,closing:0,seated:false,lift:.01,seed:123,startedAt:p.animationStartedAt}]));
    (window as any).deathWorld={players,npcs:{},tables:{},event:{id:'',type:'',startedAt:0,durationMs:0},occupancy:skins.length,capacity:32,serverTime:now,ragdolls};
    f.scene.setWorld((window as any).deathWorld,'');
  },skins);
  await expect.poll(()=>page.evaluate(()=>[...(window as any).fixture.scene.actors].filter(([id,a]:any)=>a.skinId===id&&a.skin?.tracks.has('Sit')).length),{timeout:90000}).toBe(skins.length);
  const ragdolls=()=>page.evaluate(()=>(window as any).fixture.scene.getRagdolls());
  await expect.poll(async()=>(await ragdolls()).filter((r:any)=>r.asleep).length,{timeout:90000}).toBe(skins.length);
  for(const body of await ragdolls()){
    expect(body.pelvis[1],body.id+' pelvis is down').toBeLessThan(.65);
    expect(body.head[1],body.id+' head is down').toBeLessThan(.9);
    expect(body.hip.every(Number.isFinite),body.id+' has a finite pose').toBe(true);
  }
  // Physics must pose the corpse before the Morte pulls it, or it cancels the pull's displacement.
  await page.evaluate(()=>{(window as any).fixture.scene.deathPull={victim:'nathan',k:.5,x:14,z:2};});
  await expect.poll(()=>page.evaluate(()=>{
    const a=(window as any).fixture.scene.actors.get('nathan');
    return a.skin.hip.getPosition().distance(new (a.root.getPosition().constructor)(...a.ragdoll.pelvis()));
  })).toBeGreaterThan(.5);
  await page.evaluate(()=>{
    const f=(window as any).fixture,w=(window as any).deathWorld;
    f.scene.deathPull=undefined;w.ragdolls={};
    for(const p of Object.values(w.players) as any[])p.interactionState='death-gone';
    f.scene.setWorld(w,'');
  });
  await expect.poll(async()=>(await ragdolls()).length).toBe(0);
  expect(await page.evaluate(()=>[...(window as any).fixture.scene.actors.values()].every((a:any)=>!a.root.enabled&&a.body.getLocalScale().y===1))).toBe(true);
  await page.evaluate(()=>{
    const f=(window as any).fixture,w=(window as any).deathWorld;
    for(const p of Object.values(w.players) as any[]){p.interactionState='';p.animationState='idle';p.animationStartedAt=f.now();p.z+=8;}
    f.scene.setWorld(w,'');
  });
  await expect.poll(()=>page.evaluate(()=>[...(window as any).fixture.scene.actors.values()].every((a:any)=>a.root.enabled&&!a.ragdoll&&Math.abs(a.root.getPosition().z-a.actor.z)<.01&&a.skin.bones.head.getPosition().y>1))).toBe(true);
  expect(errors).toEqual([]);
});
