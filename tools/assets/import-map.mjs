// Builds runtime collision metadata from the author's separate collision export.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Matrix4, Quaternion, Vector3, Box3 } from 'three';

const root = fileURLToPath(new URL('../../', import.meta.url));
const source = path.join(root, 'assets-bar/map/BarBoteco/export');
const destination = path.join(root, 'apps/web/public/maps');
function read(name) {
  const bytes = fs.readFileSync(path.join(source, name));
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(8) !== bytes.length) throw new Error(`Invalid GLB: ${name}`);
  const size = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + size));
  if ([...(json.images ?? []), ...(json.buffers ?? [])].some(asset => asset.uri && !asset.uri.startsWith('data:'))) throw new Error(`External dependency in ${name}`);
  return { bytes, json, bin: bytes.subarray(28 + size), hash: createHash('sha256').update(bytes).digest('hex') };
}
const visual = read('bar_boteco.glb'), collision = read('bar_boteco_colisao.glb');
const round = n => Math.round(n * 1e6) / 1e6;
function matrices(json) {
  const parents = new Map(), cache = new Map();
  json.nodes.forEach((n, i) => n.children?.forEach(c => parents.set(c, i)));
  function get(i) {
    if (cache.has(i)) return cache.get(i);
    const n = json.nodes[i];
    const local = n.matrix ? new Matrix4().fromArray(n.matrix) : new Matrix4().compose(new Vector3(...(n.translation ?? [0,0,0])), new Quaternion(...(n.rotation ?? [0,0,0,1])), new Vector3(...(n.scale ?? [1,1,1])));
    const world = parents.has(i) ? get(parents.get(i)).clone().multiply(local) : local;
    cache.set(i, world); return world;
  }
  return get;
}
const transform = matrices(collision.json), visualTransform = matrices(visual.json);
function values(resource,accessorIndex) {
  const a = resource.json.accessors[accessorIndex], view = resource.json.bufferViews[a.bufferView];
  const size = {SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type];
  if(!size)throw new Error(`Unsupported accessor type ${a.type}`);
  const component = {5123: 2, 5125: 4, 5126: 4}[a.componentType];
  const read = {5123: 'readUInt16LE', 5125: 'readUInt32LE', 5126: 'readFloatLE'}[a.componentType];
  if (!read) throw new Error('Unsupported accessor component');
  return Array.from({length: a.count}, (_, i) => Array.from({length: size}, (_, c) => resource.bin[read]((view.byteOffset ?? 0) + (a.byteOffset ?? 0) + i * (view.byteStride ?? component * size) + c * component)));
}
const colliders = [], surfaces = [];
for (let i = 0; i < collision.json.nodes.length; i++) {
  const node = collision.json.nodes[i];
  // Blender exports each movable door collider below an empty COLPORTA_* pivot. Door collision is
  // reconstructed from the visual door leaf at runtime; the empty is hierarchy, not a solid volume.
  if (node.name?.startsWith('COLPORTA_') && node.mesh === undefined) continue;
  if (!node.name?.startsWith('COL_') || node.mesh === undefined) throw new Error('Unexpected collision node');
  const box = new Box3(), isRamp = node.name.includes('Escada_Rampa');
  // Volumes people stand on: streets, floors and slabs, stairs, balconies, and the stage (15_palco.py) with its steps.
  const support = /^COL_Rua_(Quadra|Leito)/.test(node.name) || /^COL_Predio_(Piso|Laje|Escada_Rampa|Escada_Patamar|Sacada(?:\.|$))/.test(node.name)
    || /^COL_Palco(?:\.\d+)?$/.test(node.name) || /^COL_Palco_Degrau(?:\.\d+)?$/.test(node.name);
  for (const primitive of collision.json.meshes[node.mesh].primitives) {
    const points = values(collision,primitive.attributes.POSITION).map(p => new Vector3(...p).applyMatrix4(transform(i)));
    points.forEach(p => box.expandByPoint(p));
    if (support) {
      const indices = values(collision,primitive.indices).flat();
      for (let k = 0; k < indices.length; k += 3) {
        const triangle = indices.slice(k, k + 3).map(index => points[index]);
        const normal = new Vector3().subVectors(triangle[1], triangle[0]).cross(new Vector3().subVectors(triangle[2], triangle[0])).normalize();
        if (normal.y > 0.5) surfaces.push({id: node.name, points: triangle.map(p => p.toArray().map(round))});
      }
    }
  }
  const centre = box.getCenter(new Vector3()), half = box.getSize(new Vector3()).multiplyScalar(0.5);
  colliders.push({id: node.name, x: round(centre.x), z: round(centre.z), hx: round(half.x), hz: round(half.z), minY: round(box.min.y), maxY: round(box.max.y), ramp: isRamp});
}
const markerEntries=visual.json.nodes.flatMap((node,index)=>{
  if(!node.name.startsWith('Ponto_')&&node.name!=='Spawn_Jogador')return [];
  // Blender appends .001/.002 when a visual prop already owns the intended marker name (the bus-stop
  // asset does this). Gameplay marker IDs are semantic, so remove only that automatic numeric suffix.
  const name=node.name.replace(/\.\d{3}$/,'');
  const position=new Vector3().setFromMatrixPosition(visualTransform(index));
  return [[name,Object.fromEntries(['x','y','z'].map((axis,k)=>[axis,round(position.getComponent(k))]))]];
});
if(new Set(markerEntries.map(([name])=>name)).size!==markerEntries.length)throw new Error('Duplicate gameplay marker after Blender suffix normalization');
const markers=Object.fromEntries(markerEntries);
// VFX anchors are authored as empty nodes below their prop. Keep their world-space positions in
// the generated metadata as a stable contract between Blender and the runtime, and fail loudly if
// an export silently drops one of the effects introduced by the map author.
const effects=visual.json.nodes.flatMap((node,index)=>{
  const type=node.extras?.fx;
  if(typeof type!=='string')return [];
  const position=new Vector3().setFromMatrixPosition(visualTransform(index));
  return [{id:node.name,type,...Object.fromEntries(['x','y','z'].map((axis,k)=>[axis,round(position.getComponent(k))]))}];
});
const expectedEffects={brasas:1,fogo:1,fumaca:1,torneira:2,luz_jukebox:1,luz_jukebox_ponto:1,luz_palco:1,luz_palco_ponto:1};
for(const [type,count] of Object.entries(expectedEffects)){
  const actual=effects.filter(effect=>effect.type===type).length;
  if(actual!==count)throw new Error(`Expected ${count} ${type} FX anchor(s), found ${actual}`);
}
// The cart root used to survive the Blender export only as an empty FX parent, making the prop invisible.
// Treat its renderable mesh as part of the map contract so a future export cannot silently regress it.
const cart=visual.json.nodes.find(node=>node.name==='Carrinho_Espeto');
if(cart?.mesh===undefined||!visual.json.meshes[cart.mesh]?.primitives?.length)throw new Error('Carrinho_Espeto has no renderable mesh');
// The jukebox is part of the map (12_jukebox.py): the Jukebox node carries its lit tubes (Jukebox_FX_Luz, whose
// emissive the game recolours) and its point light; COL_Int_Jukebox is its solid volume.
const jukeboxIndex=visual.json.nodes.findIndex(node=>node.extras?.interativo==='jukebox');
const jukeboxCollider=colliders.find(c=>c.id==='COL_Int_Jukebox');
if(jukeboxIndex<0||!jukeboxCollider)throw new Error('The map has no Jukebox node or COL_Int_Jukebox volume');
if(!visual.json.materials.some(m=>m.name==='A_jukebox_luz'&&m.emissiveTexture))throw new Error('A_jukebox_luz lost its emissive mask');
const jukeboxPosition=new Vector3().setFromMatrixPosition(visualTransform(jukeboxIndex));
const jukeboxTurn=new Quaternion().setFromRotationMatrix(visualTransform(jukeboxIndex));
const jukebox={x:round(jukeboxPosition.x),y:round(jukeboxPosition.y),z:round(jukeboxPosition.z),hx:jukeboxCollider.hx,hz:jukeboxCollider.hz,maxY:jukeboxCollider.maxY,
  yaw:round(2*Math.atan2(jukeboxTurn.y,jukeboxTurn.w)*180/Math.PI)};
