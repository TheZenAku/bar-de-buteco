import * as pc from 'playcanvas';
import {RIBEIRO_ASSEMBLY,RIBEIRO_CUTTERS,RIBEIRO_DRILLS,RIBEIRO_MACHINING,RIBEIRO_PREP,RIBEIRO_SHELF,type RibeiroSpotId,type RibeiroView} from '@bar/shared';
import {assignAnimationClips} from '../engine/animation-tracks';

type Kind='preparation'|'cut'|'machining'|'drill'|'assembly'|'stock';
export type RibeiroMaterials=Record<'metal'|'dark'|'polymer'|'accent',pc.StandardMaterial>;
const makeMaterial=(name:string,color:pc.Color,metalness:number,gloss:number):pc.StandardMaterial=>{const material=new pc.StandardMaterial();material.name=name;material.diffuse=color;material.metalness=metalness;material.gloss=gloss;material.update();return material;};
/** The stand-in palette (brushed steel, dark jig, graphite polymer, safety green): the stations and the part in the hands share it. */
export const createRibeiroMaterials=():RibeiroMaterials=>({metal:makeMaterial('Aço provisório',new pc.Color(.35,.42,.43),.65,.55),dark:makeMaterial('Gabarito provisório',new pc.Color(.055,.075,.07),.15,.8),polymer:makeMaterial('Polímero provisório',new pc.Color(.12,.16,.15),.05,.75),accent:makeMaterial('Identificação provisória',new pc.Color(.2,.83,.61),.15,.45)});
export const addRibeiroPart=(parent:pc.Entity,name:string,type:'box'|'cylinder'|'sphere',at:[number,number,number],scale:[number,number,number],material:pc.StandardMaterial):pc.Entity=>{const entity=new pc.Entity(name);entity.addComponent('render',{type,material,castShadows:true,receiveShadows:true});entity.setLocalPosition(...at);entity.setLocalScale(...scale);parent.addChild(entity);return entity;};
type Clip='Idle'|'Operate';
interface Placeholder {root:pc.Entity;moving:pc.Entity;baseY:number;kind:Kind;/** The authored GLB once loaded; `moving` (the procedural geometry) is then hidden. */model?:pc.Entity;clip?:Clip;working:boolean}
/** What the graphics settings allow: the low preset keeps every model visible but plays no clip and casts no shadow. */
export interface PlaceholderQuality {animate:boolean;shadows:boolean}
/** Published by tools/assets/import-ribeiro-placeholders.mjs (npm run assets:ribeiro) from the Blender scene PROPS FA_ARMAS (scripts/97_ribeiro_placeholders.py). */
const GLB_DIR='farm/placeholders/',GLB_VERSION='20261113-3';
/** The procedural base's underside stood 0.13 m under the root (box at y -0.08, 0.10 tall): the GLB's tray floor (its y 0) takes that place, so nothing moves. */
const GLB_FLOOR=-.13;

/** Stable node names and intended assets. A generated GLB can replace each procedural root without changing gameplay. */
export const RIBEIRO_PLACEHOLDER_SPECS={
  preparation:{node:'RB_PH_PREPARACAO',asset:'ribeiro_preparacao_blank.glb',description:'bandeja com tarugos, chapas, molas e polímero separados'},
  cut:{node:'RB_PH_CORTE',asset:'ribeiro_peca_cortada.glb',description:'blank metálico preso em gabarito de corte com pequenas aparas'},
  machining:{node:'RB_PH_USINAGEM',asset:'ribeiro_peca_usinagem.glb',description:'corpo metálico semi-usinado preso em uma morsa CNC'},
  drill:{node:'RB_PH_FURACAO_ACABAMENTO',asset:'ribeiro_peca_furacao.glb',description:'corpo furado em gabarito, com ferramenta de rebarbação ao lado'},
  assembly:{node:'RB_PH_MONTAGEM',asset:'ribeiro_kit_montagem.glb',description:'arma desmontada em bandeja técnica, sem munição'},
  stock:{node:'RB_PH_PRODUTO_FINAL',asset:'ribeiro_arma_final_caixa.glb',description:'arma final descarregada em berço de transporte industrial'},
} as const;

const kindOf=(id:string):Kind=>id===RIBEIRO_PREP.id?'preparation':id===RIBEIRO_SHELF.id?'stock':id.startsWith('cut-')?'cut':id.startsWith('machine-')?'machining':id.startsWith('drill-')?'drill':'assembly';

