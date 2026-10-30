import {randomUUID} from 'node:crypto';
import {statfs} from 'node:fs/promises';
import os from 'node:os';
import {and,desc,eq,gte,ilike,inArray,isNotNull,isNull,lt,or,sql,type Column,type SQL} from 'drizzle-orm';
import {alias} from 'drizzle-orm/pg-core';
import {ACCESS_LOG_EVENTS,DEFAULT_SKIN,INVENTORY_CAPACITY,ITEM_LOG_REASONS,LEDGER_SOURCES,SKINS,WORLD_LOG_EVENTS,adminActionLabel,itemById,ledgerText,ledgerSource,priceEntry,
  type AdminEconomy,type AdminLedgerEntry,type AdminLogCategory,type AdminLogEntry,type AdminLogPage,type AdminPlayerDetail,type AdminPlayerOperation,type AdminReport,
  type AdminServerInfo,type AdminSummary,type LedgerSource,type PublicUser} from '@bar/shared';
import type {MetricsRegistry} from '@bar/shared/metrics';
import {repositoryRoot,type Database,type DatabaseDriver} from './database/index.js';
import * as t from './database/schema.js';
import {AdminError,activeBans,type AdminService} from './admin-service.js';
import {ensureOwnerAdministrator} from './admin-policy.js';
import type {PricingService} from './pricing-service.js';

const DAY=86_400_000;
const iso=(value:Date|string|null|undefined)=>value?new Date(value).toISOString():null;
/** Local calendar day (the API's time zone), as the daily bonus and the work cap count them. */
const dayKey=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const startOfDay=(date:Date)=>new Date(date.getFullYear(),date.getMonth(),date.getDate());
const likeTerm=(term:string)=>`%${term.replace(/[\\%_]/g,'\\$&')}%`;
/** Coin movements that create or destroy coins (a Pix only moves them between wallets). */
const notTransfer=sql`${t.currencyLedger.reason} not like 'pix:%'`;
const sourceSql=sql<string>`case when ${t.currencyLedger.reason} like '{%' then 'admin' else split_part(${t.currencyLedger.reason},':',1) end`;
const DISPLAY_NAME=/^[^\u0000-\u001f\u007f<>]{2,32}$/u;
/** World and API events kept in the log; older lines are removed now and then. */
const LOG_RETENTION_DAYS=90;

export interface GameLogEvent {source:'api'|'world';event:string;userId?:string|null;details?:Record<string,unknown>;at?:number}

/**
 * The administration's console beyond accounts and wallets (admin-service.ts): the summary, a player's file and the
 * changes made to it, reports, the event log, the economy and the server's state.
 */
export class AdminConsole {
  private writes=0;
  constructor(private db:Database,private admin:AdminService,private pricing:PricingService,private server:{driver:DatabaseDriver|'injected';dataPath?:string;metrics:MetricsRegistry}){}

  /** Never fails the caller: a log line is not worth a refused login. */
  async record(events:readonly GameLogEvent[]):Promise<void>{
    if(!events.length)return;
    try{
      await this.db.insert(t.gameLogs).values(events.map(e=>({id:randomUUID(),source:e.source,event:e.event.slice(0,64),userId:e.userId??null,details:e.details??{},createdAt:e.at?new Date(e.at):new Date()})));
      this.writes+=events.length;
      if(this.writes>=500){this.writes=0;await this.db.delete(t.gameLogs).where(lt(t.gameLogs.createdAt,new Date(Date.now()-LOG_RETENTION_DAYS*DAY)));}
    }catch{/* the log is best effort */}
  }

  async summary(actor:PublicUser):Promise<AdminSummary>{
    const now=Date.now(),day=new Date(now-DAY),week=new Date(now-7*DAY);
    const [[accounts],[banned],[reportsOpen],[supply],[ledger],[week7],[logins],[actions],recent]=await Promise.all([
      this.db.select({total:sql<number>`count(*)`.mapWith(Number),new24h:sql<number>`count(*) filter (where ${t.users.createdAt}>=${day})`.mapWith(Number),
        new7d:sql<number>`count(*) filter (where ${t.users.createdAt}>=${week})`.mapWith(Number),admins:sql<number>`count(*) filter (where ${t.users.role}='admin')`.mapWith(Number),
        unverified:sql<number>`count(*) filter (where not ${t.users.verified})`.mapWith(Number)}).from(t.users),
      this.db.select({n:sql<number>`count(distinct ${t.moderationActions.userId})`.mapWith(Number)}).from(t.moderationActions).where(activeBans()),
      this.db.select({n:sql<number>`count(*)`.mapWith(Number)}).from(t.reports).where(isNull(t.reports.resolvedAt)),
      this.db.select({n:sql<number>`coalesce(sum(${t.wallets.balance}),0)`.mapWith(Number)}).from(t.wallets),
      this.db.select({created:sql<number>`coalesce(sum(greatest(${t.currencyLedger.amount},0)),0)`.mapWith(Number),destroyed:sql<number>`coalesce(sum(greatest(-${t.currencyLedger.amount},0)),0)`.mapWith(Number)})
        .from(t.currencyLedger).where(and(gte(t.currencyLedger.createdAt,day),notTransfer)),
      this.db.select({net:sql<number>`coalesce(sum(${t.currencyLedger.amount}),0)`.mapWith(Number)}).from(t.currencyLedger).where(gte(t.currencyLedger.createdAt,week)),
      this.db.select({n:sql<number>`count(*)`.mapWith(Number)}).from(t.gameLogs).where(and(eq(t.gameLogs.event,'login'),gte(t.gameLogs.createdAt,day))),
      this.db.select({n:sql<number>`count(*)`.mapWith(Number)}).from(t.moderationActions).where(gte(t.moderationActions.createdAt,day)),
      this.admin.audits(actor,undefined,6),
    ]);
    const before=supply.n-week7.net;
    return {accounts:{...accounts,banned:banned.n},reportsOpen:reportsOpen.n,
      economy:{supply:supply.n,created24h:ledger.created,destroyed24h:ledger.destroyed,supplyChange7d:before>0?(supply.n-before)/before:null},
      activity:{logins24h:logins.n,actions24h:actions.n},recent};
  }

