import { CrowdPlanner, type CrowdEntry } from '../../apps/server/src/world/crowd.ts';
let s=3;const random=()=>(s=(s*1664525+1013904223)>>>0)/2**32;
const side=Number(process.argv[2]||45);
const crowd:CrowdEntry[]=Array.from({length:1000},(_,i)=>({id:`p${i}`,slot:i+1,x:random()*side,y:0,z:random()*side,rotation:0,skin:0,gait:0,rider:false,noSprite:false,group:''}));
const p=new CrowdPlanner();
for(let round=0;round<4;round++){
  let t=performance.now();p.build(crowd,true);const b=performance.now()-t;
  t=performance.now();const held=crowd.map(v=>p.models(v,new Set()));const m=performance.now()-t;
  t=performance.now();crowd.forEach((v,i)=>p.sprites(v,held[i]!));const sp=performance.now()-t;
  console.log(`side ${side}: build ${b.toFixed(1)} ms, models ${m.toFixed(1)} ms, sprites ${sp.toFixed(1)} ms`);
}
