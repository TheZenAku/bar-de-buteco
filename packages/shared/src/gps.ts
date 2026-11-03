import data from './gps-data.json';

/**
 * The GPS's map of the whole city (tools/assets/build-gps.ts, from the same floors and solids the bike rides on): a grid where
 * each cell says whether the bike fits there and how much a route wants it. The street graph of cidade_vias.json does not
 * reach the original neighbourhood, where the bar stands, so routes do not come from it.
 */
export const GPS_CELL=data.cell;
const ORIGIN_X=data.originX,ORIGIN_Z=data.originZ,COLUMNS=data.columns,ROWS=data.rows;
/** What a metre costs in each class of cell: 0 no bike fits, 1 the middle of the road, 2 its edges, 3 pavements and yards (only when there is no other way). */
const COST=[Infinity,1,2.2,7] as const;
/** The grid as written by the tool: each row as runs of "<class><length>" joined by commas. */
const classes=new Uint8Array(COLUMNS*ROWS);
data.grid.forEach((row,z)=>{
  let x=0;
  for(const run of row.split(',')){
    const kind=Number(run[0]),length=Number(run.slice(1));
    classes.fill(kind,z*COLUMNS+x,z*COLUMNS+x+length);x+=length;
  }
});
const cellOf=(x:number,z:number)=>{
  const cx=Math.floor((x-ORIGIN_X)/GPS_CELL),cz=Math.floor((z-ORIGIN_Z)/GPS_CELL);
  return cx<0||cz<0||cx>=COLUMNS||cz>=ROWS?-1:cz*COLUMNS+cx;
};
const centreX=(cell:number)=>ORIGIN_X+(cell%COLUMNS+.5)*GPS_CELL,centreZ=(cell:number)=>ORIGIN_Z+(Math.floor(cell/COLUMNS)+.5)*GPS_CELL;
/** The class of the cell under a point (0 off the map). */
export const gpsClass=(x:number,z:number)=>{const cell=cellOf(x,z);return cell<0?0:classes[cell]!;};
/** The open cell nearest a point, in rings around it; `best`: the road's, skipping pavements and yards while one is near. */
function snap(x:number,z:number):number {
  const here=cellOf(Math.max(ORIGIN_X,Math.min(ORIGIN_X+COLUMNS*GPS_CELL-1,x)),Math.max(ORIGIN_Z,Math.min(ORIGIN_Z+ROWS*GPS_CELL-1,z)));
  if(here<0)return -1;
  const cx=here%COLUMNS,cz=Math.floor(here/COLUMNS);
  let fallback=-1,fallbackD=Infinity;
  for(let ring=0;ring<=60;ring++){
    let best=-1,bestD=Infinity;
    for(let dz=-ring;dz<=ring;dz++)for(let dx=-ring;dx<=ring;dx++){
      if(Math.max(Math.abs(dx),Math.abs(dz))!==ring)continue;
      const nx=cx+dx,nz=cz+dz;if(nx<0||nz<0||nx>=COLUMNS||nz>=ROWS)continue;
      const cell=nz*COLUMNS+nx,kind=classes[cell]!;if(!kind)continue;
      const d=Math.hypot(centreX(cell)-x,centreZ(cell)-z);
      if(kind<3&&d<bestD){best=cell;bestD=d;}
      if(kind===3&&d<fallbackD){fallback=cell;fallbackD=d;}
    }
    if(best>=0)return best;
    // A pavement right there beats a road far off only when the road is not within a few rings.
    if(fallback>=0&&ring>=6)return fallback;
  }
  return fallback;
}
const heap=new Int32Array(COLUMNS*ROWS+1),heapAt=new Int32Array(COLUMNS*ROWS).fill(-1),score=new Float32Array(COLUMNS*ROWS),walked=new Float32Array(COLUMNS*ROWS),cameFrom=new Int32Array(COLUMNS*ROWS);
const STEPS=[[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,Math.SQRT2],[1,-1,Math.SQRT2],[-1,1,Math.SQRT2],[-1,-1,Math.SQRT2]] as const;
/** A* over the grid, the shortest in cost, as cells; undefined where they do not connect. Corners are not cut. */
function search(from:number,to:number):number[]|undefined {
  const tx=to%COLUMNS,tz=Math.floor(to/COLUMNS);
  const guess=(cell:number)=>{const dx=Math.abs(cell%COLUMNS-tx),dz=Math.abs(Math.floor(cell/COLUMNS)-tz);return Math.max(dx,dz)+(Math.SQRT2-1)*Math.min(dx,dz);};
  walked.fill(Infinity);heapAt.fill(-1);
  let size=0;
  const up=(i:number)=>{const cell=heap[i]!;while(i>0){const parent=(i-1)>>1,other=heap[parent]!;if(score[other]!<=score[cell]!)break;heap[i]=other;heapAt[other]=i;i=parent;}heap[i]=cell;heapAt[cell]=i;};
  const down=(i:number)=>{const cell=heap[i]!;for(;;){let child=2*i+1;if(child>=size)break;if(child+1<size&&score[heap[child+1]!]!<score[heap[child]!]!)child++;const other=heap[child]!;if(score[other]!>=score[cell]!)break;heap[i]=other;heapAt[other]=i;i=child;}heap[i]=cell;heapAt[cell]=i;};
  walked[from]=0;score[from]=guess(from);heap[size++]=from;heapAt[from]=0;cameFrom[from]=-1;
  while(size){
    const cell=heap[0]!;
    if(cell===to){const path=[to];for(let at=cameFrom[to]!;at>=0;at=cameFrom[at]!)path.push(at);return path.reverse();}
    heapAt[cell]=-2;
    const last=heap[--size]!;if(size){heap[0]=last;heapAt[last]=0;down(0);}
    const cx=cell%COLUMNS,cz=Math.floor(cell/COLUMNS);
    for(const [dx,dz,length] of STEPS){
      const nx=cx+dx,nz=cz+dz;if(nx<0||nz<0||nx>=COLUMNS||nz>=ROWS)continue;
      const next=nz*COLUMNS+nx,kind=classes[next]!;if(!kind||heapAt[next]===-2)continue;
      if(dx&&dz&&(!classes[cz*COLUMNS+nx]||!classes[nz*COLUMNS+cx]))continue;
      const cost=walked[cell]!+length*COST[kind as 1|2|3];
      if(cost>=walked[next]!)continue;
      walked[next]=cost;cameFrom[next]=cell;score[next]=cost+guess(next);
      if(heapAt[next]<0){heap[size]=next;heapAt[next]=size;size++;up(size-1);}else up(heapAt[next]!);
    }
  }
}
/** A straight line that stays on cells no worse than `limit`, sampled at a third of a cell. */
function clearLine(a:readonly [number,number],b:readonly [number,number],limit:number):boolean {
  const length=Math.hypot(b[0]-a[0],b[1]-a[1]),steps=Math.ceil(length/(GPS_CELL/3));
  for(let i=1;i<steps;i++){
    const kind=gpsClass(a[0]+(b[0]-a[0])*i/steps,a[1]+(b[1]-a[1])*i/steps);
    if(!kind||kind>limit)return false;
  }
  return true;
}
/** The grid's stairs taken out: each point goes straight to the farthest one it can see without leaving the road. */
function straighten(points:ReadonlyArray<readonly [number,number]>):Array<[number,number]> {
  if(points.length<3)return points.map(([x,z])=>[x,z]);
  const kept:Array<[number,number]>=[[points[0]![0],points[0]![1]]];
  for(let at=0;at<points.length-1;){
    // In the middle of the road, it stays in the middle; only a point already by the edge may go along it.
    const limit=gpsClass(points[at]![0],points[at]![1]);
    let next=at+1;
    for(let far=Math.min(points.length-1,at+60);far>at+1;far--)if(clearLine(points[at]!,points[far]!,limit)){next=far;break;}
    kept.push([points[next]![0],points[next]![1]]);at=next;
  }
  return kept;
}
export interface GpsRoute {points:Array<[number,number]>;length:number}
export const routeLength=(points:ReadonlyArray<readonly [number,number]>)=>{let total=0;for(let i=1;i<points.length;i++)total+=Math.hypot(points[i]![0]-points[i-1]![0],points[i]![1]-points[i-1]![1]);return total;};
/** The way along the streets between two points (x and z), both ends included. Undefined only off the city's network. */
export function gpsRoute(from:{x:number;z:number},to:{x:number;z:number}):GpsRoute|undefined {
  const start=snap(from.x,from.z),end=snap(to.x,to.z);
  if(start<0||end<0)return;
  const cells=search(start,end);if(!cells)return;
  const middle=straighten(cells.map(cell=>[centreX(cell),centreZ(cell)] as const));
  const points:Array<[number,number]>=[[from.x,from.z]];
  // The first and last grid corners go when the point itself is already on the same road.
  if(middle.length>1&&gpsClass(from.x,from.z)&&clearLine([from.x,from.z],middle[1]!,2))middle.shift();
  if(middle.length>1&&gpsClass(to.x,to.z)&&clearLine(middle[middle.length-2]!,[to.x,to.z],2))middle.pop();
  points.push(...middle,[to.x,to.z]);
  return {points,length:routeLength(points)};
}
/** How far a point is from a route, and from which of its segments on. */
export function routeProgress(route:ReadonlyArray<readonly [number,number]>,x:number,z:number):{distance:number;segment:number;t:number} {
  let distance=Infinity,segment=0,t=0;
  for(let i=1;i<route.length;i++){
    const [ax,az]=route[i-1]!,[bx,bz]=route[i]!,dx=bx-ax,dz=bz-az,span=dx*dx+dz*dz,along=span?Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/span)):0;
    const d=Math.hypot(ax+dx*along-x,az+dz*along-z);
    if(d<distance){distance=d;segment=i-1;t=along;}
  }
  return {distance,segment,t};
}

