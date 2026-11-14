import * as pc from 'playcanvas';
import {CITY_MARKERS,floorHeight,type Position} from '@bar/shared';
import {CLEAN_S,interpolateCubicage,type CartView,type CubicPoint} from '@bar/shared/factory';
import type {FactoryView,SlotView,TankView} from './types';
import {loadBagKit,type BagKit,type BagMaterial} from './bags';
import {setFactoryCartPose,setLocalFactoryBag} from './carry';
import {PlantDirt} from './dirt';
import {FactoryCartView,type CartDriver} from './cart-view';
import type {EnvironmentLighting} from '../engine/environment-lighting';

const BASE=import.meta.env.BASE_URL;
const TANK_BOTTOM_Y=1.01;
/** The tank's useful volume (empresa_brasil_tanques.json, the cubicage table's last row). */
const TANK_MAX_L=6646;
/** Litres a kilo of dissolved solids adds (the recipe's litresPerKg) when the view does not say; the room sends `solidsKg` when it knows better. */
const LITRES_PER_KG=.65;
/** What the panel calls 100% (a full batch: the recipe's water plus its dissolved solids) is drawn this far up the tank's useful volume, so the liquid reads like the gauge: the tank itself holds several batches. */
const FULL_BATCH_FILL=.9;
/** The most the surface moves per second (m): it follows the litres smoothly, and a discarded tank drains instead of vanishing. */
const LEVEL_MAX_SPEED=.5;
/** Radians per second the agitator turns at most on screen (the real 120 rpm would strobe against the frame rate). */
const AGITATOR_MAX_RAD=5;
/** How fast a turning agitator speeds up and slows down (1/s): it stops within about a second of being switched off. */
const AGITATOR_UP=2.2,AGITATOR_DOWN=9;
/** The tank's open half (the front, towards the operator's platform) starts this far in front of its axis and ends at the rim. */
const LID_FROM=.22,LID_RADIUS=1.1,LID_Y=3.2,LID_OPEN_DEG=90;
/** The arrangement of 18 sacks (EB_Palete_Arranjo) is 1.0 m by 1.2 m; the pallets lie with the 1.2 m side along X. */
const SLOT_YAW=90;
/** The radius the level gauge sits on (the body's outer wall). The operator's platform deck is at y 2 and hides the tank's lower part (a batch's liquid is
 * well below it), so the gauge sits above the deck and reads the same fraction of a full batch the panel shows (the top is 100%, a tick every quarter). */
const GAUGE_R=1.12,GAUGE_BOTTOM=2.12,GAUGE_LENGTH=.82;
const COLD=new pc.Color(.35,.55,.85),WARM=new pc.Color(.95,.62,.28);
const KINDS:BagMaterial[]=['MALTE','MIX','PRODUTO'];
const PALLET_OUT='Ponto_EB_PA_Ensaque';

interface TankParts {
  agitator?:pc.Entity;liquid?:pc.Entity;material?:pc.StandardMaterial;level:number;target:number;radius:number;spin:number;rpm:number;temperature:number;hot:boolean;
  /** The tank's axis on the ground (x, z). */axis:{x:number;z:number};
  lid?:pc.Entity;lidAngle:number;lidTarget:number;
  /** The lid came with the tank model (EB_Tanque_N_Tampa, hinge at its origin): only turned, never moved; this is its authored pose. */lidBase?:pc.Quat;
  /** The level gauge on the tank's front (above the platform's deck): the column of liquid in it shows the litres from where the operator stands. */
  gauge?:pc.Entity;fill?:pc.Entity;fillMaterial?:pc.StandardMaterial;fillF:number;fraction:number;litres:number;
}
interface Puff {entity:pc.Entity;age:number;life:number}
/** The sacks of one kind on every shelf and pallet: one instanced draw, rebuilt when a slot changes. */
interface Stack {instance:pc.MeshInstance;entity:pc.Entity;buffer:pc.VertexBuffer;data:Float32Array;capacity:number}

const mat=new pc.Mat4(),local=new pc.Mat4(),part=new pc.Mat4(),one=new pc.Vec3(1,1,1),pop=new pc.Vec3(),spot=new pc.Quat(),yawQ=new pc.Quat().setFromEulerAngles(0,SLOT_YAW,0);

