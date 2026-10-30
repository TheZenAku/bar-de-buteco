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

test('legacy camera presets restore their previous distance as free third person',async t=>{
  for(const [camera,cameraDistance] of [['near',3],['default',6.4],['far',10.5]] as const){
    await t.test(camera,t=>{
      browser(t,{camera});
      const restored=createSettings().get();
      assert.equal(restored.camera,'third');
      assert.equal(restored.cameraDistance,cameraDistance);
    });
  }
});

test('a fine camera distance survives first person and browser reloads without rounding or a preset',t=>{
  browser(t);
  const settings=createSettings();
  settings.update({camera:'third',cameraDistance:7.1375});
  assert.equal(createSettings().get().cameraDistance,7.1375);
  settings.update({camera:'first'});
  const restored=createSettings();
  assert.equal(restored.get().camera,'first');
  assert.equal(restored.get().cameraDistance,7.1375);
  restored.update({camera:'third'});
  assert.equal(createSettings().get().cameraDistance,7.1375);
});

test('explicit free distances take precedence over legacy preset values and have no artificial maximum',t=>{
  browser(t,{camera:'far',cameraDistance:1234.56789});
  const settings=createSettings();
  assert.equal(settings.get().camera,'third');
  assert.equal(settings.get().cameraDistance,1234.56789);
  settings.update({cameraDistance:.0125});
  assert.equal(createSettings().get().cameraDistance,.0125);
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
  browser(t,{camera:'third',cameraDistance:4.725});
  const settings=createSettings();
  for(const cameraDistance of [0,-2,NaN,Infinity,-Infinity]){
    settings.update({camera:'first',cameraDistance});
    assert.equal(settings.get().cameraDistance,4.725);
    assert.equal(createSettings().get().cameraDistance,4.725);
  }
});
