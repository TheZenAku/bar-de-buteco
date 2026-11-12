import argon2 from 'argon2';
import {randomUUID} from 'node:crypto';
import {and,desc,eq,ilike,inArray,sql} from 'drizzle-orm';
import {MAX_COIN_BALANCE} from '@bar/shared';
import {BAGS_PER_PALLET,COMPANY_ID,COMPANY_MONEY,COMPANY_NAME,COMPANY_PASSWORD,purchaseQuote,type CompanyApplicantView,type CompanyLedgerView,type CompanyMemberView,type CompanyOrderView,type CompanyRole,type CompanyView,type RawMaterial} from '@bar/shared/factory';
import {hashPassword} from './auth/service.js';
import type {Database} from './database/index.js';
import {cityTreasury,companies,companyLedger,companyMembers,currencyLedger,employmentShifts,employments,factoryLedger,factoryOrders,factorySettings,profiles,wallets} from './database/schema.js';
import {CompanyError,postToCompany,type CompanyTx} from './company-ledger.js';
import {FACTORY_JOB_ID,type EmploymentService} from './employment-service.js';
import type {FactoryLogistics} from './factory-logistics.js';

export {CompanyError};
const SEEDED_KEY='company-seeded';
/** What the API knows about the firm; the world adds the plant's side (stock, production orders, cleaning). */
export type CompanyCore=Pick<CompanyView,'name'|'role'|'balance'|'hasPassword'|'members'|'applicants'|'ledger'|'orders'|'totals'>;
const iso=(date:Date|null|undefined)=>date?date.toISOString():null;

/**
 * The firm behind the plant: who owns and manages it, its wallet (every sale's share lands here), what its owners do with the money (move it to
 * their own wallet, buy raw material) and who works for it. Owners protect their own transfers and purchases with a password the administration can
 * clear; managers can admit and dismiss and choose the production order, never touch the money. Every money step is one transaction that
 * locks the firm's row and leaves a ledger line, and every step carries a request id, so a retry changes nothing twice.
 */
export class CompanyService {
  private fails=new Map<string,{n:number;until:number}>();
  constructor(private db:Database,private logistics:FactoryLogistics,private employment:EmploymentService){}

  // ---- who is who ----
  /** The first owner: the account the administration chose for the firm, else the game's owner account. Done once, so the administration can later remove them. */
  async ensure():Promise<void> {
    await this.db.insert(companies).values({id:COMPANY_ID,name:COMPANY_NAME,balance:0}).onConflictDoNothing();
    const [seeded]=await this.db.select().from(factorySettings).where(eq(factorySettings.key,SEEDED_KEY));if(seeded)return;
    const finance=await this.logistics.finance(),ownerId=await this.logistics.owner(this.db,finance);if(!ownerId)return;
    await this.db.insert(companyMembers).values({companyId:COMPANY_ID,userId:ownerId,role:'owner',addedBy:'seed'}).onConflictDoNothing();
    await this.employment.hire(ownerId,`company-seed:${ownerId}`).catch(()=>undefined);
    await this.db.insert(factorySettings).values({key:SEEDED_KEY,value:{ownerId},updatedBy:'seed'}).onConflictDoNothing();
  }
  private async member(userId:string){const [row]=await this.db.select().from(companyMembers).where(and(eq(companyMembers.companyId,COMPANY_ID),eq(companyMembers.userId,userId)));return row;}
  async roleOf(userId:string):Promise<CompanyRole|null> {await this.ensure();return ((await this.member(userId))?.role as CompanyRole|undefined)??null;}
  private async require(userId:string,roles:readonly CompanyRole[]){
    await this.ensure();const row=await this.member(userId);
    if(!row||!roles.includes(row.role as CompanyRole))throw new CompanyError(403,roles.length===1&&roles[0]==='owner'?'Só os donos da empresa podem fazer isso.':'Só os donos e gerentes da empresa podem fazer isso.');
    return row;
  }
  private async names(ids:string[],db:CompanyTx=this.db):Promise<Map<string,string>> {
    const map=new Map<string,string>();
    if(ids.length)for(const row of await db.select({id:profiles.userId,name:profiles.displayName}).from(profiles).where(inArray(profiles.userId,[...new Set(ids)])))map.set(row.id,row.name);
    return map;
  }

