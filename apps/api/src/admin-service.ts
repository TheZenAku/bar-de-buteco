import {randomUUID} from 'node:crypto';
import {and,asc,desc,eq,gt,ilike,inArray,isNull,or,sql,type SQL} from 'drizzle-orm';
import {alias} from 'drizzle-orm/pg-core';
import {MAX_COIN_BALANCE,type AdminPlayerFilter,type AdminPlayerSort,type PublicUser} from '@bar/shared';
import type {Database} from './database/index.js';
import {users,profiles,wallets,currencyLedger,moderationActions,reports,controls,sessions} from './database/schema.js';
import {isOwnerEmail} from './admin-policy.js';
import type {WardrobeService} from './wardrobe.js';

export type Transaction=Parameters<Parameters<Database['transaction']>[0]>[0];
export class AdminError extends Error {constructor(readonly statusCode:number,message:string){super(message);}}
export const activeBans=()=>and(eq(moderationActions.action,'ban'),isNull(moderationActions.revokedAt),or(isNull(moderationActions.expiresAt),gt(moderationActions.expiresAt,new Date())));
export interface WalletAdjustment {playerId:string;operation:'add'|'remove'|'set';amount:number;reason:string;requestId:string;expectedBalance?:number}
export interface ModerationCommand {action:'kick'|'ban'|'unban'|'unkick'|'event';playerId?:string;reason?:string;eventType?:'BLACKOUT'|'DRUNK_NPC'|'PARTY'}
const roleActions=['admin-grant','admin-revoke','undo-admin-grant','undo-admin-revoke'];
const reversalLabels:Record<string,string>={kick:'Desfazer expulsão',ban:'Desbanir',event:'Encerrar este evento','admin-grant':'Remover permissão concedida','admin-revoke':'Restaurar administrador','coins-add':'Reverter moedas adicionadas','coins-remove':'Devolver moedas removidas','coins-set':'Reverter ajuste de saldo'};

