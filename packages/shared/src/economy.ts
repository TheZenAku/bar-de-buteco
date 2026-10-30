import {z} from 'zod';
import map from './map-data.json';
import {ITEM_IDS,itemById,type ItemId} from './inventory.js';
import {barClipMs} from './bar-animations.js';
import type {Footprint,Interactable,Position} from './index.js';

/**
 * Coins spent and earned inside the room. Prices come from here (or from the world's environment, see
 * apps/server/src/config.ts), never from the browser. The API applies every change in one transaction
 * with an idempotency key (apps/api/src/wallet-service.ts).
 */
export const MEDIA_PRICES={jukebox:15,tv:25,telao:50} as const;
export type MediaPriceKind=keyof typeof MEDIA_PRICES;
/**
 * Going up on the backyard stage: one pass per player, paid at the foot of its steps, valid for `durationMs`. Without
 * a valid pass nobody steps onto the stage (movePlayer); a pass that runs out up there lets its owner stay until they
 * come down. Putting a video on the stage screen is paid apart (MEDIA_PRICES.telao).
 */
export const STAGE_PASS={price:200,durationMs:30*60_000} as const;
/** What the room may ask the API to do to a wallet; refunds point to the debit they reverse. */
export const WALLET_REASON=/^(media|counter|table|job|stage|refund):[a-z0-9:-]{1,80}$/;
export const walletChangeSchema=z.object({balance:z.number().int().min(0),applied:z.number().int()}).strict();
export type WalletChange=z.infer<typeof walletChangeSchema>;

/** What Tonico brings to a table (the counter only pours the beers). */
export const TABLE_MENU:readonly ItemId[]=['agua','refrigerante','cafe','garrafa','copo','coxinha','pastel','torresmo'];
export const TABLE_ORDER_MAX_ITEMS=4;
/** `to`: a player working the bar who takes the order instead of Tonico. */
export const tableOrderSchema=z.object({items:z.array(z.enum(ITEM_IDS)).min(1).max(TABLE_ORDER_MAX_ITEMS),to:z.string().max(64).optional()}).strict()
  .refine(order=>order.items.every(id=>TABLE_MENU.includes(id)),{message:'Item fora do cardápio da mesa.'});
/** `price`: the live price of an item (prices.ts); the catalogue's by default. */
export const orderTotal=(items:readonly ItemId[],price:(id:ItemId)=>number=id=>itemById(id)?.price??0)=>items.reduce((sum,id)=>sum+price(id),0);
/** Where Tonico picks orders up: the customers' side of the counter, beside the bar stools. */
export const PICKUP_POINT:Required<Position>={x:map.markers.Ponto_Balcao.x-.6,y:map.markers.Ponto_Balcao.y,z:map.markers.Ponto_Balcao.z+1.4};
export const ORDER_PREPARATION_MS=3500;
/**
 * At the table Tonico puts the order down one item at a time: after a short lead, each item takes SERVE_ITEM_MS
 * from his tray to its spot on the table top.
 */
export const SERVE_LEAD_MS=300;
export const SERVE_ITEM_MS=700;
export const handOverMs=(items:number)=>SERVE_LEAD_MS*2+items*SERVE_ITEM_MS;
/**
 * How long anyone takes to finish each thing, wherever it comes from: served at the table (seated), a drink from Magrão
 * at the counter or anything from the backpack (in hand, walking around: PlayerState.holding). Its effects
 * (CONSUMABLES) are taken in as it goes. At a table, getting up leaves the rest, and a finished item (or one left
 * behind) waits on the table to be collected.
 */
export const CONSUME_MS:Readonly<Partial<Record<ItemId,number>>>={
  garrafa:180_000,copo:150_000,refrigerante:150_000,agua:120_000,cafe:90_000,
  coxinha:90_000,pastel:90_000,torresmo:150_000,
};
export const consumeMs=(item:string)=>CONSUME_MS[item as ItemId]??120_000;
/** Had over time (CONSUME_MS), in hand or at a table; anything else (a bandage) is used at once. */
export const consumedOverTime=(item:string)=>CONSUME_MS[item as ItemId]!==undefined;
/**
 * Finished items are collected by whoever works the bar (Limpar a mesa N) or, with nobody working, by Tonico. If neither
 * gets there (no path, nobody around), they go on their own this long after they were finished.
 */
export const LEFTOVER_MS=10*60_000;
/** Taking one finished item off a table onto the tray. */
export const CLEAR_ITEM_MS=500;

/**
 * Footprint (radius around the base, metres) and height of what Tonico serves, at real size
 * (tools/assets/import-drinks.mjs builds apps/web/public/props/<id>.glb). Snacks come on a small plate (`plate`: its radius).
 */
export const SERVED_PROPS:Readonly<Partial<Record<ItemId,{radius:number;height:number;plate?:number}>>>={
  agua:{radius:.034,height:.205},refrigerante:{radius:.047,height:.19},cafe:{radius:.039,height:.12},
  garrafa:{radius:.031,height:.23},copo:{radius:.027,height:.093},
  coxinha:{radius:.07,height:.08,plate:.07},pastel:{radius:.095,height:.039,plate:.095},torresmo:{radius:.115,height:.081},
};
/**
 * Something served on a table top: where it stands, and when it touched down (before that it was the `slot`-th item on
 * the tray for `orderId`). `doneAt`: when it was finished or left behind (0 while the customer is still on it).
 */
export interface ServedItemState {id:string;item:string;table:number;x:number;y:number;z:number;rotation:number;placedAt:number;orderId:string;slot:number;doneAt?:number;
  /** The seat it was ordered from: whoever sits there has it (and eats a snack with the bar animations). */
  seat?:string}

