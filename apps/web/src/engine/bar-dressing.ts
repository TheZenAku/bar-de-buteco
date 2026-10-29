import * as pc from 'playcanvas';
import {MAP_COLLIDERS,isWalkable} from '@bar/shared';

/**
 * The bar dressed with what it sells, using the real props (light versions, tools/assets/import-drinks.mjs → <id>-decor.glb):
 * the beer fridges get a glass door with long necks, water and soda inside (the map's door had them painted on), the
 * counter's warmer gets coxinhas and pastéis (instead of the map's placeholder cones), and glasses and coffee wait on the
 * counter by the tap and the till. Everything is placed from the map itself (colliders, nodes, materials), so a new
 * map export keeps working. Props of one kind in one place are a single instanced draw; the fridges' structure is batched.
 */
type DecorItem='garrafa'|'agua'|'refrigerante'|'coxinha'|'pastel'|'copo'|'cafe';
const ITEMS:readonly DecorItem[]=['garrafa','agua','refrigerante','coxinha','pastel','copo','cafe'];
// The fridge body (05_props.py P_Geladeira_Expositor): 0.70 m wide, 0.66 m deep, from 0.08 m to 1.95 m above the floor.
const FRIDGE={halfWidth:.35,bottom:.08,top:1.95,header:1.74,shelves:[.13,.52,.91,1.30]} as const;
// What each shelf holds, bottom to top: [item, how many across, rows].
const FRIDGE_SHELVES:ReadonlyArray<readonly [DecorItem,number,number]>=[['agua',6,2],['garrafa',7,2],['garrafa',7,2],['refrigerante',6,1]];

interface Placement {item:DecorItem;position:pc.Vec3;yaw:number;group:string}

export class BarDressing {
  private readonly root=new pc.Entity('Bar dressing');
  private readonly models=new Map<DecorItem,pc.ContainerResource>();
  private readonly materials:pc.Material[]=[];
  private readonly textures:pc.Texture[]=[];
  private readonly buffers:pc.VertexBuffer[]=[];
  private batchGroup=-1;
  private destroyed=false;
  /** Resolves once everything is in place (or could not be: a missing model is skipped). */
  readonly ready:Promise<void>;

  constructor(private readonly app:pc.Application,private readonly map:pc.Entity,private readonly built?:()=>void){
    app.root.addChild(this.root);
    this.ready=Promise.all(ITEMS.map(item=>new Promise<void>(resolve=>app.assets.loadFromUrl(`${import.meta.env.BASE_URL}props/${item}-decor.glb`,'container',(error,asset)=>{
      if(error||!asset)console.warn(`Objeto de decoração "${item}" indisponível.`,error);else this.models.set(item,asset.resource as pc.ContainerResource);
      resolve();
    })))).then(()=>{if(!this.destroyed)this.build();});
  }

  private build():void {
    const placements:Placement[]=[];
    this.fridges(placements);
    this.warmer(placements);
    this.counter(placements);
    const groups=new Map<string,Placement[]>();
    for(const placement of placements){const key=`${placement.group}|${placement.item}`;groups.set(key,[...groups.get(key)??[],placement]);}
    for(const [key,list] of groups)this.instanced(key,list);
    if(this.batchGroup>=0)this.app.batcher.generate([this.batchGroup]);
    this.built?.();
  }

  /** Map materials by name: what the dressing replaces is hidden there. */
  private hide(material:string):pc.MeshInstance[] {
    const found:pc.MeshInstance[]=[];
    for(const render of this.map.findComponents('render') as pc.RenderComponent[])for(const instance of render.meshInstances)
      if(instance.material?.name===material){instance.visible=false;instance.castShadow=false;found.push(instance);}
    return found;
  }

  /** Each glass-door fridge: the painted door goes, a real one opens onto lit shelves of drinks. */
  private fridges(placements:Placement[]):void {
    const fridges=MAP_COLLIDERS.filter(c=>/^COL_Mob_Geladeira_Expositor(\.\d+)?$/.test(c.id));
    const [doors]=this.hide('Geladeira_Frente');
    if(!fridges.length||!doors)return;
    // The painted doors are one flat mesh when they all face the same way: that is the side they open on. Otherwise, the
    // side with free floor in front.
    const flat=doors.aabb.halfExtents,centre=doors.aabb.center.clone();
    for(const collider of fridges){
      const floor=collider.minY??.3;
      const [fx,fz]=flat.x<.02?[Math.sign(centre.x-collider.x)||-1,0]:flat.z<.02?[0,Math.sign(centre.z-collider.z)||-1]
        :([[-1,0],[1,0],[0,-1],[0,1]] as const).find(([x,z])=>isWalkable(collider.x+x*(collider.hx+.45),collider.z+z*(collider.hz+.45),floor))??[-1,0];
      const depth=fx?collider.hx:collider.hz,yaw=Math.atan2(fx,fz)*180/Math.PI;
      const frame=new pc.Entity(`Fridge ${collider.id}`);
      frame.setPosition(collider.x+fx*depth,floor,collider.z+fz*depth);
      // Local +Z is out of the door, +X across it.
      frame.setEulerAngles(0,yaw,0);
      this.root.addChild(frame);
      this.fridgeBody(frame,depth*2);
      const inner=depth*2-.06,group=`fridge-${floor>1?'up':'down'}`;
      FRIDGE_SHELVES.forEach(([item,across,rows],level)=>{
        const y=FRIDGE.shelves[level]!+.012;
        for(let row=0;row<rows;row++)for(let i=0;i<across-row;i++){
          const x=(i-(across-row-1)/2)*(.6/across),z=-.13-row*(inner-.26);
          const position=frame.getLocalTransform().transformPoint(new pc.Vec3(x,y,z),new pc.Vec3());
          placements.push({item,position,yaw:yaw+(Math.random()-.5)*40,group});
        }
      });
    }
  }

