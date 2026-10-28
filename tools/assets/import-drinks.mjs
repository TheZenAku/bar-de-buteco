// Imports what the bar serves (drinks and food, assets-bar/objects) into props held in a hand, carried on
// Tonico's tray and left on the tables: real-world size, origin at the centre of the base (+Y up, the mouth
// at the top, the label towards +Z), simplified mesh that keeps texture seams, PBR textures resized and
// embedded. Offline only: npm run assets:drinks.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Box3,Texture,TextureLoader,Vector3} from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {mergeVertices,toCreasedNormals} from 'three/addons/utils/BufferGeometryUtils.js';
import {MeshoptSimplifier} from 'meshoptimizer';
import {chromium} from '@playwright/test';

const root=fileURLToPath(new URL('../../',import.meta.url));
const output=path.join(root,'apps/web/public/props');
// Sizes of the real objects: `height` sets the height, `length` the longest side seen from above. A 355 ml long
// neck, a 190 ml copo americano, a 500 ml water bottle, a 500 ml fountain cup (straw included), a 300 ml
// coffee cup with its lid, a bar coxinha, a pastel and a plate of torresmo. The pastel is modelled standing on
// its edge and is laid flat (`flat`: the side facing +Z ends up on top).
const props=[
  {id:'garrafa',name:'Garrafa de cerveja',folder:'assets-bar/objects/garrafa de cerveja',prefix:'garrafa_texture',height:.23,triangles:3000},
  {id:'copo',name:'Copo americano',folder:'assets-bar/objects/copo americano',prefix:'copo_texture',height:.093,triangles:2400},
  {id:'agua',name:'Garrafa de água',folder:'assets-bar/objects/Garrafa de Agua',prefix:'agua_texture',height:.205,triangles:2400},
  {id:'refrigerante',name:'Copo de refrigerante',folder:'assets-bar/objects/highcola',prefix:'highcola_texture',height:.19,triangles:2400},
  {id:'cafe',name:'Copo de café',folder:'assets-bar/objects/Cafe',prefix:'cafe_texture',height:.12,triangles:2000},
  {id:'coxinha',name:'Coxinha',folder:'assets-bar/objects/Coxinha',prefix:'coxinha_texture',height:.08,triangles:1500},
  {id:'pastel',name:'Pastel',folder:'assets-bar/objects/Pastel',prefix:'pastel_texture',length:.15,flat:true,triangles:1500},
  {id:'torresmo',name:'Porção de torresmo',folder:'assets-bar/objects/Porção de Torresmo',prefix:'torresmo_texture',length:.23,triangles:3000},
];
const only=process.argv.slice(2);
// The FBX embeds its images; their copies beside it are used instead (no browser image API here).
TextureLoader.prototype.load=()=>new Texture();
globalThis.window??={URL:{createObjectURL:()=>''}};
await MeshoptSimplifier.ready;
fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'msedge':undefined)});
try{
  const page=await browser.newPage();
  for(const prop of props)if(!only.length||only.includes(prop.id))await importProp(prop,page);
}finally{await browser.close();}

