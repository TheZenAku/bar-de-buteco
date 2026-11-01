import * as pc from 'playcanvas';

/**
 * What a blow looks like, for an instant: a star where the foot lands, and dust where a body hits the floor. Quads that face the camera, a few kept and
 * reused. There is no bloom in the scene, so the star brings its own glow; both leave the canvas's alpha alone (the page would show through).
 */
const VERTEX=`
attribute vec3 aPosition;attribute vec2 aUv0;
uniform mat4 matrix_model;uniform mat4 matrix_viewProjection;
varying vec2 vUv;
void main(){vUv=aUv0*2.-1.;gl_Position=matrix_viewProjection*matrix_model*vec4(aPosition,1.);}`;
const STAR=`
precision highp float;
uniform float fxAge;uniform float fxSeed;
varying vec2 vUv;
void main(){
  float r=length(vUv),a=atan(vUv.y,vUv.x)+fxSeed,grow=sqrt(fxAge);
  float spikes=abs(cos(a*4.5))*.6+abs(cos(a*2.+fxSeed*3.))*.4;
  float reach=(.2+.8*grow)*(.28+.72*spikes*spikes);
  float star=1.-smoothstep(reach*.2,reach,r);
  float core=1.-smoothstep(0.,.3*(1.-fxAge),r);
  float ring=(1.-smoothstep(0.,.05,abs(r-(.15+.8*grow))))*(1.-fxAge);
  float fade=(1.-fxAge)*(1.-fxAge);
  gl_FragColor=vec4(mix(vec3(1.,.66,.22),vec3(1.,.96,.82),clamp(core+star*.5,0.,1.)),clamp(star*.9+core+ring*.55,0.,1.)*fade);
}`;
const DUST=`
precision highp float;
uniform float fxAge;uniform float fxSeed;
varying vec2 vUv;
void main(){
  float a=atan(vUv.y,vUv.x)+fxSeed,r=length(vUv)*(1.+.14*sin(a*5.)+.08*sin(a*11.+fxSeed));
  float soft=1.-smoothstep(.1,1.,r);
  gl_FragColor=vec4(.62,.57,.5,soft*soft*.38*(1.-fxAge)*min(1.,fxAge*9.));
}`;
const STAR_SECONDS=.2,DUST_SECONDS=.55;
const POOL=6,DUST_PUFFS=3;

interface Quad {entity:pc.Entity;instance:pc.MeshInstance;age:number;seconds:number;from:number;to:number}

export class BlowEffects {
  private readonly stars:Quad[]=[];
  private readonly dust:Quad[]=[];
  private readonly starMaterial:pc.ShaderMaterial;
  private readonly dustMaterial:pc.ShaderMaterial;

  constructor(private readonly app:pc.AppBase) {
    const material=(name:string,fragment:string,blend:pc.BlendState)=>{
      const made=new pc.ShaderMaterial({uniqueName:name,attributes:{aPosition:pc.SEMANTIC_POSITION,aUv0:pc.SEMANTIC_TEXCOORD0},vertexGLSL:VERTEX,fragmentGLSL:fragment});
      made.blendState=blend;made.depthWrite=false;made.cull=pc.CULLFACE_NONE;made.update();
      return made;
    };
    this.starMaterial=material('Kick star',STAR,new pc.BlendState(true,pc.BLENDEQUATION_ADD,pc.BLENDMODE_SRC_ALPHA,pc.BLENDMODE_ONE,pc.BLENDEQUATION_ADD,pc.BLENDMODE_ZERO,pc.BLENDMODE_ONE));
    // Over the body it comes from: a foot sits inside the one it hits.
    this.starMaterial.depthTest=false;this.starMaterial.update();
    this.dustMaterial=material('Fall dust',DUST,new pc.BlendState(true,pc.BLENDEQUATION_ADD,pc.BLENDMODE_SRC_ALPHA,pc.BLENDMODE_ONE_MINUS_SRC_ALPHA,pc.BLENDEQUATION_ADD,pc.BLENDMODE_ZERO,pc.BLENDMODE_ONE));
  }
  private quad(list:Quad[],material:pc.Material):Quad {
    const free=list.find(item=>!item.entity.enabled);
    if(free)return free;
    if(list.length>=POOL)return list.reduce((oldest,item)=>item.age/item.seconds>oldest.age/oldest.seconds?item:oldest);
    const entity=new pc.Entity('Blow effect');
    entity.addComponent('render',{type:'plane',castShadows:false,receiveShadows:false});
    const instance=entity.render!.meshInstances[0]!;
    instance.material=material;instance.cull=false;
    this.app.root.addChild(entity);
    const item={entity,instance,age:0,seconds:1,from:1,to:1};
    list.push(item);
    return item;
  }
  private start(item:Quad,x:number,y:number,z:number,seconds:number,from:number,to:number):void {
    item.age=0;item.seconds=seconds;item.from=from;item.to=to;item.entity.enabled=true;item.entity.setPosition(x,y,z);
    item.instance.setParameter('fxSeed',Math.random()*6.28);item.instance.setParameter('fxAge',0);
  }
  /** Where a foot landed; `size`: how far the star reaches (metres). */
  star(at:{x:number;y:number;z:number},size:number):void {
    this.start(this.quad(this.stars,this.starMaterial),at.x,at.y,at.z,STAR_SECONDS,size*1.7,size*2);
  }
  /** A body hit the floor here (y of the floor). `hard`: 0 to 1. */
  puff(x:number,y:number,z:number,hard:number):void {
    for(let i=0;i<DUST_PUFFS;i++){
      const a=Math.random()*6.28,off=.08+Math.random()*.22;
      this.start(this.quad(this.dust,this.dustMaterial),x+Math.cos(a)*off,y+.1+Math.random()*.12,z+Math.sin(a)*off,DUST_SECONDS*(.8+Math.random()*.4),.25,.75+.55*hard);
    }
  }
  /** One frame: they grow, fade and keep facing the camera. */
  update(dt:number,camera:pc.Entity):void {
    for(const item of [...this.stars,...this.dust]){
      if(!item.entity.enabled)continue;
      item.age+=dt;
      const age=item.age/item.seconds;
      if(age>=1){item.entity.enabled=false;continue;}
      item.instance.setParameter('fxAge',age);
      const size=item.from+(item.to-item.from)*Math.sqrt(age);
      item.entity.setLocalScale(size,size,size);
      // The plane lies flat, facing up: its top turned towards the eye.
      item.entity.setRotation(camera.getRotation());
      item.entity.rotateLocal(90,0,0);
    }
  }
  /** How many are showing (tests). */
  get showing():number {return [...this.stars,...this.dust].filter(item=>item.entity.enabled).length;}
  destroy():void {
    for(const item of [...this.stars,...this.dust])item.entity.destroy();
    this.starMaterial.destroy();this.dustMaterial.destroy();
  }
}
