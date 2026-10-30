import {itemById} from './inventory.js';
import type {PriceGroup} from './prices.js';

export const MAX_COIN_BALANCE=1_000_000_000;
export interface AdminAccount {
  id:string;username:string;displayName:string;email:string;role:'admin'|'user';verified:boolean;
  owner:boolean;banned:boolean;balance:number;kickId:string|null;
  canModerate:boolean;canEditWallet:boolean;canChangeRole:boolean;
  createdAt?:string;
}
export interface AdminAudit {
  id:string;actorId:string;userId:string|null;actorName:string|null;targetName:string|null;
  action:string;reason:string;createdAt:string;revokedAt:string|null;
  canRevert:boolean;revertLabel:string;revertReason:string;
}
export interface AdminReport {id:string;reason:string;reporterName:string|null;targetName:string|null;createdAt:string;
  reporterId?:string;targetId?:string;resolvedAt?:string|null;resolvedByName?:string|null;resolution?:string|null}
export interface AdminOverview {
  users:AdminAccount[];total:number;offset:number;limit:number;canManageAdmins:boolean;
  logs:AdminAudit[];reports:AdminReport[];
}
/** The player list's filters (GET /api/admin/overview?filter=). `online`: the ids the world reports as in the bar. */
export const ADMIN_PLAYER_FILTERS=['all','online','admins','banned','unverified'] as const;
export type AdminPlayerFilter=typeof ADMIN_PLAYER_FILTERS[number];
export const ADMIN_PLAYER_SORTS=['recent','name','balance'] as const;
export type AdminPlayerSort=typeof ADMIN_PLAYER_SORTS[number];

/** A coin movement as the panel shows it: where it came from (LEDGER_SOURCES) and a sentence. */
export interface AdminLedgerEntry {id:string;amount:number;source:LedgerSource;label:string;createdAt:string}
export interface AdminPlayerDetail {
  account:AdminAccount&{createdAt:string;equippedSkin:string;phone:string|null};
  wallet:{balance:number;earned30d:number;spent30d:number;ledger:AdminLedgerEntry[]};
  inventory:Array<{itemId:string;quantity:number}>;
  skins:Array<{id:string;name:string;owned:boolean;acquiredAt:string|null}>;
  sessions:{active:number;lastLoginAt:string|null};
  stats:{gamesPlayed:number;wins:number;losses:number;draws:number};
  /** Administrative actions on this account, newest first, with their reversal state. */
  history:AdminAudit[];
  reports:{against:AdminReport[];made:number};
}
/** What POST /api/admin/player changes (always with a reason, always recorded). */
export type AdminPlayerOperation=
  |{op:'rename';displayName:string}
  |{op:'verify'}
  |{op:'logout'}
  |{op:'item';itemId:string;quantity:number}
  |{op:'skin';skinId:string;grant:boolean};

/** The panel's Visão geral. */
export interface AdminSummary {
  accounts:{total:number;new24h:number;new7d:number;admins:number;banned:number;unverified:number};
  reportsOpen:number;
  economy:{supply:number;created24h:number;destroyed24h:number;supplyChange7d:number|null};
  activity:{logins24h:number;actions24h:number};
  recent:AdminAudit[];
}

export interface AdminPriceRow {
  key:string;group:PriceGroup;label:string;hint:string;defaultValue:number;value:number;min:number;max:number;
  /** Changed in the panel (the default otherwise), when and by whom. */
  override:boolean;updatedAt:string|null;updatedBy:string|null;
}
export interface AdminPrices {rows:AdminPriceRow[];changes:AdminAudit[]}

export interface AdminEconomy {
  generatedAt:string;days:number;
  supply:{total:number;wallets:number;holders:number;average:number;median:number;top10Share:number;gini:number};
  /** Change of the coins in circulation over the period (`null` when it started at zero). */
  inflation:{periodChange:number|null;dailyRate:number|null;created:number;destroyed:number;priceIndex:number;priceChanges:number};
  series:Array<{day:string;supply:number;created:number;destroyed:number}>;
  sources:Array<{source:LedgerSource;created:number;destroyed:number;count:number}>;
  topHolders:Array<{id:string;name:string;balance:number}>;
  /** Coins spent in the period over the average coins in circulation. */
  velocity:number|null;
  activePlayers:number;
  /** What the median wallet buys at today's price. */
  purchasingPower:{item:string;quantity:number};
}

