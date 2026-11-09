// Imports the firearms (docs/assets/armas.md, docs/sistemas/armas.md) from the CC0 packs kept zipped in assets-bar/armas/fontes:
// every weapon as one skinned mesh (its moving parts are bones) in weapon space (metres, +Y up, the barrel towards -Z, +X right,
// the ORIGIN AT THE GRIP), every part (equipamento) in the same orientation with its origin at its mount point, and the generated
// apps/web/src/weapons/weapon-meta.ts with the hand points, sockets, mounts and bones the client poses them by.
// Offline only: npm run assets:weapons (then npm run assets:weapons:icons for the thumbnails).
//
// Why it is shaped so:
// - One material per model (the flat packs are flat colours: they become vertex colours), so a gun is one draw call; an optic's
//   glass is a second, see-through one.
// - Every bone rests with NO rotation in weapon space, at its pivot: a part's axis in weapon space is also its bone's local axis, so
//   the client turns or slides a bone by its axis without converting anything. The skin's inverse bind matrices hold the rest.
// - Bones the client never moves are folded into Body (one bone fewer to animate, same look).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Box3,Matrix3,Matrix4,Quaternion,Texture,TextureLoader,Vector3} from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {readZip} from './lib/zip-read.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const sources=path.join(root,'assets-bar/armas/fontes');
const outModels=path.join(root,'apps/web/public/armas/modelos'),outParts=path.join(root,'apps/web/public/armas/pecas');
const metaFile=path.join(root,'apps/web/src/weapons/weapon-meta.ts');
TextureLoader.prototype.load=()=>new Texture();
globalThis.window??={URL:{createObjectURL:()=>''}};
const warn=console.warn;console.warn=()=>{};

const PACKS={
  west:'flat_guns_west.zip',east:'flat_guns_east.zip',attach:'flat_attachments.zip',anker:'Low_Poly_Wild_West_Guns.zip',
};
const zips={};
const pack=name=>zips[name]??=readZip(path.join(sources,PACKS[name]));

// ---------------------------------------------------------------------------------------------------------------------------
// The weapons. `bones` maps a source bone to the name it keeps (any other is folded into Body); `moves` are the meta's moving parts
// (axis in weapon space; travel in metres for slides, bolts, handles, pumps and magazines, in radians for whatever turns).
// `points` overrides or completes what is measured (weapon space, before the grip is moved to the origin: `src` space scaled to metres).
// ---------------------------------------------------------------------------------------------------------------------------
const X=[1,0,0],NX=[-1,0,0],Z=[0,0,1],DOWN=[0,-1,0];
const FLAT_KEEP={Slide:'Slide',Hammer:'Hammer',Trigger:'Trigger',Magazine:'Magazine',Bolt:'Bolt',Charging_Handle:'ChargingHandle',Pump:'Pump',
  Selector:'Selector',Dust_Cover:'DustCover',Shell:'Shell',Lifter:'Lifter'};
const WEAPONS=[
  {id:'pistola',pack:'west',file:'GLB/Pistol_Full_West.glb',bones:FLAT_KEEP,
    moves:{slide:['Slide',Z,.026],hammer:['Hammer',X,.75],trigger:['Trigger',NX,.3],mag:['Magazine','axis',.13]},
    mounts:{mira:'Attach_Scope',boca:'Attach_Muzzle',trilho:'Attach_RailBottom',carregador:'mag'},magExtend:1.5,
    grip:{below:.035},support:'pistol',eject:{bone:'Slide',dz:-.02}},
  {id:'revolver',pack:'anker',file:'Rigged/Colt Revolver.fbx',scale:.01,
    bones:{Bone001:'Trigger',Bone002:'Hammer',Bone003:'Cylinder',Bone004:'Gate'},
    moves:{hammer:['Hammer',X,.6],trigger:['Trigger',NX,.35],cylinder:['Cylinder',Z,Math.PI/3],gate:['Gate',Z,-1.4]},
    pivotAtCentre:['Cylinder'],
    mounts:{carregador:'cylinder'},grip:{below:.022,behind:.03},support:null,eject:null},
  {id:'submetralhadora',pack:'west',file:'GLB/SMG_Compact_West.glb',bones:FLAT_KEEP,
    moves:{bolt:['Bolt',Z,.045],charging:['ChargingHandle',Z,.05],trigger:['Trigger',NX,.3],mag:['Magazine','axis',.2]},
    mounts:{mira:'Attach_Scope',boca:'Attach_Muzzle',trilho:'Attach_RailBottom',carregador:'mag'},magExtend:1.45,puller:true,
    grip:{below:.04,magInside:true},support:{reach:.17},eject:{bone:'Bolt',dz:-.01}},
  {id:'fuzil',pack:'west',file:'GLB/Rifle_Assault_West.glb',bones:FLAT_KEEP,
    moves:{bolt:['Bolt',Z,.07],charging:['ChargingHandle',Z,.06],trigger:['Trigger',NX,.3],mag:['Magazine','axis',.22]},
    mounts:{mira:'Attach_Scope',boca:'Attach_Muzzle',trilho:'Attach_RailBottom',carregador:'mag'},drum:'twin',puller:true,
    grip:{below:.038},support:{reach:.3},eject:{bone:'Bolt',dz:.0}},
  {id:'fuzil-ak',pack:'east',file:'GLB/Rifle_Assault_East.glb',bones:FLAT_KEEP,
    moves:{bolt:['Bolt',Z,.08],trigger:['Trigger',NX,.3],mag:['Magazine','axis',.22]},
    mounts:{mira:'Attach_Scope',boca:'Attach_Muzzle',trilho:'Attach_RailBottom',carregador:'mag'},drum:'single',puller:true,
    grip:{below:.038},support:{reach:.3},eject:{bone:'Bolt',dz:.0}},
  {id:'dmr',pack:'west',file:'GLB/Rifle_Battle_West.glb',bones:FLAT_KEEP,
    moves:{bolt:['Bolt',Z,.08],charging:['ChargingHandle',Z,.08],trigger:['Trigger',NX,.3],mag:['Magazine','axis',.18]},
    mounts:{mira:'Attach_Scope',boca:'Attach_Muzzle',trilho:'Attach_RailBottom',carregador:'mag'},magShort:.5,puller:true,
    grip:{below:.038},support:{reach:.33},eject:{bone:'Bolt',dz:.0}},
  {id:'escopeta',pack:'east',file:'GLB/Shotgun_Pump_East.glb',bones:FLAT_KEEP,
    moves:{pump:['Pump',Z,.085],bolt:['Bolt',Z,.07],trigger:['Trigger',NX,.3]},
    mounts:{mira:'Attach_Scope',trilho:'tube',carregador:'tube'},
    // The magazine tube ends just past the pump; the extended magazine is the whole tube, to the muzzle (the owner's marking, 2026-11-09).
    tube:{below:.0155,cut:'pump'},
    grip:{wrist:true},support:{bone:'Pump'},eject:{bone:'Shell',dz:0}},
  {id:'cano-duplo',pack:'anker',file:'Rigged/Double Barrel Shotgun.fbx',scale:.01,length:1.0,
    bones:{Bone001:'Trigger',Bone002:'Hammer',Bone003:'Hammer',Bone004:'Barrels'},
    moves:{barrels:['Barrels',NX,.62],hammer:['Hammer',X,.55],trigger:['Trigger',NX,.3]},
    mounts:{},grip:{wrist:true},support:{reach:.34},eject:null,
    // Canos serrados: the pack's sawn-off of the same gun, at the same scale (the long one is 1.0 m from 1.349 m).
    variants:[{part:'canos-serrados',model:'cano-duplo-serrado',file:'Rigged/Sawn-Off Shotgun.fbx',size:1/1.349,support:{reach:.2}}]},
  {id:'carabina',pack:'anker',file:'Rigged/Repeater.fbx',scale:.01,length:.99,
    bones:{Bone001:'Trigger',Bone002:'Lever',Bone003:'Hammer'},
    moves:{lever:['Lever',X,.95],hammer:['Hammer',X,.6],trigger:['Trigger',NX,.3]},
    mounts:{mira:'receiver'},grip:{wrist:true},support:{reach:.34},eject:'top',
    // Six rounds in a tube that ends past the fore-end; the extended magazine is the full tube, to the muzzle (ten).
    tube:{below:.0516,cut:'wood'}},
  // A real bolt action (the owner asked, 2026-11-09): the Anker rifle, 1.12 m; its bolt and cocking piece are one bone (they travel together).
  {id:'precisao',pack:'anker',file:'Rigged/Bolt Action Rfile.fbx',scale:.01,length:1.12,
    bones:{Bone001:'Trigger',Bone003:'Bolt',Bone004:'Bolt'},
    moves:{bolt:['Bolt',Z,.085],trigger:['Trigger',NX,.3]},
    mounts:{mira:'bolt',boca:'muzzle'},grip:{wrist:true},support:{reach:.38},eject:{bone:'Bolt',dz:-.02}},
];
// The parts. `flip`: turned upside down about the barrel's axis (the laser is modelled to sit on top of a rail; ours hang under).
const PARTS=[
  {id:'reflex',file:'GLB/Reflex_West.glb',optic:true},
  {id:'red-dot',file:'GLB/RedDot_West.glb',optic:true},
  {id:'holografica',file:'GLB/Holographic_West.glb',optic:true},
  {id:'acog',file:'GLB/Magnified_West.glb',optic:true,scope:true},
  {id:'luneta',file:'GLB/Scope_West.glb',optic:true,scope:true},
  {id:'silenciador',file:'GLB/Suppressor_West.glb',muzzle:true},
  {id:'compensador',build:'compensator',muzzle:true},
  {id:'empunhadura',file:'GLB/Foregrip_West.glb'},
  {id:'empunhadura-angulada',file:'GLB/Foregrip_East.glb'},
  {id:'laser',file:'GLB/Laser_West.glb',beam:true,flip:true},
  // The pack's light is drawn at twice its size (a node scale of 2): at 0.65 it is a real weapon light, ~9 cm long.
  {id:'lanterna',file:'GLB/Flashlight_West.glb',beam:true,scale:.65},
];

