import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {writeGatesData} from './factory-gates-data.mjs';
import {checkCartGlb,writeCartData} from './factory-cart-data.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const source=path.join(root,'assets-bar/map/BarBoteco/export/empresa_brasil');
const webTarget=path.join(root,'apps/web/public/fabrica');
const serverTarget=path.join(root,'apps/server/data/factory');
const files=['empresa_brasil_estoque.glb','empresa_brasil_estoque.json','empresa_brasil_tanques.glb','empresa_brasil_tanques.json','empresa_brasil_marcadores.json','empresa_brasil_portoes.glb','empresa_brasil_portoes.json','empresa_brasil_carrinho.glb','empresa_brasil_carrinho.json'];

for(const name of files)if(!fs.existsSync(path.join(source,name)))throw new Error(`Fábrica: falta o arquivo de origem ${name}.`);
const markers=JSON.parse(fs.readFileSync(path.join(source,'empresa_brasil_marcadores.json'),'utf8'));
const stock=JSON.parse(fs.readFileSync(path.join(source,'empresa_brasil_estoque.json'),'utf8'));
if(markers.n!==48||Object.keys(markers.marcadores??{}).length!==48)throw new Error('Fábrica: eram esperados exatamente 48 marcadores Ponto_EB_* .');
if(stock.vagas?.length!==25)throw new Error('Fábrica: eram esperadas exatamente 25 vagas de palete.');
for(const slot of stock.vagas)if(!markers.marcadores[slot.marcador])throw new Error(`Fábrica: a vaga ${slot.marcador} não existe nos marcadores.`);
for(const name of ['empresa_brasil_estoque.glb','empresa_brasil_tanques.glb','empresa_brasil_portoes.glb','empresa_brasil_carrinho.glb']){
  const bytes=fs.readFileSync(path.join(source,name));
  if(bytes.toString('ascii',0,4)!=='glTF')throw new Error(`Fábrica: ${name} precisa ser um GLB.`);
}
// Folhas dinâmicas (portão de correr, porta automática, portas de impacto, portas manuais, portão de enrolar; v2): um nó do GLB por folha descrita no JSON
// (sem escala) e a lâmpada do interfone. Os marcadores novos (Ponto_EB_Portao_Sistema, Ponto_EB_Oficina, Ponto_EB_Interfone) ficam no JSON dos portões:
// os 48 do arquivo de marcadores não mudam.
const gatesGlb=fs.readFileSync(path.join(source,'empresa_brasil_portoes.glb'));
const gatesGltf=JSON.parse(gatesGlb.toString('utf8',20,20+gatesGlb.readUInt32LE(12)));
const portoes=JSON.parse(fs.readFileSync(path.join(source,'empresa_brasil_portoes.json'),'utf8'));
const gates=writeGatesData(portoes);
for(const gate of gates.gates){
  const node=gatesGltf.nodes.find(n=>n.name===gate.id);
  if(!node)throw new Error(`Fábrica: o GLB dos portões não tem o nó ${gate.id}.`);
  if(node.scale)throw new Error(`Fábrica: ${gate.id} não pode ter escala.`);
  if(node.rotation&&node.rotation.some((value,index)=>Math.abs(value-[0,0,0,1][index])>1e-6))throw new Error(`Fábrica: ${gate.id} precisa ser exportada fechada, sem rotação.`);
}
if(!gatesGltf.nodes.some(n=>n.name===gates.interfone.lamp))throw new Error(`Fábrica: o GLB dos portões não tem a lâmpada ${gates.interfone.lamp}.`);
for(const name of ['Ponto_EB_Portao_Sistema','Ponto_EB_Oficina',gates.interfone.marker])if(!portoes.marcadores_novos?.marcadores?.[name])throw new Error(`Fábrica: faltam o marcador ${name} nos portões.`);
// O carrinho de plataforma (6 sacos): o JSON vira packages/shared/src/factory/cart-data.json e o GLB tem o nó EB_Carrinho com os Slot_Saco_N.
const cart=writeCartData(JSON.parse(fs.readFileSync(path.join(source,'empresa_brasil_carrinho.json'),'utf8')));
checkCartGlb(fs.readFileSync(path.join(source,'empresa_brasil_carrinho.glb')),cart);
for(const target of [webTarget,serverTarget]){
  fs.mkdirSync(target,{recursive:true});
  for(const name of files)fs.copyFileSync(path.join(source,name),path.join(target,name));
}
const hash=crypto.createHash('sha256');
for(const name of files)hash.update(fs.readFileSync(path.join(source,name)));
const digest=hash.digest('hex').slice(0,12);
console.log(`Fábrica importada: 48 marcadores, 25 vagas, ${gates.gates.length} folhas dinâmicas (${gates.gates.map(gate=>gate.id).join(', ')}) o interfone e o carrinho de ${cart.capacity} sacos, sha256 ${digest}.`);
