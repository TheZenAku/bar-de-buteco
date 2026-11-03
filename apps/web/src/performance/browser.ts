import {safeUrl} from './recording';

interface ScriptTiming {sourceURL?:string;sourceFunctionName?:string;sourceCharPosition?:number;invoker?:string;duration?:number;forcedStyleAndLayoutDuration?:number}
interface AnimationFrameEntry extends PerformanceEntry {blockingDuration?:number;renderStart?:number;styleAndLayoutStart?:number;scripts?:ScriptTiming[]}
declare const __BAR_BUILD__:{commit:string|null;dirty:boolean|null;builtAt:string;mode:string;engineBuild:string};

/** Browser observers are attached only during authorized diagnostics; all retained lists are bounded. */
export class BrowserDiagnostics {
  private observers:PerformanceObserver[]=[];
  private ranges:Array<{start:number;end:number}>=[];
  private opened:number|null=null;
  private longTasks:Array<{startMs:number;durationMs:number}>=[];
  private longFrames:Array<{startMs:number;durationMs:number;blockingMs:number|null;renderStartMs:number|null;styleStartMs:number|null;scripts:unknown[]}>=[];
  private resources:Array<{path:string;initiator:string;startMs:number;durationMs:number;transferBytes:number;encodedBytes:number;decodedBytes:number;responseStartMs:number;responseEndMs:number;status:number|null}>=[];
  private events:Array<{atMs:number;kind:string;source?:string;line?:number;column?:number}>=[];
  private supported=typeof PerformanceObserver==='undefined'?[]:[...(PerformanceObserver.supportedEntryTypes??[])];
  private failures:string[]=[];
  private counts={longTasks:0,longTaskMs:0,maxLongTaskMs:0,longAnimationFrames:0,resources:0,transferBytes:0,events:0};
  private running=false;
  private resourceBuffered=true;
  constructor(readonly origin:number){}
  capture(on:boolean,at=performance.now()):void {
    if(on&&this.opened===null)this.opened=at;
    if(!on&&this.opened!==null){this.ranges.push({start:this.opened,end:at});if(this.ranges.length>600)this.ranges.shift();this.opened=null;}
  }
  private wasPlaying(entry:PerformanceEntry):boolean {
    // A task delivered after a pause can still belong to the preceding gameplay interval.
    const end=entry.startTime+entry.duration;
    return (this.opened!==null&&entry.startTime>=this.opened)||this.ranges.some(r=>entry.startTime>=r.start&&end<=r.end);
  }
  private observe(type:string,callback:(entry:PerformanceEntry)=>void,buffered=false):void {
    if(!this.supported.includes(type))return;
    try{const observer=new PerformanceObserver(list=>{for(const entry of list.getEntries())callback(entry);});observer.observe({type,buffered});this.observers.push(observer);}
    catch{if(!this.failures.includes(type))this.failures.push(type);}
  }
  start():void {
    if(this.running)return;this.running=true;
    this.observe('longtask',entry=>{
      if(!this.wasPlaying(entry))return;
      this.counts.longTasks++;this.counts.longTaskMs+=entry.duration;this.counts.maxLongTaskMs=Math.max(this.counts.maxLongTaskMs,entry.duration);
      this.longTasks.push({startMs:entry.startTime-this.origin,durationMs:entry.duration});if(this.longTasks.length>200)this.longTasks.shift();
    });
    this.observe('long-animation-frame',entry=>{
      if(!this.wasPlaying(entry))return;
      const frame=entry as AnimationFrameEntry;this.counts.longAnimationFrames++;
      this.longFrames.push({startMs:entry.startTime-this.origin,durationMs:entry.duration,blockingMs:frame.blockingDuration??null,
        renderStartMs:frame.renderStart?frame.renderStart-this.origin:null,styleStartMs:frame.styleAndLayoutStart?frame.styleAndLayoutStart-this.origin:null,
        scripts:(frame.scripts??[]).slice(0,20).map(s=>({source:s.sourceURL?safeUrl(s.sourceURL):null,function:s.sourceFunctionName?.slice(0,160)??null,character:s.sourceCharPosition??null,
          invoker:s.invoker?.slice(0,160)??null,durationMs:s.duration??null,forcedStyleAndLayoutMs:s.forcedStyleAndLayoutDuration??null}))});
      if(this.longFrames.length>100)this.longFrames.shift();
    });
    const resourceBuffered=this.resourceBuffered;this.resourceBuffered=false;
    this.observe('resource',entry=>{
      const r=entry as PerformanceResourceTiming;this.counts.resources++;this.counts.transferBytes+=r.transferSize;
      this.resources.push({path:safeUrl(r.name),initiator:r.initiatorType,startMs:r.startTime-this.origin,durationMs:r.duration,
        transferBytes:r.transferSize,encodedBytes:r.encodedBodySize,decodedBytes:r.decodedBodySize,responseStartMs:r.responseStart-this.origin,responseEndMs:r.responseEnd-this.origin,
        status:(r as PerformanceResourceTiming&{responseStatus?:number}).responseStatus??null});
      if(this.resources.length>1000)this.resources.shift();
    },resourceBuffered);
    if(typeof window!=='undefined'){window.addEventListener('error',this.error);window.addEventListener('unhandledrejection',this.rejection);document.addEventListener('webglcontextlost',this.context,true);document.addEventListener('webglcontextrestored',this.context,true);}
  }
  stop():void {
    this.capture(false);for(const observer of this.observers)observer.disconnect();this.observers=[];this.running=false;
    if(typeof window!=='undefined'){window.removeEventListener('error',this.error);window.removeEventListener('unhandledrejection',this.rejection);document.removeEventListener('webglcontextlost',this.context,true);document.removeEventListener('webglcontextrestored',this.context,true);}
  }
  private event(kind:string,extra:Partial<{source:string;line:number;column:number}>={}):void {this.counts.events++;this.events.push({atMs:performance.now()-this.origin,kind,...extra});if(this.events.length>100)this.events.shift();}
  private error=(event:ErrorEvent)=>{this.event('javascript-error',{source:safeUrl(event.filename),line:event.lineno,column:event.colno});};
  private rejection=()=>this.event('unhandled-rejection');
  noteVisibility():void {if(document.hidden)this.capture(false);this.event(document.hidden?'hidden':'visible');}
  private context=(event:Event)=>this.event(event.type);
  get tasks(){return {supported:this.supported.includes('longtask')&&!this.failures.includes('longtask'),count:this.counts.longTasks,totalMs:this.counts.longTaskMs,maxMs:this.counts.maxLongTaskMs};}
  report(){return {capabilities:{longTasks:this.tasks.supported,longAnimationFrames:this.supported.includes('long-animation-frame')&&!this.failures.includes('long-animation-frame'),resourceTiming:this.supported.includes('resource')&&!this.failures.includes('resource'),observerFailures:[...this.failures]},
    totals:{...this.counts},longTasks:[...this.longTasks],longAnimationFrames:[...this.longFrames],resources:[...this.resources],events:[...this.events],
    retention:{longTasks:200,longAnimationFrames:100,resources:1000,events:100},
    scope:{tasks:'Apenas intervalos de jogo medidos; entradas que atravessam pausas são excluídas.',resources:'Recursos disponíveis no buffer do navegador na ativação e requisições durante a coleta, inclusive menus. startMs negativo indica carregamento anterior à sessão.',
      limitations:'Não inclui todas as requisições desde a abertura se o buffer já descartou entradas. transferBytes=0 pode ser cache OU restrição de Timing-Allow-Origin. encoded/decodedBytes não medem VRAM. Observers não fornecem stack completa de CPU, GC ou tempo GPU por mesh.'}};}
}

export function browserEnvironment(){
  const nav=typeof navigator==='undefined'?null:navigator as Navigator&{deviceMemory?:number;connection?:{effectiveType?:string;downlink?:number;rtt?:number;saveData?:boolean}};
  return {build:typeof __BAR_BUILD__==='undefined'?null:__BAR_BUILD__,userAgent:nav?.userAgent??null,language:nav?.language??null,logicalCores:nav?.hardwareConcurrency??null,deviceMemoryGiB:nav?.deviceMemory??null,
    viewport:typeof window==='undefined'?null:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio,screenWidth:screen.width,screenHeight:screen.height},
    connection:nav?.connection?{effectiveType:nav.connection.effectiveType??null,downlinkMbps:nav.connection.downlink??null,rttEstimateMs:nav.connection.rtt??null,saveData:nav.connection.saveData??false}:null,
    clock:{timeOrigin:performance.timeOrigin,monotonicNow:performance.now(),wallClock:Date.now()},secureContext:typeof isSecureContext==='boolean'?isSecureContext:null};
}
