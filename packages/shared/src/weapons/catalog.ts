/**
 * The firearms (docs/sistemas/armas.md): every weapon, every part that fits on one (equipamentos) and the upgrade tracks (melhorias). This table is
 * the whole balance; the room, the browser and the API read the same numbers. Angles here are in DEGREES for reading; stats.ts turns them into the
 * radians everything else uses.
 *
 * Life to beat: a healthy player has the ring (hp, 100) and the heart's core behind it (hpCore, 100), so 200 points. The damage below is tuned
 * against that: a pistol takes 8 body shots, a rifle 9 at 700 rpm, the sniper one headshot.
 */

export const WEAPON_IDS=['pistola','revolver','submetralhadora','fuzil','fuzil-ak','dmr','escopeta','cano-duplo','carabina','precisao'] as const;
export type WeaponId=typeof WEAPON_IDS[number];
export const isWeaponId=(id:unknown):id is WeaponId=>WEAPON_IDS.includes(id as WeaponId);

/** The groups the wheel and the Arsenal show. */
export type WeaponCategory='pistolas'|'submetralhadoras'|'fuzis'|'escopetas'|'precisao';
export const CATEGORY_NAMES:Readonly<Record<WeaponCategory,string>>={pistolas:'Pistolas',submetralhadoras:'Submetralhadoras',fuzis:'Fuzis',escopetas:'Escopetas',precisao:'Precisão'};
/** How it is held: a pistol in both hands, the revolver in one (the Western way), a long gun at the shoulder. */
export type WeaponHold='pistol'|'revolver'|'rifle';
export type FireMode='semi'|'auto'|'burst';
export const FIRE_MODE_NAMES:Readonly<Record<FireMode,string>>={semi:'Semi',auto:'Auto',burst:'Rajada'};
/** What happens between two shots: nothing (self-loading), a pump, a lever or a bolt worked by hand, or the second barrel. */
export type WeaponAction='self'|'pump'|'lever'|'bolt'|'double';
/** A whole magazine, round by round (shotguns, the revolver, the lever gun: firing stops it with what is in), or a break-action's two shells. */
export type ReloadStyle='mag'|'shell'|'break';
export type Caliber='9mm'|'38'|'556'|'762'|'308'|'12ga'|'44';
export const CALIBER_NAMES:Readonly<Record<Caliber,string>>={'9mm':'9 mm','38':'.357','556':'5,56','762':'7,62','308':'.308','12ga':'Calibre 12','44':'.44'};

export const PART_SLOTS=['mira','boca','trilho','carregador'] as const;
export type PartSlot=typeof PART_SLOTS[number];
export const SLOT_NAMES:Readonly<Record<PartSlot,string>>={mira:'Mira',boca:'Boca do cano',trilho:'Trilho',carregador:'Carregador'};
export const PART_IDS=['reflex','red-dot','holografica','acog','luneta','silenciador','compensador','canos-serrados','empunhadura','empunhadura-angulada','laser','lanterna','carregador-estendido','carregador-rapido'] as const;
export type PartId=typeof PART_IDS[number];
export const isPartId=(id:unknown):id is PartId=>PART_IDS.includes(id as PartId);

/** The reticle drawn while aiming: none (iron sights: the HUD's own cross), a dot, a holographic ring, a 4x chevron, a mil-dot scope. */
export type Reticle='iron'|'dot'|'holo'|'chevron'|'mil';

/**
 * What a part changes, as factors (1 = as it was): damage; ranges; spread from the hip, aiming, and moving; recoil up and sideways; aiming, reload
 * and draw times; capacity (`mag`: a share added, rounded); walking pace while aiming; scope sway; muzzle flash; how far the shot is heard; how wide a
 * shotgun's pellets fan out; how far ahead of the shoulder the muzzle is (shorter barrels).
 */
