import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stat} from 'node:fs/promises';
import {BEDS,DEFAULT_INPUT,SPOTS,SpotScheduler,bedGain,distanceCutoff,distanceGain,loopWithCrossfade,panOf,worldOf,
  type AmbienceInput,type CatalogEntry,type CitySounds} from '../../apps/web/src/city-ambience/model';
import sounds from '../../apps/web/src/assets/city-sounds.json' with {type:'json'};
import {ROAD_EDGES,ROAD_NODES} from '../../packages/shared/src/city-roads';
import {activity} from '../../tools/assets/import-city-sounds.mjs';

const catalog=sounds as unknown as CitySounds;
const at=(values:Partial<AmbienceInput>):AmbienceInput=>({...DEFAULT_INPUT,...values});
/** A repeatable stream of numbers in [0, 1). */
const seeded=(seed:number)=>()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32;};
// Places by neighbourhood (read off the city's sector table: Centro in the middle with the bar, the park to the south, Jardim Conceição west, the industrial district east).
/** A crossing of the main avenue: a kerb with heavy traffic. */
const AVENUE=ROAD_NODES[ROAD_EDGES.find(edge=>edge.type==='av')!.a]!;
const ZONE_POINTS={centro:[0,0],olaria:[0,250],conceicao:[-300,-150],industrial:[300,0]} as const;

test('every layer and every one-off sound the rules name is published, CC0, with real files behind it',async()=>{
  const beds=new Map(catalog.beds.map(entry=>[entry.id,entry])),spots=new Map(catalog.spots.map(entry=>[entry.id,entry]));
  for(const rule of BEDS)assert.ok(beds.has(rule.id),`camada sem arquivo: ${rule.id}`);
  for(const rule of SPOTS)for(const id of rule.sounds)assert.ok(spots.has(id),`som sem arquivo: ${rule.id}/${id}`);
  assert.equal(new Set([...catalog.beds,...catalog.spots].map(entry=>entry.id)).size,catalog.beds.length+catalog.spots.length,'ids repetidos');
  for(const entry of [...catalog.beds,...catalog.spots]){
    assert.match(entry.url,/^\/audio\/cidade\/[\w-]+\.m4a$/);
    assert.equal(entry.source?.license,'CC0',`${entry.id}: só se publica CC0`);
    assert.ok((await stat(new URL(`../../apps/web/public${entry.url}`,import.meta.url))).size>5_000,`${entry.id}: arquivo vazio`);
    assert.ok(entry.duration>1,entry.id);
    for(const [from,to] of entry.segments??[]){assert.ok(from>=0&&to<=entry.duration+.05&&to-from>=1,`${entry.id}: trecho ${from}-${to} fora do arquivo`);}
  }
  // Layers are long enough to loop for a while without the same few seconds coming back (the crossfade eats four).
  for(const entry of catalog.beds)assert.ok(entry.duration>=30,`${entry.id} curta demais para uma camada`);
});

test('a loop crossfade is equal power and has no jump where the loop closes',()=>{
  // A rising ramp makes any discontinuity obvious: the end must lead into the start as the source itself did.
  const data=Float32Array.from({length:1000},(_,i)=>i/1000);
  const loop=loopWithCrossfade(data,100);
  assert.equal(loop.length,900);
  assert.ok(Math.abs(loop[0]!-data[900]!)<1e-6,'o início do loop é a continuação do fim');
  assert.ok(Math.abs(loop[899]!-data[899]!)<1e-6);
  assert.ok(Math.abs(loop[0]!-loop[899]!)<.0015,'sem degrau na emenda');
  // Equal power for uncorrelated material: the blend's energy stays that of one source.
  const noise=Float32Array.from({length:40000},()=>Math.random()*2-1);
  const blended=loopWithCrossfade(noise,8000),power=(range:Float32Array)=>range.reduce((sum,v)=>sum+v*v,0)/range.length;
  const middle=blended.slice(2000,6000),plain=blended.slice(20000,24000);
  assert.ok(Math.abs(power(middle)/power(plain)-1)<.2,'a mistura mantém a energia');
  assert.equal(loopWithCrossfade(new Float32Array(3),100).length,3,'trecho curto demais é devolvido como está');
});

