import * as pc from 'playcanvas';
import {sectorDistance,type SectorCell} from '@bar/shared';
import {CityPlanner,CITY_TUNING,type CityBackend,type CityDetail,type LodMode,type SlotKind} from './city-plan';
import type {EnvironmentLighting} from './environment-lighting';

const CITY_URL=`${import.meta.env.BASE_URL}maps/cidade/`;
/** Beyond this distance a sector's buildings and trees cast no sun shadow (the sun's cascades reach 55 m). */
const SHADOW_REACH=70;
const UPDATE_SECONDS=.2;
const MANIFEST_ATTEMPTS=3;
/** Pushes the city's flat far grounds back in the depth buffer: seen from afar they lie too close to the streets to tell apart. */
const FAR_GROUND_BIAS=6,LOD_GROUND_BIAS=3;
interface CullingProp {instance:pc.MeshInstance;cullAt:number;minX:number;maxX:number;minZ:number;maxZ:number}
interface LoadedFile {
  asset:pc.Asset;
  entity:pc.Entity;
  /** What the glTF's nodes carried in their extras (the parser drops them from the entities). */
  extras:Map<string,Record<string,unknown>>;
  /** The LOD file's buildings by level; the full file has none. */
  levels:{mid:pc.Entity[];far:pc.Entity[]};
  props:CullingProp[];
  casters:pc.RenderComponent[];
  casting:boolean;
  lights:pc.LightComponent[];
  entities:number;
}
interface SectorEntry {arquivos:{visual:string;lod:string};kb:{visual:number;lod:number}}
const textureInfos=(material:Record<string,any>)=>[material.pbrMetallicRoughness?.baseColorTexture,material.emissiveTexture,material.normalTexture,material.pbrMetallicRoughness?.metallicRoughnessTexture,material.occlusionTexture];
/** The city's only textures that are data and not colour are its normal maps (telha_n, tijolo_n). */
const holdsColour=(file:string)=>!/_n\.[a-z]+$/i.test(file);

/**
 * Draws the city around the always-loaded bar: the sectors CityPlanner asks for, the outer ring and the far backdrop. Every file
 * shares one copy of each texture; a sector that fails to load leaves its LOD or the backdrop in its place, and never stops the game.
 */
export class CityStreaming implements CityBackend<LoadedFile> {
  private readonly root=new pc.Entity('City');
  private readonly planner=new CityPlanner<LoadedFile>(this);
  private readonly textures=new Map<string,Promise<pc.Asset>>();
  private readonly sharedTextures=new Set<pc.Asset>();
  private readonly backdrop:LoadedFile[]=[];
  private sectors?:Record<string,SectorEntry>;
  private detail:CityDetail='high';
  private fogEnd=650;
  private destroyed=false;
  private clock=UPDATE_SECONDS;
  private shadows=true;
  private failedBackdrops=0;
  private loaded={x:0,z:0};
  constructor(private readonly app:pc.AppBase,private readonly environment:EnvironmentLighting){
    app.root.addChild(this.root);
    void this.readManifest();
    void this.loadBackdrop('cidade_distante.gltf',file=>this.dressFarBackdrop(file));
    void this.loadBackdrop('cidade_anel.gltf');
  }
  /** Configurações → Gráficos: how much of the city is detailed, how far the fog lets it show, and whether the sun casts shadows. */
  setQuality(detail:CityDetail,fogEnd:number,shadows:boolean):void {
    this.detail=detail;this.fogEnd=fogEnd;this.shadows=shadows;
    this.planner.setTuning(CITY_TUNING[detail]);
    this.environment.setCityLights(CITY_TUNING[detail].lights);
  }
  /** Each frame, with where the player (or the camera, at the door) is. */
  update(dt:number,x:number,z:number):void {
    this.clock+=dt;
    if(this.clock<UPDATE_SECONDS)return;
    this.clock=0;this.loaded={x,z};
    if(!this.sectors)return;
    this.planner.update(performance.now(),x,z,this.fogEnd);
    const cull=CITY_TUNING[this.detail].cull;
    for(const {kind,cell,handle} of this.planner.shown()){
      if(kind!=='full')continue;
      for(const prop of handle.props){
        const away=Math.hypot(Math.max(prop.minX-x,0,x-prop.maxX),Math.max(prop.minZ-z,0,z-prop.maxZ));
        // A little past the distance to hide what was shown, so nothing flickers at the line.
        prop.instance.visible=away<=prop.cullAt*cull*(prop.instance.visible?1.05:1);
      }
      this.castShadows(handle,cell,x,z);
    }
  }
  telemetry(){
    let entities=this.backdrop.reduce((sum,file)=>sum+file.entities,0);
    for(const {handle} of this.planner.shown())entities+=handle.entities;
    const stats=(this.app as unknown as {stats?:{drawCalls?:{total?:number}}}).stats;
    return {...this.planner.metrics(),detail:this.detail,fogEnd:this.fogEnd,backdrops:this.backdrop.length,failedBackdrops:this.failedBackdrops,manifest:!!this.sectors,
      textures:this.textures.size,entitiesShown:entities,assets:this.app.assets.list().length,drawCalls:stats?.drawCalls?.total??0,at:this.loaded};
  }
  destroy():void {
    this.destroyed=true;
    this.planner.destroy();
    for(const file of this.backdrop.splice(0))this.dispose('','lod',file);
    // Right now, while the app stands: the scene destroys it next, and a load still on its way has nowhere to go (discard).
    for(const texture of this.sharedTextures)this.discard(texture);
    this.sharedTextures.clear();this.textures.clear();
    this.root.destroy();
  }

