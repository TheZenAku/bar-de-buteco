import * as pc from 'playcanvas';
import {STAGE,type JukeboxState} from '@bar/shared';
import type {Rgb} from './video-palette';
import {VideoColours,hex} from './video-colours';

export interface StageLightsStatus {
  playing:boolean;level:number;videoId:string;palette:boolean;colors:string[];light:boolean;
  /** How far the white lights (truss spots, front wash, party wash) have turned to the video's colours: 0 off, 1 showing. */
  show:number;
  /** Bulb materials whose truss spots follow the video (Lampada over the deck). */
  lamps:number;
  /** Colour of the front wash (Luz_Palco) and of the stage's party wash right now (sRGB). */
  front?:string;washes:string[];
}

const COLOURS=3;
// Bands of colour flow out from the middle of the stage to both wings; running bulbs race along the LED strip.
const BAND_METRES=1.2,BAND_SPEED=.25,RUN_SPEED=1.8;
// Off, the stage keeps a dim glow of its own magenta (the stage is never dead at night); paused, still and dim.
const LEVEL={playing:1,paused:.35} as Partial<Record<string,number>>,IDLE_LEVEL=.4;
const LIGHT_INTENSITY=2.4,LIGHT_RANGE=9;
// The stage's own magenta (15_palco.py COR_FX, Palco_FX_Luz cor_padrao #ff47c2), until the video's colours arrive.
const MAGENTA:Rgb=[1,.28,.76];
// The lighting rig: the truss's spots hang this high above the deck, at most this far beyond its edges (metres).
const RIG_HEIGHT=2,RIG_MARGIN=.5;
/**
 * The colour flowing past a point of the stage (`p`: from the middle of the deck's top): bands of the three colours run
 * from the middle out to both wings and up the truss, with running bulbs. The colours never exceed 1, so the screen
 * shows their real hue.
 */
const flowChunk=`
uniform vec3 stageColors[${COLOURS}];
uniform vec3 stageOrigin;
uniform float stagePhase;
uniform float stageLevel;
uniform float stageRun;
vec3 stageFlow(vec3 p) {
	float along = abs(p.x) + p.y * .35;
	float t = fract(along / ${(BAND_METRES*COLOURS).toFixed(3)} - stagePhase) * ${COLOURS.toFixed(1)};
	vec3 colour = t < 1.0 ? mix(stageColors[0], stageColors[1], smoothstep(.7, 1.0, t))
		: t < 2.0 ? mix(stageColors[1], stageColors[2], smoothstep(.7, 1.0, t - 1.0))
		: mix(stageColors[2], stageColors[0], smoothstep(.7, 1.0, t - 2.0));
	float run = fract(along * 1.5 - stagePhase * ${(RUN_SPEED/BAND_SPEED).toFixed(3)});
	float bulb = smoothstep(0.0, .1, run) * (1.0 - smoothstep(.35, .6, run));
	return colour * stageLevel * (1.0 - stageRun * .4 * (1.0 - bulb));
}
`;
/** Replaces Palco_Luz's emissive colour (constant magenta in the export): every lens and the LED strip take the flow. */
const emissiveChunk=`${flowChunk}
void getEmission() {
	dEmission = stageFlow(vPositionW - stageOrigin);
	#ifdef STD_EMISSIVE_TEXTURE
	dEmission *= {STD_EMISSIVE_TEXTURE_DECODE}(texture2DBias({STD_EMISSIVE_TEXTURE_NAME}, {STD_EMISSIVE_TEXTURE_UV}, {STD_TEXTURE_BIAS})).{STD_EMISSIVE_TEXTURE_CHANNEL};
	#endif
}
`;
/**
 * The truss's white spots share the bar's bulb material (Lampada, cloned per mesh and dimmed by EnvironmentLighting). The
 * engine's own emission everywhere; over the deck, from the rig's height, it turns to the flow while the telão shows.
 */
