import {FOGO_DEFAULT_COLOR,MOTO_FOGO_MODEL} from '@bar/shared';
import {colourHsv,isOriginal,repaint} from '../../engine/moto-paint';

/**
 * The shop's photo of the Caveira em Chamas in the colour being chosen. The photo (public/moto/foto-fogo.webp) was rendered by the
 * game's own engine with the fire and smoke frozen, twice: with the default paint and with a very different one. Where the two differ
 * is paint, and that difference is the mask (foto-fogo-mascara.webp, grey). Only those pixels get the repainting the shader does in
 * the world (engine/moto-paint.ts), so the flames, the metal and the bones keep their own colours.
 */
export const FOGO_PHOTO='moto/foto-fogo.webp',FOGO_MASK='moto/foto-fogo-mascara.webp';
const SIZE=[600,450] as const;
let loaded:Promise<{photo:ImageData;mask:ImageData}>|undefined;
const load=(url:string)=>new Promise<ImageData>((resolve,reject)=>{
  const image=new Image();image.onload=()=>{
    const canvas=document.createElement('canvas');canvas.width=SIZE[0];canvas.height=SIZE[1];
    const g=canvas.getContext('2d',{willReadFrequently:true})!;g.drawImage(image,0,0,SIZE[0],SIZE[1]);resolve(g.getImageData(0,0,SIZE[0],SIZE[1]));
  };image.onerror=()=>reject(new Error(`Foto ${url} indisponível.`));image.src=`${import.meta.env.BASE_URL}${url}`;
});
const images=()=>loaded??=Promise.all([load(FOGO_PHOTO),load(FOGO_MASK)]).then(([photo,mask])=>({photo,mask}));
const urls=new Map<string,string>();
/** A data URL of the photo painted in `colour` (cached by colour); the plain photo for the default colour. */
export async function fogoPhotoUrl(colour:string):Promise<string> {
  if(isOriginal(colour))return `${import.meta.env.BASE_URL}${FOGO_PHOTO}`;
  const key=colour.toLowerCase(),known=urls.get(key);if(known)return known;
  const {photo,mask}=await images(),target=colourHsv(key),out=new ImageData(new Uint8ClampedArray(photo.data),SIZE[0],SIZE[1]);
  for(let i=0;i<out.data.length;i+=4){
    const m=mask.data[i]!/255;if(m<.02)continue;
    const [r,g,b]=repaint([photo.data[i]!,photo.data[i+1]!,photo.data[i+2]!],target,m);
    out.data[i]=r;out.data[i+1]=g;out.data[i+2]=b;
  }
  const canvas=document.createElement('canvas');canvas.width=SIZE[0];canvas.height=SIZE[1];canvas.getContext('2d')!.putImageData(out,0,0);
  const url=canvas.toDataURL('image/jpeg',.9);if(urls.size>24)urls.clear();urls.set(key,url);return url;
}
/** Paints every Caveira photo under `root`: the ones with a `data-fogo-colour` in that colour. */
export function paintFogoPhotos(root:ParentNode,fallback=FOGO_DEFAULT_COLOR):void {
  for(const image of root.querySelectorAll<HTMLImageElement>('img[data-fogo-photo]')){
    const colour=image.dataset.fogoColour||fallback;
    void fogoPhotoUrl(colour).then(url=>{if(image.isConnected&&(image.dataset.fogoColour||fallback)===colour)image.src=url;}).catch(()=>undefined);
  }
}
export const isFogoPhoto=(model:string)=>model===MOTO_FOGO_MODEL;
