import {and,eq,sql} from 'drizzle-orm';
import {DEFAULT_SKIN,SKINS,type Wardrobe,type PublicUser} from '@bar/shared';
import type {Database} from './database/index.js';
import {profiles,wallets,skinInventory,currencyLedger} from './database/schema.js';

export class WardrobeError extends Error {constructor(readonly statusCode:number,message:string){super(message);}}
const envInt=(name:string,fallback:number)=>{const n=Number(process.env[name]??fallback);return Number.isSafeInteger(n)&&n>=0&&n<=1_000_000?n:fallback;};
const PRICES:Partial<Record<string,number>>={leandro:750,rafael:1000,read:850,'gilmar-gordo':900};
// The default skin is free and belongs to every account without an inventory row.
const owns=(inventory:Array<{skinId:string}>,skin:string)=>skin===DEFAULT_SKIN||inventory.some(item=>item.skinId===skin);
export function economyConfig(){return {initialCoins:envInt('WALLET_INITIAL_COINS',0),dailyReward:envInt('WALLET_DAILY_COINS',0),
  prices:Object.fromEntries(SKINS.map(skin=>[skin.id,skin.id===DEFAULT_SKIN?0:envInt(`SKIN_PRICE_${skin.id.toUpperCase().replace(/-/g,'_')}`,PRICES[skin.id]??0)]))};}
export class WardrobeService {
  constructor(private db:Database,readonly economy=economyConfig()){}
  async initialize(userId:string){
    await this.db.transaction(async tx=>{
      const inserted=await tx.insert(wallets).values({userId,balance:this.economy.initialCoins}).onConflictDoNothing().returning();
      if(inserted.length)await tx.insert(currencyLedger).values({id:`welcome:${userId}`,userId,amount:this.economy.initialCoins,reason:'welcome'});
    });
  }
  async view(user:PublicUser):Promise<Wardrobe>{
    await this.initialize(user.id);
    const [[profile],[wallet],inventory,[daily]]=await Promise.all([
      this.db.select().from(profiles).where(eq(profiles.userId,user.id)),this.db.select().from(wallets).where(eq(wallets.userId,user.id)),
      this.db.select().from(skinInventory).where(eq(skinInventory.userId,user.id)),
      this.db.select().from(currencyLedger).where(eq(currencyLedger.id,this.dailyKey(user.id))),
    ]);
    return {equippedSkin:profile.equippedSkin,balance:wallet.balance,
      catalog:SKINS.map(skin=>({...skin,price:this.economy.prices[skin.id],owned:owns(inventory,skin.id)})),dailyReward:this.economy.dailyReward,dailyClaimed:!!daily};
  }
  private dailyKey(userId:string){return `daily:${userId}:${new Date().toISOString().slice(0,10)}`;}
  async claimDaily(user:PublicUser){
    if(!user.verified)throw new WardrobeError(403,'Confirme seu e-mail para receber moedas.');
    if(!this.economy.dailyReward)throw new WardrobeError(409,'O bônus diário está desativado.');
    await this.initialize(user.id);
    await this.db.transaction(async tx=>{
      await tx.select().from(wallets).where(eq(wallets.userId,user.id)).for('update');
      const inserted=await tx.insert(currencyLedger).values({id:this.dailyKey(user.id),userId:user.id,amount:this.economy.dailyReward,reason:'daily'}).onConflictDoNothing().returning();
      if(inserted.length)await tx.update(wallets).set({balance:sql`${wallets.balance}+${this.economy.dailyReward}`}).where(eq(wallets.userId,user.id));
    });
    return this.view(user);
  }
  async buy(user:PublicUser,skinId:string){
    const skin=SKINS.find(s=>s.id===skinId);if(!skin)throw new WardrobeError(400,'Skin inválida.');
    if(!user.verified)throw new WardrobeError(403,'Confirme seu e-mail antes de comprar.');
    if(skinId===DEFAULT_SKIN)return this.view(user);
    await this.initialize(user.id);
    await this.db.transaction(async tx=>{
      const [wallet]=await tx.select().from(wallets).where(eq(wallets.userId,user.id)).for('update');
      const [owned]=await tx.select().from(skinInventory).where(and(eq(skinInventory.userId,user.id),eq(skinInventory.skinId,skinId)));
      if(owned)return;
      const price=this.economy.prices[skinId];
      if(wallet.balance<price)throw new WardrobeError(409,'Moedas insuficientes para esta skin.');
      await tx.update(wallets).set({balance:wallet.balance-price}).where(eq(wallets.userId,user.id));
      await tx.insert(skinInventory).values({userId:user.id,skinId});
      await tx.insert(currencyLedger).values({id:`purchase:${user.id}:${skinId}`,userId:user.id,amount:-price,reason:`skin:${skinId}`});
    });
    return this.view(user);
  }
  async equip(user:PublicUser,skin:string){
    if(!SKINS.some(s=>s.id===skin))throw new WardrobeError(400,'Skin inválida.');
    if(skin!==DEFAULT_SKIN){
      const [owned]=await this.db.select().from(skinInventory).where(and(eq(skinInventory.userId,user.id),eq(skinInventory.skinId,skin)));
      if(!owned)throw new WardrobeError(403,'Compre esta skin na loja antes de vestir.');
    }
    await this.db.update(profiles).set({equippedSkin:skin}).where(eq(profiles.userId,user.id));
    return this.view(user);
  }
  async access(user:PublicUser){const inventory=await this.db.select().from(skinInventory).where(eq(skinInventory.userId,user.id));return {
    equippedSkin:user.equippedSkin??DEFAULT_SKIN,ownedSkins:SKINS.map(s=>s.id).filter(skin=>owns(inventory,skin))};}
}
