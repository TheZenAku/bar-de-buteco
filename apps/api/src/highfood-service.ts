import {randomUUID} from 'node:crypto';
import {and,asc,desc,eq,gte,inArray,like,sql} from 'drizzle-orm';
import {COURIER_LEVELS,GARAGE,HIGHFOOD_CUSTOMERS,MAX_COIN_BALANCE,MOTO_MODEL,MOTO_NAME,NEW_MOTO_PARTS,deliveryPay,makePlate,type OwnedVehicle,deliveryStars,priceOf,type CustomerLook,type CustomerProfile,type DeliveryFacts,type HighfoodHistoryEntry,type HighfoodReceipt,type HighfoodView,type PublicUser,type VehicleView} from '@bar/shared';
import type {Database} from './database/index.js';
import {controls,currencyLedger,highfoodCustomers,highfoodDeliveries,moderationActions,playerVehicles,wallets} from './database/schema.js';
import type {PricingService} from './pricing-service.js';

export class HighfoodError extends Error {constructor(readonly statusCode:number,message:string){super(message);}}
const startOfDay=(now=new Date())=>new Date(now.getFullYear(),now.getMonth(),now.getDate());
const RECENT=30;
export interface DeliveryRecord extends DeliveryFacts {userId:string;orderId:string;customerId:string;customer:string;restaurant:string;items:string[];address:string;durationMs:number}
export interface LostOrder {userId:string;orderId:string;customerId:string;customer:string;restaurant:string;items:string[];address:string;length:number;reason:'cancelled'|'gave-up'|'left'}
const toVehicle=(row:typeof playerVehicles.$inferSelect):OwnedVehicle=>({id:row.id,model:row.model,name:MOTO_NAME,plate:row.plate,parts:row.parts,mileage:row.mileage,boughtAt:row.boughtAt.getTime()});
const toProfile=(row:typeof highfoodCustomers.$inferSelect):CustomerProfile=>({id:row.id,name:row.name,skin:row.skin,look:row.look as CustomerLook,image:row.image,lines:row.lines as string[],active:row.active});

/**
 * Bought vehicles and Highfood's money (docs/sistemas/highfood.md). A delivery is paid once by its order's id; the pay comes from the price
 * table, never from the world, which only says what happened on the way. What a player earns a day stops at `cap:highfood-daily`.
 */
export class HighfoodService {
  constructor(private db:Database,private pricing:PricingService){}

