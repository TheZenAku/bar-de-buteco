import test from 'node:test';
import assert from 'node:assert/strict';
import {FrameWindow} from '../../apps/web/src/performance/frames';
import {PerformanceMonitor,readPreferences,type RenderPerformance} from '../../apps/web/src/performance/monitor';

test('1% low averages the slowest frames; frame p99 alone misses an isolated stall',()=>{
  const window=new FrameWindow();let at=0;
  for(let i=0;i<1000;i++){const ms=i===999?200:i>=990?50:10;at+=ms;window.add(at,ms);}
  const summary=window.summary(at,60,50);
  assert.equal(summary.samples,1000);assert.equal(summary.p99,10);
  assert.ok(Math.abs(summary.low1!-1000/65)<1e-9);
  assert.equal(summary.low01,5);assert.equal(summary.max,200);
  assert.equal(summary.stutters,10);assert.equal(summary.severe,1);
  assert.ok(Math.abs(summary.averageFps!-1000000/10550)<1e-9);
});
test('time windows expire samples, keep genuine long stalls and withhold undersampled lows',()=>{
  const window=new FrameWindow();
  window.add(100,16);window.add(110,0);window.add(120,NaN);window.add(Infinity,15);
  window.add(15000,1500);
  const summary=window.summary(15000,10,50);
  assert.equal(summary.samples,1);assert.equal(summary.fps,1000/1500);assert.equal(summary.low1,null);assert.equal(summary.low01,null);
  assert.equal(summary.max,1500);assert.equal(summary.severe,1);
  assert.equal(window.summary(26000,10,50).samples,0);
  window.clear();assert.equal(window.samples(0,30).length,0);
});
test('frame collection has a hard bound independent of UI timers',()=>{
  const window=new FrameWindow();for(let i=0;i<50000;i++)window.add(i,.1);
  assert.equal(window.samples(50000,60).length,24000);
});
test('saved diagnostic preferences reject malformed values and preserve explicit empty selections',()=>{
  assert.deepEqual(readPreferences({metrics:[],enabled:true}).metrics,[]);
  const p=readPreferences({enabled:'true',hud:true,corner:'elsewhere',metrics:['fps','fps','__proto__','server','missing'],windowSeconds:999,targetFps:1,stutterMs:-5});
  assert.equal(p.enabled,false);assert.equal(p.hud,true);assert.equal(p.corner,'top-right');assert.equal(p.windowSeconds,30);assert.equal(p.targetFps,60);assert.equal(p.stutterMs,20);
  assert.deepEqual(p.metrics,['fps','server']);assert.equal(readPreferences({stutterMs:Infinity}).stutterMs,50);
});

test('monitor excludes menu/background gaps, respects revocation and keeps reset from flooding server requests',t=>{
  const originalDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
  const fakeDocument=Object.assign(new EventTarget(),{hidden:false});Object.defineProperty(globalThis,'document',{configurable:true,value:fakeDocument});
  let clock=0,allowed=true,capturing=true,requests=0,frame:((value:RenderPerformance|null)=>void)|undefined;
  const draw=(value:RenderPerformance|null)=>{if(!frame)throw new Error('Frame observer was not attached');frame(value);};
  t.mock.method(performance,'now',()=>clock);
  const render:RenderPerformance={updateMs:1,renderMs:2,gpuMs:null,drawCalls:100,primitives:null,vram:1024,width:960,height:640,scale:1,actors:3,compiling:0};
  const monitor=new PerformanceMonitor({allowed:()=>allowed,capturing:()=>capturing,pending:()=>0,position:()=>'',requestServer:()=>requests++,observe:callback=>{frame=callback;}});
  try{
    monitor.forUser('monitor-test');monitor.configure({enabled:true});assert.ok(frame);assert.equal(requests,1);
    clock=10;draw(render);clock=26;draw(render);
    capturing=false;clock=40;draw(null);clock=5400;capturing=true;draw(render);clock=5420;draw(render);monitor.refresh();
    assert.equal(monitor.state.frames.samples,2);assert.equal(monitor.state.frames.max,20);assert.equal(monitor.state.events.length,0);
    const before=requests;monitor.reset();monitor.reset();assert.equal(requests,before,'resetting within a poll interval must not send duplicate commands');
    fakeDocument.hidden=true;fakeDocument.dispatchEvent(new Event('visibilitychange'));assert.equal(frame,undefined);
    clock=100000;monitor.refresh();assert.equal(requests,before,'hidden tabs do not poll the server');
    fakeDocument.hidden=false;fakeDocument.dispatchEvent(new Event('visibilitychange'));assert.ok(frame);
    draw(render);clock=100016;draw(render);monitor.refresh();assert.equal(monitor.state.frames.max,16);assert.equal(monitor.state.events.length,0);
    allowed=false;monitor.refresh();assert.equal(frame,undefined);assert.equal(monitor.state.enabled,false);
  }finally{
    monitor.destroy();if(originalDocument)Object.defineProperty(globalThis,'document',originalDocument);else Reflect.deleteProperty(globalThis,'document');
  }
});
