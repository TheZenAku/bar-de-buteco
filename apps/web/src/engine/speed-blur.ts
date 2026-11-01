import * as pc from 'playcanvas';

const VERTEX=`
attribute vec2 aPosition;
varying vec2 vUv;
void main(){gl_Position=vec4(aPosition,0.,1.);vUv=aPosition*.5+.5;}`;
/**
 * Each pixel looks back along the line to the middle of the view, more towards the corners: the centre stays sharp, the edges streak. The
 * offset of each pixel's samples changes per pixel, so eight of them read as smooth instead of as eight copies.
 */
const FRAGMENT=`
precision highp float;
uniform sampler2D source;uniform float strength;
varying vec2 vUv;
const float SAMPLES=8.;
void main(){
  vec2 away=vUv-vec2(.5,.47);
  float edge=smoothstep(.85,1.4,length(away*2.)),reach=edge*strength;
  if(reach<.004)discard;
  float jitter=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));
  vec3 colour=vec3(0.);
  for(float i=0.;i<SAMPLES;i++)colour+=texture2D(source,vUv-away*reach*.09*(i+jitter)/SAMPLES).rgb;
  gl_FragColor=vec4(colour/SAMPLES*(1.-.06*reach),1.);
}`;

/**
 * The radial blur at the edges of the screen at speed. The scene has no post-processing chain, and its canvas is transparent in the TVs'
 * apertures: this runs after the frame is drawn, on a copy of it, and writes colour only. It costs nothing below the speed where it starts.
 */
export class SpeedBlur {
  private readonly shader:pc.Shader;
  private readonly keepAlpha=new pc.BlendState(false);
  private target?:pc.RenderTarget;
  private strength=0;
  /** How many frames it drew (tests). */
  drawn=0;

  constructor(private readonly app:pc.AppBase) {
    this.shader=pc.ShaderUtils.createShader(app.graphicsDevice,{uniqueName:'Moto speed blur',attributes:{aPosition:pc.SEMANTIC_POSITION},vertexGLSL:VERTEX,fragmentGLSL:FRAGMENT});
    this.keepAlpha.setColorWrite(true,true,true,false);
    app.on('postrender',this.draw,this);
  }
  /** 0 is off, 1 is flat out. */
  set(strength:number):void {this.strength=strength;}
  private copy(device:pc.GraphicsDevice):pc.RenderTarget {
    const {width,height}=device;
    if(this.target?.width===width&&this.target.height===height)return this.target;
    this.target?.colorBuffer?.destroy();this.target?.destroy();
    const colorBuffer=new pc.Texture(device,{name:'Moto speed blur',width,height,format:pc.PIXELFORMAT_RGBA8,mipmaps:false,minFilter:pc.FILTER_LINEAR,magFilter:pc.FILTER_LINEAR,addressU:pc.ADDRESS_CLAMP_TO_EDGE,addressV:pc.ADDRESS_CLAMP_TO_EDGE});
    return this.target=new pc.RenderTarget({colorBuffer,depth:false,samples:1});
  }
  private draw():void {
    if(this.strength<.01)return;
    const device=this.app.graphicsDevice,target=this.copy(device);
    // WebGL's: the back buffer into the copy, with its antialiasing resolved. The engine's own scene-colour grab runs before the transparent layers.
    if(!(device as pc.WebglGraphicsDevice).copyRenderTarget(undefined,target,true,false))return;
    device.scope.resolve('source').setValue(target.colorBuffer);
    device.scope.resolve('strength').setValue(this.strength);
    device.setBlendState(this.keepAlpha);
    device.setDepthState(pc.DepthState.NODEPTH);
    device.setCullMode(pc.CULLFACE_NONE);
    pc.drawQuadWithShader(device,null,this.shader);
    device.setBlendState(pc.BlendState.NOBLEND);
    this.drawn++;
  }
  destroy():void {
    this.app.off('postrender',this.draw,this);
    this.target?.colorBuffer?.destroy();this.target?.destroy();
  }
}
