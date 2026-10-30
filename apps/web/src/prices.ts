import {defaultPrices,priceOf,sanitizePrices,type PriceTable} from '@bar/shared';

/**
 * What things cost now, as the administration set them (packages/shared/src/prices.ts). The page starts with the
 * defaults, reads GET /api/prices and then follows the room's `prices` message. Charging is always the room's or the
 * API's: these numbers only label buttons and cards.
 */
let table:PriceTable=defaultPrices();
const listeners=new Set<()=>void>();
export const price=(key:string)=>priceOf(table,key);
export const itemCost=(id:string)=>price(`item:${id}`);
export function setPrices(raw:unknown):void {table=sanitizePrices(raw);for(const listener of listeners)listener();}
export function onPrices(listener:()=>void):()=>void {listeners.add(listener);return ()=>listeners.delete(listener);}
export async function loadPrices():Promise<void> {
  try{const response=await fetch('/api/prices',{credentials:'include'});if(response.ok)setPrices((await response.json() as {prices:unknown}).prices);}
  catch{/* the defaults stay until the room sends the table */}
}
