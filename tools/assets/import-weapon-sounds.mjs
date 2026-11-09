// Publishes the firearms' sounds (assets-bar/sounds/armas → apps/web/public/armas/sons) and writes apps/web/src/weapons/sound-meta.ts.
// Offline only: npm run assets:weapons:sound. Sources, authors and licences: assets-bar/sounds/armas/README.md and docs/assets/armas.md.
//
// - Every clip is mono 16-bit WAV: 32 kHz for shots, impacts, whizzes and the reverbs, 24 kHz for mechanics, the interface and far shots
//   (a far shot has nothing left above 10 kHz: the air took it).
// - A clip starts on its sound's first moment (a shot plays on the frame it is fired, not after) and ends faded once it has died away or
//   reached its category's length (shots 1.1 s, far shots 1.6 s).
// - Loudness is balanced per category on the loudest 50 ms (short-term RMS), the sample peak kept under -0.3 dBFS; gunshots are compressed and
//   limited so the body of the report carries the loudness, not its first spike (raw, their crest factors differ by 6 dB).
// - The FFSL recordings were cut into single takes once (assets-bar/sounds/armas/ffsl/<ID>-<take>.wav, summed to mono, 48 kHz): see the README.
// The choice was made by measuring, not by ear (onset, decay, spectrum, clipping): nobody on this side could listen. Swap a take in the tables
// below and run again if one sounds wrong.
// usage: node tools/assets/import-weapon-sounds.mjs [--events <source>]  (--events: prints the takes a source splits into)
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';

const root=fileURLToPath(new URL('../../',import.meta.url));
const source=path.join(root,'assets-bar/sounds/armas'),output=path.join(root,'apps/web/public/armas/sons');
const metaFile=path.join(root,'apps/web/src/weapons/sound-meta.ts');

