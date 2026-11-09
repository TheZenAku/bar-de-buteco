import test from 'node:test';
import assert from 'node:assert/strict';
import * as pc from 'playcanvas';
import {assignAnimationClips} from '../../apps/web/src/engine/animation-tracks.ts';

/** Real PlayCanvas animation components and masked layers, with no renderer or network. */
function rig(){
  const app={systems:new pc.EventHandler(),_entityIndex:{}};
  app.systems.anim=new pc.AnimComponentSystem(app);
  const model=new pc.Entity('model',app),arm=new pc.Entity('arm',app),leg=new pc.Entity('leg',app);
  model.addChild(arm);model.addChild(leg);model.addComponent('anim',{activate:true});
  const track=(name,armAngle,legAngle)=>{
    const inputs=[new pc.AnimData(1,[0,2])],outputs=[],curves=[];
    for(const [bone,degrees] of [['arm',armAngle],['leg',legAngle]]){
      const q=new pc.Quat().setFromEulerAngles(0,0,degrees),index=outputs.length;
      outputs.push(new pc.AnimData(4,[q.x,q.y,q.z,q.w,q.x,q.y,q.z,q.w]));
      curves.push(new pc.AnimCurve([{entityPath:['model',bone],component:'graph',propertyPath:['localRotation']}],0,index,pc.INTERPOLATION_LINEAR));
    }
    return new pc.AnimTrack(name,2,inputs,outputs,curves);
  };
  const anim=model.anim,base=track('Idle',80,30),drink=track('Drink',-40,0),guard=track('Guard',140,0);
  assignAnimationClips(anim,[{name:'Idle',track:base},{name:'Sit',track:track('Sit',-60,80)}]);
  const mask={'model/arm':{children:true}};
  const hand=anim.addLayer('Hand',0,mask,pc.ANIM_LAYER_OVERWRITE);
  assignAnimationClips(anim,[{name:'Drink',track:drink,layer:'Hand'}]);
  const fists=anim.addLayer('Fists',0,mask,pc.ANIM_LAYER_OVERWRITE);
  assignAnimationClips(anim,[{name:'Guard',track:guard,layer:'Fists'}]);
  anim.rebind();anim.update(1/60);
  return {model,arm,leg,anim,hand,fists,base};
}
function samePose(actual,expected,context){
  for(const name of ['arm','leg']){
    const error=2*Math.acos(Math.min(1,Math.abs(actual[name].getLocalRotation().dot(expected[name].getLocalRotation()))))*180/Math.PI;
    assert.ok(error<.001,`${context}: ${name} jumped ${error.toFixed(3)} degrees away from its uninterrupted pose`);
  }
}

test('late animation banks do not make inactive drink/guard layers flash the bind pose',()=>{
  const actual=rig(),reference=rig();
  assignAnimationClips(actual.anim,Array.from({length:13},(_,i)=>({name:`Dance ${i}`,track:actual.base})));
  for(let frame=0;frame<120;frame++){
    // Exponential fades approach zero without reaching it, as in the live drink and guard layers.
    actual.hand.weight=reference.hand.weight=.00001;
    actual.fists.weight=reference.fists.weight=.00001;
    actual.anim.update(1/60);reference.anim.update(1/60);
    samePose(actual,reference,`frame ${frame}`);
  }
});

test('loading action clips preserves fading drink/guard layers through repeated seating transitions',()=>{
  const actual=rig(),reference=rig();
  for(let frame=0;frame<180;frame++){
    if(frame%30===0){
      assignAnimationClips(actual.anim,[{name:`Bar action ${frame}`,track:actual.base}]);
      const state=frame%60===0?'Sit':'Idle';
      actual.anim.baseLayer.transition(state,.2);reference.anim.baseLayer.transition(state,.2);
    }
    for(const r of [actual,reference]){
      r.hand.weight=Math.max(0,1-frame/90);r.fists.weight=frame<30?frame/30:Math.max(0,1-(frame-30)/45);
      r.anim.update(1/60);
    }
    assert.equal(actual.anim.baseLayer.activeState,reference.anim.baseLayer.activeState,'loading preserves the selected action');
    assert.equal(actual.anim.baseLayer.activeStateCurrentTime,reference.anim.baseLayer.activeStateCurrentTime,'loading does not restart the clip clock');
    assert.equal(actual.anim.baseLayer.transitionProgress,reference.anim.baseLayer.transitionProgress,'loading does not restart the cross-fade');
    samePose(actual,reference,`frame ${frame}`);
  }
});

test('adding a masked layer after playback leaves the other limbs and existing layers stable',()=>{
  const actual=rig(),reference=rig();
  const extra=actual.anim.addLayer('Late hand',0,{'model/arm':{children:true}},pc.ANIM_LAYER_OVERWRITE);
  assignAnimationClips(actual.anim,[{name:'Late pose',track:actual.base,layer:extra.name}]);
  const referenceExtra=reference.anim.addLayer('Late hand',0,{'model/arm':{children:true}},pc.ANIM_LAYER_OVERWRITE);
  reference.anim.assignAnimation('Late pose',reference.base,referenceExtra.name);reference.anim.rebind();
  for(let frame=0;frame<120;frame++){
    actual.fists.weight=reference.fists.weight=.6;
    extra.weight=referenceExtra.weight=.4;
    actual.anim.update(1/60);reference.anim.update(1/60);
    samePose(actual,reference,`frame ${frame}`);
  }
});
