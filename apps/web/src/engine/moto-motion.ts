import {PATCH_MS,TICK_MS,type MotoBody,type MotoState} from '@bar/shared';

/**
 * How a bike's 20 Hz simulation becomes smooth motion on screen. Nothing here smooths by chasing a target: a filter on a position
 * that jumps .75 m per tick (flat out) makes the drawn speed swing around the real one, and the bike shakes more the faster it goes.
 * The rider sees the two last simulated ticks blended by the time since the last one (the fixed step with interpolation of "Fix Your
 * Timestep"); everyone else sees the room's past samples, played back a little late by the bike's own clock (snapshot interpolation).
 */
const TICK=TICK_MS/1000;
/** A longer jump than this is the bike being moved (a slow frame's catch-up is far shorter): it does not fly there. */
export const SNAP_DISTANCE=6;
/** How fast a correction from the room fades (per second): it never shows as a jump, nor shakes what is drawn. */
const CORRECTION_FADE=10;
/** The most ticks one frame simulates: after a long freeze the room has already let go of the controls. */
const MAX_TICKS_PER_FRAME=5;
/** How late the others' bikes are drawn: two patches, so one that comes late or not at all never runs out of samples. */
export const PLAYBACK_DELAY_MS=2*PATCH_MS;
/** Past the last sample, it goes on by its own speed for this long, then waits. */
const MAX_EXTRAPOLATION_MS=2*PATCH_MS;
/** The arrival clock forgets its fastest patch slowly (milliseconds per millisecond), in case the connection gets slower for good. */
const LEAD_LEAK=.002;
/** And the playback follows it only this much faster or slower than real time, so that adjusting never shows. */
const LEAD_SLEW=.05;
/** A sample this far behind the playback (milliseconds): the bike stood still, or stalled, and its clock with it. Starts over from it. */
const RESYNC_MS=300;
const SAMPLES=8;

/** The shortest way round between two headings (radians). */
const turnBetween=(from:number,to:number)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));
/** How a fallen bike lies (MotoState). */
type Lying=Partial<Pick<MotoState,'qx'|'qy'|'qz'|'qw'>>;
/** The pose between two states; speed and handlebar are the newer one's. */
function blend(a:MotoBody&Lying,b:MotoBody&Lying,t:number):MotoBody {
  const pose:MotoBody&Lying={...b,x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t,yaw:a.yaw+turnBetween(a.yaw,b.yaw)*t,pitch:a.pitch+(b.pitch-a.pitch)*t};
  if(a.qw!==undefined&&b.qw!==undefined){
    // The shorter way round, normalised: close enough at 20 samples a second.
    const same=a.qx!*b.qx!+a.qy!*b.qy!+a.qz!*b.qz!+a.qw*b.qw<0?-1:1;
    const x=a.qx!+(b.qx!*same-a.qx!)*t,y=a.qy!+(b.qy!*same-a.qy!)*t,z=a.qz!+(b.qz!*same-a.qz!)*t,w=a.qw+(b.qw*same-a.qw)*t,size=Math.hypot(x,y,z,w)||1;
    pose.qx=x/size;pose.qy=y/size;pose.qz=z/size;pose.qw=w/size;
  }
  return pose;
}

