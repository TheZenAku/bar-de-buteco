import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {discoverClothing,publicCatalog} from '../../tools/roupas/catalogo.mjs';
import {replaceIfChanged} from '../../tools/roupas/publicacao.mjs';

function fixture(t,files,overrides={}){
  const prefix=path.join(os.tmpdir(),'bar-clothing-tools-'),root=fs.mkdtempSync(prefix);
  t.after(()=>{assert.ok(path.resolve(root).startsWith(path.resolve(prefix)));fs.rmSync(root,{recursive:true,force:true});});
  const directory=path.join(root,'assets-bar/Universal Base Characters[Standard]/Male-Cloth');
  fs.mkdirSync(directory,{recursive:true});fs.mkdirSync(path.join(root,'tools/roupas'),{recursive:true});
  fs.writeFileSync(path.join(root,'tools/roupas/ajustes.json'),JSON.stringify(overrides));
  for(const file of files)fs.writeFileSync(path.join(directory,file),'FBX fixture');
  return root;
}
test('clothing discovery automatically adds every supported filename to its own slot',t=>{
  const root=fixture(t,['Cloth_Male_Top_Tee.fbx','Cloth_Male_Top_New_Hoodie.fbx','Cloth_Male_Bottom_Shorts.fbx','Cloth_Male_Feet_Boots.fbx','Acc_Male_Face_Glasses.fbx','notes.txt']);
  const entries=discoverClothing(root);assert.equal(entries.length,5);
  assert.equal(entries.find(e=>e.id==='new-hoodie').slot,'top');assert.equal(entries.find(e=>e.id==='shorts').slot,'bottom');assert.equal(entries.find(e=>e.id==='boots').slot,'footwear');
  assert.equal(entries.find(e=>e.id==='glasses').coverage,false);assert.equal(entries.find(e=>e.id==='tee').scale,.01);
  assert.ok(publicCatalog(entries).every(e=>!('scale' in e)&&!('maxDistance' in e)));
});
test('explicit fit/name settings are validated and do not require editing the importer',t=>{
  const root=fixture(t,['Cloth_Male_Top_Hoodie.fbx'],{'Cloth_Male_Top_Hoodie.fbx':{id:'warm-hoodie',name:'Blusa de frio',maxDistance:.1,rotationY:90}});
  const [entry]=discoverClothing(root);assert.equal(entry.id,'warm-hoodie');assert.equal(entry.name,'Blusa de frio');assert.equal(entry.maxDistance,.1);assert.equal(entry.rotationY,90);
  fs.writeFileSync(path.join(root,'tools/roupas/ajustes.json'),JSON.stringify({'Cloth_Male_Top_Hoodie.fbx':{maxDistance:100}}));
  assert.throws(()=>discoverClothing(root),/distância de encaixe/);
});
test('unknown names, duplicate IDs and IDs reserved by hairstyles cannot silently break models',t=>{
  assert.throws(()=>discoverClothing(fixture(t,['unknown.fbx'])),/Nome não reconhecido/);
  assert.throws(()=>discoverClothing(fixture(t,['Cloth_Male_Top_Same.fbx','Cloth_Male_Feet_Same.fbx'])),/repetido/);
  assert.throws(()=>discoverClothing(fixture(t,['Cloth_Male_Top_Long.fbx'])),/inválido/);
});
test('accidentally deleting or changing the slot of an installed garment preserves saved selections',t=>{
  const root=fixture(t,['Cloth_Male_Top_Tee.fbx']);fs.mkdirSync(path.join(root,'packages/shared/src'),{recursive:true});
  const file=path.join(root,'packages/shared/src/clothing-catalog.json');
  fs.writeFileSync(file,JSON.stringify([{id:'pants',slot:'bottom'}]));assert.throws(()=>discoverClothing(root),/preservar os personagens/);
  fs.writeFileSync(file,JSON.stringify([{id:'tee',slot:'footwear'}]));assert.throws(()=>discoverClothing(root),/mudou de categoria/);
});

test('publishing uses staging outside watched sources and skips files with identical content',t=>{
  const root=fixture(t,['Cloth_Male_Top_Tee.fbx']),stage=path.join(root,'.local/stage'),directory=path.join(root,'packages/shared/src');
  fs.mkdirSync(stage,{recursive:true});fs.mkdirSync(directory,{recursive:true});
  const source=path.join(stage,'catalogo.json'),target=path.join(directory,'clothing-catalog.json');
  fs.writeFileSync(source,'{"revision":1}');assert.equal(replaceIfChanged(source,target,stage),true);
  const timestamp=fs.statSync(target).mtimeMs;
  assert.equal(replaceIfChanged(source,target,stage),false);assert.equal(fs.statSync(target).mtimeMs,timestamp);
  fs.writeFileSync(source,'{"revision":2}');assert.equal(replaceIfChanged(source,target,stage),true);
  assert.equal(fs.readFileSync(target,'utf8'),'{"revision":2}');assert.deepEqual(fs.readdirSync(directory),['clothing-catalog.json']);
});
