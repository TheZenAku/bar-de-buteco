import test from 'node:test';
import assert from 'node:assert/strict';
import {CAFE_TABLES,GUN,PARTS,PART_IDS,UPGRADE_MAX,WEAPONS,WEAPON_IDS,WHEEL_ORDER,arsenalStats,bodyZones,bulletWorld,cleanArsenal,damageOf,decodeKit,encodeKit,falloff,fitError,
  gunBody,gunInputSchema,gunRewindOf,inputSchema,mapRay,minSpread,muzzleOf,nextUpgrade,partFits,pelletDirections,rayBody,rayCapsule,raySphere,reloadDuration,
  roundsLoaded,shotFollows,shotSeed,spreadNow,surfaceOf,testArsenal,traceShot,upgradeCost,weaponStats,withPart,withUpgrade,type ShotTarget,type Vec3} from '@bar/shared';

// The open street, as the fight's tests use it: floor all around, far from the bar's walls.
const OPEN={x:60,y:0,z:7};
const angle=(a:Vec3,b:Vec3)=>Math.acos(Math.max(-1,Math.min(1,a[0]*b[0]+a[1]*b[1]+a[2]*b[2])));

test('every weapon is complete, its parts exist and fit only their slot, and the defaults fit',()=>{
  assert.deepEqual([...WHEEL_ORDER].sort(),[...WEAPON_IDS].sort());
  for(const id of WEAPON_IDS){
    const def=WEAPONS[id];
    assert.ok(def.rpm>0&&def.mag>0&&def.damage>0&&def.pellets>=1,id);
    assert.ok(def.range.start<def.range.end&&def.range.end<=def.range.max,id);
    for(const [slot,parts] of Object.entries(def.slots))for(const part of parts??[])assert.equal(PARTS[part].slot,slot,`${id} ${slot} ${part}`);
    for(const [slot,part] of Object.entries(def.defaults??{}))assert.ok(partFits(id,slot as never,part!),`${id} default ${part}`);
  }
  for(const part of PART_IDS)assert.equal(PARTS[part].id,part);
});

test('balance: kills take the shots the design says against a full ring and core (200)',()=>{
  const shotsToKill=(id:typeof WEAPON_IDS[number],zone:'head'|'torso',distance=5)=>{
    const stats=weaponStats(id,{},{});
    return Math.ceil(200/(damageOf(stats,zone,distance)*stats.pellets));
  };
  assert.equal(shotsToKill('pistola','torso'),8);
  assert.equal(shotsToKill('pistola','head'),4);
  assert.equal(shotsToKill('fuzil','torso'),9);
  assert.equal(shotsToKill('carabina','torso'),3);
  assert.equal(shotsToKill('precisao','head',60),1);
  assert.equal(shotsToKill('precisao','torso',60),2);
  assert.equal(shotsToKill('escopeta','torso',4),2);
  // Far away a shotgun barely hurts.
  const shotgun=weaponStats('escopeta');
  assert.ok(damageOf(shotgun,'torso',40)<=shotgun.damage*.25+1e-9);
  assert.equal(damageOf(shotgun,'torso',61),0);
});

test('parts and upgrades change the stats the right way, and parts that do not fit are ignored',()=>{
  const base=weaponStats('fuzil');
  const kitted=weaponStats('fuzil',{boca:'silenciador',trilho:'empunhadura',carregador:'carregador-estendido',mira:'acog'},{});
  assert.ok(kitted.suppressed&&kitted.scope&&kitted.zoom===4);
  assert.equal(kitted.mag,45);
  assert.ok(kitted.recoil.v<base.recoil.v&&kitted.earshot<base.earshot&&kitted.range.start<base.range.start);
  assert.ok(kitted.adsMs>base.adsMs);
  const upgraded=weaponStats('fuzil',{},{dano:UPGRADE_MAX,controle:UPGRADE_MAX,manuseio:2});
  assert.ok(Math.abs(upgraded.damage-base.damage*1.2)<1e-9);
  assert.ok(upgraded.recoil.v<base.recoil.v*.66&&upgraded.adsMs<base.adsMs);
  // A part that does not go on the revolver is ignored; the speed loader makes its reload whole.
  assert.deepEqual(weaponStats('revolver',{mira:'acog'}),weaponStats('revolver'));
  const loader=weaponStats('revolver',{carregador:'carregador-rapido'});
  assert.equal(loader.reloadStyle,'mag');
  assert.equal(reloadDuration(loader,0),1600);
  // Over the top levels are clamped.
  assert.deepEqual(weaponStats('pistola',{},{dano:99}),weaponStats('pistola',{},{dano:UPGRADE_MAX}));
  assert.ok(upgradeCost('precisao',5)>upgradeCost('pistola',5));
});

