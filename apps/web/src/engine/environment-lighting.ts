import * as pc from 'playcanvas';
import {CITY_FAR_CLIP,cityFog,lightningAt,weatherAt,type EnvironmentState} from '@bar/shared';
import {daylightAt,type Rgb} from './day-night';
import {WeatherEffects} from './weather-effects';
import {WeatherSounds} from './weather-sound';

interface Lamp {entity:pc.Entity;base:number;outside:boolean;street:boolean;enabled:boolean;shadow:boolean;reach:number;}
interface Glow {material:pc.StandardMaterial;base:number;outside:boolean;}
interface Sign {material:pc.StandardMaterial;strength:number;peak:number;}
// The lit facade (13_fachada.py): the logo sign on the corner, the two veranda boards and the sign's neon rim.
const SIGN_MATERIALS=new Set(['Letreiro_Highland','Placa_Highland','Neon_Magenta']);
// The magenta halo behind the corner sign, on the bricks.
const SIGN_LIGHT='Luz_Letreiro',SIGN_LIGHT_INTENSITY=2.2,SIGN_LIGHT_RANGE=5;
/**
 * What never casts a shadow: the painted contact shadows under the furniture (Sombra_Contato); the bulbs and glowing signs
 * the lamps shine from; and see-through materials (glass), which let the light through.
 */
const NO_SHADOW_MATERIALS=new Set(['Sombra_Contato','Lampada',...SIGN_MATERIALS]);
const STAINLESS_MATERIALS=new Set(['Inox','Pol_Inox','Pgn_Inox']),STAINLESS_METALNESS=.2;
/** The city's lamps (Luz_* with luz_noturna, cidade_setores): how bright at night, and how far (their export says 30 m at most). */
const CITY_LIGHT_INTENSITY=2.4,CITY_LIGHT_RANGE=30;
/** Half the largest side (m) under which a map piece is a small thing for the sun's far shadows (applyCascadeMasks). */
const SMALL_CASTER=.6;
/** Farther than this from the camera a city lamp is off: the fog hides it, and it would stretch the light clusters over the city. */
const CITY_LIGHT_NEAR=110;
/** Map lights driven by their own prop: the jukebox and the stage colour their lights (jukebox-lights.ts, stage-lights.ts). */
const PROP_LIGHT=/^(Jukebox_FX_|Luz_Palco_Cor$)/;
/**
 * The bar's fixtures (49_luzes_bar.py: one light per fixture, Luz_<kind>_<n>, "_Sombra" when it casts shadows): how each
 * kind shines. Cone half-angles in degrees, reach in metres. Ceiling lamps shine down, so none lights the floor above
 * it; the upper floor's lamps all cast shadows, or they would light the ground floor through the slab.
 */
interface LampKind {inner:number;outer:number;range:number;intensity:number;omni?:boolean;halo?:number}
const LAMP_KINDS:Array<[RegExp,LampKind]>=[
  // A tube fixed under the ceiling lights it too: a short halo upwards (halo: its strength), without a shadow map.
  [/^Luz_Tubo_/,{inner:36,outer:72,range:6.2,intensity:1.15,halo:1.5}],
  [/^Luz_Pendente_/,{inner:26,outer:60,range:4.6,intensity:1.7}],
  [/^Luz_Escada/,{inner:36,outer:72,range:5,intensity:.9}],
  [/^Luz_Ventilador_/,{inner:35,outer:70,range:2.8,intensity:.45}],
  [/^Luz_Varanda_/,{inner:40,outer:76,range:5,intensity:1.35}],
  // The backyard's string of bulbs: in the open, all around, no shadow map.
  [/^Luz_Varal_/,{inner:0,outer:0,range:6.5,intensity:1.05,omni:true}],
];
const OUTSIDE_LAMP=/Varanda|Varal|Quintal|Palco|Terraco/;
const HALO_RANGE=1.7;
/**
 * The lamps' shadow maps share one atlas (clustered lighting). A fixed split keeps every lamp in its tile: with the
 * engine's default the split followed the number of lamps in view, and turning the camera redrew them all.
 */
