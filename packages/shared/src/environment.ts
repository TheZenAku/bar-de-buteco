import {z} from 'zod';

/** Real server time remains independent of this clock (jobs, purchases and matches never pause). */
export const DAY_NIGHT={durationMs:40*60_000,epochMs:Date.UTC(2026,0,1),offsetHours:8} as const;
export const WEATHER={periodMs:6*60_000,transitionMs:12_000,lightningPeriodMs:17_000} as const;
export const WEATHER_KINDS=['clear','cloudy','rain','storm'] as const;
export type WeatherKind=typeof WEATHER_KINDS[number];
export const WEATHER_NAMES:Record<WeatherKind|'auto',string>={auto:'Automático',clear:'Céu limpo',cloudy:'Nublado',rain:'Chuva',storm:'Tempestade'};
export interface WeatherSample {cloud:number;rain:number;storm:number;wind:number;kind:WeatherKind}
export interface EnvironmentState {
  anchorMs:number;hour:number;dayDurationMs:number;paused:boolean;
  weather:WeatherKind|'auto';weatherChangedAt:number;
  fromCloud:number;fromRain:number;fromStorm:number;fromWind:number;
}
export const DEFAULT_ENVIRONMENT:Readonly<EnvironmentState>={anchorMs:DAY_NIGHT.epochMs,hour:DAY_NIGHT.offsetHours,dayDurationMs:DAY_NIGHT.durationMs,paused:false,
  weather:'auto',weatherChangedAt:0,fromCloud:0,fromRain:0,fromStorm:0,fromWind:.12};
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const smooth=(v:number)=>{const t=clamp(v);return t*t*(3-2*t);};
const wrap=(hour:number)=>(hour%24+24)%24;
export function gameHour(serverTime:number,state?:EnvironmentState):number {
  const time=Number.isFinite(serverTime)?serverTime:DAY_NIGHT.epochMs,s=state??DEFAULT_ENVIRONMENT;
  return wrap(s.hour+(s.paused?0:(time-s.anchorMs)/s.dayDurationMs*24));
}
export function formatGameHour(hour:number):string {
  const minutes=Math.floor(wrap(hour)*60+1e-7)%1440;
  return `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
}
const climates:Record<WeatherKind,WeatherSample>={
  clear:{kind:'clear',cloud:0,rain:0,storm:0,wind:.12},
  cloudy:{kind:'cloudy',cloud:.75,rain:0,storm:0,wind:.3},
  rain:{kind:'rain',cloud:.9,rain:.55,storm:0,wind:.45},
  storm:{kind:'storm',cloud:1,rain:1,storm:1,wind:1},
};
const sequence:readonly WeatherKind[]=['clear','cloudy','rain','clear','cloudy','storm','rain','clear'];
const mix=(a:WeatherSample,b:WeatherSample,t:number):WeatherSample=>({kind:b.kind,cloud:a.cloud+(b.cloud-a.cloud)*t,rain:a.rain+(b.rain-a.rain)*t,
  storm:a.storm+(b.storm-a.storm)*t,wind:a.wind+(b.wind-a.wind)*t});
function automaticWeather(time:number):WeatherSample {
  const cycle=(time-DAY_NIGHT.epochMs)/WEATHER.periodMs,index=Math.floor(cycle);
  const at=(i:number)=>climates[sequence[(i%sequence.length+sequence.length)%sequence.length]!];
  return mix(at(index-1),at(index),smooth((cycle-index)*WEATHER.periodMs/WEATHER.transitionMs));
}
/** With no room yet, the legacy preview stays clear. Joined players all sample the room's same transition. */
export function weatherAt(serverTime:number,state?:EnvironmentState):WeatherSample {
  if(!state)return {...climates.clear};
  const time=Number.isFinite(serverTime)?serverTime:DAY_NIGHT.epochMs;
  const target=state.weather==='auto'?automaticWeather(time):climates[state.weather];
  if(!state.weatherChangedAt)return {...target};
  return mix({kind:target.kind,cloud:state.fromCloud,rain:state.fromRain,storm:state.fromStorm,wind:state.fromWind},target,
    smooth((time-state.weatherChangedAt)/WEATHER.transitionMs));
}
export const environmentPatchSchema=z.object({
  hour:z.number().finite().min(0).lt(24).optional(),
  paused:z.boolean().optional(),
  dayMinutes:z.number().finite().min(5).max(240).optional(),
  weather:z.enum(['auto',...WEATHER_KINDS]).optional(),
  reset:z.literal(true).optional(),
}).strict().refine(p=>Object.keys(p).length>0,'Informe uma alteração.').refine(p=>!p.reset||Object.keys(p).length===1,'Restaurar não aceita outras alterações.');
export type EnvironmentPatch=z.infer<typeof environmentPatchSchema>;
export function applyEnvironmentPatch(state:EnvironmentState,patch:EnvironmentPatch,now:number):EnvironmentState {
  const valid=environmentPatchSchema.parse(patch),next={...state};
  if(valid.reset){Object.assign(next,DEFAULT_ENVIRONMENT);}
  else {
    if(valid.hour!==undefined||valid.paused!==undefined||valid.dayMinutes!==undefined){
      next.hour=valid.hour??gameHour(now,state);next.anchorMs=now;
      next.paused=valid.paused??state.paused;next.dayDurationMs=valid.dayMinutes!==undefined?valid.dayMinutes*60_000:state.dayDurationMs;
    }
    if(valid.weather!==undefined)next.weather=valid.weather;
  }
  if(next.weather!==state.weather||valid.reset){
    const from=weatherAt(now,state);Object.assign(next,{weatherChangedAt:now,fromCloud:from.cloud,fromRain:from.rain,fromStorm:from.storm,fromWind:from.wind});
  }
  return next;
}
/** One broad flash per distant strike. Its thunder is heard later; joining never replays old strikes. */
export function lightningAt(time:number,weather:WeatherSample){
  const period=Math.floor(time/WEATHER.lightningPeriodMs),seed=((period*16807)%2147483647+2147483647)%2147483647/2147483647;
  const strikeAt=period*WEATHER.lightningPeriodMs+3000+seed*6000,age=time-strikeAt;
  const strength=smooth((weather.storm-.45)/.55);
  return {strikeAt,thunderAt:strikeAt+1400+seed*2000,flash:age>=0&&age<650?Math.exp(-age/150)*strength:0,strength};
}
