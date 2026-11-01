import {z} from 'zod';
import type {ItemId} from './inventory.js';

/** The bike's parts, in the order the panel lists them; `MotoState.parts` carries their condition in this same order. */
export const MOTO_PARTS=[
  {id:'motor',name:'Motor',group:'Mecânica',good:'Liga e puxa normalmente.',worn:'Perdendo força, e pode falhar ao ligar.',bad:'Morre sozinho andando e custa a ligar.',dead:'Travado: não liga.'},
  {id:'bateria',name:'Bateria',group:'Mecânica',good:'Carga boa.',worn:'Carga boa.',bad:'Fraca: a partida pode só estalar e o farol oscila.',dead:'Descarregada: não dá partida.'},
  {id:'escapamento',name:'Escapamento',group:'Mecânica',good:'Ronco normal.',worn:'Mais barulhento.',bad:'Furado: alto e tira um pouco de força.',dead:'Furado: alto e tira um pouco de força.'},
  {id:'freios',name:'Freios',group:'Rodagem',good:'Freiam bem.',worn:'A moto leva mais tempo para parar.',bad:'Quase sem freio.',dead:'Quase sem freio.'},
  {id:'suspensao',name:'Suspensão',group:'Rodagem',good:'Firme nas curvas.',worn:'Firme nas curvas.',bad:'Solta: a moto vira menos.',dead:'Solta: a moto vira menos.'},
  {id:'direcao',name:'Direção',group:'Rodagem',good:'Alinhada.',worn:'Alinhada.',bad:'Torta: a moto puxa para um lado.',dead:'Muito torta: a moto puxa forte para um lado.'},
  {id:'pneu_dianteiro',name:'Pneu dianteiro',group:'Rodagem',good:'Calibrado.',worn:'Calibrado.',bad:'Murchando: vira menos e pesa.',dead:'Furado: vira pouco e não passa de meia velocidade.'},
  {id:'pneu_traseiro',name:'Pneu traseiro',group:'Rodagem',good:'Calibrado.',worn:'Calibrado.',bad:'Murchando: patina e pesa.',dead:'Furado: não passa de meia velocidade.'},
  {id:'farol',name:'Farol',group:'Elétrica e carroceria',good:'Aceso e firme.',worn:'Aceso e firme.',bad:'Oscilando.',dead:'Quebrado: não acende.'},
  {id:'lanterna',name:'Lanterna',group:'Elétrica e carroceria',good:'Acesa e firme.',worn:'Acesa e firme.',bad:'Oscilando.',dead:'Quebrada: lanterna, freio e setas traseiras não acendem.'},
  {id:'carenagem',name:'Carenagem',group:'Elétrica e carroceria',good:'Protege o que fica por dentro.',worn:'Protege menos o que fica por dentro.',bad:'Rachada: as batidas chegam ao motor, à bateria e aos freios.',dead:'Rachada: as batidas chegam ao motor, à bateria e aos freios.'},
  {id:'bau',name:'Baú de entrega',group:'Elétrica e carroceria',good:'Fecha direito.',worn:'Amassado.',bad:'Amassado.',dead:'Destruído.'},
] as const;
export type MotoPartId=typeof MOTO_PARTS[number]['id'];
export const MOTO_PART_IDS=MOTO_PARTS.map(part=>part.id) as [MotoPartId,...MotoPartId[]];
export type MotoParts=Record<MotoPartId,number>;

/** A bike fresh from the administration. */
export const NEW_MOTO_PARTS=MOTO_PARTS.map(()=>100).join(',');
/** `MotoState.parts` as whole percents. Anything missing reads as new, so an old client or state cannot break a bike. */
export function readMotoParts(text:string|undefined):MotoParts {
  const values=(text??'').split(',');
  return Object.fromEntries(MOTO_PARTS.map((part,i)=>{const value=Number(values[i]);return [part.id,values[i]!==undefined&&values[i]!==''&&Number.isFinite(value)?Math.max(0,Math.min(100,value)):100];})) as MotoParts;
}
export const writeMotoParts=(parts:MotoParts):string=>MOTO_PARTS.map(part=>Math.round(parts[part.id])).join(',');

/** What a condition means, for the panel. Every part crosses these at the same marks; what happens at each is in MOTO_PARTS. */
export type MotoPartStatus='good'|'worn'|'bad'|'dead';
export const motoPartStatus=(condition:number):MotoPartStatus=>condition>=70?'good':condition>=35?'worn':condition>0?'bad':'dead';
export const MOTO_STATUS_LABELS:Record<MotoPartStatus,string>={good:'Em bom estado',worn:'Com desgaste',bad:'Em mau estado',dead:'Fora de uso'};
export const motoPartById=(id:string)=>MOTO_PARTS.find(part=>part.id===id);

