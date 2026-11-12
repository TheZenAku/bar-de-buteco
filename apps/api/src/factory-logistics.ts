import {randomUUID} from 'node:crypto';
import {and,desc,eq,inArray,sql} from 'drizzle-orm';
import {MAX_COIN_BALANCE,STORAGE,hasStorage,storageStackMax} from '@bar/shared';
import {COMPANY_ID,DEFAULT_FACTORY_FINANCE,SHIPMENT_ACTIVE,factoryFinancePatchSchema,freightFor,mergeFactoryFinance,settleSale,type FactoryFinance,type FactoryFinancePatch,type FactoryMaterial,type FactoryShipmentView,type ShipmentStatus} from '@bar/shared/factory';
import type {Database} from './database/index.js';
import {cityTreasury,cityTreasuryLedger,currencyLedger,factoryLedger,factoryOrders,factorySettings,factoryShipments,inventoryLedger,playerVehicles,profiles,users,vehicleStorage,wallets} from './database/schema.js';
import {OWNER_EMAIL} from './admin-policy.js';
import {postToCompany} from './company-ledger.js';

export class LogisticsError extends Error {constructor(readonly statusCode:number,message:string){super(message);}}
type Tx=Pick<Database,'select'|'insert'|'update'|'delete'>;
type ShipmentRow=typeof factoryShipments.$inferSelect;
const FINANCE_KEY='finance';
const ITEM:Record<FactoryMaterial,'malte_saco'|'mix_saco'|'produto_saco'|'aco_lote'|'aluminio_lote'|'polimero_lote'|'molas_caixa'>={MALTE:'malte_saco',MIX:'mix_saco',PRODUTO:'produto_saco',ACO:'aco_lote',ALUMINIO:'aluminio_lote',POLIMERO:'polimero_lote',MOLAS:'molas_caixa'};
const iso=(date:Date|null)=>date?date.toISOString():null;

export interface Destination {x:number;z:number;label:string;distanceM:number}
/** What a payment did: who got how much and their new balance (so the room can tell the screen). */
export interface Payout {userId:string;amount:number;balance:number}

/**
 * The plant's money and trucks. The world owns the stock (the racks); this owns coins and the trucks' holds. Every step is one
 * transaction that locks the shipment, so a retry or two processes at once cannot pay or unload twice, and every payout claims
 * its own ledger row. Payments here are not job pay: they skip the daily job cap (a sale is worth thousands of coins).
 */
export class FactoryLogistics {
  constructor(private db:Database){}

  // ---- settings ----
  async finance(db:Tx=this.db):Promise<FactoryFinance> {
    const [row]=await db.select().from(factorySettings).where(eq(factorySettings.key,FINANCE_KEY));
    return mergeFactoryFinance(row?.value);
  }
  async setFinance(patch:unknown,actorId:string,requestId:string):Promise<FactoryFinance> {
    const parsed=factoryFinancePatchSchema.safeParse(patch);if(!parsed.success)throw new LogisticsError(400,'Valores inválidos: '+parsed.error.issues.map(issue=>`${issue.path.join('.')} ${issue.message}`).join('; '));
    return this.db.transaction(async tx=>{
      const claimed=await tx.insert(factoryLedger).values({requestId,actorId,action:'finance',resource:FINANCE_KEY,delta:parsed.data,result:{}}).onConflictDoNothing().returning({id:factoryLedger.requestId});
      if(!claimed.length)return this.finance(tx);
      const next:FactoryFinance={...await this.finance(tx),...(parsed.data as FactoryFinancePatch)};
      if(next.ownerUserId){const [owner]=await tx.select({id:users.id}).from(users).where(eq(users.id,next.ownerUserId));if(!owner)throw new LogisticsError(404,'O dono da firma não existe.');}
      await tx.insert(factorySettings).values({key:FINANCE_KEY,value:next,updatedBy:actorId}).onConflictDoUpdate({target:factorySettings.key,set:{value:next,updatedBy:actorId,updatedAt:new Date()}});
      return next;
    });
  }
  /** The firm's owner: the one chosen in the administration, else the game's owner account; null when neither exists. */
  /** The account chosen in the administration (else the game's owner account) is the firm's first owner when it has none yet (CompanyService.seed). */
  async owner(tx:Tx,finance:FactoryFinance):Promise<string|null> {
    if(finance.ownerUserId){const [chosen]=await tx.select({id:users.id}).from(users).where(eq(users.id,finance.ownerUserId));if(chosen)return chosen.id;}
    const [fallback]=await tx.select({id:users.id}).from(users).where(sql`lower(${users.email})=${OWNER_EMAIL}`);
    return fallback?.id??null;
  }

