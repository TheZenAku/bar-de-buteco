// Checks the six Ribeiro placeholder GLBs against the contract (names, metres, triangles, atlas, Idle/Operate, no camera/light).
// Usage: node tools/assets/validate-ribeiro-placeholders.mjs [folder]   (default: assets-bar/map/BarBoteco/export/farm_armas/placeholders)
// Exit code 1 on any blocking error. Offline: reads files only.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectGlb,readSpecs} from './lib/ribeiro-placeholders.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
export function validateFolder(folder){
  const specs=readSpecs(path.join(root,'apps/web/src/machine-shop/placeholders.ts')),rows=[],errors=[],warnings=[];
  for(const spec of specs){
    const file=path.join(folder,spec.asset);
    if(!fs.existsSync(file)){errors.push(`${spec.asset}: arquivo não existe em ${folder}`);continue;}
    const buffer=fs.readFileSync(file),result=inspectGlb(buffer,spec);
    errors.push(...result.errors);warnings.push(...result.warnings);
    rows.push({spec,bytes:buffer.length,...result.stats});
  }
  return {rows,errors,warnings};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const folder=path.resolve(process.argv[2]??path.join(root,'assets-bar/map/BarBoteco/export/farm_armas/placeholders'));
  const {rows,errors,warnings}=validateFolder(folder);
  for(const row of rows)console.log(`${row.spec.node.padEnd(26)} ${String(row.triangles).padStart(5)} tris  ${row.size?.map(v=>v.toFixed(3)).join(' x ')} m  Idle ${row.Idle?.toFixed(2)} s  Operate ${row.Operate?.toFixed(2)} s  ${(row.bytes/1024).toFixed(0)} KB`);
  for(const warning of warnings)console.warn(`aviso: ${warning}`);
  for(const error of errors)console.error(`ERRO: ${error}`);
  console.log(errors.length?`${errors.length} erro(s) bloqueante(s).`:`Os 6 placeholders cumprem o contrato (${folder}).`);
  process.exitCode=errors.length?1:0;
}
