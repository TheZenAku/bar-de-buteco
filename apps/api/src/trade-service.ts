import {createHash} from 'node:crypto';
import {and,asc,eq,gt,inArray,sql} from 'drizzle-orm';
import {GARAGE,INVENTORY_CAPACITY,ITEM_IDS,MAX_COIN_BALANCE,itemById,normalizeOffer,type ItemId,type TradeOffer,type TradeResult,type TradeSideResult} from '@bar/shared';
import {isBanned} from './auth/service.js';
import type {Database} from './database/index.js';
import {currencyLedger,inventoryLedger,itemInventory,playerVehicles,sessions,trades,wallets} from './database/schema.js';
import type {HighfoodService} from './highfood-service.js';

export class TradeError extends Error {constructor(readonly statusCode:number,message:string){super(message);}}
interface TradeSide {userId:string;sessionId:string;offer:TradeOffer}
export interface TradeCommit {id:string;a:TradeSide;b:TradeSide}

/**
 * Where a trade really happens (docs/sistemas/troca.md). The room only ever asks; here, in one transaction, everything each one offered is checked against what
 * they have right now, under locks, and moved: all of it or none of it. Nothing is set aside beforehand, so there is never anything in limbo to lose or to
 * hand out twice: whatever changed in the meantime (a drink, a Pix, a faint) just makes the trade fail, whole. The trade's id can happen only once: a retry
 * finds its row and changes nothing.
 */
export class TradeService {
  constructor(private db:Database,private vehicles:HighfoodService){}

  async commit(input:TradeCommit):Promise<TradeResult>{
    const a={...input.a,offer:normalizeOffer(input.a.offer)},b={...input.b,offer:normalizeOffer(input.b.offer)},users=[a.userId,b.userId];
    const fingerprint=createHash('sha256').update(JSON.stringify([a.userId,a.offer,b.userId,b.offer])).digest('hex');
    // Already done: the answer to a retry, even if the sessions have ended since.
    if(await this.alreadyDone(input.id,fingerprint))return this.result(input.id,users,true);
    await this.requireSession(a);await this.requireSession(b);
    const replayed=await this.db.transaction(async tx=>{
      // Two copies of the same request at once: the second waits here, then finds the first one's row.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`bar-de-buteco:trade:${input.id}`},0))`);
      const [done]=await tx.select({fingerprint:trades.fingerprint}).from(trades).where(eq(trades.id,input.id));
      if(done){if(done.fingerprint!==fingerprint)throw new TradeError(409,'Este identificador de troca já foi usado.');return true;}
      // The same order as a Pix (and everything else takes one wallet at a time), so two trades never wait for each other in a circle.
      const locked=await tx.select().from(wallets).where(inArray(wallets.userId,users)).orderBy(asc(wallets.userId)).for('update');
      if(locked.length!==2)throw new TradeError(409,'Uma das carteiras não existe mais.');
      const balance=new Map(locked.map(wallet=>[wallet.userId,wallet.balance]));
      const stacks=await tx.select().from(itemInventory).where(inArray(itemInventory.userId,users)).orderBy(asc(itemInventory.userId),asc(itemInventory.itemId)).for('update');
      const held=new Map<string,Map<string,number>>(users.map(id=>[id,new Map()]));
      for(const stack of stacks)held.get(stack.userId)!.set(stack.itemId,stack.quantity);
      // What each one has now, before anything moves: nothing received in this trade can be given in it.
      for(const side of [a,b]){
        if(balance.get(side.userId)!<side.offer.coins)throw new TradeError(409,'Um dos jogadores não tem mais as moedas que ofereceu.');
        for(const {itemId,quantity} of side.offer.items)if((held.get(side.userId)!.get(itemId)??0)<quantity)throw new TradeError(409,`Um dos jogadores não tem mais ${itemById(itemId)?.name??itemId} na quantidade oferecida.`);
      }
      const vehicleIds=[...a.offer.vehicles,...b.offer.vehicles].sort();
      const vehicles=vehicleIds.length?await tx.select({id:playerVehicles.id,userId:playerVehicles.userId,plate:playerVehicles.plate}).from(playerVehicles).where(inArray(playerVehicles.id,vehicleIds)).orderBy(asc(playerVehicles.id)).for('update'):[];
      for(const side of [a,b])for(const id of side.offer.vehicles){
        const vehicle=vehicles.find(each=>each.id===id);
        if(!vehicle||vehicle.userId!==side.userId)throw new TradeError(409,'Uma das chaves oferecidas não está mais com quem ofereceu.');
      }
      const owned=await tx.select({userId:playerVehicles.userId,count:sql<number>`count(*)`.mapWith(Number)}).from(playerVehicles).where(inArray(playerVehicles.userId,users)).groupBy(playerVehicles.userId);
      for(const [side,other] of [[a,b],[b,a]] as const){
        const before=owned.find(row=>row.userId===side.userId)?.count??0,after=before-side.offer.vehicles.length+other.offer.vehicles.length;
        if(after>before&&after>GARAGE.VEHICLE_LIMIT)throw new TradeError(409,`Um dos jogadores já tem o máximo de ${GARAGE.VEHICLE_LIMIT} veículos.`);
        const coins=balance.get(side.userId)!-side.offer.coins+other.offer.coins;
        if(coins>MAX_COIN_BALANCE)throw new TradeError(409,'A carteira de um dos jogadores não comporta essas moedas.');
        balance.set(`${side.userId}:after`,coins);
      }
      // Both backpacks as they would end: nothing is rounded down or left on the floor, it either fits or the trade does not happen.
      const after=new Map(users.map(id=>[id,new Map(held.get(id)!)]));
      for(const [side,other] of [[a,b],[b,a]] as const)for(const {itemId,quantity} of side.offer.items){
        const from=after.get(side.userId)!,to=after.get(other.userId)!;
        from.set(itemId,(from.get(itemId)??0)-quantity);
        to.set(itemId,(to.get(itemId)??0)+quantity);
      }
      for(const id of users){
        const end=after.get(id)!,start=held.get(id)!;
        for(const [itemId,quantity] of end){
          const item=itemById(itemId);
          if(item&&quantity>item.stackMax&&quantity>(start.get(itemId)??0))throw new TradeError(409,`Um dos jogadores não pode carregar tanto de ${item.name} (máximo de ${item.stackMax}).`);
        }
        const used=[...end.values()].filter(quantity=>quantity>0).length;
        if(used>INVENTORY_CAPACITY&&used>start.size)throw new TradeError(409,'A mochila de um dos jogadores não tem espaço para isso.');
      }
      // From here on, everything is known to fit.
      for(const [side,other] of [[a,b],[b,a]] as const){
        if(side.offer.coins){
          await tx.insert(currencyLedger).values([
            {id:`trade:${input.id}:${side.userId}:out`,userId:side.userId,amount:-side.offer.coins,reason:`trade:out:${other.userId}:${input.id}`},
            {id:`trade:${input.id}:${other.userId}:in`,userId:other.userId,amount:side.offer.coins,reason:`trade:in:${side.userId}:${input.id}`},
          ]);
        }
        for(const {itemId,quantity} of side.offer.items){
          await tx.insert(inventoryLedger).values([
            {id:`trade:${input.id}:${side.userId}:${itemId}:out`,userId:side.userId,itemId,quantity:-quantity,reason:'trade'},
            {id:`trade:${input.id}:${other.userId}:${itemId}:in`,userId:other.userId,itemId,quantity,reason:'trade'},
          ]);
        }
        for(const id of side.offer.vehicles){
          const moved=await tx.update(playerVehicles).set({userId:other.userId,updatedAt:new Date()}).where(and(eq(playerVehicles.id,id),eq(playerVehicles.userId,side.userId))).returning({id:playerVehicles.id});
          if(moved.length!==1)throw new TradeError(409,'Uma das chaves oferecidas não está mais com quem ofereceu.');
        }
      }
      for(const id of users){
        if(balance.get(`${id}:after`)!==balance.get(id))await tx.update(wallets).set({balance:balance.get(`${id}:after`)!}).where(eq(wallets.userId,id));
        const end=after.get(id)!,start=held.get(id)!;
        for(const itemId of new Set([...end.keys(),...start.keys()])){
          const was=start.get(itemId)??0,now=end.get(itemId)??0;
          if(was===now)continue;
          const row=and(eq(itemInventory.userId,id),eq(itemInventory.itemId,itemId));
          if(!now)await tx.delete(itemInventory).where(row);
          else if(was)await tx.update(itemInventory).set({quantity:now,updatedAt:new Date()}).where(row);
          else await tx.insert(itemInventory).values({userId:id,itemId,quantity:now});
        }
      }
      await tx.insert(trades).values({id:input.id,userA:a.userId,userB:b.userId,offerA:a.offer,offerB:b.offer,fingerprint});
      return false;
    });
    return this.result(input.id,users,replayed);
  }

