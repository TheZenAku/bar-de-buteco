// Builds packages/shared/src/gps-data.json from the same floors and solids the bike rides on: the grid GPS routes run over, the places a
// delivery can be made, the pickup points (apps/web/public/maps/cidade/pontos_ifood.json), and the street names. Run again when the map changes: npm run assets:gps (tests/integration/gps.test.ts checks it).
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {CITY_FLOORS,CITY_SOLIDS,COLLIDERS,HIGHFOOD,MAP_COLLIDERS,cityZone,floorHeight,isWalkable,motoFits,roadHeight,solidsBetween} from '@bar/shared';
import {ROAD_EDGES,ROAD_NODES} from '@bar/shared/city-roads';
import type {Collider} from '@bar/shared';
import {REAL_STREETS,realStreet} from './street-names';

const OUTPUT=fileURLToPath(new URL('../../packages/shared/src/gps-data.json',import.meta.url));
const PICKUPS=fileURLToPath(new URL('../../apps/web/public/maps/cidade/pontos_ifood.json',import.meta.url));
const CELL=3,MIN=-402,MAX=402,COUNT=Math.ceil((MAX-MIN)/CELL);
/** Lower than this above the ground is the road's own surface; kerbs, pavements and yards start at 15 cm. */
const ASPHALT_TOP=.08;
/** Metres kept free around a cell for it to count as the middle of the road. */
const CLEARANCE=1.1;
/** How close to a cell's centre something standing closes the cell. */
const CORE=1.05;
const boxReaches=(solid:Collider,x:number,z:number,margin:number)=>{
  if(Math.abs(solid.x-x)>=solid.hx+margin||Math.abs(solid.z-z)>=solid.hz+margin)return false;
  const turn=solid.turn;if(!turn)return true;
  const dx=x-solid.x,dz=z-solid.z;
  return Math.abs(dx*turn.ux+dz*turn.uz)<turn.lx+margin&&Math.abs(dz*turn.ux-dx*turn.uz)<turn.lz+margin;
};
const centre=(index:number)=>MIN+(index+.5)*CELL;
const at=(x:number,z:number)=>z*COUNT+x;

// Fit: the bike upright, along or across, at the middle of the cell.
const open=new Uint8Array(COUNT*COUNT),asphalt=new Uint8Array(COUNT*COUNT);
for(let z=0;z<COUNT;z++)for(let x=0;x<COUNT;x++){
  const px=centre(x),pz=centre(z);
  for(const reference of [0,.15]){
    const fit=motoFits(px,pz,0,reference)??motoFits(px,pz,Math.PI/2,reference)??motoFits(px,pz,Math.PI/4,reference);
    if(!fit)continue;
    // Something standing in the cell's middle closes it: a line across it would go through a parked car that the bike fits beside.
    if(solidsBetween(px-CORE,pz-CORE,px+CORE,pz+CORE).some(solid=>!solid.ramp&&(solid.maxY??Infinity)>.3&&(solid.minY??-Infinity)<2&&boxReaches(solid,px,pz,CORE)))continue;
    open[at(x,z)]=1;
    if((roadHeight(px,pz,0)??1)<ASPHALT_TOP)asphalt[at(x,z)]=1;
    break;
  }
}
// Only what connects to the street where Highfood starts.
const main=new Uint8Array(COUNT*COUNT);
let start=-1;
for(let ring=0;ring<8&&start<0;ring++)for(let dz=-ring;dz<=ring&&start<0;dz++)for(let dx=-ring;dx<=ring;dx++){
  const cell=at(Math.floor((HIGHFOOD.BASE.x-MIN)/CELL)+dx,Math.floor((HIGHFOOD.BASE.z-MIN)/CELL)+dz);
  if(open[cell]&&asphalt[cell]){start=cell;break;}
}
if(start<0)throw new Error('A rua da base do Highfood não está na grade.');
{
  const queue=[start];main[start]=1;
  while(queue.length){
    const cell=queue.pop()!,x=cell%COUNT,z=Math.floor(cell/COUNT);
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]] as const){
      const nx=x+dx,nz=z+dz;if(nx<0||nz<0||nx>=COUNT||nz>=COUNT)continue;
      const next=at(nx,nz);if(open[next]&&!main[next]){main[next]=1;queue.push(next);}
    }
  }
}
// Classes: 1 the middle of the road, 2 the cell along its edge, 3 kerbs, pavements and yards.
const classes=new Uint8Array(COUNT*COUNT);
for(let z=0;z<COUNT;z++)for(let x=0;x<COUNT;x++){
  const cell=at(x,z);if(!main[cell])continue;
  if(!asphalt[cell]){classes[cell]=3;continue;}
  let edge=false;
  for(let dz=-1;dz<=1&&!edge;dz++)for(let dx=-1;dx<=1;dx++){
    const nx=x+dx,nz=z+dz;
    if(nx<0||nz<0||nx>=COUNT||nz>=COUNT||!asphalt[at(nx,nz)]||!main[at(nx,nz)]){edge=true;break;}
  }
  // Anything standing near the cell (a post, a parked car, a tree) makes it an edge too: lines stay clear of it.
  if(!edge){
    const px=centre(x),pz=centre(z),reach=CELL/2+CLEARANCE;
    edge=solidsBetween(px-reach,pz-reach,px+reach,pz+reach).some(solid=>!solid.ramp&&(solid.maxY??Infinity)>.3&&(solid.minY??-Infinity)<2&&boxReaches(solid,px,pz,reach));
  }
  classes[cell]=edge?2:1;
}
const grid:string[]=[];
for(let z=0;z<COUNT;z++){
  const runs:string[]=[];let kind=classes[at(0,z)]!,length=0;
  for(let x=0;x<COUNT;x++){const here=classes[at(x,z)]!;if(here===kind){length++;continue;}runs.push(`${kind}${length}`);kind=here;length=1;}
  runs.push(`${kind}${length}`);grid.push(runs.join(','));
}

