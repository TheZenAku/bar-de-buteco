import type {PublicUser} from '@bar/shared';
import {api,escape as e} from '../api';
import {uiIcon} from '../ui-icons';

export {e,uiIcon};
/** What every section of the administration gets from the console (console.ts). */
export interface AdminContext {
  api:typeof api;
  user:()=>PublicUser|undefined;
  /** The world's last admin.world snapshot (null until it arrives), and how to ask for a new one. */
  world:()=>WorldSnapshot|null;
  requestWorld:()=>void;
  /** A command to the world (admin.job, admin.table, admin.media, admin.bots). */
  send:(type:string,payload?:unknown)=>void;
  /** Opens another section, e.g. a player's file from the log. */
  go:(section:SectionId,params?:Record<string,string>)=>void;
  /** The console's status line (role=status), the one place every result is written. */
  message:(text:string,error?:boolean)=>void;
  /** Runs a change: locks the section, writes progress and the result, refreshes what depends on it. */
  run:(job:()=>Promise<unknown>,success:string,options?:{wallet?:boolean})=>Promise<boolean>;
  /** The open reports changed (the menu shows how many). */
  reports:(open:number)=>void;
}
export type SectionId='overview'|'players'|'reports'|'economy'|'prices'|'logs'|'world'|'server';
export interface Section {destroy?():void;world?(snapshot:WorldSnapshot):void}
export type SectionFactory=(root:HTMLElement,ctx:AdminContext,params:Record<string,string>)=>Section;

/** admin.world (apps/server/src/BarRoom.ts adminSnapshot). */
export interface WorldOrder {id?:string;playerId:string;items:string[];total:number}
export interface WorldSnapshot {
  at:number;occupancy:number;capacity:number;event:string;walletRetries:number;resultOutbox:number;prices:Record<string,number>;pricesLoaded?:boolean;logQueue?:number;
  players:Array<{id:string;name:string;connected:boolean;x:number;y:number;z:number;animation:string;interaction:string;job:string;condition:string;balance?:number;stageMinutes?:number}>;
  npcs:Array<{id:string;name:string;behavior:string;animation:string;x:number;z:number}>;
  waiter:{phase:string;current?:WorldOrder;queue:WorldOrder[]};counterQueue:string[];
  jobs:Array<{id:string;name:string;slots:number;workers:Array<{playerId:string;tasks:number;earned:number;station:string;endsInS:number;orders?:Array<{customer:string;table:number;picked:boolean}>}>;pay:number;enabled:boolean;tasks?:number;paid?:number}>;
  dirtyTables?:number[];
  media:Array<{kind:string;id:string;videoId:string;status:string;updatedBy:string;revision:number;title:string;by:string;live:boolean;queue:Array<{key:string;videoId:string;title:string;byName:string}>}>;
  bots?:{available:boolean;running:boolean;target:number;inBar:number;max:number;tickP95?:number;
    status?:{walking:number;doing:Array<[string,number]>;rttP95?:number;loopP95?:number;inputs?:number;refusals?:Array<[string,number]>}};
  process?:{uptimeS:number;node:string;pid:number;rss:number;heapUsed:number;tickP95?:number;apiOkAt:number;outboxWritable:boolean};
}

