import {motoHandling} from '@bar/shared';
import * as pc from 'playcanvas';
import {MOTO,MOTO_ENGINE,motoLampLevel,motoSteerAngle,readMotoParts,type MotoBody,type MotoState} from '@bar/shared';
import {closeHand,type HandRig} from './drink-props';
import {palmUp,reach} from './serving-props';
import {RoomTrack,SNAP_DISTANCE} from './moto-motion';
import {CLASSICA_LAMPS,FOGO_LAMPS,SCOOTER_LAMPS,lampState,MotoLampMaterials,MotoLights,type LampState} from './moto-lights';
import {MotoSounds} from './moto-sound';
import {CarRig,CarLights} from './car-rig';
import {CarSounds} from './car-sound';
import {TruckSounds} from './truck-sound';
import {VehicleBrakeSounds} from './vehicle-brake-sound';
import {MotoBag} from './moto-bag';
import {VehicleHorns} from './vehicle-horn';
import {wheeliePose} from '@bar/shared';
import {isCar,isClassica,isFogo,isScooter,isTruck,readDriveParts,vehiclePhysics,vehicleSeat,vehiclePowered} from '@bar/shared';
import {MotoFire} from './moto-fire';
import {MotoExhaust} from './moto-exhaust';
import {MotoPaint,TankPaint} from './moto-paint';

const RAD_TO_DEG=180/Math.PI;
const BONES=['chassi','direcao','suspensao_diant','balanca','descanso','roda_dianteira','roda_traseira'] as const;
/** The Scooter de Entrega has no stand, fork travel or swing arm. */
const OPTIONAL_BONES:ReadonlySet<string>=new Set(['descanso','suspensao_diant','balanca']);
/**
 * moto_v4/moto_delivery.js, ported to the client's modules: the game has no vehicle script
 * components, and the same fields and arithmetic drive the bones. Only what is drawn: speed and steering come from the
 * body the room simulates (stepMoto in packages/shared/src/moto.ts).
 */
export class MotoRig {
  /** m/s; negative is reverse (the wheels turn by the distance covered). */
  velocidade=0;
  lateralAcceleration=0;
  /** −1 left .. +1 right: the handlebar and the lean go there smoothly. */
  direcao=0;
  freio=0;
  acelerador=0;
  descansoAberto=false;
  curso=.07;
  grau=0;
  anguloDirecao=28;
  /** 0 with nobody holding it: its lean is the whole bike's then (the room's pose). */
  inclinacaoMax=10;
  velocidadeInclinacao=10;
  raioRoda=MOTO.WHEEL_RADIUS;
  suavizacao=8;
  private readonly ossos=new Map<string,{entidade:pc.Entity;repouso:pc.Quat;pos:pc.Vec3}>();
  private readonly pontos=new Map<string,pc.Entity>();
  private giroRodas=0;
  private guidao=0;
  private inclinacao=0;
  private mergulho=0;
  private descanso=0;
  private freioVis=0;
  private acelVis=0;
  private readonly v=new pc.Vec3();
  private readonly luzes=new Map<string,{materials:pc.StandardMaterial[];cor:pc.Color;level:number}>();
  private readonly q=new pc.Quat();
  private readonly tmp=new pc.Quat();

