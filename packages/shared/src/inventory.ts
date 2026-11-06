import {z} from 'zod';
import type {VehicleKey} from './garage.js';
import type {ConsumableEffects} from './needs.js';

export const INVENTORY_CAPACITY=12;
export type ItemCategory='bebida'|'comida'|'saude'|'peca'|'fogo';
export const ITEM_IDS=['agua','refrigerante','cafe','garrafa','copo','coxinha','pastel','torresmo','curativo','peca_moto','peca_carro','rojao'] as const;
export type ItemId=typeof ITEM_IDS[number];
export interface ItemDefinition {
  id:ItemId;name:string;description:string;category:ItemCategory;price:number;stackMax:number;
  /** Picture under apps/web/public; `npm run assets:icons` copies it from assets-bar/icons. */
  icon:string;
  /** `prop`: what is held while drinking it (HELD_DRINKS, apps/web/public/props). */
  effects:ConsumableEffects;drink?:boolean;prop?:'garrafa'|'copo'|'agua'|'refrigerante'|'cafe';loseOnFaint:boolean;
}

/** The authoritative item catalogue. Prices and effects are shared by API, room and browser. */
export const ITEM_CATALOG=[
  {id:'rojao',name:'Rojão de festa',description:'Equipe na mão, aponte a câmera e clique para soltar fogos coloridos. Cada disparo usa uma unidade. R guarda o rojão.',category:'fogo',icon:'ui/items/rojao.svg',price:35,stackMax:10,effects:{name:'Rojão de festa'},loseOnFaint:false},
  {id:'agua',name:'Água mineral',description:'Mata a sede sem aumentar a embriaguez.',category:'bebida',icon:'ui/items/agua.png',price:12,stackMax:10,effects:{name:'Água mineral',thirst:32,bladder:14},drink:true,prop:'agua',loseOnFaint:true},
  {id:'refrigerante',name:'Refrigerante',description:'Gelado, doce e bom para recuperar a sede.',category:'bebida',icon:'ui/items/refrigerante.png',price:18,stackMax:10,effects:{name:'Refrigerante',thirst:23,stamina:10,bladder:12},drink:true,prop:'refrigerante',loseOnFaint:true},
  {id:'cafe',name:'Café do Seu Zé',description:'Um café curto que ajuda a recompor as forças.',category:'bebida',icon:'ui/items/cafe.png',price:15,stackMax:10,effects:{name:'Café do Seu Zé',thirst:9,hp:4,stamina:30},drink:true,prop:'cafe',loseOnFaint:true},
  {id:'garrafa',name:'Long neck',description:'Cerveja na garrafa. Refresca, mas sobe rápido.',category:'bebida',icon:'ui/items/garrafa.png',price:30,stackMax:10,effects:{name:'Long neck',thirst:8,drunk:12,bladder:18},drink:true,prop:'garrafa',loseOnFaint:true},
  {id:'copo',name:'Copo de chopp',description:'A dose clássica da casa.',category:'bebida',icon:'ui/items/copo.png',price:20,stackMax:10,effects:{name:'Copo de chopp',thirst:5,drunk:7,bladder:11},drink:true,prop:'copo',loseOnFaint:true},
  {id:'coxinha',name:'Coxinha',description:'Salgado reforçado para recuperar a fome.',category:'comida',icon:'ui/items/coxinha.png',price:22,stackMax:10,effects:{name:'Coxinha',hunger:35,hp:5,stamina:20},loseOnFaint:true},
  {id:'pastel',name:'Pastel',description:'Crocante e substancioso.',category:'comida',icon:'ui/items/pastel.png',price:25,stackMax:10,effects:{name:'Pastel',hunger:30,thirst:-2,stamina:18},loseOnFaint:true},
  {id:'torresmo',name:'Porção de torresmo',description:'Enche a barriga, mas dá sede.',category:'comida',icon:'ui/items/torresmo.png',price:28,stackMax:10,effects:{name:'Porção de torresmo',hunger:24,thirst:-6,stamina:14},loseOnFaint:true},
  {id:'curativo',name:'Curativo',description:'Recupera parte da saúde imediatamente.',category:'saude',icon:'ui/items/curativo.png',price:45,stackMax:5,effects:{name:'Curativo',hp:28},loseOnFaint:true},
  // Placeholder for the real parts: one piece fits anything on the bike (MOTO_REPAIR). Not for using from the backpack: the bike's panel takes it.
  {id:'peca_moto',name:'Peça de moto',description:'Peça genérica para consertar a moto. Clique com o botão direito na moto e abra as informações do veículo.',category:'peca',icon:'ui/items/peca_moto.png',price:40,stackMax:10,effects:{name:'Peça de moto'},loseOnFaint:false},
  {id:'peca_carro',name:'Peça de carro',description:'Conserta uma peça do carro pelo painel Informações do veículo.',category:'peca',icon:'ui/items/peca_moto.png',price:75,stackMax:10,effects:{name:'Peça de carro'},loseOnFaint:false},
] as const satisfies readonly ItemDefinition[];

export const itemIdSchema:z.ZodType<ItemId>=z.enum(ITEM_IDS);
export const itemById=(id:string):ItemDefinition|undefined=>ITEM_CATALOG.find(item=>item.id===id);
export const STARTER_ITEMS:Readonly<Record<ItemId,number>>={agua:2,refrigerante:0,cafe:0,garrafa:0,copo:0,coxinha:1,pastel:0,torresmo:0,curativo:1,peca_moto:0,peca_carro:0,rojao:0};

export interface InventoryStack {itemId:ItemId;quantity:number}
export interface InventoryEntry extends InventoryStack {item:ItemDefinition}
export interface InventoryHistoryEntry {id:string;itemId:ItemId;quantity:number;reason:string;createdAt:string}
export interface InventoryView {
  stacks:InventoryStack[];capacity:number;usedSlots:number;balance:number;history:InventoryHistoryEntry[];
  /** Vehicle keys: on top of the slots, because a full backpack must not stop anyone from owning a vehicle. */
  keys?:VehicleKey[];
}