// The backyard stage (15_palco.py): a deck (COL_Palco) climbed only by its steps (COL_Palco_Degrau, on the west side),
// the LED screen Telao_Tela on the back truss (a 16:9 plane facing the audience, origin at its centre), the coloured
// lenses and LED strip (Palco_FX_Luz, material Palco_Luz) with their backlight Luz_Palco_Cor, and the musicians' spots.
// The game charges to go up and to put a video on the screen, so all of it is part of the map contract.
const stageDeck=colliders.find(c=>c.id==='COL_Palco'),stageSteps=colliders.filter(c=>/^COL_Palco_Degrau(?:\.\d+)?$/.test(c.id));
if(!stageDeck||!stageSteps.length)throw new Error('The stage needs its deck COL_Palco and its steps COL_Palco_Degrau');
if(!surfaces.some(s=>s.id==='COL_Palco')||stageSteps.some(step=>!surfaces.some(s=>s.id===step.id)))throw new Error('The stage deck and steps must be walkable');
const screenIndex=visual.json.nodes.findIndex(node=>node.extras?.interativo==='telao');
const screenNode=visual.json.nodes[screenIndex];
if(screenIndex<0||!(screenNode.extras.largura_m>0)||!(screenNode.extras.altura_m>0))throw new Error('The stage has no Telao_Tela screen (interativo = telao, largura_m, altura_m)');
const screenPosition=new Vector3().setFromMatrixPosition(visualTransform(screenIndex)),screenTurn=new Quaternion().setFromRotationMatrix(visualTransform(screenIndex));
if(Math.abs(screenTurn.x)>1e-3||Math.abs(screenTurn.z)>1e-3)throw new Error('Telao_Tela must stand upright, turned only about the vertical');
if(!visual.json.nodes.some(node=>node.name==='Palco_FX_Luz'&&node.mesh!==undefined))throw new Error('Palco_FX_Luz (stage lenses and LED strip) is missing');
if(!visual.json.materials.some(m=>m.name==='Palco_Luz'))throw new Error('The stage lights lost their Palco_Luz material');
if(!visual.json.extensions?.KHR_lights_punctual?.lights?.some(light=>light.name==='Luz_Palco_Cor'))throw new Error('Luz_Palco_Cor (stage backlight) is missing');
// The musicians' spots (Palco_Lugar_*): the empty is where the musician stands, facing its +Z, at the start and at the
// end of the four clips of its GLB (16_animacoes_palco.py, export/animacoes): take the instrument, start, loop, stop.
// The GLBs are served as they are (public/palco); the client converts the clips to each skin and the room times the
// phases by their length, so a spot without its four clips, or an instrument missing from the map, fails here.
const stageClips=path.join(root,'apps/web/public/palco');
fs.mkdirSync(stageClips,{recursive:true});
const places=visual.json.nodes.flatMap((node,index)=>{
  if(node.extras?.interativo!=='palco_lugar')return [];
  const position=new Vector3().setFromMatrixPosition(visualTransform(index)),turn=new Quaternion().setFromRotationMatrix(visualTransform(index));
  const clips=String(node.extras.clipes??'').split(',').filter(Boolean),file=String(node.extras.animacoes??`palco_${node.extras.lugar}.glb`);
  if(clips.length!==4)throw new Error(`${node.name} needs four clips (take, start, loop, stop), not ${clips.length}`);
  const animation=read(path.join('animacoes',file));
  const durations=clips.map(name=>{
    const clip=animation.json.animations?.find(a=>a.name===name);
    if(!clip)throw new Error(`${file} lacks the clip ${name} of ${node.name}`);
    return round(Math.max(...clip.samplers.map(sampler=>animation.json.accessors[sampler.input].max[0])));
  });
  for(const prop of String(animation.json.scenes[animation.json.scene??0].extras?.props??'').split(',').filter(Boolean))
    if(!animation.json.nodes.some(n=>n.name===prop&&n.mesh!==undefined))throw new Error(`${file} lacks its instrument ${prop}`);
  const instrument=node.extras.instrumento??'';
  if(instrument&&!visual.json.nodes.some(n=>n.name===instrument&&n.mesh!==undefined))throw new Error(`${node.name}: the map has no ${instrument}`);
  fs.copyFileSync(path.join(source,'animacoes',file),path.join(stageClips,file));
  return [{id:node.extras.lugar,x:round(position.x),y:round(position.y),z:round(position.z),yaw:round(2*Math.atan2(turn.y,turn.w)*180/Math.PI),clips,
    animation:{file,hash:animation.hash.slice(0,12),durations},instrument}];
});
if(new Set(places.map(place=>place.id)).size!==places.length||!places.length)throw new Error('The stage needs musicians\' spots with distinct names');
const box=c=>({id:c.id,x:c.x,z:c.z,hx:c.hx,hz:c.hz,minY:c.minY,maxY:c.maxY});
const stage={deck:box(stageDeck),steps:stageSteps.map(box),
  screen:{x:round(screenPosition.x),y:round(screenPosition.y),z:round(screenPosition.z),width:screenNode.extras.largura_m,height:screenNode.extras.altura_m,
    yaw:round(2*Math.atan2(screenTurn.y,screenTurn.w)*180/Math.PI)},
  places};