  /** Inside lining, shelves, door frame, glass, header and handle, in the fridge's local frame (door plane at z=0). */
  private fridgeBody(frame:pc.Entity,depth:number):void {
    const liner=this.material('liner',m=>{m.diffuse.set(.86,.9,.93);m.emissive.set(.55,.62,.68);m.emissiveIntensity=.55;m.gloss=.5;});
    const shelf=this.material('shelf',m=>{m.diffuse.set(.75,.78,.8);m.specular.set(.6,.6,.6);m.gloss=.7;});
    const dark=this.material('frame',m=>{m.diffuse.set(.08,.085,.09);m.specular.set(.3,.3,.3);m.gloss=.6;});
    const glass=this.material('glass',m=>{m.diffuse.set(.82,.9,.95);m.specular.set(1,1,1);m.gloss=.92;m.opacity=.14;m.depthWrite=false;
      // See-through without lowering the canvas's alpha (the page would show through).
      m.blendState=new pc.BlendState(true,pc.BLENDEQUATION_ADD,pc.BLENDMODE_SRC_ALPHA,pc.BLENDMODE_ONE_MINUS_SRC_ALPHA,pc.BLENDEQUATION_ADD,pc.BLENDMODE_ZERO,pc.BLENDMODE_ONE);});
    const header=this.material('header',m=>{const texture=this.headerTexture();m.diffuseMap=texture;m.emissiveMap=texture;m.emissive.set(1,1,1);m.emissiveIntensity=.45;});
    const w=FRIDGE.halfWidth,inside=depth-.04,{bottom,top,header:headerY}=FRIDGE,height=headerY-bottom;
    const box=(name:string,material:pc.StandardMaterial,centre:[number,number,number],size:[number,number,number],shadows=false)=>{
      const entity=new pc.Entity(name);
      entity.addComponent('render',{type:'box',material,castShadows:shadows,receiveShadows:false,batchGroupId:this.batch()});
      entity.setLocalPosition(...centre);entity.setLocalScale(...size);frame.addChild(entity);return entity;
    };
    // Lining: back, sides, ceiling and floor, lit from within like a real fridge.
    box('Fridge back',liner,[0,bottom+height/2,-inside],[w*2-.03,height,.01]);
    for(const side of [-1,1])box('Fridge side',liner,[side*(w-.02),bottom+height/2,-inside/2],[.01,height,inside]);
    box('Fridge ceiling',liner,[0,headerY-.005,-inside/2],[w*2-.03,.01,inside]);
    for(const y of FRIDGE.shelves)box('Fridge shelf',shelf,[0,y+.006,-inside/2],[w*2-.05,.012,inside-.02]);
    // The door: frame, header with the sign, glass, handle.
    for(const side of [-1,1])box('Door stile',dark,[side*(w-.015),(bottom+top)/2,.012],[.03,top-bottom,.025],true);
    box('Door bottom rail',dark,[0,bottom+.02,.012],[w*2,.04,.025],true);
    box('Door header',header,[0,(headerY+top)/2,.012],[w*2,top-headerY,.025],true);
    box('Door handle',dark,[w-.07,bottom+height*.55,.045],[.018,.5,.018],true);
    const pane=new pc.Entity('Door glass');
    pane.addComponent('render',{type:'plane',material:glass,castShadows:false,receiveShadows:false});
    pane.setLocalPosition(0,bottom+.04+(height-.04)/2,.012);pane.setLocalEulerAngles(90,0,0);pane.setLocalScale(w*2-.06,1,height-.04);frame.addChild(pane);
  }

