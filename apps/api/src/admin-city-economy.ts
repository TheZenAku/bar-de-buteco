import {and,desc,eq,gte,inArray,sql,type SQL} from 'drizzle-orm';
import {barDayKey,startOfBarDay} from '@bar/shared';
import type {FactoryFinance,FactoryShipmentView} from '@bar/shared/factory';
import type {Database} from './database/index.js';
import {cityTreasury,cityTreasuryLedger,factoryShipments,profiles} from './database/schema.js';
import type {FactoryLogistics} from './factory-logistics.js';

const DAY=86_400_000;
export const VAULT_PAGE_SIZE=15;
/** Where the city's vault money comes from or goes to, told from the ledger's reason (factory-logistics.ts writes it). */
export const VAULT_SOURCES={tax:'Imposto das vendas da Empresa Brasil',admin:'Ajustes da administração',other:'Outros'} as const;
export type VaultSource=keyof typeof VAULT_SOURCES;
export const vaultSource=(reason:string):VaultSource=>reason.startsWith('Imposto da venda')?'tax':reason.startsWith('admin:')?'admin':'other';

export interface VaultFlow {in:number;out:number;count:number}
export interface FirmFlow {sales:number;pallets:number;gross:number;tax:number;staff:number;owner:number;freight:number}
/** GET /api/admin/economy/city: the city's vault and the Empresa Brasil's books, as the Economia tabs show them. */
export interface AdminCityEconomy {
  generatedAt:string;days:number;
  vault:{balance:number;updatedAt:string|null;today:VaultFlow;period:VaultFlow;
    sources:Array<{source:VaultSource;label:string;in:number;out:number;count:number}>;
    series:Array<{day:string;in:number;out:number;balance:number}>;
    ledger:{rows:Array<{id:string;at:string;amount:number;balanceAfter:number;source:VaultSource;reason:string;actor:string|null}>;total:number;page:number;pageSize:number;flow:'all'|'in'|'out'}};
  firm:{finance:FactoryFinance;ownerName:string|null;today:FirmFlow;period:FirmFlow;total:FirmFlow;
    series:Array<{day:string;gross:number;pallets:number}>;
    trips:{active:FactoryShipmentView[];latest:FactoryShipmentView[]}};
}

const empty=():FirmFlow=>({sales:0,pallets:0,gross:0,tax:0,staff:0,owner:0,freight:0});
const ACTIVE=['loaded','in_transit','to_supplier','returning'];

