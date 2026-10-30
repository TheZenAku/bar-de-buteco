/**
 * Highgram's photo filters: each is a colour matrix (brightness, contrast, saturation, sepia, warmth) plus a fade that
 * lifts the blacks and a vignette, applied to the pixels before the photo is encoded. The preview and the posted photo
 * go through the same code, so what the strip shows is what gets posted.
 */
export interface PhotoFilter {id:string;name:string;brightness?:number;contrast?:number;saturation?:number;sepia?:number;warmth?:number;fade?:number;vignette?:number}
export const PHOTO_FILTERS:PhotoFilter[]=[
  {id:'normal',name:'Normal'},
  {id:'clarendon',name:'Clarendon',contrast:1.2,saturation:1.35,warmth:-.25},
  {id:'juno',name:'Juno',brightness:1.05,contrast:1.1,saturation:1.3,warmth:.35},
  {id:'lark',name:'Lark',brightness:1.08,contrast:.92,saturation:.9,fade:.05},
  {id:'gingham',name:'Gingham',brightness:1.05,contrast:.86,saturation:.85,warmth:.1,fade:.1},
  {id:'valencia',name:'Valencia',brightness:1.05,contrast:1.08,saturation:1.08,sepia:.1,warmth:.3},
  {id:'boteco',name:'Boteco',contrast:1.15,saturation:1.25,warmth:.6,vignette:.35},
  {id:'madrugada',name:'Madrugada',brightness:.94,contrast:1.2,saturation:1.1,warmth:-.55,vignette:.3},
  {id:'retro',name:'Retrô',contrast:.9,saturation:.8,sepia:.25,fade:.15,vignette:.2},
  {id:'sepia',name:'Sépia',contrast:1.05,sepia:.85},
  {id:'moon',name:'Moon',brightness:1.1,contrast:1.1,saturation:0},
  {id:'noir',name:'Noir',brightness:.95,contrast:1.35,saturation:0,vignette:.3},
];

/** Rows r, g, b of an affine colour transform: [r, g, b, offset] each. */
type Affine=number[];
const identity=():Affine=>[1,0,0,0,0,1,0,0,0,0,1,0];
/** `next` applied after `previous`. */
function then(previous:Affine,next:Affine):Affine {
  const out:Affine=[];
  for(let row=0;row<3;row++){
    for(let column=0;column<3;column++)out.push(next[row*4]!*previous[column]!+next[row*4+1]!*previous[4+column]!+next[row*4+2]!*previous[8+column]!);
    out.push(next[row*4]!*previous[3]!+next[row*4+1]!*previous[7]!+next[row*4+2]!*previous[11]!+next[row*4+3]!);
  }
  return out;
}
const mix=(a:Affine,b:Affine,amount:number)=>a.map((value,i)=>value+(b[i]!-value)*amount);
const SEPIA:Affine=[.393,.769,.189,0,.349,.686,.168,0,.272,.534,.131,0];
function saturation(s:number):Affine {
  const [r,g,b]=[.2126,.7152,.0722];
  return [r+(1-r)*s,g-g*s,b-b*s,0,r-r*s,g+(1-g)*s,b-b*s,0,r-r*s,g-g*s,b+(1-b)*s,0];
}
const contrast=(c:number):Affine=>[c,0,0,128*(1-c),0,c,0,128*(1-c),0,0,c,128*(1-c)];
const brightness=(k:number):Affine=>[k,0,0,0,0,k,0,0,0,0,k,0];
const warmth=(w:number):Affine=>[1,0,0,22*w,0,1,0,4*w,0,0,1,-22*w];

function matrix(filter:PhotoFilter):Affine {
  let m=identity();
  if(filter.sepia)m=then(m,mix(identity(),SEPIA,filter.sepia));
  if(filter.saturation!==undefined)m=then(m,saturation(filter.saturation));
  if(filter.contrast!==undefined)m=then(m,contrast(filter.contrast));
  if(filter.brightness!==undefined)m=then(m,brightness(filter.brightness));
  if(filter.warmth)m=then(m,warmth(filter.warmth));
  return m;
}

/** Filters the pixels in place; `strength` 0–1 blends with the original (Uint8ClampedArray rounds and clamps). */
export function applyFilter(image:ImageData,filter:PhotoFilter,strength=1):void {
  if(filter.id==='normal'||strength<=0)return;
  const m=matrix(filter),data=image.data,width=image.width,height=image.height,fade=(filter.fade??0)*255,vignette=filter.vignette??0;
  const cx=width/2,cy=height/2,reach=Math.hypot(cx,cy);
  for(let y=0;y<height;y++){
    for(let x=0;x<width;x++){
      const i=(y*width+x)*4,r=data[i]!,g=data[i+1]!,b=data[i+2]!;
      let nr=m[0]!*r+m[1]!*g+m[2]!*b+m[3]!,ng=m[4]!*r+m[5]!*g+m[6]!*b+m[7]!,nb=m[8]!*r+m[9]!*g+m[10]!*b+m[11]!;
      if(fade){nr=nr*(1-fade/255)+fade;ng=ng*(1-fade/255)+fade;nb=nb*(1-fade/255)+fade;}
      if(vignette){
        // Darker towards the corners, from 40% of the way out.
        const t=Math.max(0,(Math.hypot(x-cx,y-cy)/reach-.4)/.6),k=1-vignette*t*t*(3-2*t);
        nr*=k;ng*=k;nb*=k;
      }
      data[i]=r+(nr-r)*strength;data[i+1]=g+(ng-g)*strength;data[i+2]=b+(nb-b)*strength;
    }
  }
}

/** Draws a photo into the canvas (cropped to fill it) and filters it. */
export async function drawFiltered(canvas:HTMLCanvasElement,source:Blob|ImageBitmap,filter:PhotoFilter,strength=1):Promise<void> {
  const bitmap=source instanceof Blob?await createImageBitmap(source):source;
  const context=canvas.getContext('2d',{willReadFrequently:true})!,scale=Math.max(canvas.width/bitmap.width,canvas.height/bitmap.height);
  const w=bitmap.width*scale,h=bitmap.height*scale;
  context.drawImage(bitmap,(canvas.width-w)/2,(canvas.height-h)/2,w,h);
  if(source instanceof Blob)bitmap.close();
  if(filter.id==='normal'||strength<=0)return;
  const image=context.getImageData(0,0,canvas.width,canvas.height);
  applyFilter(image,filter,strength);
  context.putImageData(image,0,0);
}
