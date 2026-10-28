// Mixamo skins: every character gets its own Mixamo skeleton, auto-rigged on its body (assets-bar/mixamo/download), and
// becomes apps/web/public/models/<id>.glb with canonical joint names, the mesh simplified to the game budget (texture
// seams kept) and the textures embedded; then the Idle/Walk/Pose base clips are added from Nathan.
// The mesh and its weights come from, in this order:
//  - the download itself, when it is "FBX Binary, With Skin" (Rafael);
//  - rig: the character's previous AccuRig GLB, posed into the Mixamo T-pose; its weights move to the matching bones;
//  - mesh: the unrigged source, with automatic weights (lib/auto-weights.mjs).
// usage: node tools/assets/import-mixamo.mjs [skin...]  (default: every skin)
// Afterwards: node tools/assets/convert-animations.mjs <skin...> for the action bank and the cane.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Box3,BufferAttribute,BufferGeometry,Group,Matrix4,MeshStandardMaterial,Quaternion,Skeleton,SkinnedMesh,Texture,TextureLoader,Vector3} from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {MeshoptSimplifier} from 'meshoptimizer';
import {chromium} from '@playwright/test';
import {objects,readGlb,retargetBase,writeGlb} from './lib/character-gltf.mjs';
import {createRetarget} from './lib/animation-retarget.mjs';
import {autoWeights} from './lib/auto-weights.mjs';
import {mixamoBoneName} from './lib/mixamo-names.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const mixamo=path.join(root,'assets-bar/mixamo'),download=path.join(mixamo,'download'),models=path.join(root,'apps/web/public/models');
// textures: Meshy PNGs (<prefix>.png, _normal, _roughness, _metallic); a rig brings its own embedded images.
// normals: the unrigged source with the same vertices; Mixamo drops normals from its download.
const skins={
  rafael:{name:'Rafael',fbx:'rafael/rafael-mixamo.fbx',normals:'rafael/rafael.fbx',textures:'rafael/rafael_texture',height:1.75},
  'gilmar-gordo':{name:'Gilmar',fbx:'gilmar-gordo/gilmar-gordo-mixamo.fbx',mesh:'gilmar-gordo/gilmar-gordo.fbx',textures:'gilmar-gordo/gilmar-gordo_texture',height:1.8},
  leandro:{name:'Leandro',fbx:'outros/leandro-mixamo.fbx',rig:'accurig/leandro.glb',height:1.86},
  read:{name:'Read',fbx:'outros/read-mixamo.fbx',rig:'accurig/read.glb',height:1.86},
  magrao:{name:'Magrao',fbx:'outros/magrao-mixamo.fbx',rig:'accurig/magrao.glb',height:1.86},
};
// About the heaviest AccuRig skin (Read, 98k); several players share the screen.
const TRIANGLES=100000;
const REQUIRED=['hip','spine_01','spine_02','spine_03','neck','head',...['shoulder','upperarm','lowerarm','hand','upperleg','lowerleg','foot','toe'].flatMap(b=>[`${b}_l`,`${b}_r`])];

const wanted=process.argv.slice(2);
for(const id of wanted)if(!skins[id])throw new Error(`Unknown skin: ${id}`);
TextureLoader.prototype.load=()=>new Texture();
globalThis.window??={URL:{createObjectURL:()=>''}};
globalThis.FileReader??=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(result=>{this.result=result;this.onloadend?.();});}};
await MeshoptSimplifier.ready;
const reference=readGlb(path.join(models,'nathan.glb'));
const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'msedge':undefined)});
try{
  const page=await browser.newPage();
  for(const [id,skin] of Object.entries(skins)){
    if(wanted.length&&!wanted.includes(id))continue;
    const file=path.join(download,skin.fbx);
    if(!fs.existsSync(file))throw new Error(`${id}: assets-bar/mixamo/download/${skin.fbx} not found`);
    const fbx=load(file),skinned=[];
    let bones=0;
    fbx.traverse(node=>{
      if(node.isSkinnedMesh)skinned.push(node);
      if(node.isBone){bones++;node.userData.sourceBone=node.name;node.name=mixamoBoneName(node.name)??node.name;}
    });
    const missing=REQUIRED.filter(name=>!fbx.getObjectByName(name));
    if(missing.length)throw new Error(`${id}: Mixamo skeleton without ${missing.join(', ')}`);
    fbx.updateMatrixWorld(true);
    let meshes,textures,weights;
    if(skinned.length){meshes=fromDownload(id,skin,skinned);weights='mixamo';}
    else if(skin.rig){meshes=fromRig(skin,fbx);weights='accurig';textures=embeddedTextures(path.join(mixamo,skin.rig));}
    else if(skin.mesh){meshes=fromMesh(skin,fbx);weights='automatic';}
    else throw new Error(`${id}: ${skin.fbx} has only the skeleton and no mesh source is configured`);
    textures??=await bakeTextures(page,path.join(download,skin.textures));
    await importSkin(id,skin,fbx,meshes,textures,{bones,weights});
  }
}finally{await browser.close();}

