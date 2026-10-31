import {and,eq,gte,inArray,like,sql} from 'drizzle-orm';
import {BLACKJACK_MAX_RETURN,FOOSBALL_MAX_RETURN,MAX_COIN_BALANCE,type WalletChange} from '@bar/shared';
import type {Database} from './database/index.js';
import {currencyLedger,wallets} from './database/schema.js';
import type {WardrobeService} from './wardrobe.js';

export class WalletError extends Error {constructor(readonly statusCode:number,message:string){super(message);}}
export interface WalletRequest {userId:string;amount:number;reason:string;requestId:string}

const startOfDay=(now=new Date())=>new Date(now.getFullYear(),now.getMonth(),now.getDate());

/**
 * Coins the room spends or pays: media, counter and table orders, job tasks and their refunds. Each change
 * claims its ledger row first (`world:<requestId>`), so a retried request is applied once; the balance never
 * leaves 0..MAX_COIN_BALANCE. Job pay stops at JOB_DAILY_CAP per player and day; a refund only reverses a
 * debit of the same player, once. The cap is the price table's `cap:job-daily` unless one is given.
 */
export class WalletService {
  constructor(private db:Database,private wardrobe:WardrobeService,private dailyJobCap?:number){}

  async change({userId,amount,reason,requestId}:WalletRequest):Promise<WalletChange>{
    if(!Number.isSafeInteger(amount)||amount===0)throw new WalletError(400,'Valor inválido.');
    await this.wardrobe.initialize(userId);
    const refund=reason.startsWith('refund:'),id=refund?`world-refund:${reason.slice(7)}`:`world:${requestId}`;
    const dailyJobCap=this.dailyJobCap??await this.wardrobe.pricing.get('cap:job-daily');
    return this.db.transaction(async tx=>{
      const [wallet]=await tx.select().from(wallets).where(eq(wallets.userId,userId)).for('update');
      if(!wallet)throw new WalletError(404,'Carteira não encontrada.');
      const [previous]=await tx.select().from(currencyLedger).where(eq(currencyLedger.id,id));
      if(previous){
        if(previous.userId!==userId)throw new WalletError(409,'Este identificador já foi usado por outra conta.');
        return {balance:wallet.balance,applied:previous.amount};
      }
      let applied=amount;
      if(refund){
        const [debit]=await tx.select().from(currencyLedger).where(eq(currencyLedger.id,`world:${reason.slice(7)}`));
        if(!debit||debit.userId!==userId||debit.amount>=0)throw new WalletError(409,'Não há cobrança para estornar.');
        applied=Math.min(amount,-debit.amount);
      }else if(amount>0&&reason.startsWith('job:')){
        const [earned]=await tx.select({sum:sql<number>`coalesce(sum(${currencyLedger.amount}),0)`}).from(currencyLedger)
          .where(and(eq(currencyLedger.userId,userId),like(currencyLedger.reason,'job:%'),gte(currencyLedger.createdAt,startOfDay())));
        applied=Math.max(0,Math.min(amount,dailyJobCap-Number(earned?.sum??0)));
      }else if(amount>0)throw new WalletError(403,'O mundo só paga por trabalho ou estorno.');
      if(applied<0&&wallet.balance+applied<0)throw new WalletError(409,'Moedas insuficientes.');
      const balance=Math.min(MAX_COIN_BALANCE,wallet.balance+applied);applied=balance-wallet.balance;
      // Even a payment capped to zero is recorded, so the same task is never paid on a retry the next day.
      await tx.insert(currencyLedger).values({id,userId,amount:applied,reason});
      if(applied)await tx.update(wallets).set({balance}).where(eq(wallets.userId,userId));
      return {balance,applied};
    });
  }

