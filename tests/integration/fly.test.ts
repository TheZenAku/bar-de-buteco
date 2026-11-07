import assert from 'node:assert/strict';
import test from 'node:test';
import {FLY,flyPlayer,fallPlayer,inputSchema,TICK_MS} from '@bar/shared';

const dt=TICK_MS/1000,base={seq:1,dx:0,dz:0,running:false,rotation:0};
test('flight moves in the air, boosts, climbs and stays between the ground and the ceiling',()=>{
  const start={x:0,y:5,z:0};
  const walk=flyPlayer(start,{dx:1,dz:0,running:false},dt),dash=flyPlayer(start,{dx:1,dz:0,running:true},dt);
  assert.ok(Math.abs(walk.x-FLY.speed*dt)<1e-9&&Math.abs(dash.x-FLY.boost*dt)<1e-9);
  assert.ok(Math.abs(flyPlayer(start,{dx:1,dz:1,running:false},dt).x**2*2-(FLY.speed*dt)**2)<1e-9,'diagonals are no faster');
  assert.ok(flyPlayer(start,{dx:0,dz:0,running:false,dy:1},dt).y>5);
  assert.equal(flyPlayer({x:0,y:FLY.ceiling,z:0},{dx:0,dz:0,running:true,dy:1},dt).y,FLY.ceiling);
  assert.ok(flyPlayer({x:0,y:.01,z:0},{dx:0,dz:0,running:true,dy:-1},dt).y>=0,'never under the ground');
});
test('with an aim, the flight goes where the camera looks, at the same speed',()=>{
  const start={x:0,y:20,z:0},up=flyPlayer(start,{dx:0,dz:-1,aim:1,running:false},dt);
  assert.ok(Math.abs(up.x)<1e-9&&Math.abs(up.y-20-FLY.speed*dt/Math.SQRT2)<1e-9&&Math.abs(up.z+FLY.speed*dt/Math.SQRT2)<1e-9,'a 45° dive is no faster than level');
  const level=flyPlayer(start,{dx:0,dz:-1,aim:0,running:false},dt);
  assert.ok(Math.abs(level.z+FLY.speed*dt)<1e-9&&level.y===20,'aim 0 is level flight');
  assert.equal(inputSchema.safeParse({...base,aim:-1}).success,true);
  assert.equal(inputSchema.safeParse({...base,aim:2}).success,false);
});
test('the climb axis travels with the input and cannot be abused',()=>{
  assert.equal(inputSchema.safeParse({...base,dy:1}).success,true);
  assert.equal(inputSchema.safeParse({...base,dy:2}).success,false);
  assert.equal(inputSchema.safeParse(base).success,true,'older clients still work');
});
test('letting go falls gently at first, faster later, and stops on the surface below',()=>{
  const start={x:0,y:10,z:0};
  const slow=fallPlayer(start,dt,0),fast=fallPlayer(start,dt,1);
  assert.ok(slow.y<10&&fast.y<slow.y,'it gathers speed');
  assert.ok(10-fast.y<=FLY.fall*dt+1e-9,'and never passes the terminal speed');
  let p:{x:number;y:number;z:number;landed?:boolean}=start,ticks=0;
  while(!fallPlayer(p,dt,ticks*dt).landed&&ticks<1000){p=fallPlayer(p,dt,ticks*dt);ticks++;}
  assert.ok(ticks>10&&ticks<200,'a fall from 10 m takes a visible time');
});
