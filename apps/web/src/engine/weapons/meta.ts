import {WEAPONS,type PartId,type PartSlot,type Surface,type WeaponId} from '@bar/shared';

/**
 * The weapons' generated data (tools/assets/import-weapons.mjs -> weapons/weapon-meta.ts, import-weapon-sounds.mjs -> weapons/sound-meta.ts), read
 * through Vite's glob so the client builds and draws before those files exist: until then every weapon is a box gun with the same sockets
 * (placeholderModel), and nothing is heard. The shapes below are the generated modules' own (docs/assets/armas.md).
 */
export type MetaVec=[number,number,number];
export type MetaQuat=[number,number,number,number];
export type BoneRole='slide'|'bolt'|'charging'|'pump'|'lever'|'hammer'|'cylinder'|'gate'|'mag'|'barrels'|'trigger';
export interface WeaponModelMeta {
  id:WeaponId;url:string;length:number;
  grip:MetaVec;trigger:MetaVec;support:MetaVec|null;muzzle:MetaVec;eject:MetaVec|null;sight:MetaVec;stock:MetaVec|null;
  mounts:Partial<Record<PartSlot,{p:MetaVec;q:MetaQuat}>>;
  bones:Partial<Record<BoneRole,{name:string;axis:MetaVec;travel:number}>>;
  magExtend?:{axis:MetaVec;scale:number;shift:MetaVec};
  /** A swing-out cylinder's reload points with the gate (crane) fully open: `port` the mouth of the top chamber, `face` the rear face's centre
   *  (where the empties fall from and the speed loader goes). Models without it are loaded at the right of the frame. */
  reload?:{port:MetaVec;face:MetaVec};
  /** What the magazine parts change on the model (tools/assets/import-weapons.mjs WeaponLooks): optional bones shown by the extended or the fast
   *  magazine (the long tube, a drum, the rubber puller), bones the extended hides (the plain magazine), the short magazine's scale, the
   *  bones that follow the magazine (their pivot is its own), and its length below its top. */
  looks?:WeaponLooks;
  /** Models of their own a part swaps in (the sawn-off barrels). */
  variants?:{part:PartId;meta:WeaponModelMeta}[];
}
export interface WeaponLooks {
  optional?:string[];extended?:{show?:string[];hide?:string[]};rapid?:{show?:string[]};standard?:{magScale?:number};
  followers?:string[];mag?:{length:number};
}
export interface PartModelMeta {id:PartId;url:string;eye?:MetaVec;lens?:{p:MetaVec;r:number};beam?:MetaVec;muzzle?:MetaVec}
export type MechSound='magOut'|'magIn'|'rack'|'slideRelease'|'boltBack'|'boltForward'|'pumpBack'|'pumpForward'|'leverDown'|'leverUp'|'shellIn'|'cylinderOpen'|'cylinderClose'|'breakOpen'|'breakClose'|'dry'|'hammer'|'select';
export interface WeaponSoundSet {shot:string[];near:string[];far:string[];suppressed?:string[];suppressedFar?:string[];mech:Partial<Record<MechSound,string[]>>}
export interface SharedSounds {draw:string[];holster:string[];scopeIn:string[];zoom:string[];fireMode:string[];hit:string[];headshot:string[];kill:string[];
  whiz:string[];casingBrass:string[];casingShell:string[];impact:Readonly<Record<Surface,string[]>>;reverb:{outdoor:string;indoor:string}}

interface ModelModule {WEAPON_MODELS?:Readonly<Record<WeaponId,WeaponModelMeta>>;PART_MODELS?:Readonly<Partial<Record<PartId,PartModelMeta>>>}
interface SoundModule {WEAPON_SOUNDS?:Readonly<Record<WeaponId,WeaponSoundSet>>;SHARED_SOUNDS?:SharedSounds}
const modelModules=import.meta.glob<ModelModule>('../../weapons/weapon-meta.ts',{eager:true});
const soundModules=import.meta.glob<SoundModule>('../../weapons/sound-meta.ts',{eager:true});
const models=Object.values(modelModules)[0];
const sounds=Object.values(soundModules)[0];