  // ---- the city's vault ----
  async treasury(limit=40){
    await this.db.insert(cityTreasury).values({id:'city',balance:0}).onConflictDoNothing();
    const [vault]=await this.db.select().from(cityTreasury).where(eq(cityTreasury.id,'city'));
    const ledger=await this.db.select().from(cityTreasuryLedger).orderBy(desc(cityTreasuryLedger.createdAt)).limit(limit);
    return {balance:Number(vault?.balance??0),ledger:ledger.map(row=>({id:row.id,amount:Number(row.amount),balanceAfter:Number(row.balanceAfter),reason:row.reason,ref:row.ref,actorId:row.actorId,at:iso(row.createdAt)}))};
  }
  /** Money into (or out of) the city's vault, with its ledger line. */
  async toTreasury(tx:Tx,amount:number,reason:string,ref:string,actorId:string|null):Promise<number> {
    if(!amount)return 0;
    await tx.insert(cityTreasury).values({id:'city',balance:0}).onConflictDoNothing();
    const [vault]=await tx.select().from(cityTreasury).where(eq(cityTreasury.id,'city')).for('update');
    const balance=Number(vault!.balance)+amount;
    if(balance<0)throw new LogisticsError(409,'O cofre da cidade não tem esse valor.');
    await tx.update(cityTreasury).set({balance,updatedAt:new Date()}).where(eq(cityTreasury.id,'city'));
    await tx.insert(cityTreasuryLedger).values({id:randomUUID(),amount,balanceAfter:balance,reason,ref,actorId});
    return balance;
  }
  /** An administrator puts into or takes out of the vault, with a reason. */
  async adjustTreasury(amount:number,reason:string,actorId:string,requestId:string){
    if(!Number.isSafeInteger(amount)||!amount)throw new LogisticsError(400,'Valor inválido.');
    await this.db.transaction(async tx=>{
      const claimed=await tx.insert(factoryLedger).values({requestId,actorId,action:'treasury',resource:'city',delta:{amount,reason},result:{}}).onConflictDoNothing().returning({id:factoryLedger.requestId});
      if(claimed.length)await this.toTreasury(tx,amount,`admin:${reason}`.slice(0,200),requestId,actorId);
    });
    return this.treasury();
  }

  // ---- paying people ----
  /** Credits a player (once per `id`). Null when the player does not exist. */
  private async pay(tx:Tx,userId:string,amount:number,reason:string,id:string):Promise<Payout|null> {
    if(!userId||amount<=0)return null;
    const [exists]=await tx.select({id:users.id}).from(users).where(eq(users.id,userId));if(!exists)return null;
    const claimed=await tx.insert(currencyLedger).values({id,userId,amount,reason}).onConflictDoNothing().returning({id:currencyLedger.id});
    const [wallet]=await tx.select().from(wallets).where(eq(wallets.userId,userId)).for('update');
    if(!claimed.length)return {userId,amount:0,balance:wallet?.balance??0};
    const balance=Math.min(MAX_COIN_BALANCE,(wallet?.balance??0)+amount);
    if(wallet)await tx.update(wallets).set({balance}).where(eq(wallets.userId,userId));else await tx.insert(wallets).values({userId,balance});
    return {userId,amount:balance-(wallet?.balance??0),balance};
  }

