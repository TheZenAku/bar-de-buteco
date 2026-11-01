// Publishes the bike's sounds (assets-bar/map/BarBoteco/export/moto/sound → apps/web/public/moto/sound), mono WAVs at 32 kHz. Offline only: npm run assets:moto:sound.
//
// The nine .flac files are one timeline exported up to different points (SCOOTER_IDLE.flac holds them all): nine takes apart by silence,
// in the order the names were saved. Each clip below is its stretch of that timeline in seconds. Decoded by the browser (Edge, through
// Playwright) because Node has no FLAC decoder. WAV because a loop must have no padding: the two loops overlap their own ends here.
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const source=path.join(root,'assets-bar/map/BarBoteco/export/moto/sound/SCOOTER_IDLE.flac');
const output=path.join(root,'apps/web/public/moto/sound');
const RATE=32000,GAIN=2,LOOP_OVERLAP=.4,EDGE=.004;
const CLIPS=[
  {file:'liga',from:0,to:1.293},
  {file:'desliga',from:1.835,to:3.128},
  // Of the 63 s riding take, a stretch at high revs with no dip; the sound of any other speed is this one played slower.
  {file:'acelerando',from:47.2,to:53.2,loop:true},
  // Starts where the revs begin to fall: the 2.5 s before that are still the throttle open.
  {file:'parando',from:87.2,to:91.842},
  {file:'falha-1',from:95.906,to:101.139},
  {file:'falha-2',from:103.183,to:104.95},
  {file:'falha-3',from:106.597,to:111.82},
  {file:'falha-4',from:113.25,to:120.575},
  // The take fades up from nothing until 131 s; from there it idles evenly.
  {file:'idle',from:131.5,to:137,loop:true},
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
  const cut=await page.evaluate(async({base64,clips,rate,gain,overlap,edge})=>{
    const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
    const master=await new OfflineAudioContext(1,48000,48000).decodeAudioData(bytes.buffer);
    const result={};
    for(const clip of clips){
      const extra=clip.loop?overlap:0,length=Math.round((clip.to-clip.from+extra)*rate);
      const context=new OfflineAudioContext(1,length,rate),player=context.createBufferSource(),level=context.createGain();
      // Two channels into one: the mix a mono destination makes.
      player.buffer=master;level.gain.value=gain;player.connect(level).connect(context.destination);player.start(0,clip.from,clip.to-clip.from+extra);
      const rendered=(await context.startRendering()).getChannelData(0);
      let samples;
      if(clip.loop){
        // The last moments laid over the first, equal power: the end runs into the start with no seam.
        const fade=Math.round(overlap*rate),body=length-fade;
        samples=Array.from(rendered.subarray(0,body));
        for(let i=0;i<fade;i++){const t=i/fade;samples[i]=rendered[i]*Math.sin(t*Math.PI/2)+rendered[body+i]*Math.cos(t*Math.PI/2);}
      }else{
        samples=Array.from(rendered);
        const fade=Math.round(edge*rate);
        for(let i=0;i<fade;i++){samples[i]*=i/fade;samples[samples.length-1-i]*=i/fade;}
      }
      result[clip.file]=samples;
    }
    return result;
  },{base64:fs.readFileSync(source).toString('base64'),clips:CLIPS,rate:RATE,gain:GAIN,overlap:LOOP_OVERLAP,edge:EDGE});
  fs.mkdirSync(output,{recursive:true});
  for(const clip of CLIPS){
    const samples=cut[clip.file],bytes=wav(samples);
    fs.writeFileSync(path.join(output,`${clip.file}.wav`),bytes);
    console.log(`${clip.file}.wav ${(samples.length/RATE).toFixed(2)} s, ${(bytes.length/1024).toFixed(0)} KB`);
  }
}finally{await browser.close();}
