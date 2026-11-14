import {CITY_MARKERS} from '../city.js';

/**
 * The firm behind the plant (docs/sistemas/empresa.md): its owners and managers, its wallet, the raw material it buys, the production orders
 * (OPs) it approves and the cleaning the plant asks for after each one. Pure data and rules, shared by the API, the world, the browser and the
 * administration; nothing here touches a database or a socket.
 */
export const COMPANY_ID='empresa-brasil';
export const COMPANY_NAME='EMPRESA BRASIL';
export const COMPANY_ROLES=['owner','manager'] as const;
export type CompanyRole=typeof COMPANY_ROLES[number];

/** The default price of a full pallet (18 bags) of raw material, before the tax on top of it. The administration changes it (`rawMaltePrice`/`rawMixPrice` of the finance). */
export const RAW_PALLET_PRICE={MALTE:30000,MIX:20000} as const;
export const BAGS_PER_PALLET=18;
export type RawMaterial=keyof typeof RAW_PALLET_PRICE;
/** The purchase of `pallets` of raw material: the price, the tax on top of it (goes to the city's vault) and what leaves the firm's wallet. */
export function purchaseQuote(material:RawMaterial,pallets:number,taxPercent:number,palletPrice:number=RAW_PALLET_PRICE[material]):{base:number;tax:number;total:number} {
  const base=palletPrice*pallets,tax=Math.round(base*taxPercent/100);
  return {base,tax,total:base+tax};
}
/** The owner's own password protects their transfers and purchases (the administration can clear it). */
export const COMPANY_PASSWORD={min:4,max:40,maxAttempts:5,lockS:60} as const;
export const COMPANY_MONEY={max:1_000_000_000} as const;
/** An employee on shift, with the PPE on, inside the plant and with no production running, is paid this every `everyS` seconds. */
export const FACTORY_IDLE_PAY={amount:500,everyS:1800} as const;