// ---------------------------------------------------------------------------------------------------------------------------
// Loading: every source becomes triangles in metres (+Y up, the barrel towards -Z) with a colour and one bone per vertex
// (the packs are rigid: each vertex follows exactly one bone), plus the bones' and joints' rest positions.
// ---------------------------------------------------------------------------------------------------------------------------
async function loadSource(packName,file){
  const bytes=pack(packName).read(file),buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  if(file.endsWith('.fbx'))return new FBXLoader().parse(buffer,'');
  const gltf=await new Promise((ok,ko)=>new GLTFLoader().parse(buffer,'',ok,ko));
  return gltf.scene;
}
/** Triangles (positions, normals, linear colours, glass flag, bone name) and the bones' world positions/rotations. */
function collect(object){
  object.updateMatrixWorld(true);
  const verts=[],bones=new Map(),v=new Vector3(),n=new Vector3(),normalMatrix=new Matrix3();
  object.traverse(node=>{if(node.isBone)bones.set(node.name,{p:node.getWorldPosition(new Vector3()),q:node.getWorldQuaternion(new Quaternion())});});
  object.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const g=mesh.geometry,pos=g.attributes.position,nor=g.attributes.normal,materials=[].concat(mesh.material);
    normalMatrix.getNormalMatrix(mesh.matrixWorld);
    const index=g.index?Array.from(g.index.array):Array.from({length:pos.count},(_,i)=>i);
    const groups=g.groups.length?g.groups:[{start:0,count:index.length,materialIndex:0}];
    for(const group of groups){
      const material=materials[group.materialIndex??0],glass=/glass/i.test(material.name)||material.transparent;
      const colour=material.color.toArray();
      for(let k=group.start;k<group.start+group.count;k++){
        const i=index[k];
        if(mesh.isSkinnedMesh)mesh.getVertexPosition(i,v);else v.fromBufferAttribute(pos,i);
        v.applyMatrix4(mesh.matrixWorld);
        n.fromBufferAttribute(nor,i).applyMatrix3(normalMatrix).normalize();
        let bone=null;
        if(mesh.isSkinnedMesh){
          const si=g.attributes.skinIndex,sw=g.attributes.skinWeight;let best=-1,weight=-1;
          for(let c=0;c<4;c++)if(sw.getComponent(i,c)>weight){weight=sw.getComponent(i,c);best=si.getComponent(i,c);}
          bone=mesh.skeleton.bones[best].name;
        }
        verts.push({p:v.toArray(),n:n.toArray(),c:colour,glass,bone});
      }
    }
  });
  return {verts,bones};
}
const transformAll=(src,matrix)=>{
  const rot=new Matrix3().getNormalMatrix(matrix),v=new Vector3();
  for(const vert of src.verts){vert.p=v.fromArray(vert.p).applyMatrix4(matrix).toArray();vert.n=v.fromArray(vert.n).applyMatrix3(rot).normalize().toArray();}
  for(const bone of src.bones.values())bone.p.applyMatrix4(matrix);
};
const boxOf=verts=>{const box=new Box3();for(const v of verts)box.expandByPoint(new Vector3().fromArray(v.p));return box;};

