import * as pc from 'playcanvas';
import {BAR_ANIMATIONS,CLEANABLE_TABLES,INTERACTABLES,URINALS,seatChair,type BarClip,type BarFrame,type BarGroup,type BarStep} from '@bar/shared';
import {alignedRest,boneName,convert,readClip,readSource,readTarget,sample,type Clip,type Source,type Target} from './mixamo-retarget';

/**
 * The bar's character animations in PlayCanvas: a port of animacoes_bar.js (assets-bar/map/BarBoteco/export/animacoes),
 * which is written for three.js. As there, the clips of each file (public/animacoes/bar_<group>.glb: a 1.90 m Mixamo
 * skeleton, props and particle emitters) are converted to each skin by the world rotation of every bone
 * (mixamo-retarget.ts); props held in a hand follow the skin's real hand; the map's own chair instance is pulled with
 * Prop_Cadeira; a prop can also turn to point at another (`mira`: the cigarette in the mouth at the lighter's flame, which
 * comes from the other hand); the cup on the tray and the freezer lid hide while their copies are in use; smoke, sickness
 * and the stream are particles; the cigarette butt, the puddle and the delivered drink stay on the map a while.
 * What plays when comes from the room, through barTimeline (packages/shared/src/bar-animations.ts): this only draws it.
 */

/** Seconds a cigarette butt, a puddle or a plate stays on the floor or table (animacoes_bar.js `restos`). */
const LEFTOVER_SECONDS=60;
/** Seconds the drink Magrão leaves on the counter stays there: the customer is drinking their own by then. */
const DELIVERED_SECONDS=2.5;
/** The anim state of a clip on an avatar's skin. */
export const barState=(clip:BarClip):string=>`Bar ${clip}`;

interface ClipInfo {group:BarGroup;duration:number;loop:boolean;end:{x:number;z:number;yaw:number};
  segue?:Record<string,[number,number,string][]>;mira?:Record<string,{faixas:[number,number,string][];junto?:string[]}>;
  substitui?:Record<string,string>;entrega?:string[];fica?:string[]}
interface GroupInfo {file:string;hash:string;anchor:string|null;height:number;hipHeight?:number;fps:number;props:string[];fx:Record<string,string>}
const clipInfo=(clip:BarClip)=>BAR_ANIMATIONS.clips[clip] as ClipInfo;
const groupInfo=(group:BarGroup)=>BAR_ANIMATIONS.groups[group] as GroupInfo;
/** How far a clip leaves the body from where it started (metres): the avatar then stands where the body is. */
export function barEndOffset(clip:BarClip):number {const {end}=clipInfo(clip),start=BAR_ANIMATIONS.clips[clip].start;return Math.hypot(end.x-start.x,end.z-start.z);}

interface Rest {p:pc.Vec3;q:pc.Quat;s:pc.Vec3}
interface GroupView {
  loading?:Promise<void>;failed?:boolean;
  container?:pc.ContainerResource;source?:Source;
  /** Each clip's curves: the bones and the props (Prop_*, FX_*). */
  clips:Map<string,Clip>;
  /** The props as authored, for channels a clip leaves out. */
  rest:Map<string,Rest>;
}
/** One avatar's copy of a group's props, placed in the clip's space. */
interface Kit {root:pc.Entity;props:Map<string,pc.Entity>}
interface ActorView {
  kits:Map<BarGroup,Kit>;
  /** Canonical bone name → node of the skin it was made for. */
  bones?:Map<string,pc.GraphNode>;model?:pc.Entity;
  played?:{clip:BarClip;startedAt:number;time:number};
  /** Leftovers already dropped, by clip and start, so a clip holding its last frame drops them once. */
  dropped:Set<string>;
  chair?:number;
}
export interface BarPlay {
  /** The clip's space: the place, or the avatar's feet facing its way. */
  space:BarFrame;
  /** The skin's model (its bones carry the canonical names), and the skin. */
  model:pc.Entity;skin:string;
  /** A seated customer eating what they ordered: the clip's own plate and fries are not drawn, nor left behind. */
  servedFood?:boolean;
  /** The seat whose chair the clip pulls (sentar, levantar). */
  seat?:string;
}

