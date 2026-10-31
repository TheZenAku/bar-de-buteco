// Publishes the delivery bike (assets-bar/map/BarBoteco/export/moto, made by scripts/20_moto_delivery.py) as is: the client
// finds its bones and attachment points by name, so this only refuses a file without them. Offline only: npm run assets:moto.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const source=path.join(root,'assets-bar/map/BarBoteco/export/moto/moto_delivery.glb');
const output=path.join(root,'apps/web/public/moto/moto_delivery.glb');
const NODES=['Moto_Rig','raiz','chassi','direcao','roda_dianteira','roda_traseira','bau','ponto_piloto','ponto_mao_E','ponto_mao_D','ponto_pe_E','ponto_pe_D','ponto_farol','ponto_lanterna','ponto_escapamento','ponto_entrega'];

const glb=fs.readFileSync(source);
if(glb.toString('latin1',0,4)!=='glTF')throw new Error(`${source} não é um GLB.`);
const json=JSON.parse(glb.toString('utf8',20,20+glb.readUInt32LE(12)));
const names=new Set((json.nodes??[]).map(node=>node.name));
const missing=NODES.filter(name=>!names.has(name));
if(missing.length)throw new Error(`Faltam nós na moto: ${missing.join(', ')}`);
if(json.skins?.length!==1)throw new Error('A moto deve ter uma malha com pele.');
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.copyFileSync(source,output);
console.log(`moto_delivery.glb publicada (${(glb.length/1024).toFixed(0)} KB, sha256 ${crypto.createHash('sha256').update(glb).digest('hex').slice(0,12)})`);
