import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_ENVIRONMENT,WEATHER,applyEnvironmentPatch,environmentPatchSchema,formatGameHour,gameHour,lightningAt,rainSurfaceHeight,weatherAt} from '@bar/shared';

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
test('automatic weather includes clear skies, overcast, rain and storms and crosses cycle boundaries smoothly',()=>{
  const kinds=new Set<string>();
  for(let i=-8;i<16;i++){
    const boundary=DEFAULT_ENVIRONMENT.anchorMs+i*WEATHER.periodMs;
    const a=weatherAt(boundary-1,DEFAULT_ENVIRONMENT),b=weatherAt(boundary+1,DEFAULT_ENVIRONMENT);
    assert.ok(Math.abs(a.rain-b.rain)<.001);assert.ok(Math.abs(a.cloud-b.cloud)<.001);
    kinds.add(weatherAt(boundary+20_000,DEFAULT_ENVIRONMENT).kind);
  }
  assert.deepEqual([...kinds].sort(),['clear','cloudy','rain','storm']);
  const now=Date.UTC(2026,10,4),fixed=applyEnvironmentPatch({...DEFAULT_ENVIRONMENT},{weather:'storm',hour:12,paused:true},now);
  const reset=applyEnvironmentPatch(fixed,{reset:true},now+30_000);
  assert.equal(reset.paused,false);assert.equal(reset.dayDurationMs,40*60_000);assert.equal(reset.weather,'auto');
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