/** The rider's own bike: simulated in whole ticks by the frames' real time, drawn between the last two. */
export class PredictedRide {
  private previous:MotoBody;
  private current:MotoBody;
  private clock=0;
  private readonly error={x:0,y:0,z:0,yaw:0};
  constructor(body:MotoBody) {this.previous=body;this.current=body;}
  /** Time passes: `step` gives the next tick's state (the same state when nothing is sent). */
  advance(dt:number,step:(body:MotoBody)=>MotoBody):void {
    this.clock+=dt;
    for(let ticks=0;this.clock>=TICK&&ticks<MAX_TICKS_PER_FRAME;ticks++){this.previous=this.current;this.current=step(this.current);this.clock-=TICK;}
    if(this.clock>=TICK)this.clock=0;
    const fade=Math.exp(-CORRECTION_FADE*dt),{error}=this;
    error.x*=fade;error.y*=fade;error.z*=fade;error.yaw*=fade;
  }
  /**
   * The room's bike with the inputs it has not reached replayed on top. When it matches the prediction nothing shows. When it
   * does not, the simulation takes it at once, and the difference is kept aside to fade out of the drawing.
   */
  correct(body:MotoBody):void {
    const {current,previous,error}=this,dx=current.x-body.x,dy=current.y-body.y,dz=current.z-body.z,turn=turnBetween(body.yaw,current.yaw);
    if(Math.hypot(dx,dz)>SNAP_DISTANCE){this.previous=this.current=body;error.x=error.y=error.z=error.yaw=0;return;}
    this.previous={...previous,x:previous.x-dx,y:previous.y-dy,z:previous.z-dz,yaw:previous.yaw-turn};
    this.current=body;
    error.x+=dx;error.y+=dy;error.z+=dz;error.yaw+=turn;
  }
  /** What to draw this frame. */
  pose():MotoBody {
    const pose=blend(this.previous,this.current,this.clock/TICK),{error}=this;
    pose.x+=error.x;pose.y+=error.y;pose.z+=error.z;pose.yaw+=error.yaw;
    return pose;
  }
}

/**
 * Somebody else's bike (or one nobody rides): the room's samples played back PLAYBACK_DELAY_MS late, by the bike's own clock (its
 * steps, MotoState.ticks). The room's hour would not do: a patch can carry none, one or three steps, and the same stretch of road
 * would be drawn in as many speeds.
 */
export class RoomTrack {
  private readonly samples:Array<{at:number;body:MotoBody}>=[];
  /** Bike's clock minus local time on the fastest patch: what is left of the difference is the patches' lateness. */
  private fastest=-Infinity;
  private fastestAt=0;
  /** The same difference as the playback uses it, closing on `fastest` smoothly. */
  private lead=-Infinity;
  private leadAt=0;
  /** A patch arrived, with this browser's `now` in milliseconds. */
  push(state:MotoState,now:number):void {
    const at=state.ticks*TICK_MS,last=this.samples[this.samples.length-1];
    // No step since the last patch, but it may have changed (the rider got off and it stopped).
    if(last&&at<=last.at){last.body=state;return;}
    const ahead=at-now;
    if(ahead<this.lead-RESYNC_MS)this.lead=this.fastest=ahead;
    this.fastest=Math.max(ahead,this.fastest-(now-this.fastestAt)*LEAD_LEAK);this.fastestAt=now;
    if(this.lead===-Infinity){this.lead=this.fastest;this.leadAt=now;}
    this.samples.push({at,body:state});
    if(this.samples.length>SAMPLES)this.samples.shift();
  }
  /** Where to draw it at this browser's `now`. */
  sample(now:number):MotoBody|undefined {
    const {samples}=this,slew=Math.max(0,now-this.leadAt)*LEAD_SLEW;
    if(!samples.length)return;
    this.lead+=Math.max(-slew,Math.min(slew,this.fastest-this.lead));this.leadAt=now;
    const at=now+this.lead-PLAYBACK_DELAY_MS;
    if(at<=samples[0]!.at)return samples[0]!.body;
    for(let i=samples.length-1;i>0;i--){
      const newer=samples[i]!,older=samples[i-1]!;
      if(at<older.at)continue;
      if(at>=newer.at)break;
      return Math.hypot(newer.body.x-older.body.x,newer.body.z-older.body.z)>SNAP_DISTANCE?newer.body:blend(older.body,newer.body,(at-older.at)/(newer.at-older.at));
    }
    const {body,at:last}=samples[samples.length-1]!,ahead=Math.min(at-last,MAX_EXTRAPOLATION_MS)/1000;
    return {...body,x:body.x+Math.sin(body.yaw)*body.speed*ahead,z:body.z+Math.cos(body.yaw)*body.speed*ahead};
  }
}