// Street names: real ones, from the city's plans (street-names.ts). The graph does not reach inside the original neighbourhood, but its grid runs on the same lines.
const streets:string[]=[],streetIndex=(name:string)=>{let index=streets.indexOf(name);if(index<0){index=streets.length;streets.push(name);}return index;};
const OLD={minX:-141,maxX:173,minZ:-149,maxZ:123};
const NAMED_EDGES=ROAD_EDGES.flatMap(edge=>{
  const [ax,az]=ROAD_NODES[edge.a]!,[bx,bz]=ROAD_NODES[edge.b]!,x=(ax+bx)/2,z=(az+bz)/2;
  const name=realStreet(cityZone(x,z),edge.name,x,z,Math.abs(bz-az)>Math.abs(bx-ax));
  return name?[{ax,az,bx,bz,name}]:[];
});
/** The name of the street at a point; `alongZ`: which way it runs there (for the original neighbourhood's grid). */
function streetAt(x:number,z:number,alongZ:boolean):string {
  if(x>OLD.minX+6&&x<OLD.maxX-6&&z>OLD.minZ+6&&z<OLD.maxZ-6){
    const name=realStreet(cityZone(x,z),'',x,z,alongZ);
    if(name)return name;
  }
  let best='',distance=Infinity;
  for(const {ax,az,bx,bz,name} of NAMED_EDGES){
    const dx=bx-ax,dz=bz-az,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz||1))),d=Math.hypot(ax+dx*t-x,az+dz*t-z);
    if(d<distance){distance=d;best=name;}
  }
  return best;
}

