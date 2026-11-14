import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {CITY_MARKERS,movePlayer,solidColliders,syncFactoryGates} from '@bar/shared';
import {FACTORY_GATES,FACTORY_INTERCOM,GATE_HOLD_OPEN_S,GATE_HYSTERESIS,GATE_PERSON_SIZE,GATE_VEHICLE_SIZE,SWING_HYSTERESIS,gateBoxAt,gateById,gateEase,gateHeldOpen,gateOpenness,gateRetime,gateSolid,gateWish,inGateWay,type GateBody,type GateState} from '@bar/shared/factory';
import {BarRoom} from '../src/BarRoom.js';

// ---- a clock the tests move, and the plant's leaves as the room keeps them ----
const realNow=Date.now;let clock=1_800_000_000_000;
Date.now=()=>clock;
after(()=>{Date.now=realNow;});
const states=new Map<string,GateState&{side:number}>();
const reset=()=>{for(const gate of FACTORY_GATES)states.set(gate.id,{open:false,changedAt:0,side:0});syncFactoryGates(id=>states.get(id),clock,0);};
const sync=(tolerance=.02)=>syncFactoryGates(id=>states.get(id),clock,tolerance);
const boxOf=(id:string)=>solidColliders().find(box=>box.id===id)!;
/** Leaf `id` told to open (or shut) `fraction` of its run ago. */
const moving=(id:string,open:boolean,fraction:number,side=0)=>{const gate=gateById(id)!;states.set(id,{open,changedAt:clock-Math.round(fraction*gate.seconds*1000),side});sync(0);};

const GATE=gateById('EB_Portao')!,DOOR=gateById('EB_Porta_Auto_Folha')!,OFFICE=gateById('EB_Oficina_Porta')!,ROLL=gateById('EB_Oficina_Portao_Enrolar')!,ENTRY=gateById('EB_Porta_Entrada')!;
const SWING=['EB_Porta_Impacto_Preparo_E','EB_Porta_Impacto_Preparo_D','EB_Porta_Impacto_Ensaque_E','EB_Porta_Impacto_Ensaque_D'].map(id=>gateById(id)!);
const [PREP_E,PREP_D]=SWING as [typeof GATE,typeof GATE];
const person=(x:number,z:number):GateBody=>({x,z,size:GATE_PERSON_SIZE});
const truck=(x:number,z:number):GateBody=>({x,z,size:GATE_VEHICLE_SIZE,vehicle:true});
const run=(from:{x:number;z:number},dx:number,dz:number,seconds:number)=>{
  let p:{x:number;y:number;z:number}={...from,y:.17};
  for(let i=0;i<seconds*20;i++)p=movePlayer(p,{dx,dz,running:true,jump:false},.05);
  return p;
};
const near=(a:number,b:number,tolerance=1e-6)=>Math.abs(a-b)<=tolerance;

test('as nove folhas e o interfone vêm do JSON v2 do Blender, com o tipo e o modo de cada uma',()=>{
  assert.deepEqual(FACTORY_GATES.map(gate=>`${gate.id}:${gate.kind}:${gate.mode}`).sort(),[
    'EB_Oficina_Porta:giratoria:manual','EB_Oficina_Portao_Enrolar:enrolar:manual','EB_Porta_Auto_Folha:correr:automatica','EB_Porta_Entrada:giratoria:manual',
    'EB_Porta_Impacto_Ensaque_D:giratoria:impacto','EB_Porta_Impacto_Ensaque_E:giratoria:impacto','EB_Porta_Impacto_Preparo_D:giratoria:impacto','EB_Porta_Impacto_Preparo_E:giratoria:impacto',
    'EB_Portao:correr:interfone'].sort());
  assert.deepEqual([...GATE.origin],[362.42,.17,-48.6]);assert.deepEqual([...GATE.axis],[0,0,-1]);assert.deepEqual([GATE.travel,GATE.radius,GATE.seconds],[9,11,7]);
  assert.deepEqual([...GATE.box.min,...GATE.box.max],[362.35,.15,-58.53,362.49,2.37,-48.56]);
  assert.deepEqual([...DOOR.box.min,...DOOR.box.max],[346,.15,-62.4,347,2.3,-62.3]);
  assert.deepEqual([PREP_E.angle,PREP_D.angle,ENTRY.angle,OFFICE.angle],[80,-80,-95,90]);assert.ok(SWING.every(gate=>gate.swing&&gate.seconds===.5));
  assert.ok(!OFFICE.swing&&!ENTRY.swing);
  assert.deepEqual([ROLL.openScale,ROLL.travel,ROLL.seconds],[.04,2.622,2.4]);
  assert.deepEqual([FACTORY_INTERCOM.x,FACTORY_INTERCOM.y,FACTORY_INTERCOM.z,FACTORY_INTERCOM.reach],[364.27,.15,-58.72,2.6]);
  assert.equal(FACTORY_INTERCOM.lamp,'EB_Interfone_Lampada');assert.equal(GATE_HOLD_OPEN_S,30);
});

