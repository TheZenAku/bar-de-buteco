import test from 'node:test';
import assert from 'node:assert/strict';
import {sectorAt,sectorName} from '@bar/shared';
import {CENTRE_MARGIN,CITY_TUNING,CityPlanner,RETAIN_MS,RETRY_MS,type CityBackend,type LodMode,type SlotKind} from '../../apps/web/src/engine/city-plan';

interface Handle {id:string}
/** Records what the planner asks for; `hold` keeps loads waiting until `settle`. */
class Fake implements CityBackend<Handle> {
  loads=new Map<string,number>();
  loaded=new Set<string>();
  shown=new Map<string,{kind:SlotKind;mode:LodMode}>();
  both=0;
  disposed:string[]=[];
  warnings:string[]=[];
  waiting:Array<{id:string;resolve:(handle:Handle)=>void;reject:(error:unknown)=>void}>=[];
  hold=false;
  failing=new Set<string>();
  load(sector:string,kind:SlotKind):Promise<Handle> {
    const id=`${sector}/${kind}`;
    this.loads.set(id,(this.loads.get(id)??0)+1);
    assert.ok(!this.loaded.has(id),`${id} requested while loaded`);
    return new Promise((resolve,reject)=>{
      if(this.hold)this.waiting.push({id,resolve,reject});
      else if(this.failing.has(id))reject(new Error('404'));
      else {this.loaded.add(id);resolve({id});}
    });
  }
  dispose(sector:string,kind:SlotKind,handle:Handle):void {
    const id=`${sector}/${kind}`;
    assert.equal(handle.id,id);
    assert.ok(this.loaded.delete(id),`${id} disposed twice`);
    assert.notEqual(this.shown.get(sector)?.kind,kind,`${id} disposed while showing`);
    this.disposed.push(id);
  }
  show(sector:string,kind:SlotKind,_handle:Handle,visible:boolean,mode:LodMode):void {
    const current=this.shown.get(sector);
    if(visible){
      if(current&&current.kind!==kind)this.both++;
      this.shown.set(sector,{kind,mode});
    }else if(current?.kind===kind)this.shown.delete(sector);
  }
  warn(message:string):void {this.warnings.push(message);}
  settle():void {for(const load of this.waiting.splice(0)){this.loaded.add(load.id);load.resolve({id:load.id});}}
  full():string[] {return [...this.shown].filter(([,v])=>v.kind==='full').map(([name])=>name).sort();}
}
/** Runs ticks of 200 ms with everything loading at once (a macrotask lets the promises land), up to `to`. */
async function run(planner:CityPlanner<Handle>,clock:{now:number},x:number,z:number,seconds=3,radius=650):Promise<void> {
  for(let elapsed=0;elapsed<seconds*1000;elapsed+=200){
    clock.now+=200;
    planner.update(clock.now,x,z,radius);
    await new Promise(resolve=>setImmediate(resolve));
  }
}
const around=(col:number,row:number)=>{
  const names:string[]=[];
  for(let c=col-1;c<=col+1;c++)for(let r=row-1;r<=row+1;r++)if(c>=0&&c<8&&r>=0&&r<8)names.push(sectorName({col:c,row:r}));
  return names.sort();
};

test('the sector the player is in and its eight neighbours show in full, the rest as LOD, and never both',async()=>{
  const backend=new Fake(),planner=new CityPlanner(backend),clock={now:0};
  planner.setTuning(CITY_TUNING.medium);
  await run(planner,clock,50,-50,20);
  assert.deepEqual(backend.full(),around(4,4));
  const metrics=planner.metrics();
  assert.equal(metrics.sector,'S04_04');assert.equal(metrics.fullShown,9);assert.equal(metrics.fullLoaded,9);
  assert.equal(metrics.lodShown+metrics.fullShown,backend.shown.size);
  assert.equal(backend.both,0,'a sector swaps one for the other, never showing both');
  assert.ok(backend.loads.size<=64+9,'the city is never all in full detail');
  assert.equal(backend.shown.get('S04_05')?.kind,'full');
  assert.equal(backend.shown.get('S04_06')?.kind,'lod');assert.equal(backend.shown.get('S04_06')?.mode,'mid');
  assert.equal(backend.shown.get('S00_00')?.kind,'lod');assert.equal(backend.shown.get('S00_00')?.mode,'far');
  for(const count of backend.loads.values())assert.equal(count,1,'one load per file');
});