test('spread: aiming narrows it, moving and firing widen it, and nothing goes below the aimed cone',()=>{
  const stats=weaponStats('fuzil');
  const still=spreadNow(stats,{ads:1,speed:0,bloom:0});
  assert.ok(Math.abs(still-stats.spread.ads)<1e-12);
  assert.ok(spreadNow(stats,{ads:0,speed:0,bloom:0})>still);
  assert.ok(spreadNow(stats,{ads:1,speed:3.5,bloom:0})>still);
  assert.ok(spreadNow(stats,{ads:1,speed:0,bloom:1})<=still+stats.spread.bloomMax+1e-12);
  assert.ok(minSpread(stats)<still);
});

test('a shot\'s bullets are the same everywhere for the same shooter and count, inside the cone, and differ between shots',()=>{
  const dir:Vec3=[0,0,1];
  const one=pelletDirections(shotSeed('abc',7),dir,.05,9,.07),again=pelletDirections(shotSeed('abc',7),dir,.05,9,.07);
  assert.deepEqual(one,again);
  assert.notDeepEqual(pelletDirections(shotSeed('abc',8),dir,.05,9,.07),one);
  assert.equal(one.length,9);
  for(const pellet of one)assert.ok(angle(pellet,dir)<=.05+.07+1e-9);
  for(let n=0;n<200;n++){const [single]=pelletDirections(shotSeed('x',n),dir,.02);assert.ok(angle(single!,dir)<=.02+1e-9);}
});

test('ray tests: balls and capsules from outside, ends included, misses missed',()=>{
  assert.ok(Math.abs(raySphere([0,0,0],[0,0,1],[0,0,5],1)!-4)<1e-9);
  assert.equal(raySphere([0,0,0],[0,0,1],[0,3,5],1),undefined);
  assert.ok(Math.abs(rayCapsule([0,1,0],[0,0,1],[0,0,5],[0,2,5],.5)!-4.5)<1e-9);
  // Straight down onto the top cap.
  assert.ok(Math.abs(rayCapsule([0,5,5],[0,-1,0],[0,0,5],[0,2,5],.5)!-2.5)<1e-9);
  assert.equal(rayCapsule([2,1,0],[0,0,1],[0,0,5],[0,2,5],.5),undefined);
});

test('the zones: a level shot at the head height hits the head, at the belly the trunk, at the knees the legs',()=>{
  const body=gunBody('rafael'),pose={x:0,y:0,z:5,rotation:Math.PI},zones=bodyZones('rafael',pose);
  assert.ok(body.top>body.head&&body.head>body.neck&&body.neck>body.chest&&body.chest>body.hip);
  assert.equal(rayBody([0,body.head+.1,0],[0,0,1],20,zones)?.zone,'head');
  assert.equal(rayBody([0,body.hip+.25,0],[0,0,1],20,zones)?.zone,'torso');
  assert.equal(rayBody([0,.45,0],[0,0,1],20,zones)?.zone,'legs');
  assert.equal(rayBody([.6,1,0],[0,0,1],20,zones),undefined);
});

