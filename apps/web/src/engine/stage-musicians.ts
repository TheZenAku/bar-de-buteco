import * as pc from 'playcanvas';
import {STAGE_PHASES,STAGE_SPOTS,phaseMs,type StagePhase,type StageSpot} from '@bar/shared';

/**
 * The stage's musicians in PlayCanvas: a port of palco_musicos.js (assets-bar/map/BarBoteco/export/animacoes), which is
 * written for three.js. As there, the clips of a spot (public/palco/palco_<spot>.glb: a 1.75 m Mixamo skeleton with its
 * origin on the spot's floor, facing +Z, and the instrument as Prop_* nodes) are converted to each skin by the world
 * rotation of every bone, and the map's instrument (Palco_Violao, Palco_Cavaquinho, Palco_Baquetas) hides while the
 * GLB's copy of it is in the musician's hands. Who plays where, and since when, comes from the room (musicians.ts).
 */

// Mixamo joint names, with any mixamorig prefix, to the canonical ones every skin carries (tools/assets/lib/mixamo-names.mjs).
const MIXAMO:Record<string,string>={Hips:'hip',Spine:'spine_01',Spine1:'spine_02',Spine2:'spine_03',Neck:'neck',Head:'head',HeadTop_End:'head_end',
  LeftShoulder:'shoulder_l',LeftArm:'upperarm_l',LeftForeArm:'lowerarm_l',LeftHand:'hand_l',RightShoulder:'shoulder_r',RightArm:'upperarm_r',
  RightForeArm:'lowerarm_r',RightHand:'hand_r',LeftUpLeg:'upperleg_l',LeftLeg:'lowerleg_l',LeftFoot:'foot_l',LeftToeBase:'toe_l',LeftToe_End:'toe_end_l',
  RightUpLeg:'upperleg_r',RightLeg:'lowerleg_r',RightFoot:'foot_r',RightToeBase:'toe_r',RightToe_End:'toe_end_r'};
const boneName=(name:string):string=>{
  const bare=name.replace(/^.*mixamorig\d*[:_]?/i,''),finger=/^(Left|Right)Hand(Thumb|Index|Middle|Ring|Pinky)(\d)$/.exec(bare);
  return MIXAMO[bare]??(finger?`${finger[2]!.toLowerCase()}_0${finger[3]}_${finger[1]==='Left'?'l':'r'}`:bare);
};
// The clips were made on a 1.75 m skeleton: on a body far from it the hands and the seat no longer meet.
const AUTHORED_HEIGHT=1.75;
/** The anim state of a spot's phase, on the musician's skin and on the instrument. */
export const musicianState=(spot:string,phase:StagePhase):string=>`Palco ${spot} ${phase}`;
/** Seconds into the phase's clip at `now` (server ms): the loop repeats, the others hold their last frame. */
export function musicianTime(spot:StageSpot,phase:StagePhase,startedAt:number,now:number):number {
  const age=Math.max(0,now-startedAt)/1000,duration=phaseMs(spot,phase)/1000;
  return !duration?0:phase==='loop'?age%duration:Math.min(age,duration);
}

interface Curve {times:ArrayLike<number>;values:ArrayLike<number>;size:number;cubic:boolean;step:boolean}
interface Clip {name:string;duration:number;bones:Map<string,Curve>}
/** The authoring skeleton of a spot's GLB at rest, and its clips. */
interface Source {
  order:string[];parent:Map<string,string|null>;restL:Map<string,pc.Quat>;restW:Map<string,pc.Quat>;
  /** World rotation of what holds each bone without a parent bone (the armature). */
  above:Map<string,pc.Quat>;
  hipParent:pc.Mat4;hipRest:pc.Vec3;clips:Clip[];
}
/** A skin's skeleton in its bind pose, in the space of the model (the avatar's, feet on the floor, facing +Z). */
interface Target {
  order:string[];parent:Map<string,string|null>;rest:Map<string,{p:pc.Vec3;q:pc.Quat}>;
  /** What holds each bone without a parent bone, and the hips' parent (inverted). */
  above:Map<string,pc.Mat4>;hipParentInverse:pc.Mat4;
  /** The entity path of each bone in the skin's own clips, so the converted ones bind the same way. */
  paths:Map<string,string[]>;names:Map<string,string>;height:number;
}
interface SpotView {
  spot:StageSpot;
  anchor?:pc.GraphNode;
  /** The map's instrument, on its stand while nobody plays it. */
  instrument?:pc.GraphNode;
  loading?:Promise<void>;failed?:boolean;source?:Source;
  /** The GLB's copy of the instrument, animated with the musician's body (none at the microphone). */
  props?:pc.Entity;propKey:string;
  /** A musician was drawn at the spot this frame. */
  played:boolean;
}