export interface StatMods {damage?:number;range?:number;spreadHip?:number;spreadAds?:number;spreadMove?:number;recoil?:number;recoilH?:number;adsMs?:number;reloadMs?:number;drawMs?:number;mag?:number;move?:number;sway?:number;flash?:number;loud?:number;pellet?:number;reach?:number}

export interface PartDef {
  id:PartId;name:string;slot:PartSlot;description:string;mods:StatMods;
  /** An optic: its magnification while aiming, its reticle, and whether it is a scope (the view goes through the lens: full-screen overlay). */
  optic?:{zoom:number;reticle:Reticle;scope:boolean;
    /** Magnifications the scope steps through (mouse wheel, D-pad); the first is where it starts. */
    zooms?:readonly number[]};
  suppressor?:boolean;laser?:boolean;light?:boolean;
  /** Changes how the weapon is held (the sawn-off has no stock: two hands out in front, like the pistol). */
  hold?:WeaponHold;
  /** Turns the revolver's round-by-round reload into a whole one (its speed loader), in this many ms; on other guns the part only speeds the reload. */
  speedLoader?:number;
}

export const PARTS:Readonly<Record<PartId,PartDef>>={
  reflex:{id:'reflex',name:'Mira reflex',slot:'mira',description:'Ponto vermelho compacto. Mira rápida, pouco aumento.',mods:{adsMs:.96},optic:{zoom:1.3,reticle:'dot',scope:false}},
  'red-dot':{id:'red-dot',name:'Mira red dot',slot:'mira',description:'Tubo com ponto vermelho: aumento leve e mira mais firme.',mods:{adsMs:1.02,spreadAds:.92},optic:{zoom:1.45,reticle:'dot',scope:false}},
  holografica:{id:'holografica',name:'Mira holográfica',slot:'mira',description:'Anel holográfico de visão ampla, bom em movimento.',mods:{adsMs:1.04,spreadAds:.9,spreadMove:.92},optic:{zoom:1.45,reticle:'holo',scope:false}},
  acog:{id:'acog',name:'Luneta 4x',slot:'mira',description:'Luneta de combate 4x para média distância.',mods:{adsMs:1.15,spreadAds:.75,move:.95},optic:{zoom:4,reticle:'chevron',scope:true}},
  luneta:{id:'luneta',name:'Luneta de precisão',slot:'mira',description:'Aumento de 4x a 8x. Segure o fôlego (Shift) para firmar.',mods:{adsMs:1.25,spreadAds:.5,move:.9},optic:{zoom:8,reticle:'mil',scope:true,zooms:[8,4]}},
  silenciador:{id:'silenciador',name:'Silenciador',slot:'boca',description:'O tiro quase não se ouve de longe e o clarão some. Perde um pouco de alcance.',mods:{range:.88,damage:.97,recoil:.92,flash:.15,loud:.28},suppressor:true},
  compensador:{id:'compensador',name:'Compensador',slot:'boca',description:'Segura o cano: menos coice para cima e para os lados.',mods:{recoil:.8,recoilH:.85,flash:1.3,loud:1.1,adsMs:1.02}},
  // The double barrel cut short (sawed-off): its own model (cano-duplo-serrado), the pellets wide, a slower reload (the owner's call, 2026-11-09).
  'canos-serrados':{id:'canos-serrados',name:'Canos serrados',slot:'boca',description:'Canos curtos: o chumbo abre muito mais e a arma saca rápido, mas perde alcance e recarrega mais devagar.',
    mods:{pellet:1.6,spreadHip:1.25,range:.72,reloadMs:1.22,drawMs:.8,adsMs:.85,recoil:1.12,move:1.05,reach:.62},hold:'pistol'},
  empunhadura:{id:'empunhadura',name:'Empunhadura vertical',slot:'trilho',description:'Menos coice, mira um pouco mais lenta.',mods:{recoil:.85,recoilH:.8,adsMs:1.05}},
  'empunhadura-angulada':{id:'empunhadura-angulada',name:'Empunhadura angulada',slot:'trilho',description:'Mira muito mais rápida e saque ágil.',mods:{adsMs:.88,recoil:.94,drawMs:.92}},
  laser:{id:'laser',name:'Mira laser',slot:'trilho',description:'Tiro do quadril bem mais preciso. Todos veem o ponto vermelho.',mods:{spreadHip:.68,spreadMove:.85},laser:true},
  lanterna:{id:'lanterna',name:'Lanterna tática',slot:'trilho',description:'Ilumina para onde a arma aponta quando escurece.',mods:{},light:true},
  'carregador-estendido':{id:'carregador-estendido',name:'Carregador estendido',slot:'carregador',description:'Mais munição (metade a mais, ou o carregador maior da arma). Recarrega e mira um pouco mais devagar.',mods:{mag:.5,reloadMs:1.12,adsMs:1.04,move:.97}},
  'carregador-rapido':{id:'carregador-rapido',name:'Carregador rápido',slot:'carregador',description:'Recarga bem mais rápida, com puxador de borracha no carregador. No revólver, é o municiador rápido; nas de bala por bala, cada bala entra mais rápido.',mods:{reloadMs:.75},speedLoader:1600},
};

