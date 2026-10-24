import * as pc from 'playcanvas';
import type {CharacterConfig} from '@bar/shared';
import {AvatarAssetCache,AvatarV2Instance} from '../avatar-v2-lab/avatar';
import {loadCatalogs,type CatalogBundle} from '../avatar-v2-lab/catalog';
import {characterToAvatarV2} from './avatar-v2-game';
import {AVATAR_V2_GAME_ENABLED} from './avatar-v2-game';
import {LegacyCharacterPreview} from './LegacyCharacterPreview';

export type ClothingPreviews=Record<string,string>;

/** The creator previews the same modular V2 assembly used inside the world. */
class V2CharacterPreview {
  private app:pc.Application;
  private camera:pc.Entity;
  private cache:AvatarAssetCache;
  private catalogs:Promise<CatalogBundle>;
  private avatar?:AvatarV2Instance;
  private observer:ResizeObserver;
  private generation=0;
  private destroyed=false;
  private yaw=0;
  private dragging=false;
  constructor(private canvas:HTMLCanvasElement,_onClothingPreviews?:(images:ClothingPreviews)=>void){
    this.app=new pc.Application(canvas,{graphicsDeviceOptions:{alpha:false,antialias:true,preserveDrawingBuffer:true}});
    this.app.graphicsDevice.maxPixelRatio=Math.min(devicePixelRatio,1.5);
    this.app.setCanvasResolution(pc.RESOLUTION_AUTO);this.app.setCanvasFillMode(pc.FILLMODE_NONE,canvas.clientWidth||320,canvas.clientHeight||390);canvas.style.width='';canvas.style.height='';
    this.app.scene.ambientLight=new pc.Color(.56,.59,.64);
    this.camera=new pc.Entity('Avatar V2 creator camera');this.camera.addComponent('camera',{clearColor:new pc.Color(.12,.065,.04),fov:31,nearClip:.05,farClip:20});
    this.camera.setPosition(0,1.02,3.7);this.camera.lookAt(0,.92,0);this.app.root.addChild(this.camera);
    const key=new pc.Entity('Creator key');key.addComponent('light',{type:'directional',color:new pc.Color(1,.9,.76),intensity:1.8});key.setEulerAngles(38,-32,0);this.app.root.addChild(key);
    const fill=new pc.Entity('Creator fill');fill.addComponent('light',{type:'directional',color:new pc.Color(.55,.7,1),intensity:.55});fill.setEulerAngles(20,145,0);this.app.root.addChild(fill);
    this.cache=new AvatarAssetCache(this.app);this.catalogs=loadCatalogs();
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas);this.resize();
    canvas.addEventListener('pointerdown',this.pointerDown);canvas.addEventListener('pointermove',this.pointerMove);canvas.addEventListener('pointerup',this.pointerUp);canvas.addEventListener('pointercancel',this.pointerUp);this.app.start();
  }
  private resize(){const box=this.canvas.getBoundingClientRect();if(box.width&&box.height)this.app.graphicsDevice.resizeCanvas(box.width,box.height);}
  private pointerDown=(event:PointerEvent)=>{this.dragging=true;this.canvas.setPointerCapture(event.pointerId);};
  private pointerMove=(event:PointerEvent)=>{if(this.dragging)this.rotate(event.movementX*.5);};
  private pointerUp=()=>{this.dragging=false;};
  rotate(degrees:number){this.yaw+=degrees;this.avatar?.setYaw(this.yaw);}
  async update(config:CharacterConfig):Promise<void>{
    const generation=++this.generation,bundle=await this.catalogs;if(this.destroyed||generation!==this.generation)return;
    if(!this.avatar){this.avatar=new AvatarV2Instance(this.app,this.cache,bundle);this.avatar.setYaw(this.yaw);}
    await this.avatar.update(characterToAvatarV2(config,bundle));
    if(this.destroyed||generation!==this.generation)return;this.avatar.play('Idle');
  }
  destroy(){
    if(this.destroyed)return;this.destroyed=true;this.generation++;this.observer.disconnect();
    this.canvas.removeEventListener('pointerdown',this.pointerDown);this.canvas.removeEventListener('pointermove',this.pointerMove);this.canvas.removeEventListener('pointerup',this.pointerUp);this.canvas.removeEventListener('pointercancel',this.pointerUp);
    this.avatar?.destroy();this.app.autoRender=false;this.app.renderNextFrame=false;void this.catalogs.catch(()=>undefined).then(()=>this.app.destroy());
  }
}

export class CharacterPreview{
  private implementation:V2CharacterPreview|LegacyCharacterPreview;
  constructor(canvas:HTMLCanvasElement,onClothingPreviews?:(images:ClothingPreviews)=>void){this.implementation=AVATAR_V2_GAME_ENABLED?new V2CharacterPreview(canvas):new LegacyCharacterPreview(canvas,onClothingPreviews);}
  rotate(degrees:number){this.implementation.rotate(degrees);}
  update(config:CharacterConfig){return this.implementation.update(config);}
  destroy(){this.implementation.destroy();}
}