function load(file){const bytes=fs.readFileSync(file);return new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'');}

/** The download's own skinned meshes: restore normals and convert the UVs. */
function fromDownload(id,skin,meshes){
  const normals=skin.normals&&fs.existsSync(path.join(download,skin.normals))?load(path.join(download,skin.normals)):undefined;
  for(const mesh of meshes){
    const geometry=mesh.geometry;
    for(const name of Object.keys(geometry.attributes))if(!['position','uv','skinIndex','skinWeight'].includes(name))geometry.deleteAttribute(name);
    copyNormals(id,geometry,normals);
    // FBX textures use bottom-left UVs; glTF images use top-left UVs.
    const uv=geometry.attributes.uv;for(let i=0;i<uv.count;i++)uv.setY(i,1-uv.getY(i));
  }
  return meshes;
}

function boneList(fbx){const bones=[];fbx.traverse(node=>{if(node.isBone)bones.push(node);});return bones;}
/** Mixamo keeps the units of the mesh it received (centimetres from export-mixamo.mjs, metres from Blender). */
function unitScale(fbx,meshHeight){
  const bones=boneList(fbx),y=name=>bones.find(b=>b.name===name).getWorldPosition(new Vector3()).y;
  return 10**Math.round(Math.log10((y('head_end')-Math.min(y('toe_end_l'),y('toe_end_r')))/meshHeight));
}
function bindMeshes(fbx,geometries){
  const meshes=geometries.map(geometry=>{const mesh=new SkinnedMesh(geometry,new MeshStandardMaterial());fbx.add(mesh);return mesh;});
  fbx.updateMatrixWorld(true);
  const skeleton=new Skeleton(boneList(fbx));
  for(const mesh of meshes)mesh.bind(skeleton,mesh.matrixWorld);
  return meshes;
}

/**
 * The previous AccuRig skin, posed so every limb points like the Mixamo T-pose, is baked and bound to the Mixamo
 * skeleton. Twist and helper bones give their weight to the limb they belong to; the fingers Mixamo lacks (middle,
 * ring, little) to the index; elbow/knee/ball share bones half to each side of the joint. The Mixamo joints are moved
 * to the posed AccuRig joints, the pivots those weights were painted for.
 */