  /** The vehicles whose key this player holds. */
  async owned(userId:string):Promise<OwnedVehicle[]>{
    return (await this.db.select().from(playerVehicles).where(eq(playerVehicles.userId,userId)).orderBy(asc(playerVehicles.boughtAt),asc(playerVehicles.id))).map(toVehicle);
  }
  async vehicle(userId:string):Promise<VehicleView>{
    const [prices,vehicles]=await Promise.all([this.pricing.table(),this.owned(userId)]);
    return {model:MOTO_MODEL,name:MOTO_NAME,price:priceOf(prices,'vehicle:moto'),tow:priceOf(prices,'vehicle:tow'),owned:vehicles.length>0,limit:GARAGE.VEHICLE_LIMIT,vehicles};
  }
  /** A new vehicle: a free plate (random, and the unique column has the last word) and all parts new. */
  private async addVehicle(tx:Pick<Database,'insert'>,userId:string):Promise<void>{
    for(let attempt=0;attempt<32;attempt++){
      const added=await tx.insert(playerVehicles).values({id:randomUUID(),plate:makePlate(),userId,model:MOTO_MODEL,parts:NEW_MOTO_PARTS}).onConflictDoNothing({target:playerVehicles.plate}).returning({id:playerVehicles.id});
      if(added.length)return;
    }
    throw new HighfoodError(503,'Não foi possível emplacar o veículo. Tente de novo.');
  }
  /** The world learns about it through a `sync` control, as with anything else that changes outside the room. */
  async buy(user:PublicUser,requestId:string):Promise<VehicleView&{balance:number}>{
    if(!user.verified)throw new HighfoodError(403,'Confirme seu e-mail antes de comprar.');
    const price=await this.pricing.get('vehicle:moto'),receipt=`vehicle:${requestId}`;
    const balance=await this.db.transaction(async tx=>{
      const [wallet]=await tx.select().from(wallets).where(eq(wallets.userId,user.id)).for('update');
      if(!wallet)throw new HighfoodError(409,'Abra a carteira primeiro: entre no bar uma vez.');
      // The same click again (or a retry) buys nothing more.
      const [already]=await tx.select({id:currencyLedger.id}).from(currencyLedger).where(eq(currencyLedger.id,receipt));
      if(already)return wallet.balance;
      const [{count}={count:0}]=await tx.select({count:sql<number>`count(*)`.mapWith(Number)}).from(playerVehicles).where(eq(playerVehicles.userId,user.id));
      if(count>=GARAGE.VEHICLE_LIMIT)throw new HighfoodError(409,`Você já tem o máximo de ${GARAGE.VEHICLE_LIMIT} veículos.`);
      if(wallet.balance<price)throw new HighfoodError(409,`Faltam ${(price-wallet.balance).toLocaleString('pt-BR')} moedas para comprar a moto.`);
      const claimed=await tx.insert(currencyLedger).values({id:receipt,userId:user.id,amount:-price,reason:`vehicle:${MOTO_MODEL}`}).onConflictDoNothing().returning({id:currencyLedger.id});
      if(!claimed.length)return wallet.balance;
      await tx.update(wallets).set({balance:wallet.balance-price}).where(eq(wallets.userId,user.id));
      await this.addVehicle(tx,user.id);
      await tx.insert(controls).values({id:randomUUID(),payload:{action:'sync',playerId:user.id,issuedAt:Date.now()}});
      return wallet.balance-price;
    });
    return {...await this.vehicle(user.id),balance};
  }
  /** What the world keeps of a bike: how it is and how far it has gone. */
  async saveVehicles(updates:ReadonlyArray<{vehicleId:string;parts:string;mileage:number}>):Promise<void>{
    for(const {vehicleId,parts,mileage} of updates)await this.db.update(playerVehicles).set({parts,mileage,updatedAt:new Date()}).where(eq(playerVehicles.id,vehicleId));
  }
  async access(userId:string):Promise<{vehicles:OwnedVehicle[]}>{
    return {vehicles:await this.owned(userId)};
  }
  /** The administration gives a new bike, or takes one (the coins are not touched). With more than one, it must say which plate: a key is not taken by guessing. */
  async setVehicle(actor:string,playerId:string,owned:boolean,reason:string,plate?:string):Promise<void>{
    await this.db.transaction(async tx=>{
      if(owned)await this.addVehicle(tx,playerId);
      else{
        const held=await tx.select({id:playerVehicles.id,plate:playerVehicles.plate}).from(playerVehicles).where(eq(playerVehicles.userId,playerId)).for('update');
        if(!held.length)throw new HighfoodError(404,'Este jogador não tem moto.');
        if(!plate&&held.length>1)throw new HighfoodError(409,`Este jogador tem ${held.length} motos: informe a placa (${held.map(each=>each.plate).join(', ')}).`);
        const target=plate?held.find(each=>each.plate===plate):held[0];
        if(!target)throw new HighfoodError(404,'Este jogador não tem a moto dessa placa.');
        await tx.delete(playerVehicles).where(eq(playerVehicles.id,target.id));
      }
      await tx.insert(moderationActions).values({id:randomUUID(),actorId:actor,userId:playerId,action:owned?'vehicle-grant':'vehicle-revoke',reason:plate?`${reason} · ${plate}`:reason});
      await tx.insert(controls).values({id:randomUUID(),payload:{action:'sync',playerId,issuedAt:Date.now()}});
    });
  }

