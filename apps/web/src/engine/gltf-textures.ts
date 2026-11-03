import * as pc from 'playcanvas';

const textureInfos=(material:Record<string,any>)=>[material.pbrMetallicRoughness?.baseColorTexture,material.emissiveTexture,material.normalTexture,material.pbrMetallicRoughness?.metallicRoughnessTexture,material.occlusionTexture];

/**
 * The parser makes a clone of a texture each time a glTF refers to its image again, and the exporter repeats one image in many
 * textures: 32 textures for 13 images in a city sector, 138 for 85 in the bar (188 MB of copies on the GPU). Materials all point at
 * the first of each image (the parser runs this after making the textures, so their order must stay), and the clones, never bound,
 * never reach the GPU. For a glTF container asset's `global.preprocess`.
 */
export function pointAtFirstTexture(gltf:Record<string,any>):void {
  const first=new Map<number,number>();
  (gltf.textures??[]).forEach((texture:{source:number},index:number)=>{if(!first.has(texture.source))first.set(texture.source,index);});
  for(const material of gltf.materials??[])for(const info of textureInfos(material))if(info)info.index=first.get(gltf.textures[info.index].source);
}

/**
 * Loads a glTF/GLB container with its repeated textures shared (pointAtFirstTexture), like `app.assets.loadFromUrl`.
 */
export function loadSharedContainer(app:pc.AppBase,url:string,callback:(error:unknown,asset?:pc.Asset)=>void):void {
  const asset=new pc.Asset(url.split('/').pop()??url,'container',{url},undefined,{global:{preprocess:pointAtFirstTexture}} as never);
  asset.once('load',loaded=>callback(null,loaded));
  asset.once('error',error=>callback(error));
  app.assets.add(asset);
  app.assets.load(asset);
}

/**
 * Scales every image the engine decodes from now on down to `limit(asset)` pixels on its longer side, before it reaches the GPU.
 * The engine uploads a texture as soon as it is made, so this is the last moment to make it smaller. It wraps the texture
 * handler's image parser, whose result is an ImageBitmap (Chrome, Firefox) or an <img> (Safari). Scaling halves until it fits,
 * so power-of-two sizes stay power of two (their mipmaps stay exact).
 */
export function limitTextures(app:pc.AppBase,limit:(asset:pc.Asset|undefined)=>number):void {
  const parser=(app.loader.getHandler('texture') as unknown as {imgParser?:ImageParser}|undefined)?.imgParser;
  if(!parser||typeof parser.load!=='function'){console.warn('Limite de textura indisponível nesta versão do motor.');return;}
  const load=parser.load.bind(parser);
  parser.load=(url,callback,asset)=>load(url,(error,image)=>{
    const width=image instanceof HTMLImageElement?image.naturalWidth:image?.width??0,height=image instanceof HTMLImageElement?image.naturalHeight:image?.height??0;
    const max=limit(asset);let scale=1;
    while(Math.max(width,height)*scale>max&&Math.max(width,height)*scale>1)scale/=2;
    if(error||!image||scale===1){callback(error,image);return;}
    const w=Math.max(1,Math.round(width*scale)),h=Math.max(1,Math.round(height*scale));
    if(typeof ImageBitmap!=='undefined'&&image instanceof ImageBitmap){
      // The same options the engine decodes with: colours and alpha as stored.
      createImageBitmap(image,{resizeWidth:w,resizeHeight:h,resizeQuality:'high',premultiplyAlpha:'none',colorSpaceConversion:'none'})
        .then(small=>{image.close();callback(null,small);},()=>callback(null,image));
      return;
    }
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    const context=canvas.getContext('2d');
    if(!context){callback(null,image);return;}
    context.imageSmoothingQuality='high';context.drawImage(image as CanvasImageSource,0,0,w,h);
    callback(null,canvas);
  },asset);
}
type Decoded=ImageBitmap|HTMLImageElement|HTMLCanvasElement;
interface ImageParser {load(url:unknown,callback:(error:unknown,image?:Decoded)=>void,asset?:pc.Asset):void}
