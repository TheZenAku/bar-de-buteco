// Checks for the six Ribeiro placeholder GLBs (scripts/97_ribeiro_placeholders.py in assets-bar/map/BarBoteco). Shared by
// tools/assets/import-ribeiro-placeholders.mjs, tools/assets/validate-ribeiro-placeholders.mjs and tests/tools/ribeiro-placeholders.test.mjs.
// Pure functions: they read bytes and return findings, they never touch the disk besides readSpecs().
import fs from 'node:fs';

/** Contract numbers from the brief: metres, y up in the GLB (z up in Blender). Depth is the glTF z axis (Blender -y is the front). */
export const LIMITS = { maxTriangles: 8000, targetTriangles: [2000, 5000], size: { x: 0.75, y: 0.45, z: 0.55 }, idle: 2, operate: [1.2, 2], atlas: 1024, epsilon: 1e-3 };

/** Reads node/asset pairs from RIBEIRO_PLACEHOLDER_SPECS, so the names live in one place (apps/web/src/machine-shop/placeholders.ts). */
export function readSpecs(placeholdersTs) {
  const text = fs.readFileSync(placeholdersTs, 'utf8');
  const block = text.match(/RIBEIRO_PLACEHOLDER_SPECS\s*=\s*\{([\s\S]*?)\}\s*as const/);
  if (!block) throw new Error('RIBEIRO_PLACEHOLDER_SPECS não encontrado em placeholders.ts');
  const specs = [...block[1].matchAll(/(\w+):\{node:'([^']+)',asset:'([^']+)'/g)].map(m => ({ kind: m[1], node: m[2], asset: m[3] }));
  if (specs.length !== 6) throw new Error(`Esperava 6 placeholders, encontrei ${specs.length}`);
  return specs;
}

export function parseGlb(buffer) {
  if (buffer.length < 20 || buffer.toString('latin1', 0, 4) !== 'glTF') throw new Error('não é um GLB');
  const jsonLength = buffer.readUInt32LE(12);
  if (buffer.toString('latin1', 16, 20) !== 'JSON') throw new Error('primeiro bloco do GLB não é JSON');
  const json = JSON.parse(buffer.toString('utf8', 20, 20 + jsonLength));
  let bin = Buffer.alloc(0);
  const at = 20 + jsonLength;
  if (at + 8 <= buffer.length && buffer.toString('latin1', at + 4, at + 8) === 'BIN\0') bin = buffer.subarray(at + 8, at + 8 + buffer.readUInt32LE(at));
  return { json, bin };
}

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function readAccessor({ json, bin }, index) {
  const accessor = json.accessors[index], view = json.bufferViews[accessor.bufferView];
  if (accessor.componentType !== 5126) throw new Error(`accessor ${index}: só float é lido aqui`);
  const size = COMPONENTS[accessor.type], stride = view.byteStride || size * 4, start = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const out = [];
  for (let i = 0; i < accessor.count; i++) {
    const row = [];
    for (let k = 0; k < size; k++) row.push(bin.readFloatLE(start + i * stride + k * 4));
    out.push(row);
  }
  return out;
}

function imageSize(buffer) {
  if (buffer.length > 24 && buffer.readUInt32BE(0) === 0x89504e47) return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let p = 2;
    while (p + 9 < buffer.length) {
      if (buffer[p] !== 0xff) { p++; continue; }
      const marker = buffer[p + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: buffer.readUInt16BE(p + 5), width: buffer.readUInt16BE(p + 7) };
      p += 2 + buffer.readUInt16BE(p + 2);
    }
  }
  return undefined;
}

