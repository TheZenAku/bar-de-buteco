import * as pc from 'playcanvas';
import {CLEAN_TASKS,CLEAN_TASK_IDS,DIRT_PENDING,type CleanTaskId,type FactoryDirt} from '@bar/shared/factory';

/**
 * The plant's dirt (docs/sistemas/fabrica.md, "Sujeira"): grime and powder drawn over the real surfaces of the plant's sector by a procedural
 * shader. The sector's static geometry is ONE node merged by material and its materials are shared with the rest of the city, so nothing
 * of it is touched: for every plant material that can get dirty (stainless, painted steel, floors) a second mesh instance reuses the very same
 * mesh with a single dirt material (alpha blended, no depth write, pulled a little towards the camera) and the shader decides per pixel,
 * from the world position, how dirty it is. The overlay is a child of the sector's static entity, so it is shown, hidden and destroyed
 * with the sector when the city streams it.
 *
 * The room sends one level per place (`view.dirt.levels`, 0 clean .. 1 filthy). Each place is a zone in the shader (`CLEAN_TASKS`: where, how
 * wide, what kind of surface); the level is compared with a per-pixel pattern so dirt appears and is wiped away patch by patch, not as a fade:
 *  - up-facing surfaces gather powder and spills in blotches (fbm noise); vertical ones get streaks running down (noise stretched along y);
 *  - machines are dirtier near the bottom; floors only take up-facing surfaces near the ground;
 *  - while a place is being cleaned the level glides down (and the surface stays wet for a while: dark puddles, high gloss).
 */
export const DIRT_SECTOR_NODE='S07_04_Estatico';
/** The sector's materials the plant's machines, racks and floors are made of (the shader masks by zone, so whole meshes are overlaid). */
const OVERLAID=new Set(['EB_Aco_Inox','EB_Paleta','EB_Aco_Galvanizado','EB_Atlas','EB_Piso_Epoxi','EB_Epoxi_Branco','EB_Piso_Grade','EB_Chapa_Xadrez','EB_Patio_Concreto']);
const KIND={floor:0,tank:1,dryer:2,line:3} as const;
/** Height windows (m) by kind: a floor's is relative to its own height (what lies within reach of the ground), a machine's is absolute (it stands taller than a person). */
const WINDOW:Record<keyof typeof KIND,[number,number]>={floor:[-.35,.6],tank:[.95,3.5],dryer:[-.15,10.2],line:[-.15,3.4]};
const ZONES=CLEAN_TASKS.length;
/** Levels glide: soiling is slow (the room only reports changes), cleaning wipes a place in about three seconds. */
const SOIL_PER_S=.25,WIPE_PER_S=.34,WET_FADE_PER_S=.09;

