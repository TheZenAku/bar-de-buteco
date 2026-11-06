import * as pc from 'playcanvas';

/**
 * The flames on the wheels of the Caveira em Chamas (moto_fogo.glb, scripts/58_moto_fogo.py). Each wheel gets one mesh of flame tongues
 * on the bone fogo_diant / fogo_tras: siblings of the wheels, so the flames follow the fork, the suspension and the lean but do not spin.
 * Every tongue is a quad the vertex shader turns to the camera and stretches along its own motion: it is born on the tread, rises,
 * leaves the tyre and, with speed, streams backwards; it lives a fraction of a second and is born again (no state on the CPU, one draw
 * call per wheel). The fragment shader draws a teardrop eaten by two scrolling noises, hotter (white-yellow) at its root and red at
 * its tip, added to what is behind it. A few embers rise higher.
 */
const TONGUES=72,EMBERS=14;
/** Tyre radius (moto_fogo.glb, 29,7 cm) and the half width of the tread the tongues are born on. */
const TYRE=.297,TREAD=.06;
/** Parked with the engine running the flames are this much of the full fire; at FULL_SPEED (m/s) they are all of it. */
const IDLE=.45,FULL_SPEED=12;

const vertex=`
attribute vec3 aPosition;attribute vec2 aUv0;attribute vec4 aData;
uniform mat4 matrix_model;uniform mat4 matrix_viewProjection;uniform vec3 view_position;
uniform float uTime;uniform float uLevel;uniform float uSpeed;uniform vec3 uBack;
varying vec2 vUv;varying float vSeed;varying float vKind;varying float vFade;varying float vHeat;varying float vEdge;
void main(){
  float seed=aData.x,size=aData.y,rate=aData.z,kind=aData.w;
  float life=fract(uTime*rate+seed);
  vec3 anchor=(matrix_model*vec4(aPosition,1.)).xyz;
  vec3 radial=normalize((matrix_model*vec4(0.,aPosition.yz,0.)).xyz);
  vec3 up=vec3(0.,1.,0.);
  float spd=clamp(uSpeed/13.,0.,1.);
  // the upper half of the tyre trails the fire; the lower half only licks upwards (no fire dragged along the ground)
  float high=smoothstep(-.05,.6,aPosition.y/${TYRE.toFixed(3)});
  float rise=mix(.05,.10,uLevel)+kind*.25;
  float drag=spd*high;
  // the root stays on the tread; the tongue grows and leans back with speed
  vec3 base=anchor+radial*(.012+.02*life)+up*rise*life*(1.-.5*drag)+uBack*drag*.07*life;
  base+=kind*(uBack*drag*.5+vec3(sin(seed*40.+uTime*3.1),0.,cos(seed*31.+uTime*2.7))*.03)*life;
  vec3 axis=normalize(up*(.16+rise)*(1.-.7*drag)+uBack*(.03+1.25*drag)+radial*.07);
  vec3 toCam=normalize(view_position-base);
  vec3 side=cross(axis,toCam);
  float sl=length(side);
  side=sl>1e-4?side/sl:normalize(cross(up,toCam)+vec3(1e-4,0.,0.));
  float w=size*mix(.7,1.,uLevel)*(1.-.35*life)*(1.+.25*drag);
  float h=kind>.5?w:w*(1.9+2.7*drag);
  // pulled a little towards the eye: the tongue wraps the tyre instead of being sliced by it (no hard edges where it enters the rubber)
  vec3 p=base+side*(aUv0.x-.5)*w+axis*(aUv0.y-.04)*h+toCam*.075;
  gl_Position=matrix_viewProjection*vec4(p,1.);
  vUv=aUv0;vSeed=seed;vKind=kind;
  // fire reads at the tyre's outline: tongues on the rubber that faces the eye are dimmed (no repeated scales seen head-on)
  float edge=1.-abs(dot(radial,toCam));
  vEdge=smoothstep(.12,.65,edge);
  vFade=smoothstep(0.,.12,life)*(1.-smoothstep(.5,1.,life))*mix(.5,1.,vEdge);
  vHeat=1.-.45*life;
}`;
const fragment=`
precision highp float;
uniform sampler2D uNoise;uniform float uTime;uniform float uLevel;uniform float uIntensity;
varying vec2 vUv;varying float vSeed;varying float vKind;varying float vFade;varying float vHeat;varying float vEdge;
void main(){
  float a;float heat;
  if(vKind>.5){
    float r=length(vUv-.5)*2.;
    a=1.-smoothstep(0.,1.,r);a*=a;
    heat=.8*a;
  }else{
    vec2 uv=vUv;
    float n=texture2D(uNoise,vec2(uv.x*.5+vSeed*7.31,uv.y*.6-uTime*2.1+vSeed*3.17)).r;
    float m=texture2D(uNoise,vec2(uv.x*1.2+vSeed*2.13,uv.y*1.4-uTime*3.6+vSeed*5.7)).g;
    float y=uv.y;
    // the tongue sways more towards its tip
    float x=(uv.x-.5)*2.+(n-.5)*1.1*y*y+(m-.5)*.25*y;
    float width=smoothstep(-.04,.18,y)*pow(1.-clamp(y,0.,1.),.8)*mix(1.9,1.15,vEdge)+.0001;
    float body=1.-smoothstep(width*mix(0.,.15,vEdge),width,abs(x));
    float tip=1.-smoothstep(mix(.12,.3,vEdge),.9,y+(m-.5)*.55);
    a=body*tip;
    heat=a*(1.05-y*1.05)*(.65+.6*n);
  }
  a*=vFade;
  heat=clamp(heat*vHeat*mix(.75,1.,uLevel),0.,1.);
  vec3 col=mix(vec3(.38,.015,0.),vec3(.95,.22,.02),smoothstep(.04,.38,heat));
  col=mix(col,vec3(1.,.6,.12),smoothstep(.38,.72,heat));
  col=mix(col,vec3(1.,.9,.6),smoothstep(.8,1.,heat));
  float i=a*uIntensity;
  gl_FragColor=vec4(col*i,i);
}`;

