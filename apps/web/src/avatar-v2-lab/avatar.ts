import * as pc from 'playcanvas';
import {compatibilityProblems,hiddenRegions,type AvatarSelection,type BodyEntry,type CatalogBundle,type PieceEntry,type Slot} from './catalog';

const ASSET_BASE='/avatars-v2/';
const skinDiffuse=`
uniform vec3 material_diffuse;
uniform vec3 barClothingColor;
void getAlbedo(){
  dAlbedo=material_diffuse;
  #ifdef STD_DIFFUSE_TEXTURE
    vec4 sampleColor=texture2DBias({STD_DIFFUSE_TEXTURE_NAME},{STD_DIFFUSE_TEXTURE_UV},{STD_TEXTURE_BIAS});
    vec3 tex={STD_DIFFUSE_TEXTURE_DECODE}(sampleColor).{STD_DIFFUSE_TEXTURE_CHANNEL};
    dAlbedo=tex*mix(barClothingColor,material_diffuse,sampleColor.a);
  #endif
}`;
const alphaTintDiffuse=`
uniform vec3 material_diffuse;
void getAlbedo(){
  dAlbedo=material_diffuse;
  #ifdef STD_DIFFUSE_TEXTURE
    vec4 sampleColor=texture2DBias({STD_DIFFUSE_TEXTURE_NAME},{STD_DIFFUSE_TEXTURE_UV},{STD_TEXTURE_BIAS});
    vec3 tex={STD_DIFFUSE_TEXTURE_DECODE}(sampleColor).{STD_DIFFUSE_TEXTURE_CHANNEL};
    dAlbedo=tex*mix(vec3(1.0),material_diffuse,sampleColor.a);
  #endif
}`;

export interface RuntimeDiagnostics{
  body:string;pieceIds:string[];hiddenRegions:string[];armatureCount:number;animComponents:number;
  renderComponents:number;meshInstances:number;skinnedMeshInstances:number;materialClones:number;
  animation:string;compatibilityProblems:string[];errors:string[];
}

export class AvatarAssetCache{
  private containers=new Map<string,Promise<pc.ContainerResource>>();
  private textures=new Map<string,Promise<pc.Asset>>();
  constructor(private app:pc.Application){}
  container(relative:string):Promise<pc.ContainerResource>{
    let promise=this.containers.get(relative);
    if(!promise){
      promise=(async()=>{
        const injectShared=/^(bodies|hair|facial_hair)\//.test(relative);
        const [hair,eyes]=injectShared?await Promise.all([this.textureAsset('textures/hair_v2.png'),this.textureAsset('textures/eye_v2.png')]):[undefined,undefined];
        return new Promise<pc.ContainerResource>((resolve,reject)=>{
          const asset=new pc.Asset(`avatar-v2:${relative}`,'container',{url:ASSET_BASE+relative});
          if(injectShared)(asset as pc.Asset&{options:unknown}).options={image:{processAsync:(image:{uri?:string},done:(error:unknown,texture?:pc.Asset|null)=>void)=>done(null,image.uri?.endsWith('hair_v2.png')?hair:image.uri?.endsWith('eye_v2.png')?eyes:null)}};
          this.app.assets.add(asset);
          asset.ready(ready=>resolve(ready.resource as pc.ContainerResource));
          asset.on('error',(error:unknown)=>{this.containers.delete(relative);reject(new Error(`Falha ao carregar ${relative}: ${String(error)}`));});
          this.app.assets.load(asset);
        });
      })();
      this.containers.set(relative,promise);
    }
    return promise;
  }
  private textureAsset(relative:string):Promise<pc.Asset>{
    let promise=this.textures.get(relative);
    if(!promise){
      promise=new Promise((resolve,reject)=>{
        const asset=new pc.Asset(`avatar-v2:${relative}`,'texture',{url:ASSET_BASE+relative},{srgb:true});
        this.app.assets.add(asset);
        asset.ready(resolve);
        asset.on('error',(error:unknown)=>reject(new Error(`Falha na textura ${relative}: ${String(error)}`)));
        this.app.assets.load(asset);
      });
      this.textures.set(relative,promise);
    }
    return promise;
  }
  async texture(relative:string):Promise<pc.Texture>{return (await this.textureAsset(relative)).resource as pc.Texture;}
}

