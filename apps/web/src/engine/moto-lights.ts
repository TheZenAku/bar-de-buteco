import * as pc from 'playcanvas';
import {MOTO_LIGHT} from '@bar/shared';
import type {MotoRig} from './moto-delivery';

/**
 * The bike's lamps. moto_delivery.glb has one material and no glass of its own, so each lamp is a lit lens laid over where the model paints
 * one, a soft halo that faces the camera (there is no bloom), and for those that reach the street, a real light. Lamp positions are model
 * metres from the rig's points (they follow the steering, the lean and a fall by being children of its bones).
 */
type Rgb=readonly [number,number,number];
const WARM:Rgb=[1,.93,.78],RED:Rgb=[1,.05,.03],AMBER:Rgb=[1,.5,.04],WHITE:Rgb=[.9,.95,1];
/** The lamp in the scene's own units: a lens at 1 is its colour at full, a halo at 1 about as bright as a lens. */
const LENS={head:1.6,position:.55,tail:.55,brake:1.5,signal:1.5,plate:.5,panel:.8} as const;
/** A halo against its lens. */
const HALO_GAIN=.62;
/** Blinkers: on and off this long (ms), about 90 flashes a minute as the law asks. */
const BLINK_MS=333;
/** Beyond this distance from the camera a bike's lamps light nothing, and only its lenses and halos show. */
const REAL_LIGHT_REACH=55;
const SIGNAL_LIGHT_REACH=25;
const HEAD={LOW:{range:30,intensity:7,tilt:4},HIGH:{range:52,intensity:12,tilt:1},inner:17,outer:33} as const;
const TAIL_LIGHT={range:2.2,intensity:.14},BRAKE_LIGHT={range:3.4,intensity:.42},SIGNAL_LIGHT={range:2.2,intensity:.35};

interface Lens {entity:pc.Entity;instance:pc.MeshInstance;halo?:pc.Entity;haloInstance?:pc.MeshInstance;haloSize:number}
interface LampSpot {node:string;at:Rgb;size:Rgb;halo:number}
const spots={
  head:{node:'ponto_farol',at:[0,0,.012],size:[.185,.185,.02],halo:.62},
  // The two panels on the leg shield.
  positionL:{node:'chassi',at:[.128,.842,.598],size:[.1,.17,.03],halo:.3},
  positionR:{node:'chassi',at:[-.128,.842,.598],size:[.1,.17,.03],halo:.3},
  // The red glass under the box, and the plate's little lamp below it.
  tail:{node:'ponto_lanterna',at:[.016,-.13,.02],size:[.24,.11,.02],halo:.5},
  plate:{node:'ponto_lanterna',at:[.016,-.235,.03],size:[.09,.025,.02],halo:.09},
  // The rear blinkers: the pale panels on the tail's corners.
  rearL:{node:'ponto_lanterna',at:[.205,-.13,.1],size:[.05,.09,.08],halo:.3},
  rearR:{node:'ponto_lanterna',at:[-.175,-.13,.1],size:[.05,.09,.08],halo:.3},
  // The dials, for whoever rides it: behind the headlight.
  panel:{node:'ponto_farol',at:[0,.075,-.12],size:[.1,.015,.06],halo:.05},
} as const satisfies Record<string,LampSpot>;
type LampName=keyof typeof spots;

const haloVertex=`
attribute vec3 aPosition;attribute vec2 aUv0;
uniform mat4 matrix_model;uniform mat4 matrix_viewProjection;
varying vec2 vUv;
void main(){vUv=aUv0*2.-1.;gl_Position=matrix_viewProjection*matrix_model*vec4(aPosition,1.);}`;
const haloFragment=`
precision highp float;
uniform vec3 haloColor;uniform float haloLevel;
varying vec2 vUv;
void main(){float r=min(1.,length(vUv)),core=1.-r;gl_FragColor=vec4(haloColor,(core*core*core*.85+core*.15)*haloLevel);}`;
/** The materials every bike shares: one lens per colour and the halo. Brightness goes per lamp, on its mesh instance. */
export class MotoLampMaterials {
  private readonly lens=new Map<Rgb,pc.StandardMaterial>();
  /** Added to what is behind it, keeping the canvas's alpha (see the rendering notes: the page shows through otherwise). */
  readonly halo:pc.ShaderMaterial;
  constructor() {
    this.halo=new pc.ShaderMaterial({uniqueName:'Moto lamp halo',attributes:{aPosition:pc.SEMANTIC_POSITION,aUv0:pc.SEMANTIC_TEXCOORD0},vertexGLSL:haloVertex,fragmentGLSL:haloFragment});
    this.halo.blendState=new pc.BlendState(true,pc.BLENDEQUATION_ADD,pc.BLENDMODE_SRC_ALPHA,pc.BLENDMODE_ONE,pc.BLENDEQUATION_ADD,pc.BLENDMODE_ZERO,pc.BLENDMODE_ONE);
    this.halo.depthWrite=false;this.halo.cull=pc.CULLFACE_NONE;this.halo.update();
  }
  lensOf(colour:Rgb):pc.StandardMaterial {
    let material=this.lens.get(colour);
    if(!material){
      material=new pc.StandardMaterial();material.useLighting=false;material.useFog=false;material.diffuse.set(0,0,0);material.emissive.set(...colour);material.emissiveIntensity=1;material.update();
      this.lens.set(colour,material);
    }
    return material;
  }
}

