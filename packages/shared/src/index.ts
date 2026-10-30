import { z } from 'zod';
export * from './admin.js';
export * from './jukebox.js';
export * from './voice.js';
export * from './doors.js';
export * from './needs.js';
export * from './inventory.js';
export * from './economy.js';
export * from './musicians.js';
export * from './bar-animations.js';
export * from './phone.js';
export * from './stage-show.js';
export * from './prices.js';
import type {JukeboxState} from './jukebox.js';
import type {JobSlotsView,ServedItemState} from './economy.js';
import type {MusicianState} from './musicians.js';
import type {StageShowState} from './stage-show.js';

export const TICK_MS = 50;
export const PATCH_MS = 100;
export const AOI_RADIUS = 18;
export const CHAT_RADIUS = 12;
export { WALK_SPEED, RUN_SPEED, OLD_CANE_SPEED, PLAYER_RADIUS, PLAYER_HEIGHT, WORLD, MAP_MARKERS, MAP_EFFECTS, MAP_COLLIDERS, MAP_SURFACES, CAFE_TABLES, tableByNumber, type CafeTable, BLACKJACK_TABLE, BLACKJACK_SEATS, JUKEBOX, COLLIDERS, INTERACTABLES, COUNTER_FOOTPRINT, TV_SPOTS, STAGE, STAGE_ENTRY, STAGE_AREA, inStageArea, SHOP_SPOT, SHOP_REACH, MUSICIAN_REACH, MUSICIAN_ROLES, musicianRole, onStage, hasStagePass, solidColliders, isDoorOpen, setDoorStates, floorHeight, isWalkable, movePlayer, distance, nearestInteraction, canInteract, interactionReach, findSpawn, standingPosition, cameraFraction, sightBlocked } from './world.js';
export type AnimationState = 'idle' | 'walk' | 'run' | 'sit' | 'dance' | 'wave' | 'use' | 'wait' | 'toilet'
  | 'drink' | 'kick' | 'stumble' | 'fallen' | 'recover' | 'deal' | 'shuffle' | 'bartend'
  /** Playing at one of the stage's musicians' spots (BarState.musicians says which, and the phase). */
  | 'stage'
  /** The bar animations (bar-animations.ts): getting up from a chair, a urinal, a cigarette lit and put out, a whole
   *  cigarette smoked, being sick, clearing a table from its corner, and Magrão serving at the counter. */
  | 'stand-up' | 'urinate' | 'smoke' | 'smoke-stop' | 'cigarette' | 'vomit' | 'clean' | 'serve-chopp' | 'serve-chopp-dark' | 'serve-longneck';
// Durations of the source FBX clips (tools/assets/convert-animations.mjs).
export const KICK_DURATION_MS = 2000;
export const DRINK_DURATION_MS = 8867;
export const BARTEND_DURATION_MS = 13567;
export const WAVE_DURATION_MS = 1467;
export const USE_DURATION_MS = 2000;
export const RECOVER_DURATION_MS = 5000;
/** What Seu Zé serves: a long neck bottle or a copo de chopp (apps/web/public/props). */
export const DRINK_ITEMS = ['garrafa', 'copo'] as const;
export type DrinkItem = typeof DRINK_ITEMS[number];
/** Every drink held in the hand while drinking: the counter's beers and the drinks from the backpack. */
export const HELD_DRINKS = [...DRINK_ITEMS, 'agua', 'refrigerante', 'cafe'] as const;
export type HeldDrink = typeof HELD_DRINKS[number];
// Player models (apps/web/public/models/<id>.glb), all rigged to one skeleton so they share the animations.
export const SKINS = [{id:'nathan',name:'Nathan'},{id:'leandro',name:'Leandro'},{id:'rafael',name:'Rafael'},{id:'read',name:'Read'},{id:'gilmar-gordo',name:'Gilmar'}] as const;
export type SkinId = typeof SKINS[number]['id'];
/** Free for every account: new players wear it, and anything not owned falls back to it. The others are sold. */
export const DEFAULT_SKIN: SkinId = 'nathan';
export const skinSchema = z.enum(SKINS.map(skin=>skin.id) as [SkinId,...SkinId[]]);
export const skinMessageSchema = z.object({skin:skinSchema}).strict();
/** The account's collection and wallet, as GET /api/wardrobe returns it. */
export interface Wardrobe {
  equippedSkin:string;balance:number;
  catalog:Array<{id:string;name:string;price:number;owned:boolean}>;
  dailyReward:number;dailyClaimed:boolean;
}
export type EventType = 'BLACKOUT' | 'DRUNK_NPC' | 'PARTY';
export interface Position { x: number; y?: number; z: number }
export interface PlayerInput { seq: number; dx: number; dz: number; running: boolean; rotation: number }
export const inputSchema = z.object({seq:z.number().int().min(0).max(2147483647),dx:z.number().finite().min(-1).max(1),dz:z.number().finite().min(-1).max(1),running:z.boolean(),rotation:z.number().finite().min(-Math.PI*2).max(Math.PI*2)}).strict();
export interface PublicUser { id: string; username: string; displayName: string; email: string; verified: boolean; role: 'user' | 'admin'; color: string; equippedSkin?:string; isOwner?:boolean }
export interface PlayerState extends Position { id: string; displayName: string; color: string; skin: string; oldWalk?:boolean; rotation: number; animationState: AnimationState; animationStartedAt: number; /** Which dance G plays, drawn at random: the client takes it modulo its dance clips. */ dance?: number; interactionState: string; currentTableId: string; lastProcessedInput: number; connected: boolean; /** Microphone switched on (proximity voice). */ voice?: boolean; /** The drink ordered at the counter, until Magrão serves it. */ drinkItem?: string;
  /** What the player has in hand and is having (a drink from the counter, anything eaten or drunk from the backpack), and
   *  since/until when (server clock): the same time as at a table (consumeMs). They walk around meanwhile. */
  holding?: string; holdingSince?: number; holdingUntil?: number;
  /** Needs, as whole points (see needs.ts); condition: normal, stumbling, fainted or recovering. */
  hp?: number; hpMax?: number; stamina?: number; hunger?: number; thirst?: number; bladder?: number; drunk?: number;
  exhausted?: boolean; condition?: string; conditionUntil?: number; faintCause?: string;
  /** The job being worked, '' otherwise (economy.ts). */ job?: string;
  /** 'call' while on a phone call (phone.ts), so the others see who is on the line. */ phone?: string;
  /** Until when (server clock, ms) the stage pass lasts; 0 without one (STAGE_PASS in economy.ts). */ stageUntil?: number;
  /** A worker's tray (a table order taken for a customer), like Tonico's: comma-separated items and the order's id. */
  carrying?: string; carryingOrder?: string }