// The particles (animacoes_bar.js FX_TIPOS): the node's scale is the intensity. The stream is a little thicker than
// authored (1.0–1.2 cm): that thin, it hardly showed from the game's camera.
interface FxType {taxa:number;vel:number;sobe:number;abre:number;vida:[number,number];tam:[number,number];cor:[number,number,number];cor2:[number,number,number];alfa:number;grav:number;arrasto?:number;chao?:boolean;solido?:boolean}
const FX_TYPES:Record<string,FxType>={
  fumaca:{taxa:20,vel:.04,sobe:.16,abre:.03,vida:[2.2,3.2],tam:[.02,.16],cor:[.8,.8,.82],cor2:[.7,.7,.74],alfa:.32,grav:0,arrasto:.5},
  fumaca_boca:{taxa:90,vel:.65,sobe:.06,abre:.22,vida:[1.6,2.4],tam:[.04,.26],cor:[.84,.84,.86],cor2:[.74,.74,.78],alfa:.34,grav:0,arrasto:1.8},
  vomito:{taxa:170,vel:1.4,sobe:0,abre:.32,vida:[.6,.9],tam:[.022,.032],cor:[.45,.62,.12],cor2:[.62,.58,.18],alfa:.95,grav:9.8,chao:true,solido:true},
  urina:{taxa:240,vel:1.65,sobe:0,abre:.035,vida:[.32,.45],tam:[.014,.018],cor:[.97,.86,.32],cor2:[.93,.8,.26],alfa:.7,grav:9.8,chao:true,solido:true},
};
const PARTICLE_VERTEX=`attribute vec3 aPosition;attribute vec4 aColor;attribute vec2 aUv0;
uniform mat4 matrix_model;uniform mat4 matrix_view;uniform mat4 matrix_viewProjection;uniform float screenScale;varying vec4 vColor;
void main(){vColor=aColor;vec4 world=matrix_model*vec4(aPosition,1.0);vec4 view=matrix_view*world;
gl_PointSize=aUv0.x*screenScale/max(-view.z,0.05);gl_Position=matrix_viewProjection*world;}`;
const PARTICLE_FRAGMENT=`precision highp float;varying vec4 vColor;uniform float brightness;
void main(){float d=length(gl_PointCoord-0.5)*2.0;if(d>1.0||vColor.a<=0.0)discard;
gl_FragColor=vec4(vColor.rgb*brightness*(1.0-0.25*d),vColor.a*(1.0-smoothstep(0.35,1.0,d)));}`;

/** Particulas: one point cloud for every emitter, in world space. */
class BarParticles {
  readonly entity:pc.Entity;
  private readonly mesh:pc.Mesh;
  private readonly material:pc.ShaderMaterial;
  private readonly position:Float32Array;private readonly velocity:Float32Array;private readonly colour:Float32Array;private readonly size:Float32Array;
  private readonly age:Float32Array;private readonly life:Float32Array;private readonly floor:Float32Array;
  private readonly type:(FxType|null)[];
  private next=0;private alive=0;
  private readonly owed=new Map<string,number>();
  private readonly direction=new pc.Vec3();

  constructor(app:pc.Application,private readonly max=2400) {
    this.position=new Float32Array(max*3);this.velocity=new Float32Array(max*3);this.colour=new Float32Array(max*4);this.size=new Float32Array(max*2);
    this.age=new Float32Array(max);this.life=new Float32Array(max);this.floor=new Float32Array(max);this.type=new Array(max).fill(null);
    this.mesh=new pc.Mesh(app.graphicsDevice);
    this.mesh.setPositions(this.position);this.mesh.setColors(this.colour);this.mesh.setUvs(0,this.size);this.mesh.update(pc.PRIMITIVE_POINTS,false);
    this.material=new pc.ShaderMaterial({uniqueName:'Boteco bar particles',attributes:{aPosition:pc.SEMANTIC_POSITION,aColor:pc.SEMANTIC_COLOR,aUv0:pc.SEMANTIC_TEXCOORD0},
      vertexGLSL:PARTICLE_VERTEX,fragmentGLSL:PARTICLE_FRAGMENT});
    // Over the scene without touching the canvas alpha (the page would show through, see BarScene.contactShadow).
    this.material.blendState=new pc.BlendState(true,pc.BLENDEQUATION_ADD,pc.BLENDMODE_SRC_ALPHA,pc.BLENDMODE_ONE_MINUS_SRC_ALPHA,pc.BLENDEQUATION_ADD,pc.BLENDMODE_ZERO,pc.BLENDMODE_ONE);
    this.material.depthWrite=false;this.material.setParameter('screenScale',500);this.material.setParameter('brightness',.85);this.material.update();
    const instance=new pc.MeshInstance(this.mesh,this.material);instance.cull=false;
    this.entity=new pc.Entity('Bar animation particles');
    this.entity.addComponent('render',{meshInstances:[instance],castShadows:false,receiveShadows:false});
    this.entity.enabled=false;app.root.addChild(this.entity);
  }

  get count():number {return this.alive;}

