import * as pc from 'playcanvas';
import {CAR,CAR_SEATS,DEFAULT_CAR_COLOR,readCarParts,vehiclePowered,type MotoState} from '@bar/shared';
import {closeHand} from './drink-props';
import {palmUp,reach} from './serving-props';
import type {RiderRig} from './moto-delivery';
import type {LampState} from './moto-lights';

const DEGREES=180/Math.PI;
const BONES=['chassi','volante','direcao_E','direcao_D','roda_dianteira_E','roda_dianteira_D','roda_traseira_E','roda_traseira_D','porta_E','porta_D','capo','tampa_traseira','limpador_E','limpador_D','limpador_traseiro'];
const LENSES=['Luz_Farol','Luz_Lanterna','Luz_Re','Luz_Seta_E','Luz_Seta_D'];
const adjustedPlateMeshes=new WeakSet<pc.Mesh>();

function offsetRearPlate(mesh:pc.Mesh):void {
  // All cars share this mesh. Move the rear plate 12 mm clear of the hatch handle once,
  // keeping its original skin weights so it still follows the opening hatch.
  if(adjustedPlateMeshes.has(mesh))return;
  const positions:number[]=[];mesh.getPositions(positions);
  for(let z=2;z<positions.length;z+=3)if(positions[z]!<0)positions[z]!-=.012;
  mesh.setPositions(positions);mesh.update();mesh.boneAabb=null;
  adjustedPlateMeshes.add(mesh);
}

