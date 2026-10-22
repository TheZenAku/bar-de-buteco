import {randomUUID} from 'node:crypto';
import {and,desc,eq,gt,ilike,inArray,isNull,or,sql} from 'drizzle-orm';
import {alias} from 'drizzle-orm/pg-core';
import {MAX_COIN_BALANCE,type PublicUser} from '@bar/shared';
import type {Database} from './database/index.js';
import {users,profiles,wallets,currencyLedger,moderationActions,reports,controls,sessions} from './database/schema.js';
import {isOwnerEmail} from './admin-policy.js';
import type {WardrobeService} from './wardrobe.js';

type Transaction=Parameters<Parameters<Database['transaction']>[0]>[0];
export class AdminError extends Error {constructor(readonly statusCode:number,message:string){super(message);}}
const activeBans=()=>and(eq(moderationActions.action,'ban'),isNull(moderationActions.revokedAt),or(isNull(moderationActions.expiresAt),gt(moderationActions.expiresAt,new Date())));
export interface WalletAdjustment {playerId:string;operation:'add'|'remove'|'set';amount:number;reason:string;requestId:string;expectedBalance?:number}
export interface ModerationCommand {action:'kick'|'ban'|'unban'|'event';playerId?:string;reason?:string;eventType?:'BLACKOUT'|'DRUNK_NPC'|'PARTY'}