  private async alreadyDone(id:string,fingerprint:string):Promise<boolean>{
    const [done]=await this.db.select({fingerprint:trades.fingerprint}).from(trades).where(eq(trades.id,id));
    if(done&&done.fingerprint!==fingerprint)throw new TradeError(409,'Este identificador de troca já foi usado.');
    return !!done;
  }
  private async requireSession(side:TradeSide):Promise<void>{
    const [session]=await this.db.select({id:sessions.id}).from(sessions).where(and(eq(sessions.id,side.sessionId),eq(sessions.userId,side.userId),gt(sessions.expiresAt,new Date())));
    if(!session||await isBanned(this.db,side.userId))throw new TradeError(401,'A sessão de um dos jogadores terminou.');
  }
  private async side(userId:string):Promise<TradeSideResult>{
    const [[wallet],stacks,vehicles]=await Promise.all([
      this.db.select({balance:wallets.balance}).from(wallets).where(eq(wallets.userId,userId)),
      this.db.select({itemId:itemInventory.itemId,quantity:itemInventory.quantity}).from(itemInventory).where(eq(itemInventory.userId,userId)),
      this.vehicles.owned(userId),
    ]);
    const known=stacks.filter(stack=>!!itemById(stack.itemId)&&stack.quantity>0).map(stack=>({itemId:stack.itemId as ItemId,quantity:stack.quantity})).sort((x,y)=>ITEM_IDS.indexOf(x.itemId)-ITEM_IDS.indexOf(y.itemId));
    return {balance:wallet?.balance??0,stacks:known,vehicles,keys:vehicles.map(vehicle=>({vehicleId:vehicle.id,plate:vehicle.plate,name:vehicle.name}))};
  }
  private async result(id:string,users:string[],replayed:boolean):Promise<TradeResult>{
    return {id,replayed,sides:Object.fromEntries(await Promise.all(users.map(async user=>[user,await this.side(user)] as const)))};
  }
}