/**
 * The box guns' sockets: sizes of the real ones (a 0.22 m pistol, 0.7-1 m long guns), the grip at the origin, the barrel towards -Z. Their moving
 * parts are boxes named like bones so the motions run the same way on them.
 */
const box=(p:Partial<WeaponModelMeta>&{length:number;muzzle:MetaVec;sight:MetaVec}):Omit<WeaponModelMeta,'id'|'url'>=>({
  grip:[0,0,0],trigger:[0,.035,-.045],support:null,eject:null,stock:null,mounts:{},bones:{},...p});
const PLACEHOLDERS:Record<WeaponId,Omit<WeaponModelMeta,'id'|'url'>>={
  pistola:box({length:.22,support:[-.012,-.012,-.008],muzzle:[0,.08,-.17],eject:[.014,.09,-.03],sight:[0,.112,.035],
    mounts:{mira:{p:[0,.105,-.02],q:[0,0,0,1]},boca:{p:[0,.08,-.17],q:[0,0,0,1]},trilho:{p:[0,.045,-.12],q:[0,0,0,1]}},
    bones:{slide:{name:'Slide',axis:[0,0,1],travel:.035},mag:{name:'Magazine',axis:[0,-1,0],travel:.12},hammer:{name:'Hammer',axis:[1,0,0],travel:.6},trigger:{name:'Trigger',axis:[1,0,0],travel:.2}},
    magExtend:{axis:[0,-1,0],scale:1.45,shift:[0,-.02,0]}}),
  revolver:box({length:.32,muzzle:[0,.085,-.25],sight:[0,.112,.02],
    bones:{hammer:{name:'Hammer',axis:[1,0,0],travel:.7},cylinder:{name:'Cylinder',axis:[0,0,1],travel:Math.PI/3},gate:{name:'Gate',axis:[0,0,1],travel:1.3},trigger:{name:'Trigger',axis:[1,0,0],travel:.2}}}),
  submetralhadora:box({length:.44,support:[0,.035,-.17],muzzle:[0,.075,-.3],eject:[.022,.085,-.05],sight:[0,.135,.02],stock:[0,.065,.16],
    mounts:{mira:{p:[0,.12,-.04],q:[0,0,0,1]},boca:{p:[0,.075,-.3],q:[0,0,0,1]},trilho:{p:[0,.035,-.2],q:[0,0,0,1]}},
    bones:{bolt:{name:'Bolt',axis:[0,0,1],travel:.04},charging:{name:'Charging',axis:[0,0,1],travel:.06},mag:{name:'Magazine',axis:[0,-1,0],travel:.18}},
    magExtend:{axis:[0,-1,0],scale:1.45,shift:[0,0,0]}}),
  fuzil:box({length:.7,support:[0,.045,-.25],muzzle:[0,.085,-.45],eject:[.025,.09,-.06],sight:[0,.165,.03],stock:[0,.045,.25],
    mounts:{mira:{p:[0,.135,-.03],q:[0,0,0,1]},boca:{p:[0,.085,-.45],q:[0,0,0,1]},trilho:{p:[0,.04,-.27],q:[0,0,0,1]}},
    bones:{bolt:{name:'Bolt',axis:[0,0,1],travel:.05},charging:{name:'Charging',axis:[0,0,1],travel:.07},mag:{name:'Magazine',axis:[0,-1,0],travel:.2}},
    magExtend:{axis:[0,-1,0],scale:1.45,shift:[0,0,0]}}),
  'fuzil-ak':box({length:.72,support:[0,.05,-.25],muzzle:[0,.085,-.46],eject:[.025,.09,-.06],sight:[0,.15,-.02],stock:[0,.04,.26],
    mounts:{mira:{p:[0,.13,-.04],q:[0,0,0,1]},boca:{p:[0,.085,-.46],q:[0,0,0,1]},trilho:{p:[0,.04,-.28],q:[0,0,0,1]}},
    bones:{bolt:{name:'Bolt',axis:[0,0,1],travel:.06},mag:{name:'Magazine',axis:[0,-1,0],travel:.22}},magExtend:{axis:[0,-1,0],scale:1.45,shift:[0,0,0]}}),
  dmr:box({length:.85,support:[0,.045,-.3],muzzle:[0,.085,-.55],eject:[.025,.09,-.06],sight:[0,.17,.03],stock:[0,.04,.29],
    mounts:{mira:{p:[0,.135,-.03],q:[0,0,0,1]},boca:{p:[0,.085,-.55],q:[0,0,0,1]},trilho:{p:[0,.04,-.32],q:[0,0,0,1]}},
    bones:{bolt:{name:'Bolt',axis:[0,0,1],travel:.06},mag:{name:'Magazine',axis:[0,-1,0],travel:.2}},magExtend:{axis:[0,-1,0],scale:1.4,shift:[0,0,0]}}),
  escopeta:box({length:.88,support:[0,.035,-.33],muzzle:[0,.08,-.58],eject:[.025,.075,-.05],sight:[0,.12,-.02],stock:[0,.0,.3],
    mounts:{mira:{p:[0,.11,-.04],q:[0,0,0,1]},trilho:{p:[0,.03,-.45],q:[0,0,0,1]}},
    bones:{pump:{name:'Pump',axis:[0,0,1],travel:.09},bolt:{name:'Bolt',axis:[0,0,1],travel:.07}},magExtend:{axis:[0,0,-1],scale:1.2,shift:[0,0,0]}}),
  'cano-duplo':box({length:1,support:[0,.045,-.3],muzzle:[0,.08,-.7],sight:[0,.11,-.05],stock:[0,-.01,.32],
    bones:{barrels:{name:'Barrels',axis:[1,0,0],travel:-.6},hammer:{name:'Hammer',axis:[1,0,0],travel:.7}}}),
  carabina:box({length:1,support:[0,.045,-.33],muzzle:[0,.08,-.66],eject:[.02,.09,-.03],sight:[0,.115,.0],stock:[0,0,.3],
    mounts:{mira:{p:[0,.11,-.05],q:[0,0,0,1]}},bones:{lever:{name:'Lever',axis:[1,0,0],travel:-.9},hammer:{name:'Hammer',axis:[1,0,0],travel:.7}}}),
  precisao:box({length:.96,support:[0,.045,-.35],muzzle:[0,.085,-.62],eject:[.025,.09,-.04],sight:[0,.18,.05],stock:[0,.045,.33],
    mounts:{mira:{p:[0,.135,-.02],q:[0,0,0,1]},boca:{p:[0,.085,-.62],q:[0,0,0,1]},trilho:{p:[0,.04,-.36],q:[0,0,0,1]}},
    bones:{bolt:{name:'Bolt',axis:[0,0,1],travel:.08},mag:{name:'Magazine',axis:[0,-1,0],travel:.15}},magExtend:{axis:[0,-1,0],scale:1.4,shift:[0,0,0]}}),
};

/** Whether the real models are there (the assets' module), and so the GLBs to load. */
export const realModels=!!models?.WEAPON_MODELS;
/** A weapon's model, or the one a fitted part swaps in (the sawn-off). */
export function weaponModel(id:WeaponId,parts?:Partial<Record<PartSlot,PartId>>):WeaponModelMeta {
  const base=models?.WEAPON_MODELS?.[id]??{id,url:'',...PLACEHOLDERS[id]};
  const fitted=parts?Object.values(parts):[];
  return base.variants?.find(variant=>fitted.includes(variant.part))?.meta??base;
}
export const partModel=(id:PartId):PartModelMeta|undefined=>models?.PART_MODELS?.[id];
export const weaponSounds=(id:WeaponId):WeaponSoundSet|undefined=>sounds?.WEAPON_SOUNDS?.[id];
export const sharedSounds=():SharedSounds|undefined=>sounds?.SHARED_SOUNDS;
/** The hold of a weapon (WEAPONS), for when the stats are not at hand. */
export const holdOf=(id:WeaponId)=>WEAPONS[id].hold;
