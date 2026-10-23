// Builds runtime collision metadata from the author's separate collision export.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Matrix4, Quaternion, Vector3, Box3 } from 'three';

const root = fileURLToPath(new URL('../', import.meta.url));
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
function values(accessorIndex) {
  const a = collision.json.accessors[accessorIndex], view = collision.json.bufferViews[a.bufferView];
  const size = a.type === 'VEC3' ? 3 : 1;
  const component = {5123: 2, 5125: 4, 5126: 4}[a.componentType];
  const read = {5123: 'readUInt16LE', 5125: 'readUInt32LE', 5126: 'readFloatLE'}[a.componentType];
  if (!read) throw new Error('Unsupported collision accessor');
  return Array.from({length: a.count}, (_, i) => Array.from({length: size}, (_, c) => collision.bin[read]((view.byteOffset ?? 0) + (a.byteOffset ?? 0) + i * (view.byteStride ?? component * size) + c * component)));
}
const colliders = [], surfaces = [];
for (let i = 0; i < collision.json.nodes.length; i++) {
  const node = collision.json.nodes[i];
  if (!node.name?.startsWith('COL_') || node.mesh === undefined) throw new Error('Unexpected collision node');
  const box = new Box3(), isRamp = node.name.includes('Escada_Rampa');
  // Volumes people stand on: streets, floors and slabs, stairs, balconies, and the stage with its steps.
  const support = /^COL_Rua_(Quadra|Leito)/.test(node.name) || /^COL_Predio_(Piso|Laje|Escada_Rampa|Escada_Patamar|Sacada(?:\.|$)|Palco(?:\.|$)|Palco_Degrau)/.test(node.name);
  for (const primitive of collision.json.meshes[node.mesh].primitives) {
    const points = values(primitive.attributes.POSITION).map(p => new Vector3(...p).applyMatrix4(transform(i)));
    points.forEach(p => box.expandByPoint(p));
    if (support) {
      const indices = values(primitive.indices).flat();
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
const markers = Object.fromEntries(visual.json.nodes.flatMap((n, i) => n.name.startsWith('Ponto_') || n.name === 'Spawn_Jogador' ? [[n.name, Object.fromEntries(['x','y','z'].map((axis,k) => [axis, round(new Vector3().setFromMatrixPosition(visualTransform(i)).getComponent(k))]))]] : []));
// Plastic table sets ("conjunto") from 06_interior.py, as [x, z, floor y, chairs, rotation] in glTF axes
// (Blender y becomes -z). Chairs are not exported as colliders, so their layout is mirrored here and checked
// against the exported table colliders below.
const ZP = .3, ZP2 = 3.45;
const tables = [
  // ground-floor hall
  ...[[5.4,5.3],[8,5.3],[10.6,5.3],[13.2,5.3],[5.4,7.6],[8,7.6],[10.6,7.6],[13.2,7.6],[5.4,9.9],[8,9.9],[10.6,9.9]].map(([x,y]) => [x,-y,ZP,4,0]),
  // upper lounge and the two balconies
  [18.5,-5,ZP2,4,0], [18.5,-9.6,ZP2,4,0], [12,-2.9,3.65,2,90], [20,-2.9,3.65,2,90],
  // roof terrace
  ...[[26.3,2.6],[29.6,2.6],[26.3,6.7],[29.6,6.7],[26.3,10.8],[29.6,10.8]].map(([x,y]) => [x,-y,ZP2,4,0]),
  // backyard
  ...[24.8,28,30.9].map(x => [x,-17,ZP,4,0]),
  // veranda
  ...[2.2,4,9.5,11.9,17.5,19.8,22.1].map(x => [x,-1.75,ZP,4,0]), [1.7,-8.3,ZP,4,0], [1.7,-12.9,ZP,4,0],
];
{
  const exported = colliders.filter(c => c.id.startsWith('COL_Mob_Mesa_Plastico'));
  const unmatched = tables.filter(([x,z]) => !exported.some(c => Math.hypot(c.x - x, c.z - z) < .15));
  if (unmatched.length || exported.length !== tables.length)
    throw new Error(`Table sets no longer match the collision export (${exported.length} exported, ${tables.length} listed, unmatched ${JSON.stringify(unmatched)}). Update the list from 06_interior.py.`);
}
const seats = tables.flatMap(([x,z,y,count,rotation], table) => Array.from({length:count}, (_, k) => {
  const a = (rotation + 90 * k + (count === 2 ? 90 : 0)) * Math.PI / 180;
  const dx = .62 * Math.sin(a), dz = .62 * Math.cos(a);
  return {id:`seat-${table * 4 + k + 1}`, x:round(x+dx), y, z:round(z+dz), rotation:round(Math.atan2(-dx,-dz))};
}));
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
const data = { visualHash:visual.hash, collisionHash:collision.hash, bounds, markers, colliders, surfaces, cameraCeilings, doors, seats, tables:tables.map(([x,z,y],i)=>({id:`map-table-${i+1}`,x,y,z})) };
fs.mkdirSync(destination,{recursive:true});
fs.copyFileSync(path.join(source,'bar_boteco.glb'),path.join(destination,'bar_boteco.glb'));
fs.copyFileSync(path.join(source,'bar_boteco_colisao.glb'),path.join(destination,'bar_boteco_colisao.glb'));
fs.writeFileSync(path.join(root,'packages/shared/src/map-data.json'),`${JSON.stringify(data,null,2)}\n`);
console.log(`Map imported: ${visual.json.nodes.length} visual nodes, ${colliders.length} solid volumes, ${doors.length} door leaves, ${surfaces.length} floor triangles, ${seats.length} seats; all textures embedded.`);
