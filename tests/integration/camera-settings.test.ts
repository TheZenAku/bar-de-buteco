import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {createSettings,DEFAULT_SETTINGS} from '../../apps/web/src/settings.ts';

/** Each browser reload reads the same stored JSON, with no browser or graphics context needed. */
function browser(t:TestContext,saved?:unknown):void {
  const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  const entries=new Map<string,string>(saved===undefined?[]:[['bar:settings:v1',JSON.stringify(saved)]]);
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
    getItem:(key:string)=>entries.get(key)??null,
    setItem:(key:string,value:string)=>entries.set(key,value),
  }});
  t.after(()=>{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else Reflect.deleteProperty(globalThis,'localStorage');});
}

test('legacy camera presets land on perto, médio and longe in third person',async t=>{
  for(const [camera,cameraDistance] of [['near',2.5],['default',4.2],['far',6.5]] as const){
    await t.test(camera,t=>{
      browser(t,{camera});
      const restored=createSettings().get();
      assert.equal(restored.camera,'third');
      assert.equal(restored.cameraDistance,cameraDistance);
    });
  }
});

test('the chosen zoom survives first person and browser reloads',t=>{
  browser(t);
  const settings=createSettings();
  settings.update({camera:'third',cameraDistance:6.5});
  assert.equal(createSettings().get().cameraDistance,6.5);
  settings.update({camera:'first'});
  const restored=createSettings();
  assert.equal(restored.get().camera,'first');
  assert.equal(restored.get().cameraDistance,6.5);
  restored.update({camera:'third'});
  assert.equal(createSettings().get().cameraDistance,6.5);
});

test('a free zoom saved before the three limits becomes the nearest one',t=>{
  browser(t,{camera:'far',cameraDistance:1234.56789});
  const settings=createSettings();
  assert.equal(settings.get().camera,'third');
  assert.equal(settings.get().cameraDistance,6.5);
  settings.update({cameraDistance:.0125});
  assert.equal(createSettings().get().cameraDistance,2.5);
  browser(t,{camera:'third',cameraDistance:4.725});
  assert.equal(createSettings().get().cameraDistance,4.2);
});

test('malformed stored camera distances fall back while first person remains selected',async t=>{
  for(const cameraDistance of [0,-1,null,'7.5',{},[]]){
    await t.test(JSON.stringify(cameraDistance),t=>{
      browser(t,{camera:'first',cameraDistance});
      const restored=createSettings().get();
      assert.equal(restored.camera,'first');
      assert.equal(restored.cameraDistance,DEFAULT_SETTINGS.cameraDistance);
    });
  }
});

test('invalid updates cannot erase the last usable third-person distance',t=>{
  browser(t,{camera:'third',cameraDistance:2.5});
  const settings=createSettings();
  for(const cameraDistance of [0,-2,NaN,Infinity,-Infinity]){
    settings.update({camera:'first',cameraDistance});
    assert.equal(settings.get().cameraDistance,2.5);
    assert.equal(createSettings().get().cameraDistance,2.5);
  }
});

test('the old starting distance gives way to the new one, and a distance the player chose stays',t=>{
  browser(t,{camera:'third',cameraDistance:6.4});
  assert.equal(createSettings().get().cameraDistance,DEFAULT_SETTINGS.cameraDistance);
  browser(t,{camera:'third',cameraDistance:6.5});
  assert.equal(createSettings().get().cameraDistance,6.5);
});

test('height, sensitivity and smoothing survive a reload and come back in range',t=>{
  browser(t);
  const settings=createSettings();
  assert.deepEqual(settings.get().cameraFeel,{height:0,sensitivity:1,smoothing:.5});
  settings.update({cameraFeel:{height:.25,sensitivity:1.5,smoothing:.2}});
  assert.deepEqual(createSettings().get().cameraFeel,{height:.25,sensitivity:1.5,smoothing:.2});
  browser(t,{cameraFeel:{height:50,sensitivity:'fast',smoothing:7}});
  assert.deepEqual(createSettings().get().cameraFeel,{height:.6,sensitivity:1,smoothing:1});
});