test('the neighbourhood, hour and weather move the layers the way a city does',()=>{
  const gains=(input:AmbienceInput)=>{const world=worldOf(input);return Object.fromEntries(BEDS.map(rule=>[rule.id,bedGain(rule,world,0)]));};
  const [cx,cz]=ZONE_POINTS.centro,[ox,oz]=ZONE_POINTS.olaria,[ix,iz]=ZONE_POINTS.industrial;
  const noon=gains(at({x:ox,z:oz,hour:13,night:0})),night=gains(at({x:ox,z:oz,hour:23,night:1}));
  assert.ok(noon['dia-a']!>.3&&noon['grilos-a']!<.001,'de dia: trânsito de fundo, sem grilos');
  assert.ok(night['grilos-a']!>.3&&night['dia-a']!<.001,'à noite: grilos, sem o dia');
  const dawn=gains(at({x:ox,z:oz,hour:6,night:.2}));
  assert.ok(dawn['passaros-a']!>noon['passaros-a']!,'o coro de pássaros é do amanhecer');
  assert.ok(gains(at({x:ox,z:oz,hour:13,night:0,rain:1}))['cigarras-a']!<noon['cigarras-a']!*.2,'chuva cala as cigarras');
  assert.ok(gains(at({x:ox,z:oz,hour:22,night:1,rain:1}))['sapos']!>night['sapos']!,'e põe os sapos para cantar');
  assert.ok(gains(at({x:ix,z:iz,hour:13}))['industria']!>.3&&gains(at({x:cx,z:cz,hour:13}))['industria']!<.001,'a fábrica só se ouve no Distrito Industrial');
  assert.ok(gains(at({wind:1}))['vento']!>gains(at({wind:0}))['vento']!*3,'o vento acompanha o clima');
  // A roof overhead brings up the room's own tone.
  assert.equal(gains(at({enclosed:0}))['salao'],0);assert.ok(gains(at({enclosed:1}))['salao']!>.3);
  for(const input of [at({}),at({hour:3,night:1,rain:1,storm:1,wind:1}),at({x:390,z:-390})])for(const rule of BEDS)assert.ok(Number.isFinite(bedGain(rule,worldOf(input),123))&&bedGain(rule,worldOf(input),123)>=0,rule.id);
});

test('street noise belongs to the streets: loud at a kerb, gone far from any',()=>{
  const [nx,nz]=AVENUE;
  const onStreet=worldOf(at({x:nx,z:nz}));
  assert.ok(onStreet.road>.2,`junto da via: ${onStreet.road}`);
  const far=[[0,0],[390,390],[-390,390],[390,-390],[-390,-390],[200,0],[0,200],[-200,0],[0,-200]].map(([x,z])=>worldOf(at({x:x!,z:z!})).road);
  assert.ok(Math.min(...far)<onStreet.road,'em algum ponto longe das vias o trânsito é menor');
});

test('distance and direction: nearer is louder and brighter, and the pan follows where the listener looks',()=>{
  assert.equal(distanceGain(0),1);assert.ok(distanceGain(40)>distanceGain(200)&&distanceGain(200)>distanceGain(600));
  assert.ok(distanceCutoff(20)>distanceCutoff(300)&&distanceCutoff(2000)>=1200&&distanceCutoff(0)<=15500);
  // Looking along +Z, the listener's right hand is toward -X (the game's axes, Y up).
  const looking={x:0,z:0,fx:0,fz:1};
  assert.ok(panOf(looking,-30,0)>.5&&panOf(looking,30,0)<-.5&&Math.abs(panOf(looking,0,30))<.01);
  // Turning to face the other way swaps the ears for the same place.
  assert.ok(panOf({...looking,fz:-1},-30,0)<-.5);
  assert.equal(panOf(looking,0,0),0);
});

function simulate(input:AmbienceInput,minutes:number,seed:number,configure?:(second:number)=>AmbienceInput){
  const entries=new Map<string,CatalogEntry>(catalog.spots.map(entry=>[entry.id,entry]));
  const scheduler=new SpotScheduler(entries,seeded(seed)),calls:Array<{second:number;kind:string;sound:string;distance:number}>=[];
  const playing:number[]=[];
  for(let second=0;second<minutes*60;second+=.5){
    const current=configure?configure(second):input;
    while(playing.length&&playing[0]!<=second)playing.shift();
    for(const call of scheduler.step(second,current,worldOf(current),playing.length,()=>true)){
      calls.push({second,kind:call.rule.id,sound:call.sound,distance:call.placement.distance});
      assert.ok(call.duration>0&&call.gain>0&&call.gain<1.2&&call.offset>=0,JSON.stringify(call));
      playing.push(second+call.duration);playing.sort((a,b)=>a-b);
    }
  }
  return calls;
}

