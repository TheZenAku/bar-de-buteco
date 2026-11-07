import type {MotoState} from './moto.js';
import {MOTO_ENGINE} from './moto-parts.js';
import {TRUCK_MODEL,isCarModel} from './vehicle-models.js';
import {pumpNear} from './refueling.js';

/** Fuel is a percentage, stored per vehicle; capacity and consumption follow its model. */
export const vehicleTank=(model?:string)=>model===TRUCK_MODEL?110:isCarModel(model)?42:5.5;
export const vehiclePowered=(vehicle:Pick<MotoState,'engine'|'ignition'>)=>vehicle.engine===MOTO_ENGINE.ON&&vehicle.ignition!==false;
export function vehicleFuelUse(model:string|undefined,speed:number,gas:boolean,dt:number):number {
  const litresPerKm=model===TRUCK_MODEL?.21:isCarModel(model)?.085:.032,idleLitresPerHour=model===TRUCK_MODEL?1.6:isCarModel(model)?.65:.18;
  return (Math.abs(speed)*dt/1000*litresPerKm*(gas?1.15:1)+idleLitresPerHour*dt/3600)/vehicleTank(model)*100;
}
export const atVehicleFuelPump=(vehicle:{x:number;y:number;z:number})=>!!pumpNear(vehicle);
