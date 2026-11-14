import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectGlb,LIMITS,readSpecs} from '../../tools/assets/lib/ribeiro-placeholders.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const specs=readSpecs(path.join(root,'apps/web/src/machine-shop/placeholders.ts'));
const FOLDERS=[path.join(root,'apps/web/public/farm/placeholders'),path.join(root,'assets-bar/map/BarBoteco/export/farm_armas/placeholders')];

// ---- the real files: the published ones and the Blender export must both honour the contract
for(const folder of FOLDERS){
  const label=path.relative(root,folder).replaceAll('\\','/');
  test(`${label}: os 6 GLBs existem`,()=>{for(const spec of specs)assert.ok(fs.existsSync(path.join(folder,spec.asset)),`falta ${spec.asset}`);});
  for(const spec of specs){
    test(`${label}: ${spec.asset} cumpre o contrato`,()=>{
      const result=inspectGlb(fs.readFileSync(path.join(folder,spec.asset)),spec);
      assert.deepEqual(result.errors,[]);
      assert.ok(result.stats.triangles<=LIMITS.maxTriangles);
      assert.ok(result.stats.size[0]<=LIMITS.size.x+LIMITS.epsilon&&result.stats.size[1]<=LIMITS.size.y+LIMITS.epsilon&&result.stats.size[2]<=LIMITS.size.z+LIMITS.epsilon);
    });
  }
}
test('o publicado é idêntico ao exportado do Blender',()=>{
  const [published,exported]=FOLDERS;if(!fs.existsSync(exported))return;
  for(const spec of specs)assert.ok(fs.readFileSync(path.join(published,spec.asset)).equals(fs.readFileSync(path.join(exported,spec.asset))),`${spec.asset} difere do export`);
});
test('os nomes de contrato dos 6 placeholders estão em placeholders.ts',()=>{
  assert.deepEqual(specs.map(spec=>spec.node).sort(),['RB_PH_CORTE','RB_PH_FURACAO_ACABAMENTO','RB_PH_MONTAGEM','RB_PH_PREPARACAO','RB_PH_PRODUTO_FINAL','RB_PH_USINAGEM']);
});