  // ---- passwords ----
  private async checkPassword(member:{userId:string;passwordHash:string|null},password:string|undefined):Promise<void> {
    if(!member.passwordHash)return;
    const lock=this.fails.get(member.userId);
    if(lock&&lock.until>Date.now())throw new CompanyError(429,`Senha errada demais: tente de novo em ${Math.ceil((lock.until-Date.now())/1000)} s.`);
    const ok=!!password&&await argon2.verify(member.passwordHash,password).catch(()=>false);
    if(ok){this.fails.delete(member.userId);return;}
    const n=(lock&&lock.until>0&&lock.until<=Date.now()?0:lock?.n??0)+1;
    this.fails.set(member.userId,{n,until:n>=COMPANY_PASSWORD.maxAttempts?Date.now()+COMPANY_PASSWORD.lockS*1000:0});
    throw new CompanyError(403,password?'Senha da empresa incorreta.':'Digite a sua senha da empresa para confirmar.');
  }
  /** Sets, changes or removes (`password` null) the owner's own password; changing or removing needs the current one. */
  async setPassword(userId:string,password:string|null,current:string|undefined):Promise<{hasPassword:boolean}> {
    const row=await this.require(userId,['owner']);
    await this.checkPassword(row,current);
    if(password!==null&&(password.length<COMPANY_PASSWORD.min||password.length>COMPANY_PASSWORD.max))throw new CompanyError(400,`A senha precisa ter de ${COMPANY_PASSWORD.min} a ${COMPANY_PASSWORD.max} caracteres.`);
    const passwordHash=password===null?null:await hashPassword(password);
    await this.db.update(companyMembers).set({passwordHash}).where(and(eq(companyMembers.companyId,COMPANY_ID),eq(companyMembers.userId,userId)));
    return {hasPassword:passwordHash!==null};
  }