function fromRig(skin,fbx){
  const glb=readGlb(path.join(mixamo,skin.rig)),{json}=glb,nodes=objects(json);
  nodes.forEach((node,i)=>{node.userData.retargetMesh=json.nodes[i].mesh!==undefined;});
  const bones=new Map(boneList(fbx).map(bone=>[bone.name,bone]));
  const rig=createRetarget(nodes,[...bones.values()]);
  const local=rig.pose(new Map([...bones].map(([name,bone])=>[name,bone.getWorldQuaternion(new Quaternion())])));
  nodes.forEach((node,i)=>node.quaternion.copy(local[i]));
  for(const i of json.scenes[json.scene??0].nodes)nodes[i].updateMatrixWorld(true);
  const definition=json.skins[0],inverse=read(glb,definition.inverseBindMatrices);
  const matrices=definition.joints.map((joint,k)=>nodes[joint].matrixWorld.clone().multiply(new Matrix4().fromArray(inverse,k*16)));
  const owner=node=>{
    for(let n=node;n;n=n.parent){
      if(bones.has(n.name))return n.name;
      const finger=/^(?:middle|ring|pinky)_(0[1-3])_([lr])$/.exec(n.name);if(finger)return `index_${finger[1]}_${finger[2]}`;
    }
    return 'hip';
  };
  const canonical=nodes.filter(node=>bones.has(node.name)),at=node=>node.getWorldPosition(new Vector3());
  const targets=definition.joints.map(joint=>{
    const node=nodes[joint];
    if(!/ShareBone$/i.test(node.name))return [[owner(node),1]];
    const nearest=canonical.reduce((a,b)=>at(a).distanceTo(at(node))<=at(b).distanceTo(at(node))?a:b).name;
    const parent=bones.get(nearest).parent;
    return [[nearest,.5],[parent?.isBone?parent.name:nearest,.5]];
  });
  const index=new Map([...bones.keys()].map((name,i)=>[name,i]));
  const baked=[],box=new Box3();
  for(const n of json.nodes){
    if(n.mesh===undefined||n.skin===undefined)continue;
    for(const primitive of json.meshes[n.mesh].primitives){
      const {POSITION,NORMAL,TEXCOORD_0,JOINTS_0,WEIGHTS_0}=primitive.attributes;
      const P=read(glb,POSITION),N=read(glb,NORMAL),J=read(glb,JOINTS_0),W=read(glb,WEIGHTS_0),count=P.length/3;
      const position=new Float32Array(count*3),normal=new Float32Array(count*3),joints=new Uint16Array(count*4),weights=new Float32Array(count*4);
      const m=new Matrix4(),v=new Vector3(),total=new Map();
      for(let i=0;i<count;i++){
        m.elements.fill(0);total.clear();
        for(let k=0;k<4;k++){
          const w=W[i*4+k];if(!w)continue;
          const e=matrices[J[i*4+k]].elements;for(let c=0;c<16;c++)m.elements[c]+=e[c]*w;
          for(const [name,share] of targets[J[i*4+k]])total.set(name,(total.get(name)??0)+w*share);
        }
        v.fromArray(P,i*3).applyMatrix4(m).toArray(position,i*3);box.expandByPoint(v);
        v.fromArray(N,i*3).transformDirection(m).toArray(normal,i*3);
        const top=[...total].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=top.reduce((s,[,w])=>s+w,0);
        top.forEach(([name,w],k)=>{joints[i*4+k]=index.get(name);weights[i*4+k]=w/sum;});
      }
      const geometry=new BufferGeometry();
      geometry.setAttribute('position',new BufferAttribute(position,3));geometry.setAttribute('normal',new BufferAttribute(normal,3));
      geometry.setAttribute('uv',new BufferAttribute(Float32Array.from(read(glb,TEXCOORD_0)),2));
      geometry.setAttribute('skinIndex',new BufferAttribute(joints,4));geometry.setAttribute('skinWeight',new BufferAttribute(weights,4));
      geometry.setIndex(new BufferAttribute(Uint32Array.from(read(glb,primitive.indices)),1));
      baked.push(geometry);
    }
  }
  const unit=unitScale(fbx,box.max.y-box.min.y);
  for(const geometry of baked)geometry.scale(unit,unit,unit);
  // Map order is pre-order: each parent is placed before its children.
  let moved=0;
  for(const bone of bones.values()){
    const node=canonical.find(n=>n.name===bone.name);if(!node)continue;
    const target=at(node).multiplyScalar(unit);moved=Math.max(moved,target.distanceTo(bone.getWorldPosition(new Vector3()))/unit);
    bone.position.copy(bone.parent.worldToLocal(target));bone.updateMatrixWorld(true);
  }
  console.log(`${skin.name}: AccuRig weights on the Mixamo skeleton; joints moved up to ${(moved*100).toFixed(1)} cm to the AccuRig pivots`);
  return bindMeshes(fbx,baked);
}