function sample(curve:Curve,t:number,out:number[]):number[] {
  const {times,values,size}=curve,stride=curve.cubic?size*3:size,offset=curve.cubic?size:0,last=times.length-1;
  const read=(key:number,target:number[])=>{for(let c=0;c<size;c++)target[c]=values[key*stride+offset+c]!;return target;};
  if(t<=times[0]!||last<1)return read(0,out);
  if(t>=times[last]!)return read(last,out);
  let lo=0,hi=last;
  while(hi-lo>1){const mid=(lo+hi)>>1;if(times[mid]!<=t)lo=mid;else hi=mid;}
  const a=curve.step?0:(t-times[lo]!)/(times[hi]!-times[lo]!),b=read(hi,[]);
  read(lo,out);
  // Quaternions take the short way round and come back to unit length.
  const flip=size===4&&out[0]!*b[0]!+out[1]!*b[1]!+out[2]!*b[2]!+out[3]!*b[3]!<0?-1:1;
  for(let c=0;c<size;c++)out[c]=out[c]!+(b[c]!*flip-out[c]!)*a;
  if(size===4){const l=Math.hypot(out[0]!,out[1]!,out[2]!,out[3]!)||1;for(let c=0;c<4;c++)out[c]=out[c]!/l;}
  return out;
}

function readClip(track:pc.AnimTrack):Clip {
  const bones=new Map<string,Curve>();
  for(const curve of track.curves){
    const input=track.inputs[curve.input]!,output=track.outputs[curve.output]!;
    for(const path of curve.paths){
      const node=path.entityPath[path.entityPath.length-1]??'';
      if(/mixamorig/i.test(node))bones.set(`${boneName(node)}.${path.propertyPath[0]}`,{times:input.data,values:output.data,size:output.components,
        cubic:curve.interpolation===pc.INTERPOLATION_CUBIC,step:curve.interpolation===pc.INTERPOLATION_STEP});
    }
  }
  return {name:track.name,duration:track.duration,bones};
}

/**
 * The instrument's part of a clip (its Prop_* nodes, at rest in `props`). Blender leaves out a channel that stays at the
 * rest value (the guitar's turn in the loop): it is filled in here, or the engine would keep whatever the previous clip
 * left there, and a client that skips a phase (late, or back from a hidden tab) would hold the instrument askew.
 */
function propsTrack(track:pc.AnimTrack,props:Map<string,pc.GraphNode>):pc.AnimTrack|null {
  const curves:pc.AnimCurve[]=[],outputs=[...track.outputs],animated=new Set<string>(),paths=new Map<string,string[]>();
  for(const curve of track.curves){
    const onProps=curve.paths.filter(path=>props.has(path.entityPath[path.entityPath.length-1]??''));
    if(!onProps.length)continue;
    curves.push(new pc.AnimCurve(onProps,curve.input,curve.output,curve.interpolation));
    for(const path of onProps){const name=path.entityPath[path.entityPath.length-1]!;animated.add(`${name}.${path.propertyPath[0]}`);paths.set(name,path.entityPath);}
  }
  if(!curves.length)return null;
  const inputs=[...track.inputs,new pc.AnimData(1,new Float32Array([0,track.duration]))];
  for(const [name,node] of props)for(const property of ['localPosition','localRotation'] as const){
    if(animated.has(`${name}.${property}`))continue;
    const rest=property==='localPosition'?[...node.getLocalPosition().toArray([])]:[...node.getLocalRotation().toArray([])];
    outputs.push(new pc.AnimData(rest.length,new Float32Array([...rest,...rest])));
    curves.push(new pc.AnimCurve([{entityPath:paths.get(name)??[name],component:'graph',propertyPath:[property]}],inputs.length-1,outputs.length-1,pc.INTERPOLATION_LINEAR));
  }
  return new pc.AnimTrack(track.name,track.duration,inputs,outputs,curves);
}