  // ---- reading ----
  private async totals():Promise<CompanyCore['totals']> {
    const summary=await this.logistics.summary();
    const [row]=await this.db.select({
      income:sql<number>`coalesce(sum(${companyLedger.amount}) filter (where ${companyLedger.amount}>0 and ${companyLedger.reason} like 'Venda%'),0)`.mapWith(Number),
      spent:sql<number>`coalesce(-sum(${companyLedger.amount}) filter (where ${companyLedger.reason} like 'Compra%' or ${companyLedger.reason} like 'Estorno do pedido%'),0)`.mapWith(Number),
    }).from(companyLedger).where(eq(companyLedger.companyId,COMPANY_ID));
    return {sales:summary.sales,gross:summary.gross,income:row?.income??0,spent:row?.spent??0};
  }
  private async orderViews():Promise<CompanyOrderView[]> {
    const rows=await this.db.select().from(factoryOrders).where(eq(factoryOrders.kind,'purchase')).orderBy(desc(factoryOrders.createdAt)).limit(30);
    const live=rows.filter(order=>order.status==='open'||order.status==='accepted'),done=rows.filter(order=>order.status!=='open'&&order.status!=='accepted').slice(0,5);
    return [...live,...done].map(order=>({id:order.id,material:order.material as RawMaterial,pallets:order.pallets,status:order.status,base:order.price,tax:order.tax,createdAt:iso(order.createdAt)!,cancellable:order.status==='open'&&!!order.paidBy}));
  }
  /** Everyone who works for the firm: owners and managers first, then employees; who is on shift now. */
  private async memberViews(forOwner:boolean):Promise<{members:CompanyMemberView[];applicants:CompanyApplicantView[]}> {
    const roles=await this.db.select().from(companyMembers).where(eq(companyMembers.companyId,COMPANY_ID));
    const hired=await this.employment.hired(),applied=await this.employment.applicants();
    const onShift=new Set((await this.db.select({id:employmentShifts.userId}).from(employmentShifts).where(and(eq(employmentShifts.jobId,FACTORY_JOB_ID),sql`${employmentShifts.endedAt} is null`))).map(row=>row.id));
    const names=await this.names([...roles.map(row=>row.userId),...hired.map(row=>row.userId),...applied.map(row=>row.userId)]);
    const hiredAt=new Map(hired.map(row=>[row.userId,iso(row.hiredAt)]));
    const role=new Map(roles.map(row=>[row.userId,row]));
    const ids=[...new Set([...roles.map(row=>row.userId),...hired.map(row=>row.userId)])];
    const rank=(id:string)=>role.get(id)?.role==='owner'?0:role.get(id)?.role==='manager'?1:2;
    const members=ids.sort((a,b)=>rank(a)-rank(b)||(names.get(a)??'').localeCompare(names.get(b)??'')).map(id=>({userId:id,name:names.get(id)??id.slice(0,8),role:(role.get(id)?.role??'employee') as CompanyMemberView['role'],onShift:onShift.has(id),since:hiredAt.get(id)??iso(role.get(id)?.createdAt),...(forOwner&&role.get(id)?.role==='owner'?{hasPassword:!!role.get(id)?.passwordHash}:{})}));
    return {members,applicants:applied.map(row=>({userId:row.userId,name:names.get(row.userId)??row.userId.slice(0,8),appliedAt:iso(row.hiredAt)!}))};
  }
  private async ledgerViews(limit:number):Promise<CompanyLedgerView[]> {
    const rows=await this.db.select().from(companyLedger).where(eq(companyLedger.companyId,COMPANY_ID)).orderBy(desc(companyLedger.createdAt)).limit(limit);
    const names=await this.names(rows.map(row=>row.actorId).filter((id):id is string=>!!id));
    return rows.map(row=>({id:row.id,amount:Number(row.amount),balanceAfter:Number(row.balanceAfter),reason:row.reason,actorName:row.actorId?names.get(row.actorId)??'':'Sistema',at:iso(row.createdAt)!}));
  }
  private async balance(db:CompanyTx=this.db):Promise<number> {const [row]=await db.select().from(companies).where(eq(companies.id,COMPANY_ID));return Number(row?.balance??0);}
  /** The firm as an owner or manager sees it. */
  async view(userId:string):Promise<CompanyCore> {
    const row=await this.require(userId,['owner','manager']);
    const [people,ledger,orders,totals,balance]=await Promise.all([this.memberViews(row.role==='owner'),this.ledgerViews(30),this.orderViews(),this.totals(),this.balance()]);
    return {name:COMPANY_NAME,role:row.role as CompanyRole,balance,hasPassword:!!row.passwordHash,...people,ledger,orders,totals};
  }

