// The plant's dynamic leaves (apps/web/src/factory/factory-gates.ts) in the real scene, with the leaves' collision boxes drawn over them in red:
//   fixture.doors({EB_Portao:{open:true,changedAt:fixture.now()}})  sets door states (the room's `doors`); the leaves and the boxes follow them on the clock `fixture.now()`.
//   fixture.ringing(true) blinks the intercom lamp; fixture.view(eye,target) moves the camera; fixture.tanks() shows the tank model with the lids (FactoryVisuals).
//   fixture.ready is true once the scene is there; fixture.boxes(false) hides the red boxes.
import * as pc from 'playcanvas';
import {BarScene} from '../../apps/web/src/engine/BarScene.ts';
import {FactoryVisuals} from '../../apps/web/src/factory/visuals.ts';
import {solidColliders,syncFactoryGates} from '@bar/shared';
import {FACTORY_GATES} from '@bar/shared/factory';
let eye=[372,6,-54],target=[362,1.2,-54],doors={},ringing=false,offset=0,showBoxes=true;
const now=()=>Date.now()+offset;
const scene=new BarScene(document.querySelector('canvas'),{serverNow:now,onMediaFrame:()=>{scene.camera.setPosition(...eye);scene.camera.lookAt(...target);scene.app.autoRender=true;}});
scene.cityFocus={x:352,z:-58};
const material=new pc.StandardMaterial();material.diffuse=new pc.Color(1,0,0);material.emissive=new pc.Color(1,0,0);material.opacity=.45;material.blendType=pc.BLEND_NORMAL;material.depthWrite=false;material.useLighting=false;material.update();
const marks=new Map();
function mark(id){
  let entity=marks.get(id);
  if(!entity){entity=new pc.Entity('box '+id);entity.addComponent('render',{type:'box',material,castShadows:false,receiveShadows:false});scene.app.root.addChild(entity);marks.set(id,entity);}
  return entity;
}
const ids=new Set(FACTORY_GATES.map(gate=>gate.id));
function frame(){
  syncFactoryGates(id=>doors[id],now(),0);
  scene.setFactoryRinging(ringing);
  for(const box of solidColliders()){
    if(!ids.has(box.id))continue;
    const entity=mark(box.id);entity.enabled=showBoxes;
    const height=box.maxY-box.minY;entity.setPosition(box.x,box.minY+height/2,box.z);
    if(box.turn){const lx=box.turn.lx,lz=box.turn.lz;entity.setEulerAngles(0,Math.atan2(-box.turn.uz,box.turn.ux)*180/Math.PI,0);entity.setLocalScale(lx*2,height,lz*2);}
    else{entity.setEulerAngles(0,0,0);entity.setLocalScale(box.hx*2,height,box.hz*2);}
  }
}
let visuals,view,tickHandler;
const tank=(id,over)=>({id,state:'VAZIO',waterL:0,malteBags:0,mixBags:0,temperatureC:21,agitatorRpm:0,lidOpen:false,stepS:0,quality:100,penalties:[],...over});
const names={MALTE:['V1N1P1','V1N1P2','V1N2P1','V1N2P2','V1N3P1','V1N3P2','V2N1P1','V2N1P2','V2N2P1','V2N2P2','V2N3P1','V2N3P2'],MIX:['V3N1P1','V3N1P2','V3N2P1','V3N2P2','V3N3P1','V3N3P2'],PRODUTO:['PA_1','PA_2','PA_3','PA_4','PA_5','PA_6','PA_Ensaque']};
const slots=[];for(const material of ['MALTE','MIX','PRODUTO'])for(const name of names[material])slots.push({marker:material==='PRODUTO'?`Ponto_EB_${name}`:`Ponto_EB_Rack_${name}`,material,quantity:0,capacity:18,batchId:''});
const fixture={scene,ready:false,now,doors:next=>{doors=next;scene.setWorld({players:{},npcs:{},tables:{},motos:{},doors:next,serverTime:now()},'');},ringing:on=>{ringing=on;},
  view:(position,look)=>{eye=position;target=look;},boxes:on=>{showBoxes=on;},box:id=>{const found=solidColliders().find(item=>item.id===id);return found?{...found}:null;},skew:ms=>{offset=ms;},
  tanks:async(reflections=true)=>{
    visuals?.destroy();tickHandler&&scene.app.off('update',tickHandler);
    visuals=new FactoryVisuals(scene.app,reflections?scene.lightingEnvironment():undefined);
    view={revision:1,emergency:false,activeOperators:1,pausedWithoutOperator:false,siloCapacityKg:500,balance:{recipe:{waterL:1200,targetC:65,malteBags:8,mixBags:4,litresPerKg:.65},timeScale:1,bagKg:25,dissolveS:90,homogenizeS:60,preheatS:180,coolS:60},
      tanks:[tank(1,{state:'DISSOLVENDO',waterL:1200,temperatureC:65,agitatorRpm:120}),tank(2),tank(3)],dryer:{state:'PARADO',inletC:20,outletC:20,flowLph:0,powderKg:0,stepS:0,fault:'',sourceTank:0},bagging:{state:'PARADO',weightKg:0,emptyBags:50,palletBags:0,producedBags:0,rejectedBags:0,lot:''},
      alarms:[],events:[],slots,orders:[],me:{ppe:true,onShift:true,carrying:null,clean:null},gate:{open:false,ringing:null},dirt:{levels:{},required:false},production:{active:null,history:[]}};
    visuals.update(structuredClone(view),false);
    tickHandler=dt=>visuals.tick(dt,{x:340,y:2,z:-66},null,undefined);scene.app.on('update',tickHandler);
    await new Promise(resolve=>setTimeout(resolve,2500));return true;}};
window.fixture=fixture;
scene.app.on('update',frame);
scene.ready.then(()=>{fixture.doors({});setTimeout(()=>{fixture.ready=true;document.title='ready';},4000);});
