/// <reference types="vite/client" />
import test from 'node:test';
import assert from 'node:assert/strict';
import * as pc from 'playcanvas';
import {floorHeight,headLookAt,HEAD_LOOK_YAW,HEAD_LOOK_PITCH,inputSchema,jumpMotion,type PlayerInput} from '@bar/shared';
import {HeadLookPose} from '../../apps/web/src/engine/head-look';
import {BarNetwork} from '../../apps/web/src/networking';

const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
const quat=(a:pc.Quat,b:pc.Quat)=>close(Math.abs(a.x*b.x+a.y*b.y+a.z*b.z+a.w*b.w),1);

test('head look uses the camera horizontally and vertically, wraps turns and respects neck limits',()=>{
  const look=headLookAt(.7,.3,.7+Math.PI);
  close(look.headYaw,0);close(look.headPitch,.3);
  const turned=headLookAt(.7+.4+8*Math.PI,-.2,.7+Math.PI);
  close(turned.headYaw,.4);close(turned.headPitch,-.2);
  const limited=headLookAt(Math.PI/2,1.3,Math.PI);
  close(limited.headYaw,HEAD_LOOK_YAW);close(limited.headPitch,HEAD_LOOK_PITCH);
});

test('head look shares the turn with the neck, preserves gaze and restores the animated pose without accumulation',()=>{
  for(const heading of [0,80,179,-120]){
    const root=new pc.Entity(),spine=new pc.Entity(),neck=new pc.Entity('neck'),head=new pc.Entity();
    root.addChild(spine);spine.addChild(neck);neck.addChild(head);
    root.setEulerAngles(0,heading,0);spine.setLocalEulerAngles(12,3,-4);neck.setLocalEulerAngles(-5,0,2);head.setLocalEulerAngles(0,0,90);
    const originals=[root,spine,neck,head].map(node=>node.getLocalRotation().clone());
    head.setLocalPosition(0,.12,0);
    const neckPosition=neck.getPosition().clone(),look=new HeadLookPose();
    for(let i=0;i<600;i++){
      look.restore();
      quat(head.getLocalRotation(),originals[3]!);
      quat(neck.getLocalRotation(),originals[2]!);
      look.apply(head,heading*pc.math.DEG_TO_RAD,{headYaw:.6,headPitch:-.3},1/60);
      for(const [index,node] of [root,spine].entries())quat(node.getLocalRotation(),originals[index]!);
      close(neck.getPosition().distance(neckPosition),0);
      close(head.getPosition().distance(neckPosition),.12);
    }
    close(look.yaw,.6);close(look.pitch,-.3);
    const neckBase=new pc.Quat().mul2(spine.getRotation(),originals[2]!);
    const worldBase=new pc.Quat().mul2(neckBase,originals[3]!);
    const yaw=new pc.Quat().setFromAxisAngle(pc.Vec3.UP,.6*pc.math.RAD_TO_DEG);
    const angle=heading*pc.math.DEG_TO_RAD+.6;
    const tilt=new pc.Quat().setFromAxisAngle(new pc.Vec3(Math.cos(angle),0,-Math.sin(angle)),-.3*pc.math.RAD_TO_DEG);
    quat(head.getRotation(),new pc.Quat().mul2(tilt,new pc.Quat().mul2(yaw,worldBase)));
    const offset=new pc.Quat().mul2(tilt,yaw);
    quat(neck.getRotation(),new pc.Quat().mul2(new pc.Quat().slerp(pc.Quat.IDENTITY,offset,.4),neckBase));
    look.restore();quat(head.getLocalRotation(),originals[3]!);quat(neck.getLocalRotation(),originals[2]!);
    root.destroy();
  }
});

test('each new animation pose is preserved beneath head look at different frame rates',()=>{
  for(const fps of [24,60]){
    const head=new pc.Entity(),look=new HeadLookPose();
    for(let frame=0;frame<fps*3;frame++){
      look.restore();
      const animation=new pc.Quat().setFromEulerAngles(Math.sin(frame)*5,0,90);
      head.setLocalRotation(animation);
      look.apply(head,0,{headYaw:.5,headPitch:.2},1/fps);
      look.restore();quat(head.getLocalRotation(),animation);
    }
    close(look.yaw,.5);close(look.pitch,.2);head.destroy();
  }
});