/** Unrigged source (Meshy FBX, Z-up under a rotated node) with automatic weights on the Mixamo skeleton. */
function fromMesh(skin,fbx){
  const source=load(path.join(download,skin.mesh));source.updateMatrixWorld(true);
  let geometry;source.traverse(node=>{if(node.isMesh&&!geometry)geometry=node.geometry.clone().applyMatrix4(node.matrixWorld);});
  for(const name of Object.keys(geometry.attributes))if(!['position','normal','uv'].includes(name))geometry.deleteAttribute(name);
  const uv=geometry.attributes.uv;for(let i=0;i<uv.count;i++)uv.setY(i,1-uv.getY(i));
  geometry=mergeVertices(geometry,1e-6);geometry.computeBoundingBox();
  const unit=unitScale(fbx,geometry.boundingBox.max.y-geometry.boundingBox.min.y);geometry.scale(unit,unit,unit);
  const bones=boneList(fbx),position=bone=>bone.getWorldPosition(new Vector3());
  const next={hip:'spine_01',spine_03:'neck',hand_l:'index_01_l',hand_r:'index_01_r'};
  const deforming=bones.filter(bone=>!/_end|_04_/.test(bone.name));
  const segments=deforming.map(bone=>{
    const child=bone.children.find(c=>c.isBone&&c.name===next[bone.name])??bone.children.find(c=>c.isBone);
    return {a:position(bone),b:child?position(child):position(bone),side:/_l$/.test(bone.name)?'l':/_r$/.test(bone.name)?'r':'',limb:/^(upperleg|upperarm)_/.test(bone.name)};
  });
  const started=Date.now();
  const {joints,weights}=autoWeights({positions:geometry.attributes.position.array,normals:geometry.attributes.normal.array,indices:geometry.index.array,bones:segments});
  for(let i=0;i<joints.length;i++)joints[i]=bones.indexOf(deforming[joints[i]]);
  geometry.setAttribute('skinIndex',new BufferAttribute(joints,4));geometry.setAttribute('skinWeight',new BufferAttribute(weights,4));
  console.log(`${skin.name}: automatic weights for ${geometry.attributes.position.count} vertices on ${deforming.length} bones in ${((Date.now()-started)/1000).toFixed(0)} s`);
  return bindMeshes(fbx,[geometry]);
}

/** A glTF accessor as plain numbers (normalized integers become floats). */
function read({json,bin},index){
  const sizes={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
  const readers={5120:['getInt8',1,127],5121:['getUint8',1,255],5122:['getInt16',2,32767],5123:['getUint16',2,65535],5125:['getUint32',4,0],5126:['getFloat32',4,0]};
  const a=json.accessors[index],view=json.bufferViews[a.bufferView],size=sizes[a.type];
  const [method,bytes,max]=readers[a.componentType];
  const data=new DataView(bin.buffer,bin.byteOffset+(view.byteOffset??0)+(a.byteOffset??0));
  const stride=view.byteStride??size*bytes,out=new Float64Array(a.count*size);
  for(let i=0;i<a.count;i++)for(let c=0;c<size;c++){const v=data[method](i*stride+c*bytes,true);out[i*size+c]=a.normalized&&max?Math.max(v/max,-1):v;}
  return out;
}

async function importSkin(id,skin,fbx,meshes,textures,{bones,weights}){
  const total=meshes.reduce((sum,mesh)=>sum+triangles(mesh.geometry),0);
  let before=0,after=0,worst=0;
  for(const mesh of meshes){
    // FBX vertices may exceed four influences; the loader keeps the strongest four.
    mesh.normalizeSkinWeights();
    before+=triangles(mesh.geometry);
    const simplified=simplify(mesh.geometry,Math.round(TRIANGLES*triangles(mesh.geometry)/total));
    mesh.geometry=simplified.geometry;after+=triangles(simplified.geometry);worst=Math.max(worst,simplified.error);
    mesh.material=new MeshStandardMaterial({name:skin.name,roughness:1,metalness:textures.metallicRoughness?1:0});
  }
  fbx.name='Mixamo';
  const model=new Group();model.name=skin.name;model.add(fbx);model.updateMatrixWorld(true);
  // Keep the exported instance root at unit scale: PlayCanvas applies its player scale there.
  const size=new Box3().setFromObject(fbx).getSize(new Vector3());
  fbx.scale.multiplyScalar(skin.height/size.y);model.updateMatrixWorld(true);
  fbx.position.y-=new Box3().setFromObject(model).min.y;model.updateMatrixWorld(true);

  const exported=Buffer.from(await new GLTFExporter().parseAsync(model,{binary:true,trs:true,onlyVisible:false}));
  const length=exported.readUInt32LE(12),gltf=JSON.parse(exported.subarray(20,20+length));
  const bin=exported.subarray(28+length,28+length+exported.readUInt32LE(20+length)),chunks=[bin];let offset=bin.length;
  gltf.images=[];gltf.textures=[];gltf.samplers=[{magFilter:9729,minFilter:9987,wrapS:10497,wrapT:10497}];
  const embed=(name,{bytes,mime})=>{
    const padding=(4-offset%4)%4;if(padding){chunks.push(Buffer.alloc(padding));offset+=padding;}
    const view=gltf.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length})-1;chunks.push(bytes);offset+=bytes.length;
    return gltf.textures.push({source:gltf.images.push({bufferView:view,mimeType:mime,name:`${id}-${name}`})-1,sampler:0})-1;
  };
  const color=embed('color',textures.color),normal=embed('normal',textures.normal);
  const metallicRoughness=textures.metallicRoughness&&embed('metallicRoughness',textures.metallicRoughness);
  for(const material of gltf.materials){
    material.pbrMetallicRoughness.baseColorTexture={index:color};material.normalTexture={index:normal};
    if(metallicRoughness!==undefined)material.pbrMetallicRoughness.metallicRoughnessTexture={index:metallicRoughness};
  }
  gltf.asset.generator='B.A.R. Mixamo skin importer';
  gltf.asset.extras={source:`assets-bar/mixamo/download/${skin.fbx}`,height:skin.height,rig:'Mixamo',weights,boneNames:'canonical aliases; sourceBone stored on joints'};
  const output=path.join(models,`${id}.glb`);
  writeGlb(output,gltf,Buffer.concat(chunks));
  const adapted=retargetBase(readGlb(output),reference);
  writeGlb(output,adapted.json,adapted.bin);
  console.log(`${skin.name}: ${before} -> ${after} triangles (error ${worst.toFixed(4)}), ${bones} Mixamo bones, ${weights} weights, ${skin.height} m, ${(fs.statSync(output).size/1024/1024).toFixed(2)} MiB`);
}

