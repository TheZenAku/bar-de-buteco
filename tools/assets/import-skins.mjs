// Preserve each authored AccuRig skeleton, weights and bind matrices; retarget Nathan's base clips.
// usage: node tools/assets/import-skins.mjs [skin...]  (default: every skin below)
import fs from 'node:fs';
import {readGlb,retargetBase,writeGlb} from './lib/character-gltf.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Box3, Group, MeshStandardMaterial, Texture, TextureLoader, Vector3 } from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
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
let meshCount = 0, boneCount = 0;
fbx.traverse(node => {
  if (node.isBone) { boneCount++; node.userData.sourceBone = node.name; node.name = aliases[node.name] ?? node.name; }
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

const exported=Buffer.from(await new GLTFExporter().parseAsync(model,{binary:true,trs:true,onlyVisible:false}));
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
const adapted=retargetBase(readGlb(output),readGlb(path.join(root,'apps/web/public/models/nathan.glb')));
writeGlb(output,adapted.json,adapted.bin);
console.log(`${displayName}: imported ${meshCount} mesh(es), ${boneCount} authored bones, ${(fs.statSync(output).size/1024/1024).toFixed(2)} MiB`);
}
