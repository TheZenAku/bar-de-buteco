import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FULL_HANDLING,MOTO,MOTO_CRANK_MS,MOTO_ENGINE,MOTO_PARTS,MOTO_REPAIR,NEW_MOTO_PARTS,advanceMoto,canRepairMoto,itemById,motoCrank,motoHandling,motoHitArea,motoLampLevel,motoPartStatus,motoStallChance,motoStartChance,motoStrikeHp,parkedMoto,readMotoParts,repairOf,motoRepairInteraction,stepMoto,wearMotoParts,writeMotoParts,type MotoBody,type MotoIntent,type MotoParts} from '@bar/shared';
import {MOTO_CLIPS,engineClip,engineMix,roughness} from '../../apps/web/src/engine/moto-sound';

const OPEN={x:-60,z:7};
const at=(speed=0):MotoBody=>({x:OPEN.x,y:0,z:OPEN.z,yaw:Math.PI/2,pitch:0,speed,steer:0});
const THROTTLE:MotoIntent={throttle:1,steer:0,brake:false};
const parts=(changes:Partial<MotoParts>={})=>({...readMotoParts(NEW_MOTO_PARTS),...changes});
const handled=(changes:Partial<MotoParts>={},engine:number=MOTO_ENGINE.ON,id='moto-2')=>motoHandling({id,engine,parts:writeMotoParts(parts(changes))});
/** How fast it ends up going, with the throttle open for this long on an open street. */
function topSpeed(handling=FULL_HANDLING,seconds=12):number {
  let body=at();
  for(let i=0;i<seconds*20;i++)body={...stepMoto(body,THROTTLE,.05,[],handling),x:OPEN.x,z:OPEN.z};
  return body.speed;
}

test('the parts travel as a short text, and what is missing or strange reads as new',()=>{
  assert.deepEqual(readMotoParts(NEW_MOTO_PARTS),parts());
  const worn=parts({motor:12,bau:0});
  assert.deepEqual(readMotoParts(writeMotoParts(worn)),worn);
  assert.equal(readMotoParts('').motor,100);
  assert.equal(readMotoParts(undefined).pneu_traseiro,100);
  assert.equal(readMotoParts('abc,300,-5').motor,100);
  assert.equal(readMotoParts('abc,300,-5').bateria,100);
  assert.equal(readMotoParts('abc,300,-5').escapamento,0);
  assert.equal(MOTO_PARTS.length,12);
  for(const part of MOTO_PARTS)for(const state of ['good','worn','bad','dead'] as const)assert.ok(part[state],`${part.id} says what ${state} means`);
  assert.equal(motoPartStatus(100),'good');assert.equal(motoPartStatus(50),'worn');assert.equal(motoPartStatus(10),'bad');assert.equal(motoPartStatus(0),'dead');
});

