import {z} from 'zod';
import map from './map-data.json';
import {ITEM_IDS,itemById,type ItemId} from './inventory.js';
import type {Footprint,Interactable,Position} from './index.js';

/**
 * Coins spent and earned inside the room. Prices come from here (or from the world's environment, see
 * apps/server/src/config.ts), never from the browser. The API applies every change in one transaction
 * with an idempotency key (apps/api/src/wallet-service.ts).
 */
export const MEDIA_PRICES={jukebox:15,tv:25,telao:60} as const;
export type MediaPriceKind=keyof typeof MEDIA_PRICES;
/** What the room may ask the API to do to a wallet; refunds point to the debit they reverse. */
export const WALLET_REASON=/^(media|counter|table|job|refund):[a-z0-9:-]{1,80}$/;
export const walletChangeSchema=z.object({balance:z.number().int().min(0),applied:z.number().int()}).strict();
export type WalletChange=z.infer<typeof walletChangeSchema>;

/** What Tonico brings to a table (the counter only pours the beers). */
export const TABLE_MENU:readonly ItemId[]=['agua','refrigerante','cafe','garrafa','copo','coxinha','pastel','torresmo'];
export const TABLE_ORDER_MAX_ITEMS=4;
export const tableOrderSchema=z.object({items:z.array(z.enum(ITEM_IDS)).min(1).max(TABLE_ORDER_MAX_ITEMS)}).strict()
  .refine(order=>order.items.every(id=>TABLE_MENU.includes(id)),{message:'Item fora do cardápio da mesa.'});
export const orderTotal=(items:readonly ItemId[])=>items.reduce((sum,id)=>sum+(itemById(id)?.price??0),0);
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
/** What a customer leaves on the table stays there this long after they get up, unless the helper clears it first. */
export const LEFTOVER_MS=4*60_000;

/**
 * Footprint (radius around the base, metres) and height of what Tonico serves, at real size
 * (tools/assets/import-drinks.mjs builds apps/web/public/props/<id>.glb). Snacks come on a small plate (`plate`: its radius).
 */
export const SERVED_PROPS:Readonly<Partial<Record<ItemId,{radius:number;height:number;plate?:number}>>>={
  agua:{radius:.034,height:.205},refrigerante:{radius:.047,height:.19},cafe:{radius:.039,height:.12},
  garrafa:{radius:.031,height:.23},copo:{radius:.027,height:.093},
  coxinha:{radius:.07,height:.08,plate:.07},pastel:{radius:.095,height:.039,plate:.095},torresmo:{radius:.115,height:.081},
};
/** Something Tonico put on a table top: where it stands, and when it touched down (before that it was the `slot`-th item on his tray for `orderId`). */
export interface ServedItemState {id:string;item:string;table:number;x:number;y:number;z:number;rotation:number;placedAt:number;orderId:string;slot:number}

/** A task of a job: go to a station, hold the action for its duration, get paid. */
export interface JobStation {id:string;label:string;action:string;durationMs:number;footprint:Footprint[];x:number;y:number;z:number;
  /** Height of the station's top (counter, sink, table top): the worker's objective marker floats above it. */
  top:number}
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
// The hall's tables, wiped by the helper and named by the number written on them. Footprint: a 0.9 m square around the table point.
const tableStations=map.tables.filter(t=>t.area==='salao').map((t):JobStation=>({id:`mesa-${t.number}`,label:`Limpar a mesa ${t.number}`,action:'Limpando a mesa',durationMs:4000,
  x:t.x,y:t.y,z:t.z,top:t.top,footprint:[{id:t.id,x:t.x,z:t.z,hx:.45,hz:.45}]}));
export const JOBS:readonly JobDefinition[]=[{
  id:'bar',name:'Ajudante do Magrão',description:'Repõe a geladeira, lava os copos e limpa as mesas do salão. Poucas vagas por vez.',
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
export interface JobTaskView {jobId:string;stationId:string;label:string;action:string;durationMs:number;deadline:number;startedAt?:number;earned:number;tasks:number;shiftEndsAt:number}
export interface JobSlotsView {id:string;name:string;slots:number;workers:number;pay:number;enabled:boolean}
