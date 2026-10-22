import { z } from 'zod';
export * from './character.js';
export * from './admin.js';
export * from './jukebox.js';
import type {JukeboxState} from './jukebox.js';
import type {CharacterConfig} from './character.js';

export const TICK_MS = 50;
export const PATCH_MS = 100;
export const AOI_RADIUS = 18;
export const CHAT_RADIUS = 12;
export { WALK_SPEED, RUN_SPEED, OLD_CANE_SPEED, PLAYER_RADIUS, PLAYER_HEIGHT, WORLD, MAP_MARKERS, MAP_COLLIDERS, MAP_SURFACES, CAFE_TABLES, BLACKJACK_TABLE, BLACKJACK_SEATS, JUKEBOX, COLLIDERS, INTERACTABLES, COUNTER_FOOTPRINT, floorHeight, isWalkable, movePlayer, distance, nearestInteraction, canInteract, interactionReach, findSpawn, standingPosition, cameraFraction } from './world.js';
export type AnimationState = 'idle' | 'walk' | 'run' | 'sit' | 'dance' | 'drink' | 'kick' | 'fallen' | 'deal' | 'shuffle' | 'bartend';
// Durations of the source FBX clips (tools/convert-animations.mjs).
export const KICK_DURATION_MS = 2000;
export const DRINK_DURATION_MS = 8867;
export const BARTEND_DURATION_MS = 13567;
// Player models (apps/web/public/models/<id>.glb), all rigged to one skeleton so they share the animations.
export const SKINS = [{id:'nathan',name:'Nathan'},{id:'leandro',name:'Leandro'},{id:'rafael',name:'Rafael'},{id:'read',name:'Read'}] as const;
export type PremiumSkinId = typeof SKINS[number]['id'];
export type SkinId = PremiumSkinId | 'custom';
export const DEFAULT_SKIN: SkinId = 'custom';
export const skinSchema = z.enum(['custom',...SKINS.map(skin=>skin.id)] as [SkinId,...SkinId[]]);
export const skinMessageSchema = z.object({skin:skinSchema}).strict();
export type EventType = 'BLACKOUT' | 'DRUNK_NPC' | 'PARTY';
export interface Position { x: number; y?: number; z: number }
export interface PlayerInput { seq: number; dx: number; dz: number; running: boolean; rotation: number }
export const inputSchema = z.object({seq:z.number().int().min(0).max(2147483647),dx:z.number().finite().min(-1).max(1),dz:z.number().finite().min(-1).max(1),running:z.boolean(),rotation:z.number().finite().min(-Math.PI*2).max(Math.PI*2)}).strict();
export interface PublicUser { id: string; username: string; displayName: string; email: string; verified: boolean; role: 'user' | 'admin'; color: string; character?:CharacterConfig|null; equippedSkin?:string; isOwner?:boolean }
export interface PlayerState extends Position { id: string; displayName: string; color: string; skin: string; character?:string; oldWalk?:boolean; rotation: number; animationState: AnimationState; animationStartedAt: number; interactionState: string; currentTableId: string; lastProcessedInput: number; connected: boolean }
export interface NpcState extends Position { id: string; displayName: string; color: string; rotation: number; animationState: AnimationState; animationStartedAt: number; behavior: string }
export interface Card { rank: string; suit: string }
export interface BlackjackSeat { playerId: string; displayName: string; cards: Card[]; total: number; status: string; result: string }
export interface BlackjackTable { id: string; phase: 'waiting' | 'playing' | 'dealer' | 'results'; seats: BlackjackSeat[]; dealerCards: Card[]; dealerTotal: number; turnPlayerId: string; deadline: number; roundId: string }
export interface ActiveEvent { id: string; type: EventType | ''; startedAt: number; durationMs: number }
export interface WorldState { players: Record<string,PlayerState>; npcs: Record<string,NpcState>; tables: Record<string,BlackjackTable>; jukeboxes?:Record<string,JukeboxState>; event: ActiveEvent; occupancy: number; capacity: number; serverTime: number }
export interface ChatMessage { id:string; playerId:string; displayName:string; text:string; sentAt:number; system?:boolean }
/** Collision boxes the player touches to use an object; chairs have none and are reached at their seat point. */
export type Footprint = Pick<Collider,'id'|'x'|'z'|'hx'|'hz'>;
export interface Interactable extends Position { id:string; type:'seat'|'counter'|'jukebox'|'blackjack'; label:string; rotation?:number; footprint?:Footprint[] }
export interface Collider extends Position { id:string; hx:number; hz:number; minY?:number; maxY?:number; ramp?:boolean }
export interface Seat extends Position { rotation:number }