  /** Pays a delivery (once per order) and records it. Past the daily ceiling it is still recorded, at what was left of it. */
  async complete(record:DeliveryRecord):Promise<HighfoodReceipt>{
    const prices=await this.pricing.table(),id=`highfood:${record.orderId}`;
    return this.db.transaction(async tx=>{
      const [wallet]=await tx.select().from(wallets).where(eq(wallets.userId,record.userId)).for('update');
      if(!wallet)throw new HighfoodError(404,'Carteira não encontrada.');
      const facts:DeliveryFacts={length:record.length,onTime:record.onTime,crashes:record.crashes,wornBox:record.wornBox},stars=deliveryStars(facts);
      const [previous]=await tx.select().from(currencyLedger).where(eq(currencyLedger.id,id));
      if(previous)return {orderId:record.orderId,pay:deliveryPay(prices,facts,0),paid:previous.amount,stars,balance:wallet.balance,customer:record.customer,capped:false,line:''};
      const today=startOfDay();
      const [{count,earned}={count:0,earned:0}]=await tx.select({count:sql<number>`count(*)`.mapWith(Number),earned:sql<number>`coalesce(sum(${highfoodDeliveries.paid}),0)`.mapWith(Number)}).from(highfoodDeliveries)
        .where(and(eq(highfoodDeliveries.userId,record.userId),eq(highfoodDeliveries.status,'delivered'),gte(highfoodDeliveries.createdAt,today)));
      const pay=deliveryPay(prices,facts,count),room=Math.max(0,priceOf(prices,'cap:highfood-daily')-earned);
      const balance=Math.min(MAX_COIN_BALANCE,wallet.balance+Math.min(pay.total,room)),paid=balance-wallet.balance;
      await tx.insert(currencyLedger).values({id,userId:record.userId,amount:paid,reason:`highfood:delivery:${record.orderId}`});
      if(paid)await tx.update(wallets).set({balance}).where(eq(wallets.userId,record.userId));
      await tx.insert(highfoodDeliveries).values({id:record.orderId,userId:record.userId,customerId:record.customerId,customer:record.customer,restaurant:record.restaurant,items:record.items,address:record.address,
        length:Math.round(record.length),durationMs:record.durationMs,paid,stars,onTime:record.onTime,crashes:record.crashes,status:'delivered'}).onConflictDoNothing();
      return {orderId:record.orderId,pay,paid,stars,balance,customer:record.customer,capped:paid<pay.total,line:''};
    });
  }
  /** An order that never arrived stays in the history. */
  async lost(order:LostOrder):Promise<void>{
    await this.db.insert(highfoodDeliveries).values({id:order.orderId,userId:order.userId,customerId:order.customerId,customer:order.customer,restaurant:order.restaurant,items:order.items,address:order.address,
      length:Math.round(order.length),durationMs:0,paid:0,stars:order.reason==='left'?null:1,onTime:false,crashes:0,status:order.reason}).onConflictDoNothing();
  }

  async view(userId:string):Promise<HighfoodView>{
    const prices=await this.pricing.table(),today=startOfDay(),since=new Date(today.getTime()-6*86_400_000),done=and(eq(highfoodDeliveries.userId,userId),eq(highfoodDeliveries.status,'delivered'));
    const [[all],[rated],[now],week,recent]=await Promise.all([
      this.db.select({count:sql<number>`count(*)`.mapWith(Number),earned:sql<number>`coalesce(sum(${highfoodDeliveries.paid}),0)`.mapWith(Number),onTime:sql<number>`count(*) filter (where ${highfoodDeliveries.onTime})`.mapWith(Number)}).from(highfoodDeliveries).where(done),
      // The rating is what the last ones thought, as in the real apps: an old bad day wears off.
      this.db.select({average:sql<number|null>`avg(stars)`,count:sql<number>`count(*)`.mapWith(Number)}).from(this.db.select({stars:highfoodDeliveries.stars}).from(highfoodDeliveries).where(and(eq(highfoodDeliveries.userId,userId),sql`${highfoodDeliveries.stars} is not null`)).orderBy(desc(highfoodDeliveries.createdAt)).limit(50).as('last')),
      this.db.select({count:sql<number>`count(*)`.mapWith(Number),earned:sql<number>`coalesce(sum(${highfoodDeliveries.paid}),0)`.mapWith(Number)}).from(highfoodDeliveries).where(and(done,gte(highfoodDeliveries.createdAt,today))),
      this.db.select({day:sql<string>`to_char(${highfoodDeliveries.createdAt},'YYYY-MM-DD')`,count:sql<number>`count(*)`.mapWith(Number),earned:sql<number>`coalesce(sum(${highfoodDeliveries.paid}),0)`.mapWith(Number)}).from(highfoodDeliveries).where(and(done,gte(highfoodDeliveries.createdAt,since))).groupBy(sql`1`).orderBy(asc(sql`1`)),
      this.db.select().from(highfoodDeliveries).where(eq(highfoodDeliveries.userId,userId)).orderBy(desc(highfoodDeliveries.createdAt)).limit(RECENT),
    ]);
    const names=[...new Set(recent.map(row=>row.customerId))];
    const people=names.length?await this.db.select().from(highfoodCustomers).where(inArray(highfoodCustomers.id,names)):[];
    const entries:HighfoodHistoryEntry[]=recent.map(row=>({id:row.id,customer:row.customer,customerId:row.customerId,restaurant:row.restaurant,items:row.items as string[],address:row.address,length:row.length,paid:row.paid,stars:row.stars,status:row.status as HighfoodHistoryEntry['status'],at:row.createdAt.getTime(),durationMs:row.durationMs}));
    return {
      deliveries:all?.count??0,earnedTotal:all?.earned??0,rating:rated?.average===null||rated?.average===undefined?null:Number(rated.average),ratings:rated?.count??0,onTimeShare:all?.count?(all.onTime/all.count):null,
      today:{count:now?.count??0,earned:now?.earned??0,cap:priceOf(prices,'cap:highfood-daily'),fullLeft:Math.max(0,priceOf(prices,'highfood:full-per-day')-(now?.count??0)),lateShare:priceOf(prices,'highfood:late-pct')/100},
      week,recent:entries,customers:Object.fromEntries(people.map(person=>[person.id,{look:person.look as CustomerLook,image:person.image,name:person.name}])),
    };
  }

