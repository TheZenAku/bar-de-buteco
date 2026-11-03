import {gpsRoute,routeLength,routeProgress,type Position} from '@bar/shared';

export type GpsSource='waypoint'|'delivery'|'bike';
export interface GpsTarget extends Position {source:GpsSource;label:string}
/** Further than this from the way (metres, wider than a road's half), the player has left it, and it is worked out again from where they are, at most this often (ms). */
const OFF_ROUTE=9,REROUTE_MS=400;
/** How often (ms) the player's place is read: the room tells it ten times a second. */
const CHECK_MS=90;
/** The stretch ahead (metres) the player is looked for on first, so a later part of the way passing close by (the far side of a turn back) does not eat what lies between. */
const STRETCH=40;
/** The line meets the way this far ahead (metres) of the point nearest the player. */
const JOIN=4;
/** A waypoint within this many metres has been reached. */
const ARRIVED=9;
type Way=Array<[number,number]>;
const stretch=(way:Way,metres:number):Way=>{
  let left=metres;
  for(let i=1;i<way.length;i++){left-=Math.hypot(way[i]![0]-way[i-1]![0],way[i]![1]-way[i-1]![1]);if(left<=0)return way.slice(0,i+1);}
  return way;
};
/** The way from this many metres along it. */
function along(way:Way,metres:number):Way {
  let left=metres;
  for(let i=1;i<way.length;i++){
    const [ax,az]=way[i-1]!,[bx,bz]=way[i]!,span=Math.hypot(bx-ax,bz-az);
    if(span>=left&&span>0)return [[ax+(bx-ax)*left/span,az+(bz-az)*left/span],...way.slice(i)];
    left-=span;
  }
  return way.slice(-1);
}

/**
 * The GPS: one line from the player to where they want to go, in the minimap and on the phone's map. An order under way
 * goes before anything the player marked, and the mark comes back when the order ends.
 */
export function createGps(hooks:{changed:()=>void;arrived:(target:GpsTarget)=>void}){
  // `way` is what is left of the planned way, from the point nearest the player; `route` is what is drawn, the player and then the way.
  // How far the player is from the way can only be read on `way`: the line starts at the player, so they are never far from it.
  let delivery:GpsTarget|undefined,waypoint:GpsTarget|undefined,way:Way=[],route:Way=[],routeFor:GpsTarget|undefined,checkedAt=0,routedAt=0,version=0,lastX=NaN,lastZ=NaN;
  const target=()=>delivery??waypoint;
  function draw(from:{x:number;z:number},now:number):void {
    const goal=target();
    routeFor=goal;routedAt=now;version++;
    way=goal?gpsRoute(from,goal)?.points??[[from.x,from.z],[goal.x,goal.z]]:[];
    route=way;
    hooks.changed();
  }
  const same=(a:GpsTarget|undefined,b:GpsTarget|undefined)=>a?.x===b?.x&&a?.z===b?.z&&a?.source===b?.source;
  return {
    get target(){return target();},
    get waypoint(){return waypoint;},
    /** Changes with each new line, for whoever draws it. */
    get version(){return version;},
    /** The line, the first point being where the player is. */
    get route():ReadonlyArray<readonly [number,number]>{return route;},
    get remaining(){return routeLength(route);},
    setWaypoint(next:GpsTarget|null):void {if(same(waypoint,next??undefined))return;waypoint=next??undefined;routeFor=undefined;hooks.changed();},
    setDelivery(next:GpsTarget|null):void {if(same(delivery,next??undefined))return;delivery=next??undefined;routeFor=undefined;hooks.changed();},
    /** Follows the player: eats the way as they go along it, and works out a new one as soon as they leave it. */
    update(x:number,z:number,now=performance.now()):void {
      if(now-checkedAt<CHECK_MS)return;
      checkedAt=now;
      const goal=target();
      if(!goal){if(route.length){way=[];route=[];routeFor=undefined;version++;hooks.changed();}return;}
      if(goal.source!=='delivery'&&Math.hypot(goal.x-x,goal.z-z)<ARRIVED){waypoint=undefined;if(goal.source==='waypoint')hooks.arrived(goal);routeFor=undefined;draw({x,z},now);return;}
      if(!same(routeFor,goal)||way.length<2){draw({x,z},now);return;}
      if(x===lastX&&z===lastZ)return;
      lastX=x;lastZ=z;
      let near=routeProgress(stretch(way,STRETCH),x,z);
      // Off the stretch ahead: a shortcut back onto the way further along, or out of it.
      if(near.distance>OFF_ROUTE)near=routeProgress(way,x,z);
      if(near.distance>OFF_ROUTE&&now-routedAt>=REROUTE_MS){draw({x,z},now);return;}
      // What is behind the player leaves the way.
      const [ax,az]=way[near.segment]!,[bx,bz]=way[near.segment+1]!;
      way=[[ax+(bx-ax)*near.t,az+(bz-az)*near.t],...way.slice(near.segment+1)];
      route=[[x,z],...along(way,JOIN)];
      version++;hooks.changed();
    },
    reset():void {delivery=undefined;waypoint=undefined;way=[];route=[];routeFor=undefined;version++;},
  };
}
export type Gps=ReturnType<typeof createGps>;