test('the room accepts head offsets separately from the body and rejects invalid angles',()=>{
  const input={seq:1,dx:0,dz:0,running:false,rotation:1.2};
  assert.equal(inputSchema.safeParse(input).success,true,'Existing clients still work');
  assert.equal(inputSchema.safeParse({...input,headYaw:HEAD_LOOK_YAW,headPitch:-HEAD_LOOK_PITCH}).success,true);
  for(const value of [NaN,Infinity,10]){
    assert.equal(inputSchema.safeParse({...input,headYaw:value}).success,false);
    assert.equal(inputSchema.safeParse({...input,headPitch:value}).success,false);
  }
});

function fixture(){
  const self={id:'local',x:-396,y:floorHeight(-396,-396)!,z:-396,rotation:1.2,headYaw:0,headPitch:0,interactionState:'',currentTableId:''};
  const intention={dx:0,dz:0,running:false,rotation:1.2,headYaw:0,headPitch:0};
  const sent:PlayerInput[]=[];
  const network=Object.assign(Object.create(BarNetwork.prototype),{
    transportReady:true,stopped:false,user:{id:self.id},world:{players:{[self.id]:self}},
    pending:[] as PlayerInput[],wasMoving:false,sentRear:false,seq:0,position:{x:self.x,y:self.y,z:self.z},motion:jumpMotion(),clock:{now:()=>Date.now()},
    hooks:{input:()=>({...intention}),position:()=>{}},room:{send:(_type:string,input:PlayerInput)=>sent.push(input)},
  });
  return {self,intention,sent,network,tick:()=>network.sendInput()};
}

test('head-only turns reach the room without moving or rotating the body, with no repeated packets',()=>{
  const {self,intention,sent,network,tick}=fixture();
  tick();assert.equal(sent.length,0);
  intention.headYaw=.6;tick();
  assert.deepEqual(sent[0],{...intention,seq:1});
  assert.equal(sent[0]!.rotation,self.rotation);
  assert.deepEqual(network.position,{x:self.x,y:self.y,z:self.z});
  for(let i=0;i<20;i++)tick();
  assert.equal(sent.length,1);
  self.headYaw=.6;network.pending=[];tick();assert.equal(sent.length,1);
  intention.headPitch=-.4;tick();assert.equal(sent.length,2,'Vertical look is sent too');
});

test('camera turns cannot rotate a seated player or interrupt an interaction',()=>{
  for(const lock of ['seat-1','kick','moto-repair','stage']){
    const {self,intention,sent,tick}=fixture();
    self.interactionState=lock;intention.rotation=-2;tick();
    assert.equal(sent.length,0,`${lock} retains the server heading`);
    intention.headPitch=.3;tick();
    assert.equal(sent[0]!.rotation,self.rotation);
    assert.equal(sent[0]!.dx,0);assert.equal(sent[0]!.dz,0);
  }
  const {self,intention,sent,tick}=fixture();
  self.currentTableId='blackjack-1';intention.rotation=-2;tick();
  assert.equal(sent.length,0,'The table also keeps the heading locked');
});

test('looking while seated keeps position and body rotation locked; walking and stopping still work',()=>{
  const {self,intention,sent,tick}=fixture();
  self.interactionState='seat-1';intention.headYaw=.5;intention.dx=1;intention.rotation=2;
  tick();assert.deepEqual(sent[0],{...intention,seq:1,dx:0,rotation:self.rotation});
  self.interactionState='';tick();tick();intention.dx=0;tick();tick();
  assert.equal(sent.length,4,'Seated look, two walking ticks, one stop');
  assert.equal(sent[1]!.dx,1);assert.equal(sent[1]!.rotation,2);assert.equal(sent[3]!.dx,0);
});
