import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync,statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  CITY_FAR_CLIP,CITY_FLOORS,CITY_FOG,CITY_GRID,CITY_MARKERS,CITY_ORIGINAL_AREA,CITY_SECTORS,CITY_SOLIDS,COLLIDERS,MAP_COLLIDERS,MAP_MARKERS,WORLD,
  boxContains,cityZone,floorHeight,findSpawn,isWalkable,movePlayer,parkedMoto,roadHeight,sectorAt,sectorBounds,sectorDistance,sectorName,solidsBetween,stepMoto,
  type MotoBody,type Position,
} from '@bar/shared';
import {ROAD_EDGES,ROAD_NODES,nearestRoadNode,roadRoute} from '@bar/shared/city-roads';
import cityData from '../../packages/shared/src/city-data.json';

const root=fileURLToPath(new URL('../../',import.meta.url));
const published=path.join(root,'apps/web/public/maps/cidade'),source=path.join(root,'assets-bar/map/BarBoteco/export/cidade');
const factorySource=path.join(root,'assets-bar/map/BarBoteco/export/empresa_brasil');
const manifest=JSON.parse(readFileSync(path.join(published,'cidade_setores.json'),'utf8'));
const walkFiles=(dir:string):string[]=>readdirSync(dir).flatMap(name=>{const file=path.join(dir,name);return statSync(file).isDirectory()?walkFiles(file):[file];});
const gltf=(relative:string,dir=published)=>{
  const json=JSON.parse(readFileSync(path.join(dir,relative),'utf8'));
  return {json,bin:readFileSync(path.join(dir,path.dirname(relative),json.buffers[0].uri))};
};
function triangles(entry:{json:any;bin:Buffer},primitive:any):number[][][] {
  const read=(index:number)=>{
    const a=entry.json.accessors[index],view=entry.json.bufferViews[a.bufferView],size={5123:2,5125:4,5126:4,5121:1}[a.componentType as number]!,items=({SCALAR:1,VEC3:3} as any)[a.type] as number;
    const method=({5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE',5121:'readUInt8'} as any)[a.componentType] as 'readFloatLE',base=(view.byteOffset??0)+(a.byteOffset??0),stride=view.byteStride??size*items;
    return Array.from({length:a.count*items},(_,i)=>entry.bin[method](base+Math.floor(i/items)*stride+(i%items)*size));
  };
  const positions=read(primitive.attributes.POSITION),indices=read(primitive.indices),out:number[][][]=[];
  for(let i=0;i<indices.length;i+=3){
    if(indices[i]===indices[i+1]&&indices[i]===indices[i+2])continue;
    out.push([0,1,2].map(k=>[positions[indices[i+k]!*3]!,positions[indices[i+k]!*3+1]!,positions[indices[i+k]!*3+2]!]));
  }
  return out;
}
const inOriginal=(x:number,z:number)=>x>CITY_ORIGINAL_AREA.minX&&x<CITY_ORIGINAL_AREA.maxX&&z>CITY_ORIGINAL_AREA.minZ&&z<CITY_ORIGINAL_AREA.maxZ;

test('EMPRESA BRASIL entrega os 48 marcadores e as 25 vagas sem coordenadas inventadas',()=>{
  const markers=JSON.parse(readFileSync(path.join(factorySource,'empresa_brasil_marcadores.json'),'utf8'));
  const stock=JSON.parse(readFileSync(path.join(factorySource,'empresa_brasil_estoque.json'),'utf8'));
  assert.equal(markers.n,48);assert.equal(Object.keys(markers.marcadores).length,48);assert.equal(stock.vagas.length,25);
  for(const slot of stock.vagas){
    assert.ok(markers.marcadores[slot.marcador],slot.marcador);assert.equal(slot.capacidade,18);
    assert.deepEqual(slot.jogo_xyz,markers.marcadores[slot.marcador].xyz_jogo,`${slot.marcador}: a vaga e o marcador usam a mesma posição`);
  }
  for(const name of ['Ponto_EB_Portao','Ponto_EB_Doca','Ponto_EB_Entrada_Pessoal','Ponto_EB_Painel','Ponto_EB_Secador_Topo','Ponto_EB_Ensaque_Saida'])assert.ok(markers.marcadores[name],name);
});
const centroid=(t:number[][])=>[(t[0]![0]!+t[1]![0]!+t[2]![0]!)/3,(t[0]![2]!+t[1]![2]!+t[2]![2]!)/3] as const;

test('the manifest describes 64 sectors of 100 m in an 8 × 8 grid, from -400 to +400',()=>{
  assert.equal(manifest.n,8);assert.equal(manifest.setor_m,100);assert.deepEqual(manifest.origem_xy,[-400,-400]);
  assert.equal(Object.keys(manifest.setores).length,64);
  assert.deepEqual([CITY_GRID.count,CITY_GRID.size,CITY_GRID.originX,CITY_GRID.originY],[8,100,-400,-400]);
  assert.deepEqual(WORLD,{minX:-400,maxX:400,minZ:-400,maxZ:400});
  for(const cell of CITY_SECTORS){
    const entry=manifest.setores[sectorName(cell)],b=sectorBounds(cell),[x0,y0,x1,y1]=entry.limites_xy;
    assert.deepEqual([b.minX,b.maxX,b.minZ,b.maxZ].map(v=>v+0),[x0,x1,-y1,-y0].map(v=>v+0),sectorName(cell));
  }
});

test('every sector publishes its visual, LOD and their buffers; URIs stay inside the folder and find their files',()=>{
  const seen=new Set<string>();
  const check=(relative:string)=>{
    assert.ok(existsSync(path.join(published,relative)),relative);
    const {json}=gltf(relative),dir=path.dirname(path.join(published,relative));
    for(const asset of [...json.buffers,...(json.images??[])]){
      const uri:string=asset.uri;
      assert.ok(uri&&!/^[a-z]+:/i.test(uri)&&!uri.startsWith('/')&&!uri.includes('\\'),`${relative}: ${uri} is relative`);
      const file=path.resolve(dir,decodeURI(uri)),inside=path.relative(published,file);
      assert.ok(!inside.startsWith('..')&&!path.isAbsolute(inside),`${relative}: ${uri} stays in the folder`);
      assert.ok(existsSync(file),`${relative}: ${uri} exists`);
      if(asset.byteLength)assert.equal(statSync(file).size,asset.byteLength,`${relative}: ${uri} has its length`);
      seen.add(inside.replaceAll('\\','/'));
    }
  };
  for(const entry of Object.values<any>(manifest.setores)){
    check(`setores/${entry.arquivos.visual}`);check(`setores/${entry.arquivos.lod}`);
    assert.ok(existsSync(path.join(source,'setores',entry.arquivos.colisao)),entry.arquivos.colisao);
  }
  check('cidade_anel.gltf');check('cidade_distante.gltf');
  const textures=[...seen].filter(file=>file.startsWith('texturas/'));
  assert.equal(textures.length,60,'the 60 shared textures, including EMPRESA BRASIL');
  assert.ok(seen.has('texturas/atlas_cidade.jpg'));
});

test('only what the game runs on is published, and the publication lists all of it',()=>{
  const files=walkFiles(published).map(file=>path.relative(published,file).replaceAll('\\','/'));
  assert.deepEqual(files.filter(file=>/\.(md|blend|py|tmp)$|capturas|colisao/.test(file)||(file.endsWith('.png')&&!file.startsWith('texturas/'))),[]);
  const stamp=JSON.parse(readFileSync(path.join(published,'cidade_publicacao.json'),'utf8'));
  assert.deepEqual(Object.keys(stamp.arquivos).sort(),files.filter(file=>file!=='cidade_publicacao.json').sort());
  for(const name of ['cidade_setores.json','cidade_vias.json','cidade_lotes.json','pontos_ifood.json','validacao.json','cidade_anel.gltf','cidade_anel.bin','cidade_distante.gltf','cidade_distante.bin'])assert.ok(files.includes(name),name);
});

test('the ring and the far backdrop keep to their design: no collision, far hills and the panorama that ignores the fog',()=>{
  const ring=gltf('cidade_anel.gltf').json,far=gltf('cidade_distante.gltf').json;
  assert.equal(ring.nodes.length,8);assert.ok(ring.nodes.every((node:any)=>/^ANEL_/.test(node.name)&&node.extras.colisao===false));
  assert.deepEqual(far.nodes.map((node:any)=>node.name).sort(),['Distante_Chao_Cidade','Distante_Morros_Cidade','Distante_Panorama_Cidade']);
  assert.ok(far.materials.some((material:any)=>material.name==='Ceu_Panorama'));
  const reach=Math.max(...far.accessors.flatMap((accessor:any)=>accessor.type==='VEC3'&&accessor.max?[Math.abs(accessor.max[0]),Math.abs(accessor.max[2])]:[]));
  assert.ok(reach<=CITY_FAR_CLIP,`far plane ${CITY_FAR_CLIP} m reaches the backdrop at ${reach} m`);
  assert.deepEqual(CITY_FOG,{start:90,end:650});assert.equal(CITY_FAR_CLIP,1700);
  assert.equal(CITY_SOLIDS.some(c=>/ANEL|Distante/.test(c.id)),false);
});

test('no sector draws the original neighbourhood again: silhouettes and LOD ground and trees are left out where it stands',()=>{
  let silhouettes=0,sourceSilhouettes=0;
  for(const cell of CITY_SECTORS){
    const name=sectorName(cell),entry=manifest.setores[name];
    const visual=gltf(`setores/${entry.arquivos.visual}`),original=gltf(`setores/${entry.arquivos.visual}`,source);
    assert.equal(visual.bin.length,original.bin.length,`${name}: the published buffer keeps its layout`);
    for(const [from,target] of [[visual,'published'],[original,'source']] as const)for(const node of from.json.nodes)if(node.name?.endsWith('_Estatico'))for(const primitive of from.json.meshes[node.mesh].primitives){
      if(!/^(Reboco_|Telha$)/.test(from.json.materials[primitive.material]?.name??''))continue;
      const inside=triangles(from,primitive).filter(t=>inOriginal(...centroid(t))).length;
      if(target==='published')silhouettes+=inside;else sourceSilhouettes+=inside;
    }
    const lod=gltf(`setores/${entry.arquivos.lod}`);
    for(const node of lod.json.nodes)if(/_(Vegetacao|Chao)_LOD2$/.test(node.name))for(const primitive of lod.json.meshes[node.mesh].primitives)
      assert.equal(triangles(lod,primitive).filter(t=>inOriginal(...centroid(t))).length,0,`${name}: ${node.name}`);
  }
  assert.equal(silhouettes,0,'nothing is left of them');
  assert.equal(sourceSilhouettes,cityData.retired.silhouettes,'the export keeps them: only the published copy drops them');
  assert.equal(sourceSilhouettes,0,'the current Blender export no longer contains retired silhouettes');
  // The new paint around the square stays.
  const bar=gltf('setores/cidade_S04_04.gltf'),paint=bar.json.meshes[0].primitives.filter((p:any)=>/Pintura/.test(bar.json.materials[p.material].name));
  assert.ok(paint.flatMap((p:any)=>triangles(bar,p)).length>=30,'S04_04 keeps its road paint');
  // Not one wall of a new building in the bar's lot.
  const walls=bar.json.meshes[0].primitives.flatMap((p:any)=>triangles(bar,p).filter(t=>t.some(v=>v[1]!>.5)));
  assert.equal(walls.length,0,'S04_04 has nothing standing');
});

test('the bar map is published as exported, plus what 17_lugares_animacao.py adds when the export lacks it',()=>{
  const glb=(file:string)=>{const bytes=readFileSync(file),size=bytes.readUInt32LE(12);return {bytes,json:JSON.parse(bytes.subarray(20,20+size).toString()),start:28+size};};
  const exportFile=path.join(root,'assets-bar/map/BarBoteco/export/bar_boteco.glb'),served=glb(path.join(root,'apps/web/public/maps/bar_boteco.glb')),exported=existsSync(exportFile)?glb(exportFile):served;
  const pieces=['Freezer_Bar_Tampa','Copo_Bandeja','Balcao_Lugar_Magrao','Balcao_Entrega','Mictorio_Lugar_1','Mictorio_Lugar_2','Mictorio_Lugar_3'];
  const furniture=exported.json.nodes.find((n:any)=>n.name==='Bar_Mobilia').mesh;
  // Since the export of 2026-11-02 "b", script 17 ran in Blender: nothing is grafted and the map is served as exported.
  if(pieces.every(name=>exported.json.nodes.some((n:any)=>n.name===name)))assert.ok(served.bytes.equals(exported.bytes),'the export, byte for byte');
  else{
    // The long necks in the hollow freezer join the map's instances: that node alone points elsewhere.
    const necks=exported.json.nodes.findIndex((n:any)=>n.name==='INST_A_long-neck'),without=(nodes:any[])=>nodes.filter((_,index)=>index!==necks);
    assert.deepEqual(without(served.json.nodes.slice(0,exported.json.nodes.length)),without(exported.json.nodes),'the exported nodes, in their order');
    const instances=served.json.accessors[served.json.nodes[necks].extensions.EXT_mesh_gpu_instancing.attributes.TRANSLATION].count;
    assert.equal(instances,exported.json.accessors[exported.json.nodes[necks].extensions.EXT_mesh_gpu_instancing.attributes.TRANSLATION].count+59,'the 59 long necks in the freezer');
    // The exported buffer byte for byte, but for the closed freezer's indices in the furniture, retired.
    const exportedBuffer=exported.bytes.subarray(exported.start),servedBuffer=served.bytes.subarray(served.start,served.start+exportedBuffer.length);
    const indexBytes=exported.json.meshes[furniture].primitives.map((p:any)=>{const a=exported.json.accessors[p.indices],view=exported.json.bufferViews[a.bufferView],start=(view.byteOffset??0)+(a.byteOffset??0);return [start,start+a.count*(a.componentType===5125?4:2)];});
    for(let i=0;i<exportedBuffer.length;i++)if(exportedBuffer[i]!==servedBuffer[i])assert.ok(indexBytes.some(([from,to]:number[])=>i>=from!&&i<to!),`byte ${i} of the exported buffer changed outside the furniture's indices`);
    exported.json.meshes.forEach((mesh:any,index:number)=>{if(index!==furniture)assert.deepEqual(served.json.meshes[index],mesh,mesh.name);});
    const lid=served.json.meshes[served.json.nodes.find((n:any)=>n.name==='Freezer_Bar_Tampa').mesh];
    assert.deepEqual(lid.primitives.map((p:any)=>served.json.materials[p.material].name).sort(),['Metal_Escuro','Plastico_Branco'],'the lid is the exported freezer\'s own, handle included');
  }
  for(const name of pieces)assert.ok(served.json.nodes.some((n:any)=>n.name===name),name);
  const entry={json:served.json,bin:served.bytes.subarray(served.start) as Buffer},allOf=(mesh:any,name:string)=>mesh.primitives.filter((p:any)=>served.json.materials[p.material].name===name).flatMap((p:any)=>triangles(entry,p));
  assert.ok(allOf(served.json.meshes[furniture],'Copo_Vidro').length>0,'the tray of glasses');
  assert.ok(allOf(served.json.meshes[furniture],'Gelo_Freezer').length>0,'the hollow freezer');
  assert.ok(allOf(served.json.meshes[furniture],'Geladeira_Latas').length>0,'the exported furniture stays: the new fridges');
  assert.ok(allOf(served.json.meshes[furniture],'Pgn_Metal_Preto').length>0,'the exported furniture stays: the new railing');
  const mesh=served.json.meshes[served.json.nodes.find((n:any)=>n.name==='Mapa_Bairro').mesh],at=(name:string)=>allOf(mesh,name) as number[][][];
  const nearOldLimit=(t:number[][])=>{const [x,z]=centroid(t);return Math.min(Math.abs(x+102.4),Math.abs(x-134.4),Math.abs(z-90.4),Math.abs(z+116.4))<=2;};
  assert.equal(at('Plastico_Laranja').filter(t=>nearOldLimit(t)&&t[0]![1]!<1).length,0,'no cone');
  assert.equal(at('Atlas_Bairro').filter(t=>nearOldLimit(t)&&t[0]![1]!>.1&&t[0]![1]!<1).length,0,'no sawhorse');
  assert.ok(at('Plastico_Laranja').length>0,'the other orange things stay');
});

test('the 23 iFood pickup points stand where pontos_ifood.json says, are solid, and their sectors find the textures',()=>{
  const {pontos}=JSON.parse(readFileSync(path.join(published,'pontos_ifood.json'),'utf8'));
  assert.equal(pontos.length,23);
  for(const point of pontos){
    const [x,,z]=point.pos_gltf,solid=[...CITY_SOLIDS,...MAP_COLLIDERS].find(c=>c.id===point.colisor);
    assert.ok(solid,point.colisor);
    assert.ok(Math.hypot(solid!.x-x,solid!.z-z)<.1,`${point.colisor} at the point`);
    assert.equal(isWalkable(x,z,.15),false,`${point.nome} blocks the way`);
    assert.ok(isWalkable(x+point.frente_gltf[0]*1.2,z+point.frente_gltf[2]*1.2,.15),`${point.nome} has free pavement at its front`);
  }
  const atlas=(sector:string)=>gltf(`setores/cidade_${sector}.gltf`).json.images.map((image:any)=>image.uri);
  for(const point of pontos.slice(1))for(const name of ['ponto_ifood_atlas','ponto_ifood_escovado','ponto_ifood_pintura','ponto_ifood_pintura_n'])
    assert.ok(atlas(point.setor).includes(`../texturas/${name}.jpg`),`${point.setor}: ${name}`);
});

test('the 64 collision files reach the shared data: walls as solids, ground as floors, none of it twice',()=>{
  let total=0;
  for(const [name,entry] of Object.entries<any>(manifest.setores)){
    total+=entry.colisores;
    assert.equal((cityData.sectors as any)[name].colliders,entry.colisores,name);
  }
  assert.equal(total,7612);
  assert.equal(cityData.boxes.length,7612);
  const ids=CITY_SOLIDS.map(c=>c.id);
  assert.equal(new Set(ids).size,ids.length,'unique ids');
  for(const kind of ['Casa','Muro','Arvore','Poste','Galpao','Limite_Norte'])assert.ok(ids.some(id=>id.startsWith(`COL_Cid_${kind}`)),kind);
  for(const kind of ['Chao','Calcada','Quadra','Canteiro'])assert.equal(ids.some(id=>id.startsWith(`COL_Cid_${kind}`)),false,`${kind} is a floor, no wall`);
  const floorBoxes=CITY_FLOORS.length/2;
  assert.equal(floorBoxes+ids.filter(id=>/^COL_Cid_(Plato|Plataforma)/.test(id)).length*-1+ids.length,7612,'solids + floors = every box');
  // The bar's own stays apart, whole, without the old limits.
  assert.equal(MAP_COLLIDERS.length,1473);
  assert.equal(MAP_COLLIDERS.some(c=>c.id.startsWith('COL_Rua_Limite')),false);
  assert.equal(COLLIDERS.filter(c=>c.id.startsWith('COL_Mob_Mesa')).length,MAP_COLLIDERS.filter(c=>c.id.startsWith('COL_Mob_Mesa')).length);
});

test('turned boxes collide where they really are, not at the square around them',()=>{
  const wall=CITY_SOLIDS.find(c=>c.turn&&c.turn.lx>15&&c.turn.lz<1&&Math.abs(c.turn.uz)>.05)!;
  assert.ok(wall,'a long wall turned off the grid');
  const {ux,uz,lx,lz}=wall.turn!;
  assert.ok(boxContains(wall,wall.x+ux*lx*.9,wall.z+uz*lx*.9),'near its end, along it');
  assert.ok(!boxContains(wall,wall.x-uz*(lz+.5),wall.z+ux*(lz+.5)),'beside it');
  // Inside the enclosing square, far from the real wall.
  assert.ok(!boxContains(wall,wall.x+ux*lx*.9-uz*wall.hz*.9,wall.z+uz*lx*.9+ux*wall.hz*.9)||wall.hz<lz*2);
});

test('the ground holds everywhere in the map, level with the streets, kerbs included',()=>{
  for(let x=-398;x<=398;x+=4)for(let z=-398;z<=398;z+=4){
    const y=floorHeight(x,z,0)??floorHeight(x,z,.15);
    assert.notEqual(y,undefined,`floor at ${x},${z}`);
  }
  for(const cell of CITY_SECTORS){
    const b=sectorBounds(cell);
    for(const [x,z] of [[b.minX+.5,b.minZ+.5],[b.maxX-.5,b.maxZ-.5],[(b.minX+b.maxX)/2,(b.minZ+b.maxZ)/2]] as const)
      assert.ok(floorHeight(x,z,0)!==undefined,`${sectorName(cell)} at ${x},${z}`);
  }
});

test('the bike sees the new streets as road, all along them, and they connect every neighbourhood',()=>{
  const missing:string[]=[];
  for(const edge of ROAD_EDGES){
    const [ax,az]=ROAD_NODES[edge.a]!,[bx,bz]=ROAD_NODES[edge.b]!,length=Math.hypot(bx-ax,bz-az);
    if(!length)continue;
    for(let d=0;d<=length;d+=2){
      const x=ax+(bx-ax)*d/length,z=az+(bz-az)*d/length;
      if(Math.abs(x)>398||Math.abs(z)>398)continue;
      if(roadHeight(x,z,0)===undefined&&roadHeight(x,z,.15)===undefined)missing.push(`${edge.name} ${x.toFixed(0)},${z.toFixed(0)}`);
    }
  }
  assert.deepEqual(missing.slice(0,10),[],`${missing.length} points of street without a road surface`);
  // From the kerb in front of the bar.
  const bar=nearestRoadNode(13.6,3.85);
  for(const marker of ['Bairro_Centro','Bairro_Parque_Olaria','Bairro_Jardim_Conceicao','Bairro_Distrito_Industrial']){
    const at=CITY_MARKERS[marker]!,route=roadRoute(bar,nearestRoadNode(at.x,at.z));
    assert.ok(route&&route.length>=2,`${marker} connected to the bar's street`);
  }
  // The bar's own floors stay out of bounds for it.
  assert.equal(roadHeight(10,-6,.3),undefined);
});

test('a bike rides down an avenue across sector lines, and buildings and the map\'s rim stop it',()=>{
  const ride=(start:MotoBody,seconds:number,throttle=1)=>{
    let body=start;
    for(let i=0;i<seconds*20;i++)body=stepMoto(body,{throttle,steer:0,brake:false});
    return body;
  };
  // The straightest long stretch of avenue, in the right-hand half of its width (the median has trees and lamps).
  const stretch=ROAD_EDGES.map(edge=>{
    const [ax,az]=ROAD_NODES[edge.a]!,[bx,bz]=ROAD_NODES[edge.b]!;
    return {edge,ax,az,bx,bz,length:Math.hypot(bx-ax,bz-az)};
  }).filter(s=>s.edge.type==='av'&&sectorName(sectorAt(s.ax,s.az))!==sectorName(sectorAt(s.bx,s.bz))).sort((a,b)=>b.length-a.length)[0]!;
  assert.ok(stretch,'an avenue crossing a sector line');
  const yaw=Math.atan2(stretch.bx-stretch.ax,stretch.bz-stretch.az),side=stretch.edge.width/4;
  const x=stretch.ax+Math.cos(yaw)*side,z=stretch.az-Math.sin(yaw)*side,y=roadHeight(x,z,0)!;
  const start:MotoBody=parkedMoto({id:'moto-1',x,y,z,yaw});
  const end=ride(start,stretch.length/10);
  assert.ok(Math.hypot(end.x-x,end.z-z)>stretch.length*.5,`rode ${Math.hypot(end.x-x,end.z-z).toFixed(1)} m of ${stretch.length.toFixed(1)} m on ${stretch.edge.name}`);
  // Into a building, it stops at its wall.
  const shop=CITY_SOLIDS.find(c=>c.id.startsWith('COL_Cid_Galpao')&&!c.turn)!;
  const faceZ=shop.z+shop.hz+1.2,approach={...start,x:shop.x,z:faceZ+25,yaw:Math.PI,y:floorHeight(shop.x,faceZ+25,0)??0};
  if(roadHeight(approach.x,approach.z,approach.y)!==undefined){
    const stopped=ride(approach,12);
    assert.ok(stopped.z>=shop.z+shop.hz,`stopped at the shed's wall, at ${stopped.z.toFixed(2)}`);
  }
  // At the rim, on all four sides.
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]] as const){
    let placed:MotoBody|undefined;
    for(let along=-380;along<=380&&!placed;along+=5){
      const px=dx?dx*385:along,pz=dz?dz*385:along,py=roadHeight(px,pz,0);
      if(py===undefined)continue;
      const candidate={...start,x:px,y:py,z:pz,yaw:Math.atan2(dx,dz),speed:0};
      if(Math.hypot(stepMoto(candidate,{throttle:1,steer:0,brake:false},.5).x-px,stepMoto(candidate,{throttle:1,steer:0,brake:false},.5).z-pz)>0)placed=candidate;
    }
    assert.ok(placed,`a street near the rim ${dx},${dz}`);
    const stopped=ride(placed!,25);
    assert.ok(Math.abs(stopped.x)<=400&&Math.abs(stopped.z)<=400,`kept inside at ${stopped.x},${stopped.z}`);
  }
});

