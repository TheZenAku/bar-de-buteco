import * as pc from 'playcanvas';

/**
 * A "poof": a ring of soft smoke clouds that blows outwards, climbs and thins out. Reusable for any magic arrival (Tião's horse today).
 * No texture files: each cloud is a camera-facing quad whose puffy, eroding shape is drawn by a noise shader and tinted by one colour,
 * picked at random for every burst. Plain alpha blending, so the canvas's own alpha is left alone.
 */
const VERTEX=`
attribute vec3 aPosition;attribute vec2 aUv0;
uniform mat4 matrix_model;uniform mat4 matrix_viewProjection;
varying vec2 vUv;
void main(){vUv=aUv0*2.-1.;gl_Position=matrix_viewProjection*matrix_model*vec4(aPosition,1.);}`;
const CLOUD=`
precision highp float;
uniform float fxAge;uniform float fxSeed;uniform vec3 fxColor;
varying vec2 vUv;
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p=p*2.03+17.1;a*=.5;}return v;}
void main(){
  float spin=fxSeed+fxAge*(.6+fract(fxSeed)*.8),c=cos(spin),s=sin(spin);
  vec2 q=mat2(c,-s,s,c)*vUv;
  float n=fbm(q*2.1+fxSeed*5.7);
  float r=length(vUv);
  // Billowy rim, then the thin parts burn away first as the cloud ages.
  float body=1.-smoothstep(.28,.98,r+(n-.5)*.85);
  body*=smoothstep(fxAge*.5,fxAge*.5+.3,n+.5);
  float fade=pow(1.-fxAge,1.15)*min(1.,fxAge*16.);
  vec2 lightDir=normalize(vec2(-.45,.75));
  float lit=clamp(.62+.42*dot(vUv,lightDir)*(1.-n*.5)+.25*(n-.5),0.,1.2);
  vec3 col=fxColor*lit;
  col=mix(col,vec3(1.),smoothstep(.55,1.,lit)*.28);
  gl_FragColor=vec4(col,clamp(body*fade*1.25,0.,1.));
}`;
const POOL=56,PUFFS=48,COLUMN=20,SECONDS=2;

interface Cloud {entity:pc.Entity;instance:pc.MeshInstance;age:number;seconds:number;from:number;to:number;vx:number;vy:number;vz:number;drag:number;rise:number}

/** Saturated, readable on both day and night streets; the hue is the only thing left to chance. */
export function randomSmokeColor(random:()=>number=Math.random):[number,number,number] {
  const hue=random(),sat=.5+.35*random(),val=.82+.16*random();
  const k=(n:number)=>(n+hue*6)%6;
  const f=(n:number)=>val-val*sat*Math.max(0,Math.min(k(n),4-k(n),1));
  return [f(5),f(3),f(1)];
}

export class SmokeBurst {
  private readonly clouds:Cloud[]=[];
  private readonly material:pc.ShaderMaterial;
  /** The colour of the burst that started last (tests, and to tint something else to match). */
  lastColor:[number,number,number]=[1,1,1];

