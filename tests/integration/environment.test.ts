import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_ENVIRONMENT,WEATHER,WEATHER_CITY,applyCityWeather,applyEnvironmentPatch,environmentPatchSchema,formatGameHour,gameHour,lightningAt,rainSurfaceHeight,weatherAt} from '@bar/shared';

test('setting, pausing, changing speed and resuming the world clock preserves its phase',()=>{
  const now=Date.UTC(2026,10,4,12),state=applyEnvironmentPatch({...DEFAULT_ENVIRONMENT},{hour:23.5,dayMinutes:24},now);
  assert.equal(gameHour(now+60_000,state),.5);
  const paused=applyEnvironmentPatch(state,{paused:true},now+30_000);
  assert.equal(gameHour(now+600_000,paused),0);
  const resumed=applyEnvironmentPatch(paused,{paused:false,dayMinutes:48},now+600_000);
  assert.equal(gameHour(now+720_000,resumed),1);
  const speed=applyEnvironmentPatch(resumed,{dayMinutes:5},now+720_000);
  assert.equal(gameHour(now+720_000,speed),1);
  assert.equal(formatGameHour(23.5),'23:30');assert.equal(formatGameHour(24),'00:00');
  assert.equal(formatGameHour(-.5),'23:30');
});
test('weather transitions stay continuous when interrupted and are identical for late joiners',()=>{
  const now=Date.UTC(2026,10,4),clear={...DEFAULT_ENVIRONMENT,weather:'clear' as const};
  const storm=applyEnvironmentPatch(clear,{weather:'storm'},now);
  assert.equal(weatherAt(now,storm).rain,0);
  assert.equal(weatherAt(now+WEATHER.transitionMs,storm).rain,1);
  const middle=now+6000,from=weatherAt(middle,storm),next=applyEnvironmentPatch(storm,{weather:'rain'},middle);
  assert.equal(from.rain,weatherAt(middle,next).rain);assert.equal(from.cloud,weatherAt(middle,next).cloud);
  assert.equal(weatherAt(middle+12_000,next).rain,.55);
  assert.deepEqual(weatherAt(middle+1234,next),weatherAt(middle+1234,JSON.parse(JSON.stringify(next))));
  assert.equal(weatherAt(now+999_999_999,storm).kind,'storm');
  const paused=applyEnvironmentPatch(storm,{paused:true},now+20_000);
  assert.equal(weatherAt(now+40_000,paused).rain,1);
});
test('automatic weather follows city readings, preserves transitions and never invents rain',()=>{
  const now=Date.UTC(2026,10,4);
  for(let i=0;i<60;i++)assert.equal(weatherAt(now+i*60_000,DEFAULT_ENVIRONMENT).rain,0);
  const reading={observedAt:now,precipitationMmH:2,cloud:.9,rain:.3,storm:0,wind:.2,kind:'rain' as const};
  const wet=applyCityWeather({...DEFAULT_ENVIRONMENT},reading,now);
  assert.equal(weatherAt(now,wet).rain,0);
  assert.equal(weatherAt(now+WEATHER.transitionMs,wet).rain,.3);
  assert.equal(weatherAt(now+WEATHER.transitionMs,wet).kind,'rain');
  const middle=now+6000,strong=applyCityWeather(wet,{...reading,observedAt:middle,rain:.8,precipitationMmH:10},middle);
  assert.equal(weatherAt(middle,strong).rain,weatherAt(middle,wet).rain);
  assert.equal(weatherAt(middle+WEATHER.transitionMs,strong).rain,.8);
  assert.deepEqual(weatherAt(middle+8000,strong),weatherAt(middle+8000,JSON.parse(JSON.stringify(strong))));
  assert.equal(applyCityWeather(strong,reading,middle).realRain,.8,'older responses cannot replace new weather');
  const dryAt=now+60_000,dry=applyCityWeather(strong,{...reading,observedAt:dryAt,rain:0,precipitationMmH:0},dryAt);
  assert.equal(weatherAt(dryAt+WEATHER.transitionMs,dry).rain,0);
  assert.equal(weatherAt(dryAt+WEATHER.transitionMs,dry).kind,'cloudy');
  assert.equal(weatherAt(now+WEATHER_CITY.maxAgeMs+WEATHER.transitionMs,wet).rain,0,'stale rain fades out');
  const fixed=applyEnvironmentPatch(wet,{weather:'storm',hour:12,paused:true},now+20_000);
  const cached=applyCityWeather(fixed,{...reading,observedAt:now+30_000,rain:.15},now+30_000);
  assert.equal(weatherAt(now+40_000,cached).rain,1,'manual override survives new city data');
  const reset=applyEnvironmentPatch(cached,{reset:true},now+30_000);
  assert.equal(reset.paused,false);assert.equal(reset.dayDurationMs,40*60_000);assert.equal(reset.weather,'auto');
  assert.equal(reset.realRain,.15);assert.equal(weatherAt(now+42_000,reset).rain,.15);
  assert.equal(gameHour(now+30_000,reset),gameHour(now+30_000));
});
test('lightning is deterministic, thunder follows it, and dry or overcast weather never flashes',()=>{
  const storm=weatherAt(0,{...DEFAULT_ENVIRONMENT,weather:'storm'}),base=Date.UTC(2026,10,4);
  const strike=lightningAt(base,storm);
  assert.ok(strike.thunderAt>strike.strikeAt+1000);
  assert.equal(lightningAt(strike.strikeAt,storm).flash,1);
  assert.equal(lightningAt(strike.strikeAt+700,storm).flash,0);
  assert.deepEqual(lightningAt(base,storm),lightningAt(base,{...storm}));
  for(const weather of ['clear','cloudy','rain'] as const)assert.equal(lightningAt(strike.strikeAt,weatherAt(base,{...DEFAULT_ENVIRONMENT,weather})).flash,0);
});
test('environment commands reject malformed data, unknown fields and unsafe speeds',()=>{
  for(const patch of [{},{hour:24},{hour:-1},{hour:NaN},{dayMinutes:0},{dayMinutes:241},{weather:'tornado'},{paused:'true'},{reset:true,hour:12},{anchorMs:1}])
    assert.equal(environmentPatchSchema.safeParse(patch).success,false,JSON.stringify(patch));
  assert.equal(environmentPatchSchema.safeParse({hour:6.5,dayMinutes:40,weather:'rain',paused:false}).success,true);
});
test('rain stops over the bar, upper floor and veranda while streets remain exposed',()=>{
  assert.ok(rainSurfaceHeight(14,-6)>5,'bar roof');
  assert.ok(rainSurfaceHeight(12,-1.5)>=2.8,'front veranda');
  assert.ok(rainSurfaceHeight(1.5,-9)>=2.8,'side veranda');
  assert.ok(rainSurfaceHeight(12,5)<1,'street outside');
});
