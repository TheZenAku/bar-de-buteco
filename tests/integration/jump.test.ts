import test from 'node:test';
import assert from 'node:assert/strict';
import {jumpMotion,jumpAnimation,canJump,movePlayer,WALK_SPEED,RUN_SPEED,inputSchema,PLAYER_HEIGHT,STAGE,STAGE_ENTRY,onStage,type Position,type Collider} from '@bar/shared';
import {BarNetwork} from '../../apps/web/src/networking';

const idle={dx:0,dz:0,running:false},dt=.05;
function character(start:Required<Position>={x:0,y:0,z:7},obstacles:Collider[]=[]){
  const motion=jumpMotion();let position=start;
  return {motion,get position(){return position;},step(input:{dx?:number;dz?:number;running?:boolean;jump?:boolean}={},seconds=dt,allow=true){
    position=movePlayer(position,{...idle,...input},seconds,false,false,obstacles,undefined,motion,allow);
    return position;
  }};
}

test('standing jump applies an impulse and gravity, lands naturally, and does not repeat while Space is held',()=>{
  const c=character();let highest=0,airTicks=0,sawFall=false;
  c.step({jump:true});assert.equal(c.motion.grounded,false);assert.ok(c.motion.verticalVelocity>0);
  while(!c.motion.grounded&&airTicks<100){
    highest=Math.max(highest,c.position.y);sawFall ||= jumpAnimation(c.motion)==='fall';
    c.step({jump:true});airTicks++;
  }
  assert.ok(highest>.9&&highest<1.05,`natural height: ${highest}`);
  assert.ok(airTicks*dt>.8&&airTicks*dt<1,`natural flight time: ${airTicks*dt}`);
  assert.equal(sawFall,true);assert.equal(c.position.y,0);assert.equal(jumpAnimation(c.motion),'land');
  for(let i=0;i<30;i++)c.step({jump:true});
  assert.equal(c.position.y,0,'held Space cannot bunny-hop');assert.equal(jumpAnimation(c.motion),undefined);
  c.step({jump:false});c.step({jump:true});assert.ok(c.position.y>0,'a fresh grounded press jumps again');
});

test('a fresh press in the air cannot double jump, buffer a jump on landing, or jump while falling off a ledge',()=>{
  const c=character();c.step({jump:true});c.step({jump:false});const before=c.motion.verticalVelocity;
  c.step({jump:true});assert.ok(c.motion.verticalVelocity<before);
  for(let i=0;i<30;i++)c.step({jump:true});assert.equal(c.position.y,0);
  const falling=character({x:0,y:2,z:7});falling.step({jump:true});
  assert.equal(falling.motion.grounded,false);assert.ok(falling.motion.verticalVelocity<0);assert.ok(falling.position.y<2);
});

test('walking and running keep their existing pace in the air, and replay gives identical positions and motion',()=>{
  for(const running of [false,true]){
    const predicted=character(),server=character(),input={dx:1,dz:1,running,jump:true};
    for(let i=0;i<12;i++){
      predicted.step(input);server.step(input);
      assert.deepEqual(predicted.position,server.position);assert.deepEqual(predicted.motion,server.motion);
    }
    assert.ok(Math.abs(Math.hypot(predicted.position.x,predicted.position.z-7)-(running?RUN_SPEED:WALK_SPEED)*12*dt)<1e-6);
  }
});

test('local prediction selects walk and run immediately without replacing authored actions',()=>{
  const network:any=Object.assign(Object.create(BarNetwork.prototype),{position:{x:1,y:0,z:2},motion:jumpMotion()});
  const pose=(animationState:string,input?:{dx:number;dz:number;running:boolean})=>network.predictedPose({animationState,interactionState:'',currentTableId:''},input);
  assert.equal(pose('idle',{dx:0,dz:1,running:false}).animation,'walk');
  assert.equal(pose('walk',{dx:0,dz:1,running:true}).animation,'run');
  assert.equal(pose('run',{dx:0,dz:0,running:true}).animation,'idle');
  assert.equal(pose('kick',{dx:0,dz:1,running:true}).animation,undefined);
});

