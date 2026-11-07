import * as pc from 'playcanvas';
import {smokingTimeline,type SmokingState} from '@bar/shared';
import {BarParticles} from './bar-animations';
import {SMOKING_LIPS} from './smoking-pose';
import {closeHand,handFrame,type HandRig} from './drink-props';
import {aim,openHand,reach} from './serving-props';

type Bones=Record<'head'|'upperarm_r'|'lowerarm_r'|'hand_r'|'upperarm_l'|'lowerarm_l'|'hand_l',pc.Entity>;
export interface CigaretteRig {model:pc.Entity;bones:Bones;headBind?:pc.Quat;rightHand?:HandRig;drinkHand?:HandRig}
export interface CigaretteActor {id:string;skin:string;state:SmokingState;rig:CigaretteRig;armsFree:boolean;hidden?:boolean}
interface Kit {root:pc.Entity;cigarette:pc.Entity;lighter:pc.Entity;flame:pc.Entity;ember:pc.StandardMaterial;tip:pc.Entity;mouth:pc.Entity;phase:string;inhale:number;exhale:number;contact:number}
const ease=(v:number)=>{const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t);};

/** Small upper-body greeting above the imported nod. Hips, legs and feet are never touched. */
export function counterRequest(rig:CigaretteRig,age:number,body:pc.Entity):void {
  const weight=ease(age/.32)*(1-ease((age-1.15)/.55));if(weight<.001||!rig.rightHand)return;
  const {bones}=rig,front=body.forward.clone().mulScalar(-1),side=body.right.clone().mulScalar(-1),up=pc.Vec3.UP;
  const target=bones.upperarm_r.getPosition().clone().add(front.clone().mulScalar(.28)).sub(up.clone().mulScalar(.07)).add(side.clone().mulScalar(.03));
  reach(bones.upperarm_r,bones.lowerarm_r,bones.hand_r,target,side.clone().mulScalar(.5).sub(up),weight);
  const before=bones.hand_r.getRotation().clone();aim(bones.hand_r,handFrame(rig.rightHand).palm,front);
  const after=bones.hand_r.getRotation().clone();bones.hand_r.setRotation(new pc.Quat().slerp(before,after,weight));
  openHand(rig.rightHand);closeHand(rig.rightHand,[7*weight,10*weight,6*weight]);
}