export const ADMIN_LOG_CATEGORIES=['admin','moedas','itens','acessos','denuncias','mundo'] as const;
export type AdminLogCategory=typeof ADMIN_LOG_CATEGORIES[number];
export interface AdminLogEntry {
  id:string;at:string;category:AdminLogCategory;kind:string;
  title:string;detail:string;amount:number|null;
  playerId:string|null;playerName:string|null;actorName:string|null;
}
export interface AdminLogPage {entries:AdminLogEntry[];next:string|null}

export interface AdminServerInfo {
  at:string;
  api:{uptimeS:number;node:string;pid:number;rss:number;heapUsed:number;heapTotal:number;requests:number;errors:number;p95Ms:number|null};
  host:{hostname:string;platform:string;release:string;cpus:number;cpuModel:string;load:number[];totalMem:number;freeMem:number;uptimeS:number};
  disk:{path:string;total:number;free:number}|null;
  database:{driver:string;version:string;size:number|null;connections:number|null;tables:Array<{name:string;rows:number;bytes:number|null}>};
  queues:{controlsPending:number;controlsFailed:number;gameLogs:number;oldestLog:string|null};
}

/**
 * Coins enter the economy (welcome, daily bonus, work, refunds, administration) and leave it (purchases). A Pix moves
 * coins between players and never changes the total.
 */
export const LEDGER_SOURCES={
  'boas-vindas':'Boas-vindas',bonus:'Bônus diário',trabalho:'Trabalho',estorno:'Estornos',admin:'Administração',pix:'Pix entre jogadores',
  skins:'Skins',mochila:'Loja da mochila',midia:'Jukebox, TVs e telão',balcao:'Balcão',mesa:'Pedidos na mesa',palco:'Palco',testes:'Bots de teste',outros:'Outros',
} as const;
export type LedgerSource=keyof typeof LEDGER_SOURCES;
const PREFIX_SOURCE:Record<string,LedgerSource>={welcome:'boas-vindas',daily:'bonus',job:'trabalho',refund:'estorno',pix:'pix',skin:'skins',item:'mochila',
  media:'midia',counter:'balcao',table:'mesa',stage:'palco','dev-bots':'testes'};
export const ledgerSource=(reason:string):LedgerSource=>reason.startsWith('{')?'admin':PREFIX_SOURCE[reason.split(':')[0]!]??'outros';
const itemName=(id:string|undefined)=>itemById(id??'')?.name??id??'item';
/** A sentence for one ledger row (`names`: display names by account id, for Pix). */
export function ledgerText(reason:string,names:Readonly<Record<string,string>>={}):string{
  if(reason.startsWith('{')){
    try{const receipt=JSON.parse(reason) as {type?:string;reason?:string};return receipt.type==='admin-reversal'?`Reversão de ajuste · ${receipt.reason??''}`:`Ajuste da administração · ${receipt.reason??''}`;}
    catch{return 'Ajuste da administração';}
  }
  const [prefix,a,b]=reason.split(':');
  switch(prefix){
    case 'welcome':return 'Moedas de boas-vindas';
    case 'daily':return 'Bônus diário';
    case 'job':return 'Pagamento por tarefa';
    case 'refund':return 'Estorno de cobrança';
    case 'pix':return a==='out'?`Pix enviado para ${names[b??'']??'outro jogador'}`:`Pix recebido de ${names[b??'']??'outro jogador'}`;
    case 'skin':return `Comprou a skin ${a}`;
    case 'item':return `Comprou ${b??1}× ${itemName(a)} na mochila`;
    case 'media':return a==='telao'?'Vídeo no telão':a?.startsWith('jukebox')?'Música na jukebox':'Vídeo na TV';
    case 'counter':return `${itemName(a)} no balcão`;
    case 'table':return `Pedido na mesa: ${(a??'').split('-').map(itemName).join(', ')}`;
    case 'stage':return 'Ingresso do palco';
    case 'dev-bots':return 'Saldo dos bots de teste';
    default:return reason;
  }
}

const ACTION_LABELS:Record<string,string>={kick:'Expulsão',unkick:'Expulsão desfeita',ban:'Banimento',unban:'Banimento removido',event:'Evento',
  'admin-grant':'Administrador concedido','admin-revoke':'Administrador removido','owner-bootstrap':'Conta principal habilitada',
  'coins-add':'Moedas adicionadas','coins-remove':'Moedas removidas','coins-set':'Saldo definido','price-set':'Preços alterados',
  'player-rename':'Nome alterado','player-verify':'E-mail confirmado pela administração','player-logout':'Sessões encerradas',
  'items-add':'Itens adicionados','items-remove':'Itens removidos','skin-grant':'Skin concedida','skin-revoke':'Skin retirada',
  'report-resolve':'Denúncia resolvida','report-reopen':'Denúncia reaberta'};
