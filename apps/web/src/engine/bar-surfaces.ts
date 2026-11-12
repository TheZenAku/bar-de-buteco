import * as pc from 'playcanvas';

/**
 * What the bar's surfaces carry from Blender beyond their textures:
 * - the ambient occlusion baked on the merged meshes' second UV (08_export.py + aolib.py): corners, the feet of the
 *   tables and chairs, under the counter and the shelves. It darkens the ambient light, and more gently the lamps'.
 * - a 360° panorama of the hall (51_panorama_env.py), prefiltered into an environment atlas: the floor, the counter, the
 *   bottles and the metals reflect the room, and the ambient light comes from the room (warm from its lamps, the ceiling
 *   lit by the floor) instead of the sky's flat grey-blue. Its strength follows the hour's ambient and the bar's power.
 * A missing file (an export from before) leaves the materials as they were.
 */
const AO_MESHES:Record<string,string>={Bar_Estrutura:'bar_ao_bar_estrutura.jpg',Bar_Mobilia:'bar_ao_bar_mobilia.jpg'};
const PANORAMA='bar_env.png';
/** The bar with its veranda, backyard and stage (game coordinates): what stands inside takes the room's light. */
const BAR_BOX=new pc.BoundingBox(new pc.Vec3(16,4.5,-13.5),new pc.Vec3(17.5,5,15));
const AO_INTENSITY=.9;
/** How bright the room's ambient is against the hour's (1: the same as the sky's ambient outside). */
const ROOM_AMBIENT=1.6;
/** How much of the panorama's colour the room's light keeps: whole, the terracotta floor tinted the white ceiling orange. */
const ROOM_SATURATION=.55;

const linear=(value:number)=>Math.pow(value,2.2);
const luminance=(r:number,g:number,b:number)=>.2126*r+.7152*g+.0722*b;

function loadImage(url:string):Promise<HTMLImageElement|undefined> {
  return new Promise(resolve=>{
    const image=new Image();image.crossOrigin='anonymous';
    image.onload=()=>resolve(image);image.onerror=()=>resolve(undefined);image.src=url;
  });
}

