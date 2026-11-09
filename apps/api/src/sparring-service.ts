import {eq} from 'drizzle-orm';
import {MAX_COIN_BALANCE,SPARRING,SPARRING_TIERS,nextSparringTier,sparringTier,type SparringClaim,type SparringStatus} from '@bar/shared';
import type {Database} from './database/index.js';
import {currencyLedger,sparringProgress,users,wallets} from './database/schema.js';
import {WalletError} from './wallet-service.js';
import type {WardrobeService} from './wardrobe.js';

/**
 * Zeca's ladder (docs/sistemas/zeca.md): the step each player is on, the prize of a win and the wait before the next prize. The fight itself is
 * the room's; the room asks for the prize once a fight is won, with the fight's own id so a retry pays once. Administrators have no wait.
 */
export class SparringService {
  constructor(private db:Database,private wardrobe:WardrobeService,private now:()=>number=Date.now){}

  /** The wait left (ms) for someone who last won at `lastWinAt`, whose role is `admin` or not. */
  private waitOf(lastWinAt:Date|null|undefined,unlimited:boolean):number {
    if(unlimited||!lastWinAt)return 0;
    return Math.max(0,SPARRING.cooldownMs-(this.now()-new Date(lastWinAt).getTime()));
  }

  async status(userId:string):Promise<SparringStatus> {
    const [user]=await this.db.select({role:users.role}).from(users).where(eq(users.id,userId));
    if(!user)throw new WalletError(404,'Conta não encontrada.');
    const [row]=await this.db.select().from(sparringProgress).where(eq(sparringProgress.userId,userId)),unlimited=user.role==='admin';
    return {tier:Math.min(SPARRING_TIERS.length-1,row?.tier??0),cooldownMs:this.waitOf(row?.lastWinAt,unlimited),unlimited};
  }

  /**
   * The prize of a won fight: the step's coins on the ledger (`sparring:<requestId>`, once), the ladder one step up (back to the first after the
   * hardest) and the wait started. Refused while the wait lasts (409): the fight was not worth a prize, and the room says so.
   */
  async win(userId:string,requestId:string):Promise<SparringClaim> {
    await this.wardrobe.initialize(userId);
    const id=`sparring:${requestId}`;
    return this.db.transaction(async tx=>{
      const [wallet]=await tx.select().from(wallets).where(eq(wallets.userId,userId)).for('update');
      if(!wallet)throw new WalletError(404,'Carteira não encontrada.');
      const [user]=await tx.select({role:users.role}).from(users).where(eq(users.id,userId));
      const unlimited=user?.role==='admin';
      await tx.insert(sparringProgress).values({userId}).onConflictDoNothing();
      const [row]=await tx.select().from(sparringProgress).where(eq(sparringProgress.userId,userId)).for('update');
      const [previous]=await tx.select().from(currencyLedger).where(eq(currencyLedger.id,id));
      if(previous){
        if(previous.userId!==userId)throw new WalletError(409,'Este identificador já foi usado por outra conta.');
        return {tier:row!.tier,cooldownMs:this.waitOf(row!.lastWinAt,unlimited),unlimited,prize:previous.amount,balance:wallet.balance,beaten:Math.max(0,(row!.tier+SPARRING_TIERS.length-1)%SPARRING_TIERS.length)};
      }
      const wait=this.waitOf(row!.lastWinAt,unlimited);
      if(wait>0)throw new WalletError(409,'cooldown');
      const beaten=Math.min(SPARRING_TIERS.length-1,row!.tier),prize=sparringTier(beaten).prize;
      const balance=Math.min(MAX_COIN_BALANCE,wallet.balance+prize),applied=balance-wallet.balance,at=new Date(this.now()),next=nextSparringTier(beaten);
      await tx.insert(currencyLedger).values({id,userId,amount:applied,reason:'sparring:win'});
      if(applied)await tx.update(wallets).set({balance}).where(eq(wallets.userId,userId));
      await tx.update(sparringProgress).set({tier:next,wins:row!.wins+1,lastWinAt:at,updatedAt:at}).where(eq(sparringProgress.userId,userId));
      return {tier:next,cooldownMs:unlimited?0:SPARRING.cooldownMs,unlimited,prize:applied,balance,beaten};
    });
  }
}
