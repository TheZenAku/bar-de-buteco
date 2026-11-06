import * as pc from 'playcanvas';
import {FIREWORK,fireworkPosition,type FireworkShot,type FireworkVector} from '@bar/shared';

const VERTEX=`attribute vec3 aPosition;attribute vec2 aUv0;attribute vec4 aColor;
uniform mat4 matrix_viewProjection;varying vec2 uv;varying vec4 tint;
void main(){uv=aUv0;tint=aColor;gl_Position=matrix_viewProjection*vec4(aPosition,1.);}`;
const FRAGMENT=`precision highp float;varying vec2 uv;varying vec4 tint;
void main(){float r=length(uv*2.-1.);float glow=pow(max(0.,1.-r),1.3);
vec3 light=mix(tint.rgb*2.8,vec3(3.),pow(max(0.,1.-r),6.));
gl_FragColor=vec4(light,tint.a*glow);}`;
const SPARKS=80;
interface Flight {shot:FireworkShot;burst:boolean}

/** One mesh for all glowing trails and bursts, capped even in a crowded room. */
export class Fireworks {
  private readonly flights:Flight[]=[];
  private readonly mesh:pc.Mesh;
  private readonly entity=new pc.Entity('Firework sparks');
  private readonly material:pc.ShaderMaterial;
  private readonly propMaterials:pc.StandardMaterial[]=[];
  private audio?:AudioContext;
  private noise?:AudioBuffer;
  private readonly sounds=new Set<AudioScheduledSourceNode>();
  private eye=new pc.Vec3();
  private right=new pc.Vec3(1,0,0);
  private readonly unlock=()=>{
    this.audio??=new AudioContext();
    if(this.audio.state==='suspended')void this.audio.resume().catch(()=>{});
  };
  constructor(private readonly app:pc.AppBase,private readonly volume:()=>number) {
    this.material=new pc.ShaderMaterial({uniqueName:'Firework glow',attributes:{aPosition:pc.SEMANTIC_POSITION,aUv0:pc.SEMANTIC_TEXCOORD0,aColor:pc.SEMANTIC_COLOR},vertexGLSL:VERTEX,fragmentGLSL:FRAGMENT});
    this.material.blendType=pc.BLEND_ADDITIVEALPHA;this.material.depthWrite=false;this.material.cull=pc.CULLFACE_NONE;this.material.update();
    this.mesh=new pc.Mesh(app.graphicsDevice);
    this.entity.addComponent('render',{meshInstances:[new pc.MeshInstance(this.mesh,this.material)],castShadows:false,receiveShadows:false});
    this.entity.enabled=false;app.root.addChild(this.entity);
    window.addEventListener('pointerdown',this.unlock);window.addEventListener('keydown',this.unlock);
  }
  makeProp(parent:pc.Entity):pc.Entity {
    const root=new pc.Entity('Rojão na mão');parent.addChild(root);
    const mat=(hex:string)=>{
      const material=new pc.StandardMaterial();material.diffuse=new pc.Color().fromString(hex);material.gloss=35;material.update();this.propMaterials.push(material);return material;
    };
    // Shared materials across avatars; the tube's +Y points towards the target.
    if(!this.propMaterials.length){mat('#d93d56');mat('#ffcf66');mat('#b48a50');}
    const part=(name:string,type:'cylinder'|'cone'|'box',y:number,scale:number[],material:pc.StandardMaterial)=>{
      const entity=new pc.Entity(name);entity.addComponent('render',{type,material,castShadows:true});root.addChild(entity);entity.setLocalPosition(0,y,0);entity.setLocalScale(scale[0]!,scale[1]!,scale[2]!);return entity;
    };
    part('Tubo vermelho','cylinder',.13,[.065,.3,.065],this.propMaterials[0]!);
    part('Ponta dourada','cone',.315,[.085,.09,.085],this.propMaterials[1]!);
    part('Faixa dourada','cylinder',.16,[.068,.035,.068],this.propMaterials[1]!);
    part('Vareta','box',-.18,[.012,.38,.012],this.propMaterials[2]!);
    return root;
  }
  shot(shot:FireworkShot,now:number):void {
    if(this.flights.some(f=>f.shot.id===shot.id)||now-shot.launchedAt>shot.flightMs+FIREWORK.burstMs)return;
    if(this.flights.length>=FIREWORK.maxVisible)this.flights.shift();
    this.flights.push({shot,burst:false});
    if(now-shot.launchedAt<500)this.sound(shot.origin,false);
  }
  private sound(at:FireworkVector,burst:boolean):void {
    const context=this.audio,volume=this.volume(),distance=Math.hypot(at.x-this.eye.x,at.y-this.eye.y,at.z-this.eye.z);
    if(!context||context.state!=='running'||volume<=0||document.hidden||distance>100)return;
    const now=context.currentTime,gain=context.createGain(),pan=context.createStereoPanner();
    pan.pan.value=Math.max(-1,Math.min(1,((at.x-this.eye.x)*this.right.x+(at.z-this.eye.z)*this.right.z)/Math.max(4,distance)));
    const level=volume*(burst?.5:.13)/(1+distance*.08);
    gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(Math.max(.0002,level),now+.012);gain.gain.exponentialRampToValueAtTime(.0001,now+(burst?.75:.4));
    gain.connect(pan);pan.connect(context.destination);
    let source:AudioScheduledSourceNode;
    if(burst){
      if(!this.noise){this.noise=context.createBuffer(1,context.sampleRate,context.sampleRate);const data=this.noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;}
      const noise=context.createBufferSource();noise.buffer=this.noise;
      const filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.setValueAtTime(6500,now);filter.frequency.exponentialRampToValueAtTime(150,now+.7);
      noise.connect(filter);filter.connect(gain);source=noise;
    }else{
      const whistle=context.createOscillator();whistle.type='triangle';whistle.frequency.setValueAtTime(1300,now);whistle.frequency.exponentialRampToValueAtTime(350,now+.4);whistle.connect(gain);source=whistle;
    }
    this.sounds.add(source);source.onended=()=>{this.sounds.delete(source);source.disconnect();gain.disconnect();pan.disconnect();};source.start(now);source.stop(now+(burst?.8:.42));
  }
  update(now:number,camera:pc.Entity):void {
    this.eye.copy(camera.getPosition());this.right.copy(camera.right);
    const positions:number[]=[],colors:number[]=[],uv:number[]=[],indices:number[]=[],up=camera.up,right=camera.right;
    const spark=(p:FireworkVector,size:number,color:pc.Color,alpha:number)=>{
      const base=positions.length/3;
      for(const [x,y] of [[-1,-1],[1,-1],[1,1],[-1,1]]){
        positions.push(p.x+right.x*x!*size+up.x*y!*size,p.y+right.y*x!*size+up.y*y!*size,p.z+right.z*x!*size+up.z*y!*size);
        colors.push(color.r,color.g,color.b,alpha);uv.push((x!+1)/2,(y!+1)/2);
      }
      indices.push(base,base+1,base+2,base,base+2,base+3);
    };
    for(let i=this.flights.length-1;i>=0;i--){
      const flight=this.flights[i]!,shot=flight.shot,age=now-shot.launchedAt,burstAge=(age-shot.flightMs)/1000;
      if(age>shot.flightMs+FIREWORK.burstMs){this.flights.splice(i,1);continue;}
      if(age<0)continue;
      const hue=shot.hue/360,k=(n:number)=>(n+hue*6)%6;
      const channel=(n:number)=>1-.82*Math.max(0,Math.min(k(n),4-k(n),1));
      const center=fireworkPosition(shot,age),color=new pc.Color(channel(5),channel(3),channel(1));
      if(burstAge<0){
        spark(center,.15,new pc.Color(1,.9,.5),1);
        for(let j=1;j<=16;j++){
          const back=j*12;if(age<back)continue;
          const p=fireworkPosition(shot,age-back);p.y-=j*j*.0009;
          spark(p,.035+j*.002,new pc.Color(1,.45+j*.02,.08),1-j/17);
        }
      }else{
        if(!flight.burst){flight.burst=true;if(burstAge<.35)this.sound(center,true);}
        const fade=Math.max(0,1-burstAge/(FIREWORK.burstMs/1000));
        for(let j=0;j<SPARKS;j++){
          const y=1-2*(j+.5)/SPARKS,r=Math.sqrt(1-y*y),angle=j*2.399963+shot.hue;
          const speed=5+(j%7)*.55,t=burstAge,travel=speed*(1-Math.exp(-t*1.1))/1.1;
          const p={x:center.x+Math.cos(angle)*r*travel,y:center.y+y*travel-1.5*t*t,z:center.z+Math.sin(angle)*r*travel};
          spark(p,.12*(.6+fade),j%5===0?new pc.Color(1,.8,.4):color,fade);
          if(t>.08)spark({x:p.x-Math.cos(angle)*r*.18,y:p.y-y*.18+.06,z:p.z-Math.sin(angle)*r*.18},.04,color,fade*.5);
        }
      }
    }
    this.entity.enabled=positions.length>0;
    if(!positions.length)return;
    this.mesh.setPositions(positions);this.mesh.setColors(colors);this.mesh.setUvs(0,uv);this.mesh.setIndices(indices);this.mesh.update(pc.PRIMITIVE_TRIANGLES);
  }
  get showing():number {return this.flights.length;}
  clear():void {this.flights.length=0;this.entity.enabled=false;for(const sound of this.sounds)sound.stop();this.sounds.clear();}
  destroy():void {
    this.clear();window.removeEventListener('pointerdown',this.unlock);window.removeEventListener('keydown',this.unlock);
    void this.audio?.close().catch(()=>{});this.entity.destroy();this.mesh.destroy();this.material.destroy();this.propMaterials.forEach(material=>material.destroy());
  }
}
