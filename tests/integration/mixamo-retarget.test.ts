import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as pc from 'playcanvas';
import {boneName,convert,readClip,readSource,readTarget} from '../../apps/web/src/engine/mixamo-retarget';

// Read the actual exported assets without a renderer. The render stand-ins expose the same inverse bind
// matrices readTarget receives from PlayCanvas; animation sampling uses the engine's real evaluator.
function asset(file:string) {
  const bytes=readFileSync(new URL(`../../apps/web/public/${file}`,import.meta.url));
  const length=bytes.readUInt32LE(12);
  const json=JSON.parse(bytes.subarray(20,20+length).toString()),bin=bytes.subarray(28+length);
  const components:Record<string,number>={SCALAR:1,VEC3:3,VEC4:4,MAT4:16};
  const values=(index:number)=>{
    const a=json.accessors[index],view=json.bufferViews[a.bufferView];
    assert.equal(a.componentType,5126);
    const width=components[a.type]!,stride=view.byteStride??width*4,start=(view.byteOffset??0)+(a.byteOffset??0);
    return Float32Array.from({length:a.count*width},(_,i)=>bin.readFloatLE(start+Math.floor(i/width)*stride+i%width*4));
  };
  const root=new pc.Entity('Test model');
  const nodes:pc.Entity[]=json.nodes.map((raw:any,i:number)=>{
    const node=new pc.Entity(raw.name??`node_${i}`);
    if(raw.matrix){
      const matrix=new pc.Mat4().set(raw.matrix);
      node.setLocalPosition(matrix.getTranslation());node.setLocalRotation(new pc.Quat().setFromMat4(matrix));node.setLocalScale(matrix.getScale());
    }else{
      const p=raw.translation??[0,0,0],q=raw.rotation??[0,0,0,1],s=raw.scale??[1,1,1];
      node.setLocalPosition(p[0],p[1],p[2]);node.setLocalRotation(q[0],q[1],q[2],q[3]);node.setLocalScale(s[0],s[1],s[2]);
    }
    return node;
  });
  json.nodes.forEach((raw:any,i:number)=>raw.children?.forEach((child:number)=>nodes[i]!.addChild(nodes[child]!)));
  json.scenes[json.scene??0].nodes.forEach((i:number)=>root.addChild(nodes[i]!));
  const rest=nodes.map(node=>({p:node.getLocalPosition().clone(),q:node.getLocalRotation().clone(),s:node.getLocalScale().clone()}));
  const reset=()=>nodes.forEach((node,i)=>{node.setLocalPosition(rest[i]!.p);node.setLocalRotation(rest[i]!.q);node.setLocalScale(rest[i]!.s);});
  const tracks:pc.AnimTrack[]=(json.animations??[]).map((animation:any)=>{
    const inputs:pc.AnimData[]=[],outputs:pc.AnimData[]=[],curves:pc.AnimCurve[]=[];
    for(const channel of animation.channels){
      const sampler=animation.samplers[channel.sampler],output=json.accessors[sampler.output];
      const data=values(sampler.output);
      // PlayCanvas's GLB parser puts adjacent quaternion keys in the same hemisphere before evaluation.
      if(channel.target.path==='rotation'&&sampler.interpolation!=='CUBICSPLINE')for(let i=4;i<data.length;i+=4){
        let dot=0;for(let c=0;c<4;c++)dot+=data[i+c]!*data[i+c-4]!;
        if(dot<0)for(let c=0;c<4;c++)data[i+c]*=-1;
      }
      inputs.push(new pc.AnimData(1,values(sampler.input)));outputs.push(new pc.AnimData(components[output.type]!,data));
      const property=({rotation:'localRotation',translation:'localPosition',scale:'localScale'} as Record<string,string>)[channel.target.path]!;
      curves.push(new pc.AnimCurve([{entityPath:nodes[channel.target.node]!.path.split('/'),component:'graph',propertyPath:[property]}],inputs.length-1,outputs.length-1,
        sampler.interpolation==='STEP'?pc.INTERPOLATION_STEP:sampler.interpolation==='CUBICSPLINE'?pc.INTERPOLATION_CUBIC:pc.INTERPOLATION_LINEAR));
    }
    return new pc.AnimTrack(animation.name,Math.max(...inputs.map(input=>input.data[input.data.length-1]!)),inputs,outputs,curves);
  });
  const meshInstances=json.nodes.flatMap((raw:any,i:number)=>{
    if(raw.skin===undefined)return [];
    const skin=json.skins[raw.skin],data=values(skin.inverseBindMatrices);
    return json.meshes[raw.mesh].primitives.map((primitive:any)=>{
      const {min,max}=json.accessors[primitive.attributes.POSITION];
      return {node:nodes[i],skinInstance:{bones:skin.joints.map((joint:number)=>nodes[joint]),skin:{inverseBindPose:skin.joints.map((_:number,j:number)=>new pc.Mat4().set(Array.from(data.subarray(j*16,j*16+16))))}},
        mesh:{aabb:new pc.BoundingBox(new pc.Vec3((min[0]+max[0])/2,(min[1]+max[1])/2,(min[2]+max[2])/2),new pc.Vec3((max[0]-min[0])/2,(max[1]-min[1])/2,(max[2]-min[2])/2))}};
    });
  });
  Object.defineProperty(root,'findComponents',{value:()=>[{meshInstances}]});
  const byName=new Map(nodes.map(node=>[boneName(node.name),node]));
  return {root,tracks,byName,reset};
}

