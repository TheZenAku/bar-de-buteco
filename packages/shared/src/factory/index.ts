import {z} from 'zod';

export const FACTORY_MATERIALS=['MALTE','MIX','PRODUTO'] as const;
export type FactoryMaterial=typeof FACTORY_MATERIALS[number];
export const TANK_STATES=['VAZIO','ENCHENDO_AGUA','AQUECENDO','AGUARDANDO_INSUMOS','DISSOLVENDO','HOMOGENEIZANDO','AGUARDANDO_QUALIDADE','PRONTO_PARA_TRANSFERIR','TRANSFERINDO','SUJO','PAUSADO'] as const;
export type TankState=typeof TANK_STATES[number];
export const DRYER_STATES=['PARADO','PRE_AQUECENDO','PRONTO','PRODUZINDO','RESFRIANDO','FALHA','LIMPEZA','PAUSADO'] as const;
export type DryerState=typeof DRYER_STATES[number];
export const BAGGING_STATES=['PARADO','AGUARDANDO_SACO','SACO_POSICIONADO','ENCHENDO','AGUARDANDO_COSTURA','AGUARDANDO_EMPILHAR','PAUSADO'] as const;
export type BaggingState=typeof BAGGING_STATES[number];

export interface FactoryRecipe {waterL:number;targetC:number;malteBags:number;mixBags:number;litresPerKg:number;yieldMin:number;yieldMax:number}
export interface FactoryBalance {recipe:FactoryRecipe;waterFlowLps:number;agitatorRpm:number;dissolveS:number;homogenizeS:number;preheatS:number;coolS:number;dryerFlowLph:number;bagFillS:number;bagKg:number;bagToleranceKg:number;slotCapacity:number;timeScale:number}
export const DEFAULT_FACTORY_BALANCE:FactoryBalance={
  recipe:{waterL:1200,targetC:65,malteBags:8,mixBags:4,litresPerKg:.65,yieldMin:.8,yieldMax:.97},
  waterFlowLps:20,agitatorRpm:120,dissolveS:90,homogenizeS:60,preheatS:180,coolS:60,dryerFlowLph:1100,bagFillS:9,bagKg:25,bagToleranceKg:.2,slotCapacity:18,timeScale:1,
};
export interface CubicPoint {heightM:number;radiusM:number;volumeL:number}
export function interpolateCubicage(volumeL:number,table:readonly CubicPoint[]):CubicPoint {
  if(!table.length)throw new Error('Tabela de cubicagem vazia.');
  if(volumeL<=0)return {heightM:0,radiusM:0,volumeL:0};
  if(volumeL<=table[0]!.volumeL){const p=table[0]!,r=volumeL/p.volumeL;return {heightM:p.heightM*r,radiusM:p.radiusM*r,volumeL};}
  for(let i=1;i<table.length;i++){
    const a=table[i-1]!,b=table[i]!;if(volumeL<=b.volumeL){const r=(volumeL-a.volumeL)/(b.volumeL-a.volumeL);return {heightM:a.heightM+(b.heightM-a.heightM)*r,radiusM:a.radiusM+(b.radiusM-a.radiusM)*r,volumeL};}
  }
  const last=table.at(-1)!;return {...last,volumeL:last.volumeL};
}

export interface TankRuntime {id:1|2|3;state:TankState;waterL:number;malteBags:number;mixBags:number;temperatureC:number;agitatorRpm:number;lidOpen:boolean;stepS:number;quality:number;penalties:string[]}
export interface DryerRuntime {state:DryerState;inletC:number;outletC:number;flowLph:number;powderKg:number;stepS:number;fault:string;sourceTank:1|2|3|null}
export interface BaggingRuntime {state:BaggingState;weightKg:number;emptyBags:number;palletBags:number;producedBags:number;rejectedBags:number;lot:string}
export const emptyTank=(id:1|2|3):TankRuntime=>({id,state:'VAZIO',waterL:0,malteBags:0,mixBags:0,temperatureC:20,agitatorRpm:0,lidOpen:false,stepS:0,quality:100,penalties:[]});
export const emptyDryer=():DryerRuntime=>({state:'PARADO',inletC:20,outletC:20,flowLph:0,powderKg:0,stepS:0,fault:'',sourceTank:null});
export const emptyBagging=():BaggingRuntime=>({state:'PARADO',weightKg:0,emptyBags:0,palletBags:0,producedBags:0,rejectedBags:0,lot:''});

