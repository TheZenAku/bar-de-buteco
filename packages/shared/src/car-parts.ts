import {CAR_MODEL} from './vehicle-models.js';
import type {MotoParts} from './moto-parts.js';

const part=(id:string,name:string,group:string,worn:string,bad:string,dead=bad)=>({id,name,group,good:'Em bom estado.',worn,bad,dead});
export const CAR_PARTS=[
  part('motor','Motor','Mecânica','Perde força.','Pode falhar na partida e morrer andando.','Travado: não liga.'),
  part('bateria','Bateria','Mecânica','Carga reduzida.','Partida difícil e luzes oscilando.','Sem carga: não liga.'),
  part('escapamento','Escapamento','Mecânica','Mais barulhento.','Furado: perde potência.'),
  part('freios','Freios','Rodagem','A distância de frenagem aumenta.','Quase sem freio.'),
  part('suspensao','Suspensão','Rodagem','Menos firme nas curvas.','Instável: esterça menos.'),
  part('direcao','Direção','Rodagem','Desalinhada.','Puxa para um lado.'),
  part('pneu_de','Pneu dianteiro esquerdo','Rodagem','Desgastado.','Murcho: perde aderência.','Furado: limita velocidade e direção.'),
  part('pneu_dd','Pneu dianteiro direito','Rodagem','Desgastado.','Murcho: perde aderência.','Furado: limita velocidade e direção.'),
  part('pneu_te','Pneu traseiro esquerdo','Rodagem','Desgastado.','Murcho: pesa e patina.','Furado: limita velocidade.'),
  part('pneu_td','Pneu traseiro direito','Rodagem','Desgastado.','Murcho: pesa e patina.','Furado: limita velocidade.'),
  part('farol','Faróis','Elétrica e carroceria','Acendem normalmente.','Oscilando.','Quebrados: não acendem.'),
  part('lanterna','Lanternas e setas','Elétrica e carroceria','Acendem normalmente.','Oscilando.','Quebradas: sem freio, ré e setas.'),
  part('carroceria','Carroceria','Elétrica e carroceria','Protege menos a mecânica.','Amassada: batidas atingem mais as peças internas.'),
  part('porta_esquerda','Porta esquerda','Elétrica e carroceria','Amassada.','Abertura reduzida.','Destruída: deixa o lado exposto.'),
  part('porta_direita','Porta direita','Elétrica e carroceria','Amassada.','Abertura reduzida.','Destruída: deixa o lado exposto.'),
  part('capo','Capô','Elétrica e carroceria','Amassado.','Protege menos o motor.','Destruído: motor exposto.'),
  part('porta_malas','Tampa do porta-malas','Elétrica e carroceria','Amassada.','Protege menos a carga.','Destruída: carga exposta.'),
  part('limpadores','Limpadores','Elétrica e carroceria','Mais lentos.','Funcionam com dificuldade.','Quebrados: não funcionam.'),
] as const;
export const CAR_PART_IDS=CAR_PARTS.map(p=>p.id) as [string,...string[]];
export type CarParts=Record<string,number>;
export const NEW_CAR_PARTS=CAR_PARTS.map(()=>100).join(',');
export function readCarParts(text:string|undefined):CarParts {
  const values=(text??'').split(',');
  return Object.fromEntries(CAR_PARTS.map((p,i)=>{const n=Number(values[i]);return [p.id,values[i]!==undefined&&values[i]!==''&&Number.isFinite(n)?Math.max(0,Math.min(100,n)):100];}));
}
export const writeCarParts=(parts:CarParts)=>CAR_PARTS.map(p=>Math.round(Math.max(0,Math.min(100,parts[p.id]??100)))).join(',');
/** Adapter for the shared drivetrain, starter and lamp rules; four tyres retain their individual conditions. */
export function carDriveParts(text:string|undefined):MotoParts {
  const p=readCarParts(text);
  return {motor:p.motor!,bateria:p.bateria!,escapamento:p.escapamento!,freios:p.freios!,suspensao:p.suspensao!,direcao:p.direcao!,
    pneu_dianteiro:Math.min(p.pneu_de!,p.pneu_dd!),pneu_traseiro:Math.min(p.pneu_te!,p.pneu_td!),farol:p.farol!,lanterna:p.lanterna!,carenagem:p.carroceria!,bau:p.porta_malas!};
}
export const CAR_REPAIR={item:'peca_carro' as const,pieces:1,amount:40,ms:3500};
export function wearCarParts(text:string,closing:number,area:'front'|'rear'|'side'|'fall',random:()=>number=Math.random):string {
  if(closing<1.5)return text;
  const p=readCarParts(text),force=Math.min(1,(closing-1.5)/25+.04),shield=1.35-.7*p.carroceria!/100;
  const damage:Record<string,number>=area==='front'?{motor:32,bateria:15,freios:15,suspensao:28,direcao:30,pneu_de:32,pneu_dd:32,farol:55,carroceria:45,capo:55,limpadores:12}
    :area==='rear'?{escapamento:45,pneu_te:32,pneu_td:32,lanterna:55,carroceria:35,porta_malas:55,suspensao:20}
    :{carroceria:45,porta_esquerda:40,porta_direita:40,direcao:14,suspensao:15,pneu_de:12,pneu_dd:12,pneu_te:12,pneu_td:12,motor:8,bateria:8};
  for(const [id,loss] of Object.entries(damage))p[id]=Math.max(0,p[id]!-loss*force*(.75+random()*.5)*(['motor','bateria','freios'].includes(id)?shield:1));
  return writeCarParts(p);
}
export function carMileageWear(text:string,random:()=>number=Math.random):string {
  const p=readCarParts(text),ids=['pneu_de','pneu_dd','pneu_te','pneu_td','freios','motor','suspensao','escapamento'];
  const id=ids[Math.min(ids.length-1,Math.floor(random()*ids.length))]!;p[id]=Math.max(0,p[id]!-1);return writeCarParts(p);
}
export const isCarModel=(model:string|undefined)=>model===CAR_MODEL;
