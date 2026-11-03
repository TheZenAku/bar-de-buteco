// The city around the bar (export/cidade, 28_cidade_export.py): validates the whole export, publishes what the browser
// streams to apps/web/public/maps/cidade, and turns the sectors' collision GLBs into the JSON the server and the client's
// prediction walk on. The source files are never written; what the published copies drop is listed below.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Matrix4,Quaternion,Vector3} from 'three';

/** Everything of the report's markers the game counts on: an export without one of them fails. */
const REQUIRED_MARKERS=['Ponto_Prefeitura','Ponto_Terminal','Ponto_Escola_Conceicao','Ponto_UBS','Ponto_Praca_Conceicao','Ponto_Bosque_Conceicao','Ponto_Lazer_Olaria','Ponto_Campo_Olaria',
  'Ponto_Supermercado','Ponto_Posto','Ponto_Subestacao','Ponto_Transportes','Ponto_Metalurgica',...Array.from({length:22},(_,i)=>`Ponto_Onibus_${String(i+1).padStart(2,'0')}`),
  'Bairro_Centro','Bairro_Parque_Olaria','Bairro_Jardim_Conceicao','Bairro_Distrito_Industrial'];
/** Flat boxes people and the bike stand on: their top face is a floor, and they are no wall (kerbs are 15 cm). */
const FLOOR_ONLY=new Set(['COL_Cid_Chao','COL_Cid_Quadra','COL_Cid_Quadra_Faixa','COL_Cid_Calcada','COL_Cid_Canteiro']);
/** Raised floors: their top is walkable when reached, their sides stop whoever stands below (a lot's retaining wall). */
const FLOOR_AND_SOLID=new Set(['COL_Cid_Plato','COL_Cid_Plataforma']);
/** Where the bike rides, as COL_Rua_* in the original neighbourhood. */
const ROADS=FLOOR_ONLY;
const STAMP='cidade_publicacao.json';
const LIMIT_SIDES={Oeste:{axis:'x',at:-1},Leste:{axis:'x',at:1},Norte:{axis:'z',at:-1},Sul:{axis:'z',at:1}};
const OLD_BARRIER_TRIANGLES={Atlas_Bairro:2304,Metal_Branco:3552,Plastico_Laranja:480,Borracha_Preta:240};
const round=n=>Math.round(n*1e3)/1e3||0;
const fail=message=>{throw new Error(`Cidade: ${message}`);};

/**
 * A glTF URI must stay inside the published folder and exist: nothing absolute, no scheme, nothing above `top`.
 * Returns the file it points to.
 */
