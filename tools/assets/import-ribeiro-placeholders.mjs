// Publishes the six Ribeiro placeholder GLBs (assets-bar/map/BarBoteco/scripts/97_ribeiro_placeholders.py, exported from the Blender scene "PROPS FA_ARMAS")
// to apps/web/public/farm/placeholders/. It validates every file against the contract first (tools/assets/lib/ribeiro-placeholders.mjs) and
// writes nothing if any of them fails. Only those six files are touched: no other asset in public/farm is read, replaced or deleted.
// The GLBs are already optimised at the source (one 512 px atlas, ~300 KB each, no skins), so they are copied byte for byte.
// Usage: node tools/assets/import-ribeiro-placeholders.mjs [source folder]    Offline only: npm run assets:ribeiro.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {inspectGlb,readSpecs} from './lib/ribeiro-placeholders.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const sourceDir=path.resolve(process.argv[2]??path.join(root,'assets-bar/map/BarBoteco/export/farm_armas/placeholders'));
const targetDir=path.join(root,'apps/web/public/farm/placeholders');
const specs=readSpecs(path.join(root,'apps/web/src/machine-shop/placeholders.ts'));
const sha=buffer=>crypto.createHash('sha256').update(buffer).digest('hex').slice(0,12);

const files=[],problems=[];
for(const spec of specs){
  const file=path.join(sourceDir,spec.asset);
  if(!fs.existsSync(file)){problems.push(`${spec.asset}: não existe em ${sourceDir}`);continue;}
  const buffer=fs.readFileSync(file),result=inspectGlb(buffer,spec);
  problems.push(...result.errors);
  for(const warning of result.warnings)console.warn(`aviso: ${warning}`);
  files.push({spec,buffer,stats:result.stats});
}
if(problems.length){for(const problem of problems)console.error(`ERRO: ${problem}`);throw new Error(`${problems.length} problema(s): nada foi publicado.`);}

fs.mkdirSync(targetDir,{recursive:true});
for(const {spec,buffer,stats} of files){
  const target=path.join(targetDir,spec.asset);
  const same=fs.existsSync(target)&&sha(fs.readFileSync(target))===sha(buffer);
  if(!same){const temp=`${target}.tmp`;fs.writeFileSync(temp,buffer);fs.renameSync(temp,target);}
  console.log(`${same?'igual    ':'publicado'} ${spec.asset} (${stats.triangles} triângulos, ${(buffer.length/1024).toFixed(0)} KB, sha256 ${sha(buffer)})`);
}