test('a posição da folha é uma função do estado e do relógio; virar no meio do caminho continua de onde parou',()=>{
  const open:GateState={open:true,changedAt:clock};
  assert.equal(gateOpenness(GATE,{open:false,changedAt:0},clock),0,'ninguém mexeu ainda: fechada');
  assert.equal(gateOpenness(GATE,{open:true,changedAt:0},clock),1,'estado inicial aberto');
  assert.equal(gateOpenness(GATE,open,clock),0);assert.ok(near(gateOpenness(GATE,open,clock+GATE.seconds*500),.5));assert.equal(gateOpenness(GATE,open,clock+GATE.seconds*5000),1);
  assert.equal(gateOpenness(GATE,open,clock-500),0,'relógio do cliente um pouco atrás: não passa de fechada');
  assert.ok(near(gateEase(.5),.5)&&gateEase(0)===0&&gateEase(1)===1&&gateEase(.25)<.25);
  // Opening for a third of the run, then told to shut: it shuts from there, not from fully open.
  const half:GateState={open:true,changedAt:clock};const later=clock+Math.round(GATE.seconds*1000/3);
  const turned:GateState={open:false,changedAt:gateRetime(GATE,half,false,later)};
  assert.ok(near(gateOpenness(GATE,turned,later),1/3,.002),`continua dos 33% (veio ${gateOpenness(GATE,turned,later)})`);
  assert.ok(near(gateOpenness(GATE,turned,later+Math.round(GATE.seconds*1000/6)),1/6,.002));
  // And told to open again right after, from the same third.
  const again:GateState={open:true,changedAt:gateRetime(GATE,turned,true,later)};assert.ok(near(gateOpenness(GATE,again,later),1/3,.002));
});

test('a caixa do portão acompanha a folha: some do lugar onde ela já não está e continua onde ela está; servidor e cliente montam a mesma',()=>{
  reset();
  assert.deepEqual([boxOf(GATE.id).x,boxOf(GATE.id).z],[GATE.collider.x,GATE.collider.z],'fechada: a caixa do JSON');
  const shut=run({x:366,z:-50},-1,0,3),shutLow=run({x:366,z:-55},-1,0,3);
  assert.ok(shut.x>GATE.box.max[0]&&shutLow.x>GATE.box.max[0],'fechado barra em qualquer ponto do vão');
  for(const fraction of [.2,.4,.5,.7,.9,1]){
    moving(GATE.id,true,fraction);
    const shift=GATE.travel*gateEase(fraction),box=boxOf(GATE.id);
    assert.ok(near(box.z,GATE.collider.z-shift,.0001),`a ${fraction*100}% a caixa andou ${shift.toFixed(2)} m (z=${box.z.toFixed(2)})`);
    assert.ok(near(box.x,GATE.collider.x)&&near(box.hz,GATE.collider.hz)&&near(box.hx,GATE.collider.hx),'só desliza: o tamanho não muda');
    // The client works it out from the JSON of the synced state and the synced clock: the very same box.
    const wire=JSON.parse(JSON.stringify(states.get(GATE.id)))as GateState;
    assert.deepEqual(gateSolid(GATE,wire,clock),box,'cliente = servidor');
  }
  // At half way the leaf spans z -63.03..-53.06: the opening's far end (z -50) is free, its near end (-55) is still behind the leaf.
  moving(GATE.id,true,.5);
  const high=run({x:366,z:-50},-1,0,3),low=run({x:366,z:-55},-1,0,3);
  assert.ok(high.x<GATE.box.min[0]-1,`passou pela parte livre do vão (x=${high.x.toFixed(2)})`);
  assert.ok(low.x>GATE.box.max[0],`bateu na folha, que ainda está ali (x=${low.x.toFixed(2)})`);
  moving(GATE.id,true,1);
  assert.ok(run({x:366,z:-55},-1,0,3).x<GATE.box.min[0]-1,'aberto: o vão todo livre');
  // Shutting: the box comes back with the leaf and blocks the part it covers again.
  moving(GATE.id,false,.5);
  assert.ok(near(boxOf(GATE.id).z,GATE.collider.z-GATE.travel*gateEase(.5),.0001));
  reset();
});

