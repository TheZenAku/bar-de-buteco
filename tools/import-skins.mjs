// Preserve each authored AccuRig skeleton, weights and bind matrices; retarget Nathan's base clips.
// usage: node tools/import-skins.mjs [skin...]  (default: every skin below)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AnimationClip, AnimationMixer, Box3, Group, MeshStandardMaterial, Object3D, Quaternion,
  QuaternionKeyframeTrack, Texture, TextureLoader, Vector3, VectorKeyframeTrack } from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const root = fileURLToPath(new URL('../', import.meta.url));
// AccuRig exports keep their textures in the folder the FBX references (`<name>.fbm`).
const skins = {
  leandro: { name: 'Leandro', fbx: 'Meshy_AI_Green_Screen_T_Pose_Man_20261021_texture.fbx', textures: '.' },
  read: { name: 'Read', fbx: 'read.fbx', textures: 'read.fbm' },
  magrao: { name: 'Magrao', fbx: 'magrao.fbx', textures: 'magrao.fbm' },
};
const wanted = process.argv.slice(2);
for (const id of wanted) if (!skins[id]) throw new Error(`Unknown skin: ${id}`);
TextureLoader.prototype.load = () => new Texture();
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.(); }); }
};
for (const [id, skin] of Object.entries(skins)) if (!wanted.length || wanted.includes(id)) await importSkin(id, skin);

async function importSkin(id, { name: displayName, fbx: fbxFile, textures }) {
const sourceDir = path.join(root, 'assets-bar', id);
const output = path.join(root, `apps/web/public/models/${id}.glb`);
const bytes = fs.readFileSync(path.join(sourceDir, fbxFile));
const fbx = new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), '');
fbx.name = 'AccuRig';
const aliases = { RL_BoneRoot: 'root', CC_Base_Hip: 'hip', CC_Base_Waist: 'spine_01',
  CC_Base_Spine01: 'spine_02', CC_Base_Spine02: 'spine_03', CC_Base_NeckTwist01: 'neck', CC_Base_Head: 'head' };
for (const [side, suffix] of [['L','l'], ['R','r']]) {
  for (const [from, to] of Object.entries({ Clavicle:'shoulder', Upperarm:'upperarm', Forearm:'lowerarm', Hand:'hand',
    Thigh:'upperleg', Calf:'lowerleg', Foot:'foot', ToeBase:'toe' })) aliases[`CC_Base_${side}_${from}`] = `${to}_${suffix}`;
  for (const [from,to] of [['Thumb','thumb'],['Index','index'],['Mid','middle'],['Ring','ring'],['Pinky','pinky']]) {
    for (let i=1;i<=3;i++) aliases[`CC_Base_${side}_${from}${i}`] = `${to}_0${i}_${suffix}`;
  }
}
let meshCount = 0;
fbx.traverse(node => {
  if (node.isBone) { node.userData.sourceBone = node.name; node.name = aliases[node.name] ?? node.name; }
  if (!node.isMesh) return;
  if (!node.isSkinnedMesh) throw new Error(`Unskinned mesh in new character: ${node.name}`);
  meshCount++;
  // The FBX exceeds four influences on some vertices. The loader keeps the strongest four.
  node.normalizeSkinWeights();
  node.geometry = mergeVertices(node.geometry, 1e-6);
  // FBX textures use bottom-left UVs; glTF images use top-left UVs.
  const uv = node.geometry.attributes.uv;
  for (let i=0;i<uv.count;i++) uv.setY(i, 1-uv.getY(i));
  node.material = new MeshStandardMaterial({ name:displayName, roughness:1, metalness:0 });
});
if (!meshCount) throw new Error('No weighted character geometry found');
const model = new Group(); model.name = displayName; model.add(fbx);
const authoredBounds = new Box3().setFromObject(fbx);
const scale = 1.86 / authoredBounds.getSize(new Vector3()).z;
// Keep the exported instance root at unit scale: PlayCanvas applies its player scale there.
fbx.scale.setScalar(scale); fbx.rotation.x = -Math.PI/2;
model.updateMatrixWorld(true);
const floor = new Box3().setFromObject(model).min.y;
fbx.position.y -= floor; model.updateMatrixWorld(true);

