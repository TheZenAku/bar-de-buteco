/**
 * Prepares the city's sounds (docs/sistemas/ambient.md): reads assets-bar/sound/cidade/catalogo.json, cuts each recording to the chosen stretch, evens out
 * its loudness, writes mono AAC to apps/web/public/audio/cidade and the catalogue the game reads (apps/web/src/assets/city-sounds.json).
 *
 * Spots in 'eventos' mode also get the stretches where something happens (a bark, a siren, a burst of voices), found here once, so the game can
 * play a different slice of a long recording each time instead of the whole thing.
 *
 *   npm run assets:cidade-sons [-- caminho\do\ffmpeg.exe]      (FFMPEG_PATH works too)
 */
import {createHash} from 'node:crypto';
import {readFile,writeFile,readdir,mkdir,rm,access} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../../',import.meta.url));
const folder=path.join(root,'assets-bar/sound/cidade');
const output=path.join(root,'apps/web/public/audio/cidade');
const catalogFile=path.join(root,'apps/web/src/assets/city-sounds.json');
const ffmpeg=process.argv[2]||process.env.FFMPEG_PATH||'ffmpeg';
/** Bump when the processing changes: files made with another profile are made again. */
const PROFILE='city-aac-v1-mono-32k-64k';
const RATE=32000;
const TARGET={bed:{i:-26,tp:-3},spot:{i:-23,tp:-2}};

const run=(args,binary=false)=>new Promise((resolve,reject)=>{
  const child=spawn(ffmpeg,['-nostdin','-hide_banner',...args],{windowsHide:true});
  const out=[];let log='';
  child.stdout.on('data',chunk=>out.push(chunk));child.stderr.on('data',chunk=>log+=chunk);child.on('error',reject);
  child.on('close',code=>code===0?resolve(binary?Buffer.concat(out):log):reject(new Error(log.slice(-3000))));
});
const exists=file=>access(file).then(()=>true,()=>false);
/** Credits were saved by the downloader in whichever encoding the host had; this reads both. */
async function readJson(file){
  const bytes=await readFile(file);
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return JSON.parse(bytes.toString('latin1'));}
}

/** Level of the stretch in dB per quarter second, from the decoded mono samples. */
function levels(samples,rate,step=.25){
  const size=Math.round(rate*step),out=[];
  for(let at=0;at+size<=samples.length;at+=size){let sum=0;for(let i=at;i<at+size;i++)sum+=samples[i]*samples[i];out.push(10*Math.log10(sum/size+1e-12));}
  return out;
}
/** Stretches well above the background (median + 5 dB), joined across short gaps and padded: a bark with its tail, a siren as it rises. */
export function activity(db,step=.25,{rise=5,gap=1.5,before=.8,after=1.4,least=1.5}={}){
  if(db.length<8)return [[0,db.length*step]];
  const sorted=[...db].sort((a,b)=>a-b),threshold=sorted[sorted.length>>1]+rise;
  const runs=[];
  db.forEach((value,i)=>{
    if(value<threshold)return;
    const time=i*step,last=runs.at(-1);
    if(last&&time-last[1]<=gap)last[1]=time+step;else runs.push([time,time+step]);
  });
  const total=db.length*step;
  const padded=runs.map(([a,b])=>[Math.max(0,a-before),Math.min(total,b+after)]).filter(([a,b])=>b-a>=least);
  // Padding can make neighbours touch.
  const merged=[];
  for(const run of padded){const last=merged.at(-1);if(last&&run[0]<=last[1])last[1]=Math.max(last[1],run[1]);else merged.push([...run]);}
  const loudest=merged.map(([a,b])=>({a,b,score:Math.max(...db.slice(Math.floor(a/step),Math.ceil(b/step)))})).sort((x,y)=>y.score-x.score).slice(0,24).sort((x,y)=>x.a-y.a);
  const picked=loudest.map(({a,b})=>[+a.toFixed(2),+b.toFixed(2)]);
  return picked.length?picked:[[0,+total.toFixed(2)]];
}