function setHex(material:pc.StandardMaterial,value:string){material.diffuse.fromString(value);}
function renders(entity:pc.Entity){return entity.findComponents('render') as pc.RenderComponent[];}
function selectedIds(selection:AvatarSelection){return Object.values(selection.pieces).flatMap(value=>value??[]).filter(Boolean);}

export class AvatarV2Instance{
  readonly host=new pc.Entity('AvatarV2Host');
  private root?:pc.Entity;
  private armature?:pc.Entity;
  private body?:BodyEntry;
  private selection?:AvatarSelection;
  private pieceEntities=new Map<string,pc.Entity>();
  private pieceMaterials=new Map<string,pc.StandardMaterial[]>();
  private bodyMaterials:pc.StandardMaterial[]=[];
  private allOwnedMaterials=new Set<pc.StandardMaterial>();
  private mask?:pc.Texture;
  private currentAnimation='Idle';
  private errors:string[]=[];
  private operation=Promise.resolve();

  constructor(private app:pc.Application,private cache:AvatarAssetCache,private bundle:CatalogBundle){this.app.root.addChild(this.host);}

  attachTo(parent:pc.Entity){
    this.host.reparent(parent);this.host.setLocalPosition(0,0,0);this.host.setLocalRotation(pc.Quat.IDENTITY);this.host.setLocalScale(1,1,1);
  }
  modelEntity(){return this.root;}

  update(next:AvatarSelection):Promise<void>{
    const snapshot=structuredClone(next);
    this.operation=this.operation.catch(()=>undefined).then(()=>this.performUpdate(snapshot)).catch(error=>{this.errors.push(error instanceof Error?error.message:String(error));throw error;});
    return this.operation;
  }

  private async performUpdate(next:AvatarSelection){
    const problems=compatibilityProblems(this.bundle,next);
    if(problems.length)throw new Error(problems.join(' '));
    if(!this.root||this.selection?.body!==next.body)await this.buildBody(next);
    await this.syncPieces(next);
    this.selection=next;
    this.applyBrowsAndMorphs();
    this.applyColors();
    this.applyMask();
  }

  private async buildBody(selection:AvatarSelection){
    this.clearAvatar();
    this.body=this.bundle.avatar.bodies.find(body=>body.id===selection.body);
    if(!this.body)throw new Error(`Corpo desconhecido: ${selection.body}`);
    const [container,animations]=await Promise.all([this.cache.container(this.body.path),this.cache.container(this.body.animations)]);
    const root=container.instantiateRenderEntity({castShadows:true,receiveShadows:true});
    this.host.addChild(root);this.root=root;
    this.armature=(root.name===this.body.armatureNode?root:root.findByName(this.body.armatureNode) as pc.Entity|null)??undefined;
    if(!this.armature)throw new Error(`Armature ${this.body.armatureNode} ausente em ${this.body.path}; raiz=${root.name}; filhos=${root.children.map(child=>child.name).join(',')}`);
    root.addComponent('anim',{activate:true});
    const clips=new Map(this.bundle.animations.clips.map(clip=>[clip.name,clip]));
    for(const animation of animations.animations){
      const track=animation.resource as pc.AnimTrack;
      const contract=clips.get(track.name);
      root.anim!.assignAnimation(track.name,track,undefined,1,contract?.loop??false);
    }
    if(animations.animations.length!==this.bundle.animations.clips.length)this.errors.push(`${selection.body}: banco expôs ${animations.animations.length}/18 clipes.`);
    this.cloneMaterials(root,this.bodyMaterials);
    this.play(this.currentAnimation);
  }

  private async syncPieces(next:AvatarSelection){
    const wanted=new Set(selectedIds(next));
    for(const [id,entity] of [...this.pieceEntities])if(!wanted.has(id)){
      entity.destroy();this.pieceEntities.delete(id);
      for(const material of this.pieceMaterials.get(id)??[]){this.allOwnedMaterials.delete(material);material.destroy();}
      this.pieceMaterials.delete(id);
    }
    for(const id of wanted){
      if(this.pieceEntities.has(id))continue;
      const piece=this.bundle.avatar.pieces.find(candidate=>candidate.id===id);
      if(!piece)throw new Error(`Peça desconhecida: ${id}`);
      await this.attachPiece(piece,next.body);
    }
  }

