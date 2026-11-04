import {CAR_PARTS,CAR_REPAIR,carMileageWear,readCarParts,wearCarParts,writeCarParts} from './car-parts.js';
import {MOTO_PARTS,MOTO_REPAIR,mileageWear,readMotoParts,wearMotoParts,writeMotoParts,type MotoHitArea,type MotoParts} from './moto-parts.js';
import {CAR_MODEL} from './vehicle-models.js';
export const vehicleParts=(model:string|undefined)=>model===CAR_MODEL?CAR_PARTS:MOTO_PARTS;
export const vehicleRepair=(model:string|undefined)=>model===CAR_MODEL?CAR_REPAIR:MOTO_REPAIR;
export const readVehicleParts=(model:string|undefined,text:string|undefined):Record<string,number>=>model===CAR_MODEL?readCarParts(text):readMotoParts(text);
export const writeVehicleParts=(model:string|undefined,parts:Record<string,number>)=>model===CAR_MODEL?writeCarParts(parts):writeMotoParts(parts as MotoParts);
export const wearVehicleParts=(vehicle:{model?:string;parts:string},closing:number,area:MotoHitArea)=>vehicle.model===CAR_MODEL?wearCarParts(vehicle.parts,closing,area):writeMotoParts(wearMotoParts(readMotoParts(vehicle.parts),closing,area));
export const vehicleMileageWear=(vehicle:{model?:string;parts:string})=>vehicle.model===CAR_MODEL?carMileageWear(vehicle.parts):writeMotoParts(mileageWear(readMotoParts(vehicle.parts)));