// ---------------------------------------------------------------------------------------------------------------------------
// Measuring.
// ---------------------------------------------------------------------------------------------------------------------------
/** Box of the vertices inside a slab (axis 0/1/2 between lo and hi), optionally filtered. */
function slab(verts,axis,lo,hi,filter=()=>true){const box=new Box3();for(const v of verts)if(v.p[axis]>=lo&&v.p[axis]<=hi&&filter(v))box.expandByPoint(new Vector3().fromArray(v.p));return box;}
/**
 * Box of where the triangles cut the plane (axis 0/1/2 = value), optionally filtered by the cut point and the triangle's bone: a low-poly
 * grip is a long prism with no vertex halfway, so sections are taken on the surfaces, not on the vertices.
 */
function section(verts,axis,value,filter=()=>true){
  const box=new Box3(),p=new Vector3();
  for(let t=0;t<verts.length;t+=3)for(let e=0;e<3;e++){
    const a=verts[t+e].p,b=verts[t+(e+1)%3].p,da=a[axis]-value,db=b[axis]-value;
    if(da*db>0||da===db)continue;
    const k=da/(da-db);p.set(a[0]+(b[0]-a[0])*k,a[1]+(b[1]-a[1])*k,a[2]+(b[2]-a[2])*k);
    if(filter(p,verts[t].bone))box.expandByPoint(p);
  }
  return box;
}
const centre=box=>box.getCenter(new Vector3());
const r4=x=>Math.round(x*1e4)/1e4||0;
const vec=v=>[r4(v.x??v[0]),r4(v.y??v[1]),r4(v.z??v[2])];

