import * as pc from 'playcanvas';
import {DomMirror} from './dom-mirror';

/**
 * The interface inside the headset: three panels drawn from the same HTML the desktop shows (dom-mirror.ts).
 *
 *  - the screen: all of the page (windows, phone, tables, chat), big, in front of the player. It opens by itself when a window
 *    does, and the laser pointer clicks the real elements under it;
 *  - the hud: the key prompt ("E Interagir"), notices and banners, small and low in front of the face, only while there is any;
 *  - the watch: minimap, needs and wallet, on the face of the left controller, seen by raising it in front of the eyes.
 */
const QUAD=(device:pc.GraphicsDevice)=>{
  const mesh=new pc.Mesh(device);
  mesh.setPositions([-.5,.5,0,.5,.5,0,.5,-.5,0,-.5,-.5,0]);
  mesh.setNormals([0,0,1,0,0,1,0,0,1,0,0,1]);
  // The picture is uploaded flipped (Texture flipY), so its top row is at v=1.
  mesh.setUvs(0,[0,1,1,1,1,0,0,0]);
  mesh.setIndices([0,2,1,0,3,2]);
  mesh.update();
  return mesh;
};

/** A flat picture in the world: a canvas drawn by the mirror, shown without lighting, fog or depth. */
export class Panel {
  readonly entity:pc.Entity;
  readonly canvas=document.createElement('canvas');
  readonly context=this.canvas.getContext('2d',{alpha:true})!;
  private readonly material=new pc.StandardMaterial();
  private texture?:pc.Texture;

  constructor(private readonly device:pc.GraphicsDevice,name:string,mesh:pc.Mesh,order=200) {
    const material=this.material;
    material.useLighting=false;material.useFog=false;material.useSkybox=false;
    material.diffuse.set(0,0,0);material.emissive.set(1,1,1);
    material.blendType=pc.BLEND_NORMAL;material.depthTest=false;material.depthWrite=false;material.cull=pc.CULLFACE_NONE;
    material.update();
    this.entity=new pc.Entity(name);
    this.entity.addComponent('render',{meshInstances:[new pc.MeshInstance(mesh,material,this.entity)],castShadows:false,receiveShadows:false});
    // After everything in the world, and the nearest panels last of all.
    for(const instance of this.entity.render!.meshInstances){instance.drawBucket=order;instance.cull=false;}
    this.entity.enabled=false;
  }

  /** Uploads what was drawn on the canvas. */
  upload():boolean {
    const {canvas}=this;
    if(!canvas.width||!canvas.height)return false;
    try{
      if(!this.texture||this.texture.width!==canvas.width||this.texture.height!==canvas.height){
        this.texture?.destroy();
        this.texture=new pc.Texture(this.device,{name:this.entity.name,width:canvas.width,height:canvas.height,format:pc.PIXELFORMAT_RGBA8,mipmaps:false,flipY:true,
          minFilter:pc.FILTER_LINEAR,magFilter:pc.FILTER_LINEAR,addressU:pc.ADDRESS_CLAMP_TO_EDGE,addressV:pc.ADDRESS_CLAMP_TO_EDGE});
        this.material.emissiveMap=this.texture;this.material.opacityMap=this.texture;this.material.opacityMapChannel='a';this.material.update();
      }
      this.texture.setSource(canvas);
      this.texture.upload();
      return true;
    }catch{return false;}
  }
  /** The picture is drawn with the scene's exposure applied, which would dim it at night: cancelled here. */
  exposure(scene:pc.Scene):void {
    const intensity=1/Math.max(.05,scene.exposure);
    if(Math.abs(this.material.emissiveIntensity-intensity)>.01){this.material.emissiveIntensity=intensity;this.material.update();}
  }
  /** How opaque the whole panel is, 0 to 1. */
  set alpha(value:number) {
    if(Math.abs(this.material.opacity-value)>.01){this.material.opacity=value;this.material.update();}
  }
  /** Nothing drawn and nothing to see. */
  get ready():boolean {return !!this.texture;}
  destroy():void {this.texture?.destroy();this.material.destroy();this.entity.destroy();}
}