export class BarSurfaces {
  private textures:pc.Texture[]=[];
  private materials:pc.StandardMaterial[]=[];
  private envMaterials:pc.StandardMaterial[]=[];
  private atlas?:pc.Texture;
  /** The panorama's mean luminance (linear): its ambient is scaled to the hour's by it. */
  private roomLuminance=0;
  private level=-1;
  private reflection=-1;
  private status={occlusion:[] as string[],panorama:false,materials:0,instances:0};
  readonly ready:Promise<void>;
  /**
   * `maxSize`: the largest side the occlusion maps keep on the GPU (graphics.ts textureLimit). `idle`: resolves once the
   * driver has no shader left to build; the reflections' one-off passes wait for theirs, and waited 2 s behind the queue.
   */
  constructor(private app:pc.Application,map:pc.Entity,base:string,private maxSize=Infinity,private idle:()=>Promise<void>=()=>Promise.resolve()){
    this.ready=this.load(map,base);
  }
  private async load(map:pc.Entity,base:string):Promise<void> {
    const [panorama,...occlusion]=await Promise.all([loadImage(`${base}maps/${PANORAMA}`),...Object.values(AO_MESHES).map(file=>loadImage(`${base}maps/${file}`))]);
    if(!map.parent)return;
    const device=this.app.graphicsDevice,maps=new Map<string,pc.Texture>();
    Object.keys(AO_MESHES).forEach((name,index)=>{
      const image=occlusion[index];
      if(!image)return;
      const texture=new pc.Texture(device,{name:`AO ${name}`,format:pc.PIXELFORMAT_RGBA8,mipmaps:true,anisotropy:4,
        addressU:pc.ADDRESS_CLAMP_TO_EDGE,addressV:pc.ADDRESS_CLAMP_TO_EDGE});
      texture.setSource(this.fitted(image));this.textures.push(texture);maps.set(name,texture);this.status.occlusion.push(name);
    });
    if(panorama)await this.idle();
    if(!map.parent)return;
    if(panorama){
      const source=new pc.Texture(device,{name:'Bar panorama',format:pc.PIXELFORMAT_SRGBA8,mipmaps:false,projection:pc.TEXTUREPROJECTION_EQUIRECT,
        addressU:pc.ADDRESS_REPEAT,addressV:pc.ADDRESS_CLAMP_TO_EDGE});
      source.setSource(this.desaturated(panorama));
      const lighting=pc.EnvLighting.generateLightingSource(source,{size:128});
      this.atlas=pc.EnvLighting.generateAtlas(lighting,{size:512});
      source.destroy();lighting.destroy();
      this.roomLuminance=this.meanLuminance(panorama);this.status.panorama=true;
    }
    this.dress(map,maps);
  }
  /** The occlusion is soft by nature: it loses nothing halved, while a 2048² map costs 21 MB of video memory. */
  private fitted(image:HTMLImageElement):HTMLCanvasElement|HTMLImageElement {
    let width=image.width,height=image.height;
    while(Math.max(width,height)>this.maxSize&&Math.max(width,height)>1){width=Math.max(1,width>>1);height=Math.max(1,height>>1);}
    if(width===image.width)return image;
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const context=canvas.getContext('2d');
    if(!context)return image;
    context.imageSmoothingQuality='high';context.drawImage(image,0,0,width,height);
    return canvas;
  }
  /**
   * The panorama is only the source of a 128-pixel lighting cube: it is desaturated at 512 × 256, which keeps all of that
   * cube's detail. At its full size the loop over its pixels took 2 s of the main thread while the bar loaded.
   */
  private desaturated(image:HTMLImageElement):HTMLCanvasElement|HTMLImageElement {
    const canvas=document.createElement('canvas');canvas.width=Math.min(image.width,512);canvas.height=Math.max(1,Math.round(canvas.width*image.height/image.width));
    // Read back once: a canvas kept in memory spares the GPU round trip.
    const context=canvas.getContext('2d',{willReadFrequently:true});
    if(!context)return image;
    context.imageSmoothingQuality='high';context.drawImage(image,0,0,canvas.width,canvas.height);
    const pixels=context.getImageData(0,0,canvas.width,canvas.height),data=pixels.data;
    for(let i=0;i<data.length;i+=4){
      const grey=.2126*data[i]!+.7152*data[i+1]!+.0722*data[i+2]!;
      for(let c=0;c<3;c++)data[i+c]=grey+(data[i+c]!-grey)*ROOM_SATURATION;
    }
    context.putImageData(pixels,0,0);
    return canvas;
  }
  private meanLuminance(image:HTMLImageElement):number {
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=32;
    const context=canvas.getContext('2d');
    if(!context)return .2;
    context.drawImage(image,0,0,64,32);
    const data=context.getImageData(0,0,64,32).data;let sum=0;
    for(let i=0;i<data.length;i+=4)sum+=luminance(linear(data[i]!/255),linear(data[i+1]!/255),linear(data[i+2]!/255));
    return Math.max(.02,sum/(data.length/4));
  }
  /**
   * Whether the whole piece stands inside the bar. Its centre alone is not enough: the surrounding blocks (Mapa_Bairro) and their
   * trees and tree pits spread over hundreds of metres around the bar, their centre falls on it, and taking the room's ambient they
   * lit that district warm and bright against the blue night of the city sectors, with a straight edge where the two met. For a
   * piece drawn in copies (instancing) every copy has to be inside.
   */
  private standsInBar(instance:pc.MeshInstance):boolean {
    const data=instance.instancingData?.vertexBuffer;
    if(!data){
      const box=instance.aabb,half=BAR_BOX.halfExtents;
      return BAR_BOX.containsPoint(box.center)&&box.halfExtents.x<=half.x+2&&box.halfExtents.y<=half.y+2&&box.halfExtents.z<=half.z+2;
    }
    const matrices=new Float32Array(data.lock() as ArrayBuffer);
    const low=new pc.Vec3(Infinity,Infinity,Infinity),high=new pc.Vec3(-Infinity,-Infinity,-Infinity);
    for(let i=0;i+14<matrices.length;i+=16){
      low.set(Math.min(low.x,matrices[i+12]!),Math.min(low.y,matrices[i+13]!),Math.min(low.z,matrices[i+14]!));
      high.set(Math.max(high.x,matrices[i+12]!),Math.max(high.y,matrices[i+13]!),Math.max(high.z,matrices[i+14]!));
    }
    return Number.isFinite(low.x)&&BAR_BOX.containsPoint(low)&&BAR_BOX.containsPoint(high);
  }
  /**
   * Each material of the bar gets its own copy here (the city and the street keep theirs): with the occlusion of its
   * mesh when it is one of the merged meshes and has the second UV, and the room's reflections when it stands in the bar.
   * What glows (signs, bulbs, screens) and what is drawn unlit stays as it is.
   */
  private dress(map:pc.Entity,maps:Map<string,pc.Texture>):void {
    const copies=new Map<string,pc.StandardMaterial>();
    for(const render of map.findComponents('render') as pc.RenderComponent[]){
      const occlusion=maps.get(render.entity.name);
      for(const instance of render.meshInstances){
        const material=instance.material;
        if(!(material instanceof pc.StandardMaterial)||!material.useLighting)continue;
        const e=material.emissive;
        if(e.r>0||e.g>0||e.b>0)continue;
        const baked=!!occlusion&&material.blendType===pc.BLEND_NONE&&!instance.instancingData&&
          !!instance.mesh?.vertexBuffer.format.elements.some(element=>element.name===pc.SEMANTIC_TEXCOORD1);
        const inside=baked||this.standsInBar(instance);
        if(!inside||(!baked&&!this.atlas))continue;
        const key=`${material.id}|${baked?render.entity.name:''}`;
        let copy=copies.get(key);
        if(!copy){
          copy=material.clone();copy.name=material.name;
          if(baked){copy.aoMap=occlusion!;copy.aoMapUv=1;copy.aoMapChannel='g';copy.aoIntensity=AO_INTENSITY;copy.occludeDirect=true;copy.occludeSpecular=pc.SPECOCC_AO;}
          if(this.atlas){copy.envAtlas=this.atlas;this.envMaterials.push(copy);}
          copy.update();copies.set(key,copy);this.materials.push(copy);
        }
        instance.material=copy;this.status.instances++;
      }
    }
    this.status.materials=this.materials.length;
    this.level=this.reflection=-1;
  }
  /** Every frame: the room's ambient follows the hour's (scene.ambientLight) and, with its reflections, the bar's power. */
  update(power:number):void {
    if(!this.envMaterials.length)return;
    const a=this.app.scene.ambientLight,hour=luminance(linear(a.r),linear(a.g),linear(a.b));
    const level=hour/this.roomLuminance*ROOM_AMBIENT*(.55+.45*power),reflection=.35+.65*power;
    if(Math.abs(level-this.level)<.004&&Math.abs(reflection-this.reflection)<.01)return;
    this.level=level;this.reflection=reflection;
    // The material's ambient colour is in gamma space: the room's level is linear.
    const tint=Math.pow(level,1/2.2);
    for(const material of this.envMaterials){material.ambient.set(tint,tint,tint);material.reflectivity=reflection;material.update();}
  }
  telemetry(){return {...this.status,ambient:+this.level.toFixed(3),reflectivity:+this.reflection.toFixed(3),roomLuminance:+this.roomLuminance.toFixed(3)};}
  destroy():void {
    this.materials.forEach(material=>material.destroy());this.textures.forEach(texture=>texture.destroy());this.atlas?.destroy();
    this.materials=[];this.envMaterials=[];this.textures=[];this.atlas=undefined;
  }
}
