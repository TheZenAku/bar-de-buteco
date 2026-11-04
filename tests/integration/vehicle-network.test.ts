/// <reference types="vite/client" />
import test from 'node:test';
import assert from 'node:assert/strict';
import {CAR_MODEL,headLookAt,inputSchema,motoDismountSpot,motoObstacle,movePlayer,parkedMoto,type PlayerInput} from '@bar/shared';
import {BarNetwork} from '../../apps/web/src/networking';

test('after leaving a car or motorcycle with accumulated turns, camera and stop inputs stay valid and walking resumes',()=>{
  for(const model of [CAR_MODEL,'moto-delivery'])for(const yaw of [Math.PI*12+.4,-Math.PI*12-.4]){
    const vehicle={...parkedMoto({id:'vehicle',x:13.6,y:0,z:3.85,yaw}),model};
    const self={id:'driver',...motoDismountSpot(vehicle),rotation:yaw,headYaw:0,headPitch:0,interactionState:'',currentTableId:'',lastProcessedInput:0};
    const intention={dx:0,dz:0,running:false,rotation:yaw,headYaw:0,headPitch:0};
    const sent:PlayerInput[]=[],errors:PlayerInput[]=[];
    const network=Object.assign(Object.create(BarNetwork.prototype),{
      transportReady:true,stopped:false,user:{id:self.id},world:{players:{[self.id]:self},motos:{[vehicle.id]:vehicle}},
      pending:[] as PlayerInput[],wasMoving:false,seq:0,position:{x:self.x,y:self.y,z:self.z},
      hooks:{input:()=>({...intention}),position:()=>{}},
      room:{send:(_type:string,input:PlayerInput)=>{
        sent.push(input);
        if(!inputSchema.safeParse(input).success){errors.push(input);return;}
        Object.assign(self,movePlayer(self,input,.05,false,false,[motoObstacle(vehicle)]),{
          rotation:input.rotation,headYaw:input.headYaw,headPitch:input.headPitch,lastProcessedInput:input.seq,
        });
        network.pending=network.pending.filter((pending:PlayerInput)=>pending.seq>self.lastProcessedInput);
        network.position={x:self.x,y:self.y,z:self.z};
      }},
    });
    for(let i=0;i<40;i++){
      Object.assign(intention,headLookAt(yaw+Math.PI+Math.sin(i*.2),.2,yaw));
      network.sendInput();
    }
    assert.deepEqual(errors,[],`${model}: camera movement after exiting must not spam invalid commands`);
    assert.equal(network.pending.length,0,'valid inputs are acknowledged rather than permanently filling the queue');
    const count=sent.length;
    for(let i=0;i<3;i++){
      Object.assign(intention,{dx:1,dz:0,rotation:Math.PI/2});network.sendInput();
      intention.dx=0;intention.rotation=yaw;network.sendInput();
    }
    assert.equal(sent.length,count+6,'walking and stopping continue after looking around');
    assert.deepEqual(errors,[],'stopping must also normalize the heading');
    assert.equal(network.pending.length,0);
  }
});