/**
 * The plant's moving parts in the scene, all driven by the room's state: the tanks' liquid level (from the cubicage table, plus
 * the dissolved solids) with a sight glass on the outside, hinged lids and agitators, steam over the hot tanks and the dryer, a
 * glow in the dryer's windows, the alarm beacon, and the sacks on their shelves (the Blender sack model, instanced: one draw
 * per kind, the quantity of each slot decides how many of the pallet's 18 positions are filled). Nothing here is
 * authoritative: it only shows what the server sent.
 */
export class FactoryVisuals {
  private root=new pc.Entity('EMPRESA_BRASIL_Dinamico');
  private slotState=new Map<string,{quantity:number;pop:number}>();
  private slotViews:SlotView[]=[];
  private stacks=new Map<BagMaterial,Stack>();
  private kit?:BagKit|null;
  private tanks:TankParts[]=[1,2,3].map(id=>({level:0,target:0,radius:0,spin:0,rpm:0,temperature:20,hot:false,lidAngle:0,lidTarget:0,fillF:0,fraction:0,litres:0,axis:{x:CITY_MARKERS[`Ponto_EB_Tanque_${id}`]?.x??0,z:(CITY_MARKERS[`Ponto_EB_Tanque_${id}`]?.z??0)-.65}}));
  private table:CubicPoint[]=[];
  private puffs:Puff[]=[];
  private beacon?:pc.Entity;private bagLight?:pc.Entity;private dryerGlow?:pc.Entity;
  private alarm:'none'|'warning'|'alarm'='none';
  private dryerHot=false;private dryerRunning=false;private baggingRunning=false;
  private clock=0;private lastPlayer?:Position;private view?:FactoryView;private lowQuality=false;private dirt?:PlantDirt;
  private disposed=false;private popping=false;
  private owned:Array<{destroy:()=>void}>=[];
  /** The metal materials given the city's reflections (environment-lighting.ts dressMetal); given back when the plant goes. */
  private dressed:pc.StandardMaterial[]=[];
  /** The platform cart (its own model, public/fabrica/empresa_brasil_carrinho.glb). */
  private cart?:FactoryCartView;

  constructor(private app:pc.Application,private environment?:EnvironmentLighting){
    app.root.addChild(this.root);
    const light=(name:string,marker:string,lift:number,color:pc.Color,range:number)=>{
      const point=CITY_MARKERS[marker];if(!point)return;
      const entity=new pc.Entity(name);entity.setPosition(point.x,point.y+lift,point.z);
      entity.addComponent('light',{type:'omni',color,intensity:0,range,castShadows:false});entity.enabled=false;this.root.addChild(entity);return entity;
    };
    this.beacon=light('EB_Giroflex','Ponto_EB_Painel',3,new pc.Color(1,.05,.02),11);
    this.bagLight=light('EB_Giroflex_Ensaque','Ponto_EB_Ensaque',3.2,new pc.Color(1,.05,.02),9);
    this.dryerGlow=light('EB_Secador_Brilho','Ponto_EB_Secador_Base',5.4,new pc.Color(1,.55,.2),7);
    this.dirt=new PlantDirt(app);this.cart=new FactoryCartView(app,this.root);
    void this.loadTanks();void this.loadTable();void this.loadBags();
    for(let i=0;i<14;i++)this.puffs.push(this.makePuff(i));
  }

