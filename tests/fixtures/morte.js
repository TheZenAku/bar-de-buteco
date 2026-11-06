// The Morte's scene alone (docs/sistemas/morte.md): a floor, a stand-in for the victim, a clock the test moves, and the victim's screen.
import * as pc from 'playcanvas';
import {planDeath,deathDurationMs,deathStarts,deathFrame,DEATH} from '@bar/shared';
import {MorteScene} from '../../apps/web/src/engine/morte-scene';
import {DeathAudio} from '../../apps/web/src/death/death-audio';
import {createDeathUi} from '../../apps/web/src/death/death-ui';

const canvas=document.querySelector('#world');
const app=new pc.Application(canvas,{graphicsDeviceOptions:{antialias:false}});
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);app.setCanvasResolution(pc.RESOLUTION_AUTO);app.start();
app.scene.ambientLight=new pc.Color(.35,.35,.4);
const camera=new pc.Entity('camera');camera.addComponent('camera',{clearColor:new pc.Color(.12,.14,.2),fov:57,nearClip:.05,farClip:100});app.root.addChild(camera);
const sun=new pc.Entity('sun');sun.addComponent('light',{type:'directional',intensity:1.1,castShadows:false});sun.setEulerAngles(50,30,0);app.root.addChild(sun);
const floor=new pc.Entity('floor');const floorMaterial=new pc.StandardMaterial();floorMaterial.diffuse=new pc.Color(.45,.4,.35);floorMaterial.update();
floor.addComponent('render',{type:'plane',material:floorMaterial});floor.setLocalScale(30,1,30);app.root.addChild(floor);
const victimEntity=new pc.Entity('victim');const victimMaterial=new pc.StandardMaterial();victimMaterial.diffuse=new pc.Color(.2,.5,.9);victimMaterial.update();
victimEntity.addComponent('render',{type:'capsule',material:victimMaterial});victimEntity.setLocalScale(.5,1.75,.5);app.root.addChild(victimEntity);

let clock=1_000_000,shakes=[],punch=0;
const audio=new DeathAudio(()=>0);
const scene=new MorteScene({app,camera,serverNow:()=>clock,localId:()=>'victim',shake:m=>shakes.push(m),faceCamera:()=>{},punchFov:d=>{punch=d;},dust:()=>{},lowQuality:()=>false});
scene.audio=audio;
scene.onPull=(victim,k,t)=>{window.pullK=k;};
const sent=[];
const ui=createDeathUi(document.querySelector('#game'),{send:(type,payload)=>sent.push([type,payload]),now:()=>clock,audio,lite:()=>false,active:()=>{}});
window.sent=sent;window.ui=ui;window.shakes=shakes;

const plan=planDeath('fixture',{id:'victim',x:0,y:0,z:0,rotation:0},clock);
window.plan=plan;window.starts=deathStarts(plan);window.total=deathDurationMs(plan);window.DEATH=DEATH;
victimEntity.setPosition(0,.875,0);
const frames=n=>new Promise(resolve=>{let left=n;const tick=()=>{if(--left<=0)resolve();else requestAnimationFrame(tick);};requestAnimationFrame(tick);});
window.ready=async()=>{scene.preload();const until=Date.now()+30000;while(!scene.ready&&Date.now()<until)await new Promise(r=>setTimeout(r,100));return scene.ready;};
window.begin=()=>{scene.start(plan);};
/** Moves the room's clock to `ms` into the scene and draws a few frames. */
window.at=async(ms,view)=>{
  clock=plan.startedAt+ms;
  if(view){camera.setPosition(...view.eye);camera.lookAt(new pc.Vec3(...view.target));}
  for(let i=0;i<3;i++){scene.update(.016);await frames(2);}
  const frame=deathFrame(plan,clock);return {clip:frame.clip,x:+frame.x.toFixed(2),z:+frame.z.toFixed(2),yaw:+frame.yaw.toFixed(2)};
};
window.bounds=()=>{
  const box=new pc.BoundingBox();let first=true;
  const walk=node=>{if(node.render)for(const m of node.render.meshInstances){if(!m.node.enabled)continue;if(first){box.copy(m.aabb);first=false;}else box.add(m.aabb);}node.children.forEach(walk);};
  const root=app.root.findByName('Morte');if(root)walk(root);
  return {min:box.getMin().toArray().map(v=>+v.toFixed(2)),max:box.getMax().toArray().map(v=>+v.toFixed(2))};
};
window.screen=message=>ui.screen(message);window.startScene=()=>ui.sceneStarted(plan);
window.setClock=ms=>{clock=plan.startedAt+ms;};
window.pc_root=()=>app.root;window.fixtureReady=true;