test('a caixa só é refeita quando anda mais de 2 cm; parada nas pontas, cai exatamente onde manda',()=>{
  reset();
  moving(GATE.id,true,.5);
  assert.equal(sync(),false,'mesma posição: nada a refazer');
  clock+=5;assert.equal(sync(),false,'5 ms depois a folha andou milímetros: continua a mesma caixa');
  clock+=900;assert.equal(sync(),true,'quase um segundo depois: andou mais de 2 cm');
  moving(GATE.id,true,1);assert.equal(boxOf(GATE.id).z,GATE.collider.z-GATE.travel,'chegou: exatamente no fim do curso');
  assert.equal(sync(),false);
  reset();assert.equal(boxOf(GATE.id).z,GATE.collider.z,'fechou: exatamente a caixa do JSON');
});

test('a porta de vai-e-vem abre para o lado de quem não empurra; a caixa gira junto e sai do caminho',()=>{
  reset();
  const origin=PREP_E.origin,closedBox=gateBoxAt(PREP_E,0);
  assert.equal(closedBox,PREP_E.collider);
  const toward=gateBoxAt(PREP_E,1,1),back=gateBoxAt(PREP_E,1,-1);
  assert.ok(toward.z<origin[2]-.3,'lado +1: a folha vai para -z (+y do Blender), como no JSON');
  assert.ok(back.z>origin[2]+.3,'lado -1: para o lado oposto');
  assert.ok(near(toward.turn!.ux,Math.cos(80*Math.PI/180))&&near(toward.turn!.uz,-Math.sin(80*Math.PI/180)),'a caixa gira 80 graus de verdade (não vira um quadrado)');
  assert.ok(near(toward.x,origin[0]+(PREP_E.collider.x-origin[0])*Math.cos(80*Math.PI/180)+(PREP_E.collider.z-origin[2])*Math.sin(80*Math.PI/180),1e-9));
  assert.ok(toward.hz>.3&&toward.hx<.15,'o envelope acompanha: comprido em z, fino em x');
  // The right-hand leaf turns the other way round its own hinge: both swing to the same side (a pair).
  const right=gateBoxAt(PREP_D,1,1);assert.ok(right.z<PREP_D.origin[2]-.3,'a folha D também vai para -z com o lado +1');
  // Walking: the pair shut stops a person; swung open (side +1) lets her through.
  const wall=run({x:343.6,z:-60},0,-1,3);assert.ok(wall.z>PREP_E.collider.z+.3,`fechadas barram (z=${wall.z.toFixed(2)})`);
  for(const gate of [PREP_E,PREP_D])moving(gate.id,true,1,1);
  const through=run({x:343.6,z:-60},0,-1,3);assert.ok(through.z<PREP_E.collider.z-1,`abertas deixam passar (z=${through.z.toFixed(2)})`);
  // Half way, the leaf's box is rotated by half the angle (eased): 40 degrees at 50% of the time.
  moving(PREP_E.id,true,.5,1);
  const half=boxOf(PREP_E.id);assert.ok(near(Math.acos(half.turn!.ux)*180/Math.PI,80*gateEase(.5),.01));
  reset();
});

test('a porta de vai-e-vem escolhe o lado por quem empurra, não abre sobre alguém no arco e segura aberta enquanto passam',()=>{
  const shut:GateState={open:false,changedAt:0},z=PREP_E.origin[2],x=PREP_E.collider.x;
  assert.deepEqual(gateWish(PREP_E,shut,clock,[]),{open:false,side:1});
  const south=gateWish(PREP_E,shut,clock,[person(x,z+1)]);assert.deepEqual(south,{open:true,side:1},'quem está no lado +z empurra para -z: lado +1');
  const north=gateWish(PREP_E,shut,clock,[person(x,z-1)]);assert.deepEqual(north,{open:true,side:-1},'do outro lado o sinal inverte');
  assert.equal(gateWish(PREP_E,shut,clock,[person(x,z+PREP_E.radius+.4)]).open,false,'longe do raio não empurra');
  // Somebody standing where the leaf would sweep (on the far side) keeps it shut; the pusher on the near side does not count.
  assert.equal(gateWish(PREP_E,shut,clock,[person(x,z+.5),person(x+.4,z-.7)]).open,false,'quem empurra está mais perto e alguém está no arco: a porta não abre em cima dele');
  assert.equal(gateWish(PREP_E,shut,clock,[truck(x,z+1)]).open,false,'veículo não empurra porta');
  // Open: stays while a person is within the radius plus the hysteresis, and keeps its side; free doorway: shuts.
  const open:GateState={open:true,changedAt:clock-1000,side:-1};
  assert.deepEqual(gateWish(PREP_E,open,clock,[person(x,z+PREP_E.radius+SWING_HYSTERESIS-.1)]),{open:true,side:-1},'segue com o lado em que abriu');
  assert.equal(gateWish(PREP_E,open,clock,[person(x,z+PREP_E.radius+SWING_HYSTERESIS+.3)]).open,false);
  // Nobody is shut in: a body in the arc holds the leaf open (and a shutting leaf that has barely opened reopens), one far away does not.
  const arc=person(x+.3,z+.7);// side -1 sweeps towards +z
  assert.equal(gateHeldOpen(PREP_E,open,clock,[arc]),true);
  assert.equal(gateHeldOpen(PREP_E,{open:false,changedAt:clock-100,side:-1},clock,[arc]),true,'fechando e já aberta: reabre');
  assert.equal(gateHeldOpen(PREP_E,{open:false,changedAt:clock-PREP_E.seconds*1000-1,side:-1},clock,[arc]),false,'fechada de vez: não abre sozinha por isso');
  assert.equal(gateHeldOpen(PREP_E,open,clock,[person(x+5,z+5)]),false);
  assert.equal(inGateWay(PREP_E,1,person(x+.3,z+.7)),false,'o arco do outro lado não é este');
});

