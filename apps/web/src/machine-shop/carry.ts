import * as pc from 'playcanvas';
import {reach} from '../engine/serving-props';
import type {CarryRig} from '../factory/carry';
import {addRibeiroPart,createRibeiroMaterials,type RibeiroMaterials} from './placeholders';

/**
 * The Ribeiro workpiece in the hands, from one station to the next. The part sits on a small technical tray that the
 * employee holds low in front of the belly with both hands under its long edges, the elbows out and down. Like the plant's
 * sack, the pose is IK over whatever the body is playing (the legs keep walking or running) and the tray follows the chest
 * bone, so it bobs with the steps. Picking up lifts it from the waist while the arms close on it; putting it down sinks it
 * while they let go. The models are the same stand-ins as the stations' (placeholders.ts) and can be swapped for authored GLBs.
 */
export type RibeiroPartStage='raw'|'cut'|'machined'|'finished'|'assembled';
export const isRibeiroPartStage=(value:unknown):value is RibeiroPartStage=>value==='raw'||value==='cut'||value==='machined'||value==='finished'||value==='assembled';

let localPart:RibeiroPartStage|null=null;
/** What the local player carries now (the terminal's controller feeds it from the room's state). */
export const setLocalRibeiroPart=(stage:RibeiroPartStage|null):void=>{localPart=stage;};
export const localRibeiroPart=():RibeiroPartStage|null=>localPart;

interface Prop {entity:pc.Entity;models:Record<RibeiroPartStage,pc.Entity>;/** The model switched on now. */shown:RibeiroPartStage|null;/** 0 → 1 while the arms close on the tray and lift it. */grip:number}

const STAGES:readonly RibeiroPartStage[]=['raw','cut','machined','finished','assembled'];
/** Half the distance between the two hands, across the tray. */
const HALF_SPAN=.255;
const LIFT=.3;
const tmp={front:new pc.Vec3(),side:new pc.Vec3(),up:new pc.Vec3(),centre:new pc.Vec3(),hand:new pc.Vec3(),pole:new pc.Vec3(),x:new pc.Vec3(),z:new pc.Vec3(),m:new pc.Mat4(),q:new pc.Quat()};

/** One stage's model, centred on the tray's middle: its long side along local X, its front along local Z. */
function buildModel(stage:RibeiroPartStage,materials:RibeiroMaterials):pc.Entity {
  const root=new pc.Entity(`RB_PH_CARREGADO_${stage.toUpperCase()}`),{metal,dark,polymer,accent}=materials,part=(name:string,type:'box'|'cylinder'|'sphere',at:[number,number,number],scale:[number,number,number],material:pc.StandardMaterial)=>addRibeiroPart(root,name,type,at,scale,material);
  part('Bandeja','box',[0,0,0],[.54,.05,.34],dark);part('Borda frontal','box',[0,.035,.155],[.54,.03,.03],polymer);part('Borda traseira','box',[0,.035,-.155],[.54,.03,.03],polymer);
  if(stage==='raw'){
    part('Chapa bruta','box',[-.14,.05,.02],[.24,.045,.2],metal);
    part('Tarugo bruto','cylinder',[.14,.075,.07],[.07,.3,.07],metal).setLocalEulerAngles(90,0,0);
    part('Tarugo bruto 2','cylinder',[.14,.075,-.05],[.07,.3,.07],metal).setLocalEulerAngles(90,0,0);
    part('Mola','cylinder',[.02,.06,-.1],[.03,.16,.03],accent).setLocalEulerAngles(0,0,90);
  }else if(stage==='cut'){
    part('Blank cortado','box',[0,.06,0],[.4,.07,.17],metal);
    part('Linha de corte','box',[.08,.098,0],[.025,.012,.18],accent);
    part('Apara','box',[-.2,.045,.1],[.07,.03,.05],metal);
  }else if(stage==='machined'){
    part('Corpo semi-usinado','box',[0,.075,0],[.36,.1,.17],metal);
    part('Rebaixo','box',[-.07,.128,0],[.14,.02,.1],dark);
    part('Canal','box',[.09,.128,0],[.025,.02,.17],dark);
  }else if(stage==='assembled'){
    // The finished (fictitious, unloaded) weapon lying in a transport cradle, with its label.
    part('Corpo da arma','box',[-.03,.075,0],[.34,.09,.12],metal);part('Cano','cylinder',[.25,.085,0],[.04,.2,.04],dark).setLocalEulerAngles(0,0,90);
    part('Empunhadura','box',[-.1,.03,.045],[.09,.13,.07],polymer).setLocalEulerAngles(0,0,-12);part('Coronha','box',[-.24,.08,0],[.12,.07,.1],polymer);
    part('Etiqueta RIBEIRO','box',[-.03,.123,.0],[.12,.008,.05],accent);
  }else{
    part('Peça furada','box',[0,.06,0],[.4,.07,.18],metal);
    for(const x of [-.12,0,.12])part(`Furo ${x}`,'cylinder',[x,.098,0],[.035,.012,.035],dark);
    part('Chanfro','box',[0,.098,.088],[.4,.012,.012],accent);
  }
  return root;
}