async function importWeapon(def){
  const src=collect(await loadSource(def.pack,def.file));
  // Bones made here (a tube's front, a drum, a puller): their pivots, set while measuring.
  const pivotsLate={};
  // Metres; the Anker guns are centimetres and not centred on X (their root bone sits on the centre line).
  const scale=def.scale??1;
  let matrix=new Matrix4().makeScale(scale,scale,scale);transformAll(src,matrix);
  if(def.pack==='anker'){const rootBone=src.bones.get('Bone');transformAll(src,new Matrix4().makeTranslation(-rootBone.p.x,0,0));}
  if(def.length){const box=boxOf(src.verts),k=def.length/(box.max.z-box.min.z);transformAll(src,new Matrix4().makeScale(k,k,k));}
  if(def.size)transformAll(src,new Matrix4().makeScale(def.size,def.size,def.size));
  const all=src.verts,box=boxOf(all);
  const boneVerts=name=>all.filter(v=>(def.bones[v.bone]??'Body')===name);
  const srcBone=name=>{for(const [from,to] of Object.entries(def.bones))if(to===name&&src.bones.has(from))return src.bones.get(from);return null;};
  const joint=name=>src.bones.get(name)?.p.clone();
  // The bore: the muzzle joint, or the front of the barrel(s).
  let muzzle;
  if(src.bones.has('Attach_Muzzle'))muzzle=joint('Attach_Muzzle');
  const front=slab(all,2,box.min.z,box.min.z+.02);
  if(!muzzle)muzzle=new Vector3(0,centre(front).y,box.min.z);
  // The tip: the frontmost vertex near the bore line.
  const tipBox=slab(all,2,box.min.z,muzzle.z+.06,v=>Math.abs(v.p[1]-muzzle.y)<.012&&Math.abs(v.p[0])<.02);
  const muzzleTip=new Vector3(0,muzzle.y,Math.min(tipBox.min.z,muzzle.z));
  // The trigger: centre of the trigger blade.
  const trigger=centre(boxOf(boneVerts('Trigger')));
  // The grip: on a pistol grip, the centre of its section a hand's width below the trigger; on a stock, the wrist behind the guard.
  let grip;
  const guard=boxOf(boneVerts('Trigger'));
  if(def.grip.wrist){
    // The wrist of the stock: the slimmest section in the 4-14 cm behind the trigger.
    let best=null;
    for(let z=trigger.z+.04;z<=trigger.z+.14;z+=.005){
      const s=section(all,2,z,p=>p.y<trigger.y+.05);
      if(s.isEmpty())continue;
      const h=s.max.y-s.min.y;if(!best||h<best.h)best={h,z,y:(s.max.y+s.min.y)/2};
    }
    grip=new Vector3(0,best.y,best.z);
  }else{
    const y=trigger.y-(def.grip.below??.04);
    const s=section(all,1,y,(p,bone)=>p.z>trigger.z+(def.grip.behind??0)&&p.z<trigger.z+.12&&(def.id==='pistola'||def.grip.magInside||(def.bones[bone]??'Body')!=='Magazine'));
    if(s.isEmpty())throw new Error(`${def.id}: nada na altura da empunhadura (gatilho ${vec(trigger)}, guarda ${vec(guard.min)})`);
    grip=new Vector3(0,y,(s.min.z+s.max.z)/2);
  }
  const shift=new Vector3(-grip.x,-grip.y,-grip.z);
  const at=p=>p.clone().add(shift);
  // Sight line: the top of the front sight (or of the barrel's front), straight back to the rear of the receiver.
  const frontTop=slab(all,2,box.min.z,box.min.z+(box.max.z-box.min.z)*.25,v=>Math.abs(v.p[0])<.006);
  const rearSight=src.bones.get('Rear_Sights')?.p,frontSight=src.bones.get('Front_Sights')?.p;
  let sightY=frontTop.max.y;
  if(frontSight){const fs=section(all,2,frontSight.z,p=>Math.abs(p.x)<.006);sightY=fs.max.y;}
  const sightZ=rearSight?rearSight.z:def.id==='pistola'?box.max.z-.01:def.id==='revolver'?srcBone('Hammer').p.z:trigger.z+.03;
  const sight=new Vector3(0,sightY,sightZ);
  // The butt: the centre of the rearmost 1.5 cm.
  let stock=null;
  if(def.id!=='pistola'&&def.id!=='revolver'){const butt=section(all,2,box.max.z-.01);stock=new Vector3(0,(butt.min.y+butt.max.y)/2,box.max.z);}
  // The left hand.
  let support=null;
  if(def.support==='pistol')support=grip.clone().add(new Vector3(-.03,-.012,.004));
  else if(def.support?.bone){support=centre(boxOf(boneVerts(def.support.bone)));support.x=0;}
  else if(def.support?.reach){const z=grip.z-def.support.reach,s=section(all,2,z,p=>p.y<muzzle.y+.03&&Math.abs(p.x)<.05);support=new Vector3(0,(s.min.y+s.max.y)/2,z);}
  // The ejection port: the right side of the receiver at the bolt.
  let eject=null;
  if(def.eject==='top'){const hammer=srcBone('Hammer')?.p??trigger;const s=section(all,2,hammer.z-.05,p=>Math.abs(p.x)<.02);eject=new Vector3(0,s.max.y,hammer.z-.05);}
  else if(def.eject){const bb=boxOf(boneVerts(def.eject.bone));
    const z=centre(bb).z+def.eject.dz,y=centre(bb).y;
    const s=section(all,2,z,p=>Math.abs(p.y-y)<.02);eject=new Vector3(s.max.x,y,z);}
  // Mounts.
  const mounts={};
  for(const [slot,where] of Object.entries(def.mounts)){
    let p;
    if(where==='mag'){const mv=boneVerts('Magazine');p=magTop(mv);}
    else if(where==='cylinder')p=centre(boxOf(boneVerts('Cylinder')));
    else if(where==='tube'){
      // Under the barrel, at the front of the magazine tube (ahead of the pump's travel).
      const pump=boxOf(boneVerts('Pump')),s=section(all,2,pump.min.z-.025,p=>p.y<muzzle.y);
      p=new Vector3(0,s.min.y,pump.min.z-.025);
    }else if(where==='muzzle'){
      p=muzzleTip.clone();
    }else if(where==='bolt'){
      // Over the bolt's front half, on top of the receiver (the handle, out to the right, left out).
      const bb=boxOf(boneVerts('Bolt')),z=bb.min.z+(bb.max.z-bb.min.z)*.3,s=section(all,2,z,p=>Math.abs(p.x)<.015);
      p=new Vector3(0,s.max.y,z);
    }else if(where==='receiver'){
      // On top of the receiver, over the hammer's front.
      const hammer=srcBone('Hammer').p,s=section(all,2,hammer.z-.065,p=>Math.abs(p.x)<.02);
      p=new Vector3(0,s.max.y,hammer.z-.065);
    }else{p=joint(where);if(!p)throw new Error(`${def.id}: sem a junta ${where}`);}
    if(slot==='trilho'&&where==='Attach_RailBottom'&&def.support?.reach)p.z=support.z;
    mounts[slot]={p:vec(at(p)),q:[0,0,0,1]};
  }
  // Bones: Body at the origin, every kept bone at its pivot, no rotation.
  const kept=[...new Set(Object.values(def.bones))].filter(name=>all.some(v=>def.bones[v.bone]===name));
  const pivots={Body:new Vector3()};
  for(const name of kept){
    let p=srcBone(name)?.p.clone();
    if(name==='Magazine')p=magTop(boneVerts('Magazine'));
    if(def.pivotAtCentre?.includes(name)){const c=centre(boxOf(boneVerts(name)));p=new Vector3(c.x,c.y,p.z);}
    if(name==='Hammer'&&def.id==='cano-duplo')p.x=0;
    pivots[name]=at(p);
  }
  const bones={};
  for(const [key,[name,axis,travel]] of Object.entries(def.moves)){
    if(!pivots[name])throw new Error(`${def.id}: osso ${name} não ficou`);
    let a=axis;
    if(axis==='axis'){const q=srcBone(name).q,y=new Vector3(0,1,0).applyQuaternion(q);if(y.y>0)y.negate();a=vec(y.normalize());}
    bones[key]={name,axis:a,travel:r4(travel)};
  }
  let magExtend;
  if(def.magExtend){magExtend={axis:[0,-1,0],scale:def.magExtend,shift:[0,0,0]};}
  for(const v of all)v.p=at(new Vector3().fromArray(v.p)).toArray();
  // The looks a magazine part gives (weapon space from here on).
  const looks={},extra=[];
  if(def.tube){
    let cut;
    if(def.tube.cut==='pump'){cut=boxOf(all.filter(v=>v.bone&&(def.bones[v.bone]??'Body')==='Pump')).min.z-.035;}
    else{const wood=all.filter(v=>v.c[0]>v.c[1]*2&&v.c[0]>.03&&v.p[2]<-.1);cut=boxOf(wood).min.z-.03;}
    const tube=cutTube(all,def,cut,def.tube.below);
    all.length=0;all.push(...tube.verts);
    looks.optional=['TubeLong'];looks.extended={show:['TubeLong']};
    pivotsLate.TubeLong=new Vector3(0,tube.centre.y,cut);
  }
  const magVerts=all.filter(v=>(def.bones[v.bone]??'Body')==='Magazine');
  if(magVerts.length&&(def.drum||def.puller||def.magShort)){
    const mtop=magTopW(magVerts),length=mtop.y-boxOf(magVerts).min.y;
    looks.mag={length:r4(length)};
    if(def.drum){const d=drum(def.drum,mtop,magVerts);extra.push(...d);pivotsLate.MagDrum=mtop.clone();
      looks.optional=[...(looks.optional??[]),'MagDrum'];looks.extended={show:['MagDrum'],hide:['Magazine']};looks.followers=[...(looks.followers??[]),'MagDrum'];}
    if(def.puller){const pl=puller(magVerts);extra.push(...pl);pivotsLate.MagPull=mtop.clone();
      looks.optional=[...(looks.optional??[]),'MagPull'];looks.rapid={show:['MagPull']};looks.followers=[...(looks.followers??[]),'MagPull'];}
    if(def.magShort)looks.standard={magScale:def.magShort};
  }
  all.push(...extra);
  const finalBox=boxOf(all);
  const meta={id:def.id,url:`armas/modelos/${def.model??def.id}.glb`,length:r4(finalBox.max.z-finalBox.min.z),
    grip:[0,0,0],trigger:vec(at(trigger)),support:support&&vec(at(support)),muzzle:vec(at(muzzleTip)),eject:eject&&vec(at(eject)),sight:vec(at(sight)),stock:stock&&vec(at(stock)),
    mounts,bones,...magExtend?{magExtend}:{},...Object.keys(looks).length?{looks}:{}};
  const file=path.join(outModels,`${def.model??def.id}.glb`);
  const late=Object.keys(pivotsLate);
  const boneNames=['Body',...kept,...late];
  for(const name of late)pivots[name]=pivotsLate[name];
  const stats=writeGlb(file,def.model??def.id,all.map(v=>({...v,bone:late.includes(v.bone)?v.bone:def.bones[v.bone]??'Body'})),boneNames.map(name=>({name,p:pivots[name]})));
  console.log(`${def.id}: ${stats.triangles} triângulos, ${stats.vertices} vértices, ${boneNames.length} ossos, ${meta.length.toFixed(3)} m, ${(fs.statSync(file).size/1024).toFixed(0)} KiB`);
  return meta;
}
/** The top centre of a magazine (where it meets the well): its pivot, so it can be lengthened downward. */
function magTop(verts){const box=boxOf(verts),top=slab(verts,1,box.max.y-.012,box.max.y);return new Vector3(0,box.max.y,centre(top).z);}
const magTopW=magTop;