// A source: 'X_40-1' (an FFSL take), 'fs:707791' (Freesound), 'kenney:tick_001'. Options: take (n-th event of the source), at [from,to] s,
// pitch (playback rate), lowpass/highpass (Hz), gain (dB), layers (mixed in: {src,gain,pitch,delay ms}), max (s).
const fileOf=src=>src.startsWith('fs:')?`freesound/${src.slice(3)}.ogg`:src.startsWith('kenney:')?`kenney/${src.slice(7)}.ogg`:`ffsl/${src}.wav`;
// Categories: output rate, longest length, fade, loudness target (dBFS short-term RMS).
const CAT={
  shot:{rate:32000,max:1.1,fade:.35,target:-12,compress:true},near:{rate:32000,max:1.1,fade:.35,target:-12,compress:true},far:{rate:24000,max:1.6,fade:.6,target:-14,compress:true},
  suppressed:{rate:32000,max:.8,fade:.3,target:-15,compress:true},suppressedFar:{rate:32000,max:.9,fade:.4,target:-18},
  mech:{rate:24000,max:.8,fade:.15,target:-14},ui:{rate:24000,max:.5,fade:.08,target:-15},
  impact:{rate:32000,max:.7,fade:.2,target:-12},whiz:{rate:32000,max:1,fade:.25,target:-13},casing:{rate:32000,max:.8,fade:.2,target:-18},
  foley:{rate:24000,max:1,fade:.15,target:-15},reverb:{rate:32000,max:3,fade:1.2,target:null},
};
const takes=(prefix,list,extra={})=>list.map(n=>({src:`${prefix}-${n}`,...extra}));
// The double barrel: the Charles Daly 12 under a slower Nova take (two barrels of a heavier gun).
const heavy=(src,with_)=>({src,layers:[{src:with_,gain:-6,pitch:.9,delay:3}],lowshelf:[160,3]});
const WEAPONS={
  pistola:{shot:takes('X_40',[1,2]),near:takes('X_39P',[2,3]),far:takes('X_31',[1,2]),
    suppressed:[...takes('X_44',[1,2]),...takes('X_45',[1])],suppressedFar:takes('X_45',[1,2],{lowpass:1600}),
    mech:{magOut:takes('X_3',[1]),magIn:takes('X_4',[1,2]),rack:takes('X_8',[1]),slideRelease:takes('X_17',[1]),dry:takes('X_18',[1])}},
  revolver:{shot:takes('V_26',[1,2]),near:takes('V_27P',[1,2]),far:takes('V_21',[1,2]),
    mech:{cylinderOpen:takes('V_14',[1,2]),cylinderClose:takes('V_15',[1]),shellIn:takes('V_18',[2,3,5]),dry:takes('V_5',[1]),hammer:takes('I_13',[2,4])}},
  submetralhadora:{shot:takes('G_26',[2,3]),near:takes('G_31P',[1,2]),far:takes('G_19',[2,3]),
    suppressed:[...takes('X_44',[1,2]),...takes('X_45',[1])],suppressedFar:takes('X_45',[1,2],{lowpass:1600}),
    mech:{magOut:takes('G_9',[2]),magIn:takes('G_8',[1]),rack:takes('G_10',[1]),boltBack:takes('G_10',[2]),dry:takes('C_7',[1]),select:takes('D_20',[1])}},
  fuzil:{shot:takes('D_29',[1,2]),near:takes('D_32P',[1,2]),far:takes('D_25',[1,2]),
    suppressed:[...takes('T_30',[1,2]),...takes('T_31',[1])],suppressedFar:takes('T_31',[1,2],{lowpass:1400}),
    mech:{magOut:takes('D_5',[1]),magIn:takes('D_4',[1]),rack:takes('D_14',[1]),slideRelease:takes('D_13',[1,2]),select:takes('D_20',[1]),dry:takes('C_7',[1])}},
  'fuzil-ak':{shot:takes('C_42',[1,2]),near:takes('C_28P',[2,3]),far:takes('C_17',[1,2]),
    suppressed:[...takes('T_30',[1,2]),...takes('T_31',[2])],suppressedFar:takes('T_31',[1,2],{lowpass:1400}),
    mech:{magOut:takes('C_11',[1]),magIn:takes('C_10',[1]),rack:takes('C_14',[1,2]),select:takes('C_6',[1]),dry:takes('C_7',[1])}},
  dmr:{shot:takes('U_15',[1,2]),near:takes('U_14P',[1,2]),far:takes('U_16',[1,2]),
    suppressed:[...takes('T_30',[1,2]),...takes('T_29',[1])],suppressedFar:takes('T_29',[1,2],{lowpass:1400}),
    mech:{magOut:takes('D_5',[1]),magIn:takes('D_4',[1]),rack:takes('U_5',[1]),dry:takes('U_6',[1])}},
  escopeta:{shot:takes('O_20',[1,2]),near:takes('O_21P',[1,2]),far:takes('O_15',[1,2]),
    mech:{pumpBack:takes('O_4',[1]),pumpForward:takes('O_5',[1]),shellIn:takes('O_3',[1,2,4]),dry:takes('O_8',[1])}},
  'cano-duplo':{shot:[heavy('H_20-1','O_20-1'),heavy('H_20-2','O_20-2')],near:[heavy('H_21P-1','O_21P-1'),heavy('H_21P-2','O_21P-2')],far:takes('H_17',[1,2],{lowshelf:[160,3]}),
    mech:{breakOpen:[{src:'fs:52202',take:1}],breakClose:[{src:'fs:52202',take:4}],shellIn:[{src:'fs:52202',take:3},{src:'fs:52202',take:7}],dry:takes('O_8',[1]),hammer:takes('I_13',[2,4])}},
  carabina:{shot:takes('I_21',[1,2]),near:takes('I_22P',[1,2]),far:takes('I_16',[1,2]),
    mech:{leverDown:takes('I_2',[1]),leverUp:takes('I_4',[1]),shellIn:takes('I_0',[1,2,6]),dry:takes('W_13',[1]),hammer:takes('I_13',[2,4])}},
  precisao:{shot:takes('W_26',[1,2]),near:takes('W_29P',[1,2]),far:takes('W_23',[1,2]),
    suppressed:[...takes('T_30',[1,2]),...takes('T_31',[1])],suppressedFar:takes('T_31',[1,2],{lowpass:1300}),
    mech:{boltBack:takes('W_9',[1,2]),boltForward:takes('W_12',[1,2]),magIn:takes('W_4',[1]),magOut:takes('W_5',[1]),rack:takes('W_16',[1]),dry:takes('W_13',[1])}},
};
const SHARED={
  draw:{cat:'foley',list:[{src:'fs:707791',take:1},{src:'fs:415304'},{src:'fs:688765'}]},
  holster:{cat:'foley',list:[{src:'fs:707791',take:2},{src:'fs:388819'}]},
  scopeIn:{cat:'ui',list:[{src:'kenney:switch_003',gain:-4},{src:'kenney:click3',gain:-4}]},
  zoom:{cat:'ui',list:[{src:'fs:210018'},{src:'fs:210018',pitch:.9}]},
  fireMode:{cat:'ui',list:[{src:'D_20-1'},{src:'C_6-1'}]},
  hit:{cat:'ui',list:[{src:'kenney:tick_001'},{src:'kenney:tick_002'}]},
  // A headshot: the tick a major third up with a bright glass ring under it.
  headshot:{cat:'ui',list:[{src:'kenney:tick_002',pitch:1.26,layers:[{src:'kenney:glass_002',gain:-8}]}]},
  kill:{cat:'ui',list:[{src:'kenney:confirmation_002'}]},
  whiz:{cat:'whiz',list:[{src:'fs:789222'},{src:'fs:789222',pitch:1.15},{src:'fs:505238'}]},
  casingBrass:{cat:'casing',list:[{src:'fs:778021'},{src:'fs:778028'},{src:'fs:205126',take:1},{src:'fs:318964',take:3},{src:'fs:318964',take:8}]},
  casingShell:{cat:'casing',list:[{src:'fs:620929'},{src:'fs:620929',pitch:1.12}]},
};
const IMPACTS={
  concreto:[{src:'fs:569510'},{src:'fs:554148',take:1},{src:'fs:554148',take:2},{src:'fs:321478'}],
  metal:[{src:'fs:182263',take:1,gap:.06},{src:'fs:182263',take:3,gap:.06},{src:'fs:182263',take:7,gap:.06},{src:'fs:351371'},{src:'kenney:impactMetal_light_001'}],
  madeira:[{src:'fs:319226'},{src:'fs:319228'},{src:'kenney:impactWood_medium_000'},{src:'kenney:impactWood_medium_003'}],
  vidro:[{src:'fs:221528'},{src:'kenney:impactGlass_medium_000'},{src:'kenney:impactGlass_medium_002'}],
  terra:[{src:'fs:319222'},{src:'fs:319222',pitch:.85},{src:'fs:569746',take:1}],
  // Asphalt: the concrete hits a little lower and duller.
  asfalto:[{src:'fs:569510',pitch:.88,lowpass:5000},{src:'fs:321478',pitch:.85,lowpass:5000},{src:'fs:554148',take:3,pitch:.9,lowpass:5000}],
  carne:[{src:'fs:138478'},{src:'fs:138479'},{src:'fs:138480'},{src:'fs:138481'}],
};
// Impulse responses for a ConvolverNode: a modelled street (outside) and a parking garage cut short (inside the bar: a hard, mid-size room).
const REVERB={outdoor:{src:'fs:537643',max:3},indoor:{src:'fs:537675',max:1.4}};