  /** The agitators and liquid discs come in their own model (public/fabrica); found by name prefix, the exporter adds suffixes. */
  private async loadTanks():Promise<void> {
    const asset=new pc.Asset('EB tanques','container',{url:`${BASE}fabrica/empresa_brasil_tanques.glb`});
    this.app.assets.add(asset);
    await new Promise<void>(resolve=>{asset.ready(()=>resolve());asset.once('error',()=>resolve());this.app.assets.load(asset);});
    if(this.disposed||!asset.resource)return;
    const model=(asset.resource as pc.ContainerResource).instantiateRenderEntity({castShadows:false});this.root.addChild(model);
    // EB_Aco_Inox has no metallicFactor (glTF: fully metal) and nothing around the plant for it to reflect, so the lids came out black: it gets the same reflections as the city's metal.
    for(const render of model.findComponents('render') as pc.RenderComponent[])for(const instance of render.meshInstances)this.dress(instance.material);
    const find=(prefix:string)=>model.find((node:pc.GraphNode)=>node.name.startsWith(prefix))[0] as pc.Entity|undefined;
    let steel:pc.Material|undefined;
    this.tanks.forEach((tank,index)=>{
      tank.agitator=find(`EB_Tanque_${index+1}_Agitador`);tank.liquid=find(`EB_Tanque_${index+1}_Liquido`);
      const lid=find(`EB_Tanque_${index+1}_Tampa`);if(lid){tank.lid=lid;tank.lidBase=lid.getLocalRotation().clone();}
      steel??=tank.agitator?.render?.meshInstances[0]?.material??undefined;
      const instance=tank.liquid?.render?.meshInstances[0];
      if(instance){
        const material=(instance.material as pc.StandardMaterial).clone();material.blendType=pc.BLEND_NORMAL;material.opacity=.86;material.depthWrite=false;material.cull=pc.CULLFACE_NONE;material.update();
        instance.material=material;tank.material=material;
      }
      if(tank.liquid){const at=tank.liquid.getPosition();tank.axis={x:at.x,z:at.z};tank.liquid.enabled=false;}
    });
    this.buildFittings(steel);
    if(this.view)this.apply(this.view);
  }
  private async loadTable():Promise<void> {
    try{
      const data=await (await fetch(`${BASE}fabrica/empresa_brasil_tanques.json`)).json() as {tabela:Array<[number,number,number]>};
      this.table=data.tabela.map(([heightM,radiusM,volumeL])=>({heightM,radiusM,volumeL}));
      if(this.view)this.apply(this.view);
    }catch{/* without the table the liquid simply stays hidden */}
  }
  private async loadBags():Promise<void> {
    this.kit=await loadBagKit(this.app);
    if(this.disposed||!this.kit)return;
    if(this.view)this.syncSlots(this.view);
  }

