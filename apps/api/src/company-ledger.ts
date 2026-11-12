import {randomUUID} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {COMPANY_ID,COMPANY_NAME} from '@bar/shared/factory';
import type {Database} from './database/index.js';
import {companies,companyLedger} from './database/schema.js';

export class CompanyError extends Error {constructor(readonly statusCode:number,message:string){super(message);}}
export type CompanyTx=Pick<Database,'select'|'insert'|'update'|'delete'>;

/**
 * The only way money enters or leaves the firm's wallet: the row is locked, the balance never goes below zero and every movement leaves a ledger line
 * (`entryId` makes a retry land on the same line, so it counts once). Returns the new balance.
 */
export async function postToCompany(tx:CompanyTx,amount:number,reason:string,ref:string|null,actorId:string|null,entryId?:string):Promise<number> {
  if(!Number.isSafeInteger(amount))throw new CompanyError(400,'Valor inválido.');
  await tx.insert(companies).values({id:COMPANY_ID,name:COMPANY_NAME,balance:0}).onConflictDoNothing();
  const [row]=await tx.select().from(companies).where(eq(companies.id,COMPANY_ID)).for('update');
  const current=Number(row!.balance);
  if(!amount)return current;
  const balance=current+amount;
  if(balance<0)throw new CompanyError(409,`Saldo da empresa insuficiente: faltam ${(-balance).toLocaleString('pt-BR')} moedas.`);
  const claimed=await tx.insert(companyLedger).values({id:entryId??randomUUID(),companyId:COMPANY_ID,amount,balanceAfter:balance,reason:reason.slice(0,200),ref,actorId}).onConflictDoNothing().returning({id:companyLedger.id});
  if(!claimed.length)return current;
  await tx.update(companies).set({balance,updatedAt:new Date()}).where(eq(companies.id,COMPANY_ID));
  return balance;
}