const ATLAS_SPLIT=6;
const LOCAL_SHADOWS={off:{atlas:1024,live:0},low:{atlas:1024,live:0},medium:{atlas:2048,live:1},high:{atlas:3072,live:2},ultra:{atlas:4096,live:3}} as const;
const streetFixtures=[
  [-1.9,1.9,225],[12,2.62,-90],[33.9,1.9,-45],[34.62,-13,0],[33.9,-27.9,45],
  [12,-28.62,90],[-1.9,-27.9,135],[-2.62,-13,180],[12,11.38,90],[-11.38,-13,0],[43.38,-13,180],[12,-37.38,-90],
] as const;
const skyVertex=`attribute vec3 aPosition;uniform mat4 matrix_model;uniform mat4 matrix_viewProjection;
varying vec3 skyDirection;void main(){skyDirection=aPosition;gl_Position=matrix_viewProjection*matrix_model*vec4(aPosition,1.0);}`;
const skyFragment=`precision highp float;
varying vec3 skyDirection;uniform vec3 skyTop;uniform vec3 skyHorizon;uniform vec3 sunDirection;uniform vec3 moonDirection;
uniform vec3 sunColor;uniform float sunVisible;uniform float moonVisible;uniform float night;uniform float barSkyExposure;
uniform float cloudCover;uniform float cloudTime;uniform float stormStrength;uniform float lightning;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
void main(){
 vec3 direction=normalize(skyDirection);
 vec3 result=mix(skyHorizon,skyTop,smoothstep(0.0,.75,max(0.0,direction.y)));
 float sunDot=dot(direction,sunDirection),moonDot=dot(direction,moonDirection);
 result+=sunColor*(smoothstep(.9995,.9998,sunDot)*.6+pow(max(0.0,sunDot),90.0)*.12)*sunVisible;
 result+=vec3(.63,.70,.82)*smoothstep(.99965,.99985,moonDot)*moonVisible;
 vec2 starGrid=vec2(atan(direction.z,direction.x)*100.0,asin(direction.y)*100.0);
 float star=step(.994,hash(floor(starGrid)))*(1.0-smoothstep(.02,.18,length(fract(starGrid)-.5)));
 result+=vec3(star*night*.38*smoothstep(.08,.45,direction.y))*(1.-cloudCover);
 if(cloudCover>.001&&direction.y>0.){
   vec2 p=direction.xz/(direction.y+.25)*3.+vec2(cloudTime,cloudTime*.31);
   float n=noise(p)*.6+noise(p*2.3)*.28+noise(p*5.1)*.12;
   float cloud=smoothstep(.75-cloudCover*.55,1.-cloudCover*.45,n)*smoothstep(0.,.15,direction.y);
   vec3 shade=mix(vec3(.67,.7,.73),vec3(.16,.2,.26),stormStrength)*mix(1.,.16,night);
   result=mix(result,shade*(.7+n*.3),cloud*cloudCover);
 }
 result+=vec3(.52,.6,.78)*lightning*.7;
 gl_FragColor=vec4(pow(pow(max(result,vec3(0.0)),vec3(2.2))*barSkyExposure,vec3(1.0/2.2)),1.0);
}`;
/** The engine's local shadow renderer: its culling decides who is drawn into each lamp's map (see watchShadowCulling). */
interface LocalShadowRenderer {cull(light:unknown,comp:unknown,casters?:unknown):void}
interface EngineCuller {processingMeshInstances:Set<pc.MeshInstance>}

