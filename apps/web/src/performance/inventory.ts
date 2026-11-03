import * as pc from 'playcanvas';
import {safeUrl} from './recording';

export interface DiagnosticActor {root:pc.Entity;model?:pc.Entity;skin?:string;clip?:string;resting:boolean;npc:boolean;local:boolean}
const ROW_LIMIT=500,NODE_LIMIT=50000;
function ranked<T>(rows:T[],cost:(row:T)=>number,limit=ROW_LIMIT){
  return {total:rows.length,omitted:Math.max(0,rows.length-limit),items:rows.sort((a,b)=>cost(b)-cost(a)).slice(0,limit)};
}
function triangles(mesh:pc.Mesh|null):number {
  if(!mesh)return 0;
  const p=mesh.primitive[0];if(!p)return 0;
  if(p.type===pc.PRIMITIVE_TRIANGLES)return Math.floor(p.count/3);
  if(p.type===pc.PRIMITIVE_TRISTRIP||p.type===pc.PRIMITIVE_TRIFAN)return Math.max(0,p.count-2);
  return 0;
}
function meshBytes(mesh:pc.Mesh):number {
  return (mesh.vertexBuffer?.numBytes??0)+mesh.indexBuffer.reduce((sum,b)=>sum+(b?.numBytes??0),0);
}
function label(node:pc.GraphNode):string {return node.name.startsWith('Avatar ')?'Avatar [anonymous]':node.name.slice(0,160);}
function assetFile(asset:pc.Asset){return asset.file as {url?:string;size?:number}|null;}

