export const CAR_MODEL='carro-hatch';
export const CAR_NAME='Hatch 80';
export const DEFAULT_CAR_COLOR='#ccc9c2';
export const MOTO_FOGO_MODEL='moto-fogo';
export const MOTO_FOGO_NAME='Caveira em Chamas';
/** The red the bike's texture was painted with: the colour that leaves it as it came (engine/moto-paint.ts repaints the reds to the owner's). */
export const FOGO_DEFAULT_COLOR='#6b1d1d';
export const defaultVehicleColor=(model:string)=>model===MOTO_FOGO_MODEL?FOGO_DEFAULT_COLOR:DEFAULT_CAR_COLOR;
export const VEHICLE_MODELS=['moto-delivery',MOTO_FOGO_MODEL,CAR_MODEL] as const;
export type VehicleModel=typeof VEHICLE_MODELS[number];
export interface VehicleOffer {model:string;name:string;price:number;seats:number;photo:string}
export const isCar=(vehicle:{model?:string}|undefined)=>vehicle?.model===CAR_MODEL;
export const isFogo=(vehicle:{model?:string}|undefined)=>vehicle?.model===MOTO_FOGO_MODEL;
export const vehicleName=(model:string)=>model===CAR_MODEL?CAR_NAME:model===MOTO_FOGO_MODEL?MOTO_FOGO_NAME:'Highland Bar Delivery';
/** The price table's key for a model (prices.ts). */
export const vehiclePriceKey=(model:string)=>model===CAR_MODEL?'vehicle:carro':model===MOTO_FOGO_MODEL?'vehicle:moto-fogo':'vehicle:moto';
export const vehiclePhoto=(model:string)=>model===CAR_MODEL?'carro/foto.png':model===MOTO_FOGO_MODEL?'moto/foto-fogo.webp':'moto/foto-v4.webp';
/** Measured from the supplied rig, at its authored metre scale. */
export const CAR={SCALE:1,WHEELBASE:2.314,WHEEL_TRACK:1.33,WHEEL_RADIUS:.285,HALF_WIDTH:.76,HALF_LENGTH:1.80,CENTRE_Z:0,HEIGHT:1.39,
  MASS:850,ENGINE:3800,REVERSE:1800,BRAKE:8000,HANDBRAKE:7000,ROLLING:120,DRAG:2.45,TOP_SPEED:38.9,REVERSE_SPEED:4.5,
  MAX_STEER:35*Math.PI/180,GRIP:17,STEER_RATE:4,STEER_RETURN:6,SUBSTEP:.1,REACH:1.1,DISMOUNT_SPEED:1.5,CRASH_SPEED:8,
  SEATS:4} as const;
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
export function seatPosition(vehicle:{x:number;y:number;z:number;yaw:number},seat:number){
  const s=CAR_SEATS[seat]??CAR_SEATS[0],sin=Math.sin(vehicle.yaw),cos=Math.cos(vehicle.yaw);
  return {x:vehicle.x+cos*s.x+sin*s.z,y:vehicle.y,z:vehicle.z-sin*s.x+cos*s.z};
}
