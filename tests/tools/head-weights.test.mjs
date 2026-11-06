import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Matrix4,Quaternion,Vector3} from 'three';
import {objects,readGlb} from '../../tools/assets/lib/character-gltf.mjs';
import {repairHeadWeights} from '../../tools/assets/lib/head-weights.mjs';

const models=new URL('../../apps/web/public/models/',import.meta.url);
function values(g,index){
  const a=g.json.accessors[index],v=g.json.bufferViews[a.bufferView];
  const size={VEC3:3,VEC4:4,MAT4:16}[a.type],bytes={5121:1,5123:2,5126:4}[a.componentType];
  const read={5121:'readUInt8',5123:'readUInt16LE',5126:'readFloatLE'}[a.componentType];
  return Array.from({length:a.count*size},(_,i)=>g.bin[read]((v.byteOffset??0)+(a.byteOffset??0)+Math.floor(i/size)*(v.byteStride??size*bytes)+(i%size)*bytes));
}

for(const file of fs.readdirSync(models).filter(name=>name.endsWith('.glb')))test(`${file}: skull keeps its shape at extreme gaze angles and weight repair is repeatable`,()=>{
  const g=readGlb(new URL(file,models)),original=Buffer.from(g.bin);
  assert.equal(repairHeadWeights(g),0,'Published weights already include the repair');
  assert.deepEqual(g.bin,original,'Reimporting must not accumulate changes');
  if(file==='nathan.glb')return; // Original independent facial rig.
  const nodes=objects(g.json),skin=g.json.skins[0],head=nodes.find(n=>n.name==='head'),neck=nodes.find(n=>n.name==='neck');
  const inverse=values(g,skin.inverseBindMatrices),bind=skin.joints.map((_,i)=>new Matrix4().fromArray(inverse,i*16));
  const headIndex=skin.joints.indexOf(nodes.indexOf(head));
  const hp=head.getWorldPosition(new Vector3()),frame=head.matrixWorld.clone().multiply(bind[headIndex]);
  const meshes=g.json.meshes.flatMap(m=>m.primitives.map(p=>({p:values(g,p.attributes.POSITION),j:values(g,p.attributes.JOINTS_0),w:values(g,p.attributes.WEIGHTS_0)})));
  const samples=[];
  for(const mesh of meshes)for(let i=0;i<mesh.p.length/3;i++){
    const vertex=new Vector3().fromArray(mesh.p,i*3),point=vertex.clone().applyMatrix4(frame);
    if(point.y<hp.y+.005)continue;
    let upper=0;
    for(let k=0;k<4;k++)if(/^(head|head_end|neck|spine_0[23]|shoulder_[lr])$/.test(nodes[skin.joints[mesh.j[i*4+k]]].name))upper+=mesh.w[i*4+k];
    if(upper<.9999)continue;
    samples.push({mesh,i,vertex,point});
  }
  assert.ok(samples.length>100,'Measure actual skull geometry');
  const headRest=head.quaternion.clone(),neckRest=neck.quaternion.clone();
  const skinPoint=({mesh,i,vertex})=>{
    const point=new Vector3();
    for(let k=0;k<4;k++)if(mesh.w[i*4+k]){
      const joint=mesh.j[i*4+k],matrix=nodes[skin.joints[joint]].matrixWorld.clone().multiply(bind[joint]);
      point.addScaledVector(vertex.clone().applyMatrix4(matrix),mesh.w[i*4+k]);
    }
    return head.worldToLocal(point);
  };
  const baseline=samples.map(skinPoint);
  for(const [yaw,pitch] of [[80,50],[-80,-50],[80,-50],[-80,50]]){
    head.quaternion.copy(headRest);neck.quaternion.copy(neckRest);nodes[0].updateMatrixWorld(true);
    const turn=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),yaw*Math.PI/180);
    const tilt=new Quaternion().setFromAxisAngle(new Vector3(Math.cos(yaw*Math.PI/180),0,-Math.sin(yaw*Math.PI/180)),pitch*Math.PI/180);
    const offset=tilt.multiply(turn),headWorld=head.getWorldQuaternion(new Quaternion());
    const neckWorld=neck.getWorldQuaternion(new Quaternion()).premultiply(new Quaternion().slerp(offset,.4));
    neck.quaternion.copy(neck.parent.getWorldQuaternion(new Quaternion()).invert().multiply(neckWorld));nodes[0].updateMatrixWorld(true);
    head.quaternion.copy(head.parent.getWorldQuaternion(new Quaternion()).invert().multiply(offset.clone().multiply(headWorld)));nodes[0].updateMatrixWorld(true);
    let error=0;
    for(const [i,sample] of samples.entries())error=Math.max(error,skinPoint(sample).distanceTo(baseline[i]));
    assert.ok(error<1e-5,`${yaw}/${pitch}: skull stretched by ${error} in head coordinates`);
  }
});

test('repair leaves native eyes and jaw weights, geometry, bind matrices and animation data intact',()=>{
  const native=readGlb(new URL('nathan.glb',models)),before=Buffer.from(native.bin),json=JSON.stringify(native.json);
  assert.equal(repairHeadWeights(native),0);assert.deepEqual(native.bin,before);assert.equal(JSON.stringify(native.json),json);
  // Reintroduce a chest influence on a skull vertex to exercise the importer, rather than only checking repaired files.
  const g=readGlb(new URL('gilmar-gordo.glb',models)),skin=g.json.skins[0];
  const head=skin.joints.findIndex(i=>g.json.nodes[i].name==='head'),chest=skin.joints.findIndex(i=>g.json.nodes[i].name==='spine_03');
  const p=g.json.meshes[0].primitives[0],j=g.json.accessors[p.attributes.JOINTS_0],w=g.json.accessors[p.attributes.WEIGHTS_0];
  const jointOffset=(g.json.bufferViews[j.bufferView].byteOffset??0)+(j.byteOffset??0),weightOffset=(g.json.bufferViews[w.bufferView].byteOffset??0)+(w.byteOffset??0);
  const joints=values(g,p.attributes.JOINTS_0),weights=values(g,p.attributes.WEIGHTS_0);
  const vertex=weights.findIndex((value,i)=>i%4===0&&value===1&&joints[i]===head)/4;
  assert.ok(Number.isInteger(vertex)&&vertex>=0);
  const bytes=j.componentType===5121?1:2,write=bytes===1?'writeUInt8':'writeUInt16LE';
  g.bin[write](chest,jointOffset+(vertex*4+1)*bytes);
  g.bin.writeFloatLE(.4,weightOffset+vertex*16);g.bin.writeFloatLE(.6,weightOffset+vertex*16+4);
  const damaged=Buffer.from(g.bin),metadata=JSON.stringify(g.json);
  assert.ok(repairHeadWeights(g)>0);assert.equal(JSON.stringify(g.json),metadata);
  // Only JOINTS_0/WEIGHTS_0 buffer views may change.
  for(const [i,view] of g.json.bufferViews.entries()){
    if(i===j.bufferView||i===w.bufferView)continue;
    const start=view.byteOffset??0;
    assert.deepEqual(g.bin.subarray(start,start+view.byteLength),damaged.subarray(start,start+view.byteLength));
  }
  assert.equal(repairHeadWeights(g),0);
});