/** Export-time inspection only. Never reads GPU buffers or retains live engine objects in the report. */
export function collectSceneInventory(app:pc.Application,actors:DiagnosticActor[]=[]){
  const began=performance.now(),device=app.graphicsDevice,stats=app.stats;
  const meshSources=new Map<pc.Mesh,string>(),textureSources=new Map<pc.Texture,string>();
  const animations=new Map<pc.AnimTrack,{track:pc.AnimTrack;source:string}>();
  const assets=app.assets.list();
  for(const asset of assets){
    const source=safeUrl(assetFile(asset)?.url??asset.name);
    if(asset.type==='container'&&asset.resource){
      const container=asset.resource as pc.ContainerResource;
      for(const render of container.renders??[])for(const mesh of (render.resource as {meshes?:pc.Mesh[]}|undefined)?.meshes??[])meshSources.set(mesh,source);
      for(const texture of container.textures??[])if(texture.resource)textureSources.set(texture.resource as pc.Texture,source);
      for(const animation of container.animations??[])if(animation.resource)animations.set(animation.resource as pc.AnimTrack,{track:animation.resource as pc.AnimTrack,source});
    }
    // Embedded glTF textures can have synthetic file URLs; keep their owning model as the source.
    if(asset.type==='texture'&&asset.resource&&!textureSources.has(asset.resource as pc.Texture))textureSources.set(asset.resource as pc.Texture,source);
    if(asset.type==='animation'&&asset.resource)animations.set(asset.resource as pc.AnimTrack,{track:asset.resource as pc.AnimTrack,source});
  }
  const meshRows=new Map<pc.Mesh,{id:number;name:string;source:string|null;vertices:number;triangles:number;bufferBytes:number;bones:number;morphTargets:number;instances:number;enabledInstances:number;visibleInstances:number;skinnedInstances:number}>();
  const materialRows=new Map<pc.Material,{id:number;name:string;instances:number;transparent:boolean;alphaTest:number;doubleSided:boolean;depthWrite:boolean;textures:Array<{slot:string;id:number}>}>();
  const textures=new Map<pc.Texture,{id:number;name:string;source:string|null;width:number;height:number;depth:number;format:number;formatName:string|null;compressed:boolean;estimatedBytes:number;mipmaps:boolean;levels:number;cubemap:boolean;anisotropy:number;materialSlots:number}>();
  const addTexture=(texture:pc.Texture)=>{
    if(!textures.has(texture))textures.set(texture,{id:textures.size+1,name:texture.name??'',source:textureSources.get(texture)??null,width:texture.width,height:texture.height,depth:texture.depth,format:texture.format,
      formatName:pc.pixelFormatInfo.get(texture.format)?.name??null,compressed:pc.isCompressedPixelFormat(texture.format),estimatedBytes:texture.gpuSize,mipmaps:texture.mipmaps,levels:texture.numLevels,cubemap:texture.cubemap,anisotropy:texture.anisotropy,materialSlots:0});
    return textures.get(texture)!;
  };
  // Includes render targets, dynamic TV textures and bone palettes outside the asset registry.
  for(const texture of device.textures)addTexture(texture);
  let nodes=0,enabledNodes=0,meshInstances=0,enabledInstances=0,visibleInstances=0,skinnedInstances=0,shadowCasters=0,transparentInstances=0,instancedInstances=0,geometryTriangles=0;
  const lights:Array<{node:string;enabled:boolean;type:string;castShadows:boolean;shadowResolution:number;range:number;intensity:number}>=[];
  const cameras:Array<{node:string;enabled:boolean;nearClip:number;farClip:number;fov:number;frustumCulling:boolean;postEffects:number}>=[];
  const scripts:Array<{node:string;name:string;enabled:boolean}>=[];
  const components:Record<string,number>={};
  const entities:Array<{node:string;enabled:boolean;meshes:number;triangles:number;skinned:number;customAabb:boolean;batchGroupId:number}>=[];
  const stack:pc.GraphNode[]=[app.root];
  while(stack.length&&nodes<NODE_LIMIT){
    const node=stack.pop()!;nodes++;if(node.enabled)enabledNodes++;
    for(const child of node.children)stack.push(child);
    if(!(node instanceof pc.Entity))continue;
    for(const name of Object.keys(node.c))components[name]=(components[name]??0)+1;
    const render=node.render,model=node.model,instances=render?.meshInstances??model?.meshInstances??[];
    let entityTriangles=0,entitySkinned=0;
    for(const instance of instances){
      const active=node.enabled&&(render?.enabled??model?.enabled??false)&&instance.visible;
      const mesh=instance.mesh;if(!mesh)continue;
      const tris=triangles(mesh),copies=instance.instancingCount||1;
      meshInstances++;if(active){enabledInstances++;geometryTriangles+=tris*copies;}
      if(instance.visibleThisFrame)visibleInstances++;
      if(instance.skinInstance){skinnedInstances++;entitySkinned++;}
      if(active&&instance.castShadow)shadowCasters++;
      if(instance.instancingCount)instancedInstances++;
      entityTriangles+=tris*copies;
      if(!meshRows.has(mesh))meshRows.set(mesh,{id:mesh.id,name:label(instance.node),source:meshSources.get(mesh)??null,vertices:mesh.vertexBuffer?.numVertices??0,
        triangles:tris,bufferBytes:meshBytes(mesh),bones:mesh.skin?.boneNames.length??0,morphTargets:mesh.morph?.targets.length??0,instances:0,enabledInstances:0,visibleInstances:0,skinnedInstances:0});
      const m=meshRows.get(mesh)!;m.instances++;if(active)m.enabledInstances++;if(instance.visibleThisFrame)m.visibleInstances++;if(instance.skinInstance)m.skinnedInstances++;
      const material=instance.material;
      if(!material)continue;
      if(material.blendType!==pc.BLEND_NONE&&active)transparentInstances++;
      if(!materialRows.has(material)){
        const row={id:material.id,name:material.name.slice(0,160),instances:0,transparent:material.blendType!==pc.BLEND_NONE,alphaTest:material.alphaTest,
          doubleSided:material.cull===pc.CULLFACE_NONE,depthWrite:material.depthWrite,textures:[] as Array<{slot:string;id:number}>};
        for(const [slot,value] of Object.entries(material))if(value instanceof pc.Texture){const t=addTexture(value);t.materialSlots++;row.textures.push({slot:slot.replace(/^_/,''),id:t.id});}
        materialRows.set(material,row);
      }
      materialRows.get(material)!.instances++;
    }
    if(instances.length)entities.push({node:label(node),enabled:node.enabled,meshes:instances.length,triangles:entityTriangles,skinned:entitySkinned,customAabb:!!(render?.customAabb??model?.customAabb),batchGroupId:render?.batchGroupId??model?.batchGroupId??-1});
    if(node.light){const l=node.light;lights.push({node:label(node),enabled:node.enabled&&l.enabled,type:l.type,castShadows:l.castShadows,shadowResolution:l.shadowResolution,range:l.range,intensity:l.intensity});}
    if(node.camera){const c=node.camera;cameras.push({node:label(node),enabled:node.enabled&&c.enabled,nearClip:c.nearClip,farClip:c.farClip,fov:c.fov,frustumCulling:c.frustumCulling,postEffects:c.postEffects?.effects.length??0});}
    if(node.script)for(const script of node.script.scripts)scripts.push({node:label(node),name:script.constructor.name,enabled:script.enabled});
  }
  const camera=app.root.findComponents('camera')[0] as pc.CameraComponent|undefined;
  const characterRows=actors.slice(0,256).map((actor,index)=>{
    const renders=(actor.model??actor.root).findComponents('render') as pc.RenderComponent[];
    const instances=renders.flatMap(r=>r.meshInstances),bones=new Set<pc.GraphNode>();
    for(const instance of instances)for(const bone of instance.skinInstance?.bones??[])bones.add(bone);
    const position=actor.root.getPosition();
    return {index,skin:actor.skin??'procedural',clip:actor.clip??null,npc:actor.npc,local:actor.local,resting:actor.resting,
      position:[position.x,position.y,position.z],distance:camera?position.distance(camera.entity.getPosition()):null,
      meshes:instances.length,triangles:instances.reduce((s,i)=>s+triangles(i.mesh),0),bones:bones.size,
      meshIds:[...new Set(instances.flatMap(i=>i.mesh?[i.mesh.id]:[]))],materialIds:[...new Set(instances.flatMap(i=>i.material?[i.material.id]:[]))],
      customAabb:renders.filter(r=>r.customAabb).length,animationEnabled:actor.model?.anim?.enabled??false,layers:actor.model?.anim?.layers.length??0};
  });
  const animationRows=[...animations.values()].map(({track,source})=>({name:track.name,source,durationS:track.duration,curves:track.curves.length,
    keyframes:track.inputs.reduce((s,data)=>s+data.data.length,0),values:track.outputs.reduce((s,data)=>s+data.data.length,0),
    estimatedDataBytes:[...track.inputs,...track.outputs].reduce((s,data)=>s+data.data.length*4,0)}));
  const buffers=new Set<pc.VertexBuffer|pc.IndexBuffer>();
  for(const mesh of meshRows.keys()){if(mesh.vertexBuffer)buffers.add(mesh.vertexBuffer);for(const buffer of mesh.indexBuffer)if(buffer)buffers.add(buffer);}
  const gpu=device as pc.GraphicsDevice&{unmaskedRenderer?:string;unmaskedVendor?:string};
  return {
    capturedAt:new Date().toISOString(),collectionMs:performance.now()-began,engine:{version:pc.version,revision:pc.revision},
    device:{backend:device.deviceType,width:device.width,height:device.height,maxPixelRatio:device.maxPixelRatio,maxTextureSize:device.maxTextureSize,
      renderer:gpu.unmaskedRenderer??null,vendor:gpu.unmaskedVendor??null,maxSamples:device.maxSamples,
      gpuProfilerAvailable:!!device.gpuProfiler,gpuTimingResultAvailable:stats.gpuFrameTime!==undefined,gpuTimingEnabled:device.gpuProfiler?.enabled??false},
    memory:{total:stats.vramTotalBytes,textures:stats.vramTextureBytes,vertices:stats.vramVertexBufferBytes,indices:stats.vramIndexBufferBytes,uniforms:stats.vramUniformBufferBytes,storage:stats.vramStorageBufferBytes},
    scene:{nodes,enabledNodes,omittedNodesAtLeast:stack.length,nodeLimit:NODE_LIMIT,components,meshInstances,enabledInstances,visibleInstances,skinnedInstances,shadowCasters,transparentInstances,instancedInstances,geometryTriangles,
      uniqueMeshes:meshRows.size,uniqueGeometryBytes:[...buffers].reduce((s,b)=>s+b.numBytes,0),materials:materialRows.size,
      textures:textures.size,textureEstimatedBytes:[...textures.values()].reduce((s,t)=>s+t.estimatedBytes,0)},
    meshes:ranked([...meshRows.values()],r=>r.triangles*r.instances),textures:ranked([...textures.values()],r=>r.estimatedBytes),materials:ranked([...materialRows.values()],r=>r.instances),
    entities:ranked(entities,r=>r.triangles),characters:{total:actors.length,omitted:Math.max(0,actors.length-256),items:characterRows},
    animations:ranked(animationRows,r=>r.estimatedDataBytes),lights:ranked(lights,r=>r.enabled&&r.castShadows?r.shadowResolution*(r.type==='omni'?6:1):0),
    cameras:ranked(cameras,()=>0),scripts:ranked(scripts,()=>0),
    assets:ranked(assets.map(a=>({id:a.id,name:a.name.slice(0,160),type:a.type,url:assetFile(a)?.url?safeUrl(assetFile(a)!.url!):null,loaded:a.loaded,loading:a.loading,fileBytes:assetFile(a)?.size??null})),r=>r.fileBytes??0),
    notes:[
      'Inventário no instante da exportação; não representa automaticamente os recursos presentes numa travada passada.',
      'geometryTriangles conta instâncias habilitadas, incluindo objetos fora da câmera; não mede primitivas realmente desenhadas nem passes de sombra.',
      'visibleThisFrame pode incluir câmeras e passes diferentes. Menus podem deixar o último valor publicado pelo motor.',
      'Meshes e texturas têm IDs locais para relacionar referências. Recursos compartilhados aparecem uma vez; bytes de buffers compartilhados entre meshes podem se repetir.',
      'Texturas incluem render targets e recursos internos quando expostos por graphicsDevice.textures. Bytes são estimativas, sem overhead do driver.',
      'Dados de animação estimados como float32; keyframes somam entradas únicas do track, não tempo de CPU nem tamanho do arquivo.',
      'Scripts lista componentes nativos. Código TypeScript do jogo é medido por blocos em recording.buckets[].phases.',
    ],
  };
}
export type SceneInventory=ReturnType<typeof collectSceneInventory>;