// ---- the checks themselves, on a minimal GLB built here: each broken contract must be caught
function glb(overrides={},keys=[0,0,0, 0,.01,0, 0,0,0]){
  const positions=new Float32Array([-.3,0,-.2, .3,0,-.2, .3,.05,.2, -.3,.05,.2]),indices=new Uint16Array([0,1,2,0,2,3]),times=new Float32Array([0,1,2]),values=new Float32Array(keys);
  const parts=[Buffer.from(positions.buffer),Buffer.from(indices.buffer),Buffer.from(times.buffer),Buffer.from(values.buffer)],views=[],pad=b=>Buffer.concat([b,Buffer.alloc((4-b.length%4)%4)]);
  let offset=0;for(const part of parts){views.push({buffer:0,byteOffset:offset,byteLength:part.length});offset+=pad(part).length;}
  const bin=Buffer.concat(parts.map(pad));
  const json={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],
    nodes:[{name:'RB_PH_CORTE',children:[1]},{name:'RB_CORTE_MOVEL',children:[2]},{name:'RB_Peca',mesh:0}],
    meshes:[{primitives:[{attributes:{POSITION:0,NORMAL:0,TEXCOORD_0:0},indices:1,material:0}]}],
    materials:[{name:'RB_Atlas',pbrMetallicRoughness:{baseColorTexture:{index:0},metallicRoughnessTexture:{index:1}},normalTexture:{index:2}}],
    textures:[{source:0},{source:0},{source:0}],images:[],
    accessors:[{bufferView:0,componentType:5126,count:4,type:'VEC3',min:[-.3,0,-.2],max:[.3,.05,.2]},{bufferView:1,componentType:5123,count:6,type:'SCALAR'},{bufferView:2,componentType:5126,count:3,type:'SCALAR',min:[0],max:[2]},{bufferView:3,componentType:5126,count:3,type:'VEC3'}],
    bufferViews:views,buffers:[{byteLength:bin.length}],
    animations:[{name:'Idle',samplers:[{input:2,output:3,interpolation:'LINEAR'}],channels:[{sampler:0,target:{node:2,path:'translation'}}]},{name:'Operate',samplers:[{input:2,output:3,interpolation:'LINEAR'}],channels:[{sampler:0,target:{node:2,path:'translation'}}]}],...overrides};
  // minimal 2x2 JPEG-less atlas: three PNG headers (IHDR is all the size reader needs)
  const png=Buffer.alloc(32);png.writeUInt32BE(0x89504e47,0);png.writeUInt32BE(512,16);png.writeUInt32BE(512,20);
  const images=[0,1,2].map(()=>png),firstImageView=views.length;let at=bin.length;
  json.bufferViews.push(...images.map(image=>{const view={buffer:0,byteOffset:at,byteLength:image.length};at+=image.length;return view;}));
  if(!overrides.images)json.images=images.map((_,i)=>({bufferView:firstImageView+i,mimeType:'image/png'}));
  json.buffers[0].byteLength=at;
  const body=Buffer.concat([bin,...images]),text=Buffer.from(JSON.stringify(json)),jsonChunk=Buffer.concat([text,Buffer.alloc((4-text.length%4)%4,0x20)]),binChunk=Buffer.concat([body,Buffer.alloc((4-body.length%4)%4)]);
  const header=Buffer.alloc(12);header.write('glTF',0,'latin1');header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+jsonChunk.length+8+binChunk.length,8);
  const chunk=(type,data)=>{const head=Buffer.alloc(8);head.writeUInt32LE(data.length,0);head.write(type,4,'latin1');return Buffer.concat([head,data]);};
  return Buffer.concat([header,chunk('JSON',jsonChunk),chunk('BIN\0',binChunk)]);
}
const cut={kind:'cut',node:'RB_PH_CORTE',asset:'ribeiro_peca_cortada.glb'};
const errorsOf=overrides=>inspectGlb(glb(overrides),cut).errors.join(' | ');
test('um GLB mínimo correto passa (só avisa do alvo de triângulos)',()=>{const result=inspectGlb(glb(),cut);assert.deepEqual(result.errors,[]);assert.equal(result.stats.triangles,2);});
test('raiz com outro nome é recusada',()=>{assert.match(errorsOf({nodes:[{name:'RB_PH_OUTRO',children:[1]},{name:'RB_CORTE_MOVEL',children:[2]},{name:'RB_Peca',mesh:0}]}),/nó raiz deve ser RB_PH_CORTE/);});
test('raiz fora da origem é recusada',()=>{assert.match(errorsOf({nodes:[{name:'RB_PH_CORTE',translation:[1,0,0],children:[1]},{name:'RB_CORTE_MOVEL',children:[2]},{name:'RB_Peca',mesh:0}]}),/posição, rotação ou escala/);});
test('nó sem prefixo RB_ ou com acento é recusado',()=>{assert.match(errorsOf({nodes:[{name:'RB_PH_CORTE',children:[1]},{name:'RB_CORTE_MOVEL',children:[2]},{name:'Peça',mesh:0}]}),/prefixo RB_/);});
test('falta de *_MOVEL é recusada',()=>{assert.match(errorsOf({nodes:[{name:'RB_PH_CORTE',children:[1]},{name:'RB_Fixo',children:[2]},{name:'RB_Peca',mesh:0}]}),/_MOVEL/);});
test('câmera e luz são recusadas',()=>{assert.match(errorsOf({cameras:[{type:'perspective'}]}),/câmera/);assert.match(errorsOf({extensions:{KHR_lights_punctual:{lights:[]}}}),/luz/);});
test('tamanho acima de 0,75 x 0,45 x 0,55 m é recusado',()=>{
  assert.match(errorsOf({nodes:[{name:'RB_PH_CORTE',children:[1]},{name:'RB_CORTE_MOVEL',scale:[2,2,2],children:[2]},{name:'RB_Peca',mesh:0}]}),/dimensões/);
});
test('clipes diferentes de Idle e Operate são recusados',()=>{assert.match(errorsOf({animations:[{name:'Idle',samplers:[{input:2,output:3}],channels:[{sampler:0,target:{node:2,path:'translation'}}]}]}),/exatamente Idle e Operate/);});
test('animação que mexe na raiz é recusada',()=>{
  const clip=name=>({name,samplers:[{input:2,output:3}],channels:[{sampler:0,target:{node:0,path:'translation'}}]});
  assert.match(errorsOf({animations:[clip('Idle'),clip('Operate')]}),/mexe no nó raiz/);
});
test('Idle que não dura 2 s e Operate fora de 1,2–2 s são recusados',()=>{
  assert.match(errorsOf({accessors:[{bufferView:0,componentType:5126,count:4,type:'VEC3',min:[-.3,0,-.2],max:[.3,.05,.2]},{bufferView:1,componentType:5123,count:6,type:'SCALAR'},{bufferView:2,componentType:5126,count:3,type:'SCALAR',min:[0],max:[3]},{bufferView:3,componentType:5126,count:3,type:'VEC3'}]}),/Idle dura 3\.000 s.*Operate dura 3\.000 s/);
});
test('laço que não fecha é recusado',()=>{assert.match(inspectGlb(glb({},[0,0,0, 0,.01,0, 0,.5,0]),cut).errors.join(' | '),/não fecha o laço/);});
test('material sem uso é recusado',()=>{
  assert.match(errorsOf({materials:[{name:'RB_Atlas',pbrMetallicRoughness:{baseColorTexture:{index:0},metallicRoughnessTexture:{index:1}},normalTexture:{index:2}},{name:'RB_Sobra'}]}),/sem uso/);
});
