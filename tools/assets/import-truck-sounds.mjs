// Rebuild from the original lossless recordings, without ffmpeg or a network request.
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
const source=path.join(root,'assets-bar/sounds/caminhao'),out=path.join(root,'apps/web/public/caminhao/sound');
mkdirSync(out,{recursive:true});
const rate=48000;
const clips=[
  {name:'idle',file:'1145',from:5,to:15,loop:.25,rms:.17},
  {name:'carga',file:'1146',from:10.6,to:14.1,loop:.35,rms:.16},
  {name:'partida',file:'0967',from:.08,to:2.1,rms:.18},
  {name:'arranque',file:'0967',from:.22,to:.95,loop:.06,rms:.15},
  {name:'desliga',file:'0967',from:46.9,to:49.65,rms:.17},
  {name:'buzina',file:'2721',from:.07,to:.34,loop:.035,rms:.23},
  {name:'re',file:'2984',from:.1,to:1.1,loop:.01,rms:.16},
];
function pcm(file){
  const raw=readFileSync(file);let fmt,data;
  if(raw.toString('ascii',0,4)!=='RIFF'||raw.toString('ascii',8,12)!=='WAVE')throw Error('Expected WAV');
  for(let at=12;at+8<=raw.length;){
    const size=raw.readUInt32LE(at+4),chunk=raw.subarray(at+8,at+8+size),id=raw.toString('ascii',at,at+4);
    if(id==='fmt ')fmt=chunk;if(id==='data')data=chunk;at+=8+size+(size%2);
  }
  if(!fmt||!data||fmt.readUInt16LE(0)!==1||fmt.readUInt16LE(2)!==1||fmt.readUInt32LE(4)!==rate)throw Error('Expected mono PCM 48 kHz');
  const bytes=fmt.readUInt16LE(14)/8;if(bytes!==2&&bytes!==3)throw Error('Expected 16/24-bit');
  return {samples:Float64Array.from({length:data.length/bytes},(_,i)=>data.readIntLE(i*bytes,bytes)/2**(bytes*8-1)),raw};
}
function wav(samples){
  const data=Buffer.alloc(44+samples.length*2);data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);data.writeUInt32LE(rate,24);data.writeUInt32LE(rate*2,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(samples.length*2,40);
  for(let i=0;i<samples.length;i++)data.writeInt16LE(Math.round(Math.max(-1,Math.min(1,samples[i]))*32767),44+i*2);
  return data;
}
const manifest=[];
for(const clip of clips){
  const {samples,raw}=pcm(path.join(source,clip.file+'.wav'));
  let cut=samples.slice(Math.round(clip.from*rate),Math.round(clip.to*rate));
  const dc=cut.reduce((sum,v)=>sum+v,0)/cut.length;cut=cut.map(v=>v-dc);
  if(clip.loop){
    // Overlap the tail and head; the wrap then follows adjacent original samples.
    const n=Math.round(clip.loop*rate),joined=cut.slice(n);
    for(let i=0;i<n;i++){const t=i/(n-1);joined[joined.length-n+i]=cut[cut.length-n+i]*(1-t)+cut[i]*t;}
    cut=joined;
  }else{
    const fade=Math.round(.015*rate);
    for(let i=0;i<fade;i++){cut[i]*=i/fade;cut[cut.length-1-i]*=i/fade;}
  }
  const rms=Math.sqrt(cut.reduce((sum,v)=>sum+v*v,0)/cut.length),peak=cut.reduce((max,v)=>Math.max(max,Math.abs(v)),0);
  const gain=Math.min(clip.rms/rms,.88/peak);cut=cut.map(v=>v*gain);
  const result=wav(cut);writeFileSync(path.join(out,clip.name+'.wav'),result);
  manifest.push({...clip,rate,bits:16,channels:1,seconds:cut.length/rate,sourceUrl:`https://bigsoundbank.com/UPLOAD/bwf-en/${clip.file}.wav`,sourceSha256:createHash('sha256').update(raw).digest('hex'),sha256:createHash('sha256').update(result).digest('hex')});
}
writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
copyFileSync(path.join(source,'CREDITS.md'),path.join(out,'CREDITS.md'));
console.log(`Truck: ${clips.length} lossless mono 48 kHz clips rebuilt.`);
