// Offline only: npm run assets:animations. FBX source files stay in assets-bar/anim.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AnimationMixer, Object3D, Quaternion, Texture, TextureLoader, Vector3 } from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import {appendOldCane} from './lib/old-cane.mjs';
import {createRetarget} from './lib/animation-retarget.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const models = path.join(root, 'apps/web/public/models');
const output = process.env.BAR_ANIMATION_OUTPUT??path.join(root, 'apps/web/public/animations');
const prefix = 'rp_nathan_animated_003_walking_';
const clips = {
  Drink: 'bebendo', Fallen: 'bebado-caido', Deal: 'carta-distribui',
  Shuffle: 'carta-recomeco', CardsSit: 'carta-sentado', AngrySit: 'sit-angry', Kick: 'karate-kick',
  Dance: 'Dancing', Sit: 'Sitting Drinking', Bartend: 'Bartending',
};
// Clips that only one skin uses: Rafael's karate, Seu Zé's (Magrão) work behind the counter.
const exclusive = { Kick: 'rafael', Bartend: 'magrao' };
const seatedClips = new Set(['CardsSit', 'AngrySit', 'Sit']);
// Sitting Drinking walks ~3 m to the chair, turns round and sits, then drinks from 7.5 s. Plain sitting
// keeps only the calm stretch before the drink, turned to face forward, with its last moments blended
// back into the first frame so the loop has no seam.
const trims = { Sit: { from: 4.5, to: 7.2, blend: 0.6, faceForward: true } };
// No meshes/textures are exported; do not require browser image APIs for FBX materials.
TextureLoader.prototype.load = () => new Texture();

function readModel(id) {
  const file = fs.readFileSync(path.join(id.startsWith('base-')?(process.env.BAR_CHARACTER_OUTPUT??path.join(root,'apps/web/public/characters')):models, `${id}.glb`));
  const length = file.readUInt32LE(12);
  const json = JSON.parse(file.subarray(20, 20 + length));
  const nodes = json.nodes.map(n => {
    const object = new Object3D(); object.name = n.name;
    object.position.fromArray(n.translation ?? [0, 0, 0]);
    object.quaternion.fromArray(n.rotation ?? [0, 0, 0, 1]);
    object.scale.fromArray(n.scale ?? [1, 1, 1]);
    object.userData.retargetMesh=n.mesh!==undefined;
    return object;
  });
  json.nodes.forEach((n, i) => n.children?.forEach(c => nodes[i].add(nodes[c])));
  nodes[0].updateMatrixWorld(true);
  return { json, nodes, byName: new Map(nodes.map(n => [n.name, n])) };
}

