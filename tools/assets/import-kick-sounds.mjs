// Publishes the sounds of a blow (assets-bar/sounds/golpes → apps/web/public/kick/sound), mono WAVs at 32 kHz. Offline only: npm run assets:kick:sound.
//
// The sources are CC0 packs from OpenGameArt; docs/assets/sons-golpes.md says which and where. Each recording starts with a little silence and
// ends in room noise: the clip starts on the sound's first moment, so it plays when the foot lands and not after, and ends when it has died away.
// Decoded by the browser (Edge, through Playwright) because Node has no FLAC decoder.
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const source=path.join(root,'assets-bar/sounds/golpes');
const output=path.join(root,'apps/web/public/kick/sound');
const RATE=32000,PEAK=.95,EDGE=.003,ONSET=.05,SILENT=.03,TAIL=.04;
// The air, the foot on the body, and the body on the floor.
const CLIPS=[
  {file:'ar-1',from:'swoshes/swosh-15.flac'},
  {file:'ar-2',from:'swoshes/swosh-20.flac'},
  {file:'ar-3',from:'swoshes/swosh-22.flac'},
  // Rises for about 300 ms: the two feet going up.
  {file:'ar-longo',from:'swoshes/swosh-29.flac'},
  // Fast attack with some snap above 3 kHz, so it reads as a hit from across the room too.
  {file:'chute-1',from:'hits/hit15.mp3.flac'},
  {file:'chute-2',from:'hits/hit11.mp3.flac'},
  {file:'chute-3',from:'hits/hit23.mp3.flac'},
  {file:'chute-4',from:'hits/hit10.mp3.flac'},
  // Mostly below 200 Hz: the weight, laid under a hit from the flying kick.
  {file:'chute-peso',from:'hits/hit34.mp3.flac'},
  {file:'queda-1',from:'wet_towel_on_floor/wet_towel_on_floor-03.flac'},
  {file:'queda-2',from:'wet_towel_on_floor/wet_towel_on_floor-07.flac'},
  {file:'queda-3',from:'wet_towel_on_floor/wet_towel_on_floor-08.flac'},
  {file:'queda-4',from:'wet_towel_on_floor/wet_towel_on_floor-10.flac'},
];

function wav(samples){
  const bytes=Buffer.alloc(44+samples.length*2);
  bytes.write('RIFF',0,'latin1');bytes.writeUInt32LE(36+samples.length*2,4);bytes.write('WAVEfmt ',8,'latin1');bytes.writeUInt32LE(16,16);
  bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(RATE,24);bytes.writeUInt32LE(RATE*2,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);
  bytes.write('data',36,'latin1');bytes.writeUInt32LE(samples.length*2,40);
  samples.forEach((sample,i)=>bytes.writeInt16LE(Math.round(Math.max(-1,Math.min(1,sample))*32767),44+i*2));
  return bytes;
}

const {chromium}=createRequire(path.join(root,'package.json'))('@playwright/test');
const browser=await chromium.launch({channel:'msedge'});
try{
  const page=await browser.newPage();
  fs.mkdirSync(output,{recursive:true});
  for(const clip of CLIPS){
    const samples=await page.evaluate(async({base64,rate,peak,edge,onset,silent,tail})=>{
      const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
      const master=await new OfflineAudioContext(1,48000,48000).decodeAudioData(bytes.buffer);
      const context=new OfflineAudioContext(1,Math.ceil(master.duration*rate),rate),player=context.createBufferSource();
      // Two channels into one: the mix a mono destination makes.
      player.buffer=master;player.connect(context.destination);player.start();
      const whole=(await context.startRendering()).getChannelData(0);
      let top=0;for(const sample of whole)top=Math.max(top,Math.abs(sample));
      let first=0;while(first<whole.length&&Math.abs(whole[first])<top*onset)first++;
      // The end: where the last 20 ms louder than this are.
      const window=Math.round(rate*.02);let last=whole.length;
      while(last>first+window){let sum=0;for(let i=last-window;i<last;i++)sum+=whole[i]*whole[i];if(Math.sqrt(sum/window)>top*silent)break;last-=window;}
      const start=Math.max(0,first-Math.round(rate*.002)),end=Math.min(whole.length,last+Math.round(rate*tail));
      const cut=Array.from(whole.subarray(start,end),sample=>sample/top*peak);
      const fadeIn=Math.round(edge*rate),fadeOut=Math.round(tail*rate);
      for(let i=0;i<fadeIn;i++)cut[i]*=i/fadeIn;
      for(let i=0;i<fadeOut;i++)cut[cut.length-1-i]*=i/fadeOut;
      return cut;
    },{base64:fs.readFileSync(path.join(source,clip.from)).toString('base64'),rate:RATE,peak:PEAK,edge:EDGE,onset:ONSET,silent:SILENT,tail:TAIL});
    const bytes=wav(samples);
    fs.writeFileSync(path.join(output,`${clip.file}.wav`),bytes);
    console.log(`${clip.file}.wav ${(samples.length/RATE).toFixed(2)} s, ${(bytes.length/1024).toFixed(0)} KB (${clip.from})`);
  }
}finally{await browser.close();}