  // ---- the truck's hold ----
  /**
   * Any truck can carry the plant's cargo: a player's (its row is locked, serialising its moves) or one the administration spawned, which has no
   * row in the garage (the key is then 'moto:<id>', chosen by the room). The room has already checked that it is a truck.
   */
  private async lockTruck(tx:Tx,vehicleId:string){
    const [vehicle]=await tx.select().from(playerVehicles).where(eq(playerVehicles.id,vehicleId)).for('update');
    return vehicle;
  }
  private async hold(tx:Tx,vehicleId:string,itemId:string):Promise<number> {
    const [row]=await tx.select().from(vehicleStorage).where(and(eq(vehicleStorage.vehicleId,vehicleId),eq(vehicleStorage.itemId,itemId)));return row?.quantity??0;
  }
  private async putInHold(tx:Tx,vehicleId:string,driverId:string,itemId:string,bags:number,why:string,ref:string){
    const current=await this.hold(tx,vehicleId,itemId);
    if(current+bags>storageStackMax(itemId))throw new LogisticsError(409,'O baú do caminhão não comporta essa carga.');
    if(!current){
      const [{count=0}={}]=await tx.select({count:sql<number>`count(*)`.mapWith(Number)}).from(vehicleStorage).where(eq(vehicleStorage.vehicleId,vehicleId));
      if(count>=STORAGE.SLOTS)throw new LogisticsError(409,'O baú do caminhão está sem espaço para mais um tipo de item.');
      await tx.insert(vehicleStorage).values({vehicleId,itemId,quantity:bags});
    }else await tx.update(vehicleStorage).set({quantity:current+bags,updatedAt:new Date()}).where(and(eq(vehicleStorage.vehicleId,vehicleId),eq(vehicleStorage.itemId,itemId)));
  }
  private async takeFromHold(tx:Tx,vehicleId:string,driverId:string,itemId:string,bags:number,why:string,ref:string){
    const current=await this.hold(tx,vehicleId,itemId);
    if(current<bags)throw new LogisticsError(409,`Faltam sacos no baú do caminhão (${current} de ${bags}).`);
    if(current===bags)await tx.delete(vehicleStorage).where(and(eq(vehicleStorage.vehicleId,vehicleId),eq(vehicleStorage.itemId,itemId)));
    else await tx.update(vehicleStorage).set({quantity:current-bags,updatedAt:new Date()}).where(and(eq(vehicleStorage.vehicleId,vehicleId),eq(vehicleStorage.itemId,itemId)));
  }
  /** A truck has one trip at a time (whoever drives it: the driver changes, the cargo stays with the truck). */
  private async busy(tx:Tx,vehicleId:string):Promise<void> {
    const [active]=await tx.select({id:factoryShipments.id}).from(factoryShipments).where(and(inArray(factoryShipments.status,[...SHIPMENT_ACTIVE]),eq(factoryShipments.vehicleId,vehicleId)));
    if(active)throw new LogisticsError(409,'Esse caminhão já tem uma carga em andamento.');
  }
  /** Who drives the truck now gets its route and its freight. */
  async setDriver(id:string,driverId:string):Promise<{applied:boolean}> {
    const changed=await this.db.update(factoryShipments).set({driverId}).where(and(eq(factoryShipments.id,id),inArray(factoryShipments.status,[...SHIPMENT_ACTIVE]),sql`${factoryShipments.driverId}<>${driverId}`)).returning({id:factoryShipments.id});
    return {applied:changed.length>0};
  }

