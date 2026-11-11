/// <reference types="vite/client" />
import test from 'node:test';
import assert from 'node:assert/strict';
import {headLookAt,inputSchema,moveHorse,jumpMotion,type PlayerInput,type Position} from '@bar/shared';
import {BarNetwork} from '../../apps/web/src/networking';

test('horse prediction, stopping and camera movement keep sending valid commands after repeated turns',()=>{
  const self={id:'rider',x:0,y:0,z:6,rotation:0,interactionState:'horse',currentTableId:'',lastProcessedInput:0};
  const intention={dx:0,dz:0,running:false,rotation:0,headYaw:0,headPitch:0};
  const errors:PlayerInput[]=[],sent:PlayerInput[]=[];
  const network=Object.assign(Object.create(BarNetwork.prototype),{
    transportReady:true,stopped:false,user:{id:self.id},world:{players:{[self.id]:self}},
    pending:[] as PlayerInput[],wasMoving:false,seq:0,position:{x:self.x,y:self.y,z:self.z},motion:jumpMotion(),
    hooks:{
      input:()=>({...intention}),
      // BarScene keeps the predicted rotation for the next stop or camera-only input.
      position:(position:Position&{rotation?:number})=>{if(position.rotation!==undefined)intention.rotation=position.rotation;},
    },
    room:{send:(_type:string,input:PlayerInput)=>{
      sent.push(input);
      if(!inputSchema.safeParse(input).success){errors.push(input);return;}
      Object.assign(self,moveHorse(self,self.rotation,input),{lastProcessedInput:input.seq});
      network.pending=network.pending.filter((pending:PlayerInput)=>pending.seq>self.lastProcessedInput);
      network.position={x:self.x,y:self.y,z:self.z};
    }},
  });
  for(let i=0;i<48;i++){
    const angle=i*Math.PI/4;
    Object.assign(intention,{dx:Math.sin(angle),dz:Math.cos(angle),rotation:Math.atan2(Math.sin(angle),Math.cos(angle))});
    network.sendInput();
    intention.dx=0;intention.dz=0;
    network.sendInput();
  }
  for(let i=0;i<24;i++){
    Object.assign(intention,headLookAt(i*.2,.2,intention.rotation));
    network.sendInput();
  }
  assert.deepEqual(errors,[],'prediction must not produce a stream of Comando inválido errors');
  assert.equal(network.pending.length,0,'every input is acknowledged instead of filling the pending queue');
  const before={...self},count=sent.length;
  Object.assign(intention,{dx:1,dz:0,rotation:Math.PI/2});
  network.sendInput();
  assert.equal(sent.length,count+1,'movement still sends after stopping and looking around');
  assert.ok(self.x>before.x,'the rider can keep moving');
});
