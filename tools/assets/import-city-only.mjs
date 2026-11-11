import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareCity} from './import-city.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const city=prepareCity({root,exportDir:path.join(root,'assets-bar/map/BarBoteco/export')});
const files=city.publish({publishDir:path.join(root,'apps/web/public/maps/cidade'),sharedDir:path.join(root,'packages/shared/src')});
console.log(`Cidade publicada sem reprocessar o GLB-base: ${files} arquivos; ${city.counts.sectors} setores, ${city.counts.solids} colisores, ${city.counts.textures} texturas, ${city.counts.markers} marcadores, ${city.counts.silhouettes} silhuetas.`);