export function resolveUri(uri,fromDir,top,owner){
  if(typeof uri!=='string'||!uri)fail(`${owner}: URI vazia`);
  if(/^[a-z][a-z0-9+.-]*:/i.test(uri)||uri.startsWith('/')||uri.includes('\\'))fail(`${owner}: URI "${uri}" não é relativa`);
  const file=path.resolve(fromDir,decodeURI(uri)),inside=path.relative(top,file);
  if(inside.startsWith('..')||path.isAbsolute(inside))fail(`${owner}: URI "${uri}" sai da pasta da cidade`);
  if(!fs.existsSync(file))fail(`${owner}: falta ${path.relative(top,file)} (URI "${uri}")`);
  return file;
}
function readGltf(file,top){
  const owner=path.relative(top,file),dir=path.dirname(file);
  if(!fs.existsSync(file))fail(`falta ${owner}`);
  const json=JSON.parse(fs.readFileSync(file,'utf8'));
  if(json.buffers?.length!==1)fail(`${owner}: esperado um único buffer`);
  const binFile=resolveUri(json.buffers[0].uri,dir,top,owner),bin=fs.readFileSync(binFile);
  if(bin.length!==json.buffers[0].byteLength)fail(`${owner}: ${path.basename(binFile)} tem ${bin.length} bytes, o glTF diz ${json.buffers[0].byteLength}`);
  const images=(json.images??[]).map(image=>image.bufferView===undefined?resolveUri(image.uri,dir,top,owner):fail(`${owner}: textura embutida`));
  return {file,json,bin,binFile,images};
}
function readGlbFile(file,top){
  if(!fs.existsSync(file))fail(`falta ${path.relative(top,file)}`);
  const bytes=fs.readFileSync(file);
  if(bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(8)!==bytes.length)fail(`GLB inválido: ${path.relative(top,file)}`);
  const size=bytes.readUInt32LE(12);
  return {json:JSON.parse(bytes.subarray(20,20+size)),bytes,binStart:28+size};
}
const COMPONENTS={5121:[1,'readUInt8','writeUInt8'],5123:[2,'readUInt16LE','writeUInt16LE'],5125:[4,'readUInt32LE','writeUInt32LE'],5126:[4,'readFloatLE']};
const ITEMS={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
/** Reads an accessor as a flat array; `start` is where the buffer begins inside `bin` (a GLB's binary chunk). */
function accessorValues(json,bin,index,start=0){
  const a=json.accessors[index],view=json.bufferViews[a.bufferView],[size,read]=COMPONENTS[a.componentType],items=ITEMS[a.type];
  const base=start+(view.byteOffset??0)+(a.byteOffset??0),stride=view.byteStride??size*items,out=new Array(a.count*items);
  for(let i=0;i<a.count;i++)for(let c=0;c<items;c++)out[i*items+c]=bin[read](base+i*stride+c*size);
  return out;
}
/** Collapses the triangles `drop` chooses into a point: the index buffer keeps its size and every other byte stays as exported. */
function retireTriangles(json,bin,primitive,drop,start=0){
  const positions=accessorValues(json,bin,primitive.attributes.POSITION,start),a=json.accessors[primitive.indices],view=json.bufferViews[a.bufferView];
  const [size,read,write]=COMPONENTS[a.componentType],base=start+(view.byteOffset??0)+(a.byteOffset??0),stride=view.byteStride??size;
  let retired=0;
  for(let i=0;i<a.count;i+=3){
    const at=[0,1,2].map(k=>bin[read](base+(i+k)*stride)),points=at.map(v=>[positions[v*3],positions[v*3+1],positions[v*3+2]]);
    if(!drop(points))continue;
    for(const k of [1,2])bin[write](at[0],base+(i+k)*stride);
    retired++;
  }
  return retired;
}
const centroid=points=>[0,1,2].map(axis=>(points[0][axis]+points[1][axis]+points[2][axis])/3);
function worldMatrices(json){
  const parents=new Map(),cache=new Map();
  json.nodes.forEach((node,i)=>node.children?.forEach(child=>parents.set(child,i)));
  const get=i=>{
    if(cache.has(i))return cache.get(i);
    const node=json.nodes[i];
    const local=node.matrix?new Matrix4().fromArray(node.matrix):new Matrix4().compose(new Vector3(...(node.translation??[0,0,0])),new Quaternion(...(node.rotation??[0,0,0,1])),new Vector3(...(node.scale??[1,1,1])));
    const world=parents.has(i)?get(parents.get(i)).clone().multiply(local):local;
    cache.set(i,world);return world;
  };
  return get;
}
/**
 * A COL_* node as a box about the vertical, in the game's axes: its centre, the half lengths along its own axes and the
 * direction of its X on the ground. Parents, turns and scale all come through the world matrix; a box that leans is refused.
 */
function worldBox(json,index,world){
  const node=json.nodes[index],primitive=json.meshes[node.mesh]?.primitives?.[0];
  if(!primitive)fail(`${node.name}: sem malha`);
  const position=json.accessors[primitive.attributes.POSITION],matrix=world(index),e=matrix.elements;
  const axisX=new Vector3(e[0],e[1],e[2]),axisY=new Vector3(e[4],e[5],e[6]),axisZ=new Vector3(e[8],e[9],e[10]);
  const sizes=[axisX.length()*(position.max[0]-position.min[0])/2,axisY.length()*(position.max[1]-position.min[1])/2,axisZ.length()*(position.max[2]-position.min[2])/2];
  const flat=axisX.clone().normalize(),depth=axisZ.clone().normalize();
  if(Math.abs(flat.y)>1e-3||Math.abs(depth.y)>1e-3)fail(`${node.name} está inclinado: a colisão só aceita giro em torno da vertical`);
  const centre=new Vector3((position.min[0]+position.max[0])/2,(position.min[1]+position.max[1])/2,(position.min[2]+position.max[2])/2).applyMatrix4(matrix);
  return {name:node.name,x:centre.x,z:centre.z,lx:sizes[0],lz:sizes[2],minY:centre.y-sizes[1],maxY:centre.y+sizes[1],ux:flat.x,uz:flat.z};
}
/** Boxes square to the map lose their turn (a half turn or quarter turn only swaps the sides). */
function squared(box){
  const {lx,lz,ux,uz}=box;
  const along=Math.abs(ux)>=Math.abs(uz)?Math.abs(uz):Math.abs(ux);
  // How far the enclosing box would stick out past the real one: under 2 mm, the plain box is the same box.
  if(along*Math.max(lx,lz)>=.002)return box;
  return Math.abs(ux)>=Math.abs(uz)?{...box,ux:1,uz:0}:{...box,ux:0,uz:1};
}

/**
 * Everything is read and checked first; nothing is written until `publish()`. `sceneExtras` comes from the sectors' scene and
 * must agree with the manifest.
 */
export function prepareCity({root,exportDir}){
  const source=path.join(exportDir,'cidade'),sectorsDir=path.join(source,'setores');
  const manifestFile=path.join(source,'cidade_setores.json');
  if(!fs.existsSync(manifestFile))fail(`falta ${path.relative(root,manifestFile)}`);
  const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8')),{n,setor_m:size,origem_xy:origin,setores}=manifest;
  if(n!==8||size!==100||origin?.[0]!==-400||origin?.[1]!==-400)fail(`manifesto com grade inesperada (n=${n}, setor=${size}, origem=${origin})`);
  if(manifest.bairro_original_incluso!==false)fail('o manifesto inclui o bairro original, que já vem do bar_boteco.glb');
  const names=[];
  for(let col=0;col<n;col++)for(let row=0;row<n;row++)names.push(`S${String(col).padStart(2,'0')}_${String(row).padStart(2,'0')}`);
  const extra=Object.keys(setores).filter(name=>!names.includes(name));
  if(extra.length||Object.keys(setores).length!==n*n)fail(`esperados ${n*n} setores, há ${Object.keys(setores).length} (${extra.join(', ')})`);
  const span=n*size,bounds={minX:origin[0],maxX:origin[0]+span,minZ:-(origin[1]+span),maxZ:-origin[1]};
  const roads=JSON.parse(fs.readFileSync(path.join(source,'cidade_vias.json'),'utf8'));
  const [ox0,ox1,oy0,oy1]=roads.bairro_original;
  const originalArea={minX:ox0,maxX:ox1,minZ:-oy1,maxZ:-oy0};
  const inOriginal=(x,z)=>x>originalArea.minX&&x<originalArea.maxX&&z>originalArea.minZ&&z<originalArea.maxZ;

  const textures=new Set(),gltfs=[],markers={},boxes=[],kinds=new Map(),sectorData={};
  const seenIds=new Set();
  let sceneExtras,lights=0,silhouettes=0,originalLods=0;
  for(const name of names){
    const sector=setores[name],[x0,y0,x1,y1]=sector.limites_xy,col=names.indexOf(name)>>3,row=names.indexOf(name)&7;
    if(x0!==origin[0]+col*size||y0!==origin[1]+row*size||x1!==x0+size||y1!==y0+size)fail(`${name}: limites ${sector.limites_xy} fora da grade`);
    const visual=readGltf(path.join(sectorsDir,sector.arquivos.visual),source),lod=readGltf(path.join(sectorsDir,sector.arquivos.lod),source);
    const worldVisual=worldMatrices(visual.json);
    sceneExtras??=visual.json.scenes[0].extras;
    // Markers and lights travel as nodes of the visual file; EXT_mesh_gpu_instancing roots are checked to be whole.
    visual.json.nodes.forEach((node,index)=>{
      const instancing=node.extensions?.EXT_mesh_gpu_instancing;
      if(instancing&&visual.json.accessors[instancing.attributes.TRANSLATION]?.count===undefined)fail(`${name}: ${node.name} sem translações de instância`);
      if(node.extensions?.KHR_lights_punctual)lights++;
      if(!/^(Ponto|Bairro)_/.test(node.name??''))return;
      if(markers[node.name])fail(`marcador ${node.name} repetido (${name})`);
      const at=new Vector3().setFromMatrixPosition(worldVisual(index));
      markers[node.name]={x:round(at.x),y:round(at.y),z:round(at.z),...(node.extras?.bairro?{label:node.extras.bairro}:{})};
    });
    // 25_cidade_anel.py builds Silhueta_Original_LOD2 without a collection, so it was exported in the fused *_Estatico:
    // bare boxes of the neighbourhood's buildings (and one all around the bar) inside the LOD0. The neighbourhood stays in
    // bar_boteco.glb; its boxes would seal the bar and fight with its houses. New buildings stand outside the area.
    visual.json.nodes.forEach(node=>{
      if(!node.name?.endsWith('_Estatico'))return;
      for(const primitive of visual.json.meshes[node.mesh].primitives){
        if(!/^(Reboco_|Telha$)/.test(visual.json.materials[primitive.material]?.name??''))continue;
        silhouettes+=retireTriangles(visual.json,visual.bin,primitive,points=>{const c=centroid(points);return inOriginal(c[0],c[2]);});
      }
    });
    // The LOD's trees and ground also cover the original neighbourhood, whose real trees and streets are always drawn.
    lod.json.nodes.forEach(node=>{
      if(!/_(Vegetacao|Chao)_LOD2$/.test(node.name??''))return;
      for(const primitive of lod.json.meshes[node.mesh].primitives)
        originalLods+=retireTriangles(lod.json,lod.bin,primitive,points=>{const c=centroid(points);return inOriginal(c[0],c[2]);});
    });
    for(const entry of [visual,lod]){entry.images.forEach(image=>textures.add(image));gltfs.push(entry);}
    // Collision.
    const glb=readGlbFile(path.join(sectorsDir,sector.arquivos.colisao),source),world=worldMatrices(glb.json);
    if(glb.json.nodes.length!==sector.colisores)fail(`${name}: ${glb.json.nodes.length} colisores, o manifesto diz ${sector.colisores}`);
    glb.json.nodes.forEach((node,index)=>{
      if(!/^COL_(Cid_|Ponto_iFood)/.test(node.name??'')||node.mesh===undefined)fail(`${name}: nó de colisão inesperado "${node.name}"`);
      if(seenIds.has(node.name))fail(`colisor ${node.name} repetido (${name})`);
      seenIds.add(node.name);
      boxes.push(squared(worldBox(glb.json,index,world)));
      const kind=node.name.replace(/\.\d+$/,'');
      if(!kinds.has(kind))kinds.set(kind,{name:kind,floor:FLOOR_ONLY.has(kind)||FLOOR_AND_SOLID.has(kind)?1:0,solid:FLOOR_ONLY.has(kind)?0:1,road:ROADS.has(kind)?1:0});
    });
    sectorData[name]={zone:sector.zona,colliders:glb.json.nodes.length};
  }
  const ring=readGltf(path.join(source,'cidade_anel.gltf'),source),far=readGltf(path.join(source,'cidade_distante.gltf'),source);
  for(const entry of [ring,far]){entry.images.forEach(image=>textures.add(image));gltfs.push(entry);}
  if(!ring.json.nodes.every(node=>/^ANEL_/.test(node.name)&&node.extras?.colisao===false))fail('cidade_anel: nó fora do padrão ANEL_* sem colisão');
  if(!['Distante_Morros_Cidade','Distante_Chao_Cidade','Distante_Panorama_Cidade'].every(id=>far.json.nodes.some(node=>node.name===id&&node.mesh!==undefined)))fail('cidade_distante incompleto');
  if(!far.json.materials.some(material=>material.name==='Ceu_Panorama'))fail('cidade_distante sem o material Ceu_Panorama');

  // What the scene says must agree with the manifest; fog and the far plane come from it.
  const fog=sceneExtras?.nevoa,farClip=sceneExtras?.camera_far_minimo_m;
  if(!(fog?.inicio_m>0)||!(fog?.fim_m>fog.inicio_m)||!(farClip>0))fail('os setores não trazem nevoa e camera_far_minimo_m nos extras da cena');
  if(String(sceneExtras.area_jogavel)!==String([origin[0],origin[1],origin[0]+span,origin[1]+span]))fail(`area_jogavel ${sceneExtras.area_jogavel} difere do manifesto`);

  const missing=REQUIRED_MARKERS.filter(id=>!markers[id]);
  if(missing.length)fail(`faltam os marcadores ${missing.join(', ')}`);
  checkLimits(boxes,bounds,size);
  // Every sector stands on its ground box, whose top is level with the streets.
  for(const name of names){
    const [x0,y0,x1,y1]=setores[name].limites_xy,cx=(x0+x1)/2,cz=-(y0+y1)/2;
    const ground=boxes.find(b=>b.name.startsWith('COL_Cid_Chao')&&Math.abs(b.x-cx)<1e-3&&Math.abs(b.z-cz)<1e-3&&Math.abs(b.lx-size/2)<1e-3&&Math.abs(b.lz-size/2)<1e-3);
    if(!ground||Math.abs(ground.maxY)>1e-3)fail(`${name}: sem COL_Cid_Chao cobrindo o setor na altura 0`);
  }
  const kindList=[...kinds.values()],kindIndex=new Map(kindList.map((kind,i)=>[kind.name,i]));
  const encoded=boxes.map(box=>{
    const suffix=/\.(\d+)$/.exec(box.name)?.[1],aligned=box.ux===1&&box.uz===0;
    // Square boxes are stored as their extents along x and z; only turned ones need the direction of their X.
    const row=[kindIndex.get(box.name.replace(/\.\d+$/,'')),suffix===undefined?-1:Number(suffix),round(box.x),round(box.z)];
    if(aligned)row.push(round(box.lx),round(box.lz));
    else if(box.ux===0&&box.uz===1)row.push(round(box.lz),round(box.lx));
    else row.push(round(box.lx),round(box.lz));
    row.push(round(box.minY),round(box.maxY));
    if(!aligned&&!(box.ux===0&&box.uz===1))row.push(+box.ux.toFixed(5),+box.uz.toFixed(5));
    return row;
  });
  const cityData={
    grid:{originX:origin[0],originY:origin[1],size,count:n},fog:{start:fog.inicio_m,end:fog.fim_m},farClip,originalArea,
    retired:{silhouettes,originalLods},lights,sectors:sectorData,markers,kinds:kindList,boxes:encoded,
  };
  const roadData={
    types:[...new Set(roads.arestas.map(edge=>edge.tipo))],names:[...new Set(roads.arestas.map(edge=>edge.nome??''))],
    nodes:roads.nos.map(([x,y])=>[round(x),round(-y)]),
  };
  roadData.edges=roads.arestas.map(edge=>[edge.a,edge.b,roadData.types.indexOf(edge.tipo),edge.largura_m,edge.canteiro_m??0,edge.mao_unica?1:0,roadData.names.indexOf(edge.nome??'')]);
  const texturesDir=path.join(source,'texturas');
  const unused=fs.readdirSync(texturesDir).filter(file=>!textures.has(path.join(texturesDir,file)));
  return {bounds,originalArea,sceneExtras,counts:{sectors:names.length,solids:boxes.length,textures:textures.size,gltfs:gltfs.length,silhouettes,originalLods,lights,markers:Object.keys(markers).length,unusedTextures:unused.length},
    /**
     * Every file is already read and validated in memory, so a missing dependency can no longer stop this half way. Each file
     * lands through a temporary name; files of the previous publication that are gone (and only those) go last. Windows refuses
     * to rename a freshly written folder for a good while (the antivirus holds it), so the folder itself is never swapped.
     */
    publish({publishDir,sharedDir}){
      const stampFile=path.join(publishDir,STAMP);
      if(fs.existsSync(publishDir)&&!fs.existsSync(stampFile))fail(`${publishDir} existe e não foi publicado por este importador; mova-o antes de importar`);
      const previous=fs.existsSync(stampFile)?Object.keys(JSON.parse(fs.readFileSync(stampFile,'utf8')).arquivos):[];
      const files=new Map();
      const put=(file,bytes)=>files.set(path.relative(source,file).replaceAll('\\','/'),bytes);
      for(const json of ['cidade_setores.json','cidade_vias.json','cidade_lotes.json','pontos_ifood.json','validacao.json'])put(path.join(source,json),fs.readFileSync(path.join(source,json)));
      for(const entry of gltfs){put(entry.file,fs.readFileSync(entry.file));put(entry.binFile,entry.bin);}
      for(const texture of textures)put(texture,fs.readFileSync(texture));
      const hashes={};
      for(const [relative,bytes] of files){
        writeIfChanged(path.join(publishDir,relative),bytes);
        hashes[relative]=createHash('sha256').update(bytes).digest('hex').slice(0,16);
      }
      writeIfChanged(stampFile,Buffer.from(`${JSON.stringify({gerado_por:'tools/assets/import-city.mjs',arquivos:hashes},null,1)}\n`));
      for(const stale of previous)if(!files.has(stale))fs.rmSync(path.join(publishDir,stale),{force:true});
      writeIfChanged(path.join(sharedDir,'city-data.json'),Buffer.from(cityDataText(cityData)));
      writeIfChanged(path.join(sharedDir,'city-roads.json'),Buffer.from(`${JSON.stringify(roadData)}\n`));
      return files.size+1;
    }};
}
/** The perimeter must be closed: on each side, segments that cover the whole map with their inner face on the limit. */
function checkLimits(boxes,bounds,size){
  for(const [side,{axis,at}] of Object.entries(LIMIT_SIDES)){
    const walls=boxes.filter(b=>b.name.replace(/\.\d+$/,'')===`COL_Cid_Limite_${side}`);
    const face=at<0?(axis==='x'?bounds.minX:bounds.minZ):(axis==='x'?bounds.maxX:bounds.maxZ);
    const [from,to]=axis==='x'?[bounds.minZ,bounds.maxZ]:[bounds.minX,bounds.maxX];
    const spans=walls.map(wall=>{
      const across=axis==='x'?wall.x:wall.z,half=axis==='x'?wall.lx:wall.lz,alongAt=axis==='x'?wall.z:wall.x,alongHalf=axis==='x'?wall.lz:wall.lx;
      if(Math.abs(across-at*half-face)>.01)fail(`${wall.name}: a face interna não está no limite ${face}`);
      return [alongAt-alongHalf,alongAt+alongHalf];
    }).sort((a,b)=>a[0]-b[0]);
    let reached=from;
    for(const [a,b] of spans){if(a>reached+.01)break;reached=Math.max(reached,b);}
    if(reached<to-.01)fail(`COL_Cid_Limite_${side} não cobre o lado inteiro: buraco a partir de ${reached} (${walls.length} segmentos, setores de ${size} m)`);
  }
}
function cityDataText({boxes,...rest}){
  const head=JSON.stringify(rest,null,1).replace(/\n}$/,'');
  return `${head},\n "boxes": [\n${boxes.map(row=>`  ${JSON.stringify(row)}`).join(',\n')}\n ]\n}\n`;
}
/**
 * What did not change is not touched: a file being served stays put, and the dev server's watchers (which would restart the world
 * and drop whoever is playing) see nothing. What did change lands through a temporary name.
 */
