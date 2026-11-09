import {ACHIEVEMENT_SERIES} from './achievements.js';

/**
 * Player levels, 1 to 100 (docs/sistemas/niveis.md). XP is not stored: it is read from the achievement counters, which
 * already count what players do in the bar. Time connected counts towards badges only, without granting XP.
 */
export const MAX_LEVEL=100;

/** XP for one unit of each series, as the player sees it (one beer, one minute, one km): the defaults of the `xp:<series>` prices. */
export const XP_PER_UNIT:Readonly<Record<string,number>>={
  bebum:10,'boca-nervosa':8,cafeinado:6,fumante:4,'bexiga-solta':5,'passou-mal':5,apagou:10,
  'pe-de-valsa':6,'estrela-do-palco':8,'mesa-de-luz':1,'dj-de-boteco':10,ajudante:15,fregues:10,'rei-do-21':15,
  'craque-do-pebolim':40,'mestre-da-sinuca':40,'rei-do-truco':50,motoboy:15,entregador:30,barbeiro:5,mecanico:15,
  sparring:50,'quebra-queixo':100,
  andarilho:20,resenha:1,'gente-boa':2,fofoqueiro:1,influencer:15,pix:5,telefonista:10,
};
/** The daily bonus keeps its XP in its own counter, one point per XP (claimDaily). */
export const DAILY_XP_SERIES='diario';
/** Fixed XP earned from time connected before migration 025; new presence never increases it. */
export const LEGACY_PRESENCE_XP_SERIES='presenca-xp-legado';
/** What the administration added and took away, one point per XP each (counters cannot be negative). */
export const ADMIN_XP_SERIES='ajuste-xp',ADMIN_XP_REMOVED_SERIES='ajuste-xp-menos';
const PER=new Map(ACHIEVEMENT_SERIES.map(series=>[series.id,series.per??1]));
/** The panel's values (`xp:<series>` in the price table) over the code's. */
type XpTable=Readonly<Record<string,number>>;
const xpPerStored=(series:string,table?:XpTable):number=>series==='frequentador'?0:series===DAILY_XP_SERIES||series===LEGACY_PRESENCE_XP_SERIES?1:(table?.[`xp:${series}`]??XP_PER_UNIT[series]??0)/(PER.get(series)??1);

/** A player's XP from their counters (`user_achievements` rows); counters that give none count for nothing. Never below 0. */
export function xpOfCounters(rows:Iterable<{series:string;value:number}>,table?:XpTable):number {
  let xp=0;
  for(const {series,value} of rows)xp+=series===ADMIN_XP_SERIES?value:series===ADMIN_XP_REMOVED_SERIES?-value:Math.floor(Math.max(0,value)*xpPerStored(series,table));
  return Math.max(0,xp);
}

/** XP from level `level` to the next: quick at the start, a long road near the top. */
export const xpToNext=(level:number):number=>Math.round((50+15*level+.3*level*level)/5)*5;
const START=[0,0];// START[level] = total XP where `level` begins
for(let level=1;level<MAX_LEVEL;level++)START.push(START[level]!+xpToNext(level));
export const xpAtLevel=(level:number):number=>START[Math.max(1,Math.min(MAX_LEVEL,Math.floor(level)))]!;

export interface LevelProgress {level:number;xp:number;/** XP since the level began. */into:number;/** XP the level needs; 0 at the top. */need:number}
export function levelOf(xp:number):LevelProgress {
  const total=Math.max(0,Math.floor(xp));
  let level=1;
  while(level<MAX_LEVEL&&total>=START[level+1]!)level++;
  return {level,xp:total,into:total-START[level]!,need:level<MAX_LEVEL?xpToNext(level):0};
}

/** Ten ranks of ten levels: each has its own badge shape and colours (apps/web/src/levels/rank-icon.ts). */
export const RANKS:readonly {name:string;colors:readonly [string,string]}[]=[
  {name:'Forasteiro',colors:['#c08457','#6b3f22']},
  {name:'Freguês',colors:['#d6dbe6','#6f7891']},
  {name:'Chegado',colors:['#ffd75e','#b07a0c']},
  {name:'Boêmio',colors:['#5fe3a1','#127a52']},
  {name:'Seresteiro',colors:['#4fd8ff','#0a5fa8']},
  {name:'Malandro',colors:['#b48cff','#5326b5']},
  {name:'Sócio',colors:['#ff6fb5','#a3125f']},
  {name:'Lenda',colors:['#ff9a4d','#b3360b']},
  {name:'Patrono',colors:['#ff5468','#7d0a2c']},
  {name:'Imortal',colors:['#fff2a8','#e0a100']},
];
export const rankOf=(level:number):{index:number;name:string;colors:readonly [string,string];/** 1-10 inside the rank. */step:number}=>{
  const clamped=Math.max(1,Math.min(MAX_LEVEL,Math.floor(level))),index=Math.floor((clamped-1)/10);
  return {index,...RANKS[index]!,step:clamped-index*10};
};

/** The daily bonus: seven days in a row, more each day; missing a day starts again from the first. */
export const DAILY_XP:readonly number[]=[50,75,100,150,200,250,400];
/** The seven days as the panel set them (`xp:daily-<n>`). */
export const dailyXp=(table?:XpTable):number[]=>DAILY_XP.map((xp,i)=>table?.[`xp:daily-${i+1}`]??xp);
export interface DailyView {
  /** The day of the run (1-7) that today's claim is, or was. */
  day:number;
  claimed:boolean;
  /** Coins on top every day (price `reward:daily`, 0 = none). */
  coins:number;
  rewards:readonly number[];
}
