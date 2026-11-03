import {test} from 'node:test';
import assert from 'node:assert/strict';
import {gpsClass,gpsRoute,routeLength} from '@bar/shared';
import {createGps} from '../../apps/web/src/gps';

const START={x:-3.99,z:-13.97},GOAL={x:-180,z:120,y:0,source:'waypoint' as const,label:'Destino'};
/** A GPS following someone moved by hand, 10 reads a second. */
function follower(){
  let now=1000,changes=0;
  const gps=createGps({changed:()=>{changes++;},arrived:()=>{}});
  gps.setWaypoint(GOAL);gps.update(START.x,START.z,now);
  return {gps,at:(x:number,z:number)=>{now+=100;gps.update(x,z,now);},get changes(){return changes;}};
}
const firstLeg=(route:ReadonlyArray<readonly [number,number]>)=>Math.hypot(route[1]![0]-route[0]![0],route[1]![1]-route[0]![1]);
/** How many metres of the line's first leg run where no bike fits: buildings and walls. */
function throughWalls(route:ReadonlyArray<readonly [number,number]>):number {
  const steps=Math.ceil(firstLeg(route));let closed=0;
  for(let i=0;i<=steps;i++)if(!gpsClass(route[0]![0]+(route[1]![0]-route[0]![0])*i/steps,route[0]![1]+(route[1]![1]-route[0]![1])*i/steps))closed++;
  return closed*firstLeg(route)/steps;
}
/** A point this many metres along a line. */
function pointAlong(line:ReadonlyArray<readonly [number,number]>,metres:number):{x:number;z:number} {
  let left=metres;
  for(let i=1;i<line.length;i++){
    const [ax,az]=line[i-1]!,[bx,bz]=line[i]!,span=Math.hypot(bx-ax,bz-az);
    if(span>=left)return {x:ax+(bx-ax)*left/span,z:az+(bz-az)*left/span};
    left-=span;
  }
  const [x,z]=line[line.length-1]!;return {x,z};
}

test('riding the line eats it, keeps the way and starts it at the player',()=>{
  const f=follower(),line=[...f.gps.route],total=routeLength(line);
  for(let metres=2;metres<total-30;metres+=2){
    const {x,z}=pointAlong(line,metres);f.at(x,z);
    assert.deepEqual(f.gps.route[0],[x,z]);
    assert.ok(Math.abs(f.gps.remaining-(total-metres))<3,`${f.gps.remaining} left after ${metres} of ${total}`);
    assert.ok(firstLeg(f.gps.route)<5,`joins the way just ahead, not ${firstLeg(f.gps.route)} m off`);
  }
});

test('leaving the line works out a new way at once: nothing stretches across the map back to the old one',()=>{
  const f=follower(),line=[...f.gps.route];
  const off=pointAlong(line,60);f.at(off.x,off.z);
  // Straight away from the line, as if up a side street, at the speed of the bike.
  const [ax,az]=line[1]!,[bx,bz]=line[2]??[GOAL.x,GOAL.z],span=Math.hypot(bx-ax,bz-az),side={x:-(bz-az)/span,z:(bx-ax)/span};
  let worst=0;
  for(let metres=1.5;metres<=150;metres+=1.5){
    const x=off.x+side.x*metres,z=off.z+side.z*metres;f.at(x,z);
    assert.deepEqual(f.gps.route[0],[x,z]);
    // On open ground the line runs on open ground, but for what it takes to notice (standing inside a building, it must cross a wall to the road).
    if(gpsClass(x,z))worst=Math.max(worst,throughWalls(f.gps.route));
  }
  assert.ok(worst<12,`The line goes ${worst.toFixed(1)} m through walls to reach the player: the way was not worked out again`);
  const here={x:off.x+side.x*150,z:off.z+side.z*150},fresh=gpsRoute(here,GOAL)!;
  assert.ok(Math.abs(f.gps.remaining-fresh.length)<12,`${f.gps.remaining} m left on the line, ${fresh.length} m from here`);
});

test('standing still draws nothing again',()=>{
  const f=follower();
  f.at(START.x+1,START.z);
  const changes=f.changes,version=f.gps.version;
  for(let i=0;i<20;i++)f.at(START.x+1,START.z);
  assert.equal(f.changes,changes);assert.equal(f.gps.version,version);
});