  async player(actor:PublicUser,id:string):Promise<AdminPlayerDetail>{
    const initialCoins=await this.pricing.get('reward:initial');
    const [row]=await this.db.select({id:t.users.id,username:t.users.username,email:t.users.email,role:t.users.role,verified:t.users.verified,createdAt:t.users.createdAt,
      displayName:t.profiles.displayName,equippedSkin:t.profiles.equippedSkin,balance:sql<number>`coalesce(${t.wallets.balance},${initialCoins})`.mapWith(Number),phone:t.phoneLines.number})
      .from(t.users).innerJoin(t.profiles,eq(t.users.id,t.profiles.userId)).leftJoin(t.wallets,eq(t.users.id,t.wallets.userId)).leftJoin(t.phoneLines,eq(t.users.id,t.phoneLines.userId)).where(eq(t.users.id,id));
    if(!row)throw new AdminError(404,'Jogador não encontrado.');
    const month=new Date(Date.now()-30*DAY),reporter=alias(t.profiles,'reporter'),resolver=alias(t.profiles,'resolver');
    const [states,ledger,[flows],items,skins,[sessions],[stats],history,against,[made]]=await Promise.all([
      this.admin.accountStates(actor,[row]),
      this.db.select().from(t.currencyLedger).where(eq(t.currencyLedger.userId,id)).orderBy(desc(t.currencyLedger.createdAt),desc(t.currencyLedger.id)).limit(40),
      this.db.select({earned:sql<number>`coalesce(sum(greatest(${t.currencyLedger.amount},0)),0)`.mapWith(Number),spent:sql<number>`coalesce(sum(greatest(-${t.currencyLedger.amount},0)),0)`.mapWith(Number)})
        .from(t.currencyLedger).where(and(eq(t.currencyLedger.userId,id),gte(t.currencyLedger.createdAt,month))),
      this.db.select().from(t.itemInventory).where(eq(t.itemInventory.userId,id)),
      this.db.select().from(t.skinInventory).where(eq(t.skinInventory.userId,id)),
      this.db.select({active:sql<number>`count(*) filter (where ${t.sessions.expiresAt}>now())`.mapWith(Number),last:sql<Date|null>`max(${t.sessions.createdAt})`}).from(t.sessions).where(eq(t.sessions.userId,id)),
      this.db.select().from(t.statistics).where(eq(t.statistics.userId,id)),
      this.admin.audits(actor,eq(t.moderationActions.userId,id),50),
      this.db.select({id:t.reports.id,reason:t.reports.reason,reporterId:t.reports.reporterId,reporterName:reporter.displayName,createdAt:t.reports.createdAt,resolvedAt:t.reports.resolvedAt,resolvedByName:resolver.displayName,resolution:t.reports.resolution})
        .from(t.reports).leftJoin(reporter,eq(t.reports.reporterId,reporter.userId)).leftJoin(resolver,eq(t.reports.resolvedBy,resolver.userId)).where(eq(t.reports.userId,id)).orderBy(desc(t.reports.createdAt)).limit(30),
      this.db.select({n:sql<number>`count(*)`.mapWith(Number)}).from(t.reports).where(eq(t.reports.reporterId,id)),
    ]);
    const names=await this.names(ledger.flatMap(entry=>entry.reason.startsWith('pix:')?[entry.reason.split(':')[2]!]:[]));
    const state=states.get(id)!;
    // The last login: an active session, or the log when every session ended.
    const [lastLog]=await this.db.select({at:t.gameLogs.createdAt}).from(t.gameLogs).where(and(eq(t.gameLogs.userId,id),eq(t.gameLogs.event,'login'))).orderBy(desc(t.gameLogs.createdAt)).limit(1);
    const lastLogin=[sessions?.last,lastLog?.at].filter((d):d is Date=>!!d).map(d=>new Date(d)).sort((a,b)=>b.getTime()-a.getTime())[0];
    return {
      account:{id:row.id,username:row.username,email:row.email,displayName:row.displayName,verified:row.verified,balance:row.balance,...state,createdAt:row.createdAt.toISOString(),equippedSkin:row.equippedSkin,phone:row.phone??null},
      wallet:{balance:row.balance,earned30d:flows?.earned??0,spent30d:flows?.spent??0,ledger:ledger.map(entry=>this.ledgerEntry(entry,names))},
      inventory:items.filter(item=>item.quantity>0).map(item=>({itemId:item.itemId,quantity:item.quantity})),
      skins:SKINS.map(skin=>{const owned=skins.find(s=>s.skinId===skin.id);return {id:skin.id,name:skin.name,owned:skin.id===DEFAULT_SKIN||!!owned,acquiredAt:iso(owned?.acquiredAt)};}),
      sessions:{active:sessions?.active??0,lastLoginAt:iso(lastLogin)},
      stats:{gamesPlayed:stats?.gamesPlayed??0,wins:stats?.blackjackWins??0,losses:stats?.blackjackLosses??0,draws:stats?.blackjackDraws??0},
      history,
      reports:{against:against.map(r=>({id:r.id,reason:r.reason,reporterId:r.reporterId,reporterName:r.reporterName,targetName:row.displayName,targetId:id,createdAt:r.createdAt.toISOString(),
        resolvedAt:iso(r.resolvedAt),resolvedByName:r.resolvedByName,resolution:r.resolution})),made:made?.n??0},
    };
  }

