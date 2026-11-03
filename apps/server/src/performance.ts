import {monitorEventLoopDelay} from 'node:perf_hooks';
import {cpus,freemem,totalmem} from 'node:os';
import {TICK_MS,type ServerPerformance} from '@bar/shared';

/** Bounded, thirty-second tick window. CPU and event-loop readings have a one-second interval. */
export class ServerPerformanceSampler {
  private ticks:Array<{at:number;ms:number}>=[];
  private loop=monitorEventLoopDelay({resolution:20});
  private previousCpu=process.cpuUsage();
  private previousAt=performance.now();
  private cpuPercent=0;
  private loopP95=0;
  private loopMax=0;
  private timer:ReturnType<typeof setInterval>;
  constructor(){
    this.loop.enable();
    this.timer=setInterval(()=>this.sampleProcess(),1000);this.timer.unref();
  }
  record(ms:number,at=performance.now()):void {
    if(!Number.isFinite(ms)||ms<0)return;
    this.ticks.push({at,ms});this.prune(at);
  }
  private prune(now:number):void {
    while(this.ticks.length&&(this.ticks[0]!.at<now-30000||this.ticks.length>3000))this.ticks.shift();
  }
  private sampleProcess():void {
    const now=performance.now(),cpu=process.cpuUsage();
    this.cpuPercent=100*((cpu.user-this.previousCpu.user)+(cpu.system-this.previousCpu.system))/Math.max(1,(now-this.previousAt)*1000);
    this.previousAt=now;this.previousCpu=cpu;
    this.loopP95=Number.isFinite(this.loop.mean)?this.loop.percentile(95)/1e6:0;
    this.loopMax=this.loop.max/1e6;this.loop.reset();
  }
  snapshot(world:ServerPerformance['world'],now=performance.now()):ServerPerformance {
    this.prune(now);
    const sorted=this.ticks.map(t=>t.ms).sort((a,b)=>a-b),count=sorted.length;
    const percentile=(p:number)=>count?sorted[Math.max(0,Math.ceil(count*p)-1)]!:null;
    const memory=process.memoryUsage();
    return {at:Date.now(),uptimeS:process.uptime(),
      tick:{targetHz:1000/TICK_MS,actualHz:count>1?(count-1)*1000/Math.max(1,this.ticks[count-1]!.at-this.ticks[0]!.at):0,
        budgetMs:TICK_MS,samples:count,p50Ms:percentile(.5),p95Ms:percentile(.95),p99Ms:percentile(.99),maxMs:count?sorted[count-1]!:null,overBudget:sorted.filter(ms=>ms>TICK_MS).length},
      process:{rss:memory.rss,heapUsed:memory.heapUsed,heapTotal:memory.heapTotal,external:memory.external,cpuPercent:this.cpuPercent},
      host:{totalMem:totalmem(),freeMem:freemem(),cores:cpus().length},loop:{p95Ms:this.loopP95,maxMs:this.loopMax},world};
  }
  destroy():void {clearInterval(this.timer);this.loop.disable();this.ticks=[];}
}