  /**
   * `wheelRadius` is the model's own (the Caveira em Chamas has 29,7 cm); a bone the model lacks (its stand) is skipped without a word.
   * `standDown`: the model's stand rests on the ground in its rest pose (the Clássica Raiada), so closing it turns it back and up 85°.
   */
  constructor(readonly entity:pc.Entity,wheelRadius=MOTO.WHEEL_RADIUS,private readonly standDown=false) {
    this.raioRoda=wheelRadius;
    for(const nome of BONES){
      const entidade=this.ponto(nome);
      if(entidade)this.ossos.set(nome,{entidade,repouso:entidade.getLocalRotation().clone(),pos:entidade.getLocalPosition().clone()});
      else if(!OPTIONAL_BONES.has(nome))console.warn(`moto: osso "${nome}" não encontrado`);
    }
  }
  /** glTF front is +Z; PlayCanvas forward is -Z. */
  frente():pc.Vec3 {return this.entity.forward.clone().mulScalar(-1);}
  encaixarBag(bag:pc.Entity):void {
    bag.reparent(this.ponto('ponto_bau'));bag.setLocalPosition(0,0,0);bag.setLocalRotation(pc.Quat.IDENTITY);
  }
  /** Clone emissive materials per bike so another player's switches cannot change this bike. */
  luz(nome:string,ligada:boolean,intensidade=1):void {
    let lamp=this.luzes.get(nome);
    if(!lamp){
      const render=this.ponto(nome)?.render;if(!render)return;
      const colours:Record<string,[number,number,number]>={Luz_Farol:[1,.96,.82],Luz_Seta_E:[1,.55,.05],Luz_Seta_D:[1,.55,.05],Luz_Lanterna:[1,.06,.04],Luz_Freio:[1,.1,.06]};
      const materials=render.meshInstances.map(mi=>{const material=(mi.material as pc.StandardMaterial).clone();mi.material=material;return material;});
      lamp={materials,cor:new pc.Color(...(colours[nome]??[1,1,1])),level:-1};this.luzes.set(nome,lamp);
    }
    const level=ligada?intensidade:0;if(lamp.level===level)return;lamp.level=level;
    for(const material of lamp.materials){material.emissive.copy(lamp.cor);material.emissiveIntensity=level;material.update();}
  }
  destroy():void {for(const lamp of this.luzes.values())for(const material of lamp.materials)material.destroy();this.luzes.clear();}
  /** A node of the rig by name: the attachment points and the bones. */
  ponto(nome:string):pc.Entity {
    let node=this.pontos.get(nome);
    if(!node){node=this.entity.findByName(nome) as pc.Entity;if(node)this.pontos.set(nome,node);}
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
    const lean=pc.math.clamp(-Math.atan(this.lateralAcceleration/9.81)*RAD_TO_DEG,-this.inclinacaoMax,this.inclinacaoMax);
    this.inclinacao+=(lean-this.inclinacao)*k;
    this.giroRodas=(this.giroRodas+this.velocidade*dt/this.raioRoda*RAD_TO_DEG)%360;
    this.girar('roda_dianteira',this.giroRodas,0,0); // +X local: the top of the wheel goes forward (+Z)
    this.girar('roda_traseira',this.giroRodas,0,0);
    this.girar('direcao',0,-this.guidao,0);          // +Y local turns left; direcao +1 is right
    this.girar('chassi',0,0,this.inclinacao);        // +Z local leans the top to the right (−X)
    this.freioVis+=(pc.math.clamp(this.freio,0,1)-this.freioVis)*k;
    this.acelVis+=(pc.math.clamp(this.acelerador,0,1)-this.acelVis)*k;
    this.mergulho+=(this.freioVis*this.curso-this.mergulho)*k;
    const suspension=this.ossos.get('suspensao_diant');
    if(suspension){this.v.set(0,this.mergulho,0);suspension.repouso.transformVector(this.v,this.v);suspension.entidade.setLocalPosition(this.v.add(suspension.pos));}
    this.girar('balanca',this.freioVis*-2+this.acelVis*1.5,0,0);
    this.descanso+=((this.descansoAberto?1:0)-this.descanso)*k*.6;
    this.girar('descanso',this.standDown?85*(1-this.descanso):-90*this.descanso,0,0);
  }
  telemetry() {
    // How far the top of the rear wheel has rolled towards the headlight (+1 at a quarter turn), read from the bone itself.
    const topo=this.ponto('roda_traseira').up,frente=this.entity.forward;
    const bag=this.ponto('ponto_bau').children.find(child=>child.name==='Bag_Rig') as pc.Entity|undefined;
    return {grau:this.grau,frontWheelY:this.ponto('roda_dianteira').getPosition().y,rearWheelY:this.ponto('roda_traseira').getPosition().y,guidao:+this.guidao.toFixed(2),inclinacao:+this.inclinacao.toFixed(2),rodas:+this.giroRodas.toFixed(1),topoRoda:+(-topo.dot(frente)).toFixed(3),mergulho:this.mergulho,descanso:this.descanso,luzes:Object.fromEntries([...this.luzes].map(([name,lamp])=>[name,lamp.level])),bag:bag?{parent:bag.parent!.name,local:bag.getLocalPosition().toArray(),aberta:bag.script!.get(MotoBag)!.aberta,tampa:bag.findByName('bag_tampa')!.getLocalEulerAngles().x}:null};
  }
}

