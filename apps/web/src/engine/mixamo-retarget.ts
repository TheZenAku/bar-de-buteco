import * as pc from 'playcanvas';

/**
 * Clips authored on a Mixamo skeleton (the exports of palco_musicos.js and animacoes_bar.js, written for three.js) played on
 * any of the bar's skins: each bone's world rotation away from the authoring rest pose is applied to the skin's bind
 * pose, and the hips move by the clip's metres from the skin's own. Used by the stage's musicians and the bar animations.
 */

// Mixamo joint names, with any mixamorig prefix, to the canonical ones every skin carries (tools/assets/lib/mixamo-names.mjs).
const MIXAMO:Record<string,string>={Hips:'hip',Spine:'spine_01',Spine1:'spine_02',Spine2:'spine_03',Neck:'neck',Head:'head',HeadTop_End:'head_end',
  LeftShoulder:'shoulder_l',LeftArm:'upperarm_l',LeftForeArm:'lowerarm_l',LeftHand:'hand_l',RightShoulder:'shoulder_r',RightArm:'upperarm_r',
  RightForeArm:'lowerarm_r',RightHand:'hand_r',LeftUpLeg:'upperleg_l',LeftLeg:'lowerleg_l',LeftFoot:'foot_l',LeftToeBase:'toe_l',LeftToe_End:'toe_end_l',
  RightUpLeg:'upperleg_r',RightLeg:'lowerleg_r',RightFoot:'foot_r',RightToeBase:'toe_r',RightToe_End:'toe_end_r'};
export const boneName=(name:string):string=>{
  const bare=name.replace(/^.*mixamorig\d*[:_]?/i,''),finger=/^(Left|Right)Hand(Thumb|Index|Middle|Ring|Pinky)(\d)$/.exec(bare);
  return MIXAMO[bare]??(finger?`${finger[2]!.toLowerCase()}_0${finger[3]}_${finger[1]==='Left'?'l':'r'}`:bare);
};

export interface Curve {times:ArrayLike<number>;values:ArrayLike<number>;size:number;cubic:boolean;step:boolean}
/** A clip's curves by `<node>.<property>`: the bones by canonical name, `nodes` (other nodes, e.g. props) by their own. */
export interface Clip {name:string;duration:number;bones:Map<string,Curve>}
/** The authoring skeleton of a clip file at rest, and its clips. */
export interface Source {
  order:string[];parent:Map<string,string|null>;restL:Map<string,pc.Quat>;restW:Map<string,pc.Quat>;
  /** Local position and scale of each bone at rest (forward kinematics of the authoring skeleton). */
  restT:Map<string,pc.Vec3>;restS:Map<string,pc.Vec3>;
  /** World rotation of what holds each bone without a parent bone (the armature). */
  above:Map<string,pc.Quat>;
  hipParent:pc.Mat4;hipRest:pc.Vec3;clips:Clip[];
}
/** A skin's skeleton in its bind pose, in the space of the model (the avatar's, feet on the floor, facing +Z). */
export interface Target {
  order:string[];parent:Map<string,string|null>;rest:Map<string,{p:pc.Vec3;q:pc.Quat}>;
  /** What holds each bone without a parent bone, and the hips' parent (inverted). */
  above:Map<string,pc.Mat4>;hipParentInverse:pc.Mat4;
  /** The entity path of each bone in the skin's own clips, so the converted ones bind the same way. */
  paths:Map<string,string[]>;names:Map<string,string>;height:number;
}

export function sample(curve:Curve,t:number,out:number[]):number[] {
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

/** The curves of a clip: the Mixamo bones (by canonical name) and, when `keep` accepts their name, other nodes. */
export function readClip(track:pc.AnimTrack,keep:(node:string)=>boolean=()=>false):Clip {
  const bones=new Map<string,Curve>();
  for(const curve of track.curves){
    const input=track.inputs[curve.input]!,output=track.outputs[curve.output]!;
    for(const path of curve.paths){
      const node=path.entityPath[path.entityPath.length-1]??'',bone=/mixamorig/i.test(node);
      if(bone||keep(node))bones.set(`${bone?boneName(node):node}.${path.propertyPath[0]}`,{times:input.data,values:output.data,size:output.components,
        cubic:curve.interpolation===pc.INTERPOLATION_CUBIC,step:curve.interpolation===pc.INTERPOLATION_STEP});
    }
  }
  return {name:track.name,duration:track.duration,bones};
}

/** lerFonte: the GLB's skeleton as instantiated, before any clip moved it, is the authoring rest pose. */
export function readSource(root:pc.GraphNode,clips:Clip[]):Source {
  const bones=new Map<string,pc.GraphNode>(),order:string[]=[];
  const visit=(node:pc.GraphNode)=>{
    const name=boneName(node.name);
    if(/mixamorig/i.test(node.name)&&!bones.has(name)){bones.set(name,node);order.push(name);}
    node.children.forEach(visit);
  };
  visit(root);
  const hip=bones.get('hip');
  if(!hip?.parent)throw new Error('o esqueleto não tem mixamorig:Hips');
  const parent=new Map<string,string|null>(),restL=new Map<string,pc.Quat>(),restW=new Map<string,pc.Quat>(),above=new Map<string,pc.Quat>();
  const restT=new Map<string,pc.Vec3>(),restS=new Map<string,pc.Vec3>();
  for(const name of order){
    const node=bones.get(name)!,up=node.parent,upName=up&&bones.get(boneName(up.name))===up?boneName(up.name):null;
    parent.set(name,upName);restL.set(name,node.getLocalRotation().clone());restW.set(name,node.getRotation().clone());
    restT.set(name,node.getLocalPosition().clone());restS.set(name,node.getLocalScale().clone());
    if(!upName)above.set(name,up?up.getRotation().clone():new pc.Quat());
  }
  return {order,parent,restL,restW,restT,restS,above,hipParent:hip.parent.getWorldTransform().clone(),hipRest:hip.getPosition().clone(),clips};
}

/** lerAlvo: the bind pose of the skin's joints, from the inverse bind matrices the renderer skins with. */
export function readTarget(model:pc.Entity,tracks:readonly pc.AnimTrack[]):Target {
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
 * does not have keep their bind pose under their parent. The hips move by the clip's metres from its rest (times
 * `hipScale`: 1 where the clip must reach a place, the body's height ratio where it moves in its own space).
 */
export function convert(clip:Clip,source:Source,target:Target,name:string,hipScale=1):pc.AnimTrack {
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
      source.hipParent.transformPoint(hip,hip).sub(source.hipRest).mulScalar(hipScale).add(target.rest.get('hip')!.p);
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
