import test from 'node:test';
import assert from 'node:assert/strict';
import {ACHIEVEMENT_SERIES,ADMIN_XP_REMOVED_SERIES,ADMIN_XP_SERIES,DAILY_XP,DAILY_XP_SERIES,LEGACY_PRESENCE_XP_SERIES,dailyXp,priceEntry,MAX_LEVEL,RANKS,levelOf,rankOf,xpAtLevel,xpOfCounters,xpToNext} from '@bar/shared';

test('levels run from 1 to 100, each needing more XP than the one before',()=>{
  assert.deepEqual(levelOf(0),{level:1,xp:0,into:0,need:xpToNext(1)});
  for(let level=1;level<MAX_LEVEL;level++){
    assert.ok(xpToNext(level+1)>xpToNext(level),`level ${level+1} costs more`);
    assert.equal(levelOf(xpAtLevel(level+1)-1).level,level,'one XP short stays');
    assert.deepEqual(levelOf(xpAtLevel(level+1)),{level:level+1,xp:xpAtLevel(level+1),into:0,need:level+1<MAX_LEVEL?xpToNext(level+1):0});
  }
  assert.equal(levelOf(xpAtLevel(MAX_LEVEL)*10).level,MAX_LEVEL,'no level past the top');
  assert.equal(levelOf(-5).level,1);
});

test('ten ranks of ten levels',()=>{
  assert.equal(RANKS.length,10);
  assert.deepEqual([rankOf(1),rankOf(10),rankOf(11),rankOf(100)].map(r=>[r.index,r.step]),[[0,1],[0,10],[1,1],[9,10]]);
});

test('XP comes from actions and daily bonuses, while time connected only counts for badges',()=>{
  for(const series of ACHIEVEMENT_SERIES){
    const xp=xpOfCounters([{series:series.id,value:(series.per??1)*1000}]);
    if(series.id==='frequentador')assert.equal(xp,0,'presence gives no XP');
    else assert.ok(xp>0,`${series.id} gives XP`);
  }
  assert.equal(xpOfCounters([{series:'bebum',value:3},{series:'frequentador',value:3600},{series:DAILY_XP_SERIES,value:75},{series:`${DAILY_XP_SERIES}:2026-11-08`,value:3},{series:'nada',value:9}]),30+75);
});

test('presence never grants XP even with an old override; historical presence XP stays fixed',()=>{
  for(const value of [0,60,3600,720000]){
    assert.equal(xpOfCounters([{series:'frequentador',value}],{'xp:frequentador':600}),0);
    assert.equal(xpOfCounters([{series:'frequentador',value},{series:LEGACY_PRESENCE_XP_SERIES,value:123},{series:'bebum',value:1}]),133);
  }
  assert.equal(priceEntry('xp:frequentador'),undefined,'passive XP cannot be enabled through the panel');
});

test("the panel's XP values replace the code's, and the administration's counters add and take away",()=>{
  const rows=[{series:'bebum',value:3},{series:LEGACY_PRESENCE_XP_SERIES,value:60}];
  assert.equal(xpOfCounters(rows,{'xp:bebum':100}),300+60,'a beer worth 100 XP');
  assert.equal(xpOfCounters(rows,{'xp:frequentador':0}),90,'the old rate cannot change fixed historical XP');
  assert.equal(xpOfCounters([...rows,{series:ADMIN_XP_REMOVED_SERIES,value:20}]),70,'taken away');
  assert.equal(xpOfCounters([...rows,{series:ADMIN_XP_REMOVED_SERIES,value:500}]),0,'never below zero');
  assert.equal(xpOfCounters([{series:ADMIN_XP_SERIES,value:xpAtLevel(40)}]),xpAtLevel(40));
  assert.deepEqual(dailyXp({'xp:daily-7':1000}),[...DAILY_XP.slice(0,6),1000]);
  for(const series of ACHIEVEMENT_SERIES.filter(series=>series.id!=='frequentador'))assert.equal(priceEntry(`xp:${series.id}`)?.group,'xp',`${series.id} is editable`);
  assert.equal(priceEntry('xp:daily-1')?.defaultValue,DAILY_XP[0]);
});