  /**
   * The end of a blackjack round for one player (apps/server/src/minigames/blackjack-bank.ts): pays `payout` against the
   * round's bets (`stakes`, debits blackjack:bet:<round> of this player, all of which must be on the ledger) and gives
   * back whatever the `voids` (bets the world never heard back about) really took. Once per round and player
   * (blackjack:<round>:<user>), and never more than BLACKJACK_MAX_RETURN times the stakes: no session needed, the
   * ledger is the proof, so a player who logged out is still paid.
   */
  settleBlackjack(settlement:GameSettlement):Promise<WalletChange>{return this.settleGame('blackjack',settlement);}
  /**
   * The end of a pebolim match for one player, the same way: the winners take the losers' coins, so on top of the
   * FOOSBALL_MAX_RETURN cap per player, everything a match pays never goes above everything staked in it (a round lock
   * keeps two players' settlements from both reading the same total).
   */
  settleFoosball(settlement:GameSettlement):Promise<WalletChange>{return this.settleGame('foosball',settlement);}

  private async settleGame(game:'blackjack'|'foosball',{userId,roundId,payout,stakes,voids}:GameSettlement):Promise<WalletChange>{
    const ids=[...stakes,...voids];
    if(new Set(ids).size!==ids.length)throw new WalletError(400,'Aposta repetida no acerto.');
    await this.wardrobe.initialize(userId);
    const id=`${game}:${roundId}:${userId}`,betReason=`${game}:bet:${roundId}`,payReason=`${game}:payout:${roundId}`;
    const maxReturn=game==='blackjack'?BLACKJACK_MAX_RETURN:FOOSBALL_MAX_RETURN;
    return this.db.transaction(async tx=>{
      if(game==='foosball')await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`bar-de-buteco:${game}:${roundId}`},0))`);
      const [wallet]=await tx.select().from(wallets).where(eq(wallets.userId,userId)).for('update');
      if(!wallet)throw new WalletError(404,'Carteira não encontrada.');
      const [previous]=await tx.select().from(currencyLedger).where(eq(currencyLedger.id,id));
      if(previous)return {balance:wallet.balance,applied:previous.amount};
      const rows=ids.length?await tx.select().from(currencyLedger).where(inArray(currencyLedger.id,ids.map(r=>`world:${r}`))):[];
      const bet=(requestId:string)=>rows.find(r=>r.id===`world:${requestId}`&&r.userId===userId&&r.reason===betReason&&r.amount<0);
      if(stakes.some(s=>!bet(s)))throw new WalletError(409,'Aposta não encontrada no livro-caixa.');
      const staked=stakes.reduce((sum,s)=>sum-bet(s)!.amount,0),voided=voids.reduce((sum,v)=>sum-(bet(v)?.amount??0),0);
      if(payout>staked*maxReturn)throw new WalletError(409,'Pagamento acima do que a aposta permite.');
      if(game==='foosball'&&payout>0){
        const [pool]=await tx.select({staked:sql<number>`coalesce(sum(case when ${currencyLedger.reason}=${betReason} then -${currencyLedger.amount} else 0 end),0)`,
          paid:sql<number>`coalesce(sum(case when ${currencyLedger.reason}=${payReason} then ${currencyLedger.amount} else 0 end),0)`})
          .from(currencyLedger).where(inArray(currencyLedger.reason,[betReason,payReason]));
        if(Number(pool?.paid??0)+payout>Number(pool?.staked??0))throw new WalletError(409,'Os prêmios passariam do que a partida tem em jogo.');
      }
      const balance=Math.min(MAX_COIN_BALANCE,wallet.balance+payout+voided),applied=balance-wallet.balance;
      // Recorded even at zero: the round is settled for this player and a second settlement is refused.
      await tx.insert(currencyLedger).values({id,userId,amount:applied,reason:staked?payReason:`${game}:refund:${roundId}`});
      if(applied)await tx.update(wallets).set({balance}).where(eq(wallets.userId,userId));
      return {balance,applied};
    });
  }
}
export interface GameSettlement {userId:string;roundId:string;payout:number;stakes:string[];voids:string[]}
/** @deprecated The same shape for every game: GameSettlement. */
export type BlackjackSettlement=GameSettlement;
