import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url)),source=path.join(root,'assets-bar/sounds/veiculos'),out=path.join(root,'apps/web/public/veiculos/sound');
mkdirSync(out,{recursive:true});
const rate=48000,clips=[
  {name:'aciona',file:'3100',from:.39,to:.9,rms:.12},
  {name:'solta',file:'3104',from:.3,to:1.06,rms:.1},
  {name:'pneu',file:'2368',from:.22,to:1.52,loop:.12,rms:.19},
],manifest=[];
for(const clip of clips){
  const raw=readFileSync(path.join(source,clip.file+'.wav'));let fmt,data;
  for(let at=12;at+8<=raw.length;){const size=raw.readUInt32LE(at+4),id=raw.toString('ascii',at,at+4),chunk=raw.subarray(at+8,at+8+size);if(id==='fmt ')fmt=chunk;if(id==='data')data=chunk;at+=8+size+(size%2);}
  if(!fmt||!data||fmt.readUInt16LE(0)!==1||fmt.readUInt16LE(2)!==1||fmt.readUInt32LE(4)!==rate)throw Error('Expected mono PCM 48 kHz');
  const bytes=fmt.readUInt16LE(14)/8;
  let cut=Float64Array.from({length:Math.round((clip.to-clip.from)*rate)},(_,i)=>data.readIntLE((Math.round(clip.from*rate)+i)*bytes,bytes)/2**(bytes*8-1));
  const dc=cut.reduce((sum,v)=>sum+v,0)/cut.length;cut=cut.map(v=>v-dc);
  if(clip.loop){const n=Math.round(clip.loop*rate),joined=cut.slice(n);for(let i=0;i<n;i++){const t=i/(n-1);joined[joined.length-n+i]=cut[cut.length-n+i]*(1-t)+cut[i]*t;}cut=joined;}
  else {const n=Math.round(.008*rate);for(let i=0;i<n;i++){cut[i]*=i/n;cut[cut.length-1-i]*=i/n;}}
  const rms=Math.sqrt(cut.reduce((sum,v)=>sum+v*v,0)/cut.length),peak=cut.reduce((max,v)=>Math.max(max,Math.abs(v)),0),gain=Math.min(clip.rms/rms,.85/peak);cut=cut.map(v=>v*gain);
  const wav=Buffer.alloc(44+cut.length*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(cut.length*2,40);
  for(let i=0;i<cut.length;i++)wav.writeInt16LE(Math.round(cut[i]*32767),44+i*2);
  writeFileSync(path.join(out,clip.name+'.wav'),wav);
  manifest.push({...clip,rate,bits:16,channels:1,seconds:cut.length/rate,sourceUrl:`https://bigsoundbank.com/UPLOAD/bwf-en/${clip.file}.wav`,sourceSha256:createHash('sha256').update(raw).digest('hex'),sha256:createHash('sha256').update(wav).digest('hex')});
}
writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');copyFileSync(path.join(source,'CREDITS.md'),path.join(out,'CREDITS.md'));
console.log('Vehicle brakes: 3 recorded PCM 48 kHz clips rebuilt.');