const chunk=(source:string)=>source;
const COMMON=chunk(/* glsl */`
#ifdef FORWARD_PASS
// One pair of uniforms per zone (array uniforms did not reach the shader through material parameters).
${Array.from({length:ZONES},(_,i)=>`uniform vec4 dirtA${i};uniform vec4 dirtB${i};`).join('\n')}
uniform float dirtQuality;
float dDirtA;vec3 dDirtC;float dDirtG;
float dirtHash(vec3 p){p=fract(p*.3183099+vec3(.71,.113,.419));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float dirtNoise(vec3 x){
  vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
  return mix(mix(mix(dirtHash(i),dirtHash(i+vec3(1,0,0)),f.x),mix(dirtHash(i+vec3(0,1,0)),dirtHash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(dirtHash(i+vec3(0,0,1)),dirtHash(i+vec3(1,0,1)),f.x),mix(dirtHash(i+vec3(0,1,1)),dirtHash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float dirtFbm(vec3 p){
  float a=.5,s=0.;
  for(int i=0;i<4;i++){if(i==3&&dirtQuality<.5)break;s+=a*dirtNoise(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=.5;}
  return s/(dirtQuality>.5?.9375:.875);
}
// What one zone adds at this point: its level through the radial and height masks (the strongest zone decides the look, the wettest the sheen).
void dirtZone(vec4 A,vec4 B,vec3 P,vec3 N,inout float best,inout float wet,inout float kind,inout float base){
  if(A.w<.003&&B.w<.003)return;
  // A floor fades out towards its radius; a machine is fully dirty out to its radius (its walls stand there) and fades just beyond.
  float d=length(P.xz-A.xy),m=B.z<.5?1.-smoothstep(A.z*.7,A.z,d):1.-smoothstep(A.z,A.z*1.3,d);
  m*=smoothstep(B.x-.05,B.x+.05,P.y)*(1.-smoothstep(B.y-.4,B.y,P.y));
  // Floors take only what faces up; a machine takes any side.
  if(B.z<.5)m*=smoothstep(.45,.75,N.y);
  float lv=A.w*m;
  if(lv>best){best=lv;kind=B.z;base=B.x;}
  wet=max(wet,B.w*m);
}
void dirtEval(){
  dDirtA=0.;dDirtC=vec3(.3);dDirtG=.1;
  vec3 P=vPositionW,N=normalize(vNormalW);
  float best=0.,wet=0.,kind=0.,base=0.;
  ${Array.from({length:ZONES},(_,i)=>`dirtZone(dirtA${i},dirtB${i},P,N,best,wet,kind,base);`).join('\n  ')}
  if(best<.003&&wet<.01){dAlpha=0.;return;}
  float up=smoothstep(.3,.75,N.y);
  // Blotches on what faces up, streaks that run down the sides (noise stretched along the height, across by the wall's own direction).
  float across=P.x*N.z-P.z*N.x;
  float blotch=dirtFbm(P*1.9)*.7+dirtFbm(P*8.)*.3;
  float streak=dirtFbm(vec3(across*2.4,P.y*.38,across*.3))*.8+dirtFbm(vec3(across*5.5,P.y*1.1,1.7))*.2;
  float pat=mix(streak,blotch,up);
  // Machines gather more towards the bottom.
  if(kind>.5)pat+=smoothstep(0.,5.,P.y-base)*.16;
  float cov=smoothstep(0.,.22,best*1.22-pat*.95);
  float film=best*.13;
  float a=max(cov*.92,film);
  // Powder (cream) on floors and the line; caked brown grime on the tanks; the dryer both.
  float powderBias=kind<.5?.62:(kind<1.5?.34:(kind<2.5?.5:.58));
  float tone=dirtFbm(P*3.3+vec3(7.,1.,3.));
  float powder=clamp(tone*1.5-.35+powderBias*.9-.25+up*.2,0.,1.);
  vec3 col=mix(mix(vec3(.27,.18,.09),vec3(.55,.39,.21),tone),vec3(.84,.78,.64),powder);
  // A darker crust at the edge of each patch.
  col*=1.-.32*(1.-smoothstep(.2,.8,cov))*cov;
  float g=mix(.5,.05,cov);
  // Just washed: a water film in patches (dark, shiny).
  float puddle=wet*(1.-smoothstep(.1,.65,dirtFbm(P*2.4+vec3(3.,5.,1.))));
  a=max(a,puddle*.22);col=mix(col,vec3(.07,.09,.11),puddle*(1.-cov)*.8);g=mix(g,.96,puddle);
  dDirtA=a;dDirtC=pow(col,vec3(2.2));dDirtG=g;
}
#endif
`);
const OPACITY=chunk(/* glsl */`
${COMMON}
void getOpacity(){
  #ifdef FORWARD_PASS
    dirtEval();dAlpha=dDirtA;
    if(dAlpha<.004)discard;
  #else
    dAlpha=0.;
  #endif
}
`);
const DIFFUSE=chunk(/* glsl */`void getAlbedo(){dAlbedo=dDirtC;}`);
const GLOSS=chunk(/* glsl */`void getGlossiness(){dGlossiness=dDirtG;}`);

interface Zone {id:CleanTaskId;x:number;z:number;radius:number;kind:number;low:number;high:number;shown:number;target:number;wet:number}
interface CleaningRun {task:CleanTaskId;startedAt:number;durationMs:number}

