export const CAR_MODEL='carro-hatch';
export const CAR_NAME='Hatch 80';
export const DEFAULT_CAR_COLOR='#ccc9c2';
export const TRUCK_MODEL='caminhao-bau';
export const TRUCK_NAME='Caminhão Baú';
export const DEFAULT_TRUCK_COLOR='#efefea';
export const MOTO_FOGO_MODEL='moto-fogo';
export const MOTO_FOGO_NAME='Caveira em Chamas';
/** The red the bike's texture was painted with: the colour that leaves it as it came (engine/moto-paint.ts repaints the reds to the owner's). */
export const FOGO_DEFAULT_COLOR='#6b1d1d';
/** Register a playable model here once: administration spawn, registration and filters use this catalogue. */
export const VEHICLE_CATALOG=[
  {model:'moto-delivery',name:'Highland Bar Delivery',kind:'moto',seats:1,defaultColor:DEFAULT_CAR_COLOR,paintable:false,photo:'moto/foto-v4.webp'},
  {model:MOTO_FOGO_MODEL,name:MOTO_FOGO_NAME,kind:'moto',seats:1,defaultColor:FOGO_DEFAULT_COLOR,paintable:true,photo:'moto/foto-fogo.webp'},
  {model:CAR_MODEL,name:CAR_NAME,kind:'carro',seats:4,defaultColor:DEFAULT_CAR_COLOR,paintable:true,photo:'carro/foto.png'},
  {model:TRUCK_MODEL,name:TRUCK_NAME,kind:'carro',seats:2,defaultColor:DEFAULT_TRUCK_COLOR,paintable:true,photo:'caminhao/foto.png'},
] as const;
export type VehicleModel=typeof VEHICLE_CATALOG[number]['model'];
export const VEHICLE_MODELS=VEHICLE_CATALOG.map(vehicle=>vehicle.model) as [VehicleModel,...VehicleModel[]];
export const vehicleDefinition=(model:string)=>VEHICLE_CATALOG.find(vehicle=>vehicle.model===model);
export const defaultVehicleColor=(model:string)=>vehicleDefinition(model)?.defaultColor??DEFAULT_CAR_COLOR;
export interface VehicleOffer {model:string;name:string;price:number;seats:number;photo:string}
/** Four wheels and doors: the hatch and the truck share the car's physics, parts, doors, fuel and room rules. */
export const isCarModel=(model:string|undefined)=>model===CAR_MODEL||model===TRUCK_MODEL;
export const isCar=(vehicle:{model?:string}|undefined)=>isCarModel(vehicle?.model);
export const isHatch=(vehicle:{model?:string}|undefined)=>vehicle?.model===CAR_MODEL;
export const isTruck=(vehicle:{model?:string}|undefined)=>vehicle?.model===TRUCK_MODEL;
export const isFogo=(vehicle:{model?:string}|undefined)=>vehicle?.model===MOTO_FOGO_MODEL;
export const vehicleName=(model:string)=>vehicleDefinition(model)?.name??model;
/** The price table's key for a model (prices.ts). */
export const vehiclePriceKey=(model:string)=>model===CAR_MODEL?'vehicle:carro':model===TRUCK_MODEL?'vehicle:caminhao':model===MOTO_FOGO_MODEL?'vehicle:moto-fogo':'vehicle:moto';
export const vehiclePhoto=(model:string)=>vehicleDefinition(model)?.photo??VEHICLE_CATALOG[0].photo;
/** Measured from the supplied rig, at its authored metre scale. */
export const CAR={SCALE:1,WHEELBASE:2.314,WHEEL_TRACK:1.33,WHEEL_RADIUS:.285,HALF_WIDTH:.76,HALF_LENGTH:1.80,CENTRE_Z:0,HEIGHT:1.39,
  MASS:850,ENGINE:3800,REVERSE:1800,BRAKE:8000,HANDBRAKE:7000,ROLLING:120,DRAG:2.45,TOP_SPEED:38.9,REVERSE_SPEED:4.5,
  MAX_STEER:35*Math.PI/180,GRIP:17,STEER_RATE:4,STEER_RETURN:6,SUBSTEP:.1,REACH:1.1,DISMOUNT_SPEED:1.5,CRASH_SPEED:8,
  SEATS:4} as const;
