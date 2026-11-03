/** Administrative diagnostics. Durations are milliseconds, memory is bytes. */
export interface ServerPerformance {
  at:number;
  uptimeS:number;
  tick:{targetHz:number;actualHz:number;budgetMs:number;samples:number;p50Ms:number|null;p95Ms:number|null;p99Ms:number|null;maxMs:number|null;overBudget:number};
  process:{rss:number;heapUsed:number;heapTotal:number;external:number;cpuPercent:number};
  host:{totalMem:number;freeMem:number;cores:number};
  loop:{p95Ms:number;maxMs:number};
  world:{players:number;capacity:number;npcs:number;motos:number;walletRetries:number;resultOutbox:number;logQueue:number;apiAgeMs:number|null};
}