function triangles(geometry){return (geometry.index?.count??geometry.attributes.position.count)/3;}

/** Takes the authored normals from the unrigged source when it has the same vertices; otherwise smooth normals. */
function copyNormals(id,geometry,source){
  let candidate;source?.updateMatrixWorld(true);
  // Meshy stores its mesh Z-up under a rotated, scaled node; compare in the same upright frame.
  source?.traverse(node=>{if(node.isMesh&&node.geometry.attributes.normal&&node.geometry.attributes.position.count===geometry.attributes.position.count)candidate=node.geometry.clone().applyMatrix4(node.matrixWorld);});
  if(candidate){
    const a=geometry.attributes.position,b=candidate.attributes.position;
    const height=g=>{g.computeBoundingBox();return g.boundingBox.max.y-g.boundingBox.min.y;};
    const ratio=height(geometry)/height(candidate),tolerance=height(geometry)*1e-4;
    let same=true;
    for(let i=0;i<a.count&&same;i+=Math.max(1,a.count>>10))same=Math.abs(a.getX(i)-b.getX(i)*ratio)<tolerance&&Math.abs(a.getY(i)-b.getY(i)*ratio)<tolerance&&Math.abs(a.getZ(i)-b.getZ(i)*ratio)<tolerance;
    if(same){geometry.setAttribute('normal',candidate.attributes.normal.clone());return;}
  }
  if(source)console.warn(`${id}: the normals source does not match the Mixamo mesh; using smooth normals`);
}

/** Welds identical vertices, then simplifies keeping UV seams and shading; skin attributes follow the vertices. */
function simplify(source,target){
  const geometry=mergeVertices(source,1e-6);
  if(!geometry.attributes.normal)smoothNormals(geometry);
  const {position,normal,uv}=geometry.attributes,count=position.count;
  const attributes=new Float32Array(count*5);
  for(let i=0;i<count;i++)attributes.set([uv.getX(i),uv.getY(i),normal.getX(i),normal.getY(i),normal.getZ(i)],i*5);
  const [indices,error]=MeshoptSimplifier.simplifyWithAttributes(new Uint32Array(geometry.index.array),new Float32Array(position.array),3,attributes,5,[1,1,.5,.5,.5],null,Math.min(target*3,geometry.index.count),.01,[]);
  const [remap,vertices]=MeshoptSimplifier.compactMesh(indices);
  const output=new BufferGeometry();
  for(const [name,attribute] of Object.entries(geometry.attributes)){
    const size=attribute.itemSize,array=new attribute.array.constructor(vertices*size);
    // The remap only spans up to the highest index still used; the vertices after it are gone too.
    for(let i=0;i<remap.length;i++)if(remap[i]!==0xffffffff)array.set(attribute.array.subarray(i*size,i*size+size),remap[i]*size);
    output.setAttribute(name,new BufferAttribute(array,size,attribute.normalized));
  }
  for(let i=0,n=output.attributes.normal;i<n.count;i++){const v=new Vector3().fromBufferAttribute(n,i).normalize();n.setXYZ(i,v.x,v.y,v.z);}
  output.setIndex(new BufferAttribute(indices,1));
  return {geometry:output,error};
}

