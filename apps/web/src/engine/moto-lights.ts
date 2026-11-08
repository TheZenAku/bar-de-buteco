import * as pc from 'playcanvas';
import {MOTO,MOTO_LIGHT} from '@bar/shared';
import type {MotoRig} from './moto-delivery';

/**
 * v4's authored emissive lenses, a soft halo that faces the camera (there is no bloom), and for those that reach the street,
 * a real light. Only the plate/panel use extra lenses. Lamp positions are model
 * metres from the rig's points (they follow the steering, the lean and a fall by being children of its bones).
 */
type Rgb=readonly [number,number,number];
const WARM:Rgb=[1,.93,.78],RED:Rgb=[1,.05,.03],AMBER:Rgb=[1,.5,.04],WHITE:Rgb=[.9,.95,1],FLAME:Rgb=[1,.42,.07];
/** The lamp in the scene's own units: a lens at 1 is its colour at full, a halo at 1 about as bright as a lens. */
const LENS={head:1.6,tail:.55,brake:1.5,signal:1.5,plate:.5,panel:.8} as const;
/** A halo against its lens. */
const HALO_GAIN=.62;
/** Blinkers: on and off this long (ms), about 90 flashes a minute as the law asks. */
const BLINK_MS=333;
/** Beyond this distance from the camera a bike's lamps light nothing, and only its lenses and halos show. */
const REAL_LIGHT_REACH=55;
const SIGNAL_LIGHT_REACH=25;
/** Each eye's share of the headlight's strength: two lamps in the colour of fire light the street about as one white lamp does. */
const EYE_SHARE=.8;
const HEAD={LOW:{range:30,intensity:7,tilt:4},HIGH:{range:52,intensity:12,tilt:1},inner:17,outer:33} as const;
const TAIL_LIGHT={range:2.2,intensity:.14},BRAKE_LIGHT={range:3.4,intensity:.42},SIGNAL_LIGHT={range:2.2,intensity:.35};

interface Lens {entity:pc.Entity;instance:pc.MeshInstance;model:boolean;halo?:pc.Entity;haloInstance?:pc.MeshInstance;haloSize:number}
interface LampSpot {node:string;at:Rgb;size:Rgb;halo:number}
const spots={
  head:{node:'ponto_farol',at:[0,0,.012],size:[.185,.185,.02],halo:.62},
  // one lamp per eye of a skull (a profile with `eyes`)
  eyeE:{node:'ponto_olho_E',at:[0,0,.01],size:[.05,.05,.02],halo:.16},
  eyeD:{node:'ponto_olho_D',at:[0,0,.01],size:[.05,.05,.02],halo:.16},
  positionL:{node:'ponto_seta_frente_E',at:[0,0,0],size:[.08,.04,.03],halo:.3},
  positionR:{node:'ponto_seta_frente_D',at:[0,0,0],size:[.08,.04,.03],halo:.3},
  tail:{node:'ponto_lanterna',at:[0,0,0],size:[.24,.11,.02],halo:.5},
  brake:{node:'ponto_freio',at:[0,0,0],size:[.07,.03,.02],halo:.3},
  plate:{node:'ponto_luz_placa',at:[0,0,-.012],size:[.09,.025,.02],halo:.09},
  rearL:{node:'ponto_seta_tras_E',at:[0,0,0],size:[.05,.04,.03],halo:.3},
  rearR:{node:'ponto_seta_tras_D',at:[0,0,0],size:[.05,.04,.03],halo:.3},
  // The dials, for whoever rides it: behind the headlight.
  panel:{node:'ponto_farol',at:[0,.075,-.12],size:[.1,.015,.06],halo:.05},
} as const satisfies Record<string,LampSpot>;
type LampName=keyof typeof spots;
/**
 * What differs from the delivery bike in another model's lamps. Lamps in `skip` are not drawn at all (no generated lens, no halo):
 * for a model whose own meshes are its lamps. `halo` sizes (metres) replace the delivery bike's. With `brakeOnTail` the model has no
 * Luz_Freio: its tail lens brightens to the brake's level instead.
 */
