import {z} from 'zod';
import {ITEM_IDS,itemById,type InventoryStack,type ItemId} from './inventory.js';
import {TRUCK_MODEL,carSpec} from './vehicle-models.js';

/**
 * The truck's cargo hold (docs/sistemas/caminhao.md): its own inventory, kept per vehicle in the API (vehicle_storage), apart from the
 * 12-slot backpack. Only the key holder opens it, standing behind the truck; while it is open the box's roll-up door is up (MotoState.trunk).
 */
export const STORAGE={
  /** Different items the hold takes (the backpack has INVENTORY_CAPACITY). */
  SLOTS:24,
  /** One stack holds this many times the backpack's limit for that item. */
  STACK_FACTOR:10,
  /** How far behind the rear bumper the player may stand (metres), and how far past the truck's sides. */
  REACH:2.4,SIDE:.6,
  /** The truck must be this still (m/s of its hull) for the door to go up. */
  MAX_SPEED:.2,
  /** Units in the hold from which the drawn load goes to 1, 2 and 3 (carga_1..3 in the model). */
  LOAD_STEPS:[1,25,70] as const,
  /** The most one move carries. */
  MAX_MOVE:100,
  /** The room closes the door by itself when its holder stops using it (ms). */
  IDLE_MS:90_000,
} as const;

export const hasStorage=(model:string|undefined)=>model===TRUCK_MODEL;
export const storageStackMax=(itemId:string)=>(itemById(itemId)?.stackMax??0)*STORAGE.STACK_FACTOR;
export type StorageDirection='deposit'|'withdraw';
/** What the hold keeps, as the panel and the room read it. */
export interface StorageView {vehicleId:string;plate:string;name:string;stacks:InventoryStack[];capacity:number;usedSlots:number;units:number;load:number}
/** 0 empty, then 1..3 as it fills (which crates the model shows). */
export const storageLoadOfUnits=(units:number):number=>STORAGE.LOAD_STEPS.reduce<number>((level,step,index)=>units>=step?index+1:level,0);
export const storageLoad=(stacks:readonly InventoryStack[]):number=>storageLoadOfUnits(stacks.reduce((sum,stack)=>sum+Math.max(0,stack.quantity),0));
export const storageUnits=(stacks:readonly InventoryStack[])=>stacks.reduce((sum,stack)=>sum+Math.max(0,stack.quantity),0);

export const storageOpenSchema=z.object({motoId:z.string().max(32)}).strict();
export const storageMoveSchema=z.object({
  motoId:z.string().max(32),itemId:z.enum(ITEM_IDS),quantity:z.number().int().min(1).max(STORAGE.MAX_MOVE),
  direction:z.enum(['deposit','withdraw']),requestId:z.string().uuid(),
}).strict();
export type StorageMove=z.infer<typeof storageMoveSchema>;

/**
 * Metres behind the truck's rear bumper where the point is, if it is at the back and within the hold's reach (0 touching the bumper);
 * Infinity otherwise. A point beside or in front of the truck is never "at the back".
 */
export function storageGap(vehicle:{x:number;z:number;yaw:number;model?:string},position:{x:number;z:number}):number {
  const spec=carSpec(vehicle.model),s=Math.sin(vehicle.yaw),c=Math.cos(vehicle.yaw),dx=position.x-vehicle.x,dz=position.z-vehicle.z;
  const side=dx*c-dz*s,along=dx*s+dz*c,behind=spec.CENTRE_Z-spec.HALF_LENGTH-along;
  return behind>=-.3&&behind<=STORAGE.REACH&&Math.abs(side)<=spec.HALF_WIDTH+STORAGE.SIDE?Math.max(0,behind):Infinity;
}
/** Where the holder stands to use it, in the truck's frame: 1,15 m behind the bumper (the model's ponto_bau_acesso). */
export const STORAGE_STAND={x:0,z:-3.93} as const;

/** What stops a hold from opening, in words, or '' when it may. `distance` and `speed` are the truck's own, measured by the caller. */
export function storageRefusal(vehicle:{model?:string;ownerId?:string;vehicleId?:string;phase?:string},who:string,gap:number,speed:number,slack=0):string {
  if(!hasStorage(vehicle.model))return 'Este veículo não tem baú.';
  if(!vehicle.vehicleId||!vehicle.ownerId)return 'Só caminhões emplacados têm baú.';
  if(vehicle.ownerId!==who)return 'Só quem tem a chave do caminhão abre o baú.';
  if(vehicle.phase)return 'O caminhão não está em condições de abrir o baú.';
  if(speed>STORAGE.MAX_SPEED)return 'Espere o caminhão parar.';
  if(gap>STORAGE.REACH+slack)return 'Vá para a traseira do caminhão para abrir o baú.';
  return '';
}
export type {ItemId};