/** Area-weighted normals shared by every vertex at the same position, so UV seams do not show as hard edges. */
function smoothNormals(geometry){
  const position=geometry.attributes.position,index=geometry.index.array,keys=new Map(),key=new Uint32Array(position.count);
  for(let i=0;i<position.count;i++){
    const k=`${Math.round(position.getX(i)*1e5)},${Math.round(position.getY(i)*1e5)},${Math.round(position.getZ(i)*1e5)}`;
    if(!keys.has(k))keys.set(k,keys.size);key[i]=keys.get(k);
  }
  const sums=new Float32Array(keys.size*3),a=new Vector3(),b=new Vector3(),c=new Vector3();
  for(let f=0;f<index.length;f+=3){
    a.fromBufferAttribute(position,index[f]);b.fromBufferAttribute(position,index[f+1]);c.fromBufferAttribute(position,index[f+2]);
    const n=c.sub(b).cross(a.sub(b));
    for(let j=0;j<3;j++){const s=key[index[f+j]]*3;sums[s]+=n.x;sums[s+1]+=n.y;sums[s+2]+=n.z;}
  }
  const normals=new Float32Array(position.count*3);
  for(let i=0;i<position.count;i++){const v=new Vector3().fromArray(sums,key[i]*3).normalize();normals.set(v.toArray(),i*3);}
  geometry.setAttribute('normal',new BufferAttribute(normals,3));
}

/** The images embedded in a previous skin. */
function embeddedTextures(file){
  const {json,bin}=readGlb(file),material=json.materials[0];
  const image=texture=>{if(!texture)return;const source=json.images[json.textures[texture.index].source],view=json.bufferViews[source.bufferView];
    return {bytes:Buffer.from(bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength)),mime:source.mimeType};};
  const color=image(material.pbrMetallicRoughness?.baseColorTexture),normal=image(material.normalTexture);
  if(!color||!normal)throw new Error(`${file} has no base colour and normal textures to keep`);
  return {color,normal,metallicRoughness:image(material.pbrMetallicRoughness?.metallicRoughnessTexture)};
}

/** Meshy PNGs: base colour and normal as 2048 JPEG; glTF metallic-roughness (G roughness, B metallic) as 512 PNG. */
async function bakeTextures(page,prefix){
  const data=suffix=>`data:image/png;base64,${fs.readFileSync(`${prefix}${suffix}.png`).toString('base64')}`;
  const result=await page.evaluate(async({color,normal,metallic,roughness})=>{
    const load=async src=>{const image=new Image();image.src=src;await image.decode();return image;};
    const draw=(image,size)=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d');ctx.imageSmoothingQuality='high';ctx.drawImage(image,0,0,size,size);return {canvas,ctx};};
    const encode=(canvas,type,quality)=>canvas.toDataURL(type,quality).split(',')[1];
    const base=draw(await load(color),2048),bump=draw(await load(normal),2048);
    const metal=draw(await load(metallic),512),rough=draw(await load(roughness),512),packed=draw(await load(roughness),512);
    const m=metal.ctx.getImageData(0,0,512,512).data,r=rough.ctx.getImageData(0,0,512,512).data,pixels=packed.ctx.getImageData(0,0,512,512);
    for(let i=0;i<pixels.data.length;i+=4){pixels.data[i]=0;pixels.data[i+1]=r[i];pixels.data[i+2]=m[i];pixels.data[i+3]=255;}
    packed.ctx.putImageData(pixels,0,0);
    return {color:encode(base.canvas,'image/jpeg',.9),normal:encode(bump.canvas,'image/jpeg',.92),metallicRoughness:encode(packed.canvas,'image/png')};
  },{color:data(''),normal:data('_normal'),metallic:data('_metallic'),roughness:data('_roughness')});
  return {color:{bytes:Buffer.from(result.color,'base64'),mime:'image/jpeg'},normal:{bytes:Buffer.from(result.normal,'base64'),mime:'image/jpeg'},
    metallicRoughness:{bytes:Buffer.from(result.metallicRoughness,'base64'),mime:'image/png'}};
}
