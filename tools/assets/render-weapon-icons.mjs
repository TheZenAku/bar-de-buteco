// The firearms' pictures for the wheel and the Arsenal (apps/web/public/ui/armas/camadas/<weapon>/<layer>.webp 512x256: a base per look of the weapon and one layer per fitted part, all in one
// frame so the UI stacks them as the weapon is fitted; ui/armas/pecas/<part>.webp 256x256): each model from apps/web/public/armas, side on, lit from above and behind so the flat dark colours read on the violet
// panels, on a transparent background. --sheet <png> draws the check sheet instead: every weapon with its sockets as coloured balls,
// its moving parts at full travel, and every part it takes mounted (docs/assets/armas.md#conferir).
// Drawn with three.js in headless Edge (an offline tool: the game itself never loads three); files are served to the page by
// Playwright's routing, no server is started. usage: node tools/assets/render-weapon-icons.mjs [--sheet out.png]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {chromium} from '@playwright/test';

const root=fileURLToPath(new URL('../../',import.meta.url));
const {WEAPON_MODELS,PART_MODELS}=await import(pathToFileURL(path.join(root,'apps/web/src/weapons/weapon-meta.ts')).href);
const {WEAPONS,PARTS,WHEEL_ORDER}=await import(pathToFileURL(path.join(root,'packages/shared/src/weapons/catalog.ts')).href);
const option=name=>{const at=process.argv.indexOf(name);return at>=0?process.argv[at+1]:null;};
// --only a,b: just those weapons; --cell 900x400: the size of each picture of the sheet.
const sheet=option('--sheet'),only=option('--only')?.split(','),cell=(option('--cell')??'420x190').split('x').map(Number);
const HOST='http://armas.local/';
const types={'.js':'text/javascript','.html':'text/html','.glb':'model/gltf-binary'};

