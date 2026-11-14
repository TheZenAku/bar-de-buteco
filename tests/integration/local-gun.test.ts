import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GUN,NO_GUN,pelletDirections,shotSeed,testArsenal,weaponStats,type GunState,type ShotTarget,type Vec3,type WorldRay} from '@bar/shared';
import {LocalGun,type GunControls,type GunSense} from '../../apps/web/src/weapons/local-gun';

const OPEN:WorldRay=()=>undefined;
const HOLD:GunControls={trigger:true,ads:false,breath:false};
const IDLE:GunControls={trigger:false,ads:false,breath:false};
const AIM:GunControls={trigger:false,ads:true,breath:false};

test('only equipped weapons can be selected',()=>{
  const gun=new LocalGun('eu');
  gun.setArsenal(testArsenal(false));
  gun.reconcile({...NO_GUN,on:true},0,0,0);
  assert.equal(gun.select('pistola'),false);
  const equipped=testArsenal(false);equipped.weapons.find(item=>item.id==='pistola')!.equipped=true;
  gun.setArsenal(equipped);
  assert.equal(gun.select('pistola'),true);
});

test('a manufactured weapon is shown and drawn with an empty magazine',()=>{
  const gun=new LocalGun('eu'),arsenal={...testArsenal(),test:false,infinite:false,ammo:{}};
  gun.setArsenal(arsenal);
  gun.reconcile({...NO_GUN,on:true},0,0,0);
  assert.equal(gun.magOf('pistola'),undefined);
  assert.equal(gun.select('pistola'),true);
  gun.update(1/60,IDLE,{now:1000,origin:[0,1.6,-2],forward:[0,0,1],feet:[0,0,0],skin:undefined,speed:0,sprinting:false,targets:()=>[],world:OPEN,seen:()=>({seen:0,ago:0}),free:true});
  assert.equal(gun.mag,0);
  assert.equal(gun.reserve,0);
});

/** A gun turned on with the test kit, standing at the origin looking along +Z, a camera just behind the right shoulder. */
function armed(weapon='pistola',targets:ShotTarget[]=[],world:WorldRay=OPEN){
  const gun=new LocalGun('eu');
  gun.setArsenal(testArsenal());
  gun.reconcile({...NO_GUN,on:true,shots:41},0,0,0);
  let now=1000,seq=0;
  const sense=(extra:Partial<GunSense>={}):GunSense=>({now,origin:[.4,1.6,-2.2],forward:[0,0,1],feet:[0,0,0],skin:'nathan',speed:0,sprinting:false,targets:()=>targets,world,
    seen:()=>({seen:5000,ago:30}),free:true,...extra});
  const frames=(ms:number,controls:GunControls,fps=60,extra:Partial<GunSense>={})=>{
    const out=[];const step=1000/fps;
    for(let t=0;t<ms-1e-9;t+=step){now+=step;out.push(gun.update(step/1000,controls,sense(extra)));}
    return out;
  };
  gun.select(weapon as never);
  const draw=frames(1000,IDLE);
  return {gun,frames,draw,sense,send:()=>gun.decorate(++seq),get now(){return now;},set now(value){now=value;},get seq(){return seq;}};
}

test('a draw takes the weapon\'s time, and the shot count carries on from the room\'s',()=>{
  const gun=new LocalGun('eu');
  gun.setArsenal(testArsenal());
  gun.reconcile({...NO_GUN,on:true,shots:41},0,0,0);
  assert.equal(gun.n,42,'The next shot follows the room\'s last');
  gun.select('fuzil');
  const sense:GunSense={now:2000,origin:[0,1.6,-2],forward:[0,0,1],feet:[0,0,0],skin:undefined,speed:0,sprinting:false,targets:()=>[],world:OPEN,seen:()=>({seen:0,ago:0}),free:true};
  const first=gun.update(1/60,IDLE,sense);
  assert.deepEqual(first.events,['draw']);
  assert.equal(first.weapon,'fuzil');
  const stats=weaponStats('fuzil');
  assert.equal(gun.ready(2000+stats.drawMs-1),false,'Not ready before the draw ends');
  assert.equal(gun.ready(2000+stats.drawMs),true);
  const early=gun.update(1/60,HOLD,{...sense,now:2100});
  assert.equal(early.shots.length,0,'Nothing fires while it is coming out');
});

