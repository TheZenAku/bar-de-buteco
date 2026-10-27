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
  // Volumes people stand on: streets, floors and slabs, stairs, balconies, and the stage with its steps.
  const support = /^COL_Rua_(Quadra|Leito)/.test(node.name) || /^COL_Predio_(Piso|Laje|Escada_Rampa|Escada_Patamar|Sacada(?:\.|$)|Palco(?:\.|$)|Palco_Degrau)/.test(node.name);
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
const expectedEffects={brasas:1,fogo:1,fumaca:1,torneira:2};
for(const [type,count] of Object.entries(expectedEffects)){
  const actual=effects.filter(effect=>effect.type===type).length;
  if(actual!==count)throw new Error(`Expected ${count} ${type} FX anchor(s), found ${actual}`);
}
// The cart root used to survive the Blender export only as an empty FX parent, making the prop invisible.
// Treat its renderable mesh as part of the map contract so a future export cannot silently regress it.
const cart=visual.json.nodes.find(node=>node.name==='Carrinho_Espeto');
if(cart?.mesh===undefined||!visual.json.meshes[cart.mesh]?.primitives?.length)throw new Error('Carrinho_Espeto has no renderable mesh');
// Red tables keep compact collision volumes, while chairs are deliberately pass-through GPU instances so
// people can circulate between them. Derive seat positions from EXT_mesh_gpu_instancing and validate that
// every unused chair belongs to one of the three authored stacks in the upper-floor storage room.
const tables = colliders.filter(c => /^COL_Mob_Mesa(?:\.\d+)?$/i.test(c.id));
const chairNodeIndex=visual.json.nodes.findIndex(node=>node.name==='INST_A_cadeira-vermelha');
const chairNode=visual.json.nodes[chairNodeIndex],instanceAttributes=chairNode?.extensions?.EXT_mesh_gpu_instancing?.attributes;
if(!tables.length||!instanceAttributes?.TRANSLATION)throw new Error(`Expected authored café tables and instanced chairs (${tables.length} tables)`);
const chairParent=visualTransform(chairNodeIndex);
const chairs=values(visual,instanceAttributes.TRANSLATION).map((translation,index)=>{
  const position=new Vector3(...translation).applyMatrix4(chairParent);
  return {id:`visual-chair-${index+1}`,x:round(position.x),y:round(position.y),z:round(position.z)};
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
let seatNumber=0;
const seats=tables.flatMap((table,index)=>chairsByTable[index]
  .sort((a,b)=>Math.atan2(a.z-table.z,a.x-table.x)-Math.atan2(b.z-table.z,b.x-table.x))
  .map(chair=>({id:`seat-${++seatNumber}`,x:chair.x,y:chair.y,z:chair.z,
    rotation:round(Math.atan2(table.x-chair.x,table.z-chair.z))})));
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
const data = { visualHash:visual.hash, collisionHash:collision.hash, bounds, markers, effects, colliders, surfaces, cameraCeilings, doors, seats,
  tables:tables.map((table,i)=>({id:`map-table-${i+1}`,x:table.x,y:table.minY,z:table.z})) };
fs.mkdirSync(destination,{recursive:true});
fs.copyFileSync(path.join(source,'bar_boteco.glb'),path.join(destination,'bar_boteco.glb'));
fs.copyFileSync(path.join(source,'bar_boteco_colisao.glb'),path.join(destination,'bar_boteco_colisao.glb'));
fs.writeFileSync(path.join(root,'packages/shared/src/map-data.json'),`${JSON.stringify(data,null,2)}\n`);
console.log(`Map imported: ${visual.json.nodes.length} visual nodes, ${effects.length} FX anchors, ${colliders.length} solid volumes, ${doors.length} door leaves, ${surfaces.length} floor triangles, ${seats.length} seats; all textures embedded.`);
