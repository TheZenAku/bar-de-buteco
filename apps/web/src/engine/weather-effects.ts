import * as pc from 'playcanvas';
import {rainSurfaceHeight,type WeatherSample} from '@bar/shared';

const MAX_DROPS=2400,SPAN=32;
const VERTEX=`attribute vec3 aPosition;attribute vec3 aNormal;attribute vec2 aUv0;
uniform mat4 matrix_viewProjection;uniform vec3 rainRight;uniform float rainTime;uniform float rainTop;uniform float rainWind;uniform float rainDensity;
varying vec2 uv;varying float visible;varying float distanceFade;
uniform vec3 rainEye;
void main(){
 float seed=aNormal.x,travel=fract(rainTime*(.7+floor(seed*3.)*.1)+seed)*20.;
 float height=rainTop-travel,streak=.4+rainWind*.4;
 vec3 p=vec3(aPosition.x,height,aPosition.z)+rainRight*aUv0.x*(.009+seed*.009)+vec3(rainWind*.32,-1.,rainWind*.12)*aUv0.y*streak;
 uv=aUv0;visible=step(seed,rainDensity)*step(aPosition.y+.08,p.y);
 distanceFade=1.-smoothstep(10.,17.,length(p.xz-rainEye.xz));
 gl_Position=matrix_viewProjection*vec4(p,1.);
}`;
const FRAGMENT=`precision highp float;varying vec2 uv;varying float visible;varying float distanceFade;
uniform float rainLight;void main(){
 float alpha=(1.-abs(uv.x))*(1.-abs(uv.y-.5)*1.5)*visible*distanceFade*.65;
 if(alpha<.008)discard;
 gl_FragColor=vec4(vec3(.55,.68,.8)*rainLight,alpha);
}`;
const hash=(i:number)=>{const value=Math.sin(i*127.1+311.7)*43758.5453;return value-Math.floor(value);};

/** One transparent draw call; falling motion runs on the GPU, roof tests only when the camera enters another cell. */
export class WeatherEffects {
  private readonly entity=new pc.Entity('Outdoor rain');
  private readonly material:pc.ShaderMaterial;
  private readonly mesh:pc.Mesh;
  private readonly positions=new Float32Array(MAX_DROPS*4*3);
  private cell='';
  private budget=1800;
  private drops=0;
  private sheltered=false;
  private roof=0;
  private right=new pc.Vec3();
  constructor(private readonly app:pc.Application,private readonly camera:pc.Entity){
    this.material=new pc.ShaderMaterial({uniqueName:'Outdoor rain streaks',attributes:{aPosition:pc.SEMANTIC_POSITION,aNormal:pc.SEMANTIC_NORMAL,aUv0:pc.SEMANTIC_TEXCOORD0},vertexGLSL:VERTEX,fragmentGLSL:FRAGMENT});
    this.material.cull=pc.CULLFACE_NONE;this.material.depthWrite=false;
    this.material.blendState=new pc.BlendState(true,pc.BLENDEQUATION_ADD,pc.BLENDMODE_SRC_ALPHA,pc.BLENDMODE_ONE_MINUS_SRC_ALPHA,pc.BLENDEQUATION_ADD,pc.BLENDMODE_ZERO,pc.BLENDMODE_ONE);
    this.material.update();
    const normals=new Float32Array(MAX_DROPS*4*3),uvs=new Float32Array(MAX_DROPS*4*2),indices:number[]=[];
    for(let i=0;i<MAX_DROPS;i++){
      const seed=hash(i+1);for(let v=0;v<4;v++){normals[(i*4+v)*3]=seed;uvs.set([v===0||v===3?-1:1,v<2?0:1],(i*4+v)*2);}
      const a=i*4;indices.push(a,a+1,a+2,a,a+2,a+3);
    }
    this.mesh=new pc.Mesh(app.graphicsDevice);this.mesh.setPositions(this.positions);this.mesh.setNormals(normals);this.mesh.setUvs(0,uvs);this.mesh.setIndices(indices);this.mesh.update(pc.PRIMITIVE_TRIANGLES,false);
    const instance=new pc.MeshInstance(this.mesh,this.material);instance.cull=false;
    this.entity.addComponent('render',{meshInstances:[instance],castShadows:false,receiveShadows:false});app.root.addChild(this.entity);this.entity.enabled=false;
  }
  setQuality(quality:string):void {this.budget=quality==='off'||quality==='low'?650:quality==='medium'?1100:quality==='ultra'?MAX_DROPS:1800;}
  update(time:number,weather:WeatherSample,daylight:number):boolean {
    this.entity.enabled=weather.rain>.005;this.drops=Math.round(weather.rain*this.budget);
    if(!this.entity.enabled){this.sheltered=false;return false;}
    const eye=this.camera.getPosition(),cx=Math.floor(eye.x/6)*6,cz=Math.floor(eye.z/6)*6,key=`${cx}:${cz}`;
    if(key!==this.cell){
      this.cell=key;
      for(let i=0;i<MAX_DROPS;i++){
        const x=cx+(hash(i*3+11)-.5)*SPAN,z=cz+(hash(i*3+12)-.5)*SPAN,roof=rainSurfaceHeight(x,z);
        for(let v=0;v<4;v++)this.positions.set([x,roof,z],(i*4+v)*3);
      }
      this.mesh.setPositions(this.positions);this.mesh.update(pc.PRIMITIVE_TRIANGLES,false);
    }
    this.roof=rainSurfaceHeight(eye.x,eye.z);this.sheltered=this.roof>eye.y+.2;
    this.right.copy(this.camera.right);this.right.y=0;this.right.normalize();
    for(const [name,value] of Object.entries({rainEye:[eye.x,eye.y,eye.z],rainRight:this.right.toArray(),rainTime:(time%120_000)/1000,rainTop:eye.y+12,
      rainWind:weather.wind,rainDensity:weather.rain*this.budget/MAX_DROPS,rainLight:.5+daylight*.65}))this.material.setParameter(name,value);
    return this.sheltered;
  }
  telemetry(){return {enabled:this.entity.enabled,drops:this.drops,budget:this.budget,sheltered:this.sheltered,roof:this.roof};}
  destroy():void {this.entity.destroy();this.mesh.destroy();this.material.destroy();}
}