/** Natural lighting stays separate from the electrical circuit affected by events. */
export class EnvironmentLighting {
  private settings?:EnvironmentState;
  private weather=weatherAt(Date.now());
  private flash=0;
  private readonly rain:WeatherEffects;
  private readonly sounds:WeatherSounds;
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
  /** What moves (avatars, what they carry, what is served): kept out of the lamps' cached shadow maps. */
  private dynamicCasters?:()=>Iterable<pc.MeshInstance>;
  /** This frame's moving casters, gathered once (update) for every lamp culled in the frame. */
  private moving:pc.MeshInstance[]=[];
  /** The lamps nearest to the player, redrawn every frame with the people in them: their shadows move with them. */
  private live=new Set<pc.LightComponent>();
  private liveEngine=new Set<unknown>();
  private liveCount=0;
  private focus=new pc.Vec3();
  private hasFocus=false;
  private refreshAll=false;
  private cityLights=new Set<pc.LightComponent>();
  private cityLightsOn=true;
  /** One copy of the city's glowing lamp material, shared by every sector: sectors come and go, the glow stays in step. */
  private cityLampMaterial?:pc.StandardMaterial;
  private panorama?:pc.StandardMaterial;
  private panoramaTint='';
  private localRenderer?:LocalShadowRenderer;
  private localCull?:LocalShadowRenderer['cull'];
  private onCullEnd=()=>this.updateShadowSkins();
  constructor(private app:pc.Application,private camera:pc.Entity,volume:()=>number=()=>0){
    this.rain=new WeatherEffects(app,camera);this.sounds=new WeatherSounds(volume);
    app.scene.fog.type=pc.FOG_LINEAR;
    const lighting=app.scene.lighting;
    lighting.atlasSplit=[ATLAS_SPLIT];lighting.cells=new pc.Vec3(14,4,14);
    this.watchShadowCulling();
    this.moon=new pc.Entity('Moonlight');
    this.moon.addComponent('light',{type:'directional',intensity:0,color:new pc.Color(.66,.76,1),castShadows:true,
      shadowDistance:55,shadowResolution:2048,numCascades:2,cascadeBlend:.12,cascadeDistribution:.65,
      shadowType:pc.SHADOW_PCF3_32F,shadowBias:.12,normalOffsetBias:.025});
    app.root.addChild(this.moon);
    this.skyMaterial=new pc.ShaderMaterial({uniqueName:'Boteco day-night sky',attributes:{aPosition:pc.SEMANTIC_POSITION},vertexGLSL:skyVertex,fragmentGLSL:skyFragment});
    this.skyMaterial.cull=pc.CULLFACE_FRONT;this.skyMaterial.depthWrite=false;
    this.sky=new pc.Entity('Day-night sky');
    this.sky.addComponent('render',{type:'sphere',material:this.skyMaterial,castShadows:false,receiveShadows:false,layers:[pc.LAYERID_SKYBOX]});
    // Behind everything, just inside the far plane: it is drawn after the opaque world, over whatever lies beyond it.
    this.sky.setLocalScale(CITY_FAR_CLIP*1.9,CITY_FAR_CLIP*1.9,CITY_FAR_CLIP*1.9);app.root.addChild(this.sky);
    // Under the city and its far ground (y -0.06), for the moments before they load. No colliders or walkable surfaces.
    this.skirtMaterial=new pc.StandardMaterial();this.skirtMaterial.useLighting=false;this.skirtMaterial.diffuse.set(0,0,0);this.skirtMaterial.useFog=false;
    this.skirt=new pc.Entity('Fog horizon ground');
    this.skirt.addComponent('render',{type:'plane',material:this.skirtMaterial,castShadows:false,receiveShadows:false});
    this.skirt.setPosition(0,-.12,0);this.skirt.setLocalScale(3400,1,3400);app.root.addChild(this.skirt);
  }
  /**
   * Who is drawn into a lamp's shadow map is decided when the engine culls it. The lamps' maps are cached, and the engine
   * also redraws them on its own (a lamp coming into view takes a free tile of the atlas): whoever stood there was
   * baked into the map, and stayed there, frozen, after they left. So the moving casters are taken out of every lamp's
   * culling, except the lamps redrawn each frame (live), and nothing else needs holding back: the sun and the moon
   * always draw everyone, every frame.
   */
  private watchShadowCulling():void {
    const renderer=(this.app.renderer as unknown as {_shadowRendererLocal?:LocalShadowRenderer})._shadowRendererLocal;
    if(!renderer?.cull){console.warn('Sombras: o renderizador de sombras locais mudou; pessoas podem ficar marcadas nas sombras das lâmpadas.');return;}
    const cull=this.localCull=renderer.cull;this.localRenderer=renderer;
    renderer.cull=(light,comp,casters)=>{
      if(this.liveEngine.has(light)){cull.call(renderer,light,comp,casters);return;}
      // A cached map keeps what it draws: the list of what moves is made exact for it (it is kept a few frames otherwise).
      this.refreshMoving();
      if(!this.moving.length){cull.call(renderer,light,comp,casters);return;}
      const hidden:pc.MeshInstance[]=[];
      for(const caster of this.moving)if(caster.castShadow){caster.castShadow=false;hidden.push(caster);}
      try{cull.call(renderer,light,comp,casters);}finally{for(const caster of hidden)caster.castShadow=true;}
    };
    this.app.scene.on('cull:end',this.onCullEnd);
  }
  /**
   * The engine poses a skinned mesh for drawing only when a camera sees it: one seen only by a shadow (just off screen,
   * or legs below the view) cast the pose of the last frame it was on screen, and its shadow stood still. Every moving
   * caster that a shadow map draws this frame is posed too.
   */
  private updateShadowSkins():void {
    const culler=(this.app.renderer as unknown as {culler?:EngineCuller}).culler;
    if(!culler)return;
    for(const caster of this.moving)if(caster.skinInstance&&caster.visibleThisFrame)culler.processingMeshInstances.add(caster);
  }
  configureMap(map:pc.Entity):void {
    const lights=(map.findComponents('light') as pc.LightComponent[]).filter(light=>!PROP_LIGHT.test(light.entity.name));
    const powers=lights.filter(light=>light.type!=='directional'&&light.entity.name!==SIGN_LIGHT).map(light=>light.luminance).sort((a,b)=>a-b);
    const median=powers[powers.length>>1]||1;
    for(const light of lights){
      light.enabled=true;
      const name=light.entity.name;
      if(name===SIGN_LIGHT){
        // A neon halo, not a ceiling lamp: it keeps its authored colour, without a shadow map. A wide spot turned out from
        // the corner (south-west): shining all around, it lit the upper floor's room through the wall.
        light.type='spot';light.innerConeAngle=60;light.outerConeAngle=88;light.castShadows=false;
        light.falloffMode=pc.LIGHTFALLOFF_LINEAR;light.range=SIGN_LIGHT_RANGE;
        light.entity.setRotation(new pc.Quat().setFromDirections(pc.Vec3.DOWN,new pc.Vec3(-1,-.25,1).normalize()));
        this.signLight=light;
      }else if(light.type==='directional'){
        if(this.sun){light.enabled=false;continue;}
        this.sun=light.entity;light.castShadows=true;light.shadowDistance=55;light.shadowResolution=2048;
        light.numCascades=2;light.cascadeBlend=.12;light.cascadeDistribution=.65;light.shadowType=pc.SHADOW_PCF3_32F;
        light.shadowBias=.12;light.normalOffsetBias=.025;
      }else{
        const outside=OUTSIDE_LAMP.test(name),kind=LAMP_KINDS.find(([test])=>test.test(name))?.[1];
        const relative=light.luminance/median||1;
        // A fixture of 49_luzes_bar.py shines as its kind; any other map light (the stage, the terrace) as a ceiling lamp
        // as bright as its export. Pointing down, no lamp lights the floor above it.
        const spec:LampKind=kind??{inner:50,outer:75,range:Math.min(10,5.5+3*relative),intensity:2.3*Math.pow(relative,.6)};
        const shadow=!spec.omni&&(kind?name.endsWith('_Sombra'):true);
        light.entity.setRotation(pc.Quat.IDENTITY);
        light.falloffMode=pc.LIGHTFALLOFF_LINEAR;light.range=spec.range;
        if(spec.omni){light.type='omni';light.castShadows=false;}
        else{
          light.type='spot';light.innerConeAngle=spec.inner;light.outerConeAngle=spec.outer;
          light.castShadows=shadow;light.shadowType=pc.SHADOW_PCF3_32F;light.shadowUpdateMode=pc.SHADOWUPDATE_THISFRAME;
          light.shadowBias=.3;light.normalOffsetBias=.04;
          if(shadow)this.shadowLights.push(light);
        }
        this.lamps.push({entity:light.entity,base:spec.intensity,outside,street:false,enabled:true,shadow,reach:spec.range});
        if(spec.halo){
          // Reaches the ceiling round the fixture only (HALO_RANGE): not through the slab to the floor above.
          const halo=new pc.Entity('Ceiling halo');halo.setLocalEulerAngles(180,0,0);
          halo.addComponent('light',{type:'spot',color:light.color.clone(),intensity:0,range:HALO_RANGE,innerConeAngle:30,outerConeAngle:85,
            falloffMode:pc.LIGHTFALLOFF_LINEAR,castShadows:false});
          light.entity.addChild(halo);
          this.lamps.push({entity:halo,base:spec.halo,outside,street:false,enabled:true,shadow:false,reach:HALO_RANGE});
        }
      }
    }
    // The streets' lamps light the asphalt from 8.75 m: no shadow maps, they would take tiles the bar's lamps need.
    for(const [x,z,degrees] of streetFixtures){
      const angle=degrees*Math.PI/180,entity=new pc.Entity('Street light');
      entity.setPosition(x+1.825*Math.cos(angle),8.75,z-1.825*Math.sin(angle));
      entity.addComponent('light',{type:'spot',color:new pc.Color(1,.85,.65),intensity:0,range:14,innerConeAngle:32,outerConeAngle:58,
        falloffMode:pc.LIGHTFALLOFF_LINEAR,castShadows:false});
      this.app.root.addChild(entity);this.lamps.push({entity,base:3.1,outside:true,street:true,enabled:false,shadow:false,reach:14});
    }
    for(const render of map.findComponents('render') as pc.RenderComponent[]){
      for(const instance of render.meshInstances){
        const shading=instance.material;
        if(shading&&(NO_SHADOW_MATERIALS.has(shading.name)||(shading instanceof pc.StandardMaterial&&shading.blendType!==pc.BLEND_NONE)))instance.castShadow=false;
        const half=instance.aabb.halfExtents;
        if(instance.castShadow&&!instance.skinInstance&&Math.max(half.x,half.y,half.z)<SMALL_CASTER)this.smallCasters.push(instance);
      }
    }
    for(const render of map.findComponents('render') as pc.RenderComponent[])for(const instance of render.meshInstances){
      let material=instance.material;
      if(!(material instanceof pc.StandardMaterial))continue;
      const sign=material;
      // Nothing here has an environment map, so a metal reflects nothing and goes black: stainless steel stays the light brushed surface of its texture.
      if(STAINLESS_MATERIALS.has(material.name)&&material.metalness>STAINLESS_METALNESS){material.metalness=STAINLESS_METALNESS;material.update();}
      if(SIGN_MATERIALS.has(sign.name)&&!this.signs.some(known=>known.material===sign)){
        const e=sign.emissive;this.signs.push({material:sign,strength:sign.emissiveIntensity,peak:Math.pow(Math.max(e.r,e.g,e.b,1e-3),2.2)});
      }
      if(material.name==='Lampada'){
        const clone=material.clone();this.clones.push(clone);instance.material=material=clone;
        this.glows.push({material:clone,base:clone.emissiveIntensity,outside:/Exterior/.test(render.entity.name)});
      }
      // What glows shows its own colours: the camera's tone curve would dull the signs and the lit fixtures.
      const lit=material as pc.StandardMaterial,e=lit.emissive;
      if(lit.useTonemap&&(e.r>0||e.g>0||e.b>0)){lit.useTonemap=false;lit.update();}
    }
    // The map's lamps exist only now: the chosen shadow quality applies to them too.
    this.setQuality(this.quality,this.fogScale);
    this.update(Date.now(),0,'');
  }
  update(serverTime:number,dt:number,event:string):void {
    const state=this.sampled=daylightAt(serverTime,this.settings),weather=this.weather=weatherAt(serverTime,this.settings);
    const flash=this.flash=lightningAt(serverTime,weather).flash;
    const nowNight=state.night+(1-state.night)*weather.cloud*.35;
    const tint=(color:Rgb,shade:Rgb,strength:number):Rgb=>color.map((v,i)=>v+(shade[i]!-v)*strength) as Rgb;
    const skyShade=1-state.night*.82;
    state.top=tint(state.top,[.13*skyShade,.17*skyShade,.23*skyShade],weather.cloud*.8);
    state.horizon=tint(state.horizon,[.25*skyShade,.29*skyShade,.34*skyShade],weather.cloud*.75);
    state.sunIntensity*=1-weather.cloud*.88;
    state.moonIntensity*=1-weather.cloud*.7;
    state.ambient=state.ambient.map(v=>v*(1-weather.cloud*.28-weather.storm*.12)+flash*.14) as Rgb;
    const blend=dt===0?1:1-Math.exp(-Math.min(dt,.1)*4);
    this.electrical+=((event==='BLACKOUT'?0:event==='PARTY'?.75:1)-this.electrical)*blend;
    this.party+=((event==='PARTY'?1:0)-this.party)*blend;
    const orient=(entity:pc.Entity|undefined,direction:Rgb,intensity:number)=>{
      if(!entity?.light)return;
      // Both stay on, at 0 when below the horizon: the directional lights are part of every shader's key, and trading the
      // sun for the moon at dusk built 43 shaders in one frame (a freeze of seconds). Each draws its shadow map only while it shines.
      const light=entity.light;light.enabled=true;light.intensity=intensity;
      if(light.castShadows)light.shadowUpdateMode=intensity>.001?pc.SHADOWUPDATE_REALTIME:pc.SHADOWUPDATE_NONE;
      this.direction.set(-direction[0],-direction[1],-direction[2]);
      entity.setRotation(this.rotation.setFromDirections(pc.Vec3.DOWN,this.direction));
    };
    orient(this.sun,state.sunDirection,state.sunIntensity+flash*(1-state.night)*.55);orient(this.moon,state.moonDirection,state.moonIntensity+flash*state.night*.55);
    if(this.sun?.light)this.sun.light.color.set(...state.sunColor);
    const ambient=this.app.scene.ambientLight;
    ambient.set(state.ambient[0]*(1-this.party*.08),state.ambient[1]*(1-this.party*.16),state.ambient[2]);
    this.app.scene.exposure=state.exposure;
    const fog=cityFog(state.night);
    const visibility=1-weather.rain*.28-weather.storm*.25;
    this.app.scene.fog.color.set(...state.horizon);this.app.scene.fog.start=fog.start*this.fogScale*visibility;this.app.scene.fog.end=fog.end*this.fogScale*visibility;
    this.camera.camera!.clearColor.set(...state.horizon,1);
    this.skirtMaterial.emissive.set(...state.horizon);this.skirtMaterial.update();
    const eye=this.camera.getPosition();
    this.sky.setPosition(eye);
    for(const [name,value] of Object.entries({skyTop:state.top,skyHorizon:state.horizon,sunDirection:state.sunDirection,moonDirection:state.moonDirection,sunColor:state.sunColor,
      sunVisible:state.sunIntensity/1.15,moonVisible:state.moonIntensity/.18,night:state.night,barSkyExposure:state.exposure,
      cloudCover:weather.cloud,cloudTime:(serverTime%3_600_000)/1000*.012*(.2+weather.wind),stormStrength:weather.storm,lightning:flash}))this.skyMaterial.setParameter(name,value);
    const sheltered=this.rain.update(serverTime,weather,this.daylight);
    this.sounds.update(serverTime,weather,sheltered);
    for(const lamp of this.lamps){
      const intensity=lamp.base*(lamp.outside?nowNight:.68+nowNight*.32)*this.electrical;
      const enabled=intensity>.015,light=lamp.entity.light!;
      // A lamp turning on draws its cached map once.
      if(enabled&&!lamp.enabled&&light.castShadows&&!this.live.has(light))light.shadowUpdateMode=pc.SHADOWUPDATE_THISFRAME;
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
    const cityLight=CITY_LIGHT_INTENSITY*nowNight*this.electrical;
    for(const light of this.cityLights){
      const p=light.entity.getPosition();
      light.intensity=cityLight;light.enabled=this.cityLightsOn&&cityLight>.015&&Math.hypot(p.x-eye.x,p.z-eye.z)<CITY_LIGHT_NEAR;
    }
    // The panorama is painted in daylight and draws over the sky near the horizon: it takes the colour of the hour.
    if(this.panorama){
      const day=1-state.night,weatherShade=1-weather.cloud*.42-weather.storm*.18;
      const tint=state.horizon.map(channel=>(Math.min(1,channel*1.15)*state.night+day)*weatherShade+flash*.25) as Rgb,key=tint.map(channel=>channel.toFixed(2)).join();
      if(key!==this.panoramaTint){this.panoramaTint=key;this.panorama.emissive.set(...tint);this.panorama.update();}
    }
    if(this.signLight){
      this.signLight.intensity=SIGN_LIGHT_INTENSITY*nowNight*this.electrical;this.signLight.enabled=this.signLight.intensity>.015;
    }
    // Walking every avatar's tree each frame cost more than the rest of this update: the list lasts four frames, and a
    // cached lamp map drawn meanwhile makes it again (watchShadowCulling).
    if(++this.movingAge>=4)this.refreshMoving();
    this.alternateFarCascades();
    this.chooseLiveLamps();
    if(this.refreshAll){
      this.refreshAll=false;
      for(const light of this.shadowLights)if(light.enabled&&light.castShadows&&!this.live.has(light))light.shadowUpdateMode=pc.SHADOWUPDATE_THISFRAME;
    }
  }
  /**
   * The lamps above the player (same floor, within reach) are redrawn every frame, people included: a real shadow under
   * whoever stands in their light. The rest keep the cached map of the room; a lamp leaving the set draws it once more,
   * empty. A lamp already live keeps its place unless another is clearly nearer, so walking under a pair does not
   * flip between them.
   */
  private chooseLiveLamps():void {
    const want=this.liveCount,focus=this.hasFocus?this.focus:this.camera.getPosition();
    const scored:Array<{light:pc.LightComponent;score:number}>=[];
    if(want>0)for(const lamp of this.lamps){
      const light=lamp.entity.light!;
      if(!lamp.shadow||!lamp.enabled||!light.castShadows)continue;
      const p=lamp.entity.getPosition(),above=p.y-focus.y;
      if(above<.4||above>3.6)continue;
      const distance=Math.hypot(p.x-focus.x,p.z-focus.z,above);
      if(distance>lamp.reach*.95)continue;
      scored.push({light,score:distance-(this.live.has(light)?.6:0)});
    }
    scored.sort((a,b)=>a.score-b.score);
    const next=new Set(scored.slice(0,want).map(entry=>entry.light));
    for(const light of this.live)if(!next.has(light))light.shadowUpdateMode=light.enabled&&light.castShadows?pc.SHADOWUPDATE_THISFRAME:pc.SHADOWUPDATE_NONE;
    for(const light of next)light.shadowUpdateMode=pc.SHADOWUPDATE_REALTIME;
    this.live=next;this.liveEngine=new Set([...next].map(light=>light.light));
  }
  private refreshMoving():void {
    if(this.movingFrame===this.app.frame)return;
    this.movingFrame=this.app.frame;this.movingAge=0;
    this.moving=this.dynamicCasters?[...this.dynamicCasters()]:[];
  }
  /**
   * The sun's far cascades (the city and the far side of the bar, where a shadow is a few pixels) are drawn every other
   * frame, the near one every frame: about a quarter fewer draw calls by day. A cascade not drawn keeps the map and the
   * matrix it was drawn with, so its shadows stay where they belong; only what moves in it moves at half the rate.
   */
  private alternateFarCascades():void {
    // On Baixo the only cascade alternates too: the sun's shadows at half the frame rate, for phones.
    const all=this.quality==='low';
    for(const entity of [this.sun,this.moon]){
      const light=entity?.light;
      if(!light?.castShadows||(light.numCascades<2&&!all)){if(light)light.shadowUpdateOverrides=null;continue;}
      const overrides=light.shadowUpdateOverrides??=[];
      overrides.length=light.numCascades;
      for(let i=0;i<light.numCascades;i++)overrides[i]=i===0&&!all?pc.SHADOWUPDATE_REALTIME:this.app.frame%2?pc.SHADOWUPDATE_NONE:pc.SHADOWUPDATE_THISFRAME;
    }
  }
  /** The map's small things (chairs, bottles, cups): see applyCascadeMasks. */
  private smallCasters:pc.MeshInstance[]=[];
  /**
   * Past the sun's near cascade (about 12 m) a chair's or a bottle's shadow is a few pixels: small things cast only into
   * that cascade (about 180 fewer draw calls in the far one). On Baixo, with one cascade for everything, they cast no sun
   * shadow at all; the lamps still draw theirs.
   */
  private applyCascadeMasks():void {
    const mask=this.quality==='low'?0:1;
    for(const instance of this.smallCasters)instance.shadowCascadeMask=mask;
  }
  private movingAge=0;
  private movingFrame=-1;
  /** Where the local player stands: the lamps above them draw people's shadows (chooseLiveLamps). */
  setFocus(position:pc.Vec3|undefined):void {
    this.hasFocus=!!position;if(position)this.focus.copy(position);
  }
  /** A lamp of a city sector that just loaded: no shadows, on at night, as long as its sector stays. */
  addCityLight(light:pc.LightComponent):void {
    light.type='omni';light.castShadows=false;light.falloffMode=pc.LIGHTFALLOFF_LINEAR;light.range=Math.min(CITY_LIGHT_RANGE,light.range);
    light.intensity=0;light.enabled=false;this.cityLights.add(light);
  }
  removeCityLight(light:pc.LightComponent):void {this.cityLights.delete(light);}
  setCityLights(on:boolean):void {this.cityLightsOn=on;}
  /** The material for a sector's glowing lamps (`Lampada`): they follow the night like the rest of the street's. */
  cityLamp(source:pc.StandardMaterial):pc.StandardMaterial {
    if(!this.cityLampMaterial){
      const clone=this.cityLampMaterial=source.clone();this.clones.push(clone);
      this.glows.push({material:clone,base:clone.emissiveIntensity,outside:true});
    }
    return this.cityLampMaterial;
  }
  /** The city's far ground has arrived: nothing is left for the fallback plane to cover. */
  hideGroundFallback():void {this.skirt.enabled=false;}
  setPanorama(material:pc.StandardMaterial):void {this.panorama=material;this.panoramaTint='';}
  /** What moves in the scene (see watchShadowCulling). */
  setDynamicCasters(casters:()=>Iterable<pc.MeshInstance>):void {this.dynamicCasters=casters;}
  /** Static things were added or removed (the props dressing the bar): every lamp redraws its shadows once. */
  refreshLampShadows():void {this.refreshAll=true;}
  /**
   * Graphics settings: shadow maps of the sun/moon (resolution, cascades), the lamps' atlas and how many lamps draw
   * people live, and how far the atmospheric fog lets the city show. 'off' drops the sun's shadows and the live lamps;
   * the lamps keep a small cached map, without which the upper floor would light the ground floor through the slab.
   */
  setQuality(shadows:'off'|'low'|'medium'|'high'|'ultra',fogScale:number):void {
    this.rain.setQuality(shadows);
    this.fogScale=fogScale;
    // Resolution, cascades and reach of the sun's map: a shorter reach draws fewer things into it and sharpens what it keeps.
    const sky=({off:[0,1,55],low:[1024,1,30],medium:[2048,2,45],high:[2048,2,55],ultra:[4096,3,55]} as const)[shadows];
    const local=LOCAL_SHADOWS[shadows];
    for(const entity of [this.sun,this.moon])if(entity?.light){
      // The moon's light is faint: its shadows (the whole scene drawn again, about 600 draw calls a frame) only on Ultra.
      entity.light.castShadows=sky[0]>0&&(entity===this.sun||shadows==='ultra');
      if(sky[0])entity.light.shadowResolution=sky[0];entity.light.numCascades=sky[1];entity.light.shadowDistance=sky[2];
    }
    this.app.scene.lighting.shadowAtlasResolution=local.atlas;
    this.liveCount=local.live;
    if(this.quality!==shadows)this.refreshAll=true;
    this.quality=shadows;
    this.applyCascadeMasks();
  }
  private fogScale=1;
  private quality:'off'|'low'|'medium'|'high'|'ultra'='high';
  setState(state?:EnvironmentState):void {this.settings=state;}
  setActive(active:boolean):void {this.sounds.setActive(active);}
  addPartyShadows(lights:pc.Entity[]):void {for(const entity of lights)if(entity.light){entity.light.shadowUpdateMode=pc.SHADOWUPDATE_THISFRAME;this.shadowLights.push(entity.light);}}
  get partyStrength():number{return this.party;}
  /** The bar's power: 1 normally, 0 in a blackout (the lamps, the signs, what glows). */
  get power():number{return this.electrical;}
  get rainStrength():number{return this.weather.rain;}
  /** How much the sun lights the open air now: 0 at night, 1 in full daylight. */
  get daylight():number{return Math.min(1,Math.max(0,this.sampled.sunIntensity/.6));}
  telemetry(){
    const light=(entity:pc.Entity|undefined)=>entity?.light?{enabled:entity.light.enabled&&entity.light.intensity>.001,intensity:entity.light.intensity,direction:entity.up.clone().mulScalar(-1).toArray(),shadows:entity.light.castShadows,cascades:entity.light.numCascades}:undefined;
    return {...this.sampled,weather:{...this.weather,mode:this.settings?.weather??'clear',flash:this.flash,...this.rain.telemetry(),sound:this.sounds.telemetry()},electrical:this.electrical,party:this.party,sun:light(this.sun),moon:light(this.moon),
      lamps:this.lamps.map(lamp=>({name:lamp.entity.name,position:lamp.entity.getPosition().toArray(),outside:lamp.outside,street:lamp.street,enabled:lamp.entity.light!.enabled,intensity:lamp.entity.light!.intensity,shadows:lamp.entity.light!.castShadows,live:this.live.has(lamp.entity.light!),direction:lamp.entity.up.clone().mulScalar(-1).toArray()})),
      cityLights:[...this.cityLights].map(light=>({name:light.entity.parent?.name??'',enabled:light.enabled,intensity:+light.intensity.toFixed(3),shadows:light.castShadows})),
      facade:{materials:this.signs.map(sign=>({name:sign.material.name,emissive:sign.material.emissive.toString(false),intensity:+sign.material.emissiveIntensity.toFixed(3)})),
        light:this.signLight?{enabled:this.signLight.enabled,intensity:+this.signLight.intensity.toFixed(3),type:this.signLight.type,color:this.signLight.color.toString(false)}:undefined},
      shadowAtlas:this.app.scene.lighting.shadowAtlasResolution,movingCasters:this.moving.length,
      realtimeLocalShadows:this.shadowLights.filter(light=>light.enabled&&light.shadowUpdateMode===pc.SHADOWUPDATE_REALTIME).length};
  }
  destroy():void {
    this.rain.destroy();this.sounds.destroy();
    if(this.localRenderer&&this.localCull)this.localRenderer.cull=this.localCull;
    this.app.scene.off('cull:end',this.onCullEnd);
    for(const lamp of this.lamps)if(lamp.street)lamp.entity.destroy();
    this.moon.destroy();this.sky.destroy();this.skirt.destroy();this.skyMaterial.destroy();this.skirtMaterial.destroy();
    this.clones.forEach(material=>material.destroy());this.lamps=[];this.glows=[];this.signs=[];this.signLight=undefined;this.cityLights.clear();this.moving=[];
  }
}
