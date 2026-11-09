import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {KARATE_ROUND,KICK,KICKS,KICK_PATHS,KICK_VARIANTS,Ragdoll,SKILLS,kickAim,kickClip,kickVariant,kickClear,kickLaunch,kickTouches,kickWindow,type RagdollStart} from '@bar/shared';
// @ts-expect-error The tool is a plain script, with no types.
import {measureKicks} from '../../tools/assets/measure-kicks.mjs';

// The open street: nothing but floor around, far from the bar's walls.
const OPEN={x:60,y:0,z:7};
const facing=(rotation:number)=>({...OPEN,rotation});
const ahead=(metres:number,side=0)=>({x:OPEN.x+side,y:0,z:OPEN.z+metres,rotation:Math.PI});
const whole=(skill:string)=>{const span=kickWindow(skill)!;return [span.from,span.to] as const;};
const landed=(skill:string,target:{x:number;y:number;z:number},kicker=facing(0))=>kickTouches(skill,...whole(skill),kicker,target);

test('every registered kick is a catalog skill or a variant, with a foot table the clip agrees with',()=>{
  for(const id of Object.keys(KICKS)){
    assert.ok(SKILLS.some(candidate=>candidate.id===id)||KICK_VARIANTS[id],`${id} is a catalog skill or a variant`);
    assert.ok(KICK_PATHS[kickClip(id)!],`${kickClip(id)} has its table`);
  }
  // Run npm run assets:kicks when this fails: the clip changed and the table with it.
  const table=measureKicks(fs.readFileSync(new URL('../../apps/web/public/animations/rafael.glb',import.meta.url)));
  assert.deepEqual(table,JSON.parse(JSON.stringify(KICK_PATHS)));
});

test('the karate goes round its variants with the guard up, each harder; anything else is itself',()=>{
  assert.deepEqual([0,1,2,3].map(round=>kickVariant('karate',true,round)),[...KARATE_ROUND,'karate']);
  assert.equal(kickVariant('karate',false,1),'karate');
  assert.equal(kickVariant('air-kick',true,1),'air-kick');
  const hp=KARATE_ROUND.map(id=>KICKS[id]!.hp);
  assert.deepEqual(hp,[...hp].sort((a,b)=>a-b));assert.ok(new Set(hp).size===hp.length);
});

test('a kick hits what its foot reaches, and only that',()=>{
  for(const skill of ['karate','air-kick','karate-alto']){
    assert.ok(landed(skill,ahead(.6)),`${skill}: close in front`);
    assert.ok(landed(skill,ahead(1.3)),`${skill}: at the end of the leg`);
    assert.equal(landed(skill,ahead(2.2)),false,`${skill}: too far`);
    assert.equal(landed(skill,ahead(-1)),false,`${skill}: behind`);
    assert.equal(landed(skill,ahead(1,1.2)),false,`${skill}: off to the left, away from the leg`);
    assert.equal(landed(skill,{...ahead(1),y:2.5}),false,`${skill}: on the floor above`);
    assert.equal(landed(skill,{...ahead(1),y:-2.5}),false,`${skill}: on the floor below`);
  }
  // The front kick pushes at close range: the hips sit back while the foot goes out.
  assert.ok(landed('karate-frontal',ahead(.6)));assert.ok(landed('karate-frontal',ahead(1)));
  assert.equal(landed('karate-frontal',ahead(1.7)),false);assert.equal(landed('karate-frontal',ahead(-1)),false);
  // The karate kick comes round from the right: someone there takes it, someone equally far on the left does not.
  assert.ok(landed('karate',ahead(.7,-.75)));
  assert.equal(landed('karate',ahead(.7,.75)),false);
});

test('a kick turns with the kicker, and lands only while the leg is out',()=>{
  const east=facing(Math.PI/2),target={x:OPEN.x+1.2,y:0,z:OPEN.z};
  assert.ok(landed('karate',target,east));
  assert.equal(landed('karate',target),false,'Facing away from it');
  const [from,to]=whole('karate');
  assert.equal(kickTouches('karate',0,from-1,east,target),false,'Still winding up');
  assert.equal(kickTouches('karate',to+1,2000,east,target),false,'The leg is coming back');
  assert.equal(kickTouches('nothing',0,2000,east,target),false);
  // A slow tick: the foot passed through the body and out, between one check and the next. It still hit.
  const passing={x:OPEN.x-.75,y:0,z:OPEN.z+.75};
  assert.ok(kickTouches('karate',from,to,facing(0),passing));
  assert.equal(kickTouches('karate',from+200,from+300,facing(0),passing),false,'Not while the foot is up in front, away from there');
});

test('walls stop a kick and the aim',()=>{
  assert.ok(kickClear(OPEN,ahead(1)));
  // The front wall of the bar, from the street in: the wall's collider is right on this line.
  assert.equal(kickClear({x:0,y:0,z:-30},{x:0,y:0,z:30}),false);
});

