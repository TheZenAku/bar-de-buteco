import * as pc from 'playcanvas';
import type {Position} from '@bar/shared';

type Slot={marker:string;material:string;quantity:number;capacity:number};
type MarkerMap=Record<string,{xyz_jogo:[number,number,number]}>;

/** One render entity per storage slot; quantity changes its height instead of spawning bags. */
export class FactoryVisuals {
  private root=new pc.Entity('EMPRESA_BRASIL_Dinamico');private slots=new Map<string,pc.Entity>();private materials=new Map<string,pc.StandardMaterial>();private alarm?:pc.Entity;private last?:Position;
  constructor(private app:pc.Application,private markers:MarkerMap){app.root.addChild(this.root);for(const [kind,color] of Object.entries({MALTE:new pc.Color(.68,.46,.23),MIX:new pc.Color(.22,.55,.72),PRODUTO:new pc.Color(.92,.9,.75)})){const material=new pc.StandardMaterial();material.diffuse=color;material.gloss=.15;material.update();this.materials.set(kind,material);}const point=markers.Ponto_EB_Painel?.xyz_jogo;if(point){this.alarm=new pc.Entity('EB_Alarme');this.alarm.setPosition(...point);this.alarm.addComponent('light',{type:'omni',color:new pc.Color(1,.03,.02),intensity:2,range:8,castShadows:false});this.root.addChild(this.alarm);}}
  update(slots:Slot[],alarm:boolean,lowQuality:boolean):void {for(const slot of slots){let entity=this.slots.get(slot.marker);if(!entity){const point=this.markers[slot.marker]?.xyz_jogo;if(!point)continue;entity=new pc.Entity(`EB_${slot.marker}`);entity.addComponent('render',{type:'box',castShadows:!lowQuality,receiveShadows:true});entity.render!.meshInstances[0]!.material=this.materials.get(slot.material)!;entity.setPosition(point[0],point[1]+.05,point[2]);this.root.addChild(entity);this.slots.set(slot.marker,entity);}const ratio=slot.capacity?slot.quantity/slot.capacity:0;entity.enabled=ratio>0&&this.visible(entity.getPosition());entity.setLocalScale(1.05,Math.max(.02,ratio*1.45),.85);entity.setPosition(entity.getPosition().x,this.markers[slot.marker]!.xyz_jogo[1]+ratio*.72,entity.getPosition().z);}if(this.alarm)this.alarm.enabled=alarm&&!lowQuality;this.app.renderNextFrame=true;}
  position(position:Position):void {this.last=position;}
  private visible(point:pc.Vec3):boolean{return !this.last||Math.hypot(point.x-this.last.x,point.z-this.last.z)<90;}
  destroy():void {this.root.destroy();for(const material of this.materials.values())material.destroy();}
}
