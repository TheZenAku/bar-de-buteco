import test from 'node:test';
import assert from 'node:assert/strict';
import {CITY_MARKERS,isDoorOpen,movePlayer,setDoorStates} from '@bar/shared';
import {FACTORY_GATE} from '@bar/shared/factory';
import {BarRoom} from '../src/BarRoom.js';

const G=FACTORY_GATE;
const run=(from:{x:number;z:number},dx:number,seconds:number)=>{let p:{x:number;y:number;z:number}={...from,y:.17};for(let i=0;i<seconds*20;i++)p=movePlayer(p,{dx,dz:0,running:true,jump:false},.05);return p;};

test('o portão da fábrica fechado barra quem corre, aberto deixa passar',()=>{
  setDoorStates([[G.id,false]]);
  assert.equal(isDoorOpen(G.id),false);
  const blocked=run({x:G.x+6,z:G.z},-1,3);
  assert.ok(blocked.x>G.x+G.halfThick,`parou do lado de fora (x=${blocked.x.toFixed(2)})`);
  setDoorStates([[G.id,true]]);
  const through=run({x:G.x+6,z:G.z},-1,3);
  assert.ok(through.x<G.x-4,`passou para dentro (x=${through.x.toFixed(2)})`);
  setDoorStates([[G.id,false]]);
});

type Fake={x:number;z:number;y:number;id:string;displayName:string;interactionState:string};
test('interfone e controle do portão: o visitante toca, o operador em serviço abre ou dispensa, e o portão nunca fecha em cima de alguém',()=>{
  setDoorStates([[G.id,false]]);
  const panel=CITY_MARKERS.Ponto_EB_Painel!;
  const players=new Map<string,Fake>(),doors=new Map([[G.id,{open:false,changedAt:0}]]),sent:Array<{to:string;payload:{action:string;ok:boolean;message:string}}>=[],workers=new Set<string>(),pushes:number[]=[];
  const room=Object.create(BarRoom.prototype) as unknown as {
    gateTick():void;gateRingBy(presence:unknown,player:Fake):{ok:boolean;message:string};gateControl(presence:unknown,player:Fake,action:'open'|'close'|'dismiss'):{ok:boolean;message:string};gateWanted:boolean;gateRing:unknown;
  };
  const fakes={
    state:{doors,players,motos:new Map()},factoryWorkers:workers,gateWanted:false,gateRing:null,
    sessions:{getByUser:(id:string)=>({client:{send:(_type:string,payload:never)=>sent.push({to:id,payload})}})},
    factory:{note(){},markers:{Ponto_EB_Painel:{xyz_jogo:[panel.x,panel.y,panel.z]}}},pushFactory:()=>{pushes.push(1);},log:()=>undefined,
  };
  for(const [key,value] of Object.entries(fakes))Object.defineProperty(room,key,{value,writable:true,configurable:true});
  const visitor:Fake={id:'visitor',displayName:'Visitante',x:G.intercom.x,y:.17,z:G.intercom.z,interactionState:''},op:Fake={id:'op',displayName:'Operadora',x:panel.x,y:panel.y,z:panel.z,interactionState:''};
  players.set(visitor.id,visitor);players.set(op.id,op);
  const guest={ringAt:0,factoryPpe:false},staff={factoryPpe:true,ringAt:0};

  // Longe do interfone: nada. Perto, sem operador em serviço: ninguém atende.
  assert.equal(room.gateRingBy(guest,{...visitor,x:G.intercom.x+20}).ok,false);
  const nobody=room.gateRingBy(guest,visitor);assert.equal(nobody.ok,false);assert.match(nobody.message,/operador em serviço/);
  assert.equal(room.gateRing,null);

  // Com um operador em serviço, o toque chega a ele e o visitante espera. Tocar de novo logo em seguida é recusado.
  workers.add('op');guest.ringAt=0;
  const rang=room.gateRingBy(guest,visitor);assert.equal(rang.ok,true);
  assert.deepEqual(sent.map(item=>[item.to,item.payload.action]),[['op','ring']]);assert.match(sent[0]!.payload.message,/Visitante/);
  assert.match(room.gateRingBy(guest,visitor).message,/acabou de tocar/);

  // O portão não obedece a quem não está no painel, sem expediente ou sem EPI.
  assert.equal(room.gateControl(staff,{...op,x:panel.x+30},'open').ok,false);
  assert.match(room.gateControl({factoryPpe:false},op,'open').message,/EPI/);
  workers.delete('op');assert.match(room.gateControl(staff,op,'open').message,/expediente/i);workers.add('op');
  assert.equal(doors.get(G.id)!.open,false);

  // Dispensar a chamada avisa o visitante e não abre.
  sent.length=0;assert.equal(room.gateControl(staff,op,'dismiss').ok,true);assert.equal(room.gateRing,null);
  assert.deepEqual(sent.map(item=>[item.to,item.payload.action,item.payload.ok]),[['visitor','ring.sent',false]]);assert.equal(doors.get(G.id)!.open,false);

  // Nova chamada; o operador abre: o portão abre no mundo (colisão incluída) e o visitante é avisado.
  guest.ringAt=0;room.gateRingBy(guest,visitor);sent.length=0;
  assert.equal(room.gateControl(staff,op,'open').ok,true);
  assert.equal(room.gateWanted,true);assert.equal(doors.get(G.id)!.open,true);assert.equal(isDoorOpen(G.id),true);
  assert.deepEqual(sent.map(item=>[item.to,item.payload.action,item.payload.ok]),[['visitor','ring.sent',true]]);
  assert.equal(room.gateRing,null);

  // Fechar com alguém no vão: continua aberto até ele sair.
  players.set('visitor',{...visitor,x:G.x,z:G.z});
  const holding=room.gateControl(staff,op,'close');assert.match(holding.message,/no vão/);assert.equal(doors.get(G.id)!.open,true);
  players.set('visitor',{...visitor,x:G.x+9,z:G.z});room.gateTick();assert.equal(doors.get(G.id)!.open,false);assert.equal(isDoorOpen(G.id),false);

  // Aberto e o último operador sai do expediente: o portão fecha sozinho.
  room.gateControl(staff,op,'open');assert.equal(doors.get(G.id)!.open,true);
  workers.clear();room.gateTick();assert.equal(room.gateWanted,false);assert.equal(doors.get(G.id)!.open,false);

  // Uma chamada sem resposta caduca.
  workers.add('op');guest.ringAt=0;room.gateRingBy(guest,visitor);assert.ok(room.gateRing);
  (room.gateRing as {at:number}).at=Date.now()-(G.ringTtlS+1)*1000;room.gateTick();assert.equal(room.gateRing,null);
  setDoorStates([[G.id,false]]);
});