export interface WeaponDef {
  id:WeaponId;name:string;
  /** On the HUD chip and the wheel: a short mark. */
  short:string;description:string;category:WeaponCategory;hold:WeaponHold;caliber:Caliber;
  modes:readonly FireMode[];action:WeaponAction;reload:ReloadStyle;
  /** Cadence (rounds per minute): the shortest time between two shots, the hand-worked action included. */
  rpm:number;
  /** Rounds of a burst, when `modes` has 'burst'. */
  burst?:number;
  mag:number;
  /** Rounds with the extended magazine when it is a model of its own (the DMR's 20, the carbine's long tube), instead of `mag` plus a half. */
  magExtended?:number;
  /** Life one bullet (or one pellet) takes up close, and per zone: the head and the legs (the body is 1). */
  damage:number;pellets:number;head:number;legs:number;
  /** Full damage up to `start` metres, falling to `min` of it at `end`; nothing past `max`. */
  range:{start:number;end:number;min:number;max:number};
  /**
   * Cone half-angles (degrees): from the hip, aiming, added at full walking pace, added per shot (bloom) up to `bloomMax`, recovered per second;
   * shotguns: how wide the pellets fan out around where the shot goes (`pellet`).
   */
  spread:{hip:number;ads:number;move:number;bloom:number;bloomMax:number;recovery:number;pellet?:number};
  /** Per shot (degrees): the kick up, the random sideways kick (±), its lean to the right, the share the view gives back after, and how far the gun jumps back (m). */
  recoil:{v:number;h:number;bias:number;recover:number;kick:number};
  /** Aiming: how long it takes (ms), the iron sights' magnification, the walking pace (share). */
  ads:{ms:number;zoom:number;move:number};
  drawMs:number;
  /** A whole reload (tactical: a round still in; empty: from dry), or a round-by-round one: opening, each round, closing. */
  reloadMs:{tactical:number;empty:number}|{start:number;each:number;end:number};
  /** How much a scope drifts when not held steady (degrees). */
  sway:number;
  /** How far ahead of the shoulder the muzzle is when aimed (m): the room checks the way from there. */
  reach:number;
  /** Prices of the upgrades are multiplied by this. */
  tier:number;
  /** The push a killing shot gives the body (m/s). */
  impulse:number;
  /** The parts each slot takes (none listed: the slot does not exist on this weapon), and what comes fitted. */
  slots:Partial<Record<PartSlot,readonly PartId[]>>;
  defaults?:Partial<Record<PartSlot,PartId>>;
}

const SIGHTS_SMALL=['reflex','red-dot'] as const satisfies readonly PartId[];
const SIGHTS_MID=['reflex','red-dot','holografica'] as const satisfies readonly PartId[];
const SIGHTS_RIFLE=['red-dot','holografica','acog'] as const satisfies readonly PartId[];
const MUZZLES=['silenciador','compensador'] as const satisfies readonly PartId[];
const RAIL_LONG=['empunhadura','empunhadura-angulada','laser','lanterna'] as const satisfies readonly PartId[];
const MAGS=['carregador-estendido','carregador-rapido'] as const satisfies readonly PartId[];

