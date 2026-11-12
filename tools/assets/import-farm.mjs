// FARM DE ARMAS (RIBEIRO USINAGEM & FERRAMENTARIA, setor S07_00): as pecas que se movem (portao de correr, portas, rolo da doca) vem no
// farm_armas_dinamicos.glb, exportado FECHADO, com o farm_armas_portas.json (origem, eixo, curso/angulo, caixas de colisao na pose fechada).
// O cenario fixo vai com o setor da cidade (assets:city). Este script valida e publica as duas pecas para o cliente (public/farm) e o servidor.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const source=path.join(root,'assets-bar/map/BarBoteco/export/farm_armas');
const targets=[path.join(root,'apps/web/public/farm'),path.join(root,'apps/server/data/farm')];
const files=['farm_armas_dinamicos.glb','farm_armas_portas.json'];
const EXPECTED=['FA_Portao_Correr','FA_Portao_Doca','FA_Porta_Pedestre','FA_Porta_Manutencao','FA_Porta_Entrada','FA_Porta_Expedicao_E','FA_Porta_Expedicao_D','FA_Porta_Escritorio','FA_Porta_Deposito','FA_Porta_Banheiro','FA_Porta_Copa','FA_Porta_Blindada','FA_Porta_Diretoria','FA_Porta_Reuniao','FA_Porta_CFTV'];
const SOLID=['FA_Col_Portao','FA_Col_Portao_Doca','FA_Col_Porta_Pedestre','FA_Col_Porta_Blindada'];

for(const name of files)if(!fs.existsSync(path.join(source,name)))throw new Error(`Farm: falta o arquivo de origem ${name}.`);
const glb=fs.readFileSync(path.join(source,files[0]));
if(glb.toString('ascii',0,4)!=='glTF')throw new Error('Farm: o modelo precisa ser um GLB.');
const gltf=JSON.parse(glb.toString('utf8',20,20+glb.readUInt32LE(12)));
const info=JSON.parse(fs.readFileSync(path.join(source,files[1]),'utf8'));
for(const no of EXPECTED){
  const node=gltf.nodes.find(n=>n.name===no);
  if(!node)throw new Error(`Farm: o GLB não tem o nó ${no}.`);
  if(node.scale)throw new Error(`Farm: ${no} não pode ter escala.`);
  if(!info.folhas.some(leaf=>leaf.no===no))throw new Error(`Farm: o JSON não descreve ${no}.`);
}
for(const leaf of info.folhas)if(leaf.tipo==='giratoria'&&(leaf.angulo_fechada_graus===undefined||leaf.angulo_aberta_graus===undefined))throw new Error(`Farm: ${leaf.no} sem ângulos.`);
if(info.colisoes_dinamicas.length!==SOLID.length)throw new Error(`Farm: eram esperadas ${SOLID.length} caixas de colisão dinâmicas.`);
for(const target of targets){
  fs.mkdirSync(target,{recursive:true});
  for(const name of files)fs.copyFileSync(path.join(source,name),path.join(target,name));
}
console.log(`Farm importada: ${info.folhas.length} folhas, ${info.colisoes_dinamicas.length} caixas de colisão dinâmicas, ${Math.round(glb.length/1024)} KB.`);