export function writeIfChanged(file,bytes){
  if(fs.existsSync(file)&&fs.readFileSync(file).equals(bytes))return false;
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const temporary=`${file}.tmp`;
  fs.writeFileSync(temporary,bytes);
  try{renameRetrying(temporary,file);}
  catch(error){
    fs.rmSync(temporary,{force:true});
    fail(`não foi possível substituir ${file} (${error.code}): algum processo está com o arquivo aberto; feche a aba do jogo e importe de novo`);
  }
  return true;
}
/** Windows refuses to replace a file while something reads it (a browser loading it, the antivirus), usually for a moment. */
function renameRetrying(from,to){
  for(let attempt=0;;attempt++){
    try{fs.renameSync(from,to);return;}
    catch(error){
      if(attempt>=20||!['EPERM','EBUSY','EACCES'].includes(error.code))throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,500);
    }
  }
}
/**
 * bar_boteco.glb is the export from before the city, and still has the 120 sawhorses and cones (96 + 24, 07_exterior.py) that
 * closed the streets at the old limit, fused into Mapa_Bairro. The published copy collapses exactly those triangles; a new export
 * from the city's .blend no longer has them and comes through untouched. Anything else near those lines makes it fail.
 */
export function publishedBaseMap(glb,extras){
  const bytes=Buffer.from(glb.bytes),bin=bytes.subarray(glb.binStart),{json}=glb;
  const counts=Object.fromEntries(Object.keys(OLD_BARRIER_TRIANGLES).map(name=>[name,0]));
  const node=json.nodes.find(n=>n.name==='Mapa_Bairro');
  if(node){
    const [ax0,ay0,ax1,ay1]=extras.area_jogavel_bairro_antigo,lines={x:[ax0+.6,ax1-.6],z:[-(ay0+.6),-(ay1-.6)]};
    const nearLine=(x,z)=>Math.min(...lines.x.map(v=>Math.abs(x-v)),...lines.z.map(v=>Math.abs(z-v)))<=2;
    const primitives=json.meshes[node.mesh].primitives,material=p=>json.materials[p.material]?.name,cones=[];
    for(const primitive of primitives){
      const name=material(primitive);
      if(!['Atlas_Bairro','Metal_Branco','Plastico_Laranja'].includes(name))continue;
      counts[name]+=retireTriangles(json,bin,primitive,points=>{
        const [x,y,z]=centroid(points),hit=y>.05&&y<1&&nearLine(x,z);
        if(hit&&name==='Plastico_Laranja'&&!cones.some(c=>Math.hypot(c[0]-x,c[1]-z)<.3))cones.push([x,z]);
        return hit;
      });
    }
    // The cones' rubber feet lie flat on the street, among the parked cars' tyres: only under a cone (a square of 40 cm whose
    // corners are at most .28 m from its axis; `cones` holds the middle of one side face, up to .12 m off the axis).
    const rubber=primitives.find(p=>material(p)==='Borracha_Preta');
    if(rubber)counts.Borracha_Preta+=retireTriangles(json,bin,rubber,points=>points.every(p=>p[1]<.05&&cones.some(c=>Math.hypot(c[0]-p[0],c[1]-p[2])<.45)));
    const total=Object.values(counts).reduce((a,b)=>a+b,0);
    if(total&&Object.entries(OLD_BARRIER_TRIANGLES).some(([name,expected])=>counts[name]!==expected))
      fail(`cavaletes antigos: esperados ${JSON.stringify(OLD_BARRIER_TRIANGLES)}, encontrados ${JSON.stringify(counts)}`);
  }
  return {bytes,counts};
}
/** What 17_lugares_animacao.py adds to the bar map, and the game counts on. */
const BAR_PIECES=['Freezer_Bar_Tampa','Copo_Bandeja','Balcao_Lugar_Magrao','Balcao_Entrega','Mictorio_Lugar_1','Mictorio_Lugar_2','Mictorio_Lugar_3'];
/** Where they stand inside Bar_Mobilia: [minX,maxX,minY,maxY,minZ,maxZ]. Only these materials there are the freezer's and the tray's, not the counter's. */
const FREEZER_BOX=[19.5,20.9,.25,1.6,-5.95,-5.1],TRAY_BOX=[17.72,18.04,1.05,1.35,-8.88,-8.44];
/** The bar freezer (06_interior.py at 20.2, 5.53, turned 180°): inside its walls, and under its lid (36_bar_polimento.py P_Freezer). */
const FREEZER_INSIDE={minX:19.58,maxX:20.82,minZ:-5.83,maxZ:-5.23,x:20.2,z:-5.53},BODY_TOP=1.075,LID_Y=1.079;
const inBox=([x,y,z],[x0,x1,y0,y1,z0,z1])=>x>x0&&x<x1&&y>y0&&y<y1&&z>z0&&z<z1;
const normalOf=([a,b,c])=>new Vector3(...b).sub(new Vector3(...a)).cross(new Vector3(...c).sub(new Vector3(...a))).normalize();
/** Of the exported freezer: its lid and handle, which become the Freezer_Bar_Tampa that opens. */
const isLid=(material,points)=>{const c=centroid(points);return ['Plastico_Branco','Metal_Escuro'].includes(material)&&inBox(c,FREEZER_BOX)&&c[1]>LID_Y;};
/** What the exported freezer loses: the lid, and the top of its solid body, so it opens onto the inside. */
const isClosed=(material,points)=>isLid(material,points)||material==='Plastico_Branco'&&inBox(centroid(points),FREEZER_BOX)&&Math.abs(centroid(points)[1]-BODY_TOP)<.003&&normalOf(points).y>.9;
/** What the donor gives: the tray, and the freezer's inside (ice, lining, the inner faces of its walls, the rubber rim). */
const isInside=(material,points)=>{
  const c=centroid(points);
  if(['Copo_Vidro','Borracha_Preta'].includes(material)&&inBox(c,TRAY_BOX))return true;
  if(!inBox(c,FREEZER_BOX))return false;
  if(['Gelo_Freezer','Freezer_Interno'].includes(material))return true;
  if(material==='Borracha_Preta')return c[1]>BODY_TOP-.005;
  if(material!=='Plastico_Branco'||c[0]<FREEZER_INSIDE.minX||c[0]>FREEZER_INSIDE.maxX||c[2]<FREEZER_INSIDE.minZ||c[2]>FREEZER_INSIDE.maxZ)return false;
  const n=normalOf(points);
  return Math.abs(n.y)<.1&&n.x*(FREEZER_INSIDE.x-c[0])+n.z*(FREEZER_INSIDE.z-c[2])>0;
};
/**
 * A bar map exported from a .blend where 17_lugares_animacao.py did not run (the exports of 2026-11-01 and 11-02) has a closed freezer, no
 * tray of glasses and no places for Magrão and the urinals. The published copy opens the exported freezer (its lid becomes Freezer_Bar_Tampa)
 * and takes the rest from the last export that has them (donor): the freezer's inside and the tray out of its Bar_Mobilia, the long necks in
 * the freezer, and the other six nodes. The rest stays as exported; a map that has them goes through untouched.
 */