test('sectors are chosen right on both sides of zero and exactly on their lines',()=>{
  const name=(x:number,z:number)=>sectorName(sectorAt(x,z));
  assert.equal(name(12,-13),'S04_04','the bar');
  assert.equal(name(0,0),'S04_04');assert.equal(name(-.01,0),'S03_04');assert.equal(name(0,.01),'S04_03');assert.equal(name(-.01,.01),'S03_03');
  assert.equal(name(0,-.01),'S04_04');
  assert.equal(name(99.99,-99.99),'S04_04');assert.equal(name(100,-99.99),'S05_04');assert.equal(name(99.99,-100),'S04_05');assert.equal(name(100,-100),'S05_05');
  assert.equal(name(-400,400),'S00_00');assert.equal(name(-400,-400),'S00_07');assert.equal(name(400,400),'S07_00');assert.equal(name(400,-400),'S07_07');
  assert.equal(name(-1000,1000),'S00_00','past the rim, the rim');assert.equal(name(1000,-1000),'S07_07');
  for(const line of [-300,-200,-100,0,100,200,300]){
    assert.equal(sectorAt(line,50).col,(line+400)/100);assert.equal(sectorAt(line-.001,50).col,(line+400)/100-1);
    assert.equal(sectorAt(50,-line).row,(line+400)/100);assert.equal(sectorAt(50,-line+.001).row,(line+400)/100-1);
  }
  assert.equal(sectorDistance({col:4,row:4},50,-50),0);assert.equal(sectorDistance({col:4,row:4},-30,-50),30);assert.equal(sectorDistance({col:4,row:4},-30,40),50);
  assert.equal(cityZone(12,-13),'Centro');assert.equal(cityZone(-350,350),'Parque Olaria');assert.equal(cityZone(-350,-350),'Jardim Conceição');assert.equal(cityZone(350,0),'Distrito Industrial');
});