const dim=(instance:pc.MeshInstance,level:number)=>instance.setParameter('material_emissiveIntensity',level);
const offState={lit:false,brake:false,left:false,right:false,high:false};
export type LampState=typeof offState;
/** What a bike's state asks of its lamps. The rider's own come from the keys, ahead of the room. */
export function lampState(lit:boolean,lights:number):LampState {
  return {lit,brake:lit&&!!(lights&MOTO_LIGHT.BRAKE),left:lit&&!!(lights&MOTO_LIGHT.LEFT),right:lit&&!!(lights&MOTO_LIGHT.RIGHT),high:lit&&!!(lights&MOTO_LIGHT.HIGH)};
}

export class MotoLights {
  private readonly lamps=new Map<LampName,Lens>();
  private readonly headLight:pc.Entity;
  private readonly tailLight:pc.Entity;
  private readonly signalLeft:pc.Entity;
  private readonly signalRight:pc.Entity;
  private state:LampState=offState;
  private levels={head:1,tail:1};
  /** Facing the camera. */
  private readonly faceCamera=new pc.Quat();
  private readonly turnToCamera=new pc.Quat().setFromEulerAngles(90,0,0);

  constructor(rig:MotoRig,private readonly materials:MotoLampMaterials) {
    const add=(name:LampName,colour:Rgb)=>{
      const {node,at,size,halo}=spots[name],parent=rig.ponto(node),entity=new pc.Entity(`Lente ${name}`);
      entity.addComponent('render',{type:'sphere',material:materials.lensOf(colour),castShadows:false,receiveShadows:false});
      entity.setLocalPosition(at[0],at[1],at[2]);entity.setLocalScale(size[0],size[1],size[2]);entity.enabled=false;parent.addChild(entity);
      const glow=new pc.Entity(`Halo ${name}`);
      glow.addComponent('render',{type:'plane',material:materials.halo,castShadows:false,receiveShadows:false});
      glow.render!.meshInstances[0]!.setParameter('haloColor',[...colour]);
      glow.setLocalPosition(at[0],at[1],at[2]);glow.enabled=false;parent.addChild(glow);
      this.lamps.set(name,{entity,instance:entity.render!.meshInstances[0]!,halo:glow,haloInstance:glow.render!.meshInstances[0]!,haloSize:halo});
    };
    add('head',WARM);add('positionL',WHITE);add('positionR',WHITE);add('tail',RED);add('plate',WHITE);add('rearL',AMBER);add('rearR',AMBER);add('panel',WHITE);
    const light=(parent:pc.Entity,name:string,data:object,at:Rgb)=>{
      const entity=new pc.Entity(name);
      entity.addComponent('light',{castShadows:false,falloffMode:pc.LIGHTFALLOFF_LINEAR,enabled:false,...data});
      entity.setLocalPosition(at[0],at[1],at[2]);parent.addChild(entity);
      return entity;
    };
    // A spot shines along its −Y: this turns that forward (+Z) and a little down.
    this.headLight=light(rig.ponto('ponto_farol'),'Farol',{type:'spot',color:new pc.Color(...WARM),innerConeAngle:HEAD.inner,outerConeAngle:HEAD.outer,range:HEAD.LOW.range,intensity:HEAD.LOW.intensity},[0,0,.04]);
    this.tailLight=light(rig.ponto('ponto_lanterna'),'Lanterna',{type:'omni',color:new pc.Color(...RED),range:TAIL_LIGHT.range,intensity:TAIL_LIGHT.intensity},[0,.02,-.32]);
    this.signalLeft=light(rig.ponto('ponto_lanterna'),'Seta esquerda',{type:'omni',color:new pc.Color(...AMBER),range:SIGNAL_LIGHT.range,intensity:SIGNAL_LIGHT.intensity},[.3,0,0]);
    this.signalRight=light(rig.ponto('ponto_lanterna'),'Seta direita',{type:'omni',color:new pc.Color(...AMBER),range:SIGNAL_LIGHT.range,intensity:SIGNAL_LIGHT.intensity},[-.3,0,0]);
  }

