import * as pc from 'playcanvas';
import {closeHand,handFrame,type HandRig} from './drink-props';
import {aim,openHand,reach} from './serving-props';

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
  // Fingers continue the forearm (pointing them back at the elbow folded the wrist), then the palm turns about them.
  private placeHand(rig:HandRig|undefined,fingers:pc.Vec3,palm:pc.Vec3,weight:number,curl:readonly number[]):void {
    if(!rig)return;
    const before=rig.hand.getRotation().clone();
    aim(rig.hand,handFrame(rig).fingers,fingers);
    const along=handFrame(rig).fingers,facing=palm.clone().sub(along.clone().mulScalar(palm.dot(along)));
    if(facing.lengthSq()>1e-6)aim(rig.hand,handFrame(rig).palm,facing);
    const after=rig.hand.getRotation().clone();rig.hand.setRotation(new pc.Quat().slerp(before,after,weight));
    // The clip's curl plus ours made fists: straighten first (blended by weight), then close a little.
    const joints=Object.values(rig.fingers).flat().filter((j):j is pc.Entity=>!!j),clip=joints.map(j=>j.getLocalRotation().clone());
    openHand(rig);joints.forEach((j,i)=>j.setLocalRotation(new pc.Quat().slerp(clip[i]!,j.getLocalRotation(),weight)));
    closeHand(rig,curl.map(a=>a*weight));
  }
  update(actors:readonly CrossedArmsActor[],dt:number):void {
    // Tuned by eye on tiao and rafael. Fingers: [forearm, front, up, towards the other side]; palms: [front, up, other side].
    const P={chestDown:.14,chestFront:.14,rAcross:.22,rDown:.05,rFront:0,lAcross:.2,lDown:.01,lFront:.03,poleFront:.3,poleOut:.15,
      rFing:[.6,-1,0,0],rPalm:[-1,0,-.3],lFing:[1,-.6,-.9,0],lPalm:[-1,-.3,-.3],curl:[15,20,12]};
    const present=new Set(actors.map(actor=>actor.id));
    for(const actor of actors){
      const goal=actor.active&&actor.available?1:0,previous=this.weights.get(actor.id)??0;
      const weight=previous+(goal-previous)*(1-Math.exp(-(goal?12:15)*Math.min(dt,.05)));
      if(weight<.002&&!goal){this.weights.delete(actor.id);continue;}this.weights.set(actor.id,weight);
      const {rig}=actor,b=rig.bones,up=pc.Vec3.UP,front=rig.model.forward.clone().mulScalar(-1);
      this.rememberHand(rig.rightHand);this.rememberHand(rig.drinkHand);
      for(const bone of [b.upperarm_r,b.lowerarm_r,b.hand_r,b.upperarm_l,b.lowerarm_l,b.hand_l])this.remember(bone);
      const shoulderR=b.upperarm_r.getPosition(),shoulderL=b.upperarm_l.getPosition();
      const across=new pc.Vec3().sub2(shoulderL,shoulderR),out=across.clone().normalize();
      const chest=new pc.Vec3().lerp(shoulderR,shoulderL,.5).sub(up.clone().mulScalar(P.chestDown)).add(front.clone().mulScalar(P.chestFront));
      const v=(f:number,u:number,o:number)=>front.clone().mulScalar(f).add(up.clone().mulScalar(u)).add(out.clone().mulScalar(o));
      const rightTarget=chest.clone().add(across.clone().mulScalar(P.rAcross)).add(v(P.rFront,-P.rDown,0));
      const leftTarget=chest.clone().sub(across.clone().mulScalar(P.lAcross)).add(v(P.lFront,-P.lDown,0));
      reach(b.upperarm_r,b.lowerarm_r,b.hand_r,rightTarget,v(P.poleFront,-1,-P.poleOut),weight);
      reach(b.upperarm_l,b.lowerarm_l,b.hand_l,leftTarget,v(P.poleFront,-1,P.poleOut),weight);
      const hand=(lower:pc.Entity,end:pc.Entity,k:readonly number[],side:number)=>new pc.Vec3().sub2(end.getPosition(),lower.getPosition()).normalize().mulScalar(k[0]!).add(v(k[1]!,k[2]!,side*k[3]!)).normalize();
      this.placeHand(rig.rightHand,hand(b.lowerarm_r,b.hand_r,P.rFing,1),v(P.rPalm[0]!,P.rPalm[1]!,P.rPalm[2]!),weight,P.curl);
      this.placeHand(rig.drinkHand,hand(b.lowerarm_l,b.hand_l,P.lFing,-1),v(P.lPalm[0]!,P.lPalm[1]!,-P.lPalm[2]!),weight,P.curl);
    }
    for(const id of this.weights.keys())if(!present.has(id))this.weights.delete(id);
  }
  telemetry(){return Object.fromEntries(this.weights);}
  destroy():void {this.restore();this.weights.clear();}
}