// ---- production orders ----
/** Litres of water per bag of solids (a 12-bag recipe is the plant's 1200 L). */
export const WATER_PER_BAG_L=100;
export interface ProductionProduct {id:string;name:string;blurb:string;malteBags:number;mixBags:number;minBatches:number;maxBatches:number}
/** The list an OP is drawn from. More MIX makes a cheaper batch (MIX is cheaper than MALTE); every recipe is one tank, mixed to the plant's usual quality. */
export const PRODUCTION_CATALOG:readonly ProductionProduct[]=[
  {id:'leite-integral',name:'Leite em pó integral',blurb:'A receita de sempre.',malteBags:8,mixBags:4,minBatches:2,maxBatches:5},
  {id:'achocolatado',name:'Achocolatado instantâneo',blurb:'Metade malte, metade mistura.',malteBags:6,mixBags:6,minBatches:2,maxBatches:5},
  {id:'formula-infantil',name:'Fórmula infantil',blurb:'Muito malte, pouca mistura: sai mais caro.',malteBags:10,mixBags:2,minBatches:2,maxBatches:4},
  {id:'cafe-soluvel',name:'Café solúvel',blurb:'Pouco malte, bastante mistura.',malteBags:4,mixBags:8,minBatches:3,maxBatches:6},
  {id:'sopa-instantanea',name:'Sopa instantânea',blurb:'Lote pequeno de nove sacos.',malteBags:6,mixBags:3,minBatches:3,maxBatches:7},
  {id:'suco-em-po',name:'Suco em pó',blurb:'Malte e mistura em partes iguais.',malteBags:5,mixBags:5,minBatches:3,maxBatches:6},
  {id:'bebida-lactea',name:'Bebida láctea',blurb:'Lote grande: dezoito sacos por tanque.',malteBags:12,mixBags:6,minBatches:2,maxBatches:4},
  {id:'cappuccino',name:'Cappuccino instantâneo',blurb:'Lote médio, mais mistura que malte.',malteBags:5,mixBags:7,minBatches:2,maxBatches:5},
];
export const PRODUCTION_OFFERS=3;
export interface ProductionOrder {id:string;productId:string;name:string;malteBags:number;mixBags:number;/** Tank batches the order asks for. */batches:number;createdAt:number}
export type ProductionStatus='approved'|'running';
/** The OP the plant works on: approved by the firm, started by an employee at the control room's computer. */
export interface ActiveProduction extends ProductionOrder {
  status:ProductionStatus;approvedBy:string;approvedByName:string;approvedAt:number;startedBy:string;startedAt:number;
  /** Batches whose tank was started / whose tank was fully dried; bags stacked at the bagging machine since the start. */
  batchesStarted:number;batchesDone:number;bags:number;
}
export interface ProductionLogEntry {id:string;name:string;batches:number;batchesDone:number;bags:number;result:'completed'|'cancelled'|'closed';at:number;by:string}
export interface ProductionBoard {offers:ProductionOrder[];offersBy:string;offersAt:number;active:ActiveProduction|null;history:ProductionLogEntry[]}
export const emptyProductionBoard=():ProductionBoard=>({offers:[],offersBy:'',offersAt:0,active:null,history:[]});
export const orderWaterL=(order:Pick<ProductionOrder,'malteBags'|'mixBags'>):number=>(order.malteBags+order.mixBags)*WATER_PER_BAG_L;
/** Draws `count` different products from the catalog, each with a random number of batches; `random` is injected so a test can fix it. */
export function drawProductionOffers(random:()=>number,makeId:()=>string,now:number,count=PRODUCTION_OFFERS):ProductionOrder[] {
  const pool=[...PRODUCTION_CATALOG],picked:ProductionOrder[]=[];
  while(picked.length<count&&pool.length){
    const product=pool.splice(Math.min(pool.length-1,Math.floor(random()*pool.length)),1)[0]!;
    const batches=product.minBatches+Math.min(product.maxBatches-product.minBatches,Math.floor(random()*(product.maxBatches-product.minBatches+1)));
    picked.push({id:makeId(),productId:product.id,name:product.name,malteBags:product.malteBags,mixBags:product.mixBags,batches,createdAt:now});
  }
  return picked;
}
export interface EstimateRules {rawMaltePrice:number;rawMixPrice:number;palletPrice:number;taxPercent:number;employeeFee:number;maxPalletsPerTruck:number;bagKg:number;yieldMin:number;yieldMax:number}
export interface ProductionEstimate {
  /** Bags of product the order should give (a bad batch gives fewer, a perfect one more). */
  bags:{min:number;expected:number;max:number};pallets:number;
  raw:{malteBags:number;mixBags:number;malteCost:number;mixCost:number;tax:number;total:number};
  revenue:{gross:number;saleTax:number;staffFees:number;net:number};
  /** What is left for the firm: net sales minus the raw material (with its tax). */
  profit:{min:number;expected:number;max:number};
}
/** The preview an OP shows before it is chosen: what it costs to make, what it should sell for and what is left. Sale price is the plant's flat pallet price. */
export function estimateProduction(order:Pick<ProductionOrder,'malteBags'|'mixBags'|'batches'>,rules:EstimateRules):ProductionEstimate {
  const solidBags=(order.malteBags+order.mixBags)*order.batches,at=(quality:number)=>solidBags*(rules.yieldMin+(rules.yieldMax-rules.yieldMin)*quality/100);
  const bags={min:at(70),expected:at(90),max:at(100)};
  const malteBags=order.malteBags*order.batches,mixBags=order.mixBags*order.batches;
  const malteCost=Math.round(malteBags*rules.rawMaltePrice/BAGS_PER_PALLET),mixCost=Math.round(mixBags*rules.rawMixPrice/BAGS_PER_PALLET);
  const tax=Math.round((malteCost+mixCost)*rules.taxPercent/100),rawTotal=malteCost+mixCost+tax;
  const sale=(count:number)=>{
    const pallets=count/BAGS_PER_PALLET,gross=Math.round(pallets*rules.palletPrice),saleTax=Math.round(gross*rules.taxPercent/100);
    const staffFees=Math.ceil(pallets/Math.max(1,rules.maxPalletsPerTruck))*rules.employeeFee;
    return {pallets,gross,saleTax,staffFees,net:Math.max(0,gross-saleTax-staffFees)};
  };
  const mid=sale(bags.expected);
  return {bags,pallets:mid.pallets,raw:{malteBags,mixBags,malteCost,mixCost,tax,total:rawTotal},
    revenue:{gross:mid.gross,saleTax:mid.saleTax,staffFees:mid.staffFees,net:mid.net},
    profit:{min:sale(bags.min).net-rawTotal,expected:mid.net-rawTotal,max:sale(bags.max).net-rawTotal}};
}

