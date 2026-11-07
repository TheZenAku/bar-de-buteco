import {CITY_SOLIDS} from './city.js';
import {CAR_MODEL,TRUCK_MODEL} from './vehicle-models.js';

export interface FuelPoint {x:number;y:number;z:number}
export interface FuelPump extends FuelPoint {id:string;npcId:string;ux:number;uz:number;price:number}
/** Authored pump colliders, including their orientation. One attendant and reservation per pump. */
export const FUEL_PUMPS:readonly FuelPump[]=CITY_SOLIDS.filter(c=>/^COL_Cid_Bomba(?:\.\d+)?$/.test(c.id)).map((c,i)=>({
  id:`pump-${i+1}`,npcId:`attendant-${i+1}`,x:c.x,y:c.minY??.15,z:c.z,ux:c.turn?.ux??1,uz:c.turn?.uz??0,price:6,
}));
export type FuelPhase='idle'|'authorizing'|'to-pump'|'take'|'to-car'|'insert'|'fueling'|'remove'|'return'|'replace'|'paying'|'home';
export interface FuelServiceState {
  id:string;npcId:string;phase:FuelPhase;startedAt:number;playerId:string;vehicleId:string;litres:number;total:number;price:number;message:string;
  tankX:number;tankY:number;tankZ:number;
}
export interface FuelReceipt {pumpId:string;litres:number;paid:number;message:string}
export const FUEL={SPEED:1.25,LITRES_PER_SECOND:1.2,ACTION_MS:1500,MAX_MS:180_000,REACH:4.5} as const;
export const pumpPoint=(pump:FuelPump,side:number,along=0,height=0):FuelPoint=>({x:pump.x-pump.uz*side+pump.ux*along,y:pump.y+height,z:pump.z+pump.ux*side+pump.uz*along});
export const pumpDock=(pump:FuelPump)=>pumpPoint(pump,.46,0,1.12);
export const pumpStand=(pump:FuelPump)=>pumpPoint(pump,.97);
export const pumpHome=(pump:FuelPump)=>pumpPoint(pump,.97,1.5);
export const pumpNear=(v:FuelPoint)=>FUEL_PUMPS.filter(p=>Math.abs(p.y-v.y)<.6&&Math.hypot(p.x-v.x,p.z-v.z)<=FUEL.REACH).sort((a,b)=>Math.hypot(a.x-v.x,a.z-v.z)-Math.hypot(b.x-v.x,b.z-v.z))[0];
/** Vehicle-local filler cap, +Z forward. The hatch's filler is on its rear right quarter; the truck's, on the left, by its tank. */
export function vehicleFiller(v:FuelPoint&{yaw:number;model?:string}):FuelPoint {
  const truck=v.model===TRUCK_MODEL,hatch=v.model===CAR_MODEL;
  const x=truck?1.12:hatch?-.78:0,z=truck?.72:hatch?-.98:.12,y=truck?.72:hatch?.85:.92;
  return {x:v.x+Math.cos(v.yaw)*x+Math.sin(v.yaw)*z,y:v.y+y,z:v.z-Math.sin(v.yaw)*x+Math.cos(v.yaw)*z};
}
export function fillerStand(v:FuelPoint&{yaw:number;model?:string}):FuelPoint {
  const p=vehicleFiller(v),side=v.model===TRUCK_MODEL?.55:v.model===CAR_MODEL?-.43:-.85;
  return {x:p.x+Math.cos(v.yaw)*side,y:v.y,z:p.z-Math.sin(v.yaw)*side};
}
/** Coins are whole integers in the existing wallet; round once for the entire service. */
export const fuelCost=(litres:number,price:number)=>Math.ceil(Math.max(0,litres*price)-1e-6);
export const vehicleFuelBusy=(services:Record<string,FuelServiceState>|undefined,id:string)=>Object.values(services??{}).some(s=>s.vehicleId===id&&s.phase!=='idle');
