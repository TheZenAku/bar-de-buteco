import {and,desc,eq,sql} from 'drizzle-orm';
import {vehicleName} from '@bar/shared';
import {INVENTORY_CAPACITY,ITEM_IDS,MOTO_NAME,STARTER_ITEMS,WEAPONS,itemById,type InventoryView,type ItemId,type PublicUser,type WeaponId} from '@bar/shared';
import type {Database} from './database/index.js';
import {currencyLedger,inventoryLedger,itemInventory,playerVehicles,wallets,weaponArsenal} from './database/schema.js';
import type {WardrobeService} from './wardrobe.js';

export class InventoryError extends Error {constructor(readonly statusCode:number,message:string){super(message);}}
export type InventoryReason='use'|'discard'|'faint';
export interface InventoryGrant {view:InventoryView;applied:boolean}

/** Persistent, transactional inventory. The API owns quantities; the room only requests mutations. */
export class InventoryService {
  constructor(private db:Database,private wardrobe:WardrobeService){}

  async initialize(userId:string):Promise<void>{
    await this.wardrobe.initialize(userId);
    await this.db.transaction(async tx=>{
      for(const [itemId,quantity] of Object.entries(STARTER_ITEMS) as Array<[ItemId,number]>){
        if(!quantity)continue;
        const granted=await tx.insert(inventoryLedger).values({id:`starter:${userId}:${itemId}`,userId,itemId,quantity,reason:'starter'}).onConflictDoNothing().returning();
        if(!granted.length)continue;
        await tx.insert(itemInventory).values({userId,itemId,quantity}).onConflictDoUpdate({target:[itemInventory.userId,itemInventory.itemId],set:{quantity:sql`${itemInventory.quantity}+${quantity}`,updatedAt:new Date()}});
      }
    });
  }

  async view(userId:string):Promise<InventoryView>{
    await this.initialize(userId);
    const [stacks,[wallet],history,vehicles]=await Promise.all([
      this.db.select().from(itemInventory).where(eq(itemInventory.userId,userId)),
      this.db.select().from(wallets).where(eq(wallets.userId,userId)),
      this.db.select().from(inventoryLedger).where(eq(inventoryLedger.userId,userId)).orderBy(desc(inventoryLedger.createdAt)).limit(20),
      this.db.select({vehicleId:playerVehicles.id,plate:playerVehicles.plate,model:playerVehicles.model}).from(playerVehicles).where(eq(playerVehicles.userId,userId)).orderBy(playerVehicles.boughtAt),
    ]);
    const valid=stacks.filter(row=>!!itemById(row.itemId)&&row.quantity>0).map(row=>({itemId:row.itemId as ItemId,quantity:row.quantity}))
      .sort((a,b)=>ITEM_IDS.indexOf(a.itemId)-ITEM_IDS.indexOf(b.itemId));
    return {stacks:valid,capacity:INVENTORY_CAPACITY,usedSlots:valid.length,balance:wallet?.balance??0,keys:vehicles.map(({model,...vehicle})=>({...vehicle,name:vehicleName(model)})),
      history:history.filter(row=>!!itemById(row.itemId)).map(row=>({id:row.id,itemId:row.itemId as ItemId,quantity:row.quantity,reason:row.reason,createdAt:row.createdAt.toISOString()}))};
  }

  async buy(user:PublicUser,itemId:ItemId,quantity:number,requestId:string):Promise<InventoryView>{
    const item=itemById(itemId);if(!item)throw new InventoryError(400,'Item inválido.');
    if(!user.verified)throw new InventoryError(403,'Confirme seu e-mail antes de comprar.');
    await this.initialize(user.id);
    // The live price (Preços in the administration), never the catalogue's default.
    const receipt=`inventory-buy:${requestId}`,cost=await this.wardrobe.pricing.get(`item:${itemId}`)*quantity;
    await this.db.transaction(async tx=>{
      // Claim the retry key first. Concurrent copies wait on the same unique row, so only one
      // transaction can change the wallet. A rejected purchase rolls this claim back as well.
      const claimed=await tx.insert(currencyLedger).values({id:receipt,userId:user.id,amount:-cost,reason:`item:${itemId}:${quantity}`}).onConflictDoNothing().returning({id:currencyLedger.id});
      if(!claimed.length)return;
      const [wallet]=await tx.select().from(wallets).where(eq(wallets.userId,user.id)).for('update');
      const [stack]=await tx.select().from(itemInventory).where(and(eq(itemInventory.userId,user.id),eq(itemInventory.itemId,itemId))).for('update');
      const next=(stack?.quantity??0)+quantity;
      if(next>item.stackMax)throw new InventoryError(409,`Você só pode carregar ${item.stackMax} unidade(s) deste item.`);
      if(!stack){const slots=await tx.select({itemId:itemInventory.itemId}).from(itemInventory).where(eq(itemInventory.userId,user.id));if(slots.length>=INVENTORY_CAPACITY)throw new InventoryError(409,'Sua mochila está cheia.');}
      if(!wallet||wallet.balance<cost)throw new InventoryError(409,'Moedas insuficientes para esta compra.');
      if(stack)await tx.update(itemInventory).set({quantity:next,updatedAt:new Date()}).where(and(eq(itemInventory.userId,user.id),eq(itemInventory.itemId,itemId)));
      else await tx.insert(itemInventory).values({userId:user.id,itemId,quantity});
      await tx.update(wallets).set({balance:wallet.balance-cost}).where(eq(wallets.userId,user.id));
      await tx.insert(inventoryLedger).values({id:receipt,userId:user.id,itemId,quantity,reason:'purchase'});
    });
    return this.view(user.id);
  }

