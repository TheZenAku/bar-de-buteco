import * as pc from 'playcanvas';
import {jukeboxTime,type JukeboxState} from '@bar/shared';
import {PALETTE_KEYS,videoPalette,type Rgb,type VideoPalette} from './video-palette';

export interface JukeboxLightsStatus {lit:boolean;level:number;videoId:string;palette:boolean;colors:string[];light:boolean}

const COLOURS=3;
// Bands of colour climb both sides of the arches and meet at the crown; running bulbs race through them.
const BAND_METRES=.45,BAND_SPEED=.35,RUN_SPEED=1.6;
const LEVEL={playing:1,paused:.3} as Partial<Record<string,number>>;
const LIGHT_INTENSITY=1.2,LIGHT_RANGE=3.4;
// The jukebox's own amber (12_jukebox.py COR_PADRAO), shown until the video's colours arrive or when it has none.
const AMBER:Rgb=[1,.68,.28];
/**
 * Replaces the material's emissive colour (constant amber in the export) by colours running along the tubes. The
 * emissive mask keeps the drawing of the tubes; the colours never exceed 1, so the screen shows their real hue.
 */
const emissiveChunk=`
uniform vec3 jukeboxColors[${COLOURS}];
uniform vec3 jukeboxOrigin;
uniform float jukeboxPhase;
uniform float jukeboxLevel;
void getEmission() {
	vec3 p = vPositionW - jukeboxOrigin;
	float along = p.y - abs(p.x);
	float t = fract(along / ${(BAND_METRES*COLOURS).toFixed(3)} - jukeboxPhase) * ${COLOURS.toFixed(1)};
	vec3 colour = t < 1.0 ? mix(jukeboxColors[0], jukeboxColors[1], smoothstep(.75, 1.0, t))
		: t < 2.0 ? mix(jukeboxColors[1], jukeboxColors[2], smoothstep(.75, 1.0, t - 1.0))
		: mix(jukeboxColors[2], jukeboxColors[0], smoothstep(.75, 1.0, t - 2.0));
	float run = fract(along * 3.0 - jukeboxPhase * ${(RUN_SPEED/BAND_SPEED).toFixed(3)});
	float bulb = smoothstep(0.0, .12, run) * (1.0 - smoothstep(.3, .55, run));
	dEmission = colour * jukeboxLevel * (.58 + .42 * bulb);
	#ifdef STD_EMISSIVE_TEXTURE
	dEmission *= {STD_EMISSIVE_TEXTURE_DECODE}(texture2DBias({STD_EMISSIVE_TEXTURE_NAME}, {STD_EMISSIVE_TEXTURE_UV}, {STD_TEXTURE_BIAS})).{STD_EMISSIVE_TEXTURE_CHANNEL};
	#endif
	#ifdef STD_EMISSIVE_VERTEX
	dEmission *= saturate(vVertexColor.{STD_EMISSIVE_VERTEX_CHANNEL});
	#endif
}
`;
const toLinear=(c:number)=>Math.pow(c,2.2);
const brightest=(c:Rgb):Rgb=>{const m=Math.max(...c,1e-4);return [c[0]/m,c[1]/m,c[2]/m];};

/**
 * The map's jukebox (12_jukebox.py) lights up while it plays: its tubes (Jukebox_FX_Luz) and the light in front of it
 * (Jukebox_FX_Ponto_Luz) take the colours of the video. Everything follows the shared timeline, so every browser
 * shows the same colours at the same moment of the song. Dark when off; dimmed and still while paused.
 */
export class JukeboxLights {
  private material?:pc.StandardMaterial;
  private light?:pc.LightComponent;
  private readonly origin=new Float32Array(3);
  private readonly uniform=new Float32Array(COLOURS*3);
  /** Shown colours (linear), easing towards the video's. */
  private readonly shown:Rgb[]=Array.from({length:COLOURS},()=>AMBER.map(toLinear) as Rgb);
  private palette?:VideoPalette;
  private requested='';
  private level=0;
  private readonly lightColor=new pc.Color();
  constructor(map:pc.Entity){
    const glow=map.findByName('Jukebox_FX_Luz') as pc.Entity|null;
    const instance=(glow?.findComponents('render') as pc.RenderComponent[]|undefined)?.flatMap(render=>render.meshInstances)[0];
    if(instance?.material instanceof pc.StandardMaterial){
      this.material=instance.material;
      this.material.getShaderChunks(pc.SHADERLANGUAGE_GLSL).set('emissivePS',emissiveChunk);
      this.material.shaderChunksVersion='2.23';this.material.update();
      // Origin of the pattern: the middle of the jukebox's base.
      const base=(map.findByName('Jukebox') as pc.Entity|null)?.getPosition()??glow!.getPosition();
      this.origin.set([base.x,base.y,base.z]);
    }
    const point=map.findByName('Jukebox_FX_Ponto_Luz') as pc.Entity|null;
    this.light=point?.light??(point?.findComponent('light') as pc.LightComponent|null)??undefined;
    if(this.light){
      this.light.type='omni';this.light.castShadows=false;this.light.falloffMode=pc.LIGHTFALLOFF_LINEAR;
      this.light.range=LIGHT_RANGE;this.light.intensity=0;this.light.enabled=false;
    }
    if(!this.material||!this.light)console.warn('Luzes da jukebox ausentes no mapa (Jukebox_FX_Luz / Jukebox_FX_Ponto_Luz).');
    this.apply(0);
  }