export function addIngredient(tank:TankRuntime,material:'MALTE'|'MIX',balance=DEFAULT_FACTORY_BALANCE):TankRuntime {
  if(!tank.lidOpen)throw new Error('Abra a tampa do tanque.');
  if(tank.agitatorRpm<=0)throw new Error('Ligue o agitador.');
  if(tank.waterL<=0)throw new Error('Adicione água antes dos insumos.');
  if(!['AGUARDANDO_INSUMOS','DISSOLVENDO'].includes(tank.state))throw new Error('O tanque não aceita insumos nesta etapa.');
  if(material==='MIX'&&tank.malteBags<balance.recipe.malteBags)return {...tank,mixBags:tank.mixBags+1,quality:Math.max(0,tank.quality-8),penalties:[...tank.penalties,'mix_fora_de_ordem']};
  return {...tank,[material==='MALTE'?'malteBags':'mixBags']:(material==='MALTE'?tank.malteBags:tank.mixBags)+1};
}
export function calculateBatchQuality(input:{waterL:number;temperatureC:number;penalties:readonly string[]},balance=DEFAULT_FACTORY_BALANCE):number {
  const waterPenalty=Math.min(25,Math.abs(input.waterL-balance.recipe.waterL)/balance.recipe.waterL*100);
  const tempPenalty=input.temperatureC<60?Math.min(25,(60-input.temperatureC)*2):input.temperatureC>70?Math.min(25,(input.temperatureC-70)*2):0;
  return Math.max(0,Math.min(100,Math.round(100-waterPenalty-tempPenalty-input.penalties.length*6)));
}
export function batchYield(quality:number,balance=DEFAULT_FACTORY_BALANCE):number {
  return balance.recipe.yieldMin+(balance.recipe.yieldMax-balance.recipe.yieldMin)*Math.max(0,Math.min(100,quality))/100;
}
export function productBags(solidKg:number,quality:number,balance=DEFAULT_FACTORY_BALANCE):number {return Math.floor(solidKg*batchYield(quality,balance)/balance.bagKg);}

export function tickTank(tank:TankRuntime,dtS:number,balance=DEFAULT_FACTORY_BALANCE):TankRuntime {
  const dt=Math.max(0,dtS)*balance.timeScale,next={...tank,stepS:tank.stepS+dt};
  if(tank.state==='AQUECENDO'){
    next.temperatureC+=(balance.recipe.targetC-next.temperatureC)*(1-Math.exp(-dt/25));
    if(Math.abs(next.temperatureC-balance.recipe.targetC)<.5){next.state='AGUARDANDO_INSUMOS';next.stepS=0;}
  }else if(tank.state==='DISSOLVENDO'&&tank.agitatorRpm>0&&next.stepS>=balance.dissolveS){next.state='HOMOGENEIZANDO';next.stepS=0;}
  else if(tank.state==='HOMOGENEIZANDO'&&tank.agitatorRpm>0&&next.stepS>=balance.homogenizeS){next.state='AGUARDANDO_QUALIDADE';next.stepS=0;next.quality=calculateBatchQuality(next,balance);}
  return next;
}
export function tickDryer(dryer:DryerRuntime,dtS:number,balance=DEFAULT_FACTORY_BALANCE):DryerRuntime {
  const dt=Math.max(0,dtS)*balance.timeScale,next={...dryer,stepS:dryer.stepS+dt};
  if(dryer.state==='PRE_AQUECENDO'){
    next.inletC+=(190-next.inletC)*(1-Math.exp(-dt/45));next.outletC+=(87-next.outletC)*(1-Math.exp(-dt/55));
    if(next.stepS>=balance.preheatS&&next.inletC>=180){next.state='PRONTO';next.stepS=0;}
  }else if(dryer.state==='RESFRIANDO'){
    next.inletC+=(20-next.inletC)*(1-Math.exp(-dt/20));next.outletC+=(20-next.outletC)*(1-Math.exp(-dt/20));
    if(next.stepS>=balance.coolS){next.state='PARADO';next.stepS=0;next.sourceTank=null;}
  }
  return next;
}

export const factoryCommandSchema=z.object({requestId:z.uuid(),action:z.string().min(1).max(48),target:z.string().max(64).optional(),value:z.number().finite().optional(),reason:z.string().min(3).max(500).optional()}).strict();
export type FactoryCommand=z.infer<typeof factoryCommandSchema>;

export interface WorkWindow {days:readonly number[];startMinute:number;endMinute:number;timeZone:string}
export function isInsideWorkWindow(at:Date,window:WorkWindow):boolean {
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:window.timeZone,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(at);
  const day=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(parts.find(p=>p.type==='weekday')?.value??'');
  const minute=Number(parts.find(p=>p.type==='hour')?.value)*60+Number(parts.find(p=>p.type==='minute')?.value);
  if(window.startMinute<=window.endMinute)return window.days.includes(day)&&minute>=window.startMinute&&minute<window.endMinute;
  const previous=(day+6)%7;return (window.days.includes(day)&&minute>=window.startMinute)||(window.days.includes(previous)&&minute<window.endMinute);
}
