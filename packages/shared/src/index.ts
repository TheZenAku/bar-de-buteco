import { z } from 'zod';

export const TICK_MS = 50;
export const PATCH_MS = 100;
export const AOI_RADIUS = 18;
export const CHAT_RADIUS = 12;
export const WALK_SPEED = 3.5;
export const RUN_SPEED = 6;
export const PLAYER_RADIUS = 0.34;
// Real-world metres, sized for the 1.86 m player model.
export const WORLD = { minX: -10, maxX: 10, minZ: -7, maxZ: 7 } as const;
export const INTERACTION_RADIUS = 2;
export type AnimationState = 'idle' | 'walk' | 'run' | 'sit' | 'dance' | 'drink';
// Player models (apps/web/public/models/<id>.glb), all rigged to one skeleton so they share the animations.
export const SKINS = [{id:'nathan',name:'Nathan'},{id:'leandro',name:'Leandro'},{id:'rafael',name:'Rafael'}] as const;
export type SkinId = typeof SKINS[number]['id'];
export const DEFAULT_SKIN: SkinId = 'nathan';
export const skinSchema = z.enum(SKINS.map(skin=>skin.id) as [SkinId,...SkinId[]]);
export const skinMessageSchema = z.object({skin:skinSchema}).strict();
export type EventType = 'BLACKOUT' | 'DRUNK_NPC' | 'PARTY';
export interface Position { x: number; z: number }
export interface PlayerInput { seq: number; dx: number; dz: number; running: boolean; rotation: number }
export const inputSchema = z.object({seq:z.number().int().min(0).max(2147483647),dx:z.number().finite().min(-1).max(1),dz:z.number().finite().min(-1).max(1),running:z.boolean(),rotation:z.number().finite().min(-Math.PI*2).max(Math.PI*2)}).strict();
export interface PublicUser { id: string; username: string; displayName: string; email: string; verified: boolean; role: 'user' | 'admin'; color: string }
export interface PlayerState extends Position { id: string; displayName: string; color: string; skin: string; rotation: number; animationState: AnimationState; interactionState: string; currentTableId: string; lastProcessedInput: number; connected: boolean }
export interface NpcState extends Position { id: string; displayName: string; color: string; rotation: number; animationState: AnimationState; behavior: string }
export interface Card { rank: string; suit: string }
export interface BlackjackSeat { playerId: string; displayName: string; cards: Card[]; total: number; status: string; result: string }
export interface BlackjackTable { id: string; phase: 'waiting' | 'playing' | 'dealer' | 'results'; seats: BlackjackSeat[]; dealerCards: Card[]; dealerTotal: number; turnPlayerId: string; deadline: number; roundId: string }
export interface ActiveEvent { id: string; type: EventType | ''; startedAt: number; durationMs: number }
export interface WorldState { players: Record<string,PlayerState>; npcs: Record<string,NpcState>; tables: Record<string,BlackjackTable>; event: ActiveEvent; occupancy: number; capacity: number; serverTime: number }
export interface ChatMessage { id:string; playerId:string; displayName:string; text:string; sentAt:number; system?:boolean }
export interface Interactable extends Position { id:string; type:'seat'|'counter'|'jukebox'|'blackjack'; label:string; rotation?:number }
export interface Collider extends Position { id:string; hx:number; hz:number }
export interface Seat extends Position { rotation:number }
// Square café tables with a chair on the west and east side of each.
export const CAFE_TABLES: readonly (Position & {id:string})[] = [{id:'a',x:-7.2,z:0.6},{id:'b',x:-3.6,z:2.4},{id:'c',x:3.8,z:2.4},{id:'d',x:7.4,z:0.6}];
// Oval blackjack table; rx/rz are the drawn radii.
export const BLACKJACK_TABLE = {x:4.5,z:-4,rx:0.95,rz:0.55} as const;
// Where the server seats blackjack players: around the front of the oval, facing its centre.
export const BLACKJACK_SEATS: readonly Seat[] = [-54,-18,18,54].map(degrees=>{
  const angle=degrees*Math.PI/180,dx=(BLACKJACK_TABLE.rx+0.43)*Math.sin(angle),dz=(BLACKJACK_TABLE.rz+0.42)*Math.cos(angle);
  return {x:BLACKJACK_TABLE.x+dx,z:BLACKJACK_TABLE.z+dz,rotation:Math.atan2(-dx,-dz)};
});
export const INTERACTABLES: readonly Interactable[] = [
  {id:'blackjack-1',type:'blackjack',label:'Jogar blackjack',x:BLACKJACK_TABLE.x,z:BLACKJACK_TABLE.z},
  {id:'counter',type:'counter',label:'Pedir uma bebida',x:-5.2,z:-3.3},
  {id:'jukebox',type:'jukebox',label:'Tocar a jukebox',x:8.5,z:-5.6},
  ...CAFE_TABLES.flatMap((table,index):Interactable[]=>[
    {id:`seat-${index*2+1}`,type:'seat',label:'Sentar',x:table.x-0.78,z:table.z,rotation:Math.PI/2},
    {id:`seat-${index*2+2}`,type:'seat',label:'Sentar',x:table.x+0.78,z:table.z,rotation:-Math.PI/2}
  ])
];
// Rectangles shared by server movement and rendered geometry. The blackjack rectangle sits inside
// the drawn oval so the seats around it stay walkable.
export const COLLIDERS: readonly Collider[] = [
  {id:'bar',x:-6,z:-4.4,hx:3.6,hz:0.35},
  {id:'blackjack',x:BLACKJACK_TABLE.x,z:BLACKJACK_TABLE.z,hx:0.75,hz:0.42},
  ...CAFE_TABLES.map(table=>({id:`table-${table.id}`,x:table.x,z:table.z,hx:0.4,hz:0.4})),
  {id:'jukebox',x:8.5,z:-6.62,hx:0.45,hz:0.3},
  {id:'bench',x:-9.65,z:5,hx:0.25,hz:1.5}
];
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
export function nearestInteraction(position:Position):Interactable|undefined {return [...INTERACTABLES].filter(i=>distance(i,position)<INTERACTION_RADIUS).sort((a,b)=>distance(a,position)-distance(b,position))[0];}