  // ---- what the tank model lacks: a lid over its open front half and a sight glass for the level ----
  /** A flat half-disc plate (the circle's segment in front of the chord) of a given thickness, in lid space: the hinge is the chord, on the X axis, and the plate lies towards +Z. */
  private lidMesh():pc.Mesh {
    const device=this.app.graphicsDevice,t=.025,steps=28,positions:number[]=[],normals:number[]=[],uvs:number[]=[],indices:number[]=[];
    // The outline: the arc from the left corner round the front to the right corner, closed by the straight edge (the hinge).
    const outline:Array<[number,number]>=[];
    const a0=Math.asin(LID_FROM/LID_RADIUS);
    for(let i=0;i<=steps;i++){const a=Math.PI-a0-(Math.PI-2*a0)*i/steps;outline.push([Math.cos(a)*LID_RADIUS,Math.sin(a)*LID_RADIUS-LID_FROM]);}
    const add=(x:number,y:number,z:number,nx:number,ny:number,nz:number)=>{positions.push(x,y,z);normals.push(nx,ny,nz);uvs.push(x*.5+.5,z*.5+.5);return positions.length/3-1;};
    for(const [top,sign] of [[t/2,1],[-t/2,-1]] as const){
      const centre=add(0,top,(LID_RADIUS-LID_FROM)/2,0,sign,0),ring=outline.map(([x,z])=>add(x,top,z,0,sign,0));
      for(let i=0;i<ring.length-1;i++)sign>0?indices.push(centre,ring[i]!,ring[i+1]!):indices.push(centre,ring[i+1]!,ring[i]!);
      // The chord closes the fan.
      sign>0?indices.push(centre,ring.at(-1)!,ring[0]!):indices.push(centre,ring[0]!,ring.at(-1)!);
    }
    // The edge: a band round the outline.
    for(let i=0;i<outline.length;i++){
      const [x,z]=outline[i]!,[x2,z2]=outline[(i+1)%outline.length]!,dx=x2-x,dz=z2-z,len=Math.hypot(dx,dz)||1,nx=-dz/len,nz=dx/len;
      const a=add(x,t/2,z,nx,0,nz),b=add(x2,t/2,z2,nx,0,nz),c=add(x2,-t/2,z2,nx,0,nz),d=add(x,-t/2,z,nx,0,nz);
      indices.push(a,d,c,a,c,b);
    }
    const mesh=new pc.Mesh(device);mesh.setPositions(positions);mesh.setNormals(normals);mesh.setUvs(0,uvs);mesh.setIndices(indices);mesh.update();
    return mesh;
  }
  private dress(material:pc.Material|null|undefined):void {
    if(!this.environment||!(material instanceof pc.StandardMaterial)||this.dressed.includes(material))return;
    this.environment.dressMetal(material);this.dressed.push(material);
  }
  private buildFittings(steel?:pc.Material):void {
    const lidMesh=this.lidMesh();
    const metal=steel??(()=>{const m=new pc.StandardMaterial();m.diffuse=new pc.Color(.62,.64,.68);m.metalness=.8;m.gloss=.7;m.update();this.owned.push(m);return m;})();
    this.dress(metal);
    const dark=new pc.StandardMaterial();dark.diffuse=new pc.Color(.07,.08,.1);dark.gloss=.5;dark.update();
    const handleMat=new pc.StandardMaterial();handleMat.diffuse=new pc.Color(.9,.82,.2);handleMat.gloss=.4;handleMat.update();
    this.owned.push(lidMesh,dark,handleMat);
    const box=(parent:pc.Entity,material:pc.Material,size:[number,number,number],at:[number,number,number],name:string)=>{
      const e=new pc.Entity(name);e.addComponent('render',{type:'box',material,castShadows:false,receiveShadows:false});e.setLocalScale(...size);e.setLocalPosition(...at);parent.addChild(e);return e;
    };
    this.tanks.forEach((tank,index)=>{
      const id=index+1;
      // The lid: hinged along the chord (the tank's middle line, like the fixed half beside it); a flat plate (the stainless of the tank itself) with a handle bar on its free edge and two hinge knuckles.
      if(tank.lid)return this.buildGauge(tank,id,dark);
      const lid=new pc.Entity(`EB_Tampa_${id}`),free=LID_RADIUS-LID_FROM-.11;
      const plate=new pc.Entity(`EB_Tampa_${id}_Placa`);
      plate.addComponent('render',{meshInstances:[new pc.MeshInstance(lidMesh,metal)],castShadows:!this.lowQuality,receiveShadows:true});lid.addChild(plate);
      box(lid,handleMat,[.46,.045,.045],[0,.055,free],`EB_Tampa_${id}_Puxador`);
      box(lid,handleMat,[.045,.05,.045],[-.2,.03,free],`EB_Tampa_${id}_Pe1`);box(lid,handleMat,[.045,.05,.045],[.2,.03,free],`EB_Tampa_${id}_Pe2`);
      box(lid,dark,[.16,.06,.1],[-.45,0,.04],`EB_Tampa_${id}_Dobradica1`);box(lid,dark,[.16,.06,.1],[.45,0,.04],`EB_Tampa_${id}_Dobradica2`);
      this.root.addChild(lid);tank.lid=lid;this.poseLid(tank);
      this.buildGauge(tank,id,dark);
    });
  }
  private buildGauge(tank:TankParts,id:number,dark:pc.StandardMaterial):void {
    const box=(parent:pc.Entity,material:pc.Material,size:[number,number,number],at:[number,number,number],name:string)=>{
      const e=new pc.Entity(name);e.addComponent('render',{type:'box',material,castShadows:false,receiveShadows:false});e.setLocalScale(...size);e.setLocalPosition(...at);parent.addChild(e);return e;
    };
    {
      // The level gauge: a dark backing, the liquid column, and a tick at each quarter. It hugs the body to the left of the label, turned to face out from the tank's axis.
      const gauge=new pc.Entity(`EB_Visor_${id}`),dx=-.62,dz=Math.sqrt(GAUGE_R*GAUGE_R-dx*dx),bottom=GAUGE_BOTTOM,length=GAUGE_LENGTH;
      gauge.setPosition(tank.axis.x+dx,0,tank.axis.z+dz);gauge.setLocalEulerAngles(0,Math.atan2(dx,dz)*57.2958,0);this.root.addChild(gauge);tank.gauge=gauge;
      box(gauge,dark,[.21,length+.1,.03],[0,bottom+length/2,.0],`EB_Visor_${id}_Fundo`);
      const fillMat=new pc.StandardMaterial();fillMat.diffuse=new pc.Color(.9,.6,.28);fillMat.emissive=new pc.Color(.18,.12,.05);fillMat.gloss=.7;fillMat.update();this.owned.push(fillMat);
      const fill=box(gauge,fillMat,[.12,1,.04],[0,bottom,.03],`EB_Visor_${id}_Nivel`);fill.enabled=false;tank.fill=fill;tank.fillMaterial=fillMat;
      const tick=new pc.StandardMaterial();tick.diffuse=new pc.Color(.95,.95,.95);tick.emissive=new pc.Color(.5,.5,.5);tick.update();this.owned.push(tick);
      for(let i=0;i<=4;i++)box(gauge,tick,[.18,.014,.045],[0,bottom+length*i/4,.03],`EB_Visor_${id}_Marca${i}`);
      box(gauge,dark,[.24,.05,.06],[0,bottom-.03,.01],`EB_Visor_${id}_Base`);box(gauge,dark,[.24,.05,.06],[0,bottom+length+.03,.01],`EB_Visor_${id}_Topo`);
    }
  }
  private poseLid(tank:TankParts):void {
    if(!tank.lid)return;
    if(tank.lidBase){tank.lid.setLocalRotation(tank.lidBase.clone().mul(new pc.Quat().setFromEulerAngles(-tank.lidAngle,0,0)));return;}
    tank.lid.setPosition(tank.axis.x,LID_Y,tank.axis.z+LID_FROM);
    tank.lid.setLocalEulerAngles(-tank.lidAngle,0,0);
  }

