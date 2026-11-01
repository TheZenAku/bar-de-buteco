import {gpsRoute,routeLength,routeProgress,type Position} from '@bar/shared';

export type GpsSource='waypoint'|'delivery'|'bike';
export interface GpsTarget extends Position {source:GpsSource;label:string}
/** Off the line by this much (metres), and at most this often (ms), the route is drawn again from where the player is. */
const REROUTE_DISTANCE=14,REROUTE_MS=1500,CHECK_MS=250;
/** A waypoint within this many metres has been reached. */
const ARRIVED=9;

/**
 * The GPS: one line from the player to where they want to go, in the minimap and on the phone's map. An order under way
 * goes before anything the player marked, and the mark comes back when the order ends.
 */
export function createGps(hooks:{changed:()=>void;arrived:(target:GpsTarget)=>void}){
  let delivery:GpsTarget|undefined,waypoint:GpsTarget|undefined,route:Array<[number,number]>=[],routeFor:GpsTarget|undefined,checkedAt=0,routedAt=0,version=0;
  const target=()=>delivery??waypoint;
  function draw(from:{x:number;z:number},now:number):void {
    const goal=target();
    routeFor=goal;routedAt=now;version++;
    route=goal?gpsRoute(from,goal)?.points??[[from.x,from.z],[goal.x,goal.z]]:[];
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
    /** Follows the player: eats the line as they go along it, draws it again when they leave it. */
    update(x:number,z:number,now=performance.now()):void {
      if(now-checkedAt<CHECK_MS)return;
      checkedAt=now;
      const goal=target();
      if(!goal){if(route.length){route=[];routeFor=undefined;version++;hooks.changed();}return;}
      if(goal.source!=='delivery'&&Math.hypot(goal.x-x,goal.z-z)<ARRIVED){waypoint=undefined;if(goal.source==='waypoint')hooks.arrived(goal);routeFor=undefined;draw({x,z},now);return;}
      if(!same(routeFor,goal)||route.length<2){draw({x,z},now);return;}
      const {distance,segment,t}=routeProgress(route,x,z);
      if(distance>REROUTE_DISTANCE&&now-routedAt>REROUTE_MS){draw({x,z},now);return;}
      // Past a corner, its segment leaves the line.
      route=[[x,z],...route.slice(segment+1)] as Array<[number,number]>;
      void t;
      version++;hooks.changed();
    },
    reset():void {delivery=undefined;waypoint=undefined;route=[];routeFor=undefined;version++;},
  };
}
export type Gps=ReturnType<typeof createGps>;
