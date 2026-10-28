import * as pc from 'playcanvas';
import {WORLD} from '@bar/shared';
import {daylightAt,EDGE_FOG_WIDTH,type Rgb} from './day-night';

interface Lamp {entity:pc.Entity;base:number;outside:boolean;street:boolean;enabled:boolean;}
interface Glow {material:pc.StandardMaterial;base:number;outside:boolean;}
interface Sign {material:pc.StandardMaterial;strength:number;peak:number;}
// The lit facade (13_fachada.py): the logo sign on the corner, the two veranda boards and the sign's neon rim.
const SIGN_MATERIALS=new Set(['Letreiro_Highland','Placa_Highland','Neon_Magenta']);
// The magenta halo behind the corner sign, on the bricks.
const SIGN_LIGHT='Luz_Letreiro',SIGN_LIGHT_INTENSITY=2.2,SIGN_LIGHT_RANGE=5;
/** Map lights driven by their own prop: the jukebox colours its light (jukebox-lights.ts). */
const PROP_LIGHT=/^Jukebox_FX_/;
const streetFixtures=[
  [-1.9,1.9,225],[12,2.62,-90],[33.9,1.9,-45],[34.62,-13,0],[33.9,-27.9,45],
  [12,-28.62,90],[-1.9,-27.9,135],[-2.62,-13,180],[12,11.38,90],[-11.38,-13,0],[43.38,-13,180],[12,-37.38,-90],
] as const;
const skyVertex=`attribute vec3 aPosition;uniform mat4 matrix_model;uniform mat4 matrix_viewProjection;
varying vec3 skyDirection;void main(){skyDirection=aPosition;gl_Position=matrix_viewProjection*matrix_model*vec4(aPosition,1.0);}`;
const skyFragment=`precision highp float;
varying vec3 skyDirection;uniform vec3 skyTop;uniform vec3 skyHorizon;uniform vec3 sunDirection;uniform vec3 moonDirection;
uniform vec3 sunColor;uniform float sunVisible;uniform float moonVisible;uniform float night;uniform float barSkyExposure;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){
 vec3 direction=normalize(skyDirection);
 vec3 result=mix(skyHorizon,skyTop,smoothstep(0.0,.75,max(0.0,direction.y)));
 float sunDot=dot(direction,sunDirection),moonDot=dot(direction,moonDirection);
 result+=sunColor*(smoothstep(.9995,.9998,sunDot)*.6+pow(max(0.0,sunDot),90.0)*.12)*sunVisible;
 result+=vec3(.63,.70,.82)*smoothstep(.99965,.99985,moonDot)*moonVisible;
 vec2 starGrid=vec2(atan(direction.z,direction.x)*100.0,asin(direction.y)*100.0);
 float star=step(.994,hash(floor(starGrid)))*(1.0-smoothstep(.02,.18,length(fract(starGrid)-.5)));
 result+=vec3(star*night*.38*smoothstep(.08,.45,direction.y));
 gl_FragColor=vec4(pow(pow(max(result,vec3(0.0)),vec3(2.2))*barSkyExposure,vec3(1.0/2.2)),1.0);
}`;

