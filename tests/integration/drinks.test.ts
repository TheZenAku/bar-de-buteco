import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// tools/import-drinks.mjs: the real bottle and glass from assets-bar/objects, as hand props.
for (const [id, height] of [['garrafa', .23], ['copo', .093]] as const) test(`${id}: real-size hand prop with its own textures, origin at the base`, () => {
  const bytes = readFileSync(new URL(`../../apps/web/public/props/${id}.glb`, import.meta.url));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);assert.equal(bytes.readUInt32LE(8), bytes.length);
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  assert.equal(json.meshes.length, 1);assert.equal(json.nodes.length, 1);
  const position = json.accessors[json.meshes[0].primitives[0].attributes.POSITION];
  // Simplification may lower the rim by a millimetre or two.
  assert.ok(Math.abs(position.max[1] - height) < .002 && Math.abs(position.min[1]) < 1e-4, 'Base at y 0, mouth at the real height');
  assert.ok(Math.abs(position.max[0] + position.min[0]) < .01 && Math.abs(position.max[2] + position.min[2]) < .01, 'Centred on its axis');
  const triangles = json.accessors[json.meshes[0].primitives[0].indices].count / 3;
  assert.ok(triangles <= 3000 && triangles > 1000, `${triangles} triangles`);
  const material = json.materials[0].pbrMetallicRoughness;
  assert.ok(material.baseColorTexture && material.metallicRoughnessTexture && json.materials[0].normalTexture);
  assert.ok(json.images.length === 3 && json.images.every((image: any) => image.bufferView !== undefined && !image.uri), 'Textures embedded');
  assert.ok(bytes.length < 400 * 1024, `${bytes.length} bytes`);
});
