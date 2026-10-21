import { z } from 'zod';

export const TICK_MS = 50;
export const PATCH_MS = 100;
export const AOI_RADIUS = 18;
export const CHAT_RADIUS = 12;
export const WALK_SPEED = 3.5;
export const RUN_SPEED = 6;
export const PLAYER_RADIUS = 0.34;
export const WORLD = { minX: -14, maxX: 14, minZ: -11, maxZ: 11 } as const;
export type AnimationState = 'idle' | 'walk' | 'run' | 'sit' | 'dance' | 'drink';
export type EventType = 'BLACKOUT' | 'DRUNK_NPC' | 'PARTY';
export interface Position { x: number; z: number }
export interface PlayerInput { seq: number; dx: number; dz: number; running: boolean; rotation: number }
export const inputSchema = z.object({seq:z.number().int().min(0).max(2147483647),dx:z.number().finite().min(-1).max(1),dz:z.number().finite().min(-1).max(1),running:z.boolean(),rotation:z.number().finite().min(-Math.PI*2).max(Math.PI*2)}).strict();
export interface PublicUser { id: string; username: string; displayName: string; email: string; verified: boolean; role: 'user' | 'admin'; color: string }
export interface PlayerState extends Position { id: string; displayName: string; color: string; rotation: number; animationState: AnimationState; interactionState: string; currentTableId: string; lastProcessedInput: number; connected: boolean }
export interface NpcState extends Position { id: string; displayName: string; color: string; rotation: number; animationState: AnimationState; behavior: string }
export interface Card { rank: string; suit: string }
export interface BlackjackSeat { playerId: string; displayName: string; cards: Card[]; total: number; status: string; result: string }
export interface BlackjackTable { id: string; phase: 'waiting' | 'playing' | 'dealer' | 'results'; seats: BlackjackSeat[]; dealerCards: Card[]; dealerTotal: number; turnPlayerId: string; deadline: number; roundId: string }
export interface ActiveEvent { id: string; type: EventType | ''; startedAt: number; durationMs: number }
export interface WorldState { players: Record<string,PlayerState>; npcs: Record<string,NpcState>; tables: Record<string,BlackjackTable>; event: ActiveEvent; occupancy: number; capacity: number; serverTime: number }
export interface ChatMessage { id:string; playerId:string; displayName:string; text:string; sentAt:number; system?:boolean }
export interface Interactable extends Position { id:string; type:'seat'|'counter'|'jukebox'|'blackjack'; label:string; rotation?:number }
export const INTERACTABLES: readonly Interactable[] = [
  {id:'blackjack-1',type:'blackjack',label:'Jogar blackjack',x:5,z:-3},
  {id:'counter',type:'counter',label:'Pedir uma bebida',x:-7,z:-5},
  {id:'jukebox',type:'jukebox',label:'Tocar a jukebox',x:10,z:-8},
  {id:'seat-1',type:'seat',label:'Sentar',x:-5,z:3,rotation:0},
  {id:'seat-2',type:'seat',label:'Sentar',x:-8,z:3,rotation:0},
  {id:'seat-3',type:'seat',label:'Sentar',x:4,z:5,rotation:Math.PI},
  {id:'seat-4',type:'seat',label:'Sentar',x:7,z:5,rotation:Math.PI}
];
// Rectangles shared by server movement and rendered geometry.
export const COLLIDERS = [
  {id:'bar',x:-7,z:-7,hx:4.3,hz:0.85},
  {id:'blackjack',x:5,z:-3,hx:2.0,hz:0.9},
  {id:'table-left',x:-6.5,z:4.7,hx:0.9,hz:0.7},
  {id:'table-right',x:5.5,z:3.4,hx:0.9,hz:0.7},
  {id:'jukebox',x:10,z:-9,hx:0.65,hz:0.5}
] as const;
export function isWalkable(x:number,z:number):boolean {
  return x>=WORLD.minX+PLAYER_RADIUS&&x<=WORLD.maxX-PLAYER_RADIUS&&z>=WORLD.minZ+PLAYER_RADIUS&&z<=WORLD.maxZ-PLAYER_RADIUS&&!COLLIDERS.some(c=>Math.abs(x-c.x)<c.hx+PLAYER_RADIUS&&Math.abs(z-c.z)<c.hz+PLAYER_RADIUS);
}
export function movePlayer(position:Position,input:Pick<PlayerInput,'dx'|'dz'|'running'>,dt=TICK_MS/1000):Position {
  const magnitude=Math.hypot(input.dx,input.dz);
  const scale=(input.running?RUN_SPEED:WALK_SPEED)*Math.min(dt,0.1)/Math.max(1,magnitude);
  let x=position.x,z=position.z;
  const nextX=x+input.dx*scale,nextZ=z+input.dz*scale;
  if(isWalkable(nextX,z)) x=nextX;
  if(isWalkable(x,nextZ)) z=nextZ;
  return {x,z};
}
export function distance(a:Position,b:Position):number {return Math.hypot(a.x-b.x,a.z-b.z);}
export function nearestInteraction(position:Position):Interactable|undefined {return [...INTERACTABLES].filter(i=>distance(i,position)<3.1).sort((a,b)=>distance(a,position)-distance(b,position))[0];}