export function withBarPieces(glb,donor){
  const missing=BAR_PIECES.filter(name=>!glb.json.nodes.some(node=>node.name===name));
  if(!missing.length)return glb;
  if(missing.length<BAR_PIECES.length)fail(`bar_boteco.glb tem só parte das peças do 17_lugares_animacao.py: faltam ${missing.join(', ')}`);
  const from=donor(),json=structuredClone(glb.json),source=Buffer.from(glb.bin),chunks=[source],copied=new Map();
  let end=source.length;
  const append=(bytes,target)=>{
    const padding=(4-end%4)%4;
    chunks.push(Buffer.alloc(padding),bytes);
    const bufferView=json.bufferViews.push({buffer:0,byteOffset:end+padding,byteLength:bytes.length,...(target?{target}:{})})-1;
    end+=padding+bytes.length;
    return bufferView;
  };
  const floats=(values,type)=>{
    const bytes=Buffer.alloc(values.length*4);
    values.forEach((value,i)=>bytes.writeFloatLE(value,i*4));
    return json.accessors.push({bufferView:append(bytes),componentType:5126,count:values.length/ITEMS[type],type})-1;
  };
  const material=index=>{
    const wanted=from.json.materials[index],found=json.materials.findIndex(entry=>entry.name===wanted.name);
    if(found>=0)return found;
    if(JSON.stringify(wanted).includes('"index"'))fail(`o material ${wanted.name} das peças do bar tem textura`);
    return json.materials.push(wanted)-1;
  };
  const accessor=index=>{
    if(copied.has(index))return copied.get(index);
    const {byteOffset=0,...entry}=from.json.accessors[index],view=from.json.bufferViews[entry.bufferView],itemSize=COMPONENTS[entry.componentType][0]*ITEMS[entry.type],length=entry.count*itemSize;
    if(view.byteStride&&view.byteStride!==itemSize)fail('peças do bar com vértices intercalados');
    const start=(view.byteOffset??0)+byteOffset;
    const copy=json.accessors.push({...entry,bufferView:append(from.bin.subarray(start,start+length),view.target)})-1;
    copied.set(index,copy);
    return copy;
  };
  const mesh=index=>({...from.json.meshes[index],primitives:from.json.meshes[index].primitives.map(primitive=>({...primitive,material:material(primitive.material),indices:accessor(primitive.indices),
    attributes:Object.fromEntries(Object.entries(primitive.attributes).map(([name,value])=>[name,accessor(value)]))}))});
  const named=(entry,name)=>entry.nodes.find(node=>node.name===name)??fail(`${name} não existe na fonte das peças do bar`);
  /**
   * The triangles of `primitive` that `keep` chooses, with the vertices they use, as a new primitive of the published copy. `place`
   * moves positions and turns normals (into a node's own frame); `materialIndex` is the copy's material.
   */
  const subset=(entry,primitive,keep,materialIndex,place)=>{
    const name=entry.json.materials[primitive.material].name;
    const positions=accessorValues(entry.json,entry.bin,primitive.attributes.POSITION),indices=accessorValues(entry.json,entry.bin,primitive.indices),kept=new Map(),triangles=[];
    for(let i=0;i<indices.length;i+=3){
      const corners=indices.slice(i,i+3);
      if(keep(name,corners.map(v=>positions.slice(v*3,v*3+3))))for(const v of corners){if(!kept.has(v))kept.set(v,kept.size);triangles.push(kept.get(v));}
    }
    if(!triangles.length)return null;
    const attributes=Object.fromEntries(Object.entries(primitive.attributes).map(([attribute,index])=>{
      const accessor=entry.json.accessors[index],items=ITEMS[accessor.type],values=accessorValues(entry.json,entry.bin,index);
      if(accessor.componentType!==5126)fail(`atributo ${attribute} das peças do bar não é float`);
      let picked=[...kept.keys()].flatMap(v=>values.slice(v*items,v*items+items));
      if(place&&['POSITION','NORMAL'].includes(attribute))picked=Array.from({length:picked.length/3},(_,i)=>place[attribute](new Vector3(...picked.slice(i*3,i*3+3))).toArray()).flat();
      const copy=floats(picked,accessor.type);
      if(attribute==='POSITION'){
        const axes=[0,1,2].map(axis=>picked.filter((_,i)=>i%3===axis));
        Object.assign(json.accessors[copy],{min:axes.map(values=>Math.min(...values)),max:axes.map(values=>Math.max(...values))});
      }
      return [attribute,copy];
    }));
    const wide=kept.size>65535,bytes=Buffer.alloc(triangles.length*(wide?4:2));
    triangles.forEach((v,i)=>wide?bytes.writeUInt32LE(v,i*4):bytes.writeUInt16LE(v,i*2));
    const index=json.accessors.push({bufferView:append(bytes,34963),componentType:wide?5125:5123,count:triangles.length,type:'SCALAR'})-1;
    return {attributes,indices:index,material:materialIndex};
  };
  const furniture=json.meshes[named(json,'Bar_Mobilia').mesh],exportedFurniture=furniture.primitives.slice();
  // The exported lid, read before the furniture loses it, in the frame of the donor's Freezer_Bar_Tampa (its hinge, where it turns).
  const hinge=named(from.json,'Freezer_Bar_Tampa'),turn=new Quaternion(...(hinge.rotation??[0,0,0,1])),back=turn.clone().invert(),at=new Vector3(...(hinge.translation??[0,0,0]));
  if(hinge.scale||from.json.nodes.some(node=>node.children?.includes(from.json.nodes.indexOf(hinge))))fail('Freezer_Bar_Tampa da fonte não é um nó raiz sem escala');
  const lid=exportedFurniture.map(primitive=>subset(glb,primitive,isLid,primitive.material,{POSITION:p=>p.sub(at).applyQuaternion(back),NORMAL:n=>n.applyQuaternion(back)})).filter(Boolean);
  if(!lid.length)fail('o freezer do bar_boteco.glb não tem tampa acima do corpo');
  for(const primitive of exportedFurniture)retireTriangles(json,source,primitive,points=>isClosed(json.materials[primitive.material].name,points));
  for(const primitive of from.json.meshes[named(from.json,'Bar_Mobilia').mesh].primitives){
    const inside=subset(from,primitive,isInside,undefined);
    if(inside)furniture.primitives.push({...inside,material:material(primitive.material)});
  }
  // The long necks standing in the hollow freezer are instances: they join the map's.
  const necks=named(json,'INST_A_long-neck'),neckDonor=named(from.json,'INST_A_long-neck');
  if(necks.translation||neckDonor.translation)fail('INST_A_long-neck fora da origem');
  const instancing=node=>node.extensions.EXT_mesh_gpu_instancing.attributes,own=instancing(necks),given=instancing(neckDonor);
  const places=accessorValues(from.json,from.bin,given.TRANSLATION),inFreezer=[];
  for(let i=0;i<places.length/3;i++)if(inBox(places.slice(i*3,i*3+3),FREEZER_BOX))inFreezer.push(i);
  for(const [name,type] of [['TRANSLATION','VEC3'],['ROTATION','VEC4'],['SCALE','VEC3']]){
    const items=ITEMS[type];
    const values=given[name]===undefined?null:accessorValues(from.json,from.bin,given[name]),kept=own[name]===undefined?null:accessorValues(json,source,own[name]);
    if(!values||!kept)fail(`INST_A_long-neck sem ${name}`);
    own[name]=floats([...kept,...inFreezer.flatMap(i=>values.slice(i*items,i*items+items))],type);
  }
  for(const name of BAR_PIECES){
    const node=structuredClone(named(from.json,name));
    if(name==='Freezer_Bar_Tampa')node.mesh=json.meshes.push({name:'P_Freezer_Bar_Tampa',primitives:lid})-1;
    else if(node.mesh!==undefined)node.mesh=json.meshes.push(mesh(node.mesh))-1;
    json.scenes[json.scene??0].nodes.push(json.nodes.push(node)-1);
  }
  chunks.push(Buffer.alloc((4-end%4)%4));
  const bin=Buffer.concat(chunks);
  json.buffers[0].byteLength=bin.length;
  let text=Buffer.from(JSON.stringify(json));
  text=Buffer.concat([text,Buffer.alloc((4-text.length%4)%4,0x20)]);
  const header=Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+text.length+bin.length,8);header.writeUInt32LE(text.length,12);header.writeUInt32LE(0x4e4f534a,16);
  const binHeader=Buffer.alloc(8);
  binHeader.writeUInt32LE(bin.length,0);binHeader.writeUInt32LE(0x004e4942,4);
  return {...glb,json,bin,bytes:Buffer.concat([header,text,binHeader,bin]),restored:BAR_PIECES};
}
export {readGlbFile};
