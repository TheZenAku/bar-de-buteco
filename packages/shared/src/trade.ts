import {z} from 'zod';
import {MAX_COIN_BALANCE} from './admin.js';
import {GARAGE,type VehicleKey} from './garage.js';
import {INVENTORY_CAPACITY,ITEM_IDS,type InventoryStack,type ItemId} from './inventory.js';
import type {OwnedVehicle} from './garage.js';

/**
 * Trading between players (docs/sistemas/troca.md). The room runs the conversation; nothing leaves anyone's hands until both have confirmed the same
 * version of the offers, and then the API moves everything in one transaction, once per trade id, checking what each one really has.
 */
export const TRADE={
  /** How close to ask (metres), and how far apart it falls through. */
  REACH:4,LEAVE_REACH:8,
  /** How long an invitation waits, and how long after a refusal the same person may ask again. */
  INVITE_MS:20_000,REFUSED_MS:15_000,
  /** A trade nobody touches for this long ends by itself. */
  IDLE_MS:300_000,
  /** With both ready, what is on the table stays on screen this long before it can be confirmed: nobody confirms a swap they did not get to read. */
  REVIEW_MS:3000,
  /** Retries of a confirmed trade the API has not answered (the same id: it can only happen once). */
  RETRIES:200,RETRY_MS:1500,
} as const;

export interface TradeOffer {coins:number;items:InventoryStack[];vehicles:string[]}
export const EMPTY_OFFER:TradeOffer={coins:0,items:[],vehicles:[]};
const distinct=(values:readonly string[])=>new Set(values).size===values.length;
// The same item twice in one offer would be counted against one stack and given twice: refused here, not merged.
export const tradeOfferSchema=z.object({
  coins:z.number().int().min(0).max(MAX_COIN_BALANCE),
  items:z.array(z.object({itemId:z.enum(ITEM_IDS) as z.ZodType<ItemId>,quantity:z.number().int().min(1).max(100)}).strict()).max(INVENTORY_CAPACITY).refine(items=>distinct(items.map(item=>item.itemId)),'Item repetido na oferta.'),
  vehicles:z.array(z.string().uuid()).max(GARAGE.VEHICLE_LIMIT).refine(distinct,'Veículo repetido na oferta.'),
}).strict();
export const offerIsEmpty=(offer:TradeOffer)=>!offer.coins&&!offer.items.length&&!offer.vehicles.length;
/** The same offer always reads the same: what a retry is compared with. */
export const normalizeOffer=(offer:TradeOffer):TradeOffer=>({coins:offer.coins,items:[...offer.items].sort((a,b)=>a.itemId.localeCompare(b.itemId)),vehicles:[...offer.vehicles].sort()});

/** What the world asks the API to do. */
export const tradeCommitSchema=z.object({
  id:z.string().uuid(),
  a:z.object({userId:z.string().uuid(),sessionId:z.string().uuid(),offer:tradeOfferSchema}).strict(),
  b:z.object({userId:z.string().uuid(),sessionId:z.string().uuid(),offer:tradeOfferSchema}).strict(),
}).strict().refine(body=>body.a.userId!==body.b.userId,'Uma troca precisa de duas pessoas.').refine(body=>!offerIsEmpty(body.a.offer)||!offerIsEmpty(body.b.offer),'A troca está vazia.');
/** How one side stands after the trade: the room's copy of it, and the browser's. */
export interface TradeSideResult {balance:number;stacks:InventoryStack[];vehicles:OwnedVehicle[];keys:VehicleKey[]}
export interface TradeResult {id:string;replayed:boolean;sides:Record<string,TradeSideResult>}

export type TradeStage='offer'|'review'|'committing';
export interface TradeVehicleLine {id:string;plate:string;name:string}
export interface TradeSideView {id:string;name:string;offer:TradeOffer;vehicles:TradeVehicleLine[];ready:boolean;confirmed:boolean}
/** What each one sees: the room sends it again whenever anything changes. */
export interface TradeView {id:string;version:number;stage:TradeStage;me:TradeSideView;them:TradeSideView;confirmableAt:number;expiresAt:number}
export interface TradeInvite {id:string;from:string;fromName:string;expiresAt:number}
export interface TradeClosed {id:string;status:'done'|'cancelled'|'failed';message:string;gave?:TradeSideView;got?:TradeSideView}

/** Room messages. */
export const tradeRequestSchema=z.object({playerId:z.string().min(1).max(64)}).strict();
export const tradeRespondSchema=z.object({inviteId:z.string().uuid(),accept:z.boolean()}).strict();
export const tradeOfferMessageSchema=z.object({tradeId:z.string().uuid(),offer:tradeOfferSchema}).strict();
export const tradeReadySchema=z.object({tradeId:z.string().uuid(),version:z.number().int().min(0),ready:z.boolean()}).strict();
export const tradeConfirmSchema=z.object({tradeId:z.string().uuid(),version:z.number().int().min(0)}).strict();
export const tradeCancelSchema=z.object({tradeId:z.string().uuid()}).strict();
