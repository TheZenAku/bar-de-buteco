import {z} from 'zod';
import {RAREST,RARITIES,RARITY_INFO,type Rarity} from './rarity.js';
import {skinBase} from './skins.js';

/** The player's profile window (docs/sistemas/perfil.md): status message, badges on show and each skin's skills. */
export const PROFILE={statusMax:60,shownBadges:6,badgeNameMax:32,badgeDescriptionMax:140,badgeImageSide:256,badgeImageMaxBytes:300_000} as const;

/** How hard a badge is to get. Its card shows this; the rarest is also studded with glitter (apps/web/src/profile/badge-card.ts). */
export const BADGE_RARITIES=RARITIES;
export type BadgeRarity=Rarity;
export const RAREST_BADGE:BadgeRarity=RAREST;
export const BADGE_RARITY_INFO=RARITY_INFO;
/** A badge a player earns in the city. The catalog lives in the database and is managed in the administration. */
export interface Badge {id:string;name:string;description:string;icon:string;color:string;rarity:BadgeRarity;
  /** A PNG sent in the administration; in the medal, it takes the icon's place. */
  image:string|null}
/** A badge image's id: the SHA-256 of the file. */
export const BADGE_IMAGE_ID=/^[0-9a-f]{64}$/;
/** The icons a badge can carry (apps/web/src/ui-icons.ts). */
export const BADGE_ICONS=['trophy','shield','heart','bolt','sparkles','party','flame','beer','music','mic','cards','ball','bike','wrench','coins','gift','moon','sun','compass','ghost','hand','flag','key','seat','food','smoke','toilet','dizzy','briefcase','clock','chat','messageCircle','gram','transfer','phone'] as const;

// Durations of the source FBX clips (tools/assets/convert-animations.mjs).
export const KICK_DURATION_MS = 2000;
export const AIR_KICK_DURATION_MS = 2900;
/** What a character can do besides what every skin does, in all its variants, once bought. `clip` is only in the animation banks of that character's skins. */
export interface Skill {id:string;skin:string;name:string;description:string;clip:string;durationMs:number;icon:string;rarity:Rarity;price:number}
export const SKILLS:readonly Skill[]=[
  {id:'karate',skin:'rafael',name:'Golpe de karatê',description:'Um golpe rápido, com os pés no chão. Quem leva voa longe e perde 6 de vida.',clip:'Kick',durationMs:KICK_DURATION_MS,icon:'kick',rarity:'rare',price:500},
  {id:'air-kick',skin:'rafael',name:'Chute voador',description:'Salta, acerta com os dois pés e cai de costas no chão. Quem leva voa mais longe ainda e perde 10 de vida.',clip:'AirKick',durationMs:AIR_KICK_DURATION_MS,icon:'bolt',rarity:'epic',price:800},
];
export const skillById=(id:string|undefined):Skill|undefined=>SKILLS.find(skill=>skill.id===id);
export const skillsOf=(skin:string|undefined):readonly Skill[]=>{const base=skin?skinBase(skin):undefined;return SKILLS.filter(skill=>skill.skin===base);};

/** The skill a skin has active and the key that plays it. */
export interface SkillLoadout {skill:string;key:string}
export type SkillLoadouts=Record<string,SkillLoadout>;
const DEFAULT_SKILL_KEY='KeyX';
/** What the player chose for this skin's character, else the first skill they own on X; undefined when they own none of its skills. */
export function loadoutOf(loadouts:SkillLoadouts|undefined,skin:string|undefined,owned:readonly string[]):SkillLoadout|undefined {
  const skills=skillsOf(skin).filter(skill=>owned.includes(skill.id)),saved=skin?loadouts?.[skinBase(skin)]:undefined;
  if(!skills.length)return undefined;
  return {skill:skills.some(skill=>skill.id===saved?.skill)?saved!.skill:skills[0]!.id,key:saved&&isSkillKey(saved.key)?saved.key:DEFAULT_SKILL_KEY};
}
// The keys the game uses on foot (BarScene and main.ts). On a bike Z, X, C and H are its switches, and they win there.
const TAKEN_KEYS=new Set(['KeyW','KeyA','KeyS','KeyD','KeyE','KeyG','KeyV','KeyF','KeyC','KeyQ','KeyT','KeyM','KeyI','KeyB','KeyP','KeyK','KeyJ']);
/** A letter or number the game does not use for anything else on foot. */
export const isSkillKey=(code:string):boolean=>/^(?:Key[A-Z]|Digit\d|Numpad\d)$/.test(code)&&!TAKEN_KEYS.has(code);
export const isTakenKey=(code:string):boolean=>TAKEN_KEYS.has(code);
/** KeyX → X, Digit1 → 1, Numpad1 → Num 1. */
export const keyLabel=(code:string):string=>code.startsWith('Key')?code.slice(3):code.startsWith('Digit')?code.slice(5):code.startsWith('Numpad')?`Num ${code.slice(6)}`:code;

/** GET /api/profile/:id. `owned`, `loadouts` and `ownedSkills` come only in the player's own. */
export interface ProfileView {
  id:string;name:string;color:string;skin:string;status:string;mine:boolean;
  handle:string;photo?:number;number:string;saved:boolean;
  /** On show, in the order chosen. */
  badges:Badge[];
  owned?:Badge[];loadouts?:SkillLoadouts;ownedSkills?:string[];
}
/** A row of the administration's catalog: how many players have it. */
export interface AdminBadge extends Badge {holders:number}
export interface AdminBadgeHolder {id:string;name:string;grantedAt:string}

export const profileStatusSchema=z.object({status:z.string().trim().max(PROFILE.statusMax,`Use até ${PROFILE.statusMax} caracteres.`).regex(/^[^\p{C}]*$/u,'A mensagem tem caracteres inválidos.')}).strict();
export const profileBadgesSchema=z.object({badges:z.array(z.string().min(1).max(40)).max(PROFILE.shownBadges,`Escolha até ${PROFILE.shownBadges} emblemas.`)}).strict()
  .refine(body=>new Set(body.badges).size===body.badges.length,'Emblema repetido.');
export const profileSkillSchema=z.object({skill:z.string().min(1).max(32),key:z.string().max(16).refine(isSkillKey,'Esta tecla já é usada pelo jogo.')}).strict();
export const badgeSchema=z.object({
  name:z.string().trim().min(2,'Dê um nome ao emblema.').max(PROFILE.badgeNameMax),description:z.string().trim().min(3,'Descreva o emblema.').max(PROFILE.badgeDescriptionMax),
  icon:z.enum(BADGE_ICONS),color:z.string().regex(/^#[0-9a-f]{6}$/i,'Cor inválida.'),rarity:z.enum(BADGE_RARITIES,{error:'Raridade inválida.'}).optional(),image:z.string().regex(BADGE_IMAGE_ID,'Imagem inválida.').nullable().optional(),
}).strict();
