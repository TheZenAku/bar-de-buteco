import test from 'node:test';
import assert from 'node:assert/strict';
import {FrameWindow} from '../../apps/web/src/performance/frames';
import {PerformanceMonitor,readPreferences,type RenderPerformance} from '../../apps/web/src/performance/monitor';
import {PerformanceRecording,distribution,safeUrl,UpdateProfiler} from '../../apps/web/src/performance/recording';
import {BrowserDiagnostics} from '../../apps/web/src/performance/browser';

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

test('recording aggregates every frame, preserves tails, and keeps unavailable GPU separate from zero',()=>{
  const recording=new PerformanceRecording(100),render:RenderPerformance={updateMs:1,renderMs:2,gpuMs:null,drawCalls:50,primitives:null,vram:100,width:960,height:640,scale:1,actors:3,compiling:0,phases:{avatars:3},detailPhases:{voice:1}};
  recording.add(110,10,render,16.67,50);recording.add(120,200,{...render,updateMs:40,gpuMs:0,phases:{avatars:30}},16.67,50);
  render.phases!.avatars=999;recording.add(130,NaN,render,16.67,50);
  const r=recording.report(),b=r.buckets[0]!;
  assert.equal(r.totalFrames,2);assert.equal(r.totalStutters,1);assert.equal(r.totalOverBudget,1);assert.equal(r.activeSeconds,.21);
  assert.equal(b.startMs,10);assert.equal(b.metrics.frameMs.max,200);assert.equal(b.metrics.frameMs.mean,105);
  assert.equal(b.metrics.gpuMs.samples,1);assert.equal(b.metrics.gpuMs.mean,0);assert.equal(b.metrics.primitives.mean,null);
  assert.equal(b.phases.avatars!.max,30);assert.equal(b.details.voice!.samples,2);
  assert.deepEqual(distribution([]),{samples:0,mean:null,p50:null,p95:null,p99:null,max:null});
  recording.flush();assert.equal(recording.report().totalFrames,2,'export/flush never count frames again');
});

test('recording retention is bounded while session totals survive discarded intervals and pauses',()=>{
  const recording=new PerformanceRecording(0,3),render:RenderPerformance={updateMs:1,renderMs:2,gpuMs:null,drawCalls:50,primitives:null,vram:100,width:960,height:640,scale:1,actors:3,compiling:0};
  for(let i=0;i<10;i++){recording.add(i*1000,10,render,16,50);recording.flush();}
  const r=recording.report();assert.equal(r.totalFrames,10);assert.equal(r.activeSeconds,.1);assert.equal(r.buckets.length,3);assert.equal(r.retention.droppedBuckets,7);
  assert.equal(r.buckets[0]!.startMs,7000);assert.equal(r.averageFps,100);
});

test('instrumentation does no clock reads while disabled; sections are exclusive',t=>{
  let clock=0,reads=0;t.mock.method(performance,'now',()=>{reads++;return clock;});
  const profiler=new UpdateProfiler();profiler.begin();profiler.mark('avatars');assert.equal(reads,0);
  profiler.enabled=true;profiler.begin();clock=3;profiler.mark('avatars');clock=8;profiler.mark('camera');
  assert.deepEqual(profiler.timings,{avatars:3,camera:5});profiler.begin();assert.equal(profiler.timings.avatars,0);
});