test('the new markers come from the export and stand in the city; the old ones have not moved',()=>{
  const names=Object.keys(CITY_MARKERS);
  for(const id of ['Ponto_Prefeitura','Ponto_Terminal','Ponto_Escola_Conceicao','Ponto_UBS','Ponto_Praca_Conceicao','Ponto_Bosque_Conceicao','Ponto_Lazer_Olaria','Ponto_Campo_Olaria','Ponto_Supermercado','Ponto_Posto','Ponto_Subestacao','Ponto_Transportes','Ponto_Metalurgica','Bairro_Centro','Bairro_Parque_Olaria','Bairro_Jardim_Conceicao','Bairro_Distrito_Industrial'])assert.ok(names.includes(id),id);
  for(let i=1;i<=22;i++)assert.ok(names.includes(`Ponto_Onibus_${String(i).padStart(2,'0')}`),`stop ${i}`);
  assert.equal(names.length,87);
  for(const id of Object.keys(JSON.parse(readFileSync(path.join(factorySource,'empresa_brasil_marcadores.json'),'utf8')).marcadores))assert.ok(names.includes(id),id);
  for(const [id,at] of Object.entries(CITY_MARKERS))assert.ok(Math.abs(at.x)<400&&Math.abs(at.z)<400,`${id} inside the map`);
  assert.equal(CITY_MARKERS.Bairro_Centro!.label,'Centro');
  assert.deepEqual(MAP_MARKERS.Spawn_Jogador,{x:12,y:.15,z:1.6});
  assert.ok(isWalkable(MAP_MARKERS.Spawn_Jogador.x,MAP_MARKERS.Spawn_Jogador.z+.5,.15)||isWalkable(findSpawn().x,findSpawn().z,findSpawn().y));
});