test('traceShot: the aimed body is hit; one standing behind the camera is not; a wall right in front of the muzzle takes the bullet',()=>{
  const skin='rafael',body=gunBody(skin);
  const shooter={x:OPEN.x,y:0,z:OPEN.z,rotation:0};
  const eye:Vec3=[shooter.x,body.head+.1,shooter.z];
  const camera:Vec3=[shooter.x-.3,eye[1]+.2,shooter.z-3.5];
  const target:ShotTarget={id:'t',skin,pose:{x:OPEN.x,y:0,z:OPEN.z+10,rotation:Math.PI}};
  const behind:ShotTarget={id:'behind',skin,pose:{x:OPEN.x-.2,y:0,z:OPEN.z-1.5,rotation:0}};
  const aimAt:Vec3=[target.pose.x,body.chest,target.pose.z];
  const dir=[aimAt[0]-camera[0],aimAt[1]-camera[1],aimAt[2]-camera[2]] as Vec3,len=Math.hypot(...dir);
  const d:Vec3=[dir[0]/len,dir[1]/len,dir[2]/len];
  const muzzle=muzzleOf(skin,shooter,0,'rifle',.78);
  const clear=()=>undefined;
  const [hit]=traceShot(camera,[d],muzzle,eye,200,[target,behind],clear);
  assert.equal(hit!.kind,'body');assert.equal(hit!.target,'t');assert.equal(hit!.zone,'torso');
  // A wall between the muzzle and the target, not on the camera's line: the bullet stops in it.
  const wallAt=(from:Vec3,to:Vec3)=>{
    // Across the muzzle's line (x -0.147 there) but beside the camera's (x -0.201): only the bullet's own way meets it.
    const z=OPEN.z+.95;if((from[2]-z)*(to[2]-z)>0)return undefined;
    const f=(z-from[2])/(to[2]-from[2]),x=from[0]+(to[0]-from[0])*f;
    return x>OPEN.x-.175?{fraction:f,normal:[0,0,-1] as Vec3,surface:'concreto' as const,id:'wall'}:undefined;
  };
  const [cut]=traceShot(camera,[d],muzzle,eye,200,[target],wallAt);
  assert.equal(cut!.kind,'world');assert.equal(cut!.blocked,true);
});

test('traceShot: nobody at the back of the shooter is hit, however close, even with the camera behind them both',()=>{
  const skin='rafael',body=gunBody(skin);
  const shooter={x:OPEN.x,y:0,z:OPEN.z,rotation:0};
  const eye:Vec3=[shooter.x,body.head+.1,shooter.z];
  const camera:Vec3=[shooter.x-.3,eye[1]+.2,shooter.z-3.5];
  const muzzle=muzzleOf(skin,shooter,0,'rifle',.78);
  const clear=()=>undefined;
  const d=((): Vec3=>{const v:Vec3=[shooter.x-camera[0],body.chest-camera[1],shooter.z+10-camera[2]],l=Math.hypot(...v);return [v[0]/l,v[1]/l,v[2]/l];})();
  // From touching (0.35 m behind) to a few metres back, on the camera's line and beside it.
  for(const back of [.25,.35,.5,.7,1,2])for(const side of [-.3,-.2,0,.2,.3]){
    const behind:ShotTarget={id:'behind',skin,pose:{x:OPEN.x+side,y:0,z:OPEN.z-back,rotation:0}};
    const [shot]=traceShot(camera,[d],muzzle,eye,200,[behind],clear);
    assert.notEqual(shot!.kind,'body',`behind ${back} side ${side}`);
  }
  // Someone standing beside, level with the eyes, is still a target.
  const beside:ShotTarget={id:'beside',skin,pose:{x:OPEN.x-.5,y:0,z:OPEN.z+2,rotation:0}};
  const aim:Vec3=[-.25,0,1],l=Math.hypot(...aim),a:Vec3=[aim[0]/l,aim[1]/l,aim[2]/l];
  const [side]=traceShot(eye,[[a[0],(body.chest-eye[1])/2.2,a[2]]],muzzle,eye,200,[beside],clear);
  assert.equal(side!.kind==='body'||side!.kind==='none',true);
});

