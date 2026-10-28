import {test,expect} from '@playwright/test';
import {fileURLToPath} from 'node:url';
import {DAY_NIGHT,gameHour} from '../../apps/web/src/engine/day-night';
import type {EnvironmentLighting} from '../../apps/web/src/engine/environment-lighting';
import {previewPath} from './preview-path';
type EnvironmentStatus=ReturnType<EnvironmentLighting['telemetry']>;
const fixture='/@fs/'+fileURLToPath(new URL('../fixtures/environment.html',import.meta.url)).replaceAll('\\','/');

test('the authored skewer cart has visible geometry below its fire and smoke FX',async({page})=>{
  await page.goto(fixture);await page.evaluate(()=>(window as any).fixture.ready);
  expect(await page.evaluate(()=>(window as any).fixture.scene.getMapStatus().cartRenders)).toBeGreaterThan(0);
  await page.evaluate(()=>(window as any).fixture.view([8.7,1.45,4.4],[8.7,.85,1.5]));
  await page.screenshot({path:'test-results/carrinho-espeto.png'});
  await page.evaluate(()=>(window as any).fixture.scene.destroy());
});

test('full map renders through daylight, dusk and night with correct light directions, shadows and border fog',async({page})=>{
  test.setTimeout(180000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto(fixture);await page.evaluate(()=>(window as any).fixture.ready);
  const status=():Promise<EnvironmentStatus>=>page.evaluate(()=>(window as any).fixture.scene.getEnvironmentStatus());
  const luminance=async()=>{
    const data:number[]=await page.evaluate(()=>(window as any).fixture.pixels());
    let sum=0;for(let i=0;i<data.length;i+=4)sum+=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];return sum/(data.length/4)/255;
  };
  await expect.poll(async()=>(await status()).sun?.enabled).toBe(true);
  await page.waitForTimeout(1000);const day=await status(),dayBrightness=await luminance();
  expect(day.hour).toBeCloseTo(12);expect(day.sun!.direction[1]).toBeLessThan(-.9);expect(day.sun!.cascades).toBe(2);
  expect(day.lamps.filter(l=>l.outside).every(l=>!l.enabled)).toBe(true);
  expect(day.lamps.filter(l=>!l.outside).every(l=>l.shadows&&l.direction[1]<-.99)).toBe(true);
  expect(day.lamps.filter(l=>l.street).length).toBe(12);
  expect(day.realtimeLocalShadows).toBe(0);
  await page.screenshot({path:previewPath('day-night-noon.png')});
  await page.evaluate(()=>(window as any).fixture.hour(18));await expect.poll(async()=>(await status()).hour).toBeCloseTo(18);
  await page.screenshot({path:previewPath('day-night-dusk.png')});
  await page.evaluate(()=>(window as any).fixture.hour(0));await expect.poll(async()=>(await status()).moon?.enabled).toBe(true);
  const night=await status(),nightBrightness=await luminance();expect(night.sun!.enabled).toBe(false);expect(night.moon!.direction[1]).toBeLessThan(-.9);
  expect(night.lamps.every(l=>l.enabled&&l.shadows)).toBe(true);expect(nightBrightness).toBeLessThan(dayBrightness);expect(nightBrightness).toBeGreaterThan(.04);
  await page.screenshot({path:previewPath('day-night-midnight.png')});
  await page.evaluate(()=>(window as any).fixture.view([10,2.4,-4.5],[15,1.2,-8]));
  await page.screenshot({path:previewPath('day-night-interior.png')});
  const moonBefore=(await status()).moon!.intensity;
  await page.evaluate(()=>(window as any).fixture.event('BLACKOUT'));await expect.poll(async()=>(await status()).electrical,{timeout:20000}).toBeLessThan(.04);
  expect((await status()).moon!.intensity).toBeCloseTo(moonBefore);expect((await status()).lamps.every(l=>l.intensity<.2)).toBe(true);
  await page.evaluate(()=>(window as any).fixture.event('PARTY'));await expect.poll(async()=>(await status()).party,{timeout:20000}).toBeGreaterThan(.95);
  await page.evaluate(()=>(window as any).fixture.event(''));await expect.poll(async()=>(await status()).electrical,{timeout:20000}).toBeGreaterThan(.98);
  await page.evaluate(()=>{(window as any).fixture.hour(12);(window as any).fixture.view([-101,4,-13],[-112,1,-13]);});
  await page.screenshot({path:previewPath('day-night-border-fog.png')});
  const rim:number[]=await page.evaluate(()=>(window as any).fixture.pixels());
  for(let channel=0;channel<3;channel++)expect(Math.abs(rim[channel]-rim[rim.length-4+channel])).toBeLessThan(3);
  expect((await status()).edgeFogWidth).toBe(8);
  // The sky must respect the depth-written alpha aperture used by the real YouTube TV.
  await page.evaluate(()=>{const f=(window as any).fixture;f.view([7.3,2.33,-10.3],[7.3,2.33,-11.447]);f.scene.showTelevision('tv-hall',true);});
  const aperture:number[]=await page.evaluate(()=>(window as any).fixture.pixels());
  expect(aperture[(16*48+24)*4+3]).toBe(0);
  await page.evaluate(()=>(window as any).fixture.scene.showTelevision('tv-hall',false));
  const opaque:number[]=await page.evaluate(()=>(window as any).fixture.pixels());expect(opaque[(16*48+24)*4+3]).toBe(255);
  expect(errors).toEqual([]);
  await page.evaluate(()=>(window as any).fixture.scene.destroy());
});

