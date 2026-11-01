import * as pc from 'playcanvas';
import {completeBasePose} from './animation-tracks';

const WIDTH=360,HEIGHT=540;
// Enough for the tallest skin (1.86 m) with a little air around it, and below every floor, out of the x-ray's reach.
const FRAME_HEIGHT=1.96,DEPTH=-300,FOV=20,TURN=-.3;
const DEADLINE_MS=8000;

const nextFrame=(app:pc.AppBase)=>new Promise<void>(resolve=>app.once('frameend',()=>resolve()));

/**
 * A skin standing still, as a transparent image (the profile window). It is drawn once, in the game's own context and on a
 * layer of its own, from a copy of the model: a second canvas would mean a second GPU context and parsing the GLB again.
 */
export async function shootPortrait(app:pc.AppBase,model:pc.ContainerResource,main:pc.CameraComponent):Promise<string|undefined> {
  const device=app.graphicsDevice,scene=app.scene;
  const layer=new pc.Layer({name:'Skin portrait'});scene.layers.push(layer);
  const texture=new pc.Texture(device,{name:'Skin portrait',width:WIDTH,height:HEIGHT,format:pc.PIXELFORMAT_RGBA8,mipmaps:false,minFilter:pc.FILTER_LINEAR,magFilter:pc.FILTER_LINEAR,addressU:pc.ADDRESS_CLAMP_TO_EDGE,addressV:pc.ADDRESS_CLAMP_TO_EDGE});
  const target=new pc.RenderTarget({colorBuffer:texture,depth:true,samples:1});
  const root=new pc.Entity('Skin portrait');root.setPosition(0,DEPTH,0);app.root.addChild(root);
  const body=model.instantiateRenderEntity({castShadows:false,receiveShadows:false});root.addChild(body);
  // The picture stays for the whole session, so it takes nothing from the hour of the day: no ambient light, sky or fog.
  const materials:pc.Material[]=[];
  for(const render of body.findComponents('render') as pc.RenderComponent[]){
    render.layers=[layer.id];
    for(const instance of render.meshInstances){
      const material=instance.material!.clone() as pc.StandardMaterial;
      material.ambient.set(0,0,0);material.useSkybox=false;material.useFog=false;
      // A flat ambient of its own, so the sides the lights miss keep their colour.
      material.emissiveMap=material.diffuseMap;material.emissive.set(.3,.3,.3);material.update();
      instance.material=material;materials.push(material);
    }
  }
  const idle=model.animations.map(asset=>asset.resource as pc.AnimTrack).find(track=>track.name==='Idle');
  if(idle){
    body.addComponent('anim',{activate:true});
    body.anim!.assignAnimation('Idle',completeBasePose(idle,body));
    // Practically frozen on the clip's first frame: at speed 0 the component would not evaluate it at all.
    body.anim!.speed=1e-6;
  }
  const distance=FRAME_HEIGHT/2/Math.tan(FOV*Math.PI/360);
  const camera=new pc.Entity('Skin portrait camera');
  camera.addComponent('camera',{layers:[layer.id],clearColor:new pc.Color(0,0,0,0),fov:FOV,nearClip:.1,farClip:distance*2,priority:-10,renderTarget:target,
    aspectRatioMode:pc.ASPECT_MANUAL,aspectRatio:WIDTH/HEIGHT,gammaCorrection:main.gammaCorrection,toneMapping:main.toneMapping});
  root.addChild(camera);
  camera.setLocalPosition(Math.sin(TURN)*distance,FRAME_HEIGHT/2-.02,Math.cos(TURN)*distance);
  camera.lookAt(0,DEPTH+FRAME_HEIGHT/2-.02,0);
  const light=(name:string,x:number,y:number,intensity:number,tint:[number,number,number])=>{
    const entity=new pc.Entity(name);
    entity.addComponent('light',{type:'directional',layers:[layer.id],intensity,color:new pc.Color(...tint),castShadows:false});
    entity.setEulerAngles(x,y,0);root.addChild(entity);
  };
  light('Key',-46,-30,2.1,[1,.98,.95]);
  light('Fill',-12,58,1,[.96,.97,1]);
  light('Rim',-28,178,.8,[1,.86,.98]);
  try{
    // The clip's pose is applied in the next update, and drawn in the frame after it.
    const drawn=(async()=>{await nextFrame(app);await nextFrame(app);await nextFrame(app);return texture.read(0,0,WIDTH,HEIGHT,{renderTarget:target,immediate:true});})();
    const pixels=await Promise.race([drawn,new Promise<undefined>(resolve=>setTimeout(()=>resolve(undefined),DEADLINE_MS))]);
    if(!pixels)return undefined;
    const canvas=document.createElement('canvas');canvas.width=WIDTH;canvas.height=HEIGHT;
    const image=new ImageData(WIDTH,HEIGHT),row=WIDTH*4;
    // WebGL's rows run bottom-up.
    for(let y=0;y<HEIGHT;y++)image.data.set((pixels as Uint8Array).subarray((HEIGHT-1-y)*row,(HEIGHT-y)*row),y*row);
    canvas.getContext('2d')!.putImageData(image,0,0);
    return canvas.toDataURL('image/png');
  }finally{
    root.destroy();for(const material of materials)material.destroy();scene.layers.remove(layer);target.destroy();texture.destroy();
  }
}
