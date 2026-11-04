import type {MotoState} from './moto.js';
import {MOTO_ENGINE} from './moto-parts.js';
import {CAR_MODEL} from './vehicle-models.js';
import {GARAGE,GARAGES} from './garage.js';

/** Fuel is a percentage, stored per vehicle; capacity and consumption follow its model. */
export const vehicleTank=(model?:string)=>model===CAR_MODEL?42:5.5;
export const vehiclePowered=(vehicle:Pick<MotoState,'engine'|'ignition'>)=>vehicle.engine===MOTO_ENGINE.ON&&vehicle.ignition!==false;
export function vehicleFuelUse(model:string|undefined,speed:number,gas:boolean,dt:number):number {
  const litresPerKm=model===CAR_MODEL?.085:.032,idleLitresPerHour=model===CAR_MODEL?.65:.18;
  return (Math.abs(speed)*dt/1000*litresPerKm*(gas?1.15:1)+idleLitresPerHour*dt/3600)/vehicleTank(model)*100;
}
export const atVehicleFuelPump=(vehicle:{x:number;y:number;z:number})=>GARAGES.some(garage=>Math.hypot(vehicle.x-garage.x,vehicle.z-garage.z)<=GARAGE.STORE_REACH&&Math.abs(vehicle.y-garage.y)<2);
