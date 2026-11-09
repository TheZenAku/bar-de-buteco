import test from 'node:test';
import assert from 'node:assert/strict';
import {GUN,TICK_MS,WALK_SPEED,arsenalStats,bodyZones,eyeOf,normalize,testArsenal,withPart,type GunInput,type ShotCommand,type Vec3,type WeaponHitEvent,type WeaponShotEvent,type WorldRay} from '@bar/shared';
import {Player} from '../src/state.js';
import {WeaponDirector,type WeaponHost} from '../src/world/weapons.js';

const OPEN={x:60,z:7};
/** Somewhere to shoot at with nobody there. */
const AWAY:Vec3=[OPEN.x-20,1.6,OPEN.z+20];
const kit=testArsenal();
const stats=(id:string)=>arsenalStats(kit,id)!;

/** A room without a map (or with `world`): the director, bodies, a clock a tick at a time, and what the host was told. */
function room(world:WorldRay=()=>undefined){
  const players:Player[]=[],shots:WeaponShotEvent[]=[],hits:WeaponHitEvent[]=[],refusals:string[]=[],logs:[string,Record<string,unknown>][]=[];
  const kos:{id:string;vx:number;vz:number;hurt:number}[]=[];
  const rules={refusal:''};
  const host:WeaponHost={
    players:()=>players,refusal:()=>rules.refusal,
    hittable:target=>target.connected&&(!target.interactionState||target.interactionState==='stagger'),
    damage:(target,amount)=>{const ring=Math.min(target.hp,amount);target.hp-=ring;target.hpCore=Math.max(0,target.hpCore-(amount-ring));},
    knockout:(target,start,hurt)=>{target.interactionState='thrown';kos.push({id:target.id,vx:start.vx,vz:start.vz,hurt});},
    shot:(_shooter,event)=>shots.push(event),hit:(_shooter,_target,event)=>hits.push(event),
    refuse:(_player,message)=>refusals.push(message),log:(event,details)=>logs.push([event,details]),random:()=>.5,world,
  };
  const weapons=new WeaponDirector(host);
  let now=1_000_000;
  const add=(id:string,x:number,z:number,rotation=0)=>{const player=new Player().assign({id,x,y:0,z,rotation,connected:true,skin:'nathan',hp:100,hpCore:100});players.push(player);return player;};
  /** One tick: the inputs given (in order), then the room's step. */
  const tick=(inputs:[Player,GunInput][]=[])=>{now+=TICK_MS;for(const [player,gun] of inputs)weapons.input(player,{gun},now);weapons.step(now,players);};
  const wait=(ms:number)=>{for(let left=ms;left>0;left-=TICK_MS)tick();};
  /** The system on and a weapon drawn, ready to fire. */
  const ready=(player:Player,w:GunInput['w']='pistola')=>{weapons.enable(player,kit);tick([[player,{w,r:0}]]);if(w)wait(stats(w).drawMs);};
  /** A shot from a camera 2 m behind the eyes, through `point`; seen now (no rewind) unless told. */
  const shotAt=(shooter:Player,point:Vec3,n:number,extra:Partial<ShotCommand>={}):ShotCommand=>{
    const eye=eyeOf(shooter.skin,shooter),d=normalize([point[0]-eye[0],point[1]-eye[1],point[2]-eye[2]]);
    return {n,o:[eye[0]-d[0]*2,eye[1]-d[1]*2,eye[2]-d[2]*2],d,sp:0,seen:now+1,ago:0,dt:10_000,...extra};
  };
  const chest=(target:Player):Vec3=>{const zones=bodyZones(target.skin,target);return [(zones.torso.a[0]+zones.torso.b[0])/2,(zones.torso.a[1]+zones.torso.b[1])/2,(zones.torso.a[2]+zones.torso.b[2])/2];};
  const head=(target:Player):Vec3=>bodyZones(target.skin,target).head.c;
  return {weapons,players,add,tick,wait,ready,shotAt,chest,head,shots,hits,kos,refusals,logs,rules,get now(){return now;}};
}

