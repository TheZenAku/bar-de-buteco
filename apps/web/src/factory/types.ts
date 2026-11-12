import type {ActiveProduction,CleanTaskId,FactoryDirt,FactoryShipmentView,ProductionLogEntry} from '@bar/shared/factory';
export type {FactoryShipmentView};
/** What the room sends the panel (FactoryDirector.snapshot plus the orders and who is looking: BarRoom.factoryView). */
export type Material='MALTE'|'MIX'|'PRODUTO';
export interface TankView {id:1|2|3;state:string;waterL:number;malteBags:number;mixBags:number;/** Dissolved solids left in the tank (kg); the liquid's volume is the water plus these x litresPerKg. */solidsKg?:number;temperatureC:number;agitatorRpm:number;lidOpen:boolean;stepS:number;quality:number;penalties:string[]}
export interface DryerView {state:string;inletC:number;outletC:number;flowLph:number;powderKg:number;stepS:number;fault:string;sourceTank:number|null}
export interface BaggingView {state:string;weightKg:number;emptyBags:number;palletBags:number;producedBags:number;rejectedBags:number;lot:string;lightBags?:number;lastBagKg?:number}
export interface AlarmView {id:string;severity:'info'|'warning'|'alarm'|'critical';source:string;text:string;at:number;acknowledged:boolean;key?:string;active?:boolean}
export interface EventView {id:number;at:number;kind:'info'|'ok'|'warn'|'bad';text:string}
export interface SlotView {marker:string;material:Material;quantity:number;capacity:number;batchId:string}
export interface OrderView {id:string;kind:'purchase'|'sale';material:Material;pallets:number;price:number;status:string;acceptedBy?:string|null;updatedAt?:string;createdAt?:string;/** When the supplier's own driver (an NPC) delivers it if no player does. */dueAt?:string|null}
/** A player's truck parked at the dock. */
export interface DockTruck {vehicleId:string;ownerId:string;ownerName:string;plate:string;/** Whoever sits at the wheel now ('' when nobody). */driverId:string}
/** The money rules the panel shows (the administration sets them). */
export interface FinanceView {palletPrice:number;taxPercent:number;employeeFee:number;maxPalletsPerTruck:number;freightBase:number;freightPerKm:number;freightPerPallet:number;purchaseFreight:number;idlePay?:number;idleEveryMin?:number}
/** A driver's current trip (factory.route); `x`/`z`: where the GPS should go. */
export interface RouteView {id:string;kind:'sale'|'purchase';status:string;material:Material;pallets:number;plate:string;freight:number;x:number;y:number;z:number;label:string;title:string}
export interface FactoryView {
  revision:number;emergency:boolean;activeOperators:number;pausedWithoutOperator:boolean;siloCapacityKg:number;
  balance:{recipe:{waterL:number;targetC:number;malteBags:number;mixBags:number;litresPerKg:number};timeScale:number;bagKg:number;dissolveS:number;homogenizeS:number;preheatS:number;coolS:number};
  tanks:TankView[];dryer:DryerView;bagging:BaggingView;alarms:AlarmView[];events:EventView[];slots:SlotView[];orders:OrderView[];
  shipments:FactoryShipmentView[];dock:{trucks:DockTruck[]};finance:FinanceView;
  /** The vehicle gate as the operators set it (`open`), and the visitor ringing the intercom, if any. */
  gate:{open:boolean;ringing:null|{name:string;at:number}};
  /** How dirty each place of the plant is (0 clean .. 1 filthy), and whether a finished production asks for a full cleaning before the next one. */
  dirt:FactoryDirt;
  /** The production order the plant works on (none: nothing can be started) and the last ones. */
  production:{active:ActiveProduction|null;history:ProductionLogEntry[]};
  me:{ppe:boolean;onShift:boolean;carrying:null|'MALTE'|'MIX';/** The cleaning task in progress (the room finishes it when the time is up). */clean:null|{task:CleanTaskId;startedAt:number;endsAt:number;/** The room's clock when it sent this (the progress runs from there, whatever the browser's clock says). */now?:number}};
}
export interface EmploymentView {
  employment:null|{jobId:string;status:'hired'|'resigned'|'dismissed'|'applied';hiredAt:string;cooldownUntil?:string|null};
  shift:null|{startedAt:string;earned:number;station:string};
  config?:{contractSlots:number;shiftSlots:number;cooldownMs:number};
}
/** The answer to one action (BarRoom.factoryReply). */
export interface FactoryResult {action:string;ok:boolean;message:string;requestId?:string;pay?:number;material?:string}
export interface FactoryPaid {amount:number;label:string;capped:boolean}