/** A name over someone's head (the DOM labels of the 2D view cannot be seen in the headset). */
export interface NameTag {id:string;name:string;x:number;y:number;z:number;npc:boolean}

/** Where the laser meets the screen, in the page's CSS pixels. */
export interface ScreenHit {x:number;y:number;distance:number}

// Real boxes, not the containers that centre them (a container's own rectangle is not where its contents are drawn).
const HUD_PARTS=['#toasts > *','#event-banner','#connection','#consuming','#context','#table-cta'];
const WATCH_PARTS=['.minimap','.hud-wallet'];
/** CSS pixels of the page per metre: how big a panel is. */
const SCREEN_WIDTH=2.1,HUD_DENSITY=820,WATCH_DENSITY=1500;
const SCREEN_DISTANCE=1.5;

const visible=(element:Element):boolean=>{
  const rect=element.getBoundingClientRect();
  return rect.width>2&&rect.height>2&&getComputedStyle(element).visibility!=='hidden';
};
const pointerEvent=(type:string,x:number,y:number,buttons:number)=>new PointerEvent(type,{bubbles:true,cancelable:true,composed:true,clientX:x,clientY:y,screenX:x,screenY:y,
  pointerId:7,pointerType:'mouse',isPrimary:true,button:buttons?0:-1,buttons,pressure:buttons?.5:0});
const mouseEvent=(type:string,x:number,y:number,buttons:number)=>new MouseEvent(type,{bubbles:true,cancelable:true,composed:true,clientX:x,clientY:y,screenX:x,screenY:y,button:0,buttons,detail:type==='click'?1:0});

export class VrPanels {
  readonly mirror=new DomMirror();
  readonly screen:Panel;
  readonly hud:Panel;
  readonly watch:Panel;
  private readonly cursor:Panel;
  private opened=false;
  private autoOpened=false;
  private dirty=true;
  private lastCapture=-1e9;
  private lastSignature='';
  private lastPoll=-1e9;
  /** What the last capture cost the main thread (ms): the next one waits several times as long, so the world never stalls for long. */
  private cost=0;
  private lastWatch=-1e9;
  private watchWanted=false;
  private hudWanted=false;
  private recapture=0;
  private observer?:MutationObserver;
  /** Per laser: what it is over and what it pressed. */
  private readonly lasers=new Map<string,{over:Element|null;down:Element|null;x:number;y:number;slider:HTMLInputElement|null}>();
  private readonly tags=new Map<string,{panel:Panel;text:string}>();
  private readonly quad:pc.Mesh;
  private readonly point=new pc.Vec3();
  private readonly inverse=new pc.Mat4();

