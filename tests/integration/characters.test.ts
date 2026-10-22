import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,existsSync} from 'node:fs';import {dirname,resolve} from 'node:path';import {fileURLToPath} from 'node:url';
import {characterSchema,DEFAULT_CHARACTER,HAIRSTYLES,SKIN_TONES,skinSchema,MALE_CLOTHING} from '@bar/shared';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../apps/web/public');
const glb=(file:string)=>{const bytes=readFileSync(file),n=bytes.readUInt32LE(12);assert.equal(bytes.readUInt32LE(8),bytes.length);return JSON.parse(bytes.subarray(20,20+n).toString());};
test('character schema restricts options to installed assets and does not accept client currency or inventory',()=>{
  assert.ok(characterSchema.safeParse(DEFAULT_CHARACTER).success);
  assert.equal(characterSchema.safeParse({...DEFAULT_CHARACTER,balance:1000}).success,false);
  assert.equal(characterSchema.safeParse({...DEFAULT_CHARACTER,skinTone:'#ffffff'}).success,false);
  for(const hair of HAIRSTYLES)for(const skinTone of SKIN_TONES)assert.ok(characterSchema.safeParse({...DEFAULT_CHARACTER,hair:hair.id,skinTone}).success);
  assert.ok(skinSchema.safeParse('custom').success);assert.equal(skinSchema.safeParse('base-male').success,false);
});

test('clothing defaults preserve older characters and only installed garments/colors are accepted',()=>{
  const {top,bottom,footwear,accessory,topColor,bottomColor,footwearColor,accessoryColor,...old}=DEFAULT_CHARACTER;
  assert.deepEqual(characterSchema.parse(old),DEFAULT_CHARACTER);
  assert.ok(characterSchema.safeParse({...DEFAULT_CHARACTER,top:'tee',bottom:'pants',footwear:'sneakers'}).success);
  for(const change of [{top:'unknown'},{bottom:'tee'},{footwear:'pants'},{topColor:'#ffffff'}])assert.equal(characterSchema.safeParse({...DEFAULT_CHARACTER,...change}).success,false);
  for(const item of MALE_CLOTHING)assert.ok(characterSchema.safeParse({...DEFAULT_CHARACTER,[item.slot]:item.id}).success);
});

