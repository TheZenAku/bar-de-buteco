import * as pc from 'playcanvas';
import type {EnvironmentLighting} from './environment-lighting';

const BASE=import.meta.env.BASE_URL;
interface FarmLeaf {
  no:string;tipo:'giratoria'|'correr'|'enrolar';origem_jogo_xyz:[number,number,number];
  angulo_fechada_graus?:number;angulo_aberta_graus?:number;curso_m?:number;eixo_deslize_jogo?:[number,number,number];
}
interface LeafState {leaf:FarmLeaf;entity:pc.Entity;base:pc.Vec3;open:number;target:number;centre:pc.Vec3;trigger:number;seconds:number;}
/** How near (m) somebody has to be for a leaf to open, and how long it takes to run its whole way (s). */
const TUNING:Record<string,{radius:number;seconds:number;lead?:number}>={
  FA_Portao_Correr:{radius:11,seconds:7,lead:4.3},FA_Portao_Doca:{radius:7,seconds:5},
  FA_Porta_Pedestre:{radius:3.2,seconds:.9,lead:.6},FA_Porta_Entrada:{radius:3.2,seconds:.9,lead:.6},FA_Porta_Manutencao:{radius:2.8,seconds:.9,lead:.6},
  FA_Porta_Expedicao_E:{radius:4.2,seconds:1.4,lead:.8},FA_Porta_Expedicao_D:{radius:4.2,seconds:1.4,lead:.8},
  FA_Porta_Escritorio:{radius:2.5,seconds:.85,lead:.5},FA_Porta_Deposito:{radius:2.5,seconds:.85,lead:.5},FA_Porta_Banheiro:{radius:2.3,seconds:.85,lead:.5},FA_Porta_Copa:{radius:2.3,seconds:.85,lead:.5},
  FA_Porta_Blindada:{radius:2.6,seconds:1.6,lead:.55},FA_Porta_Diretoria:{radius:2.3,seconds:.8,lead:.45},FA_Porta_Reuniao:{radius:2.3,seconds:.8,lead:.45},FA_Porta_CFTV:{radius:2.3,seconds:.85,lead:.45},
};
const HYSTERESIS=2.5;

/**
 * FARM DE ARMAS (RIBEIRO USINAGEM, sector S07_00): the gate, the doors and the dock shutter come in their own model
 * (public/farm, tools/assets/import-farm.mjs), exported SHUT. Each leaf opens as somebody comes near and shuts when they leave.
 * Nothing here touches the world's physics: the leaves' collision boxes are in farm_armas_portas.json for the server to switch on.
 */
export class FarmGates {
  private readonly root=new pc.Entity('FarmGates');
  private asset?:pc.Asset;
  private leaves:LeafState[]=[];
  private disposed=false;
  constructor(private readonly app:pc.AppBase,parent:pc.Entity,private readonly environment?:EnvironmentLighting){
    parent.addChild(this.root);
    void this.load();
  }
  private async load():Promise<void> {
    try{
      const data=await (await fetch(`${BASE}farm/farm_armas_portas.json`)).json() as {folhas:FarmLeaf[]};
      const asset=new pc.Asset('FA dinamicos','container',{url:`${BASE}farm/farm_armas_dinamicos.glb`});
      this.app.assets.add(asset);
      await new Promise<void>(resolve=>{asset.ready(()=>resolve());asset.once('error',()=>resolve());this.app.assets.load(asset);});
      if(this.disposed||!asset.resource){if(!this.disposed)this.app.assets.remove(asset);return;}
      this.asset=asset;
      const model=(asset.resource as pc.ContainerResource).instantiateRenderEntity({castShadows:false});this.root.addChild(model);
      for(const render of model.findComponents('render') as pc.RenderComponent[]){
        render.receiveShadows=true;
        for(const instance of render.meshInstances)if(instance.material instanceof pc.StandardMaterial)this.environment?.dressMetal(instance.material);
      }
      for(const leaf of data.folhas){
        const entity=model.find((node:pc.GraphNode)=>node.name===leaf.no)[0] as pc.Entity|undefined;if(!entity)continue;
        const tuning=TUNING[leaf.no]??{radius:3,seconds:1,lead:0},base=entity.getLocalPosition().clone();
        const centre=base.clone();
        if(leaf.eixo_deslize_jogo&&tuning.lead)centre.add(new pc.Vec3(...leaf.eixo_deslize_jogo).mulScalar(tuning.lead));
        else if(leaf.tipo==='giratoria')centre.add(new pc.Vec3(0,0,0));
        this.leaves.push({leaf,entity,base,open:0,target:0,centre,trigger:tuning.radius,seconds:tuning.seconds});
      }
    }catch{/* the farm without moving leaves is still a farm: they stay shut */}
  }
  /** Every frame, with where the player (or the camera) is. */
  update(dt:number,x:number,z:number):void {
    for(const s of this.leaves){
      const away=Math.hypot(s.centre.x-x,s.centre.z-z);
      s.target=away<s.trigger?1:away>s.trigger+HYSTERESIS?0:s.target;
      const gap=s.target-s.open;if(Math.abs(gap)<1e-4)continue;
      s.open+=Math.sign(gap)*Math.min(Math.abs(gap),dt/s.seconds);
      const eased=s.open*s.open*(3-2*s.open),leaf=s.leaf;
      if(leaf.tipo==='giratoria'){
        const closed=leaf.angulo_fechada_graus??0,opened=leaf.angulo_aberta_graus??90;
        s.entity.setLocalEulerAngles(0,closed+(opened-closed)*eased,0);
      }else if(leaf.eixo_deslize_jogo){
        const d=leaf.eixo_deslize_jogo,travel=(leaf.curso_m??0)*eased;
        s.entity.setLocalPosition(s.base.x+d[0]*travel,s.base.y+d[1]*travel,s.base.z+d[2]*travel);
      }
    }
  }
  destroy():void {
    this.disposed=true;
    this.root.destroy();
    if(this.asset){this.asset.unload();this.app.assets.remove(this.asset);this.asset=undefined;}
    this.leaves=[];
  }
}