test('at the map\'s corners there are simply fewer neighbours, and the grid never runs past the rim',async()=>{
  for(const [x,z,name] of [[-395,395,'S00_00'],[395,-395,'S07_07'],[395,395,'S07_00'],[-395,-395,'S00_07']] as const){
    const backend=new Fake(),planner=new CityPlanner(backend),clock={now:0};
    planner.setTuning(CITY_TUNING.medium);
    await run(planner,clock,x,z,14);
    assert.equal(planner.metrics().sector,name);
    assert.equal(backend.full().length,4);
  }
});

test('standing on a sector line swaps nothing, however often the player steps over it',async()=>{
  const backend=new Fake(),planner=new CityPlanner(backend),clock={now:0};
  planner.setTuning(CITY_TUNING.medium);
  await run(planner,clock,99.9,-50,15);
  const before=backend.disposed.length,loads=[...backend.loads.values()].reduce((a,b)=>a+b,0),full=backend.full();
  for(let i=0;i<40;i++)await run(planner,clock,i%2?99.9:100.1,-50,.4);
  assert.deepEqual(backend.full(),full,'the same sectors around');
  assert.equal(planner.metrics().sector,'S04_04');
  assert.equal(backend.disposed.length,before,'nothing unloaded');
  assert.equal([...backend.loads.values()].reduce((a,b)=>a+b,0),loads,'nothing loaded again');
  // Well past the margin, it moves on.
  await run(planner,clock,100+CENTRE_MARGIN+1,-50,1);
  assert.equal(planner.metrics().sector,'S05_04');
});

test('crossing sectors back and forth never duplicates a full sector, and what is left behind goes away',async()=>{
  const backend=new Fake(),planner=new CityPlanner(backend),clock={now:0};
  planner.setTuning(CITY_TUNING.medium);
  await run(planner,clock,50,-50,15);
  for(let lap=0;lap<6;lap++){
    for(const x of [150,250,350,250,150,50]){
      await run(planner,clock,x,-50,2);
      assert.ok(backend.full().length<=9,`at most 9 in full detail, ${backend.full().length} at x=${x}`);
      assert.ok([...backend.loaded].filter(id=>id.endsWith('full')).length<=9+6*3,'bounded: only what is around and what has not timed out');
      assert.equal(backend.both,0);
    }
  }
  await run(planner,clock,50,-50,(RETAIN_MS/1000)+4);
  assert.deepEqual(backend.full(),around(4,4));
  assert.deepEqual([...backend.loaded].filter(id=>id.endsWith('full')).map(id=>id.slice(0,6)).sort(),around(4,4),'nothing else in full detail is kept');
});

test('a sector stays covered: the LOD shows until the full file arrives, and the full one until the LOD is back',async()=>{
  const backend=new Fake(),planner=new CityPlanner(backend),clock={now:0};
  planner.setTuning(CITY_TUNING.medium);
  await run(planner,clock,50,-50,20);
  backend.hold=true;
  // Walking east: S06_04 comes into the 3 × 3, still as LOD while its file loads.
  await run(planner,clock,160,-50,.4);
  assert.equal(planner.metrics().sector,'S05_04');
  assert.equal(backend.shown.get('S06_04')?.kind,'lod');
  backend.settle();
  await run(planner,clock,160,-50,.6);
  backend.settle();
  await run(planner,clock,160,-50,1);
  assert.equal(backend.shown.get('S06_04')?.kind,'full');
  for(const name of around(5,4))assert.ok(backend.shown.has(name),`${name} shows something`);
});

