import {CAR_PARTS,CAR_REPAIR,carMileageWear,readCarParts,wearCarParts,writeCarParts} from './car-parts.js';
import {MOTO_PARTS,MOTO_REPAIR,mileageWear,readMotoParts,wearMotoParts,writeMotoParts,type MotoHitArea,type MotoParts} from './moto-parts.js';
import {isCarModel} from './vehicle-models.js';
export const vehicleParts=(model:string|undefined)=>isCarModel(model)?CAR_PARTS:MOTO_PARTS;
export const vehicleRepair=(model:string|undefined)=>isCarModel(model)?CAR_REPAIR:MOTO_REPAIR;
export const readVehicleParts=(model:string|undefined,text:string|undefined):Record<string,number>=>isCarModel(model)?readCarParts(text):readMotoParts(text);
export const writeVehicleParts=(model:string|undefined,parts:Record<string,number>)=>isCarModel(model)?writeCarParts(parts):writeMotoParts(parts as MotoParts);
export const wearVehicleParts=(vehicle:{model?:string;parts:string},closing:number,area:MotoHitArea)=>isCarModel(vehicle.model)?wearCarParts(vehicle.parts,closing,area):writeMotoParts(wearMotoParts(readMotoParts(vehicle.parts),closing,area));
export const vehicleMileageWear=(vehicle:{model?:string;parts:string})=>isCarModel(vehicle.model)?carMileageWear(vehicle.parts):writeMotoParts(mileageWear(readMotoParts(vehicle.parts)));
