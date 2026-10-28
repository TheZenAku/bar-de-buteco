import {isMainThread,parentPort} from 'node:worker_threads';
import {INTERACTABLES,JOBS,canInteract,onStage,setDoorStates,stationInteractable,type Interactable} from '@bar/shared';
import {findPath} from '../../apps/server/src/world/navigation.js';

/**
 * The bots' A* (tests/load/bots.ts), on a worker thread: a search takes 30–350 ms on a small machine, and seconds when
 * the goal cannot be reached, which on the main thread would freeze the inputs of every bot at once.
 */
export type Point = {x:number;y:number;z:number};
/** What a bot walks to: an object to touch, a job station, or a point (within `radius`, on its floor). */
export type Goal = {kind:'object';id:string}|{kind:'station';id:string}|{kind:'point';x:number;y:number;z:number;radius:number};
export interface PlanRequest {id:number;from:Point;goal:Goal;doors:Array<[string,boolean]>}
export interface PlanResult {id:number;path?:Point[];ms:number}

// The room accepts 0.3 m of drift; some toilets and a fridge are only touched near that edge, so the bots take 0.2 m.
const SLACK=.2;
const object=(goal:Goal):Interactable|undefined=>goal.kind==='object'?INTERACTABLES.find(i=>i.id===goal.id)
  :goal.kind==='station'?(s=>s&&stationInteractable(s))(JOBS.flatMap(job=>job.stations).find(s=>s.id===goal.id)):undefined;

/** Where the search heads for, and whether a body standing at `p` has arrived. */
export function target(goal:Goal):{point:Point;arrived:(p:Point)=>boolean}{
  if(goal.kind==='point')return {point:goal,arrived:p=>Math.hypot(p.x-goal.x,p.z-goal.z)<=goal.radius&&Math.abs(p.y-goal.y)<.3};
  const found=object(goal);
  if(!found)throw new Error(`Destino desconhecido: ${goal.id}`);
  return {point:{x:found.x,y:found.y??.3,z:found.z},arrived:p=>canInteract(found,p,SLACK)&&(found.type!=='musician'||onStage(p))};
}
export const goalKey=(goal:Goal)=>goal.kind==='point'?`point:${goal.x.toFixed(1)},${goal.y.toFixed(1)},${goal.z.toFixed(1)}`:`${goal.kind}:${goal.id}`;

if(!isMainThread)parentPort!.on('message',({id,from,goal,doors}:PlanRequest)=>{
  const started=performance.now();
  setDoorStates(doors);
  const {point,arrived}=target(goal);
  // Enough for the farthest chair from the pavement (~9k nodes); a goal out of reach gives up in about a second.
  const path=findPath(from,arrived,point,30_000);
  parentPort!.postMessage({id,path,ms:performance.now()-started} satisfies PlanResult);
});