export const n=(value:number,digits=0)=>value.toLocaleString('pt-BR',{maximumFractionDigits:digits});
export const signed=(value:number)=>`${value>0?'+':value<0?'−':''}${n(Math.abs(value))}`;
export const pct=(value:number|null|undefined,digits=1)=>value===null||value===undefined||!Number.isFinite(value)?'—':`${value>0?'+':value<0?'−':''}${Math.abs(value*100).toLocaleString('pt-BR',{minimumFractionDigits:digits,maximumFractionDigits:digits})}%`;
/** 1.234 / 12,9 mil / 4,2 mi. */
export const compact=(value:number)=>Math.abs(value)>=1e6?`${n(value/1e6,1)} mi`:Math.abs(value)>=1e4?`${n(value/1e3,1)} mil`:n(value);
export function bytes(value:number|null|undefined):string {
  if(value===null||value===undefined)return '—';
  const units=['B','KB','MB','GB','TB'];let v=value,i=0;while(v>=1024&&i<units.length-1){v/=1024;i++;}
  return `${n(v,v<10&&i?1:0)} ${units[i]}`;
}
export function duration(seconds:number):string {
  const d=Math.floor(seconds/86400),h=Math.floor(seconds%86400/3600),m=Math.floor(seconds%3600/60);
  return d?`${d} d ${h} h`:h?`${h} h ${m} min`:m?`${m} min`:`${Math.round(seconds)} s`;
}
/** "hoje 14:32", "ontem 09:10" or "28/10 14:32" (with the year when it is not this one). */
export function when(value:string|number|null|undefined):string {
  if(!value)return '—';
  const date=new Date(value),now=new Date(),time=date.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  const day=(d:Date)=>new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime(),diff=Math.round((day(now)-day(date))/86_400_000);
  if(diff===0)return `hoje ${time}`;if(diff===1)return `ontem ${time}`;
  return `${date.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',...(date.getFullYear()!==now.getFullYear()?{year:'numeric'}:{})})} ${time}`;
}
export const fullDate=(value:string|number)=>new Date(value).toLocaleString('pt-BR');
export function ago(value:string|number|null|undefined):string {
  if(!value)return '—';
  const s=Math.max(0,(Date.now()-new Date(value).getTime())/1000);
  return s<60?'agora':s<3600?`há ${Math.floor(s/60)} min`:s<86400?`há ${Math.floor(s/3600)} h`:`há ${Math.floor(s/86400)} d`;
}
// randomUUID requires HTTPS/localhost; getRandomValues also works on the game's HTTP LAN address.
export function requestId():string {
  if(typeof crypto.randomUUID==='function')return crypto.randomUUID();
  const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]!&15)|64;b[8]=(b[8]!&63)|128;
  const hex=Array.from(b,v=>v.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

/** A stat tile: label, value and an optional line under it (`tone`: what the line means). */
export const stat=(label:string,value:string,sub='',tone:''|'up'|'down'|'warn'='')=>`<div class="admin-stat"><small>${label}</small><b>${value}</b>${sub?`<span class="${tone}">${sub}</span>`:''}</div>`;
export const card=(title:string,body:string,options:{icon?:string;actions?:string;className?:string}={})=>
  `<section class="admin-card ${options.className??''}"><header>${options.icon?uiIcon(options.icon):''}<h4>${title}</h4>${options.actions?`<div class="admin-card-actions">${options.actions}</div>`:''}</header>${body}</section>`;
export const empty=(text:string)=>`<p class="admin-empty">${text}</p>`;
export const badge=(text:string,tone:''|'magenta'|'cyan'|'gold'|'red'|'mint'|'muted'='')=>`<span class="admin-badge ${tone}">${text}</span>`;
/** The reason every change asks for (3–500 characters, as the API). */
export const reasonField=(label='Motivo',placeholder='')=>`<label class="admin-reason">${label}<textarea name="reason" aria-label="${label}" required minlength="3" maxlength="500" placeholder="${e(placeholder)}"></textarea></label>`;
/** A meter on the same ramp: `ratio` 0–1; warning past 75%, danger past 90%. */
export const meter=(ratio:number,label:string)=>`<div class="admin-meter ${ratio>.9?'danger':ratio>.75?'warn':''}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(ratio*100)}" aria-label="${e(label)}"><i style="width:${Math.max(0,Math.min(100,ratio*100))}%"></i></div>`;
/** Segmented choices (filters, periods): one is pressed. */
export const chips=(name:string,options:ReadonlyArray<readonly [string,string]>,current:string)=>
  `<div class="admin-chips" role="group">${options.map(([value,label])=>`<button type="button" data-admin-chip="${name}" data-value="${e(value)}" aria-pressed="${value===current}">${label}</button>`).join('')}</div>`;
type Control=HTMLButtonElement|HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement;
const locks=new WeakMap<HTMLElement,{depth:number;disabled:Set<Control>;observer:MutationObserver}>();
/**
 * Disables the controls of `root` while a change or a load runs, including those a redraw adds meanwhile (a reload
 * inside the change must not offer buttons that the running change would ignore). Nested locks share one: only the
 * outermost unlock enables again what the lock itself disabled.
 */
export function lock(root:HTMLElement):()=>void {
  let state=locks.get(root);
  if(!state){
    const disabled=new Set<Control>();
    const disable=()=>{for(const control of root.querySelectorAll<Control>('button,input,select,textarea'))if(!control.disabled){control.disabled=true;disabled.add(control);}};
    const observer=new MutationObserver(disable);observer.observe(root,{childList:true,subtree:true});
    state={depth:0,disabled,observer};locks.set(root,state);root.setAttribute('aria-busy','true');disable();
  }
  state.depth++;let released=false;
  return ()=>{
    if(released||!state)return;released=true;
    if(--state.depth>0)return;
    state.observer.disconnect();locks.delete(root);root.setAttribute('aria-busy','false');
    for(const control of state.disabled)if(control.isConnected)control.disabled=false;
  };
}
