import * as pc from 'playcanvas';
import {MALE_CLOTHING,CLOTHING_COLOR_FIELDS,type CharacterConfig} from '@bar/shared';
import {applyCharacter,disposeCharacter} from './character-materials';
import type {ClothingPreviews} from './CharacterPreview';

export class LegacyCharacterPreview {
  private app:pc.Application;private camera:pc.Entity;private model?:pc.Entity;private clothingModel?:pc.Entity;
  private clothingImages=new Map<string,{color:string;url:string}>();private containers=new Map<string,Promise<pc.ContainerResource>>();private observer:ResizeObserver;
  private generation=0;private destroyed=false;private yaw=0;private dragging=false;
  constructor(private canvas:HTMLCanvasElement,private onClothingPreviews?:(images:ClothingPreviews)=>void){
    this.app=new pc.Application(canvas,{graphicsDeviceOptions:{alpha:false,antialias:true,preserveDrawingBuffer:true}});this.app.graphicsDevice.maxPixelRatio=Math.min(devicePixelRatio,1.5);
    this.app.setCanvasResolution(pc.RESOLUTION_AUTO);this.app.setCanvasFillMode(pc.FILLMODE_NONE,canvas.clientWidth||320,canvas.clientHeight||390);canvas.style.width='';canvas.style.height='';this.app.scene.ambientLight=new pc.Color(.65,.68,.7);
    this.camera=new pc.Entity('Character portrait');this.camera.addComponent('camera',{clearColor:new pc.Color(.12,.065,.04),fov:33,nearClip:.1,farClip:20});this.camera.setPosition(0,1.05,3.8);this.camera.lookAt(0,.95,0);this.app.root.addChild(this.camera);
    const light=new pc.Entity('Portrait key');light.addComponent('light',{type:'directional',color:new pc.Color(1,.92,.8),intensity:1.6});light.setEulerAngles(35,-30,0);this.app.root.addChild(light);
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas);this.resize();canvas.addEventListener('pointerdown',this.pointerDown);canvas.addEventListener('pointermove',this.pointerMove);canvas.addEventListener('pointerup',this.pointerUp);canvas.addEventListener('pointercancel',this.pointerUp);this.app.start();
  }
  private resize(){const box=this.canvas.getBoundingClientRect();if(box.width&&box.height)this.app.graphicsDevice.resizeCanvas(box.width,box.height);}
  private pointerDown=(event:PointerEvent)=>{this.dragging=true;this.canvas.setPointerCapture(event.pointerId);};private pointerMove=(event:PointerEvent)=>{if(this.dragging)this.rotate(event.movementX*.5);};private pointerUp=()=>{this.dragging=false;};
  rotate(degrees:number){this.yaw+=degrees;this.model?.setLocalEulerAngles(0,this.yaw,0);}
  private load(body:string){let promise=this.containers.get(body);if(!promise){promise=new Promise<pc.ContainerResource>((resolve,reject)=>this.app.assets.loadFromUrl(`${import.meta.env.BASE_URL}characters/base-${body}.glb`,'container',(error,asset)=>{if(error||!asset){this.containers.delete(body);reject(new Error('Não foi possível carregar a prévia. Tente novamente.'));}else resolve(asset.resource as pc.ContainerResource);}));this.containers.set(body,promise);}return promise;}
  async update(config:CharacterConfig):Promise<void>{
    const generation=++this.generation,container=await this.load(config.body);if(this.destroyed||generation!==this.generation)return;
    if(this.model?.name!==config.body){disposeCharacter(this.model);this.model?.destroy();this.model=container.instantiateRenderEntity({castShadows:false,receiveShadows:false});this.model.name=config.body;this.model.addComponent('anim',{activate:true});const idle=container.animations.map(a=>a.resource as pc.AnimTrack).find(a=>a.name==='Idle');if(idle)this.model.anim!.assignAnimation('Idle',idle);this.model.setLocalEulerAngles(0,this.yaw,0);this.app.root.addChild(this.model);}
    applyCharacter(this.model,config);if(config.body==='male'&&this.onClothingPreviews)this.captureClothing(container,config);
  }
  private captureClothing(container:pc.ContainerResource,config:CharacterConfig){
    const pieces=MALE_CLOTHING.map(item=>[item.id,config[CLOTHING_COLOR_FIELDS[item.slot]]] as const);
    if(pieces.some(([id,color])=>this.clothingImages.get(id)?.color!==color)){
      if(!this.clothingModel){this.clothingModel=container.instantiateRenderEntity({castShadows:false,receiveShadows:false});this.clothingModel.name='Clothing thumbnails';this.clothingModel.setLocalEulerAngles(0,30,0);this.clothingModel.enabled=false;this.app.root.addChild(this.clothingModel);}
      const model=this.clothingModel,camera=this.camera.camera!,position=this.camera.getPosition().clone(),rotation=this.camera.getRotation().clone(),projection=camera.projection,orthoHeight=camera.orthoHeight,visible=this.model!.enabled;
      try{this.model!.enabled=false;model.enabled=true;applyCharacter(model,config);this.app.setCanvasResolution(pc.RESOLUTION_FIXED,256,256);camera.projection=pc.PROJECTION_ORTHOGRAPHIC;const renders=model.findComponents('render') as pc.RenderComponent[];
        for(const [id,color] of pieces){if(this.clothingImages.get(id)?.color===color)continue;for(const render of renders)render.entity.enabled=false;const part=model.findByName(`part-${id}`) as pc.Entity|null;if(!part?.render?.meshInstances.length)throw new Error('Não foi possível carregar as prévias das roupas.');part.enabled=true;const bounds=new pc.BoundingBox();let first=true;for(const instance of part.render.meshInstances){if(!instance.mesh)continue;const box=new pc.BoundingBox();box.setFromTransformedAabb(instance.mesh.aabb,instance.node.getWorldTransform());if(first){bounds.copy(box);first=false;}else bounds.add(box);}if(first)throw new Error('Não foi possível enquadrar a prévia da roupa.');camera.orthoHeight=Math.max(bounds.halfExtents.x,bounds.halfExtents.y)*1.2;this.camera.setPosition(bounds.center.x,bounds.center.y,bounds.center.z+3);this.camera.lookAt(bounds.center);this.app.render();this.clothingImages.set(id,{color,url:this.canvas.toDataURL('image/webp',.9)});}
      }finally{model.enabled=false;this.model!.enabled=visible;camera.projection=projection;camera.orthoHeight=orthoHeight;this.camera.setPosition(position);this.camera.setRotation(rotation);this.app.setCanvasResolution(pc.RESOLUTION_AUTO,this.canvas.clientWidth,this.canvas.clientHeight);this.app.render();}
    }
    this.onClothingPreviews?.(Object.fromEntries(pieces.map(([id])=>[id,this.clothingImages.get(id)!.url])) as ClothingPreviews);
  }
  destroy(){if(this.destroyed)return;this.destroyed=true;this.generation++;this.observer.disconnect();this.canvas.removeEventListener('pointerdown',this.pointerDown);this.canvas.removeEventListener('pointermove',this.pointerMove);this.canvas.removeEventListener('pointerup',this.pointerUp);this.canvas.removeEventListener('pointercancel',this.pointerUp);disposeCharacter(this.model);disposeCharacter(this.clothingModel);this.app.autoRender=false;this.app.renderNextFrame=false;void Promise.allSettled([...this.containers.values()]).then(()=>{this.app.destroy();this.containers.clear();});}
}
