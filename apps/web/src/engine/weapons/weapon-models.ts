import * as pc from 'playcanvas';
import {PARTS,type PartId,type PartSlot,type WeaponId} from '@bar/shared';
import {partModel,weaponModel,type BoneRole,type MetaVec,type WeaponModelMeta} from './meta';

/**
 * A weapon as drawn in someone's hands: the model (the GLB from tools/assets/import-weapons.mjs, or a box gun until it exists) with its parts on
 * their mounts, and handles on its moving parts. One per armed avatar, rebuilt when the weapon or its kit changes; the GLBs are loaded once.
 */
const ROTATING:ReadonlySet<BoneRole>=new Set(['hammer','lever','cylinder','gate','barrels','trigger']);
export interface MovingPart {node:pc.GraphNode;axis:pc.Vec3;travel:number;rotate:boolean;restPos:pc.Vec3;restRot:pc.Quat;restScale:pc.Vec3}
export interface WeaponInstance {
  id:WeaponId;kit:string;
  /** At the grip (the weapon's origin), placed in world space each frame. */
  root:pc.Entity;
  meta:WeaponModelMeta;
  bones:Partial<Record<BoneRole,MovingPart>>;
  /** Weapon space: where the bullets leave (the muzzle device's tip when one is fitted), and where a laser's or a light's beam starts. */
  muzzle:pc.Vec3;beam?:pc.Vec3;
  /** Weapon space: the eye's line point (the optic's rear when one is fitted), and the left palm's point (a foregrip's, when one hangs on the rail). */
  sight:pc.Vec3;support:pc.Vec3|null;
  /** A foregrip on the rail: the left hand closes on it like a pistol grip (vertical) or along it (angled). */
  foregrip:''|'vertical'|'angled';
  laser:boolean;light:boolean;suppressed:boolean;
  /** The magazine is the extended one (scaled per magExtend, or the model's long tube or drum), or the fast one (the rubber puller). */
  extended:boolean;rapid:boolean;
  /** Bones a magazine part shows or hides and those following the magazine (meta.looks), with their rest; the magazine is out of the gun this frame. */
  extras:Map<string,{node:pc.GraphNode;restPos:pc.Vec3;restRot:pc.Quat}>;
  magGone:boolean;
  /** The real model (not the box gun). */
  real:boolean;
  destroyed?:boolean;
}

const containers=new Map<string,Promise<pc.ContainerResource|undefined>>();
const loaded=new Map<string,pc.ContainerResource>();
function container(app:pc.AppBase,url:string):Promise<pc.ContainerResource|undefined> {
  let pending=containers.get(url);
  if(!pending){
    pending=new Promise(resolve=>app.assets.loadFromUrl(`${import.meta.env.BASE_URL}${url}`,'container',(error,asset)=>{
      if(error||!asset){console.warn(`armas: modelo ${url} indisponível`,error);resolve(undefined);return;}
      const resource=asset.resource as pc.ContainerResource;loaded.set(url,resource);resolve(resource);
    }));
    containers.set(url,pending);
  }
  return pending;
}

let gunmetal:pc.StandardMaterial|undefined,polymer:pc.StandardMaterial|undefined,accent:pc.StandardMaterial|undefined;
function materials():{metal:pc.StandardMaterial;dark:pc.StandardMaterial;accent:pc.StandardMaterial} {
  const make=(r:number,g:number,b:number,metalness:number,gloss:number)=>{
    const m=new pc.StandardMaterial();m.diffuse=new pc.Color(r,g,b);m.useMetalness=true;m.metalness=metalness;m.gloss=gloss;m.update();return m;
  };
  gunmetal??=make(.2,.21,.23,.7,.55);polymer??=make(.07,.07,.075,.1,.35);accent??=make(.32,.22,.12,.05,.3);
  return {metal:gunmetal,dark:polymer,accent};
}
function addBox(parent:pc.Entity,material:pc.Material,cx:number,cy:number,cz:number,sx:number,sy:number,sz:number,name='Box'):pc.Entity {
  const e=new pc.Entity(name);
  e.addComponent('render',{type:'box',castShadows:true,receiveShadows:true});
  e.render!.meshInstances[0]!.material=material;
  e.setLocalPosition(cx,cy,cz);e.setLocalScale(Math.max(1e-3,sx),Math.max(1e-3,sy),Math.max(1e-3,sz));
  parent.addChild(e);
  return e;
}
/** A node standing for a bone of the real model: the box gun's moving part, its boxes under it. */
function addBone(parent:pc.Entity,name:string,x:number,y:number,z:number):pc.Entity {
  const e=new pc.Entity(name);e.setLocalPosition(x,y,z);parent.addChild(e);return e;
}