// Buildings someone could be ordering from, and what to call them.
const BUILDING=/COL_(?:Cid|Viz)_(Casa|Sobrado|Loja|Escritorio|Conveniencia|Supermercado|UBS|Escola|Prefeitura|Terminal|Galpao|Viz_Antiga|Igreja)(?:\.\d+)?$/;
const PLACE:Record<string,string>={Casa:'Casa',Sobrado:'Sobrado',Loja:'Loja',Escritorio:'Escritório',Conveniencia:'Conveniência',Supermercado:'Supermercado',UBS:'UBS',Escola:'Escola',Prefeitura:'Prefeitura',Terminal:'Terminal',Galpao:'Galpão',Viz_Antiga:'Casa',Igreja:'Igreja'};
const buildings=[...CITY_SOLIDS,...COLLIDERS].flatMap(solid=>{const match=BUILDING.exec(solid.id);return match?[{x:solid.x,z:solid.z,hx:solid.hx,hz:solid.hz,place:PLACE[match[1]!]!}]:[];});
const places:string[]=[];const placeIndex=(name:string)=>{let index=places.indexOf(name);if(index<0){index=places.length;places.push(name);}return index;};
const LOT=MAP_COLLIDERS.find(c=>c.id==='COL_Predio_Piso')!;
const medians=CITY_FLOORS.filter(floor=>/Canteiro/.test(floor.id));
const inTriangle=(points:number[][],x:number,z:number)=>{
  const [a,b,c]=points as [number[],number[],number[]],side=(p:number[],q:number[])=>(q[0]!-p[0]!)*(z-p[2]!)-(q[2]!-p[2]!)*(x-p[0]!);
  const d1=side(a,b),d2=side(b,c),d3=side(c,a);return !((d1<0||d2<0||d3<0)&&(d1>0||d2>0||d3>0));
};
const onMedian=(x:number,z:number)=>medians.some(floor=>inTriangle(floor.points,x,z));
const buildingNear=(x:number,z:number,reach:number)=>{
  let best:string|undefined,distance=reach;
  for(const b of buildings){const d=Math.hypot(Math.max(0,Math.abs(b.x-x)-b.hx),Math.max(0,Math.abs(b.z-z)-b.hz));if(d<distance){distance=d;best=b.place;}}
  return best;
};
const SPACING=16,PERIMETER=358;
const spots:number[][]=[],taken=new Set<string>();
const round=(value:number,digits=2)=>Number(value.toFixed(digits));
for(let z=0;z<COUNT;z++)for(let x=0;x<COUNT;x++){
  if(classes[at(x,z)]!==2||!asphalt[at(x,z)])continue;
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]] as const){
    // From the road outwards to the kerb, then a little onto the pavement.
    const sx=centre(x),sz=centre(z);let kerb:number|undefined;
    for(let d=0;d<=9;d+=.25){const y=roadHeight(sx+dx*d,sz+dz*d,0);if(y===undefined)break;if(y>=ASPHALT_TOP){kerb=d;break;}}
    if(kerb===undefined)continue;
    const distance=kerb+1.3,nx=sx+dx*distance,nz=sz+dz*distance,ny=floorHeight(nx,nz,.15);
    if(ny===undefined||ny<ASPHALT_TOP||!isWalkable(nx,nz,ny)||onMedian(nx,nz))continue;
    if(Math.abs(nx-LOT.x)<LOT.hx+10&&Math.abs(nz-LOT.z)<LOT.hz+10)continue;
    // Past the ring road is only the city's backdrop.
    if(Math.abs(nx)>PERIMETER||Math.abs(nz)>PERIMETER)continue;
    if([[1,0],[-1,0],[0,1],[0,-1],[.7,.7],[-.7,.7],[.7,-.7],[-.7,-.7]].some(([ax,az])=>!isWalkable(nx+ax!*.9,nz+az!*.9,floorHeight(nx+ax!*.9,nz+az!*.9,ny)??ny)))continue;
    const key=`${Math.floor(nx/SPACING)}:${Math.floor(nz/SPACING)}`;if(taken.has(key))continue;
    const place=buildingNear(nx,nz,14);if(!place)continue;
    // The bike along the kerb, in front of them.
    const parkDistance=kerb-1.5,px=sx+dx*parkDistance,pz=sz+dz*parkDistance,alongZ=dx!==0;
    if(!motoFits(px,pz,alongZ?0:Math.PI/2,0))continue;
    // The way from the bike to them is free on foot.
    let clear=true;
    for(let d=parkDistance+.9;d<distance;d+=.3){const wx=sx+dx*d,wz=sz+dz*d;if(!isWalkable(wx,wz,floorHeight(wx,wz,.15)??0)){clear=false;break;}}
    if(!clear)continue;
    taken.add(key);
    const street=streetAt(px,pz,alongZ),number=(Math.round(Math.abs(alongZ?nz:nx)/2)*2+10)+(dx+dz>0?1:0);
    spots.push([round(nx),round(ny),round(nz),round(Math.atan2(-dx,-dz),3),round(px),round(pz),streetIndex(street),number,placeIndex(place)]);
  }
}
// The pickup points: the screen faces the street, the courier stands in front of it and the bike stops at the kerb beyond.
const pickups:number[][]=[];
for(const {nome,pos_gltf:[x,y,z],frente_gltf:[frontX,,frontZ]} of JSON.parse(fs.readFileSync(PICKUPS,'utf8')).pontos as Array<{nome:string;pos_gltf:[number,number,number];frente_gltf:[number,number,number]}>){
  let kerb:number|undefined;
  for(let d=0;d<=12;d+=.25){const road=roadHeight(x+frontX*d,z+frontZ*d,0);if(road!==undefined&&road<ASPHALT_TOP){kerb=d;break;}}
  if(kerb===undefined)throw new Error(`${nome}: a frente não dá para a rua.`);
  const parkX=x+frontX*(kerb+1.5),parkZ=z+frontZ*(kerb+1.5),alongZ=frontX!==0;
  if(!motoFits(parkX,parkZ,alongZ?0:Math.PI/2,0))throw new Error(`${nome}: a moto não cabe no meio-fio.`);
  pickups.push([round(x),round(y),round(z),Math.round(frontX),Math.round(frontZ),round(parkX),round(parkZ),streetIndex(streetAt(parkX,parkZ,alongZ)),(Math.round(Math.abs(alongZ?z:x)/2)*2+10)+(frontX+frontZ>0?1:0)]);
}
// One label per named stretch: the middle of each long street of the graph, and of the original neighbourhood's grid.
const labels:Array<[number,number,number,number]>=[];
for(const {ax,az,bx,bz,name} of NAMED_EDGES){
  if(Math.hypot(bx-ax,bz-az)<40)continue;
  const angle=Math.atan2(bz-az,bx-ax);
  labels.push([streetIndex(name),round((ax+bx)/2,1),round((az+bz)/2,1),round(Math.abs(angle)>Math.PI/2?angle+Math.PI:angle,2)]);
}
for(const [key,name] of Object.entries(REAL_STREETS.Centro!)){
  const line=Number(key.slice(1));if(Number.isNaN(line))continue;
  if(key[0]==='x'&&line>OLD.minX&&line<OLD.maxX){
    const row=Math.floor((-60-MIN)/CELL);
    for(let candidate=line-9;candidate<=line+9;candidate+=CELL){
      const column=Math.floor((candidate-MIN)/CELL);
      if(classes[at(column,row)]===1){labels.push([streetIndex(name),round(centre(column),1),-60,Math.PI/2]);break;}
    }
  }else if(key[0]==='z'&&line>OLD.minZ&&line<OLD.maxZ){
    const column=Math.floor((-70-MIN)/CELL);
    for(let candidate=line-9;candidate<=line+9;candidate+=CELL){
      const row=Math.floor((candidate-MIN)/CELL);
      if(classes[at(column,row)]===1){labels.push([streetIndex(name),-70,round(centre(row),1),0]);break;}
    }
  }
}
const output={cell:CELL,originX:MIN,originZ:MIN,columns:COUNT,rows:COUNT,grid,streets,places,spots,pickups,labels};
fs.writeFileSync(OUTPUT,`${JSON.stringify(output)}\n`);
let road=0,edges=0,other=0;for(const kind of classes){if(kind===1)road++;if(kind===2)edges++;if(kind===3)other++;}
console.log(`gps-data.json: ${(fs.statSync(OUTPUT).size/1024).toFixed(0)} KB · células ${road} meio da rua, ${edges} beira, ${other} calçada · ${spots.length} pontos de entrega · ${pickups.length} de retirada · ${streets.length} ruas · ${labels.length} nomes no mapa`);
