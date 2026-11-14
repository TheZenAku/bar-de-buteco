import {z} from 'zod';

export const FACTORY_MATERIALS=['MALTE','MIX','PRODUTO','ACO','ALUMINIO','POLIMERO','MOLAS'] as const;
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
  waterFlowLps:20,agitatorRpm:120,dissolveS:90,homogenizeS:60,preheatS:180,coolS:60,dryerFlowLph:6000,bagFillS:9,bagKg:25,bagToleranceKg:.2,slotCapacity:18,timeScale:1,
};
/** The dryer's flow before 2026-11-11 (1200 L took ~65 min, so the tank level looked frozen): saved plants with it are moved to the new default. */
export const OLD_DRYER_FLOW_LPH=1100;
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

export interface TankRuntime {id:1|2|3;state:TankState;waterL:number;malteBags:number;mixBags:number;/** Dissolved solids still in the tank (kg); undefined in older saves: the bags poured x the bag weight. */solidsKg?:number;temperatureC:number;agitatorRpm:number;lidOpen:boolean;stepS:number;quality:number;penalties:string[];restored?:string}
export interface DryerRuntime {state:DryerState;inletC:number;outletC:number;flowLph:number;powderKg:number;stepS:number;fault:string;sourceTank:1|2|3|null;restored?:string}
export interface BaggingRuntime {state:BaggingState;weightKg:number;emptyBags:number;palletBags:number;producedBags:number;rejectedBags:number;lot:string;/** Bags closed with less than a full bag of powder (the silo ran out). */lightBags?:number;/** Weight of the bag stacked last (the wage follows it). */lastBagKg?:number;restored?:string}
export const emptyTank=(id:1|2|3):TankRuntime=>({id,state:'VAZIO',waterL:0,malteBags:0,mixBags:0,temperatureC:20,agitatorRpm:0,lidOpen:false,stepS:0,quality:100,penalties:[]});
export const emptyDryer=():DryerRuntime=>({state:'PARADO',inletC:20,outletC:20,flowLph:0,powderKg:0,stepS:0,fault:'',sourceTank:null});
export const emptyBagging=():BaggingRuntime=>({state:'PARADO',weightKg:0,emptyBags:0,palletBags:0,producedBags:0,rejectedBags:0,lot:''});

