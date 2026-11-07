import {and,eq,sql} from 'drizzle-orm';
import {INVENTORY_CAPACITY,STORAGE,hasStorage,itemById,storageLoad,storageLoadOfUnits,storageStackMax,storageUnits,vehicleName,type InventoryStack,type ItemId,type StorageDirection,type StorageView} from '@bar/shared';
import type {Database} from './database/index.js';
import {inventoryLedger,itemInventory,playerVehicles,vehicleStorage} from './database/schema.js';

export class StorageError extends Error {constructor(readonly statusCode:number,message:string){super(message);}}

type Tx=Pick<Database,'select'|'insert'|'update'|'delete'>;

/**
 * The truck's cargo hold, in the same transactional style as the backpack (inventory-service.ts): the API owns the quantities, the room
 * only asks, after checking who is where. Locking the vehicle's row first serialises every move on one truck, so two people (or one
 * double click) can never overfill it; the ledger entry for the request claims the retry key, so repeating a request moves nothing twice.
 */
export class VehicleStorageService {
  constructor(private db:Database){}

  /** The vehicle, locked, if this player holds its key and it has a hold. */
  private async lock(tx:Tx,userId:string,vehicleId:string){
    const [vehicle]=await tx.select().from(playerVehicles).where(and(eq(playerVehicles.id,vehicleId),eq(playerVehicles.userId,userId))).for('update');
    if(!vehicle)throw new StorageError(404,'Você não tem a chave desse veículo.');
    if(!hasStorage(vehicle.model))throw new StorageError(400,'Este veículo não tem baú.');
    return vehicle;
  }

  private async stacks(tx:Tx,vehicleId:string):Promise<InventoryStack[]>{
    const rows=await tx.select().from(vehicleStorage).where(eq(vehicleStorage.vehicleId,vehicleId));
    return rows.filter(row=>!!itemById(row.itemId)&&row.quantity>0).map(row=>({itemId:row.itemId as ItemId,quantity:row.quantity})).sort((a,b)=>a.itemId.localeCompare(b.itemId));
  }

  private describe(vehicle:{id:string;plate:string;model:string},stacks:InventoryStack[]):StorageView {
    return {vehicleId:vehicle.id,plate:vehicle.plate,name:vehicleName(vehicle.model),stacks,capacity:STORAGE.SLOTS,usedSlots:stacks.length,units:storageUnits(stacks),load:storageLoad(stacks)};
  }

  async view(userId:string,vehicleId:string):Promise<StorageView>{
    const [vehicle]=await this.db.select().from(playerVehicles).where(and(eq(playerVehicles.id,vehicleId),eq(playerVehicles.userId,userId)));
    if(!vehicle)throw new StorageError(404,'Você não tem a chave desse veículo.');
    if(!hasStorage(vehicle.model))throw new StorageError(400,'Este veículo não tem baú.');
    return this.describe(vehicle,await this.stacks(this.db,vehicleId));
  }

  /** How full each of these vehicles' holds is (0..3), for the garage and the room's drawing. */
  async loads(vehicleIds:readonly string[]):Promise<Map<string,number>>{
    const out=new Map<string,number>();
    if(!vehicleIds.length)return out;
    const rows=await this.db.select({vehicleId:vehicleStorage.vehicleId,units:sql<number>`sum(${vehicleStorage.quantity})`.mapWith(Number)}).from(vehicleStorage)
      .where(sql`${vehicleStorage.vehicleId} in (${sql.join(vehicleIds.map(id=>sql`${id}`),sql`, `)})`).groupBy(vehicleStorage.vehicleId);
    for(const row of rows)out.set(row.vehicleId,storageLoadOfUnits(row.units));
    return out;
  }