  /** Emits from an FX node this frame (`key` keeps the fractional rate per emitter). */
  emit(key:string,typeName:string,node:pc.GraphNode,dt:number,floorY:number):void {
    const type=FX_TYPES[typeName];if(!type)return;
    const intensity=node.getWorldTransform().getScale().x;if(intensity<=.001)return;
    const p=node.getPosition(),dir=node.getRotation().transformVector(pc.Vec3.UP,this.direction).normalize();
    let owed=(this.owed.get(key)??0)+type.taxa*intensity*dt;
    while(owed>=1){
      owed--;
      const i=this.free(),r=Math.random(),jitter=()=>(Math.random()-.5)*.006,spread=()=>(Math.random()-.5)*2*type.abre*type.vel;
      this.position.set([p.x+jitter(),p.y+jitter(),p.z+jitter()],i*3);
      const f=.85+.3*Math.random();
      this.velocity.set([(dir.x*type.vel+spread()+(Math.random()-.5)*.02)*f,(dir.y*type.vel+spread()+type.sobe)*f,(dir.z*type.vel+spread()+(Math.random()-.5)*.02)*f],i*3);
      this.age[i]=0;this.life[i]=type.vida[0]+(type.vida[1]-type.vida[0])*Math.random();this.type[i]=type;this.floor[i]=floorY;
      for(let c=0;c<3;c++)this.colour[i*4+c]=type.cor[c]!+(type.cor2[c]!-type.cor[c]!)*r;
    }
    this.owed.set(key,owed);
  }

  private free():number {
    for(let k=0;k<this.max;k++){const i=(this.next+k)%this.max;if(!this.type[i]){this.next=(i+1)%this.max;return i;}}
    const i=this.next;this.next=(this.next+1)%this.max;return i;
  }

  update(dt:number,camera:pc.CameraComponent|undefined,height:number):void {
    // The point size in pixels of a metre at one metre away.
    if(camera)this.material.setParameter('screenScale',height/(2*Math.tan(camera.fov*Math.PI/360)));
    let alive=0;
    for(let i=0;i<this.max;i++){
      const type=this.type[i];
      if(type){
        this.age[i]+=dt;
        const u=this.age[i]!/this.life[i]!,drag=Math.exp(-(type.arrasto??0)*dt);
        this.velocity[i*3]*=drag;this.velocity[i*3+2]*=drag;this.velocity[i*3+1]=this.velocity[i*3+1]!*drag-type.grav*dt;
        for(let c=0;c<3;c++)this.position[i*3+c]+=this.velocity[i*3+c]!*dt;
        if(u>=1||(type.chao&&this.position[i*3+1]!<=this.floor[i]!+.004))this.type[i]=null;
        else{
          this.size[i*2]=type.tam[0]+(type.tam[1]-type.tam[0])*Math.sqrt(u);
          this.colour[i*4+3]=type.alfa*(type.solido?1:Math.min(1,u*6))*(1-u*u);
          alive++;continue;
        }
      }
      this.colour[i*4+3]=0;this.size[i*2]=0;
    }
    this.alive=alive;this.entity.enabled=alive>0;
    if(!alive)return;
    this.mesh.setPositions(this.position);this.mesh.setColors(this.colour);this.mesh.setUvs(0,this.size);this.mesh.update(pc.PRIMITIVE_POINTS,false);
  }

  destroy():void {this.entity.destroy();this.mesh.destroy();this.material.destroy();}
}

/** The 24 turns that take axes onto axes (quarter and half turns, the diagonals' thirds), as unit quaternions. */
const AXIS_TURNS:pc.Quat[]=[];
for(let i=0;i<81;i++){
  const c=[0,1,2,3].map(k=>Math.floor(i/3**k)%3-1),n=c.filter(Boolean).length;
  if(n===1||n===2||n===4)AXIS_TURNS.push(new pc.Quat(c[0]!/Math.sqrt(n),c[1]!/Math.sqrt(n),c[2]!/Math.sqrt(n),c[3]!/Math.sqrt(n)));
}
/** The axis turn nearest to `turn`: how a rig names a bone's axes against the authoring rig (identity for the Mixamo ones). */
const nearestAxisTurn=(turn:pc.Quat)=>{const dot=(q:pc.Quat)=>Math.abs(q.x*turn.x+q.y*turn.y+q.z*turn.z+q.w*turn.w);return AXIS_TURNS.reduce((best,q)=>dot(q)>dot(best)?q:best);};

/** An instancing buffer's matrices, 16 floats per instance (lock() hands the buffer's own storage). */
const instanceData=(buffer:pc.VertexBuffer):Float32Array=>{const data=buffer.lock();return data instanceof ArrayBuffer?new Float32Array(data):new Float32Array(data.buffer,data.byteOffset,data.byteLength/4);};
const frameMatrix=(frame:BarFrame,out=new pc.Mat4())=>out.setTRS(new pc.Vec3(frame.x,frame.y,frame.z),new pc.Quat().setFromEulerAngles(0,frame.yaw*180/Math.PI,0),pc.Vec3.ONE);

