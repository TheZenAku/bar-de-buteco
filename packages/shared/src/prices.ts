import {ITEM_CATALOG,type ItemId} from './inventory.js';
import {JOBS,JOB_DAILY_CAP,MEDIA_PRICES,STAGE_PASS,type MediaPriceKind} from './economy.js';

/**
 * Everything in the game that costs or pays coins, under one key each ("item:coxinha", "media:tv", "job:bar").
 * The code's numbers (and the .env variables that already existed) are the defaults; the administration changes them
 * in the panel's Preços (apps/api/src/pricing-service.ts keeps the overrides). The API answers the effective table to
 * the browser (GET /api/prices) and to the world, which charges and pays with it and tells the players when it changes.
 */
export type PriceGroup='itens'|'skins'|'midia'|'palco'|'trabalho'|'recompensas';
export interface PriceEntry {
  key:string;group:PriceGroup;label:string;
  /** Where the value is used, in the panel's words. */
  hint:string;defaultValue:number;min:number;max:number;
}
export type PriceTable=Readonly<Record<string,number>>;

export const PRICE_GROUPS:ReadonlyArray<{id:PriceGroup;label:string;description:string}>=[
  {id:'itens',label:'Bar e mochila',description:'Bebidas e petiscos: balcão do Magrão, pedidos na mesa e loja da mochila.'},
  {id:'skins',label:'Skins',description:'Personagens da coleção. Quem já comprou continua com a skin.'},
  {id:'midia',label:'Jukebox, TVs e telão',description:'Cobrado a cada vídeo novo colocado no aparelho.'},
  {id:'palco',label:'Palco',description:'Ingresso para subir no palco do quintal.'},
  {id:'trabalho',label:'Trabalho',description:'O que o bar paga por tarefa concluída e o teto diário por jogador.'},
  {id:'recompensas',label:'Recompensas',description:'Moedas que entram na economia sem compra: boas-vindas e bônus diário.'},
];

/** Skins other than the free default (DEFAULT_SKIN). Names repeat SKINS (index.ts) to avoid an import cycle. */
const SKIN_PRICES:ReadonlyArray<readonly [id:string,name:string,price:number]>=[['leandro','Leandro',750],['rafael','Rafael',1000],['read','Read',850],['gilmar-gordo','Gilmar',900]];
const MEDIA_LABELS:Record<MediaPriceKind,string>={jukebox:'Jukebox',tv:'TV do salão',telao:'Telão do palco'};
const envKey=(id:string)=>id.toUpperCase().replace(/-/g,'_');

let entries:PriceEntry[]|undefined;
export function priceEntries():readonly PriceEntry[]{
  return entries??=[
    ...ITEM_CATALOG.map(item=>({key:`item:${item.id}`,group:'itens' as const,label:item.name,hint:item.id==='garrafa'||item.id==='copo'?'Balcão, mesa e mochila':item.category==='saude'?'Mochila':'Mesa e mochila',defaultValue:item.price,min:0,max:10_000})),
    ...SKIN_PRICES.map(([id,name,price])=>({key:`skin:${id}`,group:'skins' as const,label:name,hint:'Coleção (C)',defaultValue:price,min:0,max:1_000_000})),
    ...(Object.keys(MEDIA_PRICES) as MediaPriceKind[]).map(kind=>({key:`media:${kind}`,group:'midia' as const,label:MEDIA_LABELS[kind],hint:'Por vídeo novo',defaultValue:MEDIA_PRICES[kind],min:0,max:10_000})),
    {key:'stage:pass',group:'palco',label:'Ingresso do palco',hint:`Vale ${STAGE_PASS.durationMs/60_000} minutos`,defaultValue:STAGE_PASS.price,min:0,max:10_000},
    ...JOBS.map(job=>({key:`job:${job.id}`,group:'trabalho' as const,label:job.name,hint:'Pagamento por tarefa',defaultValue:job.pay,min:0,max:1000})),
    {key:'cap:job-daily',group:'trabalho',label:'Teto diário do trabalho',hint:'Máximo que um jogador ganha trabalhando por dia',defaultValue:JOB_DAILY_CAP,min:0,max:1_000_000},
    {key:'reward:initial',group:'recompensas',label:'Moedas de boas-vindas',hint:'Na primeira vez que a conta abre a carteira',defaultValue:0,min:0,max:1_000_000},
    {key:'reward:daily',group:'recompensas',label:'Bônus diário',hint:'Resgatado uma vez por dia na coleção (0 desativa)',defaultValue:0,min:0,max:1_000_000},
  ];
}
export const priceEntry=(key:string)=>priceEntries().find(entry=>entry.key===key);

/**
 * The defaults with the .env variables that set them before the panel existed (SKIN_PRICE_*, WALLET_INITIAL_COINS,
 * WALLET_DAILY_COINS, PRICE_JUKEBOX/TV/TELAO/STAGE). Invalid or out-of-range values are ignored.
 */
export function defaultPrices(env:Record<string,string|undefined>={}):PriceTable{
  const read=(name:string,entry:PriceEntry)=>{const raw=env[name];if(raw===undefined||raw==='')return undefined;const n=Number(raw);return Number.isSafeInteger(n)&&n>=entry.min&&n<=entry.max?n:undefined;};
  const variable=(entry:PriceEntry)=>{
    const [kind,id]=entry.key.split(':');
    if(kind==='skin')return `SKIN_PRICE_${envKey(id!)}`;
    if(kind==='media')return `PRICE_${envKey(id!)}`;
    return ({'stage:pass':'PRICE_STAGE','reward:initial':'WALLET_INITIAL_COINS','reward:daily':'WALLET_DAILY_COINS'} as Record<string,string>)[entry.key];
  };
  return Object.fromEntries(priceEntries().map(entry=>{const name=variable(entry);return [entry.key,(name?read(name,entry):undefined)??entry.defaultValue];}));
}

export const priceOf=(table:PriceTable,key:string)=>table[key]??priceEntry(key)?.defaultValue??0;
export const itemPrice=(table:PriceTable,item:ItemId|string)=>priceOf(table,`item:${item}`);
/** The jukebox, a TV or the stage screen (the TV whose id is `telao`). */
export const mediaPriceKey=(kind:'jukebox'|'tv',id:string)=>kind==='jukebox'?'media:jukebox':id==='telao'?'media:telao':'media:tv';
/** Keeps only known keys, each clamped to its range: what the API sends is never trusted blindly by the world or the page. */
export function sanitizePrices(raw:unknown):PriceTable{
  const source=raw&&typeof raw==='object'?raw as Record<string,unknown>:{};
  return Object.fromEntries(priceEntries().map(entry=>{const value=source[entry.key];return [entry.key,typeof value==='number'&&Number.isSafeInteger(value)?Math.max(entry.min,Math.min(entry.max,value)):entry.defaultValue];}));
}
