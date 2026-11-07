/**
 * The garages and what is kept in them (docs/sistemas/garagem.md). A bought vehicle is one row in the API with one owner: the key is
 * that row seen from the backpack, so there is no second copy of a key to lose track of.
 */
export const GARAGES=[
  /** The spots the administration chose standing there (2026-11-01). */
  {id:'garagem-1',name:'Garagem 1',x:-13.25,y:.15,z:-8.3,rotation:-1.596},
  {id:'garagem-2',name:'Garagem 2',x:-13.16,y:.15,z:-2.93,rotation:-1.592},
] as const;
export type GarageId=typeof GARAGES[number]['id'];
export const GARAGE={
  /** How far from the ring's centre it can be used. */
  REACH:1.6,
  /** A bike nearer the garage than this (metres) goes in for free; farther, it comes on the tow truck, at the tow's price. */
  STORE_REACH:16,
  /** Vehicles one player may hold, bought or traded for. */
  VEHICLE_LIMIT:10,
  /** How far the key's button reaches (metres). */
  LOCK_REACH:18,
} as const;
export const garageById=(id:string)=>GARAGES.find(garage=>garage.id===id);
export const nearestGarage=(position:{x:number;z:number})=>[...GARAGES].sort((a,b)=>Math.hypot(a.x-position.x,a.z-position.z)-Math.hypot(b.x-position.x,b.z-position.z))[0]!;

/** Mercosul format, three letters, a digit, a letter, two digits. */
export const PLATE=/^[A-Z]{3}\d[A-Z]\d{2}$/;
const LETTERS='ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export function makePlate(random:()=>number=Math.random):string {
  const letter=()=>LETTERS[Math.floor(random()*26)]!,digit=()=>String(Math.floor(random()*10));
  return `${letter()}${letter()}${letter()}${digit()}${letter()}${digit()}${digit()}`;
}

/** A vehicle in someone's name, as the API keeps it. `parts` and `mileage` are what it was last seen with: they survive anything but a repair. */
export interface OwnedVehicle {id:string;model:string;name:string;plate:string;parts:string;mileage:number;boughtAt:number;color?:string;fuel?:number;revision?:number;/** How full its hold is, 0..3 (vehicle-storage.ts). */load?:number}
/** The key, as the backpack shows it. It takes no slot and is never lost: the only way out of the backpack is a trade (trade.ts). */
export interface VehicleKey {vehicleId:string;plate:string;name:string}
export const VEHICLE_KEY={
  name:'Chave do veículo',
  icon:'ui/items/chave.svg',
  description:'Abre, tranca e tira da garagem o veículo desta placa. Esta chave nunca cai da mochila, nem quando você desmaia, e não pode ser descartada. Ela só sai das suas mãos se você mesmo negociar com alguém: quem fica com a chave fica com o veículo.',
} as const;

/** What the garage's panel lists, from the room. `out`: on the map right now. */
export interface GarageVehicle extends OwnedVehicle {out:boolean;far?:boolean}
export interface GarageView {garageId:GarageId;vehicles:GarageVehicle[];towPrice:number}