/** Everything reachable on foot from the spawn, on a coarse grid; edges are checked as a body would walk them. */
function reachable(step:number):{seen:Map<string,Required<Position>>;key:(x:number,z:number)=>string} {
  const key=(x:number,z:number)=>`${Math.round(x/step)}:${Math.round(z/step)}`;
  const spawn=findSpawn() as Required<Position>,start={x:Math.round(spawn.x/step)*step,y:spawn.y,z:Math.round(spawn.z/step)*step};
  // The grid point nearest the spawn may fall on a post: settle on any free one close by.
  let first:Required<Position>|undefined;
  for(const [dx,dz] of [[0,0],[step,0],[-step,0],[0,step],[0,-step]] as const){
    const y=floorHeight(start.x+dx,start.z+dz,spawn.y);
    if(y!==undefined&&isWalkable(start.x+dx,start.z+dz,y)){first={x:start.x+dx,y,z:start.z+dz};break;}
  }
  assert.ok(first,'a grid point beside the spawn');
  const seen=new Map([[key(first.x,first.z),first]]),open=[first];
  while(open.length){
    const at=open.pop()!;
    for(const [dx,dz] of [[step,0],[-step,0],[0,step],[0,-step]] as const){
      const x=at.x+dx,z=at.z+dz,k=key(x,z);
      if(seen.has(k)||Math.abs(x)>=399||Math.abs(z)>=399)continue;
      let y=at.y,free=true;
      for(let i=1;i<=8&&free;i++){
        const px=at.x+dx*i/8,pz=at.z+dz*i/8,next=floorHeight(px,pz,y);
        if(next===undefined||!isWalkable(px,pz,next))free=false;else y=next;
      }
      if(free){const point={x,y,z};seen.set(k,point);open.push(point);}
    }
  }
  return {seen,key};
}
const walk=reachable(3);