export class RibeiroCarry {
  private readonly materials=createRibeiroMaterials();
  private readonly props=new Map<string,Prop>();
  constructor(private readonly app:pc.AppBase){}

  /** `stage` null: this avatar carries nothing (the tray is put down, then it hides). `rig` missing: no skeleton to hold it with, so no tray either. */
  pose(id:string,stage:RibeiroPartStage|null,rig:CarryRig|undefined,dt:number):void {
    let prop=this.props.get(id);
    if(!rig){if(prop){prop.entity.enabled=false;prop.grip=0;}return;}
    if(stage){prop??=this.make(id);if(prop.shown!==stage){for(const each of STAGES)prop.models[each].enabled=each===stage;prop.shown=stage;}}
    if(!prop)return;
    prop.grip=Math.max(0,Math.min(1,prop.grip+Math.min(dt,.1)*(stage?5:-6)));
    if(prop.grip<=0){prop.entity.enabled=false;return;}
    prop.entity.enabled=true;
    const {front,side,up,centre,hand,pole,x,z,m,q}=tmp,ease=prop.grip*prop.grip*(3-2*prop.grip);
    front.copy(rig.body.forward).mulScalar(-1);front.y=0;if(front.lengthSq()<1e-6)return;front.normalize();
    // `body.right` points to the avatar's left (the plant's carry relies on the same fact): +1 is the LEFT hand.
    side.copy(rig.body.right);side.y=0;side.normalize();up.copy(pc.Vec3.UP);
    // Held low and close: in front of the belly, lifted from the waist as the arms close on it.
    centre.copy(rig.chest.getPosition()).add(front.clone().mulScalar(.27)).sub(up.clone().mulScalar(.24+(1-ease)*LIFT));
    // Local X along the body's left–right, Y up, Z forward (a right-handed basis, so the model is never mirrored).
    x.copy(side);z.copy(front);m.data.set([x.x,x.y,x.z,0,0,1,0,0,z.x,z.y,z.z,0,0,0,0,1]);q.setFromMat4(m);
    prop.entity.setPosition(centre.x,centre.y,centre.z);prop.entity.setRotation(q);prop.entity.setLocalScale(1,1,1);
    for(const out of [1,-1]){
      const left=out>0,b=rig.bones;
      hand.copy(centre).add(side.clone().mulScalar(out*HALF_SPAN)).sub(up.clone().mulScalar(.015)).add(front.clone().mulScalar(.01));
      pole.copy(up).mulScalar(-.8).add(side.clone().mulScalar(out*.7)).sub(front.clone().mulScalar(.1));
      reach(left?b.upperarm_l:b.upperarm_r,left?b.lowerarm_l:b.lowerarm_r,left?b.hand_l:b.hand_r,hand,pole,prop.grip);
    }
  }
  private make(id:string):Prop {
    const entity=new pc.Entity(`RB_Peca_Carregada_${id}`),models={} as Record<RibeiroPartStage,pc.Entity>;
    for(const stage of STAGES){const model=buildModel(stage,this.materials);model.enabled=false;entity.addChild(model);models[stage]=model;}
    entity.enabled=false;this.app.root.addChild(entity);
    const prop:Prop={entity,models,shown:null,grip:0};this.props.set(id,prop);return prop;
  }
  forget(id:string):void {const prop=this.props.get(id);if(prop){prop.entity.destroy();this.props.delete(id);}}
  destroy():void {for(const prop of this.props.values())prop.entity.destroy();this.props.clear();for(const material of Object.values(this.materials))material.destroy();}
}