const refBytes = fs.readFileSync(path.join(root,'apps/web/public/models/nathan.glb'));
const jsonLength = refBytes.readUInt32LE(12);
const ref = JSON.parse(refBytes.subarray(20,20+jsonLength));
const bin = refBytes.subarray(28+jsonLength);
const sourceNodes = ref.nodes.map(n => {
  const node = new Object3D(); node.name=n.name;
  node.position.fromArray(n.translation??[0,0,0]); node.quaternion.fromArray(n.rotation??[0,0,0,1]);
  node.scale.fromArray(n.scale??[1,1,1]); return node;
});
ref.nodes.forEach((n,i) => n.children?.forEach(child => sourceNodes[i].add(sourceNodes[child])));
sourceNodes[0].updateMatrixWorld(true);
const sourceByName = new Map(sourceNodes.map(n => [n.name,n]));
const sourceBind = new Map(sourceNodes.map(n => [n.name,n.getWorldQuaternion(new Quaternion())]));
const targetNodes=[]; model.traverse(n=>targetNodes.push(n));
const targetBind = new Map(targetNodes.map(n=>[n,n.getWorldQuaternion(new Quaternion())]));
const hip = model.getObjectByName('hip');
const baseHip = hip.getWorldPosition(new Vector3());
const heightRatio = baseHip.y / .956;
function values(index) {
  const a=ref.accessors[index], v=ref.bufferViews[a.bufferView];
  const size=a.type==='VEC4'?4:a.type==='VEC3'?3:1;
  const start=(v.byteOffset??0)+(a.byteOffset??0);
  return Float32Array.from({length:a.count*size},(_,i)=>bin.readFloatLE(start+i*4));
}
const animations=[];
for (const name of ['Idle','Walk','Pose']) {
  const raw=ref.animations.find(a=>a.name===name);
  if(!raw) throw new Error(`Missing reference clip: ${name}`);
  const tracks=raw.channels.map(ch=>{
    const sampler=raw.samplers[ch.sampler], node=sourceNodes[ch.target.node];
    const type=ch.target.path==='rotation'?QuaternionKeyframeTrack:VectorKeyframeTrack;
    return new type(`${node.name}.${ch.target.path==='rotation'?'quaternion':ch.target.path==='translation'?'position':'scale'}`,values(sampler.input),values(sampler.output));
  });
  const clip=new AnimationClip(name,-1,tracks), mixer=new AnimationMixer(sourceNodes[0]);
  mixer.clipAction(clip).play();
  const times=clip.duration>0?Array.from({length:Math.ceil(clip.duration*30)+1},(_,i)=>Math.min(i/30,clip.duration)):[0];
  const rotations=new Map(targetNodes.filter(n=>n.isBone).map(n=>[n,[]]));
  const translations=[];
  for(const time of times){
    mixer.setTime(Math.min(time,Math.max(0,clip.duration-1e-6)));sourceNodes[0].updateMatrixWorld(true);
    const desired=new Map();
    for(const node of targetNodes){
      const source=sourceByName.get(node.name);
      const parent=desired.get(node.parent)??new Quaternion();
      let local=node.quaternion.clone();
      if(node.isBone&&source&&node.name!=='root'){
        const world=source.getWorldQuaternion(new Quaternion()).multiply(sourceBind.get(node.name).clone().invert()).multiply(targetBind.get(node));
        local=parent.clone().invert().multiply(world).normalize();
      }
      desired.set(node,parent.clone().multiply(local));
      rotations.get(node)?.push(...local.toArray());
    }
    const sourceHip=sourceByName.get('hip').getWorldPosition(new Vector3());
    const position=baseHip.clone();position.y+=(sourceHip.y-.956)*heightRatio;
    translations.push(...hip.parent.worldToLocal(position).toArray());
  }
  const result=[];
  for(const [node,data] of rotations) result.push(new QuaternionKeyframeTrack(`${node.name}.quaternion`,times,data));
  result.push(new VectorKeyframeTrack('hip.position',times,translations));
  animations.push(new AnimationClip(name,clip.duration,result));
  mixer.stopAllAction();mixer.uncacheRoot(sourceNodes[0]);
  // Restore the source bind pose before the next clip (some clips omit channels).
  sourceNodes.forEach((node,i)=>{node.position.fromArray(ref.nodes[i].translation??[0,0,0]);node.quaternion.fromArray(ref.nodes[i].rotation??[0,0,0,1]);});
  console.log(`${displayName}: ${name}, ${times.length} frames`);
}
const exported=Buffer.from(await new GLTFExporter().parseAsync(model,{binary:true,animations,onlyVisible:false}));
const length=exported.readUInt32LE(12), gltf=JSON.parse(exported.subarray(20,20+length));
const chunks=[exported.subarray(28+length)]; let offset=chunks[0].length;
gltf.images=[];gltf.textures=[];gltf.samplers=[{magFilter:9729,minFilter:9987,wrapS:10497,wrapT:10497}];
for(const [filename,kind] of [['Material_001_Diffuse.jpg','baseColorTexture'],['Material_001_Normal.jpg','normalTexture']]){
  const image=fs.readFileSync(path.join(sourceDir,textures,filename));
  const view=gltf.bufferViews.push({buffer:0,byteOffset:offset,byteLength:image.length})-1;
  const padding=Buffer.alloc((4-image.length%4)%4);chunks.push(image,padding);offset+=image.length+padding.length;
  const index=gltf.images.push({bufferView:view,mimeType:'image/jpeg',name:filename})-1;
  gltf.textures.push({source:index,sampler:0});
  for(const material of gltf.materials){
    if(kind==='baseColorTexture') material.pbrMetallicRoughness.baseColorTexture={index};
    else material.normalTexture={index};
  }
}
gltf.asset.generator='B.A.R. AccuRig skin importer';
gltf.asset.extras={source:`assets-bar/${id}`,height:1.86,rig:'AccuRig',boneNames:'canonical aliases; sourceBone stored on joints'};
gltf.buffers[0].byteLength=offset;
const raw=Buffer.from(JSON.stringify(gltf)), headerJson=Buffer.concat([raw,Buffer.alloc((4-raw.length%4)%4,0x20)]), data=Buffer.concat(chunks);
const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+headerJson.length+data.length,8);header.writeUInt32LE(headerJson.length,12);header.writeUInt32LE(0x4e4f534a,16);
const binaryHeader=Buffer.alloc(8);binaryHeader.writeUInt32LE(data.length);binaryHeader.writeUInt32LE(0x004e4942,4);
fs.writeFileSync(output,Buffer.concat([header,headerJson,binaryHeader,data]));
console.log(`${displayName}: imported ${meshCount} mesh(es), ${targetNodes.filter(n=>n.isBone).length} authored bones, ${(fs.statSync(output).size/1024/1024).toFixed(2)} MiB`);
}