/** The plant's dirt overlay: see the file's header. One per FactoryVisuals. */
export class PlantDirt {
  private readonly material:pc.StandardMaterial;
  private readonly zones:Zone[];
  private readonly a=new Float32Array(ZONES*4);
  private readonly b=new Float32Array(ZONES*4);
  private overlay?:pc.Entity;private target?:pc.GraphNode;
  private seen=false;private shown=false;private searchIn=0;
  private run?:CleaningRun;
  private disposed=false;
  constructor(private readonly app:pc.AppBase){
    const material=new pc.StandardMaterial();
    material.name='EB Sujeira';material.useMetalness=true;material.metalness=0;material.diffuse.set(1,1,1);
    const chunks=material.getShaderChunks(pc.SHADERLANGUAGE_GLSL);
    chunks.set('opacityPS',OPACITY);chunks.set('diffusePS',DIFFUSE);chunks.set('glossPS',GLOSS);
    material.shaderChunksVersion='2.23';
    // Normal blending that keeps the framebuffer's alpha (the canvas is transparent: rendering-pitfalls), no depth write, and a pull towards the
    // camera so the overlay wins the tie with the surface it copies.
    material.blendState=new pc.BlendState(true,pc.BLENDEQUATION_ADD,pc.BLENDMODE_SRC_ALPHA,pc.BLENDMODE_ONE_MINUS_SRC_ALPHA,pc.BLENDEQUATION_ADD,pc.BLENDMODE_ZERO,pc.BLENDMODE_ONE);
    material.depthWrite=false;material.depthBias=-1;material.slopeDepthBias=-1.5;
    material.update();this.material=material;
    this.zones=CLEAN_TASKS.map(task=>{const [low,high]=WINDOW[task.kind];return {id:task.id,x:task.at.x,z:task.at.z,radius:task.radius,kind:KIND[task.kind],low:task.kind==='floor'?task.at.y+low:low,high:task.kind==='floor'?task.at.y+high:high,shown:0,target:0,wet:0};});
    this.push();
  }

