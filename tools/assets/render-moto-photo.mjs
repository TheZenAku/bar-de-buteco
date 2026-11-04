// HighMotors photograph of the published GLB, rendered with the game's engine; no Blender or generated artwork.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {chromium} from '@playwright/test';
const root=fileURLToPath(new URL('../../',import.meta.url));
const {createServer}=await import(pathToFileURL(path.join(path.dirname(createRequire(new URL('../../apps/web/package.json',import.meta.url)).resolve('vite/package.json')),'dist/node/index.js')).href);
process.env.BAR_HTTPS='0';
const vite=await createServer({root:path.join(root,'apps/web'),configFile:path.join(root,'apps/web/vite.config.ts'),server:{host:'127.0.0.1',port:5475,strictPort:true,hmr:false},logLevel:'error'});
await vite.listen();
let browser;
try{
  browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'msedge':undefined),args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']});
  const page=await browser.newPage({viewport:{width:1200,height:900}}),errors=[];
  page.on('pageerror',error=>{errors.push(error.message);console.error(error.message);});
  await page.goto(`http://127.0.0.1:5475/@fs/${path.join(root,'tests/fixtures/moto-card-render.html').replaceAll('\\','/')}`);
  await page.waitForFunction(()=>window.photo||window.renderError,undefined,{timeout:90_000}).catch(error=>{throw new Error([...errors,error.message].join('\n'));});
  const {photo,error}=await page.evaluate(()=>({photo:window.photo,error:window.renderError}));
  if(error||errors.length)throw new Error([error,...errors].filter(Boolean).join('\n'));
  if(!photo?.startsWith('data:image/webp;base64,'))throw new Error('Não foi possível renderizar a foto da moto.');
  const output=path.join(root,'apps/web/public/moto/foto-v4.webp');
  fs.writeFileSync(output,Buffer.from(photo.split(',')[1],'base64'));
  console.log(`HighMotors: foto da moto v4 sem bag publicada (${fs.statSync(output).size} bytes).`);
}finally{await browser?.close();await vite.close();}
process.exit(0);