/** The box gun: receiver, barrel, grip, stock, magazine, sights, from the sockets; the moving parts on nodes named as the real bones. */
function boxGun(meta:WeaponModelMeta):pc.Entity {
  const root=new pc.Entity(`Arma ${meta.id}`),{metal,dark,accent}=materials();
  const [,my,mz]=meta.muzzle,long=!!meta.stock,wood=meta.id==='cano-duplo'||meta.id==='carabina';
  const top=meta.sight[1]-.03;
  // The grip, raked back as real ones are.
  const grip=addBox(root,wood?accent:dark,0,-.035,.012,.028,.1,.034,'Grip');grip.setLocalEulerAngles(-16,0,0);
  if(meta.id==='pistola'){
    const slide=addBone(root,meta.bones.slide!.name,0,0,0);
    addBox(slide,metal,0,.085,(mz+.04)/2,.03,.035,Math.abs(mz)+.04);
    addBox(root,dark,0,.055,(mz+.02)/2,.026,.03,Math.abs(mz)+.02);
    const mag=addBone(root,meta.bones.mag!.name,0,0,0);addBox(mag,dark,0,-.04,.01,.022,.09,.03);
    return root;
  }
  if(meta.id==='revolver'){
    addBox(root,metal,0,.085,(mz+.0)/2,.018,.02,Math.abs(mz));
    addBox(root,metal,0,.07,-.02,.03,.05,.09,'Frame');
    const cylinder=addBone(root,meta.bones.cylinder!.name,0,.075,-.035);addBox(cylinder,metal,0,0,0,.038,.038,.045);
    const gate=addBone(root,meta.bones.gate!.name,.016,.075,-.01);addBox(gate,metal,0,0,0,.004,.02,.012);
    const hammer=addBone(root,meta.bones.hammer!.name,0,.09,.025);addBox(hammer,metal,0,.008,.006,.008,.02,.01);
    return root;
  }
  const front=meta.support?meta.support[2]-.08:mz*.6;
  addBox(root,metal,0,my,(mz+front)/2,.022,.022,Math.abs(mz-front));
  addBox(root,wood?accent:metal,0,(top+.02)/2+.01,(front+.06)/2,.042,Math.max(.04,top-.0),Math.abs(front-.06));
  if(long&&meta.stock)addBox(root,wood?accent:dark,0,meta.stock[1]+.01,(meta.stock[2]+.05)/2,.034,.075,Math.abs(meta.stock[2]-.05));
  if(meta.bones.mag){const mag=addBone(root,meta.bones.mag.name,0,0,-.075);addBox(mag,dark,0,-.07,0,.024,.15,.05);}
  if(meta.bones.pump){const pump=addBone(root,meta.bones.pump.name,0,0,0);addBox(pump,dark,0,meta.support![1],meta.support![2],.045,.045,.16);}
  else if(meta.support)addBox(root,wood?accent:dark,0,meta.support[1]+.005,meta.support[2],.04,.04,.16,'Handguard');
  if(meta.bones.lever){const lever=addBone(root,meta.bones.lever.name,0,-.01,-.02);addBox(lever,metal,0,-.03,.03,.012,.05,.07);}
  if(meta.bones.barrels){const barrels=addBone(root,meta.bones.barrels.name,0,.05,-.08);addBox(barrels,metal,0,.03,(mz+.08)/2,.04,.022,Math.abs(mz+.08));}
  if(meta.bones.bolt){const bolt=addBone(root,meta.bones.bolt.name,.022,top-.01,-.04);addBox(bolt,metal,0,0,0,.012,.012,.03);}
  if(meta.bones.charging){const handle=addBone(root,meta.bones.charging.name,0,top+.005,.03);addBox(handle,metal,0,0,0,.03,.008,.012);}
  addBox(root,metal,0,meta.sight[1]-.012,meta.sight[2],.012,.024,.012,'Rear sight');
  return root;
}
/** A box standing for a part until the parts' GLBs exist. */
function boxPart(part:PartId):pc.Entity {
  const e=new pc.Entity(`Peça ${part}`),{metal,dark}=materials(),slot=PARTS[part].slot;
  if(slot==='mira')addBox(e,dark,0,.025,0,.03,.04,part==='luneta'?.3:part==='acog'?.12:.06);
  else if(slot==='boca')addBox(e,dark,0,0,-.07,.032,.032,part==='silenciador'?.15:.05);
  else if(part==='empunhadura'||part==='empunhadura-angulada')addBox(e,dark,0,-.045,0,.025,.09,.03);
  else if(slot==='trilho')addBox(e,metal,0,-.02,0,.028,.028,.06);
  return e;
}

