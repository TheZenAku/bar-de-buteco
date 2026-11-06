import * as pc from 'playcanvas';

/**
 * Smoke, and now and then a flame, from the Caveira em Chamas' two tail pipes (ponto_escape_1 / ponto_escape_2, on the chassis: their
 * axes are the bike's, +Z forward). Each pipe has one mesh of puffs and one quad for the backfire, both built by the vertex shader
 * from a few uniforms (no particles on the CPU): a puff is born at the pipe's mouth, drifts back and up and widens while it fades; at
 * speed it is left behind in the world (it streams back at the bike's speed for as long as it lives). A thin grey while the engine
 * idles, thicker and darker on the throttle. The backfire is a short orange tongue out of the pipe: a few seconds apart at random,
 * and more likely when the throttle is released at speed.
 */
const PUFFS=18,SMOKE_LIFE=1.7;

const smokeVertex=`
attribute vec3 aPosition;attribute vec2 aUv0;attribute vec4 aData;
uniform mat4 matrix_model;uniform mat4 matrix_viewProjection;uniform vec3 view_position;
uniform float uTime;uniform float uDensity;uniform float uSpeed;uniform float uThrottle;
varying vec2 vUv;varying float vAlpha;varying float vSeed;varying float vDark;
void main(){
  float seed=aData.x,rate=aData.y,sz=aData.z,side=aData.w;
  float life=fract(uTime*rate/${SMOKE_LIFE.toFixed(1)}+seed);
  float spd=clamp(uSpeed/12.,0.,1.);
  float age=life*${SMOKE_LIFE.toFixed(1)}*mix(1.,.45,spd);
  vec3 origin=(matrix_model*vec4(aPosition,1.)).xyz;
  vec3 back=normalize((matrix_model*vec4(0.,0.,-1.,0.)).xyz);
  vec3 left=normalize((matrix_model*vec4(1.,0.,0.,0.)).xyz);
  // out of the pipe, then the wind of the ride: still smoke stays in the world, so on the bike it streams back at its speed
  float out_=(.55+.5*uThrottle)*age*(1.-.5*age)+uSpeed*age*.95;
  float rise=.16*age+.1*age*age;
  vec3 c=origin+back*out_+vec3(0.,1.,0.)*rise+left*sin(seed*31.+age*2.4)*.05*age*(1.+spd);
  float w=(.05+.30*life+.12*uThrottle*life)*sz;
  vec3 toCam=normalize(view_position-c);
  vec3 r=normalize(cross(vec3(0.,1.,0.),toCam)+vec3(1e-4,0.,0.));
  vec3 u=cross(toCam,r);
  vec3 p=c+(r*(aUv0.x-.5)+u*(aUv0.y-.5))*2.*w;
  gl_Position=matrix_viewProjection*vec4(p,1.);
  vUv=aUv0;vSeed=seed;
  // a puff exists when the engine's density is above its own threshold: fewer, thinner puffs at idle
  float on=step(seed*.85,uDensity);
  vAlpha=on*smoothstep(0.,.06,life)*(1.-life)*(1.-life)*(.45+.6*uDensity)*min(sz,1.1);
  vDark=.55+.45*uThrottle;
}`;
const smokeFragment=`
precision highp float;
uniform sampler2D uNoise;uniform float uTime;uniform float uLight;
varying vec2 vUv;varying float vAlpha;varying float vSeed;varying float vDark;
void main(){
  vec2 q=vUv*2.-1.;float r=length(q);
  float n=texture2D(uNoise,vUv*.7+vec2(vSeed*5.3,vSeed*2.9+uTime*.03)).g;
  float a=(1.-smoothstep(.05+n*.12,1.,r));
  a=a*a*(.75+.25*n)*vAlpha;
  float shade=mix(.62,.28,vDark)*(.8+.4*n);
  gl_FragColor=vec4(vec3(shade)*uLight,a);
}`;
const flameVertex=`
attribute vec3 aPosition;attribute vec2 aUv0;
uniform mat4 matrix_model;uniform mat4 matrix_viewProjection;uniform vec3 view_position;
uniform float uFlame;uniform float uSpeed;
varying vec2 vUv;
void main(){
  vec3 origin=(matrix_model*vec4(aPosition,1.)).xyz;
  vec3 back=normalize((matrix_model*vec4(0.,0.,-1.,0.)).xyz);
  vec3 toCam=normalize(view_position-origin);
  vec3 side=cross(back,toCam);float sl=length(side);
  side=sl>1e-4?side/sl:vec3(0.,1.,0.);
  float len=1.0*uFlame,wid=.34*uFlame;
  vec3 p=origin+back*(aUv0.y*len-.04)+side*(aUv0.x-.5)*wid*(.5+(1.-aUv0.y)*.9);
  gl_Position=matrix_viewProjection*vec4(p,1.);
  vUv=aUv0;
}`;
const flameFragment=`
precision highp float;
uniform sampler2D uNoise;uniform float uTime;uniform float uFlame;uniform float uIntensity;
varying vec2 vUv;
void main(){
  float y=vUv.y,x=(vUv.x-.5)*2.;
  float n=texture2D(uNoise,vec2(vUv.x*.8,y*.9-uTime*4.)).r;
  float m=texture2D(uNoise,vec2(vUv.x*1.7+.3,y*1.6-uTime*7.)).g;
  x+=(n-.5)*1.2*y;
  float width=smoothstep(-.02,.12,y)*pow(1.-clamp(y,0.,1.),.7)*1.1+.0001;
  float body=1.-smoothstep(width*.1,width,abs(x));
  float tip=1.-smoothstep(.3,.95,y+(m-.5)*.5);
  float a=body*tip*uFlame;
  float heat=clamp(a*(1.15-y)*(.7+.5*n)*1.4,0.,1.);
  vec3 col=mix(vec3(.5,.04,0.),vec3(1.,.3,.03),smoothstep(.05,.4,heat));
  col=mix(col,vec3(1.,.72,.2),smoothstep(.4,.75,heat));
  col=mix(col,vec3(1.,.95,.75),smoothstep(.8,1.,heat));
  float i=a*uIntensity;
  gl_FragColor=vec4(col*i,i);
}`;

