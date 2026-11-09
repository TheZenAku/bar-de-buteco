import {CALIBER_NAMES,FIRE_MODE_NAMES,PARTS,type PartId,type StatMods,type WeaponStats} from '@bar/shared';

/**
 * The Arsenal's eight bars (docs/sistemas/armas.md#arsenal): each a 0-1 score made from the real numbers of weaponStats (parts and upgrades
 * included), so a part or a level moves the bar exactly as it moves the gun; beside each bar, the figure a player can check (28 de dano,
 * 380/min, 18-40 m). Higher is always better, so a delta reads the same way on every bar.
 */
export const STAT_KEYS=['dano','cadencia','alcance','precisao','controle','manuseio','mobilidade','capacidade'] as const;
export type StatKey=typeof STAT_KEYS[number];
export const STAT_NAMES:Readonly<Record<StatKey,string>>={dano:'Dano',cadencia:'Cadência',alcance:'Alcance',precisao:'Precisão',controle:'Controle',
  manuseio:'Manuseio',mobilidade:'Mobilidade',capacidade:'Capacidade'};
export interface StatLine {key:StatKey;score:number;figure:string}

const DEG=180/Math.PI;
const clamp01=(value:number)=>Math.max(0,Math.min(1,value));
const one=(value:number)=>value.toLocaleString('pt-BR',{maximumFractionDigits:1});
/** A whole reload from dry (round by round: every round of a full magazine). */
export function fullReloadMs(stats:WeaponStats):number {
  const ms=stats.reloadMs;
  return 'each' in ms?ms.start+ms.each*stats.mag+ms.end:ms.empty;
}

export function statLines(stats:WeaponStats):StatLine[] {
  const perShot=stats.damage*stats.pellets,rpm=60000/stats.interval;
  // Precision: the aimed cone on a log scale (0,03° to 3°: a rifle's and a shotgun's differ a hundredfold; the pellets' fan counts), and a little of the hip's.
  const ads=(stats.spread.ads+stats.spread.pellet*.3)*DEG,hip=stats.spread.hip*DEG;
  const kick=stats.recoil.v*DEG+stats.recoil.h*DEG*.8;
  const handling=stats.adsMs+stats.drawMs*.5+fullReloadMs(stats)*.08;
  return [
    {key:'dano',score:clamp01((perShot/170)**.7),figure:stats.pellets>1?`${stats.pellets}×${Math.round(stats.damage)}`:String(Math.round(stats.damage))},
    {key:'cadencia',score:clamp01(rpm/900),figure:`${Math.round(rpm)}/min`},
    {key:'alcance',score:clamp01((stats.range.start+stats.range.end)/2/180),figure:`${Math.round(stats.range.start)}–${Math.round(stats.range.end)} m`},
    {key:'precisao',score:clamp01(.85*(1-Math.log(Math.max(ads,.03)/.03)/Math.log(100))+.15*clamp01(1-hip/8)),figure:`${ads<.1?ads.toFixed(2).replace('.',','):one(ads)}°`},
    {key:'controle',score:clamp01(1-kick/6.5),figure:`${one(kick)}°`},
    {key:'manuseio',score:clamp01(1-(handling-400)/700),figure:`${stats.adsMs} ms`},
    {key:'mobilidade',score:clamp01((stats.move-.4)/.5),figure:`${Math.round(stats.move*100)}%`},
    {key:'capacidade',score:clamp01(Math.sqrt(stats.mag/45)),figure:String(stats.mag)},
  ];
}
/** What each figure means, for the bar's title (hover) and screen readers. */
export const STAT_HINTS:Readonly<Record<StatKey,string>>={
  dano:'Vida que cada tiro tira no corpo, de perto',cadencia:'Disparos por minuto',alcance:'Dano cheio até a primeira distância; cai até a segunda',
  precisao:'Abertura do cone mirando',controle:'Coice por tiro (para cima e para os lados)',manuseio:'Tempo para mirar; conta também sacar e recarregar',
  mobilidade:'Passo andando enquanto mira',capacidade:'Tiros no carregador'};

export const modesText=(stats:WeaponStats)=>stats.modes.map(mode=>FIRE_MODE_NAMES[mode]).join(' / ');
export const caliberText=(stats:WeaponStats)=>CALIBER_NAMES[stats.caliber];

/** A part's effects in words, each good or bad for the player (factors as percentages). */
const MOD_TEXT:Readonly<Record<keyof StatMods,{name:string;up:boolean}>>={
  damage:{name:'Dano',up:true},range:{name:'Alcance',up:true},spreadHip:{name:'Dispersão do quadril',up:false},spreadAds:{name:'Dispersão mirando',up:false},
  spreadMove:{name:'Dispersão andando',up:false},recoil:{name:'Coice',up:false},recoilH:{name:'Coice lateral',up:false},adsMs:{name:'Tempo de mira',up:false},
  reloadMs:{name:'Tempo de recarga',up:false},drawMs:{name:'Tempo de saque',up:false},mag:{name:'Munição',up:true},move:{name:'Passo mirando',up:true},
  sway:{name:'Balanço da luneta',up:false},flash:{name:'Clarão do tiro',up:false},loud:{name:'Distância do barulho',up:false},
  pellet:{name:'Abertura do chumbo',up:false},reach:{name:'Comprimento do cano',up:true},
};
export function partEffects(id:PartId):Array<{text:string;good:boolean}> {
  const part=PARTS[id],out:Array<{text:string;good:boolean}>=[];
  if(part.optic)out.push({text:part.optic.zooms&&part.optic.zooms.length>1?`Aumento de ${Math.min(...part.optic.zooms)}x a ${Math.max(...part.optic.zooms)}x`:`Aumento de ${one(part.optic.zoom)}x`,good:true});
  for(const [key,value] of Object.entries(part.mods) as Array<[keyof StatMods,number]>){
    const meta=MOD_TEXT[key],change=key==='mag'?value:value-1;
    if(!meta||Math.abs(change)<.005)continue;
    const percent=Math.round(change*100);
    out.push({text:`${meta.name} ${percent>0?'+':'−'}${Math.abs(percent)}%`,good:(change>0)===meta.up});
  }
  if(part.suppressor)out.push({text:'Tiro abafado',good:true});
  if(part.laser)out.push({text:'Ponto vermelho visível para todos',good:false});
  if(part.light)out.push({text:'Luz para onde a arma aponta',good:true});
  if(part.speedLoader)out.push({text:'Revólver: recarga inteira de uma vez',good:true});
  if(part.hold==='pistol')out.push({text:'Segura com as duas mãos à frente, sem coronha',good:true});
  return out;
}
