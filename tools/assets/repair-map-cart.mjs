// Restores the authored skewer cart when Blender exports its interactive root as an empty node.
// The repair is deterministic: it decimates the original FBX, normalizes it to the authored
// 1.75 m height and embeds both geometry and its base-colour texture in the map GLB.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Box3,Vector3} from 'three';
import {FBXLoader} from 'three/examples/jsm/loaders/FBXLoader.js';
import {SimplifyModifier} from 'three/examples/jsm/modifiers/SimplifyModifier.js';
import {mergeVertices} from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// FBXLoader only needs an image placeholder while parsing geometry in Node. The actual texture is
// embedded below from the lossless source PNG.
globalThis.window=globalThis;
globalThis.document={createElementNS(){return {addEventListener(){},removeEventListener(){},set src(value){this.url=value;}};}};

const root=fileURLToPath(new URL('../../',import.meta.url));
const mapPath=path.join(root,'assets-bar/map/BarBoteco/export/bar_boteco.glb');
const assetDir=path.join(root,'assets-bar/objects/carrinho de espeto');
const fbxPath=path.join(assetDir,'carrinhoespeto_texture.fbx');
const texturePath=path.join(assetDir,'carrinhoespeto_texture.png');

function readGlb(file){
  const bytes=fs.readFileSync(file);
  if(bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(8)!==bytes.length)throw new Error(`GLB invalido: ${file}`);
  const jsonLength=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+jsonLength).toString().trimEnd());
  const binHeader=20+jsonLength,binLength=bytes.readUInt32LE(binHeader);
  return {json,bin:Buffer.from(bytes.subarray(binHeader+8,binHeader+8+binLength))};
}
function writeGlb(file,json,bin){
  let jsonBytes=Buffer.from(JSON.stringify(json));
  jsonBytes=Buffer.concat([jsonBytes,Buffer.alloc((4-jsonBytes.length%4)%4,0x20)]);
  const paddedBin=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]);
  const out=Buffer.alloc(12+8+jsonBytes.length+8+paddedBin.length);
  out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);
  out.writeUInt32LE(jsonBytes.length,12);out.writeUInt32LE(0x4e4f534a,16);jsonBytes.copy(out,20);
  const binHeader=20+jsonBytes.length;
  out.writeUInt32LE(paddedBin.length,binHeader);out.writeUInt32LE(0x004e4942,binHeader+4);paddedBin.copy(out,binHeader+8);
  fs.writeFileSync(file,out);
}

const {json,bin:originalBin}=readGlb(mapPath);
const cartNode=json.nodes.find(node=>node.name==='Carrinho_Espeto');
if(!cartNode)throw new Error('No Carrinho_Espeto ausente do mapa');
if(cartNode.mesh!==undefined){console.log('Carrinho_Espeto ja possui malha; nenhuma alteracao necessaria.');process.exit(0);}

const fbx=fs.readFileSync(fbxPath),scene=new FBXLoader().parse(fbx.buffer.slice(fbx.byteOffset,fbx.byteOffset+fbx.byteLength),`${assetDir}/`);
let sourceMesh;
scene.traverse(object=>{if(object.isMesh&&!sourceMesh)sourceMesh=object;});
if(!sourceMesh)throw new Error('O FBX do carrinho nao contem malha');
let geometry=mergeVertices(sourceMesh.geometry,1e-4);
const targetVertices=5200;
if(geometry.attributes.position.count>targetVertices)geometry=new SimplifyModifier().modify(geometry,geometry.attributes.position.count-targetVertices);
geometry.computeVertexNormals();

// FBX is Y-up after Three.js parsing. Put the origin at the centre of the base, matching 09_assets.py.
const box=new Box3().setFromBufferAttribute(geometry.attributes.position),size=box.getSize(new Vector3());
const centre=box.getCenter(new Vector3()),scale=1.75/size.y;
const positions=geometry.attributes.position.array;
for(let i=0;i<positions.length;i+=3){positions[i]=(positions[i]-centre.x)*scale;positions[i+1]=(positions[i+1]-box.min.y)*scale;positions[i+2]=(positions[i+2]-centre.z)*scale;}
// FBX textures use the opposite V origin from glTF textures.
const uvs=geometry.attributes.uv?.array;
if(uvs)for(let i=1;i<uvs.length;i+=2)uvs[i]=1-uvs[i];

const chunks=[];let byteOffset=originalBin.length;
function append(data,target){
  const padding=(4-byteOffset%4)%4;if(padding){chunks.push(Buffer.alloc(padding));byteOffset+=padding;}
  const bytes=Buffer.from(data.buffer??data,data.byteOffset??0,data.byteLength??data.length);
  const view=json.bufferViews.length;json.bufferViews.push({buffer:0,byteOffset,byteLength:bytes.length,...(target?{target}:{})});
  chunks.push(bytes);byteOffset+=bytes.length;return view;
}
function accessor(array,itemSize,type,componentType,target){
  const view=append(array,target),entry={bufferView:view,componentType,count:array.length/itemSize,type};
  if(type==='VEC3'){
    entry.min=[Infinity,Infinity,Infinity];entry.max=[-Infinity,-Infinity,-Infinity];
    for(let i=0;i<array.length;i+=3)for(let c=0;c<3;c++){entry.min[c]=Math.min(entry.min[c],array[i+c]);entry.max[c]=Math.max(entry.max[c],array[i+c]);}
  }
  const index=json.accessors.length;json.accessors.push(entry);return index;
}
json.bufferViews??=[];json.accessors??=[];json.materials??=[];json.meshes??=[];json.images??=[];json.textures??=[];json.samplers??=[];
const position=accessor(new Float32Array(positions),3,'VEC3',5126,34962);
const normal=accessor(new Float32Array(geometry.attributes.normal.array),3,'VEC3',5126,34962);
const uv=accessor(new Float32Array(uvs),2,'VEC2',5126,34962);
const indicesSource=geometry.index.array,indexArray=new Uint16Array(indicesSource);
const indices=accessor(indexArray,1,'SCALAR',5123,34963);
const imageView=append(fs.readFileSync(texturePath));
const image=json.images.push({name:'Carrinho_Espeto_BaseColor',mimeType:'image/png',bufferView:imageView})-1;
const sampler=json.samplers.push({magFilter:9729,minFilter:9987,wrapS:10497,wrapT:10497})-1;
const texture=json.textures.push({sampler,source:image})-1;
const material=json.materials.push({name:'Carrinho_Espeto_Material',pbrMetallicRoughness:{baseColorTexture:{index:texture},metallicFactor:.12,roughnessFactor:.62},doubleSided:true})-1;
const mesh=json.meshes.push({name:'A_carrinhoespeto',primitives:[{attributes:{POSITION:position,NORMAL:normal,TEXCOORD_0:uv},indices,material}]})-1;
cartNode.mesh=mesh;

const bin=Buffer.concat([originalBin,...chunks]);json.buffers[0].byteLength=bin.length;
writeGlb(mapPath,json,bin);
console.log(`Carrinho restaurado: ${indicesSource.length/3} triangulos, 1,75 m de altura, textura embutida.`);
