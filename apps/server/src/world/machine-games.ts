import {randomInt,randomUUID} from 'node:crypto';
import type {RibeiroGameChallenge,RibeiroGameKind,RibeiroSpotId} from '@bar/shared';

const sequences={machining:['X+','Z-','RPM','AVANÇO'],drill:['1','2','3','4']} as const;
const shuffled=(items:readonly string[])=>items.map(value=>({value,order:randomInt(0,1_000_000)})).sort((a,b)=>a.order-b.order).map(item=>item.value);

export function createMachineGame(kind:RibeiroGameKind,stationId:RibeiroSpotId,now=Date.now()):RibeiroGameChallenge {
  const base={id:randomUUID(),kind,stationId,expiresAt:now+60_000};
  if(kind==='cut'){const target=randomInt(22,79);return {...base,title:'Calibração de corte',instruction:`Ajuste o batente para ${target} mm antes de acionar a serra.`,target,tolerance:2};}
  if(kind==='finish'){const target=randomInt(35,76);return {...base,title:'Acabamento superficial',instruction:`Regule o polimento no índice ${target} sem ultrapassar a tolerância.`,target,tolerance:2};}
  if(kind==='machining'){const sequence=shuffled(sequences.machining);return {...base,title:'Programa CNC',instruction:'Execute os comandos na ordem indicada para usinar o perfil.',sequence};}
  const sequence=shuffled(sequences.drill);return {...base,title:'Plano de furação',instruction:'Selecione os furos na ordem indicada pelo desenho técnico.',sequence};
}

export function machineGameCorrect(challenge:RibeiroGameChallenge,answer:number|string):boolean {
  if(challenge.target!==undefined)return typeof answer==='number'&&Number.isFinite(answer)&&Math.abs(answer-challenge.target)<=(challenge.tolerance??0);
  return typeof answer==='string'&&answer===challenge.sequence?.join('|');
}
