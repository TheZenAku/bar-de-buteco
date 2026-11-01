// The phone's vibration, cut from a recording: "Vibration Cell Phone.flac" by qubodup (https://freesound.org/s/182855/, CC0), kept in
// assets-bar/sound/freesound. The take repeats three pulses and a pause; this keeps one such group, starting from silence. Decoded in Edge, as
// there is no ffmpeg here (see import-moto-sounds.mjs). Offline only: npm run assets:phone:sound.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';

const root=fileURLToPath(new URL('../../',import.meta.url));
const source=process.argv[2]??path.join(root,'assets-bar/sound/freesound/182855_qubodup_vibration-cell-phone.mp3');
const output=path.join(root,'apps/web/public/phone/vibrate.wav');
const FROM=.24,TO=1.56,RATE=32_000,FADE=.012;

const browser=await chromium.launch({channel:'msedge'}),page=await browser.newPage();
const samples=await page.evaluate(async({base64,from,to,rate,fade})=>{
  const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0)).buffer,decoded=await new OfflineAudioContext(1,1,rate).decodeAudioData(bytes);
  const length=Math.floor((to-from)*rate),context=new OfflineAudioContext(1,length,rate),player=context.createBufferSource();
  player.buffer=decoded;player.connect(context.destination);player.start(0,from);
  const mixed=(await context.startRendering()).getChannelData(0),edge=Math.floor(fade*rate);
  let peak=0;for(const value of mixed)peak=Math.max(peak,Math.abs(value));
  return Array.from(mixed,(value,i)=>Math.round(value/peak*.95*Math.min(1,i/edge,(length-1-i)/edge)*32767));
},{base64:fs.readFileSync(source).toString('base64'),from:FROM,to:TO,rate:RATE,fade:FADE});
await browser.close();
const wav=Buffer.alloc(44+samples.length*2);
wav.write('RIFF',0);wav.writeUInt32LE(36+samples.length*2,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(RATE,24);wav.writeUInt32LE(RATE*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples.length*2,40);
samples.forEach((value,i)=>wav.writeInt16LE(value,44+i*2));
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,wav);
console.log(`vibrate.wav: ${(samples.length/RATE).toFixed(2)} s, ${(wav.length/1024).toFixed(0)} KB`);