  // ---- the firm's money ----
  /** An owner moves coins from the firm's wallet to their own (needs their password when they have one). */
  async transfer(userId:string,amount:number,password:string|undefined,requestId:string):Promise<{applied:boolean;balance:number;wallet:number}> {
    const row=await this.require(userId,['owner']);
    if(!Number.isSafeInteger(amount)||amount<1||amount>COMPANY_MONEY.max)throw new CompanyError(400,'Escolha um valor inteiro de moedas.');
    await this.checkPassword(row,password);
    return this.db.transaction(async tx=>{
      const entry=`company-transfer:${requestId}`,claimed=await tx.insert(currencyLedger).values({id:entry,userId,amount,reason:'company:transfer'}).onConflictDoNothing().returning({id:currencyLedger.id});
      const [wallet]=await tx.select().from(wallets).where(eq(wallets.userId,userId)).for('update');
      if(!claimed.length)return {applied:false,balance:await this.balance(tx),wallet:wallet?.balance??0};
      if((wallet?.balance??0)+amount>MAX_COIN_BALANCE)throw new CompanyError(409,'Sua carteira não comporta esse valor: o limite de moedas seria passado.');
      const names=await this.names([userId],tx);
      const balance=await postToCompany(tx,-amount,`Transferência para ${names.get(userId)??'um dono'}`,requestId,userId,entry);
      const next=(wallet?.balance??0)+amount;
      if(wallet)await tx.update(wallets).set({balance:next}).where(eq(wallets.userId,userId));else await tx.insert(wallets).values({userId,balance:next});
      return {applied:true,balance,wallet:next};
    });
  }
  /** An owner puts coins from their own wallet into the firm's. */
  async deposit(userId:string,amount:number,requestId:string):Promise<{applied:boolean;balance:number;wallet:number}> {
    await this.require(userId,['owner']);
    if(!Number.isSafeInteger(amount)||amount<1||amount>COMPANY_MONEY.max)throw new CompanyError(400,'Escolha um valor inteiro de moedas.');
    return this.db.transaction(async tx=>{
      const entry=`company-deposit:${requestId}`,claimed=await tx.insert(currencyLedger).values({id:entry,userId,amount:-amount,reason:'company:deposit'}).onConflictDoNothing().returning({id:currencyLedger.id});
      const [wallet]=await tx.select().from(wallets).where(eq(wallets.userId,userId)).for('update');
      if(!claimed.length)return {applied:false,balance:await this.balance(tx),wallet:wallet?.balance??0};
      if(!wallet||wallet.balance<amount)throw new CompanyError(409,'Moedas insuficientes na sua carteira.');
      const names=await this.names([userId],tx);
      const balance=await postToCompany(tx,amount,`Depósito de ${names.get(userId)??'um dono'}`,requestId,userId,entry);
      await tx.update(wallets).set({balance:wallet.balance-amount}).where(eq(wallets.userId,userId));
      return {applied:true,balance,wallet:wallet.balance-amount};
    });
  }
  /**
   * An owner buys raw material for the firm: `pallets` full pallets at the table's price plus the tax on top (the tax goes to the city's vault, the price to
   * the supplier), taken from the firm's wallet; the purchase order it creates is what the drivers (or, after a while, the supplier's driver) deliver.
   */
  async purchase(input:{userId:string;material:RawMaterial;pallets:number;password?:string;requestId:string;dueAt:Date}):Promise<{order:typeof factoryOrders.$inferSelect;applied:boolean;total:number;balance:number}> {
    const row=await this.require(input.userId,['owner']);
    if(!Number.isInteger(input.pallets)||input.pallets<1)throw new CompanyError(400,'Escolha quantos paletes comprar.');
    await this.checkPassword(row,input.password);
    const finance=await this.logistics.finance(),quote=purchaseQuote(input.material,input.pallets,finance.taxPercent,input.material==='MALTE'?finance.rawMaltePrice:finance.rawMixPrice);
    return this.db.transaction(async tx=>{
      const [again]=await tx.select().from(factoryOrders).where(eq(factoryOrders.requestId,input.requestId));
      if(again)return {order:again,applied:false,total:again.price+again.tax,balance:await this.balance(tx)};
      await tx.insert(factoryLedger).values({requestId:`company-purchase:${input.requestId}`,actorId:input.userId,action:'company-purchase',resource:COMPANY_ID,delta:{material:input.material,pallets:input.pallets,...quote},result:{}}).onConflictDoNothing();
      const label=`${input.pallets} palete(s) de ${input.material}`;
      const balance=await postToCompany(tx,-quote.total,`Compra de ${label}${quote.tax?` (imposto ${quote.tax.toLocaleString('pt-BR')})`:''}`,input.requestId,input.userId,`company-purchase:${input.requestId}`);
      if(quote.tax)await this.logistics.toTreasury(tx,quote.tax,`Imposto da compra de ${label}`,input.requestId,input.userId);
      const [order]=await tx.insert(factoryOrders).values({id:randomUUID(),kind:'purchase',material:input.material,pallets:input.pallets,price:quote.base,tax:quote.tax,status:'open',dueAt:input.dueAt,paidBy:input.userId,requestId:input.requestId}).returning();
      return {order:order!,applied:true,total:quote.total,balance};
    });
  }
  /** A purchase nobody took yet is cancelled and refunded to the firm (the tax comes back from the vault as far as it has it). */
  async cancelPurchase(userId:string,orderId:string):Promise<{refunded:number;balance:number}> {
    await this.require(userId,['owner']);
    return this.db.transaction(async tx=>{
      const [order]=await tx.select().from(factoryOrders).where(eq(factoryOrders.id,orderId)).for('update');
      if(!order||order.kind!=='purchase')throw new CompanyError(404,'Pedido não encontrado.');
      if(order.status!=='open')throw new CompanyError(409,'Só um pedido ainda aberto (que nenhum motorista pegou) pode ser cancelado.');
      const refund=order.price+order.tax;
      await tx.update(factoryOrders).set({status:'cancelled',updatedAt:new Date()}).where(eq(factoryOrders.id,orderId));
      if(!order.paidBy)return {refunded:0,balance:await this.balance(tx)};
      const balance=await postToCompany(tx,refund,`Estorno do pedido de ${order.pallets} palete(s) de ${order.material}`,orderId,userId,`company-refund:${orderId}`);
      if(order.tax){
        const [vault]=await tx.select().from(cityTreasury).where(eq(cityTreasury.id,'city'));
        const back=Math.min(order.tax,Math.max(0,Number(vault?.balance??0)));
        if(back)await this.logistics.toTreasury(tx,-back,`Estorno do imposto do pedido ${orderId.slice(0,8)}`,orderId,userId);
      }
      return {refunded:refund,balance};
    });
  }

