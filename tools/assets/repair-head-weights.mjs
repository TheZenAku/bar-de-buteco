import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {readGlb,writeGlb} from './lib/character-gltf.mjs';
import {repairHeadWeights} from './lib/head-weights.mjs';

const directory=new URL('../../apps/web/public/models/',import.meta.url);
const ids=process.argv.slice(2);
const files=fs.readdirSync(directory).filter(name=>name.endsWith('.glb'));
for(const id of ids)if(!files.includes(`${id}.glb`))throw new Error(`Unknown skin: ${id}`);
for(const file of files){
  if(ids.length&&!ids.includes(file.slice(0,-4)))continue;
  const path=fileURLToPath(new URL(file,directory)),glb=readGlb(path);
  const changed=repairHeadWeights(glb);
  if(changed){
    const temporary=`${path}.head-weights.tmp`;
    writeGlb(temporary,glb.json,glb.bin);
    fs.renameSync(temporary,path);
  }
  console.log(`${file}: repaired ${changed} head/neck vertices`);
}