  async remove(userId:string,itemId:ItemId,quantity:number,reason:InventoryReason,requestId:string):Promise<InventoryView>{
    const item=itemById(itemId);if(!item)throw new InventoryError(400,'Item inválido.');
    await this.initialize(userId);
    const receipt=`inventory-${reason}:${requestId}`;
    await this.db.transaction(async tx=>{
      const claimed=await tx.insert(inventoryLedger).values({id:receipt,userId,itemId,quantity:-quantity,reason}).onConflictDoNothing().returning({id:inventoryLedger.id});
      if(!claimed.length)return;
      const [stack]=await tx.select().from(itemInventory).where(and(eq(itemInventory.userId,userId),eq(itemInventory.itemId,itemId))).for('update');
      if(!stack||stack.quantity<quantity)throw new InventoryError(409,'Você não tem este item na mochila.');
      const next=stack.quantity-quantity;
      if(next)await tx.update(itemInventory).set({quantity:next,updatedAt:new Date()}).where(and(eq(itemInventory.userId,userId),eq(itemInventory.itemId,itemId)));
      else await tx.delete(itemInventory).where(and(eq(itemInventory.userId,userId),eq(itemInventory.itemId,itemId)));
    });
    return this.view(userId);
  }

  /** Adds finished factory goods without charging the player. The receipt makes world retries idempotent. */
  async grant(userId:string,itemId:ItemId,quantity:number,reason:string,requestId:string):Promise<InventoryGrant>{
    const item=itemById(itemId);if(!item)throw new InventoryError(400,'Item inválido.');
    if(!Number.isInteger(quantity)||quantity<1)throw new InventoryError(400,'Quantidade inválida.');
    await this.initialize(userId);const receipt=`inventory-${reason}:${requestId}`;let applied=false;
    await this.db.transaction(async tx=>{
      const claimed=await tx.insert(inventoryLedger).values({id:receipt,userId,itemId,quantity,reason}).onConflictDoNothing().returning({id:inventoryLedger.id});
      if(!claimed.length)return;
      const [stack]=await tx.select().from(itemInventory).where(and(eq(itemInventory.userId,userId),eq(itemInventory.itemId,itemId))).for('update');
      const next=(stack?.quantity??0)+quantity;
      if(next>item.stackMax)throw new InventoryError(409,`Você só pode carregar ${item.stackMax} unidade(s) de ${item.name} na mochila.`);
      if(!stack){const slots=await tx.select({itemId:itemInventory.itemId}).from(itemInventory).where(eq(itemInventory.userId,userId));if(slots.length>=INVENTORY_CAPACITY)throw new InventoryError(409,'Sua mochila está cheia.');}
      if(stack)await tx.update(itemInventory).set({quantity:next,updatedAt:new Date()}).where(and(eq(itemInventory.userId,userId),eq(itemInventory.itemId,itemId)));
      else await tx.insert(itemInventory).values({userId,itemId,quantity});
      applied=true;
    });
    return {view:await this.view(userId),applied};
  }

  /** Moves one finished Ribeiro firearm from the backpack into the persistent arsenal, already available on the weapon wheel. */
  async equipWeapon(userId:string,itemId:ItemId,weapon:WeaponId,requestId:string):Promise<InventoryGrant>{
    await this.initialize(userId);const receipt=`inventory-equip:${requestId}`;let applied=false;
    await this.db.transaction(async tx=>{
      // Claim first: concurrent retries wait on the same unique receipt and only one may move the physical item.
      const claimed=await tx.insert(inventoryLedger).values({id:receipt,userId,itemId,quantity:-1,reason:'equip'}).onConflictDoNothing().returning({id:inventoryLedger.id});
      if(!claimed.length){applied=true;return;}
      const [stack]=await tx.select().from(itemInventory).where(and(eq(itemInventory.userId,userId),eq(itemInventory.itemId,itemId))).for('update');
      if(!stack||stack.quantity<1)throw new InventoryError(409,'Você não tem esta arma na mochila.');
      const inserted=await tx.insert(weaponArsenal).values({userId,weaponId:weapon,equipped:true,parts:{...(WEAPONS[weapon].defaults??{})},upgrades:{},source:'ribeiro'}).onConflictDoNothing().returning({weaponId:weaponArsenal.weaponId});
      if(!inserted.length)throw new InventoryError(409,'Esta arma já está no seu arsenal.');
      const next=stack.quantity-1;
      if(next)await tx.update(itemInventory).set({quantity:next,updatedAt:new Date()}).where(and(eq(itemInventory.userId,userId),eq(itemInventory.itemId,itemId)));
      else await tx.delete(itemInventory).where(and(eq(itemInventory.userId,userId),eq(itemInventory.itemId,itemId)));
      applied=true;
    });
    return {view:await this.view(userId),applied};
  }

  async access(userId:string){const view=await this.view(userId);return {inventory:view.stacks,balance:view.balance};}
}