export class BarAnimations {
  private readonly groups=new Map<BarGroup,GroupView>();
  /** Each skin's bind pose, read once from its first avatar. */
  private readonly targets=new Map<string,Target>();
  /** A clip converted for a skin (`skin|clip`); null when that failed. */
  private readonly converted=new Map<string,pc.AnimTrack|null>();
  /**
   * Per skin and group (`skin|group`), each bone's axes against the authoring bone's, as an axis turn: Nathan's own rig
   * points them otherwise (about 120° away), and a prop carried by his bone as it is would orbit his hand or head.
   */
  private readonly axes=new Map<string,Map<string,pc.Quat>>();
  private readonly actors=new Map<string,ActorView>();
  private readonly particles:BarParticles;
  private readonly leftovers:Array<{entity:pc.Entity;seconds:number}>=[];
  /** Map nodes standing in for a GLB's copy (Copo_Bandeja, Freezer_Bar_Tampa), and which of them hide this frame. */
  private readonly substitutes=new Map<string,pc.Entity>();
  private hiding=new Set<string>();
  /** The instanced chairs (INST_A_cadeira-vermelha): one instancing buffer per primitive and its authored matrices. */
  private readonly chairBuffers:Array<{buffer:pc.VertexBuffer;authored:Float32Array}>=[];
  private chairNode?:pc.GraphNode;
  private readonly chairsMoved=new Set<number>();
  private chairsSettleAt=0;
  private elapsed=0;
  private readonly places:{cadeiras:number;mesas:number;mictorios:number;balcao:boolean;entrega:boolean};
  private readonly warned=new Set<string>();
  private destroyed=false;
  private readonly temp={a:new pc.Mat4(),b:new pc.Mat4(),c:new pc.Mat4(),space:new pc.Mat4(),inverse:new pc.Mat4(),p:new pc.Vec3(),q:new pc.Quat(),s:new pc.Vec3(),v:[] as number[]};

  /** `chairsSettled`: a chair moved and stopped (the lamps' cached shadows draw it again where it now stands). */
  constructor(private readonly app:pc.Application,map:pc.Entity,private readonly chairsSettled:()=>void=()=>{}) {
    this.particles=new BarParticles(app);
    for(const info of Object.values(BAR_ANIMATIONS.clips) as ClipInfo[])for(const name of Object.keys(info.substitui??{})){
      const node=map.findByName(name) as pc.Entity|null;
      if(node)this.substitutes.set(name,node);else console.warn(`animacoes_bar: ${name} ausente no mapa; a cópia animada aparece junto com o original.`);
    }
    const chairs=map.findByName('INST_A_cadeira-vermelha') as pc.Entity|null;
    for(const instance of chairs?.render?.meshInstances??[]){
      const buffer=instance.instancingData?.vertexBuffer;
      if(buffer)this.chairBuffers.push({buffer,authored:instanceData(buffer).slice()});
    }
    this.chairNode=chairs??undefined;
    // The places the module looks up by name (animacoes_bar.js: cadeiras, mesas, mictorios, balcao).
    const authored=this.chairBuffers[0]?.authored,seats=INTERACTABLES.filter(i=>i.type==='seat');
    const cadeiras=authored?seats.filter(seat=>{const i=seatChair(seat.id);if(i===undefined||(i+1)*16>authored.length)return false;
      const at=chairs!.getWorldTransform().transformPoint(new pc.Vec3(authored[i*16+12],authored[i*16+13],authored[i*16+14]));
      return Math.hypot(at.x-seat.x,at.y-(seat.y??at.y),at.z-seat.z)<.01;}).length:0;
    if(!cadeiras)console.warn('animacoes_bar: nenhuma instancia de cadeira perto das mesas (sentar fica sem cadeira)');
    this.places={cadeiras,mesas:CLEANABLE_TABLES.filter(t=>map.findByName(t.node)).length,mictorios:URINALS.filter(u=>map.findByName(u.node)).length,
      balcao:!!map.findByName('Balcao_Lugar_Magrao'),entrega:!!map.findByName('Balcao_Entrega')};
  }

  /** Starts downloading what a clip needs (a group's file), so it plays without a wait. */
  preload(clip:BarClip):void {void this.load(clipInfo(clip).group);}

