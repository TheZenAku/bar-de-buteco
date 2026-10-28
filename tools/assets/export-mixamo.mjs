// Bakes each player GLB in its bind pose to a static OBJ (centimetres, Y-up, facing +Z) for Mixamo's auto-rigger.
// usage: node tools/assets/export-mixamo.mjs [skin...]  -> assets-bar/mixamo/upload/<id>.obj
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Matrix4, Vector3} from 'three';
import {objects, readGlb} from './lib/character-gltf.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = path.join(root, 'assets-bar/mixamo/upload');
const skins = ['nathan', 'leandro', 'rafael', 'read', 'magrao'];
const wanted = process.argv.slice(2);
for (const id of wanted) if (!skins.includes(id)) throw new Error(`Unknown skin: ${id}`);
fs.mkdirSync(output, {recursive: true});

const sizes = {SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16};
const readers = {5120: ['getInt8', 1, 127], 5121: ['getUint8', 1, 255], 5122: ['getInt16', 2, 32767], 5123: ['getUint16', 2, 65535], 5125: ['getUint32', 4, 0], 5126: ['getFloat32', 4, 0]};
function read({json, bin}, index) {
  const a = json.accessors[index], view = json.bufferViews[a.bufferView], size = sizes[a.type];
  const [method, bytes, max] = readers[a.componentType];
  const data = new DataView(bin.buffer, bin.byteOffset + (view.byteOffset ?? 0) + (a.byteOffset ?? 0));
  const stride = view.byteStride ?? size * bytes, out = new Float64Array(a.count * size);
  for (let i = 0; i < a.count; i++) for (let c = 0; c < size; c++) {
    const v = data[method](i * stride + c * bytes, true);
    out[i * size + c] = a.normalized && max ? Math.max(v / max, -1) : v;
  }
  return out;
}

for (const id of skins.filter(id => !wanted.length || wanted.includes(id))) {
  const glb = readGlb(path.join(root, 'apps/web/public/models', `${id}.glb`)), {json} = glb;
  const nodes = objects(json);
  const lines = [`# ${id}: bind pose baked by B.A.R. for Mixamo`];
  let base = 1, vertices = 0;
  json.nodes.forEach((node, n) => {
    if (node.mesh === undefined) return;
    const skin = json.skins?.[node.skin];
    const ibm = skin && read(glb, skin.inverseBindMatrices);
    const joints = skin?.joints.map((j, i) => nodes[j].matrixWorld.clone().multiply(new Matrix4().fromArray(ibm, i * 16)));
    for (const primitive of json.meshes[node.mesh].primitives) {
      if ((primitive.mode ?? 4) !== 4) continue;
      const {POSITION, TEXCOORD_0, JOINTS_0, WEIGHTS_0} = primitive.attributes;
      const position = read(glb, POSITION), uv = TEXCOORD_0 !== undefined && read(glb, TEXCOORD_0);
      const jointIds = skin && read(glb, JOINTS_0), weights = skin && read(glb, WEIGHTS_0);
      const count = position.length / 3, v = new Vector3(), sum = new Vector3(), m = new Matrix4();
      for (let i = 0; i < count; i++) {
        v.fromArray(position, i * 3);
        if (skin) {
          sum.set(0, 0, 0);
          for (let k = 0; k < 4; k++) {
            const w = weights[i * 4 + k];
            if (w) sum.addScaledVector(v.clone().applyMatrix4(m.copy(joints[jointIds[i * 4 + k]])), w);
          }
          v.copy(sum);
        } else v.applyMatrix4(nodes[n].matrixWorld);
        lines.push(`v ${(v.x * 100).toFixed(4)} ${(v.y * 100).toFixed(4)} ${(v.z * 100).toFixed(4)}`);
        if (uv) lines.push(`vt ${uv[i * 2].toFixed(6)} ${(1 - uv[i * 2 + 1]).toFixed(6)}`);
      }
      const index = primitive.indices !== undefined ? read(glb, primitive.indices) : Array.from({length: count}, (_, i) => i);
      for (let i = 0; i < index.length; i += 3) {
        const f = [index[i], index[i + 1], index[i + 2]].map(k => k + base);
        lines.push(uv ? `f ${f.map(k => `${k}/${k}`).join(' ')}` : `f ${f.join(' ')}`);
      }
      base += count; vertices += count;
    }
  });
  fs.writeFileSync(path.join(output, `${id}.obj`), `${lines.join('\n')}\n`);
  console.log(`${id}: ${vertices} vertices -> assets-bar/mixamo/upload/${id}.obj`);
}