export const WEAPONS:Readonly<Record<WeaponId,WeaponDef>>={
  pistola:{id:'pistola',name:'Pistola 9mm',short:'9MM',description:'Semiautomática confiável, 15 tiros. Rápida de sacar e de mirar.',category:'pistolas',hold:'pistol',caliber:'9mm',
    modes:['semi'],action:'self',reload:'mag',rpm:380,mag:15,damage:28,pellets:1,head:2,legs:.8,range:{start:18,end:40,min:.55,max:120},
    spread:{hip:2.2,ads:.55,move:1.3,bloom:.4,bloomMax:2.4,recovery:7},recoil:{v:1.15,h:.35,bias:.1,recover:.75,kick:.04},ads:{ms:170,zoom:1.25,move:.85},
    drawMs:320,reloadMs:{tactical:1450,empty:1850},sway:.25,reach:.5,tier:1,impulse:1.6,
    slots:{mira:SIGHTS_SMALL,boca:MUZZLES,trilho:['laser','lanterna'],carregador:MAGS}},
  revolver:{id:'revolver',name:'Revólver .357',short:'.357',description:'Seis tiros pesados, mão firme. Recarrega bala por bala; atirar interrompe a recarga.',category:'pistolas',hold:'revolver',caliber:'38',
    modes:['semi'],action:'self',reload:'shell',rpm:160,mag:6,damage:50,pellets:1,head:2.2,legs:.8,range:{start:16,end:45,min:.6,max:120},
    spread:{hip:1.9,ads:.4,move:1.4,bloom:.9,bloomMax:3,recovery:6},recoil:{v:3.4,h:.6,bias:.25,recover:.65,kick:.07},ads:{ms:190,zoom:1.3,move:.85},
    drawMs:360,reloadMs:{start:450,each:380,end:300},sway:.3,reach:.62,tier:1.1,impulse:2.2,
    slots:{carregador:['carregador-rapido']}},
  submetralhadora:{id:'submetralhadora',name:'Submetralhadora',short:'SMG',description:'Cadência altíssima numa mão só, para curta distância. O coice cresce na rajada.',category:'submetralhadoras',hold:'revolver',caliber:'9mm',
    modes:['auto','semi'],action:'self',reload:'mag',rpm:850,mag:30,damage:17,pellets:1,head:1.6,legs:.8,range:{start:10,end:30,min:.5,max:100},
    spread:{hip:2.8,ads:1,move:1.2,bloom:.22,bloomMax:2.2,recovery:9},recoil:{v:.55,h:.45,bias:-.05,recover:.6,kick:.025},ads:{ms:160,zoom:1.25,move:.85},
    drawMs:380,reloadMs:{tactical:1750,empty:2150},sway:.3,reach:.55,tier:1.25,impulse:1.8,
    slots:{mira:SIGHTS_MID,boca:MUZZLES,trilho:['laser','lanterna'],carregador:MAGS}},
  fuzil:{id:'fuzil',name:'Fuzil 5,56',short:'5.56',description:'Fuzil de assalto equilibrado: automático ou semi (V), bom de média distância.',category:'fuzis',hold:'rifle',caliber:'556',
    modes:['auto','semi'],action:'self',reload:'mag',rpm:700,mag:30,damage:24,pellets:1,head:1.8,legs:.8,range:{start:30,end:70,min:.6,max:200},
    spread:{hip:3,ads:.4,move:1.6,bloom:.16,bloomMax:1.8,recovery:8},recoil:{v:.72,h:.32,bias:.08,recover:.55,kick:.03},ads:{ms:230,zoom:1.3,move:.75},
    drawMs:480,reloadMs:{tactical:2100,empty:2600},sway:.35,reach:.78,tier:1.5,impulse:2.2,
    slots:{mira:SIGHTS_RIFLE,boca:MUZZLES,trilho:RAIL_LONG,carregador:MAGS}},
  'fuzil-ak':{id:'fuzil-ak',name:'Fuzil 7,62',short:'7.62',description:'Mais dano por tiro que o 5,56, mas o coice pede braço.',category:'fuzis',hold:'rifle',caliber:'762',
    modes:['auto','semi'],action:'self',reload:'mag',rpm:600,mag:30,damage:31,pellets:1,head:1.8,legs:.8,range:{start:28,end:65,min:.6,max:200},
    spread:{hip:3.2,ads:.5,move:1.7,bloom:.22,bloomMax:2.2,recovery:7},recoil:{v:1,h:.48,bias:.15,recover:.5,kick:.035},ads:{ms:250,zoom:1.3,move:.72},
    drawMs:520,reloadMs:{tactical:2300,empty:2800},sway:.4,reach:.8,tier:1.5,impulse:2.6,
    slots:{mira:SIGHTS_RIFLE,boca:MUZZLES,trilho:RAIL_LONG,carregador:MAGS}},
  dmr:{id:'dmr',name:'Fuzil DMR',short:'DMR',description:'Semiautomático de precisão, já vem com luneta 4x. Quatro tiros no corpo; o carregador estendido leva 20.',category:'precisao',hold:'rifle',caliber:'308',
    modes:['semi'],action:'self',reload:'mag',rpm:320,mag:10,magExtended:20,damage:55,pellets:1,head:2,legs:.8,range:{start:45,end:110,min:.7,max:300},
    spread:{hip:3.6,ads:.12,move:2,bloom:.7,bloomMax:2.5,recovery:6},recoil:{v:2.1,h:.45,bias:.1,recover:.65,kick:.05},ads:{ms:290,zoom:1.35,move:.7},
    drawMs:560,reloadMs:{tactical:2400,empty:2950},sway:.45,reach:.85,tier:1.6,impulse:2.8,
    slots:{mira:['red-dot','holografica','acog','luneta'],boca:MUZZLES,trilho:['empunhadura','empunhadura-angulada','laser'],carregador:MAGS},defaults:{mira:'acog'}},
  escopeta:{id:'escopeta',name:'Escopeta 12',short:'12',description:'Nove bagos por disparo: devastadora de perto, inútil de longe. Bombeie a cada tiro.',category:'escopetas',hold:'rifle',caliber:'12ga',
    modes:['semi'],action:'pump',reload:'shell',rpm:72,mag:6,damage:16,pellets:9,head:1.5,legs:.8,range:{start:7,end:20,min:.25,max:60},
    spread:{hip:2.5,ads:1.2,move:.8,bloom:0,bloomMax:0,recovery:10,pellet:4.2},recoil:{v:4.2,h:.8,bias:.2,recover:.7,kick:.09},ads:{ms:220,zoom:1.2,move:.8},
    drawMs:540,reloadMs:{start:380,each:480,end:350},sway:.3,reach:.9,tier:1.25,impulse:4,
    slots:{mira:SIGHTS_MID,trilho:['laser','lanterna'],carregador:['carregador-estendido']}},
  'cano-duplo':{id:'cano-duplo',name:'Espingarda de cano duplo',short:'2×12',description:'Dois canos, dois tiros seguidos que derrubam qualquer um de perto.',category:'escopetas',hold:'rifle',caliber:'12ga',
    modes:['semi'],action:'double',reload:'break',rpm:300,mag:2,damage:17,pellets:10,head:1.5,legs:.8,range:{start:8,end:22,min:.25,max:60},
    spread:{hip:2.2,ads:1,move:.8,bloom:0,bloomMax:0,recovery:10,pellet:4.8},recoil:{v:5.2,h:1,bias:.25,recover:.7,kick:.11},ads:{ms:230,zoom:1.2,move:.8},
    drawMs:520,reloadMs:{tactical:1900,empty:2200},sway:.3,reach:.95,tier:1.25,impulse:4.6,slots:{boca:['canos-serrados']}},
  carabina:{id:'carabina',name:'Carabina de alavanca',short:'.44',description:'Repetição por alavanca, seis no tubo (dez no tubo longo): três tiros no corpo derrubam. Recarrega bala por bala.',category:'fuzis',hold:'rifle',caliber:'44',
    modes:['semi'],action:'lever',reload:'shell',rpm:90,mag:6,magExtended:10,damage:68,pellets:1,head:2,legs:.8,range:{start:35,end:80,min:.65,max:250},
    spread:{hip:2.4,ads:.22,move:1.6,bloom:.5,bloomMax:2,recovery:6},recoil:{v:2.8,h:.5,bias:.1,recover:.7,kick:.06},ads:{ms:250,zoom:1.3,move:.75},
    drawMs:520,reloadMs:{start:400,each:430,end:350},sway:.4,reach:.88,tier:1.4,impulse:2.6,
    slots:{mira:['acog','luneta'],carregador:['carregador-estendido','carregador-rapido']}},
  precisao:{id:'precisao',name:'Rifle de precisão',short:'.308',description:'Ferrolho manual e luneta 8x: cada tiro pede o ferrolho. Recarrega bala por bala pelo ferrolho aberto. Segure o fôlego para firmar.',category:'precisao',hold:'rifle',caliber:'308',
    modes:['semi'],action:'bolt',reload:'shell',rpm:46,mag:5,damage:125,pellets:1,head:2.5,legs:.8,range:{start:80,end:250,min:.8,max:400},
    spread:{hip:7.5,ads:.04,move:3,bloom:0,bloomMax:0,recovery:10},recoil:{v:5.5,h:.8,bias:.15,recover:.55,kick:.1},ads:{ms:360,zoom:1.4,move:.55},
    drawMs:620,reloadMs:{start:520,each:440,end:480},sway:.9,reach:.98,tier:1.75,impulse:3.4,
    slots:{mira:['red-dot','holografica','acog','luneta'],boca:['silenciador'],carregador:['carregador-rapido']},defaults:{mira:'luneta'}},
};