  // ---- people ----
  /** Looks up players by name to admit them (who already works or is a member is left out). */
  async search(userId:string,text:string):Promise<Array<{userId:string;name:string}>> {
    await this.require(userId,['owner','manager']);
    const query=text.trim().replace(/[%_\\]/g,'');if(query.length<2)return [];
    const rows=await this.db.select({id:profiles.userId,name:profiles.displayName}).from(profiles).where(ilike(profiles.displayName,`%${query}%`)).limit(12);
    const taken=new Set([...(await this.employment.hired()).map(row=>row.userId),...(await this.db.select().from(companyMembers).where(eq(companyMembers.companyId,COMPANY_ID))).map(row=>row.userId)]);
    return rows.filter(row=>!taken.has(row.id)&&row.id!==userId).slice(0,6).map(row=>({userId:row.id,name:row.name}));
  }
  /** Owners and managers admit a candidate (or any player) to the payroll. */
  async admit(actorId:string,targetId:string,requestId:string){
    await this.require(actorId,['owner','manager']);
    const [exists]=await this.db.select({id:profiles.userId}).from(profiles).where(eq(profiles.userId,targetId));if(!exists)throw new CompanyError(404,'Jogador não encontrado.');
    const result=await this.employment.hire(targetId,requestId);
    if(!result.employment||result.employment.status!=='hired')throw new CompanyError(409,'Não foi possível admitir agora.');
    return result;
  }
  async reject(actorId:string,targetId:string,requestId:string){await this.require(actorId,['owner','manager']);return this.employment.withdraw(targetId,requestId,'rejected');}
  /** Owners dismiss anyone but another owner; managers dismiss only plain employees. The wage stays; the cooldown does not apply (the firm decides who comes back). */
  async dismiss(actorId:string,targetId:string,requestId:string){
    const actor=await this.require(actorId,['owner','manager']),target=await this.member(targetId);
    if(targetId===actorId)throw new CompanyError(400,'Para sair da empresa, peça demissão em "Meu emprego".');
    if(target?.role==='owner')throw new CompanyError(403,'Um dono não pode ser demitido: só a administração tira um dono.');
    if(target?.role==='manager'&&actor.role!=='owner')throw new CompanyError(403,'Só um dono demite um gerente.');
    const employment=await this.employment.dismiss(targetId,requestId,0);
    if(target)await this.db.delete(companyMembers).where(and(eq(companyMembers.companyId,COMPANY_ID),eq(companyMembers.userId,targetId)));
    return {employment};
  }
  /** An owner names an employee a manager, or takes the role away. */
  async setManager(actorId:string,targetId:string,manager:boolean){
    await this.require(actorId,['owner']);
    const target=await this.member(targetId);
    if(target?.role==='owner')throw new CompanyError(400,'Esta pessoa é dona da empresa.');
    if(manager){
      const [row]=await this.db.select().from(employments).where(and(eq(employments.userId,targetId),eq(employments.status,'hired'),eq(employments.jobId,FACTORY_JOB_ID)));
      if(!row)throw new CompanyError(409,'Só um funcionário contratado pode virar gerente.');
      await this.db.insert(companyMembers).values({companyId:COMPANY_ID,userId:targetId,role:'manager',addedBy:actorId}).onConflictDoNothing();
    }else await this.db.delete(companyMembers).where(and(eq(companyMembers.companyId,COMPANY_ID),eq(companyMembers.userId,targetId),eq(companyMembers.role,'manager')));
    return {manager};
  }

