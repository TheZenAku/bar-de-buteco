// Rebuild base clips on existing native rigs, without reimporting any geometry or textures.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readGlb,retargetBase,writeGlb} from './lib/character-gltf.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const ids=['leandro','rafael','read','magrao','gilmar-gordo'];
const wanted=process.argv.slice(2);
for(const id of wanted)if(!ids.includes(id))throw new Error(`Unknown native rig: ${id}`);
const reference=readGlb(path.join(root,'apps/web/public/models/nathan.glb'));
for(const id of wanted.length?wanted:ids){
  const file=path.join(root,'apps/web/public/models',`${id}.glb`);
  const model=retargetBase(readGlb(file),reference);
  writeGlb(file,model.json,model.bin);
  console.log(`${id}: Idle/Walk/Pose adapted to ${model.json.skins[0].joints.length} native joints`);
}