test('semi fires one shot per press, and a press just early is kept and fired the moment the weapon allows',()=>{
  const g=armed('pistola');
  const interval=weaponStats('pistola').interval;
  const held=g.frames(500,HOLD);
  assert.equal(held.flatMap(frame=>frame.shots).length,1,'Holding a semi trigger fires once');
  g.frames(50,IDLE);
  const first=g.frames(16.7,HOLD,60)[0]!.shots[0]!;
  g.frames(16.7*3,IDLE);
  // Pressed again ~67 ms after: before the 158 ms interval, inside the buffer.
  const again=g.frames(300,HOLD).flatMap(frame=>frame.shots);
  assert.equal(again.length,1);
  assert.ok(Math.abs(again[0]!.at-first.at-interval)<1e-6,`Fired exactly one interval later (${again[0]!.at-first.at} vs ${interval})`);
});

test('an SMG holds its cadence to the millisecond at any frame rate, several shots in one frame when it must',()=>{
  const stats=weaponStats('submetralhadora');
  for(const fps of [12,20,30,60,144]){
    const g=armed('submetralhadora');
    const frames=g.frames(1000,HOLD,fps),shots=frames.flatMap(frame=>frame.shots);
    // 850 rpm: a shot at t=0 and then every 70.6 ms.
    assert.equal(shots.length,Math.floor(1000/stats.interval)+1,`${fps} FPS: ${shots.length} shots`);
    for(let i=1;i<shots.length;i++)assert.ok(Math.abs(shots[i]!.at-shots[i-1]!.at-stats.interval)<1e-6,'Each shot one interval after the last');
    if(fps<=12)assert.ok(frames.some(frame=>frame.shots.length>=2),'At 12 FPS some frames carry two shots');
    // On the wire: at most GUN.shotsPerInput per input, each claiming a cadence the room accepts.
    const sent=[];for(let i=0;i<10;i++){const input=g.send();if(input?.s)sent.push(...input.s);assert.ok((input?.s?.length??0)<=GUN.shotsPerInput);}
    assert.equal(sent.length,shots.length);
    for(const shot of sent.slice(1))assert.ok(shot.dt>=stats.interval-GUN.fireLeewayMs,`dt ${shot.dt}`);
    assert.deepEqual(sent.map(shot=>shot.n),shots.map(shot=>shot.n));
  }
});

test('every shot is the room\'s shot: its count seeds the spread, its ray is the camera\'s, its cone never narrower than allowed',()=>{
  const target:ShotTarget={id:'alvo',skin:'nathan',pose:{x:0,y:0,z:10,rotation:Math.PI}};
  const g=armed('fuzil',[target]);
  const at=(x:number,y:number,z:number):Vec3=>{const l=Math.hypot(x,y,z);return [x/l,y/l,z/l];};
  const forward=at(0-.4,1.25-1.6,10+2.2);
  g.frames(400,AIM,60,{forward});
  const shot=g.frames(16.7,{...HOLD,ads:true},60,{forward})[0]!.shots[0]!;
  const input=g.send()!,command=input.s![0]!;
  assert.equal(command.n,shot.n);
  assert.deepEqual(command.o,[.4,1.6,-2.2]);
  assert.ok(Math.abs(Math.hypot(...command.d)-1)<1e-9,'A unit direction');
  assert.equal(command.seen,5000);assert.equal(command.ago,30);
  const stats=weaponStats('fuzil');
  assert.ok(command.sp>=stats.spread.ads*.9&&command.sp<=.6);
  const dirs=pelletDirections(shotSeed('eu',command.n),command.d,command.sp,stats.pellets,stats.spread.pellet);
  assert.deepEqual(shot.pellets.map(p=>p.kind),['body']);
  assert.equal(shot.pellets[0]!.target,'alvo');
  // The room traces the same directions from the same seed.
  assert.equal(dirs.length,1);
  assert.equal(input.w,'fuzil');assert.equal(input.ads,true);assert.equal(typeof input.p,'number');
});

