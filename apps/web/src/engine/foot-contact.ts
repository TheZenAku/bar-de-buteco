/**
 * Foot touchdowns read from the drawn legs, so a footstep sounds when the animation's foot meets the floor, whatever the
 * gait (Walk, Jog, Run, drunk) or its playback rate. Heights are the foot bones' world height above the body's root.
 *
 * Each foot keeps the lowest height it has been seen at (the planted ankle); a touchdown is the foot coming back down
 * to within LAND of it after having lifted past LIFT. The pair of thresholds is hysteresis, so jitter cannot repeat a step.
 */
const LIFT=.06,LAND=.025;
interface Foot {low:number;lifted:boolean}
export class FootContacts {
  /** Touchdowns counted so far (either foot). */
  count=0;
  private readonly feet:Foot[]=[{low:Infinity,lifted:false},{low:Infinity,lifted:false}];
  /** Forget the planted heights (the body left a locomotion clip: they differ per clip). */
  reset():void {for(const foot of this.feet){foot.low=Infinity;foot.lifted=false;}}
  private clip?:string;
  /** One frame of the two feet's heights in the given clip (the planted height changes with the gait, so a new clip starts again); returns true if a foot touched down. */
  sample(left:number,right:number,clip?:string):boolean {
    if(clip!==this.clip){this.clip=clip;this.reset();}
    let touched=false;
    [left,right].forEach((height,i)=>{
      const foot=this.feet[i]!;
      if(height<foot.low)foot.low=height;
      if(height>foot.low+LIFT)foot.lifted=true;
      else if(foot.lifted&&height<foot.low+LAND){foot.lifted=false;touched=true;}
    });
    if(touched)this.count++;
    return touched;
  }
}