/** A triangle from three vertices (each {p,n,c,glass,bone}), wound so its normal points along `hint`. */
function face(out,a,b,c,colour,bone,hint){
  const u=new Vector3().fromArray(b).sub(new Vector3().fromArray(a)),w=new Vector3().fromArray(c).sub(new Vector3().fromArray(a)),n=u.cross(w).normalize();
  if(hint&&n.dot(new Vector3().fromArray(hint))<0){n.negate();[b,c]=[c,b];}
  for(const p of [a,b,c])out.push({p:[...p],n:n.toArray(),c:colour,glass:false,bone});
}
/**
 * The magazine tube cut at `cut` (z, weapon space): every Body triangle wholly under `below` (y) and ahead of the cut becomes the bone TubeLong
 * (drawn only with the extended magazine); those crossing the cut are split there. A cap closes the short tube (inside the long one, unseen).
 */
function cutTube(verts,def,cut,below){
  const out=[],front=[],lerp=(a,b,k)=>({p:a.p.map((x,i)=>x+(b.p[i]-x)*k),n:new Vector3().fromArray(a.n.map((x,i)=>x+(b.n[i]-x)*k)).normalize().toArray(),c:a.c,glass:a.glass,bone:a.bone});
  for(let t=0;t<verts.length;t+=3){
    const tri=[verts[t],verts[t+1],verts[t+2]];
    const tube=tri.every(v=>(def.bones[v.bone]??'Body')==='Body'&&v.p[1]<below)&&Math.min(...tri.map(v=>v.p[2]))<cut;
    if(!tube){out.push(...tri);continue;}
    if(tri.every(v=>v.p[2]<=cut)){front.push(...tri.map(v=>({...v,bone:'TubeLong'})));continue;}
    // Clip the polygon by z=cut: the part ahead (z<cut) and the part behind.
    const ahead=[],behind=[];
    for(let i=0;i<3;i++){
      const a=tri[i],b=tri[(i+1)%3],da=a.p[2]-cut,db=b.p[2]-cut;
      if(da<0)ahead.push(a);else behind.push(a);
      if((da<0)!==(db<0)){const k=da/(da-db),m=lerp(a,b,k);m.p[2]=cut;ahead.push(m);behind.push(m);}
    }
    for(let i=1;i+1<ahead.length;i++)front.push(...[ahead[0],ahead[i],ahead[i+1]].map(v=>({...v,bone:'TubeLong'})));
    for(let i=1;i+1<behind.length;i++)out.push(behind[0],behind[i],behind[i+1]);
  }
  // The cap: the tube's section at the cut, as a fan around its centre, facing forward; the colour of the tube's own front end.
  const ring=[];
  for(let t=0;t<front.length;t+=3)for(let e=0;e<3;e++){const a=front[t+e].p,b=front[t+(e+1)%3].p;if(Math.abs(a[2]-cut)<1e-6&&Math.abs(b[2]-cut)<1e-6){ring.push(a,b);}}
  const cx=ring.reduce((s,p)=>s+p[0],0)/Math.max(1,ring.length),cy=ring.reduce((s,p)=>s+p[1],0)/Math.max(1,ring.length);
  const tip=front.reduce((m,v)=>v.p[2]<m.p[2]?v:m,front[0]);
  const capColour=tip?.c??[.033,.033,.033];
  for(let i=0;i<ring.length;i+=2)face(out,[cx,cy,cut-.0005],[ring[i][0],ring[i][1],cut-.0005],[ring[i+1][0],ring[i+1][1],cut-.0005],capColour,'Body',[0,0,-1]);
  return {verts:[...out,...front],centre:{x:cx,y:cy}};
}

/** A cylinder about X (a drum's body): centre, radius, half its width, colours of the round face and the band, `n` sides. */
function cylinderX(out,c,r,half,face_,band,bone,n=20){
  const ring=x=>Array.from({length:n},(_,i)=>{const a=i/n*Math.PI*2;return [c[0]+x,c[1]+Math.cos(a)*r,c[2]+Math.sin(a)*r];});
  const l=ring(-half),rr=ring(half);
  for(let i=0;i<n;i++){const j=(i+1)%n,a=i/n*Math.PI*2+Math.PI/n,out_=[0,Math.cos(a),Math.sin(a)];
    face(out,l[i],l[j],rr[j],band,bone,out_);face(out,l[i],rr[j],rr[i],band,bone,out_);
    face(out,[c[0]-half,c[1],c[2]],l[i],l[j],face_,bone,[-1,0,0]);face(out,[c[0]+half,c[1],c[2]],rr[i],rr[j],face_,bone,[1,0,0]);}
}
/** A box between two corners. */
function boxAt(out,min,max,colour,bone){
  const [x0,y0,z0]=min,[x1,y1,z1]=max,P=(x,y,z)=>[x,y,z];
  const quad=(a,b,c,d,hint)=>{face(out,a,b,c,colour,bone,hint);face(out,a,c,d,colour,bone,hint);};
  quad(P(x0,y0,z0),P(x1,y0,z0),P(x1,y0,z1),P(x0,y0,z1),[0,-1,0]);quad(P(x0,y1,z0),P(x1,y1,z0),P(x1,y1,z1),P(x0,y1,z1),[0,1,0]);
  quad(P(x0,y0,z0),P(x0,y1,z0),P(x0,y1,z1),P(x0,y0,z1),[-1,0,0]);quad(P(x1,y0,z0),P(x1,y1,z0),P(x1,y1,z1),P(x1,y0,z1),[1,0,0]);
  quad(P(x0,y0,z0),P(x1,y0,z0),P(x1,y1,z0),P(x0,y1,z0),[0,0,-1]);quad(P(x0,y0,z1),P(x1,y0,z1),P(x1,y1,z1),P(x0,y1,z1),[0,0,1]);
}
/**
 * The extended magazine of the assault rifles as a drum (the owner's call, 2026-11-09), bone MagDrum at the magazine's top: a short feed tower
 * into the well, then the drum. 'single': the 7.62's round drum under the well, with its winding key; 'twin': the 5.56's two drums side by side
 * (a C-Mag), joined under the tower.
 */