test('drawing takes the weapon\'s time: a shot before it is dropped, after it lands; holstering keeps the rounds left',()=>{
  const r=room(),a=r.add('a',OPEN.x,OPEN.z),b=r.add('b',OPEN.x,OPEN.z+10,Math.PI);
  r.weapons.enable(a,kit);
  assert.equal(a.gun.on,true);
  r.tick([[a,{w:'pistola'}]]);
  assert.deepEqual([a.gun.w,a.gun.mag,a.gun.drawAt],['pistola',stats('pistola').mag,r.now]);
  r.tick([[a,{w:'pistola',s:[r.shotAt(a,r.chest(b),1)]}]]);
  assert.equal(r.shots.length,0,'too early in the draw');
  assert.equal(a.gun.shots,0);
  r.wait(stats('pistola').drawMs);
  r.tick([[a,{w:'pistola',s:[r.shotAt(a,r.chest(b),1)]}]]);
  assert.equal(r.shots.length,1);
  assert.deepEqual([a.gun.mag,a.gun.shots],[stats('pistola').mag-1,1]);
  assert.equal(r.shots[0]!.by,'a');assert.equal(r.shots[0]!.e[0]![3],2,'the bullet ended in a body');
  assert.equal(r.hits.length,1);
  // Holstered and drawn again: the same magazine.
  r.tick([[a,{w:''}]]);
  assert.deepEqual([a.gun.w,a.gun.kit,a.gun.mag],['','',0]);
  r.tick([[a,{w:'pistola'}]]);
  assert.equal(a.gun.mag,stats('pistola').mag-1);
  // A weapon not owned is refused, once, and its inputs change nothing until something else is asked for.
  r.weapons.setArsenal(a,{...kit,weapons:kit.weapons.filter(w=>w.id!=='fuzil')});
  r.tick([[a,{w:'fuzil'}]]);r.tick([[a,{w:'fuzil'}]]);
  assert.deepEqual(r.refusals,['Você não tem essa arma.']);
  assert.equal(a.gun.w,'pistola');
});

test('cadence: a shot claiming less than the interval is dropped, and the room\'s bucket holds a burst to 1+burstAllowance',()=>{
  const r=room(),a=r.add('a',OPEN.x,OPEN.z),b=r.add('b',OPEN.x,OPEN.z+10,Math.PI);
  r.ready(a,'submetralhadora');
  const interval=stats('submetralhadora').interval;
  r.tick([[a,{w:'submetralhadora',s:[r.shotAt(a,r.chest(b),1,{dt:interval-GUN.fireLeewayMs-5})]}]]);
  assert.equal(r.shots.length,0,'faster than the gun');
  assert.ok(r.logs.some(([event,details])=>event==='weapon_drop'&&details.why==='cadence'));
  // Six on one input, each claiming the right cadence: the bucket lets three through (it was full).
  r.tick([[a,{w:'submetralhadora',s:[1,2,3,4,5,6].map(n=>r.shotAt(a,r.chest(b),n,{dt:interval}))}]]);
  assert.equal(r.shots.length,1+GUN.burstAllowance);
  assert.equal(a.gun.shots,3);
  // A replayed count is refused.
  r.wait(500);
  r.tick([[a,{w:'submetralhadora',s:[r.shotAt(a,r.chest(b),3,{dt:interval})]}]]);
  assert.equal(r.shots.length,3);
  r.tick([[a,{w:'submetralhadora',s:[r.shotAt(a,r.chest(b),4,{dt:interval})]}]]);
  assert.equal(r.shots.length,4,'the next count goes');
});

test('a whole reload holds the trigger until it is done and fills the magazine; out of rounds nothing reloads',()=>{
  const r=room(),a=r.add('a',OPEN.x,OPEN.z);
  r.ready(a,'pistola');
  const pistol=stats('pistola');
  // Full: the key does nothing.
  r.tick([[a,{w:'pistola',r:1}]]);
  assert.equal(a.gun.reloadUntil,0);
  for(let n=1;n<=pistol.mag;n++){r.tick([[a,{w:'pistola',r:1,s:[r.shotAt(a,AWAY,n,{dt:pistol.interval})]}]]);r.wait(200);}
  assert.equal(a.gun.mag,0);
  r.tick([[a,{w:'pistola',r:1,s:[r.shotAt(a,AWAY,pistol.mag+1,{dt:pistol.interval})]}]]);
  assert.equal(a.gun.shots,pistol.mag,'dry');
  r.tick([[a,{w:'pistola',r:2}]]);
  const started=r.now;
  assert.deepEqual([a.gun.reloadAt,a.gun.reloadFrom,a.gun.reloadUntil],[started,0,started+(pistol.reloadMs as {empty:number}).empty]);
  r.wait(300);
  r.tick([[a,{w:'pistola',r:2,s:[r.shotAt(a,AWAY,pistol.mag+1,{dt:pistol.interval})]}]]);
  assert.equal(a.gun.shots,pistol.mag,'a whole reload is not cut by the trigger');
  while(r.now<a.gun.reloadUntil)r.tick([[a,{w:'pistola',r:2}]]);
  r.tick();
  assert.deepEqual([a.gun.mag,a.gun.reloadUntil],[pistol.mag,0]);
  // Counted rounds: with none left in reserve the key does nothing.
  r.weapons.setArsenal(a,{...kit,infinite:false,ammo:{'9mm':0}});
  r.tick([[a,{w:'pistola',r:3,s:[r.shotAt(a,AWAY,pistol.mag+1,{dt:pistol.interval})]}]]);
  r.tick([[a,{w:'pistola',r:4}]]);
  assert.equal(a.gun.reloadUntil,0);
});

