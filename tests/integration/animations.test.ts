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

test('generated animations bind to existing skins and contain valid skeletal rotations', () => {
  for (const skin of ['nathan', 'leandro', 'rafael', 'read', 'magrao']) {
    const { json, bin } = glb(`animations/${skin}.glb`);
    const model = glb(`models/${skin}.glb`).json;
    assert.deepEqual(json.nodes.map((node: any) => node.name), model.nodes.map((node: any) => node.name));
    assert.equal(json.meshes, undefined, 'Animation banks must not duplicate character geometry');
    const names = json.animations.map((animation: any) => animation.name);
    for (const clip of ['Drink', 'Fallen', 'Deal', 'Shuffle', 'CardsSit', 'AngrySit', 'Walk', 'Run', 'DrunkIdle', 'DrunkWalk', 'Dance', 'Sit', 'Wave', 'Use', 'Wait', 'Recover']) assert.ok(names.includes(clip));
    assert.equal(names.includes('Kick'), skin === 'rafael');
    assert.equal(names.includes('Bartend'), skin === 'magrao', 'Bartending belongs to Seu Zé (Magrão)');
    for (const animation of json.animations) {
      for (const channel of animation.channels) {
        assert.ok(model.nodes[channel.target.node], 'Every track must target an existing model node');
        const sampler = animation.samplers[channel.sampler];
        const input = json.accessors[sampler.input];
        if (animation.name === 'Kick') assert.equal(Math.round(input.max[0] * 1000), KICK_DURATION_MS);
        if (animation.name === 'Drink') assert.equal(Math.round(input.max[0] * 1000), DRINK_DURATION_MS);
        if (animation.name === 'Sit') assert.equal(Math.round(input.max[0] * 1000), 4167, 'The neutral seated loop, without an invisible drink');
        if (animation.name === 'Wave') assert.equal(Math.round(input.max[0] * 1000), WAVE_DURATION_MS);
        if (animation.name === 'Use') assert.equal(Math.round(input.max[0] * 1000), USE_DURATION_MS);
        if (animation.name === 'Recover') assert.equal(Math.round(input.max[0] * 1000), RECOVER_DURATION_MS);
        const accessor = json.accessors[sampler.output], view = json.bufferViews[accessor.bufferView];
        assert.equal(accessor.count, input.count);
        if (channel.target.path !== 'rotation') continue;
        if (['Walk','Run','DrunkIdle','DrunkWalk','Dance','Sit','Wait'].includes(animation.name)) {
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

for (const [id,name,joints] of [['leandro','Leandro',100],['read','Read',82],['magrao','Magrao',100]] as const) test(`${name} preserves the AccuRig joints, normalized weights and embedded materials`, () => {
  const {json,bin}=glb(`models/${id}.glb`);
  assert.equal(json.asset.extras.rig,'AccuRig');
  assert.equal(json.nodes[json.scenes[json.scene].nodes[0]].name,name);
  assert.deepEqual(json.nodes[json.scenes[json.scene].nodes[0]].scale??[1,1,1],[1,1,1], 'Instance scale must remain one');
  assert.equal(json.skins.length,1);assert.equal(json.skins[0].joints.length,joints);
  for(const [name,source] of [['hip','CC_Base_Hip'],['upperleg_l','CC_Base_L_Thigh'],['hand_r','CC_Base_R_Hand']]){
    assert.equal(json.nodes.find((n:any)=>n.name===name)?.extras?.sourceBone,source);
  }
  for(const name of ['Idle','Walk','Pose'])assert.ok(json.animations.some((a:any)=>a.name===name));
  for(const mesh of json.meshes)for(const primitive of mesh.primitives){
    const accessor=json.accessors[primitive.attributes.WEIGHTS_0],view=json.bufferViews[accessor.bufferView];
    assert.equal(accessor.componentType,5126);assert.equal(accessor.type,'VEC4');
    for(let i=0;i<accessor.count;i++){
      const start=(view.byteOffset??0)+(accessor.byteOffset??0)+i*16;
      const weights=Array.from({length:4},(_,j)=>bin.readFloatLE(start+j*4));
      assert.ok(weights.every(w=>Number.isFinite(w)&&w>=0));
      assert.ok(Math.abs(weights.reduce((a,b)=>a+b,0)-1)<.0001,'Truncated FBX weights must be renormalized');
    }
    const material=json.materials[primitive.material];
    assert.ok(material.pbrMetallicRoughness.baseColorTexture);assert.ok(material.normalTexture);
  }
  assert.ok(json.images.every((image:any)=>image.bufferView!==undefined&&!image.uri),'Textures must be embedded');
});