function drum(kind,top,magVerts){
  const out=[],box=boxOf(magVerts);
  // The tower: the magazine's own width and depth at the top, 4.5 cm down from the well's bottom.
  const width=Math.min(.026,box.max.x-box.min.x),depthZ=Math.min(.07,(box.max.z-box.min.z)*.6);
  const shell=[.03,.03,.032],face_=[.045,.045,.048],band=[.02,.02,.022],key=[.11,.11,.115];
  const z=top.z,tower=top.y-.085;
  boxAt(out,[-width/2,tower,z-depthZ/2],[width/2,top.y,z+depthZ/2],shell,'MagDrum');
  if(kind==='single'){
    const r=.075,c=[0,tower-r+.018,z-.012];
    cylinderX(out,c,r,.036,face_,band,'MagDrum');
    cylinderX(out,c,r*.82,.0385,shell,shell,'MagDrum');
    // The winding key on the left face.
    cylinderX(out,[c[0]-.043,c[1],c[2]],.016,.006,key,key,'MagDrum',10);
    boxAt(out,[-.05,c[1]-.004,c[2]-.022],[-.046,c[1]+.004,c[2]+.022],key,'MagDrum');
  }else{
    const r=.058,y=tower-r+.024,side=.034;
    for(const x of [-side,side]){cylinderX(out,[x,y,z],r,.022,face_,band,'MagDrum');cylinderX(out,[x+Math.sign(x)*.0015,y,z],r*.7,.0225,shell,shell,'MagDrum');}
    boxAt(out,[-side,y-.02,z-.03],[side,y+.03,z+.03],shell,'MagDrum');
  }
  return out;
}
/**
 * A rubber magazine pull (Magpul style) on the baseplate, bone MagPull at the magazine's top: a band around the floor plate and the loop
 * hanging under it. Built in the plate's own frame (its downward normal and the way forward along it), so a curved magazine's slanted foot
 * takes it as a straight one does.
 */
function puller(magVerts){
  const out=[],box=boxOf(magVerts),low=magVerts.filter(v=>v.p[1]<box.min.y+.03);
  // The floor plate: the lowest vertices; its slope from the front and the back of them.
  const lb=boxOf(low),front=low.filter(v=>v.p[2]<lb.min.z+.008),back=low.filter(v=>v.p[2]>lb.max.z-.008);
  const fy=Math.min(...front.map(v=>v.p[1])),by=Math.min(...back.map(v=>v.p[1]));
  const f=new Vector3(0,fy,lb.min.z),b=new Vector3(0,by,lb.max.z),along=f.clone().sub(b).normalize();
  const down=new Vector3(0,-1,0).projectOnPlane(along).normalize(),side=new Vector3(1,0,0);
  const mid=f.clone().add(b).multiplyScalar(.5),len=f.distanceTo(b),width=Math.min(.03,lb.max.x-lb.min.x)+.004;
  const rubber=[.45,.33,.19];
  // In the plate's frame: u along (forward), v down, w side.
  const P=(u,v,w)=>mid.clone().addScaledVector(along,u).addScaledVector(down,v).addScaledVector(side,w).toArray();
  const slab_=(u0,u1,v0,v1,w0,w1)=>{const c=[[u0,v0,w0],[u1,v0,w0],[u1,v1,w0],[u0,v1,w0],[u0,v0,w1],[u1,v0,w1],[u1,v1,w1],[u0,v1,w1]].map(q=>P(...q));
    const quad=(a,b_,c_,d)=>{const hint=new Vector3().fromArray(a).add(new Vector3().fromArray(c_)).multiplyScalar(.5).sub(new Vector3().fromArray(P((u0+u1)/2,(v0+v1)/2,(w0+w1)/2))).toArray();face(out,a,b_,c_,rubber,'MagPull',hint);face(out,a,c_,d,rubber,'MagPull',hint);};
    quad(c[0],c[1],c[2],c[3]);quad(c[4],c[5],c[6],c[7]);quad(c[0],c[1],c[5],c[4]);quad(c[3],c[2],c[6],c[7]);quad(c[0],c[3],c[7],c[4]);quad(c[1],c[2],c[6],c[5]);};
  // The band over the plate (a little proud of it all round), then the loop: down from the plate's front half and back up.
  slab_(-len/2-.002,len/2+.002,-.002,.006,-width/2,width/2);
  slab_(-len*.05,len*.32,.006,.03,-.011,.011);
  slab_(-len*.05-.006,len*.32+.006,.03,.038,-.011,.011);
  return out;
}

async function importPart(def){
  let verts;
  if(def.build==='compensator')verts=compensator();
  else verts=collect(await loadSource('attach',def.file)).verts;
  if(def.scale)for(const v of verts)v.p=v.p.map(x=>x*def.scale);
  if(def.flip)for(const v of verts){v.p[0]=-v.p[0];v.p[1]=-v.p[1];v.n[0]=-v.n[0];v.n[1]=-v.n[1];}
  const meta={id:def.id,url:`armas/pecas/${def.id}.glb`};
  const box=boxOf(verts);
  if(def.optic){
    const glass=verts.filter(v=>v.glass);
    // The lens the eye looks through: the rearmost glass (a scope's ocular); its radius from its extent.
    const gb=boxOf(glass),rear=glass.length?slab(glass,2,gb.max.z-.006,gb.max.z+1e-4):null;
    if(rear&&!rear.isEmpty()){const c=centre(rear),r=Math.max(rear.max.x-rear.min.x,rear.max.y-rear.min.y)/2;
      meta.lens={p:vec(c),r:r4(r)};meta.eye=vec([c.x,c.y,box.max.z]);}
  }
  if(def.muzzle){const tip=slab(verts,2,box.min.z,box.min.z+.003);meta.muzzle=vec([0,centre(tip).y,box.min.z]);}
  if(def.beam){const tip=slab(verts,2,box.min.z,box.min.z+.004);meta.beam=vec([centre(tip).x,centre(tip).y,box.min.z]);}
  const file=path.join(outParts,`${def.id}.glb`);
  const stats=writeGlb(file,def.id,verts,null);
  console.log(`${def.id}: ${stats.triangles} triângulos, ${(fs.statSync(file).size/1024).toFixed(0)} KiB`);
  return meta;
}