export interface NpcState extends Position { id: string; displayName: string; color: string; rotation: number; animationState: AnimationState; animationStartedAt: number; behavior: string;
  /** Tonico's tray: the order's items, comma-separated ('' when empty), and that order's id. */
  carrying?: string; carryingOrder?: string }
export interface Card { rank: string; suit: string }
export interface BlackjackSeat { playerId: string; displayName: string; cards: Card[]; total: number; status: string; result: string }
export interface BlackjackTable { id: string; phase: 'waiting' | 'playing' | 'dealer' | 'results'; seats: BlackjackSeat[]; dealerCards: Card[]; dealerTotal: number; turnPlayerId: string; deadline: number; roundId: string }
export interface ActiveEvent { id: string; type: EventType | ''; startedAt: number; durationMs: number }
export interface WorldState { players: Record<string,PlayerState>; npcs: Record<string,NpcState>; tables: Record<string,BlackjackTable>; jukeboxes?:Record<string,JukeboxState>; televisions?:Record<string,JukeboxState>; doors?:Record<string,{id:string;open:boolean;changedAt:number}>; jobs?:Record<string,JobSlotsView>; served?:Record<string,ServedItemState>;
  /** The stage's musicians' spots, by spot id (musicians.ts). */
  musicians?:Record<string,MusicianState>;
  /** The stage show's settings from the light desk (stage-show.ts). */
  stageShow?:StageShowState; event: ActiveEvent; occupancy: number; capacity: number; serverTime: number }
export interface ChatMessage { id:string; playerId:string; displayName:string; text:string; sentAt:number; system?:boolean }
/** Collision boxes the player touches to use an object; chairs have none and are reached at their seat point. */
export type Footprint = Pick<Collider,'id'|'x'|'z'|'hx'|'hz'>;
export interface Interactable extends Position { id:string; type:'seat'|'counter'|'jukebox'|'blackjack'|'door'|'television'|'toilet'|'urinal'|'stage'|'musician'|'shop'|'lights'; label:string; rotation?:number; footprint?:Footprint[];
  /** Without a footprint: how far from the point (metres) the player's centre may be; a chair's seat point by default. */
  reach?:number;
  /** A musician's spot on the stage (STAGE_SPOTS id). */
  spot?:string;
  /** The media system (jukebox or TV group) this object controls. */
  media?:string;
  /** A seat's table number, as written on the table (CAFE_TABLES). */
  table?:number;
  /** A seat on a picnic table's bench (no chair to pull; onBench). */
  bench?:boolean }
export interface Collider extends Position { id:string; hx:number; hz:number; minY?:number; maxY?:number; ramp?:boolean }
export interface Seat extends Position { rotation:number }