  /** A new state arrived (FactoryVisuals.update): the room's levels become the targets the shader's levels glide towards. */
  update(dirt:FactoryDirt|undefined,lowQuality:boolean,progress?:{clean:{task:CleanTaskId;startedAt:number;endsAt:number}|null;dryerState:string;dryerStepS:number;cleanS:number}):void {
    this.material.setParameter('dirtQuality',lowQuality?0:1);
    // A cleaning in progress is followed on this machine's clock (the room's clock may differ by seconds): its place is wiped as the bar fills.
    const clean=progress?.clean;
    if(clean&&(!this.run||this.run.task!==clean.task))this.run={task:clean.task,startedAt:performance.now(),durationMs:Math.max(1000,clean.endsAt-clean.startedAt)};
    else if(!clean)this.run=undefined;
    for(const zone of this.zones){
      const level=Math.max(0,Math.min(1,dirt?.levels[zone.id]??0));
      zone.target=level;
      if(!this.seen)zone.shown=level;
    }
    // The dryer's own wash (the machine's LIMPEZA cycle) wipes the dryer as its timer runs.
    if(progress&&progress.dryerState==='LIMPEZA'){const zone=this.zones.find(each=>each.id==='dryer');if(zone)zone.target=Math.min(zone.target,Math.max(0,1-progress.dryerStepS/Math.max(1,progress.cleanS))*Math.max(zone.target,.35));}
    this.seen=true;
  }
  /** The displayed level (0..1) at a point of the plant: the highest of the zones around it. */
  levelAt(x:number,z:number):number {
    let best=0;
    for(const zone of this.zones){const m=zoneMask(zone,x,z);best=Math.max(best,zone.shown*m);}
    return best;
  }
  /** Every frame (when the plant is in range). Returns whether anything still moves, so the caller keeps rendering. */
  tick(dt:number):boolean {
    if(this.disposed)return false;
    this.searchIn-=dt;
    if(this.target&&(this.target.root!==this.app.root))this.detach();
    if(!this.target&&this.searchIn<=0){this.searchIn=1.2;this.attach();}
    let moving=false;
    const scrub=this.run?Math.min(1,(performance.now()-this.run.startedAt)/this.run.durationMs):0;
    for(const zone of this.zones){
      let target=zone.target;
      // The place being cleaned is wiped along the progress bar (never below what the room says once it is done).
      if(this.run&&this.run.task===zone.id)target=Math.min(target,zone.target*(1-scrub));
      const gap=target-zone.shown;
      if(gap>.0005){zone.shown=Math.min(target,zone.shown+Math.min(gap,dt*SOIL_PER_S));moving=true;}
      else if(gap<-.0005){zone.shown=Math.max(target,zone.shown-Math.min(-gap,dt*WIPE_PER_S));zone.wet=1;moving=true;}
      else if(Math.abs(gap)>0)zone.shown=target;
      if(zone.wet>0&&gap>=-.0005){zone.wet=Math.max(0,zone.wet-dt*WET_FADE_PER_S);if(zone.wet>0)moving=true;}
    }
    this.push();
    const visible=this.zones.some(zone=>zone.shown>.004||zone.wet>.01);
    if(this.overlay&&visible!==this.shown){this.shown=visible;this.overlay.enabled=visible;}
    return moving;
  }
  private push():void {
    this.zones.forEach((zone,index)=>{
      const o=index*4;
      this.a[o]=zone.x;this.a[o+1]=zone.z;this.a[o+2]=zone.radius;this.a[o+3]=zone.shown;
      this.b[o]=zone.low;this.b[o+1]=zone.high;this.b[o+2]=zone.kind;this.b[o+3]=zone.wet;
      this.material.setParameter(`dirtA${index}`,[this.a[o]!,this.a[o+1]!,this.a[o+2]!,this.a[o+3]!]);
      this.material.setParameter(`dirtB${index}`,[this.b[o]!,this.b[o+1]!,this.b[o+2]!,this.b[o+3]!]);
    });
  }
  /** Finds the plant's sector (it streams in and out with the city) and overlays its dirtable materials. */
  private attach():void {
    const sector=this.app.root.findByName(DIRT_SECTOR_NODE) as pc.Entity|null;
    const render=sector?.render;
    if(!sector||!render)return;
    const instances=render.meshInstances.filter(instance=>!!instance.mesh&&OVERLAID.has(instance.material?.name??''));
    if(!instances.length)return;
    const overlay=new pc.Entity('EB_Sujeira');
    overlay.addComponent('render',{meshInstances:instances.map(instance=>{
      const copy=new pc.MeshInstance(instance.mesh!,this.material,overlay);
      copy.castShadow=false;copy.receiveShadow=true;copy.cull=true;return copy;
    }),castShadows:false,receiveShadows:true});
    overlay.enabled=false;this.shown=false;
    sector.addChild(overlay);this.overlay=overlay;this.target=sector;
  }
  private detach():void {
    if(this.overlay?.parent)this.overlay.destroy();
    this.overlay=undefined;this.target=undefined;this.shown=false;
  }
  /** Out of range of the plant: the overlay is not drawn (it comes back with the next update). */
  hide():void {if(this.overlay)this.overlay.enabled=false;this.shown=false;this.seen=false;this.run=undefined;}
  destroy():void {this.disposed=true;this.detach();this.material.destroy();}
  /** Whether a place is dirty enough to ask for cleaning (the room's own threshold). */
  static pending(dirt:FactoryDirt|undefined,id:CleanTaskId):boolean {return (dirt?.levels[id]??0)>=DIRT_PENDING;}
  static readonly ids=CLEAN_TASK_IDS;
}

const smoothstep=(a:number,b:number,x:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
/** The dirt a place would show on a given point (module helper for callers without a PlantDirt: e.g. footprints, sounds). */
export const zoneMask=(zone:{x:number;z:number;radius:number;kind?:number},x:number,z:number):number=>zone.kind&&zone.kind>0?1-smoothstep(zone.radius,zone.radius*1.3,Math.hypot(x-zone.x,z-zone.z)):1-smoothstep(zone.radius*.7,zone.radius,Math.hypot(x-zone.x,z-zone.z));