const lampChunk=`${flowChunk}
#ifndef MESH_COLOR
	uniform vec3 material_emissive;
#endif
uniform float material_emissiveIntensity;
uniform float stageShow;
void getEmission() {
	#ifdef MESH_COLOR
		dEmission = mesh_color.rgb * material_emissiveIntensity;
	#else
		dEmission = material_emissive * material_emissiveIntensity;
	#endif
	#ifdef STD_EMISSIVE_TEXTURE
	dEmission *= {STD_EMISSIVE_TEXTURE_DECODE}(texture2DBias({STD_EMISSIVE_TEXTURE_NAME}, {STD_EMISSIVE_TEXTURE_UV}, {STD_TEXTURE_BIAS})).{STD_EMISSIVE_TEXTURE_CHANNEL};
	#endif
	#ifdef STD_EMISSIVE_VERTEX
	dEmission *= saturate(vVertexColor.{STD_EMISSIVE_VERTEX_CHANNEL});
	#endif
	vec3 p = vPositionW - stageOrigin;
	float rig = step(abs(p.x), ${(STAGE.deck.hx+RIG_MARGIN).toFixed(3)}) * step(abs(p.z), ${(STAGE.deck.hz+RIG_MARGIN).toFixed(3)}) * step(${RIG_HEIGHT.toFixed(1)}, p.y);
	dEmission = mix(dEmission, stageFlow(p), rig * stageShow);
}
`;
/** A white light of the stage that takes the video's colour passing its spot (`along`, as stageFlow measures it). */
interface Wash {light:pc.LightComponent;own:pc.Color;along:number}

/**
 * The backyard stage (15_palco.py) lights up with its screen, like the jukebox with its song: every light of the stage
 * takes the colours of the video playing on the telão, following the shared timeline, so every browser shows the same
 * colours at the same moment. The coloured lenses and the LED strip (Palco_FX_Luz) and the backlight (Luz_Palco_Cor)
 * show the colours always: with the screen off a dim glow of the stage's own magenta, paused still and dim. The white
 * lights (the truss's spots, the front wash Luz_Palco, the stage's party wash) keep their own white until a video plays,
 * then turn to its colours.
 */
export class StageLights {
  private material?:pc.StandardMaterial;
  private lamps:pc.StandardMaterial[]=[];
  private light?:pc.LightComponent;
  private washes:Wash[]=[];
  private front?:Wash;
  private readonly origin=new Float32Array([STAGE.deck.x,STAGE.deck.maxY,STAGE.deck.z]);
  private readonly uniform=new Float32Array(COLOURS*3);
  private readonly colours=new VideoColours(MAGENTA,COLOURS);
  private level=IDLE_LEVEL;
  private run=0;
  private show=0;
  private readonly lightColor=new pc.Color();
  /** `washes`: lights of the scene's own that shine on the stage (BarScene's party wash). */
  constructor(map:pc.Entity,washes:pc.LightComponent[]=[]){
    const glow=map.findByName('Palco_FX_Luz') as pc.Entity|null;
    const instance=(glow?.findComponents('render') as pc.RenderComponent[]|undefined)?.flatMap(render=>render.meshInstances)[0];
    if(instance?.material instanceof pc.StandardMaterial){
      this.material=instance.material;
      this.material.getShaderChunks(pc.SHADERLANGUAGE_GLSL).set('emissivePS',emissiveChunk);
      this.material.shaderChunksVersion='2.23';this.material.update();
    }
    // The bulbs whose mesh reaches over the deck (the whole bar's bulbs are one mesh): the shader picks the rig's out.
    const rig=new pc.BoundingBox(new pc.Vec3(STAGE.deck.x,STAGE.deck.maxY+RIG_HEIGHT+2,STAGE.deck.z),new pc.Vec3(STAGE.deck.hx+RIG_MARGIN,2,STAGE.deck.hz+RIG_MARGIN));
    for(const render of map.findComponents('render') as pc.RenderComponent[])for(const mesh of render.meshInstances){
      const material=mesh.material;
      if(!(material instanceof pc.StandardMaterial)||material.name!=='Lampada'||this.lamps.includes(material)||!mesh.aabb.intersects(rig))continue;
      material.getShaderChunks(pc.SHADERLANGUAGE_GLSL).set('emissivePS',lampChunk);
      material.shaderChunksVersion='2.23';material.update();this.lamps.push(material);
    }
    const point=map.findByName('Luz_Palco_Cor') as pc.Entity|null;
    this.light=point?.light??(point?.findComponent('light') as pc.LightComponent|null)??undefined;
    if(this.light){
      this.light.type='omni';this.light.castShadows=false;this.light.falloffMode=pc.LIGHTFALLOFF_LINEAR;
      this.light.range=LIGHT_RANGE;this.light.enabled=true;
    }
    // The white wash over the front of the stage is one of the map's lamps (EnvironmentLighting turns it on at night).
    const front=map.findByName('Luz_Palco') as pc.Entity|null,frontLight=front?.light??(front?.findComponent('light') as pc.LightComponent|null)??undefined;
    const wash=(light:pc.LightComponent):Wash=>{const p=light.entity.getPosition();return {light,own:light.color.clone(),along:Math.abs(p.x-STAGE.deck.x)+(p.y-STAGE.deck.maxY)*.35};};
    if(frontLight)this.front=wash(frontLight);
    this.washes=[...(this.front?[this.front]:[]),...washes.map(wash)];
    if(!this.material||!this.light||!this.front||!this.lamps.length)console.warn('Luzes do palco ausentes no mapa (Palco_FX_Luz / Luz_Palco_Cor / Luz_Palco / Lampada).');
    this.apply(0);
  }

