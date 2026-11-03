import * as pc from 'playcanvas';
import {type HeadLook} from '@bar/shared';

/** Applied after animation, restored before the next animation update. Only touches the head joint. */
export class HeadLookPose {
  yaw=0;
  pitch=0;
  private head?:pc.Entity;
  private readonly base=new pc.Quat();
  private readonly turn=new pc.Quat();
  private readonly tilt=new pc.Quat();
  private readonly result=new pc.Quat();
  private readonly right=new pc.Vec3();

  restore():void {
    if(this.head){this.head.setLocalRotation(this.base);this.head=undefined;}
  }

  apply(head:pc.Entity,bodyYaw:number,look:HeadLook,dt:number):void {
    this.restore();
    const blend=1-Math.exp(-12*Math.max(0,dt));
    this.yaw+=(look.headYaw-this.yaw)*blend;
    this.pitch+=(look.headPitch-this.pitch)*blend;
    this.head=head;this.base.copy(head.getLocalRotation());
    this.turn.setFromAxisAngle(pc.Vec3.UP,this.yaw*pc.math.RAD_TO_DEG);
    const heading=bodyYaw+this.yaw;
    this.right.set(Math.cos(heading),0,-Math.sin(heading));
    this.tilt.setFromAxisAngle(this.right,this.pitch*pc.math.RAD_TO_DEG);
    this.result.mul2(this.turn,head.getRotation());
    this.result.mul2(this.tilt,this.result);
    head.setRotation(this.result);
  }
}