/** The order of the wheel and of the Arsenal's list: by category, small to big. */
export const WHEEL_ORDER:readonly WeaponId[]=['pistola','revolver','submetralhadora','fuzil','fuzil-ak','carabina','escopeta','cano-duplo','dmr','precisao'];

/** Melhorias: five levels per track and weapon; each level is a step of `per` (a share of the stat, see stats.ts). */
export const UPGRADE_TRACKS=['dano','alcance','controle','precisao','manuseio'] as const;
export type UpgradeTrack=typeof UPGRADE_TRACKS[number];
export const UPGRADE_MAX=5;
export const UPGRADES:Readonly<Record<UpgradeTrack,{name:string;description:string;per:number}>>={
  dano:{name:'Dano',description:'+4% de dano por nível.',per:.04},
  alcance:{name:'Alcance',description:'+8% de alcance antes de o dano cair, por nível.',per:.08},
  controle:{name:'Controle',description:'−7% de coice por nível.',per:.07},
  precisao:{name:'Precisão',description:'−6% de dispersão por nível.',per:.06},
  manuseio:{name:'Manuseio',description:'−5% no tempo de mirar, recarregar e sacar, por nível.',per:.05},
};
/** Coins to reach each level (index = level), before the weapon's tier. The live price table may scale them (prices.ts, weapon:upgrade). */
export const UPGRADE_COSTS:readonly number[]=[0,120,240,450,750,1200];
/** The price of taking `weapon` to `level` on any track, rounded to tens. */
export function upgradeCost(weapon:WeaponId,level:number,scale=1):number {
  const base=UPGRADE_COSTS[Math.max(0,Math.min(UPGRADE_MAX,Math.floor(level)))]??0;
  return Math.round(base*WEAPONS[weapon].tier*scale/10)*10;
}
