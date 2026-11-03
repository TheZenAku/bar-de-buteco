// The art of the collection's cards (tools/assets/render-skin-cards.mjs): each skin standing still, lit the same way, on a transparent
// background. One large picture for the card, and a sheet of smaller ones turning all the way round, the card's first frame on the sheet's first cell.
import * as pc from 'playcanvas';
import {completeBasePose} from '../../apps/web/src/engine/animation-tracks';
import {SKINS} from '@bar/shared';

const TURN=-.3,FOV=18,DEPTH=0;
const app=new pc.Application(document.querySelector('#world'),{graphicsDeviceOptions:{antialias:false,alpha:true}});
app.setCanvasFillMode(pc.FILLMODE_NONE);app.setCanvasResolution(pc.RESOLUTION_FIXED,16,16);
app.scene.ambientLight=new pc.Color(0,0,0);app.start();
const load=url=>new Promise((resolve,reject)=>app.assets.loadFromUrl(url,'container',(error,asset)=>error?reject(error):resolve(asset.resource)));
const nextFrame=()=>new Promise(resolve=>app.once('frameend',resolve));

async function shoot(camera,target,texture,width,height){
  await nextFrame();await nextFrame();
  const pixels=await texture.read(0,0,width,height,{renderTarget:target,immediate:true});
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const image=new ImageData(width,height),row=width*4;
  for(let y=0;y<height;y++)image.data.set(pixels.subarray((height-1-y)*row,(height-y)*row),y*row);
  canvas.getContext('2d').putImageData(image,0,0);
  return canvas;
}
/** Half the size, so the outline is smooth (no multisampling on a target read back with its alpha). */
function shrink(source,width,height){
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const g=canvas.getContext('2d');g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';g.drawImage(source,0,0,width,height);
  return canvas;
}

window.ids=SKINS.map(skin=>skin.id);
window.render=async({id,hero:[heroW,heroH],cell:[cellW,cellH],frames,columns,quality})=>{
  const model=await load(`/models/${id}.glb`);
  const layer=new pc.Layer({name:'Carta'});app.scene.layers.push(layer);
  const root=new pc.Entity('Carta');root.setPosition(0,DEPTH,0);app.root.addChild(root);
  const spin=new pc.Entity('Giro');root.addChild(spin);
  const body=model.instantiateRenderEntity({castShadows:false,receiveShadows:false});spin.addChild(body);
  for(const render of body.findComponents('render')){
    render.layers=[layer.id];
    for(const instance of render.meshInstances){
      const material=instance.material.clone();
      material.ambient.set(0,0,0);material.useSkybox=false;material.useFog=false;material.cull=pc.CULLFACE_NONE;
      material.emissiveMap=material.diffuseMap;material.emissive.set(.34,.34,.34);material.update();
      instance.material=material;
    }
  }
  const idle=model.animations.map(asset=>asset.resource).find(track=>track.name==='Idle');
  if(idle){body.addComponent('anim',{activate:true});body.anim.assignAnimation('Idle',completeBasePose(idle,body));body.anim.speed=1e-6;}
  await nextFrame();await nextFrame();
  // The frame holds this skin's own height, with some air above the head and under the feet.
  const head=(body.findByName('head_end')??body.findByName('head')).getPosition().y,height=head*1.1,middle=head*.495;
  const light=(name,x,y,intensity,tint)=>{
    const entity=new pc.Entity(name);entity.addComponent('light',{type:'directional',layers:[layer.id],intensity,color:new pc.Color(...tint),castShadows:false});
    entity.setEulerAngles(x,y,0);root.addChild(entity);
  };
  light('Key',-46,-30,2.05,[1,.98,.95]);light('Fill',-12,58,.95,[.96,.97,1]);light('Rim',-28,178,1.15,[1,.86,.98]);
  const pass=(width,height_)=>{
    const texture=new pc.Texture(app.graphicsDevice,{width,height:height_,format:pc.PIXELFORMAT_RGBA8,mipmaps:false,minFilter:pc.FILTER_LINEAR,magFilter:pc.FILTER_LINEAR,addressU:pc.ADDRESS_CLAMP_TO_EDGE,addressV:pc.ADDRESS_CLAMP_TO_EDGE});
    const target=new pc.RenderTarget({colorBuffer:texture,depth:true,samples:1});
    const camera=new pc.Entity('Camera');
    const distance=height/2/Math.tan(FOV*Math.PI/360);
    camera.addComponent('camera',{layers:[layer.id],clearColor:new pc.Color(0,0,0,0),fov:FOV,nearClip:.1,farClip:distance*2,renderTarget:target,aspectRatioMode:pc.ASPECT_MANUAL,aspectRatio:width/height_,gammaCorrection:pc.GAMMA_SRGB,toneMapping:pc.TONEMAP_LINEAR});
    root.addChild(camera);camera.setPosition(0,middle,distance);camera.lookAt(0,middle,0);
    return {texture,target,camera,done(){camera.destroy();target.destroy();texture.destroy();}};
  };
  spin.setLocalEulerAngles(0,TURN*180/Math.PI,0);
  const big=pass(heroW*2,heroH*2);
  const hero=shrink(await shoot(big.camera,big.target,big.texture,heroW*2,heroH*2),heroW,heroH).toDataURL('image/webp',quality.hero);
  big.done();
  const small=pass(cellW*2,cellH*2),sheet=document.createElement('canvas'),rows=Math.ceil(frames/columns);
  sheet.width=cellW*columns;sheet.height=cellH*rows;
  const g=sheet.getContext('2d');g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';
  for(let frame=0;frame<frames;frame++){
    spin.setLocalEulerAngles(0,(TURN+frame/frames*Math.PI*2)*180/Math.PI,0);
    const shot=await shoot(small.camera,small.target,small.texture,cellW*2,cellH*2);
    g.drawImage(shot,(frame%columns)*cellW,Math.floor(frame/columns)*cellH,cellW,cellH);
  }
  small.done();
  const turn=sheet.toDataURL('image/webp',quality.turn);
  root.destroy();app.scene.layers.remove(layer);
  return {hero,turn};
};
window.ready=true;