test('a porta automática de vidro abre por aproximação (só gente), com histerese; o portão de veículos nunca',()=>{
  const shut:GateState={open:false,changedAt:0},c=DOOR.centre;
  assert.deepEqual(gateWish(DOOR,shut,clock,[person(c.x,c.z+DOOR.radius-.5)]),{open:true,side:1});
  assert.equal(gateWish(DOOR,shut,clock,[person(c.x,c.z+DOOR.radius+.5)]).open,false);
  assert.equal(gateWish(DOOR,{open:true,changedAt:clock-2000},clock,[person(c.x,c.z+DOOR.radius+GATE_HYSTERESIS-.5)]).open,true);
  assert.equal(gateWish(DOOR,{open:true,changedAt:clock-2000},clock,[person(c.x,c.z+DOOR.radius+GATE_HYSTERESIS+.5)]).open,false);
  assert.equal(gateWish(DOOR,shut,clock,[truck(c.x,c.z)]).open,false,'veículo não abre a porta');
  // The vehicle gate is commanded, never proximity: gateWish just says what it already is.
  const gc=GATE.centre;
  assert.equal(gateWish(GATE,shut,clock,[person(gc.x,gc.z),truck(gc.x+3,gc.z)]).open,false,'gente e caminhão colados nele: fechado');
  assert.equal(gateWish(GATE,{open:true,changedAt:clock},clock,[]).open,true);
  // Under a leaf nothing shuts it: people and trucks both hold it open, near the closed box.
  assert.equal(gateHeldOpen(GATE,{open:true,changedAt:clock-9000},clock,[person(GATE.collider.x,GATE.collider.z+2)]),true);
  assert.equal(gateHeldOpen(GATE,{open:true,changedAt:clock-9000},clock,[truck(GATE.collider.x+2.5,GATE.collider.z)]),true,'caminhão grande a 2,5 m do eixo ainda segura');
  assert.equal(gateHeldOpen(GATE,{open:true,changedAt:clock-9000},clock,[truck(GATE.collider.x+6,GATE.collider.z)]),false);
  assert.equal(gateHeldOpen(GATE,{open:false,changedAt:clock-9000},clock,[person(GATE.collider.x,GATE.collider.z)]),false,'fechado de vez e alguém junto: não abre por isso');
});

test('portão de enrolar: a caixa encolhe para o topo conforme a folha sobe e deixa de barrar quando passa da cabeça',()=>{
  reset();
  const closed=ROLL.collider,top=closed.maxY!,height=top-closed.minY!;
  assert.equal(gateBoxAt(ROLL,0),closed);
  for(const fraction of [.25,.5,.75,1]){
    const eased=gateEase(fraction),box=gateBoxAt(ROLL,eased);
    assert.ok(near(box.maxY!,top)&&near(box.minY!,top-height*(1+(ROLL.openScale-1)*eased),1e-9),`a ${fraction*100}% o topo fica e a base sobe`);
    assert.ok(near(box.x,closed.x)&&near(box.z,closed.z)&&near(box.hz,closed.hz));
  }
  assert.ok(near(gateBoxAt(ROLL,1).minY!,top-height*ROLL.openScale,1e-9));
  const along=(z:number)=>run({x:345.5,z},-1,0,3);
  assert.ok(along(-52.2).x>closed.x+closed.hx,'fechado: barra');
  moving(ROLL.id,true,.3);assert.ok(along(-52.2).x>closed.x+closed.hx,'a 30% ainda está na altura da cabeça');
  moving(ROLL.id,true,1);assert.ok(along(-52.2).x<closed.x-.5,'aberto: passa por baixo');
  reset();
});