/** lerFonte: the GLB's skeleton as instantiated, before any clip moved it, is the authoring rest pose. */
function readSource(root:pc.GraphNode,clips:Clip[]):Source {
  const bones=new Map<string,pc.GraphNode>(),order:string[]=[];
  const visit=(node:pc.GraphNode)=>{
    const name=boneName(node.name);
    if(/mixamorig/i.test(node.name)&&!bones.has(name)){bones.set(name,node);order.push(name);}
    node.children.forEach(visit);
  };
  visit(root);
  const hip=bones.get('hip');
  if(!hip?.parent)throw new Error('o esqueleto do palco não tem mixamorig:Hips');
  const parent=new Map<string,string|null>(),restL=new Map<string,pc.Quat>(),restW=new Map<string,pc.Quat>(),above=new Map<string,pc.Quat>();
  for(const name of order){
    const node=bones.get(name)!,up=node.parent,upName=up&&bones.get(boneName(up.name))===up?boneName(up.name):null;
    parent.set(name,upName);restL.set(name,node.getLocalRotation().clone());restW.set(name,node.getRotation().clone());
    if(!upName)above.set(name,up?up.getRotation().clone():new pc.Quat());
  }
  return {order,parent,restL,restW,above,hipParent:hip.parent.getWorldTransform().clone(),hipRest:hip.getPosition().clone(),clips};
}

/** lerAlvo: the bind pose of the skin's joints, from the inverse bind matrices the renderer skins with. */
function readTarget(model:pc.Entity,tracks:readonly pc.AnimTrack[]):Target {
  const toModel=model.getWorldTransform().clone().invert(),joints=new Map<string,{node:pc.GraphNode;bind:pc.Mat4}>();
  let low=Infinity,high=-Infinity;
  for(const render of model.findComponents('render') as pc.RenderComponent[])for(const instance of render.meshInstances){
    const skin=instance.skinInstance;
    if(!skin)continue;
    const meshToModel=new pc.Mat4().mul2(toModel,instance.node.getWorldTransform());
    skin.bones.forEach((bone,i)=>{
      const name=boneName(bone.name);
      if(!joints.has(name))joints.set(name,{node:bone,bind:new pc.Mat4().mul2(meshToModel,skin.skin.inverseBindPose[i]!.clone().invert())});
    });
    if(!instance.mesh)continue;
    const {center,halfExtents}=instance.mesh.aabb,corner=new pc.Vec3();
    for(let i=0;i<8;i++){
      corner.set(center.x+(i&1?1:-1)*halfExtents.x,center.y+(i&2?1:-1)*halfExtents.y,center.z+(i&4?1:-1)*halfExtents.z);
      const y=meshToModel.transformPoint(corner,corner).y;low=Math.min(low,y);high=Math.max(high,y);
    }
  }
  const hip=joints.get('hip');
  if(!hip)throw new Error('a skin não tem o osso hip');
  const order:string[]=[],parent=new Map<string,string|null>(),rest=new Map<string,{p:pc.Vec3;q:pc.Quat}>(),above=new Map<string,pc.Mat4>(),names=new Map<string,string>();
  const visit=(node:pc.GraphNode)=>{
    const name=boneName(node.name);
    if(joints.get(name)?.node===node&&!rest.has(name)){
      const bind=joints.get(name)!.bind,up=node.parent,upName=up&&joints.get(boneName(up.name))?.node===up?boneName(up.name):null;
      order.push(name);parent.set(name,upName);names.set(name,node.name);
      rest.set(name,{p:bind.getTranslation(),q:new pc.Quat().setFromMat4(bind)});
      // Whatever holds the skeleton (armature, model root) has no clip of its own: it stays where it is.
      if(!upName)above.set(name,up?new pc.Mat4().mul2(toModel,up.getWorldTransform()):new pc.Mat4());
    }
    node.children.forEach(visit);
  };
  visit(model);
  const hipParent=parent.get('hip')?joints.get(parent.get('hip')!)!.bind:above.get('hip')!;
  const paths=new Map<string,string[]>();
  for(const track of tracks)for(const curve of track.curves)for(const path of curve.paths){
    const node=path.entityPath[path.entityPath.length-1];
    if(node&&!paths.has(boneName(node)))paths.set(boneName(node),path.entityPath);
  }
  return {order,parent,rest,above,hipParentInverse:hipParent.clone().invert(),paths,names,height:high-low};
}

