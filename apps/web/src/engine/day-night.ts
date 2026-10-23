/** One game day per 40 real minutes. Fixed epoch survives reloads and world restarts. */
export const DAY_NIGHT={durationMs:40*60_000,epochMs:Date.UTC(2026,0,1),offsetHours:8} as const;
export const EDGE_FOG_WIDTH=8;
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

export function gameHour(serverTime:number):number {
  const time=Number.isFinite(serverTime)?serverTime:DAY_NIGHT.epochMs;
  return (((time-DAY_NIGHT.epochMs)/DAY_NIGHT.durationMs*24+DAY_NIGHT.offsetHours)%24+24)%24;
}
export function daylightAt(serverTime:number){
  const hour=gameHour(serverTime),angle=(hour-6)/24*Math.PI*2;
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
    // The expanded export authors distance fog from 70 to 520 m. Keep the night slightly denser without
    // reducing visibility to the old single-block map's range.
    fogStart:70-night*8,fogEnd:520-night*90,exposure:1.08+night*.04};
}

/** Visibility near the world rim, independent of camera distance. */
export function edgeVisibility(x:number,z:number,bounds:{minX:number;maxX:number;minZ:number;maxZ:number}):number {
  return smooth(0,EDGE_FOG_WIDTH,Math.min(x-bounds.minX,bounds.maxX-x,z-bounds.minZ,bounds.maxZ-z));
}
