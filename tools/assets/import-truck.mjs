import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
// O caminhão baú (scripts/59_caminhao.py do pipeline do Blender) vira apps/web/public/caminhao. O GLB não é alterado: o jogo acha ossos, malhas e materiais pelo nome.
const root=fileURLToPath(new URL('../../',import.meta.url)),source=path.join(root,'assets-bar/map/BarBoteco/export/caminhao'),target=path.join(root,'apps/web/public/caminhao');
const bytes=fs.readFileSync(path.join(source,'caminhao_bau.glb'));
if(bytes.toString('ascii',0,4)!=='glTF')throw new Error('O caminhão precisa ser um GLB.');
const json=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12))),nodes=new Set(json.nodes.map(n=>n.name));
for(const name of ['Caminhao_Rig','raiz','chassi','porta_E','porta_D','porta_bau','carga_1','carga_2','carga_3','direcao_E','direcao_D','roda_dianteira_E','roda_dianteira_D','roda_traseira_E','roda_traseira_D','volante','limpador_E','limpador_D','ponto_motorista','ponto_passageiro','ponto_mao_E','ponto_mao_D','ponto_pe_E','ponto_pe_D','ponto_olhos','ponto_farol_E','ponto_farol_D','ponto_lanterna_E','ponto_bau','ponto_bau_acesso','ponto_bau_camera','ponto_tanque','ponto_escapamento'])if(!nodes.has(name))throw new Error(`Falta o nó ${name}.`);
for(const name of ['Caminhao_Pintura','Caminhao_Atlas','Caminhao_Aluminio','Caminhao_Placa','Caminhao_Vidro','Luz_Farol','Luz_Lanterna','Luz_Re','Luz_Seta_E','Luz_Seta_D','Luz_Interna'])if(!json.materials.some(m=>m.name===name))throw new Error(`Falta o material ${name}.`);
if(json.images.some(image=>image.uri))throw new Error('O GLB deve incorporar suas texturas.');
fs.mkdirSync(target,{recursive:true});
for(const [from,to] of [['caminhao_bau.glb','caminhao_bau.glb'],['caminhao_bau_colisao.glb','caminhao_bau_colisao.glb'],['previa_playcanvas.png','foto.png'],['foto_mask.png','foto_mask.png']])fs.copyFileSync(path.join(source,from),path.join(target,to));
console.log(`Caminhão importado sem alterar o GLB: ${bytes.length} bytes, sha256 ${crypto.createHash('sha256').update(bytes).digest('hex').slice(0,12)}.`);
