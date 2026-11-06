import test from 'node:test';
import assert from 'node:assert/strict';
import {ServerClock} from '../../apps/web/src/server-clock';
import {DEFAULT_ENVIRONMENT,formatWorldDate,worldCalendarDate,gameHour,weatherAt} from '@bar/shared';
import {daylightAt} from '../../apps/web/src/engine/day-night';

test('players with different computer clocks share sun, time, civil date and weather from the server',()=>{
  const epoch=Date.UTC(2026,10,6,1,30),environment={...DEFAULT_ENVIRONMENT,realWeatherAt:epoch,realRain:.3,realCloud:.9};
  let monotonic=100,wallA=epoch+7*86_400_000,wallB=epoch-13*3_600_000;
  const a=new ServerClock(()=>monotonic,()=>wallA),b=new ServerClock(()=>monotonic,()=>wallB);
  assert.notEqual(a.now(),b.now());a.sync(epoch);b.sync(epoch);
  monotonic+=1234;
  assert.equal(a.now(),b.now());assert.equal(gameHour(a.now(),environment),gameHour(b.now(),environment));
  assert.deepEqual(daylightAt(a.now(),environment),daylightAt(b.now(),environment));
  assert.deepEqual(weatherAt(a.now(),environment),weatherAt(b.now(),environment));
  assert.equal(formatWorldDate(a.now()),'05/11/2026');assert.equal(formatWorldDate(a.now()),formatWorldDate(b.now()));
  wallA-=90*86_400_000;wallB+=365*86_400_000;monotonic+=10_000;
  assert.equal(a.now(),epoch+11_234);assert.equal(a.now(),b.now(),'wall clock changes cannot alter the world');
  a.sync(0);a.sync(NaN);assert.equal(a.now(),b.now(),'empty departure snapshots preserve the clock');
});

test('the shared clock compensates transport delay and resynchronizes after a suspended tab',()=>{
  let monotonic=0;const epoch=Date.UTC(2026,10,6),clock=new ServerClock(()=>monotonic);
  clock.sync(epoch,60);assert.equal(clock.now(),epoch+60);
  monotonic=500;assert.equal(clock.now(),epoch+560);
  clock.sync(epoch+500);assert.equal(clock.now(),epoch+560,'state packets reuse measured one-way latency');
  monotonic+=20*60_000;clock.sync(epoch+30*60_000,10);assert.equal(clock.now(),epoch+30*60_000+10);
});

test('the calendar uses São Paulo midnight and handles month, year and leap-day boundaries',()=>{
  for(const [instant,day] of [
    ['2026-11-06T02:59:59Z','2026-11-05'],['2026-11-06T03:00:00Z','2026-11-06'],
    ['2027-01-01T02:59:59Z','2026-12-31'],['2027-01-01T03:00:00Z','2027-01-01'],
    ['2028-03-01T02:59:59Z','2028-02-29'],
  ])assert.equal(worldCalendarDate(Date.parse(instant!)).toISOString().slice(0,10),day);
});