/** Brickwall limiter at -0.3 dBFS: 1.5 ms lookahead (the gain is already down when the spike arrives), 8 ms release (a gunshot is a few spikes in a
 *  noise burst: a slow release would turn the whole report down with them). */
function limit(x,rate,ceiling=.966){
  const ahead=Math.round(rate*.0015),release=Math.exp(-1/(rate*.008)),need=new Float32Array(x.length);
  for(let i=0;i<x.length;i++)need[i]=Math.min(1,ceiling/Math.max(1e-9,Math.abs(x[i])));
  // The least gain needed over the lookahead window (a sliding minimum), taken at once; given back slowly.
  const out=new Float32Array(x.length),queue=new Int32Array(x.length);let head=0,tail=0,g=1;
  for(let j=0;j<Math.min(ahead,x.length);j++){while(tail>head&&need[queue[tail-1]]>=need[j])tail--;queue[tail++]=j;}
  for(let i=0;i<x.length;i++){
    const j=i+ahead;if(j<x.length){while(tail>head&&need[queue[tail-1]]>=need[j])tail--;queue[tail++]=j;}
    while(queue[head]<i)head++;
    const m=need[queue[head]];g=m<g?m:m-(m-g)*release;out[i]=x[i]*Math.min(g,need[i]);
  }
  return Array.from(out);
}
function wav(samples,rate){
  const b=Buffer.alloc(44+samples.length*2);
  b.write('RIFF',0,'latin1');b.writeUInt32LE(36+samples.length*2,4);b.write('WAVEfmt ',8,'latin1');b.writeUInt32LE(16,16);
  b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);
  b.write('data',36,'latin1');b.writeUInt32LE(samples.length*2,40);
  for(let i=0;i<samples.length;i++)b.writeInt16LE(Math.round(Math.max(-1,Math.min(1,samples[i]))*32767),44+i*2);
  return b;
}

