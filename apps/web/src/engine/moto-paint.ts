import * as pc from 'playcanvas';
import {FOGO_DEFAULT_COLOR} from '@bar/shared';

/**
 * The red of the Caveira em Chamas is painted into its texture (fenders, tank ribs, grips, decals): there is no separate paint
 * material to tint. So each bike gets its own copy of the body material with a `diffusePS` that moves the texture's reds to the
 * owner's colour: pixels that are red (hue within ±12–24° of red, saturated, not black) take the colour's hue, and their saturation
 * and value are scaled by how far the colour is from the default one, so the shading, the decals and the wear keep their shape.
 * The bone-coloured ribs, the metal, the leather and the lamp lenses (another material) are not red and stay as they are. The
 * default colour is the identity. `repaint` is the same arithmetic for the shop's photo (see phone/apps/motors.ts).
 */
const GAMMA=2.2;
/** Hue (turns), saturation and value of a #rrggbb colour. */
export function colourHsv(hex:string):[number,number,number] {
  const n=/^#?([0-9a-f]{6})$/i.exec(hex.trim())?.[1]??'000000';
  const r=parseInt(n.slice(0,2),16)/255,g=parseInt(n.slice(2,4),16)/255,b=parseInt(n.slice(4,6),16)/255;
  const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
  let h=0;
  if(d>1e-6)h=max===r?(((g-b)/d)%6+6)%6:max===g?(b-r)/d+2:(r-g)/d+4;
  return [h/6,max<=0?0:d/max,max];
}
export const DEFAULT_HSV=colourHsv(FOGO_DEFAULT_COLOR);
/** The colours that mean "as it came": the default and the car's neutral grey, which is what an unpainted vehicle carries. */
export const isOriginal=(hex:string|undefined)=>!hex||hex.toLowerCase()===FOGO_DEFAULT_COLOR||hex.toLowerCase()==='#ccc9c2';
const smooth=(a:number,b:number,x:number)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
function hsvToRgb(h:number,s:number,v:number):[number,number,number] {
  const k=(n:number)=>{const x=(n+h*6)%6;return v-v*s*Math.max(0,Math.min(1,Math.min(x,4-x)));};
  return [k(5),k(3),k(1)];
}
/** The same repainting the shader does, on one sRGB pixel (0..255). With `mask` (0..1, the shop photo's paint mask) that weight
 *  replaces the shader's red test: the photo's mask already says which pixels are paint. */
export function repaint(rgb:readonly [number,number,number],target:readonly [number,number,number],mask?:number):[number,number,number] {
  const r=rgb[0]/255,g=rgb[1]/255,b=rgb[2]/255,max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
  let h=0;
  if(d>1e-6)h=max===r?(((g-b)/d)%6+6)%6:max===g?(b-r)/d+2:(r-g)/d+4;
  h/=6;const s=max<=0?0:d/max,v=max,hd=h>.5?h-1:h;
  const weight=mask??smooth(.3,.42,s)*(1-smooth(12/360,24/360,Math.abs(hd)))*smooth(.06,.12,v);
  const out=hsvToRgb(((target[0]+hd*.5)%1+1)%1,Math.min(1,s*target[1]/DEFAULT_HSV[1]),Math.min(1,v*target[2]/DEFAULT_HSV[2]));
  return [Math.round((r+(out[0]-r)*weight)*255),Math.round((g+(out[1]-g)*weight)*255),Math.round((b+(out[2]-b)*weight)*255)];
}

const chunk=`
uniform vec3 material_diffuse;
uniform vec3 uPaint;
uniform float uPaintOn;
vec3 paintHsv(vec3 c){
  vec4 K=vec4(0.,-1./3.,2./3.,-1.);vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g));vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r));
  float d=q.x-min(q.w,q.y);return vec3(abs(q.z+(q.w-q.y)/(6.*d+1e-10)),d/(q.x+1e-10),q.x);
}
vec3 paintRgb(vec3 c){vec3 p=abs(fract(c.xxx+vec3(1.,2./3.,1./3.))*6.-3.);return c.z*mix(vec3(1.),clamp(p-1.,0.,1.),c.y);}
vec3 repaint(vec3 lin){
  vec3 g=pow(max(lin,vec3(0.)),vec3(1./${GAMMA.toFixed(1)}));
  vec3 hsv=paintHsv(g);
  float hd=hsv.x>.5?hsv.x-1.:hsv.x;
  float w=smoothstep(.3,.42,hsv.y)*(1.-smoothstep(12./360.,24./360.,abs(hd)))*smoothstep(.06,.12,hsv.z)*uPaintOn;
  vec3 o=vec3(fract(uPaint.x+hd*.5+1.),clamp(hsv.y*uPaint.y/${DEFAULT_HSV[1].toFixed(4)},0.,1.),clamp(hsv.z*uPaint.z/${DEFAULT_HSV[2].toFixed(4)},0.,1.));
  return mix(lin,pow(paintRgb(o),vec3(${GAMMA.toFixed(1)})),w);
}
void getAlbedo() {
	dAlbedo = material_diffuse.rgb;
	#ifdef STD_DIFFUSE_TEXTURE
		vec3 albedoTexture = {STD_DIFFUSE_TEXTURE_DECODE}(texture2DBias({STD_DIFFUSE_TEXTURE_NAME}, {STD_DIFFUSE_TEXTURE_UV}, {STD_TEXTURE_BIAS})).{STD_DIFFUSE_TEXTURE_CHANNEL};
		albedoTexture = repaint(albedoTexture);
		dAlbedo *= albedoTexture;
	#endif
	#ifdef STD_DIFFUSE_VERTEX
		dAlbedo *= saturate(vVertexColor.{STD_DIFFUSE_VERTEX_CHANNEL});
	#endif
}
`;

export class MotoPaint {
  private readonly materials:pc.StandardMaterial[]=[];
  private current='';
  constructor(root:pc.Entity) {
    const body=root.findByName('Moto') as pc.Entity|null;
    for(const instance of body?.render?.meshInstances??[]){
      const m=(instance.material as pc.StandardMaterial).clone();
      m.getShaderChunks(pc.SHADERLANGUAGE_GLSL).set('diffusePS',chunk);
      m.setParameter('uPaint',[0,0,0]);m.setParameter('uPaintOn',0);
      m.update();instance.material=m;this.materials.push(m);
    }
  }
  /** A #rrggbb colour; the default (or nothing) shows the texture as it is. */
  set(colour:string|undefined):void {
    const next=isOriginal(colour)?'':colour!.toLowerCase();
    if(next===this.current)return;this.current=next;
    const hsv=next?colourHsv(next):DEFAULT_HSV;
    for(const m of this.materials){m.setParameter('uPaint',hsv);m.setParameter('uPaintOn',next?1:0);}
  }
  telemetry(){return {colour:this.current,materials:this.materials.length};}
  destroy():void {for(const m of this.materials)m.destroy();this.materials.length=0;}
}