  /** `parent` is the rig the panels travel with; `hand` is the left controller's grip, which the watch rides on. */
  constructor(private readonly app:pc.AppBase,private readonly parent:pc.Entity,private readonly head:pc.Entity) {
    const device=app.graphicsDevice,quad=this.quad=QUAD(device);
    this.screen=new Panel(device,'VR screen',quad,210);
    this.hud=new Panel(device,'VR hud',quad,205);
    this.watch=new Panel(device,'VR watch',quad,206);
    this.cursor=new Panel(device,'VR cursor',quad,230);
    const dot=this.cursor.canvas;dot.width=dot.height=64;
    const g=this.cursor.context.createRadialGradient(32,32,2,32,32,30);
    g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.35,'rgba(255,90,200,.95)');g.addColorStop(1,'rgba(255,90,200,0)');
    this.cursor.context.fillStyle=g;this.cursor.context.fillRect(0,0,64,64);this.cursor.upload();
    this.cursor.entity.setLocalScale(.045,.045,1);
    for(const panel of [this.screen,this.hud,this.cursor])parent.addChild(panel.entity);
    this.mirror.onLate=()=>{this.dirty=true;};
  }

  /** The watch rides on the controller it is given (null: hidden). */
  mount(hand:pc.Entity|null):void {
    if(hand){hand.addChild(this.watch.entity);this.watch.entity.setLocalPosition(0,.085,-.02);this.watch.entity.setLocalEulerAngles(-90,0,0);}
    else this.parent.addChild(this.watch.entity);
    this.watchWanted=!!hand;
    if(!hand)this.watch.entity.enabled=false;
  }

  get isOpen():boolean {return this.opened;}
  get wasAutoOpened():boolean {return this.autoOpened;}

  /** Puts the screen in front of the player (positions in the rig's space) and starts keeping it up to date. */
  open(automatic:boolean):void {
    if(this.opened){this.autoOpened=this.autoOpened&&automatic;return;}
    this.opened=true;this.autoOpened=automatic;this.dirty=true;this.lastCapture=-1e9;
    const position=this.head.getLocalPosition(),forward=this.head.getLocalRotation().transformVector(pc.Vec3.FORWARD,new pc.Vec3());
    const yaw=Math.atan2(forward.x,forward.z);
    this.screen.entity.setLocalPosition(position.x+Math.sin(yaw)*SCREEN_DISTANCE,position.y-.06,position.z+Math.cos(yaw)*SCREEN_DISTANCE);
    this.screen.entity.setLocalEulerAngles(0,yaw*pc.math.RAD_TO_DEG+180,0);
    this.screen.entity.enabled=this.screen.ready;
    this.observer??=new MutationObserver(()=>{this.dirty=true;});
    this.observer.observe(document.body,{subtree:true,childList:true,attributes:true,characterData:true});
  }
  close():void {
    if(!this.opened)return;
    this.opened=false;this.autoOpened=false;
    this.observer?.disconnect();
    this.screen.entity.enabled=false;this.cursor.entity.enabled=false;
    for(const [hand,state] of this.lasers)this.release(hand,state,false);
    this.lasers.clear();
  }

  /** A fresh picture soon after something was clicked: the page answers a little later. */
  private poke():void {this.dirty=true;this.recapture=3;}

  /** The laser's point on the screen, or null. */
  rayScreen(origin:pc.Vec3,direction:pc.Vec3):ScreenHit|null {
    if(!this.opened||!this.screen.ready||!this.screen.entity.enabled)return null;
    const entity=this.screen.entity,centre=entity.getPosition(),normal=entity.getRotation().transformVector(pc.Vec3.BACK,new pc.Vec3());
    const denominator=normal.dot(direction);
    if(Math.abs(denominator)<1e-4)return null;
    const t=normal.dot(this.point.copy(centre).sub(origin))/denominator;
    if(t<=0||t>8)return null;
    this.point.copy(direction).mulScalar(t).add(origin);
    this.inverse.copy(entity.getWorldTransform()).invert().transformPoint(this.point,this.point);
    const u=this.point.x+.5,v=.5-this.point.y;
    if(u<-.01||u>1.01||v<-.01||v>1.01)return null;
    return {x:Math.min(.999,Math.max(0,u))*this.mirror.width,y:Math.min(.999,Math.max(0,v))*this.mirror.height,distance:t};
  }
  /** Names floating over the people near the player, facing the eyes; `list` is the ones to show (the nearest few). */
  names(list:readonly NameTag[],eye:pc.Vec3):void {
    const keep=new Set<string>();
    for(const tag of list){
      keep.add(tag.id);
      let entry=this.tags.get(tag.id);
      if(!entry){
        const panel=new Panel(this.app.graphicsDevice,`VR name ${tag.id}`,this.quad,180);
        this.app.root.addChild(panel.entity);
        entry={panel,text:''};this.tags.set(tag.id,entry);
      }
      const {panel}=entry;
      if(entry.text!==tag.name){
        const canvas=panel.canvas,context=panel.context,font='600 30px system-ui,sans-serif';
        context.font=font;
        const width=Math.ceil(context.measureText(tag.name).width)+36;
        canvas.width=width;canvas.height=48;
        context.font=font;context.fillStyle='rgba(20,12,34,.86)';context.fillRect(0,0,width,48);
        context.strokeStyle=tag.npc?'rgba(255,200,80,.8)':'rgba(255,90,200,.85)';context.lineWidth=3;context.strokeRect(1.5,1.5,width-3,45);
        context.fillStyle='#fff';context.textBaseline='middle';context.fillText(tag.name,18,25);
        entry.text=tag.name;panel.upload();
      }
      panel.exposure(this.app.scene);
      const entity=panel.entity,distance=Math.hypot(tag.x-eye.x,tag.y-eye.y,tag.z-eye.z),height=.1*Math.min(2.4,Math.max(.8,distance/3.5));
      entity.enabled=panel.ready;
      entity.setPosition(tag.x,tag.y,tag.z);
      entity.setLocalScale(height*panel.canvas.width/48,height,1);
      // +Z toward the eyes: looking at the point on the far side of the name.
      entity.lookAt(tag.x*2-eye.x,tag.y*2-eye.y,tag.z*2-eye.z);
    }
    for(const [id,entry] of this.tags)if(!keep.has(id)){entry.panel.destroy();this.tags.delete(id);}
  }

  /** The cursor dot: on the screen where the laser hit it (null: hidden). */
  showCursor(hit:ScreenHit|null):void {
    this.cursor.entity.enabled=!!hit;
    if(!hit)return;
    const entity=this.screen.entity,at=new pc.Vec3(hit.x/this.mirror.width-.5,.5-hit.y/this.mirror.height,0);
    entity.getLocalTransform().transformPoint(at,at);
    this.cursor.entity.setLocalPosition(at);
    this.cursor.entity.setLocalRotation(entity.getLocalRotation());
  }

  private element(x:number,y:number):Element|null {
    const found=document.elementFromPoint(x,y);
    if(!found||found===document.body||found===document.documentElement||found.id==='world'||found.id==='app'||found.id==='labels')return null;
    return found;
  }

  /**
   * One laser, one frame: where it points (null: off the screen) and whether its button is held. Hovering, pressing, dragging and
   * clicking go to the real elements as the mouse would send them. Returns true when it is over something that can be clicked.
   */
  laser(hand:string,hit:ScreenHit|null,pressed:boolean):boolean {
    const state=this.lasers.get(hand)??{over:null,down:null,x:-1,y:-1,slider:null};
    this.lasers.set(hand,state);
    if(!hit){
      if(state.down&&!pressed)this.release(hand,state,false);
      state.over=null;
      return false;
    }
    const x=Math.round(hit.x),y=Math.round(hit.y),target=state.down??this.element(x,y);
    const moved=x!==state.x||y!==state.y;
    if(moved){
      state.x=x;state.y=y;
      const over=this.element(x,y);
      if(over!==state.over){
        if(state.over?.isConnected)state.over.dispatchEvent(pointerEvent('pointerout',x,y,state.down?1:0));
        over?.dispatchEvent(pointerEvent('pointerover',x,y,state.down?1:0));
        over?.dispatchEvent(mouseEvent('mouseover',x,y,state.down?1:0));
        state.over=over;
      }
      const mover=state.down??over;
      if(mover){mover.dispatchEvent(pointerEvent('pointermove',x,y,state.down?1:0));mover.dispatchEvent(mouseEvent('mousemove',x,y,state.down?1:0));}
      if(state.slider)this.slide(state.slider,x);
    }
    if(pressed&&!state.down&&target){
      state.down=target;
      target.dispatchEvent(pointerEvent('pointerdown',x,y,1));target.dispatchEvent(mouseEvent('mousedown',x,y,1));
      const slider=target instanceof HTMLInputElement&&target.type==='range'?target:null;
      state.slider=slider;
      if(slider)this.slide(slider,x);
      const field=target.closest('input,textarea,[contenteditable="true"]');
      const active=document.activeElement;
      if(field&&field instanceof HTMLElement&&!(field instanceof HTMLInputElement&&['range','checkbox','radio','button','submit','file','color'].includes(field.type)))field.focus();
      else if(active instanceof HTMLElement&&active!==document.body&&!target.closest('#vr-keyboard')&&active.matches('input,textarea,[contenteditable="true"]'))active.blur();
    }else if(!pressed&&state.down)this.release(hand,state,true);
    return !!(state.over&&state.over.closest('button,a,input,select,textarea,label,[role=button],[data-action],.hud-btn,[tabindex]'));
  }
  private release(_hand:string,state:{over:Element|null;down:Element|null;x:number;y:number;slider:HTMLInputElement|null},click:boolean):void {
    const down=state.down;state.down=null;
    if(!down)return;
    const {x,y}=state,up=down.isConnected?down:this.element(x,y)??document.body;
    up.dispatchEvent(pointerEvent('pointerup',x,y,0));up.dispatchEvent(mouseEvent('mouseup',x,y,0));
    if(state.slider){state.slider.dispatchEvent(new Event('change',{bubbles:true}));state.slider=null;this.poke();return;}
    if(click&&down.isConnected){
      const under=this.element(x,y);
      if(under&&(under===down||down.contains(under)||under.contains(down))){
        if(down instanceof HTMLSelectElement)this.step(down,x);
        else down.dispatchEvent(mouseEvent('click',x,y,0));
      }
    }
    this.poke();
  }
  /** A drop-down list, which a script cannot open: the click on its left quarter goes back one choice, anywhere else forward. */
  private step(select:HTMLSelectElement,x:number):void {
    const rect=select.getBoundingClientRect(),count=select.options.length;
    if(!count)return;
    const next=(select.selectedIndex+(x<rect.left+rect.width*.25?-1:1)+count)%count;
    select.selectedIndex=next;
    select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));
  }
  private slide(slider:HTMLInputElement,x:number):void {
    const rect=slider.getBoundingClientRect();
    if(rect.width<1)return;
    const min=Number(slider.min||0),max=Number(slider.max||100),step=Number(slider.step)||1;
    const raw=min+Math.min(1,Math.max(0,(x-rect.left)/rect.width))*(max-min);
    const value=String(Math.min(max,Math.max(min,Math.round((raw-min)/step)*step+min)));
    if(slider.value===value)return;
    slider.value=value;slider.dispatchEvent(new Event('input',{bubbles:true}));
  }
  /** The thumbstick scrolls whatever list the laser is over. */
  scroll(hit:ScreenHit|null,pixels:number):void {
    if(!hit||!pixels)return;
    let node:Element|null=this.element(Math.round(hit.x),Math.round(hit.y));
    while(node&&node!==document.body){
      if(node instanceof HTMLElement&&node.scrollHeight>node.clientHeight+2){
        const overflow=getComputedStyle(node).overflowY;
        if(overflow==='auto'||overflow==='scroll'){node.scrollTop+=pixels;this.dirty=true;return;}
      }
      node=node.parentElement;
    }
  }

  /**
   * Once a frame. `now` is in seconds. `look` is where the head is and which way it faces (the rig's space), `held` the left
   * controller's grip pose and whether it is raised to the eyes.
   */
  update(now:number,dt:number,look:{x:number;y:number;z:number;yaw:number},watchVisible:boolean):void {
    this.screen.exposure(this.app.scene);this.hud.exposure(this.app.scene);this.watch.exposure(this.app.scene);this.cursor.exposure(this.app.scene);
    const ms=now*1000;
    // The screen: the whole page, about 4 times a second at most while something changes (it is the slow one: the browser draws
    // it on the main thread, so the world stops for as long as it takes; a window open is a moment of stillness anyway).
    if(this.opened){
      const due=this.dirty&&ms-this.lastCapture>Math.max(500,this.cost*5)||ms-this.lastCapture>Math.max(2500,this.cost*8)||this.recapture>0&&ms-this.lastCapture>Math.max(250,this.cost*3);
      if(due&&!this.mirror.busy){
        this.lastCapture=ms;this.dirty=false;if(this.recapture>0)this.recapture--;
        void this.mirror.capture().then(done=>{if(done){this.measure();this.afterScreen();}});
      }
      const {screen}=this;
      screen.entity.setLocalScale(SCREEN_WIDTH,SCREEN_WIDTH*this.mirror.height/Math.max(1,this.mirror.width),1);
    }else{
      // The hud: only when its words changed. The watch: only while it is looked at. Both draw just their own parts of the page.
      let signature=this.lastSignature;
      if(ms-this.lastPoll>400){
        this.lastPoll=ms;
        const shown=HUD_PARTS.flatMap(selector=>Array.from(document.querySelectorAll(selector)).filter(visible));
        this.hudWanted=shown.length>0;
        signature=shown.map(element=>element.textContent?.trim()??'').join('|')+`|${shown.length}`;
      }
      const hudChanged=signature!==this.lastSignature&&this.hudWanted;
      const watchDue=watchVisible&&this.watchWanted&&ms-this.lastWatch>1500;
      if(!this.mirror.busy&&hudChanged&&ms-this.lastCapture>Math.max(300,this.cost*6)){
        this.lastCapture=ms;this.lastSignature=signature;
        void this.mirror.capture(HUD_PARTS).then(done=>{if(done){this.measure();this.compose(this.hud,HUD_DENSITY);}});
      }else if(!this.mirror.busy&&watchDue&&ms-this.lastCapture>Math.max(150,this.cost*6)){
        this.lastCapture=ms;this.lastWatch=ms;
        void this.mirror.capture(WATCH_PARTS).then(done=>{if(done){this.measure();this.compose(this.watch,WATCH_DENSITY);}});
      }
      if(signature!==this.lastSignature&&!this.hudWanted)this.lastSignature=signature;
    }
    // The hud follows the head's heading lazily and sits low in front of it.
    const hud=this.hud.entity;
    if(this.hudWanted){
      hud.enabled=this.hud.ready;
      const current=hud.getLocalPosition(),goalX=look.x+Math.sin(look.yaw)*1.25,goalZ=look.z+Math.cos(look.yaw)*1.25,goalY=look.y-.42;
      const k=1-Math.exp(-4*dt);
      hud.setLocalPosition(current.x+(goalX-current.x)*k,current.y+(goalY-current.y)*k,current.z+(goalZ-current.z)*k);
      const facing=Math.atan2(look.x-hud.getLocalPosition().x,look.z-hud.getLocalPosition().z)*pc.math.RAD_TO_DEG;
      hud.setLocalEulerAngles(0,facing,0);
    }else hud.enabled=false;
    this.watch.entity.enabled=this.watchWanted&&watchVisible&&this.watch.ready;
  }

  private measure():void {const {timing}=this.mirror;this.cost=timing.build+timing.load+timing.draw;}
  /** The whole-page picture goes to the screen. */
  private afterScreen():void {
    const {mirror,screen}=this;
    screen.canvas.width=mirror.canvas.width;screen.canvas.height=mirror.canvas.height;
    screen.context.clearRect(0,0,screen.canvas.width,screen.canvas.height);
    screen.context.drawImage(mirror.canvas,0,0);
    if(screen.upload()&&!screen.entity.enabled)screen.entity.enabled=true;
  }
  /** The picture of the parts the last capture drew (they come stacked in a column) goes to a panel, at the size they have on the page. */
  private compose(panel:Panel,density:number):void {
    const {mirror}=this;
    panel.canvas.width=mirror.canvas.width;panel.canvas.height=mirror.canvas.height;
    panel.context.clearRect(0,0,panel.canvas.width,panel.canvas.height);
    panel.context.drawImage(mirror.canvas,0,0);
    panel.entity.setLocalScale(mirror.region.w/density,mirror.region.h/density,1);
    panel.upload();
  }

  destroy():void {
    this.close();
    for(const panel of [this.screen,this.hud,this.watch,this.cursor])panel.destroy();
    for(const entry of this.tags.values())entry.panel.destroy();
    this.tags.clear();
  }
}