test('a peça fixa do setor que é a própria caixa de uma folha (parede do portão de enrolar) deixa de valer: só a caixa da folha manda',()=>{
  reset();
  const ids=solidColliders().filter(box=>Math.abs(box.x-ROLL.collider.x)<.1&&Math.abs(box.z-ROLL.collider.z)<.1).map(box=>box.id);
  assert.deepEqual(ids,[ROLL.id],'nenhum COL_Cid_EB_Parede em cima do portão de enrolar');
  assert.ok(solidColliders().some(box=>box.id==='COL_Cid_EB_Parede.149'),'a parede ao lado continua');
});

// ---- the room: the vehicle gate (intercom and menu), the automatic ones, the manual ones ----
type Fake={id:string;displayName:string;x:number;y:number;z:number;interactionState:string;currentTableId?:string};
type Room={
  gatesTick():void;toggleDoor(player:Fake,id:string):void;
  gateRingBy(presence:unknown,player:Fake):Promise<{ok:boolean;message:string}>;gateControl(presence:unknown,player:Fake,action:'open'|'close'|'dismiss'):{ok:boolean;message:string};
  gateStaff(presence:unknown):Promise<boolean>;gateMenuOpen:boolean;gateHoldUntil:number;gateRing:null|{playerId:string;name:string;at:number};
};
function plant(){
  reset();
  const panel=CITY_MARKERS.Ponto_EB_Painel!;
  const players=new Map<string,Fake>(),npcs=new Map<string,Fake>(),motos=new Map<string,{x:number;z:number}>();
  const sent:Array<{to:string;payload:{action:string;ok:boolean;message:string}}>=[],workers=new Set<string>(),pushes:number[]=[];
  const staff=new Set<string>();
  const room=Object.create(BarRoom.prototype) as Room;
  const fakes:Record<string,unknown>={
    state:{doors:states,players,npcs,motos},factoryWorkers:workers,gateMenuOpen:false,gateHoldUntil:0,gateRing:null,
    sessions:{getByUser:(id:string)=>({client:{send:(_type:string,payload:never)=>sent.push({to:id,payload})}})},
    factory:{note(){},markers:{Ponto_EB_Painel:{xyz_jogo:[panel.x,panel.y,panel.z]}}},pushFactory:()=>{pushes.push(1);},log:()=>undefined,
    gateStaff:async(presence:{ticket:{userId:string}})=>staff.has(presence.ticket.userId),
  };
  for(const [key,value] of Object.entries(fakes))Object.defineProperty(room,key,{value,writable:true,configurable:true});
  const make=(id:string,x:number,z:number):Fake=>{const p={id,displayName:id,x,y:.17,z,interactionState:''};players.set(id,p);return p;};
  return {room,players,npcs,motos,sent,workers,staff,pushes,make,panel,tick:()=>room.gatesTick(),gate:()=>states.get(GATE.id)!};
}
const bell=FACTORY_INTERCOM;

test('portão de veículos: a chegada de gente ou de caminhão não abre; sem ninguém para abrir ele fica fechado',()=>{
  const p=plant();
  p.make('ana',GATE.centre.x,GATE.centre.z);p.motos.set('caminhao',{x:GATE.centre.x+3,z:GATE.centre.z});
  p.tick();assert.equal(p.gate().open,false,'gente e caminhão no vão do lado de fora, nada abre');
  clock+=60_000;p.tick();assert.equal(p.gate().open,false);
  // The control room's glass door still opens for people (it is internal), and only it.
  p.make('bia',DOOR.centre.x,DOOR.centre.z+1);p.tick();
  assert.equal(states.get(DOOR.id)!.open,true);assert.equal(p.gate().open,false);
  reset();
});

