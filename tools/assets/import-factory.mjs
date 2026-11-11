import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const source=path.join(root,'assets-bar/map/BarBoteco/export/empresa_brasil');
const webTarget=path.join(root,'apps/web/public/fabrica');
const serverTarget=path.join(root,'apps/server/data/factory');
const files=['empresa_brasil_estoque.glb','empresa_brasil_estoque.json','empresa_brasil_tanques.glb','empresa_brasil_tanques.json','empresa_brasil_marcadores.json'];

for(const name of files)if(!fs.existsSync(path.join(source,name)))throw new Error(`Fábrica: falta o arquivo de origem ${name}.`);
const markers=JSON.parse(fs.readFileSync(path.join(source,'empresa_brasil_marcadores.json'),'utf8'));
const stock=JSON.parse(fs.readFileSync(path.join(source,'empresa_brasil_estoque.json'),'utf8'));
if(markers.n!==48||Object.keys(markers.marcadores??{}).length!==48)throw new Error('Fábrica: eram esperados exatamente 48 marcadores Ponto_EB_* .');
if(stock.vagas?.length!==25)throw new Error('Fábrica: eram esperadas exatamente 25 vagas de palete.');
for(const slot of stock.vagas)if(!markers.marcadores[slot.marcador])throw new Error(`Fábrica: a vaga ${slot.marcador} não existe nos marcadores.`);
for(const name of ['empresa_brasil_estoque.glb','empresa_brasil_tanques.glb']){
  const bytes=fs.readFileSync(path.join(source,name));
  if(bytes.toString('ascii',0,4)!=='glTF')throw new Error(`Fábrica: ${name} precisa ser um GLB.`);
}
for(const target of [webTarget,serverTarget]){
  fs.mkdirSync(target,{recursive:true});
  for(const name of files)fs.copyFileSync(path.join(source,name),path.join(target,name));
}
const hash=crypto.createHash('sha256');
for(const name of files)hash.update(fs.readFileSync(path.join(source,name)));
const digest=hash.digest('hex').slice(0,12);
console.log(`Fábrica importada: 48 marcadores, 25 vagas, sha256 ${digest}.`);
