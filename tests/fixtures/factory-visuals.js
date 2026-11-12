import * as pc from 'playcanvas';
import {FactoryVisuals} from '../../apps/web/src/factory/visuals.ts';
const canvas=document.querySelector('#c');
const app=new pc.Application(canvas,{graphicsDeviceOptions:{antialias:false}});
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);app.setCanvasResolution(pc.RESOLUTION_AUTO);
app.scene.ambientLight=new pc.Color(.55,.55,.6);
const camera=new pc.Entity('cam');camera.addComponent('camera',{clearColor:new pc.Color(.06,.06,.1),fov:60,nearClip:.1,farClip:300});app.root.addChild(camera);
const sun=new pc.Entity('sun');sun.addComponent('light',{type:'directional',intensity:1.1,castShadows:false});sun.setEulerAngles(50,30,0);app.root.addChild(sun);
const visuals=new FactoryVisuals(app);
const tank=(id,over)=>({id,state:'VAZIO',waterL:0,malteBags:0,mixBags:0,temperatureC:21,agitatorRpm:0,lidOpen:false,stepS:0,quality:100,penalties:[],...over});
const slots=[];
const names={MALTE:['V1N1P1','V1N1P2','V1N2P1','V1N2P2','V1N3P1','V1N3P2','V2N1P1','V2N1P2','V2N2P1','V2N2P2','V2N3P1','V2N3P2'],MIX:['V3N1P1','V3N1P2','V3N2P1','V3N2P2','V3N3P1','V3N3P2'],PRODUTO:['PA_1','PA_2','PA_3','PA_4','PA_5','PA_6','PA_Ensaque']};
for(const material of ['MALTE','MIX','PRODUTO'])for(const name of names[material])slots.push({marker:material==='PRODUTO'?`Ponto_EB_${name}`:`Ponto_EB_Rack_${name}`,material,quantity:/N1/.test(name)||/PA_[1-3]$/.test(name)?18:/N2/.test(name)?9:0,capacity:18,batchId:''});
let view={revision:1,emergency:false,activeOperators:1,pausedWithoutOperator:false,siloCapacityKg:500,
  balance:{recipe:{waterL:1200,targetC:65,malteBags:8,mixBags:4,litresPerKg:.65},timeScale:1,bagKg:25,dissolveS:90,homogenizeS:60,preheatS:180,coolS:60},
  tanks:[tank(1,{state:'DISSOLVENDO',waterL:1200,temperatureC:65,agitatorRpm:120}),tank(2,{state:'AQUECENDO',waterL:700,temperatureC:40,agitatorRpm:120}),tank(3)],
  dryer:{state:'PRODUZINDO',inletC:190,outletC:87,flowLph:1100,powderKg:200,stepS:0,fault:'',sourceTank:1},bagging:{state:'ENCHENDO',weightKg:10,emptyBags:50,palletBags:3,producedBags:3,rejectedBags:0,lot:'L1'},
  alarms:[],events:[],slots,orders:[],me:{ppe:true,onShift:true,carrying:null,clean:null},gate:{open:false,ringing:null},
  dirt:{levels:{tank1:0,tank2:0,tank3:0,dryer:0,line:0,'floor-tanques':0,'floor-secador':0,'floor-ensaque':0,'floor-estoque':0,'floor-doca':0,'floor-sala':0},required:false},production:{active:null,history:[]}};
const player={x:340,y:2,z:-66};
const fixture={app,visuals,ready:false,frames:0,gate:false,
  set(patch){view={...view,...patch,revision:view.revision+1};visuals.update(structuredClone(view),false);},
  /** fixture.dirt(0.5) sets every place to that level; fixture.dirt({tank1:1}) sets some. */
  dirt(levels){const all=typeof levels==='number';const next={...view.dirt.levels};for(const id of Object.keys(next))if(all)next[id]=levels;if(!all)Object.assign(next,levels);fixture.set({dirt:{levels:next,required:false}});},
  look(eye,target){camera.setPosition(...eye);camera.lookAt(new pc.Vec3(...target));},
  state(){return view;},
};
window.fixture=fixture;window.pc=pc;
app.on('update',dt=>{fixture.frames++;visuals.tick(dt,player,null,undefined,fixture.gate);});
// The plant's sector, the way the game loads it.
const asset=new pc.Asset('sector','container',{url:'/maps/cidade/setores/cidade_S07_04.gltf'});
app.assets.add(asset);
asset.ready(()=>{const entity=asset.resource.instantiateRenderEntity();app.root.addChild(entity);finish();});
asset.once('error',error=>{console.error('sector failed',error);finish();});
app.assets.load(asset);
function finish(){visuals.update(structuredClone(view),false);fixture.look([342,4.2,-62],[340,2.2,-70]);app.start();setTimeout(()=>{fixture.ready=true;document.title='ready';},2500);}
