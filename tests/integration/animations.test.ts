import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KICK_DURATION_MS, DRINK_DURATION_MS, WAVE_DURATION_MS, USE_DURATION_MS, RECOVER_DURATION_MS } from '@bar/shared';

function glb(file: string) {
  const bytes = readFileSync(new URL(`../../apps/web/public/${file}`, import.meta.url));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(8), bytes.length, 'GLB length must match its header');
  const length = bytes.readUInt32LE(12);
  return { json: JSON.parse(bytes.subarray(20, 20 + length).toString()), bin: bytes.subarray(28 + length) };
}

// assets-bar/anim/dance without the files that repeat another dance and the one-frame poses.
const DANCES = ['Dancing', 'Dancing Twerk', 'Hip Hop Dancing', 'Hip Hop Dancing (1)', 'Hip Hop Dancing (2)', 'Hip Hop Dancing (3)',
  'Hip Hop Dancing (8)', 'Salsa Dancing', 'Salsa Dancing (2)', 'Samba Dancing', 'Swing Dancing', 'Twist Dance', 'Wave Hip Hop Dance'].map(name => `Dance ${name}`);

test('generated animations bind to existing skins and contain valid skeletal rotations', () => {
  for (const skin of ['nathan', 'leandro', 'rafael', 'read', 'magrao', 'gilmar-gordo']) for (const file of [skin, `${skin}-dances`]) {
    const { json, bin } = glb(`animations/${file}.glb`);
    const model = glb(`models/${skin}.glb`).json;
    assert.deepEqual(json.nodes.map((node: any) => node.name), model.nodes.map((node: any) => node.name));
    assert.equal(json.meshes, undefined, 'Animation banks must not duplicate character geometry');
    const names = json.animations.map((animation: any) => animation.name);
    if (file === skin) {
      for (const clip of ['Drink', 'Fallen', 'Deal', 'Shuffle', 'CardsSit', 'AngrySit', 'Idle', 'Walk', 'Run', 'DrunkIdle', 'DrunkWalk', 'Sit', 'Wave', 'Use', 'Wait', 'Recover']) assert.ok(names.includes(clip));
      assert.ok(!names.some((name: string) => name.startsWith('Dance')), 'The dances have a bank of their own');
    } else assert.deepEqual(names, DANCES, 'Every distinct dance of assets-bar/anim/dance, in file order');
    assert.equal(names.includes('Kick'), skin === 'rafael' && file === skin);
    assert.equal(names.includes('Bartend'), skin === 'magrao' && file === skin, 'Bartending belongs to Seu Zé (Magrão)');
    for (const animation of json.animations) {
      for (const channel of animation.channels) {
        assert.ok(model.nodes[channel.target.node], 'Every track must target an existing model node');
        const sampler = animation.samplers[channel.sampler];
        const input = json.accessors[sampler.input];
        if (animation.name === 'Kick') assert.equal(Math.round(input.max[0] * 1000), KICK_DURATION_MS);
        if (animation.name === 'Drink') assert.equal(Math.round(input.max[0] * 1000), DRINK_DURATION_MS);
        if (animation.name === 'Idle') assert.equal(Math.round(input.max[0] * 1000), 4000, 'The trimmed Mixamo idle replaces the model\'s original idle');
        if (animation.name === 'AngrySit') assert.equal(Math.round(input.max[0] * 1000), 3333, 'The seated loss reaction uses Sitting Angry');
        if (animation.name === 'Sit') assert.equal(Math.round(input.max[0] * 1000), 1167, 'The seated loop is Sitting.fbx');
        if (animation.name === 'Run') assert.equal(Math.round(input.max[0] * 1000), 733, 'The run is Standard Run.fbx');
        if (animation.name === 'Wave') assert.equal(Math.round(input.max[0] * 1000), WAVE_DURATION_MS);
        if (animation.name === 'Use') assert.equal(Math.round(input.max[0] * 1000), USE_DURATION_MS);
        if (animation.name === 'Recover') assert.equal(Math.round(input.max[0] * 1000), RECOVER_DURATION_MS);
        const accessor = json.accessors[sampler.output], view = json.bufferViews[accessor.bufferView];
        assert.equal(accessor.count, input.count);
        const looped = ['Idle','Walk','Run','DrunkIdle','DrunkWalk','Sit','Wait'].includes(animation.name) || animation.name.startsWith('Dance ');
        if (looped && channel.target.path === 'translation') {
          // Standard Run travels forward in its file (root motion): the loop must come back to where it started.
          const at = (frame: number) => Array.from({ length: 3 }, (_, c) => bin.readFloatLE((view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + frame * 12 + c * 4));
          const [first, last] = [at(0), at(accessor.count - 1)];
          assert.ok(Math.hypot(...first.map((value, c) => value - last[c]!)) <= 1e-3 * Math.max(1, Math.hypot(...first)), `${skin}/${animation.name} must loop in place`);
        }
        if (channel.target.path !== 'rotation') continue;
        if (looped) {
          const at = (frame: number) => Array.from({ length: 4 }, (_, c) => bin.readFloatLE((view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + frame * 16 + c * 4));
          const [first, last] = [at(0), at(accessor.count - 1)];
          assert.ok(Math.abs(first.reduce((sum, value, c) => sum + value * last[c]!, 0)) > 0.999, `${skin}/${animation.name} must loop without a seam`);
        }
        for (let frame = 0; frame < accessor.count; frame++) {
          const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + frame * 16;
          const quaternion = Array.from({ length: 4 }, (_, component) => bin.readFloatLE(offset + component * 4));
          assert.ok(Math.abs(Math.hypot(...quaternion) - 1) < 0.001, `${skin}/${animation.name}: invalid rotation`);
        }
      }
    }
  }
});

// Every player skin (and Magrão) has its own Mixamo skeleton, auto-rigged on its body. Canonical names alias the
// joints, whose Mixamo names stay recorded as sourceBone; `weights` says where the skin weights came from.
const MIXAMO_SKINS = [
  {id:'rafael',name:'Rafael',joints:34,weights:'mixamo'},
  {id:'leandro',name:'Leandro',joints:41,weights:'accurig'},
  {id:'read',name:'Read',joints:41,weights:'accurig'},
  {id:'magrao',name:'Magrao',joints:41,weights:'accurig'},
  {id:'gilmar-gordo',name:'Gilmar',joints:41,weights:'automatic'},
] as const;
for (const {id,name,joints,weights:source} of MIXAMO_SKINS) test(`${name} has its own Mixamo skeleton, normalized ${source} weights and embedded materials`, () => {
  const {json,bin}=glb(`models/${id}.glb`);
  assert.equal(json.asset.extras.rig,'Mixamo');assert.equal(json.asset.extras.weights,source);
  assert.equal(json.nodes[json.scenes[json.scene].nodes[0]].name,name);
  assert.deepEqual(json.nodes[json.scenes[json.scene].nodes[0]].scale??[1,1,1],[1,1,1], 'Instance scale must remain one');
  assert.equal(json.skins.length,1);assert.equal(json.skins[0].joints.length,joints);
  for(const [joint,source] of [['hip','mixamorigHips'],['upperleg_l','mixamorigLeftUpLeg'],['hand_r','mixamorigRightHand']]){
    assert.equal(json.nodes.find((n:any)=>n.name===joint)?.extras?.sourceBone,source);
  }
  for(const name of ['Idle','Walk','Pose'])assert.ok(json.animations.some((a:any)=>a.name===name));
  const read=(index:number,size:number,at:(offset:number)=>number,bytes:number)=>{const a=json.accessors[index],v=json.bufferViews[a.bufferView];return Array.from({length:a.count*size},(_,i)=>at((v.byteOffset??0)+(a.byteOffset??0)+i*bytes));};
  let triangles=0;
  for(const mesh of json.meshes)for(const primitive of mesh.primitives){
    const accessor=json.accessors[primitive.attributes.WEIGHTS_0];
    assert.equal(accessor.componentType,5126);assert.equal(accessor.type,'VEC4');
    const weights=read(primitive.attributes.WEIGHTS_0,4,o=>bin.readFloatLE(o),4);
    for(let i=0;i<weights.length;i+=4){
      const vertex=weights.slice(i,i+4);
      assert.ok(vertex.every(w=>Number.isFinite(w)&&w>=0));
      assert.ok(Math.abs(vertex.reduce((a,b)=>a+b,0)-1)<.0001,'Truncated weights must be renormalized');
    }
    const material=json.materials[primitive.material];
    assert.ok(material.pbrMetallicRoughness.baseColorTexture);assert.ok(material.normalTexture);
    // Mixamo downloads drop the normals; the importer restores them.
    assert.ok(primitive.attributes.NORMAL!==undefined);
    // Simplification must not bridge distant parts (e.g. a fingertip to the hip), which stretch in every pose.
    const position=read(primitive.attributes.POSITION,3,o=>bin.readFloatLE(o),4),wide=json.accessors[primitive.indices].componentType===5125;
    const indices=read(primitive.indices,1,o=>wide?bin.readUInt32LE(o):bin.readUInt16LE(o),wide?4:2);
    const {min,max}=json.accessors[primitive.attributes.POSITION],height=max[1]-min[1];
    let longest=0;
    for(let f=0;f<indices.length;f+=3)for(let k=0;k<3;k++){
      const a=indices[f+k]!*3,b=indices[f+(k+1)%3]!*3;
      longest=Math.max(longest,Math.hypot(position[a]!-position[b]!,position[a+1]!-position[b+1]!,position[a+2]!-position[b+2]!));
    }
    assert.ok(longest/height<.13,`${name}: a triangle edge of ${(longest/height*100).toFixed(0)}% of the body height`);
    triangles+=indices.length/3;
  }
  assert.ok(triangles<=100000,`${name}: ${triangles} triangles exceed the skin budget`);
  assert.ok(json.images.every((image:any)=>image.bufferView!==undefined&&!image.uri),'Textures must be embedded');
});