test('from the spawn, on foot, the four neighbourhoods and every point of interest can be reached',()=>{
  assert.ok(walk.seen.size>25000,`${walk.seen.size} grid points reached on foot`);
  const near=(x:number,z:number,within=12)=>{
    for(const point of walk.seen.values())if(Math.hypot(point.x-x,point.z-z)<=within)return true;
    return false;
  };
  for(const [id,at] of Object.entries(CITY_MARKERS)){
    // The export closes the Olaria's pitch with four fences and no gate: its marker is in the middle, its stands are outside.
    if(id==='Ponto_Campo_Olaria'){assert.equal(near(at.x,at.z),false,'the pitch is still fenced in; open a gate in the export, then drop this exception');continue;}
    if(id.startsWith('Ponto_EB_')&&!['Ponto_EB_Portao','Ponto_EB_Doca','Ponto_EB_Entrada_Pessoal'].includes(id))continue;
    assert.ok(near(at.x,at.z),`${id} (${at.x},${at.z}) is reachable`);
  }
  assert.ok(near(CITY_MARKERS.Ponto_Campo_Olaria!.x,CITY_MARKERS.Ponto_Campo_Olaria!.z,25),'the pitch can be reached up to its fence');
  // All four corners of the old limit are behind us: well past each old side.
  for(const [x,z] of [[-180,-13],[210,-13],[16,-180],[16,165]] as const)assert.ok(near(x,z,35),`past the old limit, near ${x},${z}`);
});

