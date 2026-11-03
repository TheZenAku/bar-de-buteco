export interface FrameSummary {
  samples:number;seconds:number;fps:number|null;averageFps:number|null;low1:number|null;low01:number|null;
  p50:number|null;p95:number|null;p99:number|null;max:number|null;stutters:number;severe:number;
}
export interface FrameSample {at:number;ms:number}

/** Frame intervals use an unclamped monotonic clock, including stalls above the engine's 100 ms dt limit. */
export class FrameWindow {
  private values:FrameSample[]=[];
  private start=0;
  add(at:number,ms:number):void {
    if(!Number.isFinite(at)||!Number.isFinite(ms)||ms<=0)return;
    this.values.push({at,ms});
    // Hard limit also bounds collection at very high refresh rates before the next UI update.
    if(this.values.length-this.start>24000)this.start++;
    if(this.start>4096){this.values=this.values.slice(this.start);this.start=0;}
  }
  samples(now:number,seconds:number):FrameSample[] {
    while(this.start<this.values.length&&this.values[this.start]!.at<now-seconds*1000)this.start++;
    return this.values.slice(this.start);
  }
  summary(now:number,seconds:number,stutterMs:number):FrameSummary {
    const samples=this.samples(now,seconds),sorted=samples.map(s=>s.ms).sort((a,b)=>a-b),count=sorted.length;
    const total=sorted.reduce((sum,ms)=>sum+ms,0),recent=samples.filter(s=>s.at>now-1000);
    const quantile=(p:number)=>count?sorted[Math.max(0,Math.ceil(count*p)-1)]!:null;
    // 1% low is the reciprocal of the MEAN of the slowest 1%, not 1000 / p99.
    const low=(fraction:number,min:number)=>{if(count<min)return null;const tail=sorted.slice(-Math.ceil(count*fraction));return 1000/(tail.reduce((sum,n)=>sum+n,0)/tail.length);};
    return {samples:count,seconds:total/1000,fps:recent.length?recent.length*1000/recent.reduce((sum,s)=>sum+s.ms,0):null,
      averageFps:count?count*1000/total:null,low1:low(.01,100),low01:low(.001,1000),p50:quantile(.5),p95:quantile(.95),p99:quantile(.99),max:count?sorted[count-1]!:null,
      stutters:sorted.filter(ms=>ms>=stutterMs).length,severe:sorted.filter(ms=>ms>=Math.max(100,stutterMs)).length};
  }
  clear():void {this.values=[];this.start=0;}
}
