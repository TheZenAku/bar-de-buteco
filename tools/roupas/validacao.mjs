import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {readGlb} from '../lib/character-gltf.mjs';

export function validateClothingBuild(stage,catalog,root){
  let triangles=0;
  for(const body of ['male','female']){
    const file=path.join(stage,'characters',`base-${body}.glb`),{json,bin}=readGlb(file);
    assert.equal(fs.readFileSync(file).readUInt32LE(8),fs.statSync(file).size,'GLB truncado');
    const bank=readGlb(path.join(stage,'animations',`base-${body}.glb`)).json;
    const cane=readGlb(path.join(stage,'props',`old-cane-base-${body}.glb`)).json;
    assert.equal(cane.nodes.length,1);assert.equal(cane.nodes[0].name,'Acc_Male_Hand_Cane');assert.equal(cane.skins,undefined);
    assert.equal(cane.meshes[0].primitives.reduce((sum,p)=>sum+cane.accessors[p.attributes.POSITION].count/3,0),200);
    for(const name of ['OldCaneWalk','OldCaneHold'])assert.ok(bank.animations.some(a=>a.name===name),`Animação da bengala ausente: ${name}`);
    assert.deepEqual(bank.nodes.map(n=>n.name),json.nodes.map(n=>n.name),'O banco de animações não corresponde ao modelo');
    assert.equal(json.skins[0].joints.length,65);
    for(const image of json.images??[])assert.ok(fs.existsSync(path.join(stage,'characters',image.uri)),`Textura ausente: ${image.uri}`);
    const values=index=>{
      const a=json.accessors[index],view=json.bufferViews[a.bufferView],width={SCALAR:1,VEC3:3,VEC4:4}[a.type],methods={5121:['readUInt8',1],5123:['readUInt16LE',2],5125:['readUInt32LE',4],5126:['readFloatLE',4]},[method,size]=methods[a.componentType];
      assert.ok((view.byteOffset??0)+view.byteLength<=bin.length,'Buffer fora do GLB');
      return Array.from({length:a.count*width},(_,i)=>bin[method]((view.byteOffset??0)+(a.byteOffset??0)+Math.floor(i/width)*(view.byteStride??size*width)+(i%width)*size));
    };
    for(const item of catalog){
      const node=json.nodes.find(n=>n.name===`part-${item.id}`);
      if(body==='female'){assert.equal(node,undefined,'Roupa masculina inserida no corpo feminino');continue;}
      assert.ok(node,`Peça ausente: ${item.id}`);assert.equal(node.skin,0);
      for(const primitive of json.meshes[node.mesh].primitives){
        assert.ok(json.materials[primitive.material]);
        const p=values(primitive.attributes.POSITION),j=values(primitive.attributes.JOINTS_0),w=values(primitive.attributes.WEIGHTS_0),index=values(primitive.indices);
        assert.ok(p.length>0&&p.every(Number.isFinite));assert.equal(j.length,w.length);assert.equal(j.length/4,p.length/3);
        assert.ok(index.every(i=>Number.isInteger(i)&&i>=0&&i<p.length/3));
        for(let i=0;i<w.length;i+=4){assert.ok(Math.abs(w.slice(i,i+4).reduce((s,v)=>s+v,0)-1)<1e-5,'Pesos não normalizados');for(let c=0;c<4;c++){assert.ok(w[i+c]>=0&&Number.isFinite(w[i+c]));assert.ok(j[i+c]>=0&&j[i+c]<65);if(item.slot==='accessory'&&w[i+c]>0)assert.equal(json.nodes[json.skins[0].joints[j[i+c]]].name,'head');}}
      }
    }
    if(body==='male'){
      for(const node of json.nodes.filter(n=>n.name==='SuperHero_Male'||n.name.startsWith('body-coverage-'))){
        triangles+=json.accessors[json.meshes[node.mesh].primitives[0].indices].count;
        if(node.name.startsWith('body-coverage-'))for(const id of node.name.slice('body-coverage-'.length).split('+'))assert.ok(catalog.some(item=>item.id===id&&item.coverage),`Cobertura inválida: ${id}`);
      }
    }
  }
  const original=JSON.parse(fs.readFileSync(path.join(root,'assets-bar/Universal Base Characters[Standard]/Base Characters/Godot - UE/Superhero_Male_FullBody.gltf'),'utf8'));
  assert.equal(triangles,original.accessors[original.meshes[2].primitives[0].indices].count,'A cobertura alterou os triângulos originais do corpo');
  console.log(`Validação OK: ${catalog.length} peças, dois corpos, pesos, materiais, texturas, cobertura e bancos de animação.`);
}
