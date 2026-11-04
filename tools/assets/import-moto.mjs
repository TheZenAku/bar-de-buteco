// Publishes the v4 delivery bike and the separate v3 bag as is: the client
// finds its bones and attachment points by name, so this only refuses a file without them. Offline only: npm run assets:moto.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const source=path.join(root,'assets-bar/map/BarBoteco/export/moto_v4/moto_delivery.glb');
const output=path.join(root,'apps/web/public/moto/moto_delivery.glb');
const NODES=['Moto_Rig','raiz','chassi','direcao','suspensao_diant','balanca','descanso','roda_dianteira','roda_traseira','ponto_bau','ponto_piloto','ponto_garupa','ponto_mao_E','ponto_mao_D','ponto_pe_E','ponto_pe_D','ponto_farol','ponto_lanterna','ponto_freio','ponto_placa','ponto_luz_placa','ponto_seta_frente_E','ponto_seta_frente_D','ponto_seta_tras_E','ponto_seta_tras_D','ponto_escapamento','ponto_camera'];

const glb=fs.readFileSync(source);
if(glb.toString('latin1',0,4)!=='glTF')throw new Error(`${source} não é um GLB.`);
const json=JSON.parse(glb.toString('utf8',20,20+glb.readUInt32LE(12)));
const names=new Set((json.nodes??[]).map(node=>node.name));
const missing=NODES.filter(name=>!names.has(name));
if(missing.length)throw new Error(`Faltam nós na moto: ${missing.join(', ')}`);
if(json.skins?.length!==1)throw new Error('A moto deve ter uma malha com pele.');
for(const name of ['Moto','Moto_Placa','Luz_Farol','Luz_Seta_E','Luz_Seta_D','Luz_Lanterna','Luz_Freio'])
  if(!json.meshes.some(mesh=>mesh.name===name))throw new Error(`Malha ausente: ${name}`);
if(json.images?.some(image=>image.uri))throw new Error('As texturas devem estar embutidas.');
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.copyFileSync(source,output);
for(const file of ['moto_delivery_colisao.glb','moto_delivery.js'])fs.copyFileSync(path.join(path.dirname(source),file),path.join(path.dirname(output),file));
// v4 deliberately has no bag. Keep the separate v3 item and its original script/embedded texture.
for(const file of ['moto_bag.glb','moto_bag.js'])fs.copyFileSync(path.join(root,'assets-bar/map/BarBoteco/export/moto_v3',file),path.join(path.dirname(output),file));
console.log(`moto_delivery.glb publicada (${(glb.length/1024).toFixed(0)} KB, sha256 ${crypto.createHash('sha256').update(glb).digest('hex').slice(0,12)})`);