test('a ceiling stops upward speed without clipping or preventing the subsequent landing',()=>{
  const ceiling:Collider={id:'test-ceiling',x:0,z:7,hx:2,hz:2,minY:PLAYER_HEIGHT+.35,maxY:PLAYER_HEIGHT+.55};
  const c=character(undefined,[ceiling]);let top=0;
  for(let i=0;i<30;i++){c.step({jump:i===0});top=Math.max(top,c.position.y+PLAYER_HEIGHT);}
  assert.ok(top<=ceiling.minY!+1e-8);assert.equal(c.motion.grounded,true);assert.equal(c.position.y,0);
});

test('stairs and ramps keep their support and jumps land on the correct stacked floor',()=>{
  const c=character({x:14,y:.3,z:-10.9});
  for(const [x,z,y] of [[14,-14.3,1.88],[15.85,-14.3,1.88],[15.85,-11.2,3.45]] as const){
    for(let i=0;i<200&&Math.hypot(x-c.position.x,z-c.position.z)>.08;i++){
      const d=Math.hypot(x-c.position.x,z-c.position.z);
      c.step({dx:(x-c.position.x)/d,dz:(z-c.position.z)/d},Math.min(dt,d/3.5));
    }
    assert.ok(Math.abs(c.position.y-y)<.04,`floor ${y}: ${JSON.stringify(c.position)}`);
    assert.equal(c.motion.grounded,true);
  }
  const upper=character({x:16,y:3.45,z:-7});upper.step({jump:true});
  for(let i=0;i<30;i++)upper.step();
  assert.ok(Math.abs(upper.position.y-3.45)<.01,'cannot fall through to the ground floor');
});

test('walking off an actual ledge starts falling and does not permit an airborne jump',()=>{
  const c=character({x:24,y:STAGE.deck.maxY,z:STAGE.deck.z+STAGE.deck.hz-.1});
  for(let i=0;i<12&&c.motion.grounded;i++)c.step({dz:1});
  assert.equal(c.motion.grounded,false);assert.ok(c.motion.verticalVelocity<0);
  const fallingSpeed=c.motion.verticalVelocity;c.step({jump:true});
  assert.ok(c.motion.verticalVelocity<fallingSpeed,'leaving a platform does not grant an extra jump');
  for(let i=0;i<30;i++)c.step();
  assert.equal(c.motion.grounded,true);assert.ok(Math.abs(c.position.y-.3)<.01);
});

test('jumping cannot bypass the stage pass gate',()=>{
  const c=character({...STAGE_ENTRY,y:.3});
  for(let i=0;i<40;i++)c.step({dx:1,jump:i%20===0});
  assert.equal(onStage(c.position),false);
});

test('incompatible actions are blocked and jump input cannot carry arbitrary velocity or grounded state',()=>{
  for(const animationState of ['sit','ride','horse-idle','fly','kick','recover','fallen','dance','wave','use','stage','ragdoll'])assert.equal(canJump({animationState}),false,animationState);
  for(const interactionState of ['seat-1','moto:test','horse','job','stage-guitar'])assert.equal(canJump({animationState:'idle',interactionState}),false);
  assert.equal(canJump({animationState:'idle',fist:{fight:true}}),false);
  assert.equal(canJump({animationState:'idle',gun:{reloadUntil:200}},100),false);
  assert.equal(canJump({animationState:'run'}),true);
  const c=character();c.step({jump:true},dt,false);assert.equal(c.position.y,0);
  const input={seq:1,...idle,rotation:0,jump:true};
  assert.equal(inputSchema.safeParse(input).success,true);
  for(const extra of [{verticalVelocity:100},{grounded:true},{jump:1}])assert.equal(inputSchema.safeParse({...input,...extra}).success,false);
});
