export const CAR_MODEL='carro-hatch';
export const CAR_NAME='Hatch 80';
export const DEFAULT_CAR_COLOR='#ccc9c2';
export const VEHICLE_MODELS=['moto-delivery',CAR_MODEL] as const;
export type VehicleModel=typeof VEHICLE_MODELS[number];
export interface VehicleOffer {model:string;name:string;price:number;seats:number;photo:string}
export const isCar=(vehicle:{model?:string}|undefined)=>vehicle?.model===CAR_MODEL;
export const vehicleName=(model:string)=>model===CAR_MODEL?CAR_NAME:'Highland Bar Delivery';
export const vehiclePhoto=(model:string)=>model===CAR_MODEL?'carro/foto.png':'moto/foto.webp';
/** Measured from the supplied rig, at its authored metre scale. */
export const CAR={SCALE:1,WHEELBASE:2.314,WHEEL_TRACK:1.33,WHEEL_RADIUS:.285,HALF_WIDTH:.76,HALF_LENGTH:1.80,CENTRE_Z:0,HEIGHT:1.39,
  MASS:850,ENGINE:3800,REVERSE:1800,BRAKE:8000,HANDBRAKE:7000,ROLLING:120,DRAG:2.45,TOP_SPEED:38.9,REVERSE_SPEED:4.5,
  MAX_STEER:33*Math.PI/180,GRIP:9,STEER_RATE:2.3,STEER_RETURN:3.8,SUBSTEP:.1,REACH:1.1,DISMOUNT_SPEED:1.5,CRASH_SPEED:8,
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