const reference = readModel('nathan');
fs.mkdirSync(output, { recursive: true });
const manifest = fs.existsSync(path.join(output,'durations.json'))?JSON.parse(fs.readFileSync(path.join(output,'durations.json'),'utf8')):{};
const requested=process.argv.slice(2);
for (const id of ['nathan', 'leandro', 'rafael', 'read', 'magrao','base-male','base-female'].filter(id=>!requested.length||requested.includes(id))) {
  const model = readModel(id);
  const retargeted = id !== 'nathan';
  const rig=createRetarget(model.nodes,reference.nodes);
  const hipName = id === 'rafael' ? 'pelvis' : 'hip';
  const json = { asset: { version: '2.0', generator: 'B.A.R. animation converter' },
    scene: 0, scenes: [{ nodes: model.json.scenes[model.json.scene ?? 0].nodes }],
    nodes: model.json.nodes.map(({ mesh, skin, ...n }) => n), animations: [], accessors: [], bufferViews: [], buffers: [{ byteLength: 0 }] };
  const chunks = []; let offset = 0;
  function accessor(values, size) {
    const array = Float32Array.from(values);
    if(!array.every(Number.isFinite))throw new Error(`${id}: non-finite animation data`);
    const buffer = Buffer.from(array.buffer);
    const view = json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: buffer.length }) - 1;
    chunks.push(buffer); offset += buffer.length;
    const a = { bufferView: view, componentType: 5126, count: array.length / size, type: size === 1 ? 'SCALAR' : `VEC${size}` };
    if (size === 1) { a.min = [array[0]]; a.max = [array.at(-1)]; }
    return json.accessors.push(a) - 1;
  }
  for (const [name, filename] of Object.entries(clips)) {
    if (exclusive[name] && exclusive[name] !== id) continue;
    const file = fs.readFileSync(path.join(root, 'assets-bar/anim', `${filename}.fbx`));
    const source = new FBXLoader().parse(file.buffer.slice(file.byteOffset, file.byteOffset + file.length), '');
    const clip = source.animations[0];
    if (!clip?.duration) throw new Error(`Missing animation: ${filename}`);
    const sourceBones = new Map(); source.traverse(n => { if (n.isBone) sourceBones.set(n.name.replace(prefix, ''), n); });
    const mixer = new AnimationMixer(source); mixer.clipAction(clip).play();
    const from = trims[name]?.from ?? 0, duration = (trims[name]?.to ?? clip.duration) - from;
    if (trims[name]?.faceForward) {
      // Measure where the hips face at the first kept frame and turn the whole source to face +Z.
      mixer.setTime(from); source.updateMatrixWorld(true);
      const side = sourceBones.get('upperleg_r').getWorldPosition(new Vector3()).sub(sourceBones.get('upperleg_l').getWorldPosition(new Vector3()));
      const forward = new Vector3(0, 1, 0).cross(side);
      source.quaternion.premultiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -Math.atan2(forward.x, forward.z)));
    }
    const samples = Math.ceil(duration * 30);
    const times = Array.from({ length: samples + 1 }, (_, i) => Math.min(i / 30, duration));
    const input = accessor(times, 1);
    const rotations = model.nodes.map(() => []), translations = model.nodes.map(() => []);
    const basePositions = model.nodes.map(n => n.position.clone()), baseRotations = model.nodes.map(n => n.quaternion.clone());
    const scale = model.byName.get(hipName).getWorldPosition(new Vector3()).y / 0.956;
    let firstHip, seatedOffset = 0;
    for (const time of times) {
      // Avoid AnimationMixer wrapping the final frame back to zero.
      mixer.setTime(Math.min(from + time, clip.duration - 1e-6)); source.updateMatrixWorld(true);
      const sourceHip = sourceBones.get('hip').getWorldPosition(new Vector3()).multiplyScalar(0.01);
      if (!firstHip) {
        firstHip = sourceHip.clone();
        if (seatedClips.has(name)) seatedOffset = 0.56 - (retargeted ? model.byName.get(hipName).getWorldPosition(new Vector3()).y + (sourceHip.y - 0.956) * scale : sourceHip.y);
      }
      const nativePose=retargeted?rig.pose(new Map([...sourceBones].map(([name,bone])=>[name,bone.getWorldQuaternion(new Quaternion())]))):undefined;
      model.nodes.forEach((node, index) => {
        let local = baseRotations[index].clone();
        let position = basePositions[index].clone();
        const sourceName = rig.names[index];
        const bone = sourceBones.get(sourceName);
        // The root of Rafael is a static Z-up conversion; pelvis incorporates FBX root motion.
        if (retargeted) {
          local=nativePose[index];
        } else if (id === 'nathan' && bone) {
          // The root's parent is the FBX group, which faceForward may turn.
          local = node.name === 'root' ? bone.getWorldQuaternion(new Quaternion()) : bone.quaternion.clone();
        }
        if (id === 'nathan' && node.name === 'root') {
          sourceBones.get('root').getWorldPosition(position).multiplyScalar(0.01);
          position.x -= firstHip.x; position.z -= firstHip.z; position.y += seatedOffset;
        }
        if (retargeted && node.name === hipName) {
          const target = node.getWorldPosition(new Vector3());
          target.x += (sourceHip.x - firstHip.x) * scale;
          target.z += (sourceHip.z - firstHip.z) * scale;
          target.y += (sourceHip.y - 0.956) * scale + seatedOffset;
          position.copy(node.parent.worldToLocal(target));
        }
        rotations[index].push(...local.toArray()); translations[index].push(...position.toArray());
      });
    }
    const blend = trims[name]?.blend;
    if (blend) for (let frame = 0; frame < times.length; frame++) {
      const weight = Math.min(1, Math.max(0, (times[frame] - (duration - blend)) / blend));
      if (!weight) continue;
      const smooth = weight * weight * (3 - 2 * weight), a = new Quaternion(), b = new Quaternion();
      model.nodes.forEach((node, index) => {
        a.fromArray(rotations[index], frame * 4).slerp(b.fromArray(rotations[index], 0), smooth).toArray(rotations[index], frame * 4);
        for (let axis = 0; axis < 3; axis++) translations[index][frame * 3 + axis] += (translations[index][axis] - translations[index][frame * 3 + axis]) * smooth;
      });
    }
    const animation = { name, channels: [], samplers: [] };
    model.nodes.forEach((node, index) => {
      if (model.json.nodes[index].mesh !== undefined) return;
      for (const [property, data, size] of [['rotation', rotations[index], 4], ['translation', translations[index], 3]]) {
        if (property === 'translation' && node.name !== (retargeted ? hipName : 'root')) continue;
        const output = accessor(data, size);
        const sampler = animation.samplers.push({ input, output, interpolation: 'LINEAR' }) - 1;
        animation.channels.push({ sampler, target: { node: index, path: property } });
      }
    });
    json.animations.push(animation); manifest[name] = Math.round(duration * 1000);
    console.log(`${id}: ${name}, ${duration.toFixed(2)}s`);
    mixer.stopAllAction(); mixer.uncacheRoot(source);
  }
  appendOldCane({root,id,model,reference,json,accessor,props:process.env.BAR_PROP_OUTPUT??path.join(root,'apps/web/public/props')});
  manifest.OldCaneWalk=1600;
  const bin = Buffer.concat(chunks); json.buffers[0].byteLength = bin.length;
  const raw = Buffer.from(JSON.stringify(json));
  const headerJson = Buffer.concat([raw, Buffer.alloc((4 - raw.length % 4) % 4, 0x20)]);
  const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + headerJson.length + bin.length, 8); header.writeUInt32LE(headerJson.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const binaryHeader = Buffer.alloc(8); binaryHeader.writeUInt32LE(bin.length); binaryHeader.writeUInt32LE(0x004e4942, 4);
  fs.writeFileSync(path.join(output, `${id}.glb`), Buffer.concat([header, headerJson, binaryHeader, bin]));
}
fs.writeFileSync(path.join(output, 'durations.json'), `${JSON.stringify(manifest, null, 2)}\n`);
