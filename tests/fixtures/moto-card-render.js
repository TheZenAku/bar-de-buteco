import * as pc from 'playcanvas';
const canvas=document.querySelector('canvas');
const app=new pc.Application(canvas,{graphicsDeviceOptions:{alpha:false,antialias:true,preserveDrawingBuffer:true}});
app.scene.ambientLight=new pc.Color(.6,.6,.6);
app.scene.toneMapping=pc.TONEMAP_ACES;app.scene.exposure=1.2;
const camera=new pc.Entity('Camera');camera.addComponent('camera',{clearColor:new pc.Color(.91,.93,.92),fov:35,nearClip:.05,farClip:30});
camera.setPosition(2.7,1.65,3.1);camera.lookAt(0,.57,-.03);app.root.addChild(camera);
for(const [name,rotation,intensity] of [['Key',[45,30,0],2.4],['Fill',[25,-120,0],1.2]]){
  const light=new pc.Entity(name);light.addComponent('light',{type:'directional',color:new pc.Color(1,1,1),intensity,castShadows:false});light.setEulerAngles(...rotation);app.root.addChild(light);
}
app.start();
app.assets.loadFromUrl('/moto/moto_delivery.glb','container',(error,asset)=>{
  if(error){window.renderError=String(error);return;}
  const model=asset.resource.instantiateRenderEntity();app.root.addChild(model);
  // The catalog sells the bare motorcycle, with its original meshes/embedded textures and no rider or bag.
  app.once('frameend',()=>app.once('frameend',()=>{window.photo=canvas.toDataURL('image/webp',.94);}));
});