function pose(root:pc.Entity,track:pc.AnimTrack,time:number) {
  const evaluator=new pc.AnimEvaluator(new pc.DefaultAnimBinder(root));
  evaluator.addClip(new pc.AnimClip(track,time,1,true,false));evaluator.update(0);
}

const sources=[
  ['animacoes/bar_locomocao.glb',['parado_loop','andar_loop','andar_bebado_loop','cair','levantar_chao']],
  ['animacoes/bar_cadeira.glb',['sentar','sentado_loop','levantar','comer_loop']],
  ['animacoes/bar_fumar.glb',['fumar_acender','fumar_loop']],
  ['animacoes/bar_banheiro.glb',['urinar']],
  ['palco/palco_violao.glb',['violao_sentar_pegar','violao_tocando_loop']],
  ['palco/palco_cavaquinho.glb',['cavaquinho_tocando_loop']],
  ['palco/palco_bateria.glb',['bateria_tocando_loop']],
  ['palco/palco_vocal.glb',['vocal_cantando_loop']],
] as const;
const authored=sources.map(([file,names])=>{
  const model=asset(file),clips=model.tracks.filter(track=>(names as readonly string[]).includes(track.name)).map(track=>readClip(track));
  return {file,model,clips,source:readSource(model.root,clips)};
});
const limbs={upperarm:'lowerarm',lowerarm:'hand',upperleg:'lowerleg',lowerleg:'foot'};
const position=(model:ReturnType<typeof asset>,name:string)=>model.byName.get(name)!.getPosition();
const direction=(model:ReturnType<typeof asset>,from:string,to:string)=>new pc.Vec3().sub2(position(model,to),position(model,from)).normalize();

for(const id of ['nathan','rafael','leandro','read','magrao','gilmar-gordo']) {
  test(`${id}: runtime bar and stage clips align actual limbs without stretching the native skeleton`,()=>{
    const model=asset(`models/${id}.glb`),target=readTarget(model.root,model.tracks);
    const lengths=new Map<string,number>();
    for(const [start,end] of Object.entries(limbs))for(const side of ['l','r']){
      const a=`${start}_${side}`,b=`${end}_${side}`;lengths.set(a,position(model,a).distance(position(model,b)));
    }
    for(const {file,model:reference,clips,source} of authored)for(const clip of clips){
      const converted=convert(clip,source,target,clip.name);
      for(const fraction of [.15,.5,.85]){
        const time=clip.duration*fraction;
        reference.reset();model.reset();
        pose(reference.root,reference.tracks.find(track=>track.name===clip.name)!,time);pose(model.root,converted,time);
        for(const [start,end] of Object.entries(limbs))for(const side of ['l','r']){
          const a=`${start}_${side}`,b=`${end}_${side}`,label=`${id}/${file}/${clip.name}/${a} at ${time.toFixed(2)} s`;
          const dot=direction(model,a,b).dot(direction(reference,a,b));
          assert.ok(dot>.999,`${label}: motion direction differs from the authoring skeleton (${dot})`);
          assert.ok(Math.abs(position(model,a).distance(position(model,b))-lengths.get(a)!)<1e-5,`${label}: bone length changed`);
        }
      }
    }
  });
}
