import {createHash} from 'node:crypto';
import {readFile,writeFile,readdir,mkdir,access} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../../',import.meta.url));
const source=path.join(root,'assets-bar/sound/ambient');
const output=path.join(root,'apps/web/public/audio/ambient');
const catalog=path.join(root,'apps/web/src/assets/ambient.json');
const ffmpeg=process.argv[2]||process.env.FFMPEG_PATH||'ffmpeg';
const profile='ambient-aac-v1-I-24-TP-6-LRA7-48k-96k';
const run=args=>new Promise((resolve,reject)=>{
  const child=spawn(ffmpeg,['-nostdin','-hide_banner',...args],{windowsHide:true});
  let log='';child.stderr.on('data',chunk=>log+=chunk);child.on('error',reject);
  child.on('close',code=>code===0?resolve(log):reject(new Error(log.slice(-4000))));
});

await mkdir(output,{recursive:true});await mkdir(path.dirname(catalog),{recursive:true});
let previous=[];try{previous=JSON.parse(await readFile(catalog,'utf8'));}catch{}
const tracks=[],seen=new Set();
for(const name of (await readdir(source)).filter(name=>/\.(m4a|mp3|wav|ogg|flac)$/i.test(name)).sort()){
  const input=path.join(source,name),bytes=await readFile(input);
  const hash=createHash('sha256').update(bytes).digest('hex');
  if(seen.has(hash)){console.log(`Duplicado ignorado: ${name}`);continue;}seen.add(hash);
  const id=`${name.match(/^\d+/)?.[0]||'ambient'}-${hash.slice(0,10)}`;
  const file=`${id}.m4a`,url=`/audio/ambient/${file}`;
  const cached=previous.find(track=>track.id===id&&track.profile===profile);
  if(cached&&await access(path.join(output,file)).then(()=>true,()=>false)){tracks.push(cached);console.log(`Atual: ${id}`);continue;}
  console.log(`Preparando: ${name}`);
  const analysis=await run(['-i',input,'-vn','-af','loudnorm=I=-24:TP=-6:LRA=7:print_format=json','-f','null','-']);
  const stats=JSON.parse(analysis.match(/\{\s*"input_i"[\s\S]*?\}/)?.[0]||'null');
  const match=analysis.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
  if(!stats||!match||!Number.isFinite(Number(stats.input_i)))throw new Error(`Audio invalido/silencioso: ${name}`);
  const duration=Math.round((Number(match[1])*3600+Number(match[2])*60+Number(match[3]))*100)/100;
  const filter=`loudnorm=I=-24:TP=-6:LRA=7:measured_I=${stats.input_i}:measured_TP=${stats.input_tp}:measured_LRA=${stats.input_lra}:measured_thresh=${stats.input_thresh}:offset=${stats.target_offset}:linear=true`;
  await run(['-y','-i',input,'-vn','-map_metadata','-1','-af',filter,'-ar','48000','-c:a','aac','-b:a','96k','-movflags','+faststart',path.join(output,file)]);
  tracks.push({id,url,duration,source:name,profile});
}
if(!tracks.length)throw new Error('Nenhum audio encontrado; catalogo anterior preservado.');
await writeFile(catalog,JSON.stringify(tracks,null,2)+'\n');
console.log(`${tracks.length} ambientes publicados; originais preservados.`);