/** A muzzle brake in the packs' flat style: an octagonal collar, a body with three ports a side, a crowned face. ~100 triangles. */
function compensator(){
  const verts=[],steel=[.033,.033,.033],dark=[.0037,.0037,.0037],rim=[.072,.072,.072];
  const N=8,ring=(r,z)=>Array.from({length:N},(_,i)=>{const a=(i+.5)/N*Math.PI*2;return [Math.cos(a)*r,Math.sin(a)*r,z];});
  // Wound so the face looks along `hint` (outwards).
  const tri=(a,b,c,colour,hint)=>{const u=new Vector3().fromArray(b).sub(new Vector3().fromArray(a)),w=new Vector3().fromArray(c).sub(new Vector3().fromArray(a)),n=u.cross(w).normalize();
    if(n.dot(new Vector3().fromArray(hint))<0){n.negate();[b,c]=[c,b];}
    for(const p of [a,b,c])verts.push({p,n:n.toArray(),c:colour,glass:false,bone:null});};
  const quad=(a,b,c,d,colour,hint)=>{tri(a,b,c,colour,hint);tri(a,c,d,colour,hint);};
  const out=i=>{const t=(i+1)/N*Math.PI*2-Math.PI/N;return [Math.cos(t),Math.sin(t),0];};
  // Sections along -Z: [radius, z, colour of the band ending there]; the ports are dark bands on the side faces (not top/bottom).
  const sections=[[.0105,0],[.0105,-.008],[.0128,-.008],[.0128,-.016],[.0128,-.024],[.0128,-.032],[.0128,-.040],[.0128,-.048],[.0128,-.056]];
  const portBands=new Set([3,5,7]);
  for(let s=0;s+1<sections.length;s++){
    const [r0,z0]=sections[s],[r1,z1]=sections[s+1],a=ring(r0,z0),b=ring(r1,z1);
    for(let i=0;i<N;i++){const j=(i+1)%N,side=Math.abs(Math.cos((i+.5)/N*Math.PI*2))>.6;
      const colour=portBands.has(s+1)&&side?dark:s===0?rim:steel;
      if(z0===z1){quad(a[i],a[j],b[j],b[i],steel,[0,0,1]);continue;}
      quad(a[i],a[j],b[j],b[i],colour,out(i));}
  }
  // The front face: an annulus around the bore, the bore dark.
  const outer=ring(.0128,-.056),inner=ring(.0062,-.056),bore=ring(.0062,-.05);
  for(let i=0;i<N;i++){const j=(i+1)%N,inward=out(i).map(x=>-x);quad(outer[j],outer[i],inner[i],inner[j],rim,[0,0,-1]);quad(inner[j],inner[i],bore[i],bore[j],dark,inward);}
  // The back face (hidden against the barrel, closed anyway).
  const back=ring(.0105,0);for(let i=1;i+1<N;i++)tri(back[0],back[i],back[i+1],steel,[0,0,1]);
  return verts;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Writing the GLB: one primitive of the opaque triangles (+ one of the glass), vertex colours, a skin when bones are given.
// ---------------------------------------------------------------------------------------------------------------------------
function writeGlb(file,name,verts,bones){
  const boneIndex=new Map((bones??[]).map((b,i)=>[b.name,i]));
  const keyOf=v=>[...v.p.map(x=>Math.round(x*1e5)),...v.n.map(x=>Math.round(x*1e3)),...v.c.map(x=>Math.round(x*1e5)),v.glass?1:0,v.bone??''].join(',');
  const unique=new Map(),out=[],groups={opaque:[],glass:[]};
  for(const v of verts){const key=keyOf(v);let i=unique.get(key);if(i===undefined){i=out.length;unique.set(key,i);out.push(v);}groups[v.glass?'glass':'opaque'].push(i);}
  const count=out.length;
  const position=new Float32Array(count*3),normal=new Float32Array(count*3),colour=new Float32Array(count*3);
  const joints=bones?new Uint8Array(count*4):null,weights=bones?new Float32Array(count*4):null;
  out.forEach((v,i)=>{position.set(v.p,i*3);normal.set(v.n,i*3);colour.set(v.glass?[1,1,1]:v.c,i*3);if(bones){joints[i*4]=boneIndex.get(v.bone??'Body');weights[i*4]=1;}});
  const chunks=[],views=[];let offset=0;
  const view=(bytes,target)=>{const pad=(4-offset%4)%4;if(pad){chunks.push(Buffer.alloc(pad));offset+=pad;}chunks.push(bytes);views.push({buffer:0,byteOffset:offset,byteLength:bytes.length,...target?{target}:{}});offset+=bytes.length;return views.length-1;};
  const buf=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength);
  const min=[0,1,2].map(a=>Math.min(...out.map(v=>v.p[a]))),max=[0,1,2].map(a=>Math.max(...out.map(v=>v.p[a])));
  const accessors=[
    {bufferView:view(buf(position),34962),componentType:5126,count,type:'VEC3',min,max},
    {bufferView:view(buf(normal),34962),componentType:5126,count,type:'VEC3'},
    {bufferView:view(buf(colour),34962),componentType:5126,count,type:'VEC3'},
  ];
  const attributes={POSITION:0,NORMAL:1,COLOR_0:2};
  if(bones){
    attributes.JOINTS_0=accessors.length;accessors.push({bufferView:view(buf(joints),34962),componentType:5121,count,type:'VEC4'});
    attributes.WEIGHTS_0=accessors.length;accessors.push({bufferView:view(buf(weights),34962),componentType:5126,count,type:'VEC4'});
  }
  const primitives=[],materials=[];
  for(const kind of ['opaque','glass']){
    const list=groups[kind];if(!list.length)continue;
    const small=count<65536,indices=small?Uint16Array.from(list):Uint32Array.from(list);
    accessors.push({bufferView:view(buf(indices),34963),componentType:small?5123:5125,count:list.length,type:'SCALAR'});
    materials.push(kind==='opaque'
      ?{name:`${name}`,pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],metallicFactor:0,roughnessFactor:.62}}
      :{name:`${name}-lente`,alphaMode:'BLEND',pbrMetallicRoughness:{baseColorFactor:[.32,.42,.48,.32],metallicFactor:0,roughnessFactor:.08}});
    primitives.push({attributes,indices:accessors.length-1,material:materials.length-1});
  }
  const nodes=[{name,children:[1]},{name:`${name}-malha`,mesh:0}];
  const json={asset:{version:'2.0',generator:'B.A.R. weapon importer (tools/assets/import-weapons.mjs)'},scene:0,scenes:[{nodes:[0]}],nodes,
    meshes:[{name,primitives}],materials,accessors,bufferViews:views,buffers:[{byteLength:0}]};
  if(bones){
    // Body is the skeleton's root (at the origin, the grip); every other bone is its child at its pivot, unrotated.
    const first=nodes.length;
    bones.forEach((b,i)=>nodes.push({name:b.name,...i?{translation:[b.p.x,b.p.y,b.p.z].map(r4w)}:{} }));
    nodes[first].children=bones.slice(1).map((_,i)=>first+1+i);
    nodes[0].children.push(first);
    const ibm=new Float32Array(bones.length*16);
    bones.forEach((b,i)=>{const t=i?[b.p.x,b.p.y,b.p.z].map(r4w):[0,0,0];ibm.set([1,0,0,0,0,1,0,0,0,0,1,0,-t[0],-t[1],-t[2],1],i*16);});
    accessors.push({bufferView:view(buf(ibm)),componentType:5126,count:bones.length,type:'MAT4'});
    json.skins=[{name:`${name}-esqueleto`,joints:bones.map((_,i)=>first+i),inverseBindMatrices:accessors.length-1,skeleton:first}];
    nodes[1].skin=0;
  }
  const bin=Buffer.concat(chunks),binary=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]);
  json.buffers[0].byteLength=bin.length;
  const text=Buffer.from(JSON.stringify(json)),header=Buffer.concat([text,Buffer.alloc((4-text.length%4)%4,0x20)]);
  const glb=Buffer.alloc(12);glb.writeUInt32LE(0x46546c67);glb.writeUInt32LE(2,4);glb.writeUInt32LE(12+8+header.length+8+binary.length,8);
  const jc=Buffer.alloc(8);jc.writeUInt32LE(header.length);jc.writeUInt32LE(0x4e4f534a,4);
  const bc=Buffer.alloc(8);bc.writeUInt32LE(binary.length);bc.writeUInt32LE(0x004e4942,4);
  fs.writeFileSync(file,Buffer.concat([glb,jc,header,bc,binary]));
  return {triangles:verts.length/3,vertices:count};
}
function r4w(x){return Math.round(x*1e5)/1e5||0;}