export class AdminService {
  constructor(private db:Database,private wardrobe:WardrobeService){}
  private async actor(tx:Transaction,id:string){
    const [actor]=await tx.select().from(users).where(eq(users.id,id)).for('share');
    if(!actor?.verified||actor.role!=='admin')throw new AdminError(403,'Acesso exclusivo da administração.');
    return actor;
  }
  private permissions(actor:Pick<PublicUser,'id'|'email'>,target:{id:string;email:string;role:string;verified:boolean;banned:boolean}){
    const owner=isOwnerEmail(target.email),primary=isOwnerEmail(actor.email);
    return {owner,canModerate:target.id!==actor.id&&!owner&&(primary||target.role!=='admin'),
      canEditWallet:primary||target.id===actor.id||target.role!=='admin',
      canChangeRole:primary&&!owner&&target.id!==actor.id&&target.verified&&(!target.banned||target.role==='admin')};
  }
  async overview(actor:PublicUser,query:{search:string;offset:number;limit:number}){
    const term=query.search.replace(/[\\%_]/g,'\\$&');
    const filter=term?or(ilike(users.email,`%${term}%`),ilike(users.username,`%${term}%`),ilike(profiles.displayName,`%${term}%`)):undefined;
    const auditActor=alias(profiles,'audit_actor'),auditTarget=alias(profiles,'audit_target');
    const reporter=alias(profiles,'reporter'),reported=alias(profiles,'reported');
    const [accounts,[count],logs,reportList]=await Promise.all([
      this.db.select({id:users.id,username:users.username,email:users.email,role:users.role,verified:users.verified,displayName:profiles.displayName,
        balance:sql<number>`coalesce(${wallets.balance},${this.wardrobe.economy.initialCoins})`.mapWith(Number)})
        .from(users).innerJoin(profiles,eq(users.id,profiles.userId)).leftJoin(wallets,eq(users.id,wallets.userId)).where(filter)
        .orderBy(desc(users.createdAt),users.id).limit(query.limit).offset(query.offset),
      this.db.select({total:sql<number>`count(*)`.mapWith(Number)}).from(users).innerJoin(profiles,eq(users.id,profiles.userId)).where(filter),
      this.db.select({id:moderationActions.id,actorId:moderationActions.actorId,userId:moderationActions.userId,actorName:auditActor.displayName,targetName:auditTarget.displayName,
        action:moderationActions.action,reason:moderationActions.reason,createdAt:moderationActions.createdAt}).from(moderationActions)
        .leftJoin(auditActor,eq(moderationActions.actorId,auditActor.userId)).leftJoin(auditTarget,eq(moderationActions.userId,auditTarget.userId)).orderBy(desc(moderationActions.createdAt)).limit(100),
      this.db.select({id:reports.id,reason:reports.reason,reporterName:reporter.displayName,targetName:reported.displayName,createdAt:reports.createdAt}).from(reports)
        .leftJoin(reporter,eq(reports.reporterId,reporter.userId)).leftJoin(reported,eq(reports.userId,reported.userId)).orderBy(desc(reports.createdAt)).limit(100),
    ]);
    const bans=accounts.length?await this.db.select({userId:moderationActions.userId}).from(moderationActions).where(and(activeBans(),inArray(moderationActions.userId,accounts.map(a=>a.id)))):[];
    const bannedIds=new Set(bans.map(b=>b.userId));
    return {users:accounts.map(a=>{const target={...a,role:a.role==='admin'?'admin' as const:'user' as const,banned:bannedIds.has(a.id)};return {...target,...this.permissions(actor,target)};}),
      total:count.total,offset:query.offset,limit:query.limit,canManageAdmins:isOwnerEmail(actor.email),logs,reports:reportList};
  }
  async adjustWallet(actorId:string,body:WalletAdjustment){
    const [target]=await this.db.select().from(users).where(eq(users.id,body.playerId));
    if(!target)throw new AdminError(404,'Jogador não encontrado.');
    return this.db.transaction(async tx=>{
      const actor=await this.actor(tx,actorId);
      const [currentTarget]=await tx.select().from(users).where(eq(users.id,target.id)).for('share');
      if(!this.permissions(actor,{...currentTarget,banned:false}).canEditWallet)throw new AdminError(403,'Somente a conta principal pode alterar moedas de outro administrador.');
      const inserted=await tx.insert(wallets).values({userId:target.id,balance:this.wardrobe.economy.initialCoins}).onConflictDoNothing().returning();
      if(inserted.length)await tx.insert(currencyLedger).values({id:`welcome:${target.id}`,userId:target.id,amount:this.wardrobe.economy.initialCoins,reason:'welcome'});
      const [wallet]=await tx.select().from(wallets).where(eq(wallets.userId,target.id)).for('update');
      const id=`admin-wallet:${body.requestId}`;
      const [previous]=await tx.select().from(currencyLedger).where(eq(currencyLedger.id,id));
      if(previous){
        const receipt=JSON.parse(previous.reason);
        if(previous.userId!==target.id||receipt.actorId!==actor.id||receipt.operation!==body.operation||receipt.amount!==body.amount||receipt.reason!==body.reason)throw new AdminError(409,'Este identificador já foi usado para outro ajuste.');
        return {balance:wallet.balance,alreadyApplied:true,message:'Este ajuste já foi aplicado.'};
      }
      if(body.operation==='set'&&body.expectedBalance!==wallet.balance)throw new AdminError(409,'O saldo mudou desde a consulta. Atualize o jogador antes de definir o saldo.');
      const balance=body.operation==='set'?body.amount:wallet.balance+(body.operation==='add'?body.amount:-body.amount);
      if(balance<0)throw new AdminError(409,'O jogador não tem moedas suficientes para essa remoção.');
      if(balance>MAX_COIN_BALANCE)throw new AdminError(409,'O ajuste ultrapassa o limite de moedas da carteira.');
      await tx.update(wallets).set({balance}).where(eq(wallets.userId,target.id));
      await tx.insert(currencyLedger).values({id,userId:target.id,amount:balance-wallet.balance,reason:JSON.stringify({type:'admin-wallet',actorId:actor.id,operation:body.operation,amount:body.amount,reason:body.reason,before:wallet.balance,after:balance})});
      await tx.insert(moderationActions).values({id,actorId:actor.id,userId:target.id,action:`coins-${body.operation}`,reason:`${body.reason} · Saldo: ${wallet.balance} → ${balance}.`});
      return {balance,alreadyApplied:false,message:'Carteira atualizada.'};
    });
  }
  async changeRole(actorId:string,body:{playerId:string;role:'admin'|'user';reason:string}){
    return this.db.transaction(async tx=>{
      const actor=await this.actor(tx,actorId);
      if(!isOwnerEmail(actor.email))throw new AdminError(403,'Somente a conta principal pode gerenciar administradores.');
      const [target]=await tx.select().from(users).where(eq(users.id,body.playerId)).for('update');
      if(!target)throw new AdminError(404,'Jogador não encontrado.');
      if(isOwnerEmail(target.email))throw new AdminError(403,'A conta principal não pode perder a administração.');
      if(body.role==='admin'){
        if(!target.verified)throw new AdminError(409,'O jogador precisa confirmar o e-mail antes de receber administração.');
        const [ban]=await tx.select().from(moderationActions).where(and(activeBans(),eq(moderationActions.userId,target.id))).limit(1);
        if(ban)throw new AdminError(409,'Remova o banimento antes de conceder administração.');
      }
      const role=body.role==='admin'?'admin':'player';
      if(target.role!==role){
        await tx.update(users).set({role}).where(eq(users.id,target.id));
        await tx.insert(moderationActions).values({id:randomUUID(),actorId:actor.id,userId:target.id,action:body.role==='admin'?'admin-grant':'admin-revoke',reason:body.reason});
      }
      return {message:body.role==='admin'?'Administrador concedido.':'Permissão administrativa removida.'};
    });
  }
  async moderate(actorId:string,body:ModerationCommand){
    if(body.action==='event'&&!body.eventType)throw new AdminError(400,'Escolha um evento.');
    if(body.action!=='event'&&!body.reason)throw new AdminError(400,'Informe o motivo da ação.');
    return this.db.transaction(async tx=>{
      const actor=await this.actor(tx,actorId);
      if(body.action!=='event'){
        if(!body.playerId)throw new AdminError(404,'Jogador não encontrado.');
        const [target]=await tx.select().from(users).where(eq(users.id,body.playerId)).for('share');
        if(!target)throw new AdminError(404,'Jogador não encontrado.');
        if(target.id===actor.id)throw new AdminError(400,'Você não pode moderar sua própria conta.');
        if(!this.permissions(actor,{...target,banned:false}).canModerate)throw new AdminError(403,'Esta conta está protegida contra essa ação de moderação.');
      }
      const id=randomUUID();
      await tx.insert(moderationActions).values({id,actorId:actor.id,userId:body.action==='event'?null:body.playerId!,action:body.action,reason:body.reason??`Evento ${body.eventType}`});
      if(body.action==='unban')await tx.update(moderationActions).set({revokedAt:new Date()}).where(and(eq(moderationActions.userId,body.playerId!),eq(moderationActions.action,'ban'),isNull(moderationActions.revokedAt)));
      if(body.action==='ban')await tx.delete(sessions).where(eq(sessions.userId,body.playerId!));
      if(body.action!=='unban')await tx.insert(controls).values({id,payload:{id,...body,playerId:body.action==='event'?undefined:body.playerId}});
      return {message:'Ação registrada e enviada ao bar.'};
    });
  }
}