test('the lit facade keeps its colours, the map jukebox lights up with the video and the job objective is drawn',async({page})=>{
  test.setTimeout(180000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto(fixture);await page.evaluate(()=>(window as any).fixture.ready);
  const status=():Promise<EnvironmentStatus>=>page.evaluate(()=>(window as any).fixture.scene.getEnvironmentStatus());
  const block=async()=>{
    const data:number[]=await page.evaluate(()=>(window as any).fixture.pixels());let r=0,g=0,b=0,n=0;
    for(let y=12;y<20;y++)for(let x=20;x<28;x++){const i=(y*48+x)*4;r+=data[i]!;g+=data[i+1]!;b+=data[i+2]!;n++;}
    return [r/n,g/n,b/n];
  };
  // The facade (13_fachada.py): emission held at the authored colour on screen, exposure included; the halo at night.
  await expect.poll(async()=>(await status()).facade.materials.length).toBe(3);
  const noon=await status();
  expect(noon.facade.materials.map(m=>m.name).sort()).toEqual(['Letreiro_Highland','Neon_Magenta','Placa_Highland']);
  for(const material of noon.facade.materials)expect(material.intensity*noon.exposure).toBeCloseTo(1,2);
  expect(noon.facade.light).toMatchObject({type:'omni',enabled:false});
  await page.evaluate(()=>{const f=(window as any).fixture;f.hour(0);f.view([-4.6,5.2,1.4],[3.08,5.05,-3.08]);});
  await expect.poll(async()=>(await status()).facade.light?.enabled).toBe(true);
  const sign=await block();expect(Math.max(...sign)).toBeGreaterThan(110);
  await page.screenshot({path:previewPath('facade-night.png')});
  await page.evaluate(()=>{const f=(window as any).fixture;f.hour(12);f.view([-4.5,3.2,9],[6,2.6,-3]);});
  await page.waitForTimeout(800);await page.screenshot({path:previewPath('facade-day.png')});
  // The jukebox is the map's: dark while off, lit with the colours of the video while it plays, dimmed when paused.
  const jukebox=()=>page.evaluate(()=>(window as any).fixture.scene.getMapStatus().jukebox);
  const play=(status:string)=>page.evaluate(status=>{const f=(window as any).fixture,now=f.now();
    f.scene.setWorld({players:{},npcs:{},tables:{},event:{id:'',type:'',startedAt:0,durationMs:0},occupancy:0,capacity:32,serverTime:now,
      jukeboxes:{jukebox:{id:'jukebox',videoId:'M7lc1UVf-VE',status,position:30,updatedAt:now,updatedBy:'fixture',revision:1}}},'');},status);
  await page.evaluate(()=>{const f=(window as any).fixture;f.hour(21);f.view([15.7,1.35,-8.9],[15.7,1.05,-11.29]);});
  await expect.poll(async()=>(await status()).facade.light?.enabled).toBe(true);
  expect(await jukebox()).toMatchObject({lit:false,light:false});
  const off=await block();await page.screenshot({path:previewPath('jukebox-off.png')});
  await play('playing');
  await expect.poll(async()=>(await jukebox()).palette,{timeout:20000}).toBe(true);
  await expect.poll(async()=>(await jukebox()).level,{timeout:10000}).toBeGreaterThan(.97);
  const lit=await jukebox();expect(lit).toMatchObject({lit:true,light:true,videoId:'M7lc1UVf-VE'});
  expect(lit.colors.some((c:string)=>c!=='#ffad47'),'the video colours replace the idle amber').toBe(true);
  const on=await block();expect(on.reduce((a,b)=>a+b)).toBeGreaterThan(off.reduce((a,b)=>a+b)+12);
  await page.screenshot({path:previewPath('jukebox-playing.png')});
  // The colours run along the tubes with the song.
  await page.evaluate(()=>(window as any).fixture.advance(1300));await page.waitForTimeout(300);
  await page.screenshot({path:previewPath('jukebox-playing-2.png')});
  await play('paused');await expect.poll(async()=>(await jukebox()).level,{timeout:10000}).toBeLessThan(.33);
  await play('off');await expect.poll(async()=>(await jukebox()).lit,{timeout:10000}).toBe(false);
  // The worker's objective: a marker on the station only while one is set, projected for the on-screen blip.
  await page.evaluate(()=>{const f=(window as any).fixture,now=f.now();
    f.scene.setWorld({players:{me:{id:'me',displayName:'Eu',color:'#fff',skin:'nathan',x:10.6,y:.3,z:-5.9,rotation:0,animationState:'idle',animationStartedAt:0,interactionState:'',currentTableId:'',lastProcessedInput:0,connected:true}},
      npcs:{},tables:{},event:{id:'',type:'',startedAt:0,durationMs:0},occupancy:1,capacity:32,serverTime:now},'me');
    f.view([10.6,2.5,-4.4],[10.6,.9,-7.6]);f.scene.setObjective({x:10.6,y:.3,z:-7.6,top:1.078});});
  await expect.poll(()=>page.evaluate(()=>(window as any).fixture.scene.projectObjective()?.onScreen)).toBe(true);
  const blip=await page.evaluate(()=>(window as any).fixture.scene.projectObjective());expect(blip.distance).toBeCloseTo(1.7,1);
  await page.screenshot({path:previewPath('job-objective.png')});
  await page.evaluate(()=>(window as any).fixture.scene.setObjective(null));
  expect(await page.evaluate(()=>(window as any).fixture.scene.projectObjective())).toBeNull();
  // The next task moves the same marker. A marker rebuilt here drew the ring mesh freed with the old one: every
  // frame threw and the view froze (pixels() waits for a finished frame).
  await page.evaluate(()=>(window as any).fixture.scene.setObjective({x:13.2,y:.3,z:-7.6,top:1.078}));
  await page.evaluate(()=>(window as any).fixture.pixels());
  expect(await page.evaluate(()=>(window as any).fixture.scene.getMapStatus().objective)).toMatchObject({x:13.2,z:-7.6,visible:true});
  expect(await page.evaluate(()=>(window as any).fixture.scene.projectObjective())).not.toBeNull();
  await page.evaluate(()=>(window as any).fixture.scene.setObjective(null));
  expect(await page.evaluate(()=>(window as any).fixture.scene.projectObjective())).toBeNull();
  expect(errors).toEqual([]);
  await page.evaluate(()=>(window as any).fixture.scene.destroy());
});

test('every stage light follows the telão\'s video, its screen opens for the player, and blips mark the stage entry and the telão only in the backyard',async({page})=>{
  test.setTimeout(180000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto(fixture);await page.evaluate(()=>(window as any).fixture.ready);
  const stage=()=>page.evaluate(()=>(window as any).fixture.scene.getMapStatus().stage);
  const telao=(status:string|undefined,players:Record<string,unknown>={})=>page.evaluate(([status,players])=>{const f=(window as any).fixture,now=f.now();
    f.scene.setWorld({players,npcs:{},tables:{},event:{id:'',type:'',startedAt:0,durationMs:0},occupancy:0,capacity:32,serverTime:now,jukeboxes:{},
      televisions:status?{telao:{id:'telao',videoId:'M7lc1UVf-VE',status,position:30,updatedAt:now,updatedBy:'fixture',revision:1}}:{}},Object.keys(players)[0]??'');},[status,players] as const);
  const standby=()=>page.evaluate(()=>(window as any).fixture.scene.app.root.findByName('Telao_Tela')?.enabled);
  await page.evaluate(()=>{const f=(window as any).fixture;f.hour(21);f.view([26.65,2.3,-17.2],[26.65,2.5,-25]);});
  // Off: a dim glow of the stage's own magenta, and the map's standby art on the screen.
  await telao(undefined);
  await expect.poll(stage).toMatchObject({playing:false,light:true,colors:['#ff47c2','#ff47c2','#ff47c2'],show:0});
  // The white lights keep their own white: the truss's spots (the bar's bulbs over the deck) and the front wash.
  const idle=await stage();expect(idle.lamps).toBeGreaterThan(0);expect(idle.front).toBeTruthy();expect(idle.washes).toHaveLength(1);
  expect(await standby()).toBe(true);
  await page.screenshot({path:previewPath('stage-idle.png')});
  // Playing: the lenses, the LED strip, the backlight, the truss's spots and the washes take the video's colours.
  await telao('playing');
  await expect.poll(async()=>(await stage()).palette,{timeout:20000}).toBe(true);
  await expect.poll(async()=>(await stage()).level,{timeout:10000}).toBeGreaterThan(.97);
  await expect.poll(async()=>(await stage()).show,{timeout:10000}).toBeGreaterThan(.97);
  const lit=await stage();expect(lit).toMatchObject({playing:true,videoId:'M7lc1UVf-VE'});
  expect(lit.colors.some((c:string)=>c!=='#ff47c2'),'the video colours replace the idle magenta').toBe(true);
  expect(lit.front,'the front wash leaves its white').not.toBe(idle.front);expect(lit.washes[0],'and so does the party wash').not.toBe(idle.washes[0]);
  // The YouTube player shows through the screen (the controller opens it): the standby art steps aside meanwhile.
  await page.evaluate(()=>(window as any).fixture.scene.showTelevision('telao',true));expect(await standby()).toBe(false);
  await page.screenshot({path:previewPath('stage-playing.png')});
  await page.evaluate(()=>(window as any).fixture.scene.showTelevision('telao',false));expect(await standby()).toBe(true);
  await telao('paused');await expect.poll(async()=>(await stage()).level,{timeout:10000}).toBeLessThan(.37);
  // The blips, for a player in the backyard: the entry at the foot of the stage's steps, and the telão's control in the
  // middle of the stage's front edge. Never while up on the stage, nor anywhere outside the backyard.
  const me={id:'me',displayName:'Eu',color:'#fff',skin:'nathan',x:22,y:.3,z:-16,rotation:0,animationState:'idle',animationStartedAt:0,interactionState:'',currentTableId:'',lastProcessedInput:0,connected:true};
  await telao(undefined,{me});
  // Off, the white lights are back to their own white.
  await expect.poll(async()=>(await stage()).show,{timeout:10000}).toBe(0);
  expect(await stage()).toMatchObject({front:idle.front,washes:idle.washes});
  const blips=()=>page.evaluate(()=>(window as any).fixture.scene.getMapStatus().stageBlips);
  const projected=(id:string)=>page.evaluate(id=>(window as any).fixture.scene.projectStageBlip(id),id);
  await page.evaluate(()=>{const f=(window as any).fixture;f.scene.setEnabled(true);f.view([24.5,2.8,-16.2],[20.6,1.2,-22.8]);});
  await expect.poll(async()=>(await projected('entry'))?.onScreen).toBe(true);
  expect(await blips()).toMatchObject({entry:{visible:true,y:.3},telao:{visible:true,x:26.65,y:.3}});
  await page.screenshot({path:previewPath('stage-blip.png')});
  await page.evaluate(()=>(window as any).fixture.view([25.2,2.6,-15.6],[26.65,.8,-21.1]));
  await expect.poll(async()=>(await projected('telao'))?.onScreen).toBe(true);
  await page.screenshot({path:previewPath('telao-blip.png')});
  // In the hall, 15 m from the stage, neither shows. The local avatar follows prediction, not the snapshot.
  await page.evaluate(()=>(window as any).fixture.scene.setLocal({x:14,y:.3,z:-9}));
  await expect.poll(async()=>[await projected('entry'),await projected('telao')]).toEqual([null,null]);
  expect(await blips()).toMatchObject({entry:{visible:false},telao:{visible:false}});
  await page.evaluate(()=>(window as any).fixture.scene.setLocal({x:22,y:.3,z:-16}));
  await expect.poll(async()=>(await projected('telao'))?.onScreen).toBe(true);
  await page.evaluate(()=>(window as any).fixture.scene.setLocal({x:26,y:.9,z:-23.5}));
  await expect.poll(async()=>[await projected('entry'),await projected('telao')]).toEqual([null,null]);
  expect(errors).toEqual([]);
  await page.evaluate(()=>(window as any).fixture.scene.destroy());
});

test('the stage musicians: every spot takes, starts, loops and stops on any skin, with its instrument in hand, also for late joiners',async({page})=>{
  test.setTimeout(240000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto(fixture);await page.evaluate(()=>(window as any).fixture.ready);
  // One player per spot, each with another skin; `shows`: the phase each spot's room state is in and how long ago it began.
  const SKINS={violao:'nathan',cavaquinho:'leandro',bateria:'rafael',vocal:'gilmar-gordo'} as const;
  const sync=(shows:Record<string,[string,number]>,extra:Record<string,unknown>={})=>page.evaluate(([shows,skins,extra])=>{
    const f=(window as any).fixture,now=f.now(),players:Record<string,unknown>={...extra},musicians:Record<string,unknown>={};
    const spots:Record<string,[number,number,number,number]>={violao:[24.079788,.9,-23.300556,198],cavaquinho:[29.238754,.9,-23.35762,162],bateria:[29.451313,.906,-24.998857,-8],vocal:[26.65,.9,-22.87,0]};
    for(const [spot,[x,y,z,yaw]] of Object.entries(spots)){
      const id=`musico-${spot}`,show=shows[spot];
      players[id]={id,displayName:spot,color:'#fff',skin:(skins as any)[spot],x,y,z,rotation:yaw*Math.PI/180,animationState:show?'stage':'idle',animationStartedAt:now,
        interactionState:show?`stage-${spot}`:'',currentTableId:'',lastProcessedInput:0,connected:true};
      musicians[spot]={id:spot,playerId:show?id:'',phase:show?.[0]??'',startedAt:show?now-show[1]:0,stopping:false};
    }
    f.scene.setWorld({players,npcs:{},tables:{},event:{id:'',type:'',startedAt:0,durationMs:0},occupancy:0,capacity:32,serverTime:now,musicians},'');
  },[shows,SKINS,extra] as const);
  const animations=()=>page.evaluate(()=>Object.fromEntries((window as any).fixture.scene.getAnimations().map((a:any)=>[a.id,a])));
  const instruments=()=>page.evaluate(()=>(window as any).fixture.scene.getMapStatus().musicians);
  const clips=async()=>Object.fromEntries(Object.entries(await animations()).map(([id,a]:[string,any])=>[id,a.clip]));
  const clipsOf=(phase:string)=>Object.fromEntries(Object.keys(SKINS).map(spot=>[`musico-${spot}`,`Palco ${spot} ${phase}`]));
  await page.evaluate(()=>{const f=(window as any).fixture;f.hour(21);f.view([26.65,2.4,-17.6],[26.65,1.5,-24]);});
  // Nobody on the stage: every instrument on its stand.
  await sync({});
  await expect.poll(async()=>Object.values(await instruments()??{}).map((s:any)=>s.instrument)).toEqual([true,true,true,null]);
  // Taking the spots: the take clip, converted for each skin; the map's instrument hides while its copy is played.
  const take=Object.fromEntries(Object.keys(SKINS).map(spot=>[spot,['entrando',0] as [string,number]]));
  await sync(take);
  await expect.poll(clips,{timeout:60000}).toEqual(clipsOf('entrando'));
  expect(await instruments()).toMatchObject({violao:{instrument:false,props:true,propState:'Palco violao entrando'},cavaquinho:{instrument:false,props:true},
    bateria:{instrument:false,props:true},vocal:{instrument:null,props:null}});
  // Each musician stays on its spot (the clips move the body), facing it.
  for(const [id,a] of Object.entries(await animations()) as [string,any][])expect(a.musician,`${id} on its spot`).toMatchObject({spot:id.slice(7),phase:'entrando'});
  // The take and start clips run into the loop without a word from the room.
  await page.evaluate(()=>(window as any).fixture.advance(8000));
  await expect.poll(clips).toEqual(clipsOf('loop'));
  // The clips carried the hips from the spot to the stools and the drum throne (the avatar itself stays on the spot);
  // the singer stands at the microphone.
  // (Polled: the pose follows the clip on the next frame.)
  const away=async(spot:string)=>{const {root,hip}=(await animations())[`musico-${spot}`].musician;return Math.hypot(hip[0]-root[0],hip[2]-root[2]);};
  for(const spot of ['violao','cavaquinho','bateria'])await expect.poll(()=>away(spot),{message:`${spot} on the stool`}).toBeGreaterThan(.3);
  await expect.poll(()=>away('vocal')).toBeLessThan(.2);
  expect((await animations())['musico-vocal'].musician.hip[1]-.9).toBeGreaterThan(.8);
  await page.waitForTimeout(500);
  await page.screenshot({path:previewPath('stage-musicians.png')});
  // Stopping: the stop clip blends in from the loop; when it ends the musicians stand idle and the instruments are back.
  await sync(Object.fromEntries(Object.keys(SKINS).map(spot=>[spot,['saindo',0] as [string,number]])));
  await expect.poll(clips).toEqual(clipsOf('saindo'));
  await page.evaluate(()=>(window as any).fixture.advance(6000));
  await expect.poll(clips).toEqual(Object.fromEntries(Object.keys(SKINS).map(spot=>[`musico-${spot}`,'Idle'])));
  expect(Object.values(await instruments()).map((s:any)=>[s.instrument,s.props])).toEqual([[true,false],[true,false],[true,false],[null,null]]);
  // Somebody arriving in the middle of a show sees it already playing: a new avatar, in the loop for 7 s.
  await page.evaluate(()=>{const f=(window as any).fixture;f.scene.setWorld({players:{},npcs:{},tables:{},event:{id:'',type:'',startedAt:0,durationMs:0},occupancy:0,capacity:32,serverTime:f.now()},'');});
  await expect.poll(async()=>Object.keys(await animations()).length).toBe(0);
  await sync({violao:['loop',7000]});
  await expect.poll(clips).toMatchObject({'musico-violao':'Palco violao loop'});
  const late=(await animations())['musico-violao'];
  expect(Math.abs(late.time-7%4.8)).toBeLessThan(1.5);
  expect((await instruments()).violao).toMatchObject({instrument:false,props:true,propState:'Palco violao loop'});
  await page.screenshot({path:previewPath('stage-musician-late.png')});
  expect(errors).toEqual([]);
  await page.evaluate(()=>(window as any).fixture.scene.destroy());
});

test('the live game follows the server clock and keeps the cycle when returning to the lobby',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  expect((await page.request.post('/api/auth/login',{data:{email:'jogador2@bar.local',password:process.env.DEMO_PASSWORD||'ButecoDemo2026!'}})).ok()).toBe(true);
  await page.goto('/');await page.getByRole('button',{name:'Entrar no bar'}).click();
  await expect(page.locator('#waiting')).toBeHidden({timeout:60000});
  await expect.poll(()=>page.evaluate(()=>!!(window as any).barDebug.snapshot().world?.serverTime)).toBe(true);
  const {world,hour}=await page.evaluate(()=>({world:(window as any).barDebug.snapshot().world,hour:(window as any).barDebug.environment().hour}));
  // The 12.5 MB neighbourhood can briefly delay the first rendered sample behind the latest world packet.
  expect(Math.abs(hour-gameHour(world.serverTime))).toBeLessThan(.06);
  const before=await page.evaluate(()=>({hour:(window as any).barDebug.environment().hour,time:Date.now()}));
  await page.getByRole('button',{name:'Sua conta',exact:true}).click();await page.locator('#modal [data-action="leave"]').click();
  await expect(page.locator('#lobby')).toBeVisible();
  const after=await page.evaluate(()=>({hour:(window as any).barDebug.environment().hour,time:Date.now()}));
  const expected=(before.hour+(after.time-before.time)/DAY_NIGHT.durationMs*24)%24,difference=Math.abs(after.hour-expected);
  expect(Math.min(difference,24-difference)).toBeLessThan(.03);
  expect(errors).toEqual([]);
});