/**
 * converter: the same world delta from the authoring rest pose, applied to each joint's bind pose; joints the clip
 * does not have keep their bind pose under their parent. The hips move by the clip's metres from its rest, so the
 * musician walks to the stool and sits on it wherever the skin's own hips are.
 */
function convert(clip:Clip,source:Source,target:Target,name:string):pc.AnimTrack {
  const hipTurn=clip.bones.get('hip.localRotation'),hipMove=clip.bones.get('hip.localPosition');
  if(!hipTurn)throw new Error(`${clip.name} não move o quadril`);
  const times=hipTurn.times,frames=times.length;
  const aboveTurn=new Map([...target.above].map(([bone,matrix])=>[bone,new pc.Quat().setFromMat4(matrix)]));
  const restLocal=new Map(target.order.map(bone=>{const up=target.parent.get(bone);
    return [bone,(up?target.rest.get(up)!.q:aboveTurn.get(bone)!).clone().invert().mul(target.rest.get(bone)!.q)];}));
  const turns=new Map(target.order.map(bone=>[bone,new Float32Array(frames*4)])),hips=new Float32Array(frames*3);
  const world=new Map<string,pc.Quat>(),delta=new Map<string,pc.Quat>(),posed=new Map<string,pc.Quat>();
  const value:number[]=[],local=new pc.Quat(),inverse=new pc.Quat(),hip=new pc.Vec3();
  for(let frame=0;frame<frames;frame++){
    const t=times[frame]!;
    for(const bone of source.order){
      const curve=clip.bones.get(`${bone}.localRotation`),up=source.parent.get(bone);
      if(curve){sample(curve,t,value);local.set(value[0]!,value[1]!,value[2]!,value[3]!);}else local.copy(source.restL.get(bone)!);
      const turn=(world.get(bone)??new pc.Quat()).mul2(up?world.get(up)!:source.above.get(bone)!,local);
      world.set(bone,turn);
      delta.set(bone,(delta.get(bone)??new pc.Quat()).mul2(turn,inverse.copy(source.restW.get(bone)!).invert()));
    }
    for(const bone of target.order){
      const up=target.parent.get(bone),above=up?posed.get(up)!:aboveTurn.get(bone)!,turn=posed.get(bone)??new pc.Quat();
      if(delta.has(bone))turn.mul2(delta.get(bone)!,target.rest.get(bone)!.q);else turn.mul2(above,restLocal.get(bone)!);
      posed.set(bone,turn);
      const out=inverse.copy(above).invert().mul(turn).normalize(),data=turns.get(bone)!,k=frame*4;
      // Neighbouring keys on the same side of the sphere, so the engine's blend between them never spins.
      const flip=frame&&out.x*data[k-4]!+out.y*data[k-3]!+out.z*data[k-2]!+out.w*data[k-1]!<0?-1:1;
      data[k]=out.x*flip;data[k+1]=out.y*flip;data[k+2]=out.z*flip;data[k+3]=out.w*flip;
    }
    if(hipMove){
      sample(hipMove,t,value);hip.set(value[0]!,value[1]!,value[2]!);
      source.hipParent.transformPoint(hip,hip).sub(source.hipRest).add(target.rest.get('hip')!.p);
      target.hipParentInverse.transformPoint(hip,hip);
      hips[frame*3]=hip.x;hips[frame*3+1]=hip.y;hips[frame*3+2]=hip.z;
    }
  }
  const inputs=[new pc.AnimData(1,Float32Array.from(times)),new pc.AnimData(1,new Float32Array([0,clip.duration]))],outputs:pc.AnimData[]=[],curves:pc.AnimCurve[]=[];
  const add=(bone:string,property:string,data:Float32Array,size:number,input=0)=>{
    outputs.push(new pc.AnimData(size,data));
    curves.push(new pc.AnimCurve([{entityPath:target.paths.get(bone)??[target.names.get(bone)!],component:'graph',propertyPath:[property]}],input,outputs.length-1,pc.INTERPOLATION_LINEAR));
  };
  for(const bone of target.order){
    add(bone,'localRotation',turns.get(bone)!,4);
    // The skeleton's top joints stay put under what holds them (a native root may have been moved by another clip).
    if(bone!=='hip'&&!target.parent.get(bone)){
      const p=target.above.get(bone)!.clone().invert().transformPoint(target.rest.get(bone)!.p);
      add(bone,'localPosition',new Float32Array([p.x,p.y,p.z,p.x,p.y,p.z]),3,1);
    }
  }
  if(hipMove)add('hip','localPosition',hips,3);
  return new pc.AnimTrack(name,clip.duration,inputs,outputs,curves);
}