const noises=new WeakMap<pc.GraphicsDevice,pc.Texture>();
function noise(device:pc.GraphicsDevice):pc.Texture {
  let texture=noises.get(device);
  if(!texture){
    const size=64,data=new Uint8Array(size*size*4);
    let s=7654321;const rnd=()=>{s=(s*1103515245+12345)&0x7fffffff;return s/0x7fffffff;};
    for(let i=0;i<size*size;i++){data[i*4]=rnd()*255;data[i*4+1]=rnd()*255;data[i*4+2]=0;data[i*4+3]=255;}
    texture=new pc.Texture(device,{name:'moto-exhaust-noise',width:size,height:size,format:pc.PIXELFORMAT_RGBA8,mipmaps:true,
      minFilter:pc.FILTER_LINEAR_MIPMAP_LINEAR,magFilter:pc.FILTER_LINEAR,addressU:pc.ADDRESS_REPEAT,addressV:pc.ADDRESS_REPEAT,levels:[data]});
    noises.set(device,texture);
  }
  return texture;
}
interface Materials {smoke:pc.ShaderMaterial;flame:pc.ShaderMaterial}
const shared=new WeakMap<pc.GraphicsDevice,Materials>();
function materials(device:pc.GraphicsDevice):Materials {
  let m=shared.get(device);
  if(!m){
    const smoke=new pc.ShaderMaterial({uniqueName:'Moto exhaust smoke',vertexGLSL:smokeVertex,fragmentGLSL:smokeFragment,
      attributes:{aPosition:pc.SEMANTIC_POSITION,aUv0:pc.SEMANTIC_TEXCOORD0,aData:pc.SEMANTIC_TEXCOORD1}});
    smoke.blendState=new pc.BlendState(true,pc.BLENDEQUATION_ADD,pc.BLENDMODE_SRC_ALPHA,pc.BLENDMODE_ONE_MINUS_SRC_ALPHA,pc.BLENDEQUATION_ADD,pc.BLENDMODE_ZERO,pc.BLENDMODE_ONE);
    smoke.depthWrite=false;smoke.cull=pc.CULLFACE_NONE;smoke.setParameter('uNoise',noise(device));smoke.update();
    const flame=new pc.ShaderMaterial({uniqueName:'Moto exhaust flame',vertexGLSL:flameVertex,fragmentGLSL:flameFragment,
      attributes:{aPosition:pc.SEMANTIC_POSITION,aUv0:pc.SEMANTIC_TEXCOORD0}});
    flame.blendState=new pc.BlendState(true,pc.BLENDEQUATION_ADD,pc.BLENDMODE_ONE,pc.BLENDMODE_ONE,pc.BLENDEQUATION_ADD,pc.BLENDMODE_ZERO,pc.BLENDMODE_ONE);
    flame.depthWrite=false;flame.cull=pc.CULLFACE_NONE;flame.setParameter('uNoise',noise(device));flame.update();
    m={smoke,flame};shared.set(device,m);
  }
  return m;
}
function smokeMesh(device:pc.GraphicsDevice,seed:number):pc.Mesh {
  let s=seed;const rnd=()=>{s=(s*16807)%2147483647;return (s-1)/2147483646;};
  const positions:number[]=[],uvs:number[]=[],data:number[]=[],indices:number[]=[];
  for(let i=0;i<PUFFS;i++){
    const seedValue=(i+rnd()*.7)/PUFFS,rate=.85+rnd()*.35,size=.7+rnd()*.6;
    for(const [u,v] of [[0,0],[1,0],[1,1],[0,1]] as const){positions.push(0,0,0);uvs.push(u,v);data.push(seedValue,rate,size,0);}
    const b=i*4;indices.push(b,b+1,b+2,b,b+2,b+3);
  }
  const mesh=new pc.Mesh(device);
  mesh.setPositions(positions);mesh.setUvs(0,uvs);mesh.setVertexStream(pc.SEMANTIC_TEXCOORD1,data,4);mesh.setIndices(indices);mesh.update();
  mesh.aabb=new pc.BoundingBox(new pc.Vec3(0,.3,-5),new pc.Vec3(.6,1.2,6.5));
  return mesh;
}
function flameMesh(device:pc.GraphicsDevice):pc.Mesh {
  const mesh=new pc.Mesh(device);
  mesh.setPositions([0,0,0,0,0,0,0,0,0,0,0,0]);mesh.setUvs(0,[0,0,1,0,1,1,0,1]);mesh.setIndices([0,1,2,0,2,3]);mesh.update();
  mesh.aabb=new pc.BoundingBox(new pc.Vec3(0,0,-.35),new pc.Vec3(.3,.3,.45));
  return mesh;
}

