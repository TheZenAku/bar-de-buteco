import test from 'node:test';
import assert from 'node:assert/strict';
import {WEATHER_CITY,type CityWeatherReading} from '@bar/shared';
import {CityWeather,parseCityWeather} from '../src/world/city-weather.js';

const payload=(now:number,precipitation=0,code=3,interval=900)=>({current:{time:Math.floor(now/1000),interval,
  precipitation,weather_code:code,cloud_cover:80,wind_speed_10m:12}});

test('city rainfall converts accumulation to mm/h and scales drizzle, rain and storms continuously',()=>{
  const now=Date.now(),dry=parseCityWeather(payload(now),now),drizzle=parseCityWeather(payload(now,.025,51),now),
    rain=parseCityWeather(payload(now,.5,63),now),storm=parseCityWeather(payload(now,5,95),now);
  assert.equal(dry.rain,0);assert.equal(dry.kind,'cloudy');assert.equal(dry.storm,0);
  assert.equal(rain.precipitationMmH,2);assert.equal(drizzle.precipitationMmH,.1);
  assert.ok(drizzle.rain>0&&drizzle.rain<rain.rain&&rain.rain<storm.rain);
  assert.equal(storm.rain,1);assert.equal(storm.kind,'storm');assert.equal(storm.storm,1);
  assert.equal(rain.storm,0);assert.equal(rain.wind,.2);
  assert.equal(parseCityWeather(payload(now,2,63,3600),now).rain,rain.rain,'units follow each response interval');
  assert.equal(parseCityWeather(payload(now,0,95),now).rain,0,'a code alone cannot invent rain');
});

test('invalid, stale, future or incomplete provider readings are rejected',()=>{
  const now=Date.now();
  for(const body of [{},payload(now-WEATHER_CITY.maxAgeMs-1000),payload(now+120_000),payload(now,-1),payload(now,1,3,0),
    {...payload(now),current:{...payload(now).current,cloud_cover:101}},
    {...payload(now),current:{...payload(now).current,precipitation:NaN}}])assert.throws(()=>parseCityWeather(body,now));
});

test('polling uses fixed city coordinates, prevents overlapping requests and retains the last success after failures',async()=>{
  const readings:CityWeatherReading[]=[],errors:unknown[]=[],urls:URL[]=[];
  let resolve!:(response:Response)=>void;
  const request:typeof fetch=async input=>{urls.push(new URL(String(input)));return new Promise<Response>(r=>{resolve=r;});};
  const weather=new CityWeather('https://weather.example/forecast',r=>readings.push(r),e=>errors.push(e),request);
  const first=weather.refresh();await weather.refresh();assert.equal(urls.length,1);
  const url=urls[0]!;assert.equal(url.searchParams.get('latitude'),String(WEATHER_CITY.latitude));
  assert.equal(url.searchParams.get('longitude'),String(WEATHER_CITY.longitude));
  assert.equal(url.searchParams.get('timeformat'),'unixtime');assert.equal(url.searchParams.get('precipitation_unit'),'mm');
  resolve(Response.json(payload(Date.now(),.5,63)));await first;assert.equal(readings.length,1);
  const second=weather.refresh();resolve(new Response('',{status:503}));await second;
  assert.equal(errors.length,1);assert.equal(readings.length,1);
  const third=weather.refresh();resolve(Response.json({}));await third;
  assert.equal(errors.length,2);assert.equal(readings.length,1);
  const fourth=weather.refresh();weather.stop();resolve(Response.json(payload(Date.now())));await fourth;
  assert.equal(readings.length,1,'disposed rooms do not receive late results');await weather.refresh();assert.equal(urls.length,4);
  await new CityWeather('',()=>assert.fail('disabled'),()=>assert.fail('disabled'),request).refresh();assert.equal(urls.length,4);
});