async function importProp(prop,page){
  const folder=path.join(root,prop.folder),file=path.join(folder,`${prop.prefix}.fbx`);
  const bytes=fs.readFileSync(file);
  const fbx=new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'');
  const meshes=[];fbx.updateMatrixWorld(true);fbx.traverse(node=>{if(node.isMesh)meshes.push(node);});
  if(meshes.length!==1)throw new Error(`${prop.id}: expected one mesh, found ${meshes.length}`);
  let geometry=meshes[0].geometry.clone().applyMatrix4(meshes[0].matrixWorld);
  for(const name of Object.keys(geometry.attributes))if(!['position','normal','uv'].includes(name))geometry.deleteAttribute(name);
  // Some exports split the normals at every face: no vertex could be merged, nor the mesh simplified. Those get
  // creased normals instead (smooth, with edges sharper than 60° kept hard).
  const withoutNormals=geometry.clone();withoutNormals.deleteAttribute('normal');
  const merged=mergeVertices(geometry.clone(),1e-5);
  geometry=merged.attributes.position.count>1.5*mergeVertices(withoutNormals,1e-5).attributes.position.count?mergeVertices(toCreasedNormals(geometry,Math.PI/3),1e-5):merged;
  if(prop.flat)geometry.rotateX(-Math.PI/2);
  // Real size, base centred on the origin.
  const box=new Box3().setFromBufferAttribute(geometry.attributes.position),size=box.getSize(new Vector3());
  const scale=prop.height?prop.height/size.y:prop.length/Math.max(size.x,size.z),centre=box.getCenter(new Vector3());
  geometry.translate(-centre.x,-box.min.y,-centre.z);geometry.scale(scale,scale,scale);
  const height=size.y*scale;
  // FBX textures use bottom-left UVs; glTF images use top-left UVs.
  const uv=geometry.attributes.uv;for(let i=0;i<uv.count;i++)uv.setY(i,1-uv.getY(i));
  // Simplify, keeping UV seams and shading (normals) as attributes.
  const positions=geometry.attributes.position.array,count=geometry.attributes.position.count;
  const attributes=new Float32Array(count*5);
  for(let i=0;i<count;i++){attributes.set([uv.getX(i),uv.getY(i)],i*5);attributes.set([geometry.attributes.normal.getX(i),geometry.attributes.normal.getY(i),geometry.attributes.normal.getZ(i)],i*5+2);}
  const sourceIndices=new Uint32Array(geometry.index.array);
  const simplify=flags=>MeshoptSimplifier.simplifyWithAttributes(sourceIndices,new Float32Array(positions),3,attributes,5,[1,1,.5,.5,.5],null,prop.triangles*3,.02,flags);
  // Jagged food (many hard edges) only reaches the budget when edges may collapse across those seams.
  let [simplified,error]=simplify([]);
  if(simplified.length>prop.triangles*3*1.05)[simplified,error]=simplify(['Permissive']);
  const [remap,vertices]=MeshoptSimplifier.compactMesh(simplified);
  const out={position:new Float32Array(vertices*3),normal:new Float32Array(vertices*3),uv:new Float32Array(vertices*2)};
  for(let i=0;i<count;i++){const j=remap[i];if(j===0xffffffff)continue;
    out.position.set([positions[i*3],positions[i*3+1],positions[i*3+2]],j*3);
    const n=new Vector3(geometry.attributes.normal.getX(i),geometry.attributes.normal.getY(i),geometry.attributes.normal.getZ(i)).normalize();
    out.normal.set(n.toArray(),j*3);out.uv.set([uv.getX(i),uv.getY(i)],j*2);}
  const radius=Math.max(...Array.from({length:vertices},(_,i)=>Math.hypot(out.position[i*3],out.position[i*3+2])));
  const textures=await bakeTextures(page,folder,prop.prefix);
  writeProp(path.join(output,`${prop.id}.glb`),prop,out,simplified,textures,{height:+height.toFixed(4),radius:+radius.toFixed(4)});
  console.log(`${prop.name}: ${count} → ${vertices} vertices, ${simplified.length/3} triangles (error ${error.toFixed(4)}), ${height.toFixed(3)} m tall, radius ${radius.toFixed(3)} m, ${(fs.statSync(path.join(output,`${prop.id}.glb`)).size/1024).toFixed(0)} KiB`);
}

/** Base colour (JPEG 512), normal (JPEG 512) and glTF metallic-roughness (G roughness, B metallic). */
async function bakeTextures(page,folder,prefix){
  const data=name=>`data:image/png;base64,${fs.readFileSync(path.join(folder,`${prefix}${name}.png`)).toString('base64')}`;
  const result=await page.evaluate(async({color,normal,metallic,roughness})=>{
    const load=async src=>{const image=new Image();image.src=src;await image.decode();return image;};
    const draw=(image,size)=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d');ctx.imageSmoothingQuality='high';ctx.drawImage(image,0,0,size,size);return {canvas,ctx};};
    const encode=(canvas,type,quality)=>canvas.toDataURL(type,quality).split(',')[1];
    const base=draw(await load(color),512),bump=draw(await load(normal),512);
    const metal=draw(await load(metallic),256),rough=draw(await load(roughness),256),packed=draw(await load(roughness),256);
    const m=metal.ctx.getImageData(0,0,256,256).data,r=rough.ctx.getImageData(0,0,256,256).data,pixels=packed.ctx.getImageData(0,0,256,256);
    for(let i=0;i<pixels.data.length;i+=4){pixels.data[i]=0;pixels.data[i+1]=r[i];pixels.data[i+2]=m[i];pixels.data[i+3]=255;}
    packed.ctx.putImageData(pixels,0,0);
    return {color:encode(base.canvas,'image/jpeg',.9),normal:encode(bump.canvas,'image/jpeg',.92),metallicRoughness:encode(packed.canvas,'image/png')};
  },{color:data(''),normal:data('_normal'),metallic:data('_metallic'),roughness:data('_roughness')});
  return {color:{bytes:Buffer.from(result.color,'base64'),mime:'image/jpeg'},normal:{bytes:Buffer.from(result.normal,'base64'),mime:'image/jpeg'},metallicRoughness:{bytes:Buffer.from(result.metallicRoughness,'base64'),mime:'image/png'}};
}