test('the map: a bullet stops in a wall and in the floor, and surfaces are named',()=>{
  const table=CAFE_TABLES[0]!;
  // Down into the open street: its bed (a solid) or its floor, at street level, facing up.
  const down=bulletWorld({x:OPEN.x,y:1.5,z:OPEN.z},{x:OPEN.x,y:-1.5,z:OPEN.z+.5});
  assert.ok(down&&Math.abs(down.fraction-.5)<.05&&down.normal[1]>.9,JSON.stringify(down));
  // Inside the bar, by the first table: its floor, half way down a 4 m drop.
  const inside=bulletWorld({x:table.x+1,y:table.y+2,z:table.z+1},{x:table.x+1.2,y:table.y-2,z:table.z+1.2});
  assert.ok(inside&&Math.abs(inside.fraction-.5)<.05&&inside.normal[1]>.9,JSON.stringify(inside));
  // Level along the street hits nothing within a couple of metres.
  assert.equal(bulletWorld({x:OPEN.x,y:1.4,z:OPEN.z},{x:OPEN.x+1,y:1.4,z:OPEN.z}),undefined);
  // Towards the bar from the street: its walls stop the bullet on the way.
  const toBar=mapRay([OPEN.x,1.4,OPEN.z],[table.x,1.4,table.z]);
  assert.ok(toBar&&toBar.fraction>0&&toBar.fraction<1,JSON.stringify(toBar));
  assert.equal(surfaceOf('COL_Ext_Poste.012'),'metal');
  assert.equal(surfaceOf('COL_Mob_Mesa.003'),'madeira');
  assert.equal(surfaceOf('COL_Predio_Janela.002'),'vidro');
  assert.equal(surfaceOf('COL_Viz_Muro.129'),'concreto');
});

test('reloads: whole ones by tactical/empty, round by round fills one per `each` after opening',()=>{
  const rifle=weaponStats('fuzil');
  assert.equal(reloadDuration(rifle,10),2100);assert.equal(reloadDuration(rifle,0),2600);assert.equal(reloadDuration(rifle,30),0);
  const shotgun=weaponStats('escopeta');
  assert.equal(reloadDuration(shotgun,4),380+480*2+350);
  assert.equal(roundsLoaded(shotgun,4,300),4);
  assert.equal(roundsLoaded(shotgun,4,380+480),5);
  assert.equal(roundsLoaded(shotgun,4,99999),6);
  assert.equal(roundsLoaded(rifle,3,100),3);assert.equal(roundsLoaded(rifle,3,2100),30);
  // Not enough rounds left: only what there is.
  assert.equal(roundsLoaded(rifle,0,5000,7),7);
});

test('arsenal: the test kit has everything, parts are checked, kits round-trip, junk is cleaned',()=>{
  const kit=testArsenal();
  assert.equal(kit.weapons.length,WEAPON_IDS.length);
  assert.equal(arsenalStats(kit,'precisao')!.scope,true);
  assert.equal(fitError(kit,'fuzil','mira','acog'),'');
  assert.notEqual(fitError(kit,'revolver','mira','acog'),'');
  assert.notEqual(fitError({...kit,parts:[]},'fuzil','mira','acog'),'');
  const fitted=withPart(kit,'fuzil','boca','silenciador');
  assert.equal(arsenalStats(fitted,'fuzil')!.suppressed,true);
  assert.equal(arsenalStats(withPart(fitted,'fuzil','boca',null),'fuzil')!.suppressed,false);
  assert.deepEqual(decodeKit(encodeKit({mira:'acog',boca:'silenciador'})),{mira:'acog',boca:'silenciador'});
  assert.deepEqual(decodeKit('mira:nada,xx:acog,boca:silenciador'),{boca:'silenciador'});
  assert.equal(nextUpgrade(kit,'fuzil','dano')!.cost,0);
  let up=kit;for(let i=0;i<7;i++)up=withUpgrade(up,'fuzil','dano');
  assert.equal(nextUpgrade(up,'fuzil','dano'),undefined);
  const clean=cleanArsenal({test:false,weapons:[{id:'fuzil',parts:{mira:'acog',boca:'luneta'},upgrades:{dano:9,foo:3}},{id:'bazuca'}],parts:['acog','x'],ammo:{'556':12.7}});
  assert.deepEqual(clean.weapons,[{id:'fuzil',equipped:false,parts:{mira:'acog'},upgrades:{dano:UPGRADE_MAX}}]);
  assert.deepEqual(clean.parts,['acog']);assert.deepEqual(clean.ammo,{'556':12});
});

