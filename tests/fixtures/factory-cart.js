// The plant's platform cart (apps/web/src/factory/cart-view.ts, drawn by FactoryVisuals) in the real scene, parked at Ponto_EB_Carrinho:
//   await fixture.cart({bags:['MALTE','MIX',...]})  draws it with those sacks (up to six; the room's list, bottom up) and a pusher null;
//   fixture.pose({x,z,yaw})  moves it (what the room's `factory.cart` says); fixture.view(eye,target) moves the camera; fixture.ready is true once the scene is there.
import {BarScene} from '../../apps/web/src/engine/BarScene.ts';
import {FactoryVisuals} from '../../apps/web/src/factory/visuals.ts';
import {FACTORY_CART} from '@bar/shared/factory';
let eye=[FACTORY_CART.park.x+2.3,1.7,FACTORY_CART.park.z+2.3],target=[FACTORY_CART.park.x,.4,FACTORY_CART.park.z];
const scene=new BarScene(document.querySelector('canvas'),{serverNow:()=>Date.now(),onMediaFrame:()=>{scene.camera.setPosition(...eye);scene.camera.lookAt(...target);scene.app.autoRender=true;}});
scene.cityFocus={x:346,z:-59};
const tank=id=>({id,state:'VAZIO',waterL:0,malteBags:0,mixBags:0,temperatureC:21,agitatorRpm:0,lidOpen:false,stepS:0,quality:100,penalties:[]});
let visuals,pose={...FACTORY_CART.park,bags:[],pusher:null},tickHandler;
const fixture={scene,ready:false,
  view:(position,look)=>{eye=position;target=look;},
  pose:next=>{pose={...pose,...next};visuals?.cartMessage(structuredClone(pose));},
  cart:async next=>{
    pose={...pose,...next};
    if(!visuals){
      visuals=new FactoryVisuals(scene.app,scene.lightingEnvironment());
      const view={revision:1,emergency:false,activeOperators:1,pausedWithoutOperator:false,siloCapacityKg:500,balance:{recipe:{waterL:1200,targetC:65,malteBags:8,mixBags:4,litresPerKg:.65},timeScale:1,bagKg:25,dissolveS:90,homogenizeS:60,preheatS:180,coolS:60},
        tanks:[tank(1),tank(2),tank(3)],dryer:{state:'PARADO',inletC:20,outletC:20,flowLph:0,powderKg:0,stepS:0,fault:'',sourceTank:0},bagging:{state:'PARADO',weightKg:0,emptyBags:50,palletBags:0,producedBags:0,rejectedBags:0,lot:''},
        alarms:[],events:[],slots:[],orders:[],me:{ppe:true,onShift:true,carrying:null,clean:null},gate:{open:false,ringing:null},dirt:{levels:{},required:false},production:{active:null,history:[]}};
      visuals.update(view,false);
      tickHandler=dt=>visuals.tick(dt,{x:pose.x,y:pose.y,z:pose.z},null,undefined,{driver:undefined,myId:'fixture'});scene.app.on('update',tickHandler);
    }
    visuals.cartMessage(structuredClone(pose));
    await new Promise(resolve=>setTimeout(resolve,2500));return true;}};
window.fixture=fixture;
scene.ready.then(()=>{setTimeout(()=>{fixture.ready=true;document.title='ready';},4000);});