  /** A soft grey puff that rises, grows and fades; reused forever. */
  private makePuff(index:number):Puff {
    const entity=new pc.Entity(`EB_Vapor_${index}`);
    const material=new pc.StandardMaterial();material.useLighting=false;material.useFog=false;material.diffuse.set(0,0,0);material.emissive.set(.92,.94,.97);
    material.opacity=0;material.blendType=pc.BLEND_NORMAL;material.depthWrite=false;material.update();
    entity.addComponent('render',{type:'sphere',material,castShadows:false,receiveShadows:false});entity.enabled=false;this.root.addChild(entity);
    return {entity,age:Math.random()*4,life:3.5+Math.random()*1.5};
  }

  /** A new state arrived: set what each part moves towards. */
  update(view:FactoryView,lowQuality:boolean):void {
    this.view=view;this.lowQuality=lowQuality;this.apply(view);
  }
  /** The room's word on the platform cart. */
  cartMessage(view:CartView):void {this.cart?.message(view);}
  /** Where the cart is drawn now (for its ring and the avatar's hands). */
  cartPose():ReturnType<FactoryCartView['pose']> {return this.cart?.pose();}
  /** The litres in a tank: the water and what the dissolved solids add (the same number the panel shows). */
  private litres(state:TankView,bagKg:number,perKg:number):number {
    const solids=state.solidsKg??(state.malteBags+state.mixBags)*bagKg;
    return Math.max(0,state.waterL)+Math.max(0,solids)*perKg;
  }
  private apply(view:FactoryView):void {
    this.root.enabled=true;
    this.syncSlots(view);
    // 100% is a full batch of the recipe in force (it changes with the production order), as in the panel's gauge.
    const recipe=view.balance.recipe,bagKg=view.balance.bagKg||25,perKg=recipe.litresPerKg||LITRES_PER_KG;
    const fullBatch=Math.max(1,recipe.waterL+(recipe.malteBags+recipe.mixBags)*bagKg*perKg);
    view.tanks.forEach((state:TankView,index)=>{
      const tank=this.tanks[index]!,litres=this.litres(state,bagKg,perKg);
      tank.litres=litres;tank.fraction=Math.min(1.1,litres/fullBatch);tank.rpm=state.agitatorRpm;tank.temperature=state.temperatureC;tank.hot=state.temperatureC>45&&state.waterL>0;
      tank.lidTarget=state.lidOpen?LID_OPEN_DEG:0;
      if(this.table.length&&litres>0){const level=interpolateCubicage(tank.fraction*FULL_BATCH_FILL*TANK_MAX_L,this.table);tank.target=level.heightM;tank.radius=level.radiusM;}
      else tank.target=0;
    });
    this.dirt?.update(view.dirt,this.lowQuality,{clean:view.me.clean??null,dryerState:view.dryer.state,dryerStepS:view.dryer.stepS,cleanS:CLEAN_S});
    this.dryerHot=view.dryer.inletC>60;this.dryerRunning=['PRE_AQUECENDO','PRODUZINDO','RESFRIANDO'].includes(view.dryer.state);this.baggingRunning=view.bagging.state==='ENCHENDO';
    const live=view.alarms.filter(alarm=>alarm.active!==false&&!alarm.acknowledged);
    this.alarm=view.emergency||live.some(alarm=>alarm.severity==='critical'||alarm.severity==='alarm')?'alarm':live.some(alarm=>alarm.severity==='warning')?'warning':'none';
    this.app.renderNextFrame=true;
  }