test('round by round: rounds go in as they are pushed, and a shot stops the reload with what is in',()=>{
  const r=room(),a=r.add('a',OPEN.x,OPEN.z);
  r.ready(a,'revolver');
  const revolver=stats('revolver'),timing=revolver.reloadMs as {start:number;each:number;end:number};
  for(let n=1;n<=4;n++){r.tick([[a,{w:'revolver',r:0,s:[r.shotAt(a,AWAY,n,{dt:revolver.interval})]}]]);r.wait(400);}
  assert.equal(a.gun.mag,2);
  r.tick([[a,{w:'revolver',r:1}]]);
  const started=r.now;
  assert.equal(a.gun.reloadUntil,started+timing.start+timing.each*4+timing.end);
  while(r.now<started+timing.start+timing.each*2+10)r.tick([[a,{w:'revolver',r:1}]]);
  assert.equal(a.gun.mag,4,'two rounds in');
  r.tick([[a,{w:'revolver',r:1,s:[r.shotAt(a,AWAY,5,{dt:revolver.interval})]}]]);
  assert.deepEqual([a.gun.reloadUntil,a.gun.mag,a.gun.shots],[0,3,5],'interrupted: the shot left with the rounds already in');
});

test('lag compensation: a body that moved after the shooter saw it is still hit within the rewind; seen too long ago it is not',()=>{
  for(const [after,lands] of [[150,true],[600,false]] as const){
    const r=room(),a=r.add('a',OPEN.x,OPEN.z),b=r.add('b',OPEN.x,OPEN.z+12,Math.PI);
    r.ready(a,'pistola');
    r.wait(GUN.rewindMaxMs+600);
    const was=r.chest(b);
    // B steps a metre and a half aside; the shot, aimed where the shooter still drew B, reaches the room `after` ms later.
    b.x+=1.5;
    r.wait(after);
    // What the shooter drew was from just before the step: seenAt = seen-100+ago/1.2 (as for a punch), turned back at most GUN.rewindMaxMs.
    const seenAgo=after+TICK_MS+20,shot=r.shotAt(a,was,1,{seen:r.now+TICK_MS-seenAgo+100,ago:0});
    r.tick([[a,{w:'pistola',s:[shot]}]]);
    assert.equal(r.shots.length,1);
    assert.equal(r.hits.length,lands?1:0,`moved ${after} ms before the shot`);
  }
});

test('a wall between the muzzle and the target takes the bullet',()=>{
  // A wall across the street, 5 m in front of the shooter.
  const wallZ=OPEN.z+5;
  const world:WorldRay=(from,to)=>{
    if((from[2]-wallZ)*(to[2]-wallZ)>=0)return undefined;
    return {fraction:(wallZ-from[2])/(to[2]-from[2]),normal:[0,0,-1],surface:'concreto',id:'COL_Muro'};
  };
  const r=room(world),a=r.add('a',OPEN.x,OPEN.z),b=r.add('b',OPEN.x,OPEN.z+10,Math.PI);
  r.ready(a,'fuzil');
  r.tick([[a,{w:'fuzil',s:[r.shotAt(a,r.chest(b),1)]}]]);
  assert.equal(r.shots.length,1);
  assert.equal(r.hits.length,0);
  assert.equal(r.shots[0]!.e[0]![3],1,'ended in a solid');
  assert.ok(Math.abs(r.shots[0]!.e[0]![2]-wallZ)<.01);
  assert.equal(b.hp,100);
});

test('a headshot kills at once, whatever the weapon; a shotgun\'s pellets add up in one hit',()=>{
  const r=room(),a=r.add('a',OPEN.x,OPEN.z),b=r.add('b',OPEN.x,OPEN.z+10,Math.PI);
  r.ready(a,'pistola');
  r.tick([[a,{w:'pistola',s:[r.shotAt(a,r.head(b),1)]}]]);
  const pistol=stats('pistola');
  assert.equal(r.hits.length,1);
  assert.ok(pistol.damage*pistol.head<200,'The pistol\'s head damage alone would not do it');
  assert.deepEqual([r.hits[0]!.zone,r.hits[0]!.damage,r.hits[0]!.ko,r.hits[0]!.hp,r.hits[0]!.pellets],['head',200,true,0,1]);
  const c=r.add('c',OPEN.x+1.5,OPEN.z+2.6,Math.PI);
  r.tick([[a,{w:'escopeta'}]]);r.wait(stats('escopeta').drawMs);
  r.tick([[a,{w:'escopeta',s:[r.shotAt(a,r.chest(c),2)]}]]);
  const hit=r.hits.find(item=>item.to==='c')!;
  assert.ok(hit.pellets>=7,`most pellets land at 3 m (${hit.pellets})`);
  assert.ok(hit.damage>=hit.pellets*stats('escopeta').damage*.8-1);
  assert.equal(r.shots.at(-1)!.e.length,stats('escopeta').pellets);
});