// ---------------------------------------------------------------------------------------------------------------------------
fs.mkdirSync(outModels,{recursive:true});fs.mkdirSync(outParts,{recursive:true});
for(const zip of Object.values(PACKS)){const file=path.join(sources,zip);console.log(`${zip}: sha256 ${crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`);}
const weaponMeta={},partMeta={};
for(const def of WEAPONS){
  weaponMeta[def.id]=await importWeapon(def);
  for(const variant of def.variants??[]){
    const meta=await importWeapon({...def,...variant,variants:undefined,length:undefined});
    weaponMeta[def.id].variants=[...(weaponMeta[def.id].variants??[]),{part:variant.part,meta}];
  }
}
for(const def of PARTS)partMeta[def.id]=await importPart(def);
console.warn=warn;

const header=`// Generated by tools/assets/import-weapons.mjs (npm run assets:weapons). Do not edit by hand.
import type {PartId,PartSlot,WeaponId} from '@bar/shared';
export type MetaVec=[number,number,number];
export type MetaQuat=[number,number,number,number];
/** A weapon's model: every point in weapon space (metres, +Y up, the barrel towards -Z, +X right; the origin is the grip). */
export interface WeaponModelMeta {
  id:WeaponId;url:string;length:number;
  /** Right palm centre on the grip (the origin), the trigger, the left palm (handguard, pump, fore-end; on the pistol the left hand cups the grip;
   *  null for the one-handed revolver), the muzzle tip, the ejection port, the rear sight's eye line point, the butt's shoulder point. */
  grip:MetaVec;trigger:MetaVec;support:MetaVec|null;muzzle:MetaVec;eject:MetaVec|null;sight:MetaVec;stock:MetaVec|null;
  /** Where each slot's part goes (frame in weapon space). */
  mounts:Partial<Record<PartSlot,{p:MetaVec;q:MetaQuat}>>;
  /** Moving parts: the bone's name in the GLB, the axis it moves along/turns about (weapon space), and how far (m, or radians for hammers, levers, cylinders, barrels). */
  bones:Partial<Record<'slide'|'bolt'|'charging'|'pump'|'lever'|'hammer'|'cylinder'|'gate'|'mag'|'barrels'|'trigger',{name:string;axis:MetaVec;travel:number}>>;
  /** The extended magazine: scale the mag bone by \`scale\` along \`axis\` and shift it by \`shift\` (pistols: so the top round stays under the slide). */
  magExtend?:{axis:MetaVec;scale:number;shift:MetaVec};
  /** What the magazine parts change on the model (see the notes below). */
  looks?:WeaponLooks;
  /** Models of their own that a part swaps in (the sawn-off barrels). */
  variants?:{part:PartId;meta:WeaponModelMeta}[];
}
/**
 * What the magazine part fitted draws: \`optional\` bones are hidden unless a look shows them; \`extended\` (the long tube, a drum in place of the
 * magazine) and \`rapid\` (the rubber puller) show some; \`standard\` (no extended magazine) scales the magazine along its axis (the DMR's short 10).
 * \`followers\` copy the magazine bone's motion each frame (they share its pivot); \`mag.length\` is the magazine's length below its top.
 */
export interface WeaponLooks {
  optional?:string[];extended?:{show?:string[];hide?:string[]};rapid?:{show?:string[]};standard?:{magScale?:number};
  followers?:string[];mag?:{length:number};
}
/** A part's model: points in its own space (origin = its mount point). Optics: where the eye looks through and the lens; laser/light: where the beam starts; muzzle devices: their tip. */
export interface PartModelMeta {id:PartId;url:string;eye?:MetaVec;lens?:{p:MetaVec;r:number};beam?:MetaVec;muzzle?:MetaVec}
`;
const notes=`
// How to read the numbers (measured from the meshes, see docs/assets/armas.md):
// - Hand points (grip, support) are the centre of the section the hand closes on; a foregrip on the 'trilho' mount hangs below the mount
//   point (the left hand then holds the foregrip ~4 cm under it). The pistol's support is the left palm cupping the grip.
// - Every bone rests unrotated in weapon space at its pivot (Body at the origin), so \`axis\` is also the bone's local axis. Travel is metres
//   for slide, bolt, charging, pump and mag (mag: along \`axis\`, out of the well); radians (right-hand rule about \`axis\`) for hammer,
//   trigger, lever, cylinder (one chamber), gate and barrels (the break-open).
// - The mag bone's pivot is the magazine's top centre: scaling it along \`magExtend.axis\` lengthens it downward and keeps the top in the well.
// - Mount frames carry no rotation: every part is modelled in weapon orientation with its origin at the mount point. Optic \`eye\` is the
//   optic's sight axis at its rear face (add the eye relief), \`lens\` its rearmost glass (a scope's ocular).
// - Each model is one draw call (vertex colours, one material); an optic's glass is a second, see-through primitive.
`;
// One weapon per block, one field per line; a part per line.
const ts=value=>JSON.stringify(value).replace(/"([a-zA-Z_]\w*)":/g,'$1:');
const key=id=>/^[a-z]\w*$/i.test(id)?id:`'${id}'`;
const weaponsTs=Object.entries(weaponMeta).map(([id,m])=>`  ${key(id)}:{\n${Object.entries(m).map(([k,v])=>`    ${k}:${ts(v)},`).join('\n')}\n  },`).join('\n');
const partsTs=Object.entries(partMeta).map(([id,m])=>`  ${key(id)}:${ts(m)},`).join('\n');
const body=`export const WEAPON_MODELS:Readonly<Record<WeaponId,WeaponModelMeta>>={\n${weaponsTs}\n};
export const PART_MODELS:Readonly<Partial<Record<PartId,PartModelMeta>>>={\n${partsTs}\n};
`;
fs.writeFileSync(metaFile,header+notes+body);
console.log('weapon-meta.ts escrito');
