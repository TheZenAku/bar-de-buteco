import {z} from 'zod';

/** Real server time remains independent of this clock (jobs, purchases and matches never pause). */
export const DAY_NIGHT={durationMs:40*60_000,epochMs:Date.UTC(2026,0,1),offsetHours:8} as const;
export const WEATHER={transitionMs:12_000,lightningPeriodMs:17_000} as const;
export const WEATHER_CITY={name:"Santa Bárbara d’Oeste",latitude:-22.7539,longitude:-47.4136,pollMs:5*60_000,maxAgeMs:30*60_000} as const;
export const WORLD_TIME_ZONE='America/Sao_Paulo';
export interface EnvironmentSnapshot {at:number;environment:EnvironmentState}
/** Civil dates use the server epoch and the city's zone, regardless of the player's computer. */
export function formatWorldDate(serverTime:number,options:Intl.DateTimeFormatOptions={dateStyle:'short'}):string {
  return new Intl.DateTimeFormat('pt-BR',{...options,timeZone:WORLD_TIME_ZONE}).format(serverTime);
}
const calendarFormat=new Intl.DateTimeFormat('en-US',{timeZone:WORLD_TIME_ZONE,year:'numeric',month:'numeric',day:'numeric'});
/** A date-only UTC value, for calendar arithmetic without the browser's local time zone. */
export function worldCalendarDate(serverTime:number):Date {
  const parts=calendarFormat.formatToParts(serverTime),part=(type:string)=>Number(parts.find(p=>p.type===type)!.value);
  return new Date(Date.UTC(part('year'),part('month')-1,part('day')));
}
export const WEATHER_KINDS=['clear','cloudy','rain','storm'] as const;
export type WeatherKind=typeof WEATHER_KINDS[number];
export const WEATHER_NAMES:Record<WeatherKind|'auto',string>={auto:'Automático',clear:'Céu limpo',cloudy:'Nublado',rain:'Chuva',storm:'Tempestade'};
export interface WeatherSample {cloud:number;rain:number;storm:number;wind:number;kind:WeatherKind}
export interface EnvironmentState {
  anchorMs:number;hour:number;dayDurationMs:number;paused:boolean;
  weather:WeatherKind|'auto';weatherChangedAt:number;
  fromCloud:number;fromRain:number;fromStorm:number;fromWind:number;
  realWeatherAt:number;realCloud:number;realRain:number;realStorm:number;realWind:number;realPrecipitationMmH:number;
}
export const DEFAULT_ENVIRONMENT:Readonly<EnvironmentState>={anchorMs:DAY_NIGHT.epochMs,hour:DAY_NIGHT.offsetHours,dayDurationMs:DAY_NIGHT.durationMs,paused:false,
  weather:'auto',weatherChangedAt:0,fromCloud:0,fromRain:0,fromStorm:0,fromWind:.12,
  realWeatherAt:0,realCloud:0,realRain:0,realStorm:0,realWind:.12,realPrecipitationMmH:0};
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
const mix=(a:WeatherSample,b:WeatherSample,t:number):WeatherSample=>t>=1?{...b}:{kind:b.kind,cloud:a.cloud+(b.cloud-a.cloud)*t,rain:a.rain+(b.rain-a.rain)*t,
  storm:a.storm+(b.storm-a.storm)*t,wind:a.wind+(b.wind-a.wind)*t};
function automaticWeather(time:number,state:EnvironmentState):WeatherSample {
  if(!state.realWeatherAt)return climates.clear;
  const sample:WeatherSample={cloud:state.realCloud,rain:state.realRain,storm:state.realStorm,wind:state.realWind,
    kind:state.realRain>0?(state.realStorm>0?'storm':'rain'):state.realCloud>=.5?'cloudy':'clear'};
  // A provider outage must not leave yesterday's rain running forever or invent a weather cycle.
  const age=time-state.realWeatherAt-WEATHER_CITY.maxAgeMs;
  return age<=0?sample:mix(sample,climates.clear,smooth(age/WEATHER.transitionMs));
}
/** With no room yet, the legacy preview stays clear. Joined players all sample the room's same transition. */
export function weatherAt(serverTime:number,state?:EnvironmentState):WeatherSample {
  if(!state)return {...climates.clear};
  const time=Number.isFinite(serverTime)?serverTime:DAY_NIGHT.epochMs;
  const target=state.weather==='auto'?automaticWeather(time,state):climates[state.weather];
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
  if(valid.reset){Object.assign(next,DEFAULT_ENVIRONMENT,{realWeatherAt:state.realWeatherAt,realCloud:state.realCloud,realRain:state.realRain,
    realStorm:state.realStorm,realWind:state.realWind,realPrecipitationMmH:state.realPrecipitationMmH});}
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
export interface CityWeatherReading extends WeatherSample {observedAt:number;precipitationMmH:number}
/** Only the server supplies these fields; administrator commands cannot forge city readings. */
export function applyCityWeather(state:EnvironmentState,reading:CityWeatherReading,now:number):EnvironmentState {
  if(reading.observedAt<state.realWeatherAt)return {...state};
  const next={...state,realWeatherAt:reading.observedAt,realCloud:reading.cloud,realRain:reading.rain,realStorm:reading.storm,
    realWind:reading.wind,realPrecipitationMmH:reading.precipitationMmH};
  if(state.weather==='auto'&&(state.realCloud!==next.realCloud||state.realRain!==next.realRain||state.realStorm!==next.realStorm||state.realWind!==next.realWind
    ||now-state.realWeatherAt>WEATHER_CITY.maxAgeMs)){
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