/** Natural lighting stays separate from the electrical circuit affected by events. */
export class EnvironmentLighting {
  private lamps:Lamp[]=[];
  private glows:Glow[]=[];
  private signs:Sign[]=[];
  private signLight?:pc.LightComponent;
  private sun?:pc.Entity;
  private moon:pc.Entity;
  private sky:pc.Entity;
  private skirt:pc.Entity;
  private skyMaterial:pc.ShaderMaterial;
  private skirtMaterial:pc.StandardMaterial;
  private clones:pc.StandardMaterial[]=[];
  private electrical=1;
  private party=0;
  private sampled=daylightAt(Date.now());
  private rotation=new pc.Quat();
  private direction=new pc.Vec3();
  private shadowLights:pc.LightComponent[]=[];
  constructor(private app:pc.Application,private camera:pc.Entity){
    app.scene.fog.type=pc.FOG_LINEAR;
    this.moon=new pc.Entity('Moonlight');
    this.moon.addComponent('light',{type:'directional',intensity:0,color:new pc.Color(.66,.76,1),castShadows:true,
      shadowDistance:55,shadowResolution:2048,numCascades:2,cascadeBlend:.12,cascadeDistribution:.65,
      shadowType:pc.SHADOW_PCF3_32F,shadowBias:.12,normalOffsetBias:.025});
    app.root.addChild(this.moon);
    this.skyMaterial=new pc.ShaderMaterial({uniqueName:'Boteco day-night sky',attributes:{aPosition:pc.SEMANTIC_POSITION},vertexGLSL:skyVertex,fragmentGLSL:skyFragment});
    this.skyMaterial.cull=pc.CULLFACE_FRONT;this.skyMaterial.depthWrite=false;
    this.sky=new pc.Entity('Day-night sky');
    this.sky.addComponent('render',{type:'sphere',material:this.skyMaterial,castShadows:false,receiveShadows:false,layers:[pc.LAYERID_SKYBOX]});
    this.sky.setLocalScale(180,180,180);app.root.addChild(this.sky);
    // Visual continuation below the original street; no colliders or walkable surfaces added.
    this.skirtMaterial=new pc.StandardMaterial();this.skirtMaterial.useLighting=false;this.skirtMaterial.diffuse.set(0,0,0);this.skirtMaterial.useFog=false;
    this.skirt=new pc.Entity('Fog horizon ground');
    this.skirt.addComponent('render',{type:'plane',material:this.skirtMaterial,castShadows:false,receiveShadows:false});
    this.skirt.setPosition(16,-.06,-13);this.skirt.setLocalScale(800,1,800);app.root.addChild(this.skirt);
  }
  configureMap(map:pc.Entity):void {
    const lights=(map.findComponents('light') as pc.LightComponent[]).filter(light=>!PROP_LIGHT.test(light.entity.name));
    const powers=lights.filter(light=>light.type!=='directional'&&light.entity.name!==SIGN_LIGHT).map(light=>light.luminance).sort((a,b)=>a-b);
    const median=powers[powers.length>>1]||1;
    for(const light of lights){
      light.enabled=true;
      if(light.entity.name===SIGN_LIGHT){
        // A neon halo, not a ceiling lamp: it keeps its authored colour and shines all around, without a shadow map.
        light.type='omni';light.castShadows=false;light.falloffMode=pc.LIGHTFALLOFF_LINEAR;light.range=SIGN_LIGHT_RANGE;
        this.signLight=light;
      }else if(light.type==='directional'){
        if(this.sun){light.enabled=false;continue;}
        this.sun=light.entity;light.castShadows=true;light.shadowDistance=55;light.shadowResolution=2048;
        light.numCascades=2;light.cascadeBlend=.12;light.cascadeDistribution=.65;light.shadowType=pc.SHADOW_PCF3_32F;
        light.shadowBias=.12;light.normalOffsetBias=.025;
      }else{
        const outside=/Varanda|Quintal|Palco|Terraco/.test(light.entity.name);
        const relative=light.luminance/median||1;
        // A ceiling lamp shines down; converting it avoids lighting through the floor above.
        light.type='spot';light.entity.setRotation(pc.Quat.IDENTITY);
        light.innerConeAngle=50;light.outerConeAngle=75;
        light.falloffMode=pc.LIGHTFALLOFF_LINEAR;light.range=Math.min(10,5.5+3*relative);
        light.castShadows=true;light.shadowResolution=512;light.shadowType=pc.SHADOW_PCF3_32F;light.shadowUpdateMode=pc.SHADOWUPDATE_THISFRAME;
        light.shadowBias=.3;light.normalOffsetBias=.04;
        this.shadowLights.push(light);
        this.lamps.push({entity:light.entity,base:2.3*Math.pow(relative,.6),outside,street:false,enabled:true});
      }
    }
    for(const [x,z,degrees] of streetFixtures){
      const angle=degrees*Math.PI/180,entity=new pc.Entity('Street light');
      entity.setPosition(x+1.825*Math.cos(angle),8.75,z-1.825*Math.sin(angle));
      entity.addComponent('light',{type:'spot',color:new pc.Color(1,.85,.65),intensity:0,range:14,innerConeAngle:32,outerConeAngle:58,
        falloffMode:pc.LIGHTFALLOFF_LINEAR,castShadows:true,shadowResolution:512,shadowType:pc.SHADOW_PCF3_32F,shadowBias:.15,normalOffsetBias:.04,shadowUpdateMode:pc.SHADOWUPDATE_THISFRAME});
      this.shadowLights.push(entity.light!);
      this.app.root.addChild(entity);this.lamps.push({entity,base:3.1,outside:true,street:true,enabled:false});
    }
    const nativeFog=pc.ShaderChunks.get(this.app.graphicsDevice,pc.SHADERLANGUAGE_GLSL).get('fogPS') as string;
    const edgeFog=`
float botecoEdgeVisibility(){
 #ifdef VERTEXSHADER
 return 1.0;
 #else
 vec2 edge=min(vPositionW.xz-vec2(${WORLD.minX.toFixed(2)},${WORLD.minZ.toFixed(2)}),vec2(${WORLD.maxX.toFixed(2)},${WORLD.maxZ.toFixed(2)})-vPositionW.xz);
 return smoothstep(0.0,${EDGE_FOG_WIDTH.toFixed(1)},min(edge.x,edge.y));
 #endif
}
`+nativeFog.replace('return clamp(fogFactor, 0.0, 1.0);','return clamp(fogFactor, 0.0, 1.0) * botecoEdgeVisibility();');
    const patched=new Set<pc.Material>();
    for(const render of map.findComponents('render') as pc.RenderComponent[])for(const instance of render.meshInstances){
      let material=instance.material;
      if(!(material instanceof pc.StandardMaterial))continue;
      const sign=material;
      if(SIGN_MATERIALS.has(sign.name)&&!this.signs.some(known=>known.material===sign)){
        const e=sign.emissive;this.signs.push({material:sign,strength:sign.emissiveIntensity,peak:Math.pow(Math.max(e.r,e.g,e.b,1e-3),2.2)});
      }
      if(material.name==='Lampada'){
        const clone=material.clone();this.clones.push(clone);instance.material=material=clone;
        this.glows.push({material:clone,base:clone.emissiveIntensity,outside:/Exterior/.test(render.entity.name)});
      }
      if(!patched.has(material)){
        patched.add(material);material.getShaderChunks(pc.SHADERLANGUAGE_GLSL).set('fogPS',edgeFog);material.shaderChunksVersion='2.23';material.update();
      }
    }
    // The map's lamps exist only now: the chosen shadow quality applies to them too.
    this.setQuality(this.quality,this.fogScale);
    this.update(Date.now(),0,'');
  }
  update(serverTime:number,dt:number,event:string):void {
    const state=this.sampled=daylightAt(serverTime),nowNight=state.night;
    const blend=dt===0?1:1-Math.exp(-Math.min(dt,.1)*4);
    this.electrical+=((event==='BLACKOUT'?0:event==='PARTY'?.75:1)-this.electrical)*blend;
    this.party+=((event==='PARTY'?1:0)-this.party)*blend;
    const orient=(entity:pc.Entity|undefined,direction:Rgb,intensity:number)=>{
      if(!entity?.light)return;
      entity.light.enabled=intensity>.001;entity.light.intensity=intensity;
      this.direction.set(-direction[0],-direction[1],-direction[2]);
      entity.setRotation(this.rotation.setFromDirections(pc.Vec3.DOWN,this.direction));
    };
    orient(this.sun,state.sunDirection,state.sunIntensity);orient(this.moon,state.moonDirection,state.moonIntensity);
    if(this.sun?.light)this.sun.light.color.set(...state.sunColor);
    const ambient=this.app.scene.ambientLight;
    ambient.set(state.ambient[0]*(1-this.party*.08),state.ambient[1]*(1-this.party*.16),state.ambient[2]);
    this.app.scene.exposure=state.exposure;
    this.app.scene.fog.color.set(...state.horizon);this.app.scene.fog.start=state.fogStart*this.fogScale;this.app.scene.fog.end=state.fogEnd*this.fogScale;
    this.camera.camera!.clearColor.set(...state.horizon,1);
    this.skirtMaterial.emissive.set(...state.horizon);this.skirtMaterial.update();
    this.sky.setPosition(this.camera.getPosition());
    for(const [name,value] of Object.entries({skyTop:state.top,skyHorizon:state.horizon,sunDirection:state.sunDirection,moonDirection:state.moonDirection,sunColor:state.sunColor,
      sunVisible:state.sunIntensity/1.15,moonVisible:state.moonIntensity/.18,night:nowNight,barSkyExposure:state.exposure}))this.skyMaterial.setParameter(name,value);
    for(const lamp of this.lamps){
      const intensity=lamp.base*(lamp.outside?nowNight:.68+nowNight*.32)*this.electrical;
      const enabled=intensity>.015,light=lamp.entity.light!;
      // Refresh the static map once when a lamp turns on. Periodically redrawing a different lamp
      // produced visibly frozen, stepping silhouettes.
      if(enabled&&!lamp.enabled)light.shadowUpdateMode=pc.SHADOWUPDATE_THISFRAME;
      light.intensity=intensity;light.enabled=enabled;lamp.enabled=enabled;
    }
    for(const glow of this.glows){
      glow.material.emissiveIntensity=glow.base*(glow.outside?nowNight:.65+nowNight*.35)*this.electrical;
      glow.material.update();
    }
    // The facade is lit day and night (it goes dark only with the bar's power). There is no bloom, so emission above
    // 1 would only clip towards white and shift the hue: the brightest channel stays exactly at its authored value on
    // screen, exposure included, and the sign shows the colours of its artwork.
    for(const sign of this.signs){
      sign.material.emissiveIntensity=Math.min(sign.strength,1/sign.peak)*this.electrical/state.exposure;
      sign.material.update();
    }
    if(this.signLight){
      this.signLight.intensity=SIGN_LIGHT_INTENSITY*nowNight*this.electrical;this.signLight.enabled=this.signLight.intensity>.015;
    }
    // Directional sun/moon shadows remain realtime and therefore move smoothly. Local lamp shadows are
    // cached because their lights and architectural casters do not move; never cycle them between frames.
    for(const light of this.shadowLights)if(light.shadowUpdateMode===pc.SHADOWUPDATE_REALTIME)light.shadowUpdateMode=pc.SHADOWUPDATE_NONE;
  }
  /**
   * Graphics settings: shadow maps of the sun/moon (resolution, cascades) and of the lamps, and how far the
   * atmospheric fog lets the city show. 'off' keeps the lighting and drops every shadow map.
   */
  setQuality(shadows:'off'|'low'|'medium'|'high'|'ultra',fogScale:number):void {
    this.fogScale=fogScale;
    const sky={off:[0,1],low:[1024,1],medium:[2048,2],high:[2048,2],ultra:[4096,3]}[shadows];
    const local={off:0,low:0,medium:256,high:512,ultra:1024}[shadows];
    for(const entity of [this.sun,this.moon])if(entity?.light){
      entity.light.castShadows=sky[0]>0;if(sky[0])entity.light.shadowResolution=sky[0];entity.light.numCascades=sky[1]!;
    }
    for(const light of this.shadowLights){light.castShadows=local>0;if(local)light.shadowResolution=local;}
    this.quality=shadows;
  }
  private fogScale=1;
  private quality:'off'|'low'|'medium'|'high'|'ultra'='high';
  addPartyShadows(lights:pc.Entity[]):void {for(const entity of lights)if(entity.light){entity.light.shadowUpdateMode=pc.SHADOWUPDATE_THISFRAME;this.shadowLights.push(entity.light);}}
  get partyStrength():number{return this.party;}
  telemetry(){
    const light=(entity:pc.Entity|undefined)=>entity?.light?{enabled:entity.light.enabled,intensity:entity.light.intensity,direction:entity.up.clone().mulScalar(-1).toArray(),shadows:entity.light.castShadows,cascades:entity.light.numCascades}:undefined;
    return {...this.sampled,electrical:this.electrical,party:this.party,sun:light(this.sun),moon:light(this.moon),
      lamps:this.lamps.map(lamp=>({name:lamp.entity.name,position:lamp.entity.getPosition().toArray(),outside:lamp.outside,street:lamp.street,enabled:lamp.entity.light!.enabled,intensity:lamp.entity.light!.intensity,shadows:lamp.entity.light!.castShadows,direction:lamp.entity.up.clone().mulScalar(-1).toArray()})),edgeFogWidth:EDGE_FOG_WIDTH,
      facade:{materials:this.signs.map(sign=>({name:sign.material.name,emissive:sign.material.emissive.toString(false),intensity:+sign.material.emissiveIntensity.toFixed(3)})),
        light:this.signLight?{enabled:this.signLight.enabled,intensity:+this.signLight.intensity.toFixed(3),type:this.signLight.type,color:this.signLight.color.toString(false)}:undefined},
      realtimeLocalShadows:this.shadowLights.filter(light=>light.enabled&&light.shadowUpdateMode===pc.SHADOWUPDATE_REALTIME).length};
  }
  destroy():void {
    for(const lamp of this.lamps)if(lamp.street)lamp.entity.destroy();
    this.moon.destroy();this.sky.destroy();this.skirt.destroy();this.skyMaterial.destroy();this.skirtMaterial.destroy();
    this.clones.forEach(material=>material.destroy());this.lamps=[];this.glows=[];this.signs=[];this.signLight=undefined;
  }
}