const PAGE=`<!doctype html><script>
const decoded=new Map();
async function decode(file){
  if(!decoded.has(file))decoded.set(file,(async()=>{
    const buffer=await new OfflineAudioContext(1,48000,48000).decodeAudioData(await (await fetch('/src/'+file)).arrayBuffer());
    const mono=new Float32Array(buffer.length);
    for(let c=0;c<buffer.numberOfChannels;c++){const d=buffer.getChannelData(c);for(let i=0;i<d.length;i++)mono[i]+=d[i]/buffer.numberOfChannels;}
    return mono;})());
  return decoded.get(file);
}
// The takes of a recording: where the 5 ms RMS is above its peak - 32 dB, gaps under the given gap (0.3 s) merged, quiet events (handling noise) dropped.
function events(x,gap=.3,rate=48000){
  const W=rate*.005|0,env=[];for(let i=0;i+W<=x.length;i+=W){let s=0;for(let k=i;k<i+W;k++)s+=x[k]*x[k];env.push(Math.sqrt(s/W));}
  const top=Math.max(...env),th=top*10**(-32/20),list=[];let cur=null;
  env.forEach((e,i)=>{if(e>th){if(cur&&i-cur.end<=gap/.005){cur.end=i;cur.peak=Math.max(cur.peak,e);}else{cur={start:i,end:i,peak:e};list.push(cur);}}});
  return list.filter(e=>e.peak>top*.18).map((e,k,all)=>({from:Math.max(0,e.start*W/rate-.04),to:k+1<all.length?all[k+1].start*W/rate-.05:x.length/rate,peakDb:20*Math.log10(e.peak)}));
}
async function segment(spec,file){
  const x=await decode(file);
  let [from,to]=spec.at??[0,x.length/48000];
  if(spec.take){const e=events(x,spec.gap)[spec.take-1];if(!e)throw new Error(file+': no take '+spec.take);[from,to]=[e.from,e.to];}
  return x.subarray(Math.round(from*48000),Math.round(to*48000));
}
window.listEvents=async(file,gap)=>events(await decode(file),gap);
window.render=async(spec,files,rate,max,fade,compress)=>{
  const parts=[{...spec,gain:spec.gain??0,delay:0},...(spec.layers??[])];
  const segs=await Promise.all(parts.map((p,i)=>segment(p,files[i])));
  const length=Math.ceil(Math.max(...segs.map((s,i)=>s.length/48000/(parts[i].pitch??1)+(parts[i].delay??0)/1000))*rate)+1;
  const ctx=new OfflineAudioContext(1,length,rate);
  parts.forEach((p,i)=>{
    const buf=ctx.createBuffer(1,segs[i].length,48000);buf.copyToChannel(segs[i],0);
    const src=ctx.createBufferSource();src.buffer=buf;src.playbackRate.value=p.pitch??1;
    let node=src;
    const chain=f=>{node.connect(f);node=f;};
    if(spec.lowpass&&i===0){const f=ctx.createBiquadFilter();f.type='lowpass';f.frequency.value=spec.lowpass;f.Q.value=.6;chain(f);}
    if(spec.lowshelf&&i===0){const f=ctx.createBiquadFilter();f.type='lowshelf';f.frequency.value=spec.lowshelf[0];f.gain.value=spec.lowshelf[1];chain(f);}
    const g=ctx.createGain();g.gain.value=10**((p.gain??0)/20);chain(g);
    node.connect(ctx.destination);src.start((p.delay??0)/1000);
  });
  let y=(await ctx.startRendering()).getChannelData(0);
  let top=0;for(const v of y)top=Math.max(top,Math.abs(v));
  const rms=(x,a,n)=>{let s=0;for(let i=a;i<a+n;i++)s+=x[i]*x[i];return Math.sqrt(s/n);};
  // Gunshots: a fast compressor on the shot brought to full scale, so the body of the report (not just its first spike) carries the loudness
  // and shots of different guns balance (their crest factors differ by 6 dB raw).
  if(compress){
    const c2=new OfflineAudioContext(1,y.length,rate),b=c2.createBuffer(1,y.length,rate);b.copyToChannel(y.map(v=>v/top),0);
    const s=c2.createBufferSource();s.buffer=b;const k=c2.createDynamicsCompressor();
    k.threshold.value=-20;k.knee.value=8;k.ratio.value=6;k.attack.value=.0015;k.release.value=.12;s.connect(k);k.connect(c2.destination);s.start();
    y=(await c2.startRendering()).getChannelData(0);top=0;for(const v of y)top=Math.max(top,Math.abs(v));
  }
  // Start on the first sample over -30 dB of the peak (2 ms earlier); end where the 20 ms RMS stays 48 dB under the loudest 50 ms (the tail
  // is kept, the room noise after it is not), or at the longest length.
  let first=0;while(first<y.length&&Math.abs(y[first])<top*.0316)first++;
  first=Math.max(0,first-Math.round(rate*.002));
  const L=Math.round(rate*.05);let loud=0;for(let i=first;i+L<=y.length;i+=L>>1)loud=Math.max(loud,rms(y,i,L));
  const W=Math.round(rate*.02);let last=y.length;
  while(last>first+W){if(rms(y,last-W,W)>loud*.004)break;last-=W;}
  last=Math.min(last,first+Math.round(max*rate));
  const out=Array.from(y.subarray(first,last));
  const fadeN=Math.min(Math.round(fade*rate),Math.round(out.length*.5));
  for(let i=0;i<fadeN;i++){const k=i/fadeN;out[out.length-1-i]*=k*k;}
  const inN=Math.round(rate*.001);for(let i=0;i<inN&&i<out.length;i++)out[i]*=i/inN;
  return out;
};
window.ready=true;
</script>`;