  /** Renames, confirms the e-mail, ends sessions, gives or takes items and skins. Each change is recorded with its reason. */
  async changePlayer(actorId:string,playerId:string,operation:AdminPlayerOperation,reason:string){
    const result=await this.db.transaction(async tx=>{
      const actor=await this.admin.actor(tx,actorId);
      const [target]=await tx.select().from(t.users).where(eq(t.users.id,playerId)).for('update');
      if(!target)throw new AdminError(404,'Jogador não encontrado.');
      const permissions=this.admin.permissions(actor,{...target,banned:false}),self=target.id===actor.id;
      const record=(action:string,detail:string)=>tx.insert(t.moderationActions).values({id:randomUUID(),actorId:actor.id,userId:target.id,action,reason:`${reason}${detail?` · ${detail}`:''}`});
      // Items and skins follow the wallet's rule; account changes follow moderation's (the main account is protected).
      const requireWallet=()=>{if(!permissions.canEditWallet)throw new AdminError(403,'Somente a conta principal pode alterar a conta de outro administrador.');};
      const requireModeration=()=>{if(!self&&!permissions.canModerate)throw new AdminError(403,'Esta conta está protegida contra essa alteração.');};
      const sync=()=>tx.insert(t.controls).values({id:randomUUID(),payload:{action:'sync',playerId:target.id,issuedAt:Date.now()}}).then(()=>undefined);
      switch(operation.op){
        case 'rename':{
          requireModeration();
          const name=operation.displayName.trim();
          if(!DISPLAY_NAME.test(name))throw new AdminError(400,'Use de 2 a 32 caracteres, sem < ou >.');
          const [profile]=await tx.select().from(t.profiles).where(eq(t.profiles.userId,target.id));
          if(profile.displayName===name)return {message:'O nome já é este.'};
          await tx.update(t.profiles).set({displayName:name}).where(eq(t.profiles.userId,target.id));
          await record('player-rename',`Nome: ${profile.displayName} → ${name}.`);
          return {message:'Nome alterado. Vale a partir da próxima entrada no bar.'};
        }
        case 'verify':{
          requireModeration();
          if(target.verified)throw new AdminError(409,'O e-mail desta conta já está confirmado.');
          await tx.update(t.users).set({verified:true}).where(eq(t.users.id,target.id));
          await tx.delete(t.emailVerifications).where(eq(t.emailVerifications.userId,target.id));
          await record('player-verify','');
          return {message:'E-mail confirmado. A conta já pode entrar no bar.',owner:true};
        }
        case 'logout':{
          if(self)throw new AdminError(400,'Para encerrar a sua própria sessão, use Sair.');
          requireModeration();
          const ended=await tx.delete(t.sessions).where(eq(t.sessions.userId,target.id)).returning({id:t.sessions.id});
          await record('player-logout',`${ended.length} sessão(ões) encerrada(s).`);
          return {message:ended.length?'Sessões encerradas. Se estiver no bar, o jogador sai em alguns segundos.':'Esta conta não tinha sessões abertas.'};
        }
        case 'item':{
          requireWallet();
          const item=itemById(operation.itemId);if(!item)throw new AdminError(400,'Item inválido.');
          const quantity=operation.quantity;
          if(!Number.isSafeInteger(quantity)||quantity===0||Math.abs(quantity)>item.stackMax)throw new AdminError(400,`Informe de 1 a ${item.stackMax} unidade(s).`);
          const [stack]=await tx.select().from(t.itemInventory).where(and(eq(t.itemInventory.userId,target.id),eq(t.itemInventory.itemId,item.id))).for('update');
          const before=stack?.quantity??0,after=before+quantity;
          if(after<0)throw new AdminError(409,`O jogador tem só ${before} unidade(s) de ${item.name}.`);
          if(after>item.stackMax)throw new AdminError(409,`A mochila comporta até ${item.stackMax} unidade(s) de ${item.name}; o jogador já tem ${before}.`);
          if(!stack){const slots=await tx.select({itemId:t.itemInventory.itemId}).from(t.itemInventory).where(eq(t.itemInventory.userId,target.id));if(slots.length>=INVENTORY_CAPACITY)throw new AdminError(409,'A mochila do jogador está cheia.');}
          if(after===0)await tx.delete(t.itemInventory).where(and(eq(t.itemInventory.userId,target.id),eq(t.itemInventory.itemId,item.id)));
          else if(stack)await tx.update(t.itemInventory).set({quantity:after,updatedAt:new Date()}).where(and(eq(t.itemInventory.userId,target.id),eq(t.itemInventory.itemId,item.id)));
          else await tx.insert(t.itemInventory).values({userId:target.id,itemId:item.id,quantity:after});
          await tx.insert(t.inventoryLedger).values({id:`admin-item:${randomUUID()}`,userId:target.id,itemId:item.id,quantity,reason:'admin'});
          await record(quantity>0?'items-add':'items-remove',`${Math.abs(quantity)}× ${item.name} (${before} → ${after}).`);
          await sync();
          return {message:quantity>0?'Itens entregues na mochila.':'Itens retirados da mochila.'};
        }
        case 'skin':{
          requireWallet();
          const skin=SKINS.find(s=>s.id===operation.skinId);if(!skin)throw new AdminError(400,'Skin inválida.');
          if(skin.id===DEFAULT_SKIN)throw new AdminError(400,`${skin.name} é gratuito e pertence a todas as contas.`);
          if(operation.grant){
            const inserted=await tx.insert(t.skinInventory).values({userId:target.id,skinId:skin.id}).onConflictDoNothing().returning();
            if(!inserted.length)throw new AdminError(409,`O jogador já tem a skin ${skin.name}.`);
            await record('skin-grant',skin.name);
          }else{
            const removed=await tx.delete(t.skinInventory).where(and(eq(t.skinInventory.userId,target.id),eq(t.skinInventory.skinId,skin.id))).returning();
            if(!removed.length)throw new AdminError(409,`O jogador não tem a skin ${skin.name}.`);
            await tx.update(t.profiles).set({equippedSkin:DEFAULT_SKIN}).where(and(eq(t.profiles.userId,target.id),eq(t.profiles.equippedSkin,skin.id)));
            await record('skin-revoke',skin.name);
          }
          await sync();
          return {message:operation.grant?`Skin ${skin.name} adicionada à coleção.`:`Skin ${skin.name} retirada da coleção.`};
        }
      }
    });
    if('owner' in result)await ensureOwnerAdministrator(this.db);
    return {message:result.message};
  }