// The lit facade (13_fachada.py): the logo sign, the two veranda boards, the neon rim and the magenta halo light.
for(const name of ['Letreiro_Highland','Placa_Highland','Neon_Magenta'])
  if(!visual.json.materials.some(m=>m.name===name&&m.emissiveFactor?.some(v=>v>0)))throw new Error(`Facade material ${name} is missing or no longer emissive`);
if(!visual.json.extensions?.KHR_lights_punctual?.lights?.some(light=>light.name==='Luz_Letreiro'))throw new Error('Luz_Letreiro (facade halo) is missing');
// Red tables keep compact collision volumes, while chairs are deliberately pass-through GPU instances so
// people can circulate between them. Derive seat positions from EXT_mesh_gpu_instancing and validate that
// every unused chair belongs to one of the three authored stacks in the upper-floor storage room.
const tables = colliders.filter(c => /^COL_Mob_Mesa(?:\.\d+)?$/i.test(c.id));
const chairNodeIndex=visual.json.nodes.findIndex(node=>node.name==='INST_A_cadeira-vermelha');
const chairNode=visual.json.nodes[chairNodeIndex],instanceAttributes=chairNode?.extensions?.EXT_mesh_gpu_instancing?.attributes;
if(!tables.length||!instanceAttributes?.TRANSLATION)throw new Error(`Expected authored café tables and instanced chairs (${tables.length} tables)`);
const chairParent=visualTransform(chairNodeIndex),chairParentTurn=new Quaternion().setFromRotationMatrix(chairParent);
const chairTurns=instanceAttributes.ROTATION===undefined?[]:values(visual,instanceAttributes.ROTATION);
// Each chair keeps its instance index and the way it faces (its +Z, towards the table give or take the authored
// jitter): the bar animations pull that very instance and seat the body along it (18_animacoes_bar.py).
const chairs=values(visual,instanceAttributes.TRANSLATION).map((translation,index)=>{
  const position=new Vector3(...translation).applyMatrix4(chairParent);
  const turn=chairParentTurn.clone().multiply(new Quaternion(...(chairTurns[index]??[0,0,0,1]))),front=new Vector3(0,0,1).applyQuaternion(turn);
  return {id:`visual-chair-${index+1}`,index,x:round(position.x),y:round(position.y),z:round(position.z),yaw:round(Math.atan2(front.x,front.z))};
});
const chairsByTable = tables.map(() => []);
const unusedChairs=[];
for (const chair of chairs) {
  const candidates = tables.map((table,index)=>({index,distance:Math.hypot(chair.x-table.x,chair.z-table.z),height:Math.abs(chair.y-table.minY)}))
    .filter(candidate=>candidate.height<.12).sort((a,b)=>a.distance-b.distance);
  if (!candidates[0] || candidates[0].distance>.9){unusedChairs.push(chair);continue;}
  chairsByTable[candidates[0].index].push(chair);
}
const chairStacks=colliders.filter(c=>/^COL_Mob_Cadeiras_Empilhadas(?:\.|$)/.test(c.id));
const unexpected=unusedChairs.filter(chair=>!chairStacks.some(stack=>Math.abs(chair.x-stack.x)<=stack.hx+.05&&Math.abs(chair.z-stack.z)<=stack.hz+.05
  &&chair.y>=stack.minY-.05&&chair.y<=stack.maxY+.05));