/** Temporary animated workpieces for every Ribeiro task, replaced later by authored GLBs. */
export class RibeiroPlaceholders {
  private readonly root=new pc.Entity('RIBEIRO_Placeholders');
  private readonly items=new Map<RibeiroSpotId,Placeholder>();
  private readonly containers=new Map<Kind,pc.ContainerResource>();
  private time=0;private guide?:RibeiroSpotId;private view?:RibeiroView;private destroyed=false;private qualityKey='';
  private readonly materials:RibeiroMaterials;

  constructor(private readonly app:pc.Application,private readonly quality:()=>PlaceholderQuality=()=>({animate:true,shadows:true})){
    this.materials=createRibeiroMaterials();
    app.root.addChild(this.root);
    for(const spot of [RIBEIRO_PREP,...RIBEIRO_CUTTERS,...RIBEIRO_MACHINING,...RIBEIRO_DRILLS,...RIBEIRO_ASSEMBLY,RIBEIRO_SHELF])this.make(spot);
    this.load();
  }
  private part(parent:pc.Entity,name:string,type:'box'|'cylinder'|'sphere',at:[number,number,number],scale:[number,number,number],material:pc.StandardMaterial):pc.Entity {return addRibeiroPart(parent,name,type,at,scale,material);}
  private make(spot:{id:RibeiroSpotId;x:number;y:number;z:number;rotation:number}):void {
    const kind=kindOf(spot.id),spec=RIBEIRO_PLACEHOLDER_SPECS[kind],root=new pc.Entity(`${spec.node}_${spot.id}`),moving=new pc.Entity(`${spec.node}_MOVEL`);
    root.setPosition(spot.x,spot.y+.48,spot.z);root.setEulerAngles(0,spot.rotation*180/Math.PI,0);root.addChild(moving);this.root.addChild(root);
    this.part(moving,'Base técnica','box',[0,-.08,0],[.72,.10,.48],this.materials.dark);
    if(kind==='preparation'){this.part(moving,'Chapa bruta','box',[-.16,.03,0],[.34,.06,.24],this.materials.metal);this.part(moving,'Tarugo bruto','cylinder',[.18,.06,0],[.08,.32,.08],this.materials.metal).setLocalEulerAngles(0,0,90);}
    else if(kind==='cut'){this.part(moving,'Blank cortado','box',[0,.04,0],[.46,.08,.18],this.materials.metal);this.part(moving,'Linha de corte','box',[.08,.095,0],[.025,.015,.19],this.materials.accent);}
    else if(kind==='machining'){this.part(moving,'Morsa esquerda','box',[-.22,.06,0],[.16,.18,.32],this.materials.dark);this.part(moving,'Morsa direita','box',[.22,.06,0],[.16,.18,.32],this.materials.dark);this.part(moving,'Corpo semi-usinado','box',[0,.12,0],[.30,.10,.18],this.materials.metal);}
    else if(kind==='drill'){this.part(moving,'Peça furada','box',[0,.04,0],[.42,.08,.22],this.materials.metal);for(const x of [-.12,0,.12])this.part(moving,`Furo ${x}`,'cylinder',[x,.095,0],[.025,.015,.025],this.materials.dark);}
    else if(kind==='assembly'){this.part(moving,'Corpo da arma','box',[0,.04,0],[.46,.09,.15],this.materials.metal);this.part(moving,'Conjunto polímero','box',[.12,.13,.10],[.16,.16,.12],this.materials.polymer);this.part(moving,'Mola','cylinder',[-.20,.11,-.12],[.025,.24,.025],this.materials.accent).setLocalEulerAngles(0,0,90);}
    else {this.part(moving,'Berço','box',[0,.02,0],[.60,.10,.32],this.materials.polymer);this.part(moving,'Produto final provisório','box',[0,.10,0],[.48,.08,.14],this.materials.metal);}
    root.enabled=false;this.items.set(spot.id,{root,moving,baseY:root.getPosition().y,kind,working:false});
  }
  /** Each GLB loads on its own: a failure leaves that kind's procedural stand-in on screen and never touches the other five. */
  private load():void {
    for(const kind of Object.keys(RIBEIRO_PLACEHOLDER_SPECS) as Kind[]){
      const asset=RIBEIRO_PLACEHOLDER_SPECS[kind].asset;
      this.app.assets.loadFromUrl(`${import.meta.env.BASE_URL}${GLB_DIR}${asset}?v=${GLB_VERSION}`,'container',(error,loaded)=>{
        if(this.destroyed)return;
        if(error||!loaded){console.warn(`Placeholder ${asset} indisponível; fica a geometria provisória.`,error);return;}
        try{this.containers.set(kind,loaded.resource as pc.ContainerResource);for(const item of this.items.values())if(item.kind===kind)this.attach(item);}
        catch(failure){console.warn(`Placeholder ${asset} inválido; fica a geometria provisória.`,failure);this.containers.delete(kind);for(const item of this.items.values())if(item.kind===kind)this.detach(item);}
      });
    }
  }
  private attach(item:Placeholder):void {
    const container=this.containers.get(item.kind);if(!container||item.model)return;
    const model=container.instantiateRenderEntity({castShadows:true,receiveShadows:true});
    // The GLB's front is glTF +Z while the spot's rotation looks at the machine: the tray turns its face to the worker.
    // The shelf's spot is against the rack: a ray audit of the map put a quarter of the case inside FA_Rack_Barras until it stepped 0.25 m back toward the worker.
    model.setLocalPosition(0,GLB_FLOOR,item.kind==='stock'?-.25:0);model.setLocalEulerAngles(0,180,0);
    const tracks=container.animations.map(asset=>asset.resource as pc.AnimTrack);
    if(tracks.length){model.addComponent('anim',{activate:true});assignAnimationClips(model.anim!,tracks.map(track=>({name:track.name,track,loop:true})));}
    item.root.addChild(model);item.moving.enabled=false;item.model=model;item.clip=undefined;this.qualityKey='';this.applyQuality();this.play(item);
  }
  /** A half-built model goes away and the procedural stand-in comes back. */
  private detach(item:Placeholder):void {item.model?.destroy();item.model=undefined;item.clip=undefined;item.moving.enabled=true;}
  /** Idle while a station waits, Operate while an order is on it. */
  private play(item:Placeholder):void {
    const anim=item.model?.anim,clip:Clip=item.working?'Operate':'Idle';
    if(!anim||!anim.enabled||item.clip===clip)return;
    anim.baseLayer?.transition(clip,item.clip?.2:0);item.clip=clip;
  }
  /** The low preset freezes the clips and drops the shadows but keeps every model visible. */
  private applyQuality():void {
    const quality=this.quality(),key=`${quality.animate}|${quality.shadows}`;
    if(key===this.qualityKey)return;this.qualityKey=key;
    for(const item of this.items.values()){
      const model=item.model;if(!model)continue;
      if(model.anim)model.anim.enabled=quality.animate;
      for(const render of model.findComponents('render') as pc.RenderComponent[])render.castShadows=quality.shadows;
      item.clip=undefined;this.play(item);
    }
  }
  set(view:RibeiroView|undefined,guide:RibeiroSpotId|undefined):void {this.view=view;this.guide=guide;this.refresh();}
  private refresh():void {
    // An order in a `to-…` state is in somebody's hands, no longer on the machine it came from.
    const occupied=new Set(this.view?.orders.filter(order=>!['completed','cancelled','queued'].includes(order.status)&&!order.status.startsWith('to-')&&order.stationId).map(order=>order.stationId)??[]);
    const queued=!!this.view?.orders.some(order=>order.status==='queued'),stock=Object.values(this.view?.stock??{}).some(quantity=>(quantity??0)>0);
    for(const [id,item] of this.items){item.root.enabled=id===this.guide||occupied.has(id)||(id===RIBEIRO_PREP.id&&queued)||(id===RIBEIRO_SHELF.id&&stock);item.working=occupied.has(id);this.play(item);}
  }
  frame(dt:number):void {this.time+=Math.min(.05,Math.max(0,dt));this.applyQuality();for(const item of this.items.values()){if(!item.root.enabled||item.model)continue;const wave=Math.sin(this.time*(item.kind==='machining'?8:item.kind==='drill'?6:3));item.root.setPosition(item.root.getPosition().x,item.baseY+(item.kind==='drill'?Math.max(0,wave)*.035:wave*.012),item.root.getPosition().z);if(item.kind==='machining')item.moving.setLocalEulerAngles(0,wave*2.5,0);else if(item.kind==='cut')item.moving.setLocalPosition(wave*.025,0,0);else if(item.kind==='assembly')item.moving.setLocalScale(1-wave*.018,1,1-wave*.018);else if(item.kind==='stock')item.moving.setLocalScale(1+wave*.025,1+wave*.025,1+wave*.025);}}
  dispose():void {this.destroyed=true;this.root.destroy();for(const material of Object.values(this.materials))material.destroy();this.items.clear();this.containers.clear();}
}