  private async attachPiece(piece:PieceEntry,bodyId:'male'|'female'){
    const entry=piece.bodies[bodyId];
    if(!entry)throw new Error(`${piece.id} não possui export ${bodyId}`);
    const container=await this.cache.container(entry.path);
    const instance=container.instantiateRenderEntity({castShadows:true,receiveShadows:true});
    let attached:pc.Entity;
    if(piece.attachment==='skinned'){
      const mesh=instance.findByName(piece.meshNode) as pc.Entity|null;
      if(!mesh?.render){instance.destroy();throw new Error(`Nó ${piece.meshNode} ausente em ${entry.path}`);}
      mesh.reparent(this.armature!);mesh.setLocalPosition(0,0,0);mesh.setLocalRotation(pc.Quat.IDENTITY);mesh.setLocalScale(1,1,1);
      mesh.render.rootBone=this.root!;
      instance.destroy();attached=mesh;
    }else{
      const socket=this.root!.findByName(piece.socket!) as pc.Entity|null;
      if(!socket){instance.destroy();throw new Error(`Socket ${piece.socket} ausente no corpo.`);}
      socket.addChild(instance);instance.setLocalPosition(0,0,0);instance.setLocalRotation(pc.Quat.IDENTITY);instance.setLocalScale(1,1,1);attached=instance;
    }
    attached.name=`V2-piece:${piece.id}`;
    this.pieceEntities.set(piece.id,attached);
    const materials:pc.StandardMaterial[]=[];this.cloneMaterials(attached,materials);this.pieceMaterials.set(piece.id,materials);
    const override=entry.textureOverride;
    if(override){
      const texture=await this.cache.texture(override.baseColorTexture);
      const material=materials.find(candidate=>candidate.name===override.material);
      if(!material)throw new Error(`Material de override ${override.material} ausente em ${piece.id}`);
      material.diffuseMap=texture;material.update();
    }
  }

  private cloneMaterials(entity:pc.Entity,target:pc.StandardMaterial[]){
    const cache=new Map<pc.Material,pc.StandardMaterial>();
    for(const render of renders(entity))for(const instance of render.meshInstances){
      const original=instance.material;
      if(!(original instanceof pc.StandardMaterial)||!original.name.startsWith('Character'))continue;
      let clone=cache.get(original);
      if(!clone){
        clone=original.clone();clone.shaderChunksVersion=pc.version;
        if(clone.name==='CharacterSkin'){clone.shaderChunks.glsl.set('diffusePS',skinDiffuse);clone.setParameter('barClothingColor',new Float32Array([.03,.03,.03]));}
        else if(clone.name==='CharacterEyes'||(clone.name.startsWith('CharacterClothing-')&&Boolean(clone.diffuseMap)))clone.shaderChunks.glsl.set('diffusePS',alphaTintDiffuse);
        cache.set(original,clone);target.push(clone);this.allOwnedMaterials.add(clone);
      }
      instance.material=clone;
    }
  }

  private applyBrowsAndMorphs(){
    if(!this.root||!this.body||!this.selection)return;
    for(const [style,nodeName] of Object.entries(this.body.meshes.brows)){
      const node=this.root.findByName(nodeName) as pc.Entity|null;if(node)node.enabled=this.selection.brow===style;
    }
    const preset=this.body.facePresets[this.selection.facePreset]??{};
    const values=new Map(this.body.morphTargets.map(name=>[name,preset[name]??0]));
    for(const render of renders(this.root))for(const instance of render.meshInstances){
      if(!instance.morphInstance)continue;
      for(const [name,value] of values)instance.morphInstance.setWeight(name,value);
    }
  }

