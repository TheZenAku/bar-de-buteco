// Item and coin pictures for the interface: assets-bar/icons → apps/web/public/ui (the paths in ITEM_CATALOG.icon).
import {copyFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../../',import.meta.url));
const source=path.join(root,'assets-bar/icons'),output=path.join(root,'apps/web/public/ui');
// Published path ← file in assets-bar/icons. Item ids come from packages/shared/src/inventory.ts.
const ICONS={
  'items/agua.png':'agua-icone.png','items/refrigerante.png':'highcola-icone.png','items/cafe.png':'cafe-icone.png',
  'items/garrafa.png':'Highbeerlong-icone.png','items/copo.png':'copoamericano-icone.png','items/coxinha.png':'coxinha-icone.png',
  'items/pastel.png':'pastel-icone.png','items/torresmo.png':'torresmo-icone.png','items/curativo.png':'curativo-icone.png',
  'moeda.png':'moeda-icone.png',
};

await mkdir(path.join(output,'items'),{recursive:true});
for(const [published,file] of Object.entries(ICONS)){
  await copyFile(path.join(source,file),path.join(output,published));
  console.log(`${file} → apps/web/public/ui/${published}`);
}
