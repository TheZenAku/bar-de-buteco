import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GRAPHICS_PRESETS,readGraphics,defaultGraphics} from '../../apps/web/src/graphics';
import {nextGraphics} from '../../apps/web/src/economy-ui';
import {GRAIN_AMOUNT} from '../../apps/web/src/engine/film-grain';

test('film grain: faint by default, off on Baixo, and the levels only ever get stronger',()=>{
  assert.equal(GRAPHICS_PRESETS.low.grain,'off');
  for(const preset of ['medium','high','ultra'] as const)assert.equal(GRAPHICS_PRESETS[preset].grain,'light');
  const {off,light,medium,strong}=GRAIN_AMOUNT;
  assert.ok(off===0&&light>0&&light<medium&&medium<strong);
  // "Bem de leve": the default is a few per cent of full brightness at its peak, no more.
  assert.ok(light<=.04&&strong<=.1);
});

test('graphics saved before the grain existed get their preset\'s, and bad values fall back',()=>{
  const old={preset:'low',renderScale:.6,dynamicResolution:true,shadows:'off',fog:'dense',fpsCap:30,pixelRatioCap:1,city:'low'};
  assert.equal(readGraphics(old).grain,'off');
  assert.equal(readGraphics({...old,preset:'ultra'}).grain,'light');
  assert.equal(readGraphics({...old,preset:'custom'}).grain,defaultGraphics().grain);
  assert.equal(readGraphics({...old,grain:'strong'}).grain,'strong');
  assert.equal(readGraphics({...old,preset:'high',grain:'confetti'}).grain,'light');
  assert.equal(readGraphics(null).grain,defaultGraphics().grain);
});

test('changing the grain makes the quality Personalizado and keeps everything else',()=>{
  const high=readGraphics({preset:'high',...GRAPHICS_PRESETS.high});
  const next=nextGraphics(high,'grain','strong');
  assert.equal(next.grain,'strong');assert.equal(next.preset,'custom');
  assert.deepEqual({...next,grain:high.grain,preset:high.preset},high);
  // Choosing a preset applies its grain too.
  assert.equal(nextGraphics(next,'preset','low').grain,'off');
});
