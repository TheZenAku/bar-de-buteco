import roads from './city-roads.json';

/**
 * The city's street graph (cidade_vias.json, in the game's axes): crossings and the streets between them, for routes and future
 * traffic. Kept apart from the package's index: nothing that runs in the browser needs it yet.
 */
export interface RoadEdge {a:number;b:number;type:string;width:number;median:number;oneWay:boolean;name:string}
export const ROAD_NODES:ReadonlyArray<readonly [number,number]>=roads.nodes as Array<[number,number]>;
export const ROAD_EDGES:readonly RoadEdge[]=(roads.edges as number[][]).map(([a,b,type,width,median,oneWay,name])=>({
  a:a!,b:b!,type:roads.types[type!]!,width:width!,median:median!,oneWay:!!oneWay,name:roads.names[name!]!,
}));
const neighbours=new Map<number,Array<{to:number;edge:RoadEdge;length:number}>>();
for(const edge of ROAD_EDGES){
  const [ax,az]=ROAD_NODES[edge.a]!,[bx,bz]=ROAD_NODES[edge.b]!,length=Math.hypot(bx-ax,bz-az);
  for(const [from,to] of [[edge.a,edge.b],[edge.b,edge.a]] as const){
    const list=neighbours.get(from)??[];list.push({to,edge,length});neighbours.set(from,list);
  }
}
/** The crossing nearest a point, among those with a street. */
export function nearestRoadNode(x:number,z:number):number {
  let best=-1,distance=Infinity;
  for(const node of neighbours.keys()){
    const [nx,nz]=ROAD_NODES[node]!,d=Math.hypot(nx-x,nz-z);
    if(d<distance){distance=d;best=node;}
  }
  return best;
}
/** Shortest way along the streets, as crossings; undefined when they do not connect. */
export function roadRoute(from:number,to:number):number[]|undefined {
  const cost=new Map([[from,0]]),previous=new Map<number,number>(),open=new Set([from]);
  while(open.size){
    let node=-1,least=Infinity;
    for(const candidate of open){const c=cost.get(candidate)!;if(c<least){least=c;node=candidate;}}
    open.delete(node);
    if(node===to){
      const route=[to];
      for(let at=to;previous.has(at);)route.unshift(at=previous.get(at)!);
      return route;
    }
    for(const {to:next,length} of neighbours.get(node)??[]){
      if(least+length<(cost.get(next)??Infinity)){cost.set(next,least+length);previous.set(next,node);open.add(next);}
    }
  }
}