/** A task of a job: go to a station, hold the action for its duration, get paid. */
export interface JobStation {id:string;label:string;action:string;durationMs:number;footprint:Footprint[];x:number;y:number;z:number;
  /** Height of the station's top (counter, sink, table top): the worker's objective marker floats above it. */
  top:number;
  /** A customer table (`mesa-N`): offered only while finished items wait on it. */
  table?:number}
export interface JobDefinition {
  id:string;name:string;description:string;
  /** How many players may work at once. */
  slots:number;
  /** Coins per finished task; the API also caps what jobs pay a player per day (JOB_DAILY_CAP). */
  pay:number;
  /** Where a shift starts (within START_RADIUS). */
  start:Required<Position>;
  /** A task not finished within this time ends the shift (nobody is paid for standing still). */
  taskTimeoutMs:number;
  shiftMaxMs:number;
  cooldownMs:number;
  stations:readonly JobStation[];
}
export const JOB_START_RADIUS=4;
export const JOB_DAILY_CAP=400;
const collider=(id:string)=>{const c=map.colliders.find(c=>c.id===id);if(!c)throw new Error(`Estação de trabalho sem colisor no mapa: ${id}`);return c;};
const station=(id:string,colliderId:string,label:string,action:string,durationMs:number):JobStation=>{
  const c=collider(colliderId);return {id,label,action,durationMs,x:c.x,y:c.minY??.3,z:c.z,top:c.maxY??(c.minY??.3)+1,footprint:[{id:c.id,x:c.x,z:c.z,hx:c.hx,hz:c.hz}]};
};
// The customer tables, cleared by the helper and named by the number written on them. Footprint: a 0.9 m square around
// the table point, or the table's own volume when bigger (a picnic table with its benches).
const tableStation=(t:(typeof map.tables)[number]):Omit<JobStation,'id'|'label'|'action'|'durationMs'>=>{
  const c=collider(t.collider);
  return {x:t.x,y:t.y,z:t.z,top:t.top,table:t.number,footprint:[{id:t.id,x:t.x,z:t.z,hx:Math.max(.45,c.hx),hz:Math.max(.45,c.hz)}]};
};
// Every table with places, the picnic tables' benches among them.
// Clearing one takes the cleaning clip from a corner of a four-seat table (limpar_mesa, bar-animations.ts), played once.
const tableStations=map.tables.filter(t=>map.seats.some(s=>s.table===t.number)).map((t):JobStation=>({id:`mesa-${t.number}`,label:`Limpar a mesa ${t.number}`,action:'Limpando a mesa',durationMs:barClipMs('limpar_mesa'),...tableStation(t)}));
/** Where a worker puts an order down: the customer's table (touching it, like clearing it). */
export const deliveryStation=(table:number,customer:string,items:number):JobStation|undefined=>{
  const t=map.tables.find(t=>t.number===table);
  return t&&{id:`entrega-${table}`,label:`Levar o pedido de ${customer} à mesa ${table}`,action:'Servindo a mesa',durationMs:handOverMs(items),...tableStation(t)};
};
const counter=map.colliders.filter(c=>c.id.startsWith('COL_Mob_Balcao')&&Math.abs((c.minY??0)-PICKUP_POINT.y)<.1);
/** Where a worker picks an order up: the customers' side of the counter, where Tonico waits for it, while Magrão prepares it. */
export const pickupStation=(customer:string):JobStation=>({id:'balcao',label:`Pegar o pedido de ${customer} no balcão`,action:'O Magrão está preparando',
  durationMs:ORDER_PREPARATION_MS,...PICKUP_POINT,top:Math.max(...counter.map(c=>c.maxY??PICKUP_POINT.y+1)),footprint:counter.map(({id,x,z,hx,hz})=>({id,x,z,hx,hz}))});
/** Orders a worker may hold at once (being carried or waiting at the counter). */
export const MAX_WORKER_ORDERS=2;
export const JOBS:readonly JobDefinition[]=[{
  id:'bar',name:'Ajudante do Magrão',description:'Leva até a mesa os pedidos feitos para você, recolhe o que os clientes terminaram, repõe a geladeira e lava os copos. Poucas vagas por vez.',
  slots:2,pay:6,start:map.markers.Ponto_Balcao,taskTimeoutMs:60_000,shiftMaxMs:15*60_000,cooldownMs:3*60_000,
  stations:[
    station('geladeira','COL_Mob_Geladeira_Expositor','Repor a geladeira','Repondo as geladas',5000),
    station('geladeira-2','COL_Mob_Geladeira_Expositor.002','Repor a geladeira do fundo','Repondo as geladas',5000),
    station('pia','COL_Mob_Pia_Cozinha','Lavar os copos','Lavando os copos',6000),
    ...tableStations,
  ],
}];
export const jobById=(id:string)=>JOBS.find(job=>job.id===id);
/** A station as an object the shared reach rules (canInteract) understand; never listed in INTERACTABLES. */
export const stationInteractable=(s:JobStation):Interactable=>({id:`job:${s.id}`,type:'counter',label:s.label,x:s.x,y:s.y,z:s.z,footprint:s.footprint});
/** `pickup` and `deliver`: an order a customer made to the worker, picked up at the counter and put on their table. */
export type JobTaskKind='station'|'pickup'|'deliver';
export interface JobTaskView {jobId:string;stationId:string;kind:JobTaskKind;label:string;action:string;durationMs:number;deadline:number;startedAt?:number;earned:number;tasks:number;shiftEndsAt:number;
  /** Where the task is done: the worker's objective marker and the E prompt. */
  station:JobStation}
export interface JobSlotsView {id:string;name:string;slots:number;workers:number;pay:number;enabled:boolean}
