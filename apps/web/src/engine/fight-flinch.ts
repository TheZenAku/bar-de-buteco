import * as pc from 'playcanvas';

/**
 * The jolt of a blow (docs/sistemas/luta.md), on top of the reaction clip: the upper body thrown back the way the punch was going and coming back
 * on its own, like a spring hit once. The clip says how the body reacts; this says where the blow came from, which the clip cannot know.
 * Applied after the clips posed the skeleton, restored before they run again (the head look's pattern, head-look.ts).
 */
const PEAK_S=.07,GONE_S=.6;
/** How the jolt is shared from the waist up (the head, last, takes the most). */
const SHARES=[.22,.22,.18,.38];

export class FlinchPose {
  private readonly blows:{at:number;yaw:number;degrees:number}[]=[];
  private readonly saved:{node:pc.GraphNode;rotation:pc.Quat}[]=[];
  private readonly axis=new pc.Vec3();
  private readonly turn=new pc.Quat();
  private readonly world=new pc.Quat();

  /** A blow now (scene seconds), going this way (radians, as a heading), this hard (degrees at its peak). */
  hit(at:number,yaw:number,degrees:number):void {
    this.blows.push({at,yaw,degrees});
    if(this.blows.length>3)this.blows.shift();
  }
  get active():boolean {return this.blows.length>0;}

  restore():void {
    for(let i=this.saved.length-1;i>=0;i--){const {node,rotation}=this.saved[i]!;node.setLocalRotation(rotation);}
    this.saved.length=0;
  }

  /** `chain`: the spine's middle and top, the neck and the head, the waist first. */
  apply(chain:readonly (pc.GraphNode|null|undefined)[],now:number):void {
    this.restore();
    for(let i=this.blows.length-1;i>=0;i--)if(now-this.blows[i]!.at>GONE_S)this.blows.splice(i,1);
    if(!this.blows.length)return;
    // The blows add up as one tilt about a level axis: up × the way the blow goes leans the body along it.
    let ax=0,az=0;
    for(const blow of this.blows){
      const t=Math.max(0,now-blow.at)/PEAK_S,amount=blow.degrees*t*Math.exp(1-t);
      ax+=Math.cos(blow.yaw)*amount;az+=-Math.sin(blow.yaw)*amount;
    }
    const degrees=Math.hypot(ax,az);
    if(degrees<.05)return;
    this.axis.set(ax/degrees,0,az/degrees);
    chain.forEach((node,i)=>{
      if(!node)return;
      this.saved.push({node,rotation:node.getLocalRotation().clone()});
      this.turn.setFromAxisAngle(this.axis,degrees*SHARES[i]!);
      this.world.mul2(this.turn,node.getRotation());
      node.setRotation(this.world);
    });
  }
}
