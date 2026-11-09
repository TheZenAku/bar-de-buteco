import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PAD,PadReader,DEFAULT_LOOK_FEEL,radial,stickLook,type PadButton} from '../../apps/web/src/gamepad/gamepad';
import {PadMapper,type PadHost} from '../../apps/web/src/gamepad/pad-mapper';

/** A standard pad with these buttons down (trigger values for LT/RT) and these axes. */
function pad(down:Partial<Record<number,number>>={},axes:number[]=[0,0,0,0]){
  const buttons=Array.from({length:17},(_,i)=>({pressed:(down[i]??0)>.5,value:down[i]??0}));
  return [{id:'Xbox',connected:true,mapping:'standard',buttons,axes}];
}

test('the dead zone is radial and rescaled: nothing inside, the full push at the rim, the direction kept',()=>{
  assert.deepEqual(radial(.08,.08),{x:0,y:0,m:0});
  const rim=radial(.7,.7);
  assert.ok(Math.abs(rim.m-1)<1e-9);
  const just=radial(.13,0);
  assert.ok(just.m>0&&just.m<.02,'Past the dead zone it starts from zero');
  const diagonal=radial(.3,.3);
  assert.ok(Math.abs(diagonal.x-diagonal.y)<1e-12,'No snapping to the axes');
});

test('looking: a curve for fine aim, the rim ramps up outside aiming, inverted Y flips only up and down',()=>{
  const half=stickLook(radial(.55,0),1/60,DEFAULT_LOOK_FEEL,1,0,false),full=stickLook(radial(1,0),1/60,DEFAULT_LOOK_FEEL,1,0,true);
  assert.ok(half.yaw<0,'Right turns right (the rig\'s yaw goes down)');
  assert.ok(Math.abs(half.yaw)<Math.abs(full.yaw)*.5,'Half a push is less than half the speed');
  let ramp=0,last=0;
  for(let i=0;i<30;i++){const step=stickLook(radial(1,0),1/60,DEFAULT_LOOK_FEEL,1,ramp,false);ramp=step.ramp;last=step.yaw;}
  assert.equal(ramp,1);
  assert.ok(Math.abs(last/full.yaw-1.6)<1e-9,'Up to 1.6 times after 0.4 s at the rim');
  assert.equal(stickLook(radial(1,0),1/60,DEFAULT_LOOK_FEEL,1,0,true).ramp,0,'Never while aiming');
  const up=stickLook(radial(0,-1),1/60,DEFAULT_LOOK_FEEL,1,0,false),inverted=stickLook(radial(0,-1),1/60,{...DEFAULT_LOOK_FEEL,invertY:true},1,0,false);
  assert.ok(up.pitch<0&&inverted.pitch>0);
  assert.ok(Math.abs(full.yaw/(1/60)+DEFAULT_LOOK_FEEL.yawSpeed)<1e-9,'3.2 rad/s at full push');
});

test('buttons have edges and hold times; triggers have hysteresis',()=>{
  const reader=new PadReader();
  let frame=reader.read(pad({[PAD.A]:1}),0)!;
  assert.equal(frame.pressed(PAD.A),true);
  frame=reader.read(pad({[PAD.A]:1}),100)!;
  assert.equal(frame.pressed(PAD.A),false);assert.equal(frame.heldFor(PAD.A),100);
  frame=reader.read(pad({}),150)!;
  assert.equal(frame.released(PAD.A),true);assert.equal(frame.heldWas(PAD.A),150);
  frame=reader.read(pad({[PAD.RT]:.4}),200)!;assert.equal(frame.down(PAD.RT),true);
  frame=reader.read(pad({[PAD.RT]:.3}),216)!;assert.equal(frame.down(PAD.RT),true,'Still held above the release point');
  frame=reader.read(pad({[PAD.RT]:.2}),232)!;assert.equal(frame.down(PAD.RT),false);
  assert.equal(reader.read([],300),undefined,'No pad');
});

