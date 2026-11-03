import type {RenderPerformance} from './monitor';

export interface Distribution {samples:number;mean:number|null;p50:number|null;p95:number|null;p99:number|null;max:number|null}
export function distribution(values:number[]):Distribution {
  const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b),n=sorted.length;
  const p=(v:number)=>n?sorted[Math.ceil(n*v)-1]!:null;
  return {samples:n,mean:n?sorted.reduce((s,v)=>s+v,0)/n:null,p50:p(.5),p95:p(.95),p99:p(.99),max:n?sorted[n-1]!:null};
}

/** Linear, exclusive sections of BarScene.update. No clock reads when diagnostics are off. */
export class UpdateProfiler {
  enabled=false;
  readonly timings:Record<string,number>={};
  private at=0;
  begin():void {if(this.enabled){for(const key in this.timings)this.timings[key]=0;this.at=performance.now();}}
  mark(name:string):void {if(!this.enabled)return;const now=performance.now();this.timings[name]=now-this.at;this.at=now;}
}

export const PHASE_SOURCES:Record<string,string>={
  setup:'apps/web/src/engine/BarScene.ts: update (portas, resolução adaptativa)',
  avatars:'apps/web/src/engine/BarScene.ts: animateAvatar (poses e props; avaliação de AnimComponent é separada)',
  client:'apps/web/src/main.ts: SceneCallbacks.onFrame → networking.ts: rideFrame (predição da moto)',
  vehicles:'apps/web/src/engine/BarScene.ts: motos.update, placeRiders, placeThrown, blowEffects',
  barEffects:'apps/web/src/engine/BarScene.ts: musicians.frame, barAnimations.frame, placeServed, mapEffects.update',
  camera:'apps/web/src/engine/BarScene.ts: feelSpeed, CameraRig.follow, showOwnHead',
  streaming:'apps/web/src/engine/city-streaming.ts: CityStreaming.update',
  lighting:'apps/web/src/engine/BarScene.ts: environment, surfaces, jukeboxLights, stageLights',
  stage:'apps/web/src/engine/BarScene.ts: foosballBalls, poolBalls, stageShow',
  markers:'apps/web/src/engine/BarScene.ts: marcadores, luzes de festa, discoBall',
  media:'apps/web/src/main.ts: SceneCallbacks.onMediaFrame',
};
export const DETAIL_SOURCES={mouse:'apps/web/src/mouse-capture.ts: sync',video:'apps/web/src/main.ts: media.frame e durações de jukebox/TV',minimap:'apps/web/src/main.ts: minimap.render',blips:'apps/web/src/main.ts: projeção e atualização dos indicadores',voice:'apps/web/src/voice.ts: update e renderVoiceLevel',audioButton:'apps/web/src/main.ts: atualização do botão de som'};

const METRICS=['frameMs','updateMs','renderMs','gpuMs','drawCalls','primitives','vram','actors','resting','compiling','animationMs','physicsMs','systemUpdateMs','systemPostUpdateMs','width','height','scale'] as const;
type Metric=typeof METRICS[number];
export interface RecordingBucket {
  startMs:number;endMs:number;frames:number;activeMs:number;overBudget:number;stutters:number;
  metrics:Record<Metric,Distribution>;phases:Record<string,Distribution>;details:Record<string,Distribution>;
}
/** One-second distributions include EVERY collected frame, rather than a single timer sample. */
export class PerformanceRecording {
  readonly buckets:RecordingBucket[]=[];
  private values:Partial<Record<Metric,number[]>>={};
  private phases:Record<string,number[]>={};
  private details:Record<string,number[]>={};
  private start:number|null=null;
  private end=0;
  private count=0;
  private activeMs=0;
  private overBudget=0;
  private stutters=0;
  totalFrames=0;totalActiveMs=0;totalStutters=0;totalOverBudget=0;droppedBuckets=0;
  constructor(readonly origin:number,readonly limit=600){}
  add(at:number,ms:number,render:RenderPerformance,budget:number,threshold:number):void {
    if(!Number.isFinite(ms)||ms<=0||!Number.isFinite(at))return;
    if(this.start!==null&&(at-this.start>=1000||this.count>=2000))this.flush();
    this.start??=at;this.end=at;this.count++;this.activeMs+=ms;this.totalFrames++;this.totalActiveMs+=ms;
    if(ms>budget){this.overBudget++;this.totalOverBudget++;}
    if(ms>=threshold){this.stutters++;this.totalStutters++;}
    for(const key of METRICS){
      const value=key==='frameMs'?ms:render[key as keyof RenderPerformance];
      if(typeof value==='number'&&Number.isFinite(value))(this.values[key]??=[]).push(value);
    }
    for(const [name,value] of Object.entries(render.phases??{}))if(Number.isFinite(value))(this.phases[name]??=[]).push(value);
    for(const [name,value] of Object.entries(render.detailPhases??{}))if(Number.isFinite(value))(this.details[name]??=[]).push(value);
  }
  private current():RecordingBucket|null {
    if(this.start===null)return null;
    return {startMs:this.start-this.origin,endMs:this.end-this.origin,frames:this.count,activeMs:this.activeMs,overBudget:this.overBudget,stutters:this.stutters,
      metrics:Object.fromEntries(METRICS.map(key=>[key,distribution(this.values[key]??[])])) as Record<Metric,Distribution>,
      phases:Object.fromEntries(Object.entries(this.phases).map(([name,values])=>[name,distribution(values)])),
      details:Object.fromEntries(Object.entries(this.details).map(([name,values])=>[name,distribution(values)]))};
  }
  flush():void {
    const bucket=this.current();if(bucket)this.buckets.push(bucket);
    if(this.buckets.length>this.limit){this.buckets.shift();this.droppedBuckets++;}
    this.values={};this.phases={};this.details={};this.start=null;this.count=0;this.activeMs=0;this.overBudget=0;this.stutters=0;
  }
  report(){
    const current=this.current(),all=current?[...this.buckets,current]:[...this.buckets];
    const retained=all.slice(-this.limit);
    return {totalFrames:this.totalFrames,activeSeconds:this.totalActiveMs/1000,averageFps:this.totalActiveMs?this.totalFrames*1000/this.totalActiveMs:null,
      totalStutters:this.totalStutters,totalOverBudget:this.totalOverBudget,retention:{limit:this.limit,droppedBuckets:this.droppedBuckets+Math.max(0,all.length-this.limit)},buckets:retained};
  }
}

/** Avoid credentials, URL queries and fragments in exported resource/source locations. */
export function safeUrl(value:string):string {
  try{const url=new URL(value,'http://diagnostic.local');return /^https?:$/.test(url.protocol)?url.pathname.slice(0,400):`[${url.protocol.replace(':','')}]`;}
  catch{return '[invalid URL]';}
}