export class AdminService {
  constructor(private db:Database,private wardrobe:WardrobeService){}
  async actor(tx:Transaction,id:string){
    const [actor]=await tx.select().from(users).where(eq(users.id,id)).for('share');
    if(!actor?.verified||actor.role!=='admin')throw new AdminError(403,'Acesso exclusivo da administração.');
    return actor;
  }
  permissions(actor:Pick<PublicUser,'id'|'email'>,target:{id:string;email:string;role:string;verified:boolean;banned:boolean}){
    const owner=isOwnerEmail(target.email),primary=isOwnerEmail(actor.email);
    return {owner,canModerate:target.id!==actor.id&&!owner&&(primary||target.role!=='admin'),
      canEditWallet:primary||target.id===actor.id||target.role!=='admin',
      canChangeRole:primary&&!owner&&target.id!==actor.id&&target.verified&&(!target.banned||target.role==='admin')};
  }
  private reversalAccess(actor:Pick<PublicUser,'id'|'email'>,action:string,target?:typeof users.$inferSelect):string {
    if(!reversalLabels[action])return 'Esta ação não possui reversão automática.';
    if(action==='event')return '';
    if(!target)return 'A conta não está mais disponível.';
    const permissions=this.permissions(actor,{...target,banned:false});
    if(action.startsWith('coins-'))return permissions.canEditWallet?'':'Você não pode alterar esta carteira.';
    if(action.startsWith('admin-'))return permissions.canChangeRole?'':'Somente a conta principal pode reverter esta permissão.';
    return permissions.canModerate?'':'Esta conta está protegida contra essa ação.';
  }
  /** Administrative actions (newest first, `where` narrows them) with what each one's reversal would need. */
  async audits(actor:Pick<PublicUser,'id'|'email'>,where:SQL|undefined,limit:number){
    const auditActor=alias(profiles,'audit_actor'),auditTarget=alias(profiles,'audit_target');
    const logs=await this.db.select({id:moderationActions.id,actorId:moderationActions.actorId,userId:moderationActions.userId,actorName:auditActor.displayName,targetName:auditTarget.displayName,
      action:moderationActions.action,reason:moderationActions.reason,createdAt:moderationActions.createdAt,revokedAt:moderationActions.revokedAt}).from(moderationActions)
      .leftJoin(auditActor,eq(moderationActions.actorId,auditActor.userId)).leftJoin(auditTarget,eq(moderationActions.userId,auditTarget.userId)).where(where)
      .orderBy(desc(moderationActions.createdAt),desc(moderationActions.id)).limit(limit);
    const targetIds=[...new Set(logs.flatMap(log=>log.userId?[log.userId]:[]))];
    const [targets,roles,ledger]=await Promise.all([
      targetIds.length?this.db.select().from(users).where(inArray(users.id,targetIds)):[],
      targetIds.length?this.db.select().from(moderationActions).where(and(inArray(moderationActions.userId,targetIds),inArray(moderationActions.action,roleActions))).orderBy(desc(moderationActions.createdAt),desc(moderationActions.id)):[],
      logs.some(log=>log.action.startsWith('coins-'))?this.db.select({id:currencyLedger.id}).from(currencyLedger).where(inArray(currencyLedger.id,logs.filter(log=>log.action.startsWith('coins-')).map(log=>log.id))):[],
    ]);
    return logs.map(log=>{
      let revertReason=log.revokedAt?'Esta ação já foi desfeita.':this.reversalAccess(actor,log.action,targets.find(target=>target.id===log.userId));
      if(!revertReason&&log.action.startsWith('admin-')&&roles.find(role=>role.userId===log.userId)?.id!==log.id)revertReason='Há uma alteração de permissão mais recente.';
      if(!revertReason&&log.action.startsWith('coins-')&&!ledger.some(entry=>entry.id===log.id))revertReason='O lançamento original não está disponível.';
      return {...log,createdAt:log.createdAt.toISOString(),revokedAt:log.revokedAt?.toISOString()??null,canRevert:!revertReason,revertLabel:reversalLabels[log.action]??'Reverter',revertReason};
    });
  }
  /** Bans in force, kicks still on record and what this administrator may do, for the given accounts. */
  async accountStates(actor:Pick<PublicUser,'id'|'email'>,accounts:Array<{id:string;email:string;role:string;verified:boolean}>){
    const ids=accounts.map(a=>a.id);
    const [bans,kicks]=ids.length?await Promise.all([
      this.db.select({userId:moderationActions.userId}).from(moderationActions).where(and(activeBans(),inArray(moderationActions.userId,ids))),
      this.db.select().from(moderationActions).where(and(inArray(moderationActions.userId,ids),eq(moderationActions.action,'kick'),isNull(moderationActions.revokedAt))).orderBy(desc(moderationActions.createdAt),desc(moderationActions.id)),
    ]):[[],[]];
    const bannedIds=new Set(bans.map(b=>b.userId));
    return new Map(accounts.map(a=>{const target={...a,role:a.role==='admin'?'admin' as const:'user' as const,banned:bannedIds.has(a.id)};
      return [a.id,{role:target.role,banned:target.banned,kickId:kicks.find(k=>k.userId===a.id)?.id??null,...this.permissions(actor,target)}];}));
  }
  async overview(actor:PublicUser,query:{search:string;offset:number;limit:number;filter?:AdminPlayerFilter;sort?:AdminPlayerSort;online?:string[]}){
    const term=query.search.replace(/[\\%_]/g,'\\$&');
    const initialCoins=await this.wardrobe.pricing.get('reward:initial');
    const filters:Record<AdminPlayerFilter,SQL|undefined>={all:undefined,admins:eq(users.role,'admin'),unverified:eq(users.verified,false),
      banned:sql`exists (select 1 from ${moderationActions} where ${moderationActions.userId}=${users.id} and ${moderationActions.action}='ban' and ${moderationActions.revokedAt} is null and (${moderationActions.expiresAt} is null or ${moderationActions.expiresAt}>now()))`,
      online:query.online?.length?inArray(users.id,query.online):sql`false`};
    const filter=and(term?or(ilike(users.email,`%${term}%`),ilike(users.username,`%${term}%`),ilike(profiles.displayName,`%${term}%`)):undefined,filters[query.filter??'all']);
    const balance=sql<number>`coalesce(${wallets.balance},${initialCoins})`.mapWith(Number);
    const order=query.sort==='name'?[asc(sql`lower(${profiles.displayName})`),users.id]:query.sort==='balance'?[desc(balance),users.id]:[desc(users.createdAt),users.id];
    const reporter=alias(profiles,'reporter'),reported=alias(profiles,'reported');
    const [accounts,[count],logs,reportList]=await Promise.all([
      this.db.select({id:users.id,username:users.username,email:users.email,role:users.role,verified:users.verified,displayName:profiles.displayName,balance,createdAt:users.createdAt})
        .from(users).innerJoin(profiles,eq(users.id,profiles.userId)).leftJoin(wallets,eq(users.id,wallets.userId)).where(filter)
        .orderBy(...order).limit(query.limit).offset(query.offset),
      this.db.select({total:sql<number>`count(*)`.mapWith(Number)}).from(users).innerJoin(profiles,eq(users.id,profiles.userId)).where(filter),
      this.audits(actor,undefined,100),
      this.db.select({id:reports.id,reason:reports.reason,reporterName:reporter.displayName,targetName:reported.displayName,createdAt:reports.createdAt}).from(reports)
        .leftJoin(reporter,eq(reports.reporterId,reporter.userId)).leftJoin(reported,eq(reports.userId,reported.userId)).orderBy(desc(reports.createdAt)).limit(100),
    ]);
    const states=await this.accountStates(actor,accounts);
    return {users:accounts.map(a=>({...a,...states.get(a.id)!,createdAt:a.createdAt.toISOString()})),
      total:count.total,offset:query.offset,limit:query.limit,canManageAdmins:isOwnerEmail(actor.email),logs,reports:reportList};
  }
  async adjustWallet(actorId:string,body:WalletAdjustment){
    const [target]=await this.db.select().from(users).where(eq(users.id,body.playerId));
    if(!target)throw new AdminError(404,'Jogador não encontrado.');
    const initialCoins=await this.wardrobe.pricing.get('reward:initial');
    return this.db.transaction(async tx=>{
      const actor=await this.actor(tx,actorId);
      const [currentTarget]=await tx.select().from(users).where(eq(users.id,target.id)).for('share');
      if(!this.permissions(actor,{...currentTarget,banned:false}).canEditWallet)throw new AdminError(403,'Somente a conta principal pode alterar moedas de outro administrador.');
      const inserted=await tx.insert(wallets).values({userId:target.id,balance:initialCoins}).onConflictDoNothing().returning();
      if(inserted.length)await tx.insert(currencyLedger).values({id:`welcome:${target.id}`,userId:target.id,amount:initialCoins,reason:'welcome'});
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
        const [target]=await tx.select().from(users).where(eq(users.id,body.playerId)).for('update');
        if(!target)throw new AdminError(404,'Jogador não encontrado.');
        if(target.id===actor.id)throw new AdminError(400,'Você não pode moderar sua própria conta.');
        if(!this.permissions(actor,{...target,banned:false}).canModerate)throw new AdminError(403,'Esta conta está protegida contra essa ação de moderação.');
      }
      const id=randomUUID();
      await tx.insert(moderationActions).values({id,actorId:actor.id,userId:body.action==='event'?null:body.playerId!,action:body.action,reason:body.reason??`Evento ${body.eventType}`});
      if(body.action==='unban'||body.action==='unkick'){
        const cleared=await tx.update(moderationActions).set({revokedAt:new Date()}).where(and(eq(moderationActions.userId,body.playerId!),eq(moderationActions.action,body.action==='unban'?'ban':'kick'),isNull(moderationActions.revokedAt))).returning({id:moderationActions.id});
        if(cleared.length)await tx.delete(controls).where(inArray(controls.id,cleared.map(row=>row.id)));
      }
      if(body.action==='ban')await tx.delete(sessions).where(eq(sessions.userId,body.playerId!));
      if(body.action!=='unban'&&body.action!=='unkick')await tx.insert(controls).values({id,payload:{id,...body,issuedAt:Date.now(),playerId:body.action==='event'?undefined:body.playerId}});
      return {message:'Ação registrada e enviada ao bar.'};
    });
  }
  async revert(actorId:string,body:{actionId:string;reason:string}){
    const [entry]=await this.db.select().from(moderationActions).where(eq(moderationActions.id,body.actionId));
    if(!entry)throw new AdminError(404,'Ação não encontrada.');
    return this.db.transaction(async tx=>{
      const actor=await this.actor(tx,actorId);
      const target=entry.userId?(await tx.select().from(users).where(eq(users.id,entry.userId)).for(entry.action.startsWith('coins-')?'share':'update'))[0]:undefined;
      const denial=this.reversalAccess(actor,entry.action,target);if(denial)throw new AdminError(403,denial);
      const [original]=await tx.select().from(moderationActions).where(eq(moderationActions.id,entry.id)).for('update');
      if(original.revokedAt)return {message:'Esta ação já foi desfeita.',alreadyReverted:true};
      const id=`undo:${original.id}`;
      let detail='';
      if(original.action.startsWith('coins-')){
        const [wallet]=await tx.select().from(wallets).where(eq(wallets.userId,target!.id)).for('update');
        const [receipt]=await tx.select().from(currencyLedger).where(and(eq(currencyLedger.id,original.id),eq(currencyLedger.userId,target!.id)));
        if(!wallet||!receipt)throw new AdminError(409,'O lançamento original não está disponível.');
        const balance=wallet.balance-receipt.amount;
        if(balance<0||balance>MAX_COIN_BALANCE)throw new AdminError(409,'A reversão ultrapassa os limites do saldo atual. Ajuste a carteira antes de tentar novamente.');
        await tx.update(wallets).set({balance}).where(eq(wallets.userId,target!.id));
        await tx.insert(currencyLedger).values({id,userId:target!.id,amount:-receipt.amount,reason:JSON.stringify({type:'admin-reversal',actionId:original.id,actorId:actor.id,reason:body.reason,before:wallet.balance,after:balance})});
        detail=` · Saldo: ${wallet.balance} → ${balance}.`;
      }else if(original.action.startsWith('admin-')){
        const [latest]=await tx.select().from(moderationActions).where(and(eq(moderationActions.userId,target!.id),inArray(moderationActions.action,roleActions))).orderBy(desc(moderationActions.createdAt),desc(moderationActions.id)).limit(1);
        const expected=original.action==='admin-grant'?'admin':'player';
        if(latest?.id!==original.id||target!.role!==expected)throw new AdminError(409,'A permissão mudou depois desta ação. Atualize o painel e use a alteração mais recente.');
        const role=original.action==='admin-grant'?'player':'admin';
        if(role==='admin'){
          const [ban]=await tx.select().from(moderationActions).where(and(activeBans(),eq(moderationActions.userId,target!.id))).limit(1);
          if(!target!.verified||ban)throw new AdminError(409,'Confirme o e-mail e remova o banimento antes de restaurar a administração.');
        }
        await tx.update(users).set({role}).where(eq(users.id,target!.id));
      }else if(original.action==='event'){
        await tx.insert(controls).values({id,payload:{id,action:'event',eventType:'STOP',expectedControlId:original.id}});
      }
      await tx.delete(controls).where(eq(controls.id,original.id));
      await tx.update(moderationActions).set({revokedAt:new Date()}).where(eq(moderationActions.id,original.id));
      await tx.insert(moderationActions).values({id,actorId:actor.id,userId:original.userId,action:`undo-${original.action}`,reason:`${body.reason}${detail} · Ação original: ${original.id}`});
      return {message:'Ação desfeita e reversão registrada.',alreadyReverted:false};
    });
  }
}