  /** Colours of the video at this point of the song: its stills, cross-faded in the order they appear. */
  private target(progress:number):Rgb[] {
    const frames=this.palette?.frames;
    if(!frames?.some(frame=>frame.length))return this.shown.map(()=>AMBER.map(toLinear) as Rgb);
    let i=PALETTE_KEYS.length-1;while(i>0&&progress<PALETTE_KEYS[i]!)i--;
    const next=Math.min(i+1,PALETTE_KEYS.length-1),span=(PALETTE_KEYS[next]!-PALETTE_KEYS[i]!)||1,f=next===i?0:Math.min(1,(progress-PALETTE_KEYS[i]!)/span);
    const colour=(frame:number,k:number)=>(frames[frame]![k]??AMBER).map(toLinear) as Rgb;
    return this.shown.map((_,k)=>{const a=colour(i,k),b=colour(next,k);return brightest([a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f,a[2]+(b[2]-a[2])*f]);});
  }

  /** `duration`: seconds of the video, from the local player (0 while unknown). */
  update(dt:number,state:JukeboxState|undefined,serverNow:number,duration:number,exposure:number):void {
    const videoId=state&&state.status!=='off'?state.videoId:'';
    if(videoId&&videoId!==this.requested){
      this.requested=videoId;this.palette=undefined;
      void videoPalette(videoId).then(palette=>{if(this.requested===palette.videoId)this.palette=palette;}).catch(()=>{});
    }
    const time=state?jukeboxTime(state,serverNow):0;
    // Without the duration the stills take turns every 40 s.
    const progress=duration>0?Math.min(.999,time/duration):(time/160)%1;
    const blend=1-Math.exp(-Math.min(dt,.1)*2.5);
    this.target(progress).forEach((colour,k)=>{const shown=this.shown[k]!;for(let c=0;c<3;c++)shown[c]!+=(colour[c]!-shown[c]!)*blend;});
    this.level+=((LEVEL[state?.status??'off']??0)-this.level)*(1-Math.exp(-Math.min(dt,.1)*3));
    if(this.level<.002)this.level=0;
    this.apply(time*BAND_SPEED,exposure);
  }

  private apply(phase:number,exposure=1):void {
    this.shown.forEach((colour,k)=>this.uniform.set(colour,k*3));
    if(this.material){
      this.material.setParameter('jukeboxColors[0]',this.uniform);
      this.material.setParameter('jukeboxOrigin',this.origin);
      this.material.setParameter('jukeboxPhase',phase%1000);
      // Exposure multiplies everything on screen: dividing by it keeps the brightest tube at exactly its colour.
      this.material.setParameter('jukeboxLevel',this.level/Math.max(exposure,.1));
    }
    if(this.light){
      // The light shows the colour passing the front of the cabinet at that moment, blended like the tubes.
      const t=((((.9/(BAND_METRES*COLOURS)-phase)%1)+1)%1)*COLOURS,k=Math.floor(t)%COLOURS,a=this.shown[k]!,b=this.shown[(k+1)%COLOURS]!;
      const f=Math.min(1,Math.max(0,(t-Math.floor(t)-.75)/.25)),blend=f*f*(3-2*f);
      this.lightColor.set(...a.map((v,c)=>Math.pow(v+(b[c]!-v)*blend,1/2.2)) as Rgb);this.light.color=this.lightColor;
      this.light.intensity=LIGHT_INTENSITY*this.level;this.light.enabled=this.level>.01;
    }
  }

  telemetry():JukeboxLightsStatus {
    const hex=(c:Rgb)=>'#'+c.map(v=>Math.round(Math.pow(Math.max(0,Math.min(1,v)),1/2.2)*255).toString(16).padStart(2,'0')).join('');
    return {lit:this.level>.01,level:+this.level.toFixed(3),videoId:this.requested,palette:!!this.palette?.frames.some(frame=>frame.length),colors:this.shown.map(hex),light:!!this.light?.enabled};
  }
}
