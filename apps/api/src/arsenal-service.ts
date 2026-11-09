import {and,eq} from 'drizzle-orm';
import {PART_IDS,WEAPONS,WHEEL_ORDER,cleanArsenal,fitError,nextUpgrade,upgradeError,withPart,withUpgrade,type ArsenalView,type PartId,type PartSlot,type UpgradeTrack,type WeaponId} from '@bar/shared';
import type {Database} from './database/index.js';
import {currencyLedger,users,wallets,weaponAmmo,weaponArsenal,weaponParts} from './database/schema.js';
import {WalletError} from './wallet-service.js';
import type {WardrobeService} from './wardrobe.js';

/** An upgrade bought: the arsenal after it, the balance, and what it cost (0 in the test kit). */
export interface ArsenalUpgrade {view:ArsenalView;balance:number;cost:number}

/**
 * The firearms' arsenal (docs/sistemas/armas.md): the weapons each player owns with their parts and upgrades, the parts owned, the rounds per
 * calibre. The room asks for it when /armas turns on (granting the test kit first), and keeps here what the player fits and upgrades. Everything is
 * checked again with the shared rules (fitError, upgradeError) against what is stored: the room's view may be stale.
 */
export class ArsenalService {
  constructor(private db:Database,private wardrobe:WardrobeService){}

  private async user(userId:string):Promise<void> {
    const [user]=await this.db.select({id:users.id}).from(users).where(eq(users.id,userId));
    if(!user)throw new WalletError(404,'Conta não encontrada.');
  }

  /** What the player owns. `test`: the /armas kit (rounds never run out, upgrades free). */
  async load(userId:string,test=false):Promise<ArsenalView> {
    await this.user(userId);
    const [weapons,parts,ammo]=await Promise.all([
      this.db.select().from(weaponArsenal).where(eq(weaponArsenal.userId,userId)),
      this.db.select().from(weaponParts).where(eq(weaponParts.userId,userId)),
      this.db.select().from(weaponAmmo).where(eq(weaponAmmo.userId,userId)),
    ]);
    return cleanArsenal({test,infinite:test,parts:parts.map(row=>row.partId),ammo:Object.fromEntries(ammo.map(row=>[row.caliber,row.quantity])),
      weapons:weapons.map(row=>({id:row.weaponId,parts:row.parts,upgrades:row.upgrades}))});
  }

  /** The test kit (/armas): every weapon with what comes fitted and every part, added when missing; what is already there is never reset. */
  async grantTestKit(userId:string):Promise<void> {
    await this.user(userId);
    await this.db.insert(weaponArsenal).values(WHEEL_ORDER.map(id=>({userId,weaponId:id,parts:{...(WEAPONS[id].defaults??{})},upgrades:{},source:'teste'}))).onConflictDoNothing();
    await this.db.insert(weaponParts).values(PART_IDS.map(partId=>({userId,partId,source:'teste'}))).onConflictDoNothing();
  }

  /** A part fitted in a slot (or taken off: `part` null). Refused (409) when the stored arsenal does not allow it. */
  async configure(userId:string,weapon:WeaponId,slot:PartSlot,part:PartId|null):Promise<ArsenalView> {
    const view=await this.load(userId);
    const why=fitError(view,weapon,slot,part);
    if(why)throw new WalletError(409,why);
    const next=withPart(view,weapon,slot,part),item=next.weapons.find(entry=>entry.id===weapon)!;
    await this.db.update(weaponArsenal).set({parts:item.parts,updatedAt:new Date()}).where(and(eq(weaponArsenal.userId,userId),eq(weaponArsenal.weaponId,weapon)));
    return next;
  }

  /**
   * One level up on a track. Free in the test kit (`free`, the room says so); otherwise the coins leave the wallet on the ledger
   * (`weapon:<requestId>`, reason weapon:upgrade, once: a retry changes nothing and answers the same), refused (409) without enough.
   */
  async upgrade(userId:string,weapon:WeaponId,track:UpgradeTrack,{free,requestId}:{free:boolean;requestId:string}):Promise<ArsenalUpgrade> {
    await this.user(userId);
    await this.wardrobe.initialize(userId);
    const id=`weapon:${requestId}`;
    const outcome=await this.db.transaction(async tx=>{
      const [wallet]=await tx.select().from(wallets).where(eq(wallets.userId,userId)).for('update');
      if(!wallet)throw new WalletError(404,'Carteira não encontrada.');
      const [previous]=await tx.select().from(currencyLedger).where(eq(currencyLedger.id,id));
      if(previous){
        if(previous.userId!==userId)throw new WalletError(409,'Este identificador já foi usado por outra conta.');
        return {balance:wallet.balance,cost:-previous.amount};
      }
      const [row]=await tx.select().from(weaponArsenal).where(and(eq(weaponArsenal.userId,userId),eq(weaponArsenal.weaponId,weapon))).for('update');
      const view=cleanArsenal({test:free,weapons:row?[{id:row.weaponId,parts:row.parts,upgrades:row.upgrades}]:[],parts:[],ammo:{}});
      const why=upgradeError(view,weapon,track);
      if(why)throw new WalletError(409,why);
      const cost=nextUpgrade(view,weapon,track)!.cost;
      let balance=wallet.balance;
      if(cost>0){
        if(balance<cost)throw new WalletError(409,'Moedas insuficientes.');
        balance-=cost;
        await tx.insert(currencyLedger).values({id,userId,amount:-cost,reason:'weapon:upgrade'});
        await tx.update(wallets).set({balance}).where(eq(wallets.userId,userId));
      }
      const upgrades=withUpgrade(view,weapon,track).weapons[0]!.upgrades;
      await tx.update(weaponArsenal).set({upgrades,updatedAt:new Date()}).where(and(eq(weaponArsenal.userId,userId),eq(weaponArsenal.weaponId,weapon)));
      return {balance,cost};
    });
    return {view:await this.load(userId,free),...outcome};
  }
}
