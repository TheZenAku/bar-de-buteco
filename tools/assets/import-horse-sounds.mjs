// The free OpenGameArt gallop cycle. Sources and attribution: docs/assets/sons-cavalo.md.
// Offline only: npm run assets:horse:sound. Decode MP3 in Edge, publish a gapless mono WAV.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';

const root=fileURLToPath(new URL('../../',import.meta.url));
const input=path.join(root,'assets-bar/sounds/cavalo');
const output=path.join(root,'apps/web/public/mounts/sound');
const rate=32000;
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'msedge':undefined)});
try{
  const page=await browser.newPage();
  const samples=await page.evaluate(async({base64,rate})=>{
    const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
    const buffer=await new OfflineAudioContext(1,rate,rate).decodeAudioData(bytes.buffer);
    const context=new OfflineAudioContext(1,Math.round(buffer.duration*rate),rate),source=context.createBufferSource();
    source.buffer=buffer;source.connect(context.destination);source.start();
    const samples=(await context.startRendering()).getChannelData(0);
    let peak=0;for(const sample of samples)peak=Math.max(peak,Math.abs(sample));
    if(peak<.001)throw new Error('Silent horse recording');
    for(let i=0;i<samples.length;i++)samples[i]*=.85/peak;
    // Preserve all three hoof attacks; only soften the sub-millisecond loop join.
    const fade=Math.round(rate*.001);
    for(let i=0;i<fade;i++){samples[i]*=i/fade;samples[samples.length-1-i]*=i/fade;}
    return Array.from(samples);
  },{base64:fs.readFileSync(path.join(input,'ground.mp3')).toString('base64'),rate});
  const wav=Buffer.alloc(44+samples.length*2);
  wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);
  wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);
  wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples.length*2,40);
  samples.forEach((sample,i)=>wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,sample))*32767),44+i*2));
  fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'gallop.wav'),wav);
  fs.copyFileSync(path.join(input,'SOURCE.txt'),path.join(output,'CREDITS.txt'));
  console.log(`gallop.wav: ${(samples.length/rate).toFixed(3)} s, ${wav.length} bytes, mono ${rate} Hz`);
}finally{await browser.close();}
