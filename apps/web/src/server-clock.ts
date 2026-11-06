/** Server epoch + monotonic elapsed time: changing the computer's clock cannot move the game sun. */
export class ServerClock {
  private anchor?:{server:number;local:number};
  private latency=0;
  constructor(private readonly monotonic:()=>number=()=>performance.now(),private readonly wall:()=>number=()=>Date.now()){}
  now():number {return this.anchor?this.anchor.server+this.monotonic()-this.anchor.local:this.wall();}
  sync(serverTime:number,latencyMs=this.latency):void {
    if(!Number.isFinite(serverTime)||serverTime<=0||!Number.isFinite(latencyMs)||latencyMs<0)return;
    this.latency=Math.min(latencyMs,5000);
    this.anchor={server:serverTime+this.latency,local:this.monotonic()};
  }
}