/**
 * The box truck (caminhao_bau.glb, scripts/59_caminhao.py), 1 m = 1 unit. 3,12 m between axles; the hull runs from the front bumper (+2,66 m) to the rear one
 * (−2,78 m) and is 2,2 m wide (the mirrors, at ±1,34 m, are left out like the moto's bar ends). About 4,2 t with a load and 86 km/h flat out, slow to answer.
 * ENGINE − ROLLING = DRAG × TOP_SPEED² is what sets the top speed.
 */
export const TRUCK={SCALE:1,WHEELBASE:3.12,WHEEL_TRACK:1.72,WHEEL_RADIUS:.44,HALF_WIDTH:1.12,HALF_LENGTH:2.72,CENTRE_Z:-.06,HEIGHT:2.56,
  MASS:3800,ENGINE:7600,REVERSE:3800,BRAKE:24000,HANDBRAKE:20000,ROLLING:250,DRAG:12.76,TOP_SPEED:24,REVERSE_SPEED:3.6,
  MAX_STEER:32*Math.PI/180,GRIP:11,STEER_RATE:2.6,STEER_RETURN:4,SUBSTEP:.1,REACH:1.3,DISMOUNT_SPEED:1.5,CRASH_SPEED:9,
  SEATS:2} as const;
/** The constants of whichever four-wheeler the model is. */
export const carSpec=(model:string|undefined)=>model===TRUCK_MODEL?TRUCK:CAR;
export const TRUCK_SEATS=[
  {name:'Motorista',node:'ponto_motorista',x:.5,y:1.36,z:1.45,side:1},
  {name:'Passageiro',node:'ponto_passageiro',x:-.5,y:1.36,z:1.45,side:-1},
] as const;
/** Seat positions in the vehicle's frame (+Z forward, +X left), whichever model. */
export const vehicleSeats=(model:string|undefined):ReadonlyArray<{readonly name:string;readonly node:string;readonly x:number;readonly y:number;readonly z:number;readonly side:number}>=>model===TRUCK_MODEL?TRUCK_SEATS:CAR_SEATS;
export const CAR_SEATS=[
  {name:'Motorista',node:'ponto_motorista',x:.36,y:.542,z:-.02,side:1},
  {name:'Passageiro da frente',node:'ponto_passageiro',x:-.36,y:.542,z:-.02,side:-1},
  {name:'Passageiro atrás à esquerda',node:'ponto_tras_E',x:.33,y:.512,z:-.78,side:1},
  {name:'Passageiro atrás à direita',node:'ponto_tras_D',x:-.33,y:.512,z:-.78,side:-1},
] as const;
export const passengerInteraction=(id:string,seat:number)=>`moto-passenger:${id}:${seat}`;
export const isPassenger=(interaction:string|undefined)=>!!interaction?.startsWith('moto-passenger:');
export const vehicleOfInteraction=(interaction:string)=>interaction.split(':')[1]??'';
export const vehicleOccupants=(vehicle:{riderId:string;passengers?:readonly string[]})=>[vehicle.riderId,...(vehicle.passengers??[])];
export function vehicleSeat(vehicle:{riderId:string;passengers?:readonly string[]},id:string):number {
  return id?vehicleOccupants(vehicle).indexOf(id):-1;
}
export function seatPosition(vehicle:{x:number;y:number;z:number;yaw:number;model?:string},seat:number){
  const seats=vehicleSeats(vehicle.model),s=seats[seat]??seats[0]!,sin=Math.sin(vehicle.yaw),cos=Math.cos(vehicle.yaw);
  return {x:vehicle.x+cos*s.x+sin*s.z,y:vehicle.y,z:vehicle.z-sin*s.x+cos*s.z};
}