const page$=`<!doctype html><html><head><meta charset="utf-8">
<script type="importmap">{"imports":{"three":"${HOST}three/build/three.module.js","three/addons/":"${HOST}three/examples/jsm/"}}</script></head>
<body style="margin:0;background:#000"><script type="module">
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
const loader=new GLTFLoader(),cache=new Map();
// A real metal (the textured revolver's stainless) shows only what it mirrors: it gets a room to reflect, as the game gives it the sky
// (EnvironmentLighting.dressMetal). The flat packs have no metal, so their pictures do not change.
let room;
const dressMetal=s=>{s.traverse(o=>{if(!o.isMesh)return;for(const m of [].concat(o.material))if(m.metalness>=.5&&!m.envMap){
  room??=new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(),.04).texture;m.envMap=room;m.envMapIntensity=.9;m.needsUpdate=true;}});return s;};
const load=url=>{if(!cache.has(url))cache.set(url,new Promise((ok,ko)=>loader.load('${HOST}public/'+url,g=>ok(dressMetal(g.scene)),undefined,ko)));return cache.get(url).then(s=>{const c=s.clone(true);
  // SkeletonUtils-free clone: re-bind each skinned mesh to the cloned bones by name.
  c.traverse(o=>{if(o.isSkinnedMesh){const bones=o.skeleton.bones.map(b=>c.getObjectByName(b.name));o.bind(new THREE.Skeleton(bones,o.skeleton.boneInverses),o.bindMatrix);}});return c;});};
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
document.body.appendChild(renderer.domElement);
const TURNS=new Set(['hammer','trigger','lever','cylinder','gate','barrels']);
function lights(scene,strong){
  scene.add(new THREE.HemisphereLight(0xdfe4ff,0x30243a,strong?2.4:2.2));
  const key=new THREE.DirectionalLight(0xffffff,strong?3.2:2.4);key.position.set(3,4,1.5);scene.add(key);
  // Rim lights from behind and below, violet and magenta like the panels: they draw the outline of the near-black guns.
  const rim=new THREE.DirectionalLight(0xc9a6ff,strong?3.4:1.2);rim.position.set(-3,1.5,-1);scene.add(rim);
  const rim2=new THREE.DirectionalLight(0xff8ad8,strong?1.6:.6);rim2.position.set(-1,-2,2);scene.add(rim2);
  const fill=new THREE.DirectionalLight(0xffffff,strong?1.2:.8);fill.position.set(4,0,-3);scene.add(fill);
}
/** A weapon (+ parts by slot), posed: moved=true puts every moving part at full travel and the extended magazine on. */
/** The model a weapon is drawn with for these parts: a part may swap in a model of its own (the sawn-off barrels). */
function modelFor(meta,id,parts){const variant=(meta[id].variants??[]).find(v=>Object.values(parts??{}).includes(v.part));return variant?variant.meta:meta[id];}
async function build(id,metaAll,parts,partMeta,moved){
  const model=modelFor(metaAll,id,parts),meta={...metaAll,[id]:model};
  const group=new THREE.Group(),gun=await load(meta[id].url);group.add(gun);
  if(moved){
    for(const [key,b] of Object.entries(meta[id].bones)){const bone=gun.getObjectByName(b.name);if(!bone)throw new Error(id+': no bone '+b.name);
      const axis=new THREE.Vector3(...b.axis).normalize();
      if(TURNS.has(key))bone.quaternion.setFromAxisAngle(axis,b.travel);else if(key!=='mag')bone.position.addScaledVector(axis,b.travel);}
  }
  if((moved||parts?.carregador==='carregador-estendido')&&meta[id].magExtend){const b=gun.getObjectByName(meta[id].bones.mag.name);b.scale.y=meta[id].magExtend.scale;}
  // The magazine part's look (weapon-models.ts applyLooks does the same in the game): optional bones hidden unless shown, the drum in place
  // of the magazine, the DMR's short magazine with the puller moved up to its foot.
  const looks=meta[id].looks;
  if(looks){
    const extended=moved||parts?.carregador==='carregador-estendido',rapid=parts?.carregador==='carregador-rapido';
    const shown=new Set([...(extended?looks.extended?.show??[]:[]),...(rapid?looks.rapid?.show??[]:[])]);
    const hide=name=>{const b=gun.getObjectByName(name);if(b)b.scale.setScalar(1e-3);};
    for(const name of looks.optional??[])if(!shown.has(name))hide(name);
    if(extended)for(const name of looks.extended?.hide??[])hide(name);
    const scale=!extended&&looks.standard?.magScale;
    if(scale){gun.getObjectByName(meta[id].bones.mag.name).scale.y=scale;const pull=gun.getObjectByName('MagPull');if(pull)pull.position.y+=looks.mag.length*(1-scale);}
  }
  for(const [slot,part] of Object.entries(parts)){const m=meta[id].mounts[slot];if(!m||!partMeta[part])continue;
    const p=await load(partMeta[part].url);p.position.set(...m.p);p.quaternion.set(...m.q);group.add(p);}
  return group;
}
function ball(group,p,colour,r=.006){const m=new THREE.Mesh(new THREE.SphereGeometry(r,12,8),new THREE.MeshBasicMaterial({color:colour,depthTest:false}));m.position.set(...p);m.renderOrder=9;group.add(m);}
function shoot(object,w,h,{margin=.06,bg=null,strong=false,from=[1,0,0],frame=null}={}){
  const scene=new THREE.Scene();if(bg!==null)scene.background=new THREE.Color(bg);lights(scene,strong);scene.add(object);
  object.updateMatrixWorld(true);
  // frame: a box to frame instead of the object's own (the layers of one weapon share one, so they line up when stacked).
  const box=frame?frame.clone():new THREE.Box3().setFromObject(object);
  const size=box.getSize(new THREE.Vector3()),c=box.getCenter(new THREE.Vector3());
  const span=Math.max(size.z/(w/h),size.y)*(1+margin*2)/2;
  const cam=new THREE.OrthographicCamera(-span*w/h,span*w/h,span,-span,.01,20);
  cam.position.set(c.x+from[0]*3,c.y+from[1]*3,c.z+from[2]*3);cam.lookAt(c);
  renderer.setSize(w,h,false);renderer.setClearColor(0x000000,0);renderer.render(scene,cam);
  return {url:renderer.domElement.toDataURL('image/png'),span:span*2*w/h};
}
// Downscale a render to the final size in a 2D canvas (supersampled edges), WebP with alpha.
async function webp(url,w,h){
  const img=new Image();img.src=url;await img.decode();
  const out=document.createElement('canvas');out.width=w/2;out.height=h/2;const ctx=out.getContext('2d');ctx.imageSmoothingQuality='high';ctx.drawImage(img,0,0,w/2,h/2);
  return out.toDataURL('image/webp',.9);
}
/** The layers the Arsenal and the wheel stack to draw a weapon as it is fitted (apps/web/src/weapons/ui/art.ts weaponPicture): a base picture per
 *  look of the weapon itself (bare, each magazine, the swapped-in model) and one picture per part that has a model and a mount, all in the same frame. */
window.layers=async(id,meta,partMeta,slots)=>{
  const bases=[['base',{}],...(slots.carregador??[]).map(part=>[part,{carregador:part}]),...(meta[id].variants??[]).map(v=>[v.part,{boca:v.part}])];
  const overlays=['mira','boca','trilho'].flatMap(slot=>(slots[slot]??[]).filter(part=>partMeta[part]&&meta[id].mounts[slot]).map(part=>[part,slot]));
  const partOnly=async(part,slot)=>{const group=new THREE.Group(),m=meta[id].mounts[slot],p=await load(partMeta[part].url);p.position.set(...m.p);p.quaternion.set(...m.q);group.add(p);return group;};
  const frame=new THREE.Box3();
  for(const [,parts] of bases){const g=await build(id,meta,parts,partMeta,false);g.updateMatrixWorld(true);frame.union(new THREE.Box3().setFromObject(g));}
  for(const [part,slot] of overlays){const g=await partOnly(part,slot);g.updateMatrixWorld(true);frame.union(new THREE.Box3().setFromObject(g));}
  const out={},w=1024,h=512,look={margin:.05,strong:true,from:[1,.08,0],frame};
  // A swapped-in model takes no layers (no mounts), so it is framed on its own: the sawn-off would be a speck in the whole gun's frame.
  const swapped=new Set((meta[id].variants??[]).map(v=>v.part));
  for(const [name,parts] of bases)out[name]=await webp(shoot(await build(id,meta,parts,partMeta,false),w,h,swapped.has(name)?{...look,frame:null}:look).url,w,h);
  for(const [part,slot] of overlays)out[part]=await webp(shoot(await partOnly(part,slot),w,h,look).url,w,h);
  return out;
};
window.icon=async(kind,id,meta,partMeta,parts)=>{
  // 'variant': a part that is a model of its own (the sawn-off barrels), drawn as the weapon it makes, in a part's square picture.
  const object=kind==='part'?await load(partMeta[id].url):await build(id,meta,parts||{},partMeta,false);
  if(kind!=='weapon'){object.rotation.y=-.5;object.rotation.x=.12;}
  const w=kind==='weapon'?1024:512,h=kind==='weapon'?512:512;
  const {url}=shoot(object,w,h,{margin:kind==='weapon'?.05:.12,strong:true,from:kind==='weapon'?[1,.08,0]:[1,.25,0]});
  // Downscale to the final size in a 2D canvas (supersampled edges), WebP with alpha.
  const img=new Image();img.src=url;await img.decode();
  const out=document.createElement('canvas');out.width=w/2;out.height=h/2;const ctx=out.getContext('2d');ctx.imageSmoothingQuality='high';ctx.drawImage(img,0,0,w/2,h/2);
  return out.toDataURL('image/webp',.9);
};
window.sheet=async(meta,partMeta,configs,[CW,CH])=>{
  const cols=Math.max(...configs.map(r=>r.cells.length));
  const out=document.createElement('canvas');out.width=CW*cols;out.height=CH*configs.length;const ctx=out.getContext('2d');
  ctx.fillStyle='#22202a';ctx.fillRect(0,0,out.width,out.height);ctx.font='12px sans-serif';
  for(const [row,{id,cells}] of configs.entries())for(const [col,cell] of cells.entries()){
    const group=await build(id,meta,cell.parts,partMeta,cell.moved);
    if(cell.sockets){const m=modelFor(meta,id,cell.parts);
      const pts={grip:[m.grip,0xff2020],trigger:[m.trigger,0xffee00],support:[m.support,0x20ff40],muzzle:[m.muzzle,0xff8a00],eject:[m.eject,0x00e5ff],sight:[m.sight,0xff30ff],stock:[m.stock,0x3060ff]};
      for(const [p,c] of Object.values(pts))if(p)ball(group,p,c);
      for(const mt of Object.values(m.mounts))ball(group,mt.p,0xffffff,.004);
      const gun=group.children[0];for(const b of Object.values(m.bones)){const bone=gun.getObjectByName(b.name);const wp=bone.getWorldPosition(new THREE.Vector3());ball(group,wp.toArray(),0x8a5cff,.0035);}}
    if(cell.parts)for(const [slot,part] of Object.entries(cell.parts)){const pm=partMeta[part],mt=meta[id].mounts[slot];if(!pm||!mt)continue;
      for(const k of ['eye','beam','muzzle'])if(pm[k])ball(group,[pm[k][0]+mt.p[0],pm[k][1]+mt.p[1],pm[k][2]+mt.p[2]],k==='eye'?0xff30ff:k==='beam'?0xff0000:0xff8a00,.0035);
      if(pm.lens)ball(group,[pm.lens.p[0]+mt.p[0],pm.lens.p[1]+mt.p[1],pm.lens.p[2]+mt.p[2]],0x00ffaa,.003);}
    const {url,span}=shoot(group,CW,CH,{bg:0x8a8f96,from:cell.from||[1,0,0]});
    const img=new Image();img.src=url;await img.decode();ctx.drawImage(img,col*CW,row*CH);
    ctx.fillStyle='#000';ctx.fillText(id+' · '+cell.label+' · largura '+span.toFixed(2)+' m',col*CW+6,row*CH+14);
    ctx.strokeStyle='#22202a';ctx.strokeRect(col*CW,row*CH,CW,CH);
  }
  return out.toDataURL('image/png');
};
window.ready=true;
</script></body></html>`;