test('a knockout throws the body along the bullet with the shot\'s damage',()=>{
  const r=room(),a=r.add('a',OPEN.x,OPEN.z),b=r.add('b',OPEN.x,OPEN.z+10,Math.PI);
  b.assign({hp:10,hpCore:0});
  r.ready(a,'pistola');
  r.tick([[a,{w:'pistola',s:[r.shotAt(a,r.chest(b),1)]}]]);
  assert.equal(r.kos.length,1);
  assert.equal(r.hits[0]!.ko,true);assert.equal(r.hits[0]!.hp,0);
  assert.equal(r.kos[0]!.hurt,r.hits[0]!.damage);
  assert.ok(r.kos[0]!.vz>0&&Math.abs(r.kos[0]!.vx)<.2,'pushed away from the shooter');
});

test('the camera point must be near the shooter and on its side of the walls',()=>{
  const r=room(),a=r.add('a',OPEN.x,OPEN.z),b=r.add('b',OPEN.x,OPEN.z+10,Math.PI);
  r.ready(a,'pistola');
  const far=r.shotAt(a,r.chest(b),1);far.o=[far.o[0],far.o[1],far.o[2]+GUN.originSlack+4];
  r.tick([[a,{w:'pistola',s:[far]}]]);
  assert.equal(r.shots.length,0);
  assert.ok(r.logs.some(([event,details])=>event==='weapon_drop'&&details.why==='origin'));
  // Behind a wall (a camera pushed through it).
  const wallZ=OPEN.z-1;
  const walled=room((from,to)=>(from[2]-wallZ)*(to[2]-wallZ)<0?{fraction:(wallZ-from[2])/(to[2]-from[2]),normal:[0,0,1],surface:'concreto',id:'COL_Muro'}:undefined);
  const c=walled.add('c',OPEN.x,OPEN.z),d=walled.add('d',OPEN.x,OPEN.z+10,Math.PI);
  walled.ready(c,'pistola');
  walled.tick([[c,{w:'pistola',s:[walled.shotAt(c,walled.chest(d),1)]}]]);
  assert.equal(walled.shots.length,0);
  assert.ok(walled.logs.some(([event,details])=>event==='weapon_drop'&&details.why==='camera'));
});

test('aiming slows the walk to the weapon\'s pace; parts change the kit and the capacity; the room puts the gun away when the hands are taken',()=>{
  const r=room(),a=r.add('a',OPEN.x,OPEN.z);
  r.ready(a,'fuzil');
  assert.equal(r.weapons.pace(a),undefined);
  r.tick([[a,{w:'fuzil',ads:true,p:2}]]);
  assert.equal(a.gun.ads,true);assert.ok(Math.abs(a.gun.pitch-GUN.pitchMax)<1e-6);
  assert.ok(Math.abs(r.weapons.pace(a)!-WALK_SPEED*stats('fuzil').move)<1e-9);
  // An extended magazine: the kit says so and the next reload fills more.
  r.weapons.setArsenal(a,withPart(kit,'fuzil','carregador','carregador-estendido'));
  assert.equal(a.gun.kit,'carregador:carregador-estendido');
  // The room's rule changes (sat down, say): the gun goes away, and the inputs still asking for it change nothing.
  r.rules.refusal='Levante-se antes de sacar a arma.';
  r.tick([[a,{w:'fuzil',ads:true}]]);
  assert.equal(a.gun.w,'');
  r.tick([[a,{w:'fuzil',ads:true}]]);
  assert.equal(a.gun.w,'');assert.deepEqual(r.refusals,[]);
  r.rules.refusal='';
  r.tick([[a,{w:'fuzil'}]]);
  assert.equal(a.gun.w,'','still latched');
  r.tick([[a,{w:''}]]);r.tick([[a,{w:'fuzil'}]]);
  assert.equal(a.gun.w,'fuzil');
  assert.equal(a.gun.mag,stats('fuzil').mag,'the rounds it had');
  // The system off.
  r.weapons.disable(a);
  assert.deepEqual([a.gun.on,a.gun.w],[false,'']);
  r.tick([[a,{w:'fuzil'}]]);
  assert.equal(a.gun.w,'');
});
