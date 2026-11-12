import type {JumpMotion} from './jump.js';
import { z } from 'zod';
import {HEAD_LOOK_YAW,HEAD_LOOK_PITCH,type HeadLook} from './head-look.js';
import {blockCommandSchema,punchCommandSchema,type BlockCommand,type FistState,type PunchCommand} from './fight.js';
import {gunInputSchema,type GunInput,type GunState} from './weapons/index.js';
export * from './head-look.js';
export * from './day.js';
export * from './vr-arms.js';
export * from './admin.js';
export * from './password.js';
export * from './environment.js';
export {rainSurfaceHeight} from './world.js';
export * from './jukebox.js';
export * from './media-links.js';
export * from './voice.js';
export * from './doors.js';
export * from './needs.js';
export * from './inventory.js';
export * from './fireworks.js';
export {solidRayFraction,bulletWorld} from './world.js';
export * from './economy.js';
export * from './musicians.js';
export * from './bar-animations.js';
export * from './smoking.js';
export * from './phone.js';
export * from './rarity.js';
export * from './skins.js';
export * from './profile.js';
export * from './horse.js';
export * from './achievements.js';
export * from './levels.js';
export * from './stage-show.js';
export * from './prices.js';
export * from './blackjack.js';
export * from './foosball.js';
export * from './pool/index.js';
export * from './truco/index.js';
export * from './moto.js';
export * from './vehicle-models.js';
export * from './vehicle-actions.js';
export * from './car-parts.js';
export * from './vehicle-parts.js';
export * from './vehicle-controls.js';
export * from './vehicle-storage.js';
export * from './moto-parts.js';
export * from './moto-crash.js';
export * from './ragdoll.js';
export * from './kick.js';
export * from './fight.js';
export * from './weapons/index.js';
export * from './sparring.js';
export * from './city.js';
export * from './gps.js';
export * from './highfood.js';
export * from './garage.js';
export * from './trade.js';
export * from './factory/index.js';
export * from './machine-shop.js';
export * from './crowd.js';
import type {JukeboxState} from './jukebox.js';
import type {JobSlotsView,ServedItemState} from './economy.js';
import type {MusicianState} from './musicians.js';
import type {StageShowState} from './stage-show.js';
import type {BlackjackPhase} from './blackjack.js';
import type {FoosballTableView} from './foosball.js';
import type {MotoState} from './moto.js';
import type {RagdollStart} from './ragdoll.js';
import type {EnvironmentState} from './environment.js';

export const TICK_MS = 50;
export const PATCH_MS = 100;
export const AOI_RADIUS = 18;
export const CHAT_RADIUS = 12;
export {boxContains,WALK_SPEED,RUN_SPEED,OLD_CANE_SPEED,PLAYER_RADIUS,PLAYER_HEIGHT,WORLD,MAP_MARKERS,MAP_EFFECTS,MAP_COLLIDERS,MAP_SURFACES,CAFE_TABLES,tableByNumber,type CafeTable,BLACKJACK_TABLE,BLACKJACK_SEATS,TRUCO_TABLE,TRUCO_SEATS,JUKEBOX,COLLIDERS,INTERACTABLES,COUNTER_FOOTPRINT,TV_SPOTS,STAGE,STAGE_ENTRY,STAGE_AREA,inStageArea,SHOP_SPOT,SHOP_REACH,MUSICIAN_REACH,MUSICIAN_ROLES,musicianRole,onStage,hasStagePass,solidColliders,isDoorOpen,setDoorStates,floorHeight,floorSurface,isWalkable,movePlayer,FLY,flyPlayer,fallPlayer,distance,nearestInteraction,canInteract,interactionReach,findSpawn,standingPosition,cameraFraction,sightBlocked,roadHeight,groundBelow,solidsBetween} from './world.js';
export {JUMP,jumpMotion,canJump,jumpAnimation,type JumpMotion} from './jump.js';
export type AnimationState = 'idle' | 'walk' | 'run' | 'jump' | 'fall' | 'land' | 'sit' | 'dance' | 'wave' | 'use' | 'wait' | 'toilet'
  | 'horse-idle' | 'horse-walk' | 'horse-gallop' | 'horse-rear'
  /** An administrator flying (B): hovering, and under way. */
  | 'fly-idle' | 'fly' | 'fly-fall'
  /** Highfood: a customer waiting with the phone, thanking for the delivery, and the courier taking the bag from the box. */
  | 'text' | 'thank' | 'pick'
  | 'drink' | 'kick' | 'stumble' | 'fallen' | 'recover' | 'deal' | 'shuffle' | 'bartend'
  /** Playing at one of the stage's musicians' spots (BarState.musicians says which, and the phase). */
  | 'stage'
  /** On a delivery bike (BarState.motos says which). */
  | 'ride'
  /** Thrown from a bike, or hit by one (BarState.ragdolls has the start), and lifting a fallen bike. */
  | 'ragdoll' | 'moto-lift'
  /** The bar animations (bar-animations.ts): getting up from a chair, a urinal, a cigarette lit and put out, a whole
   *  cigarette smoked, being sick, clearing a table from its corner, and Magrão serving at the counter. */
  | 'stand-up' | 'urinate' | 'smoke' | 'smoke-stop' | 'cigarette' | 'vomit' | 'clean' | 'serve-chopp' | 'serve-chopp-dark' | 'serve-longneck';
