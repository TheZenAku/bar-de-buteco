import * as pc from 'playcanvas';
import {MOTO,motoSteerAngle,type MotoBody,type MotoState} from '@bar/shared';
import {closeHand,type HandRig} from './drink-props';
import {palmUp,reach} from './serving-props';

const RAD_TO_DEG=180/Math.PI;
const BONES=['chassi','direcao','roda_dianteira','roda_traseira'] as const;
/**
 * moto_delivery.js (assets-bar/map/BarBoteco/export/moto), ported to the client's modules: the game has no script
 * components, and the same fields and arithmetic drive the bones. Only what is drawn: speed and steering come from the
 * body the room simulates (stepMoto in packages/shared/src/moto.ts).
 */
export class MotoRig {
  /** m/s; negative is reverse (the wheels turn by the distance covered). */
  velocidade=0;
  /** −1 left .. +1 right: the handlebar and the lean go there smoothly. */
  direcao=0;
  anguloDirecao=28;
  inclinacaoMax=10;
  velocidadeInclinacao=10;
  raioRoda=MOTO.WHEEL_RADIUS;
  suavizacao=8;
  private readonly ossos=new Map<string,{entidade:pc.Entity;repouso:pc.Quat}>();
  private readonly pontos=new Map<string,pc.Entity>();
  private giroRodas=0;
  private guidao=0;
  private inclinacao=0;
  private readonly q=new pc.Quat();
  private readonly tmp=new pc.Quat();

  constructor(readonly entity:pc.Entity) {
    for(const nome of BONES){
      const entidade=this.ponto(nome);
      if(entidade)this.ossos.set(nome,{entidade,repouso:entidade.getLocalRotation().clone()});
      else console.warn(`moto: osso "${nome}" não encontrado`);
    }
  }
  /** A node of the rig by name: the attachment points and the bones. */
  ponto(nome:string):pc.Entity {
    let node=this.pontos.get(nome);
    if(!node){node=this.entity.findByName(nome) as pc.Entity;this.pontos.set(nome,node);}
    return node;
  }
  private girar(nome:string,x:number,y:number,z:number):void {
    const osso=this.ossos.get(nome);if(!osso)return;
    this.q.setFromEulerAngles(x,y,z);
    osso.entidade.setLocalRotation(this.tmp.mul2(osso.repouso,this.q));
  }
  update(dt:number):void {
    const k=1-Math.exp(-this.suavizacao*dt),dir=pc.math.clamp(this.direcao,-1,1);
    this.guidao+=(dir*this.anguloDirecao-this.guidao)*k;
    const fator=pc.math.clamp(Math.abs(this.velocidade)/this.velocidadeInclinacao,0,1);
    this.inclinacao+=(dir*this.inclinacaoMax*fator-this.inclinacao)*k;
    this.giroRodas=(this.giroRodas+this.velocidade*dt/this.raioRoda*RAD_TO_DEG)%360;
    this.girar('roda_dianteira',this.giroRodas,0,0); // +X local: the top of the wheel goes forward (+Z)
    this.girar('roda_traseira',this.giroRodas,0,0);
    this.girar('direcao',0,-this.guidao,0);          // +Y local turns left; direcao +1 is right
    this.girar('chassi',0,0,this.inclinacao);        // +Z local leans the top to the right (−X)
  }
  telemetry() {
    // How far the top of the rear wheel has rolled towards the headlight (+1 at a quarter turn), read from the bone itself.
    const topo=this.ponto('roda_traseira').up,frente=this.entity.forward;
    return {guidao:+this.guidao.toFixed(2),inclinacao:+this.inclinacao.toFixed(2),rodas:+this.giroRodas.toFixed(1),topoRoda:+(-topo.dot(frente)).toFixed(3)};
  }
}

/** How fast the drawn bike closes on the simulated one (per second) once its own speed has carried it along. */
const CATCH_UP=12,TURN_CATCH_UP=14,LIFT_CATCH_UP=10;
/** A longer jump than this is the bike being brought back to its spot: it does not fly there. */
const SNAP_DISTANCE=6;
export interface Bike {entity:pc.Entity;rig:MotoRig;state:MotoState;predicted?:MotoBody;drawn:{x:number;y:number;z:number;yaw:number;pitch:number}}

/** The delivery bikes the room syncs, drawn between its patches (and the rider's prediction, for the local one). */
export class Motos {
  private model?:pc.ContainerResource;
  private states:readonly MotoState[]=[];
  private readonly bikes=new Map<string,Bike>();
  private readonly turn=new pc.Quat();
  private readonly tilt=new pc.Quat();

