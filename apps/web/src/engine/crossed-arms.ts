import * as pc from 'playcanvas';
import {closeHand,handFrame,type HandRig} from './drink-props';
import {aim,reach} from './serving-props';

type ArmBones=Record<'upperarm_r'|'lowerarm_r'|'hand_r'|'upperarm_l'|'lowerarm_l'|'hand_l',pc.Entity>;
export interface CrossedArmsRig {model:pc.Entity;bones:ArmBones;rightHand?:HandRig;drinkHand?:HandRig}
export interface CrossedArmsActor {id:string;active:boolean;available:boolean;rig:CrossedArmsRig}

/** Procedural upper-body overlay. The animation beneath it continues to own the spine, hips and legs. */
export class CrossedArms {
  private readonly saved=new Map<pc.GraphNode,pc.Quat>();
  private readonly weights=new Map<string,number>();

  restore():void {for(const [node,rotation] of this.saved)node.setLocalRotation(rotation);this.saved.clear();}
  private remember(node:pc.GraphNode):void {if(!this.saved.has(node))this.saved.set(node,node.getLocalRotation().clone());}
  private rememberHand(rig:HandRig|undefined):void {
    if(!rig)return;
    this.remember(rig.hand);for(const chain of Object.values(rig.fingers))for(const joint of chain??[])this.remember(joint);
  }
  private placeHand(rig:HandRig|undefined,front:pc.Vec3,alongArm:pc.Vec3,weight:number):void {
    if(!rig)return;
    const before=rig.hand.getRotation().clone();
    aim(rig.hand,handFrame(rig).palm,front);
    aim(rig.hand,handFrame(rig).fingers,alongArm);
    const after=rig.hand.getRotation().clone();rig.hand.setRotation(new pc.Quat().slerp(before,after,weight));
    closeHand(rig,[9*weight,13*weight,10*weight]);
  }
  update(actors:readonly CrossedArmsActor[],dt:number):void {
    const present=new Set(actors.map(actor=>actor.id));
    for(const actor of actors){
      const goal=actor.active&&actor.available?1:0,previous=this.weights.get(actor.id)??0;
      const weight=previous+(goal-previous)*(1-Math.exp(-(goal?12:15)*Math.min(dt,.05)));
      if(weight<.002&&!goal){this.weights.delete(actor.id);continue;}this.weights.set(actor.id,weight);
      const {rig}=actor,b=rig.bones,up=pc.Vec3.UP,front=rig.model.forward.clone().mulScalar(-1);
      this.rememberHand(rig.rightHand);this.rememberHand(rig.drinkHand);
      for(const bone of [b.upperarm_r,b.lowerarm_r,b.hand_r,b.upperarm_l,b.lowerarm_l,b.hand_l])this.remember(bone);
      const shoulderR=b.upperarm_r.getPosition(),shoulderL=b.upperarm_l.getPosition();
      const across=new pc.Vec3().sub2(shoulderL,shoulderR);
      const chest=new pc.Vec3().lerp(shoulderR,shoulderL,.5).sub(up.clone().mulScalar(.18)).add(front.clone().mulScalar(.18));
      // Right forearm lies underneath; left forearm settles above it. Targets inherit each rig's shoulder width.
      const rightTarget=chest.clone().add(across.clone().mulScalar(.38)).sub(up.clone().mulScalar(.08));
      const leftTarget=chest.clone().sub(across.clone().mulScalar(.36)).add(up.clone().mulScalar(.015)).add(front.clone().mulScalar(.018));
      reach(b.upperarm_r,b.lowerarm_r,b.hand_r,rightTarget,front.clone().mulScalar(.28).sub(up),weight);
      reach(b.upperarm_l,b.lowerarm_l,b.hand_l,leftTarget,front.clone().mulScalar(.34).sub(up),weight);
      this.placeHand(rig.rightHand,front.clone().mulScalar(-1),new pc.Vec3().sub2(b.lowerarm_r.getPosition(),b.hand_r.getPosition()).normalize(),weight);
      this.placeHand(rig.drinkHand,front.clone().mulScalar(-1),new pc.Vec3().sub2(b.lowerarm_l.getPosition(),b.hand_l.getPosition()).normalize(),weight);
    }
    for(const id of this.weights.keys())if(!present.has(id))this.weights.delete(id);
  }
  telemetry(){return Object.fromEntries(this.weights);}
  destroy():void {this.restore();this.weights.clear();}
}