test('a bike in good shape rides exactly as it always did; each damaged part changes what it should',()=>{
  assert.deepEqual(handled(),FULL_HANDLING);
  assert.deepEqual(advanceMoto(at(5),THROTTLE,.05,[],handled()),advanceMoto(at(5),THROTTLE),'New parts change nothing in the step');
  // Worn is not yet broken.
  assert.deepEqual(handled({motor:60,freios:70,pneu_dianteiro:25,direcao:35,suspensao:35}),FULL_HANDLING);
  assert.ok(Math.abs(topSpeed()-MOTO.TOP_SPEED)<.3);
  // The engine: less power, and no drive at all when it is not running. The brakes still work.
  assert.ok(topSpeed(handled({motor:10}))<MOTO.TOP_SPEED*.85,'A tired engine does not reach top speed');
  assert.equal(topSpeed(handled({},MOTO_ENGINE.OFF)),0,'Engine off: W does nothing');
  assert.equal(topSpeed(handled({},MOTO_ENGINE.CRANKING)),0,'Nor while it is cranking');
  const off=handled({},MOTO_ENGINE.OFF),rolling=stepMoto(at(10),{throttle:-1,steer:0,brake:false},.05,[],off);
  assert.ok(rolling.speed<10-.3,'Engine off, the brake still brakes');
  assert.equal(stepMoto(at(),{throttle:-1,steer:0,brake:false},.05,[],off).speed,0,'And there is no reverse');
  // A flat tyre holds it back.
  assert.ok(topSpeed(handled({pneu_traseiro:0}))<MOTO.TOP_SPEED*.75);
  assert.ok(topSpeed(handled({pneu_dianteiro:0}))<MOTO.TOP_SPEED*.9);
  // No brakes: it takes much longer to stop.
  const stopping=(handling=FULL_HANDLING)=>{let body=at(12),steps=0;while(body.speed>.01&&steps<400){body={...stepMoto(body,{throttle:-1,steer:0,brake:false},.05,[],handling),x:OPEN.x,z:OPEN.z};steps++;}return steps;};
  assert.ok(stopping(handled({freios:0}))>stopping()*2,'Stopping takes more than twice as long');
  // A bent fork pulls with the bars straight, always the same way on the same bike; a good one does not.
  const pull=(handling:typeof FULL_HANDLING)=>{let body=at(6);for(let i=0;i<20;i++)body={...stepMoto(body,{throttle:0,steer:0,brake:false},.05,[],handling),speed:6,x:OPEN.x,z:OPEN.z};return body.yaw-Math.PI/2;};
  assert.equal(pull(FULL_HANDLING),0);
  const bent=handled({direcao:0});
  assert.ok(Math.abs(pull(bent))>.05,`It pulled ${pull(bent)}`);
  assert.equal(Math.sign(pull(handled({direcao:0},MOTO_ENGINE.ON,'moto-3'))),-Math.sign(pull(bent)),'Bikes differ in which way');
  // Loose suspension and a soft front tyre: less turn.
  const turning=(handling:typeof FULL_HANDLING)=>{let body=at(6);for(let i=0;i<20;i++)body={...stepMoto(body,{throttle:0,steer:1,brake:false},.05,[],handling),speed:6,x:OPEN.x,z:OPEN.z};return Math.abs(body.yaw-Math.PI/2);};
  assert.ok(turning(handled({suspensao:0}))<turning(FULL_HANDLING)*.9);
  assert.ok(turning(handled({pneu_dianteiro:0}))<turning(FULL_HANDLING)*.9);
});

test('starting: certain when healthy, chancy when tired, impossible when dead, and each failure names its clip',()=>{
  assert.equal(motoStartChance(parts()),1);
  assert.equal(motoCrank(parts(),()=>.999),0,'A healthy bike always catches');
  assert.ok(motoStartChance(parts({motor:25}))>0&&motoStartChance(parts({motor:25}))<1);
  assert.ok(motoStartChance(parts({motor:10}))<motoStartChance(parts({motor:40})),'Worse is less likely');
  assert.equal(motoStartChance(parts({motor:0})),0);
  assert.equal(motoStartChance(parts({bateria:0})),0);
  // A dead battery only clicks the relay; a tired engine turns over without catching.
  assert.equal(motoCrank(parts({bateria:0})),2);
  for(const roll of [0,.2,.4,.6,.8,.99]){let calls=0;const clip=motoCrank(parts({motor:0}),()=>calls++?roll:.99);assert.ok([1,3,4].includes(clip),`Clip ${clip}`);}
  // Stalling: only a badly worn engine, and more so the worse it is.
  assert.equal(motoStallChance(parts()),0);assert.equal(motoStallChance(parts({motor:35})),0);
  assert.ok(motoStallChance(parts({motor:5}))>motoStallChance(parts({motor:30})));
  assert.ok(motoStallChance(parts({motor:30}))>0);
});