const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'msedge':undefined)});
const stats=[];
try{
  const page=await browser.newPage();
  page.on('pageerror',error=>console.error(error));
  await page.route('http://sons.local/**',route=>{
    const rel=decodeURIComponent(new URL(route.request().url()).pathname);
    if(rel==='/')return route.fulfill({contentType:'text/html',body:PAGE});
    const file=path.join(source,rel.replace(/^\/src\//,''));
    if(!file.startsWith(source)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
    return route.fulfill({body:fs.readFileSync(file)});
  });
  await page.goto('http://sons.local/');await page.waitForFunction(()=>window.ready);
  const eventsAt=process.argv.indexOf('--events');
  if(eventsAt>=0){
    for(const src of process.argv.slice(eventsAt+1)){const [name,gap]=src.split("@"),list=await page.evaluate(([file,gap])=>window.listEvents(file,gap),[fileOf(name),gap?+gap:.3]);
      console.log(src,list.map((e,i)=>`${i+1}: ${e.from.toFixed(2)}-${e.to.toFixed(2)}s ${e.peakDb.toFixed(1)}dB`).join(' | '));}
    process.exit(0);
  }
  fs.rmSync(output,{recursive:true,force:true});fs.mkdirSync(output,{recursive:true});
  const done=new Map();
  /** Renders one clip (once per identical spec) and returns its url. */
  async function clip(spec,cat,name){
    const key=JSON.stringify([spec,cat]);if(done.has(key))return done.get(key);
    const c=CAT[cat],files=[spec,...spec.layers??[]].map(p=>fileOf(p.src));
    for(const f of files)if(!fs.existsSync(path.join(source,f)))throw new Error(`Fonte ausente: ${f}`);
    let samples=await page.evaluate(([spec,files,rate,max,fade,compress])=>window.render(spec,files,rate,max,fade,compress),[spec,files,c.rate,spec.max??c.max,c.fade,!!c.compress]);
    // Loudness: the loudest 50 ms brought to the category's target; the peak kept under -0.3 dBFS. Gunshots go through a brickwall
    // limiter instead of being turned down to their first spike (two passes: the limiter takes a little of the loudness back).
    const W=Math.round(c.rate*.05),loudOf=x=>{let loud=0;for(let i=0;i+W<=x.length;i+=W>>1){let s=0;for(let k=i;k<i+W;k++)s+=x[k]*x[k];loud=Math.max(loud,Math.sqrt(s/W));}
      if(!loud){let s=0;for(const v of x)s+=v*v;loud=Math.sqrt(s/x.length);}return loud;};
    const peakOf=x=>{let p=0;for(const v of x)p=Math.max(p,Math.abs(v));return p;};
    let loud=loudOf(samples),peak=peakOf(samples),gain;
    if(c.compress){
      // The gain is found against the limited result (the limiter takes loudness back), at most 15 dB of limiting.
      const source=samples,db=v=>20*Math.log10(v);let g=10**(c.target/20)/loud;
      for(let pass=0;pass<6;pass++){
        g=Math.min(g,5.62*.966/peak);samples=limit(source.map(v=>v*g),c.rate);
        const miss=c.target-db(loudOf(samples));if(Math.abs(miss)<.4)break;g*=10**(miss/20);
      }
      gain=1;
    }else{
      gain=c.target===null?.9/peak:10**(c.target/20)/loud;
      if(peak*gain>.966)gain=.966/peak;
      samples=samples.map(v=>v*gain);gain=1;
    }
    peak=peakOf(samples);loud=loudOf(samples);
    const rel=`${cat==='reverb'?'reverb':cat==='impact'?'impactos':['shot','near','far','suppressed','suppressedFar'].includes(cat)?'tiros':cat==='mech'?'mecanica':'comum'}/${name}.wav`;
    const file=path.join(output,rel);fs.mkdirSync(path.dirname(file),{recursive:true});
    if(fs.existsSync(file))throw new Error(`Nome repetido: ${rel}`);
    fs.writeFileSync(file,wav(samples,c.rate));
    let rms=0;for(const v of samples)rms+=v*v;rms=Math.sqrt(rms/samples.length);
    stats.push({rel,cat,seconds:samples.length/c.rate,peak:20*Math.log10(peak*gain),loud:20*Math.log10(loud*Math.min(gain,1e9)),rms:20*Math.log10(rms),bytes:fs.statSync(file).size,src:spec.src});
    const url=`armas/sons/${rel}`;done.set(key,url);return url;
  }
  const slug=s=>s.replace(/^(fs|kenney):/,'').replace(/[^\w-]/g,'_');
  const NAMES={shot:'tiro',near:'perto',far:'longe',suppressed:'abafado',suppressedFar:'abafado-longe'};
  const weaponSounds={};
  for(const [id,set] of Object.entries(WEAPONS)){
    const out={mech:{}};
    for(const cat of ['shot','near','far','suppressed','suppressedFar']){if(!set[cat])continue;out[cat]=[];
      for(const [i,spec] of set[cat].entries())out[cat].push(await clip(spec,cat,`${id}-${NAMES[cat]}-${i+1}`));}
    for(const [sound,list] of Object.entries(set.mech)){out.mech[sound]=[];
      for(const spec of list)out.mech[sound].push(await clip(spec,"mech",`${slug(spec.src)}${spec.take?`-${spec.take}`:""}${spec.pitch?`-p${spec.pitch}`:""}`));}
    weaponSounds[id]=out;
  }
  const shared={};
  for(const [key,{cat,list}] of Object.entries(SHARED)){shared[key]=[];for(const [i,spec] of list.entries())shared[key].push(await clip(spec,cat,`${key}-${i+1}`));}
  shared.impact={};
  for(const [surface,list] of Object.entries(IMPACTS)){shared.impact[surface]=[];for(const [i,spec] of list.entries())shared.impact[surface].push(await clip(spec,'impact',`${surface}-${i+1}`));}
  shared.reverb={};
  for(const [key,spec] of Object.entries(REVERB))shared.reverb[key]=await clip(spec,'reverb',key);

  const ts=value=>JSON.stringify(value).replace(/"([a-zA-Z_]\w*)":/g,'$1:');
  const key=id=>/^[a-z]\w*$/i.test(id)?id:`'${id}'`;
  const text=`// Generated by tools/assets/import-weapon-sounds.mjs (npm run assets:weapons:sound). Do not edit by hand.
import type {Surface,WeaponId} from '@bar/shared';
export type MechSound='magOut'|'magIn'|'rack'|'slideRelease'|'boltBack'|'boltForward'|'pumpBack'|'pumpForward'|'leverDown'|'leverUp'|'shellIn'|'cylinderOpen'|'cylinderClose'|'breakOpen'|'breakClose'|'dry'|'hammer'|'select';
/** A weapon's sounds (urls relative to the web root, several takes each to vary): its own shot as its shooter hears it (behind the gun), as others hear it near and far, suppressed (if any part can suppress it), and its mechanics. */
export interface WeaponSoundSet {shot:string[];near:string[];far:string[];suppressed?:string[];suppressedFar?:string[];mech:Partial<Record<MechSound,string[]>>}
// Mono 16-bit WAV. Each clip starts on its first sound. Loudness is balanced per category (the loudest 50 ms, short-term RMS): shot and near
// ${CAT.shot.target} dBFS, far ${CAT.far.target}, suppressed ${CAT.suppressed.target}, suppressed far ${CAT.suppressedFar.target}, mechanics ${CAT.mech.target}, interface ${CAT.ui.target}, impacts ${CAT.impact.target},
// whizzes ${CAT.whiz.target}, casings ${CAT.casing.target}, draw/holster ${CAT.foley.target}; set the mix with gains in the player, not here. The reverbs are
// impulse responses for a ConvolverNode (peak-normalised).
export const WEAPON_SOUNDS:Readonly<Record<WeaponId,WeaponSoundSet>>={
${Object.entries(weaponSounds).map(([id,s])=>`  ${key(id)}:{\n${Object.entries(s).map(([k,v])=>`    ${k}:${ts(v)},`).join('\n')}\n  },`).join('\n')}
};
export const SHARED_SOUNDS:{draw:string[];holster:string[];scopeIn:string[];zoom:string[];fireMode:string[];hit:string[];headshot:string[];kill:string[];
  whiz:string[];casingBrass:string[];casingShell:string[];impact:Readonly<Record<Surface,string[]>>;reverb:{outdoor:string;indoor:string}}={
${Object.entries(shared).map(([k,v])=>`  ${k}:${ts(v)},`).join('\n')}
};
`;
  fs.writeFileSync(metaFile,text);
}finally{await browser.close();}
const total=stats.reduce((s,x)=>s+x.bytes,0);
const byCat={};for(const s of stats){const c=byCat[s.cat]??={n:0,bytes:0,peak:-99,loud:[],seconds:0};c.n++;c.bytes+=s.bytes;c.peak=Math.max(c.peak,s.peak);c.loud.push(s.loud);c.seconds+=s.seconds;}
for(const [cat,c] of Object.entries(byCat))console.log(`${cat.padEnd(14)} ${String(c.n).padStart(3)} clips ${(c.bytes/1024).toFixed(0).padStart(5)} KiB  ${(c.seconds/c.n).toFixed(2)} s each  peak ≤ ${c.peak.toFixed(1)} dBFS  loudest-50ms ${Math.min(...c.loud).toFixed(1)}..${Math.max(...c.loud).toFixed(1)} dBFS`);
console.log(`${stats.length} clips, ${(total/1024/1024).toFixed(2)} MiB. sound-meta.ts escrito.`);
if(process.argv.includes('--list'))for(const s of stats)console.log(`${s.rel.padEnd(42)} ${s.seconds.toFixed(2)}s peak ${s.peak.toFixed(1)} loud ${s.loud.toFixed(1)} rms ${s.rms.toFixed(1)} ← ${s.src}`);