  async move(userId:string,vehicleId:string,direction:StorageDirection,itemId:ItemId,quantity:number,requestId:string):Promise<StorageView>{
    const item=itemById(itemId);if(!item)throw new StorageError(400,'Item inválido.');
    if(!Number.isInteger(quantity)||quantity<1||quantity>STORAGE.MAX_MOVE)throw new StorageError(400,'Quantidade inválida.');
    const receipt=`storage-${direction}:${requestId}`;
    return this.db.transaction(async tx=>{
      const vehicle=await this.lock(tx,userId,vehicleId);
      // The same request again changes nothing (and reports how things are now).
      const claimed=await tx.insert(inventoryLedger).values({id:receipt,userId,itemId,quantity:direction==='deposit'?-quantity:quantity,reason:`storage-${direction}`}).onConflictDoNothing().returning({id:inventoryLedger.id});
      if(!claimed.length)return this.describe(vehicle,await this.stacks(tx,vehicleId));
      const [bag]=await tx.select().from(itemInventory).where(and(eq(itemInventory.userId,userId),eq(itemInventory.itemId,itemId))).for('update');
      const [hold]=await tx.select().from(vehicleStorage).where(and(eq(vehicleStorage.vehicleId,vehicleId),eq(vehicleStorage.itemId,itemId))).for('update');
      if(direction==='deposit'){
        if(!bag||bag.quantity<quantity)throw new StorageError(409,'Você não tem essa quantidade na mochila.');
        const next=(hold?.quantity??0)+quantity,limit=storageStackMax(itemId);
        if(next>limit)throw new StorageError(409,`O baú comporta no máximo ${limit} de ${item.name}.`);
        if(!hold){
          const [{count}={count:0}]=await tx.select({count:sql<number>`count(*)`.mapWith(Number)}).from(vehicleStorage).where(eq(vehicleStorage.vehicleId,vehicleId));
          if(count>=STORAGE.SLOTS)throw new StorageError(409,'O baú está cheio.');
        }
        if(bag.quantity===quantity)await tx.delete(itemInventory).where(and(eq(itemInventory.userId,userId),eq(itemInventory.itemId,itemId)));
        else await tx.update(itemInventory).set({quantity:bag.quantity-quantity,updatedAt:new Date()}).where(and(eq(itemInventory.userId,userId),eq(itemInventory.itemId,itemId)));
        if(hold)await tx.update(vehicleStorage).set({quantity:next,updatedAt:new Date()}).where(and(eq(vehicleStorage.vehicleId,vehicleId),eq(vehicleStorage.itemId,itemId)));
        else await tx.insert(vehicleStorage).values({vehicleId,itemId,quantity:next});
      }else{
        if(!hold||hold.quantity<quantity)throw new StorageError(409,'O baú não tem essa quantidade.');
        const next=(bag?.quantity??0)+quantity;
        if(next>item.stackMax)throw new StorageError(409,`Você só pode carregar ${item.stackMax} unidade(s) de ${item.name}.`);
        if(!bag){
          const slots=await tx.select({itemId:itemInventory.itemId}).from(itemInventory).where(eq(itemInventory.userId,userId));
          if(slots.length>=INVENTORY_CAPACITY)throw new StorageError(409,'Sua mochila está cheia.');
        }
        if(hold.quantity===quantity)await tx.delete(vehicleStorage).where(and(eq(vehicleStorage.vehicleId,vehicleId),eq(vehicleStorage.itemId,itemId)));
        else await tx.update(vehicleStorage).set({quantity:hold.quantity-quantity,updatedAt:new Date()}).where(and(eq(vehicleStorage.vehicleId,vehicleId),eq(vehicleStorage.itemId,itemId)));
        if(bag)await tx.update(itemInventory).set({quantity:next,updatedAt:new Date()}).where(and(eq(itemInventory.userId,userId),eq(itemInventory.itemId,itemId)));
        else await tx.insert(itemInventory).values({userId,itemId,quantity});
      }
      return this.describe(vehicle,await this.stacks(tx,vehicleId));
    });
  }
}
