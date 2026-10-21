import * as pc from 'playcanvas';
import type {CharacterConfig} from '@bar/shared';
import {applyCharacter,disposeCharacter} from './character-materials';

export class CharacterPreview {
  private app:pc.Application;
  private camera:pc.Entity;
  private model?:pc.Entity;
  private containers=new Map<string,Promise<pc.ContainerResource>>();
  private observer:ResizeObserver;
  private generation=0;
  private destroyed=false;
  private yaw=0;
  private dragging=false;
  constructor(private canvas:HTMLCanvasElement){
    this.app=new pc.Application(canvas,{graphicsDeviceOptions:{alpha:false,antialias:true,preserveDrawingBuffer:true}});
    this.app.graphicsDevice.maxPixelRatio=Math.min(devicePixelRatio,1.5);
    this.app.setCanvasResolution(pc.RESOLUTION_AUTO);
    this.app.setCanvasFillMode(pc.FILLMODE_NONE,canvas.clientWidth||320,canvas.clientHeight||390);
    // CSS owns the display size; resize only the drawing buffer when the layout changes.
    canvas.style.width='';canvas.style.height='';
    this.app.scene.ambientLight=new pc.Color(.65,.68,.7);
    this.camera=new pc.Entity('Character portrait');this.camera.addComponent('camera',{clearColor:new pc.Color(.025,.115,.105),fov:33,nearClip:.1,farClip:20});
    this.camera.setPosition(0,1.05,3.8);this.camera.lookAt(0,.95,0);this.app.root.addChild(this.camera);
    const light=new pc.Entity('Portrait key');light.addComponent('light',{type:'directional',color:new pc.Color(1,.92,.8),intensity:1.6});light.setEulerAngles(35,-30,0);this.app.root.addChild(light);
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas);this.resize();
    canvas.addEventListener('pointerdown',this.pointerDown);canvas.addEventListener('pointermove',this.pointerMove);canvas.addEventListener('pointerup',this.pointerUp);canvas.addEventListener('pointercancel',this.pointerUp);
    this.app.start();
  }
  private resize(){const box=this.canvas.getBoundingClientRect();if(box.width&&box.height)this.app.graphicsDevice.resizeCanvas(box.width,box.height);}
  private pointerDown=(event:PointerEvent)=>{this.dragging=true;this.canvas.setPointerCapture(event.pointerId);};
  private pointerMove=(event:PointerEvent)=>{if(this.dragging)this.rotate(event.movementX*.5);};
  private pointerUp=()=>{this.dragging=false;};
  rotate(degrees:number){this.yaw+=degrees;this.model?.setLocalEulerAngles(0,this.yaw,0);}
  private load(body:string){let promise=this.containers.get(body);if(!promise){promise=new Promise<pc.ContainerResource>((resolve,reject)=>{
    this.app.assets.loadFromUrl(`${import.meta.env.BASE_URL}characters/base-${body}.glb`,'container',(error,asset)=>{if(error||!asset){this.containers.delete(body);reject(new Error('Não foi possível carregar a prévia. Tente novamente.'));}else resolve(asset.resource as pc.ContainerResource);});
  });this.containers.set(body,promise);}return promise;}
  async update(config:CharacterConfig):Promise<void>{
    const generation=++this.generation;
    const container=await this.load(config.body);if(this.destroyed||generation!==this.generation)return;
    if(this.model?.name!==config.body){
      disposeCharacter(this.model);this.model?.destroy();this.model=container.instantiateRenderEntity({castShadows:false,receiveShadows:false});this.model.name=config.body;
      this.model.addComponent('anim',{activate:true});
      const idle=container.animations.map(a=>a.resource as pc.AnimTrack).find(a=>a.name==='Idle');if(idle)this.model.anim!.assignAnimation('Idle',idle);
      this.model.setLocalEulerAngles(0,this.yaw,0);this.app.root.addChild(this.model);
    }
    applyCharacter(this.model,config);
  }
  destroy(){if(this.destroyed)return;this.destroyed=true;this.generation++;this.observer.disconnect();this.canvas.removeEventListener('pointerdown',this.pointerDown);this.canvas.removeEventListener('pointermove',this.pointerMove);this.canvas.removeEventListener('pointerup',this.pointerUp);this.canvas.removeEventListener('pointercancel',this.pointerUp);disposeCharacter(this.model);this.app.destroy();}
}