  // ---- sales: product out ----
  /** The operator loads `pallets` of product into a truck at the dock. The world already took them out of the racks. */
  async loadSale(input:{vehicleId:string;plate?:string;driverId?:string;loaderId:string;pallets:number;dest:Destination;requestId:string}):Promise<FactoryShipmentView> {
    const id=await this.db.transaction(async tx=>{
      const claimed=await tx.insert(factoryLedger).values({requestId:input.requestId,actorId:input.loaderId,action:'ship-load',resource:input.vehicleId,delta:{pallets:input.pallets},result:{}}).onConflictDoNothing().returning({id:factoryLedger.requestId});
      if(!claimed.length){const [again]=await tx.select().from(factoryShipments).where(eq(factoryShipments.requestId,input.requestId));if(again)return again.id;throw new LogisticsError(409,'Pedido já processado.');}
      const vehicle=await this.lockTruck(tx,input.vehicleId),finance=await this.finance(tx),plate=input.plate||vehicle?.plate||'',driverId=input.driverId??vehicle?.userId??'';
      if(input.pallets<1||input.pallets>finance.maxPalletsPerTruck)throw new LogisticsError(400,`Um caminhão leva de 1 a ${finance.maxPalletsPerTruck} paletes.`);
      await this.busy(tx,input.vehicleId);
      const bags=input.pallets*18,shipmentId=randomUUID();
      await this.putInHold(tx,input.vehicleId,driverId,ITEM.PRODUTO,bags,'load',shipmentId);
      await tx.insert(factoryShipments).values({id:shipmentId,kind:'sale',status:'loaded',vehicleId:input.vehicleId,plate,driverId,loaderId:input.loaderId,material:'PRODUTO',pallets:input.pallets,bags,destX:input.dest.x,destZ:input.dest.z,destLabel:input.dest.label,distanceM:input.dest.distanceM,requestId:input.requestId});
      return shipmentId;
    });
    return (await this.one(id))!;
  }
  /**
   * The truck left the plant: the sale is settled (tax to the city's vault, the operator's fee, the rest to the owner of the firm) and the
   * trip to the customer begins. `applied:false` when it was settled before.
   */
  async depart(id:string):Promise<{applied:boolean;shipment:FactoryShipmentView;payouts:Payout[];tax:number}> {
    const payouts:Payout[]=[];let applied=false,taxPaid=0;
    await this.db.transaction(async tx=>{
      const [row]=await tx.select().from(factoryShipments).where(eq(factoryShipments.id,id)).for('update');
      if(!row)throw new LogisticsError(404,'Carga não encontrada.');
      if(row.kind!=='sale'||row.status!=='loaded')return;
      const finance=await this.finance(tx),split=settleSale(row.pallets*finance.palletPrice,finance);
      // The operator's fee goes to the player; the owner's share goes to the firm's wallet (the owners decide what to do with it); an operator who cannot be paid (no such account) leaves the fee to the vault.
      let toVault=split.tax;
      const staff=await this.pay(tx,row.loaderId,split.staff,`factory:fee:${id}`,`factory-fee:${id}`);if(staff)payouts.push(staff);else toVault+=split.staff;
      if(split.owner>0)await postToCompany(tx,split.owner,`Venda de ${row.pallets} palete(s) de produto (carga ${id.slice(0,8)})`,id,null,`company-sale:${id}`);
      if(toVault)await this.toTreasury(tx,toVault,`Imposto da venda ${id.slice(0,8)}`,id,null);
      taxPaid=split.tax;
      await tx.update(factoryShipments).set({status:'in_transit',gross:split.gross,tax:split.tax,staff:split.staff,ownerShare:split.owner,ownerId:COMPANY_ID,freight:freightFor(finance,'sale',row.pallets,row.distanceM),departedAt:new Date()}).where(eq(factoryShipments.id,id));
      applied=true;
    });
    return {applied,shipment:(await this.one(id))!,payouts,tax:taxPaid};
  }
  /** The truck reached the delivery point: the cargo leaves the hold and the driver is paid the freight. */
  async deliver(id:string):Promise<{applied:boolean;shipment:FactoryShipmentView;payouts:Payout[]}> {
    const payouts:Payout[]=[];let applied=false;
    await this.db.transaction(async tx=>{
      const [row]=await tx.select().from(factoryShipments).where(eq(factoryShipments.id,id)).for('update');
      if(!row)throw new LogisticsError(404,'Carga não encontrada.');
      if(row.kind!=='sale'||row.status!=='in_transit')return;
      await this.lockTruck(tx,row.vehicleId);
      await this.takeFromHold(tx,row.vehicleId,row.driverId,ITEM.PRODUTO,row.bags,'deliver',id);
      const driver=await this.pay(tx,row.driverId,row.freight,`factory:freight:${id}`,`factory-freight:${id}`);if(driver)payouts.push(driver);
      await tx.update(factoryShipments).set({status:'delivered',deliveredAt:new Date()}).where(eq(factoryShipments.id,id));applied=true;
    });
    return {applied,shipment:(await this.one(id))!,payouts};
  }