/** Kg of solids in the tank (what the bags poured brought, less what the dryer already took). */
export const solidsOf=(tank:Pick<TankRuntime,'malteBags'|'mixBags'|'solidsKg'>,balance=DEFAULT_FACTORY_BALANCE):number=>tank.solidsKg??(tank.malteBags+tank.mixBags)*balance.bagKg;
/** Litres in the tank: the water plus what the dissolved solids add (recipe.litresPerKg). The liquid on screen and the panel's level follow this. */
export const tankVolumeL=(tank:Pick<TankRuntime,'waterL'|'malteBags'|'mixBags'|'solidsKg'>,balance=DEFAULT_FACTORY_BALANCE):number=>tank.waterL+solidsOf(tank,balance)*balance.recipe.litresPerKg;
export function addIngredient(tank:TankRuntime,material:'MALTE'|'MIX',balance=DEFAULT_FACTORY_BALANCE):TankRuntime {
  if(!tank.lidOpen)throw new Error('Abra a tampa do tanque.');
  if(tank.agitatorRpm<=0)throw new Error('Ligue o agitador.');
  if(tank.waterL<=0)throw new Error('Adicione água antes dos insumos.');
  if(!['AGUARDANDO_INSUMOS','DISSOLVENDO'].includes(tank.state))throw new Error('O tanque não aceita insumos nesta etapa.');
  const solidsKg=solidsOf(tank,balance)+balance.bagKg;
  if(material==='MIX'&&tank.malteBags<balance.recipe.malteBags)return {...tank,solidsKg,mixBags:tank.mixBags+1,quality:Math.max(0,tank.quality-8),penalties:[...tank.penalties,'mix_fora_de_ordem']};
  return {...tank,solidsKg,[material==='MALTE'?'malteBags':'mixBags']:(material==='MALTE'?tank.malteBags:tank.mixBags)+1};
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
/** Seconds the dryer's cleaning lasts (it used to last forever: nothing ended it). */
export const CLEAN_S=45;
export function tickDryer(dryer:DryerRuntime,dtS:number,balance=DEFAULT_FACTORY_BALANCE):DryerRuntime {
  const dt=Math.max(0,dtS)*balance.timeScale,next={...dryer,stepS:dryer.stepS+dt};
  if(dryer.state==='PRE_AQUECENDO'){
    next.inletC+=(190-next.inletC)*(1-Math.exp(-dt/45));next.outletC+=(87-next.outletC)*(1-Math.exp(-dt/55));
    if(next.stepS>=balance.preheatS&&next.inletC>=180){next.state='PRONTO';next.stepS=0;}
  }else if(dryer.state==='LIMPEZA'){
    if(next.stepS>=CLEAN_S){next.state='PARADO';next.stepS=0;}
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

/** Metres from each station within which an operator can act; the panel reaches everything near the control room. */
export const FACTORY_REACH={entrance:3,panel:4,tank:3,dryer:5,bagging:4,pallet:4,rack:2.5,dock:9,view:90} as const;
/** Coins paid to the operator for work done (job: wallet reasons, so the daily job cap applies). A truck's sale and freight are the administration's (FactoryFinance). */
export const FACTORY_PAY={bag:3,pallet:20,batch:12} as const;
/** A purchase order nobody takes is delivered by the supplier's own driver (an NPC) after this many minutes at most. */
export const FACTORY_NPC_DELIVERY_MIN=30;
/** Pallets one purchase order can ask for, and how many open pallets of one material the plant may have at once. */
export const FACTORY_ORDER={maxPallets:4,maxOpenPallets:6} as const;
/** Empty bags in the bale at the bagging machine, and how many a restock brings. */
export const FACTORY_BAGS={start:60,restock:60,lowAt:4} as const;
/** The recipe's quality below which a batch is flagged for the operator. */
export const FACTORY_QUALITY_MIN=70;

/** Seconds a timed step lasts at the balance's speed, to draw its progress bar. */
export function stepDurationS(state:string,balance:FactoryBalance):number {
  switch(state){
    case 'DISSOLVENDO':return balance.dissolveS;case 'HOMOGENEIZANDO':return balance.homogenizeS;case 'PRE_AQUECENDO':return balance.preheatS;case 'RESFRIANDO':return balance.coolS;
    default:return 0;
  }
}

/**
 * The plant's money (docs/sistemas/fabrica.md, "Logística e finanças"), all of it adjustable in the administration. A pallet of product
 * shipped is worth `palletPrice`; when the truck leaves the plant the sale is settled: `taxPercent` goes to the city's vault, the operator who
 * loaded it gets `employeeFee`, and the owner of the firm (`ownerUserId`) gets the rest. The driver, who owns the truck, is paid the freight
 * when the cargo arrives. Raw material the driver fetches pays `purchaseFreight` plus the same per-km and per-pallet freight.
 */
export interface FactoryFinance {
  palletPrice:number;taxPercent:number;employeeFee:number;
  /** What a full pallet (18 bags) of raw material costs the firm before the tax on top of it (docs/sistemas/empresa.md). */
  rawMaltePrice:number;rawMixPrice:number;
  /** Presence pay: an employee on shift with the PPE, inside the plant and with no production running, earns `idlePay` coins every `idleEveryMin` minutes. */
  idlePay:number;idleEveryMin:number;
  /** The player who owns the firm and gets what is left of a sale ('' = the game's owner account; none found = the city's vault). */
  ownerUserId:string;
  freightBase:number;freightPerKm:number;freightPerPallet:number;purchaseFreight:number;
  /** Most pallets one truck takes in one shipment. */
  maxPalletsPerTruck:number;
  /** Metres from the delivery point at which a stopped truck counts as arrived. */
  deliveryRadius:number;
}
export const DEFAULT_FACTORY_FINANCE:FactoryFinance={palletPrice:60000,taxPercent:15,employeeFee:2000,rawMaltePrice:30000,rawMixPrice:20000,idlePay:500,idleEveryMin:30,ownerUserId:'',freightBase:400,freightPerKm:1500,freightPerPallet:200,purchaseFreight:600,maxPalletsPerTruck:10,deliveryRadius:14};
const money=(max:number)=>z.number().int().min(0).max(max);
export const factoryFinancePatchSchema=z.object({
  palletPrice:money(1_000_000),taxPercent:z.number().min(0).max(100),employeeFee:money(1_000_000),rawMaltePrice:money(1_000_000),rawMixPrice:money(1_000_000),idlePay:money(100_000),idleEveryMin:z.number().int().min(1).max(240),ownerUserId:z.string().max(64),
  freightBase:money(1_000_000),freightPerKm:money(1_000_000),freightPerPallet:money(1_000_000),purchaseFreight:money(1_000_000),
  maxPalletsPerTruck:z.number().int().min(1).max(10),deliveryRadius:z.number().min(6).max(60),
}).partial().strict();
export type FactoryFinancePatch=z.infer<typeof factoryFinancePatchSchema>;
/** Reads stored settings over the defaults, ignoring anything that is not a valid value. */
export function mergeFactoryFinance(stored:unknown):FactoryFinance {
  const parsed=factoryFinancePatchSchema.safeParse(stored&&typeof stored==='object'?stored:{});
  return {...DEFAULT_FACTORY_FINANCE,...(parsed.success?parsed.data:{})};
}
/** How a sale's gross is divided: the tax first, then the operator's fee (never more than what is left), the owner gets the rest. */
export function settleSale(gross:number,finance:Pick<FactoryFinance,'taxPercent'|'employeeFee'>):{gross:number;tax:number;staff:number;owner:number} {
  const tax=Math.min(gross,Math.floor(gross*finance.taxPercent/100)),staff=Math.min(finance.employeeFee,gross-tax);
  return {gross,tax,staff,owner:gross-tax-staff};
}
/** The driver's pay for one trip: a base, the distance (km) and the pallets carried. */
export function freightFor(finance:FactoryFinance,kind:'sale'|'purchase',pallets:number,distanceM:number):number {
  return Math.round((kind==='purchase'?finance.purchaseFreight:finance.freightBase)+finance.freightPerKm*distanceM/1000+finance.freightPerPallet*pallets);
}
export type ShipmentKind='sale'|'purchase';
/** sale: loaded (at the dock) → in_transit (left the plant, paid out) → delivered; purchase: to_supplier → returning (cargo in the hold) → delivered. */
export type ShipmentStatus='loaded'|'in_transit'|'to_supplier'|'returning'|'delivered'|'cancelled';
export const SHIPMENT_ACTIVE:readonly ShipmentStatus[]=['loaded','in_transit','to_supplier','returning'];
/** The freight app's offer: an open purchase order a truck driver can take (the plant's request). */
export interface FreightOffer {id:string;material:FactoryMaterial;pallets:number;bags:number;createdAt:number;/** When the supplier's own driver (an NPC) delivers it if nobody takes it. */npcAt:number;requestedBy:string}
/** What the freight app shows (room message `freight.state`). */
export interface FreightState {
  /** The player has a truck key or is at the wheel of one: the app exists for them. */
  eligible:boolean;
  /** Whether they are at the wheel of a truck right now (needed to accept), and which. */
  driving:{plate:string;vehicleId:string}|null;
  offers:FreightOffer[];
  trip:{id:string;kind:ShipmentKind;status:ShipmentStatus;material:FactoryMaterial;pallets:number;plate:string;freight:number;destLabel:string;destX:number;destZ:number}|null;
  recent:Array<{id:string;kind:ShipmentKind;material:FactoryMaterial;pallets:number;freight:number;status:ShipmentStatus;at:string|null}>;
  pay:{purchaseFreight:number;freightPerKm:number;freightPerPallet:number};
}
export interface FactoryShipmentView {
  id:string;kind:ShipmentKind;status:ShipmentStatus;vehicleId:string;plate:string;driverId:string;driverName:string;loaderId:string;loaderName:string;material:FactoryMaterial;pallets:number;bags:number;orderId:string|null;
  destX:number;destZ:number;destLabel:string;distanceM:number;gross:number;tax:number;staff:number;owner:number;freight:number;ownerId:string;createdAt:string;departedAt:string|null;deliveredAt:string|null;
}
/** The truck at the dock and how the room reads it: stopped, whole, and its owner's key. */
export const FACTORY_DOCK={/** A loaded truck farther than this from the dock has left the plant. */exitDistance:24,/** The truck must be this still (m/s) to be loaded or unloaded or to count as arrived. */parkSpeed:.3} as const;

export * from './company.js';
export * from './gates.js';
export * from './cart.js';