/** One random value noise per device, read by every bike: two channels of 64x64 cells, filtered and repeated. */
const noises=new WeakMap<pc.GraphicsDevice,pc.Texture>();
function noise(device:pc.GraphicsDevice):pc.Texture {
  let texture=noises.get(device);
  if(!texture){
    const size=64,data=new Uint8Array(size*size*4);
    let s=1234567;const rnd=()=>{s=(s*1103515245+12345)&0x7fffffff;return s/0x7fffffff;};
    for(let i=0;i<size*size;i++){data[i*4]=rnd()*255;data[i*4+1]=rnd()*255;data[i*4+2]=0;data[i*4+3]=255;}
    texture=new pc.Texture(device,{name:'moto-fire-noise',width:size,height:size,format:pc.PIXELFORMAT_RGBA8,mipmaps:true,
      minFilter:pc.FILTER_LINEAR_MIPMAP_LINEAR,magFilter:pc.FILTER_LINEAR,addressU:pc.ADDRESS_REPEAT,addressV:pc.ADDRESS_REPEAT,levels:[data]});
    noises.set(device,texture);
  }
  return texture;
}
/** The material every bike shares: what changes per wheel goes on its mesh instance. */
const materials=new WeakMap<pc.GraphicsDevice,pc.ShaderMaterial>();
function material(device:pc.GraphicsDevice):pc.ShaderMaterial {
  let m=materials.get(device);
  if(!m){
    m=new pc.ShaderMaterial({uniqueName:'Moto wheel fire',vertexGLSL:vertex,fragmentGLSL:fragment,
      attributes:{aPosition:pc.SEMANTIC_POSITION,aUv0:pc.SEMANTIC_TEXCOORD0,aData:pc.SEMANTIC_TEXCOORD1}});
    // Added to what is behind, keeping the canvas's alpha (as the lamp halos do).
    m.blendState=new pc.BlendState(true,pc.BLENDEQUATION_ADD,pc.BLENDMODE_ONE,pc.BLENDMODE_ONE,pc.BLENDEQUATION_ADD,pc.BLENDMODE_ZERO,pc.BLENDMODE_ONE);
    m.depthWrite=false;m.cull=pc.CULLFACE_NONE;
    m.setParameter('uNoise',noise(device));
    m.update();materials.set(device,m);
  }
  return m;
}
/** The tongues of one wheel, in the bone's frame (X the axle, Y up, Z forward): fixed layout, a seeded shuffle so both wheels differ. */
function flameMesh(device:pc.GraphicsDevice,seedBase:number):pc.Mesh {
  let s=seedBase;const rnd=()=>{s=(s*16807)%2147483647;return (s-1)/2147483646;};
  const count=TONGUES+EMBERS,positions:number[]=[],uvs:number[]=[],data:number[]=[],indices:number[]=[];
  for(let i=0;i<count;i++){
    const ember=i>=TONGUES;
    // Around the tread, skipping the patch on the ground (−90° ± 32°); embers from the upper half.
    let angle:number;
    if(ember)angle=(15+rnd()*150)*Math.PI/180;
    else{const span=360-70;angle=((i+rnd()*.9)/TONGUES*span-90+35)*Math.PI/180;}
    const radius=TYRE+(ember?.01:.004),x=(rnd()*2-1)*TREAD;
    const y=Math.sin(angle)*radius,z=Math.cos(angle)*radius;
    const size=ember?.014+rnd()*.014:.09+rnd()*.06,rate=ember?.5+rnd()*.3:1.15+rnd()*.75,seed=rnd();
    for(const [u,v] of [[0,0],[1,0],[1,1],[0,1]] as const){positions.push(x,y,z);uvs.push(u,v);data.push(seed,size,rate,ember?1:0);}
    const b=i*4;indices.push(b,b+1,b+2,b,b+2,b+3);
  }
  const mesh=new pc.Mesh(device);
  mesh.setPositions(positions);mesh.setUvs(0,uvs);mesh.setVertexStream(pc.SEMANTIC_TEXCOORD1,data,4);mesh.setIndices(indices);mesh.update();
  // The quads move in the shader: the box holds the tyre and the longest trail behind it.
  mesh.aabb=new pc.BoundingBox(new pc.Vec3(0,.12,-.3),new pc.Vec3(.4,.55,.95));
  return mesh;
}