  private lamp(name:LampName,level:number,colour?:Rgb,exposure=1,camera?:pc.Entity):void {
    const lamp=this.lamps.get(name)!,on=level>0;
    lamp.entity.enabled=on;
    if(lamp.halo)lamp.halo.enabled=on&&!!camera;
    if(!on)return;
    // Exposure multiplies everything on screen: dividing by it keeps a lit lamp the same by day and by night.
    const shown=level/Math.max(exposure,.1);
    if(colour&&lamp.instance.material!==this.materials.lensOf(colour)){lamp.instance.material=this.materials.lensOf(colour);lamp.haloInstance?.setParameter('haloColor',[...colour]);}
    dim(lamp.instance,shown);
    if(!lamp.halo||!camera)return;
    lamp.haloInstance?.setParameter('haloLevel',Math.min(1,level*HALO_GAIN));
    const size=lamp.haloSize;
    lamp.halo.setRotation(this.faceCamera);
    // The parents carry the model's scale.
    lamp.halo.setLocalScale(size/.8,size/.8,size/.8);
  }

  /** `head` and `tail`: how much of each works, 1 whole, flickering or 0 when broken (motoLampLevel). The blinkers at the back go with the tail. */
  update(state:LampState,now:number,camera:pc.Entity,exposure:number,head=1,tailLamp=1):void {
    this.state=state;
    const {lit,brake,left,right,high}=state,blink=Math.floor(now/BLINK_MS)%2===0;
    const leftOn=left&&blink,rightOn=right&&blink;
    this.levels={head,tail:tailLamp};
    this.faceCamera.copy(camera.getRotation()).mul(this.turnToCamera);
    this.lamp('head',lit?LENS.head*(high?1.25:1)*head:0,undefined,exposure,camera);
    // The shield's panels: dim white while lit, the blinkers when asked.
    this.lamp('positionL',leftOn?LENS.signal:lit&&!left?LENS.position:0,leftOn?AMBER:WHITE,exposure,camera);
    this.lamp('positionR',rightOn?LENS.signal:lit&&!right?LENS.position:0,rightOn?AMBER:WHITE,exposure,camera);
    this.lamp('tail',lit?(brake?LENS.brake:LENS.tail)*tailLamp:0,undefined,exposure,camera);
    this.lamp('plate',lit?LENS.plate*tailLamp:0,undefined,exposure,camera);
    this.lamp('rearL',leftOn?LENS.signal*tailLamp:0,undefined,exposure,camera);
    this.lamp('rearR',rightOn?LENS.signal*tailLamp:0,undefined,exposure,camera);
    this.lamp('panel',lit?LENS.panel:0,undefined,exposure,camera);
    const distance=this.headLight.getPosition().distance(camera.getPosition()),near=distance<REAL_LIGHT_REACH;
    const beamLight=this.headLight.light!,beam=high?HEAD.HIGH:HEAD.LOW;
    beamLight.enabled=lit&&near&&head>0;
    if(beamLight.enabled){beamLight.range=beam.range;beamLight.intensity=beam.intensity*head;this.headLight.setLocalEulerAngles(-90+beam.tilt,0,0);}
    const tail=this.tailLight.light!,glow=brake?BRAKE_LIGHT:TAIL_LIGHT;
    tail.enabled=lit&&near&&tailLamp>0;
    if(tail.enabled){tail.range=glow.range;tail.intensity=glow.intensity*tailLamp;}
    const closeBy=distance<SIGNAL_LIGHT_REACH;
    this.signalLeft.light!.enabled=leftOn&&closeBy;
    this.signalRight.light!.enabled=rightOn&&closeBy;
  }
  telemetry() {
    const {lit,brake,left,right,high}=this.state,head=this.headLight.light!,forward=this.headLight.up.clone().mulScalar(-1);
    return {lit,brake,left,right,high,levels:this.levels,headlight:head.enabled,tail:this.tailLight.light!.enabled,beam:[+forward.x.toFixed(3),+forward.y.toFixed(3),+forward.z.toFixed(3)],lens:Object.fromEntries([...this.lamps].map(([name,lamp])=>[name,lamp.entity.enabled]))};
  }
}