/** How fast the kerbs reach the drawing (per second): one tick lifts a wheel 15 cm, which the eye reads as a blow. */
const LIFT_CATCH_UP=10;
/** How fast the bike closes the gap (per second) when what drives it changes, getting on or off. */
const HANDOVER=8;
/** The playback clock: how far from the wall clock it may be (ms), and the part of that it closes per frame. */
const CLOCK_RESTART_MS=250,CLOCK_PULL=.01;
/** How far a right click reaches a bike (metres), and how much bigger than its box the target is. */
const PICK_REACH=40,PICK_MARGIN=.12;
export interface Bike {
  entity:pc.Entity;rig:MotoRig|CarRig;state:MotoState;lights:MotoLights|CarLights;
  /** The local rider's own bike as it should be drawn this frame (moto-motion.ts); everybody else's follows `track`. */
  plate?:{material:pc.StandardMaterial;texture:pc.Texture;entity:pc.Entity;text:string}|undefined;
  predicted?:MotoBody;track:RoomTrack;riddenHere:boolean;gap:{x:number;z:number;yaw:number};
  drawn:{x:number;y:number;z:number;yaw:number;pitch:number;wheelie?:number};
  deliveryBag?:pc.Entity;bagPending?:boolean;bagWanted?:boolean;
  /** The flames on the wheels of the Caveira em Chamas. */
  fire?:MotoFire;
  /** The Caveira em Chamas' tail pipes (smoke, backfires) and the owner's paint on its reds. */
  exhaust?:MotoExhaust;paint?:MotoPaint|TankPaint;
}

/** The delivery bikes the room syncs, drawn between its patches (and the rider's prediction, for the local one). */
/** v4's authored plate dimensions; its attachment is ponto_placa. */
const PLATE_SIZE=[.2,.17,.002] as const;
export class Motos {
  private carModel?:pc.ContainerResource;
  private truckModel?:pc.ContainerResource;
  private readonly carSounds:CarSounds;
  private readonly truckSounds:TruckSounds;
  private readonly brakeSounds:VehicleBrakeSounds;
  private readonly horns:VehicleHorns;
  private model?:pc.ContainerResource;
  private fogoModel?:pc.ContainerResource;
  private classicaModel?:pc.ContainerResource;
  private scooterModel?:pc.ContainerResource;
  private bagModel?:Promise<pc.ContainerResource>;
  private courierRiders=new Set<string>();
  private destroyed=false;
  private states:readonly MotoState[]=[];
  private readonly bikes=new Map<string,Bike>();
  /**
   * The playback's time (ms): the frames' own, as the camera's. Reading the wall clock while drawing lands a varying time into each
   * frame, and that shows as shake. It keeps close to the wall clock for the patches' sake, and starts over after a pause.
   */
  private clock=performance.now();
  private readonly turn=new pc.Quat();
  private readonly tilt=new pc.Quat();
  private readonly rayA=new pc.Vec3();
  private readonly rayB=new pc.Vec3();
  private readonly localA=new pc.Vec3();
  private readonly localB=new pc.Vec3();
  private readonly toLocal=new pc.Mat4();
  private readonly lampMaterials:MotoLampMaterials;
  /** The local rider's switches and brake, ahead of the room. */
  private localLamps?:{id:string;bits:number};
  /** The local rider's throttle, ahead of the room: the engine answers the key at once. */
  private localGas?:{id:string;open:boolean};
  private localBrake?:{id:string;held:boolean};
  private readonly sounds:MotoSounds;

