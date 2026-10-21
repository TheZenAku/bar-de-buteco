import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,existsSync} from 'node:fs';import {dirname,resolve} from 'node:path';import {fileURLToPath} from 'node:url';
import {characterSchema,DEFAULT_CHARACTER,HAIRSTYLES,SKIN_TONES,skinSchema} from '@bar/shared';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../apps/web/public');
const glb=(file:string)=>{const bytes=readFileSync(file),n=bytes.readUInt32LE(12);assert.equal(bytes.readUInt32LE(8),bytes.length);return JSON.parse(bytes.subarray(20,20+n).toString());};
test('character schema restricts options to installed assets and does not accept client currency or inventory',()=>{
  assert.ok(characterSchema.safeParse(DEFAULT_CHARACTER).success);
  assert.equal(characterSchema.safeParse({...DEFAULT_CHARACTER,balance:1000}).success,false);
  assert.equal(characterSchema.safeParse({...DEFAULT_CHARACTER,skinTone:'#ffffff'}).success,false);
  for(const hair of HAIRSTYLES)for(const skinTone of SKIN_TONES)assert.ok(characterSchema.safeParse({...DEFAULT_CHARACTER,hair:hair.id,skinTone}).success);
  assert.ok(skinSchema.safeParse('custom').success);assert.equal(skinSchema.safeParse('base-male').success,false);
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
