import {WEATHER_CITY,type CityWeatherReading} from '@bar/shared';
import {z} from 'zod';

const responseSchema=z.object({current:z.object({
  time:z.number().finite().positive(),interval:z.number().finite().positive().max(3600),
  precipitation:z.number().finite().min(0).max(1000),weather_code:z.number().int().min(0).max(99),
  cloud_cover:z.number().finite().min(0).max(100),wind_speed_10m:z.number().finite().min(0).max(500),
})});

/** Open-Meteo precipitation is a sum over current.interval seconds, not an hourly rate. */
export function parseCityWeather(payload:unknown,now:number):CityWeatherReading {
  const {current:c}=responseSchema.parse(payload),observedAt=c.time*1000;
  if(observedAt>now+60_000||now-observedAt>WEATHER_CITY.maxAgeMs)throw new Error('Leitura meteorológica fora do prazo.');
  const precipitationMmH=c.precipitation*3600/c.interval;
  // Keep drizzle visible, then increase density continuously, reaching the particle budget at 20 mm/h.
  const rain=precipitationMmH>0?Math.min(1,Math.max(.08,Math.log1p(precipitationMmH)/Math.log1p(20))):0;
  const storm=rain>0&&c.weather_code>=95?1:0,cloud=c.cloud_cover/100,wind=Math.min(1,c.wind_speed_10m/60);
  return {observedAt,precipitationMmH,cloud,rain,storm,wind,kind:rain>0?(storm?'storm':'rain'):cloud>=.5?'cloudy':'clear'};
}

/** One request per room every five minutes, shared by all clients; never blocks the simulation. */
export class CityWeather {
  private pending?:AbortController;
  private stopped=false;
  constructor(private readonly endpoint:string,private readonly receive:(reading:CityWeatherReading)=>void,
    private readonly failed:(error:unknown)=>void,private readonly request:typeof fetch=fetch){}
  async refresh():Promise<void> {
    if(!this.endpoint||this.pending||this.stopped)return;
    const controller=this.pending=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
    try{
      const url=new URL(this.endpoint);
      for(const [key,value] of Object.entries({latitude:WEATHER_CITY.latitude,longitude:WEATHER_CITY.longitude,
        current:'precipitation,weather_code,cloud_cover,wind_speed_10m',timeformat:'unixtime',timezone:'America/Sao_Paulo',
        precipitation_unit:'mm',wind_speed_unit:'kmh'}))url.searchParams.set(key,String(value));
      const response=await this.request(url,{signal:controller.signal});
      if(!response.ok)throw new Error(`Clima indisponível (HTTP ${response.status}).`);
      const reading=parseCityWeather(await response.json(),Date.now());
      if(!this.stopped)this.receive(reading);
    }catch(error){if(!this.stopped)this.failed(error);}
    finally{clearTimeout(timeout);this.pending=undefined;}
  }
  stop():void {this.stopped=true;this.pending?.abort();}
}
