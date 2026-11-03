// The art of the collection's cards: each skin standing still on a transparent background, and a sheet of it turning all the way
// round (apps/web/public/skins/cards/<id>.webp, skins/turn/<id>.webp). Drawn by the game's own engine in tests/fixtures/skin-card-render.html.
// usage: node tools/assets/render-skin-cards.mjs [skin...]  (default: every skin in SKINS)
// After changing a model or this picture: bump CARD_ART in apps/web/src/collection/skin-card.ts.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {chromium} from '@playwright/test';

const root=fileURLToPath(new URL('../../',import.meta.url));
const {createServer}=await import(pathToFileURL(path.join(path.dirname(createRequire(new URL('../../apps/web/package.json',import.meta.url)).resolve('vite/package.json')),'dist/node/index.js')).href);
const out=path.join(root,'apps/web/public/skins');
// Cells of the sheet: frames*cell is what one open card keeps decoded in memory, so the sheet stays well under the picture's sharpness.
const OPTIONS={hero:[640,960],cell:[280,420],frames:24,columns:6,quality:{hero:.86,turn:.76}};
const bytes=dataUrl=>Buffer.from(dataUrl.split(',')[1],'base64');

process.env.BAR_HTTPS='0';
const vite=await createServer({root:path.join(root,'apps/web'),configFile:path.join(root,'apps/web/vite.config.ts'),server:{host:'127.0.0.1',port:5474,strictPort:true,hmr:false},logLevel:'error'});
await vite.listen();
const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'msedge':undefined),args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']});
try{
  const page=await browser.newPage({viewport:{width:320,height:240}});
  page.on('pageerror',error=>console.error(error));
  await page.goto(`http://127.0.0.1:5474/@fs/${path.join(root,'tests/fixtures/skin-card-render.html').replace(/\\/g,'/')}`);
  await page.waitForFunction(()=>window.ready,undefined,{timeout:120_000});
  const wanted=process.argv.slice(2),ids=await page.evaluate(()=>window.ids);
  for(const id of wanted)if(!ids.includes(id))throw new Error(`Unknown skin: ${id}`);
  fs.mkdirSync(path.join(out,'cards'),{recursive:true});fs.mkdirSync(path.join(out,'turn'),{recursive:true});
  for(const id of ids.filter(each=>!wanted.length||wanted.includes(each))){
    const {hero,turn}=await page.evaluate(options=>window.render(options),{id,...OPTIONS});
    fs.writeFileSync(path.join(out,'cards',`${id}.webp`),bytes(hero));fs.writeFileSync(path.join(out,'turn',`${id}.webp`),bytes(turn));
    console.log(`${id}: card ${(bytes(hero).length/1024).toFixed(0)} KiB, turn ${(bytes(turn).length/1024).toFixed(0)} KiB`);
  }
}finally{await browser.close();await vite.close();}
process.exit(0);