  // CityBackend: what the planner calls.
  load(sector:string,kind:SlotKind):Promise<LoadedFile> {
    const entry=this.sectors?.[sector];
    if(!entry)return Promise.reject(new Error('fora do manifesto'));
    const file=kind==='full'?entry.arquivos.visual:entry.arquivos.lod;
    return this.loadFile(`setores/${file}`).then(loaded=>{
      if(kind==='lod')this.sortLevels(loaded);
      else this.prepareFull(loaded);
      return loaded;
    });
  }
  dispose(_sector:string,_kind:SlotKind,file:LoadedFile):void {
    for(const light of file.lights)this.environment.removeCityLight(light);
    file.entity.destroy();
    // The container frees the rest, its unused clones of textures among them (see pointAtFirstTexture); the textures themselves are the city's.
    const resource=file.asset.resource as unknown as {textures:pc.Asset[]};
    resource.textures=resource.textures.filter(texture=>!this.sharedTextures.has(texture));
    this.discard(file.asset);
  }
  show(_sector:string,kind:SlotKind,file:LoadedFile,visible:boolean,mode:LodMode):void {
    if(kind==='lod'&&visible){
      for(const node of file.levels.mid)node.enabled=mode==='mid';
      for(const node of file.levels.far)node.enabled=mode==='far';
    }
    file.entity.enabled=visible;
    if(kind==='full'&&!visible&&file.casting){
      file.casting=false;
      for(const render of file.casters)render.castShadows=false;
    }
  }
  warn(message:string):void {console.warn(`Cidade: ${message}`);}
  /** Frees an asset that belongs to nothing any more. Once the scene is gone, so is the registry. */
  private discard(asset:pc.Asset):void {
    if(!this.app.assets)return;
    this.app.assets.remove(asset);
    asset.unload();
  }