  // ---- the administration ----
  async adminState(limit=40){
    await this.ensure();
    const roles=await this.db.select().from(companyMembers).where(eq(companyMembers.companyId,COMPANY_ID));
    const names=await this.names(roles.map(row=>row.userId));
    return {name:COMPANY_NAME,balance:await this.balance(),members:roles.map(row=>({userId:row.userId,name:names.get(row.userId)??row.userId.slice(0,8),role:row.role as CompanyRole,hasPassword:!!row.passwordHash,since:iso(row.createdAt)})),ledger:await this.ledgerViews(limit),totals:await this.totals()};
  }
  /** Sets someone as owner or manager (and puts them on the payroll), or takes their role away (`role` null). */
  async adminSetRole(userId:string,role:CompanyRole|null,actorId:string,requestId:string){
    await this.ensure();
    const [exists]=await this.db.select({id:profiles.userId}).from(profiles).where(eq(profiles.userId,userId));if(!exists)throw new CompanyError(404,'Jogador não encontrado.');
    if(role===null){
      const mine=await this.member(userId);
      if(mine?.role==='owner'){const owners=(await this.db.select().from(companyMembers).where(and(eq(companyMembers.companyId,COMPANY_ID),eq(companyMembers.role,'owner')))).length;if(owners<=1)throw new CompanyError(409,'A empresa precisa de pelo menos um dono: nomeie outro antes.');}
      await this.db.delete(companyMembers).where(and(eq(companyMembers.companyId,COMPANY_ID),eq(companyMembers.userId,userId)));
    }else{
      await this.employment.hire(userId,requestId).catch(()=>undefined);
      await this.db.insert(companyMembers).values({companyId:COMPANY_ID,userId,role,addedBy:actorId}).onConflictDoUpdate({target:[companyMembers.companyId,companyMembers.userId],set:{role}});
    }
    return this.adminState();
  }
  async adminClearPassword(userId:string){
    const row=await this.member(userId);if(!row)throw new CompanyError(404,'Essa pessoa não é dona nem gerente.');
    await this.db.update(companyMembers).set({passwordHash:null}).where(and(eq(companyMembers.companyId,COMPANY_ID),eq(companyMembers.userId,userId)));
    this.fails.delete(userId);return this.adminState();
  }
  /** The administration sets a password for an owner (they can then change it with it). */
  async adminSetPassword(userId:string,password:string){
    if(password.length<COMPANY_PASSWORD.min||password.length>COMPANY_PASSWORD.max)throw new CompanyError(400,`A senha precisa ter de ${COMPANY_PASSWORD.min} a ${COMPANY_PASSWORD.max} caracteres.`);
    const row=await this.member(userId);if(!row||row.role!=='owner')throw new CompanyError(404,'Essa pessoa não é dona da empresa.');
    await this.db.update(companyMembers).set({passwordHash:await hashPassword(password)}).where(and(eq(companyMembers.companyId,COMPANY_ID),eq(companyMembers.userId,userId)));
    this.fails.delete(userId);return this.adminState();
  }
  /** The administration puts into or takes out of the firm's wallet, with a reason (never below zero). */
  async adminAdjust(amount:number,reason:string,actorId:string,requestId:string){
    if(!Number.isSafeInteger(amount)||!amount)throw new CompanyError(400,'Valor inválido.');
    await this.db.transaction(async tx=>{
      const claimed=await tx.insert(factoryLedger).values({requestId:`company-adjust:${requestId}`,actorId,action:'company-adjust',resource:COMPANY_ID,delta:{amount,reason},result:{}}).onConflictDoNothing().returning({id:factoryLedger.requestId});
      if(claimed.length)await postToCompany(tx,amount,`Ajuste da administração: ${reason}`,requestId,actorId,`company-adjust:${requestId}`);
    });
    return this.adminState();
  }
}
export type {CompanyTx};