// 4x4 column-major matrices: enough for the node transforms a glTF can carry.
const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
function local(node) {
  if (node.matrix) return node.matrix;
  const [x, y, z, w] = node.rotation || [0, 0, 0, 1], [sx, sy, sz] = node.scale || [1, 1, 1], [tx, ty, tz] = node.translation || [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

/** Everything the contract asks of one placeholder GLB. Returns {errors, warnings, stats}; errors are blocking. */
export function inspectGlb(buffer, spec) {
  const errors = [], warnings = [], stats = {};
  let glb;
  try { glb = parseGlb(buffer); } catch (failure) { return { errors: [`${spec.asset}: ${failure.message}`], warnings, stats }; }
  const { json, bin } = glb, nodes = json.nodes ?? [], fail = message => errors.push(`${spec.asset}: ${message}`), warn = message => warnings.push(`${spec.asset}: ${message}`);

  // scene and root
  if ((json.scenes ?? []).length !== 1) fail(`deve ter 1 cena, tem ${(json.scenes ?? []).length}`);
  const rootIds = json.scenes?.[json.scene ?? 0]?.nodes ?? [];
  if (rootIds.length !== 1) fail(`deve ter 1 nó raiz, tem ${rootIds.length}`);
  const rootId = rootIds[0], root = nodes[rootId];
  if (!root || root.name !== spec.node) fail(`nó raiz deve ser ${spec.node}, é ${root?.name}`);
  if (root && (root.translation?.some(v => Math.abs(v) > 1e-6) || root.rotation?.some((v, i) => Math.abs(v - [0, 0, 0, 1][i]) > 1e-6) || root.scale?.some(v => Math.abs(v - 1) > 1e-6) || root.matrix)) fail('o nó raiz não pode carregar posição, rotação ou escala (o jogo posiciona a raiz)');
  for (const [index, node] of nodes.entries()) {
    if (!node.name || !/^RB_[\x20-\x7e]+$/.test(node.name)) fail(`nó ${index} "${node.name}" precisa de nome ASCII com prefixo RB_`);
  }
  if (!nodes.some(node => /_MOVEL$/.test(node.name ?? ''))) fail('falta um subnó *_MOVEL');

  // no cameras, lights, skins, morphs
  if (json.cameras?.length || nodes.some(node => node.camera !== undefined)) fail('não pode exportar câmera');
  if (json.extensions?.KHR_lights_punctual || nodes.some(node => node.extensions?.KHR_lights_punctual)) fail('não pode exportar luz');
  if (json.skins?.length) fail('sem pele/esqueleto: o movimento é mecânico, por nós');
  for (const mesh of json.meshes ?? []) for (const primitive of mesh.primitives) if (primitive.targets?.length) fail('sem morph targets (sem deformação de malha)');

  // triangles and bounds (rest pose, world space under the root)
  let triangles = 0, usedMaterials = new Set();
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const walk = (id, parent) => {
    const node = nodes[id], world = mul(parent, local(node));
    if (node.mesh !== undefined) {
      for (const primitive of json.meshes[node.mesh].primitives) {
        if ((primitive.mode ?? 4) !== 4) fail('só triângulos');
        triangles += (primitive.indices !== undefined ? json.accessors[primitive.indices].count : json.accessors[primitive.attributes.POSITION].count) / 3;
        if (primitive.material !== undefined) usedMaterials.add(primitive.material);
        if (!('NORMAL' in primitive.attributes)) fail('falta NORMAL');
        if (!('TEXCOORD_0' in primitive.attributes)) fail('falta TEXCOORD_0');
        const position = json.accessors[primitive.attributes.POSITION];
        for (let corner = 0; corner < 8; corner++) {
          const p = [corner & 1 ? position.max[0] : position.min[0], corner & 2 ? position.max[1] : position.min[1], corner & 4 ? position.max[2] : position.min[2]];
          for (let axis = 0; axis < 3; axis++) {
            const v = world[axis] * p[0] + world[4 + axis] * p[1] + world[8 + axis] * p[2] + world[12 + axis];
            lo[axis] = Math.min(lo[axis], v); hi[axis] = Math.max(hi[axis], v);
          }
        }
      }
    }
    for (const child of node.children ?? []) walk(child, world);
  };
  if (root) walk(rootId, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const size = hi.map((v, i) => v - lo[i]);
  stats.triangles = triangles; stats.size = size; stats.min = lo; stats.max = hi;
  if (triangles > LIMITS.maxTriangles) fail(`${triangles} triângulos (máx. ${LIMITS.maxTriangles})`);
  else if (triangles < LIMITS.targetTriangles[0] || triangles > LIMITS.targetTriangles[1]) warn(`${triangles} triângulos fora do alvo ${LIMITS.targetTriangles.join('–')}`);
  if (size[0] > LIMITS.size.x + LIMITS.epsilon || size[1] > LIMITS.size.y + LIMITS.epsilon || size[2] > LIMITS.size.z + LIMITS.epsilon) fail(`dimensões ${size.map(v => v.toFixed(3)).join(' × ')} m passam de ${LIMITS.size.x} × ${LIMITS.size.y} × ${LIMITS.size.z} (x × y × z)`);
  if (Math.abs(lo[1]) > 0.003) fail(`o piso da bandeja deve ficar em y=0 (mínimo em ${lo[1].toFixed(4)})`);
  if (Math.abs((lo[0] + hi[0]) / 2) > 0.05 || Math.abs((lo[2] + hi[2]) / 2) > 0.05) fail('a bandeja deve ficar centrada na origem do nó raiz');

  // materials and the atlas
  const materials = json.materials ?? [];
  if (materials.length < 1) fail('sem material');
  materials.forEach((material, index) => { if (!usedMaterials.has(index)) fail(`material ${index} (${material.name}) sem uso`); });
  const pbr = materials[0]?.pbrMetallicRoughness;
  if (materials[0] && !(pbr?.baseColorTexture && pbr?.metallicRoughnessTexture && materials[0].normalTexture)) fail('o material precisa de cor, metal/rugosidade e normal no atlas');
  const images = json.images ?? [];
  if (images.length < 1 || images.length > 3) fail(`o atlas tem ${images.length} imagens (cor, normal, metal/rugosidade: 1 a 3)`);
  const sizes = images.map(image => image.bufferView === undefined ? undefined : imageSize(bin.subarray(json.bufferViews[image.bufferView].byteOffset || 0, (json.bufferViews[image.bufferView].byteOffset || 0) + json.bufferViews[image.bufferView].byteLength)));
  stats.atlas = sizes;
  if (images.some(image => image.uri)) fail('as texturas devem ir embutidas no GLB');
  if (sizes.some(s => !s)) fail('não consegui ler o tamanho de uma textura');
  else {
    if (sizes.some(s => Math.max(s.width, s.height) > LIMITS.atlas)) fail(`textura acima de ${LIMITS.atlas}`);
    if (new Set(sizes.map(s => `${s.width}x${s.height}`)).size > 1) fail('as imagens do atlas têm tamanhos diferentes');
  }
  const normal = materials[0]?.normalTexture;
  if (normal && !json.meshes.every(mesh => mesh.primitives.every(p => 'TANGENT' in p.attributes))) warn('há normal map mas não há tangentes exportadas (o motor as calcula)');

  // animations: exactly Idle and Operate, loops with no jump, root never moves
  const animations = json.animations ?? [];
  const byName = Object.fromEntries(animations.map(a => [a.name, a]));
  const names = animations.map(a => a.name).sort().join(',');
  if (names !== 'Idle,Operate') fail(`clipes devem ser exatamente Idle e Operate, são: ${names || 'nenhum'}`);
  for (const animation of animations) {
    let end = 0;
    for (const sampler of animation.samplers) end = Math.max(end, json.accessors[sampler.input].max?.[0] ?? 0);
    stats[animation.name] = end;
    if (animation.name === 'Idle' && Math.abs(end - LIMITS.idle) > 0.02) fail(`Idle dura ${end.toFixed(3)} s (deve ser ${LIMITS.idle})`);
    if (animation.name === 'Operate' && (end < LIMITS.operate[0] - 0.02 || end > LIMITS.operate[1] + 0.02)) fail(`Operate dura ${end.toFixed(3)} s (deve ficar entre ${LIMITS.operate.join(' e ')})`);
    for (const channel of animation.channels) {
      if (channel.target.node === rootId) fail(`${animation.name} mexe no nó raiz`);
      const sampler = animation.samplers[channel.sampler], values = readAccessor(glb, sampler.output);
      const first = values[0], last = values.at(-1), same = first.every((v, i) => Math.abs(v - last[i]) < 1e-4), flipped = channel.target.path === 'rotation' && first.every((v, i) => Math.abs(v + last[i]) < 1e-4);
      if (!same && !flipped) fail(`${animation.name} / ${nodes[channel.target.node]?.name}.${channel.target.path} não fecha o laço (${first.map(v => v.toFixed(4))} → ${last.map(v => v.toFixed(4))})`);
    }
  }
  if (byName.Idle && byName.Operate && animations.some(a => a.channels.length === 0)) fail('clipe sem canais');
  return { errors, warnings, stats };
}
