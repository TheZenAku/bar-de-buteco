/**
 * Cuts the triangle count of heavy skinned player models (apps/web/public/models/*.glb) with meshoptimizer's simplifier.
 *
 *   node tools/assets/simplify-skins.mjs                 every skin above 40k triangles, down to 20k
 *   node tools/assets/simplify-skins.mjs read 15000      one skin, chosen target
 *
 * Why: read/gilmar-gordo were ~100k triangles each and magrao 58k, against ~11k for the others; every avatar is drawn
 * again for each live shadow lamp, so nine of those cost more than the whole rest of the crowd. The simplifier only
 * collapses edges onto existing vertices, so JOINTS_0 stay valid; normals, UVs and skin weights steer which edges go,
 * and open borders (UV seams) are locked. The original goes to .local/skins-full/ first and is never overwritten, so
 * running this twice does not simplify the simplified file: it always starts from the original.
 */
import {existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, copyFileSync, renameSync, unlinkSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {MeshoptSimplifier} from 'meshoptimizer';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const models = join(root, 'apps/web/public/models'), backup = join(root, '.local/skins-full');
const [onlyName, onlyTarget] = process.argv.slice(2);
const LIMIT = 40_000, TARGET = Number(onlyTarget) || 20_000;
mkdirSync(backup, {recursive: true});
await MeshoptSimplifier.ready;

const align4 = n => (n + 3) & ~3;
function parse(buffer) {
  const jsonLength = buffer.readUInt32LE(12), json = JSON.parse(buffer.toString('utf8', 20, 20 + jsonLength));
  const binStart = 20 + jsonLength + 8;
  return {json, bin: buffer.subarray(binStart, binStart + buffer.readUInt32LE(20 + jsonLength))};
}
function view(json, bin, accessorIndex, Type) {
  const a = json.accessors[accessorIndex], v = json.bufferViews[a.bufferView], parts = {SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4}[a.type];
  if (v.byteStride && v.byteStride !== parts * Type.BYTES_PER_ELEMENT) throw new Error('interleaved buffer');
  const copy = new Uint8Array(a.count * parts * Type.BYTES_PER_ELEMENT);
  copy.set(bin.subarray((v.byteOffset ?? 0) + (a.byteOffset ?? 0), (v.byteOffset ?? 0) + (a.byteOffset ?? 0) + copy.length));
  return {data: new Type(copy.buffer), parts};
}

function simplifyFile(name, target) {
  const file = join(models, `${name}.glb`), original = join(backup, `${name}.glb`);
  if (!existsSync(original)) copyFileSync(file, original);
  const source = readFileSync(original), {json, bin} = parse(source);
  if (json.meshes.length !== 1 || json.meshes[0].primitives.length !== 1) throw new Error(`${name}: expected one mesh with one primitive`);
  const prim = json.meshes[0].primitives[0], at = prim.attributes;
  if (prim.targets?.length) throw new Error(`${name}: morph targets are not handled`);
  const position = view(json, bin, at.POSITION, Float32Array).data, normal = view(json, bin, at.NORMAL, Float32Array).data;
  const uv = view(json, bin, at.TEXCOORD_0, Float32Array).data, joints = view(json, bin, at.JOINTS_0, Uint16Array).data;
  const weights = view(json, bin, at.WEIGHTS_0, Float32Array).data;
  const indices = json.accessors[prim.indices].componentType === 5125 ? view(json, bin, prim.indices, Uint32Array).data : Uint32Array.from(view(json, bin, prim.indices, Uint16Array).data);
  const count = position.length / 3;
  // normal(3) + uv(2) + weights(4) steer the collapses; the seams (borders) stay.
  const attributes = new Float32Array(count * 9);
  for (let i = 0; i < count; i++) {
    attributes.set(normal.subarray(i * 3, i * 3 + 3), i * 9);
    attributes.set(uv.subarray(i * 2, i * 2 + 2), i * 9 + 3);
    attributes.set(weights.subarray(i * 4, i * 4 + 4), i * 9 + 5);
  }
  const [simplified, error] = MeshoptSimplifier.simplifyWithAttributes(indices, position, 3, attributes, 9, [1, 1, 1, 4, 4, 1, 1, 1, 1], null, target * 3, 0.02, ['LockBorder']);
  // Keep only the vertices still used, in first-use order.
  const remap = new Int32Array(count).fill(-1), order = [];
  const next = new Uint32Array(simplified.length);
  simplified.forEach((old, i) => { if (remap[old] < 0) { remap[old] = order.length; order.push(old); } next[i] = remap[old]; });
  const gather = (src, parts, Type) => { const out = new Type(order.length * parts); order.forEach((old, i) => out.set(src.subarray(old * parts, old * parts + parts), i * parts)); return out; };
  const fresh = {
    POSITION: gather(position, 3, Float32Array), NORMAL: gather(normal, 3, Float32Array), TEXCOORD_0: gather(uv, 2, Float32Array),
    JOINTS_0: gather(joints, 4, Uint16Array), WEIGHTS_0: gather(weights, 4, Float32Array),
  };
  // Renormalise the weights (collapses never change them, but the source may be off by rounding).
  for (let i = 0; i < order.length; i++) { let sum = 0; for (let k = 0; k < 4; k++) sum += fresh.WEIGHTS_0[i * 4 + k]; if (sum > 0) for (let k = 0; k < 4; k++) fresh.WEIGHTS_0[i * 4 + k] /= sum; }
  // The new bin: every bufferView the geometry did not use, then the new geometry.
  const geometryAccessors = new Set([...Object.values(at), prim.indices]);
  const geometryViews = new Set([...geometryAccessors].map(a => json.accessors[a].bufferView));
  for (const [i, accessor] of json.accessors.entries()) if (!geometryAccessors.has(i) && geometryViews.has(accessor.bufferView)) throw new Error(`${name}: geometry bufferView is shared`);
  const chunks = [];
  let offset = 0;
  json.bufferViews.forEach((v, i) => {
    if (geometryViews.has(i)) return;
    const data = bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength);
    chunks.push({old: i, data, offset}); offset += align4(data.length);
  });
  const newViews = [], viewIndex = new Map();
  for (const chunk of chunks) { viewIndex.set(chunk.old, newViews.length); newViews.push({...json.bufferViews[chunk.old], buffer: 0, byteOffset: chunk.offset}); }
  const add = (array, target) => {
    const data = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    chunks.push({data, offset}); newViews.push({buffer: 0, byteOffset: offset, byteLength: data.length, ...(target ? {target} : {})});
    offset += align4(data.length); return newViews.length - 1;
  };
  for (const image of json.images ?? []) if (image.bufferView !== undefined) image.bufferView = viewIndex.get(image.bufferView);
  const newAccessors = json.accessors.map(a => ({...a}));
  json.accessors.forEach((a, i) => { if (!geometryAccessors.has(i)) newAccessors[i].bufferView = viewIndex.get(a.bufferView); });
  const bounds = array => { const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]; for (let i = 0; i < array.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], array[i + k]); max[k] = Math.max(max[k], array[i + k]); } return {min, max}; };
  for (const [key, array] of Object.entries(fresh)) {
    const index = at[key], old = json.accessors[index];
    newAccessors[index] = {bufferView: add(array, 34962), componentType: old.componentType, count: array.length / ({POSITION: 3, NORMAL: 3, TEXCOORD_0: 2}[key] ?? 4), type: old.type, ...(key === 'POSITION' ? bounds(array) : {})};
  }
  newAccessors[prim.indices] = {bufferView: add(next, 34963), componentType: 5125, count: next.length, type: 'SCALAR'};
  json.accessors = newAccessors; json.bufferViews = newViews; json.buffers = [{byteLength: offset}];
  const body = Buffer.alloc(offset);
  for (const chunk of chunks) body.set(chunk.data, chunk.offset);
  const jsonBytes = Buffer.from(JSON.stringify(json)), jsonPadded = Buffer.alloc(align4(jsonBytes.length), 0x20); jsonBytes.copy(jsonPadded);
  const out = Buffer.alloc(12 + 8 + jsonPadded.length + 8 + body.length);
  out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(jsonPadded.length, 12); out.writeUInt32LE(0x4e4f534a, 16); jsonPadded.copy(out, 20);
  const binAt = 20 + jsonPadded.length; out.writeUInt32LE(body.length, binAt); out.writeUInt32LE(0x004e4942, binAt + 4); body.copy(out, binAt + 8);
  // Vite may hold the served GLB open (Windows refuses to overwrite it): move it aside, write the new one, drop the old if it lets go.
  const aside = `${file}.old`;
  try { writeFileSync(file, out); } catch { renameSync(file, aside); writeFileSync(file, out); try { unlinkSync(aside); } catch { console.log(`${name}: ${aside} could not be removed yet (delete it later)`); } }
  console.log(`${name}: ${indices.length / 3} → ${next.length / 3} triangles, ${count} → ${order.length} vertices, error ${error.toFixed(4)}, ${(source.length / 1e6).toFixed(1)} → ${(out.length / 1e6).toFixed(1)} MB`);
}

for (const entry of readdirSync(models).filter(f => f.endsWith('.glb'))) {
  const name = entry.slice(0, -4);
  if (onlyName && name !== onlyName) continue;
  const {json} = parse(readFileSync(join(existsSync(join(backup, entry)) ? backup : models, entry)));
  const triangles = (json.meshes ?? []).reduce((sum, mesh) => sum + mesh.primitives.reduce((s, p) => s + json.accessors[p.indices].count / 3, 0), 0);
  if (!onlyName && triangles <= LIMIT) continue;
  try { simplifyFile(name, TARGET); } catch (error) { console.log(`${name}: skipped (${error.message})`); }
}