if(unexpected.length)throw new Error(`Instanced chairs belong neither to a café table nor a storage stack: ${JSON.stringify(unexpected)}`);
const badSets=chairsByTable.map((set,index)=>({table:tables[index].id,chairs:set.length})).filter(set=>set.chairs<2||set.chairs>4);
if(badSets.length)throw new Error(`Invalid café table sets: ${JSON.stringify(badSets)}`);
// Every customer table is numbered in the map (14_mesas.py): a Mesa_NN empty on its top with extras mesa, area,
// andar and lugares. That number is how players and staff name a table, so tables and their seats carry it.
const customerTables=colliders.filter(c=>/^COL_Mob_Mesa(?:_Madeira)?(?:\.\d+)?$/.test(c.id));
const numberedTables=visual.json.nodes.flatMap((node,index)=>{
  if(!Number.isInteger(node.extras?.mesa))return [];
  const top=new Vector3().setFromMatrixPosition(visualTransform(index));
  const matches=customerTables.filter(c=>Math.abs(top.x-c.x)<=c.hx&&Math.abs(top.z-c.z)<=c.hz&&top.y>c.minY&&top.y<=c.maxY+.05);
  if(matches.length!==1)throw new Error(`${node.name} must sit on exactly one customer table, found ${matches.length}`);
  const {mesa:number,area,andar:floor,lugares:places}=node.extras;
  if(typeof area!=='string'||!Number.isInteger(floor)||!Number.isInteger(places))throw new Error(`${node.name} lacks area/andar/lugares`);
  // The Mesa_NN empty also frames the cleaning clip (limpar_mesa): its centre on the floor, turned as the empty is.
  const turn=new Quaternion().setFromRotationMatrix(visualTransform(index)),front=new Vector3(0,0,1).applyQuaternion(turn);
  return [{id:`mesa-${number}`,number,area,floor,places,x:matches[0].x,y:matches[0].minY,z:matches[0].z,top:round(top.y),collider:matches[0].id,
    node:node.name,anchor:{x:round(top.x),z:round(top.z),yaw:round(Math.atan2(front.x,front.z))}}];
}).sort((a,b)=>a.number-b.number);
if(numberedTables.some((table,i)=>table.number!==i+1))throw new Error(`Table numbers must run 1..N without gaps: ${numberedTables.map(t=>t.number)}`);
const unnumbered=customerTables.filter(c=>numberedTables.filter(t=>t.collider===c.id).length!==1);
if(unnumbered.length)throw new Error(`Customer tables without exactly one number: ${unnumbered.map(c=>c.id)}`);
const tableNumber=new Map(numberedTables.map(t=>[t.collider,t.number]));
let seatNumber=0;
const seats=tables.flatMap((table,index)=>chairsByTable[index]
  .sort((a,b)=>Math.atan2(a.z-table.z,a.x-table.x)-Math.atan2(b.z-table.z,b.x-table.x))
  .map(chair=>{
    // A chair turned away from its table would seat the body facing away from it.
    const towards=Math.atan2(table.x-chair.x,table.z-chair.z),off=Math.abs(Math.atan2(Math.sin(chair.yaw-towards),Math.cos(chair.yaw-towards)));
    if(off>.5)throw new Error(`Chair ${chair.index} faces ${Math.round(off*180/Math.PI)}° away from its table ${table.id}`);
    return {id:`seat-${++seatNumber}`,x:chair.x,y:chair.y,z:chair.z,rotation:chair.yaw,table:tableNumber.get(table.id),chair:chair.index};
  }));