test('interfone: dono, gerente e funcionário contratado abrem; abre por 30 s e fecha com o vão livre, sem prender ninguém',async()=>{
  const p=plant();
  const visitor=p.make('func',bell.x,bell.z+.5),presence={ringAt:0,factoryPpe:false,ticket:{userId:'func'}};
  p.staff.add('func');
  const far=await p.room.gateRingBy(presence,{...visitor,x:bell.x+30});assert.equal(far.ok,false);assert.match(far.message,/perto do interfone/);assert.equal(p.gate().open,false);
  const opened=await p.room.gateRingBy(presence,visitor);
  assert.equal(opened.ok,true);assert.equal(opened.message,'Abrindo para você, func.');
  assert.equal(p.gate().open,true,'o jogo reconheceu e abriu o portão');assert.equal(p.gate().changedAt,clock);
  assert.ok(p.room.gateHoldUntil===clock+GATE_HOLD_OPEN_S*1000);
  // The leaf slides out as the clock runs; its box goes with it.
  clock+=GATE.seconds*500;syncFactoryGates(id=>states.get(id),clock,0);assert.ok(near(boxOf(GATE.id).z,GATE.collider.z-GATE.travel*.5,.0001));
  // 29 s later still open; a body in the doorway keeps it open after the 30 s; once it leaves, the gate shuts.
  clock+=25_000;p.tick();assert.equal(p.gate().open,true,'dentro dos 30 s (passaram 28,5)');
  clock+=2_000;p.players.get('func')!.x=GATE.collider.x;p.players.get('func')!.z=GATE.collider.z+1;p.tick();
  assert.equal(p.gate().open,true,'passou dos 30 s mas ela está no vão: segura');
  p.motos.set('caminhao',{x:GATE.collider.x+2.4,z:GATE.collider.z});p.players.get('func')!.x=GATE.collider.x+30;p.tick();
  assert.equal(p.gate().open,true,'o caminhão ainda está no vão');
  p.motos.clear();p.tick();assert.equal(p.gate().open,false,'vão livre e tempo vencido: fecha');
  // Shutting, somebody steps into the doorway: it reopens instead of coming down on them.
  clock+=1_000;p.players.get('func')!.x=GATE.collider.x;p.players.get('func')!.z=GATE.collider.z+1;p.tick();
  assert.equal(p.gate().open,true,'alguém entrou no vão com o portão fechando: reabre');
  reset();
});

test('interfone: quem é de fora só chama (não abre), os operadores em serviço ouvem, e sem operador ninguém atende',async()=>{
  const p=plant();
  const visitor=p.make('visitante',bell.x,bell.z+.5),presence={ringAt:0,factoryPpe:false,ticket:{userId:'visitante'}};
  const nobody=await p.room.gateRingBy(presence,visitor);
  assert.equal(nobody.ok,false);assert.match(nobody.message,/Ninguém atendeu/);assert.equal(p.gate().open,false);assert.equal(p.room.gateRing,null);
  p.workers.add('op');presence.ringAt=0;
  const called=await p.room.gateRingBy(presence,visitor);
  assert.equal(called.ok,true);assert.match(called.message,/^Chamando/);assert.equal(p.gate().open,false,'o portão continua fechado');
  assert.deepEqual(p.sent.map(item=>[item.to,item.payload.action]),[['op','ring']]);assert.match(p.sent[0]!.payload.message,/visitante/);
  assert.ok(p.room.gateRing);
  assert.match((await p.room.gateRingBy(presence,visitor)).message,/acabou de tocar/);
  clock+=61_000;p.tick();assert.equal(p.gate().open,false,'o tempo passa, ninguém abriu');
  assert.equal(p.room.gateRing,null,'a chamada sem resposta caduca');
  reset();
});

test('menu da sala de controle: só com expediente, EPI e perto do painel; aberto fica até alguém fechar; fechar espera o vão livre',async()=>{
  const p=plant(),panel=p.panel;
  const op=p.make('op',panel.x,panel.z),guest={ringAt:0,factoryPpe:true,ticket:{userId:'op'}},visitor=p.make('visitante',bell.x,bell.z+.5),vis={ringAt:0,factoryPpe:false,ticket:{userId:'visitante'}};
  // Not on shift, then without PPE, then away from the panel: refused, in its own words.
  assert.match(p.room.gateControl(guest,op,'open').message,/expediente/i);
  p.workers.add('op');
  assert.match(p.room.gateControl({...guest,factoryPpe:false},op,'open').message,/EPI/);
  const away={...op,x:panel.x+30};assert.equal(p.room.gateControl(guest,away,'open').ok,false);assert.match(p.room.gateControl(guest,away,'open').message,/computador da sala de controle/);
  assert.equal(p.gate().open,false);
  // A visitor's call, dismissed (tells her, does not open); a new call, answered by opening.
  await p.room.gateRingBy(vis,visitor);
  p.sent.length=0;assert.equal(p.room.gateControl(guest,op,'dismiss').ok,true);assert.equal(p.room.gateRing,null);
  assert.deepEqual(p.sent.map(item=>[item.to,item.payload.action,item.payload.ok]),[['visitante','ring.sent',false]]);assert.equal(p.gate().open,false);
  vis.ringAt=0;await p.room.gateRingBy(vis,visitor);p.sent.length=0;
  assert.equal(p.room.gateControl(guest,op,'open').ok,true);
  assert.equal(p.gate().open,true);assert.deepEqual(p.sent.map(item=>[item.to,item.payload.action,item.payload.ok]),[['visitante','ring.sent',true]]);
  // Opened here, it does not shut by itself, however long it takes.
  clock+=10*60_000;p.tick();assert.equal(p.gate().open,true,'aberto pelo menu fica até fecharem');
  // Shutting with somebody in the doorway: it stays open until she leaves.
  const in1=p.make('passante',GATE.collider.x,GATE.collider.z+1);
  const holding=p.room.gateControl(guest,op,'close');assert.match(holding.message,/no vão/);assert.equal(p.gate().open,true);
  in1.x=GATE.collider.x+30;p.tick();assert.equal(p.gate().open,false,'vão livre: fecha');
  // Opened again and the last operator leaves the shift: it shuts by itself.
  p.room.gateControl(guest,op,'open');assert.equal(p.gate().open,true);
  p.workers.clear();p.tick();assert.equal(p.room.gateMenuOpen,false);assert.equal(p.gate().open,false);
  reset();
});