test('the old limits no longer stop anyone: a walk leaves the old neighbourhood by each of its sides',()=>{
  const crossings=(line:number,axis:'x'|'z')=>{
    let found=0;
    for(let along=-110;along<=130;along+=1){
      const [fx,fz,tx,tz]=axis==='x'?[line-Math.sign(line)*5,along,line+Math.sign(line)*5,along]:[along,line-Math.sign(line)*5,along,line+Math.sign(line)*5];
      const y=floorHeight(fx,fz,0);
      if(y===undefined||!isWalkable(fx,fz,y))continue;
      let position:Position={x:fx,y,z:fz};
      for(let i=0;i<132;i++)position=movePlayer(position,{dx:Math.sign(tx-fx),dz:Math.sign(tz-fz),running:false});
      if(Math.hypot(position.x-tx,position.z-tz)<1)found++;
    }
    return found;
  };
  for(const [line,axis] of [[-103,'x'],[135,'x'],[-117,'z'],[91,'z']] as const)assert.ok(crossings(line,axis)>3,`crossing ${axis} = ${line}`);
});

test('walking over each sector line works, and walls on both sides of a line still stop the body',()=>{
  for(const line of [-300,-200,-100,0,100,200,300]){
    for(const axis of ['x','z'] as const){
      let crossed=false,sides=[0,0];
      for(let along=-395;along<=395;along+=1.5){
        const point=(d:number)=>axis==='x'?{x:line+d,z:along}:{x:along,z:line+d};
        const from=point(-4),y=floorHeight(from.x,from.z,0);
        if(!crossed&&y!==undefined&&isWalkable(from.x,from.z,y)){
          let position:Position={x:from.x,y,z:from.z};
          for(let i=0;i<101;i++)position=movePlayer(position,{dx:axis==='x'?1:0,dz:axis==='z'?1:0,running:false});
          const reached=point(4);
          if(Math.hypot(position.x-reached.x,position.z-reached.z)<1.5){crossed=true;assert.ok(Math.abs(position.y!-y)<.3,'no jump in height');}
        }
      }
      assert.ok(crossed,`walked across ${axis} = ${line}`);
      // A solid close to the line on each side keeps its collision, whichever sector file it came from.
      for(const solid of solidsBetween(axis==='x'?line-30:-400,axis==='x'?-400:line-30,axis==='x'?line+30:400,axis==='x'?400:line+30)){
        if(!/^COL_Cid_(Casa|Loja|Muro|Galpao|Sobrado)/.test(solid.id)||solid.turn)continue;
        const offset=(axis==='x'?solid.x:solid.z)-line;
        if(Math.abs(offset)<2||Math.abs(offset)>30)continue;
        const side=offset<0?0:1;
        if(sides[side])continue;
        const base=floorHeight(solid.x+solid.hx+1,solid.z,0)??floorHeight(solid.x+solid.hx+1,solid.z,.15);
        if(base===undefined)continue;
        assert.equal(isWalkable(solid.x,solid.z,base),false,`${solid.id} is solid`);
        sides[side]=1;
      }
      assert.deepEqual(sides,[1,1],`a wall on each side of ${axis} = ${line}`);
    }
  }
});

