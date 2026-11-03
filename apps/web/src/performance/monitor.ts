import type {ServerPerformance} from '@bar/shared';
import {FrameWindow,type FrameSummary,type FrameSample} from './frames';
import {PerformanceRecording,PHASE_SOURCES,DETAIL_SOURCES} from './recording';
import {BrowserDiagnostics,browserEnvironment} from './browser';
import {analyzeReport,CLAUDE_PROMPT,REPORT_REFERENCES} from './report';
import type {SceneInventory} from './inventory';

export interface RenderPerformance {
  updateMs:number;renderMs:number;gpuMs:number|null;drawCalls:number;primitives:number|null;vram:number;
  width:number;height:number;scale:number;actors:number;compiling:number;
  resting?:number;animationMs?:number;physicsMs?:number;systemUpdateMs?:number;systemPostUpdateMs?:number;
  phases?:Record<string,number>;
  detailPhases?:Record<string,number>;
}
export const HUD_METRICS={fps:'FPS',low1:'1% low',low01:'0,1% low',frametime:'Tempo de frame',graph:'Gráfico de frames',stutters:'Travadas',memory:'Memória JS do cliente',render:'CPU / GPU e renderização',network:'Ping / jitter / comandos',server:'Tick / CPU do servidor',serverMemory:'RAM do servidor',world:'Jogadores / NPCs / filas'} as const;
export type HudMetric=keyof typeof HUD_METRICS;
export interface PerformancePreferences {
  enabled:boolean;hud:boolean;metrics:HudMetric[];corner:'top-left'|'top-right'|'bottom-left'|'bottom-right';
  windowSeconds:10|30|60;targetFps:30|60|120|144;stutterMs:number;
}
export interface StutterEvent {at:number;elapsedMs?:number;ms:number;render:RenderPerformance|null;ping:number|null;tickP95:number|null;position:string}
export interface DiagnosticSnapshot {
  at:number;enabled:boolean;collecting:boolean;reason:string;preferences:PerformancePreferences;frames:FrameSummary;timeline:FrameSample[];
  render:RenderPerformance|null;memory:{used:number;total:number;limit:number}|null;
  network:{ping:number|null;jitter:number|null;pending:number;fresh:boolean};server:ServerPerformance|null;serverAgeMs:number|null;
  events:StutterEvent[];longTasks:{supported:boolean;count:number;totalMs:number;maxMs:number};
  history:Array<{at:number;fps:number|null;low1:number|null;heap:number|null;serverRss:number|null;tickP95:number|null}>;
  recording:{frames:number;seconds:number;stutters:number;markers:number;scenario:string};
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
  private origin=performance.now();
  private recording=new PerformanceRecording(this.origin);
  private browser=new BrowserDiagnostics(this.origin);
  private markers:Array<{atMs:number;label:string;position:string}>=[];
  private scenario='';
  private serverSamples:Array<{elapsedMs:number;receivedAt:number;value:ServerPerformance}>=[];
  private contextSamples:Array<{elapsedMs:number;value:unknown}>=[];
  private droppedEvents=0;
  private observing=false;
  private lastPoll=-Infinity;
  private lastHistory=-Infinity;
  private listeners=new Set<(snapshot:DiagnosticSnapshot)=>void>();
  private timer:ReturnType<typeof setInterval>;
  private current:DiagnosticSnapshot;
  constructor(private hooks:{allowed:()=>boolean;capturing:()=>boolean;pending:()=>number;position:()=>string;requestServer:()=>void;observe:(callback:((frame:RenderPerformance|null)=>void)|undefined)=>void;inventory?:()=>SceneInventory|null;context?:()=>unknown}){
    this.current=this.snapshot();
    this.timer=setInterval(()=>this.tick(),500);
    document.addEventListener('visibilitychange',this.visibility);
  }
  forUser(id:string):void {
    if(this.owner===id)return;
    this.owner=id;this.preferences=defaultPreferences();this.lastPoll=-Infinity;this.scenario='';
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
  receiveServer(server:ServerPerformance):void {
    if(!this.enabled())return;this.server=server;this.serverReceivedAt=performance.now();
    this.serverSamples.push({elapsedMs:this.serverReceivedAt-this.origin,receivedAt:Date.now(),value:structuredClone(server)});
    if(this.serverSamples.length>300)this.serverSamples.shift();
  }
  receivePing(ms:number):void {
    if(!this.enabled()||!Number.isFinite(ms))return;
    const at=performance.now();this.pingValues.push({at,ms});this.pingValues=this.pingValues.filter(p=>p.at>=at-30000).slice(-30);
  }
  private enabled():boolean {return !!this.owner&&this.preferences.enabled&&this.hooks.allowed();}
  private capturing():boolean {return this.enabled()&&!document.hidden&&this.hooks.capturing();}
  private visibility=()=>{this.previous=null;if(this.enabled())this.browser.noteVisibility();this.tick();};
  private frame=(render:RenderPerformance|null)=>{
    if(!render||!this.capturing()){this.previous=null;this.browser.capture(false);this.recording.flush();return;}
    const now=performance.now(),previous=this.previous;this.previous=now;this.render=render;
    this.browser.capture(true,now);
    if(previous===null)return;
    const ms=now-previous;this.window.add(now,ms);
    this.recording.add(now,ms,render,1000/this.preferences.targetFps,this.threshold());
    if(ms>=this.threshold()){
      const lastPing=this.pingValues.at(-1);
      this.events.push({at:Date.now(),elapsedMs:now-this.origin,ms,render:{...render,phases:render.phases?{...render.phases}:undefined,detailPhases:render.detailPhases?{...render.detailPhases}:undefined},ping:lastPing&&now-lastPing.at<7000?lastPing.ms:null,
        tickP95:this.serverReceivedAt!==null&&now-this.serverReceivedAt<6000?this.server?.tick.p95Ms??null:null,position:this.hooks.position()});
      if(this.events.length>100){this.events.shift();this.droppedEvents++;}
    }
  };
  private threshold():number {return Math.max(this.preferences.stutterMs,2000/this.preferences.targetFps);}
  private sync():void {
    const on=this.enabled()&&!document.hidden;
    if(on===this.observing)return;
    this.observing=on;this.previous=null;
    this.hooks.observe(on?this.frame:undefined);
    if(on)this.browser.start();else {this.browser.stop();this.recording.flush();}
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
      events:[...this.events],longTasks:this.browser.tasks,history:[...this.history],
      recording:{frames:this.recording.totalFrames,seconds:this.recording.totalActiveMs/1000,stutters:this.recording.totalStutters,markers:this.markers.length,scenario:this.scenario}};
  }
  /** Also called at session/permission transitions: a revoked account loses its observers immediately. */
  refresh():void {this.tick();}
  private tick():void {
    this.sync();const now=performance.now();
    if(!this.capturing()){this.previous=null;this.browser.capture(false,now);this.recording.flush();}
    if(this.enabled()&&!document.hidden&&now-this.lastPoll>=2000){this.lastPoll=now;this.hooks.requestServer();}
    this.current=this.snapshot();
    if(this.enabled()&&!document.hidden&&now-this.lastHistory>=1000){
      this.lastHistory=now;const s=this.current;
      const fresh=s.serverAgeMs!==null&&s.serverAgeMs<6000;
      this.history.push({at:s.at,fps:s.collecting?s.frames.fps:null,low1:s.collecting?s.frames.low1:null,heap:s.memory?.used??null,serverRss:fresh?s.server?.process.rss??null:null,tickP95:fresh?s.server?.tick.p95Ms??null:null});
      if(this.history.length>600)this.history.shift();
      if(this.hooks.context){try{this.contextSamples.push({elapsedMs:now-this.origin,value:this.hooks.context()});if(this.contextSamples.length>600)this.contextSamples.shift();}catch{/* Optional diagnostics never interrupt gameplay. */}}
    }
    for(const listener of this.listeners)listener(this.current);
  }
  reset():void {
    this.window.clear();this.previous=null;this.render=null;this.server=null;this.serverReceivedAt=null;this.pingValues=[];this.events=[];this.history=[];
    this.hooks.observe(undefined);this.browser.stop();this.origin=performance.now();this.recording=new PerformanceRecording(this.origin);this.browser=new BrowserDiagnostics(this.origin);
    this.markers=[];this.serverSamples=[];this.contextSamples=[];this.droppedEvents=0;this.lastHistory=-Infinity;this.observing=false;this.tick();
  }
  setScenario(value:string):void {this.scenario=value.trim().slice(0,160);this.tick();}
  mark(label=this.scenario||'Ponto de comparação'):void {
    if(!this.enabled())return;
    this.markers.push({atMs:performance.now()-this.origin,label:label.trim().slice(0,160),position:this.hooks.position()});if(this.markers.length>100)this.markers.shift();this.tick();
  }
  /** Plain, serializable data also lets automated checks inspect exactly what is downloaded. */
  report(){
    const began=performance.now(),snapshot=this.snapshot();
    let inventory:SceneInventory|null=null,inventoryError:string|null=null;
    if(this.hooks.inventory&&this.hooks.allowed()){try{inventory=this.hooks.inventory();}catch{inventoryError='Não foi possível inspecionar a cena; as demais medições foram preservadas.';}}
    const recording=this.recording.report();
    return {version:2,generatedAt:new Date().toISOString(),...snapshot,
      session:{startedAt:new Date(performance.timeOrigin+this.origin).toISOString(),originMs:this.origin,elapsedMs:performance.now()-this.origin,scenario:this.scenario,markers:[...this.markers]},
      environment:browserEnvironment(),recording,browser:this.browser.report(),inventory,inventoryError,
      serverSamples:[...this.serverSamples],contextSamples:[...this.contextSamples],phaseSources:PHASE_SOURCES,detailSources:DETAIL_SOURCES,
      analysis:analyzeReport(recording,inventory,snapshot),claudePrompt:CLAUDE_PROMPT,references:REPORT_REFERENCES,
      retention:{frameWindowSeconds:this.preferences.windowSeconds,stutterEvents:100,droppedStutterEvents:this.droppedEvents,serverSamples:300,contextSamples:600,historySamples:600},
      exportCollectionMs:performance.now()-began,
      notes:{low1:'1000 / média dos 1% frames mais lentos (mínimo 100 frames)',low01:'1000 / média dos 0,1% frames mais lentos (mínimo 1000 frames)',memory:'Heap JavaScript exposto pelo navegador; não é a RAM total da aba.',cpu:'100% representa um núcleo lógico do processo do mundo.',stutterThresholdMs:this.threshold(),
        units:'Durações em ms, memória em bytes, distâncias em metros. elapsedMs/startMs são relativos a session.originMs no relógio performance.now do cliente; at/receivedAt são epoch ms.',
        timing:'AppStats é uma coleção das últimas medições, não um snapshot atômico: CPU conclui em frameend, draw calls/primitivas pertencem ao frame anterior; GPU é assíncrona e pode repetir por vários frames. Coincidência não prova causalidade.',
        phases:'Blocos exclusivos de BarScene.update. details contém subdivisões de phases.media, nunca somar ao pai. CPU do motor contém sistemas e callbacks: não somar CPU, animationMs e phases como trabalhos independentes. Tarefas fora de update exigem DevTools/LoAF.',
        coverage:'recording agrega todos os frames válidos de jogo; buckets retidos cobrem aproximadamente os últimos 10 min ativos (pausas e altas taxas podem encurtar). Percentis por bucket não podem ser promediados como percentis da sessão. O resumo frames é apenas a janela selecionada.',
        limits:'Sem medição de overdraw por pixel, GPU por objeto, stack completa de CPU, coleta de lixo ou memória física total. null significa indisponível, nunca custo zero.',
        privacy:'Sem chat, cookies, tokens, payloads de rede ou nomes dos jogadores. URLs de recursos contêm apenas caminhos. Texto do cenário e marcadores é fornecido pelo operador.'}};
  }
  export():void {
    const report=this.report();
    const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=document.createElement('a');
    a.href=url;a.download=`bar-desempenho-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  destroy():void {clearInterval(this.timer);this.browser.stop();this.hooks.observe(undefined);document.removeEventListener('visibilitychange',this.visibility);this.listeners.clear();}
}