test('porta de impacto na sala: empurrada abre para o lado certo (state.side), segura enquanto há gente e fecha com o vão livre',()=>{
  const p=plant(),z=PREP_E.origin[2];
  const ana=p.make('ana',PREP_E.collider.x,z+1);p.tick();
  const e=states.get(PREP_E.id)!,d=states.get(PREP_D.id)!;
  assert.deepEqual([e.open,e.side,d.open,d.side],[true,1,true,1],'ana vem do lado +z: as duas folhas do par abrem para -z');
  assert.ok(e.changedAt>0);
  // The leaf's box is on its way out of the doorway (the tick synced it).
  clock+=PREP_E.seconds*1000;ana.z=z-1;p.tick();   // she walked through: now she is on the far side, inside the arc
  assert.equal(e.open,true,'ela atravessou e está no arco: segura');
  ana.z=z-4;ana.x=PREP_E.collider.x+6;p.tick();assert.equal(e.open,false,'longe: fecha');
  assert.equal(e.side,1,'o lado fica anotado até a próxima abertura');
  // Somebody comes from the other side: the other way round.
  clock+=5000;p.tick();const bob=p.make('bob',PREP_E.collider.x,z-1);p.tick();
  assert.deepEqual([e.open,e.side],[true,-1],'bob vem do lado -z: abre para +z');
  assert.ok(boxOf(PREP_E.id).z>z-.2,'a caixa foi para o lado +z, junto');
  void bob;
  reset();
});

test('porta manual (E): abre e fecha com a mesma animação, a caixa gira junto, e não fecha nem abre em cima de ninguém',()=>{
  const p=plant();
  const c=OFFICE.collider,user=p.make('ana',c.x,c.z+1.2);
  // Opens (+90, to the south of the workshop's wall: +z).
  p.room.toggleDoor(user,OFFICE.id);
  const state=states.get(OFFICE.id)!;assert.equal(state.open,true);assert.equal(state.changedAt,clock);
  clock+=OFFICE.seconds*1000;syncFactoryGates(id=>states.get(id),clock,0);
  const open=boxOf(OFFICE.id);assert.ok(near(open.turn!.ux,Math.cos(90*Math.PI/180),1e-9),'girou 90 graus');
  const wall=run({x:c.x-.14,z:c.z+1},0,-1,3);assert.ok(wall.z<c.z-1,`aberta: passa (z=${wall.z.toFixed(2)})`);
  // Somebody else in the swept arc: refuses to shut (and nothing changes).
  const arc=OFFICE.origin,other=p.make('bia',arc[0]-.4,arc[2]+.4);
  assert.throws(()=>p.room.toggleDoor(user,OFFICE.id),/Tem alguém no caminho da porta/);assert.equal(state.open,true);
  p.players.delete('bia');void other;
  // Shuts again; the box comes back with the leaf.
  clock+=1000;p.room.toggleDoor(user,OFFICE.id);assert.equal(state.open,false);
  clock+=OFFICE.seconds*1000;syncFactoryGates(id=>states.get(id),clock,0);assert.deepEqual([boxOf(OFFICE.id).x,boxOf(OFFICE.id).z],[c.x,c.z]);
  assert.ok(run({x:c.x-.14,z:c.z+1},0,-1,3).z>c.z,'fechada: barra');
  // Opening with somebody else behind it (on the +z side where it swings) is refused.
  p.make('cida',arc[0]-.4,arc[2]+.5);assert.throws(()=>p.room.toggleDoor(user,OFFICE.id),/Tem alguém atrás da porta/);assert.equal(state.open,false);
  reset();
});