  private applyColors(){
    if(!this.selection)return;
    const update=(material:pc.StandardMaterial,colorField?:string)=>{
      if(material.name.startsWith('CharacterLens-'))return;
      let value:string;
      if(colorField)value=this.selection!.colors[colorField as keyof AvatarSelection['colors']];
      else value=material.name==='CharacterSkin'?this.selection!.colors.skinTone:material.name==='CharacterEyes'?this.selection!.colors.eyeColor:this.selection!.colors.hairColor;
      setHex(material,value);
      if(material.name==='CharacterSkin'){
        const color=new pc.Color().fromString(this.selection!.colors.outfitColor).linear();
        material.setParameter('barClothingColor',new Float32Array([color.r,color.g,color.b]));
      }
      material.update();
    };
    for(const material of this.bodyMaterials)update(material);
    for(const [pieceId,materials] of this.pieceMaterials){
      const piece=this.bundle.avatar.pieces.find(candidate=>candidate.id===pieceId);
      for(const material of materials){const contract=piece?.configurableMaterials.find(item=>item.name===material.name);update(material,contract?.colorField);}
    }
  }

  private applyMask(){
    if(!this.selection)return;
    const hidden=new Set(hiddenRegions(this.bundle,this.selection).map(name=>this.bundle.rig.regions.find(region=>region.name===name)?.id).filter((id):id is number=>id!==undefined));
    if(!this.mask)this.mask=new pc.Texture(this.app.graphicsDevice,{width:32,height:1,format:pc.PIXELFORMAT_RGBA8,mipmaps:false,minFilter:pc.FILTER_NEAREST,magFilter:pc.FILTER_NEAREST,addressU:pc.ADDRESS_CLAMP_TO_EDGE,addressV:pc.ADDRESS_CLAMP_TO_EDGE});
    const pixels=this.mask.lock() as Uint8Array;
    for(let id=0;id<32;id++){const value=hidden.has(id)?0:255;pixels.set([value,value,value,255],id*4);}
    this.mask.unlock();
    for(const material of this.bodyMaterials)if(material.name==='CharacterSkin'){
      material.opacityMap=this.mask;material.opacityMapUv=1;material.opacityMapChannel='r';material.alphaTest=.5;material.blendType=pc.BLEND_NONE;material.update();
    }
  }

  play(name:string){
    this.currentAnimation=name;
    const layer=this.root?.anim?.baseLayer;if(!layer)return;
    try{layer.transition(name,.18);}catch(error){this.errors.push(`Animação ${name}: ${String(error)}`);}
  }

  diagnostics():RuntimeDiagnostics{
    const allRenders=this.root?renders(this.root):[];
    const meshInstances=allRenders.flatMap(render=>render.meshInstances);
    const pieceIds=this.selection?selectedIds(this.selection):[];
    return {
      body:this.selection?.body??this.body?.id??'none',pieceIds,
      hiddenRegions:this.selection?hiddenRegions(this.bundle,this.selection):[],
      armatureCount:this.root?this.root.find(node=>node.name===this.bundle.rig.rigId).length:0,
      animComponents:this.root?(this.root.findComponents('anim') as pc.AnimComponent[]).length:0,
      renderComponents:allRenders.length,meshInstances:meshInstances.length,
      skinnedMeshInstances:meshInstances.filter(instance=>Boolean(instance.skinInstance)).length,
      materialClones:this.allOwnedMaterials.size,animation:this.currentAnimation,
      compatibilityProblems:this.selection?compatibilityProblems(this.bundle,this.selection):[],errors:[...this.errors],
    };
  }

  setPosition(x:number,y:number,z:number){this.host.setLocalPosition(x,y,z);}
  setYaw(value:number){this.host.setLocalEulerAngles(0,value,0);}
  getSelection(){return this.selection?structuredClone(this.selection):undefined;}
  private clearAvatar(){
    this.root?.destroy();this.root=undefined;this.armature=undefined;this.pieceEntities.clear();this.pieceMaterials.clear();this.bodyMaterials=[];
    for(const material of this.allOwnedMaterials)material.destroy();this.allOwnedMaterials.clear();this.mask?.destroy();this.mask=undefined;
  }
  destroy(){this.clearAvatar();this.host.destroy();}
}

export function selectionWith(selection:AvatarSelection,slot:Slot,ids:string[]):AvatarSelection{
  const result=structuredClone(selection);result.pieces[slot]=ids;return result;
}