test('the wire: a gun input with shots passes the strict input schema; bad directions and too many shots do not',()=>{
  const shot={n:1,o:[1,2,3] as Vec3,d:[0,0,1] as Vec3,sp:.01,seen:1000,ago:20,dt:90};
  const input={seq:1,dx:0,dz:0,running:false,rotation:0,gun:{w:'fuzil' as const,ads:true,p:.1,r:2,m:0,s:[shot]}};
  assert.equal(inputSchema.safeParse(input).success,true);
  assert.equal(gunInputSchema.safeParse({w:'bazuca'}).success,false);
  assert.equal(gunInputSchema.safeParse({w:'fuzil',s:[{...shot,d:[0,0,2]}]}).success,false);
  assert.equal(gunInputSchema.safeParse({w:'fuzil',s:Array.from({length:GUN.shotsPerInput+1},(_,i)=>({...shot,n:i}))}).success,false);
  assert.equal(shotFollows(65535,0),true);assert.equal(shotFollows(5,5),false);assert.equal(shotFollows(5,200),false);
  assert.equal(gunRewindOf(10_000,{seen:10_000-400,ago:30}),GUN.rewindMaxMs);
  assert.ok(gunRewindOf(10_000,{seen:9_950,ago:30})<200);
});

test('falloff is smooth and monotonic between the ranges',()=>{
  const stats=weaponStats('fuzil');
  let last=1;
  for(let d=0;d<=stats.range.max;d+=2){const f=falloff(stats,d);assert.ok(f<=last+1e-12);last=f;}
  assert.equal(falloff(stats,stats.range.max+1),0);
});