test('a blow wears the parts where it landed, more when harder, more through a broken fairing, and never below zero',()=>{
  const fixed=()=>.5;
  assert.equal(motoHitArea(0,0,-1),'front');assert.equal(motoHitArea(0,0,1),'rear');assert.equal(motoHitArea(0,1,0),'side');
  assert.equal(motoHitArea(Math.PI/2,-1,0),'front');
  assert.deepEqual(wearMotoParts(parts(),1,'front',fixed),parts(),'A touch does not mark it');
  const soft=wearMotoParts(parts(),4,'front',fixed),hard=wearMotoParts(parts(),15,'front',fixed);
  assert.ok(hard.pneu_dianteiro<soft.pneu_dianteiro&&soft.pneu_dianteiro<100);
  assert.ok(hard.farol<hard.lanterna,'Front: the headlight, not the tail lamp');
  const rear=wearMotoParts(parts(),15,'rear',fixed);
  assert.ok(rear.lanterna<rear.farol&&rear.pneu_traseiro<rear.pneu_dianteiro,'Rear: the other way round');
  assert.ok(wearMotoParts(parts(),15,'side',fixed).carenagem<wearMotoParts(parts(),15,'side',fixed).motor);
  const shielded=wearMotoParts(parts(),15,'front',fixed),bare=wearMotoParts(parts({carenagem:0}),15,'front',fixed);
  assert.ok(bare.motor<shielded.motor,'Without the fairing the engine takes more');
  // It takes more than one crash to ruin the engine: the point is that the failures build up.
  assert.ok(hard.motor>60,`One full crash leaves it at ${hard.motor}`);
  let crashes=0,state=parts();
  while(state.motor>35&&crashes<30){state=wearMotoParts(state,12,'front',fixed);crashes++;}
  assert.ok(crashes>=3&&crashes<=8,`${crashes} hard crashes until the engine starts dying`);
  for(let i=0;i<40;i++)state=wearMotoParts(state,15,'front',()=>1);
  for(const part of MOTO_PARTS)assert.equal(state[part.id]>=0,true);
  assert.equal(state.motor,0);
  // The dice change the marks, not the size of them.
  const low=wearMotoParts(parts(),10,'side',()=>0),high=wearMotoParts(parts(),10,'side',()=>1);
  assert.ok(low.carenagem>high.carenagem);
});

test('being run over takes life by the speed of the bike, and a full tank survives one hit',()=>{
  assert.ok(motoStrikeHp(MOTO.CRASH_SPEED)>=4&&motoStrikeHp(MOTO.CRASH_SPEED)<20,`Slowest that counts: ${motoStrikeHp(MOTO.CRASH_SPEED)}`);
  assert.ok(motoStrikeHp(8)<motoStrikeHp(12));
  assert.ok(motoStrikeHp(MOTO.TOP_SPEED)>=60&&motoStrikeHp(MOTO.TOP_SPEED)<100,`Flat out: ${motoStrikeHp(MOTO.TOP_SPEED)}`);
  assert.equal(motoStrikeHp(-8),motoStrikeHp(8),'In reverse too');
  assert.equal(motoStrikeHp(40),motoStrikeHp(MOTO.TOP_SPEED),'Never more than flat out');
});

test('repairing: who may, the piece it takes, and the working state',()=>{
  const moto=parkedMoto({id:'moto-1',x:OPEN.x,y:0,z:OPEN.z,yaw:0});
  assert.ok(canRepairMoto(moto,{x:OPEN.x+1,y:0,z:OPEN.z}));
  assert.ok(!canRepairMoto(moto,{x:OPEN.x+4,y:0,z:OPEN.z}),'Too far');
  assert.ok(!canRepairMoto({...moto,riderId:'a'},{x:OPEN.x+1,y:0,z:OPEN.z}),'Ridden');
  assert.ok(!canRepairMoto({...moto,speed:2},{x:OPEN.x+1,y:0,z:OPEN.z}),'Moving');
  assert.ok(!canRepairMoto({...moto,phase:'tumble'},{x:OPEN.x+1,y:0,z:OPEN.z}),'Falling');
  assert.ok(canRepairMoto({...moto,phase:'down'},{x:OPEN.x+1,y:0,z:OPEN.z}),'Lying there is fine');
  assert.deepEqual(repairOf(motoRepairInteraction('moto-7','pneu_traseiro')),{motoId:'moto-7',part:'pneu_traseiro'});
  assert.equal(repairOf('moto:moto-7'),undefined);assert.equal(repairOf(''),undefined);
  const piece=itemById(MOTO_REPAIR.item)!;
  assert.equal(piece.category,'peca');assert.equal(piece.loseOnFaint,false);
  assert.ok(MOTO_REPAIR.amount>0&&MOTO_REPAIR.ms>0);
});

