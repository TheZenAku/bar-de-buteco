// Offline only: npm run assets:animations. FBX source files stay in assets-bar/anim.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AnimationMixer, Object3D, Quaternion, Texture, TextureLoader, Vector3 } from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import {appendOldCane} from './lib/old-cane.mjs';
import {createRetarget} from './lib/animation-retarget.mjs';
import {mixamoBoneName} from './lib/mixamo-names.mjs';
import {evenStance,polishWalkCycle} from './lib/walk-cycle.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const anim = path.join(root, 'assets-bar/anim');
const models = path.join(root, 'apps/web/public/models');
const output = process.env.BAR_ANIMATION_OUTPUT??path.join(root, 'apps/web/public/animations');
const prefix = 'rp_nathan_animated_003_walking_';
const misc = filename => ({filename:path.join('misc',filename),mixamo:true});
const clips = {
  // Object-specific actions keep their native Nathan skeleton. Generic locomotion and social clips
  // use the polished Mixamo sources, retargeted from their taller reference skeleton.
  Drink: {filename:'bebendo'}, Fallen: {filename:'bebado-caido'}, Deal: {filename:'carta-distribui'},
  Shuffle: {filename:'carta-recomeco'}, CardsSit: {filename:'carta-sentado'}, AngrySit: misc('Sitting Angry.fbx'),
  // The kicks stand on one foot, which slides in the sources: pinned (`anchor`), and the body only ever goes forward with it (`stays`).
  Kick: {filename:'karate-kick',anchor:'foot_l',stays:true}, Bartend: {filename:'Bartending'},
  // Rafael's jump kick lands away from where it took off: that way forward is root motion (`anchor`), the room carries the body.
  AirKick: {filename:path.join('misc','Drop Kick.fbx'),mixamo:true,anchor:'hip',sideways:true},
  // His karate with the guard up goes round two more kicks (KARATE_ROUND in packages/shared/src/kick.ts): high with the right leg, front with the
  // left. After changing either, run npm run assets:kicks.
  KickHigh: {...misc('Mma Kick.fbx'),rate:1.15,anchor:'foot_l',stays:true}, KickFront: {...misc('Kicking.fbx'),rate:1.35,anchor:'foot_r',stays:true},
  // Standard Run was exported with root motion: inPlace removes its forward travel (the server moves the avatar).
  Idle: misc('Idle (1).fbx'), Walk: misc('Standard Walk.fbx'), Run: {filename:'Standard Run.fbx',mixamo:true,inPlace:true}, DrunkIdle: misc('Drunk Idle Variation.fbx'),
  DrunkWalk: misc('Drunk Walk.fbx'), Sit: {filename:'Sitting'},
  // The everyday pace (WALK_SPEED, 3.5 m/s) is a jog: the relaxed walk keeps up only to about 2.4 m/s. BarScene picks it by speed; NPCs keep walking.
  // `even`: its foot on the floor speeds up and slows down in the source; re-timed to one speed so one playback rate keeps it planted.
  Jog: {...misc('Jogging.fbx'),even:true},
  Wave: misc('Waving Gesture.fbx'), Use: misc('Button Pushing.fbx'),
  // A restrained nod to the bartender, played once above a planted idle (never a looping wait pose).
  Order: misc('Acknowledging.fbx'),
  Wait: misc('Standing Idle 03.fbx'), Recover: misc('Standing Up.fbx'),
  // Highfood: looking at the phone (the customer waiting, anyone with the phone open), thanking for the delivery, the bag coming out of the box.
  Text: misc('Texting While Standing.fbx'), Thank: misc('Thankful.fbx'), Pick: misc('Picking Up Object.fbx'),
  // The fist fight (docs/sistemas/luta.md, FIGHT_MOVES in packages/shared/src/fight.ts). The punches and the blows taken come from one boxing set:
  // they start and end on the same guard, so a punch, the next one and a reaction follow each other without a jump. `rate` plays the source faster,
  // baked into the clip: its length here is the length in the game. After changing any of these, run npm run assets:punches.
  FightIdle: misc('Bouncing Fight Idle.fbx'),
  // Their step in and back is root motion (`anchor`): the room moves the body with it (fight.ts, punchStep), so a punch cut short by the next one
  // or by walking leaves the body where the step had taken it, instead of snapping it back to where the punch started.
  Jab: {...misc('Lead Jab (1).fbx'),rate:1.3,anchor:'hip'}, Cross: {...misc('Elbow Punch.fbx'),rate:1.5,anchor:'hip'}, Hook: {...misc('Punching.fbx'),rate:1.3,anchor:'hip'},
  Heavy: {...misc('Hook Punch.fbx'),from:.2,rate:1.25,anchor:'hip'},
  HitLight: {...misc('Head Hit (2).fbx'),rate:1.1}, HitMedium: misc('Medium Hit To Head.fbx'), HitSide: {...misc('Head Hit (1).fbx'),rate:1.1},
  HitHeavy: misc('Head Hit.fbx'), HitBack: misc('Standing React Small From Back.fbx'),
  // The legs in the guard (the arms stay up by a masked layer): back, and to each side. Forward is Walk.
  FightBack: misc('Standing Walk Back.fbx'), FightLeft: misc('Left Strafe Walking.fbx'), FightRight: misc('Right Strafe Walking.fbx'),
};
// Clips that only some skins use: Rafael's skills, in every variant of him (SKILLS in packages/shared), Seu Zé's (Magrão) work behind the counter.
const exclusive = { Kick: ['rafael', 'rafael-rose'], AirKick: ['rafael', 'rafael-rose'], KickHigh: ['rafael', 'rafael-rose'], KickFront: ['rafael', 'rafael-rose'], Bartend: ['magrao'] };
const FIGHT_CLIPS = new Set(['FightIdle', 'Jab', 'Cross', 'Hook', 'Heavy', 'HitLight', 'HitMedium', 'HitSide', 'HitHeavy', 'HitBack', 'FightBack', 'FightLeft', 'FightRight']);
const NPC_ONLY = new Set(['magrao', 'tonico']);
const seatedClips = new Set(['CardsSit', 'AngrySit', 'Sit']);
// Use only the deliberate button press, not the long anticipation/recovery. Recovery stops once upright,
// matching the five-second gameplay recovery instead of freezing on the source's trailing frames.
const trims = {
  Use: {from:.45,to:2.45}, Recover: {from:0,to:5},
  Idle: {from:0,to:4,blend:.5},
  // Four seconds preserve the relaxed weight shifts while avoiding an 11.4 s idle in every skin bank.
  // Blend the tail into the opening pose so the shorter loop remains visually seamless.
  Wait: {from:0,to:4,blend:.5},
  Text: {from:0,to:6,blend:.5},
};

