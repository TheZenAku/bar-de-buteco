import {randomUUID} from 'node:crypto';
import {eq,inArray} from 'drizzle-orm';
import {defaultPrices,priceEntries,priceEntry,type AdminPriceRow,type PriceTable} from '@bar/shared';
import type {Database} from './database/index.js';
import {controls,economyPrices,moderationActions,profiles,users} from './database/schema.js';

export class PricingError extends Error {constructor(readonly statusCode:number,message:string){super(message);}}
export interface PriceChange {key:string;value:number|null}

/**
 * The effective price table (packages/shared/src/prices.ts): the defaults (code and .env) with what the administration
 * changed on top. Every API service reads it here; the world is told to read it again through the control outbox.
 * Kept in memory for a few seconds, so a purchase does not query the overrides each time.
 */
export class PricingService {
  readonly defaults:PriceTable;
  private cache:{at:number;table:PriceTable}|undefined;
  constructor(private db:Database,env:Record<string,string|undefined>=process.env,private ttlMs=5000){this.defaults=defaultPrices(env);}

  async table():Promise<PriceTable>{
    if(this.cache&&Date.now()-this.cache.at<this.ttlMs)return this.cache.table;
    const rows=await this.db.select({key:economyPrices.key,value:economyPrices.value}).from(economyPrices);
    const table:Record<string,number>={...this.defaults};
    for(const row of rows)if(priceEntry(row.key))table[row.key]=row.value;
    this.cache={at:Date.now(),table};
    return table;
  }
  async get(key:string):Promise<number>{return (await this.table())[key]??this.defaults[key]??0;}

  async rows():Promise<AdminPriceRow[]>{
    const overrides=await this.db.select({key:economyPrices.key,value:economyPrices.value,updatedAt:economyPrices.updatedAt,updatedBy:profiles.displayName})
      .from(economyPrices).leftJoin(profiles,eq(economyPrices.updatedBy,profiles.userId));
    return priceEntries().map(entry=>{
      const row=overrides.find(o=>o.key===entry.key),defaultValue=this.defaults[entry.key]??entry.defaultValue;
      return {key:entry.key,group:entry.group,label:entry.label,hint:entry.hint,defaultValue,value:row?.value??defaultValue,min:entry.min,max:entry.max,
        override:!!row,updatedAt:row?.updatedAt.toISOString()??null,updatedBy:row?.updatedBy??null};
    });
  }

  /**
   * Applies several prices at once (`value: null` goes back to the default). One audit entry lists every change
   * ("Coxinha: 22 → 25"); the world receives a `prices` control and reloads the table.
   */
  async change(actorId:string,changes:readonly PriceChange[],reason:string){
    for(const change of changes){
      const entry=priceEntry(change.key);
      if(!entry)throw new PricingError(400,`Preço desconhecido: ${change.key}.`);
      if(change.value!==null&&(!Number.isSafeInteger(change.value)||change.value<entry.min||change.value>entry.max))
        throw new PricingError(400,`${entry.label}: use um valor inteiro entre ${entry.min.toLocaleString('pt-BR')} e ${entry.max.toLocaleString('pt-BR')}.`);
    }
    if(new Set(changes.map(c=>c.key)).size!==changes.length)throw new PricingError(400,'Cada preço pode aparecer uma vez por alteração.');
    const result=await this.db.transaction(async tx=>{
      const [actor]=await tx.select().from(users).where(eq(users.id,actorId)).for('share');
      if(!actor?.verified||actor.role!=='admin')throw new PricingError(403,'Acesso exclusivo da administração.');
      const keys=changes.map(c=>c.key);
      const current=keys.length?await tx.select().from(economyPrices).where(inArray(economyPrices.key,keys)).for('update'):[];
      const applied:string[]=[];
      for(const change of changes){
        const entry=priceEntry(change.key)!,defaultValue=this.defaults[entry.key]??entry.defaultValue;
        const before=current.find(row=>row.key===change.key)?.value??defaultValue,after=change.value??defaultValue;
        // Back to the default value: the override goes, so a later change of the default applies again.
        if(after===defaultValue)await tx.delete(economyPrices).where(eq(economyPrices.key,change.key));
        else await tx.insert(economyPrices).values({key:change.key,value:after,updatedBy:actorId,updatedAt:new Date()})
          .onConflictDoUpdate({target:economyPrices.key,set:{value:after,updatedBy:actorId,updatedAt:new Date()}});
        if(before!==after)applied.push(`${entry.label}: ${before.toLocaleString('pt-BR')} → ${after.toLocaleString('pt-BR')}`);
      }
      if(!applied.length)return {changed:0};
      const id=randomUUID();
      await tx.insert(moderationActions).values({id,actorId,userId:null,action:'price-set',reason:`${reason} · ${applied.join('; ')}.`});
      await tx.insert(controls).values({id,payload:{id,action:'prices',issuedAt:Date.now()}});
      return {changed:applied.length};
    });
    this.cache=undefined;
    return {...result,message:result.changed?`${result.changed} preço(s) atualizado(s). O bar aplica em alguns segundos.`:'Nenhum preço mudou.'};
  }
}
