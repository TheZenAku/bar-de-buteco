// The crowd's sprites (tools/assets/render-crowd-sheets.mjs): each skin seen from `angles` sides, in three poses (standing, two steps of a walk),
// straight on (orthographic) in a frame that is the same size for every skin, so a sprite is drawn at the true height of the model it stands for.
import * as pc from 'playcanvas';
import {completeBasePose} from '../../apps/web/src/engine/animation-tracks';
import {SKINS} from '@bar/shared';

// The frame: 1.2 m wide, 2.4 m high, from 10 cm under the feet. The sheet is angles columns by poses rows.
const FRAME_H=2.4,FRAME_BOTTOM=-.1;
const app=new pc.Application(document.querySelector('#world'),{graphicsDeviceOptions:{antialias:false,alpha:true}});
app.setCanvasFillMode(pc.FILLMODE_NONE);app.setCanvasResolution(pc.RESOLUTION_FIXED,16,16);
app.scene.ambientLight=new pc.Color(0,0,0);app.start();
const load=url=>new Promise((resolve,reject)=>app.assets.loadFromUrl(url,'container',(error,asset)=>error?reject(error):resolve(asset.resource)));
const nextFrame=()=>new Promise(resolve=>app.once('frameend',resolve));

async function shoot(target,texture,width,height){
  await nextFrame();await nextFrame();
  const pixels=await texture.read(0,0,width,height,{renderTarget:target,immediate:true});
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const image=new ImageData(width,height),row=width*4;
  for(let y=0;y<height;y++)image.data.set(pixels.subarray((height-1-y)*row,(height-y)*row),y*row);
  canvas.getContext('2d').putImageData(image,0,0);
  return canvas;
}

window.ids=SKINS.map(skin=>skin.id);
window.render=async({id,cell:[cellW,cellH],angles,quality})=>{
  const model=await load(`/models/${id}.glb`);
  const layer=new pc.Layer({name:'Multidao'});app.scene.layers.push(layer);
  const root=new pc.Entity('Multidao');app.root.addChild(root);
  const spin=new pc.Entity('Giro');root.addChild(spin);
  const body=model.instantiateRenderEntity({castShadows:false,receiveShadows:false});spin.addChild(body);
  for(const render of body.findComponents('render')){
    render.layers=[layer.id];
    for(const instance of render.meshInstances){
      const material=instance.material.clone();
      material.ambient.set(0,0,0);material.useSkybox=false;material.useFog=false;material.cull=pc.CULLFACE_NONE;
      material.emissiveMap=material.diffuseMap;material.emissive.set(.4,.4,.4);material.update();
      instance.material=material;
    }
  }
  const clip=name=>model.animations.map(asset=>asset.resource).find(track=>track.name===name);
  const idle=clip('Idle'),walk=clip('Walk')??idle;
  body.addComponent('anim',{activate:true});
  body.anim.assignAnimation('Idle',completeBasePose(idle,body));
  if(walk!==idle)body.anim.assignAnimation('Walk',completeBasePose(walk,body));
  body.anim.speed=1e-6;
  await nextFrame();await nextFrame();
  const light=(name,x,y,intensity,tint)=>{
    const entity=new pc.Entity(name);entity.addComponent('light',{type:'directional',layers:[layer.id],intensity,color:new pc.Color(...tint),castShadows:false});
    entity.setEulerAngles(x,y,0);root.addChild(entity);
  };
  // Lit from the camera's side all round, so no angle is dark: the bar lights the sprite again (crowd.ts).
  light('Key',-40,-25,1.6,[1,.98,.95]);light('Fill',-12,60,.9,[.96,.97,1]);light('Back',-28,178,.8,[1,.9,.96]);
  const scale=2,width=cellW*scale,height=cellH*scale;
  const texture=new pc.Texture(app.graphicsDevice,{width,height,format:pc.PIXELFORMAT_RGBA8,mipmaps:false,minFilter:pc.FILTER_LINEAR,magFilter:pc.FILTER_LINEAR,addressU:pc.ADDRESS_CLAMP_TO_EDGE,addressV:pc.ADDRESS_CLAMP_TO_EDGE});
  const target=new pc.RenderTarget({colorBuffer:texture,depth:true,samples:1});
  const camera=new pc.Entity('Camera');
  camera.addComponent('camera',{layers:[layer.id],clearColor:new pc.Color(0,0,0,0),projection:pc.PROJECTION_ORTHOGRAPHIC,orthoHeight:FRAME_H/2,nearClip:.1,farClip:20,renderTarget:target,aspectRatioMode:pc.ASPECT_MANUAL,aspectRatio:width/height,gammaCorrection:pc.GAMMA_SRGB,toneMapping:pc.TONEMAP_LINEAR});
  root.addChild(camera);const middle=FRAME_BOTTOM+FRAME_H/2;camera.setPosition(0,middle,6);camera.lookAt(0,middle,0);
  // Three poses: standing, and the walk a quarter and three quarters of the way through its stride (the two feet in front).
  const poses=[['Idle',0],['Walk',.25],['Walk',.75]];
  const sheet=document.createElement('canvas');sheet.width=cellW*angles;sheet.height=cellH*poses.length;
  const g=sheet.getContext('2d');g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';
  for(const [row,[state,phase]] of poses.entries()){
    const length=(state==='Walk'?walk:idle).duration;
    body.anim.baseLayer.transition(state,0);
    await nextFrame();
    body.anim.baseLayer.activeStateCurrentTime=phase*length;
    for(let k=0;k<angles;k++){
      spin.setLocalEulerAngles(0,k/angles*360,0);
      const shot=await shoot(target,texture,width,height);
      g.drawImage(shot,k*cellW,row*cellH,cellW,cellH);
    }
  }
  camera.destroy();target.destroy();texture.destroy();root.destroy();app.scene.layers.remove(layer);
  return sheet.toDataURL('image/webp',quality);
};
window.ready=true;
