import {gameHour,type EnvironmentState} from '@bar/shared/environment';
export {DAY_NIGHT,gameHour} from '@bar/shared/environment';
export type Rgb=[number,number,number];
const rgb=(hex:string):Rgb=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255) as Rgb;
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
export const smooth=(a:number,b:number,x:number)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const keys=[
  [0,'#080f23','#172337','#354460','#ffc18b'],
  [5,'#111b35','#3e455a','#3f4b60','#ffb578'],
  [6,'#53618a','#be9c94','#606477','#ffb578'],
  [7.5,'#6290bb','#b8c5cf','#64717e','#ffe1bd'],
  [11,'#4382be','#b2c6d3','#64717e','#fff1dd'],
  [15.5,'#5487b8','#b7c6cf','#64717e','#ffebd2'],
  [17.5,'#646d98','#d0a58d','#6a6775','#ffae72'],
  [18.5,'#333e65','#726378','#4c5067','#ffae72'],
  [20,'#080f23','#172337','#354460','#ffc18b'],
  [24,'#080f23','#172337','#354460','#ffc18b'],
].map(([hour,top,horizon,ambient,sun])=>({hour:hour as number,top:rgb(top as string),horizon:rgb(horizon as string),ambient:rgb(ambient as string),sun:rgb(sun as string)}));

export function daylightAt(serverTime:number,environment?:EnvironmentState){
  const hour=gameHour(serverTime,environment),angle=(hour-6)/24*Math.PI*2;
  // East = +X; the noon arc crosses the south (+Z), lighting the main facade.
  const x=Math.cos(angle),y=Math.sin(angle)*.92,z=Math.sin(angle)*.39;
  const length=Math.hypot(x,y,z),sunDirection:[number,number,number]=[x/length,y/length,z/length];
  const night=1-smooth(-.12,.28,sunDirection[1]);
  const next=keys.findIndex(key=>key.hour>hour),a=keys[Math.max(0,next-1)],b=keys[next];
  const t=smooth(a.hour,b.hour,hour);
  const mix=(name:'top'|'horizon'|'ambient'|'sun'):Rgb=>a[name].map((value,i)=>value+(b[name][i]-value)*t) as Rgb;
  return {hour,phase:hour<5?'madrugada':hour<7.5?'amanhecer':hour<17?'dia':hour<19.5?'entardecer':'noite',
    sunDirection,moonDirection:sunDirection.map(v=>-v) as [number,number,number],
    sunIntensity:1.15*smooth(0,.35,sunDirection[1]),moonIntensity:.18*smooth(0,.3,-sunDirection[1]),night,
    top:mix('top'),horizon:mix('horizon'),ambient:mix('ambient'),sunColor:mix('sun'),
    exposure:1.08+night*.04};
}
