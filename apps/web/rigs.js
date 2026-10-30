import * as pc from 'playcanvas';
import {readClip,readSource,readTarget,convert,boneName} from '/src/engine/mixamo-retarget.ts';
import {BAR_ANIMATIONS} from '../../packages/shared/src/index.ts';
import {completeBasePose} from '/src/engine/animation-tracks.ts';

const $=id=>document.getElementById(id),ids=['nathan','leandro','rafael','read','magrao','gilmar-gordo'];
const labels=['Nathan','Leandro','Rafael','Read','Magrão','Gilmar'];
const app=new pc.Application($('world'),{graphicsDeviceOptions:{antialias:true,alpha:false,preserveDrawingBuffer:true}});
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);app.setCanvasResolution(pc.RESOLUTION_AUTO);app.scene.ambientLight=new pc.Color(.55,.58,.65);
app.scene.toneMapping=pc.TONEMAP_ACES;
const camera=new pc.Entity('Camera');camera.addComponent('camera',{clearColor:new pc.Color(.14,.16,.2),nearClip:.05,farClip:80,fov:38});app.root.addChild(camera);
const light=new pc.Entity('Luz');light.addComponent('light',{type:'directional',color:new pc.Color(1,.96,.9),intensity:1.4,castShadows:false});light.setEulerAngles(45,30,0);app.root.addChild(light);
const floor=new pc.Entity('Piso');floor.addComponent('render',{type:'plane'});floor.setLocalScale(30,1,20);floor.setLocalPosition(0,-.015,0);const material=new pc.StandardMaterial();material.diffuse=new pc.Color(.26,.3,.36);material.gloss=0;material.update();floor.render.material=material;app.root.addChild(floor);
const actors=new Map(),sources=new Map(),loading=new Map();let selected='bind',time=0,duration=1,playing=false,change=0,referenceSource;
function load(url){return new Promise((resolve,reject)=>app.assets.loadFromUrl(url,'container',(error,asset)=>error?reject(error):resolve(asset.resource)));}
function collect(root){return [root,...root.find(()=>true)].map(node=>({node,p:node.getLocalPosition().clone(),q:node.getLocalRotation().clone(),s:node.getLocalScale().clone()}));}
function reset(actor){for(const {node,p,q,s} of actor.rest){node.setLocalPosition(p);node.setLocalRotation(q);node.setLocalScale(s);}}
function setCamera(){const focus=$('skin').value!=='all',side=$('view').value==='side',back=$('view').value==='back';camera.setPosition(side?(focus?4:10):0,focus?1.6:2.5,side?0:(back?-1:1)*(focus?4.7:10));camera.lookAt(0,focus?1:1.1,0);}
function layout(){const focus=$('skin').value;for(const [id,actor] of actors){actor.root.enabled=focus==='all'||focus===id;actor.root.setLocalPosition(focus==='all'?(ids.indexOf(id)-2.5)*1.7:0,0,0);} $('names').style.display=focus==='all'?'block':'none';setCamera();}
async function source(group){if(!loading.has(group))loading.set(group,load(`/animacoes/${BAR_ANIMATIONS.groups[group].file}`).then(resource=>{const entity=resource.instantiateRenderEntity();const tracks=resource.animations.map(asset=>asset.resource),clips=tracks.map(track=>readClip(track));const result=readSource(entity,clips);result.entity=entity;result.tracks=tracks;result.nodes=new Map(entity.find(node=>/mixamorig/i.test(node.name)).map(node=>[boneName(node.name),node]));entity.addComponent('anim',{activate:true});entity.anim.speed=0;for(const render of entity.findComponents('render'))render.enabled=false;entity.enabled=false;app.root.addChild(entity);sources.set(group,result);return result;}));return loading.get(group);}
async function select(value){const request=++change;playing=false;$('play').textContent='Reproduzir';selected=value;time=0;duration=1;$('status').textContent='Preparando clipe…';
  let authored;if(value.startsWith('bar:'))authored=await source(BAR_ANIMATIONS.clips[value.slice(4)].group);
  if(request!==change)return;
  if(referenceSource)referenceSource.entity.enabled=false;referenceSource=authored;
  if(authored){authored.entity.enabled=true;const track=authored.tracks.find(c=>c.name===value.slice(4)),state=`Referência ${value}`;authored.entity.anim.assignAnimation(state,track,undefined,1,false);authored.entity.anim.baseLayer.transition(state,0);authored.entity.anim.baseLayer.playing=false;authored.entity.anim.speed=0;}
  for(const actor of actors.values()){
    actor.model.anim.playing=false;let track;
    if(value.startsWith('bank:'))track=actor.tracks.get(value.slice(5));
    if(authored){const clip=authored.clips.find(c=>c.name===value.slice(4)),group=BAR_ANIMATIONS.groups[BAR_ANIMATIONS.clips[value.slice(4)].group];track=convert(clip,authored,actor.target,'Inspeção',group.anchor?1:actor.target.height/group.height);}
    actor.active=track;
    if(track){const state=`Inspeção ${value}`;actor.model.anim.assignAnimation(state,track,undefined,1,false);actor.model.anim.baseLayer.transition(state,0);actor.model.anim.baseLayer.playing=false;actor.model.anim.speed=0;actor.model.anim.playing=true;duration=Math.max(duration,track.duration);}
    if(value==='bind'||!$('sequence').checked)reset(actor);
  }
  $('clip').value=value;$('time').max=String(duration);pose(0);$('status').textContent=value==='bind'?'Pose original de cada modelo.':`${value.startsWith('bar:')?'Retarget em tempo de execução':'Banco por personagem'} · ${duration.toFixed(2)} s. ${$('sequence').checked?'Sequência: conserva o estado deixado pelo clipe anterior.':'Comparação isolada: reinicia a pose antes de cada clipe.'}`;
}
function pose(t){time=Math.max(0,Math.min(duration,t));for(const actor of actors.values())if(actor.active&&actor.model.anim.baseLayer)actor.model.anim.baseLayer.activeStateCurrentTime=Math.min(time,Math.max(0,actor.active.duration-1e-6));if(referenceSource)referenceSource.entity.anim.baseLayer.activeStateCurrentTime=Math.min(time,Math.max(0,duration-1e-6));$('time').value=String(time);$('clock').textContent=`${time.toFixed(2).replace('.',',')} s`;}
function snapshot(){return [...actors].map(([id,actor])=>({id,clip:actor.active?.name??'bind',bones:Object.fromEntries(actor.target.order.map(name=>{const node=actor.model.findByName(actor.target.names.get(name));const p=actor.root.getWorldTransform().clone().invert().transformPoint(node.getPosition());return [name,[p.x,p.y,p.z]];}))}));}
const ready=Promise.all(ids.map(async(id,index)=>{const [resource,bank,dances]=await Promise.all([load(`/models/${id}.glb`),load(`/animations/${id}.glb`),load(`/animations/${id}-dances.glb`)]);const root=new pc.Entity(id),model=resource.instantiateRenderEntity({castShadows:false,receiveShadows:false});root.addChild(model);app.root.addChild(root);const tracks=new Map([...resource.animations,...bank.animations,...dances.animations].map(asset=>[asset.resource.name,completeBasePose(asset.resource,model)]));const target=readTarget(model,[...tracks.values()]);const rest=collect(model);model.addComponent('anim',{activate:true});actors.set(id,{root,model,target,rest,tracks});})).then(async()=>{
  for(let i=0;i<ids.length;i++){const option=document.createElement('option');option.value=ids[i];option.textContent=labels[i];$('skin').append(option);const label=document.createElement('span');label.textContent=labels[i];$('names').append(label);}
  for(const name of [...new Set([...actors.values()].flatMap(a=>[...a.tracks.keys()]))]){const option=document.createElement('option');option.value=`bank:${name}`;option.textContent=`Banco · ${name}`;$('clip').append(option);}
  for(const name of Object.keys(BAR_ANIMATIONS.clips)){const option=document.createElement('option');option.value=`bar:${name}`;option.textContent=`Bar · ${name}`;$('clip').append(option);}
  layout();await select(new URLSearchParams(location.search).get('clip')??'bind');return true;
}).catch(error=>{$('status').textContent=`Falha: ${error.message}`;throw error;});
$('skin').onchange=layout;$('view').onchange=setCamera;$('clip').onchange=()=>void select($('clip').value);$('time').oninput=()=>{playing=false;$('play').textContent='Reproduzir';pose(Number($('time').value));};$('play').onclick=()=>{playing=!playing;$('play').textContent=playing?'Pausar':'Reproduzir';};
app.on('update',dt=>{
  if(playing)pose((time+Math.min(dt,.1))%duration);
  for(let i=0;i<ids.length;i++){const actor=actors.get(ids[i]),label=$('names').children[i];if(actor&&label){const point=camera.camera.worldToScreen(actor.root.getPosition().clone().add(new pc.Vec3(0,-.12,0)));label.style.left=`${point.x}px`;label.style.top=`${point.y}px`;}}
  if($('skeleton').checked)for(const actor of actors.values())if(actor.root.enabled)for(const name of actor.target.order){const up=actor.target.parent.get(name);if(up){const a=actor.model.findByName(actor.target.names.get(name)),b=actor.model.findByName(actor.target.names.get(up));app.drawLine(a.getPosition(),b.getPosition(),new pc.Color(.2,1,.65),false);}}
  if($('reference').checked&&referenceSource)for(const actor of actors.values())if(actor.root.enabled)for(const name of referenceSource.order){const up=referenceSource.parent.get(name);if(up){const offset=actor.root.getPosition(),a=referenceSource.nodes.get(name).getPosition().clone().add(offset),b=referenceSource.nodes.get(up).getPosition().clone().add(offset);app.drawLine(a,b,new pc.Color(1,.7,.15),false);}}
});
addEventListener('resize',()=>app.resizeCanvas());setCamera();app.start();
window.rigFixture={app,actors,ready,select,pose,snapshot,focus(id='all'){$('skin').value=id;layout();},view(value='front'){$('view').value=value;setCamera();},get state(){return {clip:selected,time,duration,playing};}};
