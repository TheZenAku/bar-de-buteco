import {and,eq,sql} from 'drizzle-orm';
import type {Database} from './database/index.js';
import {currencyLedger,fuelServices,wallets} from './database/schema.js';
import {WalletError} from './wallet-service.js';

/** Uses the existing wallet and ledger. Lock order: wallet, then service. */
export class FuelPayments {
  constructor(private db:Database){}
  async reserve(userId:string,id:string,maximum:number):Promise<{budget:number}> {
    return this.db.transaction(async tx=>{
      const [wallet]=await tx.select().from(wallets).where(eq(wallets.userId,userId)).for('update');
      if(!wallet)throw new WalletError(404,'Carteira não encontrada.');
      const [previous]=await tx.select().from(fuelServices).where(eq(fuelServices.id,id));
      if(previous){if(previous.userId!==userId||previous.settled)throw new WalletError(409,'Atendimento encerrado.');return {budget:previous.budget};}
      const [held]=await tx.select({total:sql<number>`coalesce(sum(${fuelServices.budget}),0)`}).from(fuelServices).where(and(eq(fuelServices.userId,userId),eq(fuelServices.settled,false)));
      const budget=Math.min(maximum,wallet.balance-Number(held?.total??0));
      if(budget<1)throw new WalletError(409,'Moedas insuficientes para abastecer.');
      await tx.insert(fuelServices).values({id,userId,budget});return {budget};
    });
  }
  async settle(userId:string,id:string,total:number){
    return this.db.transaction(async tx=>{
      const [wallet]=await tx.select().from(wallets).where(eq(wallets.userId,userId)).for('update');
      if(!wallet)throw new WalletError(404,'Carteira não encontrada.');
      const [service]=await tx.select().from(fuelServices).where(eq(fuelServices.id,id)).for('update');
      if(!service){
        if(total!==0)throw new WalletError(409,'Reserva não encontrada.');
        // Tombstone: a delayed reserve request must never create an orphan hold after cancellation.
        await tx.insert(fuelServices).values({id,userId,budget:1,total:0,settled:true});
        return {balance:wallet.balance,applied:0};
      }
      if(service.userId!==userId||total>service.budget)throw new WalletError(409,'Cobrança inválida.');
      if(service.settled)return {balance:wallet.balance,applied:-service.total};
      await tx.update(fuelServices).set({settled:true,total}).where(eq(fuelServices.id,id));
      const balance=wallet.balance-total;
      await tx.insert(currencyLedger).values({id:`fuel:${id}`,userId,amount:-total,reason:`fuel:${id}`});
      if(total)await tx.update(wallets).set({balance}).where(eq(wallets.userId,userId));
      return {balance,applied:-total};
    });
  }
}