function writeProp(file,prop,mesh,indices,textures,extras){
  const chunks=[],views=[];let offset=0;
  const view=(bytes,target)=>{const padding=(4-offset%4)%4;if(padding){chunks.push(Buffer.alloc(padding));offset+=padding;}chunks.push(bytes);views.push({buffer:0,byteOffset:offset,byteLength:bytes.length,...(target?{target}:{})});offset+=bytes.length;return views.length-1;};
  const small=mesh.position.length/3<65536,indexBytes=small?Buffer.from(Uint16Array.from(indices).buffer):Buffer.from(indices.buffer,indices.byteOffset,indices.byteLength);
  const min=[0,1,2].map(a=>Math.min(...mesh.position.filter((_,i)=>i%3===a))),max=[0,1,2].map(a=>Math.max(...mesh.position.filter((_,i)=>i%3===a)));
  const vertices=mesh.position.length/3;
  const accessors=[
    {bufferView:view(Buffer.from(mesh.position.buffer),34962),componentType:5126,count:vertices,type:'VEC3',min,max},
    {bufferView:view(Buffer.from(mesh.normal.buffer),34962),componentType:5126,count:vertices,type:'VEC3'},
    {bufferView:view(Buffer.from(mesh.uv.buffer),34962),componentType:5126,count:vertices,type:'VEC2'},
    {bufferView:view(indexBytes,34963),componentType:small?5123:5125,count:indices.length,type:'SCALAR'},
  ];
  const images=['color','normal','metallicRoughness'].map(name=>({bufferView:view(textures[name].bytes),mimeType:textures[name].mime,name:`${prop.id}-${name}`}));
  const json={asset:{version:'2.0',generator:'B.A.R. drink prop importer',extras:{source:prop.folder}},scene:0,scenes:[{nodes:[0]}],
    nodes:[{name:prop.name,mesh:0,extras}],meshes:[{name:prop.name,primitives:[{attributes:{POSITION:0,NORMAL:1,TEXCOORD_0:2},indices:3,material:0}]}],
    materials:[{name:prop.name,pbrMetallicRoughness:{baseColorTexture:{index:0},metallicRoughnessTexture:{index:2},metallicFactor:1,roughnessFactor:1},normalTexture:{index:1}}],
    samplers:[{magFilter:9729,minFilter:9987,wrapS:33071,wrapT:33071}],images,textures:images.map((_,source)=>({source,sampler:0})),accessors,bufferViews:views,buffers:[{byteLength:offset}]};
  const bin=Buffer.concat(chunks),binary=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]);
  const text=Buffer.from(JSON.stringify(json)),header=Buffer.concat([text,Buffer.alloc((4-text.length%4)%4,0x20)]);
  const glb=Buffer.alloc(12);glb.writeUInt32LE(0x46546c67);glb.writeUInt32LE(2,4);glb.writeUInt32LE(12+8+header.length+8+binary.length,8);
  const jsonChunk=Buffer.alloc(8);jsonChunk.writeUInt32LE(header.length);jsonChunk.writeUInt32LE(0x4e4f534a,4);
  const binChunk=Buffer.alloc(8);binChunk.writeUInt32LE(binary.length);binChunk.writeUInt32LE(0x004e4942,4);
  json.buffers[0].byteLength=bin.length;
  const finalText=Buffer.from(JSON.stringify(json)),finalHeader=Buffer.concat([finalText,Buffer.alloc((4-finalText.length%4)%4,0x20)]);
  jsonChunk.writeUInt32LE(finalHeader.length);glb.writeUInt32LE(12+8+finalHeader.length+8+binary.length,8);
  fs.writeFileSync(file,Buffer.concat([glb,jsonChunk,finalHeader,binChunk,binary]));
}
