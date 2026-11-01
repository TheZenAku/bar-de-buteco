import test from 'node:test';
import assert from 'node:assert/strict';
import {PATCH_MS,TICK_MS,stepMoto,type MotoBody,type MotoState} from '@bar/shared';
import {PLAYBACK_DELAY_MS,PredictedRide,RoomTrack,SNAP_DISTANCE} from '../../apps/web/src/engine/moto-motion';

const TICK=TICK_MS/1000,SPEED=15.3;
const flying=(x:number,yaw=Math.PI/2):MotoBody=>({x,y:0,z:0,yaw,pitch:0,speed:SPEED,steer:0});
/** A straight line at top speed, with nothing to collide with. */
const onward=(body:MotoBody):MotoBody=>({...body,x:body.x+Math.sin(body.yaw)*body.speed*TICK,z:body.z+Math.cos(body.yaw)*body.speed*TICK});
/** Frames of uneven length, as on a busy page. */
const sampled=(body:MotoBody,ticks:number):MotoState=>({...body,id:'moto-1',riderId:'',phase:'',lifterId:'',lights:0,qx:0,qy:0,qz:0,qw:1,ticks,engine:0,engineAt:0,crank:0,gas:false,parts:''});
const frames=(count:number)=>Array.from({length:count},(_,i)=>[.016,.033,.021,.05,.012,.041,.028][i%7]!);

test('the rider\'s bike is drawn exactly as far as the time that passed, whatever the frames\' length',()=>{
  const ride=new PredictedRide(flying(0));
  let elapsed=0,before=ride.pose().x;
  for(const dt of frames(300)){
    ride.advance(dt,onward);elapsed+=dt;
    const now=ride.pose().x,speed=(now-before)/dt;before=now;
    // One tick behind the newest simulated state, and never faster or slower than the bike.
    if(elapsed>.1)assert.ok(Math.abs(speed-SPEED)<1e-6,`Drawn at ${speed} m/s`);
  }
  assert.ok(Math.abs(before-SPEED*(elapsed-TICK))<SPEED*TICK);
});

test('a frame longer than a tick runs the ticks it owes, and a freeze does not run them all',()=>{
  let ticks=0;const ride=new PredictedRide(flying(0));
  ride.advance(.21,body=>{ticks++;return onward(body);});
  assert.equal(ticks,4);
  ticks=0;ride.advance(30,body=>{ticks++;return onward(body);});
  assert.equal(ticks,5);
});

test('the room agreeing with the prediction changes nothing on screen',()=>{
  const ride=new PredictedRide(flying(0));
  let simulated=flying(0),before=ride.pose().x;
  for(const [i,dt] of frames(200).entries()){
    ride.advance(dt,body=>simulated=onward(body));
    // The patches bring the state back through a float32.
    if(i%6===0)ride.correct({...simulated,x:Math.fround(simulated.x),z:Math.fround(simulated.z),yaw:Math.fround(simulated.yaw)});
    const now=ride.pose().x;
    if(i>3)assert.ok(Math.abs((now-before)/dt-SPEED)<.3,`Frame ${i}: ${(now-before)/dt} m/s`);
    before=now;
  }
});

test('a correction from the room takes effect at once in the simulation and fades on screen with no jump',()=>{
  const ride=new PredictedRide(flying(0));
  ride.advance(.2,onward);
  const before=ride.pose().x,wrong=.75;
  // The room lost a step: the bike is really .75 m back.
  let current!:MotoBody;ride.advance(0,body=>current=body);
  ride.advance(.05,body=>current=onward(body));
  const drawn=ride.pose().x;
  ride.correct({...current,x:current.x-wrong});
  assert.ok(Math.abs(ride.pose().x-drawn)<1e-9,'Nothing moves in the frame of the correction');
  assert.ok(drawn>before);
  // And it goes away: after half a second the drawing is back on the simulation.
  let ahead=0;for(let i=0;i<30;i++){let simulated!:MotoBody;ride.advance(.016,body=>simulated=onward(body));if(simulated)ahead=simulated.x;}
  assert.ok(Math.abs(ride.pose().x-(ahead-SPEED*TICK))<wrong*.1+SPEED*TICK,`Pose ${ride.pose().x}, simulated ${ahead}`);
});

