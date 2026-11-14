import {WEAPONS,WHEEL_ORDER,type WeaponId} from './weapons/index.js';
import type {ItemId} from './inventory.js';

export const RIBEIRO_WEAPON_ITEM:Readonly<Record<WeaponId,ItemId>>={pistola:'arma_pistola',revolver:'arma_revolver',submetralhadora:'arma_submetralhadora',fuzil:'arma_fuzil','fuzil-ak':'arma_fuzil_ak',carabina:'arma_carabina',escopeta:'arma_escopeta','cano-duplo':'arma_cano_duplo',dmr:'arma_dmr',precisao:'arma_precisao'};
export const RIBEIRO_ITEM_WEAPON:Readonly<Partial<Record<ItemId,WeaponId>>>=Object.fromEntries(Object.entries(RIBEIRO_WEAPON_ITEM).map(([weapon,item])=>[item,weapon])) as Partial<Record<ItemId,WeaponId>>;

export const RIBEIRO_NAME='Ribeiro Usinagem e Ferramentaria';
export const RIBEIRO_COLOR='#34d399';
export const RIBEIRO_COMPUTER={id:'computer',label:'Sistema da empresa',x:345.93,y:.15,z:316.07,rotation:1.821,reach:1.35} as const;
export const RIBEIRO_STOCK={id:'stock',label:'Estoque de armas',x:339.48,y:.15,z:314.65,rotation:-.060,reach:1.5} as const;
/** Where the assembled weapon is put on the shelf: only then does it count in the stock (the terminal at RIBEIRO_STOCK is where it is withdrawn). */
export const RIBEIRO_SHELF={id:'shelf',label:'Prateleira do estoque',x:335.14,y:.15,z:311.04,rotation:-1.629,reach:1.5} as const;
export const RIBEIRO_DOCK={id:'receiving',label:'Recebimento de matéria-prima',x:342.90,y:.15,z:321.58,rotation:1.628,reach:3.2} as const;
export const RIBEIRO_PREP={id:'preparation',label:'Preparação industrial',x:350.49,y:.15,z:320.32,rotation:1.566,reach:1.35} as const;
export const RIBEIRO_CUTTERS=[
  {id:'cut-1',label:'Corte e preparação 01',x:337.93,y:.15,z:322.85,rotation:-1.441,reach:1.8},
  {id:'cut-2',label:'Corte e preparação 02',x:337.94,y:.15,z:326.32,rotation:-1.516,reach:1.8},
  {id:'cut-3',label:'Corte e preparação 03',x:337.93,y:.15,z:329.83,rotation:-1.601,reach:1.8},
  {id:'cut-4',label:'Corte e preparação 04',x:337.93,y:.15,z:333.22,rotation:-1.508,reach:1.8},
] as const;
export const RIBEIRO_MACHINING=[
  {id:'machine-1',label:'Usinagem 01',x:348.52,y:.15,z:325.64,rotation:-1.504,reach:1.8},
  {id:'machine-2',label:'Usinagem 02',x:348.33,y:.15,z:331.01,rotation:-1.622,reach:1.8},
] as const;
export const RIBEIRO_DRILLS=[
  {id:'drill-1',label:'Furação 01',x:342.99,y:.15,z:326.41,rotation:-1.551,reach:1.8},
  {id:'drill-2',label:'Furação 02',x:343.00,y:.15,z:329.89,rotation:-1.491,reach:1.8},
  {id:'drill-3',label:'Furação 03',x:343.00,y:.15,z:333.35,rotation:-1.583,reach:1.8},
] as const;
export const RIBEIRO_ASSEMBLY=[
  {id:'assembly-1',label:'Montagem 01',x:340.17,y:.15,z:333.65,rotation:-.035,reach:1.35},
  {id:'assembly-2',label:'Montagem 02',x:344.38,y:.15,z:333.66,rotation:.030,reach:1.35},
  {id:'assembly-3',label:'Montagem 03',x:348.73,y:.15,z:333.65,rotation:-.006,reach:1.35},
] as const;
export const RIBEIRO_SPOTS=[RIBEIRO_COMPUTER,RIBEIRO_STOCK,RIBEIRO_SHELF,RIBEIRO_DOCK,RIBEIRO_PREP,...RIBEIRO_CUTTERS,...RIBEIRO_MACHINING,...RIBEIRO_DRILLS,...RIBEIRO_ASSEMBLY] as const;
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
/** Job pay follows the same capped wallet path used by EMPRESA BRASIL. */
export const RIBEIRO_STAGE_PAY={cut:80,machining:110,drill:90,assembly:160} as const;
export type RibeiroOrderStatus='queued'|'to-cut'|'cutting'|'cut-ready'|'to-machining'|'machining'|'machined-ready'|'to-drill'|'drilling'|'drilled-ready'|'to-assembly'|'assembling'|'assembled-ready'|'to-shelf'|'completed'|'cancelled';
/** One unit of one weapon moves through the line as its own order; the units opened together share an OP (`opId`, numbered `opNumber`) and its customer. */
export interface RibeiroOrder {id:string;weapon:WeaponId;status:RibeiroOrderStatus;operatorId:string;operatorName:string;stationId:string;createdAt:number;updatedAt:number;opId?:string;opNumber?:number;customer?:string}
/** One line of an OP: how many units of a weapon the customer asked for. */
export interface RibeiroOpItem {weapon:WeaponId;quantity:number}
export const RIBEIRO_OP_LIMITS={customerMin:2,customerMax:60,lines:10,perLine:50,total:100} as const;
/** The customer as the room stores it: trimmed, inner spaces collapsed, no control characters. */
export const cleanCustomer=(raw:string):string=>[...raw].map(ch=>ch.charCodeAt(0)<32||ch.charCodeAt(0)===127?' ':ch).join('').split(' ').filter(Boolean).join(' ').slice(0,RIBEIRO_OP_LIMITS.customerMax).trim();
/** "OP 0007", the number people say out loud; the first six characters of the id for orders that predate numbering. */
export const ribeiroOpLabel=(order:Pick<RibeiroOrder,'id'|'opId'|'opNumber'>):string=>order.opNumber?`OP ${String(order.opNumber).padStart(4,'0')}`:`OP ${(order.opId??order.id).slice(0,6).toUpperCase()}`;
/** Raw material an OP asks for in all its lines together. */
export function ribeiroOpMaterials(items:readonly RibeiroOpItem[]):Record<RibeiroMaterial,number> {
  const total:Record<RibeiroMaterial,number>={ACO:0,ALUMINIO:0,POLIMERO:0,MOLAS:0};
  for(const item of items){const recipe=RIBEIRO_RECIPES.find(entry=>entry.weapon===item.weapon);if(recipe)for(const material of RIBEIRO_MATERIALS)total[material]+=recipe.materials[material]*item.quantity;}
  return total;
}
export interface RibeiroMachineJob {stationId:string;orderId:string;stage:'cut'|'machining'|'drill'|'assembly';operatorId:string;startedAt:number;endsAt:number}
export type RibeiroMemberRole='owner'|'manager'|'employee';
export interface RibeiroMember {userId:string;name:string;role:RibeiroMemberRole;hiredAt:number;earned:number}
export interface RibeiroPayrollEntry {id:string;userId:string;name:string;amount:number;label:string;orderId:string;at:number}
export interface RibeiroState {opCounter?:number;revision:number;materials:Record<RibeiroMaterial,number>;stock:Partial<Record<WeaponId,number>>;orders:RibeiroOrder[];jobs:RibeiroMachineJob[];completed:number;members:RibeiroMember[];payroll:RibeiroPayrollEntry[]}
/** `finished` is the machined, drilled part going to assembly; `assembled` is the complete weapon going to the shelf. */
export type RibeiroCarryStage='raw'|'cut'|'machined'|'finished'|'assembled';
/** The source allows a disconnected carrier to return the part to its exact pickup point. */
export interface RibeiroCarryView {orderId:string;weapon:WeaponId;stage:RibeiroCarryStage;sourceStationId?:RibeiroSpotId}
export type RibeiroGameKind='cut'|'machining'|'drill'|'finish';
export interface RibeiroGameChallenge {id:string;kind:RibeiroGameKind;stationId:RibeiroSpotId;title:string;instruction:string;target?:number;sequence?:string[];tolerance?:number;expiresAt:number}
export interface RibeiroView extends RibeiroState {purchaseOrders:Array<{id:string;material:RibeiroMaterial;pallets:number;status:string;createdAt:string}>;candidates:Array<{userId:string;name:string}>;busyStations:RibeiroSpotId[];me:{userId:string;carrying:RibeiroCarryView|null;role:RibeiroMemberRole|null;canManage:boolean;canBootstrap:boolean}}
/** How an order's status is told, and the station group it sits in (the administration's Ribeiro console). */
export const RIBEIRO_STATUS_LABEL:Readonly<Record<RibeiroOrderStatus,string>>={queued:'Na fila','to-cut':'A caminho do corte',cutting:'Em corte','cut-ready':'Corte pronto','to-machining':'A caminho da usinagem',machining:'Em usinagem','machined-ready':'Usinagem pronta','to-drill':'A caminho da furação',drilling:'Em furação','drilled-ready':'Furação pronta','to-assembly':'A caminho da montagem',assembling:'Em montagem','assembled-ready':'Arma montada pronta','to-shelf':'A caminho da prateleira',completed:'Concluída',cancelled:'Cancelada'};
export const RIBEIRO_STAGE_LABEL:Readonly<Record<keyof typeof RIBEIRO_STAGE_MS,string>>={cut:'Corte',machining:'Usinagem',drill:'Furação',assembly:'Montagem'};
/** What the room hands the administration (apps/server/src/world/machine-shop.ts adminView): the live state plus the numbers its charts are drawn from. */
export interface RibeiroAdminView {
  revision:number;materials:Record<RibeiroMaterial,number>;stock:Partial<Record<WeaponId,number>>;completed:number;jobs:RibeiroMachineJob[];members:Array<RibeiroMember&{online:boolean}>;
  /** The newest orders (at most 150, newest first) and how many there are in all, by status. */
  orders:RibeiroOrder[];totalOrders:number;statusCount:Partial<Record<RibeiroOrderStatus,number>>;
  /** The last 14 days (Brasília), oldest first: orders opened, orders completed and what the payroll paid. */
  daily:Array<{day:string;opened:number;completed:number;paid:number}>;
  /** Completed orders by weapon, all time, and the average minutes from opening to completion of the last 50. */
  producedByWeapon:Partial<Record<WeaponId,number>>;averageMinutes:number|null;
  /** The last payroll entries (newest first, at most 100 are kept) and what each stage paid inside them. */
  payroll:RibeiroPayrollEntry[];paidByStage:Partial<Record<keyof typeof RIBEIRO_STAGE_MS,number>>;paidTotal:number;
  purchaseOrders:Array<{id:string;material:string;pallets:number;status:string;createdAt:string}>;
  carriers:Array<{userId:string;name:string;orderId:string;weapon:WeaponId;stage:RibeiroCarryStage}>;
}
export const emptyRibeiroState=():RibeiroState=>({opCounter:0,revision:0,materials:{ACO:0,ALUMINIO:0,POLIMERO:0,MOLAS:0},stock:{},orders:[],jobs:[],completed:0,members:[],payroll:[]});

