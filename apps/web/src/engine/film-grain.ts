import * as pc from 'playcanvas';

const VERTEX=`
attribute vec2 aPosition;
void main(){gl_Position=vec4(aPosition,0.,1.);}`;
/**
 * Two half-passes of the same noise: one adds where the grain is positive, the other subtracts where it is negative. Blending can only go
 * one way per draw, and the picture is never read back, so this costs two flat quads and no copy of the frame. Two hashes added make
 * the grain triangular: most grains are faint and a few stand out, as on film, instead of the flat spread of a single hash.
 */
const FRAGMENT=`
precision highp float;
uniform float amount,time,cell,side;
float hash(vec2 p){p=fract(p*vec2(.1031,.1030));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}
void main(){
  vec2 grain=floor(gl_FragCoord.xy/cell);
  vec2 shift=vec2(time*37.1,time*91.7);
  float noise=hash(grain+shift)+hash(grain+shift.yx+17.3)-1.;
  float value=noise*side;
  if(value<=0.)discard;
  gl_FragColor=vec4(vec3(value*amount),1.);
}`;

/** What each level of the graphics option draws: the peak, as a fraction of full brightness, and what the player reads. */
export const GRAIN_AMOUNT={off:0,light:.034,medium:.06,strong:.095} as const;
export type GrainLevel=keyof typeof GRAIN_AMOUNT;
/** Grain moves like film: a new pattern 24 times a second, not on every frame at 120 Hz. */
const FRAMES=24;

/**
 * Light film grain over the finished frame. The canvas is transparent in the TVs' apertures: the blend is weighted by the canvas's own
 * alpha (destination alpha), so the video behind a transparent hole is left alone, and alpha is never written.
 */
export class FilmGrain {
  private readonly shader:pc.Shader;
  private readonly add=new pc.BlendState(true,pc.BLENDEQUATION_ADD,pc.BLENDMODE_DST_ALPHA,pc.BLENDMODE_ONE,pc.BLENDEQUATION_ADD,pc.BLENDMODE_ZERO,pc.BLENDMODE_ONE,true,true,true,false);
  private readonly subtract=new pc.BlendState(true,pc.BLENDEQUATION_REVERSE_SUBTRACT,pc.BLENDMODE_DST_ALPHA,pc.BLENDMODE_ONE,pc.BLENDEQUATION_ADD,pc.BLENDMODE_ZERO,pc.BLENDMODE_ONE,true,true,true,false);
  private amount=0;
  /** Frames it drew (tests). */
  drawn=0;

  constructor(private readonly app:pc.AppBase) {
    this.shader=pc.ShaderUtils.createShader(app.graphicsDevice,{uniqueName:'Film grain',attributes:{aPosition:pc.SEMANTIC_POSITION},vertexGLSL:VERTEX,fragmentGLSL:FRAGMENT});
    app.on('postrender',this.draw,this);
  }
  set(level:GrainLevel):void {
    this.amount=GRAIN_AMOUNT[level]??0;
    // A frame with no other reason to draw (a still menu) must still show the change.
    this.app.renderNextFrame=true;
  }
  get level():number {return this.amount;}
  private draw():void {
    // A headset draws its own framebuffers: no grain there (the speed blur stays out of it the same way).
    if(this.amount<=0||this.app.xr?.active)return;
    const device=this.app.graphicsDevice,canvas=device.canvas as HTMLCanvasElement;
    // One grain is about one CSS pixel on any screen, and not a smaller speck on a dense one or a coarser one at a lowered render scale.
    const cell=Math.max(1,canvas.clientWidth?canvas.width/canvas.clientWidth:1);
    const scope=device.scope;
    scope.resolve('amount').setValue(this.amount);
    scope.resolve('time').setValue(Math.floor(performance.now()/1000*FRAMES)%4096);
    scope.resolve('cell').setValue(cell);
    device.setDepthState(pc.DepthState.NODEPTH);
    device.setCullMode(pc.CULLFACE_NONE);
    for(const [side,blend] of [[1,this.add],[-1,this.subtract]] as const){
      scope.resolve('side').setValue(side);
      device.setBlendState(blend);
      pc.drawQuadWithShader(device,null,this.shader);
    }
    device.setBlendState(pc.BlendState.NOBLEND);
    this.drawn++;
  }
  destroy():void {this.app.off('postrender',this.draw,this);}
}