const mountRot=new pc.Quat(),pt=new pc.Vec3();
function applyMount(entity:pc.Entity,mount:{p:MetaVec;q:[number,number,number,number]}):void {
  entity.setLocalPosition(mount.p[0],mount.p[1],mount.p[2]);
  entity.setLocalRotation(mountRot.set(mount.q[0],mount.q[1],mount.q[2],mount.q[3]));
}
/** A point of a part (its own space) in the weapon's space, the part sitting on `slot`'s mount. */
function throughMount(meta:WeaponModelMeta,slot:PartSlot,point:MetaVec):pc.Vec3 {
  const mount=meta.mounts[slot];
  if(!mount)return new pc.Vec3(point[0],point[1],point[2]);
  mountRot.set(mount.q[0],mount.q[1],mount.q[2],mount.q[3]).transformVector(pt.set(point[0],point[1],point[2]),pt);
  return new pc.Vec3(mount.p[0]+pt.x,mount.p[1]+pt.y,mount.p[2]+pt.z);
}

/** Instantiates a weapon with these parts under `parent` (an avatar's root). The real GLB when loaded, else the box gun (swapped in later). */
export function makeWeapon(app:pc.AppBase,parent:pc.Entity,id:WeaponId,parts:Partial<Record<PartSlot,PartId>>,kit:string,onReal?:()=>void):WeaponInstance {
  const meta=weaponModel(id,parts);
  const resource=meta.url?loaded.get(meta.url):undefined;
  if(meta.url&&!resource)void container(app,meta.url).then(found=>{if(found)onReal?.();});
  const root=new pc.Entity(`Arma ${id}`);
  const model=resource?resource.instantiateRenderEntity({castShadows:true,receiveShadows:true}):boxGun(meta);
  root.addChild(model);
  parent.addChild(root);
  const instance:WeaponInstance={id,kit,root,meta,bones:{},muzzle:new pc.Vec3(...meta.muzzle),sight:new pc.Vec3(...meta.sight),support:meta.support?new pc.Vec3(...meta.support):null,foregrip:'',laser:false,light:false,suppressed:false,extended:false,rapid:false,extras:new Map(),magGone:false,real:!!resource};
  for(const [slot,part] of Object.entries(parts) as [PartSlot,PartId][]){
    const def=PARTS[part],mount=meta.mounts[slot],pm=partModel(part);
    if(def.slot==='carregador'){instance.extended=part==='carregador-estendido';instance.rapid=part==='carregador-rapido';continue;}
    // A part that swaps the model (the sawn-off barrels) has nothing to mount.
    if(meta!==weaponModel(id)&&!pm)continue;
    if(!mount)continue;
    const partResource=pm?.url?loaded.get(pm.url):undefined;
    if(pm?.url&&!partResource)void container(app,pm.url).then(found=>{if(found)onReal?.();});
    const entity=partResource?partResource.instantiateRenderEntity({castShadows:true,receiveShadows:true}):boxPart(part);
    applyMount(entity,mount);root.addChild(entity);
    if(def.suppressor||slot==='boca'){
      instance.suppressed||=!!def.suppressor;
      instance.muzzle=pm?.muzzle?throughMount(meta,slot,pm.muzzle):throughMount(meta,slot,[0,0,def.suppressor?-.15:-.05]);
    }
    if(def.optic&&pm?.eye)instance.sight=throughMount(meta,slot,pm.eye);
    else if(def.optic&&!pm)instance.sight=throughMount(meta,slot,[0,.035,0]);
    if(part==='empunhadura'||part==='empunhadura-angulada'){instance.foregrip=part==='empunhadura'?'vertical':'angled';instance.support=throughMount(meta,slot,part==='empunhadura'?[0,-.045,0]:[0,-.03,.01]);}
    if(def.laser||def.light){
      instance.laser||=!!def.laser;instance.light||=!!def.light;
      instance.beam=throughMount(meta,slot,pm?.beam??[0,-.02,-.035]);
    }
  }
  for(const [role,bone] of Object.entries(meta.bones) as [BoneRole,{name:string;axis:MetaVec;travel:number}][]){
    const node=model.findByName(bone.name);
    if(!node)continue;
    instance.bones[role]={node,axis:new pc.Vec3(...bone.axis).normalize(),travel:bone.travel,rotate:ROTATING.has(role),
      restPos:node.getLocalPosition().clone(),restRot:node.getLocalRotation().clone(),restScale:node.getLocalScale().clone()};
  }
  const looks=meta.looks;
  for(const name of new Set([...(looks?.optional??[]),...(looks?.followers??[]),...(looks?.extended?.hide??[])])){
    const node=model.findByName(name);
    if(node)instance.extras.set(name,{node,restPos:node.getLocalPosition().clone(),restRot:node.getLocalRotation().clone()});
  }
  return instance;
}
export function dropWeapon(instance:WeaponInstance|undefined):void {
  if(!instance||instance.destroyed)return;
  instance.destroyed=true;instance.root.destroy();
}
/** Whether this weapon's GLB (and its parts') are loaded now, so a box gun can be swapped for it. */
export function realReady(id:WeaponId,parts:Partial<Record<PartSlot,PartId>>):boolean {
  const meta=weaponModel(id,parts);
  if(!meta.url||!loaded.has(meta.url))return false;
  return Object.values(parts).every(part=>{const url=part&&partModel(part)?.url;return !url||loaded.has(url);});
}
/** Starts loading a weapon's model ahead of its first draw. */
export function preloadWeapon(app:pc.AppBase,id:WeaponId):void {
  const meta=weaponModel(id);if(meta.url)void container(app,meta.url);
}