// The backyard's picnic tables (P_Mesa_Madeira, 05_props.py) have their benches built in: a 1.8 x 0.8 m top between two
// benches whose seat line runs 0.62 m out from the middle, three places on each. Their seats are spots on those lines,
// facing the table, with no chair to pull (`bench`, no `chair`).
const BENCH_LINE=.62,BENCH_PLACES=[-.6,0,.6];
for(const table of numberedTables.filter(t=>/^COL_Mob_Mesa_Madeira(?:\.\d+)?$/.test(t.collider))){
  const box=colliders.find(c=>c.id===table.collider);
  // The napkin holder is square to the table's sides, so its heading is the table's turn up to quarter turns; the top
  // runs along its own X, the longer side of the collision box.
  let turn=table.anchor.yaw-Math.round(table.anchor.yaw/(Math.PI/2))*Math.PI/2;
  if(box.hz>box.hx)turn+=Math.PI/2;
  const length={x:Math.cos(turn),z:-Math.sin(turn)},width={x:Math.sin(turn),z:Math.cos(turn)};
  const benches=[-1,1].flatMap(side=>BENCH_PLACES.map(along=>({id:`seat-${++seatNumber}`,
    x:round(table.anchor.x+width.x*side*BENCH_LINE+length.x*along),y:table.y,z:round(table.anchor.z+width.z*side*BENCH_LINE+length.z*along),
    rotation:round(Math.atan2(-side*width.x,-side*width.z)),table:table.number,bench:true})));
  if(benches.length!==table.places)throw new Error(`${table.node}: ${benches.length} bench places, the map says ${table.places}`);
  seats.push(...benches);
}
const barAnimations=readBarAnimations();
// Door leaves (04_predio.py) are separate nodes whose origin is the hinge. They were exported open; the
// closed heading is the custom property angulo_fechada_graus. Both angles turn about +Y, as in Blender's Z.
// Their collision is not static: the game places it from the door state (packages/shared/src/doors.ts).
const doors = [];
for (let i = 0; i < visual.json.nodes.length; i++) {
  const node = visual.json.nodes[i];
  if (!node.extras?.porta) continue;
  const q = new Quaternion(...(node.rotation ?? [0,0,0,1]));
  if (Math.abs(q.x) > 1e-4 || Math.abs(q.z) > 1e-4 || node.scale || visual.json.nodes.some(n => n.children?.includes(i))) throw new Error(`Door ${node.name} must be a root node turned only about its vertical hinge`);
  const local = new Box3();
  for (const primitive of visual.json.meshes[node.mesh].primitives) {
    const a = visual.json.accessors[primitive.attributes.POSITION];
    local.union(new Box3(new Vector3(...a.min), new Vector3(...a.max)));
  }
  const hinge = new Vector3(...(node.translation ?? [0,0,0]));
  const openYaw = 2 * Math.atan2(q.y, q.w) * 180 / Math.PI, closedYaw = Number(node.extras.angulo_fechada_graus);
  if (!Number.isFinite(closedYaw)) throw new Error(`Door ${node.name} has no angulo_fechada_graus`);
  doors.push({id:node.name, group:node.name.replace(/_[ED]$/, ''), x:round(hinge.x), y:round(hinge.y), z:round(hinge.z),
    closedYaw:round(closedYaw), openYaw:round(openYaw), min:local.min.toArray().map(round), max:local.max.toArray().map(round)});
}
// Playable bounds: the inner faces of the four street boundary walls.
const limits = colliders.filter(c => c.id.startsWith('COL_Rua_Limite'));
if (limits.length !== 4) throw new Error('Expected four COL_Rua_Limite walls');
const bounds = {
  minX: Math.max(...limits.filter(c => c.hz > c.hx && c.x < 0).map(c => c.x + c.hx)),
  maxX: Math.min(...limits.filter(c => c.hz > c.hx && c.x > 0).map(c => c.x - c.hx)),
  minZ: Math.max(...limits.filter(c => c.hx > c.hz && c.z < 0).map(c => c.z + c.hz)),
  maxZ: Math.min(...limits.filter(c => c.hx > c.hz && c.z > 0).map(c => c.z - c.hz)),
};
// The veranda's wooden ceiling (04_predio.py: polygon to VX = 23.8 and y = 15 at FORRO = 2.75) has no
// collision volume, yet it must stop the camera boom. Glued to the facade at x/z = -0.57.
const cameraCeilings = [
  {id:'veranda-front-ceiling', x:(-.57 + 23.8) / 2, z:(-3.5 + .57) / 2, hx:(23.8 + .57) / 2, hz:(3.5 + .57) / 2, minY:2.72, maxY:2.8},
  {id:'veranda-side-ceiling', x:(-.57 + 3.5) / 2, z:(-15 - 3.5) / 2, hx:(3.5 + .57) / 2, hz:(15 - 3.5) / 2, minY:2.72, maxY:2.8},
];
/**
 * The characters' bar animations (18_animacoes_bar.py: export/animacoes/bar_<group>.glb, a 1.90 m Mixamo skeleton, props and
 * particle emitters; 19_fumar_mixamo.py: bar_fumar_mixamo.glb, Mixamo's own "Smoking" skeleton) and the places in the map
 * they happen at (17_lugares_animacao.py). The GLBs are served as they are (public/animacoes); the client converts the
 * clips to each skin, and the room times the actions by their length and puts the body where each clip leaves it (`end`:
 * the hips on the floor, in the clip's space, facing +Z).
 */
