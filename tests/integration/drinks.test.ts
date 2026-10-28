import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {HELD_DRINKS, ITEM_CATALOG, SERVED_PROPS, TABLE_MENU} from '@bar/shared';

// tools/assets/import-drinks.mjs: the real drinks and food from assets-bar/objects, as props for the hand, the tray and the tables.
const PROPS = [['garrafa', .23], ['copo', .093], ['agua', .205], ['refrigerante', .19], ['cafe', .12], ['coxinha', .08], ['pastel', .039], ['torresmo', .081]] as const;
for (const [id, height] of PROPS) test(`${id}: real-size prop with its own textures, origin at the base`, () => {
  const bytes = readFileSync(new URL(`../../apps/web/public/props/${id}.glb`, import.meta.url));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);assert.equal(bytes.readUInt32LE(8), bytes.length);
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  assert.equal(json.meshes.length, 1);assert.equal(json.nodes.length, 1);
  const position = json.accessors[json.meshes[0].primitives[0].attributes.POSITION];
  // Simplification may move the rim by a millimetre or two, the base by a fraction of one.
  assert.ok(Math.abs(position.max[1] - height) < .003 && Math.abs(position.min[1]) < 5e-4, 'Base at y 0, top at the real height');
  assert.ok(Math.abs(position.max[0] + position.min[0]) < .01 && Math.abs(position.max[2] + position.min[2]) < .01, 'Centred on its axis');
  // The room spaces the items on a table by these footprints: none may be wider than its own.
  const footprint = SERVED_PROPS[id]!;
  assert.ok(json.nodes[0].extras.radius <= footprint.radius + .002, `${id} (${json.nodes[0].extras.radius} m) fits its ${footprint.radius} m footprint`);
  const triangles = json.accessors[json.meshes[0].primitives[0].indices].count / 3;
  assert.ok(triangles <= 3000 && triangles > 1000, `${triangles} triangles`);
  const material = json.materials[0].pbrMetallicRoughness;
  assert.ok(material.baseColorTexture && material.metallicRoughnessTexture && json.materials[0].normalTexture);
  assert.ok(json.images.length === 3 && json.images.every((image: any) => image.bufferView !== undefined && !image.uri), 'Textures embedded');
  assert.ok(bytes.length < 400 * 1024, `${bytes.length} bytes`);
});

test('every table item has a prop and a footprint; every drink from the backpack is held as its own prop', () => {
  for (const id of TABLE_MENU) assert.ok(SERVED_PROPS[id] && PROPS.some(([prop]) => prop === id), `${id} on the table`);
  for (const item of ITEM_CATALOG) if ('prop' in item) assert.ok((HELD_DRINKS as readonly string[]).includes(item.prop), `${item.id} held as ${item.prop}`);
  assert.deepEqual(ITEM_CATALOG.filter(item => 'prop' in item).map(item => [item.id, item.prop]), [['agua', 'agua'], ['refrigerante', 'refrigerante'], ['cafe', 'cafe'], ['garrafa', 'garrafa'], ['copo', 'copo']]);
});