const axisWorld=new pc.Vec3(),rot=new pc.Quat(),q2=new pc.Quat(),pos=new pc.Vec3();
/** Puts every moving part back where the model has it (each frame, before the motions of this frame). */
export function restParts(instance:WeaponInstance):void {
  for(const part of Object.values(instance.bones)){
    if(!part)continue;
    part.node.setLocalPosition(part.restPos);part.node.setLocalRotation(part.restRot);part.node.setLocalScale(part.restScale);
  }
  instance.magGone=false;
}
/** Moves a part `amount` of its travel (0 rest, 1 all the way; negative or beyond 1 allowed), in the weapon's space, wherever its bone's axes point. */
export function moveRole(instance:WeaponInstance,role:BoneRole,amount:number):void {
  const part=instance.bones[role];
  if(!part||Math.abs(amount)<1e-4)return;
  instance.root.getRotation().transformVector(part.axis,axisWorld);
  if(part.rotate){
    rot.setFromAxisAngle(axisWorld,part.travel*amount*180/Math.PI);
    q2.mul2(rot,part.node.getRotation());part.node.setRotation(q2);
  }else{
    pos.copy(part.node.getPosition()).add(axisWorld.mulScalar(part.travel*amount));
    part.node.setPosition(pos);
  }
}
/** Turns a part about a weapon-space axis through its pivot (the bolt's handle lifted before the pull: the bone's one axis is the slide). */
export function turnRole(instance:WeaponInstance,role:BoneRole,axis:pc.Vec3,radians:number):void {
  const part=instance.bones[role];
  if(!part||Math.abs(radians)<1e-4)return;
  instance.root.getRotation().transformVector(axis,axisWorld);
  rot.setFromAxisAngle(axisWorld,radians*180/Math.PI);
  q2.mul2(rot,part.node.getRotation());part.node.setRotation(q2);
}
/** Hides a part (the magazine out of the gun) by shrinking its bone; restParts brings it back. */
export function hideRole(instance:WeaponInstance,role:BoneRole):void {
  instance.bones[role]?.node.setLocalScale(1e-3,1e-3,1e-3);
  if(role==='mag')instance.magGone=true;
}
const GONE=1e-3;
const off=new pc.Vec3();
/**
 * The bones that follow the magazine (the drum, the puller: meta.looks.followers, pivoted on the magazine's own top) to where the reload has
 * put it this frame, hidden while it is out of the gun; the puller rides up to a short magazine's foot. After every motion of the frame.
 */
