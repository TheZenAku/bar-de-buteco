import * as pc from 'playcanvas';
import {FUEL,FUEL_PUMPS,pumpDock,pumpPoint,type FuelServiceState,type FuelPoint} from '@bar/shared';
import {aim,reach,smoothstep} from './serving-props';
import {closeHand,type HandRig} from './drink-props';

interface Arm {upper:pc.Entity;lower?:pc.Entity;hand:pc.Entity;grip?:HandRig;root:pc.Entity;body?:pc.Entity;torso?:pc.Entity;legs?:Array<{upper:pc.Entity;lower:pc.Entity;foot:pc.Entity}>}
interface PumpProps {root:pc.Entity;nozzle:pc.Entity;hose:pc.Entity[];gripError:number;tipError:number}
const vector=(p:FuelPoint)=>new pc.Vec3(p.x,p.y,p.z);
const docked=new Set(['idle','authorizing','to-pump','paying','home']);

/** Independent nozzle and flexible hose over the existing, batched pump meshes. */
export class FuelProps {
  private props=new Map<string,PumpProps>();
  private states:Record<string,FuelServiceState>={};
  private rubber=new pc.StandardMaterial();
  private metal=new pc.StandardMaterial();
  private paint=new pc.StandardMaterial();
  constructor(private app:pc.AppBase){
    this.rubber.diffuse.set(.035,.04,.045);this.rubber.update();
    this.metal.diffuse.set(.6,.63,.65);this.metal.metalness=.8;this.metal.useMetalness=true;this.metal.update();
    this.paint.diffuse.set(.12,.48,.23);this.paint.update();
  }
  sync(states:Record<string,FuelServiceState>){this.states=states;}
  private shape(name:string,type:'box'|'cylinder',parent:pc.Entity,material:pc.StandardMaterial,scale:number[],position=[0,0,0]){
    const e=new pc.Entity(name);e.addComponent('render',{type,material});parent.addChild(e);e.setLocalScale(scale[0]!,scale[1]!,scale[2]!);e.setLocalPosition(position[0]!,position[1]!,position[2]!);return e;
  }
  private make(id:string):PumpProps{
    const root=new pc.Entity(`Fuel equipment ${id}`),nozzle=new pc.Entity(`Fuel nozzle ${id}`);this.app.root.addChild(root);root.addChild(nozzle);
    this.shape('Nozzle body','box',nozzle,this.paint,[.075,.09,.16],[0,.015,.035]);
    this.shape('Nozzle handle','box',nozzle,this.rubber,[.045,.12,.045],[0,-.065,0]);
    this.shape('Trigger guard','box',nozzle,this.metal,[.012,.10,.018],[0,-.065,.07]);
    this.shape('Trigger','box',nozzle,this.metal,[.012,.06,.012],[0,-.055,.04]);
    const spout=this.shape('Metal spout','cylinder',nozzle,this.metal,[.026,.21,.026],[0,.03,.15]);spout.setLocalEulerAngles(90,0,0);
    const hose=Array.from({length:20},(_,i)=>this.shape(`Fuel hose ${i}`,'cylinder',root,this.rubber,[.026,1,.026]));
    const made={root,nozzle,hose,gripError:0,tipError:0};this.props.set(id,made);return made;
  }
  /** Reset docked props before posing the attendants. Missing streamed avatars never leave a floating nozzle. */
  begin(camera:pc.Vec3):void {
    for(const pump of FUEL_PUMPS){
      const near=Math.hypot(pump.x-camera.x,pump.z-camera.z)<100;
      let prop=this.props.get(pump.id);if(!near&&!prop)continue;prop??=this.make(pump.id);prop.root.enabled=near;if(!near)continue;
      const state=this.states[pump.id],isDocked=!state||docked.has(state.phase);
      prop.nozzle.enabled=isDocked;for(const segment of prop.hose)segment.enabled=isDocked;
      if(isDocked){prop.nozzle.setPosition(vector(pumpDock(pump)));prop.nozzle.setEulerAngles(0,Math.atan2(-pump.uz,pump.ux)*180/Math.PI,0);this.hose(pump.id);}
    }
  }
  pose(npcId:string,arm:Arm,now:number):void {
    const pump=FUEL_PUMPS.find(p=>p.npcId===npcId),state=pump&&this.states[pump.id];
    if(!pump||!state||docked.has(state.phase))return;
    const prop=this.props.get(pump.id);if(!prop?.root.enabled)return;
    const p=arm.root.getPosition(),front=new pc.Vec3(Math.sin(arm.root.getEulerAngles().y*Math.PI/180),0,Math.cos(arm.root.getEulerAngles().y*Math.PI/180));
    const side=new pc.Vec3(front.z,0,-front.x),carry=p.clone().add(front.clone().mulScalar(.31)).add(side.clone().mulScalar(.23));carry.y=p.y+1.06;
    const dock=vector(pumpDock(pump)),tank=new pc.Vec3(state.tankX,state.tankY,state.tankZ),toward=tank.clone().sub(p);toward.y=0;toward.normalize();
    const inserted=tank.clone().sub(toward.clone().mulScalar(.255));inserted.y-=.03;
    const t=pc.math.clamp((now-state.startedAt)/FUEL.ACTION_MS,0,1),target=carry.clone();
    let held=true,weight=1;
    if(state.phase==='take'){
      target.lerp(carry,dock,t<.55?smoothstep(t/.55):1-smoothstep((t-.55)/.45));held=t>=.55;weight=smoothstep(t/.2);
    }else if(state.phase==='insert')target.lerp(carry,inserted,smoothstep(t));
    else if(state.phase==='fueling')target.copy(inserted);
    else if(state.phase==='remove')target.lerp(inserted,carry,smoothstep(t));
    else if(state.phase==='replace'){
      target.lerp(carry,dock,t<.65?smoothstep(t/.65):1-smoothstep((t-.65)/.35));held=t<.65;
    }
    const pole=side.clone().mulScalar(.6).add(new pc.Vec3(0,-1,0));
    // The existing idle has straight knees. Bend the torso and knees to reach a low filler,
    // keeping both feet planted rather than stretching the arm or floating the nozzle.
    const bend=state.phase==='fueling'?1:state.phase==='insert'?smoothstep(t):state.phase==='remove'?1-smoothstep(t):0;
    if(bend&&arm.body&&arm.torso){
      const feet=arm.legs?.map(leg=>({leg,position:leg.foot.getPosition().clone(),rotation:leg.foot.getRotation().clone()}))??[];
      arm.body.setLocalPosition(0,-.10*bend,0);
      aim(arm.torso,pc.Vec3.UP,new pc.Vec3(0,Math.cos(.7*bend),0).add(front.clone().mulScalar(Math.sin(.7*bend))));
      for(const {leg,position,rotation} of feet){reach(leg.upper,leg.lower,leg.foot,position,front);leg.foot.setRotation(rotation);}
    }
    if(arm.lower)reach(arm.upper,arm.lower,arm.hand,target,pole,weight);
    else aim(arm.upper,arm.hand.getPosition().clone().sub(arm.upper.getPosition()),target.clone().sub(arm.upper.getPosition()));
    if(arm.grip)closeHand(arm.grip,[35,55,35]);
    prop.nozzle.enabled=true;for(const segment of prop.hose)segment.enabled=true;
    // Every carried frame uses the actual wrist after IK, including animation failures and loading fallbacks.
    prop.nozzle.setPosition(held?arm.hand.getPosition():dock);
    const direction=['insert','fueling','remove'].includes(state.phase)?toward:front;
    prop.nozzle.setEulerAngles(0,Math.atan2(direction.x,direction.z)*180/Math.PI,0);
    prop.gripError=held?prop.nozzle.getPosition().distance(arm.hand.getPosition()):0;
    prop.tipError=state.phase==='fueling'?prop.nozzle.getPosition().clone().add(toward.clone().mulScalar(.255)).add(new pc.Vec3(0,.03,0)).distance(tank):0;
    this.hose(pump.id);
  }
  private hose(id:string){
    const pump=FUEL_PUMPS.find(p=>p.id===id)!,prop=this.props.get(id)!,start=vector(pumpPoint(pump,.45,0,.65)),end=prop.nozzle.getPosition().clone().sub(prop.nozzle.forward.clone().mulScalar(-.08));
    const length=start.distance(end),sag=Math.min(.8,.35+length*.12);
    let last=start;
    for(let i=0;i<prop.hose.length;i++){
      const t=(i+1)/prop.hose.length,next=new pc.Vec3().lerp(start,end,t);next.y=Math.max(pump.y+.04,next.y-Math.sin(t*Math.PI)*sag);
      const segment=prop.hose[i]!,delta=next.clone().sub(last),d=delta.length();
      segment.setPosition(last.clone().add(next).mulScalar(.5));segment.setLocalScale(.026,d+.006,.026);
      const axis=new pc.Vec3().cross(pc.Vec3.UP,delta.clone().normalize());
      segment.setRotation(axis.lengthSq()>.00001?new pc.Quat().setFromAxisAngle(axis.normalize(),Math.acos(pc.math.clamp(delta.y/Math.max(d,.00001),-1,1))*180/Math.PI):pc.Quat.IDENTITY);
      last=next;
    }
  }
  telemetry(){return [...this.props].map(([id,p])=>({id,visible:p.root.enabled,nozzle:p.nozzle.enabled,gripError:p.gripError,tipError:p.tipError,position:p.nozzle.getPosition().toArray(),phase:this.states[id]?.phase??'idle'}));}
  destroy(){for(const p of this.props.values())p.root.destroy();this.props.clear();this.rubber.destroy();this.metal.destroy();this.paint.destroy();}
}