const canonicalSourceName = name => {
  if(name.startsWith(prefix))return name.slice(prefix.length);
  return mixamoBoneName(name)??name;
};
// No meshes/textures are exported; do not require browser image APIs for FBX materials.
TextureLoader.prototype.load = () => new Texture();

function readModel(id) {
  const file = fs.readFileSync(path.join(models, `${id}.glb`));
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

function readSource(filename) {
  const file = fs.readFileSync(path.join(anim, filename));
  return new FBXLoader().parse(file.buffer.slice(file.byteOffset, file.byteOffset + file.length), '');
}

/**
 * Every dance in assets-bar/anim/dance, as `Dance <file name>` clips: G plays one of them at random. The same dance
 * downloaded twice (same motion, different file) is kept once, and the one-frame Mixamo poses are not dances.
 */
function findDances() {
  const kept = [];
  const files = fs.readdirSync(path.join(anim, 'dance')).filter(file => /\.fbx$/i.test(file)).map(file => file.slice(0, -4)).sort();
  for (const base of files) {
    const source = readSource(path.join('dance', `${base}.fbx`)), clip = source.animations[0];
    if (!clip || clip.duration < .5) { console.log(`dance: skipping ${base}, a still pose`); continue; }
    const bones = new Map(); source.traverse(n => { if (n.isBone) bones.set(canonicalSourceName(n.name), n); });
    const mixer = new AnimationMixer(source); mixer.clipAction(clip).play();
    // World rotations of every joint at 12 instants: within half a degree of a kept dance, it is that dance.
    const at = time => {
      mixer.setTime(Math.min(time, clip.duration - 1e-6)); source.updateMatrixWorld(true);
      return new Map([...bones].map(([name, bone]) => [name, bone.getWorldQuaternion(new Quaternion())]));
    };
    const same = (a, b, degrees) => [...a].every(([name, q]) => !b.has(name) || Math.abs(q.dot(b.get(name))) > Math.cos(degrees * Math.PI / 360));
    const pose = Array.from({ length: 12 }, (_, i) => at(clip.duration * i / 12));
    const copy = kept.find(other => Math.abs(other.duration - clip.duration) < 1 / 30 && other.pose.every((frame, i) => same(frame, pose[i], .5)));
    if (copy) { console.log(`dance: skipping ${base}, the same as ${copy.base}`); continue; }
    // A few dances end a little off their first pose (a thumb, for instance): blend their tail into it so the loop closes.
    kept.push({ base, duration: clip.duration, pose, blend: same(pose[0], at(clip.duration), 2) ? undefined : .3 });
  }
  return kept.map(({ base, blend }) => ({ name: `Dance ${base}`, definition: { filename: path.join('dance', `${base}.fbx`), mixamo: true, blend } }));
}

const reference = readModel('nathan');
const dances = findDances();
fs.mkdirSync(output, { recursive: true });
const previousManifest = fs.existsSync(path.join(output,'durations.json'))?JSON.parse(fs.readFileSync(path.join(output,'durations.json'),'utf8')):{};
const knownClips=new Set([...Object.keys(clips),...dances.map(dance=>dance.name),'OldCaneWalk','OldCaneHold']);
const manifest=Object.fromEntries(Object.entries(previousManifest).filter(([name])=>knownClips.has(name)));
const requested=process.argv.slice(2);
// Gilmar enters once his Mixamo skin has been imported (tools/assets/import-mixamo.mjs).
const skins = ['nathan', 'leandro', 'rafael', 'rafael-rose', 'read', 'magrao', 'tonico', 'gilmar-gordo', 'gabriel', 'flavio-hipotetico', 'tiao', 'primo'].filter(id => fs.existsSync(path.join(models, `${id}.glb`)));
for (const id of skins.filter(id=>!requested.length||requested.includes(id))) {
  const model = readModel(id);
  const retargeted = id !== 'nathan';
  const rig=createRetarget(model.nodes,reference.nodes);
  // Two GLBs per skin: <id>.glb with every action, and <id>-dances.glb, which the client fetches after it.
  function bank() {
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
    function write(file) {
      const bin = Buffer.concat(chunks); json.buffers[0].byteLength = bin.length;
      const raw = Buffer.from(JSON.stringify(json));
      const headerJson = Buffer.concat([raw, Buffer.alloc((4 - raw.length % 4) % 4, 0x20)]);
      const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + headerJson.length + bin.length, 8); header.writeUInt32LE(headerJson.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
      const binaryHeader = Buffer.alloc(8); binaryHeader.writeUInt32LE(bin.length); binaryHeader.writeUInt32LE(0x004e4942, 4);
      fs.writeFileSync(path.join(output, file), Buffer.concat([header, headerJson, binaryHeader, bin]));
    }
    return { json, accessor, write };
  }
  function convert({ json, accessor }, name, definition) {
    const filename=definition.filename.endsWith('.fbx')?definition.filename:`${definition.filename}.fbx`;
    const source = readSource(filename);
    const clip = source.animations[0];
    if (!clip?.duration) throw new Error(`Missing animation: ${filename}`);
    const sourceBones = new Map(); source.traverse(n => { if (n.isBone) sourceBones.set(canonicalSourceName(n.name), n); });
    const sourceHip=sourceBones.get('hip');
    if(!sourceHip)throw new Error(`${filename}: hip bone not found`);
    source.updateMatrixWorld(true);
    // Both source packs use centimetres, but the misc Mixamo reference is unusually tall. Normalize its
    // bind hip to Nathan's 0.956 m before transferring translations; rotations use the actual bone axes.
    const sourceUnit=.956/sourceHip.getWorldPosition(new Vector3()).y;
    const sourceRig=definition.mixamo?createRetarget(model.nodes,[...sourceBones.values()],node=>canonicalSourceName(node.name)):rig;
    const adapted=retargeted||!!definition.mixamo;
    const mixer = new AnimationMixer(source); mixer.clipAction(clip).play();
    // `rate` speeds the source up: every sampled moment below is source time, the clip written is `rate` times shorter.
    const rate = definition.rate ?? 1, from = trims[name]?.from ?? definition.from ?? 0, duration = (trims[name]?.to ?? definition.to ?? clip.duration) - from;
    if (trims[name]?.faceForward) {
      // Measure where the hips face at the first kept frame and turn the whole source to face +Z.
      mixer.setTime(from); source.updateMatrixWorld(true);
      const side = sourceBones.get('upperleg_r').getWorldPosition(new Vector3()).sub(sourceBones.get('upperleg_l').getWorldPosition(new Vector3()));
      const forward = new Vector3(0, 1, 0).cross(side);
      source.quaternion.premultiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -Math.atan2(forward.x, forward.z)));
    }
    const samples = Math.ceil(duration * 30);
    let times = Array.from({ length: samples + 1 }, (_, i) => Math.min(i / 30, duration));
    let rotations = model.nodes.map(() => []), translations = model.nodes.map(() => []);
    const basePositions = model.nodes.map(n => n.position.clone()), baseRotations = model.nodes.map(n => n.quaternion.clone());
    const scale = model.byName.get('hip').getWorldPosition(new Vector3()).y / 0.956;
    // The steady travel of a root-motion clip, taken out frame by frame: the loop then starts and ends on the same spot.
    let travel;
    if (definition.inPlace) {
      const hipAt = time => { mixer.setTime(Math.min(time, clip.duration - 1e-6)); source.updateMatrixWorld(true); return sourceHip.getWorldPosition(new Vector3()).multiplyScalar(sourceUnit); };
      travel = hipAt(from + duration).sub(hipAt(from)).setY(0);
      console.log(`${id}: ${name} travels ${(travel.length() * scale / duration).toFixed(2)} m/s at 1x (MIXAMO_PACE)`);
    }
    let firstHip, seatedOffset = 0;
    // Root motion: the way the anchor (the hips, or the foot a kick stands on) goes forward and back is taken out of the hip, so the anchor stays put
    // in the clip, and kept as `root` (m, every frame; `sideways`: also to the left, `rootX`) for the room to move the body the same way. Played
    // through, the body goes exactly where the source went; cut short, it stays where it had got to. `stays`: the most it went forward so far, never
    // back (a foot that slid back in the source stays put).
    const anchor = definition.anchor ? sourceBones.get(definition.anchor) : undefined, root = [], rootX = [];
    if (definition.anchor && (!anchor || !adapted)) throw new Error(`${name}: anchor ${definition.anchor} needs a retargeted clip with that bone`);
    let anchorFrom, ahead = -Infinity;
    // `even`: where each foot is (forward, up) every frame, to re-time the clip by the foot on the floor.
    const feetWay = [];
    for (const time of times) {
      // Avoid AnimationMixer wrapping the final frame back to zero.
      mixer.setTime(Math.min(from + time, clip.duration - 1e-6)); source.updateMatrixWorld(true);
      const sourceHip = sourceBones.get('hip').getWorldPosition(new Vector3()).multiplyScalar(sourceUnit);
      if (travel) sourceHip.addScaledVector(travel, -time / duration);
      if (definition.even) feetWay.push(['foot_l', 'foot_r'].map(foot => { const p = sourceBones.get(foot).getWorldPosition(new Vector3()).multiplyScalar(sourceUnit); return [p.z, p.y]; }));
      if (anchor) {
        const at = anchor.getWorldPosition(new Vector3()).multiplyScalar(sourceUnit);
        anchorFrom ??= at.clone();
        ahead = definition.stays ? Math.max(ahead, at.z - anchorFrom.z) : at.z - anchorFrom.z;
        sourceHip.z -= at.z - anchorFrom.z; root.push(+(ahead * scale).toFixed(4));
        if (definition.sideways) { sourceHip.x -= at.x - anchorFrom.x; rootX.push(+((at.x - anchorFrom.x) * scale).toFixed(4)); }
      }
      if (!firstHip) {
        firstHip = sourceHip.clone();
        if (seatedClips.has(name)) seatedOffset = 0.56 - (adapted ? model.byName.get('hip').getWorldPosition(new Vector3()).y + (sourceHip.y - 0.956) * scale : sourceHip.y);
      }
      const nativePose=adapted?sourceRig.pose(new Map([...sourceBones].map(([name,bone])=>[name,bone.getWorldQuaternion(new Quaternion())]))):undefined;
      model.nodes.forEach((node, index) => {
        let local = baseRotations[index].clone();
        let position = basePositions[index].clone();
        const sourceName = rig.names[index];
        const bone = sourceBones.get(sourceName);
        // Native roots keep their authored (axis conversion) transform; the hip carries the FBX root motion.
        if (adapted) {
          local=nativePose[index];
        } else if (id === 'nathan' && bone) {
          // The root's parent is the FBX group, which faceForward may turn.
          local = node.name === 'root' ? bone.getWorldQuaternion(new Quaternion()) : bone.quaternion.clone();
        }
        if (!adapted && id === 'nathan' && node.name === 'root') {
          sourceBones.get('root').getWorldPosition(position).multiplyScalar(sourceUnit);
          position.x -= firstHip.x; position.z -= firstHip.z; position.y += seatedOffset;
        }
        if (adapted && node.name === 'hip') {
          const target = node.getWorldPosition(new Vector3());
          target.x += (sourceHip.x - firstHip.x) * scale;
          target.z += (sourceHip.z - firstHip.z) * scale;
          target.y += (sourceHip.y - 0.956) * scale + seatedOffset;
          position.copy(node.parent.worldToLocal(target));
        }
        rotations[index].push(...local.toArray()); translations[index].push(...position.toArray());
      });
    }
    const blend = trims[name]?.blend ?? definition.blend;
    if (blend) for (let frame = 0; frame < times.length; frame++) {
      const weight = Math.min(1, Math.max(0, (times[frame] - (duration - blend)) / blend));
      if (!weight) continue;
      const smooth = weight * weight * (3 - 2 * weight), a = new Quaternion(), b = new Quaternion();
      model.nodes.forEach((node, index) => {
        a.fromArray(rotations[index], frame * 4).slerp(b.fromArray(rotations[index], 0), smooth).toArray(rotations[index], frame * 4);
        for (let axis = 0; axis < 3; axis++) translations[index][frame * 3 + axis] += (translations[index][axis] - translations[index][frame * 3 + axis]) * smooth;
      });
    }
    let outputDuration=duration;
    if(name==='Walk'&&rate===1){
      const polished=polishWalkCycle(times,rotations,translations);
      ({times,rotations,translations}=polished);outputDuration=polished.duration;
    }else if(definition.even&&rate===1){
      const polished=polishWalkCycle(times,rotations,translations,{stretch:1,warp:evenStance(times,feetWay)});
      ({times,rotations,translations}=polished);outputDuration=polished.duration;
    }
    if(rate!==1){times=times.map(time=>time/rate);outputDuration/=rate;}
    const input=accessor(times,1);
    const animation = { name, channels: [], samplers: [], ...(anchor ? { extras: { root, ...(definition.sideways ? { rootX } : {}) } } : {}) };
    model.nodes.forEach((node, index) => {
      if (model.json.nodes[index].mesh !== undefined) return;
      for (const [property, data, size] of [['rotation', rotations[index], 4], ['translation', translations[index], 3]]) {
        // Native Nathan actions move root; retargeted actions move hip. Both
        // pivots must be present so switching clips restores the unused pivot
        // instead of retaining a seated/fallen translation from the last action.
        if (property === 'translation' && node.name !== 'hip' && node.name !== 'root') continue;
        const output = accessor(data, size);
        const sampler = animation.samplers.push({ input, output, interpolation: 'LINEAR' }) - 1;
        animation.channels.push({ sampler, target: { node: index, path: property } });
      }
    });
    json.animations.push(animation); manifest[name] = Math.round(outputDuration * 1000);
    console.log(`${id}: ${name}, ${outputDuration.toFixed(2)}s`);
    mixer.stopAllAction(); mixer.uncacheRoot(source);
  }
  const actions = bank(), dancing = bank();
  for (const [name, definition] of Object.entries(clips)) {
    if (exclusive[name] && !exclusive[name].includes(id)) continue;
    // Seu Zé and Tonico are never a player: they do not fight.
    if (FIGHT_CLIPS.has(name) && NPC_ONLY.has(id)) continue;
    convert(actions, name, definition);
  }
  for (const { name, definition } of dances) convert(dancing, name, definition);
  appendOldCane({root,id,model,reference,json:actions.json,accessor:actions.accessor,props:process.env.BAR_PROP_OUTPUT??path.join(root,'apps/web/public/props')});
  manifest.OldCaneWalk=1600;
  actions.write(`${id}.glb`); dancing.write(`${id}-dances.glb`);
}
fs.writeFileSync(path.join(output, 'durations.json'), `${JSON.stringify(manifest, null, 2)}\n`);