  // ---- purchases: raw material fetched by a driver ----
  /** A driver at the dock takes an open purchase order: a trip to the supplier and back. */
  async acceptPurchase(input:{orderId:string;vehicleId:string;plate?:string;driverId:string;dest:Destination;requestId:string}):Promise<FactoryShipmentView> {
    const id=await this.db.transaction(async tx=>{
      const claimed=await tx.insert(factoryLedger).values({requestId:input.requestId,actorId:input.driverId,action:'ship-accept',resource:input.orderId,delta:{},result:{}}).onConflictDoNothing().returning({id:factoryLedger.requestId});
      if(!claimed.length){const [again]=await tx.select().from(factoryShipments).where(eq(factoryShipments.requestId,input.requestId));if(again)return again.id;throw new LogisticsError(409,'Pedido já processado.');}
      const vehicle=await this.lockTruck(tx,input.vehicleId);
      const [order]=await tx.select().from(factoryOrders).where(eq(factoryOrders.id,input.orderId)).for('update');
      if(!order||!['purchase','ribeiro-purchase'].includes(order.kind))throw new LogisticsError(404,'Ordem de compra não encontrada.');
      if(order.status!=='open')throw new LogisticsError(409,'Outro motorista já pegou essa ordem.');
      await this.busy(tx,input.vehicleId);
      const finance=await this.finance(tx),bags=order.pallets*18,shipmentId=randomUUID();
      await tx.update(factoryOrders).set({status:'accepted',acceptedBy:input.driverId,updatedAt:new Date()}).where(eq(factoryOrders.id,order.id));
      await tx.insert(factoryShipments).values({id:shipmentId,kind:'purchase',status:'to_supplier',vehicleId:input.vehicleId,plate:input.plate||vehicle?.plate||'',driverId:input.driverId,material:order.material,pallets:order.pallets,bags,orderId:order.id,destX:input.dest.x,destZ:input.dest.z,destLabel:input.dest.label,distanceM:input.dest.distanceM,freight:freightFor(finance,'purchase',order.pallets,input.dest.distanceM*2),requestId:input.requestId});
      return shipmentId;
    });
    return (await this.one(id))!;
  }
  /** The truck reached the supplier: the raw material goes into the hold. */
  async collect(id:string):Promise<{applied:boolean;shipment:FactoryShipmentView}> {
    let applied=false;
    await this.db.transaction(async tx=>{
      const [row]=await tx.select().from(factoryShipments).where(eq(factoryShipments.id,id)).for('update');
      if(!row)throw new LogisticsError(404,'Carga não encontrada.');
      if(row.kind!=='purchase'||row.status!=='to_supplier')return;
      await this.lockTruck(tx,row.vehicleId);
      await this.putInHold(tx,row.vehicleId,row.driverId,ITEM[row.material as FactoryMaterial],row.bags,'collect',id);
      await tx.update(factoryShipments).set({status:'returning',departedAt:new Date()}).where(eq(factoryShipments.id,id));applied=true;
    });
    return {applied,shipment:(await this.one(id))!};
  }
  /** The operator unloads the truck at the dock (the world already checked the racks have room and will add the bags); the driver is paid. */
  async unload(id:string,loaderId:string):Promise<{applied:boolean;shipment:FactoryShipmentView;payouts:Payout[]}> {
    const payouts:Payout[]=[];let applied=false;
    await this.db.transaction(async tx=>{
      const [row]=await tx.select().from(factoryShipments).where(eq(factoryShipments.id,id)).for('update');
      if(!row)throw new LogisticsError(404,'Carga não encontrada.');
      if(row.kind!=='purchase'||row.status!=='returning')return;
      await this.lockTruck(tx,row.vehicleId);
      await this.takeFromHold(tx,row.vehicleId,row.driverId,ITEM[row.material as FactoryMaterial],row.bags,'unload',id);
      const driver=await this.pay(tx,row.driverId,row.freight,`factory:freight:${id}`,`factory-freight:${id}`);if(driver)payouts.push(driver);
      if(row.orderId)await tx.update(factoryOrders).set({status:'completed',updatedAt:new Date()}).where(eq(factoryOrders.id,row.orderId));
      await tx.update(factoryShipments).set({status:'delivered',loaderId,deliveredAt:new Date()}).where(eq(factoryShipments.id,id));applied=true;
    });
    return {applied,shipment:(await this.one(id))!,payouts};
  }