test('one-off sounds are spread out, varied, never the same recording twice running, and fit the place and hour',()=>{
  const [ox,oz]=ZONE_POINTS.olaria;
  const calls=simulate(at({x:ox,z:oz,hour:6,night:.2}),20,7);
  assert.ok(calls.length>=20&&calls.length<=220,`quantidade plausível em 20 minutos: ${calls.length}`);
  for(let i=1;i<calls.length;i++)assert.ok(calls[i]!.second-calls[i-1]!.second>=3-1e-9,'espaçamento mínimo entre sons');
  const kinds=new Set(calls.map(call=>call.kind));assert.ok(kinds.size>=6,`variedade: ${[...kinds]}`);
  const byKind=new Map<string,string[]>();for(const call of calls)byKind.set(call.kind,[...(byKind.get(call.kind)??[]),call.sound]);
  const single=new Set(SPOTS.filter(rule=>rule.sounds.length<2).map(rule=>rule.id));
  for(const [kind,list] of byKind)if(!single.has(kind))for(let i=1;i<list.length;i++)assert.notEqual(list[i],list[i-1],`${kind}: mesmo som duas vezes seguidas`);
  // Roosters belong to the morning, and kids to the day in a park.
  assert.ok(calls.some(call=>call.kind==='galo'),'galo ao amanhecer');
  const night=simulate(at({x:ox,z:oz,hour:23,night:1}),20,8);
  assert.ok(!night.some(call=>call.kind==='criancas'||call.kind==='campainha'||call.kind==='martelo'),'nada de crianças nem obra à noite');
  assert.ok(night.some(call=>call.kind==='cao'||call.kind==='urutau'),'à noite, cães e aves noturnas');
});

test('weather and place gate the one-offs: a storm silences birdsong and kids, and no street means no cars',()=>{
  const [ox,oz]=ZONE_POINTS.olaria;
  const storm=simulate(at({x:ox,z:oz,hour:14,night:0,rain:1,storm:1}),20,3);
  assert.ok(!storm.some(call=>call.kind==='criancas'||call.kind==='campainha'||call.kind==='aviao'),'tempestade');
  const clear=simulate(at({x:ox,z:oz,hour:14,night:0}),20,3);
  assert.ok(clear.filter(call=>call.kind==='passaro'||call.kind==='criancas').length>storm.filter(call=>call.kind==='passaro'||call.kind==='criancas').length);
  // Passing traffic is placed on a real street, at a distance the rule allows.
  const [nx,nz]=AVENUE,busy=simulate(at({x:nx,z:nz,hour:12}),10,5);
  const cars=busy.filter(call=>call.kind==='carro');assert.ok(cars.length>=8,`carros numa via: ${cars.length}`);
  for(const call of cars)assert.ok(call.distance>=15-1e-9&&call.distance<=130+1e-9);
});

test('the scheduler is deterministic for a seed and never starts more than its limit at once',()=>{
  const [ox,oz]=ZONE_POINTS.conceicao;
  const first=simulate(at({x:ox,z:oz,hour:7}),15,11),again=simulate(at({x:ox,z:oz,hour:7}),15,11);
  assert.deepEqual(first,again);
  // A listener who sprints through every hour of the day in a minute still gets bounded, finite scheduling.
  const hurried=simulate(at({}),5,2,second=>at({x:ox,z:oz,hour:(second/12)%24,night:Math.abs(Math.cos(second/12/24*Math.PI))}));
  assert.ok(hurried.length<400);
});

test('activity finds the stretches where something happens, padded and merged, and falls back to the whole file',()=>{
  const quiet=-50,db=Array.from({length:240},()=>quiet);
  for(let i=40;i<48;i++)db[i]=-30;       // a bark at 10-12 s
  for(let i=60;i<64;i++)db[i]=-32;       // its answer 3 s later: separate
  for(let i=150;i<152;i++)db[i]=-34;     // too short on its own, still kept with its padding
  const segments=activity(db);
  assert.ok(segments.length>=2);
  assert.ok(segments[0]![0]<10&&segments[0]![1]>12,'o primeiro latido, com folga dos dois lados');
  for(const [from,to] of segments){assert.ok(from>=0&&to<=60&&to>from);}
  assert.deepEqual(activity(Array.from({length:240},()=>-40)),[[0,60]],'sem eventos: o arquivo todo');
  assert.deepEqual(activity([-40,-40]),[[0,.5]]);
});
