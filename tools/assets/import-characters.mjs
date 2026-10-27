// Quaternius Standard -> self-contained geometry/rigs, shared local textures and attached hairstyles.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {Matrix4,Quaternion,Vector3} from 'three';
import {chromium} from '@playwright/test';
import {objects,readGlb,retargetBase,topological,writeGlb} from './lib/character-gltf.mjs';
import {importMaleClothing} from './lib/character-clothing.mjs';
import {discoverClothing} from './roupas/catalogo.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),source=path.join(root,'assets-bar/Universal Base Characters[Standard]');
const catalog=discoverClothing(root);
const output=process.env.BAR_CHARACTER_OUTPUT??path.join(root,'apps/web/public/characters');fs.mkdirSync(output,{recursive:true});
const textures=path.join(output,'textures');fs.mkdirSync(textures,{recursive:true});
const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'msedge':undefined)});
const page=await browser.newPage();
try{
  // Neutral color maps let per-character material colors preserve the source texture's painted detail.
  for(const [input,name,kind] of [
    ['Base Characters/Textures/T_Superhero_Male_Ligh.png','body-male','body'],['Base Characters/Textures/T_Superhero_Female_Light_BaseColor.png','body-female','body'],
    ['Base Characters/Textures/T_Eye_Brown.png','eyes','eyes'],['Hairstyles/Textures/T_Hair_1_BaseColor.png','hair-1','hair'],['Hairstyles/Textures/T_Hair_2_BaseColor.png','hair-2','hair'],
    ['Base Characters/Textures/Normals Unity - Godot/T_Superhero_Male_Normal.png','normal-male','normal'],['Base Characters/Textures/Normals Unity - Godot/T_Superhero_Female_Normal.png','normal-female','normal'],
    ['Base Characters/Textures/Normals Unity - Godot/T_Eye_Normal.png','normal-eyes','normal'],['Hairstyles/Textures/Normals Unity - Godot/T_Hair_1_Normal.png','normal-hair-1','normal'],['Hairstyles/Textures/Normals Unity - Godot/T_Hair_2_Normal.png','normal-hair-2','normal'],
  ]){
    const src=`data:image/png;base64,${fs.readFileSync(path.join(source,input)).toString('base64')}`;
    const encoded=await page.evaluate(async({src,kind})=>{const img=new Image();img.src=src;await img.decode();const size=kind==='body'||kind==='normal'?1024:512;const canvas=document.createElement('canvas');const factor=Math.min(1,size/Math.max(img.width,img.height));canvas.width=Math.round(img.width*factor);canvas.height=Math.round(img.height*factor);const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,canvas.width,canvas.height);
      if(kind!=='normal'){const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);for(let i=0;i<pixels.data.length;i+=4){const r=pixels.data[i],g=pixels.data[i+1],b=pixels.data[i+2],v=.2126*r+.7152*g+.0722*b;let grey=v;
        if(kind==='hair')grey=150+v*.4;else if(kind==='body'){const cloth=Math.max(r,g,b)-Math.min(r,g,b)<15;pixels.data[i+3]=cloth?0:255;grey=cloth?180+v*.2:Math.min(255,v*1.23);}else if(kind==='eyes')grey=v>170?v:Math.min(150,v*1.6);
        pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=grey;}ctx.putImageData(pixels,0,0);}return canvas.toDataURL('image/png').split(',')[1];},{src,kind});
    fs.writeFileSync(path.join(textures,`${name}.png`),Buffer.from(encoded,'base64'));
  }
}finally{await browser.close();}
fs.copyFileSync(path.join(source,'License_Standard.txt'),path.join(output,'LICENSE.txt'));
const bases=new Map();
for(const body of ['male','female']){
  const directory=path.join(source,'Base Characters/Godot - UE');
  const json=JSON.parse(fs.readFileSync(path.join(directory,`Superhero_${body==='male'?'Male':'Female'}_FullBody.gltf`)));
  const bin=fs.readFileSync(path.join(directory,json.buffers[0].uri));
  const aliases={Head:'head',pelvis:'hip',neck_01:'neck',clavicle_l:'shoulder_l',clavicle_r:'shoulder_r',thigh_l:'upperleg_l',thigh_r:'upperleg_r',calf_l:'lowerleg_l',calf_r:'lowerleg_r',ball_l:'toe_l',ball_r:'toe_r'};
  json.nodes.forEach(n=>{n.extras={...n.extras,sourceBone:n.name};n.name=aliases[n.name]??n.name;if(n.mesh===0)delete n.mesh;});
  const nodes=objects(json),head=nodes.find(n=>n.name==='head'),headWorld=head.matrixWorld.clone();
  bases.set(body,{json,bin,headWorld});
}
for(const body of ['male','female']){
  const {json,bin,headWorld}=bases.get(body),chunks=[bin];let offset=bin.length;
  json.images=[];json.textures=[];json.samplers=[{magFilter:9729,minFilter:9987,wrapS:10497,wrapT:10497}];
  const imageMap=new Map();const texture=name=>{if(imageMap.has(name))return imageMap.get(name);const index=json.images.push({uri:`textures/${name}.png`})-1;json.textures.push({source:index,sampler:0});imageMap.set(name,index);return index;};
  json.materials=[{name:'CharacterHair',doubleSided:true,pbrMetallicRoughness:{baseColorTexture:{index:texture('hair-1')},metallicFactor:0,roughnessFactor:.8},normalTexture:{index:texture('normal-hair-1')}},
    {name:'CharacterEyes',pbrMetallicRoughness:{baseColorTexture:{index:texture('eyes')},metallicFactor:0,roughnessFactor:.35},normalTexture:{index:texture('normal-eyes')}},
    {name:'CharacterSkin',pbrMetallicRoughness:{baseColorTexture:{index:texture(`body-${body}`)},metallicFactor:0,roughnessFactor:.8},normalTexture:{index:texture(`normal-${body}`)}}];
  const headIndex=json.nodes.findIndex(n=>n.name==='head');
  const parts=[['buzzed','Hair_Buzzed'],['buzzed-female','Hair_BuzzedFemale'],['simple-parted','Hair_SimpleParted'],['long','Hair_Long'],['buns','Hair_Buns'],['beard','Hair_Beard'],['brows-regular','Eyebrows_Regular'],['brows-female','Eyebrows_Female']];
  for(const [id,file] of parts){
    const dir=path.join(source,'Hairstyles/Origin at 0/glTF (Godot)'),hair=JSON.parse(fs.readFileSync(path.join(dir,`${file}.gltf`))),data=fs.readFileSync(path.join(dir,hair.buffers[0].uri));
    const padding=Buffer.alloc((4-offset%4)%4);chunks.push(padding);offset+=padding.length;const start=offset;chunks.push(data);offset+=data.length;
    const viewOffset=json.bufferViews.length,accessorOffset=json.accessors.length;
    for(const v of hair.bufferViews)json.bufferViews.push({...v,buffer:0,byteOffset:start+(v.byteOffset??0)});
    for(const a of hair.accessors)json.accessors.push({...a,bufferView:viewOffset+a.bufferView});
    const m=hair.materials[0],set=m.pbrMetallicRoughness.baseColorTexture.index,index=hair.textures[set].source;
    const family=hair.images[index].uri.includes('_2_')?'2':'1';
    const material=json.materials.push({name:'CharacterHair',doubleSided:true,pbrMetallicRoughness:{baseColorTexture:{index:texture(`hair-${family}`)},metallicFactor:0,roughnessFactor:.8},normalTexture:{index:texture(`normal-hair-${family}`)}})-1;
    const mesh=json.meshes.push({...hair.meshes[0],primitives:hair.meshes[0].primitives.map(p=>({...p,attributes:Object.fromEntries(Object.entries(p.attributes).map(([k,v])=>[k,v+accessorOffset])),indices:p.indices+accessorOffset,material}))})-1;
    const raw=hair.nodes[0],matrix=new Matrix4().compose(new Vector3().fromArray(raw.translation??[0,0,0]),new Quaternion().fromArray(raw.rotation??[0,0,0,1]),new Vector3().fromArray(raw.scale??[1,1,1]));
    const reference=bases.get(['buzzed-female','buns','long','brows-female'].includes(id)?'female':'male').headWorld;
    const delta=new Vector3().setFromMatrixPosition(headWorld).sub(new Vector3().setFromMatrixPosition(reference));
    const local=headWorld.clone().invert().multiply(new Matrix4().makeTranslation(...delta.toArray())).multiply(matrix);
    const p=new Vector3(),q=new Quaternion(),s=new Vector3();local.decompose(p,q,s);
    const node=json.nodes.push({name:`part-${id}`,mesh,translation:p.toArray(),rotation:q.toArray(),scale:s.toArray()})-1;
    (json.nodes[headIndex].children??=[]).push(node);
  }
  const geometry=body==='male'?importMaleClothing(json,Buffer.concat(chunks),source,catalog):Buffer.concat(chunks);
  // The source body geometry is already in metres/Y-up. Keep a unit instance root for PlayCanvas.
  const wrapper=json.nodes.push({name:`Custom_${body}`,children:json.scenes[0].nodes})-1;json.scenes[0].nodes=[wrapper];
  topological(json);json.asset={version:'2.0',generator:'B.A.R. Quaternius Standard importer',extras:{body,source:'Universal Base Characters[Standard]',license:'CC0'}};
  const result=retargetBase({json,bin:geometry},readGlb(path.join(root,'apps/web/public/models/nathan.glb')));
  const destination=path.join(output,`base-${body}.glb`);writeGlb(destination,result.json,result.bin);console.log(`${body}: ${json.skins[0].joints.length} joints, ${parts.length+(body==='male'?catalog.length:0)} modular parts, ${(fs.statSync(destination).size/1048576).toFixed(2)} MiB`);
}