  constructor(private readonly app:pc.AppBase,private readonly shadow:(root:pc.Entity)=>pc.Entity,volume:()=>number=()=>1) {
    this.lampMaterials=new MotoLampMaterials();
    this.sounds=new MotoSounds(volume,import.meta.env.BASE_URL);
    this.carSounds=new CarSounds(volume);
    this.truckSounds=new TruckSounds(volume,import.meta.env.BASE_URL);
    this.brakeSounds=new VehicleBrakeSounds(volume,import.meta.env.BASE_URL);
    this.horns=new VehicleHorns(volume);
    app.assets.loadFromUrl(`${import.meta.env.BASE_URL}carro/carro_hatch.glb`,'container',(error,asset)=>{
      if(error||!asset){console.warn('Carro hatch indisponível.',error);return;}
      this.carModel=asset.resource as pc.ContainerResource;this.place();
    });
    app.assets.loadFromUrl(`${import.meta.env.BASE_URL}caminhao/caminhao_bau.glb`,'container',(error,asset)=>{
      if(error||!asset){console.warn('Caminhão baú indisponível.',error);return;}
      this.truckModel=asset.resource as pc.ContainerResource;this.place();
    });
    app.assets.loadFromUrl(`${import.meta.env.BASE_URL}moto/moto_fogo.glb`,'container',(error,asset)=>{
      if(error||!asset){console.warn('Moto Caveira em Chamas indisponível.',error);return;}
      this.fogoModel=asset.resource as pc.ContainerResource;this.place();
    });
    app.assets.loadFromUrl(`${import.meta.env.BASE_URL}moto/moto_classica.glb`,'container',(error,asset)=>{
      if(error||!asset){console.warn('Moto Clássica Raiada indisponível.',error);return;}
      this.classicaModel=asset.resource as pc.ContainerResource;this.place();
    });
    app.assets.loadFromUrl(`${import.meta.env.BASE_URL}moto/moto_scooter.glb`,'container',(error,asset)=>{
      if(error||!asset){console.warn('Scooter de Entrega indisponível.',error);return;}
      this.scooterModel=asset.resource as pc.ContainerResource;this.place();
    });
    app.assets.loadFromUrl(`${import.meta.env.BASE_URL}moto/moto_delivery.glb`,'container',(error,asset)=>{
      if(error||!asset){console.warn('Moto de entrega indisponível.',error);return;}
      this.model=asset.resource as pc.ContainerResource;this.place();
    });
  }
  /** Create a detached v3 bag; encaixarBag brings it into the scene. No bike gets one by default. */
  async criarBag():Promise<pc.Entity> {
    this.bagModel??=new Promise((resolve,reject)=>this.app.assets.loadFromUrl(`${import.meta.env.BASE_URL}moto/moto_bag.glb`,'container',(error,asset)=>{
      if(error||!asset){this.bagModel=undefined;reject(error??new Error('Bag indisponível'));}else resolve(asset.resource as pc.ContainerResource);
    }));
    const bag=(await this.bagModel).instantiateRenderEntity({castShadows:true,receiveShadows:true});
    bag.addComponent('script');bag.script!.create(MotoBag);
    return bag;
  }
  /** Courier state is public: every client derives the same bag attachment from the rider's shift. */
  couriers(ids:Iterable<string>):void {this.courierRiders=new Set(ids);}
  private deliveryBag(bike:Bike):void {
    const wanted=bike.rig instanceof MotoRig&&!isFogo(bike.state)&&!isScooter(bike.state)&&!!bike.state.riderId&&this.courierRiders.has(bike.state.riderId)&&!bike.state.phase;
    bike.bagWanted=wanted;
    if(!wanted){bike.deliveryBag?.destroy();bike.deliveryBag=undefined;return;}
    if(bike.deliveryBag||bike.bagPending)return;
    bike.bagPending=true;
    void this.criarBag().then(bag=>{
      if(this.destroyed||this.bikes.get(bike.state.id)!==bike||!bike.bagWanted){bag.destroy();return;}
      (bike.rig as MotoRig).encaixarBag(bag);bike.deliveryBag=bag;
    }).catch(error=>console.warn('Bag de entrega indisponível.',error)).finally(()=>{bike.bagPending=false;});
  }
  /** The plate on the bike's back, under the lamp that lights it: Mercosul colours, on a thin box on the tail's node. */
  private plate(rig:MotoRig,text:string,black=false):NonNullable<Bike['plate']> {
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=96;
    const g=canvas.getContext('2d')!;
    // The Caveira em Chamas' plate is only black and red: red characters and header band on black.
    const paper=black?'#070707':'#f4f4f0',band=black?'#c4141b':'#123c9c',bandText=black?'#070707':'#fff',ink=black?'#e0141c':'#111',frame=black?'#c4141b':'#111';
    g.fillStyle=paper;g.fillRect(0,0,256,96);
    g.fillStyle=band;g.fillRect(0,0,256,22);
    g.fillStyle=bandText;g.font='700 15px Arial,sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('BRASIL',128,12);
    g.fillStyle=ink;g.font='700 60px "Courier New",monospace';g.fillText(text,128,60,244);
    g.strokeStyle=frame;g.lineWidth=5;g.strokeRect(2,2,252,92);
    const texture=new pc.Texture(this.app.graphicsDevice,{width:256,height:96,format:pc.PIXELFORMAT_RGBA8,mipmaps:true,minFilter:pc.FILTER_LINEAR_MIPMAP_LINEAR,magFilter:pc.FILTER_LINEAR,anisotropy:4});
    texture.setSource(canvas);
    const material=new pc.StandardMaterial();
    material.diffuseMap=texture;material.emissiveMap=texture;material.emissive=new pc.Color(.35,.35,.35);material.useMetalness=false;material.update();
    const entity=new pc.Entity('Placa');
    entity.addComponent('render',{type:'box',castShadows:false,receiveShadows:false});
    entity.render!.meshInstances[0]!.material=material;
    // Replace the authored plate face; point_placa is in world axes at rest (the plate slopes 15 degrees).
    const authored=rig.ponto('Moto_Placa');if(authored)authored.enabled=false;
    entity.setLocalEulerAngles(15,0,0);entity.setLocalScale(PLATE_SIZE[0],PLATE_SIZE[1],PLATE_SIZE[2]);
    const anchor=rig.ponto('ponto_placa');if(anchor)anchor.addChild(entity);
    return {material,texture,entity,text};
  }
  sync(states:Record<string,MotoState>|undefined):void {
    this.states=Object.values(states??{});this.place();
    const now=performance.now();
    for(const state of this.states)this.bikes.get(state.id)?.track.push(state,now);
  }
  private place():void {
    for(const state of this.states){
      const known=this.bikes.get(state.id);
      if(known){
        if(known.rig instanceof MotoRig&&state.plate!==known.plate?.text){
          known.plate?.entity.destroy();known.plate?.material.destroy();known.plate?.texture.destroy();
          known.plate=state.plate?this.plate(known.rig,state.plate,isFogo(state)):undefined;
        }
        known.state=state;continue;
      }
      const car=isCar(state),fogo=isFogo(state),classica=isClassica(state),scooter=isScooter(state),model=isTruck(state)?this.truckModel:car?this.carModel:fogo?this.fogoModel:classica?this.classicaModel:scooter?this.scooterModel:this.model;if(!model)continue;
      const entity=new pc.Entity(`${car?'Carro':'Moto'} ${state.id}`),body=model.instantiateRenderEntity({castShadows:true,receiveShadows:true});
      const spec=vehiclePhysics(state.model);body.setLocalScale(spec.SCALE,spec.SCALE,spec.SCALE);
      entity.addChild(body);this.app.root.addChild(entity);
      const contact=this.shadow(entity);contact.setLocalScale(spec.HALF_WIDTH*4,1,spec.HALF_LENGTH*2.8);
      const rig=car?new CarRig(body,this.app.graphicsDevice,state.model):new MotoRig(body,spec.WHEEL_RADIUS,classica),fire=fogo?new MotoFire(body,this.app.graphicsDevice):undefined,exhaust=fogo?new MotoExhaust(body,this.app.graphicsDevice):undefined,paint=fogo?new MotoPaint(body):classica?new TankPaint(body):undefined;
      const plate=state.plate&&rig instanceof MotoRig?this.plate(rig,state.plate,fogo):undefined;
      this.bikes.set(state.id,{entity,rig,plate,...(fire?{fire}:{}),...(exhaust?{exhaust}:{}),...(paint?{paint}:{}),lights:rig instanceof CarRig?new CarLights(rig):new MotoLights(rig,this.lampMaterials,fogo?FOGO_LAMPS:classica?CLASSICA_LAMPS:scooter?SCOOTER_LAMPS:undefined),state,track:new RoomTrack(),riddenHere:false,gap:{x:0,z:0,yaw:0},drawn:{x:state.x,y:state.y,z:state.z,yaw:state.yaw,pitch:state.pitch}});
    }
    for(const [id,bike] of this.bikes)if(!this.states.some(state=>state.id===id)){bike.rig.destroy();bike.fire?.destroy();bike.exhaust?.destroy();bike.paint?.destroy();bike.entity.destroy();bike.plate?.material.destroy();bike.plate?.texture.destroy();this.bikes.delete(id);}
  }
  /** The local rider's own bike as it should be drawn this frame (undefined off the bike). */
  predict(id:string,body:MotoBody|undefined):void {const bike=this.bikes.get(id);if(bike)bike.predicted=body;}
  /** The lamps the local rider has on this frame (the room's state comes a little later). */
  lamps(id:string,bits:number):void {this.localLamps={id,bits};}
  /** The throttle the local rider holds this frame. */
  gas(id:string,open:boolean):void {this.localGas={id,open};}
  brake(id:string,held:boolean):void {this.localBrake={id,held};}
  update(dt:number,camera:pc.Entity,exposure:number,raining=false):void {
    const wall=performance.now(),now=Date.now();
    this.clock+=dt*1000;
    this.clock=Math.abs(wall-this.clock)>CLOCK_RESTART_MS?wall:this.clock+(wall-this.clock)*CLOCK_PULL;
    for(const bike of this.bikes.values()){
      this.deliveryBag(bike);
      const target=bike.predicted??bike.track.sample(this.clock)??bike.state,{drawn,gap}=bike;
      // Fallen, or going on by itself: how the room says it lies, nothing to smooth (its samples are already drawn late).
      const lying=!bike.predicted&&bike.state.phase?target as MotoBody&Partial<MotoState>:undefined;
      // Drawn exactly where the motion says (moto-motion.ts). Changing hands is the one jump left, and it closes by itself.
      const here=!!bike.predicted;
      if(here!==bike.riddenHere){
        bike.riddenHere=here;
        gap.x=drawn.x-target.x;gap.z=drawn.z-target.z;gap.yaw=Math.atan2(Math.sin(drawn.yaw-target.yaw),Math.cos(drawn.yaw-target.yaw));
      }
      if(Math.hypot(target.x+gap.x-drawn.x,target.z+gap.z-drawn.z)>SNAP_DISTANCE){gap.x=gap.z=gap.yaw=0;drawn.y=target.y;drawn.pitch=target.pitch;}
      const fade=Math.exp(-HANDOVER*dt);
      gap.x*=fade;gap.z*=fade;gap.yaw*=fade;
      drawn.x=target.x+gap.x;drawn.z=target.z+gap.z;drawn.yaw=target.yaw+gap.yaw;
      const lift=lying?1:1-Math.exp(-LIFT_CATCH_UP*dt);
      drawn.y+=(target.y-drawn.y)*lift;drawn.pitch+=(target.pitch-drawn.pitch)*lift;
      drawn.wheelie=((drawn.wheelie??0)+((!lying&&bike.rig instanceof MotoRig?bike.state.wheelie??0:0)-(drawn.wheelie??0))*(1-Math.exp(-12*dt)));
      const grau=wheeliePose(drawn.wheelie);
      if(bike.rig instanceof MotoRig)bike.rig.grau=grau.angle;
      bike.entity.setPosition(drawn.x+Math.sin(drawn.yaw)*grau.z,drawn.y+grau.y,drawn.z+Math.cos(drawn.yaw)*grau.z);
      if(lying&&lying.qw!==undefined)bike.entity.setRotation(lying.qx!,lying.qy!,lying.qz!,lying.qw);
      else{
        // The heading, then the slope between the axles (+X leans the front down).
        this.turn.setFromEulerAngles(0,drawn.yaw*RAD_TO_DEG,0);this.tilt.setFromEulerAngles(-drawn.pitch*RAD_TO_DEG-grau.angle,0,0);
        bike.entity.setRotation(this.turn.mul(this.tilt));
      }
      const {rig}=bike;
      if(rig instanceof CarRig)rig.setState(bike.state,raining);
      const handling=motoHandling(bike.state);
      rig.velocidade=target.speed;rig.direcao=Math.max(-1,Math.min(1,target.steer+handling.pull))*handling.turn;rig.inclinacaoMax=lying?0:10;
      rig.lateralAcceleration=target.speed*(target.yawRate??0);
      // The handlebar turns as far as the wheel really does at this speed; the lean follows the whole intent.
      rig.anguloDirecao=motoSteerAngle(target.speed,bike.state.model)*RAD_TO_DEG;
      const power=vehiclePowered(bike.state),mode=bike.state.headlights??1;
      const lamps:LampState=lampState(power,bike.predicted&&this.localLamps?.id===bike.state.id?this.localLamps.bits:bike.state.lights);
      lamps.lit=power&&mode>0;lamps.high=power&&mode===2;
      if(rig instanceof MotoRig){rig.descansoAberto=isClassica(bike.state)&&!bike.state.riderId&&!bike.state.phase;rig.freio=lamps.brake?1:0;rig.acelerador=power&&(bike.predicted&&this.localGas?.id===bike.state.id?this.localGas.open:bike.state.gas)?1:0;}
      rig.update(dt);
      bike.fire?.update(dt,target.speed,bike.entity.forward,power,exposure);
      bike.paint?.set(bike.state.color);
      if(bike.exhaust){const gasOpen=bike.predicted&&this.localGas?.id===bike.state.id?this.localGas.open:!!bike.state.gas;bike.exhaust.update(dt,target.speed,power,gasOpen,Math.min(1,1/Math.max(exposure,.1)),exposure);}
      const parts=readDriveParts(bike.state),seed=bike.state.id.charCodeAt(bike.state.id.length-1)||0;
      bike.lights.update(lamps,now,camera,exposure,motoLampLevel(parts.farol,parts.bateria,now,seed),motoLampLevel(parts.lanterna,parts.bateria,now,seed+1));
    }
    const ear=camera.getPosition();
    this.brakeSounds.update([...this.bikes.values()].map(b=>({state:b.state,...b.drawn,speed:b.predicted?.speed??b.state.speed,lateralSpeed:b.predicted?.lateralSpeed??b.state.lateralSpeed??0,
      held:b.predicted&&this.localBrake?.id===b.state.id?this.localBrake.held:!!b.state.handbrake})),ear,camera.forward,camera.up);
    this.horns.update([...this.bikes.values()].filter(bike=>!isTruck(bike.state)).map(bike=>({state:bike.state,position:bike.drawn})),ear,camera.forward,camera.up);
    this.sounds.update(dt,[...this.bikes.values()].filter(bike=>!isCar(bike.state)).map(bike=>({id:bike.state.id,x:bike.drawn.x,y:bike.drawn.y,z:bike.drawn.z,
      view:{engine:bike.state.engine??MOTO_ENGINE.OFF,engineAt:bike.state.engineAt??0,crank:bike.state.crank??0,gas:!!bike.state.gas,speed:bike.predicted?.speed??bike.state.speed,parts:bike.state.parts??''},
      ...(bike.predicted&&this.localGas?.id===bike.state.id?{gasNow:this.localGas.open}:{})})),ear,camera.forward,camera.up);
    this.carSounds.update([...this.bikes.values()].filter(b=>isCar(b.state)&&!isTruck(b.state)).map(b=>({state:b.state,...b.drawn,speed:b.predicted?.speed??b.state.speed})),ear,camera.forward,camera.up);
    this.truckSounds.update(dt,[...this.bikes.values()].filter(b=>isTruck(b.state)).map(b=>({state:b.state,...b.drawn,speed:b.predicted?.speed??b.state.speed,
      ...(b.predicted&&this.localGas?.id===b.state.id?{gasNow:this.localGas.open}:{})})),ear,camera.forward,camera.up);
  }
  /** The bike under a point of the view (CSS pixels of the canvas), the nearest first: a ray against its box, however it lies. */
  pick(camera:pc.CameraComponent,x:number,y:number):string|undefined {
    return this.pickRay(camera.screenToWorld(x,y,camera.nearClip,this.rayA),camera.screenToWorld(x,y,PICK_REACH,this.rayB))?.id;
  }
  /** The bike a segment from `near` to `far` goes through, the nearest first, and where it enters (0 at `near`, 1 at `far`): the VR controller's ray. */
  pickRay(near:pc.Vec3,far:pc.Vec3):{id:string;at:number}|undefined {
    let best:string|undefined,bestAt=Infinity;
    for(const bike of this.bikes.values()){
      const spec=vehiclePhysics(bike.state.model);
      this.toLocal.copy(bike.entity.getWorldTransform()).invert();
      this.toLocal.transformPoint(near,this.localA);this.toLocal.transformPoint(far,this.localB);
      let enter=0,leave=1;
      for(const [axis,low,high] of [['x',-spec.HALF_WIDTH-PICK_MARGIN,spec.HALF_WIDTH+PICK_MARGIN],['y',-PICK_MARGIN,spec.HEIGHT+PICK_MARGIN],['z',spec.CENTRE_Z-spec.HALF_LENGTH-PICK_MARGIN,spec.CENTRE_Z+spec.HALF_LENGTH+PICK_MARGIN]] as const){
        const from=this.localA[axis],span=this.localB[axis]-from;
        if(Math.abs(span)<1e-6){if(from<low||from>high){enter=2;break;}continue;}
        const a=(low-from)/span,b=(high-from)/span;
        enter=Math.max(enter,Math.min(a,b));leave=Math.min(leave,Math.max(a,b));
      }
      if(enter<=leave&&enter<bestAt){bestAt=enter;best=bike.state.id;}
    }
    return best===undefined?undefined:{id:best,at:bestAt};
  }
  soundTelemetry(id?:string) {const brake=this.brakeSounds.telemetry(id);if(id&&isTruck(this.bikes.get(id)?.state))return {...this.truckSounds.telemetry(id),brake};const engine=id&&isCar(this.bikes.get(id)?.state)?this.carSounds.telemetry(id):this.sounds.telemetry(id);return {...engine,horn:id?this.horns.telemetry(id):undefined,brake};}
  destroy():void {this.destroyed=true;this.sounds.destroy();this.carSounds.destroy();this.truckSounds.destroy();this.brakeSounds.destroy();this.horns.destroy();for(const bike of this.bikes.values()){bike.deliveryBag?.destroy();bike.rig.destroy();bike.fire?.destroy();bike.exhaust?.destroy();bike.paint?.destroy();}}
  ridden(playerId:string):Bike|undefined {for(const bike of this.bikes.values())if(vehicleSeat(bike.state,playerId)>=0)return bike;}
  /** The bike nearest to a point, not far off. */
  nearest(point:{x:number;z:number}):Bike|undefined {
    let found:Bike|undefined,best=6;
    for(const bike of this.bikes.values()){const away=Math.hypot(bike.drawn.x-point.x,bike.drawn.z-point.z);if(away<best){best=away;found=bike;}}
    return found;
  }
  /** The bike this player is lifting. */
  lifted(playerId:string):Bike|undefined {for(const bike of this.bikes.values())if(bike.state.lifterId===playerId)return bike;}
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
 * the grip's point and on its inner half, the ankle over the foot peg.
 */
const HIP_OVER_SEAT=.1,HIP_FORWARD=.09,LEAN=12,WRIST_BACK=.07,WRIST_UP=.035,WRIST_IN=.05,ANKLE_OVER_FLOOR=.09;
/** Short arms bow further, up to this many degrees more; turning the spine moves the shoulders by about this many metres per radian. */
const MAX_EXTRA_LEAN=20,SPINE_TO_SHOULDER=.32;
/** How much of the bow the head takes back, to look at the road. */
const HEAD_UP=.75;
const GRIP_CURL=[52,60,40] as const;
const footTurn=new pc.Quat(),leanTurn=new pc.Quat();
/**
 * The Sit clip made into a riding pose, drawn after the clip this frame (and after the bike): hips on the seat, the
 * chassis's lean and heading, hands on the moving grips and feet on the pegs by two-bone IK in world space, so every
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