export interface LampProfile {skip?:readonly LampName[];halo?:Partial<Record<LampName,number>>;brakeOnTail?:boolean;/** The headlight is two lamps, one per eye (ponto_olho_E/D), in the colour of the bike's flames. */eyes?:boolean}
/** The Caveira em Chamas: the skull's eyes are the headlight, the amber balls the blinkers and the tail's recessed lens the tail and brake. */
export const FOGO_LAMPS:LampProfile={skip:['head','plate','panel','brake'],halo:{eyeE:.2,eyeD:.2,positionL:.1,positionR:.1,tail:.2,rearL:.1,rearR:.1},brakeOnTail:true,eyes:true};
/** The Clássica Raiada: lenses of its own (headlight, front blinkers, the wide tail lamp, which is the brake too); the back blinkers are the tail lamp's ends. */
/** The Scooter de Entrega: no lens meshes of its own (generated ones), the wide tail lamp is the brake too. */
export const SCOOTER_LAMPS:LampProfile={skip:['brake'],halo:{positionL:.14,positionR:.14,rearL:.14,rearR:.14},brakeOnTail:true};
export const CLASSICA_LAMPS:LampProfile={skip:['brake'],halo:{positionL:.14,positionR:.14,rearL:.14,rearR:.14},brakeOnTail:true};

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
  private readonly headLights:pc.Entity[]=[];
  private readonly tailLight:pc.Entity;
  private readonly signalLeft:pc.Entity;
  private readonly signalRight:pc.Entity;
  private state:LampState=offState;
  private levels={head:1,tail:1};
  /** Facing the camera. */
  private readonly faceCamera=new pc.Quat();
  private readonly turnToCamera=new pc.Quat().setFromEulerAngles(90,0,0);

  constructor(private readonly rig:MotoRig,private readonly materials:MotoLampMaterials,private readonly profile:LampProfile={}) {
    const meshes:Partial<Record<LampName,string>>={head:'Luz_Farol',eyeE:'Luz_Farol',eyeD:'Luz_Farol',tail:'Luz_Lanterna',brake:'Luz_Freio',positionL:'Luz_Seta_E',positionR:'Luz_Seta_D',rearL:'Luz_Seta_E',rearR:'Luz_Seta_D'};
    const add=(name:LampName,colour:Rgb)=>{
      if(profile.skip?.includes(name)||(!profile.eyes&&(name==='eyeE'||name==='eyeD')))return;
      // A model without the authored lens mesh gets the generated one (unless its profile skips that lamp).
      const {node,at,size,halo}=spots[name],parent=rig.ponto(node),found=meshes[name]?rig.ponto(meshes[name]!):null,authored=found?.render?found:null,mesh=authored?meshes[name]:undefined,entity=authored??new pc.Entity(`Lente ${name}`);
      if(!mesh){
        entity.addComponent('render',{type:'sphere',material:materials.lensOf(colour),castShadows:false,receiveShadows:false});
        entity.setLocalPosition(at[0],at[1],at[2]);entity.setLocalScale(size[0],size[1],size[2]);entity.enabled=false;parent.addChild(entity);
      }
      const glow=new pc.Entity(`Halo ${name}`);
      glow.addComponent('render',{type:'plane',material:materials.halo,castShadows:false,receiveShadows:false});
      glow.render!.meshInstances[0]!.setParameter('haloColor',[...colour]);
      glow.setLocalPosition(at[0],at[1],at[2]);glow.enabled=false;parent.addChild(glow);
      this.lamps.set(name,{entity,model:!!mesh,instance:entity.render!.meshInstances[0]!,halo:glow,haloInstance:glow.render!.meshInstances[0]!,haloSize:profile.halo?.[name]??halo});
    };
    add('head',WARM);add('eyeE',FLAME);add('eyeD',FLAME);add('positionL',AMBER);add('positionR',AMBER);add('tail',RED);add('brake',RED);add('plate',WHITE);add('rearL',AMBER);add('rearR',AMBER);add('panel',WHITE);
    const light=(parent:pc.Entity,name:string,data:object,at:Rgb)=>{
      const entity=new pc.Entity(name);
      entity.addComponent('light',{castShadows:false,falloffMode:pc.LIGHTFALLOFF_LINEAR,enabled:false,...data});
      entity.setLocalPosition(at[0],at[1],at[2]);parent.addChild(entity);
      return entity;
    };
    // A spot shines along its −Y: this turns that forward (+Z) and a little down.
    const beam=(node:string,name:string,colour:Rgb,intensity:number)=>this.headLights.push(light(rig.ponto(node),name,{type:'spot',color:new pc.Color(...colour),innerConeAngle:HEAD.inner,outerConeAngle:HEAD.outer,range:HEAD.LOW.range,intensity},[0,0,.04]));
    if(profile.eyes){beam('ponto_olho_E','Olho esquerdo',FLAME,HEAD.LOW.intensity*EYE_SHARE);beam('ponto_olho_D','Olho direito',FLAME,HEAD.LOW.intensity*EYE_SHARE);}
    else beam('ponto_farol','Farol',WARM,HEAD.LOW.intensity);
    this.tailLight=light(rig.ponto('ponto_lanterna'),'Lanterna',{type:'omni',color:new pc.Color(...RED),range:TAIL_LIGHT.range,intensity:TAIL_LIGHT.intensity},[0,0,-.04]);
    this.signalLeft=light(rig.ponto('ponto_seta_tras_E'),'Seta esquerda',{type:'omni',color:new pc.Color(...AMBER),range:SIGNAL_LIGHT.range,intensity:SIGNAL_LIGHT.intensity},[0,0,0]);
    this.signalRight=light(rig.ponto('ponto_seta_tras_D'),'Seta direita',{type:'omni',color:new pc.Color(...AMBER),range:SIGNAL_LIGHT.range,intensity:SIGNAL_LIGHT.intensity},[0,0,0]);
  }

  private lamp(name:LampName,level:number,colour?:Rgb,exposure=1,camera?:pc.Entity):void {
    const lamp=this.lamps.get(name);if(!lamp)return;
    const on=level>0;
    if(!lamp.model)lamp.entity.enabled=on;
    if(lamp.halo)lamp.halo.enabled=on&&!!camera;
    if(!on)return;
    // Exposure multiplies everything on screen: dividing by it keeps a lit lamp the same by day and by night.
    const shown=level/Math.max(exposure,.1);
    if(!lamp.model){
      if(colour&&lamp.instance.material!==this.materials.lensOf(colour)){lamp.instance.material=this.materials.lensOf(colour);lamp.haloInstance?.setParameter('haloColor',[...colour]);}
      dim(lamp.instance,shown);
    }
    if(!lamp.halo||!camera)return;
    lamp.haloInstance?.setParameter('haloLevel',Math.min(1,level*HALO_GAIN));
    const size=lamp.haloSize;
    lamp.halo.setRotation(this.faceCamera);
    // The parents carry the model's scale.
    lamp.halo.setLocalScale(size/MOTO.SCALE,size/MOTO.SCALE,size/MOTO.SCALE);
  }

  /** `head` and `tail`: how much of each works, 1 whole, flickering or 0 when broken (motoLampLevel). The blinkers at the back go with the tail. */
  update(state:LampState,now:number,camera:pc.Entity,exposure:number,head=1,tailLamp=1):void {
    this.state=state;
    const {lit,brake,left,right,high}=state,blink=Math.floor(now/BLINK_MS)%2===0;
    const leftOn=left&&blink,rightOn=right&&blink;
    this.levels={head,tail:tailLamp};
    this.faceCamera.copy(camera.getRotation()).mul(this.turnToCamera);
    const display=Math.max(exposure,.1);
    this.rig.luz('Luz_Farol',lit,LENS.head*(high?1.25:1)*head/display);
    // Without a brake lens of its own the tail lens is the brake light too.
    const tailOnly=this.profile.brakeOnTail&&brake?LENS.brake:lit?LENS.tail:0;
    this.rig.luz('Luz_Lanterna',tailOnly>0,tailOnly*tailLamp/display);
    this.rig.luz('Luz_Freio',brake,LENS.brake*tailLamp/display);
    this.rig.luz('Luz_Seta_E',leftOn,LENS.signal*tailLamp/display);
    this.rig.luz('Luz_Seta_D',rightOn,LENS.signal*tailLamp/display);
    for(const name of ['head','eyeE','eyeD'] as const)this.lamp(name,lit?LENS.head*(high?1.25:1)*head:0,undefined,exposure,camera);
    this.lamp('positionL',leftOn?LENS.signal*tailLamp:0,undefined,exposure,camera);
    this.lamp('positionR',rightOn?LENS.signal*tailLamp:0,undefined,exposure,camera);
    this.lamp('tail',tailOnly*tailLamp,undefined,exposure,camera);
    this.lamp('brake',brake?LENS.brake*tailLamp:0,undefined,exposure,camera);
    this.lamp('plate',lit?LENS.plate*tailLamp:0,undefined,exposure,camera);
    this.lamp('rearL',leftOn?LENS.signal*tailLamp:0,undefined,exposure,camera);
    this.lamp('rearR',rightOn?LENS.signal*tailLamp:0,undefined,exposure,camera);
    this.lamp('panel',lit?LENS.panel:0,undefined,exposure,camera);
    const distance=this.headLights[0]!.getPosition().distance(camera.getPosition()),near=distance<REAL_LIGHT_REACH,beam=high?HEAD.HIGH:HEAD.LOW;
    for(const eye of this.headLights){
      const beamLight=eye.light!;beamLight.enabled=lit&&near&&head>0;
      if(beamLight.enabled){beamLight.range=beam.range;beamLight.intensity=beam.intensity*head*(this.profile.eyes?EYE_SHARE:1);eye.setLocalEulerAngles(-90+beam.tilt,0,0);}
    }
    const tail=this.tailLight.light!,glow=brake?BRAKE_LIGHT:TAIL_LIGHT;
    tail.enabled=(lit||brake)&&near&&tailLamp>0;
    if(tail.enabled){tail.range=glow.range;tail.intensity=glow.intensity*tailLamp;}
    const closeBy=distance<SIGNAL_LIGHT_REACH;
    this.signalLeft.light!.enabled=leftOn&&closeBy&&tailLamp>0;
    this.signalRight.light!.enabled=rightOn&&closeBy&&tailLamp>0;
  }
  telemetry() {
    const {lit,brake,left,right,high}=this.state,head=this.headLights[0]!.light!,forward=this.headLights[0]!.up.clone().mulScalar(-1);
    return {lit,brake,left,right,high,levels:this.levels,headlight:head.enabled,tail:this.tailLight.light!.enabled,beam:[+forward.x.toFixed(3),+forward.y.toFixed(3),+forward.z.toFixed(3)],lens:Object.fromEntries([...this.lamps].map(([name,lamp])=>[name,lamp.model?lamp.halo!.enabled:lamp.entity.enabled]))};
  }
}