interface Pipe {entity:pc.Entity;smoke:pc.MeshInstance;flame:pc.MeshInstance;next:number;burst:number;phase:number;shown:boolean}

export class MotoExhaust {
  private readonly pipes:Pipe[]=[];
  private readonly meshes:pc.Mesh[]=[];
  private time=Math.random()*20;
  private density=0;
  private throttle=0;
  private wasGas=false;
  /** Backfires on (the tail pipes spit now and then); tests turn them off or force one. */
  backfires=true;
  constructor(root:pc.Entity,device:pc.GraphicsDevice) {
    const {smoke,flame}=materials(device);
    for(const [name,seed,phase] of [['ponto_escape_1',911,0],['ponto_escape_2',2113,.37]] as const){
      const node=root.findByName(name) as pc.Entity|null;
      if(!node){console.warn(`moto: "${name}" não encontrado`);continue;}
      const sm=smokeMesh(device,seed),fm=flameMesh(device);this.meshes.push(sm,fm);
      const smokeInstance=new pc.MeshInstance(sm,smoke),flameInstance=new pc.MeshInstance(fm,flame);
      for(const instance of [smokeInstance,flameInstance]){instance.castShadow=false;instance.receiveShadow=false;}
      const entity=new pc.Entity(`Escape ${name}`);
      entity.addComponent('render',{meshInstances:[smokeInstance,flameInstance],castShadows:false,receiveShadows:false});
      entity.enabled=false;node.addChild(entity);
      this.pipes.push({entity,smoke:smokeInstance,flame:flameInstance,next:this.time+2+phase*5,burst:-10,phase,shown:false});
    }
  }
  /** Fire one backfire now (pipe index, or both). */
  backfire(pipe?:number):void {for(const [i,p] of this.pipes.entries())if(pipe===undefined||pipe===i)p.burst=this.time;}
  /** `light` scales the smoke's brightness (1 by day, less at night: it is not lit by anything but the street). */
  update(dt:number,speed:number,powered:boolean,gas:boolean,light:number,exposure:number):void {
    this.time+=dt;
    const idle=powered?.35:0,target=powered?(gas?1:idle):0;
    this.density+=(target-this.density)*(1-Math.exp(-(target>this.density?4:1.6)*dt));
    this.throttle+=((powered&&gas?1:0)-this.throttle)*(1-Math.exp(-3*dt));
    // the throttle let go at speed: the pipes may spit
    if(powered&&this.wasGas&&!gas&&Math.abs(speed)>4&&this.backfires)for(const p of this.pipes)if(Math.random()<.55)p.burst=this.time+Math.random()*.12;
    this.wasGas=powered&&gas;
    const visible=this.density>.02;
    for(const p of this.pipes){
      if(powered&&this.backfires&&this.time>p.next){p.next=this.time+2.5+Math.random()*5.5+(gas?1.5:0);if(Math.random()<.8)p.burst=this.time;}
      if(p.shown!==visible){p.entity.enabled=visible||this.time-p.burst<.4;p.shown=visible;}
      const sinceBurst=this.time-p.burst;
      // sharp rise, quick fall (about a fifth of a second)
      const flame=sinceBurst>=0&&sinceBurst<.3?Math.min(1,sinceBurst/.025)*Math.exp(-Math.max(0,sinceBurst-.025)*9):0;
      if(flame>0&&!p.entity.enabled)p.entity.enabled=true;
      if(!visible&&flame<=0.001&&p.entity.enabled)p.entity.enabled=false;
      const s=p.smoke,f=p.flame;
      s.visible=visible;s.setParameter('uTime',this.time+p.phase*3);s.setParameter('uDensity',this.density);s.setParameter('uSpeed',Math.abs(speed));
      s.setParameter('uThrottle',this.throttle);s.setParameter('uLight',light);
      f.visible=flame>0.001;f.setParameter('uTime',this.time);f.setParameter('uFlame',flame);f.setParameter('uSpeed',Math.abs(speed));
      f.setParameter('uIntensity',Math.min(1,flame*1.5)*1.2/Math.max(exposure,.1));
    }
  }
  telemetry() {return {density:+this.density.toFixed(3),pipes:this.pipes.map(p=>({parent:p.entity.parent?.name,shown:p.entity.enabled,flame:this.time-p.burst<.3}))};}
  destroy():void {for(const p of this.pipes)p.entity.destroy();for(const m of this.meshes)m.destroy();this.pipes.length=0;this.meshes.length=0;}
}
