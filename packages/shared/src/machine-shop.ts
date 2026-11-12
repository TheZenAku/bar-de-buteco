import {WEAPONS,WHEEL_ORDER,type WeaponId} from './weapons/index.js';

export const RIBEIRO_NAME='Ribeiro Usinagem e Ferramentaria';
export const RIBEIRO_COLOR='#34d399';
export const RIBEIRO_COMPUTER={id:'computer',label:'Sistema da empresa',x:345.93,y:.15,z:316.07,rotation:1.821,reach:1.35} as const;
export const RIBEIRO_STOCK={id:'stock',label:'Estoque de armas',x:339.48,y:.15,z:314.65,rotation:-.060,reach:1.5} as const;
export const RIBEIRO_DOCK={id:'receiving',label:'Recebimento de matéria-prima',x:342.90,y:.15,z:321.58,rotation:1.628,reach:3.2} as const;
export const RIBEIRO_PREP={id:'preparation',label:'Preparação industrial',x:350.49,y:.15,z:320.32,rotation:1.566,reach:1.35} as const;
export const RIBEIRO_CUTTERS=[
  {id:'cut-1',label:'Corte e preparação 01',x:337.93,y:.15,z:322.85,rotation:-1.441,reach:1.35},
  {id:'cut-2',label:'Corte e preparação 02',x:337.94,y:.15,z:326.32,rotation:-1.516,reach:1.35},
  {id:'cut-3',label:'Corte e preparação 03',x:337.93,y:.15,z:329.83,rotation:-1.601,reach:1.35},
  {id:'cut-4',label:'Corte e preparação 04',x:337.93,y:.15,z:333.22,rotation:-1.508,reach:1.35},
] as const;
export const RIBEIRO_MACHINING=[
  {id:'machine-1',label:'Usinagem 01',x:348.52,y:.15,z:325.64,rotation:-1.504,reach:1.35},
  {id:'machine-2',label:'Usinagem 02',x:348.33,y:.15,z:331.01,rotation:-1.622,reach:1.35},
] as const;
export const RIBEIRO_DRILLS=[
  {id:'drill-1',label:'Furação 01',x:342.99,y:.15,z:326.41,rotation:-1.551,reach:1.35},
  {id:'drill-2',label:'Furação 02',x:343.00,y:.15,z:329.89,rotation:-1.491,reach:1.35},
  {id:'drill-3',label:'Furação 03',x:343.00,y:.15,z:333.35,rotation:-1.583,reach:1.35},
] as const;
export const RIBEIRO_ASSEMBLY=[
  {id:'assembly-1',label:'Montagem 01',x:340.17,y:.15,z:333.65,rotation:-.035,reach:1.35},
  {id:'assembly-2',label:'Montagem 02',x:344.38,y:.15,z:333.66,rotation:.030,reach:1.35},
  {id:'assembly-3',label:'Montagem 03',x:348.73,y:.15,z:333.65,rotation:-.006,reach:1.35},
] as const;
export const RIBEIRO_SPOTS=[RIBEIRO_COMPUTER,RIBEIRO_STOCK,RIBEIRO_DOCK,RIBEIRO_PREP,...RIBEIRO_CUTTERS,...RIBEIRO_MACHINING,...RIBEIRO_DRILLS,...RIBEIRO_ASSEMBLY] as const;
export type RibeiroSpotId=typeof RIBEIRO_SPOTS[number]['id'];

export const RIBEIRO_MATERIALS=['ACO','ALUMINIO','POLIMERO','MOLAS'] as const;
export type RibeiroMaterial=typeof RIBEIRO_MATERIALS[number];
export const RIBEIRO_MATERIAL_INFO:Record<RibeiroMaterial,{name:string;unit:string}>={
  ACO:{name:'Aço 4140',unit:'lote'},ALUMINIO:{name:'Alumínio 7075',unit:'lote'},POLIMERO:{name:'Polímero técnico',unit:'lote'},MOLAS:{name:'Conjuntos de mola',unit:'caixa'},
};
export const isRibeiroMaterial=(value:string):value is RibeiroMaterial=>(RIBEIRO_MATERIALS as readonly string[]).includes(value);
export interface RibeiroRecipe {weapon:WeaponId;materials:Record<RibeiroMaterial,number>}
/** Every firearm currently in WHEEL_ORDER has one manufacturable recipe. */
export const RIBEIRO_RECIPES:readonly RibeiroRecipe[]=WHEEL_ORDER.map(weapon=>{
  const def=WEAPONS[weapon],long=def.hold==='rifle',precision=def.category==='precisao';
  return {weapon,materials:{ACO:Math.max(1,Math.ceil(def.tier*(long?3:2))),ALUMINIO:Math.max(1,Math.ceil(def.tier)),POLIMERO:Math.max(1,Math.ceil(def.tier*(long?1.5:1))),MOLAS:precision?2:1}};
});
export const RIBEIRO_STAGE_MS={cut:8_000,machining:10_000,drill:7_000,assembly:12_000} as const;
export type RibeiroOrderStatus='queued'|'to-cut'|'cutting'|'cut-ready'|'to-machining'|'machining'|'machined-ready'|'to-drill'|'drilling'|'drilled-ready'|'to-assembly'|'assembling'|'completed'|'cancelled';
export interface RibeiroOrder {id:string;weapon:WeaponId;status:RibeiroOrderStatus;operatorId:string;operatorName:string;stationId:string;createdAt:number;updatedAt:number}
export interface RibeiroMachineJob {stationId:string;orderId:string;stage:'cut'|'machining'|'drill'|'assembly';operatorId:string;startedAt:number;endsAt:number}
export interface RibeiroState {revision:number;materials:Record<RibeiroMaterial,number>;stock:Partial<Record<WeaponId,number>>;orders:RibeiroOrder[];jobs:RibeiroMachineJob[];completed:number}
export type RibeiroCarryStage='raw'|'cut'|'machined'|'finished';
export type RibeiroGameKind='cut'|'machining'|'drill'|'finish';
export interface RibeiroGameChallenge {id:string;kind:RibeiroGameKind;stationId:RibeiroSpotId;title:string;instruction:string;target?:number;sequence?:string[];tolerance?:number;expiresAt:number}
export interface RibeiroView extends RibeiroState {purchaseOrders:Array<{id:string;material:RibeiroMaterial;pallets:number;status:string;createdAt:string}>;me:{carrying:null|{orderId:string;weapon:WeaponId;stage:RibeiroCarryStage}}}
export const emptyRibeiroState=():RibeiroState=>({revision:0,materials:{ACO:0,ALUMINIO:0,POLIMERO:0,MOLAS:0},stock:{},orders:[],jobs:[],completed:0});

