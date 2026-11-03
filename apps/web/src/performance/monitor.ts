import type {ServerPerformance} from '@bar/shared';
import {FrameWindow,type FrameSummary,type FrameSample} from './frames';

export interface RenderPerformance {
  updateMs:number;renderMs:number;gpuMs:number|null;drawCalls:number;primitives:number|null;vram:number;
  width:number;height:number;scale:number;actors:number;compiling:number;
}
export const HUD_METRICS={fps:'FPS',low1:'1% low',low01:'0,1% low',frametime:'Tempo de frame',graph:'Gráfico de frames',stutters:'Travadas',memory:'Memória JS do cliente',render:'CPU / GPU e renderização',network:'Ping / jitter / comandos',server:'Tick / CPU do servidor',serverMemory:'RAM do servidor',world:'Jogadores / NPCs / filas'} as const;
export type HudMetric=keyof typeof HUD_METRICS;
export interface PerformancePreferences {
  enabled:boolean;hud:boolean;metrics:HudMetric[];corner:'top-left'|'top-right'|'bottom-left'|'bottom-right';
  windowSeconds:10|30|60;targetFps:30|60|120|144;stutterMs:number;
}
export interface StutterEvent {at:number;ms:number;render:RenderPerformance|null;ping:number|null;tickP95:number|null;position:string}
export interface DiagnosticSnapshot {
  at:number;enabled:boolean;collecting:boolean;reason:string;preferences:PerformancePreferences;frames:FrameSummary;timeline:FrameSample[];
  render:RenderPerformance|null;memory:{used:number;total:number;limit:number}|null;
  network:{ping:number|null;jitter:number|null;pending:number;fresh:boolean};server:ServerPerformance|null;serverAgeMs:number|null;
  events:StutterEvent[];longTasks:{supported:boolean;count:number;totalMs:number;maxMs:number};
  history:Array<{at:number;fps:number|null;low1:number|null;heap:number|null;serverRss:number|null;tickP95:number|null}>;
}
export const defaultPreferences=():PerformancePreferences=>({enabled:false,hud:false,metrics:['fps','low1','frametime','graph','stutters','server','serverMemory'],corner:'top-right',windowSeconds:30,targetFps:60,stutterMs:50});
export function readPreferences(raw:unknown):PerformancePreferences {
  const defaults=defaultPreferences();if(!raw||typeof raw!=='object')return defaults;
  const p=raw as Partial<PerformancePreferences>;
  return {enabled:typeof p.enabled==='boolean'?p.enabled:defaults.enabled,hud:typeof p.hud==='boolean'?p.hud:defaults.hud,
    metrics:Array.isArray(p.metrics)?[...new Set(p.metrics.filter((key):key is HudMetric=>Object.hasOwn(HUD_METRICS,key)))]:defaults.metrics,
    corner:['top-left','top-right','bottom-left','bottom-right'].includes(p.corner??'')?p.corner!:defaults.corner,
    windowSeconds:([10,30,60] as unknown[]).includes(p.windowSeconds)?p.windowSeconds!:defaults.windowSeconds,
    targetFps:([30,60,120,144] as unknown[]).includes(p.targetFps)?p.targetFps!:defaults.targetFps,
    stutterMs:typeof p.stutterMs==='number'&&Number.isFinite(p.stutterMs)?Math.min(500,Math.max(20,p.stutterMs)):defaults.stutterMs};
}

