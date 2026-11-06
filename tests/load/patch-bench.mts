import {StateView} from '@colyseus/schema';
import {SchemaSerializer,ClientState} from '@colyseus/core';
import {BarState,Player} from '../../apps/server/src/state.js';

function run(N:number,K:number){
  const state=new BarState();const ser=new SchemaSerializer();ser.reset(state);
  const players:Player[]=[];
  for(let i=0;i<N;i++){const p=new Player();p.id='p'+i;p.x=Math.random()*30;p.z=Math.random()*30;state.players.set(p.id,p);players.push(p);}
  let bytes=0;
  const clients=players.map((p,i)=>{const view=new StateView();
    const near=[...players].sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z)).slice(0,K);
    for(const q of near)view.add(q);view.add(p);
    return {state:ClientState.JOINED,view,raw:(b:Uint8Array)=>{bytes+=b.length;},_inputBuffer:undefined} as any;});
  ser.applyPatches(clients,state);bytes=0;
  const times:number[]=[];
  for(let it=0;it<60;it++){
    for(const p of players){p.x+=.05;p.z+=.03;p.rotation+=.01;p.animationState=it%2?'walk':'run';}
    const t=performance.now();ser.applyPatches(clients,state);times.push(performance.now()-t);
  }
  times.sort((a,b)=>a-b);
  console.log(`N=${N} visible=${K}: patch p50 ${times[30].toFixed(2)} ms p95 ${times[57].toFixed(2)} ms, ${(bytes/60/N).toFixed(0)} B/client/patch`);
}
for(const [N,K] of [[25,25],[64,64],[128,128],[128,48],[128,24]] as const)run(N,K);