/** A cigarette attached to the evaluated lips, not a whole-body animation. Arm overlays restore before the next animation tick. */
export class Cigarettes {
  private readonly kits=new Map<string,Kit>();
  private readonly saved=new Map<pc.GraphNode,pc.Quat>();
  private readonly particles:BarParticles;
  private readonly materials:pc.StandardMaterial[]=[];
  private readonly paper:pc.StandardMaterial;
  private readonly filter:pc.StandardMaterial;
  private readonly ash:pc.StandardMaterial;
  private readonly metal:pc.StandardMaterial;
  private readonly blue:pc.StandardMaterial;
  private readonly fire:pc.StandardMaterial;
  constructor(private readonly app:pc.Application){
    const material=(color:string,metalness=0,emissive?:string)=>{
      const m=new pc.StandardMaterial();m.diffuse=new pc.Color().fromString(color);m.useMetalness=true;m.metalness=metalness;m.gloss=metalness ? .65:.2;
      if(emissive){m.emissive=new pc.Color().fromString(emissive);m.emissiveIntensity=2;}
      m.update();this.materials.push(m);return m;
    };
    this.paper=material('#e8e1d1');this.filter=material('#c69858');this.ash=material('#77736b');this.metal=material('#929b9e',.9);this.blue=material('#224c70');this.fire=material('#ffb33f',0,'#ff8f23');
    this.particles=new BarParticles(app,900);
  }
  private shape(parent:pc.Entity,name:string,type:'cylinder'|'box'|'sphere'|'cone',position:number[],scale:number[],material:pc.StandardMaterial){
    const e=new pc.Entity(name);parent.addChild(e);e.setLocalPosition(position[0]!,position[1]!,position[2]!);e.setLocalScale(scale[0]!,scale[1]!,scale[2]!);
    e.addComponent('render',{type,material,castShadows:false,receiveShadows:true});return e;
  }
  private kit(id:string){
    const root=new pc.Entity(`Cigarette ${id}`);this.app.root.addChild(root);
    const cigarette=new pc.Entity('Cigarette lips to ember');root.addChild(cigarette);
    this.shape(cigarette,'Cork filter','cylinder',[0,.012,0],[.0067,.024,.0067],this.filter);
    this.shape(cigarette,'Paper','cylinder',[0,.048,0],[.0064,.048,.0064],this.paper);
    this.shape(cigarette,'Ash rim','cylinder',[0,.073,0],[.0067,.003,.0067],this.ash);
    const ember=new pc.StandardMaterial();ember.diffuse.set(.28,.07,.015);ember.emissive.set(1,.16,.015);ember.update();
    this.shape(cigarette,'Ember','sphere',[0,.0755,0],[.0059,.002,.0059],ember);
    const lighter=new pc.Entity('Lighter in left hand');root.addChild(lighter);
    this.shape(lighter,'Lighter body','box',[0,.003,0],[.018,.045,.012],this.blue);
    this.shape(lighter,'Lighter cap','box',[0,.028,0],[.018,.009,.013],this.metal);
    this.shape(lighter,'Thumb wheel','cylinder',[0,.035,0],[.009,.005,.009],this.metal);
    const flame=this.shape(lighter,'Flame','cone',[0,.046,0],[.008,.025,.008],this.fire);
    const tip=new pc.Entity('Cigarette smoke origin'),mouth=new pc.Entity('Exhale origin');root.addChild(tip);root.addChild(mouth);
    const kit:Kit={root,cigarette,lighter,flame,ember,tip,mouth,phase:'off',inhale:0,exhale:0,contact:0};this.kits.set(id,kit);return kit;
  }
  restore():void {for(const [node,q] of this.saved)node.setLocalRotation(q);this.saved.clear();}
  private remember(node:pc.GraphNode){if(!this.saved.has(node))this.saved.set(node,node.getLocalRotation().clone());}
  private hand(rig:CigaretteRig,side:'l'|'r',target:pc.Vec3,front:pc.Vec3,up:pc.Vec3,weight:number):pc.Vec3{
    const b=rig.bones,upper=b[`upperarm_${side}`],lower=b[`lowerarm_${side}`],hand=b[`hand_${side}`],grip=side==='r'?rig.rightHand:rig.drinkHand;
    if(weight<.001)return hand.getPosition().clone();
    for(const node of [upper,lower,hand])this.remember(node);
    if(grip)for(const chain of Object.values(grip.fingers))for(const joint of chain??[])this.remember(joint);
    const pole=front.clone().mulScalar(.2).sub(up.clone().mulScalar(.8)).add(rig.model.right.clone().mulScalar(side==='r'?-.45:.45));
    const wristGoal=target.clone().sub(up.clone().mulScalar(.07));
    reach(upper,lower,hand,wristGoal,pole,weight);
    if(!grip)return hand.getPosition().clone();
    const before=hand.getRotation().clone();
    aim(hand,handFrame(grip).palm,front);
    const fingers=up.clone().mulScalar(.85).add(rig.model.right.clone().mulScalar(side==='r'?.4:-.4)).normalize();
    aim(hand,handFrame(grip).fingers,fingers);
    const desired=hand.getRotation().clone();hand.setRotation(new pc.Quat().slerp(before,desired,weight));
    closeHand(grip,side==='r'?[18*weight,25*weight,12*weight]:[30*weight,45*weight,25*weight]);
    const pinch=()=>{
      const index=grip.fingers.index?.at(-1),thumb=grip.fingers.thumb?.at(-1);
      if(index&&thumb)return new pc.Vec3().lerp(index.getPosition(),thumb.getPosition(),.5);
      const f=handFrame(grip);return f.origin.add(f.fingers.mulScalar(f.length*.8));
    };
    const rotation=hand.getRotation().clone(),delta=target.clone().sub(pinch());
    reach(upper,lower,hand,hand.getPosition().clone().add(delta),pole,weight);hand.setRotation(rotation);
    return pinch();
  }
  update(actors:readonly CigaretteActor[],now:number,dt:number,camera:pc.Entity,height:number){
    const active=new Set<string>();
    for(const actor of actors){
      const phase=smokingTimeline(actor.state,now,actor.id);if(phase.phase==='off'||actor.hidden)continue;
      active.add(actor.id);const k=this.kits.get(actor.id)??this.kit(actor.id),{rig}=actor,head=rig.bones.head;
      k.root.enabled=true;k.phase=phase.phase;k.inhale=phase.inhale;k.exhale=phase.exhale;
      const turn=head.getRotation().clone().mul((rig.headBind??pc.Quat.IDENTITY).clone().invert());
      // The right corner leaves the middle/left of the lips free for a drink in the other hand.
      const lip=SMOKING_LIPS[actor.skin]??[0,-.02,.135],mouth=turn.transformVector(new pc.Vec3(lip[0]-.018,lip[1],lip[2])).add(head.getPosition());
      const front=turn.transformVector(new pc.Vec3(0,0,1)),up=turn.transformVector(pc.Vec3.UP),outward=turn.transformVector(new pc.Vec3(-.22,-.16,1).normalize());
      const pocket=rig.bones.upperarm_r.getPosition().clone().sub(pc.Vec3.UP.clone().mulScalar(.46)).add(rig.model.forward.clone().mulScalar(-.08));
      const pinchMouth=mouth.clone().add(outward.clone().mulScalar(.027));
      let carry=mouth.clone(),mouthWeight=phase.mouth;
      if(actor.armsFree&&phase.right>0){
        const puttingOut=phase.phase==='extinguishing',target=puttingOut?new pc.Vec3().lerp(pinchMouth,pocket.clone().add(front.clone().mulScalar(.15)),phase.transfer):new pc.Vec3().lerp(pocket,pinchMouth,phase.transfer);
        carry=this.hand(rig,'r',target,front,up,phase.right).sub(outward.clone().mulScalar(.027));
      }else mouthWeight=1;
      const base=new pc.Vec3().lerp(carry,mouth,mouthWeight);
      k.cigarette.setPosition(base);k.cigarette.setRotation(new pc.Quat().setFromDirections(pc.Vec3.UP,outward));k.cigarette.setLocalScale(phase.visible,phase.visible,phase.visible);
      k.contact=phase.mouth>.99?base.distance(mouth):0;
      const tip=base.clone().add(outward.clone().mulScalar(.077*phase.visible));
      k.lighter.enabled=actor.armsFree&&phase.left>.001;
      if(k.lighter.enabled){
        const lighterGrip=this.hand(rig,'l',tip.clone().sub(up.clone().mulScalar(.027)),front,up,phase.left);
        k.lighter.setPosition(lighterGrip.sub(up.clone().mulScalar(.018)));k.lighter.setRotation(new pc.Quat().setFromDirections(pc.Vec3.UP,up));
        k.lighter.setLocalScale(ease(phase.left*4),ease(phase.left*4),ease(phase.left*4));
      }
      k.flame.enabled=phase.flame>.001;k.flame.setLocalScale(.008*phase.flame,.025*phase.flame*(1+.12*Math.sin(now*.047)),.008*phase.flame);
      k.ember.emissiveIntensity=phase.lit*(.35+phase.inhale*2.8+.06*Math.sin(now*.019));k.ember.update();
      const nearby=camera.getPosition().distance(mouth)<28;
      k.tip.setPosition(tip);k.tip.setRotation(new pc.Quat().setFromDirections(pc.Vec3.UP,up));k.tip.setLocalScale(.18*phase.lit,.18*phase.lit,.18*phase.lit);
      k.mouth.setPosition(mouth.clone().add(front.clone().mulScalar(.016)));k.mouth.setRotation(new pc.Quat().setFromDirections(pc.Vec3.UP,front.clone().sub(up.clone().mulScalar(.08))));k.mouth.setLocalScale(phase.exhale*.65,phase.exhale*.65,phase.exhale*.65);
      if(nearby){this.particles.emit(`${actor.id}:tip`,'fumaca',k.tip,Math.min(dt,.05),rig.model.getPosition().y);this.particles.emit(`${actor.id}:mouth`,'fumaca_boca',k.mouth,Math.min(dt,.05),rig.model.getPosition().y);}
    }
    for(const [id,k] of this.kits)if(!active.has(id)){k.root.destroy();k.ember.destroy();this.particles.forgetEmitter(`${id}:tip`);this.particles.forgetEmitter(`${id}:mouth`);this.kits.delete(id);}
    this.particles.update(Math.min(dt,.05),camera.camera,height);
  }
  telemetry(){return {particles:this.particles.count,actors:Object.fromEntries([...this.kits].map(([id,k])=>[id,{phase:k.phase,inhale:k.inhale,exhale:k.exhale,mouthError:k.contact,cigarette:k.cigarette.getPosition().toArray(),lighter:k.lighter.enabled,flame:k.flame.enabled}]))};}
  destroy(){this.restore();for(const k of this.kits.values()){k.root.destroy();k.ember.destroy();}this.kits.clear();this.particles.destroy();for(const m of this.materials)m.destroy();}
}