  constructor(private readonly app:pc.AppBase,private readonly shadow:(root:pc.Entity)=>pc.Entity) {
    app.assets.loadFromUrl(`${import.meta.env.BASE_URL}moto/moto_delivery.glb`,'container',(error,asset)=>{
      if(error||!asset){console.warn('Moto de entrega indisponível.',error);return;}
      this.model=asset.resource as pc.ContainerResource;this.place();
    });
  }
  sync(states:Record<string,MotoState>|undefined):void {this.states=Object.values(states??{});this.place();}
  private place():void {
    if(!this.model)return;
    for(const state of this.states){
      const known=this.bikes.get(state.id);
      if(known){known.state=state;continue;}
      const entity=new pc.Entity(`Moto ${state.id}`),body=this.model.instantiateRenderEntity({castShadows:true,receiveShadows:true});
      entity.addChild(body);this.app.root.addChild(entity);
      const contact=this.shadow(entity);contact.setLocalScale(1.1,1,2.3);
      this.bikes.set(state.id,{entity,rig:new MotoRig(body),state,drawn:{x:state.x,y:state.y,z:state.z,yaw:state.yaw,pitch:state.pitch}});
    }
    for(const [id,bike] of this.bikes)if(!this.states.some(state=>state.id===id)){bike.entity.destroy();this.bikes.delete(id);}
  }
  /** The local rider's own prediction of the bike, ahead of the room's patches (undefined off the bike). */
  predict(id:string,body:MotoBody|undefined):void {const bike=this.bikes.get(id);if(bike)bike.predicted=body;}
  update(dt:number):void {
    for(const bike of this.bikes.values()){
      const target=bike.predicted??bike.state,{drawn}=bike;
      if(Math.hypot(target.x-drawn.x,target.z-drawn.z)>SNAP_DISTANCE)Object.assign(drawn,{x:target.x,y:target.y,z:target.z,yaw:target.yaw,pitch:target.pitch});
      // Ahead by its own speed: a patch or an input that comes late does not stop it, and the error closes smoothly.
      const k=1-Math.exp(-CATCH_UP*dt);
      drawn.x+=Math.sin(drawn.yaw)*target.speed*dt;drawn.z+=Math.cos(drawn.yaw)*target.speed*dt;
      drawn.x+=(target.x-drawn.x)*k;drawn.z+=(target.z-drawn.z)*k;
      const turning=Math.atan2(Math.sin(target.yaw-drawn.yaw),Math.cos(target.yaw-drawn.yaw));
      drawn.yaw+=turning*(1-Math.exp(-TURN_CATCH_UP*dt));
      const lift=1-Math.exp(-LIFT_CATCH_UP*dt);
      drawn.y+=(target.y-drawn.y)*lift;drawn.pitch+=(target.pitch-drawn.pitch)*lift;
      bike.entity.setPosition(drawn.x,drawn.y,drawn.z);
      // The heading, then the slope between the axles (+X leans the front down).
      this.turn.setFromEulerAngles(0,drawn.yaw*RAD_TO_DEG,0);this.tilt.setFromEulerAngles(-drawn.pitch*RAD_TO_DEG,0,0);
      bike.entity.setRotation(this.turn.mul(this.tilt));
      const {rig}=bike;
      rig.velocidade=target.speed;rig.direcao=target.steer;
      // The handlebar turns as far as the wheel really does at this speed; the lean follows the whole intent.
      rig.anguloDirecao=motoSteerAngle(target.speed)*RAD_TO_DEG;
      rig.update(dt);
    }
  }
  ridden(playerId:string):Bike|undefined {for(const bike of this.bikes.values())if(bike.state.riderId===playerId)return bike;}
  all():Iterable<Bike> {return this.bikes.values();}
  *casters():Iterable<pc.MeshInstance> {
    for(const bike of this.bikes.values())for(const render of bike.entity.findComponents('render') as pc.RenderComponent[])if(render.castShadows)yield* render.meshInstances;
  }
}

/** The body a rider's skin gives seatRider. */
export interface RiderRig {
  root:pc.Entity;hip:pc.Entity;spine?:pc.Entity|null;head:pc.Entity;
  upperarm_l:pc.Entity;lowerarm_l:pc.Entity;hand_l:pc.Entity;upperarm_r:pc.Entity;lowerarm_r:pc.Entity;hand_r:pc.Entity;
  upperleg_l:pc.Entity;lowerleg_l:pc.Entity;foot_l:pc.Entity;upperleg_r:pc.Entity;lowerleg_r:pc.Entity;foot_r:pc.Entity;
  handRigL?:HandRig;handRigR?:HandRig;
}
/**
 * The hip joint over the seat's surface and ahead of `ponto_piloto`, the upper body bowed to the handlebar, the wrist short of
 * the grip's point and on its inner half, the ankle over the footboard.
 */