  constructor(private readonly app:pc.AppBase) {
    this.material=new pc.ShaderMaterial({uniqueName:'Smoke burst',attributes:{aPosition:pc.SEMANTIC_POSITION,aUv0:pc.SEMANTIC_TEXCOORD0},vertexGLSL:VERTEX,fragmentGLSL:CLOUD});
    this.material.blendState=new pc.BlendState(true,pc.BLENDEQUATION_ADD,pc.BLENDMODE_SRC_ALPHA,pc.BLENDMODE_ONE_MINUS_SRC_ALPHA,pc.BLENDEQUATION_ADD,pc.BLENDMODE_ZERO,pc.BLENDMODE_ONE);
    this.material.depthWrite=false;this.material.cull=pc.CULLFACE_NONE;this.material.update();
  }
  private cloud():Cloud {
    const free=this.clouds.find(item=>!item.entity.enabled);
    if(free)return free;
    if(this.clouds.length>=POOL)return this.clouds.reduce((oldest,item)=>item.age/item.seconds>oldest.age/oldest.seconds?item:oldest);
    const entity=new pc.Entity('Smoke cloud');
    entity.addComponent('render',{type:'plane',castShadows:false,receiveShadows:false});
    const instance=entity.render!.meshInstances[0]!;
    instance.material=this.material;instance.cull=false;
    this.app.root.addChild(entity);
    const item:Cloud={entity,instance,age:0,seconds:1,from:1,to:1,vx:0,vy:0,vz:0,drag:2,rise:0};
    this.clouds.push(item);
    return item;
  }
  /**
   * Blow a ring of smoke out of the ground at (x,y,z). `radius`: how far the cloud reaches (metres); `color`: a random one when omitted.
   * Returns the colour used.
   */
  burst(x:number,y:number,z:number,radius=1.8,color:[number,number,number]=randomSmokeColor()):[number,number,number] {
    this.lastColor=color;
    for(let i=0;i<PUFFS;i++){
      const item=this.cloud();
      // Two rings and a few columns: low fat puffs on the ground, higher ones that climb.
      const column=i>=PUFFS-COLUMN,a=Math.random()*Math.PI*2,out=column?Math.random()*.3:.55+Math.random()*.45;
      const start=(column?.2:.4)*radius*Math.random();
      const speed=(column?.9:1.9+Math.random()*1.1)*radius*out;
      item.age=-Math.random()*.12;
      item.seconds=SECONDS*(.75+Math.random()*.5);
      item.from=radius*(column?.6:.45)*(.7+Math.random()*.5);
      item.to=radius*(column?1.6:1.25)*(.8+Math.random()*.5);
      item.vx=Math.cos(a)*speed;item.vz=Math.sin(a)*speed;
      item.vy=column?2+Math.random()*2.2:.25+Math.random()*.6;
      item.drag=2.2+Math.random()*.9;item.rise=.4+Math.random()*.5;
      item.entity.enabled=true;
      item.entity.setPosition(x+Math.cos(a)*start,y+.25+(column?Math.random()*.7:Math.random()*.35),z+Math.sin(a)*start);
      item.entity.setLocalScale(0,0,0);
      item.instance.setParameter('fxSeed',Math.random()*6.28);item.instance.setParameter('fxAge',0);
      item.instance.setParameter('fxColor',[color[0]*(.88+.24*Math.random()),color[1]*(.88+.24*Math.random()),color[2]*(.88+.24*Math.random())]);
    }
    return color;
  }
  /** One frame: they drift, slow down, swell, thin out and keep facing the camera. */
  update(dt:number,camera:pc.Entity):void {
    for(const item of this.clouds){
      if(!item.entity.enabled)continue;
      item.age+=dt;
      if(item.age<0){item.entity.setLocalScale(0,0,0);continue;}
      const age=item.age/item.seconds;
      if(age>=1){item.entity.enabled=false;continue;}
      const damp=Math.exp(-item.drag*dt);
      item.vx*=damp;item.vz*=damp;item.vy=item.vy*damp+item.rise*dt*(1-age);
      const p=item.entity.getPosition();
      item.entity.setPosition(p.x+item.vx*dt,p.y+item.vy*dt,p.z+item.vz*dt);
      item.instance.setParameter('fxAge',age);
      const size=item.from+(item.to-item.from)*Math.sqrt(age);
      item.entity.setLocalScale(size,size,size);
      // The plane lies flat, facing up: its top turned towards the eye.
      item.entity.setRotation(camera.getRotation());
      item.entity.rotateLocal(90,0,0);
    }
  }
  /** How many clouds are showing (tests). */
  get showing():number {return this.clouds.filter(item=>item.entity.enabled).length;}
  destroy():void {
    for(const item of this.clouds)item.entity.destroy();
    this.material.destroy();
  }
}