  private async readManifest():Promise<void> {
    for(let attempt=1;attempt<=MANIFEST_ATTEMPTS&&!this.destroyed;attempt++){
      try{
        const response=await fetch(`${CITY_URL}cidade_setores.json`);
        if(!response.ok)throw new Error(`HTTP ${response.status}`);
        this.sectors=(await response.json() as {setores:Record<string,SectorEntry>}).setores;
        return;
      }catch(error){
        this.warn(`manifesto indisponível (tentativa ${attempt}): ${String(error)}`);
        await new Promise(resolve=>setTimeout(resolve,attempt*3000));
      }
    }
  }
  private async loadBackdrop(file:string,dress?:(loaded:LoadedFile)=>void):Promise<void> {
    try{
      const loaded=await this.loadFile(file);
      if(this.destroyed){this.dispose('','lod',loaded);return;}
      for(const render of loaded.entity.findComponents('render') as pc.RenderComponent[]){render.castShadows=false;render.receiveShadows=false;}
      dress?.(loaded);
      loaded.entity.enabled=true;
      this.backdrop.push(loaded);
    }catch(error){
      this.failedBackdrops++;
      this.warn(`${file} não carregou: ${String(error)}`);
    }
  }
  /** The panorama ignores the fog and follows the time of day; the far ground stays under the city's. */
  private dressFarBackdrop(file:LoadedFile):void {
    for(const render of file.entity.findComponents('render') as pc.RenderComponent[])for(const instance of render.meshInstances){
      const material=instance.material as pc.StandardMaterial;
      if(material.name==='Chao_Distante')this.environment.hideGroundFallback();
      if(material.name==='Ceu_Panorama'){
        material.useFog=false;material.useLighting=false;material.update();
        this.environment.setPanorama(material);
      }else if(material.name==='Chao_Distante'){
        material.depthBias=FAR_GROUND_BIAS;material.slopeDepthBias=FAR_GROUND_BIAS;material.update();
      }
    }
  }
  /** A glTF with its buffers, sharing the city's textures, hidden until the planner shows it. */
  private loadFile(file:string):Promise<LoadedFile> {
    return new Promise((resolve,reject)=>{
      const extras=new Map<string,Record<string,unknown>>();
      const asset=new pc.Asset(`city/${file}`,'container',{url:`${CITY_URL}${file}`},undefined,{
        global:{preprocess:pointAtFirstTexture},
        node:{postprocess:(gltfNode:{name?:string;extras?:Record<string,unknown>})=>{if(gltfNode.name&&gltfNode.extras)extras.set(gltfNode.name,gltfNode.extras);}},
        image:{processAsync:(image:{uri:string},callback:(error:unknown,asset?:pc.Asset)=>void)=>{
          this.texture(image.uri).then(texture=>callback(null,texture),error=>callback(error));
        }},
      } as never);
      asset.once('load',()=>{
        if(this.destroyed){this.discard(asset);reject(new Error('cena destruída'));return;}
        const resource=asset.resource as pc.ContainerResource;
        const entity=resource.instantiateRenderEntity({castShadows:false,receiveShadows:false});
        entity.name=file;entity.enabled=false;
        this.root.addChild(entity);
        resolve({asset,entity,extras,levels:{mid:[],far:[]},props:[],casters:[],casting:false,lights:this.nightLights(entity,extras),entities:countEntities(entity)});
      });
      asset.once('error',(error:unknown)=>{
        this.discard(asset);
        reject(error);
      });
      this.app.assets.add(asset);
      this.app.assets.load(asset);
    });
  }
  private texture(uri:string):Promise<pc.Asset> {
    const name=uri.split('/').pop()!;
    let texture=this.textures.get(name);
    if(!texture){
      texture=new Promise<pc.Asset>((resolve,reject)=>{
        const asset=new pc.Asset(`city/${name}`,'texture',{url:`${CITY_URL}texturas/${name}`},{srgb:holdsColour(name)} as never,{crossOrigin:'anonymous'} as never);
        this.sharedTextures.add(asset);
        asset.once('load',()=>{(asset.resource as pc.Texture).anisotropy=4;resolve(asset);});
        asset.once('error',(error:unknown)=>{this.discard(asset);this.sharedTextures.delete(asset);this.textures.delete(name);reject(error);});
        this.app.assets.add(asset);
        this.app.assets.load(asset);
      });
      this.textures.set(name,texture);
    }
    return texture;
  }
  /** The LOD file's nodes go by their name: LOD1 buildings near, LOD2 silhouettes far, the trees and ground in both. */
  private sortLevels(file:LoadedFile):void {
    for(const child of file.entity.children as pc.Entity[]){
      if(/_Edificios_LOD1$/.test(child.name))file.levels.mid.push(child);
      else if(/_Silhueta_LOD2$/.test(child.name))file.levels.far.push(child);
      if(/_Chao_LOD2$/.test(child.name))for(const render of child.findComponents('render') as pc.RenderComponent[])for(const instance of render.meshInstances){
        const material=instance.material as pc.StandardMaterial;
        material.depthBias=LOD_GROUND_BIAS;material.slopeDepthBias=LOD_GROUND_BIAS;material.update();
      }
    }
  }
  /** Lamps glow with the time of day; instanced props get real bounds, or they are drawn even behind the camera. */
  private prepareFull(file:LoadedFile):void {
    for(const render of file.entity.findComponents('render') as pc.RenderComponent[]){
      render.receiveShadows=true;
      file.casters.push(render);
      for(const instance of render.meshInstances){
        const material=instance.material;
        if(material?.name==='Lampada')instance.material=this.environment.cityLamp(material as pc.StandardMaterial);
        if(instance.instancingData)file.props.push(this.instancedProp(instance,Number(file.extras.get(render.entity.name)?.cull_m??0)));
      }
    }
    file.props=file.props.filter(prop=>prop.cullAt>0);
  }
  private instancedProp(instance:pc.MeshInstance,cullAt:number):CullingProp {
    const matrices=new Float32Array(instance.instancingData!.vertexBuffer!.lock() as ArrayBuffer),mesh=instance.mesh!.aabb;
    const reach=mesh.center.length()+mesh.halfExtents.length();
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity;
    for(let i=0;i<matrices.length;i+=16){
      const x=matrices[i+12]!,y=matrices[i+13]!,z=matrices[i+14]!;
      minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);
    }
    const box=new pc.BoundingBox(new pc.Vec3((minX+maxX)/2,(minY+maxY)/2,(minZ+maxZ)/2),new pc.Vec3((maxX-minX)/2+reach,(maxY-minY)/2+reach,(maxZ-minZ)/2+reach));
    instance.setCustomAabb(box);
    instance.cull=true;
    return {instance,cullAt,minX,maxX,minZ,maxZ};
  }
  /** The nine Luz_* marked luz_noturna: without shadows, on at night (EnvironmentLighting). */
  private nightLights(entity:pc.Entity,extras:Map<string,Record<string,unknown>>):pc.LightComponent[] {
    const lights=(entity.findComponents('light') as pc.LightComponent[]).filter(light=>extras.get(light.entity.parent?.name??light.entity.name)?.luz_noturna);
    for(const light of lights)this.environment.addCityLight(light);
    return lights;
  }
  private castShadows(file:LoadedFile,cell:SectorCell,x:number,z:number):void {
    const casting=this.shadows&&sectorDistance(cell,x,z)<=SHADOW_REACH;
    if(casting===file.casting)return;
    file.casting=casting;
    for(const render of file.casters)render.castShadows=casting;
  }
}
/**
 * The parser makes a clone of a texture each time a glTF refers to its image again, and the exporter repeats one image in many
 * textures: 32 textures for 13 images in a sector, each drawn from its own copy on the GPU. Materials all point at the first of each
 * image (the parser runs this after making the textures, so their order must stay), and the clones, never bound, never reach the GPU.
 */
function pointAtFirstTexture(gltf:Record<string,any>):void {
  const first=new Map<number,number>();
  (gltf.textures??[]).forEach((texture:{source:number},index:number)=>{if(!first.has(texture.source))first.set(texture.source,index);});
  for(const material of gltf.materials??[])for(const info of textureInfos(material))if(info)info.index=first.get(gltf.textures[info.index].source);
}
const countEntities=(entity:pc.GraphNode):number=>entity.children.reduce((sum,child)=>sum+countEntities(child),1);