export class StageMusicians {
  private readonly spots=new Map<string,SpotView>();
  /** Each skin's bind pose, read once from its first avatar. */
  private readonly targets=new Map<string,Target>();
  /** The four clips of a spot converted for a skin (`skin|spot`); null when that failed. */
  private readonly converted=new Map<string,pc.AnimTrack[]|null>();
  private destroyed=false;

  constructor(private readonly app:pc.Application,map:pc.Entity) {
    for(const spot of STAGE_SPOTS){
      const anchor=map.findByName(`Palco_Lugar_${spot.id[0]!.toUpperCase()}${spot.id.slice(1)}`)??undefined;
      const instrument=spot.instrument?map.findByName(spot.instrument)??undefined:undefined;
      if(!anchor)console.warn(`Lugar do palco "${spot.id}" ausente no mapa.`);
      if(spot.instrument&&!instrument)console.warn(`Instrumento "${spot.instrument}" ausente no mapa.`);
      this.spots.set(spot.id,{spot,anchor,instrument,propKey:'',played:false});
    }
  }

  /** Starts downloading a spot's clips (the local player came near it), so taking it starts without a wait. */
  preload(spotId:string):void {const view=this.spots.get(spotId);if(view)void this.load(view);}

  /**
   * The four body clips of a spot for a skin, converted on first use from an avatar wearing it (`model`, with its own
   * clips `tracks`). Undefined while the spot's GLB loads, or if the skin cannot take them.
   */
  bodyTracks(spotId:string,skinId:string,model:pc.Entity,tracks:readonly pc.AnimTrack[]):pc.AnimTrack[]|undefined {
    const view=this.spots.get(spotId),key=`${skinId}|${spotId}`;
    if(!view)return;
    if(!view.source){void this.load(view);return;}
    if(!this.converted.has(key)){
      try{
        let target=this.targets.get(skinId);
        if(!target){
          target=readTarget(model,tracks);this.targets.set(skinId,target);
          if(Math.abs(target.height-AUTHORED_HEIGHT)>.15)console.warn(`Palco: a skin ${skinId} tem ${target.height.toFixed(2)} m; as animações foram feitas para ${AUTHORED_HEIGHT} m (mãos e assento podem não encostar).`);
        }
        const source=view.source;
        this.converted.set(key,source.clips.map((clip,i)=>convert(clip,source,target!,musicianState(spotId,STAGE_PHASES[i]!))));
      }catch(error){console.warn(`Palco: não foi possível adaptar as animações de ${spotId} para ${skinId}.`,error);this.converted.set(key,null);}
    }
    return this.converted.get(key)??undefined;
  }