test('portão de enrolar (E): alterna, encolhe a caixa e não desce sobre quem está embaixo',()=>{
  const p=plant(),c=ROLL.collider,user=p.make('ana',c.x+1.5,c.z);
  p.room.toggleDoor(user,ROLL.id);const state=states.get(ROLL.id)!;assert.equal(state.open,true);
  clock+=ROLL.seconds*1000/2;syncFactoryGates(id=>states.get(id),clock,0);
  assert.ok(near(boxOf(ROLL.id).minY!,c.maxY!-(c.maxY!-c.minY!)*(1+(ROLL.openScale-1)*.5),1e-6),'a meio caminho a caixa já encolheu pela metade (suavizado)');
  clock+=ROLL.seconds*1000;syncFactoryGates(id=>states.get(id),clock,0);assert.ok(boxOf(ROLL.id).minY!>c.maxY!-.2,'aberto: só o rolo no alto');
  // Rolling up over somebody is harmless; coming down on somebody is refused.
  const under=p.make('bia',c.x+.2,c.z+.3);
  assert.throws(()=>p.room.toggleDoor(user,ROLL.id),/Tem alguém no caminho da porta/);assert.equal(state.open,true);
  p.players.delete('bia');void under;
  clock+=500;p.room.toggleDoor(user,ROLL.id);assert.equal(state.open,false);
  clock+=ROLL.seconds*1000;syncFactoryGates(id=>states.get(id),clock,0);assert.equal(boxOf(ROLL.id).minY,c.minY);
  reset();
});

test('porta de pessoal (saída de emergência): abre para fora (-95), alterna e a caixa gira junto',()=>{
  const p=plant(),c=ENTRY.collider,user=p.make('ana',c.x-1.2,c.z);
  p.room.toggleDoor(user,ENTRY.id);assert.equal(states.get(ENTRY.id)!.open,true);
  clock+=ENTRY.seconds*1000;syncFactoryGates(id=>states.get(id),clock,0);
  const open=boxOf(ENTRY.id);assert.ok(open.x>c.x+.3,`abre para fora, para +x (x=${open.x.toFixed(2)})`);
  assert.ok(near(Math.acos(open.turn!.ux)*180/Math.PI,95,.01));
  reset();
});

// ---- who counts as staff, as the API tells it ----
test('quem o interfone reconhece: dono, gerente e funcionário contratado; candidato, ex-funcionário e quem não tem vínculo não',async()=>{
  const previous=process.env.API_INTERNAL_URL;
  const roles:Record<string,string|null>={dono:'owner',gerente:'manager',func:null,candidato:null,ex:null,ninguem:null};
  const status:Record<string,string|undefined>={func:'hired',candidato:'applied',ex:'resigned',dono:undefined,gerente:undefined};
  const asked:string[]=[];
  const api=createServer(async(req,res)=>{
    let data='';for await(const chunk of req)data+=chunk;const body=data?JSON.parse(data):{};res.setHeader('content-type','application/json');
    asked.push(`${req.url}:${body.action}:${body.userId}`);
    if(req.url==='/api/internal/company')res.end(JSON.stringify({role:roles[body.userId]??null}));
    else if(req.url==='/api/internal/employment')res.end(JSON.stringify({employment:status[body.userId]?{status:status[body.userId]}:null,shift:null,config:{}}));
    else res.end('{}');
  });
  await new Promise<void>(resolve=>api.listen(0,'127.0.0.1',resolve));
  process.env.API_INTERNAL_URL=`http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  try{
    const room=Object.create(BarRoom.prototype) as Room,workers=new Set<string>();
    Object.defineProperty(room,'factoryWorkers',{value:workers});
    const staff=(userId:string)=>room.gateStaff({ticket:{userId,sessionId:`session-${userId}`}});
    assert.equal(await staff('dono'),true);assert.equal(await staff('gerente'),true);assert.equal(await staff('func'),true,'funcionário contratado');
    assert.equal(await staff('candidato'),false);assert.equal(await staff('ex'),false);assert.equal(await staff('ninguem'),false);
    asked.length=0;workers.add('ninguem');assert.equal(await staff('ninguem'),true,'quem está em expediente já é funcionário: sem perguntar à API');assert.deepEqual(asked,[]);
  }finally{
    if(previous===undefined)delete process.env.API_INTERNAL_URL;else process.env.API_INTERNAL_URL=previous;
    await new Promise<void>(resolve=>api.close(()=>resolve()));
  }
});