function readBarAnimations(){
  const destination=path.join(root,'apps/web/public/animacoes');
  fs.mkdirSync(destination,{recursive:true});
  const groups={},clips={};
  for(const group of ['locomocao','fumar','fumar_mixamo','vomitar','cadeira','mesa','banheiro','magrao']){
    const file=`bar_${group}.glb`,glb=read(path.join('animacoes',file)),json=glb.json;
    const info=JSON.parse(json.scenes[json.scene??0].extras?.bar_animacoes??'null');
    if(info?.grupo!==group)throw new Error(`${file} lacks its bar_animacoes extras`);
    const node=name=>json.nodes.findIndex(n=>n.name===name);
    // What holds the hips is the armature: Personagem (18_animacoes_bar.py), or Mixamo's Armature in centimetres, scaled 0.01.
    const hips=json.nodes.findIndex(n=>/mixamorig\d*:?Hips$/.test(n.name)),skeleton=json.nodes.findIndex(n=>n.children?.includes(hips));
    if(hips<0||skeleton<0)throw new Error(`${file}: mixamorig:Hips must hang from an armature node`);
    for(const prop of info.props)if(node(prop)<0)throw new Error(`${file} lacks its prop ${prop}`);
    const holder=json.nodes[skeleton],holderMatrix=new Matrix4().compose(new Vector3(...(holder.translation??[0,0,0])),new Quaternion(...(holder.rotation??[0,0,0,1])),new Vector3(...(holder.scale??[1,1,1])));
    const holderTurn=new Quaternion(...(holder.rotation??[0,0,0,1])),restTurn=holderTurn.clone().multiply(new Quaternion(...(json.nodes[hips].rotation??[0,0,0,1])));
    for(const [name,clip] of Object.entries(info.clipes)){
      const animation=json.animations.find(a=>a.name===name);
      if(!animation)throw new Error(`${file} lacks the clip ${name}`);
      const duration=round(Math.max(...animation.samplers.map(sampler=>json.accessors[sampler.input].max[0])));
      if(Math.abs(duration-(clip.quadros-1)/info.fps)>.05)throw new Error(`${file}: ${name} lasts ${duration} s, not ${clip.quadros} frames`);
      const channel=property=>{const c=animation.channels.find(c=>c.target.node===hips&&c.target.path===property);if(!c)throw new Error(`${file}: ${name} does not move the hips`);return values(glb,animation.samplers[c.sampler].output);};
      const moves=channel('translation'),turns=channel('rotation');
      const at=key=>{
        const p=new Vector3(...moves[key]).applyMatrix4(holderMatrix),turn=holderTurn.clone().multiply(new Quaternion(...turns[key])).multiply(restTurn.clone().invert());
        const front=new Vector3(0,0,1).applyQuaternion(turn);
        return {x:round(p.x),z:round(p.z),yaw:round(Math.atan2(front.x,front.z))};
      };
      // What the client needs of the extras (PlayCanvas drops a scene's extras): props held by a bone in frame ranges
      // (segue), props turned to point at another in frame ranges (mira), map nodes the GLB's copy stands in for
      // (substitui), and props left on the map at the end (entrega, fica).
      const extra=Object.fromEntries(['segue','mira','substitui','entrega','fica','bebida'].filter(key=>clip[key]!==undefined).map(key=>[key,clip[key]]));
      clips[name]={group,duration,loop:!!clip.loop,start:at(0),end:at(moves.length-1),...extra};
    }
    // hipHeight (quadril_m): a skeleton of other proportions than the 1.90 m one; the hips then move by the skin's hip height.
    groups[group]={file,hash:glb.hash.slice(0,12),anchor:info.ancora??null,height:info.altura_m,...info.quadril_m?{hipHeight:info.quadril_m}:{},
      fps:info.fps,props:info.props,fx:info.fx,...info.velocidade?{speeds:info.velocidade}:{}};
    fs.copyFileSync(path.join(source,'animacoes',file),path.join(destination,file));
  }
  const place=name=>{
    const index=visual.json.nodes.findIndex(n=>n.name===name);
    if(index<0)throw new Error(`The map has no ${name} (17_lugares_animacao.py)`);
    const p=new Vector3().setFromMatrixPosition(visualTransform(index)),turn=new Quaternion().setFromRotationMatrix(visualTransform(index)),front=new Vector3(0,0,1).applyQuaternion(turn);
    return {x:round(p.x),y:round(p.y),z:round(p.z),yaw:round(Math.atan2(front.x,front.z))};
  };
  // Magrão's map props that his GLB copies while in use, and the cups and lids must stay real nodes (not merged away).
  for(const name of ['Copo_Bandeja','Freezer_Bar_Tampa'])if(visual.json.nodes.find(n=>n.name===name)?.mesh===undefined)throw new Error(`${name} must be its own mesh node`);
  const urinals=visual.json.nodes.filter(n=>/^Mictorio_Lugar_\d+$/.test(n.name)).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}))
    .map(n=>({id:`mictorio-${n.name.slice('Mictorio_Lugar_'.length)}`,node:n.name,...place(n.name)}));
  if(!urinals.length)throw new Error('The map has no Mictorio_Lugar_N');
  const topo=JSON.parse(read(path.join('animacoes','bar_mesa.glb')).json.scenes[0].extras.bar_animacoes).clipes.limpar_mesa.topo;
  return {groups,clips,tableTop:topo,counter:{magrao:place('Balcao_Lugar_Magrao'),delivery:place('Balcao_Entrega')},urinals};
}
const data = { visualHash:visual.hash, collisionHash:collision.hash, bounds, markers, effects, colliders, surfaces, cameraCeilings, doors, seats,
  tables:numberedTables, jukebox, stage, barAnimations };
fs.mkdirSync(destination,{recursive:true});
fs.copyFileSync(path.join(source,'bar_boteco.glb'),path.join(destination,'bar_boteco.glb'));
fs.copyFileSync(path.join(source,'bar_boteco_colisao.glb'),path.join(destination,'bar_boteco_colisao.glb'));
fs.writeFileSync(path.join(root,'packages/shared/src/map-data.json'),`${JSON.stringify(data,null,2)}\n`);
console.log(`Map imported: ${visual.json.nodes.length} visual nodes, ${effects.length} FX anchors, ${colliders.length} solid volumes, ${doors.length} door leaves, ${surfaces.length} floor triangles, ${seats.length} seats, ${numberedTables.length} numbered tables; all textures embedded.`);