  /** Ends a trip that cannot go on (the driver gave up, or the administration). Cargo still in the hold comes out; money already paid stays paid. */
  async cancel(id:string,actorId:string):Promise<{applied:boolean;shipment:FactoryShipmentView;cargo:{material:FactoryMaterial;bags:number}|null}> {
    let applied=false,cargo:{material:FactoryMaterial;bags:number}|null=null;
    await this.db.transaction(async tx=>{
      const [row]=await tx.select().from(factoryShipments).where(eq(factoryShipments.id,id)).for('update');
      if(!row)throw new LogisticsError(404,'Carga não encontrada.');
      if(!SHIPMENT_ACTIVE.includes(row.status as ShipmentStatus))return;
      const inHold=row.status==='loaded'||row.status==='in_transit'||row.status==='returning';
      if(inHold){
        const have=await this.hold(tx,row.vehicleId,ITEM[row.material as FactoryMaterial]),take=Math.min(have,row.bags);
        if(take){await this.takeFromHold(tx,row.vehicleId,row.driverId,ITEM[row.material as FactoryMaterial],take,'cancel',id);
          // Product that never left the plant goes back to the racks; what was paid for, or raw material, is simply gone.
          if(row.status==='loaded')cargo={material:row.material as FactoryMaterial,bags:take};}
      }
      if(row.orderId)await tx.update(factoryOrders).set({status:'open',acceptedBy:null,updatedAt:new Date()}).where(and(eq(factoryOrders.id,row.orderId),eq(factoryOrders.status,'accepted')));
      await tx.update(factoryShipments).set({status:'cancelled',deliveredAt:new Date()}).where(eq(factoryShipments.id,id));applied=true;
      await tx.insert(factoryLedger).values({requestId:`ship-cancel:${id}`,actorId,action:'ship-cancel',resource:id,delta:{},result:{}}).onConflictDoNothing();
    });
    return {applied,shipment:(await this.one(id))!,cargo};
  }

  // ---- reading ----
  private async views(rows:ShipmentRow[]):Promise<FactoryShipmentView[]> {
    const ids=[...new Set(rows.flatMap(row=>[row.driverId,row.loaderId,row.ownerId]).filter(Boolean))];
    const names=new Map<string,string>();
    if(ids.length)for(const row of await this.db.select({id:profiles.userId,name:profiles.displayName}).from(profiles).where(inArray(profiles.userId,ids)))names.set(row.id,row.name);
    return rows.map(row=>({id:row.id,kind:row.kind as 'sale'|'purchase',status:row.status as ShipmentStatus,vehicleId:row.vehicleId,plate:row.plate,driverId:row.driverId,driverName:names.get(row.driverId)??'',loaderId:row.loaderId,loaderName:names.get(row.loaderId)??'',
      material:row.material as FactoryMaterial,pallets:row.pallets,bags:row.bags,orderId:row.orderId,destX:row.destX,destZ:row.destZ,destLabel:row.destLabel,distanceM:row.distanceM,gross:row.gross,tax:row.tax,staff:row.staff,owner:row.ownerShare,freight:row.freight,ownerId:row.ownerId,
      createdAt:iso(row.createdAt)!,departedAt:iso(row.departedAt),deliveredAt:iso(row.deliveredAt)}));
  }
  async one(id:string):Promise<FactoryShipmentView|undefined> {
    const [row]=await this.db.select().from(factoryShipments).where(eq(factoryShipments.id,id));return row?(await this.views([row]))[0]:undefined;
  }
  /** The ones in progress and the latest finished, newest first. */
  async list(finished=25):Promise<FactoryShipmentView[]> {
    const active=await this.db.select().from(factoryShipments).where(inArray(factoryShipments.status,[...SHIPMENT_ACTIVE])).orderBy(desc(factoryShipments.createdAt));
    const done=await this.db.select().from(factoryShipments).where(inArray(factoryShipments.status,['delivered','cancelled'])).orderBy(desc(factoryShipments.createdAt)).limit(finished);
    return this.views([...active,...done]);
  }
  /** Totals for the administration's books. */
  async summary(){
    const [row]=await this.db.select({
      sales:sql<number>`count(*) filter (where kind='sale' and status in ('in_transit','delivered'))`.mapWith(Number),
      pallets:sql<number>`coalesce(sum(pallets) filter (where kind='sale' and status in ('in_transit','delivered')),0)`.mapWith(Number),
      gross:sql<number>`coalesce(sum(gross) filter (where kind='sale' and status in ('in_transit','delivered')),0)`.mapWith(Number),
      tax:sql<number>`coalesce(sum(tax) filter (where kind='sale' and status in ('in_transit','delivered')),0)`.mapWith(Number),
      staff:sql<number>`coalesce(sum(staff) filter (where kind='sale' and status in ('in_transit','delivered')),0)`.mapWith(Number),
      owner:sql<number>`coalesce(sum(owner_share) filter (where kind='sale' and status in ('in_transit','delivered')),0)`.mapWith(Number),
      freight:sql<number>`coalesce(sum(freight) filter (where status='delivered'),0)`.mapWith(Number),
    }).from(factoryShipments);
    return row??{sales:0,pallets:0,gross:0,tax:0,staff:0,owner:0,freight:0};
  }
}
export {DEFAULT_FACTORY_FINANCE};