test('the aim turns to whoever is about in front, and the nearest of them',()=>{
  assert.equal(kickAim(facing(0),[]),undefined);
  assert.equal(kickAim(facing(0),[ahead(-1.5)]),undefined,'Not behind');
  assert.equal(kickAim(facing(0),[ahead(KICK.aimRange+.5)]),undefined,'Not out of reach');
  assert.equal(kickAim(facing(0),[{...ahead(1),y:2.5}]),undefined,'Not on another floor');
  const aim=kickAim(facing(0),[ahead(1.2,.5)])!;
  assert.ok(Math.abs(aim-Math.atan2(.5,1.2))<1e-9,`Turned to ${aim}`);
  const near=ahead(1,.1),far=ahead(1.9,-.1),chosen=kickAim(facing(0),[far,near])!;
  assert.ok(Math.abs(chosen-Math.atan2(.1,1))<1e-9,'The nearest');
});

const flown=(skill:string,seed:number)=>{
  // Along the street, with room to land: the wall across it would stop any of them at about the same place.
  const start=kickLaunch(skill,'kicker',{x:-8,y:0,z:6,rotation:Math.PI/2},{x:-6.85,y:0,z:6,rotation:-Math.PI/2},seed),body=new Ragdoll(start);
  let top=0;
  while(!body.asleep){body.advance(1/60);top=Math.max(top,body.joint(0)[1]);}
  const rest=body.rest();
  return {start,distance:Math.hypot(rest.x-start.x,rest.z-start.z),top,rest,seconds:body.time};
};

test('the one hit flies far, away from the kicker, and the same on every machine',()=>{
  for(let seed=1;seed<=12;seed++){
    const karate=flown('karate',seed*7919),flying=flown('air-kick',seed*7919),{start}=karate;
    assert.ok(karate.distance>6,`Karate threw it ${karate.distance.toFixed(1)} m (seed ${seed})`);
    assert.ok(flying.distance>9,`The flying kick threw it ${flying.distance.toFixed(1)} m (seed ${seed})`);
    assert.ok(flying.distance>karate.distance,`The flying kick is the stronger (seed ${seed}): ${flying.distance.toFixed(1)} against ${karate.distance.toFixed(1)}`);
    assert.ok(karate.rest.x>start.x,'It went on, away from the kicker');
    assert.ok(flying.top>1.2,`It left the ground: the pelvis reached ${flying.top.toFixed(2)} m`);
    assert.ok(flying.seconds<RAGDOLL_LIMIT,'It came to rest');
  }
  const a=new Ragdoll(flown('karate',42).start),b=new Ragdoll(flown('karate',42).start);
  a.advance(1.3);for(let i=0;i<78;i++)b.advance(1/60);
  assert.deepEqual([...a.points].map(v=>+v.toFixed(6)),[...b.points].map(v=>+v.toFixed(6)),'However the time is cut into frames');
});

const RAGDOLL_LIMIT=7;

test('a body says when it hits hard, without changing what it does',()=>{
  const start:RagdollStart=kickLaunch('air-kick','kicker',facing(0),ahead(1.2),5);
  const heard=new Ragdoll(start),silent=new Ragdoll(start);
  let hardest=0,falls=0;
  for(let i=0;i<300;i++){
    heard.advance(1/60);silent.advance(1/60);
    const blow=heard.takeBlow();
    if(blow){hardest=Math.max(hardest,blow.speed);if(blow.speed>1.2)falls++;}
  }
  assert.ok(hardest>3,`The hardest landing was at ${hardest.toFixed(1)} m/s`);
  assert.ok(falls>0);
  assert.deepEqual([...heard.points],[...silent.points]);
  assert.equal(heard.takeBlow(),undefined,'Told once');
});

test('a thrown body only ever loses energy, whatever it gets caught on',()=>{
  // Towards the thin wall along z 14: a foot went through it and, pushed back by it and pulled by the body, ran the body along the wall at 13 m/s for 30 m,
  // or shot it 8 m into the air.
  for(const from of [{x:17.2,y:0,z:10.5},{x:20.3,y:0,z:10.5}])for(let seed=0;seed<40;seed++){
    const rotation=Math.PI/4,kicker={x:from.x-Math.sin(rotation)*1.1,y:0,z:from.z-Math.cos(rotation)*1.1,rotation};
    const body=new Ragdoll(kickLaunch('air-kick','kicker',kicker,{...from,rotation:0},seed*7919+13));
    let top=0;
    while(!body.asleep){body.advance(1/60);top=Math.max(top,body.joint(0)[1]);}
    const rest=body.rest(),distance=Math.hypot(rest.x-from.x,rest.z-from.z);
    assert.ok(top<3.5,`Seed ${seed}: the pelvis reached ${top.toFixed(1)} m`);
    assert.ok(distance<18,`Seed ${seed}: it ended ${distance.toFixed(1)} m away`);
  }
});

test('a start without a kick throws a body just as before',()=>{
  const crash:RagdollStart={x:60,y:0,z:7,yaw:0,vx:8,vz:0,closing:4,seated:false,seed:9};
  const plain=new Ragdoll(crash),kicked=new Ragdoll({...crash,by:'',lift:0});
  plain.advance(1);kicked.advance(1);
  assert.deepEqual([...plain.points],[...kicked.points]);
});
