// Publishes the Scooter de Entrega (moto_scooter.glb: scripts/20_moto_delivery.py, then 20b_scooter_pontos.py adds the points the game asks for today) as is: the client finds its bones,
// attachment points and lamp points by name, so this only refuses a file without them. Offline only: npm run assets:moto-scooter.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const sourceDir=path.join(root,'assets-bar/map/BarBoteco/export/moto_scooter');
const source=path.join(sourceDir,'moto_scooter.glb');
const targetDir=path.join(root,'apps/web/public/moto');
const NODES=['Moto_Rig','raiz','chassi','direcao','roda_dianteira','roda_traseira','ponto_piloto','ponto_garupa','ponto_mao_E','ponto_mao_D','ponto_pe_E','ponto_pe_D','ponto_farol','ponto_lanterna','ponto_freio','ponto_luz_placa','ponto_placa','ponto_bau','ponto_seta_frente_E','ponto_seta_frente_D','ponto_seta_tras_E','ponto_seta_tras_D','ponto_escapamento','ponto_camera','ponto_contato_diant','ponto_contato_tras'];
const glb=fs.readFileSync(source);
if(glb.toString('latin1',0,4)!=='glTF')throw new Error(`${source} não é um GLB.`);
const json=JSON.parse(glb.toString('utf8',20,20+glb.readUInt32LE(12)));
const names=new Set((json.nodes??[]).map(node=>node.name));
const missing=NODES.filter(name=>!names.has(name));
if(missing.length)throw new Error(`Faltam nós na moto: ${missing.join(', ')}`);
if(json.skins?.length!==1)throw new Error('A moto deve ter uma malha com pele.');
// No lens meshes: engine/moto-lights.ts draws the lenses on the points (SCOOTER_LAMPS); one skinned mesh, its own box included.
if(!(json.nodes??[]).some(node=>node.name==='Moto_Delivery'&&node.mesh!==undefined))throw new Error('Malha ausente: Moto_Delivery');
if(json.images?.some(image=>image.uri))throw new Error('As texturas devem estar embutidas.');
fs.mkdirSync(targetDir,{recursive:true});
fs.copyFileSync(source,path.join(targetDir,'moto_scooter.glb'));
for(const file of ['moto_scooter_colisao.glb'])fs.copyFileSync(path.join(sourceDir,file),path.join(targetDir,file));
console.log(`moto_scooter.glb publicada (${(glb.length/1024).toFixed(0)} KB, sha256 ${crypto.createHash('sha256').update(glb).digest('hex').slice(0,12)})`);