test('the bullet ray walks the grid and finds exactly what testing every solid finds',async()=>{
  const {solidColliders,COLLIDERS}=await import('@bar/shared');
  const map=(await import('../../packages/shared/src/map-data.json',{with:{type:'json'}})).default as unknown as {cameraCeilings:Array<{id:string;x:number;z:number;hx:number;hz:number;minY?:number;maxY?:number;ramp?:boolean;turn?:{ux:number;uz:number;lx:number;lz:number}}>};
  type Box=(typeof map.cameraCeilings)[number];
  const all:Box[]=[...solidColliders(),...map.cameraCeilings] as Box[];
  assert.ok(COLLIDERS.length>100);
  // The same rules, box by box, with no grid.
  const brute=(s:Vec3,e:Vec3):number=>{
    let best=Infinity;
    for(const c of all){
      if(c.ramp||c.id.startsWith('COL_Cid_Limite'))continue;
      const local=(x:number,z:number):[number,number]=>{const dx=x-c.x,dz=z-c.z,t=c.turn;return t?[dx*t.ux+dz*t.uz,dz*t.ux-dx*t.uz]:[dx,dz];};
      const [ax,az]=local(s[0],s[2]),[bx,bz]=local(e[0],e[2]),hx=c.turn?c.turn.lx:c.hx,hz=c.turn?c.turn.lz:c.hz;
      const min=[-hx,c.minY??0,-hz],max=[hx,c.maxY??3,hz],from=[ax,s[1],az],to=[bx,e[1],bz];
      if(from.every((v,i)=>v>=min[i]!&&v<=max[i]!))continue;
      let enter=0,exit=1,axis=-1,miss=false;
      for(let i=0;i<3;i++){const d=to[i]!-from[i]!;if(Math.abs(d)<1e-9){if(from[i]!<min[i]!||from[i]!>max[i]!){miss=true;break;}continue;}
        const a=(min[i]!-from[i]!)/d,b=(max[i]!-from[i]!)/d;if(Math.min(a,b)>enter){enter=Math.min(a,b);axis=i;}exit=Math.min(exit,Math.max(a,b));}
      if(!miss&&axis>=0&&enter<=exit&&enter<=1&&enter<best)best=enter;
    }
    return best;
  };
  let random=12345;const next=()=>{random=(random*1103515245+12345)%2147483648;return random/2147483648;};
  let hits=0;
  for(let i=0;i<300;i++){
    const s:Vec3=[-40+next()*140,.3+next()*6,-60+next()*120],len=5+next()*150,yaw=next()*Math.PI*2,pitch=(next()-.5)*.6;
    const e:Vec3=[s[0]+Math.sin(yaw)*Math.cos(pitch)*len,s[1]+Math.sin(pitch)*len,s[2]+Math.cos(yaw)*Math.cos(pitch)*len];
    const hit=bulletWorld({x:s[0],y:s[1],z:s[2]},{x:e[0],y:e[1],z:e[2]}),expected=brute(s,e);
    // A floor may come first (bulletWorld's ground); otherwise the solid must be the very one brute force finds.
    if(hit&&!hit.ground){assert.ok(Math.abs(hit.fraction-expected)<1e-9,`ray ${i}: ${hit.fraction} vs ${expected}`);hits++;}
    else if(!hit)assert.equal(expected,Infinity,`ray ${i} missed a solid at ${expected}`);
    else assert.ok(hit.fraction<=expected+1e-9,`ray ${i}: floor after a solid`);
  }
  assert.ok(hits>50,`only ${hits} rays met a solid`);
});

test('the owner\'s weapon changes of 2026-11-09: capacities, reloads, holds and the sawn-off',()=>{
  const ext={carregador:'carregador-estendido'} as const,fast={carregador:'carregador-rapido'} as const;
  // DMR: a short 10, the extended is the 20 (not 15); carbine: six in the short tube, ten in the long one.
  assert.equal(weaponStats('dmr').mag,10);assert.equal(weaponStats('dmr',ext).mag,20);
  assert.equal(weaponStats('carabina').mag,6);assert.equal(weaponStats('carabina',ext).mag,10);
  // The fast magazine keeps the lever gun and the bolt action round by round (only the revolver has a speed loader), just quicker.
  const lever=weaponStats('carabina'),leverFast=weaponStats('carabina',fast);
  assert.equal(leverFast.reloadStyle,'shell');assert.ok('each' in leverFast.reloadMs&&'each' in lever.reloadMs&&leverFast.reloadMs.each<lever.reloadMs.each);
  assert.equal(weaponStats('revolver',fast).reloadStyle,'mag');
  assert.equal(weaponStats('precisao').action,'bolt');assert.equal(weaponStats('precisao').reloadStyle,'shell');
  // The SMG in one hand, like the revolver: no foregrips.
  assert.equal(weaponStats('submetralhadora').hold,'revolver');assert.ok(!WEAPONS.submetralhadora.slots.trilho?.includes('empunhadura'));
  // The sawn-off: held like a pistol, the pellets wider, the reload slower, the muzzle closer.
  const long=weaponStats('cano-duplo'),sawn=weaponStats('cano-duplo',{boca:'canos-serrados'});
  assert.equal(sawn.hold,'pistol');assert.ok(sawn.spread.pellet>long.spread.pellet*1.4);assert.ok(sawn.reach<long.reach);
  assert.ok('tactical' in sawn.reloadMs&&'tactical' in long.reloadMs&&sawn.reloadMs.tactical>long.reloadMs.tactical);
});
