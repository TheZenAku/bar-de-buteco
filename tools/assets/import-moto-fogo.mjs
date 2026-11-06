// Publishes the Caveira em Chamas (moto_fogo.glb, made by scripts/58_moto_fogo.py) as is: the client finds its bones, attachment
// points, lamp meshes and the fire's anchors by name, so this only refuses a file without them. Offline only: npm run assets:moto-fogo.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const sourceDir=path.join(root,'assets-bar/map/BarBoteco/export/moto_fogo');
const source=path.join(sourceDir,'moto_fogo.glb');
const targetDir=path.join(root,'apps/web/public/moto');
const NODES=['Moto_Rig','raiz','chassi','direcao','suspensao_diant','balanca','roda_dianteira','roda_traseira','fogo_diant','fogo_tras','ponto_piloto','ponto_garupa','ponto_mao_E','ponto_mao_D','ponto_pe_E','ponto_pe_D','ponto_farol','ponto_lanterna','ponto_freio','ponto_luz_placa','ponto_placa','ponto_seta_frente_E','ponto_seta_frente_D','ponto_seta_tras_E','ponto_seta_tras_D','ponto_escapamento','ponto_camera','ponto_contato_diant','ponto_contato_tras'];

const glb=fs.readFileSync(source);
if(glb.toString('latin1',0,4)!=='glTF')throw new Error(`${source} não é um GLB.`);
const json=JSON.parse(glb.toString('utf8',20,20+glb.readUInt32LE(12)));
const names=new Set((json.nodes??[]).map(node=>node.name));
const missing=NODES.filter(name=>!names.has(name));
if(missing.length)throw new Error(`Faltam nós na moto: ${missing.join(', ')}`);
if(json.skins?.length!==1)throw new Error('A moto deve ter uma malha com pele.');
const meshNodes=new Set((json.nodes??[]).filter(node=>node.mesh!==undefined).map(node=>node.name));
// The lamps are the model's own faces (skull eyes, amber balls, the tail's lens); the fire is drawn by engine/moto-fire.ts on fogo_*.
for(const name of ['Moto','Luz_Farol','Luz_Seta_E','Luz_Seta_D','Luz_Lanterna'])if(!meshNodes.has(name))throw new Error(`Malha ausente: ${name}`);
const lamps=json.materials?.find(material=>material.name==='Moto_Caveira_Luzes');
if(!lamps?.emissiveTexture||!lamps.pbrMetallicRoughness?.baseColorTexture)throw new Error('O material Moto_Caveira_Luzes precisa da textura da moto e do mapa de brilho.');
if(json.images?.some(image=>image.uri))throw new Error('As texturas devem estar embutidas.');
fs.mkdirSync(targetDir,{recursive:true});
fs.copyFileSync(source,path.join(targetDir,'moto_fogo.glb'));
for(const file of ['moto_fogo_colisao.glb'])fs.copyFileSync(path.join(sourceDir,file),path.join(targetDir,file));
console.log(`moto_fogo.glb publicada (${(glb.length/1024).toFixed(0)} KB, sha256 ${crypto.createHash('sha256').update(glb).digest('hex').slice(0,12)})`);