  /** The warmer on the counter: coxinhas in front, pastéis behind, where the map had placeholder cones. */
  private warmer(placements:Placement[]):void {
    const [cones]=this.hide('Salgado');
    if(!cones)return;
    const box=cones.aabb,base=box.center.y-box.halfExtents.y;
    // Its long side runs along the counter; customers are on the side away from the bar's back wall (towards -X).
    const along=box.halfExtents.z>=box.halfExtents.x,length=Math.max(box.halfExtents.x,box.halfExtents.z)+.06;
    const point=(a:number,b:number)=>along?new pc.Vec3(box.center.x+b,base,box.center.z+a):new pc.Vec3(box.center.x+a,base,box.center.z+b);
    for(let i=0;i<4;i++)placements.push({item:'coxinha',position:point(-length+.09+i*(length*2-.18)/3,-.07),yaw:Math.random()*360,group:'warmer'});
    for(let i=0;i<3;i++)placements.push({item:'pastel',position:point(-length+.15+i*(length*2-.3)/2,.075),yaw:(along?0:90)+(Math.random()-.5)*20,group:'warmer'});
  }

  /** Glasses by the draught tap and coffee by the till, on the bar's side of the counter. */
  private counter(placements:Placement[]):void {
    const tap=this.map.findByName('Chopeira') as pc.Entity|null;
    const counter=MAP_COLLIDERS.find(c=>c.id==='COL_Mob_Balcao');
    if(!tap||!counter)return;
    const top=counter.maxY??1.1,edge=counter.x+counter.hx-.06,t=tap.getPosition();
    for(let row=0;row<2;row++)for(let i=0;i<3;i++)placements.push({item:'copo',position:new pc.Vec3(edge-row*.1,top,t.z-.32-i*.1),yaw:Math.random()*360,group:'counter'});
    // The till stands half a metre from the counter's street-side end.
    const till=counter.z+counter.hz-.5;
    for(let i=0;i<3;i++)placements.push({item:'cafe',position:new pc.Vec3(edge-(i%2)*.1,top,till-.32-i*.11),yaw:Math.random()*360,group:'counter'});
  }

  /** One instanced draw for every prop of a kind in a place; the bounds cover all of them for culling. */
  private instanced(key:string,list:readonly Placement[]):void {
    const model=this.models.get(list[0]!.item);
    if(!model)return;
    const template=model.instantiateRenderEntity(),source=(template.findComponents('render') as pc.RenderComponent[])[0]?.meshInstances[0],mesh=source?.mesh,material=source?.material;
    if(!source||!mesh||!material){template.destroy();return;}
    const data=new Float32Array(list.length*16),bounds=new pc.BoundingBox(),each=new pc.BoundingBox(),matrix=new pc.Mat4();
    list.forEach((placement,i)=>{
      matrix.setTRS(placement.position,new pc.Quat().setFromEulerAngles(0,placement.yaw,0),pc.Vec3.ONE);data.set(matrix.data,i*16);
      each.setFromTransformedAabb(mesh.aabb,matrix);if(i)bounds.add(each);else bounds.copy(each);
    });
    const buffer=new pc.VertexBuffer(this.app.graphicsDevice,pc.VertexFormat.getDefaultInstancingFormat(this.app.graphicsDevice),list.length,{data});
    this.buffers.push(buffer);
    const instance=new pc.MeshInstance(mesh,material);
    instance.setInstancing(buffer);instance.setCustomAabb(bounds);
    const entity=new pc.Entity(`Dressing ${key}`);
    // Lit by the room's lamps even inside the fridges (their bodies would shade them): real fridges have their own light.
    entity.addComponent('render',{meshInstances:[instance],castShadows:!key.startsWith('fridge'),receiveShadows:!key.startsWith('fridge')});
    this.root.addChild(entity);
    template.destroy();
  }

  private material(name:string,setup:(material:pc.StandardMaterial)=>void):pc.StandardMaterial {
    const existing=this.materials.find(m=>m.name===`Dressing ${name}`) as pc.StandardMaterial|undefined;
    if(existing)return existing;
    const material=new pc.StandardMaterial();material.name=`Dressing ${name}`;setup(material);material.update();
    this.materials.push(material);return material;
  }
  private batch():number {
    if(this.batchGroup<0)this.batchGroup=this.app.batcher.addGroup('Bar dressing',false,8).id;
    return this.batchGroup;
  }
  /** "CERVEJA GELADA" in white on red, as the map's door had it. */
  private headerTexture():pc.Texture {
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
    const context=canvas.getContext('2d')!;
    context.fillStyle='#c8161d';context.fillRect(0,0,512,128);
    context.fillStyle='#ffffff';context.font='bold 64px "Arial Black", Arial, sans-serif';context.textAlign='center';context.textBaseline='middle';
    context.fillText('CERVEJA GELADA',256,68,480);
    const texture=new pc.Texture(this.app.graphicsDevice,{width:512,height:128,format:pc.PIXELFORMAT_RGBA8,mipmaps:true});
    texture.setSource(canvas);this.textures.push(texture);return texture;
  }

  destroy():void {
    this.destroyed=true;this.root.destroy();
    this.materials.forEach(m=>m.destroy());this.textures.forEach(t=>t.destroy());this.buffers.forEach(b=>b.destroy());
    if(this.batchGroup>=0)this.app.batcher.removeGroup(this.batchGroup);
  }
}