test('a load that ends after the sector was left is kept out of sight, then freed; none leak',async()=>{
  const backend=new Fake(),planner=new CityPlanner(backend),clock={now:0};
  planner.setTuning(CITY_TUNING.low);
  backend.hold=true;
  await run(planner,clock,50,-50,.4);
  const late=backend.waiting.map(load=>load.id);
  assert.ok(late.length>0&&planner.metrics().pending===late.length);
  // Off to the far corner before anything arrives.
  await run(planner,clock,-390,390,1);
  backend.settle();
  backend.hold=false;
  await run(planner,clock,-390,390,RETAIN_MS/1000+6,455);
  for(const id of late)if(id.endsWith('full'))assert.equal(backend.shown.get(id.slice(0,6))?.kind==='full',false,`${id} is not shown`);
  assert.ok(backend.disposed.some(id=>late.includes(id)),'the late arrivals were freed');
  assert.equal(planner.metrics().pending,0);
  // And none arrives after the end.
  backend.hold=true;
  await run(planner,clock,350,-350,1,455);
  const flying=backend.waiting.length;
  assert.ok(flying>0);
  planner.destroy();
  assert.equal(backend.shown.size,0,'everything hidden');
  backend.settle();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(backend.loaded.size,0,'everything freed, late arrivals too');
});

test('a file that fails is tried a few times with growing waits, and the LOD stays in its place',async()=>{
  const backend=new Fake(),planner=new CityPlanner(backend),clock={now:0};
  planner.setTuning(CITY_TUNING.medium);
  backend.failing.add('S04_04/full');
  const realNow=performance.now;
  // The retry clock runs on real time; move it with the test's.
  let shift=0;performance.now=()=>realNow.call(performance)+shift;
  try{
    for(let i=0;i<300;i++){shift+=200;await run(planner,clock,50,-50,.2);}
  }finally{performance.now=realNow;}
  assert.equal(backend.loads.get('S04_04/full'),RETRY_MS.length+1,'attempts are limited');
  assert.equal(backend.shown.get('S04_04')?.kind,'lod','the LOD covers it');
  assert.ok(backend.warnings.some(message=>message.includes('S04_04')&&message.includes('full')),'the sector and file are logged');
  assert.equal(planner.metrics().failures,1);
  backend.failing.clear();
  planner.retryFailed();
  await run(planner,clock,50,-50,1);
  assert.equal(backend.shown.get('S04_04')?.kind,'full','a controlled retry brings it back');
});

test('sectors ahead of a moving player are fetched before they are needed, without being shown',async()=>{
  const backend=new Fake(),planner=new CityPlanner(backend),clock={now:0};
  planner.setTuning(CITY_TUNING.medium);
  let x=50;
  await run(planner,clock,x,-50,15);
  for(let i=0;i<14;i++){x+=3;await run(planner,clock,x,-50,.2);}
  assert.equal(planner.metrics().sector,'S04_04','still in the first sector');
  assert.ok(backend.loaded.has('S06_04/full'),'the next column is already here');
  assert.equal(backend.shown.get('S06_04')?.kind,'lod','and waits out of sight');
});

test('higher settings detail a little more, and the 64 sectors are never all in full',async()=>{
  for(const [detail,most] of [['low',9],['medium',9],['high',16],['ultra',25]] as const){
    const backend=new Fake(),planner=new CityPlanner(backend),clock={now:0};
    planner.setTuning(CITY_TUNING[detail]);
    await run(planner,clock,99,-50,30);
    assert.ok(backend.full().length>=9&&backend.full().length<=most,`${detail}: ${backend.full().length}`);
  }
  assert.equal(sectorName(sectorAt(99,-50)),'S04_04');
});

test('low settings stop keeping LODs the fog hides',async()=>{
  const backend=new Fake(),planner=new CityPlanner(backend),clock={now:0};
  planner.setTuning(CITY_TUNING.low);
  await run(planner,clock,50,-50,30,455);
  assert.ok(![...backend.loaded].includes('S00_00/lod'),'the far corner is not loaded');
  assert.ok(backend.loaded.has('S01_04/lod'));
});