/** One catalog product as the administration sees it: a typical order (the middle of its range of batches) and what it earns with the current prices. */
export interface CatalogProfit {product:ProductionProduct;batches:number;estimate:ProductionEstimate}
export const typicalBatches=(product:Pick<ProductionProduct,'minBatches'|'maxBatches'>):number=>Math.round((product.minBatches+product.maxBatches)/2);
export const catalogProfits=(rules:EstimateRules):CatalogProfit[]=>PRODUCTION_CATALOG.map(product=>{
  const batches=typicalBatches(product);
  return {product,batches,estimate:estimateProduction({malteBags:product.malteBags,mixBags:product.mixBags,batches},rules)};
});
/**
 * The lowest pallet price (rounded up to `step`) at which no product of the catalog loses money in a typical order, the other rules as given.
 * Null when no price up to `ceiling` does it (the raw material costs more than the product can ever sell for).
 */
export function breakEvenPalletPrice(rules:EstimateRules,step=500,ceiling=1_000_000):number|null {
  const worst=(price:number)=>Math.min(...catalogProfits({...rules,palletPrice:price}).map(row=>row.estimate.profit.expected));
  if(worst(ceiling)<0)return null;
  let low=0,high=ceiling;
  while(high-low>step){const mid=Math.floor((low+high)/2);if(worst(mid)>=0)high=mid;else low=mid;}
  // The first multiple of `step` above the failing price that already earns: the one before it (below `low`) loses.
  let price=Math.max(step,Math.ceil(low/step)*step);
  while(worst(price)<0&&price<ceiling)price+=step;
  return price;
}

// ---- cleaning ----
export type CleanTaskId='tank1'|'tank2'|'tank3'|'dryer'|'line'|'floor-tanques'|'floor-secador'|'floor-ensaque'|'floor-estoque'|'floor-doca'|'floor-sala';
export interface CleanSpot {x:number;y:number;z:number}
export interface CleanTask {
  id:CleanTaskId;kind:'tank'|'dryer'|'line'|'floor';label:string;/** What the operator does, for the button. */verb:string;
  /** The operator stands within `reach` metres (on the ground plane, and within 1.6 m in height) of any of these spots. */
  spots:readonly CleanSpot[];reach:number;
  /** Seconds the work takes (the dryer's own wash is the machine's `LIMPEZA`, so it has none). */
  durationS:number;pay:number;
  /** Where the dirt is drawn: the centre and the radius (m) of the zone for a floor, the machine's anchor otherwise. */
  at:CleanSpot;radius:number;
}
const spot=(x:number,y:number,z:number):CleanSpot=>({x,y,z});
/** The truck bay (Ponto_EB_Doca): it moved 3 m east in the v6.7 export, so the dock's floor reads the marker instead of repeating its coordinates. */
const DOCK=CITY_MARKERS['Ponto_EB_Doca'];
if(!DOCK)throw new Error('O marcador Ponto_EB_Doca não está nos dados da cidade.');
/**
 * Every place the plant gets dirty and what cleaning it takes. Positions are the map's markers (empresa_brasil_marcadores.json).
 * The washing of a tank is done from its platform, the dryer by its own cycle, the line at the bagging machine and the floors on foot.
 */
