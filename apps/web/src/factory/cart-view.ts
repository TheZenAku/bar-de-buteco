import * as pc from 'playcanvas';
import {FACTORY_CART,stepCart,type CartMaterial,type CartPose,type CartView} from '@bar/shared/factory';
import {loadBagKit,type BagKit} from './bags';

/**
 * The plant's platform cart (public/fabrica/empresa_brasil_carrinho.glb: node EB_Carrinho at the floor under the deck's middle, six Slot_Saco_N
 * children where the sacks lie), drawn from the room's state (`factory.cart`). Its sacks are the plant's real sack meshes (bags.ts), hung on the slots in
 * the order of the room's list. Others' carts glide to the room's pose; the one the local player pushes is run with the same rules as the room's
 * (shared stepCart) on the avatar's own position, so it does not trail behind a moving player, and snaps back to the room's when the two disagree.
 */
const BASE=import.meta.env.BASE_URL;
/** The sack mesh lies with its base at y 0 and the slot is the middle of the sack: it hangs half a thickness lower. */
const HALF_THICK=FACTORY_CART.bag[2]/2;
/** A pushed cart further than this (m) from the room's pose is snapped to it. */
const SNAP=1.6;
const RAD_TO_DEG=180/Math.PI;
export interface CartDriver {x:number;y:number;z:number;rotation:number}

export class FactoryCartView {
  private model?:pc.Entity;
  private slots:pc.Entity[]=[];
  private bags:Array<{entity:pc.Entity;material:CartMaterial}|undefined>=[];
  private server?:CartView;
  /** The pose on screen. */
  private shown:CartPose={...FACTORY_CART.park};
  private seeded=false;private pushing=false;
  private kit?:BagKit|null;
  private disposed=false;
  /** The pose the cart has now, as the others see it (for the avatar's hands). */
  pose():CartPose&{pusher:string|null}|undefined {return this.server?{...this.shown,pusher:this.server.pusher}:undefined;}

  constructor(private app:pc.AppBase,private parent:pc.Entity){
    void this.load();
  }
  private async load():Promise<void> {
    const asset=new pc.Asset('EB carrinho','container',{url:`${BASE}fabrica/empresa_brasil_carrinho.glb`});
    this.app.assets.add(asset);
    await new Promise<void>(resolve=>{asset.ready(()=>resolve());asset.once('error',()=>resolve());this.app.assets.load(asset);});
    if(this.disposed)return;
    if(!asset.resource){console.warn('[fábrica] empresa_brasil_carrinho.glb não carregou: sem carrinho.');return;}
    const model=(asset.resource as pc.ContainerResource).instantiateRenderEntity({castShadows:true,receiveShadows:true});
    model.name='EB_Carrinho_Instancia';model.enabled=false;this.parent.addChild(model);this.model=model;
    // The exporter suffixes the children (Slot_Saco_1.001): found by prefix.
    this.slots=FACTORY_CART.slots.map(slot=>model.find((node:pc.GraphNode)=>node.name===slot.node||node.name.startsWith(`${slot.node}.`))[0] as pc.Entity);
    if(this.slots.some(slot=>!slot)){console.warn('[fábrica] o carrinho não tem os Slot_Saco_N.');this.slots=[];}
    this.kit=await loadBagKit(this.app);
    if(this.disposed)return;
    this.draw();this.app.renderNextFrame=true;
  }

  /** The room's word on the cart (a change of its pose, its sacks or its pusher). */
  message(view:CartView):void {
    const first=!this.server;this.server=view;
    if(first||!this.seeded){Object.assign(this.shown,{x:view.x,y:view.y,z:view.z,yaw:view.yaw});this.seeded=true;}
    this.draw();this.app.renderNextFrame=true;
  }
  /** Hangs one sack mesh on each slot the room's list fills (rebuilt only for the slots whose kind changed). */
  private draw():void {
    const list=this.server?.bags??[],kit=this.kit;
    for(let i=0;i<FACTORY_CART.capacity;i++){
      const material=list[i],slot=this.slots[i],current=this.bags[i];
      if(!material||!kit||!slot){if(current){current.entity.destroy();this.bags[i]=undefined;}continue;}
      if(current?.material===material)continue;
      current?.entity.destroy();
      const entity=new pc.Entity(`EB_Saco_Carrinho_${i+1}`);
      entity.addComponent('render',{meshInstances:[new pc.MeshInstance(kit.kinds[material].mesh,kit.kinds[material].material)],castShadows:false,receiveShadows:true});
      entity.setLocalPosition(0,-HALF_THICK,0);slot.addChild(entity);this.bags[i]={entity,material};
    }
  }

  /** Every frame. `driver`: the local avatar (predicted position and the way it faces), when it is the one pushing. */
  tick(dt:number,driver:CartDriver|undefined,myId:string|undefined):void {
    const model=this.model,server=this.server;if(!model||!server)return;
    const mine=!!myId&&server.pusher===myId&&!!driver;
    if(mine){
      if(!this.pushing){this.pushing=true;}
      const before=`${this.shown.x}|${this.shown.z}|${this.shown.yaw}`;
      stepCart(this.shown,driver!,dt);
      if(Math.hypot(this.shown.x-server.x,this.shown.z-server.z)>SNAP)Object.assign(this.shown,{x:server.x,y:server.y,z:server.z,yaw:server.yaw});
      if(before!==`${this.shown.x}|${this.shown.z}|${this.shown.yaw}`)this.app.renderNextFrame=true;
    }else{
      this.pushing=false;
      const gap=Math.hypot(server.x-this.shown.x,server.z-this.shown.z),turn=Math.atan2(Math.sin(server.yaw-this.shown.yaw),Math.cos(server.yaw-this.shown.yaw));
      if(gap>SNAP*2)Object.assign(this.shown,{x:server.x,y:server.y,z:server.z,yaw:server.yaw});
      else if(gap>.001||Math.abs(turn)>.001||Math.abs(server.y-this.shown.y)>.001){
        const k=1-Math.exp(-Math.min(dt,.1)*14);
        this.shown.x+=(server.x-this.shown.x)*k;this.shown.z+=(server.z-this.shown.z)*k;this.shown.y+=(server.y-this.shown.y)*k;this.shown.yaw+=turn*k;
        this.app.renderNextFrame=true;
      }
    }
    model.setPosition(this.shown.x,this.shown.y,this.shown.z);model.setEulerAngles(0,this.shown.yaw*RAD_TO_DEG,0);model.enabled=true;
  }
  hide():void {if(this.model)this.model.enabled=false;}
  /** The room has lost the plant (the player left its range): the next message starts from the room's pose. */
  forget():void {this.server=undefined;this.seeded=false;this.pushing=false;this.draw();if(this.model)this.model.enabled=false;}
  destroy():void {this.disposed=true;this.model?.destroy();this.model=undefined;this.slots=[];this.bags=[];}
}