/** The name of an administrative action (moderation_actions.action); `undo-*` reads "Reversão: …". */
export const adminActionLabel=(action:string):string=>action.startsWith('undo-')?`Reversão: ${ACTION_LABELS[action.slice(5)]??action.slice(5)}`:ACTION_LABELS[action]??action;

/** inventory_ledger.reason in the panel's words. */
export const ITEM_LOG_REASONS:Readonly<Record<string,string>>={starter:'Itens iniciais',purchase:'Comprado na mochila',use:'Usado',discard:'Descartado',faint:'Perdido no desmaio',admin:'Ajuste da administração'};
/** game_logs written by the API (logins); registrations come from the accounts themselves. */
export const ACCESS_LOG_EVENTS:Readonly<Record<string,string>>={register:'Criou a conta',login:'Entrou na conta',login_failed:'Errou a senha',logout:'Saiu da conta',password_reset:'Trocou a senha'};

const EVENT_NAMES:Record<string,string>={BLACKOUT:'Apagão',DRUNK_NPC:'O inconveniente',PARTY:'Festa'};
const text=(value:unknown)=>typeof value==='string'||typeof value==='number'?String(value):'';
/**
 * What the world sends to the log (apps/server/src/BarRoom.ts log()) and how the panel reads it. Events missing here
 * stay in the world's own output only (doors, retries, bots' output).
 */
export const WORLD_LOG_EVENTS:Readonly<Record<string,(d:Record<string,unknown>)=>{title:string;detail:string;amount?:number}>>={
  join:()=>({title:'Entrou no bar',detail:''}),
  takeover:()=>({title:'Reconectou',detail:'A conta entrou de outra janela e assumiu o personagem.'}),
  leave:()=>({title:'Saiu do bar',detail:''}),
  expel:d=>({title:'Removido do bar',detail:text(d.reason)}),
  faint:d=>({title:'Desmaiou',detail:d.cause==='drunk'?'Bebeu demais.':d.cause?`Causa: ${text(d.cause)}`:''}),
  vomit:()=>({title:'Passou mal',detail:'Bebeu além da conta.'}),
  job_start:d=>({title:'Começou um turno',detail:`Emprego: ${text(d.jobId)}`}),
  job_end:d=>({title:'Terminou o turno',detail:`${text(d.tasks)||0} tarefa(s) · ${text(d.earned)||0} moedas`}),
  stage_pass:d=>({title:'Ingresso do palco',detail:'Comprou a entrada no palco.',amount:typeof d.price==='number'?-d.price:undefined}),
  stage_musician:d=>({title:'Subiu para tocar',detail:`Posição: ${text(d.spot)}`}),
  table_delivered:d=>({title:'Pedido entregue na mesa',detail:`${text(d.total)} moedas · espera de ${Math.round(Number(d.waitMs??0)/1000)} s${d.workerId?' · entregue por um jogador':''}`}),
  table_dropped:d=>({title:'Pedido da mesa cancelado',detail:text(d.reason)}),
  phone_call:d=>({title:d.video?'Chamada de vídeo':'Ligação pelo celular',detail:''}),
  world_event:d=>({title:d.type?`Evento: ${EVENT_NAMES[text(d.type)]??text(d.type)}`:'Evento encerrado',detail:''}),
  admin_job:d=>({title:'Administração: emprego',detail:[d.endShiftOf?'encerrou um turno':'',d.slots!==undefined?`vagas ${text(d.slots)}`:'',d.enabled!==undefined?(d.enabled?'aberto':'fechado'):''].filter(Boolean).join(' · ')}),
  admin_table_cancel:()=>({title:'Administração: pedido cancelado',detail:'Moedas devolvidas ao cliente.'}),
  admin_media_off:d=>({title:'Administração: aparelho desligado',detail:text(d.id)}),
  admin_bots:d=>({title:'Administração: bots de teste',detail:`${text(d.count)} bot(s)`}),
  wallet_credit_refused:d=>({title:'Crédito recusado',detail:`A API recusou ${text(d.reason)}.`}),
  wallet_credit_abandoned:d=>({title:'Crédito abandonado',detail:`${text(d.amount)} moedas de ${text(d.reason)} não foram pagas.`}),
};