  /** `state`: the telão's playback; `duration`: seconds of its video, from the local player (0 while unknown). */
  update(dt:number,state:JukeboxState|undefined,serverNow:number,duration:number,exposure:number):void {
    const time=this.colours.update(dt,state,serverNow,duration),status=state?.status??'off';
    const ease=1-Math.exp(-Math.min(dt,.1)*3);
    this.level+=((status==='off'?IDLE_LEVEL:LEVEL[status]??IDLE_LEVEL)-this.level)*ease;
    this.run+=((status==='playing'?1:0)-this.run)*ease;
    this.show+=((status==='off'?0:1)-this.show)*ease;
    if(this.show<.002)this.show=0;
    this.apply(time*BAND_SPEED,exposure);
  }

  /** The colour flowing past `along` at this phase, blended like the lenses (linear, before the level). */
  private flow(along:number,phase:number):Rgb {
    const shown=this.colours.shown,t=((((along/(BAND_METRES*COLOURS)-phase)%1)+1)%1)*COLOURS,k=Math.floor(t)%COLOURS,a=shown[k]!,b=shown[(k+1)%COLOURS]!;
    const f=Math.min(1,Math.max(0,(t-Math.floor(t)-.7)/.3)),blend=f*f*(3-2*f);
    return a.map((v,c)=>v+(b[c]!-v)*blend) as Rgb;
  }

  private apply(phase:number,exposure=1):void {
    this.colours.shown.forEach((colour,k)=>this.uniform.set(colour,k*3));
    for(const material of [...(this.material?[this.material]:[]),...this.lamps]){
      material.setParameter('stageColors[0]',this.uniform);
      material.setParameter('stageOrigin',this.origin);
      material.setParameter('stagePhase',phase%1000);
      material.setParameter('stageRun',this.run);
      // Exposure multiplies everything on screen: dividing by it keeps the brightest lens at exactly its colour.
      material.setParameter('stageLevel',this.level/Math.max(exposure,.1));
      material.setParameter('stageShow',this.show);
    }
    const gamma=(c:Rgb)=>c.map(v=>Math.pow(v,1/2.2)) as Rgb;
    if(this.light){
      // The backlight hangs over the middle of the stage: it shows the colour flowing out of there, blended like the lenses.
      this.lightColor.set(...gamma(this.flow(0,phase)));this.light.color=this.lightColor;
      this.light.intensity=LIGHT_INTENSITY*this.level;
    }
    // Their brightness is the lamps' and the party's (EnvironmentLighting, BarScene); the colour turns to the flow's.
    for(const wash of this.washes){
      const [r,g,b]=gamma(this.flow(wash.along,phase)),own=wash.own,s=this.show;
      this.lightColor.set(own.r+(r-own.r)*s,own.g+(g-own.g)*s,own.b+(b-own.b)*s);wash.light.color=this.lightColor;
    }
  }

  telemetry():StageLightsStatus {
    return {playing:this.run>.5,level:+this.level.toFixed(3),videoId:this.colours.videoId,palette:this.colours.hasPalette,colors:this.colours.shown.map(hex),light:!!this.light?.enabled,
      show:+this.show.toFixed(3),lamps:this.lamps.length,front:this.front?.light.color.toString(false),washes:this.washes.filter(w=>w!==this.front).map(w=>w.light.color.toString(false))};
  }
}