test('lamps: steady when whole, flickering when bad, out when broken or with no battery',()=>{
  assert.equal(motoLampLevel(100,100,1234),1);
  assert.equal(motoLampLevel(0,100,1234),0);assert.equal(motoLampLevel(100,0,1234),0);
  const levels=new Set(Array.from({length:500},(_,i)=>motoLampLevel(5,100,i*17)));
  assert.ok(levels.has(1)&&levels.has(.25),'It comes and goes');
  assert.equal(motoLampLevel(5,100,987),motoLampLevel(5,100,987),'The same on every screen');
});

test('the engine sound: the mix follows throttle and speed, the clips follow the room',()=>{
  const off=engineMix(false,1,1);
  assert.equal(off.idle,0);assert.equal(off.drive,0);
  const idling=engineMix(true,0,0);
  assert.equal(idling.idle,1);assert.equal(idling.drive,0);
  const revving=engineMix(true,1,0),cruising=engineMix(true,1,1),coasting=engineMix(true,0,1);
  assert.ok(revving.drive>0&&revving.idle<.1,'Opening the throttle takes over from the idle');
  assert.ok(cruising.drive>revving.drive);
  assert.ok(cruising.driveRate>revving.driveRate,'Faster is higher');
  assert.ok(coasting.drive<cruising.drive&&coasting.driveRate<cruising.driveRate,'Letting go falls');
  assert.ok(coasting.idle===0,'And it is not idling at speed');
  const {ON,OFF,CRANKING}=MOTO_ENGINE;
  assert.equal(engineClip({engine:OFF},{engine:CRANKING,crank:0}),'liga');
  for(const failure of [1,2,3,4])assert.equal(engineClip({engine:OFF},{engine:CRANKING,crank:failure}),`falha-${failure}`);
  assert.equal(engineClip({engine:ON},{engine:OFF,crank:0}),'desliga');
  assert.equal(engineClip({engine:CRANKING},{engine:OFF,crank:2}),undefined,'A failure already played');
  assert.equal(engineClip({engine:CRANKING},{engine:ON,crank:0}),undefined,'Catching is already in liga');
  assert.equal(engineClip({engine:ON},{engine:ON,crank:0}),undefined);
  assert.equal(roughness(100,3),1);
  assert.ok(Array.from({length:200},(_,i)=>roughness(5,i*.1)).some(level=>level<1),'A tired engine does not hold its note');
});

test('every clip is published, mono, and a try at starting lasts as long as its clip',()=>{
  const wav=(clip:string)=>{
    const bytes=readFileSync(new URL(`../../apps/web/public/moto/sound/${clip}.wav`,import.meta.url));
    assert.equal(bytes.toString('latin1',0,4),'RIFF');
    return {channels:bytes.readUInt16LE(22),rate:bytes.readUInt32LE(24),seconds:bytes.readUInt32LE(40)/2/bytes.readUInt32LE(24)};
  };
  for(const clip of MOTO_CLIPS){const {channels,seconds}=wav(clip);assert.equal(channels,1,clip);assert.ok(seconds>1,`${clip} is ${seconds} s`);}
  for(const failure of [1,2,3,4])assert.ok(Math.abs(wav(`falha-${failure}`).seconds*1000-MOTO_CRANK_MS[failure]!)<80,`Failure ${failure}: ${wav(`falha-${failure}`).seconds} s against ${MOTO_CRANK_MS[failure]} ms`);
  assert.ok(wav('liga').seconds*1000>MOTO_CRANK_MS[0],'liga goes on over the engine catching');
});