async function main(){
  const catalog=await readJson(path.join(folder,'catalogo.json'));
  const credits=new Map((await readJson(path.join(folder,'fontes.json'))).map(entry=>[entry.id,entry]));
  let previous={beds:[],spots:[]};try{previous=await readJson(catalogFile);}catch{}
  const before=new Map([...previous.beds,...previous.spots].map(entry=>[entry.id,entry]));
  await mkdir(output,{recursive:true});await mkdir(path.dirname(catalogFile),{recursive:true});
  const used=new Set(),result={version:1,profile:PROFILE,beds:[],spots:[]};
  const items=[...catalog.camas.map(item=>({...item,kind:'bed'})),...catalog.pontos.map(item=>({...item,kind:'spot'}))];
  for(const item of items){
    const source=path.join(folder,'fontes',`${item.fonte}.ogg`),credit=credits.get(item.fonte);
    if(!await exists(source))throw new Error(`Falta o original ${item.fonte} (${item.id}) em assets-bar/sound/cidade/fontes.`);
    if(!credit||!/CC0|zero/.test(credit.license||''))throw new Error(`${item.id}: a fonte ${item.fonte} não consta como CC0 em fontes.json.`);
    const bytes=await readFile(source);
    const hash=createHash('sha256').update(bytes).update(JSON.stringify([item.inicio,item.duracao,item.modo,item.ajuste,PROFILE])).digest('hex').slice(0,10);
    const file=`${item.id}-${hash}.m4a`,url=`/audio/cidade/${file}`;
    used.add(file);
    const cut=[...(item.inicio?['-ss',String(item.inicio)]:[]),...(item.duracao?['-t',String(item.duracao)]:[]),'-i',source];
    const cached=before.get(item.id);
    let entry;
    if(cached&&cached.url===url&&await exists(path.join(output,file))){entry=cached;console.log(`Atual: ${item.id}`);}
    else{
      console.log(`Preparando: ${item.id}`);
      const target=TARGET[item.kind];
      const analysis=await run([...cut,'-vn','-ac','1','-af',`highpass=f=55,loudnorm=I=${target.i}:TP=${target.tp}:LRA=9:print_format=json`,'-f','null','-']);
      const stats=JSON.parse(analysis.match(/\{\s*"input_i"[\s\S]*?\}/)?.[0]||'null');
      if(!stats||!Number.isFinite(Number(stats.input_i)))throw new Error(`Áudio inválido ou silencioso: ${item.id}`);
      const filter=`highpass=f=55,loudnorm=I=${target.i}:TP=${target.tp}:LRA=9:measured_I=${stats.input_i}:measured_TP=${stats.input_tp}:measured_LRA=${stats.input_lra}:measured_thresh=${stats.input_thresh}:offset=${stats.target_offset}:linear=true${item.ajuste?`,volume=${item.ajuste}dB`:''}`;
      const encoded=path.join(output,file);
      await run(['-y',...cut,'-vn','-map_metadata','-1','-ac','1','-af',filter,'-ar',String(RATE),'-c:a','aac','-b:a','64k','-movflags','+faststart',encoded]);
      // Length and activity are read back from what was written, so they describe the published file.
      const pcm=await run(['-i',encoded,'-vn','-ac','1','-ar','8000','-f','f32le','-'],true);
      const samples=new Float32Array(pcm.buffer.slice(pcm.byteOffset,pcm.byteOffset+pcm.length-pcm.length%4));
      const duration=+(samples.length/8000).toFixed(2);
      entry={id:item.id,url,duration,description:item.descricao,source:{id:credit.id,author:credit.author,title:credit.title,license:'CC0',page:credit.page}};
      if(item.kind==='spot')entry.segments=item.modo==='eventos'?activity(levels(samples,8000)):[[0,duration]];
    }
    result[item.kind==='bed'?'beds':'spots'].push(entry);
  }
  await writeFile(catalogFile,JSON.stringify(result,null,2)+'\n');
  // Only what the previous catalogue listed and this one dropped is removed; anything else in the folder is left alone.
  for(const old of [...before.values()])if(old.url&&!used.has(path.basename(old.url)))await rm(path.join(output,path.basename(old.url)),{force:true});
  console.log(`${result.beds.length} camadas e ${result.spots.length} sons pontuais publicados; originais preservados.`);
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))await main();