  /**
   * A clip converted for a skin from an avatar wearing it (`model`, with its own clips `tracks`). Undefined while its
   * file loads, or if the skin cannot take it (the avatar then keeps the game's own clip).
   */
  bodyTrack(clip:BarClip,skinId:string,model:pc.Entity,tracks:readonly pc.AnimTrack[]):pc.AnimTrack|undefined {
    const info=clipInfo(clip),view=this.groups.get(info.group),key=`${skinId}|${clip}`;
    if(!view?.source){void this.load(info.group);return;}
    if(!this.converted.has(key)){
      try{
        let target=this.targets.get(skinId);
        if(!target){
          target=readTarget(model,tracks);this.targets.set(skinId,target);
          const authored=groupInfo(info.group).height;
          if(Math.abs(target.height-authored)>.2)console.warn(`animacoes_bar: personagem ${skinId} com ${target.height.toFixed(2)} m; as animacoes foram feitas para ${authored} m`);
        }
        const source=view.source,group=groupInfo(info.group);
        // A clip that reaches a place moves the hips by its metres; one in the body's own space, by the body's height, or
        // by the hips' height when its skeleton has other proportions than the 1.90 m one (hipHeight: Mixamo's Smoking).
        const hipScale=group.anchor?1:group.hipHeight?target.hipHeight/group.hipHeight:target.height/group.height;
        this.converted.set(key,convert(view.clips.get(clip)!,source,target,barState(clip),hipScale));
        // A posed bone is `delta × aligned` and the authoring one `delta × rest`: between them, a constant local turn.
        const axesKey=`${skinId}|${info.group}`;
        if(!this.axes.has(axesKey)){
          const aligned=alignedRest(source,target),turns=new Map<string,pc.Quat>();
          for(const [bone,own] of aligned){const rest=source.restW.get(bone);if(rest)turns.set(bone,nearestAxisTurn(own.clone().invert().mul(rest)));}
          this.axes.set(axesKey,turns);
        }
      }catch(error){console.warn(`animacoes_bar: não foi possível adaptar ${clip} para ${skinId}.`,error);this.converted.set(key,null);}
    }
    return this.converted.get(key)??undefined;
  }

  /**
   * This frame `actorId` plays `step` (its body already posed by the anim component): the props in the clip's space,
   * the hand-held ones on the skin's real hands, the chair, the stand-ins hidden, the particles, and what it leaves.
   */
  play(actorId:string,step:BarStep,{space,model,skin,servedFood,seat}:BarPlay,dt:number):void {
    const info=clipInfo(step.clip),view=this.groups.get(info.group);
    if(!view?.container||!view.source)return;
    const actor=this.actor(actorId);
    if(actor.model!==model){actor.model=model;actor.bones=new Map();model.forEach(node=>{const name=boneName(node.name);if(!actor.bones!.has(name))actor.bones!.set(name,node);});}
    for(const [group,kit] of actor.kits)if(group!==info.group)kit.root.enabled=false;
    const kit=actor.kits.get(info.group)??this.kit(actor,info.group,view.container);
    kit.root.enabled=true;
    const spaceMatrix=frameMatrix(space,this.temp.space);
    kit.root.setPosition(space.x,space.y,space.z);kit.root.setEulerAngles(0,space.yaw*180/Math.PI,0);
    const clip=view.clips.get(step.clip)!,t=step.time,values=this.temp.v;
    for(const [name,prop] of kit.props){
      const rest=view.rest.get(name)!,move=clip.bones.get(`${name}.localPosition`),turn=clip.bones.get(`${name}.localRotation`),scale=clip.bones.get(`${name}.localScale`);
      if(move){sample(move,t,values);prop.setLocalPosition(values[0]!,values[1]!,values[2]!);}else prop.setLocalPosition(rest.p);
      if(turn){sample(turn,t,values);prop.setLocalRotation(values[0]!,values[1]!,values[2]!,values[3]!);}else prop.setLocalRotation(rest.q);
      if(scale){sample(scale,t,values);prop.setLocalScale(values[0]!,values[1]!,values[2]!);}else prop.setLocalScale(rest.s);
    }
    // The food served at the table stands in for the clip's plate and fries.
    if(servedFood)for(const name of ['Prop_Prato','Prop_Batatas'])kit.props.get(name)?.setLocalScale(0,0,0);
    this.followHands(actor,info,view.source,clip,kit,spaceMatrix,t*groupInfo(info.group).fps,this.axes.get(`${skin}|${info.group}`));
    this.aimProps(info,kit,t*groupInfo(info.group).fps);
    for(const name of Object.keys(info.substitui??{}))this.hiding.add(name);
    // The map's chair goes where Prop_Cadeira is.
    const chair=kit.props.get('Prop_Cadeira');
    actor.chair=seat?seatChair(seat):undefined;
    if(chair&&this.chairNode&&actor.chair!==undefined&&chair.getLocalScale().x>1e-3)this.moveChair(actor.chair,chair);
    const floor=space.y;
    for(const [name,type] of Object.entries(groupInfo(info.group).fx))this.particles.emit(`${actorId}:${name}`,type,kit.props.get(name)!,dt,floor);
    // What stays behind once the clip has played to its end.
    const key=`${step.clip}:${step.startedAt}`;
    if(!info.loop&&t>=info.duration-.5/groupInfo(info.group).fps&&!actor.dropped.has(key)){
      actor.dropped.add(key);
      for(const name of info.entrega??[])this.leave(kit.props.get(name),DELIVERED_SECONDS);
      if(!(servedFood&&step.clip==='comer_terminar'))for(const name of info.fica??[])this.leave(kit.props.get(name),LEFTOVER_SECONDS);
    }
    actor.played={clip:step.clip,startedAt:step.startedAt,time:t};
  }