const HIP_OVER_SEAT=.1,HIP_FORWARD=.16,LEAN=24,WRIST_BACK=.07,WRIST_UP=.035,WRIST_IN=.05,ANKLE_OVER_FLOOR=.09;
/** Short arms bow further, up to this many degrees more; turning the spine moves the shoulders by about this many metres per radian. */
const MAX_EXTRA_LEAN=20,SPINE_TO_SHOULDER=.32;
/** How much of the bow the head takes back, to look at the road. */
const HEAD_UP=.75;
const GRIP_CURL=[52,60,40] as const;
const footTurn=new pc.Quat(),leanTurn=new pc.Quat();
/**
 * The Sit clip made into a riding pose, drawn after the clip this frame (and after the bike): hips on the seat, the
 * chassis's lean and heading, hands on the moving grips and feet on the footboard by two-bone IK in world space, so every
 * skin's own bone axes do not matter. The grips are far for the shorter arms: those bodies bow until they reach.
 */
export function seatRider(moto:MotoRig,rider:RiderRig):void {
  const {root}=rider;
  root.setRotation(moto.ponto('chassi').getRotation());
  const left=root.right.clone(),up=root.up.clone(),front=root.forward.clone().mulScalar(-1);
  const hips=moto.ponto('ponto_piloto').getPosition().clone().add(up.clone().mulScalar(HIP_OVER_SEAT)).add(front.clone().mulScalar(HIP_FORWARD));
  root.setPosition(root.getPosition().clone().add(hips.sub(rider.hip.getPosition())));
  const arms=[
    {upper:rider.upperarm_l,lower:rider.lowerarm_l,hand:rider.hand_l,rig:rider.handRigL,point:'ponto_mao_E',sign:1},
    {upper:rider.upperarm_r,lower:rider.lowerarm_r,hand:rider.hand_r,rig:rider.handRigR,point:'ponto_mao_D',sign:-1},
  ].map(arm=>({...arm,wrist:moto.ponto(arm.point).getPosition().clone().sub(front.clone().mulScalar(WRIST_BACK)).add(up.clone().mulScalar(WRIST_UP)).sub(left.clone().mulScalar(arm.sign*WRIST_IN))}));
  const {spine}=rider;
  let bow=0;
  if(spine){
    const lean=(degrees:number)=>{spine.setRotation(leanTurn.setFromAxisAngle(left,degrees).mul(spine.getRotation()));bow+=degrees;};
    lean(LEAN);
    const short=Math.max(...arms.map(({upper,lower,hand,wrist})=>upper.getPosition().distance(wrist)-upper.getPosition().distance(lower.getPosition())-lower.getPosition().distance(hand.getPosition())));
    if(short>0)lean(Math.min(MAX_EXTRA_LEAN,short/SPINE_TO_SHOULDER*RAD_TO_DEG));
  }
  rider.head.setRotation(leanTurn.setFromAxisAngle(left,-bow*HEAD_UP).mul(rider.head.getRotation()));
  for(const {upper,lower,hand,rig,wrist,sign} of arms){
    const elbow=left.clone().mulScalar(sign*.8).add(up.clone().mulScalar(-.55)).add(front.clone().mulScalar(-.25));
    reach(upper,lower,hand,wrist,elbow);
    if(rig){palmUp(rig,up.clone().mulScalar(-1).add(front.clone().mulScalar(.35)).normalize(),front);closeHand(rig,GRIP_CURL);}
  }
  for(const [side,point,sign] of [['l','ponto_pe_E',1],['r','ponto_pe_D',-1]] as const){
    const foot=side==='l'?rider.foot_l:rider.foot_r,kept=footTurn.copy(foot.getRotation());
    const ankle=moto.ponto(point).getPosition().clone().add(up.clone().mulScalar(ANKLE_OVER_FLOOR));
    reach(side==='l'?rider.upperleg_l:rider.upperleg_r,side==='l'?rider.lowerleg_l:rider.lowerleg_r,foot,ankle,front.clone().add(left.clone().mulScalar(sign*.35)));
    foot.setRotation(kept);
  }
}