/** Where someone can wait for a delivery: on the pavement facing the street, with room for the bike at the kerb in front of them. */
export interface DeliverySpot {x:number;y:number;z:number;yaw:number;parkX:number;parkZ:number;street:string;number:number;place:string}
const streets:readonly string[]=data.streets,places:readonly string[]=data.places;
export const DELIVERY_SPOTS:readonly DeliverySpot[]=(data.spots as number[][]).map(([x,y,z,yaw,parkX,parkZ,street,number,place])=>({x:x!,y:y!,z:z!,yaw:yaw!,parkX:parkX!,parkZ:parkZ!,street:streets[street!]!,number:number!,place:places[place!]!}));
/** How far in front of a pickup point (metres from its middle) someone stands at its screen. */
const PICKUP_STAND=1;
/** A place orders are collected from (pontos_ifood.json): the locker, the side its screen faces, where to stand and where the bike stops. */
export interface PickupPoint {x:number;y:number;z:number;frontX:number;frontZ:number;standX:number;standZ:number;parkX:number;parkZ:number;street:string;number:number}
export const PICKUP_POINTS:readonly PickupPoint[]=(data.pickups as number[][]).map(([x,y,z,frontX,frontZ,parkX,parkZ,street,number])=>({x:x!,y:y!,z:z!,frontX:frontX!,frontZ:frontZ!,standX:x!+frontX!*PICKUP_STAND,standZ:z!+frontZ!*PICKUP_STAND,parkX:parkX!,parkZ:parkZ!,street:streets[street!]!,number:number!}));
/** Only this many, the closest in a straight line, are measured along the streets: a route costs milliseconds, and the room runs on. */
const PICKUPS_MEASURED=4;
/** The pickup point nearest along the streets, and how far it is. */
export function nearestPickup(from:{x:number;z:number}):{point:PickupPoint;length:number}|undefined {
  let best:{point:PickupPoint;length:number}|undefined;
  for(const point of [...PICKUP_POINTS].sort((a,b)=>Math.hypot(a.parkX-from.x,a.parkZ-from.z)-Math.hypot(b.parkX-from.x,b.parkZ-from.z)).slice(0,PICKUPS_MEASURED)){
    const route=gpsRoute(from,{x:point.parkX,z:point.parkZ});
    if(route&&(!best||route.length<best.length))best={point,length:route.length};
  }
  return best;
}
/** Street names to write on the map: where and at what angle. */
export const STREET_LABELS:ReadonlyArray<{name:string;x:number;z:number;angle:number}>=(data.labels as Array<[number,number,number,number]>).map(([name,x,z,angle])=>({name:streets[name]!,x,z,angle}));