test('male garments share the animated body rig with normalized surface weights and reversible skin coverage',()=>{
  const file=resolve(root,'characters/base-male.glb'),bytes=readFileSync(file),length=bytes.readUInt32LE(12),json=glb(file),bin=bytes.subarray(28+length);
  const values=(index:number)=>{const a=json.accessors[index],v=json.bufferViews[a.bufferView],width={SCALAR:1,VEC3:3,VEC4:4}[a.type as 'SCALAR'|'VEC3'|'VEC4'];const size=a.componentType===5126?4:2;return Array.from({length:a.count*width},(_,i)=>a.componentType===5126?bin.readFloatLE((v.byteOffset??0)+i*size):bin.readUInt16LE((v.byteOffset??0)+i*size));};
  const female=glb(resolve(root,'characters/base-female.glb'));
  for(const {id,slot} of MALE_CLOTHING){
    const required=slot==='top'?['spine_03','upperarm_l','upperarm_r']:slot==='bottom'?['upperleg_l','upperleg_r','lowerleg_l','lowerleg_r']:slot==='accessory'?['head']:['foot_l','foot_r'];
    const node=json.nodes.find((n:any)=>n.name===`part-${id}`);assert.ok(node);assert.equal(node.skin,0);assert.ok(!female.nodes.some((n:any)=>n.name===node.name));
    const primitive=json.meshes[node.mesh].primitives[0],joints=values(primitive.attributes.JOINTS_0),weights=values(primitive.attributes.WEIGHTS_0),used=new Set<string>();
    assert.equal(json.materials[primitive.material].name,`CharacterClothing-${id}`);
    assert.equal(joints.length,weights.length);assert.ok(joints.length>0);
    for(let i=0;i<weights.length;i+=4){let total=0;for(let c=0;c<4;c++){assert.ok(joints[i+c]>=0&&joints[i+c]<65);assert.ok(weights[i+c]>=0&&Number.isFinite(weights[i+c]));total+=weights[i+c];if(weights[i+c]>.05)used.add(json.nodes[json.skins[0].joints[joints[i+c]]].name);}assert.ok(Math.abs(total-1)<1e-5);}
    for(const name of required)assert.ok(used.has(name),`${id} must follow ${name}`);
    const position=json.accessors[primitive.attributes.POSITION];assert.ok(position.min[1]>-.03&&position.max[1]<1.85,'centimetres converted into the body rest pose');
    if(slot==='accessory'){
      assert.deepEqual([...used],['head']);
      const lens=json.meshes[node.mesh].primitives.map((p:any)=>json.materials[p.material]).find((m:any)=>m.name===`CharacterLens-${id}`);
      if(id==='glasses'){assert.ok(lens);assert.equal(lens.alphaMode,'BLEND');assert.ok(lens.pbrMetallicRoughness.baseColorFactor[3]<1);}
    }
  }
  const groups=json.nodes.filter((n:any)=>n.name==='SuperHero_Male'||n.name.startsWith('body-coverage-'));
  assert.ok(groups.length>3);
  const primitive=json.meshes[groups[0].mesh].primitives[0];
  const source=JSON.parse(readFileSync(resolve(root,'../../../assets-bar/Universal Base Characters[Standard]/Base Characters/Godot - UE/Superhero_Male_FullBody.gltf'),'utf8'));
  const original=source.meshes[2].primitives[0];
  assert.equal(groups.reduce((sum:number,n:any)=>sum+json.accessors[json.meshes[n.mesh].primitives[0].indices].count,0),source.accessors[original.indices].count,'all original body triangles survive; unequipping restores them');
  for(const group of groups)assert.deepEqual(json.meshes[group.mesh].primitives[0].attributes,primitive.attributes,'body regions share original geometry and weights');
  for(const group of groups.filter((n:any)=>n.name.startsWith('body-coverage-')))for(const id of group.name.slice('body-coverage-'.length).split('+'))assert.ok(MALE_CLOTHING.some(item=>item.id===id&&item.slot!=='accessory'));
});
test('both starter bodies have their own rigs, clips, local textures and head-attached modular parts',()=>{
  for(const body of ['male','female']){
    const file=resolve(root,`characters/base-${body}.glb`),json=glb(file),bank=glb(resolve(root,`animations/base-${body}.glb`));
    assert.equal(json.skins[0].joints.length,65);
    for(const clip of ['Idle','Walk','Pose'])assert.ok(json.animations.some((a:any)=>a.name===clip));
    for(const clip of ['Drink','Dance','Sit','CardsSit','AngrySit','Fallen'])assert.ok(bank.animations.some((a:any)=>a.name===clip));
    assert.ok(!bank.animations.some((a:any)=>a.name==='Kick'));
    assert.deepEqual(bank.nodes.map((n:any)=>n.name),json.nodes.map((n:any)=>n.name));
    const head=json.nodes.find((n:any)=>n.name==='head');assert.ok(head);
    for(const id of ['buzzed','buzzed-female','simple-parted','long','buns','beard','brows-regular','brows-female']){
      const index=json.nodes.findIndex((n:any)=>n.name===`part-${id}`);assert.ok(head.children.includes(index),`${body}/${id} must follow the animated head`);
    }
    for(const image of json.images)assert.ok(existsSync(resolve(dirname(file),image.uri)),`${body}: missing local texture ${image.uri}`);
    for(const [i,node] of json.nodes.entries())for(const child of node.children??[])assert.ok(child>i,'Retargeting requires parent-before-child node order');
  }
});
