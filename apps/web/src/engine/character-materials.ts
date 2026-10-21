import * as pc from 'playcanvas';
import {DEFAULT_CHARACTER,readCharacter,type CharacterConfig} from '@bar/shared';

export function characterFromJson(value?:string):CharacterConfig{try{return readCharacter(value?JSON.parse(value):DEFAULT_CHARACTER);}catch{return {...DEFAULT_CHARACTER};}}
const materials=new WeakMap<pc.Entity,{key:string;clones:pc.StandardMaterial[]}>();
// Only the iris receives the selected color; sclera highlights retain their neutral color.
const eyeDiffuse=`
uniform vec3 material_diffuse;
void getAlbedo(){
  dAlbedo=material_diffuse;
  #ifdef STD_DIFFUSE_TEXTURE
    vec3 tex={STD_DIFFUSE_TEXTURE_DECODE}(texture2DBias({STD_DIFFUSE_TEXTURE_NAME},{STD_DIFFUSE_TEXTURE_UV},{STD_TEXTURE_BIAS})).{STD_DIFFUSE_TEXTURE_CHANNEL};
    float iris=1.0-smoothstep(0.35,0.65,max(tex.r,max(tex.g,tex.b)));
    dAlbedo=tex*mix(vec3(1.0),material_diffuse,iris);
  #endif
}`;
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
export function applyCharacter(entity:pc.Entity,config:CharacterConfig):void{
  const key=JSON.stringify(config),existing=materials.get(entity);if(existing?.key===key)return;
  let clones=existing?.clones;
  if(!clones){
    const cache=new Map<pc.Material,pc.StandardMaterial>();
    for(const render of entity.findComponents('render') as pc.RenderComponent[])for(const instance of render.meshInstances){
      const original=instance.material;
      if(!(original instanceof pc.StandardMaterial)||!original.name.startsWith('Character'))continue;
      let clone=cache.get(original);if(!clone){clone=original.clone();clone.shaderChunksVersion=pc.version;if(clone.name==='CharacterEyes')clone.shaderChunks.glsl.set('diffusePS',eyeDiffuse);if(clone.name==='CharacterSkin')clone.shaderChunks.glsl.set('diffusePS',skinDiffuse);cache.set(original,clone);}
      instance.material=clone;
    }
    clones=[...cache.values()];
  }
  for(const material of clones){material.diffuse.fromString(material.name==='CharacterSkin'?config.skinTone:material.name==='CharacterEyes'?config.eyeColor:config.hairColor);if(material.name==='CharacterSkin'){const color=new pc.Color().fromString(config.outfitColor).linear();material.setParameter('barClothingColor',new Float32Array([color.r,color.g,color.b]));}material.update();}
  const parts:Record<string,boolean>={beard:config.beard,'brows-regular':config.eyebrows==='regular','brows-female':config.eyebrows==='female'};
  for(const hair of ['buzzed','buzzed-female','simple-parted','long','buns'])parts[hair]=hair===config.hair;
  for(const [name,enabled] of Object.entries(parts)){const part=entity.findByName(`part-${name}`) as pc.Entity|null;if(part)part.enabled=enabled;}
  materials.set(entity,{key,clones});
}
export function disposeCharacter(entity?:pc.Entity):void{if(!entity)return;for(const material of materials.get(entity)?.clones??[])material.destroy();materials.delete(entity);}