export function followMag(instance:WeaponInstance):void {
  const looks=instance.meta.looks,mag=instance.bones.mag;
  if(!looks?.followers||!mag)return;
  const scale=instance.extended?1:looks.standard?.magScale??1;
  for(const name of looks.followers){
    const extra=instance.extras.get(name);
    if(!extra||extra.node.getLocalScale().x<.5)continue;
    if(instance.magGone){extra.node.setLocalScale(GONE,GONE,GONE);continue;}
    extra.node.setLocalRotation(mag.node.getLocalRotation());
    mag.node.getLocalRotation().transformVector(off.set(0,(looks.mag?.length??0)*(1-scale),0),off);
    extra.node.setLocalPosition(off.add(mag.node.getLocalPosition()));
  }
}
/** The magazine part's look for this frame (meta.looks), after restParts: the extended magazine (stretched, or the long tube or the drum), the
 *  DMR's short one, the plain magazine hidden behind a drum. The followers (drum, puller) are placed later, by followMag, once the magazine moved. */
export function extendMag(instance:WeaponInstance):void {
  const looks=instance.meta.looks,part=instance.bones.mag;
  if(looks){
    const shown=new Set([...(instance.extended?looks.extended?.show??[]:[]),...(instance.rapid?looks.rapid?.show??[]:[])]);
    for(const [name,extra] of instance.extras){
      extra.node.setLocalPosition(extra.restPos);extra.node.setLocalRotation(extra.restRot);
      const hidden=(looks.optional?.includes(name)&&!shown.has(name))||(instance.extended&&!!looks.extended?.hide?.includes(name));
      extra.node.setLocalScale(hidden?GONE:1,hidden?GONE:1,hidden?GONE:1);
    }
    const scale=!instance.extended?looks.standard?.magScale:undefined;
    if(scale&&part)part.node.setLocalScale(part.restScale.x,part.restScale.y*scale,part.restScale.z);
    // The magazine hidden by the drum stays hidden whatever the reload does to its scale.
    if(instance.extended&&part&&looks.extended?.hide?.includes(part.node.name))part.node.setLocalScale(GONE,GONE,GONE);
  }
  const extend=instance.meta.magExtend;
  if(!extend||!part||!instance.extended)return;
  // The axis in the bone's own space: scale that local axis (the bones carry no shear, so the strongest component is it).
  const parent=part.node.parent;if(!parent)return;
  instance.root.getRotation().transformVector(pos.set(...extend.axis),axisWorld);
  rot.copy(part.node.getRotation()).invert().transformVector(axisWorld,pos);
  const ax=Math.abs(pos.x),ay=Math.abs(pos.y),az=Math.abs(pos.z),s=extend.scale;
  part.node.setLocalScale(part.restScale.x*(ax>=ay&&ax>=az?s:1),part.restScale.y*(ay>ax&&ay>=az?s:1),part.restScale.z*(az>ax&&az>ay?s:1));
  instance.root.getRotation().transformVector(pos.set(...extend.shift),axisWorld);
  part.node.setPosition(pos.copy(part.node.getPosition()).add(axisWorld));
}