test('the map ends at ±400: a body stops at each side, and at each corner',()=>{
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]] as const){
    let done=false;
    for(let along=-380;along<=380&&!done;along+=4){
      // Towards a side from anywhere along it; towards a corner from the diagonal's free spots near it.
      const inset=dx&&dz?Math.abs(along)%40:0;
      const start={x:dx?dx*(392-inset):along,z:dz?dz*(392-inset):along},y=floorHeight(start.x,start.z,0)??floorHeight(start.x,start.z,.15);
      if(y===undefined||!isWalkable(start.x,start.z,y))continue;
      let position:Position={x:start.x,y,z:start.z};
      for(let i=0;i<80;i++)position=movePlayer(position,{dx,dz,running:true});
      assert.ok(Math.abs(position.x)<=400-.33&&Math.abs(position.z)<=400-.33,`inside at ${position.x},${position.z}`);
      done=true;
    }
    assert.ok(done,`found a free spot heading ${dx},${dz}`);
  }
  for(const side of ['Norte','Sul','Leste','Oeste'])assert.equal(CITY_SOLIDS.filter(c=>c.id.replace(/\.\d+$/,'')===`COL_Cid_Limite_${side}`).length,8,side);
  assert.equal(isWalkable(400.1,0),false);assert.equal(isWalkable(0,-400.1),false);
});