  /** What an actor played last frame (to stand them where the clip left the body once it is over). */
  lastPlayed(actorId:string):{clip:BarClip;startedAt:number;time:number}|undefined {return this.actors.get(actorId)?.played;}
  /** Whether Prop_Jato (the chopp running from the tap) shows on anyone: the map's tap stream runs with it. */
  pouring():boolean {for(const actor of this.actors.values()){const jet=actor.kits.get('magrao')?.props.get('Prop_Jato');if(jet?.enabled&&jet.parent?.enabled&&jet.getLocalScale().x>1e-3)return true;}return false;}

  /** After every avatar was posed: kits nobody played go away, chairs go back, stand-ins show again, particles move. */
  frame(dt:number,camera:pc.CameraComponent|undefined,height:number,played:ReadonlySet<string>):void {
    this.elapsed+=dt;
    for(const [id,actor] of this.actors)if(!played.has(id)){
      for(const kit of actor.kits.values())kit.root.enabled=false;
      actor.played=undefined;
    }
    // Chairs nobody is pulling this frame are back where the map has them.
    for(const index of [...this.chairsMoved])if(![...this.actors].some(([id,actor])=>played.has(id)&&actor.played&&clipInfo(actor.played.clip).group==='cadeira'&&actor.chair===index)){
      this.writeChair(index,null);this.chairsMoved.delete(index);this.chairsSettleAt=this.elapsed+.5;
    }
    if(this.chairsSettleAt&&this.elapsed>=this.chairsSettleAt){this.chairsSettleAt=0;this.chairsSettled();}
    for(const [name,node] of this.substitutes)node.enabled=!this.hiding.has(name);
    this.hiding=new Set();
    this.particles.update(dt,camera,height);
    for(let i=this.leftovers.length-1;i>=0;i--){const left=this.leftovers[i]!;if((left.seconds-=dt)<=0){left.entity.destroy();this.leftovers.splice(i,1);}}
  }

  /** The props and leftovers drawn now (shadow casters that move). */
  *casters():Iterable<pc.MeshInstance> {
    for(const actor of this.actors.values())for(const kit of actor.kits.values())if(kit.root.enabled)for(const render of kit.root.findComponents('render') as pc.RenderComponent[])yield* render.meshInstances;
    for(const {entity} of this.leftovers)for(const render of entity.findComponents('render') as pc.RenderComponent[])yield* render.meshInstances;
  }

  /** An avatar left the scene. */
  forget(actorId:string):void {const actor=this.actors.get(actorId);if(!actor)return;for(const kit of actor.kits.values())kit.root.destroy();this.actors.delete(actorId);}

  telemetry() {
    const groups=Object.fromEntries((Object.keys(BAR_ANIMATIONS.groups) as BarGroup[]).map(g=>{const v=this.groups.get(g);return [g,!v?'idle':v.failed?'failed':v.source?'loaded':'loading'];}));
    return {...this.places,groups,particles:this.particles.count,leftovers:this.leftovers.map(l=>l.entity.name),hidden:[...this.substitutes].filter(([,n])=>!n.enabled).map(([name])=>name),
      chairsMoved:[...this.chairsMoved],pouring:this.pouring(),
      actors:Object.fromEntries([...this.actors].filter(([,a])=>a.played).map(([id,a])=>{
        const kit=a.played&&a.kits.get(clipInfo(a.played.clip).group);
        return [id,{clip:a.played!.clip,time:+a.played!.time.toFixed(3),props:kit?[...kit.props].filter(([,p])=>p.getLocalScale().x>1e-3).map(([name])=>name):[]}];
      }))};
  }

  /** World position of a prop an actor holds now (tests and debugging). */
  propPosition(actorId:string,name:string):number[]|undefined {
    for(const kit of this.actors.get(actorId)?.kits.values()??[])if(kit.root.enabled){const p=kit.props.get(name)?.getPosition();if(p)return [p.x,p.y,p.z].map(v=>+v.toFixed(3));}
  }
  /** The world position of a chair instance as drawn now. */
  chairPosition(index:number):number[]|undefined {
    const data=this.chairBuffers[0]&&instanceData(this.chairBuffers[0].buffer);if(!data||!this.chairNode)return;
    const p=this.chairNode.getWorldTransform().transformPoint(new pc.Vec3(data[index*16+12],data[index*16+13],data[index*16+14]));
    return [p.x,p.y,p.z].map(v=>+v.toFixed(3));
  }

