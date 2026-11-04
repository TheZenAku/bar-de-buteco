import * as pc from 'playcanvas';
import {HORSE} from '@bar/shared';
import {closeHand} from './drink-props';
import {aim,palmUp,reach} from './serving-props';
import type {RiderRig} from './moto-delivery';

/** The imported horse's authored scale/axes and saddle live in its GLB. */
export class HorseMount {
  readonly entity:pc.Entity;
  readonly saddle:pc.Entity;
  private readonly model:pc.Entity;
  private readonly reins:pc.Entity[][]=[];
  private clip='';
  private effort=0;
  constructor(resource:pc.ContainerResource,parent:pc.Entity){
    this.entity=new pc.Entity('Tião horse');parent.addChild(this.entity);
    this.model=resource.instantiateRenderEntity({castShadows:true,receiveShadows:true});this.entity.addChild(this.model);
    this.saddle=this.model.findByName('HorseSaddle') as pc.Entity;
    if(!this.saddle)throw new Error('HorseSaddle missing from imported horse');
    this.model.addComponent('anim',{activate:true});
    for(const asset of resource.animations){const track=asset.resource as pc.AnimTrack;this.model.anim!.assignAnimation(track.name,track,undefined,1,true);}
    const leather=new pc.StandardMaterial();leather.diffuse=new pc.Color(.13,.065,.025);leather.gloss=5;leather.update();
    this.entity.once('destroy',()=>leather.destroy());
    for(let side=0;side<2;side++)this.reins.push(Array.from({length:4},()=>{const strap=new pc.Entity('Rédea');strap.addComponent('render',{type:'cylinder',material:leather,castShadows:false,receiveShadows:true});this.entity.addChild(strap);return strap;}));
  }
  update(speed:number,state:string|undefined,resting=false):void {
    this.entity.enabled=true;
    const clip=state==='horse-gallop'?'HorseGallop':state==='horse-walk'?'HorseWalk':'HorseIdle',anim=this.model.anim!;
    if(clip!==this.clip){anim.baseLayer?.transition(clip,this.clip?.18:0);this.clip=clip;}
    // Baked stride * model scale / (cycle duration * stance fraction), as in import-horse.mjs.
    const pace=clip==='HorseGallop'?.32*2.4/(.82*.21):clip==='HorseWalk'?.25*2.4/(.85*.65):0;
    anim.speed=pace?pc.math.clamp(speed/pace,.35,4.2):1;anim.playing=!resting;
    this.effort=pc.math.clamp((speed-HORSE.walkSpeed)/(HORSE.fastSpeed-HORSE.walkSpeed),0,1);
  }
  /** A local seated clip supplies the torso/fingers. IK puts the rider around the saddle. */
  seat(rider:RiderRig):void {
    const {root,hip}=rider,parent=this.entity.parent!,left=parent.right.clone(),front=parent.forward.clone().mulScalar(-1),up=pc.Vec3.UP;
    const seat=this.saddle.getPosition().clone();
    const wanted=seat.clone().add(up.clone().mulScalar(.105));
    root.setPosition(root.getPosition().clone().add(wanted.sub(hip.getPosition())));
    // Sitting.fbx bows its head towards a table. On horseback the rider watches the road.
    if(rider.spine)aim(rider.spine,rider.head.getPosition().clone().sub(rider.spine.getPosition()),up.clone().add(front.clone().mulScalar(.08+.10*this.effort)));
    const crown=rider.head.children[0] as pc.Entity|undefined;
    if(crown)aim(rider.head,crown.getPosition().clone().sub(rider.head.getPosition()),up.clone().add(front.clone().mulScalar(.08)));
    for(const [side,sign] of [['l',1],['r',-1]] as const){
      const foot=rider[`foot_${side}`],ankle=seat.clone().add(left.clone().mulScalar(sign*.405)).add(front.clone().mulScalar(.025)).sub(up.clone().mulScalar(.61));
      reach(rider[`upperleg_${side}`],rider[`lowerleg_${side}`],foot,ankle,front.clone().add(left.clone().mulScalar(sign*1.8)));
      // Flatten the boot using its actual toe axis; bone axes differ between rigs.
      const toe=foot.children[0] as pc.Entity|undefined;
      if(toe)aim(foot,toe.getPosition().clone().sub(foot.getPosition()),front);
      const hand=rider[`hand_${side}`],wrist=seat.clone().add(left.clone().mulScalar(sign*.14)).add(front.clone().mulScalar(.34+.05*this.effort)).add(up.clone().mulScalar(.36-.03*this.effort));
      reach(rider[`upperarm_${side}`],rider[`lowerarm_${side}`],hand,wrist,left.clone().mulScalar(sign).sub(up));
      const rig=side==='l'?rider.handRigL:rider.handRigR;
      if(rig){palmUp(rig,left.clone().mulScalar(-sign),front);closeHand(rig,[45,55,35]);}
      const bit=this.model.findByName(side==='l'?'HorseReinL':'HorseReinR') as pc.Entity;
      const from=bit.getPosition(),to=hand.getPosition().clone().add(front.clone().mulScalar(.06));
      const curve=(t:number)=>new pc.Vec3().lerp(from,to,t).sub(up.clone().mulScalar(.07*Math.sin(Math.PI*t)));
      this.reins[side==='l'?0:1]!.forEach((strap,i)=>{const a=curve(i/4),b=curve((i+1)/4),direction=b.clone().sub(a);strap.setPosition(a.clone().add(b).mulScalar(.5));strap.setRotation(new pc.Quat().setFromDirections(pc.Vec3.UP,direction.clone().normalize()));strap.setLocalScale(.009,direction.length(),.009);});
    }
  }
  telemetry(){const p=this.saddle.getPosition();return {clip:this.clip,time:this.model.anim?.baseLayer?.activeStateCurrentTime,rate:this.model.anim?.speed,saddle:[p.x,p.y,p.z]};}
}
