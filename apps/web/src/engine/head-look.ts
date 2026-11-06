import * as pc from 'playcanvas';
import {type HeadLook} from '@bar/shared';

/** Applied after animation, restored before the next update. Share the turn across the neck and head. */
export class HeadLookPose {
  yaw=0;
  pitch=0;
  private head?:pc.Entity;
  private neck?:pc.GraphNode;
  private readonly base=new pc.Quat();
  private readonly neckBase=new pc.Quat();
  private readonly headWorld=new pc.Quat();
  private readonly offset=new pc.Quat();
  private readonly neckTurn=new pc.Quat();
  private readonly turn=new pc.Quat();
  private readonly tilt=new pc.Quat();
  private readonly result=new pc.Quat();
  private readonly right=new pc.Vec3();

  restore():void {
    if(this.neck){this.neck.setLocalRotation(this.neckBase);this.neck=undefined;}
    if(this.head){this.head.setLocalRotation(this.base);this.head=undefined;}
  }

  apply(head:pc.Entity,bodyYaw:number,look:HeadLook,dt:number):void {
    this.restore();
    const blend=1-Math.exp(-12*Math.max(0,dt));
    this.yaw+=(look.headYaw-this.yaw)*blend;
    this.pitch+=(look.headPitch-this.pitch)*blend;
    this.head=head;this.base.copy(head.getLocalRotation());
    this.headWorld.copy(head.getRotation());
    this.turn.setFromAxisAngle(pc.Vec3.UP,this.yaw*pc.math.RAD_TO_DEG);
    const heading=bodyYaw+this.yaw;
    this.right.set(Math.cos(heading),0,-Math.sin(heading));
    this.tilt.setFromAxisAngle(this.right,this.pitch*pc.math.RAD_TO_DEG);
    this.offset.mul2(this.tilt,this.turn);
    const neck=head.parent;
    if(neck?.name==='neck'){
      this.neck=neck;this.neckBase.copy(neck.getLocalRotation());
      this.neckTurn.slerp(pc.Quat.IDENTITY,this.offset,.4);
      this.result.mul2(this.neckTurn,neck.getRotation());
      neck.setRotation(this.result);
    }
    // Use the original world pose so the head receives the remainder, not the turn a second time.
    this.result.mul2(this.offset,this.headWorld);
    head.setRotation(this.result);
  }
}