test('a shotgun traces each pellet, and the pump cycles between shots',()=>{
  const g=armed('escopeta');
  const frame=g.frames(16.7,HOLD).find(item=>item.shots.length)!;
  assert.equal(frame.shots[0]!.pellets.length,9);
  assert.equal(frame.cycle?.action,'pump');
  const stats=weaponStats('escopeta');
  assert.ok(frame.cycle!.duration<stats.interval);
});

test('an empty magazine clicks dry and reloads; a whole reload blocks the trigger until it ends',()=>{
  const g=armed('pistola');
  const stats=weaponStats('pistola');
  for(let i=0;i<stats.mag;i++){g.frames(16.7,HOLD);g.frames(200,IDLE);}
  assert.equal(g.gun.mag,0);
  const press=g.frames(16.7,HOLD)[0]!;
  assert.equal(press.dry,true);
  assert.ok(press.events.includes('reloadStart'));
  assert.equal(press.reload?.duration,(stats.reloadMs as {empty:number}).empty);
  const during=g.frames(500,HOLD).flatMap(frame=>frame.shots);
  assert.equal(during.length,0,'Nothing fires during a whole reload');
  g.frames((stats.reloadMs as {empty:number}).empty,IDLE);
  assert.equal(g.gun.mag,stats.mag);
  assert.equal(g.gun.reserve,Infinity,'The test kit never runs out');
  assert.equal(g.gun.requestReload(g.now),'','A full weapon does not reload, and says nothing');
  assert.equal(g.gun.reload,undefined);
});

test('a round-by-round reload counts its rounds in, and a press fires what is already in',()=>{
  const g=armed('revolver');
  const stats=weaponStats('revolver'),timing=stats.reloadMs as {start:number;each:number;end:number};
  for(let i=0;i<4;i++){g.frames(16.7,HOLD);g.frames(400,IDLE);}
  assert.equal(g.gun.mag,2);
  g.gun.requestReload(g.now);
  const r=g.send()!.r;
  g.frames(timing.start+timing.each*2+20,IDLE);
  assert.equal(g.gun.mag,4,'Two rounds in after the opening and two rounds');
  const shot=g.frames(16.7,HOLD).flatMap(frame=>frame.shots);
  assert.equal(shot.length,1,'The press interrupts and fires');
  assert.equal(g.gun.reload,undefined);
  assert.equal(g.gun.mag,3);
  assert.equal(r,1,'The reload key\'s count went up once');
});

test('the room\'s answers: rounds less the shots it has not seen, a refused draw, the system turned off',()=>{
  const g=armed('fuzil');
  g.send();
  const acked=g.seq;
  g.frames(16.7*12,HOLD);
  const fired=30-g.gun.mag;
  assert.ok(fired>=2);
  g.send();
  // The room has seen none of these shots yet: its magazine is still full.
  const room:GunState={...NO_GUN,on:true,w:'fuzil',mag:30,shots:41};
  g.gun.reconcile(room,acked,10_000,g.now);
  assert.equal(g.gun.mag,30-fired,'Prediction kept');
  // It took one fewer (a shot refused): the room wins.
  g.gun.reconcile({...room,mag:30-fired+1,shots:41+fired-1},g.seq,10_000,g.now);
  assert.equal(g.gun.mag,30-fired+1);
  // The room holstered it (a seat, a bike): the browser follows once the room has seen the draw.
  g.gun.reconcile({...room,w:''},g.seq,10_000,g.now);
  assert.equal(g.gun.drawn,'');
  g.gun.reconcile({...NO_GUN},g.seq,10_000,g.now);
  assert.equal(g.gun.on,false);
  assert.equal(g.gun.decorate(99),undefined,'Off: the input carries no gun');
});