  /** This frame a musician plays `phase` at the spot, begun at `startedAt`: the instrument copy follows the body. */
  play(spotId:string,phase:StagePhase,startedAt:number,now:number,blend:number):void {
    const view=this.spots.get(spotId);
    if(!view?.source||phase==='fim')return;
    view.played=true;
    if(view.instrument)view.instrument.enabled=false;
    const props=view.props;
    if(!props)return;
    props.enabled=true;
    const key=`${phase}:${startedAt}`,layer=props.anim?.baseLayer;
    if(key===view.propKey||!layer)return;
    layer.transition(musicianState(spotId,phase),view.propKey?blend:0);
    layer.activeStateCurrentTime=musicianTime(view.spot,phase,startedAt,now);
    view.propKey=key;
  }

  /** After every avatar has been posed: a spot nobody played this frame has its instrument back on the stand. */
  frame():void {
    for(const view of this.spots.values()){
      if(!view.played){
        if(view.instrument)view.instrument.enabled=true;
        if(view.props)view.props.enabled=false;
        view.propKey='';
      }
      view.played=false;
    }
  }

  telemetry():Record<string,{loaded:boolean;instrument:boolean|null;props:boolean|null;propState:string|null;propTime:number|null}> {
    return Object.fromEntries([...this.spots].map(([id,view])=>[id,{loaded:!!view.source,instrument:view.instrument?view.instrument.enabled:null,
      props:view.props?view.props.enabled:null,propState:view.props?.enabled?view.props.anim?.baseLayer?.activeState??null:null,
      propTime:view.props?.enabled?+(view.props.anim?.baseLayer?.activeStateCurrentTime??0).toFixed(3):null}]));
  }

  destroy():void {
    this.destroyed=true;
    for(const view of this.spots.values()){view.props?.destroy();if(view.instrument)view.instrument.enabled=true;}
  }

  private load(view:SpotView):Promise<void> {
    if(view.failed)return Promise.resolve();
    return view.loading??=new Promise<void>(resolve=>{
      const {file,hash}=view.spot.animation;
      this.app.assets.loadFromUrl(`${import.meta.env.BASE_URL}palco/${file}?v=${hash}`,'container',(error,asset)=>{
        if(this.destroyed){resolve();return;}
        if(error||!asset){console.warn(`Animações do palco (${view.spot.id}) indisponíveis.`,error);view.failed=true;resolve();return;}
        try{
          const container=asset.resource as pc.ContainerResource;
          const tracks=view.spot.clips.map(name=>{
            const track=container.animations.map(a=>a.resource as pc.AnimTrack).find(t=>t.name===name);
            if(!track)throw new Error(`${file} não tem o clipe ${name}`);
            return track;
          });
          // Instantiated, before any clip runs: the authoring skeleton and the instrument at rest.
          const entity=container.instantiateRenderEntity({castShadows:true,receiveShadows:true});
          view.source=readSource(entity,tracks.map(readClip));
          const props=new Map(entity.find(node=>node.name.startsWith('Prop_')).map(node=>[node.name,node]));
          const propTracks=tracks.map(track=>propsTrack(track,props));
          if(propTracks.some(Boolean)){
            // The GLB's copy of the instrument stands on the spot (its clips are in the spot's space) until someone plays.
            entity.name=`Palco ${view.spot.id} instrumento`;entity.enabled=false;
            if(view.anchor){entity.setPosition(view.anchor.getPosition());entity.setRotation(view.anchor.getRotation());}
            entity.addComponent('anim',{activate:true});
            propTracks.forEach((track,i)=>{if(track)entity.anim!.assignAnimation(musicianState(view.spot.id,STAGE_PHASES[i]!),track,undefined,1,STAGE_PHASES[i]==='loop');});
            this.app.root.addChild(entity);view.props=entity;
          }else entity.destroy();
        }catch(failure){console.warn(`Animações do palco (${view.spot.id}) inválidas.`,failure);view.failed=true;view.source=undefined;}
        resolve();
      });
    });
  }
}