export class PerformanceMonitor {
  private preferences=defaultPreferences();
  private owner='';
  private window=new FrameWindow();
  private previous:number|null=null;
  private render:RenderPerformance|null=null;
  private server:ServerPerformance|null=null;
  private serverReceivedAt:number|null=null;
  private pingValues:Array<{at:number;ms:number}>=[];
  private events:StutterEvent[]=[];
  private history:DiagnosticSnapshot['history']=[];
  private longTasks={supported:typeof PerformanceObserver!=='undefined'&&(PerformanceObserver.supportedEntryTypes?.includes('longtask')??false),count:0,totalMs:0,maxMs:0};
  private observer:PerformanceObserver|undefined;
  private observing=false;
  private lastPoll=-Infinity;
  private lastHistory=-Infinity;
  private listeners=new Set<(snapshot:DiagnosticSnapshot)=>void>();
  private timer:ReturnType<typeof setInterval>;
  private current:DiagnosticSnapshot;
  constructor(private hooks:{allowed:()=>boolean;capturing:()=>boolean;pending:()=>number;position:()=>string;requestServer:()=>void;observe:(callback:((frame:RenderPerformance|null)=>void)|undefined)=>void}){
    this.current=this.snapshot();
    this.timer=setInterval(()=>this.tick(),500);
    document.addEventListener('visibilitychange',this.visibility);
  }
  forUser(id:string):void {
    if(this.owner===id)return;
    this.owner=id;this.preferences=defaultPreferences();this.lastPoll=-Infinity;
    if(id){try{this.preferences=readPreferences(JSON.parse(localStorage.getItem(`bar.performance.v1.${id}`)??'null'));}catch{/* Restricted storage uses this session's settings. */}}
    this.reset();
  }
  configure(patch:Partial<PerformancePreferences>):void {
    const previous=this.preferences;this.preferences=readPreferences({...previous,...patch});
    if(this.owner){try{localStorage.setItem(`bar.performance.v1.${this.owner}`,JSON.stringify(this.preferences));}catch{/* In-memory preferences remain usable. */}}
    if(previous.targetFps!==this.preferences.targetFps||previous.stutterMs!==this.preferences.stutterMs||previous.windowSeconds!==this.preferences.windowSeconds)this.reset();
    else this.tick();
  }
  get state():DiagnosticSnapshot {return this.current;}
  subscribe(listener:(snapshot:DiagnosticSnapshot)=>void):()=>void {this.listeners.add(listener);listener(this.current);return ()=>this.listeners.delete(listener);}
  receiveServer(server:ServerPerformance):void {if(!this.enabled())return;this.server=server;this.serverReceivedAt=performance.now();}
  receivePing(ms:number):void {
    if(!this.enabled()||!Number.isFinite(ms))return;
    const at=performance.now();this.pingValues.push({at,ms});this.pingValues=this.pingValues.filter(p=>p.at>=at-30000).slice(-30);
  }
  private enabled():boolean {return !!this.owner&&this.preferences.enabled&&this.hooks.allowed();}
  private capturing():boolean {return this.enabled()&&!document.hidden&&this.hooks.capturing();}
  private visibility=()=>{this.previous=null;this.tick();};
  private frame=(render:RenderPerformance|null)=>{
    if(!render||!this.capturing()){this.previous=null;return;}
    const now=performance.now(),previous=this.previous;this.previous=now;this.render=render;
    if(previous===null)return;
    const ms=now-previous;this.window.add(now,ms);
    if(ms>=this.threshold()){
      const lastPing=this.pingValues.at(-1);
      this.events.push({at:Date.now(),ms,render:{...render},ping:lastPing&&now-lastPing.at<7000?lastPing.ms:null,
        tickP95:this.serverReceivedAt!==null&&now-this.serverReceivedAt<6000?this.server?.tick.p95Ms??null:null,position:this.hooks.position()});
      if(this.events.length>100)this.events.shift();
    }
  };
  private threshold():number {return Math.max(this.preferences.stutterMs,2000/this.preferences.targetFps);}
  private sync():void {
    const on=this.enabled()&&!document.hidden;
    if(on===this.observing)return;
    this.observing=on;this.previous=null;
    this.hooks.observe(on?this.frame:undefined);
    this.observer?.disconnect();this.observer=undefined;
    if(on&&this.longTasks.supported){
      try{this.observer=new PerformanceObserver(list=>{if(!this.capturing())return;for(const entry of list.getEntries()){
        this.longTasks.count++;this.longTasks.totalMs+=entry.duration;this.longTasks.maxMs=Math.max(this.longTasks.maxMs,entry.duration);
      }});this.observer.observe({type:'longtask',buffered:false});}catch{this.longTasks.supported=false;}
    }
  }
  private snapshot():DiagnosticSnapshot {
    const now=performance.now(),capturing=this.capturing();
    const memory=(performance as Performance&{memory?:{usedJSHeapSize:number;totalJSHeapSize:number;jsHeapSizeLimit:number}}).memory;
    const pings=this.pingValues.filter(p=>p.at>=now-30000),last=pings.at(-1);
    const jitter=pings.length>1?pings.slice(1).reduce((sum,p,i)=>sum+Math.abs(p.ms-pings[i]!.ms),0)/(pings.length-1):null;
    return {at:Date.now(),enabled:this.enabled(),collecting:capturing,
      reason:!this.preferences.enabled?'Coleta desativada':!this.hooks.allowed()?'Aguardando conexão administrativa':document.hidden?'Aba em segundo plano':!capturing?'Coleta de frames pausada enquanto uma janela está aberta':'Coletando durante o jogo',
      preferences:{...this.preferences,metrics:[...this.preferences.metrics]},frames:this.window.summary(now,this.preferences.windowSeconds,this.threshold()),timeline:this.window.samples(now,this.preferences.windowSeconds),
      render:this.render,memory:memory?{used:memory.usedJSHeapSize,total:memory.totalJSHeapSize,limit:memory.jsHeapSizeLimit}:null,
      network:{ping:last?.ms??null,jitter,pending:this.hooks.pending(),fresh:!!last&&now-last.at<7000},server:this.server,serverAgeMs:this.serverReceivedAt===null?null:now-this.serverReceivedAt,
      events:[...this.events],longTasks:{...this.longTasks},history:[...this.history]};
  }
  /** Also called at session/permission transitions: a revoked account loses its observers immediately. */
  refresh():void {this.tick();}
  private tick():void {
    this.sync();const now=performance.now();
    if(this.enabled()&&!document.hidden&&now-this.lastPoll>=2000){this.lastPoll=now;this.hooks.requestServer();}
    this.current=this.snapshot();
    if(this.enabled()&&now-this.lastHistory>=1000){
      this.lastHistory=now;const s=this.current;
      const fresh=s.serverAgeMs!==null&&s.serverAgeMs<6000;
      this.history.push({at:s.at,fps:s.collecting?s.frames.fps:null,low1:s.collecting?s.frames.low1:null,heap:s.memory?.used??null,serverRss:fresh?s.server?.process.rss??null:null,tickP95:fresh?s.server?.tick.p95Ms??null:null});
      if(this.history.length>600)this.history.shift();
    }
    for(const listener of this.listeners)listener(this.current);
  }
  reset():void {
    this.window.clear();this.previous=null;this.render=null;this.server=null;this.serverReceivedAt=null;this.pingValues=[];this.events=[];this.history=[];
    this.longTasks={supported:this.longTasks.supported,count:0,totalMs:0,maxMs:0};this.lastHistory=-Infinity;
    this.observer?.takeRecords();this.tick();
  }
  export():void {
    const report={version:1,generatedAt:new Date().toISOString(),...this.snapshot(),notes:{low1:'1000 / média dos 1% frames mais lentos (mínimo 100 frames)',low01:'1000 / média dos 0,1% frames mais lentos (mínimo 1000 frames)',memory:'Heap JavaScript exposto pelo navegador; não é a RAM total da aba.',cpu:'100% representa um núcleo lógico do processo do mundo.',stutterThresholdMs:this.threshold()}};
    const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=document.createElement('a');
    a.href=url;a.download=`bar-desempenho-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  destroy():void {clearInterval(this.timer);this.observer?.disconnect();this.hooks.observe(undefined);document.removeEventListener('visibilitychange',this.visibility);this.listeners.clear();}
}