  async reports(status:'open'|'resolved'|'all'):Promise<AdminReport[]>{
    const reporter=alias(t.profiles,'reporter'),reported=alias(t.profiles,'reported'),resolver=alias(t.profiles,'resolver');
    const rows=await this.db.select({id:t.reports.id,reason:t.reports.reason,reporterId:t.reports.reporterId,reporterName:reporter.displayName,targetId:t.reports.userId,targetName:reported.displayName,
      createdAt:t.reports.createdAt,resolvedAt:t.reports.resolvedAt,resolvedByName:resolver.displayName,resolution:t.reports.resolution}).from(t.reports)
      .leftJoin(reporter,eq(t.reports.reporterId,reporter.userId)).leftJoin(reported,eq(t.reports.userId,reported.userId)).leftJoin(resolver,eq(t.reports.resolvedBy,resolver.userId))
      .where(status==='open'?isNull(t.reports.resolvedAt):status==='resolved'?isNotNull(t.reports.resolvedAt):undefined).orderBy(desc(t.reports.createdAt)).limit(200);
    return rows.map(r=>({...r,createdAt:r.createdAt.toISOString(),resolvedAt:iso(r.resolvedAt)}));
  }
  async resolveReport(actorId:string,reportId:string,resolution:string|null){
    return this.db.transaction(async tx=>{
      const actor=await this.admin.actor(tx,actorId);
      const [report]=await tx.select().from(t.reports).where(eq(t.reports.id,reportId)).for('update');
      if(!report)throw new AdminError(404,'Denúncia não encontrada.');
      const reopen=resolution===null;
      if(reopen===!report.resolvedAt)throw new AdminError(409,reopen?'Esta denúncia já está aberta.':'Esta denúncia já foi resolvida.');
      await tx.update(t.reports).set(reopen?{resolvedAt:null,resolvedBy:null,resolution:null}:{resolvedAt:new Date(),resolvedBy:actor.id,resolution}).where(eq(t.reports.id,report.id));
      await tx.insert(t.moderationActions).values({id:randomUUID(),actorId:actor.id,userId:report.userId,action:reopen?'report-reopen':'report-resolve',reason:reopen?'Denúncia reaberta para nova análise.':resolution!});
      return {message:reopen?'Denúncia reaberta.':'Denúncia marcada como resolvida.'};
    });
  }