export const CLEAN_TASKS:readonly CleanTask[]=[
  {id:'tank1',kind:'tank',label:'Tanque TQ-101',verb:'Lavar o tanque',spots:[spot(337,2,-68.1)],reach:3,durationS:10,pay:20,at:spot(337,1.01,-70.3),radius:1.2},
  {id:'tank2',kind:'tank',label:'Tanque TQ-102',verb:'Lavar o tanque',spots:[spot(340.3,2,-68.1)],reach:3,durationS:10,pay:20,at:spot(340.3,1.01,-70.3),radius:1.2},
  {id:'tank3',kind:'tank',label:'Tanque TQ-103',verb:'Lavar o tanque',spots:[spot(343.6,2,-68.1)],reach:3,durationS:10,pay:20,at:spot(343.6,1.01,-70.3),radius:1.2},
  {id:'dryer',kind:'dryer',label:'Secador',verb:'Lavar a câmara do secador',spots:[spot(352.6,.2,-72),spot(355.7,4.2,-73.9),spot(352.6,4.2,-77),spot(349.5,4.2,-73.9),spot(352.6,4.2,-70.8)],reach:5,durationS:0,pay:40,at:spot(352.6,.2,-72),radius:3.2},
  {id:'line',kind:'line',label:'Linha de ensaque',verb:'Passar água na linha',spots:[spot(357.6,.2,-64.3),spot(357.9,1.4,-65.2),spot(355.1,.5,-65.2)],reach:4,durationS:12,pay:25,at:spot(357.2,.2,-64.8),radius:3},
  {id:'floor-tanques',kind:'floor',label:'Piso dos tanques',verb:'Lavar o piso',spots:[spot(340.3,.2,-65.5)],reach:5,durationS:10,pay:12,at:spot(340.3,.2,-65.5),radius:6},
  {id:'floor-secador',kind:'floor',label:'Piso do secador',verb:'Lavar o piso',spots:[spot(352.6,.2,-68.5)],reach:5,durationS:10,pay:12,at:spot(352.6,.2,-68.5),radius:6},
  {id:'floor-ensaque',kind:'floor',label:'Piso do ensaque',verb:'Lavar o piso',spots:[spot(356.5,.3,-62)],reach:5,durationS:10,pay:12,at:spot(356.5,.3,-62),radius:5.5},
  {id:'floor-estoque',kind:'floor',label:'Piso do estoque',verb:'Lavar o piso',spots:[spot(337.5,.3,-61.6)],reach:5,durationS:10,pay:12,at:spot(337.5,.3,-61.6),radius:6},
  {id:'floor-doca',kind:'floor',label:'Piso da doca',verb:'Lavar o piso',spots:[spot(DOCK.x,.2,DOCK.z)],reach:5,durationS:10,pay:12,at:spot(DOCK.x,.2,DOCK.z),radius:6},
  {id:'floor-sala',kind:'floor',label:'Sala de controle',verb:'Lavar o piso',spots:[spot(347.5,.2,-66)],reach:5,durationS:10,pay:12,at:spot(347.5,.2,-66),radius:4},
];
export const CLEAN_TASK_IDS=CLEAN_TASKS.map(task=>task.id);
export const cleanTaskOf=(id:string):CleanTask|undefined=>CLEAN_TASKS.find(task=>task.id===id);
/** Dirt goes from 0 (clean) to 1 (filthy). At or above `DIRT_PENDING` a place counts as needing cleaning; below `DIRT_CLEAN` it is clean. */
export const DIRT_PENDING=.25,DIRT_CLEAN=.05;
export type DirtLevels=Record<CleanTaskId,number>;
export const cleanDirt=():DirtLevels=>Object.fromEntries(CLEAN_TASK_IDS.map(id=>[id,0])) as DirtLevels;
/** The plant's dirt as the room sends it. `required`: a production just ended, nothing new starts until every place is clean. */
export interface FactoryDirt {levels:DirtLevels;required:boolean}
/** Places that still need cleaning (a task is listed when it is at or above `DIRT_PENDING`). */
export const pendingCleaning=(dirt:FactoryDirt):CleanTaskId[]=>CLEAN_TASK_IDS.filter(id=>(dirt.levels[id]??0)>=DIRT_PENDING);
/** Pay for cleaning goes through the job wallet; this is the exact tasks' pay table. */
export const cleanPayOf=(id:CleanTaskId):number=>cleanTaskOf(id)?.pay??0;

// ---- what the room sends the browser ----
export type CompanyMemberRole=CompanyRole|'employee';
export interface CompanyMemberView {userId:string;name:string;role:CompanyMemberRole;onShift:boolean;since:string|null;/** Whether this owner has a password (only owners can). */hasPassword?:boolean}
export interface CompanyApplicantView {userId:string;name:string;appliedAt:string}
export interface CompanyLedgerView {id:string;amount:number;balanceAfter:number;reason:string;actorName:string;at:string}
export interface CompanyOrderView {id:string;material:RawMaterial;pallets:number;status:string;base:number;tax:number;createdAt:string;/** True when nobody took it yet (it can still be cancelled with a refund). */cancellable:boolean}
export interface CompanyView {
  name:string;role:CompanyRole;balance:number;
  /** My own password protects my transfers and purchases. */hasPassword:boolean;
  members:CompanyMemberView[];applicants:CompanyApplicantView[];ledger:CompanyLedgerView[];orders:CompanyOrderView[];
  /** Bags on the racks, and the room left on them. */stock:{MALTE:number;MIX:number;PRODUTO:number;roomMALTE:number;roomMIX:number};
  /** Prices of one pallet of raw material, the tax on top, and the product's pallet price. */prices:{MALTE:number;MIX:number;taxPercent:number;palletPrice:number};
  production:ProductionBoard&{estimates:Record<string,ProductionEstimate>;canDraw:boolean;canApprove:boolean};
  plant:{operators:number;dirtRequired:boolean;pendingCleaning:CleanTaskId[];running:boolean};
  idlePay:{amount:number;everyS:number};
  /** Whether the sales' money so far came in (summary of the firm's finance). */
  totals:{sales:number;gross:number;income:number;spent:number};
}
export interface CompanyResult {action:string;ok:boolean;message:string;requestId?:string}