  // ---- the sacks on the shelves and pallets ----
  private syncSlots(view:FactoryView):void {
    // The pallet at the bagging station's output grows with every bag stacked (the room only fills its slot when the pallet is complete).
    const slots=view.slots.map(slot=>slot.marker===PALLET_OUT&&slot.quantity===0&&view.bagging.palletBags>0?{...slot,quantity:Math.min(slot.capacity,view.bagging.palletBags)}:slot);
    this.slotViews=slots;
    if(!this.kit)return;
    this.ensureStacks(slots);
    for(const slot of slots){
      let state=this.slotState.get(slot.marker);
      if(!state){state={quantity:slot.quantity,pop:0};this.slotState.set(slot.marker,state);}
      else if(slot.quantity!==state.quantity){if(slot.quantity>state.quantity)state.pop=1;state.quantity=slot.quantity;}
    }
    for(const stack of this.stacks.values())stack.entity.render!.castShadows=!this.lowQuality;
    this.writeBags();
  }
  private ensureStacks(slots:SlotView[]):void {
    const kit=this.kit!;
    for(const material of KINDS){
      if(this.stacks.has(material))continue;
      const list=slots.filter(slot=>slot.material===material&&CITY_MARKERS[slot.marker]);if(!list.length)continue;
      const capacity=list.reduce((sum,slot)=>sum+Math.min(18,slot.capacity),0);
      const data=new Float32Array(capacity*16),device=this.app.graphicsDevice;
      const buffer=new pc.VertexBuffer(device,pc.VertexFormat.getDefaultInstancingFormat(device),capacity,{usage:pc.BUFFER_DYNAMIC,data});
      const instance=new pc.MeshInstance(kit.kinds[material].mesh,kit.kinds[material].material);instance.setInstancing(buffer);
      // Bounds of the slots (the instances' own matrices are not part of the mesh's), with room for a pallet's stack.
      const bounds=new pc.BoundingBox();let first=true;
      for(const slot of list){const at=CITY_MARKERS[slot.marker]!,box=new pc.BoundingBox(new pc.Vec3(at.x,at.y+.5,at.z),new pc.Vec3(1.2,.9,1.2));if(first){bounds.copy(box);first=false;}else bounds.add(box);}
      instance.setCustomAabb(bounds);
      const entity=new pc.Entity(`EB_Sacos_${material}`);
      entity.addComponent('render',{meshInstances:[instance],castShadows:!this.lowQuality,receiveShadows:true});entity.enabled=false;this.root.addChild(entity);
      this.stacks.set(material,{instance,entity,buffer,data,capacity});
    }
  }
  /** Writes the world matrix of every sack on every slot: the first `quantity` positions of the arrangement, the newest one pulsing. */
  private writeBags():void {
    const kit=this.kit;if(!kit)return;
    const counts=new Map<BagMaterial,number>();
    for(const slot of this.slotViews){
      const stack=this.stacks.get(slot.material),base=CITY_MARKERS[slot.marker],state=this.slotState.get(slot.marker);if(!stack||!base||!state)continue;
      const n=Math.min(18,slot.quantity,kit.arrangement.length);
      // The marker is the top of the pallet's boards; the arrangement's origin is the pallet's base.
      mat.setTRS(new pc.Vec3(base.x,base.y-kit.palletH,base.z),yawQ,one);
      for(let i=0;i<n;i++){
        const place=kit.arrangement[i]!,at=counts.get(slot.material)??0;if(at>=stack.capacity)break;
        const scale=i===n-1&&state.pop>0?1+Math.sin(state.pop*Math.PI)*.16:1;
        pop.set(scale,scale,scale);local.setTRS(place.position,place.rotation,pop);part.mul2(mat,local);
        stack.data.set(part.data,at*16);counts.set(slot.material,at+1);
      }
    }
    for(const [material,stack] of this.stacks){
      const count=counts.get(material)??0;
      stack.buffer.setData(stack.data);stack.instance.instancingCount=count;stack.entity.enabled=count>0;
    }
    this.popping=[...this.slotState.values()].some(state=>state.pop>0);
  }