test('browser observers attribute delayed tasks to gameplay ranges, sanitize locations and bound resources',()=>{
  const original=Object.getOwnPropertyDescriptor(globalThis,'PerformanceObserver');
  const callbacks=new Map<string,(list:{getEntries:()=>PerformanceEntry[]})=>void>();
  const resourceBuffering:boolean[]=[];
  class Observer {
    static supportedEntryTypes=['longtask','long-animation-frame','resource'];
    type='';constructor(private callback:(list:{getEntries:()=>PerformanceEntry[]})=>void){}
    observe({type,buffered}:{type:string;buffered:boolean}){this.type=type;callbacks.set(type,this.callback);if(type==='resource')resourceBuffering.push(buffered);}disconnect(){callbacks.delete(this.type);}
  }
  Object.defineProperty(globalThis,'PerformanceObserver',{configurable:true,value:Observer});
  const emit=(type:string,entry:object)=>callbacks.get(type)!({getEntries:()=>[entry as PerformanceEntry]});
  const browser=new BrowserDiagnostics(100);
  try{
    browser.start();browser.capture(true,100);browser.capture(false,200);browser.capture(true,500);
    emit('longtask',{startTime:120,duration:60});emit('longtask',{startTime:190,duration:60});emit('longtask',{startTime:300,duration:60});
    assert.equal(browser.tasks.count,1);assert.equal(browser.tasks.maxMs,60);
    emit('long-animation-frame',{startTime:510,duration:70,blockingDuration:15,scripts:[{sourceURL:'https://user:password@example.com/a.js?token=secret#x',sourceFunctionName:'update',duration:20}]});
    for(let i=0;i<1005;i++)emit('resource',{name:'https://example.com/a.glb?secret=1',initiatorType:'fetch',startTime:0,duration:10,transferSize:15,encodedBodySize:10,decodedBodySize:20,responseStart:1,responseEnd:10});
    const r=browser.report();assert.equal(r.resources.length,1000);assert.equal(r.totals.resources,1005);assert.equal(r.totals.transferBytes,15075);
    assert.equal(r.resources[0]!.startMs,-100);assert.equal(r.resources[0]!.path,'/a.glb');
    assert.equal((r.longAnimationFrames[0]!.scripts[0] as {source:string}).source,'/a.js');
    assert.equal(safeUrl('data:secret'),'[data]');assert.equal(safeUrl('https://u:p@e.com/file?q=x#fragment'),'/file');
    browser.stop();assert.equal(callbacks.size,0);
    browser.start();assert.deepEqual(resourceBuffering,[true,false],'resuming must not count buffered resources twice');
  }finally{browser.stop();if(original)Object.defineProperty(globalThis,'PerformanceObserver',original);else Reflect.deleteProperty(globalThis,'PerformanceObserver');}
});

test('v2 export survives an expired HUD window, records markers and degrades if inventory fails',t=>{
  const originalDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
  Object.defineProperty(globalThis,'document',{configurable:true,value:Object.assign(new EventTarget(),{hidden:false})});
  let clock=0,allowed=true,inventoryCalls=0,frame:((value:RenderPerformance|null)=>void)|undefined;
  t.mock.method(performance,'now',()=>clock);
  const monitor=new PerformanceMonitor({allowed:()=>allowed,capturing:()=>true,pending:()=>0,position:()=>'(1,2)',requestServer:()=>{},observe:cb=>{frame=cb;},inventory:()=>{inventoryCalls++;throw new Error('unavailable');}});
  const render:RenderPerformance={updateMs:1,renderMs:2,gpuMs:null,drawCalls:50,primitives:null,vram:100,width:960,height:640,scale:1,actors:3,compiling:0};
  try{
    monitor.forUser('v2-test');monitor.configure({enabled:true});frame!(render);clock=200;frame!(render);
    monitor.setScenario('  palco  ');monitor.mark();clock=70000;
    const report=monitor.report();assert.equal(report.version,2);assert.equal(report.frames.samples,0);assert.equal(report.recording.totalFrames,1);
    assert.equal(report.recording.totalStutters,1);assert.equal(report.session.markers[0]!.label,'palco');assert.equal(report.inventory,null);assert.ok(report.inventoryError);
    assert.equal(report.environment.viewport,null);assert.ok(report.claudePrompt.includes('PlayCanvas'));assert.doesNotThrow(()=>JSON.stringify(report));
    allowed=false;monitor.refresh();monitor.report();assert.equal(inventoryCalls,1,'revoked observers cannot inspect the scene');
    monitor.reset();assert.equal(monitor.report().recording.totalFrames,0);assert.equal(monitor.report().session.markers.length,0);
  }finally{monitor.destroy();if(originalDocument)Object.defineProperty(globalThis,'document',originalDocument);else Reflect.deleteProperty(globalThis,'document');}
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
    assert.deepEqual(monitor.report().browser.events.map(event=>event.kind),['hidden','visible'],'visibility changes survive observer suspension');
    draw(render);clock=100016;draw(render);monitor.refresh();assert.equal(monitor.state.frames.max,16);assert.equal(monitor.state.events.length,0);
    allowed=false;monitor.refresh();assert.equal(frame,undefined);assert.equal(monitor.state.enabled,false);
    allowed=true;monitor.refresh();assert.ok(frame);monitor.forUser('');assert.equal(frame,undefined,'logging out detaches the engine observer during reset');
  }finally{
    monitor.destroy();if(originalDocument)Object.defineProperty(globalThis,'document',originalDocument);else Reflect.deleteProperty(globalThis,'document');
  }
});