// Durations of the source FBX clips (tools/assets/convert-animations.mjs).
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
export type EventType = 'BLACKOUT' | 'DRUNK_NPC' | 'PARTY';
export interface Position { x: number; y?: number; z: number }
export interface PlayerInput extends Partial<HeadLook> { seq: number; dx: number; dz: number; running: boolean; rotation: number;jump?:boolean;rear?:boolean;/** Flying only: climb (+1) or sink (-1). */dy?:number;/** Flying only: the vertical part of the camera's aim (see flyPlayer). */aim?:number;
  /** In the fist fight's guard (fight.ts), on every input while it is up; and a punch thrown with this input. */fight?:boolean;punch?:PunchCommand;
  /** In the guard: the block key is held (BLOCK, fight.ts), and on the input that first carries it, how late that press is (blockAt). */block?:boolean;blockAt?:BlockCommand;
  /** The firearm (weapons/protocol.ts): the weapon in hand, aiming, the reload key, the shots fired since the last input. */gun?:GunInput }
export const inputSchema = z.object({seq:z.number().int().min(0).max(2147483647),dx:z.number().finite().min(-1).max(1),dz:z.number().finite().min(-1).max(1),running:z.boolean(),rotation:z.number().finite().min(-Math.PI*2).max(Math.PI*2),headYaw:z.number().finite().min(-HEAD_LOOK_YAW).max(HEAD_LOOK_YAW).optional(),headPitch:z.number().finite().min(-HEAD_LOOK_PITCH).max(HEAD_LOOK_PITCH).optional(),jump:z.boolean().optional(),rear:z.boolean().optional(),dy:z.number().finite().min(-1).max(1).optional(),aim:z.number().finite().min(-1).max(1).optional(),fight:z.boolean().optional(),punch:punchCommandSchema.optional(),block:z.boolean().optional(),blockAt:blockCommandSchema.optional(),gun:gunInputSchema.optional()}).strict();
export interface PublicUser { id: string; username: string; displayName: string; email: string; verified: boolean; role: 'user' | 'admin'; color: string; equippedSkin?:string; isOwner?:boolean }
export interface PlayerState extends Position, Partial<JumpMotion> { id: string; slot?: number; displayName: string; color: string; skin: string; oldWalk?:boolean; rotation: number; animationState: AnimationState; animationStartedAt: number; /** Which dance G plays, drawn at random: the client takes it modulo its dance clips. */ dance?: number; /** The skill being played while animationState is 'kick' (SKILLS). */ skill?: string; interactionState: string; currentTableId: string; lastProcessedInput: number; connected: boolean; /** Microphone switched on (proximity voice). */ voice?: boolean; /** The drink ordered at the counter, until Magrão serves it. */ drinkItem?: string;
  /** What the player has in hand and is having (a drink from the counter, anything eaten or drunk from the backpack), and
   *  since/until when (server clock): the same time as at a table (consumeMs). They walk around meanwhile. */
  holding?: string; holdingSince?: number; holdingUntil?: number;
  smokingSince?:number; smokingStopAt?:number;
  /** F1 upper-body pose. It is independent from locomotion and from the cigarette state. */
  armsCrossed?:boolean;
  fireworkEquipped?:boolean;
  /** Camera-driven head offsets; the body's rotation remains independent. */
  headYaw?:number; headPitch?:number;
  /** A VR player's hands in the body's frame (vr-arms.ts, encodeVrArms); '' when not in VR. */
  vrArms?: string;
  /** Needs, as whole points (see needs.ts); condition: normal, stumbling, fainted or recovering. */
  hp?: number; hpMax?: number; stamina?: number; hunger?: number; thirst?: number; bladder?: number; drunk?: number;
  /** The cores behind hp, stamina, hunger and thirst (the rings): what refills them, and what eating fills. */
  hpCore?: number; staminaCore?: number; hungerCore?: number; thirstCore?: number;
  exhausted?: boolean; condition?: string; conditionUntil?: number; faintCause?: string;
  /** The job being worked, '' otherwise (economy.ts). */ job?: string;
  /** 'call' while on a phone call (phone.ts), so the others see who is on the line. */ phone?: string;
  /** Until when (server clock, ms) the stage pass lasts; 0 without one (STAGE_PASS in economy.ts). */ stageUntil?: number;
  /** A worker's tray (a table order taken for a customer), like Tonico's: comma-separated items and the order's id. */
  carrying?: string; carryingOrder?: string;
  /** A sack from the plant in the arms ('MALTE' | 'MIX'), '' or absent when none. */
  factoryBag?: string;
  /** On a Highfood shift, and the delivery in hand. */
  courier?: boolean; parcel?: string;horseRearAt?:number;
  /** Has the phone in front of them: standing still, they look at it. */
  looking?: boolean;
  /** Level 1-100 (levels.ts); 0 until the API has told the world. */ level?: number;
  /** The fist fight (fight.ts): the guard, the last punch thrown and the last blow taken. */
  fist?: FistState;
  /** The firearm (weapons/protocol.ts, GunState): on with /armas, the weapon in hand, aiming, rounds, reload. */
  gun?: GunState }
