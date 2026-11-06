import {Matrix4,Vector3} from 'three';
import {objects} from './character-gltf.mjs';

// Read/write through the accessor, including interleaved buffers. The importer exports float weights.
function attribute(glb,index){
  const a=glb.json.accessors[index],v=glb.json.bufferViews[a.bufferView];
  const size={VEC3:3,VEC4:4,MAT4:16}[a.type],bytes={5121:1,5123:2,5126:4}[a.componentType];
  const offset=(v.byteOffset??0)+(a.byteOffset??0),stride=v.byteStride??size*bytes;
  const get={5121:'readUInt8',5123:'readUInt16LE',5126:'readFloatLE'}[a.componentType];
  const set={5121:'writeUInt8',5123:'writeUInt16LE',5126:'writeFloatLE'}[a.componentType];
  if(!get||a.normalized||a.sparse)throw new Error('Unsupported head-weight accessor');
  return {count:a.count,get:(i,k)=>glb.bin[get](offset+i*stride+k*bytes),set:(i,k,value)=>glb.bin[set](value,offset+i*stride+k*bytes)};
}

/**
 * Mixamo/automatic weights can blend the skull with the stationary chest and shoulders, collapsing
 * the face on a head turn. Keep the skull rigid and blend only through the neck in bind space.
 * This operates on exported weights, leaving geometry, bind matrices and animations untouched.
 * Native facial rigs are intentionally kept: their eyes/jaw have independent authored weights.
 */
export function repairHeadWeights(glb){
  const {json}=glb,nodes=objects(json),point=new Vector3();
  let changed=0;
  for(const skin of json.skins??[]){
    const names=skin.joints.map(i=>nodes[i].name),head=names.indexOf('head'),neck=names.indexOf('neck');
    if(head<0||neck<0)continue;
    const headNode=nodes[skin.joints[head]],neckNode=nodes[skin.joints[neck]];
    if(headNode.children.some(n=>n.name!=='head_end'))continue;
    const h=headNode.getWorldPosition(new Vector3()),n=neckNode.getWorldPosition(new Vector3());
    const span=h.y-n.y;if(span<=0)continue;
    const inverse=attribute(glb,skin.inverseBindMatrices);
    // A single bind transform avoids feeding rounded weight sums back into the spatial mask on reimport.
    const bind=headNode.matrixWorld.clone().multiply(new Matrix4().fromArray(Array.from({length:16},(_,k)=>inverse.get(head,k))));
    const upper=new Set(names.flatMap((name,i)=>/^(head|head_end|neck|spine_0[23]|shoulder_[lr])$/.test(name)?[i]:[]));
    const seen=new Set();
    for(const node of json.nodes){
      if(node.skin!==json.skins.indexOf(skin)||node.mesh===undefined)continue;
      for(const primitive of json.meshes[node.mesh].primitives){
        const a=primitive.attributes,key=`${a.JOINTS_0}/${a.WEIGHTS_0}`;
        if(seen.has(key))continue;seen.add(key);
        const positions=attribute(glb,a.POSITION),joints=attribute(glb,a.JOINTS_0),weights=attribute(glb,a.WEIGHTS_0);
        for(let i=0;i<positions.count;i++){
          point.set(positions.get(i,0),positions.get(i,1),positions.get(i,2)).applyMatrix4(bind);
          let upperWeight=0,headWeight=0;
          for(let k=0;k<4;k++){
            const joint=joints.get(i,k),weight=weights.get(i,k);
            if(!weight)continue;
            if(upper.has(joint))upperWeight+=weight;
            if(joint===head||names[joint]==='head_end')headWeight+=weight;
          }
          // Exclude limbs and the collar/shoulders. The lower neck keeps its authored transition.
          const t=Math.max(0,Math.min(1,(point.y-(n.y+span*.25))/(span*.75)));
          if(t===0||upperWeight<.9999)continue;
          if(point.y<h.y&&Math.abs(point.x-h.x)>span)continue;
          const share=Math.min(1,Math.max(headWeight,t*t*(3-2*t)));
          const targetJ=[head,neck,0,0],targetW=[share,1-share,0,0];
          if(targetJ.every((j,k)=>!targetW[k]||joints.get(i,k)===j)&&targetW.every((w,k)=>Math.abs(weights.get(i,k)-w)<1e-7))continue;
          for(let k=0;k<4;k++){joints.set(i,k,targetJ[k]);weights.set(i,k,targetW[k]);}
          changed++;
        }
      }
    }
  }
  return changed;
}
