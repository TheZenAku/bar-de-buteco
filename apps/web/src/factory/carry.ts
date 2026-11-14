import * as pc from 'playcanvas';
import {FACTORY_CART,cartPoint,type CartPose} from '@bar/shared/factory';
import {reach} from '../engine/serving-props';
import {loadBagKit,type BagKit,type BagMaterial} from './bags';

/**
 * The sack a player carries, drawn with the plant's real sack model and held the way a heavy 25 kg sack is: hugged against
 * the belly and chest, both hands under it, the elbows out. The pose is IK over whatever the body is playing (walking,
 * running, standing): BarScene calls `pose` for every avatar after its clips, like the other hand props, and the sack follows
 * the chest bone, so it bobs with the steps. Out of the avatar's reach the arms simply point at the sack's edges.
 */
let localBag:BagMaterial|null=null;
/** What the local player carries now (the plant's panel feeds it from the room's state each frame). */
export const setLocalFactoryBag=(material:BagMaterial|null):void=>{localBag=material;};
export const localFactoryBag=():BagMaterial|null=>localBag;
/** The platform cart as drawn now, and who pushes it (visuals.ts feeds it every frame): the pusher's hands go on its handle. */
let cartNow:(CartPose&{pusher:string|null})|null=null;
export const setFactoryCartPose=(pose:(CartPose&{pusher:string|null})|null):void=>{cartNow=pose;};
export const factoryCartPose=():(CartPose&{pusher:string|null})|null=>cartNow;

export interface CarryRig {
  bones:Record<'upperarm_l'|'lowerarm_l'|'hand_l'|'upperarm_r'|'lowerarm_r'|'hand_r',pc.Entity>;
  /** The chest bone (spine_02): the sack rides on it. */
  chest:pc.Entity;
  /** The avatar's body: which way it faces. */
  body:pc.Entity;
}
interface Prop {entity:pc.Entity;material:BagMaterial;/** 0 → 1 while the arms close around the sack. */grip:number}

const TILT=14*Math.PI/180;
const HALF_THICK=.075;
const tmp={front:new pc.Vec3(),side:new pc.Vec3(),up:new pc.Vec3(),x:new pc.Vec3(),y:new pc.Vec3(),z:new pc.Vec3(),centre:new pc.Vec3(),hand:new pc.Vec3(),pole:new pc.Vec3(),m:new pc.Mat4(),q:new pc.Quat()};

export class FactoryCarry {
  private kit?:BagKit|null;
  private props=new Map<string,Prop>();
  private grips=new Map<string,number>();
  constructor(private app:pc.AppBase){void loadBagKit(app).then(kit=>{this.kit=kit;});}

  /** `material` null: this avatar carries nothing (the prop hides). */
  pose(id:string,material:BagMaterial|null,rig:CarryRig|undefined,dt:number):void {
    const prop=this.props.get(id);
    if(!material||!rig||!this.kit){if(prop)prop.entity.enabled=false;if(prop)prop.grip=0;return;}
    const own=prop&&prop.material===material?prop:this.make(id,material);if(!own)return;
    own.grip=Math.min(1,own.grip+Math.min(dt,.1)*5);own.entity.enabled=true;
    const {front,side,up,x,y,z,centre,hand,pole,m,q}=tmp;
    front.copy(rig.body.forward).mulScalar(-1);front.y=0;if(front.lengthSq()<1e-6)return;front.normalize();
    side.copy(rig.body.right);side.y=0;side.normalize();up.copy(pc.Vec3.UP);
    // Along the sack: up, leaning its top in to the chest; across the sack's thickness: out from the body.
    x.copy(up).mulScalar(Math.cos(TILT)).sub(front.clone().mulScalar(Math.sin(TILT)));
    y.copy(front).mulScalar(Math.cos(TILT)).add(up.clone().mulScalar(Math.sin(TILT)));
    z.cross(x,y);
    centre.copy(rig.chest.getPosition()).add(front.clone().mulScalar(.2)).sub(up.clone().mulScalar(.1));
    m.data.set([x.x,x.y,x.z,0,y.x,y.y,y.z,0,z.x,z.y,z.z,0,0,0,0,1]);q.setFromMat4(m);
    own.entity.setPosition(centre.x-y.x*HALF_THICK,centre.y-y.y*HALF_THICK,centre.z-y.z*HALF_THICK);own.entity.setRotation(q);
    // Both hands under the sack's lower corners; the elbows go down and out. `z` points to the avatar's left, so the +1 side is the LEFT arm.
    const sideWard=z.dot(side)>=0?1:-1;
    for(const out of [1,-1]){
      const left=out>0,b=rig.bones;
      hand.copy(centre).add(z.clone().mulScalar(out*sideWard*.245)).sub(x.clone().mulScalar(.13)).sub(y.clone().mulScalar(.01));
      pole.copy(up).mulScalar(-.8).add(side.clone().mulScalar(out*.7)).sub(front.clone().mulScalar(.1));
      reach(left?b.upperarm_l:b.upperarm_r,left?b.lowerarm_l:b.lowerarm_r,left?b.hand_l:b.hand_r,hand,pole,own.grip);
    }
  }
  /** Both hands on the cart's handle (a grip on each side of its middle), the elbows down and out; `cart` null: nothing pushed (the arms are the clip's again). */
  push(id:string,cart:CartPose|null,rig:CarryRig|undefined,dt:number):void {
    let grip=this.grips.get(id)??0;
    if(!cart||!rig){if(grip>0)this.grips.set(id,0);return;}
    grip=Math.min(1,grip+Math.min(dt,.1)*5);this.grips.set(id,grip);
    const {side,up,hand,pole}=tmp,[hx,hy,hz]=FACTORY_CART.handle,body=rig.body.getPosition();
    side.copy(rig.body.right);side.y=0;if(side.lengthSq()<1e-6)return;side.normalize();up.copy(pc.Vec3.UP);
    for(const off of [.2,-.2]){
      const at=cartPoint(cart,[hx,hy,hz+off]);hand.set(at.x,at.y,at.z);
      // `right` of the body points to the avatar's left (see pose): the hand that lies on that side is the left one.
      const left=(hand.x-body.x)*side.x+(hand.z-body.z)*side.z>0,b=rig.bones;
      pole.copy(up).mulScalar(-.8).add(side.clone().mulScalar(left?.7:-.7));
      reach(left?b.upperarm_l:b.upperarm_r,left?b.lowerarm_l:b.lowerarm_r,left?b.hand_l:b.hand_r,hand,pole,grip);
    }
  }
  private make(id:string,material:BagMaterial):Prop|undefined {
    const kit=this.kit;if(!kit)return;
    this.props.get(id)?.entity.destroy();
    const entity=new pc.Entity(`EB_Saco_Carregado_${id}`);
    entity.addComponent('render',{meshInstances:[new pc.MeshInstance(kit.kinds[material].mesh,kit.kinds[material].material)],castShadows:false,receiveShadows:false});
    this.app.root.addChild(entity);
    const prop={entity,material,grip:0};this.props.set(id,prop);return prop;
  }
  forget(id:string):void {this.grips.delete(id);const prop=this.props.get(id);if(prop){prop.entity.destroy();this.props.delete(id);}}
  destroy():void {for(const prop of this.props.values())prop.entity.destroy();this.props.clear();}
}