  async rating(userId:string):Promise<number|null>{
    const [row]=await this.db.select({average:sql<number|null>`avg(stars)`}).from(this.db.select({stars:highfoodDeliveries.stars}).from(highfoodDeliveries).where(and(eq(highfoodDeliveries.userId,userId),sql`${highfoodDeliveries.stars} is not null`)).orderBy(desc(highfoodDeliveries.createdAt)).limit(50).as('last'));
    return row?.average===null||row?.average===undefined?null:Number(row.average);
  }
  async customers(activeOnly=true):Promise<CustomerProfile[]>{
    const rows=await this.db.select().from(highfoodCustomers).where(activeOnly?eq(highfoodCustomers.active,true):undefined).orderBy(asc(highfoodCustomers.name));
    return rows.map(toProfile);
  }
  /** The profile with `id` changes; without one, a new customer. The picture is one of the images sent for badges (profile-service.ts). */
  async saveCustomer(actor:string,customer:Omit<CustomerProfile,'id'>&{id?:string|undefined},reason:string):Promise<CustomerProfile[]>{
    await this.db.transaction(async tx=>{
      const {id,...fields}=customer;
      if(id){
        const [changed]=await tx.update(highfoodCustomers).set({...fields,updatedAt:new Date()}).where(eq(highfoodCustomers.id,id)).returning({id:highfoodCustomers.id});
        if(!changed)throw new HighfoodError(404,'Cliente não encontrado.');
      }else{
        const base=customer.name.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,34)||'cliente';
        const taken=new Set((await tx.select({id:highfoodCustomers.id}).from(highfoodCustomers)).map(row=>row.id));
        let next=base;for(let n=2;taken.has(next);n++)next=`${base}-${n}`;
        await tx.insert(highfoodCustomers).values({id:next,...fields});
      }
      await tx.insert(moderationActions).values({id:randomUUID(),actorId:actor,action:id?'customer-edit':'customer-create',reason:`${reason} · ${customer.name}`});
    });
    return this.customers(false);
  }
  async usesImage(id:string):Promise<string|undefined>{
    const [using]=await this.db.select({name:highfoodCustomers.name}).from(highfoodCustomers).where(eq(highfoodCustomers.image,id));
    return using?.name;
  }
  /** The administration's picture of the service. */
  async stats(){
    const today=startOfDay(),since=new Date(today.getTime()-6*86_400_000);
    const pick=(from:Date)=>this.db.select({count:sql<number>`count(*)`.mapWith(Number),paid:sql<number>`coalesce(sum(${highfoodDeliveries.paid}),0)`.mapWith(Number),people:sql<number>`count(distinct ${highfoodDeliveries.userId})`.mapWith(Number)}).from(highfoodDeliveries).where(and(eq(highfoodDeliveries.status,'delivered'),gte(highfoodDeliveries.createdAt,from)));
    const [[day],[week],[vehicles],[spent]]=await Promise.all([pick(today),pick(since),
      this.db.select({count:sql<number>`count(*)`.mapWith(Number)}).from(playerVehicles),
      this.db.select({coins:sql<number>`coalesce(sum(${currencyLedger.amount}),0)`.mapWith(Number)}).from(currencyLedger).where(and(like(currencyLedger.reason,'vehicle:%'),gte(currencyLedger.createdAt,since)))]);
    return {today:day,week,vehicles:vehicles?.count??0,vehicleSpentWeek:-(spent?.coins??0),levels:COURIER_LEVELS.length};
  }
}
void HIGHFOOD_CUSTOMERS;