/** The engine, in `MotoState.engine`. */
export const MOTO_ENGINE={OFF:0,CRANKING:1,ON:2} as const;
/**
 * How long each try at starting takes (ms), by `MotoState.crank`: 0 catches (the engine pulls before the clip ends), 1 to 4 are the failures,
 * the length of SCOOTER_LIGA-FALHA-n. The clip the browsers play has the same number: moto-sound.ts.
 */
export const MOTO_CRANK_MS=[600,5233,1767,5223,7325] as const;
/** After a failure, or the engine dying, how long until W tries again. */
export const MOTO_RETRY_MS=500;
/** FALHA-2 is only the starter's relay clicking; the others are the starter turning with no catch. */
const CLICK=2,TURNS_OVER=[1,3,4] as const;

/** The chance one try catches: a tired engine sometimes does not, a weak battery sometimes cannot turn it. */
export function motoStartChance(parts:MotoParts):number {
  const motor=parts.motor>=50?1:parts.motor<=0?0:.2+.8*parts.motor/50;
  const battery=parts.bateria>=25?1:parts.bateria<=0?0:.25+.75*parts.bateria/25;
  return motor*battery;
}
/** A try at starting: 0 catches, otherwise which failure it is. A battery too weak to turn the starter only clicks. */
export function motoCrank(parts:MotoParts,random:()=>number=Math.random):number {
  if(random()<motoStartChance(parts))return 0;
  return parts.bateria<25?CLICK:TURNS_OVER[Math.floor(random()*TURNS_OVER.length)]!;
}
/** The chance per second that a running engine dies by itself. */
export const motoStallChance=(parts:MotoParts):number=>parts.motor>=35?0:.02+.16*(1-parts.motor/35);

/**
 * What the bike's state does to how it rides. Pure, because the room and the rider's prediction must step the same bike (stepMoto). `power`
 * multiplies the engine (0 when it is not running), `brake` the brakes, `turn` the front wheel's angle, `rolling` the rolling resistance, and
 * `pull` is how far the handlebar sits off centre (−1..1, as MotoIntent.steer).
 */
export interface MotoHandling {power:number;brake:number;turn:number;rolling:number;pull:number}
export const FULL_HANDLING:MotoHandling={power:1,brake:1,turn:1,rolling:1,pull:0};
/** From `mark` up nothing changes; at 0 the value is `least`. */
const fade=(condition:number,mark:number,least:number)=>condition>=mark?1:least+(1-least)*condition/mark;
export function motoHandling(moto:{id:string;parts?:string;engine?:number}):MotoHandling {
  const parts=readMotoParts(moto.parts),running=moto.engine===undefined||moto.engine===MOTO_ENGINE.ON;
  const flat=(tyre:number)=>tyre>=25?1:1+(1-tyre/25)*5;
  // Which way a bent fork pulls is the bike's own: the last character of its id.
  const side=(moto.id.charCodeAt(moto.id.length-1)||0)%2?1:-1;
  return {
    power:running?fade(parts.motor,60,.45)*fade(parts.pneu_traseiro,25,.7)*fade(parts.escapamento,35,.9):0,
    brake:fade(parts.freios,70,.3),
    turn:Math.min(fade(parts.pneu_dianteiro,25,.55),fade(parts.suspensao,35,.75)),
    rolling:flat(parts.pneu_dianteiro)+flat(parts.pneu_traseiro)-1,
    pull:parts.direcao>=35?0:side*(1-parts.direcao/35)*.28,
  };
}

/** Lamps: 1 steady, flickering below the bad mark, and out when broken or with no battery. Time in ms, the same on every screen. */
export function motoLampLevel(condition:number,battery:number,now:number,seed=0):number {
  if(condition<=0||battery<=0)return 0;
  const worst=Math.min(condition,battery);
  if(worst>=35)return 1;
  // Two beats that rarely meet: mostly lit, with short drops that grow as it gets worse.
  const t=now/1000+seed*3.7,dip=Math.sin(t*7.3)*Math.sin(t*13.1+1.3);
  return dip>.55-(1-worst/35)*.6?.25:1;
}

