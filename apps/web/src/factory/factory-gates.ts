import * as pc from 'playcanvas';
import {FACTORY_GATES,FACTORY_INTERCOM,gateEase,gateOpenness,gateSide,type FactoryGate} from '@bar/shared/factory';
import type {EnvironmentLighting} from '../engine/environment-lighting';

const BASE=import.meta.env.BASE_URL;
/** A leaf's synced door state, as the room sends it (the doors map of the world state). */
export interface GateDoorState {open:boolean;changedAt:number;side?:number}
interface LeafState {gate:FactoryGate;entity:pc.Entity;base:pc.Vec3;scale:pc.Vec3;/** The pose last applied (eased position and side), so a settled leaf costs nothing. */drawn?:string}
/** Where the intercom's lamp sits relative to Ponto_EB_Interfone (m), from the Blender scene: the v6.8 GLB exports the lamp node at the origin, so the node is put here when it comes that way. */
const LAMP_FROM_MARKER:readonly [number,number,number]=[-.448,1.285,0];
const LAMP_QUIET=new pc.Color(.1,.8,.25);

/**
 * EMPRESA BRASIL's dynamic leaves (gates, doors and the roller shutter of shared/factory/gates.ts) and the vehicle gate's intercom lamp: they come in
 * public/fabrica/empresa_brasil_portoes.glb, exported SHUT (the rails, guides, frames and the intercom's post are part of the sector). Nothing is decided
 * here: the room publishes each leaf's state in the synced doors under the leaf's name, and a leaf's pose is a function of that state and the room's
 * clock (`gateOpenness`, the same the room and the browser's prediction use for the leaf's collision box), so what you see is where the box is.
 * A slide moves the node along its axis, a swing door turns about +Y (the node's origin is the hinge), a roller shutter scales in Y (its origin is the top).
 * The lamp's emissive colour is the only thing changed on the intercom: steady green while quiet, an amber pulse while a visitor calls.
 */
export class FactoryGates {
  private readonly root=new pc.Entity('FactoryGates');
  private asset?:pc.Asset;
  private leaves:LeafState[]=[];
  private lamp?:{material:pc.StandardMaterial;shown:string};
  private ringing=false;
  private disposed=false;
  constructor(private readonly app:pc.AppBase,parent:pc.Entity,private readonly environment?:EnvironmentLighting){
    parent.addChild(this.root);
    void this.load();
  }
  private async load():Promise<void> {
    try{
      const asset=new pc.Asset('EB portoes','container',{url:`${BASE}fabrica/empresa_brasil_portoes.glb`});
      this.app.assets.add(asset);
      await new Promise<void>(resolve=>{asset.ready(()=>resolve());asset.once('error',()=>resolve());this.app.assets.load(asset);});
      if(this.disposed||!asset.resource){if(!this.disposed)this.app.assets.remove(asset);return;}
      this.asset=asset;
      const model=(asset.resource as pc.ContainerResource).instantiateRenderEntity({castShadows:false});this.root.addChild(model);
      for(const render of model.findComponents('render') as pc.RenderComponent[]){
        render.receiveShadows=true;
        for(const instance of render.meshInstances)if(instance.material instanceof pc.StandardMaterial)this.environment?.dressMetal(instance.material);
      }
      const named=(name:string)=>model.find((node:pc.GraphNode)=>node.name===name)[0] as pc.Entity|undefined;
      for(const gate of FACTORY_GATES){
        const entity=named(gate.id);
        if(!entity){console.warn(`[fábrica] ${gate.id} não achado em empresa_brasil_portoes.glb.`);continue;}
        this.leaves.push({gate,entity,base:entity.getLocalPosition().clone(),scale:entity.getLocalScale().clone()});
      }
      this.loadLamp(named(FACTORY_INTERCOM.lamp));
    }catch{/* the plant without moving leaves is still a plant: the leaves stay where they were exported (shut) */}
  }
  /** The lamp's own material (the rest of the GLB shares the palette's), recoloured by `paintLamp`. */
  private loadLamp(entity?:pc.Entity):void {
    const instance=entity?.render?.meshInstances[0];
    if(!entity||!instance||!(instance.material instanceof pc.StandardMaterial))return;
    const here=entity.getPosition();
    if(Math.hypot(here.x,here.z)<1)entity.setPosition(FACTORY_INTERCOM.x+LAMP_FROM_MARKER[0],FACTORY_INTERCOM.y+LAMP_FROM_MARKER[1],FACTORY_INTERCOM.z+LAMP_FROM_MARKER[2]);
    const material=instance.material.clone();material.emissiveMap=null;material.emissiveIntensity=2.5;material.update();
    instance.material=material;this.lamp={material,shown:''};
    this.paintLamp();
  }
  /** Whether a visitor is calling at the intercom. */
  setRinging(on:boolean):void {this.ringing=on;}
  private paintLamp():void {
    const lamp=this.lamp;if(!lamp)return;
    const pulse=this.ringing&&Math.sin(performance.now()/1000*9)>0,key=this.ringing?(pulse?'on':'off'):'quiet';
    if(lamp.shown===key)return;
    lamp.shown=key;
    if(!this.ringing)lamp.material.emissive.copy(LAMP_QUIET);else if(pulse)lamp.material.emissive.set(1,.55,.05);else lamp.material.emissive.set(.15,.08,0);
    lamp.material.update();
  }
  /** Every frame, with the room's door states (undefined before the first state arrives) and the room's time (ms). */
  update(doors:Record<string,GateDoorState>|undefined,now:number):void {
    this.paintLamp();
    if(!doors)return;
    for(const leaf of this.leaves){
      const state=doors[leaf.gate.id];if(!state)continue;
      this.place(leaf,gateEase(gateOpenness(leaf.gate,state,now)),gateSide(state));
    }
  }
  private place(leaf:LeafState,eased:number,side:1|-1):void {
    const key=`${Math.round(eased*2000)}:${side}`;if(leaf.drawn===key)return;
    leaf.drawn=key;
    const {gate,entity,base,scale}=leaf;
    if(gate.kind==='correr'){const travel=gate.travel*eased,d=gate.axis;entity.setLocalPosition(base.x+d[0]*travel,base.y+d[1]*travel,base.z+d[2]*travel);}
    else if(gate.kind==='giratoria')entity.setLocalEulerAngles(0,side*gate.angle*eased,0);
    else entity.setLocalScale(scale.x,scale.y*(1+(gate.openScale-1)*eased),scale.z);
  }
  destroy():void {
    this.disposed=true;
    this.root.destroy();
    if(this.asset){this.asset.unload();this.app.assets.remove(this.asset);this.asset=undefined;}
    this.leaves=[];this.lamp=undefined;
  }
}