  /**
   * One timeline from every record: administrative actions, coins, items, accesses, reports and the world's events.
   * Each source answers its newest `limit + 1` rows before the cursor; the merge keeps the newest `limit`.
   */
  async logs(query:{categories:readonly AdminLogCategory[];playerId?:string;q?:string;since?:Date;before?:Date;limit:number}):Promise<AdminLogPage>{
    const {categories,limit}=query,want=new Set(categories),take=limit+1;
    const window=(column:Column)=>and(query.before?lt(column,query.before):undefined,query.since?gte(column,query.since):undefined);
    // A text search matches people (name, username, e-mail) and the text of each record.
    const term=query.q?.trim()?likeTerm(query.q.trim()):undefined;
    const people=term?(await this.db.select({id:t.users.id}).from(t.users).innerJoin(t.profiles,eq(t.users.id,t.profiles.userId))
      .where(or(ilike(t.profiles.displayName,term),ilike(t.users.username,term),ilike(t.users.email,term))).limit(200)).map(r=>r.id):[];
    const person=(column:Column,text?:Column|SQL)=>and(query.playerId?eq(column,query.playerId):undefined,
      term?or(people.length?inArray(column,people):sql`false`,text?ilike(text,term):sql`false`):undefined);
    const name=alias(t.profiles,'log_name'),actorName=alias(t.profiles,'log_actor');
    const jobs:Array<Promise<AdminLogEntry[]>>=[];
    if(want.has('admin'))jobs.push(this.db.select({id:t.moderationActions.id,at:t.moderationActions.createdAt,action:t.moderationActions.action,reason:t.moderationActions.reason,
      playerId:t.moderationActions.userId,playerName:name.displayName,actorName:actorName.displayName}).from(t.moderationActions)
      .leftJoin(name,eq(t.moderationActions.userId,name.userId)).leftJoin(actorName,eq(t.moderationActions.actorId,actorName.userId))
      .where(and(window(t.moderationActions.createdAt),query.playerId?or(eq(t.moderationActions.userId,query.playerId),eq(t.moderationActions.actorId,query.playerId)):undefined,
        term?or(people.length?or(inArray(t.moderationActions.userId,people),inArray(t.moderationActions.actorId,people)):sql`false`,ilike(t.moderationActions.reason,term)):undefined))
      .orderBy(desc(t.moderationActions.createdAt)).limit(take)
      .then(rows=>rows.map(r=>({id:`admin:${r.id}`,at:r.at.toISOString(),category:'admin' as const,kind:r.action,title:adminActionLabel(r.action),detail:r.reason,amount:null,playerId:r.playerId,playerName:r.playerName,actorName:r.actorName}))));
    if(want.has('moedas'))jobs.push(this.db.select({id:t.currencyLedger.id,at:t.currencyLedger.createdAt,amount:t.currencyLedger.amount,reason:t.currencyLedger.reason,playerId:t.currencyLedger.userId,playerName:name.displayName})
      .from(t.currencyLedger).leftJoin(name,eq(t.currencyLedger.userId,name.userId))
      .where(and(window(t.currencyLedger.createdAt),person(t.currencyLedger.userId,t.currencyLedger.reason),sql`${t.currencyLedger.amount}<>0`)).orderBy(desc(t.currencyLedger.createdAt)).limit(take)
      .then(async rows=>{const names=await this.names(rows.flatMap(r=>r.reason.startsWith('pix:')?[r.reason.split(':')[2]!]:[]));
        return rows.map(r=>{const source=ledgerSource(r.reason);return {id:`moedas:${r.id}`,at:r.at.toISOString(),category:'moedas' as const,kind:source,title:LEDGER_SOURCES[source],detail:ledgerText(r.reason,names),amount:r.amount,playerId:r.playerId,playerName:r.playerName,actorName:null};});}));
    if(want.has('itens'))jobs.push(this.db.select({id:t.inventoryLedger.id,at:t.inventoryLedger.createdAt,itemId:t.inventoryLedger.itemId,quantity:t.inventoryLedger.quantity,reason:t.inventoryLedger.reason,playerId:t.inventoryLedger.userId,playerName:name.displayName})
      .from(t.inventoryLedger).leftJoin(name,eq(t.inventoryLedger.userId,name.userId))
      .where(and(window(t.inventoryLedger.createdAt),person(t.inventoryLedger.userId,t.inventoryLedger.itemId))).orderBy(desc(t.inventoryLedger.createdAt)).limit(take)
      .then(rows=>rows.map(r=>({id:`itens:${r.id}`,at:r.at.toISOString(),category:'itens' as const,kind:r.reason,title:itemById(r.itemId)?.name??r.itemId,detail:ITEM_LOG_REASONS[r.reason]??r.reason,amount:r.quantity,playerId:r.playerId,playerName:r.playerName,actorName:null}))));
    if(want.has('acessos')){
      jobs.push(this.db.select({id:t.users.id,at:t.users.createdAt,playerName:name.displayName}).from(t.users).leftJoin(name,eq(t.users.id,name.userId))
        .where(and(window(t.users.createdAt),person(t.users.id))).orderBy(desc(t.users.createdAt)).limit(take)
        .then(rows=>rows.map(r=>({id:`conta:${r.id}`,at:r.at.toISOString(),category:'acessos' as const,kind:'register',title:ACCESS_LOG_EVENTS.register!,detail:'',amount:null,playerId:r.id,playerName:r.playerName,actorName:null}))));
      jobs.push(this.gameLogEntries('api',window(t.gameLogs.createdAt),person(t.gameLogs.userId,t.gameLogs.event),take));
    }
    if(want.has('mundo'))jobs.push(this.gameLogEntries('world',window(t.gameLogs.createdAt),person(t.gameLogs.userId,sql`${t.gameLogs.details}::text`),take));
    if(want.has('denuncias')){
      const reporter=alias(t.profiles,'log_reporter');
      jobs.push(this.db.select({id:t.reports.id,at:t.reports.createdAt,reason:t.reports.reason,playerId:t.reports.userId,playerName:name.displayName,reporterName:reporter.displayName,resolvedAt:t.reports.resolvedAt})
        .from(t.reports).leftJoin(name,eq(t.reports.userId,name.userId)).leftJoin(reporter,eq(t.reports.reporterId,reporter.userId))
        .where(and(window(t.reports.createdAt),query.playerId?or(eq(t.reports.userId,query.playerId),eq(t.reports.reporterId,query.playerId)):undefined,
          term?or(people.length?or(inArray(t.reports.userId,people),inArray(t.reports.reporterId,people)):sql`false`,ilike(t.reports.reason,term)):undefined)).orderBy(desc(t.reports.createdAt)).limit(take)
        .then(rows=>rows.map(r=>({id:`denuncia:${r.id}`,at:r.at.toISOString(),category:'denuncias' as const,kind:r.resolvedAt?'resolved':'open',title:r.resolvedAt?'Denúncia (resolvida)':'Denúncia',detail:r.reason,amount:null,playerId:r.playerId,playerName:r.playerName,actorName:r.reporterName}))));
    }
    const merged=(await Promise.all(jobs)).flat().sort((a,b)=>b.at.localeCompare(a.at)||b.id.localeCompare(a.id));
    const entries=merged.slice(0,limit);
    return {entries,next:merged.length>limit?entries[entries.length-1]!.at:null};
  }
  private async gameLogEntries(source:'api'|'world',window:SQL|undefined,person:SQL|undefined,take:number):Promise<AdminLogEntry[]>{
    const name=alias(t.profiles,'log_name');
    const rows=await this.db.select({id:t.gameLogs.id,at:t.gameLogs.createdAt,event:t.gameLogs.event,details:t.gameLogs.details,playerId:t.gameLogs.userId,playerName:name.displayName})
      .from(t.gameLogs).leftJoin(name,eq(t.gameLogs.userId,name.userId)).where(and(eq(t.gameLogs.source,source),window,person)).orderBy(desc(t.gameLogs.createdAt)).limit(take);
    return rows.map(r=>{
      const details=(r.details??{}) as Record<string,unknown>;
      const text=source==='api'?{title:ACCESS_LOG_EVENTS[r.event]??r.event,detail:''}:WORLD_LOG_EVENTS[r.event]?.(details)??{title:r.event,detail:''};
      return {id:`${source}:${r.id}`,at:r.at.toISOString(),category:source==='api'?'acessos' as const:'mundo' as const,kind:r.event,title:text.title,detail:text.detail,
        amount:'amount' in text&&typeof text.amount==='number'?text.amount:null,playerId:r.playerId,playerName:r.playerName,actorName:null};
    });
  }