  destroy():void {
    this.destroyed=true;
    for(const id of [...this.actors.keys()])this.forget(id);
    for(const index of this.chairsMoved)this.writeChair(index,null);
    for(const node of this.substitutes.values())node.enabled=true;
    for(const {entity} of this.leftovers)entity.destroy();
    this.particles.destroy();
  }

  private actor(id:string):ActorView {let actor=this.actors.get(id);if(!actor){actor={kits:new Map(),dropped:new Set()};this.actors.set(id,actor);}return actor;}

  private kit(actor:ActorView,group:BarGroup,container:pc.ContainerResource):Kit {
    const root=container.instantiateRenderEntity({castShadows:true,receiveShadows:true});
    root.name=`Bar animation props ${group}`;
    const props=new Map<string,pc.Entity>();
    for(const child of [...root.children] as pc.Entity[]){if(/^(Prop_|FX_)/.test(child.name))props.set(child.name,child);else child.destroy();}
    this.app.root.addChild(root);
    const kit={root,props};actor.kits.set(group,kit);
    return kit;
  }

  /**
   * corrigirProps: a prop held by a bone in a frame range follows the skin's bone instead of the authoring one, by the
   * difference between the two (other proportions), fading in and out over four frames around the range. `axes` turns
   * the skin's bone to the authoring bone's axes first (identity on the Mixamo rigs).
   */
  private followHands(actor:ActorView,info:ClipInfo,source:Source,clip:Clip,kit:Kit,space:pc.Mat4,frame:number,axes?:Map<string,pc.Quat>):void {
    if(!info.segue||!actor.bones)return;
    const {a,b,c,inverse,p,q,s}=this.temp,t=frame/groupInfo(info.group).fps,world=new Map<string,pc.Mat4>();
    inverse.copy(space).invert();
    for(const [name,ranges] of Object.entries(info.segue)){
      const prop=kit.props.get(name);if(!prop)continue;
      let weight=0,bone='';
      for(const [from,to,held] of ranges)if(frame>=from-4&&frame<=to+4){const w=Math.min(1,(frame-(from-4))/4,((to+4)-frame)/4);if(w>weight){weight=w;bone=held;}}
      const canonical=boneName(bone),real=actor.bones.get(canonical);
      if(weight<=0||!real||!source.parent.has(canonical))continue;
      // S: the authoring bone, T: the skin's, both in the clip's space and without scale.
      const authored=this.authoredBone(canonical,source,clip,t,world);
      authored.getTranslation(p);q.setFromMat4(authored);a.setTRS(p,q,pc.Vec3.ONE).invert();
      b.mul2(inverse,real.getWorldTransform());b.getTranslation(p);q.setFromMat4(b);
      const turn=axes?.get(canonical);if(turn)q.mul(turn);
      b.setTRS(p,q,pc.Vec3.ONE);
      c.mul2(b,a);
      if(weight<1){c.getTranslation(p).mulScalar(weight);q.setFromMat4(c);q.slerp(pc.Quat.IDENTITY,q,weight);c.setTRS(p,q,pc.Vec3.ONE);}
      a.setTRS(prop.getLocalPosition(),prop.getLocalRotation(),prop.getLocalScale());
      b.mul2(c,a);
      prop.setLocalPosition(b.getTranslation(p));prop.setLocalRotation(q.setFromMat4(b));prop.setLocalScale(b.getScale(s));
    }
  }

  /**
   * mirarProps: once on the skin's hands, a prop turns about its origin so its +Y points at another prop in frame ranges
   * (the cigarette in the mouth at the lighter's flame, held in the other hand), easing in and out over six frames; the
   * props `junto` it (the ember, the tip's emitter) turn with it.
   */
  private aimProps(info:ClipInfo,kit:Kit,frame:number):void {
    if(!info.mira)return;
    const {p,q,s}=this.temp,origin=new pc.Vec3(),axis=new pc.Vec3(),toward=new pc.Vec3(),turn=new pc.Quat();
    for(const [name,{faixas,junto}] of Object.entries(info.mira)){
      const prop=kit.props.get(name);if(!prop)continue;
      for(const [from,to,aimed] of faixas){
        const weight=Math.min(1,(frame-from)/6,(to-frame)/6),target=kit.props.get(aimed);
        if(weight<=0||!target||prop.getWorldTransform().getScale(s).x<1e-3)continue;
        origin.copy(prop.getPosition());
        prop.getRotation().transformVector(pc.Vec3.UP,axis);
        toward.sub2(target.getPosition(),origin).normalize();
        // The turn in the world, as much as the ease allows.
        turn.setFromDirections(axis,toward).slerp(pc.Quat.IDENTITY,turn,weight);
        for(const node of [prop,...(junto??[]).map(n=>kit.props.get(n))])if(node){
          turn.transformVector(p.sub2(node.getPosition(),origin),p).add(origin);
          node.setPosition(p);node.setRotation(q.mul2(turn,node.getRotation()));
        }
      }
    }
  }