  /** Every frame: levels glide, agitators turn, lids swing, steam rises, lights pulse. `player` hides what is too far to see. */
  tick(dt:number,player:Position|undefined,carrying:string|null,_localRoot?:pc.Entity,cart?:{driver?:CartDriver;myId?:string}):void {
    if(!this.view||this.disposed)return;
    this.clock+=dt;this.lastPlayer=player;
    setLocalFactoryBag(carrying==='MALTE'||carrying==='MIX'?carrying:null);
    let moving=false;
    this.tanks.forEach((tank,index)=>{
      if(tank.liquid){
        const delta=tank.target-tank.level;
        if(Math.abs(delta)>.0005){tank.level+=Math.sign(delta)*Math.min(Math.abs(delta),Math.max(.01,Math.abs(delta)*Math.min(1,dt*4)),LEVEL_MAX_SPEED*dt);moving=true;}
        tank.liquid.enabled=tank.level>.02;
        if(tank.liquid.enabled){
          tank.liquid.setPosition(tank.axis.x,TANK_BOTTOM_Y+tank.level,tank.axis.z);
          const radius=Math.max(.05,tank.radius||interpolateRadius(this.table,tank.level));tank.liquid.setLocalScale(radius,1,radius);
          // Ripples: the surface breathes while the agitator turns, and is still the moment it stops.
          if(tank.spin>.3)tank.liquid.setLocalScale(radius*(1+Math.sin(this.clock*7+index)*.012),1,radius*(1+Math.cos(this.clock*6+index)*.012));
          if(tank.material){const warmth=Math.max(0,Math.min(1,(tank.temperature-20)/45));tank.material.diffuse.lerp(COLD,WARM,warmth);tank.material.emissive.set(.04+warmth*.1,.03+warmth*.04,.02);tank.material.update();}
        }
      }
      // The gauge follows the litres (and the liquid's colour) so the level can be read from the platform.
      if(tank.fill){
        const gap=tank.fraction-tank.fillF;tank.fillF=Math.abs(gap)<.0005?tank.fraction:tank.fillF+gap*Math.min(1,dt*5);if(Math.abs(gap)>=.0005)moving=true;
        const height=Math.max(0,Math.min(1,tank.fillF))*GAUGE_LENGTH;
        tank.fill.enabled=height>.01;
        if(tank.fill.enabled){
          tank.fill.setLocalScale(.12,height,.04);tank.fill.setLocalPosition(0,GAUGE_BOTTOM+height/2,.03);
          if(tank.material&&tank.fillMaterial){tank.fillMaterial.diffuse.copy(tank.material.diffuse);tank.fillMaterial.emissive.set(tank.material.diffuse.r*.3,tank.material.diffuse.g*.3,tank.material.diffuse.b*.3);tank.fillMaterial.update();}
        }
      }
      if(tank.agitator){
        const target=tank.rpm>0?AGITATOR_MAX_RAD:0;tank.spin+=(target-tank.spin)*Math.min(1,dt*(target>tank.spin?AGITATOR_UP:AGITATOR_DOWN));
        if(target===0&&tank.spin<.2)tank.spin=0;
        if(tank.spin>.01){tank.agitator.rotateLocal(0,tank.spin*dt*57.2958,0);moving=true;}
      }
      // The lid swings with a little ease at both ends (about 0.8 s from shut to open).
      if(tank.lid){
        const gap=tank.lidTarget-tank.lidAngle;
        if(Math.abs(gap)>.05){tank.lidAngle+=Math.sign(gap)*Math.min(Math.abs(gap),Math.max(18,Math.abs(gap)*5)*dt*1.4);this.poseLid(tank);moving=true;}
        else if(gap!==0){tank.lidAngle=tank.lidTarget;this.poseLid(tank);}
      }
    });
    // Pop of a changed stack: its newest sack pulses.
    let anyPop=false;
    for(const state of this.slotState.values())if(state.pop>0){state.pop=Math.max(0,state.pop-dt*4);anyPop=true;}
    if(anyPop||this.popping){this.writeBags();moving=true;}
    // Steam over hot tanks and the dryer's chimney.
    this.puffs.forEach((puff,index)=>{
      const sourceIndex=index%4,tank=sourceIndex<3?this.tanks[sourceIndex]!:undefined;
      const emit=sourceIndex<3?!!tank?.hot&&(tank.level>.05):this.dryerRunning&&this.dryerHot;
      const material=puff.entity.render!.meshInstances[0]!.material as pc.StandardMaterial;
      if(puff.age>=puff.life){
        if(!emit||this.lowQuality){puff.entity.enabled=false;puff.age=puff.life;return;}
        puff.age=0;puff.life=3+Math.random()*2;
        const top=CITY_MARKERS.Ponto_EB_Secador_Topo,x=sourceIndex<3?tank!.axis.x:top?.x??0,y=sourceIndex<3?TANK_BOTTOM_Y+tank!.level+.2:(top?.y??8)+1.2,z=sourceIndex<3?tank!.axis.z:top?.z??0;
        puff.entity.setPosition(x+(Math.random()-.5)*.8,y,z+(Math.random()-.5)*.8);puff.entity.enabled=true;
      }
      puff.age+=dt;const t=Math.min(1,puff.age/puff.life);
      const size=(sourceIndex<3?.35:.9)+t*(sourceIndex<3?1:2.8);puff.entity.setLocalScale(size,size,size);
      const p=puff.entity.getPosition();puff.entity.setPosition(p.x+.05*dt,p.y+(sourceIndex<3?.55:1.1)*dt,p.z);
      material.opacity=(1-t)*(t<.15?t/.15:1)*(sourceIndex<3?.22:.3);material.update();moving=true;
    });
    // Beacons: a red pulse for alarms, a slower amber one for warnings; the dryer's windows glow while it works.
    const pulse=this.alarm==='alarm'?.5+.5*Math.sin(this.clock*9):.5+.5*Math.sin(this.clock*3.5);
    for(const light of [this.beacon,this.bagLight]){
      if(!light)continue;const on=this.alarm!=='none'&&!this.lowQuality&&near(player,light.getPosition(),60);
      light.enabled=on;if(on){light.light!.color=this.alarm==='alarm'?new pc.Color(1,.05,.02):new pc.Color(1,.6,.05);light.light!.intensity=.4+pulse*2.4;moving=true;}
    }
    if(this.dryerGlow){
      const on=this.dryerRunning&&this.dryerHot&&!this.lowQuality&&near(player,this.dryerGlow.getPosition(),50);
      this.dryerGlow.enabled=on;if(on){this.dryerGlow.light!.intensity=1.1+Math.sin(this.clock*2.1)*.25+Math.sin(this.clock*5.3)*.1;moving=true;}
    }
    if(this.dirt?.tick(dt))moving=true;
    this.cart?.tick(dt,cart?.driver,cart?.myId);setFactoryCartPose(this.cart?.pose()??null);
    this.root.enabled=true;
    if(moving||this.baggingRunning)this.app.renderNextFrame=true;
  }
  /** How dirty the floor or machine at a point of the plant looks right now (0..1, the displayed level, not the room's target): for footprints, sounds or prompts. */
  dirtLevelAt(x:number,z:number):number {return this.dirt?.levelAt(x,z)??0;}
  /** Out of range of the plant: nothing of it is drawn or animated. */
  /** The room stopped sending the cart (out of range): the next message starts from its pose. */
  forget():void {this.cart?.forget();}
  hide():void {this.view=undefined;this.root.enabled=false;this.dirt?.hide();setLocalFactoryBag(null);setFactoryCartPose(null);}
  destroy():void {
    this.disposed=true;setLocalFactoryBag(null);setFactoryCartPose(null);this.dirt?.destroy();this.cart?.destroy();this.root.destroy();
    for(const stack of this.stacks.values())stack.buffer.destroy();this.stacks.clear();
    for(const material of this.dressed)this.environment?.releaseMetal(material);this.dressed.length=0;
    for(const item of this.owned)item.destroy();this.owned.length=0;
  }
}

const near=(player:Position|undefined,at:pc.Vec3,range:number)=>!player||Math.hypot(player.x-at.x,player.z-at.z)<range;
function interpolateRadius(table:CubicPoint[],height:number):number {
  if(!table.length)return 1;
  for(const point of table)if(height<=point.heightM)return point.radiusM;
  return table.at(-1)!.radiusM;
}