  async economy(days:number):Promise<AdminEconomy>{
    const now=new Date(),since=startOfDay(new Date(now.getTime()-(days-1)*DAY));
    const [balances,hourly,purchases,prices,[changes],[active]]=await Promise.all([
      this.db.select({id:t.wallets.userId,balance:t.wallets.balance,name:t.profiles.displayName}).from(t.wallets).leftJoin(t.profiles,eq(t.wallets.userId,t.profiles.userId)).orderBy(desc(t.wallets.balance)),
      this.db.select({hour:sql<string>`date_trunc('hour',${t.currencyLedger.createdAt})`,source:sourceSql,net:sql<number>`sum(${t.currencyLedger.amount})`.mapWith(Number),
        created:sql<number>`sum(greatest(${t.currencyLedger.amount},0))`.mapWith(Number),destroyed:sql<number>`sum(greatest(-${t.currencyLedger.amount},0))`.mapWith(Number),count:sql<number>`count(*)`.mapWith(Number)})
        .from(t.currencyLedger).where(gte(t.currencyLedger.createdAt,since)).groupBy(sql`1`,sql`2`),
      this.db.select({reason:t.currencyLedger.reason,n:sql<number>`count(*)`.mapWith(Number)}).from(t.currencyLedger)
        .where(and(gte(t.currencyLedger.createdAt,since),sql`${t.currencyLedger.amount}<0`,notTransfer)).groupBy(t.currencyLedger.reason),
      this.pricing.table(),
      this.db.select({n:sql<number>`count(*)`.mapWith(Number)}).from(t.moderationActions).where(and(eq(t.moderationActions.action,'price-set'),gte(t.moderationActions.createdAt,since))),
      this.db.select({n:sql<number>`count(distinct ${t.currencyLedger.userId})`.mapWith(Number)}).from(t.currencyLedger).where(and(gte(t.currencyLedger.createdAt,since),notTransfer)),
    ]);
    // Supply: every wallet now. Each earlier day's closing supply subtracts what moved after it.
    const total=balances.reduce((sum,w)=>sum+w.balance,0),sorted=balances.map(w=>w.balance).sort((a,b)=>a-b);
    const holders=sorted.filter(b=>b>0),median=sorted.length?(sorted.length%2?sorted[(sorted.length-1)/2]!:(sorted[sorted.length/2-1]!+sorted[sorted.length/2]!)/2):0;
    const topCount=Math.max(1,Math.ceil(holders.length*.1)),top10=holders.slice(-topCount).reduce((s,b)=>s+b,0);
    // Gini over every wallet (0: everyone has the same; 1: one wallet has everything).
    const gini=total>0&&sorted.length>1?sorted.reduce((sum,b,i)=>sum+(2*(i+1)-sorted.length-1)*b,0)/(sorted.length*total):0;
    const keys:string[]=[];for(let d=new Date(since);d<=now;d=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1))keys.push(dayKey(d));
    const perDay=new Map(keys.map(k=>[k,{net:0,created:0,destroyed:0}])),perSource=new Map<LedgerSource,{created:number;destroyed:number;count:number}>();
    for(const row of hourly){
      const bucket=perDay.get(dayKey(new Date(row.hour)));if(!bucket)continue;
      const source=row.source==='admin'?'admin':ledgerSource(`${row.source}:`);
      bucket.net+=row.net;
      if(source!=='pix'){bucket.created+=row.created;bucket.destroyed+=row.destroyed;}
      const s=perSource.get(source)??{created:0,destroyed:0,count:0};s.created+=row.created;s.destroyed+=row.destroyed;s.count+=row.count;perSource.set(source,s);
    }
    let closing=total;const series:AdminEconomy['series']=[];
    for(const key of [...keys].reverse()){const d=perDay.get(key)!;series.unshift({day:key,supply:closing,created:d.created,destroyed:d.destroyed});closing-=d.net;}
    const opening=closing,created=series.reduce((s,d)=>s+d.created,0),destroyed=series.reduce((s,d)=>s+d.destroyed,0);
    const averageSupply=series.reduce((s,d)=>s+d.supply,0)/Math.max(1,series.length);
    // Price index: what this period's purchases would cost at today's prices against the defaults (100 = defaults).
    const basket=new Map<string,number>();
    for(const {reason,n} of purchases){
      const [kind,a,b]=reason.split(':');
      const add=(key:string,q:number)=>{if(priceEntry(key))basket.set(key,(basket.get(key)??0)+q);};
      if(kind==='item')add(`item:${a}`,n*Number(b??1));else if(kind==='counter')add(`item:${a}`,n);else if(kind==='table')for(const id of (a??'').split('-'))add(`item:${id}`,n);
      else if(kind==='skin')add(`skin:${a}`,n);else if(kind==='media')add(a==='telao'?'media:telao':a==='jukebox'?'media:jukebox':'media:tv',n);else if(kind==='stage')add('stage:pass',n);
    }
    if(!basket.size)for(const key of Object.keys(prices))if(/^(item|media|stage|skin):/.test(key))basket.set(key,1);
    let atNow=0,atDefault=0;for(const [key,q] of basket){atNow+=q*(prices[key]??0);atDefault+=q*(this.pricing.defaults[key]??0);}
    const beer=prices['item:copo']??1;
    return {generatedAt:now.toISOString(),days,
      supply:{total,wallets:sorted.length,holders:holders.length,average:sorted.length?total/sorted.length:0,median,top10Share:total?top10/total:0,gini},
      inflation:{periodChange:opening>0?(total-opening)/opening:null,dailyRate:opening>0&&total>0?Math.pow(total/opening,1/days)-1:null,created,destroyed,
        priceIndex:atDefault?atNow/atDefault*100:100,priceChanges:changes?.n??0},
      series,
      sources:[...perSource].map(([source,s])=>({source,...s})).sort((a,b)=>(b.created+b.destroyed)-(a.created+a.destroyed)),
      topHolders:balances.slice(0,10).filter(w=>w.balance>0).map(w=>({id:w.id,name:w.name??w.id.slice(0,8),balance:w.balance})),
      velocity:averageSupply>0?destroyed/averageSupply:null,activePlayers:active?.n??0,
      purchasingPower:{item:itemById('copo')?.name??'Copo de chopp',quantity:beer>0?Math.floor(median/beer):0},
    };
  }

  async serverInfo():Promise<AdminServerInfo>{
    const memory=process.memoryUsage(),cpus=os.cpus(),metrics=this.server.metrics;
    const disk=await statfs(this.server.dataPath&&!this.server.dataPath.includes('://')?this.server.dataPath:repositoryRoot).then(s=>({path:this.server.dataPath??repositoryRoot,total:s.blocks*s.bsize,free:s.bavail*s.bsize})).catch(()=>null);
    const one=async<T>(query:SQL):Promise<T|undefined>=>{try{const result=await this.db.execute(query) as unknown as {rows:T[]};return result.rows[0];}catch{return undefined;}};
    const [version,size,connections]=await Promise.all([
      one<{version:string}>(sql`select version() as version`),one<{size:string|number}>(sql`select pg_database_size(current_database()) as size`),
      this.server.driver==='postgres'?one<{n:string|number}>(sql`select count(*) as n from pg_stat_activity where datname=current_database()`):Promise.resolve(undefined),
    ]);
    const tableRows=await this.db.execute(sql`select c.relname as name,pg_total_relation_size(c.oid) as bytes from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by 2 desc`) as unknown as {rows:Array<{name:string;bytes:string|number}>};
    const names=tableRows.rows.map(r=>r.name).filter(n=>/^[a-z_][a-z0-9_]*$/.test(n));
    const counts=names.length?(await this.db.execute(sql.raw(names.map(n=>`select '${n}' as name,count(*) as n from "${n}"`).join(' union all '))) as unknown as {rows:Array<{name:string;n:string|number}>}).rows:[];
    const [[pending],[failed],[logs]]=await Promise.all([
      this.db.select({n:sql<number>`count(*)`.mapWith(Number)}).from(t.controls).where(inArray(t.controls.status,['pending','leased'])),
      this.db.select({n:sql<number>`count(*)`.mapWith(Number)}).from(t.controls).where(eq(t.controls.status,'failed')),
      this.db.select({n:sql<number>`count(*)`.mapWith(Number),oldest:sql<Date|null>`min(${t.gameLogs.createdAt})`}).from(t.gameLogs),
    ]);
    return {at:new Date().toISOString(),
      api:{uptimeS:Math.round(process.uptime()),node:process.version,pid:process.pid,rss:memory.rss,heapUsed:memory.heapUsed,heapTotal:memory.heapTotal,
        requests:metrics.sum('bar_api_requests_total'),errors:metrics.sum('bar_api_requests_total',labels=>labels.includes('status="5xx"')),p95Ms:metrics.window('bar_api_request_ms')?.percentile(95)??null},
      host:{hostname:os.hostname(),platform:os.platform(),release:os.release(),cpus:cpus.length,cpuModel:cpus[0]?.model.trim()??'',load:os.loadavg(),totalMem:os.totalmem(),freeMem:os.freemem(),uptimeS:Math.round(os.uptime())},
      disk,
      database:{driver:this.server.driver,version:version?.version.split(' on ')[0]??'—',size:size?Number(size.size):null,connections:connections?Number(connections.n):null,
        tables:tableRows.rows.map(r=>({name:r.name,rows:Number(counts.find(c=>c.name===r.name)?.n??0),bytes:Number(r.bytes)}))},
      queues:{controlsPending:pending?.n??0,controlsFailed:failed?.n??0,gameLogs:logs?.n??0,oldestLog:iso(logs?.oldest)}};
  }

  private ledgerEntry(entry:typeof t.currencyLedger.$inferSelect,names:Record<string,string>):AdminLedgerEntry{
    return {id:entry.id,amount:entry.amount,source:ledgerSource(entry.reason),label:ledgerText(entry.reason,names),createdAt:entry.createdAt.toISOString()};
  }
  private async names(ids:string[]):Promise<Record<string,string>>{
    const unique=[...new Set(ids)].filter(Boolean);if(!unique.length)return {};
    const rows=await this.db.select({id:t.profiles.userId,name:t.profiles.displayName}).from(t.profiles).where(inArray(t.profiles.userId,unique));
    return Object.fromEntries(rows.map(r=>[r.id,r.name]));
  }
}
