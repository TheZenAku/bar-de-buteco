// The crowd's sprites: one sheet per skin (apps/web/public/skins/crowd/<id>.webp), ANGLES columns by three rows (standing, two steps of a walk).
// Drawn by the game's own engine in tests/fixtures/crowd-render.html; the client packs them in one texture (apps/web/src/engine/crowd.ts).
// usage: node tools/assets/render-crowd-sheets.mjs [skin...]  (default: every skin in SKINS). Run again when a model changes.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {chromium} from '@playwright/test';

const root=fileURLToPath(new URL('../../',import.meta.url));
const {createServer}=await import(pathToFileURL(path.join(path.dirname(createRequire(new URL('../../apps/web/package.json',import.meta.url)).resolve('vite/package.json')),'dist/node/index.js')).href);
const out=path.join(root,'apps/web/public/skins/crowd');
const OPTIONS={cell:[56,112],angles:16,quality:.9};
const bytes=dataUrl=>Buffer.from(dataUrl.split(',')[1],'base64');

process.env.BAR_HTTPS='0';
const vite=await createServer({root:path.join(root,'apps/web'),configFile:path.join(root,'apps/web/vite.config.ts'),server:{host:'127.0.0.1',port:5475,strictPort:true,hmr:false},logLevel:'error'});
await vite.listen();
const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'msedge':undefined),args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']});
try{
  const page=await browser.newPage({viewport:{width:320,height:240}});
  page.on('pageerror',error=>console.error(error));
  await page.goto(`http://127.0.0.1:5475/@fs/${path.join(root,'tests/fixtures/crowd-render.html').replace(/\\/g,'/')}`);
  await page.waitForFunction(()=>window.ready,undefined,{timeout:120_000});
  const wanted=process.argv.slice(2),ids=await page.evaluate(()=>window.ids);
  for(const id of wanted)if(!ids.includes(id))throw new Error(`Unknown skin: ${id}`);
  fs.mkdirSync(out,{recursive:true});
  for(const id of ids.filter(each=>!wanted.length||wanted.includes(each))){
    const sheet=await page.evaluate(options=>window.render(options),{id,...OPTIONS});
    fs.writeFileSync(path.join(out,`${id}.webp`),bytes(sheet));
    console.log(`${id}: ${(bytes(sheet).length/1024).toFixed(0)} KiB`);
  }
}finally{await browser.close();await vite.close();}
process.exit(0);