function host(state:{menu?:boolean;drawn?:boolean;scoped?:boolean;guard?:boolean;system?:boolean}={}){
  const log:string[]=[];
  const h:PadHost={menu:()=>!!state.menu,press:code=>log.push(code),hold:(code,down)=>log.push(`${code}:${down}`),move:(x,y)=>log.push(`move:${x.toFixed(1)},${y.toFixed(1)}`),
    sprint:on=>log.push(`sprint:${on}`),system:()=>state.system??true,drawn:()=>!!state.drawn,scoped:()=>!!state.scoped,guard:()=>!!state.guard,
    aim:down=>log.push(`aim:${down}`),trigger:down=>log.push(`fire:${down}`),breath:down=>log.push(`breath:${down}`),holster:()=>log.push('holster'),mode:()=>log.push('mode'),
    step:d=>log.push(`step:${d}`),zoom:d=>log.push(`zoom:${d}`),arsenal:()=>log.push('arsenal'),shoulder:()=>log.push('shoulder'),wheel:open=>log.push(`wheel:${open}`)};
  return {h,log,state};
}
const feed=(mapper:PadMapper,reader:PadReader,frames:[number,Partial<Record<number,number>>,number[]?][])=>{for(const [at,down,axes] of frames)mapper.frame(reader.read(pad(down,axes),at),at);};

test('armed: LT aims, RT fires, X reloads through R, Y the mode, B holsters, RB next, an LB tap previous',()=>{
  const {h,log}=host({drawn:true}),mapper=new PadMapper(h),reader=new PadReader();
  feed(mapper,reader,[[0,{[PAD.LT]:1}],[16,{[PAD.LT]:1,[PAD.RT]:1}],[32,{}],[48,{[PAD.X]:1}],[64,{[PAD.Y]:1}],[80,{[PAD.B]:1}],[96,{[PAD.RB]:1}],[112,{[PAD.LB]:1}],[200,{}]]);
  assert.deepEqual(log,['aim:true','fire:true','aim:false','fire:false','KeyR','mode','holster','step:1','step:-1']);
});

test('LB held opens the wheel and letting go chooses; L3 runs until the stick rests, through a scope it holds the breath',()=>{
  const {h,log,state}=host({drawn:true}),mapper=new PadMapper(h),reader=new PadReader();
  feed(mapper,reader,[[0,{[PAD.LB]:1}],[300,{[PAD.LB]:1}],[400,{}]]);
  assert.deepEqual(log,['wheel:true','wheel:false']);
  log.length=0;
  feed(mapper,reader,[[500,{[PAD.L3]:1},[0,-1,0,0]],[516,{},[0,-1,0,0]],[532,{},[0,0,0,0]]]);
  assert.deepEqual(log,['move:0.0,-1.0','sprint:true','move:0.0,-1.0','move:0.0,0.0','sprint:false']);
  log.length=0;state.scoped=true;
  feed(mapper,reader,[[600,{[PAD.L3]:1}],[700,{}],[716,{[PAD.UP]:1}]]);
  assert.deepEqual(log,['breath:true','breath:false','zoom:1']);
});

test('with the fist guard up and no weapon the triggers punch; in a menu the pad is arrows, Enter, Escape, Q and E',()=>{
  const {h,log,state}=host({guard:true}),mapper=new PadMapper(h),reader=new PadReader();
  feed(mapper,reader,[[0,{[PAD.RT]:1}],[16,{[PAD.LT]:1}],[32,{[PAD.RB]:1}],[48,{}]]);
  assert.deepEqual(log,['FightLight','FightHeavy','FightBlock:true','FightBlock:false']);
  log.length=0;state.menu=true;
  feed(mapper,reader,[[100,{[PAD.DOWN]:1}],[200,{[PAD.DOWN]:1}],[500,{[PAD.DOWN]:1}],[520,{}],[540,{[PAD.A]:1}],[560,{[PAD.B]:1}],[580,{[PAD.RB]:1}],[600,{},[0,-.9,0,0]]]);
  assert.deepEqual(log,['ArrowDown','ArrowDown','Enter','Escape','KeyE','ArrowUp'],'Once, then repeating after a pause');
});