  /** An authoring bone's transform in the clip's space at `t` (forward kinematics of the clip's own curves). */
  private authoredBone(bone:string,source:Source,clip:Clip,t:number,world:Map<string,pc.Mat4>):pc.Mat4 {
    const known=world.get(bone);if(known)return known;
    const up=source.parent.get(bone),parent=up?this.authoredBone(up,source,clip,t,world):source.hipParent,values=this.temp.v;
    const move=clip.bones.get(`${bone}.localPosition`),turn=clip.bones.get(`${bone}.localRotation`),scale=clip.bones.get(`${bone}.localScale`);
    const p=move?new pc.Vec3(...sample(move,t,values).slice(0,3)):source.restT.get(bone)!;
    const q=turn?new pc.Quat(...sample(turn,t,values).slice(0,4)):source.restL.get(bone)!;
    const s=scale?new pc.Vec3(...sample(scale,t,values).slice(0,3)):source.restS.get(bone)!;
    const matrix=new pc.Mat4().mul2(parent,new pc.Mat4().setTRS(p,q,s));
    world.set(bone,matrix);
    return matrix;
  }

  private moveChair(index:number,prop:pc.Entity):void {
    this.temp.a.copy(this.chairNode!.getWorldTransform()).invert();
    this.temp.b.mul2(this.temp.a,prop.getWorldTransform());
    this.writeChair(index,this.temp.b);this.chairsMoved.add(index);this.chairsSettleAt=this.elapsed+.5;
  }
  private writeChair(index:number,matrix:pc.Mat4|null):void {
    for(const {buffer,authored} of this.chairBuffers){
      if((index+1)*16>authored.length)continue;
      instanceData(buffer).set(matrix?matrix.data:authored.subarray(index*16,index*16+16),index*16);
      buffer.unlock();
    }
  }

  /** A copy of a prop left on the map where it is now, for `seconds`. */
  private leave(prop:pc.Entity|undefined,seconds:number):void {
    if(!prop||prop.getLocalScale().x<1e-3)return;
    const copy=prop.clone() as pc.Entity;
    copy.name=`Bar leftover ${prop.name}`;
    this.app.root.addChild(copy);
    copy.setPosition(prop.getPosition());copy.setRotation(prop.getRotation());
    const scale=prop.getWorldTransform().getScale();copy.setLocalScale(scale);
    this.leftovers.push({entity:copy,seconds});
  }

  private load(group:BarGroup):Promise<void> {
    let view=this.groups.get(group);
    if(!view){view={clips:new Map(),rest:new Map()};this.groups.set(group,view);}
    if(view.failed)return Promise.resolve();
    const target=view;
    return target.loading??=new Promise<void>(resolve=>{
      const {file,hash}=groupInfo(group);
      this.app.assets.loadFromUrl(`${import.meta.env.BASE_URL}animacoes/${file}?v=${hash}`,'container',(error,asset)=>{
        if(this.destroyed){resolve();return;}
        if(error||!asset){console.warn(`animacoes_bar: ${file} indisponível.`,error);target.failed=true;resolve();return;}
        try{
          const container=asset.resource as pc.ContainerResource;
          const tracks=container.animations.map(a=>a.resource as pc.AnimTrack);
          for(const [name,info] of Object.entries(BAR_ANIMATIONS.clips))if(info.group===group&&!tracks.some(t=>t.name===name))throw new Error(`${file} não tem o clipe ${name}`);
          // Instantiated, before any clip runs: the authoring skeleton and the props at rest.
          const entity=container.instantiateRenderEntity();
          const clips=tracks.map(track=>readClip(track,node=>/^(Prop_|FX_)/.test(node)));
          target.source=readSource(entity,clips);
          for(const clip of clips)target.clips.set(clip.name,clip);
          for(const child of entity.children)if(/^(Prop_|FX_)/.test(child.name))target.rest.set(child.name,{p:child.getLocalPosition().clone(),q:child.getLocalRotation().clone(),s:child.getLocalScale().clone()});
          entity.destroy();
          target.container=container;
        }catch(failure){console.warn(`animacoes_bar: ${file} inválido.`,failure);target.failed=true;target.source=undefined;}
        resolve();
      });
    });
  }
}