test('switching holsters first, then draws; X brings the last one back',()=>{
  const g=armed('pistola');
  g.gun.select('fuzil');
  const frames=g.frames(800,IDLE),events=frames.flatMap(frame=>frame.events);
  assert.deepEqual(events,['holster','draw']);
  assert.equal(g.gun.drawn,'fuzil');
  g.gun.holsterToggle();g.frames(500,IDLE);
  assert.equal(g.gun.drawn,'');
  g.gun.holsterToggle();g.frames(50,IDLE);
  assert.equal(g.gun.drawn,'fuzil');
  g.gun.step(1);g.frames(800,IDLE);
  assert.equal(g.gun.drawn,'fuzil-ak','RB: the next in the wheel\'s order');
});

test('aiming eases in over the weapon\'s time, zooms, slows to a walk, and a scope steps its zoom',()=>{
  const g=armed('precisao');
  const stats=weaponStats('precisao',{mira:'luneta'});
  const frames=g.frames(stats.adsMs+50,AIM);
  assert.ok(frames[2]!.ads>0&&frames[2]!.ads<.2);
  assert.equal(frames.at(-1)!.ads,1);
  assert.equal(frames.at(-1)!.scoped,1);
  assert.ok(frames.flatMap(frame=>frame.events).includes('scopeIn'));
  g.frames(400,AIM);
  assert.ok(Math.abs(g.gun.zoom-8)<.01,`Zoom ${g.gun.zoom}`);
  assert.equal(g.gun.zoomStep(-1),true);g.frames(400,AIM);
  assert.ok(Math.abs(g.gun.zoom-4)<.01,'Out to 4x');
  assert.equal(g.gun.walking,true);
  assert.equal(g.send()!.ads,true);
});

test('held breath steadies the scope for a while, then it shakes',()=>{
  const g=armed('precisao');
  g.frames(800,AIM);
  const swaying=g.frames(400,AIM).map(()=>g.gun.view(g.now).sway);
  const free=Math.max(...swaying.map(s=>Math.hypot(s.x,s.y)));
  g.frames(1000,{...AIM,breath:true});
  const held=Math.hypot(g.gun.view(g.now).sway.x,g.gun.view(g.now).sway.y);
  assert.ok(held<free*.2,`Steady: ${held} vs ${free}`);
  g.frames(3000,{...AIM,breath:true});
  assert.equal(g.gun.view(g.now).breath.shaking,true,'Out of breath');
});

test('running holds the weapon low and it does not fire; a wall at the muzzle does the same',()=>{
  const g=armed('fuzil');
  const run=g.frames(200,IDLE,60,{sprinting:true,speed:6});
  assert.equal(run.at(-1)!.lowered,true);
  const wall:WorldRay=(from,to)=>({fraction:.5,normal:[0,0,-1],surface:'concreto',id:'parede'});
  const g2=armed('fuzil',[],wall);
  const pressed=g2.frames(300,HOLD);
  assert.equal(pressed.at(-1)!.lowered,true);
  assert.equal(pressed.flatMap(frame=>frame.shots).length,0);
});

test('a frozen tab does not dump a magazine when it comes back',()=>{
  const g=armed('submetralhadora');
  g.frames(100,HOLD);
  const before=g.gun.mag;
  const late=g.frames(800,HOLD,1.25)[0]!;
  assert.ok(late.shots.length<=3,`${late.shots.length} shots after an 800 ms frame`);
  assert.ok(before-g.gun.mag<=3);
});

test('hip shots turn the body to the aim for a moment',()=>{
  const g=armed('pistola');
  assert.equal(g.gun.facingAim(g.now),false);
  g.frames(16.7,HOLD);g.frames(100,IDLE);
  assert.equal(g.gun.facingAim(g.now),true);
  g.frames(GUN.facingHoldMs,IDLE);
  assert.equal(g.gun.facingAim(g.now),false);
  const vec:Vec3=[0,0,1];assert.ok(vec);
});