/** Where a blow lands on the bike. */
export type MotoHitArea='front'|'rear'|'side'|'fall';
/** What the worst blow (flat out, square on) takes from each part, in percent. */
const WEAR:Record<MotoHitArea,MotoParts>={
  front:{motor:22,bateria:8,escapamento:3,freios:14,suspensao:28,direcao:30,pneu_dianteiro:38,pneu_traseiro:6,farol:55,lanterna:3,carenagem:45,bau:6},
  rear:{motor:12,bateria:8,escapamento:40,freios:10,suspensao:20,direcao:4,pneu_dianteiro:4,pneu_traseiro:38,farol:3,lanterna:55,carenagem:30,bau:35},
  side:{motor:8,bateria:5,escapamento:14,freios:6,suspensao:10,direcao:16,pneu_dianteiro:8,pneu_traseiro:8,farol:10,lanterna:10,carenagem:50,bau:18},
  fall:{motor:4,bateria:4,escapamento:8,freios:3,suspensao:4,direcao:14,pneu_dianteiro:3,pneu_traseiro:3,farol:14,lanterna:14,carenagem:30,bau:12},
};
/** What the fairing shields: it takes less with the fairing whole and more with it gone. */
const SHIELDED:readonly MotoPartId[]=['motor','bateria','freios','suspensao'];
/** Going into something below this (m/s) does not mark the bike; flat out is the worst there is. */
export const MOTO_WEAR_FROM=1.5,MOTO_WEAR_TOP=15.3;
/** The side of the bike a face looking back at it (nx, nz) is on. */
export function motoHitArea(yaw:number,nx:number,nz:number):MotoHitArea {
  const facing=Math.sin(yaw)*nx+Math.cos(yaw)*nz;
  return facing<-.5?'front':facing>.5?'rear':'side';
}
/** The parts after a blow of `closing` m/s. Harder blows take more; the dice keep two crashes from leaving the same marks. */
export function wearMotoParts(parts:MotoParts,closing:number,area:MotoHitArea,random:()=>number=Math.random):MotoParts {
  if(closing<MOTO_WEAR_FROM)return parts;
  const force=.03+.97*Math.min(1,(closing-MOTO_WEAR_FROM)/(MOTO_WEAR_TOP-MOTO_WEAR_FROM)),shield=1.35-.7*parts.carenagem/100,next={...parts};
  for(const {id} of MOTO_PARTS){
    const loss=WEAR[area][id]*force*(.75+random()*.5)*(SHIELDED.includes(id)?shield:1);
    next[id]=Math.max(0,parts[id]-loss);
  }
  return next;
}

/** The life a body on foot loses to a bike at this speed (m/s): energy grows with the square of speed, and a full tank of life survives one hit. */
export function motoStrikeHp(speed:number):number {
  const t=Math.min(1,Math.abs(speed)/MOTO_WEAR_TOP);
  return Math.round(4+28*t+48*t*t);
}

/** Fixing a part: one piece from the backpack (placeholder for now: a single generic piece), this long, and this much back. */
/** Riding wears an owned bike a little, one point at a time, most of it where the road touches it. */
const MILEAGE_WEAR:ReadonlyArray<readonly [MotoPartId,number]>=[['pneu_traseiro',5],['pneu_dianteiro',4],['freios',4],['motor',2],['suspensao',2],['escapamento',1],['bateria',1],['direcao',1]];
export function mileageWear(parts:MotoParts,random:()=>number=Math.random):MotoParts {
  const total=MILEAGE_WEAR.reduce((sum,[,weight])=>sum+weight,0);
  let pick=random()*total;
  for(const [id,weight] of MILEAGE_WEAR){
    pick-=weight;
    if(pick<0)return {...parts,[id]:Math.max(0,parts[id]-1)};
  }
  return parts;
}
export const MOTO_REPAIR={item:'peca_moto' as ItemId,pieces:1,amount:40,ms:3500} as const;
export const motoRepairSchema=z.object({motoId:z.string().max(32),part:z.enum(MOTO_PART_IDS)}).strict();
/** The state of someone working on a bike, in Player.interactionState. */
export const motoRepairInteraction=(motoId:string,part:MotoPartId)=>`moto-repair:${motoId}:${part}`;
export const isRepairingMoto=(interaction:string|undefined)=>!!interaction?.startsWith('moto-repair:');
export function repairOf(interaction:string|undefined):{motoId:string;part:MotoPartId}|undefined {
  if(!isRepairingMoto(interaction))return;
  const [,motoId,part]=interaction!.split(':');
  return motoId&&motoPartById(part??'')?{motoId,part:part as MotoPartId}:undefined;
}