export interface NpcState extends Position { id: string; displayName: string; color: string; rotation: number; animationState: AnimationState; animationStartedAt: number; behavior: string;
  /** Tonico's tray: the order's items, comma-separated ('' when empty), and that order's id. */
  carrying?: string; carryingOrder?: string;
  /** A Highfood customer: which body, and the delivery once it is in their hands. */
  skin?: string; parcel?: string }
export interface Card { rank: string; suit: string }
/** A card on the blackjack table; seq is its place in the round's deal (the browsers key and animate cards by it). The
 *  dealer's hole card reads rank '?' until it is turned. */
export interface BlackjackCard extends Card { seq: number }
/** One hand of a seat (more than one after a split). status: playing, done, bust, blackjack, doubled or surrendered;
 *  outcome (once settled): blackjack, win, push, loss, bust or surrender, with what came back (payout, stake included). */
export interface BlackjackHand { cards: BlackjackCard[]; bet: number; total: number; soft: boolean; split: boolean; doubled: boolean; status: string; outcome: string; payout: number }
/** A chair at the table. status: watching (no bet), betting, playing, turn, done or left. result: win, loss or draw for the
 *  round as a whole (net), '' until settled. insurance: coins on it; insured: '' (not offered), pending, taken or declined. */
export interface BlackjackSeat { playerId: string; displayName: string; chair: number; bet: number; lastBet: number; hands: BlackjackHand[];
  insurance: number; insured: string; staked: number; paid: number; net: number; status: string; result: string }
/** turnPlayerId/turnHand: whose decision it is; deadline: when the phase (or that decision) ends, on the server clock. */
export interface BlackjackTable { id: string; phase: BlackjackPhase; round: number; move: number; roundId: string; seats: BlackjackSeat[];
  dealerCards: BlackjackCard[]; dealerTotal: number; dealerSoft: boolean; turnPlayerId: string; turnHand: number; deadline: number; minBet: number; maxBet: number }
export interface ActiveEvent { id: string; type: EventType | ''; startedAt: number; durationMs: number }
export interface WorldState { players: Record<string,PlayerState>; npcs: Record<string,NpcState>; tables: Record<string,BlackjackTable>; jukeboxes?:Record<string,JukeboxState>; televisions?:Record<string,JukeboxState>; doors?:Record<string,{id:string;open:boolean;changedAt:number}>; jobs?:Record<string,JobSlotsView>; served?:Record<string,ServedItemState>;
  fuelServices?:Record<string,import('./refueling.js').FuelServiceState>;
  environment?:EnvironmentState;
  /** The stage's musicians' spots, by spot id (musicians.ts). */
  musicians?:Record<string,MusicianState>;
  /** The stage show's settings from the light desk (stage-show.ts). */
  stageShow?:StageShowState;
  /** The pebolim tables, by id (foosball.ts): lobby, score and phase; the ball and the rods come as frames (foosball.frame). */
  foosball?:Record<string,FoosballTableView>;
  /** The delivery bikes, by id (moto.ts): seen from anywhere on the map. Bought ones have their ownerId. */
  motos?:Record<string,MotoState>;
  /** The bodies flying or lying after a crash, by player (ragdoll.ts): each browser runs the same steps from here. */
  ragdolls?:Record<string,RagdollStart&{startedAt:number}>; event: ActiveEvent; occupancy: number; capacity: number; serverTime: number }
export interface ChatMessage { id:string; playerId:string; displayName:string; text:string; sentAt:number; system?:boolean }
/** Collision boxes the player touches to use an object; chairs have none and are reached at their seat point. */
export type Footprint = Pick<Collider,'id'|'x'|'z'|'hx'|'hz'>;
export interface Interactable extends Position { id:string; type:'seat'|'counter'|'jukebox'|'blackjack'|'truco'|'foosball'|'pool'|'door'|'television'|'toilet'|'urinal'|'stage'|'musician'|'shop'|'lights'|'highfood'|'garage'; label:string; rotation?:number; footprint?:Footprint[];
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
import type {TurnedBox} from './city.js';
/** `hx` and `hz` are the box along x and z. A box turned about the vertical (the city's) also has `turn`, its real shape, and they enclose it. */
export interface Collider extends Position { id:string; hx:number; hz:number; minY?:number; maxY?:number; ramp?:boolean; turn?:TurnedBox }
export interface Seat extends Position { rotation:number }
export type {ServerPerformance} from './performance.js';
export * from './refueling.js';
export * from './death.js';
export * from './morte-frases.js';