export async function cityEconomy(db:Database,logistics:FactoryLogistics,options:{days:number;page:number;flow:'all'|'in'|'out'}):Promise<AdminCityEconomy> {
  const now=new Date(),since=startOfBarDay(new Date(now.getTime()-(options.days-1)*DAY)),todayKey=barDayKey(now);
  const keys:string[]=[];for(let d=new Date(since);d<=now;d=new Date(d.getTime()+DAY))keys.push(barDayKey(d));
  const flowWhere:SQL|undefined=options.flow==='in'?sql`${cityTreasuryLedger.amount}>0`:options.flow==='out'?sql`${cityTreasuryLedger.amount}<0`:undefined;

  await db.insert(cityTreasury).values({id:'city',balance:0}).onConflictDoNothing();
  const [[vault],ledgerPeriod,[counted],page,finance,list]=await Promise.all([
    db.select().from(cityTreasury).where(eq(cityTreasury.id,'city')),
    db.select({at:cityTreasuryLedger.createdAt,amount:cityTreasuryLedger.amount,after:cityTreasuryLedger.balanceAfter,reason:cityTreasuryLedger.reason}).from(cityTreasuryLedger).where(gte(cityTreasuryLedger.createdAt,since)).orderBy(cityTreasuryLedger.createdAt),
    db.select({n:sql<number>`count(*)`.mapWith(Number)}).from(cityTreasuryLedger).where(flowWhere),
    db.select({id:cityTreasuryLedger.id,at:cityTreasuryLedger.createdAt,amount:cityTreasuryLedger.amount,after:cityTreasuryLedger.balanceAfter,reason:cityTreasuryLedger.reason,actorName:profiles.displayName})
      .from(cityTreasuryLedger).leftJoin(profiles,eq(profiles.userId,cityTreasuryLedger.actorId)).where(flowWhere).orderBy(desc(cityTreasuryLedger.createdAt)).limit(VAULT_PAGE_SIZE).offset(options.page*VAULT_PAGE_SIZE),
    logistics.finance(),logistics.list(6),
  ]);
  const balance=Number(vault?.balance??0);

  // Vault: per day and per origin; the day's closing balance is the last row's, carried over quiet days.
  const days=new Map(keys.map(key=>[key,{in:0,out:0,balance:NaN}])),bySource=new Map<VaultSource,VaultFlow>(),period:VaultFlow={in:0,out:0,count:0},today:VaultFlow={in:0,out:0,count:0};
  for(const row of ledgerPeriod){
    const amount=Number(row.amount),key=barDayKey(row.at),day=days.get(key);if(!day)continue;
    if(amount>0)day.in+=amount;else day.out-=amount;day.balance=Number(row.after);
    const source=bySource.get(vaultSource(row.reason))??{in:0,out:0,count:0};if(amount>0)source.in+=amount;else source.out-=amount;source.count++;bySource.set(vaultSource(row.reason),source);
    if(amount>0)period.in+=amount;else period.out-=amount;period.count++;
    if(key===todayKey){if(amount>0)today.in+=amount;else today.out-=amount;today.count++;}
  }
  const first=ledgerPeriod[0];let carry=first?Number(first.after)-Number(first.amount):balance;
  const series=keys.map(key=>{const day=days.get(key)!;if(!Number.isNaN(day.balance))carry=day.balance;return {day:key,in:day.in,out:day.out,balance:carry};});

  // Firm: sales count on the day the truck left (when the tax reached the vault), freight on the day it arrived.
  const sales=await db.select({at:factoryShipments.departedAt,pallets:factoryShipments.pallets,gross:factoryShipments.gross,tax:factoryShipments.tax,staff:factoryShipments.staff,owner:factoryShipments.ownerShare}).from(factoryShipments)
    .where(and(eq(factoryShipments.kind,'sale'),inArray(factoryShipments.status,['in_transit','delivered']),gte(factoryShipments.departedAt,since)));
  const freights=await db.select({at:factoryShipments.deliveredAt,freight:factoryShipments.freight}).from(factoryShipments).where(and(eq(factoryShipments.status,'delivered'),gte(factoryShipments.deliveredAt,since)));
  const firmPeriod=empty(),firmToday=empty(),firmDays=new Map(keys.map(key=>[key,{gross:0,pallets:0}]));
  for(const row of sales){
    if(!row.at)continue;const key=barDayKey(row.at),day=firmDays.get(key);if(!day)continue;
    for(const flow of key===todayKey?[firmPeriod,firmToday]:[firmPeriod]){flow.sales++;flow.pallets+=row.pallets;flow.gross+=row.gross;flow.tax+=row.tax;flow.staff+=row.staff;flow.owner+=row.owner;}
    day.gross+=row.gross;day.pallets+=row.pallets;
  }
  for(const row of freights){if(!row.at)continue;const key=barDayKey(row.at);firmPeriod.freight+=row.freight;if(key===todayKey)firmToday.freight+=row.freight;}
  const total=await logistics.summary();
  const [owner]=finance.ownerUserId?await db.select({name:profiles.displayName}).from(profiles).where(eq(profiles.userId,finance.ownerUserId)):[];

  return {generatedAt:now.toISOString(),days:options.days,
    vault:{balance,updatedAt:vault?.updatedAt?new Date(vault.updatedAt).toISOString():null,today,period,
      sources:[...bySource].map(([source,flow])=>({source,label:VAULT_SOURCES[source],...flow})).sort((a,b)=>(b.in+b.out)-(a.in+a.out)),series,
      ledger:{rows:page.map(row=>({id:row.id,at:new Date(row.at).toISOString(),amount:Number(row.amount),balanceAfter:Number(row.after),source:vaultSource(row.reason),reason:row.reason.replace(/^admin:/,''),actor:row.actorName??null})),total:counted?.n??0,page:options.page,pageSize:VAULT_PAGE_SIZE,flow:options.flow}},
    firm:{finance,ownerName:owner?.name??null,today:firmToday,period:firmPeriod,total:{...empty(),...total},series:keys.map(key=>({day:key,...firmDays.get(key)!})),
      trips:{active:list.filter(trip=>ACTIVE.includes(trip.status)),latest:list.filter(trip=>!ACTIVE.includes(trip.status))}}};
}
