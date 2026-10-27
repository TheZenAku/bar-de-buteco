// The supplied clothes are unrigged, in centimetres, in the male body's rest pose.
// Transfer surface weights to the existing rig rather than introducing a second skeleton.
import fs from 'node:fs';
import path from 'node:path';
import {Box3,Line3,Matrix4,Ray,Triangle,Vector3} from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {objects} from './character-gltf.mjs';

export function importMaleClothing(json,bin,source,catalog){
  const chunks=[bin];let offset=bin.length;
  const read=index=>{
    const a=json.accessors[index],v=json.bufferViews[a.bufferView],width={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type];
    const [size,method]={5121:[1,'readUInt8'],5123:[2,'readUInt16LE'],5125:[4,'readUInt32LE'],5126:[4,'readFloatLE']}[a.componentType];
    return Array.from({length:a.count*width},(_,i)=>bin[method]((v.byteOffset??0)+(a.byteOffset??0)+Math.floor(i/width)*(v.byteStride??size*width)+(i%width)*size));
  };
  const append=(values,width,integer=false)=>{
    const wide=integer&&values.some(v=>v>65535),array=integer?(wide?Uint32Array.from(values):Uint16Array.from(values)):Float32Array.from(values),bytes=Buffer.from(array.buffer),padding=Buffer.alloc((4-offset%4)%4);
    chunks.push(padding);offset+=padding.length;
    const bufferView=json.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length})-1;chunks.push(bytes);offset+=bytes.length;
    const a={bufferView,componentType:integer?(wide?5125:5123):5126,count:values.length/width,type:width===1?'SCALAR':`VEC${width}`};
    if(width===3){a.min=[Infinity,Infinity,Infinity];a.max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<values.length;i++) {const k=i%3;a.min[k]=Math.min(a.min[k],values[i]);a.max[k]=Math.max(a.max[k],values[i]);}}
    return json.accessors.push(a)-1;
  };
  const bodyNode=json.nodes.find(n=>n.name==='SuperHero_Male'),body=json.meshes[bodyNode.mesh].primitives[0];
  const positions=read(body.attributes.POSITION),indices=read(body.indices),joints=read(body.attributes.JOINTS_0),weights=read(body.attributes.WEIGHTS_0);
  const vertices=Array.from({length:positions.length/3},(_,i)=>new Vector3().fromArray(positions,i*3));
  const triangles=Array.from({length:indices.length/3},(_,i)=>{const ids=indices.slice(i*3,i*3+3);return {ids,triangle:new Triangle(...ids.map(i=>vertices[i]))};});
  const rig=objects(json),jointPosition=name=>rig.find(n=>n.name===name).getWorldPosition(new Vector3());
  const segment=(a,b)=>new Line3(jointPosition(a),jointPosition(b));
  const torso=[segment('hip','spine_01'),segment('spine_01','spine_02'),segment('spine_02','spine_03'),segment('spine_03','neck')];
  const arms=['l','r'].flatMap(s=>[segment('shoulder_'+s,'upperarm_'+s),segment('upperarm_'+s,'lowerarm_'+s),segment('lowerarm_'+s,'hand_'+s)]);
  const legs=['l','r'].flatMap(s=>[segment('upperleg_'+s,'lowerleg_'+s),segment('lowerleg_'+s,'foot_'+s)]);
  const feet=['l','r'].map(s=>segment('foot_'+s,'toe_'+s));
  const garments=[];
  for(const entry of catalog){
    const {id,source:file,slot}=entry,axes=slot==='top'?[...torso,...arms]:slot==='bottom'?[...torso,...legs]:feet;
    const bytes=fs.readFileSync(path.join(source,'Male-Cloth',file));
    const fbx=new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'');fbx.updateMatrixWorld(true);
    const meshes=[];fbx.traverse(n=>{if(n.isMesh)meshes.push(n);});if(meshes.length!==1)throw new Error(`${file}: expected one clothing mesh`);
    // FBX forward is opposite to the Godot glTF body's forward.
    const mesh=meshes[0];let geometry=mesh.geometry.clone().applyMatrix4(new Matrix4().makeRotationY(entry.rotationY*Math.PI/180).multiply(new Matrix4().makeScale(entry.scale,entry.scale,entry.scale)).multiply(mesh.matrixWorld));
    if(!geometry.attributes.position?.count||!Array.from(geometry.attributes.position.array).every(Number.isFinite))throw new Error(`${file}: geometria vazia ou inválida.`);
    geometry.computeBoundingBox();const bounds=geometry.boundingBox;
    const fits=slot==='top'?bounds.max.y>1.25&&bounds.min.y>.25&&bounds.max.y<1.95:
      slot==='bottom'?bounds.max.y>.65&&bounds.max.y<1.3&&bounds.min.y>-.06:
      slot==='footwear'?bounds.max.y<.35&&bounds.min.y>-.06:
      bounds.min.y>1.35&&bounds.max.y>1.55&&bounds.max.y<2.05;
    if(!fits)throw new Error(`${file}: a geometria não está na região esperada para ${slot}. Verifique a escala, origem e pose do arquivo.`);
    if(!geometry.attributes.normal)geometry.computeVertexNormals();
    // Authored RGB vertex colors identify panels, not literal red/green/blue fabric.
    const color=geometry.attributes.color;
    if(color)for(let i=0;i<color.count;i++){const shade=color.getX(i)*.95+color.getY(i)*.72+color.getZ(i)*.4;color.setXYZ(i,shade,shade,shade);}
    geometry=mergeVertices(geometry,1e-6);
    const position=geometry.attributes.position,skinJoints=[],skinWeights=[],cache=new Map(),closest=new Vector3(),bary=new Vector3();
    let maxDistance=0;
    for(let i=0;i<position.count;i++){
      const point=new Vector3().fromBufferAttribute(position,i),key=point.toArray().map(v=>v.toFixed(6)).join(',');let influence=cache.get(key);
      if(!influence){
        let best=Infinity,nearest;
        for(const entry of triangles){entry.triangle.closestPointToPoint(point,closest);const distance=closest.distanceToSquared(point);if(distance<best){best=distance;nearest=entry;}}
        maxDistance=Math.max(maxDistance,Math.sqrt(best));
        nearest.triangle.closestPointToPoint(point,closest);nearest.triangle.getBarycoord(closest,bary);
        const accumulated=new Map();nearest.ids.forEach((vertex,k)=>{for(let c=0;c<4;c++){const joint=joints[vertex*4+c],weight=weights[vertex*4+c]*Math.max(0,bary.getComponent(k));accumulated.set(joint,(accumulated.get(joint)??0)+weight);}});
        // Face accessories are rigid: the entire frame/lenses follow the head.
        influence=slot==='accessory'?[[json.skins[bodyNode.skin].joints.findIndex(i=>json.nodes[i].name==='head'),1]]:[...accumulated].filter(([,w])=>w>1e-7).sort((a,b)=>b[1]-a[1]).slice(0,4);
        const total=influence.reduce((s,[,w])=>s+w,0);if(!total)throw new Error(`${file}: unweighted vertex`);
        influence=influence.map(([j,w])=>[j,w/total]);while(influence.length<4)influence.push([0,0]);cache.set(key,influence);
      }
      skinJoints.push(...influence.map(([j])=>j));skinWeights.push(...influence.map(([,w])=>w));
    }
    if(maxDistance>entry.maxDistance)throw new Error(`${file}: distância ao corpo ${(maxDistance*100).toFixed(1)} cm; limite ${(entry.maxDistance*100).toFixed(1)} cm. Verifique escala e pose antes de ajustar o limite em tools/assets/roupas/ajustes.json.`);
    const attributes={POSITION:append(Array.from(position.array),3),NORMAL:append(Array.from(geometry.attributes.normal.array),3),JOINTS_0:append(skinJoints,4,true),WEIGHTS_0:append(skinWeights,4)};
    if(geometry.attributes.color)attributes.COLOR_0=append(Array.from(geometry.attributes.color.array),3);
    const sourceMaterials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    const materials=sourceMaterials.map(raw=>{
      const lens=/glass.*lens/i.test(raw.name),metal=/metal/i.test(raw.name);
      return json.materials.push({name:`${lens?'CharacterLens':'CharacterClothing'}-${id}`,doubleSided:true,
        ...(lens?{alphaMode:'BLEND'}:{}),pbrMetallicRoughness:{baseColorFactor:lens?[.68,.83,.86,.22]:[1,1,1,1],metallicFactor:lens?0:entry.metalness??(metal?.8:0),roughnessFactor:lens?.08:entry.roughness??(metal?.3:/leather/i.test(raw.name)?.65:.9)}})-1;
    });
    const garmentIndices=Array.from(geometry.index.array),groups=geometry.groups.length?geometry.groups:[{start:0,count:garmentIndices.length,materialIndex:0}];
    const primitives=groups.map(group=>({attributes,indices:append(garmentIndices.slice(group.start,group.start+group.count),1,true),material:materials[group.materialIndex??0]}));
    const meshIndex=json.meshes.push({name:`Clothing_${id}`,primitives})-1;
    const node=json.nodes.push({name:`part-${id}`,mesh:meshIndex,skin:bodyNode.skin,extras:{source:`Male-Cloth/${file}`,weightTransfer:slot==='accessory'?'rigid-head':'nearest-body-triangle'}})-1;
    json.scenes[0].nodes.push(node);
    const points=Array.from({length:position.count},(_,i)=>new Vector3().fromBufferAttribute(position,i));
    if(entry.coverage)garments.push({id,axes,bounds:new Box3().setFromPoints(points),triangles:Array.from({length:garmentIndices.length/3},(_,i)=>new Triangle(...garmentIndices.slice(i*3,i*3+3).map(j=>points[j])))});
    console.log(`${id}: ${position.count} vertices, transferred weights, maximum surface gap ${(maxDistance*100).toFixed(1)} cm`);
  }
  // Split indices only: shared body vertices/weights remain intact. Hide covered skin per
  // garment to prevent the underlying body poking through when walking, sitting or dancing.
  const origin=new Vector3(),candidate=new Vector3(),direction=new Vector3(),hit=new Vector3(),ray=new Ray();
  const masks=vertices.map(point=>{
    const covered=new Set();
    for(const garment of garments){
      if(point.y>garment.bounds.max.y)continue;
      if(point.y<garment.bounds.min.y||Math.abs(point.x)>Math.max(Math.abs(garment.bounds.min.x),Math.abs(garment.bounds.max.x)))continue;
      let distance=Infinity;
      for(const axis of garment.axes){axis.closestPointToPoint(point,true,candidate);const d=candidate.distanceToSquared(point);if(d<distance){distance=d;origin.copy(candidate);}}
      direction.subVectors(point,origin);const radius=direction.length();if(radius<1e-6)continue;
      ray.set(origin,direction.normalize());
      if(garment.triangles.some(t=>ray.intersectTriangle(t.a,t.b,t.c,false,hit)&&Math.abs(hit.distanceTo(origin)-radius)<.05))covered.add(garment.id);
    }
    return covered;
  });
  const groups=new Map();
  for(let i=0;i<indices.length;i+=3){const ids=indices.slice(i,i+3),mask=[...masks[ids[0]]].filter(id=>masks[ids[1]].has(id)&&masks[ids[2]].has(id)).sort().join('+');if(!groups.has(mask))groups.set(mask,[]);groups.get(mask).push(...ids);}
  for(const [mask,ids] of groups){const primitive={...body,indices:append(ids,1,true)};
    if(!mask){json.meshes[bodyNode.mesh]={primitives:[primitive]};continue;}
    const mesh=json.meshes.push({primitives:[primitive]})-1,node=json.nodes.push({name:`body-coverage-${mask}`,mesh,skin:bodyNode.skin})-1;json.scenes[0].nodes.push(node);
  }
  return Buffer.concat(chunks);
}