test('a bike that stood still a long time starts again from where it is, and one stopped without a step says so',()=>{
  const track=new RoomTrack(),still={...flying(0),speed:0};
  track.push(sampled(still,100),0);
  // A minute parked: its clock stopped, this browser's did not.
  let now=60_000,x=0;
  for(let ticks=102;ticks<160;ticks+=2,now+=100){x+=SPEED*.1;track.push(sampled({...flying(0),x},ticks),now);}
  const seen=track.sample(now)!;
  assert.ok(Math.abs(seen.x-(x-SPEED*(PLAYBACK_DELAY_MS+100)/1000))<SPEED*.25,`Drawn at ${seen.x}, the room at ${x}`);
  // Got off: the room set the speed to zero without a step, and it must not go on by the old speed.
  track.push(sampled({...flying(0),x,speed:0},158),now);
  for(let later=now;later<now+1000;later+=50)assert.ok(track.sample(later)!.x<=x+1e-9);
});

test('a bike moved far away jumps, it does not fly',()=>{
  const ride=new PredictedRide(flying(0));
  ride.advance(.05,onward);
  ride.correct(flying(SNAP_DISTANCE+50));
  assert.equal(ride.pose().x,SNAP_DISTANCE+50);
});

test('the real step through the prediction turns smoothly too',()=>{
  const start:MotoBody={x:0,y:0,z:7,yaw:Math.PI/2,pitch:0,speed:12,steer:.5};
  const ride=new PredictedRide(start),step=(body:MotoBody)=>stepMoto(body,{throttle:1,steer:.5,brake:false},TICK);
  let before=ride.pose(),largest=0;
  for(const dt of frames(120)){ride.advance(dt,step);const pose=ride.pose();largest=Math.max(largest,Math.abs(pose.yaw-before.yaw)/dt);before=pose;}
  assert.ok(largest<2,`Turned at ${largest} rad/s`);
});

test('somebody else\'s bike plays back evenly from patches that arrive unevenly',()=>{
  const track=new RoomTrack(),lateness=[0,35,5,60,10,0,80,20],steps=[2,1,3,2,0,4,2,2];
  let sent=0,ticks=1000,now=0,before:number|undefined;
  const speeds:number[]=[];
  for(const dt of frames(300)){
    now+=dt*1000;
    // Each patch reaches this browser a variable time after the room sent it, carrying a variable number of the bike's steps.
    while(sent*PATCH_MS+lateness[sent%lateness.length]!<=now){
      ticks+=steps[sent%steps.length]!;
      track.push(sampled({...flying(0),x:SPEED*ticks*TICK},ticks),sent*PATCH_MS+lateness[sent%lateness.length]!);
      sent++;
    }
    const seen=track.sample(now)?.x;
    if(seen===undefined)continue;
    if(before!==undefined&&now>PLAYBACK_DELAY_MS+200)speeds.push((seen-before)/dt);
    before=seen;
  }
  assert.ok(speeds.length>200);
  // Within millimetres a frame: the clock of arrivals adjusting itself, a tiny fraction of a tick.
  assert.ok(Math.min(...speeds)>SPEED*.9&&Math.max(...speeds)<SPEED*1.1,`Between ${Math.min(...speeds)} and ${Math.max(...speeds)} m/s`);
});

test('with no more patches it goes on by its own speed for a moment, then waits; a parked bike stays put',()=>{
  const track=new RoomTrack();
  track.push(sampled(flying(0),20),0);track.push(sampled(flying(1.53),22),100);
  const end=track.sample(100+PLAYBACK_DELAY_MS+5000)!;
  assert.ok(end.x>1.53&&end.x<1.53+SPEED*.25,`Stopped at ${end.x}`);
  const parked=new RoomTrack(),still={...flying(4),speed:0};
  parked.push(sampled(still,0),0);
  for(const now of [0,50,500,5000])assert.equal(parked.sample(now)!.x,4);
  // Moved by the room far away, it does not cross the map.
  const moved=new RoomTrack();
  moved.push(sampled(still,0),0);moved.push(sampled({...still,x:80},2),100);moved.push(sampled({...still,x:80},4),200);
  const seen=moved.sample(50+PLAYBACK_DELAY_MS)!;
  assert.ok(seen.x===4||seen.x===80,`Seen at ${seen.x}`);
});
