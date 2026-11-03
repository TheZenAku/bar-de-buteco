import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareCity,resolveUri} from '../../tools/assets/import-city.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const exportDir=path.join(root,'assets-bar/map/BarBoteco/export');
/** A throwaway copy of the city's export: each test damages its own. */
function copy(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cidade-'));
  fs.cpSync(path.join(exportDir,'cidade'),path.join(dir,'cidade'),{recursive:true,filter:file=>!/capturas|RELATORIO/.test(file)});
  return dir;
}
const prepare=dir=>prepareCity({root,exportDir:dir});
const editJson=(file,change)=>{const json=JSON.parse(fs.readFileSync(file,'utf8'));change(json);fs.writeFileSync(file,JSON.stringify(json));};

test('a URI must stay inside the folder and find its file',()=>{
  const top=path.join(exportDir,'cidade'),from=path.join(top,'setores');
  assert.equal(resolveUri('../texturas/asfalto.jpg',from,top,'x'),path.join(top,'texturas/asfalto.jpg'));
  for(const uri of ['../../bar_boteco.glb','/etc/passwd','https://example.com/a.jpg','C:/a.jpg','..\\texturas\\asfalto.jpg','data:image/png;base64,AA'])
    assert.throws(()=>resolveUri(uri,from,top,'x'),/não é relativa|sai da pasta/,uri);
  assert.throws(()=>resolveUri('../texturas/nada.jpg',from,top,'x'),/falta/);
});

test('the export as it is passes, and says what the published copy leaves out',()=>{
  const city=prepareCity({root,exportDir});
  assert.deepEqual(city.bounds,{minX:-400,maxX:400,minZ:-400,maxZ:400});
  assert.deepEqual(city.originalArea,{minX:-141,maxX:173,minZ:-149,maxZ:123});
  assert.equal(city.counts.sectors,64);assert.equal(city.counts.gltfs,130);assert.equal(city.counts.textures,40);assert.equal(city.counts.solids,5650);
  assert.equal(city.counts.silhouettes,2720);assert.equal(city.counts.lights,9);assert.equal(city.counts.markers,39);
});

test('whatever is missing stops the import with its name, before anything is written',()=>{
  const dir=copy();
  try{
    const texture=path.join(dir,'cidade/texturas/asfalto.jpg'),bytes=fs.readFileSync(texture);
    fs.rmSync(texture);
    assert.throws(()=>prepare(dir),/asfalto\.jpg/);
    fs.writeFileSync(texture,bytes);
    const bin=path.join(dir,'cidade/setores/cidade_S01_01.bin'),binBytes=fs.readFileSync(bin);
    fs.rmSync(bin);
    assert.throws(()=>prepare(dir),/cidade_S01_01\.bin/);
    fs.writeFileSync(bin,binBytes.subarray(1));
    assert.throws(()=>prepare(dir),/cidade_S01_01\.bin tem/,'a truncated buffer');
    fs.writeFileSync(bin,binBytes);
    const collision=path.join(dir,'cidade/setores/cidade_S01_01_colisao.glb'),collisionBytes=fs.readFileSync(collision);
    fs.rmSync(collision);
    assert.throws(()=>prepare(dir),/cidade_S01_01_colisao\.glb/);
    fs.writeFileSync(collision,collisionBytes);
    const ring=path.join(dir,'cidade/cidade_anel.gltf'),ringBytes=fs.readFileSync(ring);
    fs.rmSync(ring);
    assert.throws(()=>prepare(dir),/cidade_anel\.gltf/);
    fs.writeFileSync(ring,ringBytes);
    prepare(dir);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('a manifest out of the grid, or a perimeter with a hole, is refused',()=>{
  const dir=copy();
  try{
    const manifest=path.join(dir,'cidade/cidade_setores.json'),original=fs.readFileSync(manifest);
    editJson(manifest,json=>{json.setor_m=50;});
    assert.throws(()=>prepare(dir),/grade inesperada/);
    fs.writeFileSync(manifest,original);
    editJson(manifest,json=>{delete json.setores.S03_03;});
    assert.throws(()=>prepare(dir),/64 setores|S03_03|undefined/);
    fs.writeFileSync(manifest,original);
    editJson(manifest,json=>{json.bairro_original_incluso=true;});
    assert.throws(()=>prepare(dir),/bairro original/);
    fs.writeFileSync(manifest,original);
    // A sector without its stretch of the limit: its collision file loses that node.
    const file=path.join(dir,'cidade/setores/cidade_S00_00_colisao.glb'),glb=fs.readFileSync(file),size=glb.readUInt32LE(12),json=JSON.parse(glb.subarray(20,20+size));
    const node=json.nodes.find(n=>n.name==='COL_Cid_Limite_Oeste');node.name='COL_Cid_Muro.999';
    const text=Buffer.from(JSON.stringify(json).padEnd(size,' '));
    assert.ok(text.length===size,'same length');
    text.copy(glb,20);
    fs.writeFileSync(file,glb);
    assert.throws(()=>prepare(dir),/COL_Cid_Limite_Oeste não cobre/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('publishing replaces only what it published, and refuses a folder that is not its own',()=>{
  const dir=copy();
  try{
    const city=prepare(dir),publishDir=path.join(dir,'public/maps/cidade'),sharedDir=path.join(dir,'shared');
    fs.mkdirSync(sharedDir,{recursive:true});
    // Someone else's folder stays, and stops it.
    fs.mkdirSync(publishDir,{recursive:true});fs.writeFileSync(path.join(publishDir,'do-usuario.txt'),'x');
    assert.throws(()=>city.publish({publishDir,sharedDir}),/não foi publicado por este importador/);
    assert.ok(fs.existsSync(path.join(publishDir,'do-usuario.txt')));
    fs.rmSync(publishDir,{recursive:true});
    assert.equal(city.publish({publishDir,sharedDir}),306);
    for(const file of ['cidade_setores.json','pontos_ifood.json','texturas/ponto_ifood_atlas.jpg','cidade_anel.bin','setores/cidade_S04_04.gltf','setores/cidade_S04_04_lod.bin','texturas/panorama.jpg','cidade_publicacao.json'])assert.ok(fs.existsSync(path.join(publishDir,file)),file);
    assert.ok(!fs.existsSync(path.join(publishDir,'capturas')));
    assert.ok(fs.existsSync(path.join(sharedDir,'city-data.json')));assert.ok(fs.existsSync(path.join(sharedDir,'city-roads.json')));
    // A file of the last publication that is gone from the export goes; one the importer never published stays.
    const stamp=path.join(publishDir,'cidade_publicacao.json');
    editJson(stamp,json=>{json.arquivos['setores/velho.gltf']='0';});
    fs.writeFileSync(path.join(publishDir,'setores/velho.gltf'),'{}');
    fs.writeFileSync(path.join(publishDir,'setores/alheio.txt'),'x');
    city.publish({publishDir,sharedDir});
    assert.ok(!fs.existsSync(path.join(publishDir,'setores/velho.gltf')));
    assert.ok(fs.existsSync(path.join(publishDir,'setores/alheio.txt')));
    assert.deepEqual(fs.readdirSync(path.join(publishDir,'setores')).filter(file=>file.endsWith('.tmp')),[]);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
