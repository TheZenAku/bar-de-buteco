import {and,eq,gte,like,sql} from 'drizzle-orm';
import {JOB_DAILY_CAP,MAX_COIN_BALANCE,type WalletChange} from '@bar/shared';
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
 * debit of the same player, once.
 */
export class WalletService {
  constructor(private db:Database,private wardrobe:WardrobeService,private dailyJobCap=JOB_DAILY_CAP){}

  async change({userId,amount,reason,requestId}:WalletRequest):Promise<WalletChange>{
    if(!Number.isSafeInteger(amount)||amount===0)throw new WalletError(400,'Valor inválido.');
    await this.wardrobe.initialize(userId);
    const refund=reason.startsWith('refund:'),id=refund?`world-refund:${reason.slice(7)}`:`world:${requestId}`;
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
        applied=Math.max(0,Math.min(amount,this.dailyJobCap-Number(earned?.sum??0)));
      }else if(amount>0)throw new WalletError(403,'O mundo só paga por trabalho ou estorno.');
      if(applied<0&&wallet.balance+applied<0)throw new WalletError(409,'Moedas insuficientes.');
      const balance=Math.min(MAX_COIN_BALANCE,wallet.balance+applied);applied=balance-wallet.balance;
      // Even a payment capped to zero is recorded, so the same task is never paid on a retry the next day.
      await tx.insert(currencyLedger).values({id,userId,amount:applied,reason});
      if(applied)await tx.update(wallets).set({balance}).where(eq(wallets.userId,userId));
      return {balance,applied};
    });
  }
}