/** ESM port of the supplied carro_hatch.js. The model, names and rest transforms are preserved. */
export class CarRig {
  velocidade=0;direcao=0;anguloDirecao=33;inclinacaoMax=3.5;
  headlightMode=0;
  powered=false;
  private bones=new Map<string,{node:pc.Entity;rest:pc.Quat}>();
  private materials=new Map<string,pc.StandardMaterial>();
  private levels=new Map<string,number>();
  private wheel=0;private steer=0;private roll=0;private doorL=0;private doorR=0;private hood=0;private hatch=0;private wipe=0;
  private state?:MotoState;
  private color='';
  private plateText='';private plateTexture?:pc.Texture;
  private q=new pc.Quat();private turn=new pc.Quat();
  constructor(readonly entity:pc.Entity,private readonly device:pc.GraphicsDevice){
    for(const name of BONES){const node=this.ponto(name);if(node)this.bones.set(name,{node,rest:node.getLocalRotation().clone()});}
    for(const render of entity.findComponents('render') as pc.RenderComponent[])for(const instance of render.meshInstances){
      const source=instance.material;
      if(source?.name==='Carro_Placa'&&instance.mesh)offsetRearPlate(instance.mesh);
      if(source instanceof pc.StandardMaterial&&(source.name==='Carro_Pintura'||source.name==='Carro_Placa'||LENSES.includes(source.name))){
        let material=this.materials.get(source.name);if(!material){material=source.clone();this.materials.set(source.name,material);}instance.material=material;
      }
      if(source instanceof pc.StandardMaterial&&source.blendType!==pc.BLEND_NONE)instance.castShadow=false;
    }
    for(const name of LENSES)this.lens(name,0);
  }
  ponto(name:string):pc.Entity {
    const alias:Record<string,string>={ponto_piloto:'ponto_motorista',ponto_farol:'ponto_farol_E',ponto_lanterna:'ponto_lanterna_E',ponto_entrega:'ponto_porta_malas',bau:'tampa_traseira',roda_dianteira:'roda_dianteira_E',roda_traseira:'roda_traseira_E',direcao:'direcao_E'};
    return this.entity.findByName(alias[name]??name) as pc.Entity;
  }
  private rotate(name:string,x:number,y:number,z:number):void {const bone=this.bones.get(name);if(bone)bone.node.setLocalRotation(this.turn.mul2(bone.rest,this.q.setFromEulerAngles(x,y,z)));}
  lens(name:string,level:number,exposure=1):void {
    level=level/Math.max(.5,exposure);
    if(this.levels.get(name)===level)return;this.levels.set(name,level);
    const material=this.materials.get(name);if(material){material.emissiveIntensity=level;material.update();}
  }
  setState(state:MotoState,raining:boolean):void {
    this.state=state;
    this.powered=vehiclePowered(state);
    this.headlightMode=this.powered?(state.headlights??0):0;
    const color=state.color??DEFAULT_CAR_COLOR;
    if(color!==this.color){this.color=color;const paint=this.materials.get('Carro_Pintura');if(paint){paint.diffuse.fromString(color);paint.update();}}
    if(state.plate&&state.plate!==this.plateText)this.plate(state.plate);
    this.raining=raining;
  }
  private raining=false;
  private plate(text:string):void {
    this.plateText=text;const material=this.materials.get('Carro_Placa');if(!material)return;
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=168;const g=canvas.getContext('2d')!;
    g.fillStyle='#f4f4f0';g.fillRect(0,0,512,168);g.fillStyle='#123c9c';g.fillRect(0,0,512,34);
    g.fillStyle='#fff';g.font='bold 22px Arial';g.textAlign='center';g.textBaseline='middle';g.fillText('BRASIL',256,18);
    g.fillStyle='#111';g.font='bold 96px Arial';g.fillText(text,256,104,480);g.lineWidth=5;g.strokeRect(3,3,506,162);
    this.plateTexture?.destroy();this.plateTexture=new pc.Texture(this.device,{width:512,height:168,mipmaps:true});this.plateTexture.setSource(canvas);
    material.diffuseMap=this.plateTexture;material.emissiveMap=this.plateTexture;material.emissive.set(.25,.25,.25);material.update();
  }
  update(dt:number):void {
    const k=1-Math.exp(-7*dt),state=this.state,parts=readCarParts(state?.parts);
    this.steer+=(Math.max(-1,Math.min(1,this.direcao))*this.anguloDirecao-this.steer)*k;
    this.roll+=(this.direcao*3.5*Math.min(1,Math.abs(this.velocidade)/15)-this.roll)*k;
    this.wheel=(this.wheel+this.velocidade*dt/CAR.WHEEL_RADIUS*DEGREES)%360;
    for(const name of ['roda_dianteira_E','roda_dianteira_D','roda_traseira_E','roda_traseira_D'])this.rotate(name,this.wheel,0,0);
    this.rotate('direcao_E',0,-this.steer,0);this.rotate('direcao_D',0,-this.steer,0);
    this.rotate('volante',0,-this.steer*7.64,0);this.rotate('chassi',0,0,this.roll);
    const door=(bit:number,part:string)=>(state?.doors??0)&bit?Math.min(1,parts[part]!/35):0;
    this.doorL+=(door(1,'porta_esquerda')-this.doorL)*k;this.doorR+=(door(2,'porta_direita')-this.doorR)*k;
    this.hood+=((state?.hood?1:0)-this.hood)*k;this.hatch+=((state?.trunk?1:0)-this.hatch)*k;
    this.rotate('porta_E',0,-68*this.doorL,0);this.rotate('porta_D',0,68*this.doorR,0);this.rotate('capo',-52*this.hood,0,0);this.rotate('tampa_traseira',78*this.hatch,0,0);
    for(const [name,id] of [['porta_E','porta_esquerda'],['porta_D','porta_direita'],['capo','capo'],['tampa_traseira','porta_malas']])this.ponto(name!).setLocalScale(parts[id!]!<=0?0:1,parts[id!]!<=0?0:1,parts[id!]!<=0?0:1);
    const wiping=this.powered&&(state?.wipers||this.raining)&&parts.limpadores!>0&&parts.bateria!>0;
    if(wiping)this.wipe+=dt/1.6*Math.max(.25,parts.limpadores!/100);else this.wipe+=(Math.ceil(this.wipe)-this.wipe)*k;
    const sweep=Math.sin(Math.PI*(this.wipe%1));this.rotate('limpador_E',0,-82*sweep,0);this.rotate('limpador_D',0,-82*sweep,0);this.rotate('limpador_traseiro',0,-165*sweep,0);
  }
  telemetry(){return {guidao:this.steer,inclinacao:this.roll,rodas:this.wheel,topoRoda:-this.ponto('roda_traseira_E').up.dot(this.entity.forward),color:this.color,plate:this.plateText,
    doors:[this.doorL,this.doorR],hood:this.hood,trunk:this.hatch,wipers:this.wipe,paint:this.materials.get('Carro_Pintura')?.diffuse.toString(false)};}
  destroy():void {this.plateTexture?.destroy();for(const material of this.materials.values())material.destroy();}
}