interface Wheel {entity:pc.Entity;instance:pc.MeshInstance;phase:number}

export class MotoFire {
  private readonly wheels:Wheel[]=[];
  private readonly meshes:pc.Mesh[]=[];
  private level=0;
  private time=0;
  private readonly back=new Float32Array(3);
  /** 0 puts the flames out, 1 is all of them; speed and the engine scale it unless `follow` is off. */
  fire=1;
  follow=true;
  constructor(root:pc.Entity,device:pc.GraphicsDevice) {
    const shared=material(device);
    for(const [bone,seed,phase] of [['fogo_diant',97,0],['fogo_tras',4111,.43]] as const){
      const node=root.findByName(bone) as pc.Entity|null;
      if(!node){console.warn(`moto: osso "${bone}" não encontrado`);continue;}
      const mesh=flameMesh(device,seed);this.meshes.push(mesh);
      const instance=new pc.MeshInstance(mesh,shared);instance.castShadow=false;instance.receiveShadow=false;
      const entity=new pc.Entity(`Fogo ${bone}`);
      entity.addComponent('render',{meshInstances:[instance],castShadows:false,receiveShadows:false});
      node.addChild(entity);
      this.wheels.push({entity,instance,phase});
    }
    this.time=Math.random()*10;
  }
  /** `speed` in m/s, `back` the bike's backwards direction in the world, `powered` whether the engine runs. */
  update(dt:number,speed:number,back:pc.Vec3,powered:boolean,exposure:number):void {
    let target=pc.math.clamp(this.fire,0,1);
    if(this.follow)target*=powered?IDLE+(1-IDLE)*pc.math.clamp(Math.abs(speed)/FULL_SPEED,0,1):0;
    this.level+=(target-this.level)*(1-Math.exp(-4*dt));
    this.time+=dt;
    const visible=this.level>.02;
    this.back[0]=back.x;this.back[1]=0;this.back[2]=back.z;
    const flat=Math.hypot(back.x,back.z)||1;this.back[0]/=flat;this.back[2]/=flat;
    for(const wheel of this.wheels){
      if(wheel.entity.enabled!==visible)wheel.entity.enabled=visible;
      if(!visible)continue;
      const {instance}=wheel;
      instance.setParameter('uTime',this.time+wheel.phase);
      instance.setParameter('uLevel',this.level);
      instance.setParameter('uSpeed',Math.abs(speed));
      instance.setParameter('uBack',this.back);
      // Seen the same by day and by night (the lamps do the same with the exposure).
      instance.setParameter('uIntensity',Math.min(1,this.level*1.6)*1.15/Math.max(exposure,.1));
    }
  }
  telemetry() {
    return {level:+this.level.toFixed(3),wheels:this.wheels.map(w=>({name:w.entity.name,visible:w.entity.enabled,parent:w.entity.parent?.name}))};
  }
  destroy():void {for(const wheel of this.wheels)wheel.entity.destroy();for(const mesh of this.meshes)mesh.destroy();this.wheels.length=0;this.meshes.length=0;}
}