const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'msedge':undefined),args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
  const page=await browser.newPage({viewport:{width:400,height:300}});
  page.on('pageerror',error=>console.error(error));
  page.on('console',message=>{if(message.type()==='error')console.error(message.text());});
  await page.route(`${HOST}**`,route=>{
    const url=new URL(route.request().url()),rel=decodeURIComponent(url.pathname.slice(1));
    if(rel==='')return route.fulfill({contentType:'text/html',body:page$});
    const [first,...rest]=rel.split('/'),base=first==='three'?path.join(root,'node_modules/three'):first==='public'?path.join(root,'apps/web/public'):null;
    const file=base&&path.join(base,...rest);
    if(!file||!file.startsWith(base)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
    return route.fulfill({contentType:types[path.extname(file)]??'application/octet-stream',body:fs.readFileSync(file)});
  });
  await page.goto(HOST);
  await page.waitForFunction(()=>window.ready,undefined,{timeout:60_000});
  const meta=JSON.parse(JSON.stringify(WEAPON_MODELS)),partMeta=JSON.parse(JSON.stringify(PART_MODELS));
  if(sheet){
    // Per weapon: its sockets, its moving parts at full travel, then the n-th part of every slot together.
    const configs=WHEEL_ORDER.filter(id=>!only||only.includes(id)).map(id=>{
      const slots=WEAPONS[id].slots,n=Math.max(0,...Object.values(slots).map(list=>list.length)),cells=[
        {label:'pontos',sockets:true,parts:{}},{label:'peças móveis no fim',moved:true,parts:{}}];
      for(let i=0;i<n;i++){const parts={};for(const [slot,list] of Object.entries(slots))if(list.length)parts[slot]=list[Math.min(i,list.length-1)];
        cells.push({label:Object.values(parts).filter(p=>PART_MODELS[p]).join(' + ')||Object.values(parts).join(' + '),parts});}
      // A model swapped in by a part (the sawn-off): its sockets too.
      for(const variant of WEAPON_MODELS[id].variants??[])cells.push({label:`${variant.part} · pontos`,sockets:true,parts:{boca:variant.part}});
      return {id,cells};
    });
    const url=await page.evaluate(([meta,partMeta,configs,cell])=>window.sheet(meta,partMeta,configs,cell),[meta,partMeta,configs,cell]);
    fs.writeFileSync(sheet,Buffer.from(url.split(',')[1],'base64'));console.log('folha:',sheet);
  }else{
    const dir=path.join(root,'apps/web/public/ui/armas');fs.mkdirSync(path.join(dir,'pecas'),{recursive:true});
    const layers=path.join(dir,'camadas');
    // Weapon by weapon, never the whole folder at once: on the share (Z:) a folder the dev server watches can stay "delete pending" for
    // minutes, and removing camadas/ in one go left the wheel with no pictures (2026-11-13). Old layers a weapon no longer has are removed.
    let failed=0;
    for(const id of WHEEL_ORDER){
      const pictures=await page.evaluate(([id,meta,partMeta,slots])=>window.layers(id,meta,partMeta,slots),[id,meta,partMeta,WEAPONS[id].slots]);
      const folder=path.join(layers,id);
      try{
        fs.mkdirSync(folder,{recursive:true});
        for(const [name,url] of Object.entries(pictures))fs.writeFileSync(path.join(folder,`${name}.webp`),Buffer.from(url.split(',')[1],'base64'));
        for(const file of fs.readdirSync(folder))if(!(file.replace(/\.webp$/,'') in pictures))fs.rmSync(path.join(folder,file),{force:true});
        console.log(`camadas/${id}: ${Object.keys(pictures).join(', ')}`);
      }catch(error){failed++;console.error(`camadas/${id}: não gravou (${error.code??error.message}); rode de novo quando a pasta liberar`);}
    }
    if(failed)process.exitCode=1;
    for(const id of Object.keys(PART_MODELS)){
      const url=await page.evaluate(([id,meta,partMeta])=>window.icon('part',id,meta,partMeta),[id,meta,partMeta]);
      const file=path.join(dir,'pecas',`${id}.webp`);fs.writeFileSync(file,Buffer.from(url.split(',')[1],'base64'));console.log(`pecas/${id}.webp ${(fs.statSync(file).size/1024).toFixed(0)} KiB`);
    }
    for(const id of WHEEL_ORDER)for(const variant of WEAPON_MODELS[id].variants??[]){
      const url=await page.evaluate(([id,meta,partMeta,parts])=>window.icon('variant',id,meta,partMeta,parts),[id,meta,partMeta,{boca:variant.part}]);
      const file=path.join(dir,'pecas',`${variant.part}.webp`);fs.writeFileSync(file,Buffer.from(url.split(',')[1],'base64'));console.log(`pecas/${variant.part}.webp ${(fs.statSync(file).size/1024).toFixed(0)} KiB`);
    }
  }
}finally{await browser.close();}
