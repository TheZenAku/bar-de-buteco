// The Highland Bar Delivery mark for the interface and the 3D props: assets-bar/logo/highland-bar-delivery.png → apps/web/public/highfood.
// Through a real browser, as the sound tools do: the host has no image library, and WebP is what the other logos are published in.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {chromium} from '@playwright/test';

const root=fileURLToPath(new URL('../../',import.meta.url));
const source=path.join(root,'assets-bar/logo/highland-bar-delivery.png'),output=path.join(root,'apps/web/public/highfood');
// Published file ← pixels on its longest side.
const SIZES={'logo.webp':640,'logo-icon.webp':192};

await mkdir(output,{recursive:true});
const data=`data:image/png;base64,${(await readFile(source)).toString('base64')}`;
const browser=await chromium.launch({channel:'msedge'});
try{
  const page=await browser.newPage();
  for(const [file,size] of Object.entries(SIZES)){
    const url=await page.evaluate(async({data,size})=>{
      const image=new Image();image.src=data;await image.decode();
      const canvas=document.createElement('canvas'),scale=size/Math.max(image.width,image.height);
      canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);
      const g=canvas.getContext('2d');g.imageSmoothingQuality='high';g.drawImage(image,0,0,canvas.width,canvas.height);
      return canvas.toDataURL('image/webp',.86);
    },{data,size});
    const bytes=Buffer.from(url.split(',')[1],'base64');
    await writeFile(path.join(output,file),bytes);
    console.log(`apps/web/public/highfood/${file}: ${size} px, ${Math.round(bytes.length/1024)} kB`);
  }
}finally{await browser.close();}