/** Two forward spots share the city's light budget: no extra shadow maps. */
export class CarLights {
  private heads:pc.Entity[]=[];private rear:pc.Entity;private current?:LampState;private headLevel=0;private tailLevel=0;
  constructor(private readonly rig:CarRig){
    for(const point of ['ponto_farol_E','ponto_farol_D']){
      const light=new pc.Entity('Car headlight');light.addComponent('light',{type:'spot',color:new pc.Color(1,.94,.8),range:28,intensity:0,innerConeAngle:18,outerConeAngle:35,castShadows:false});
      light.setLocalEulerAngles(-86,0,0);rig.ponto(point).addChild(light);this.heads.push(light);
    }
    this.rear=new pc.Entity('Car rear light');this.rear.addComponent('light',{type:'omni',color:new pc.Color(1,.03,.02),range:3,intensity:0,castShadows:false});rig.ponto('ponto_lanterna_E').addChild(this.rear);
  }
  update(state:LampState,now:number,camera:pc.Entity,exposure:number,head=1,tail=1):void {
    if(!this.rig.powered){head=0;tail=0;state={lit:false,brake:false,left:false,right:false,high:false};}
    this.current=state;this.headLevel=head;this.tailLevel=tail;
    const blink=Math.floor(now/333)%2===0,near=this.rig.entity.getPosition().distance(camera.getPosition())<55;
    const lit=this.rig.headlightMode>0,high=this.rig.headlightMode===2;
    this.rig.lens('Luz_Farol',lit?(high?3.5:2)*head:0,exposure);
    this.rig.lens('Luz_Lanterna',(state.brake?3:lit?1.2:0)*tail,exposure);
    this.rig.lens('Luz_Re',this.rig.powered&&this.rig.velocidade<-.05?2.5*tail:0,exposure);
    this.rig.lens('Luz_Seta_E',state.left&&blink?2.5*tail:0,exposure);this.rig.lens('Luz_Seta_D',state.right&&blink?2.5*tail:0,exposure);
    for(const entity of this.heads){const light=entity.light!;light.enabled=near&&lit&&head>0;light.range=high?45:28;light.intensity=(high?4:2.5)*head;}
    this.rear.light!.enabled=near&&tail>0&&(state.brake||lit);this.rear.light!.intensity=(state.brake?.6:.15)*tail;
  }
  telemetry(){const head=this.heads[0]!,beam=head.up.clone().mulScalar(-1);return {...this.current,levels:{head:this.headLevel,tail:this.tailLevel},headlight:head.light!.enabled,tail:this.rear.light!.enabled,beam:beam.toArray(),lens:{head:head.light!.enabled,re:this.rig.powered&&this.tailLevel>0&&this.rig.velocidade<-.05}};}
}

/** A seated clip placed on the authored bench, with driver's hands and feet on the moving wheel and pedals. */
export function seatCar(car:CarRig,rider:RiderRig,seat:number,originalScale:pc.Vec3=pc.Vec3.ONE):void {
  const anchor=car.ponto(CAR_SEATS[seat]!.node),up=car.entity.up.clone(),front=car.entity.forward.clone().mulScalar(-1),left=car.entity.right.clone();
  // Different skeletons have different seated heights. Keep the head below the low hatch roof and restore the scale on exit.
  const torso=Math.max(.4,(rider.head.getPosition().y-rider.hip.getPosition().y)/Math.max(.01,rider.root.getLocalScale().y));
  const fit=Math.min(1,.65/torso);rider.root.setLocalScale(originalScale.x*fit,originalScale.y*fit,originalScale.z*fit);
  rider.root.setRotation(car.ponto('chassi').getRotation());
  const hip=anchor.getPosition().clone();rider.root.setPosition(rider.root.getPosition().clone().add(hip.sub(rider.hip.getPosition())));
  if(seat!==0)return;
  for(const [side,sign] of [['l',1],['r',-1]] as const){
    const point=car.ponto(side==='l'?'ponto_mao_E':'ponto_mao_D').getPosition().clone();
    reach(rider[`upperarm_${side}`],rider[`lowerarm_${side}`],rider[`hand_${side}`],point,left.clone().mulScalar(sign).sub(up));
    const hand=side==='l'?rider.handRigL:rider.handRigR;if(hand){palmUp(hand,front,up);closeHand(hand,[45,55,35]);}
    const foot=car.ponto(side==='l'?'ponto_pe_E':'ponto_pe_D').getPosition().clone().add(up.clone().mulScalar(.07));
    reach(rider[`upperleg_${side}`],rider[`lowerleg_${side}`],rider[`foot_${side}`],foot,front.clone().add(left.clone().mulScalar(sign*.3)));
  }
}
