import {and,desc,eq,sql} from 'drizzle-orm';
import {INVENTORY_CAPACITY,ITEM_IDS,STARTER_ITEMS,itemById,type InventoryView,type ItemId,type PublicUser} from '@bar/shared';
import type {Database} from './database/index.js';
import {currencyLedger,inventoryLedger,itemInventory,wallets} from './database/schema.js';
import type {WardrobeService} from './wardrobe.js';

export class InventoryError extends Error {constructor(readonly statusCode:number,message:string){super(message);}}
export type InventoryReason='use'|'discard'|'faint';

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
    const [stacks,[wallet],history]=await Promise.all([
      this.db.select().from(itemInventory).where(eq(itemInventory.userId,userId)),
      this.db.select().from(wallets).where(eq(wallets.userId,userId)),
      this.db.select().from(inventoryLedger).where(eq(inventoryLedger.userId,userId)).orderBy(desc(inventoryLedger.createdAt)).limit(20),
    ]);
    const valid=stacks.filter(row=>!!itemById(row.itemId)&&row.quantity>0).map(row=>({itemId:row.itemId as ItemId,quantity:row.quantity}))
      .sort((a,b)=>ITEM_IDS.indexOf(a.itemId)-ITEM_IDS.indexOf(b.itemId));
    return {stacks:valid,capacity:INVENTORY_CAPACITY,usedSlots:valid.length,balance:wallet?.balance??0,
      history:history.filter(row=>!!itemById(row.itemId)).map(row=>({id:row.id,itemId:row.itemId as ItemId,quantity:row.quantity,reason:row.reason,createdAt:row.createdAt.toISOString()}))};
  }

  async buy(user:PublicUser,itemId:ItemId,quantity:number,requestId:string):Promise<InventoryView>{
    const item=itemById(itemId);if(!item)throw new InventoryError(400,'Item inválido.');
    if(!user.verified)throw new InventoryError(403,'Confirme seu e-mail antes de comprar.');
    await this.initialize(user.id);
    const receipt=`inventory-buy:${requestId}`,cost=item.price*quantity;
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

  async access(userId:string){const view=await this.view(userId);return {inventory:view.stacks,balance:view.balance};}
}
