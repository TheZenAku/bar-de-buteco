import {cityZone} from '@bar/shared';
import {ROAD_EDGES,ROAD_NODES} from '@bar/shared/city-roads';

export interface DeliveryTarget {x:number;z:number;label:string;distanceM:number}

/** The plant's own street: too close to the dock is no trip, and the far edge of the map is too long a one. */
const MIN_M=140,MAX_M=640;

/**
 * A random place on the city's roads for a truck to go to: a road junction between MIN_M and MAX_M from `from`, named by its street and its
 * neighbourhood. Junctions are on the roads, so a truck can always get there and stop within the arrival radius. `random` is injectable for tests.
 */
export function pickDeliveryTarget(from:{x:number;z:number},random:()=>number=Math.random,avoid?:{x:number;z:number}):DeliveryTarget {
  const candidates:number[]=[];
  ROAD_NODES.forEach(([x,z],index)=>{
    const d=Math.hypot(x-from.x,z-from.z);
    if(d>=MIN_M&&d<=MAX_M&&(!avoid||Math.hypot(x-avoid.x,z-avoid.z)>60))candidates.push(index);
  });
  // A city with no junction in range (a changed map): any junction at all, farthest first.
  const pool=candidates.length?candidates:ROAD_NODES.map((_,index)=>index).sort((a,b)=>Math.hypot(ROAD_NODES[b]![0]-from.x,ROAD_NODES[b]![1]-from.z)-Math.hypot(ROAD_NODES[a]![0]-from.x,ROAD_NODES[a]![1]-from.z)).slice(0,20);
  const index=pool[Math.floor(random()*pool.length)]!,[x,z]=ROAD_NODES[index]!;
  const street=ROAD_EDGES.find(edge=>(edge.a===index||edge.b===index)&&edge.name)?.name??'';
  const zone=cityZone(x,z);
  return {x:Math.round(x*10)/10,z:Math.round(z*10)/10,label:[street,zone].filter(Boolean).join(' · ')||'Ponto da cidade',distanceM:Math.round(Math.hypot(x-from.x,z-from.z))};
}
