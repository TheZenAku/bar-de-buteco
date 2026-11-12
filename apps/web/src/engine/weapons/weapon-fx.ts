import * as pc from 'playcanvas';
import {groundBelow,type Surface} from '@bar/shared';

/**
 * What a shot looks like (docs/sistemas/armas.md#cliente): the muzzle flash at the barrel, smoke, tracers, sparks, dust, chips, splinters and shards
 * by surface, bullet holes on the map, blood, shell casings and dropped
 * magazines, the laser's beam and dot, the flashlight. Particles are quads written into one dynamic mesh per blend (two draw calls), no entity
 * each; holes and blood stains live in a ring of quads; casings and magazines are a few pooled entities. Nothing is allocated per frame.
 * The canvas is transparent: every blend keeps the framebuffer's alpha (rendering pitfalls).
 */
const VERTEX=`
attribute vec3 aPosition;attribute vec2 aUv0;attribute vec4 aColor;
uniform mat4 matrix_viewProjection;
varying vec2 vUv;varying vec4 vColor;
void main(){vUv=aUv0;vColor=aColor;gl_Position=matrix_viewProjection*vec4(aPosition,1.);}`;
const FRAGMENT=`
precision highp float;
uniform sampler2D atlas;
varying vec2 vUv;varying vec4 vColor;
void main(){vec4 t=texture2D(atlas,vUv);gl_FragColor=vec4(vColor.rgb*t.rgb,vColor.a*t.a);}`;

/** The atlas' cells (4×4 of 64 px). */
const enum Cell {Glow=0,Star=1,Streak=2,Smoke=3,Chip=4,Drop=5,Hole=6,Crack=7,Splat=8,Spark=9}
const ATLAS=4;
function makeAtlas(device:pc.GraphicsDevice):pc.Texture {
  const size=64,canvas=document.createElement('canvas');canvas.width=canvas.height=size*ATLAS;
  const g=canvas.getContext('2d')!;
  let seed=7;const random=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
  const cell=(i:number,draw:(cx:number,cy:number,r:number)=>void)=>{
    const x=(i%ATLAS)*size,y=Math.floor(i/ATLAS)*size;g.save();g.beginPath();g.rect(x,y,size,size);g.clip();draw(x+size/2,y+size/2,size/2);g.restore();
  };
  const radial=(cx:number,cy:number,r:number,stops:[number,string][])=>{const grad=g.createRadialGradient(cx,cy,0,cx,cy,r);for(const [o,c] of stops)grad.addColorStop(o,c);g.fillStyle=grad;g.fillRect(cx-r,cy-r,r*2,r*2);};
  cell(Cell.Glow,(cx,cy,r)=>radial(cx,cy,r,[[0,'rgba(255,255,255,1)'],[.25,'rgba(255,255,255,.55)'],[1,'rgba(255,255,255,0)']]));
  cell(Cell.Star,(cx,cy,r)=>{
    radial(cx,cy,r*.6,[[0,'rgba(255,255,255,1)'],[.5,'rgba(255,255,255,.5)'],[1,'rgba(255,255,255,0)']]);
    g.globalCompositeOperation='lighter';
    for(let i=0;i<7;i++){const a=i/7*Math.PI*2+random()*.4,l=r*(.55+random()*.45),w=r*.12;
      g.save();g.translate(cx,cy);g.rotate(a);const grad=g.createLinearGradient(0,0,l,0);grad.addColorStop(0,'rgba(255,255,255,.95)');grad.addColorStop(1,'rgba(255,255,255,0)');
      g.fillStyle=grad;g.beginPath();g.moveTo(0,-w);g.lineTo(l,0);g.lineTo(0,w);g.fill();g.restore();}
    g.globalCompositeOperation='source-over';
  });
  cell(Cell.Streak,(cx,cy,r)=>{const grad=g.createLinearGradient(cx,cy-r,cx,cy+r);grad.addColorStop(0,'rgba(255,255,255,0)');grad.addColorStop(.5,'rgba(255,255,255,1)');grad.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle=grad;g.fillRect(cx-r,cy-r,r*2,r*2);
    const fade=g.createLinearGradient(cx-r,cy,cx+r,cy);fade.addColorStop(0,'rgba(0,0,0,1)');fade.addColorStop(.15,'rgba(0,0,0,0)');fade.addColorStop(.85,'rgba(0,0,0,0)');fade.addColorStop(1,'rgba(0,0,0,1)');
    g.globalCompositeOperation='destination-out';g.fillStyle=fade;g.fillRect(cx-r,cy-r,r*2,r*2);g.globalCompositeOperation='source-over';});
  cell(Cell.Smoke,(cx,cy,r)=>{for(let i=0;i<14;i++){const a=random()*Math.PI*2,d=random()*r*.4,s=r*(.3+random()*.35);radial(cx+Math.cos(a)*d,cy+Math.sin(a)*d,s,[[0,'rgba(255,255,255,.28)'],[1,'rgba(255,255,255,0)']]);}});
  cell(Cell.Chip,(cx,cy,r)=>{g.fillStyle='#fff';g.beginPath();for(let i=0;i<6;i++){const a=i/6*Math.PI*2,l=r*(.45+random()*.4);g.lineTo(cx+Math.cos(a)*l,cy+Math.sin(a)*l);}g.fill();});
  cell(Cell.Drop,(cx,cy,r)=>radial(cx,cy,r*.8,[[0,'rgba(255,255,255,1)'],[.6,'rgba(255,255,255,.9)'],[1,'rgba(255,255,255,0)']]));
  cell(Cell.Hole,(cx,cy,r)=>{
    radial(cx,cy,r,[[0,'rgba(255,255,255,.95)'],[.22,'rgba(255,255,255,.9)'],[.32,'rgba(255,255,255,.55)'],[.7,'rgba(255,255,255,.18)'],[1,'rgba(255,255,255,0)']]);
    g.strokeStyle='rgba(255,255,255,.35)';g.lineWidth=1.5;for(let i=0;i<7;i++){const a=random()*Math.PI*2;g.beginPath();g.moveTo(cx+Math.cos(a)*r*.25,cy+Math.sin(a)*r*.25);g.lineTo(cx+Math.cos(a)*r*(.5+random()*.4),cy+Math.sin(a)*r*(.5+random()*.4));g.stroke();}
  });
  cell(Cell.Crack,(cx,cy,r)=>{
    radial(cx,cy,r*.2,[[0,'rgba(255,255,255,1)'],[1,'rgba(255,255,255,.2)']]);
    g.strokeStyle='rgba(255,255,255,.85)';g.lineWidth=1.2;
    for(let i=0;i<11;i++){let a=random()*Math.PI*2,x=cx,y=cy;g.beginPath();g.moveTo(x,y);for(let k=0;k<4;k++){a+=(random()-.5)*.6;const l=r*(.15+random()*.2);x+=Math.cos(a)*l;y+=Math.sin(a)*l;g.lineTo(x,y);}g.stroke();}
    g.beginPath();g.arc(cx,cy,r*.35,0,Math.PI*2);g.stroke();
  });
  cell(Cell.Splat,(cx,cy,r)=>{g.fillStyle='rgba(255,255,255,.9)';for(let i=0;i<18;i++){const a=random()*Math.PI*2,d=random()*random()*r*.75,s=r*(.08+random()*.28)*(1-d/r);g.beginPath();g.arc(cx+Math.cos(a)*d,cy+Math.sin(a)*d,s,0,Math.PI*2);g.fill();}});
  cell(Cell.Spark,(cx,cy,r)=>radial(cx,cy,r,[[0,'rgba(255,255,255,1)'],[.12,'rgba(255,255,255,1)'],[.4,'rgba(255,255,255,.25)'],[1,'rgba(255,255,255,0)']]));
  const texture=new pc.Texture(device,{name:'Armas FX',width:canvas.width,height:canvas.height,format:pc.PIXELFORMAT_RGBA8,mipmaps:true,minFilter:pc.FILTER_LINEAR_MIPMAP_LINEAR,magFilter:pc.FILTER_LINEAR,addressU:pc.ADDRESS_CLAMP_TO_EDGE,addressV:pc.ADDRESS_CLAMP_TO_EDGE});
  texture.setSource(canvas);
  return texture;
}

/** One quad of a batch: where, how it moves, how it looks over its life. `stretch`: drawn along its velocity (sparks) or from `tail` (tracers). */
interface Particle {
  x:number;y:number;z:number;vx:number;vy:number;vz:number;
  age:number;life:number;size0:number;size1:number;r:number;g:number;b:number;a0:number;a1:number;
  cell:Cell;gravity:number;drag:number;roll:number;stretch:number;
  /** A tracer: the tail follows the head `length` metres behind, never behind `ox..oz` (the muzzle); `ex..ez` is where it stops. */
  tracer:boolean;ox:number;oy:number;oz:number;ex:number;ey:number;ez:number;length:number;
  /** A decal: fixed corners (normal frame), fading over its last `fade` seconds. */
  decal:boolean;nx:number;ny:number;nz:number;ux:number;uy:number;uz:number;
  /** Lit by the scene's light level (smoke, dust, blood), not glowing. */
  lit:boolean;
  /** Drawn this frame only (the laser, a lens glow). */
  once:boolean;
}
const blank=():Particle=>({x:0,y:0,z:0,vx:0,vy:0,vz:0,age:0,life:0,size0:0,size1:0,r:1,g:1,b:1,a0:1,a1:0,cell:Cell.Glow,gravity:0,drag:0,roll:0,stretch:0,
  tracer:false,ox:0,oy:0,oz:0,ex:0,ey:0,ez:0,length:0,decal:false,nx:0,ny:1,nz:0,ux:1,uy:0,uz:0,lit:false,once:false});

class Batch {
  readonly items:Particle[]=[];
  private live=0;
  private readonly positions:Float32Array;private readonly uvs:Float32Array;private readonly colors:Float32Array;
  private readonly mesh:pc.Mesh;readonly instance:pc.MeshInstance;readonly entity:pc.Entity;
  constructor(app:pc.AppBase,readonly capacity:number,material:pc.Material,name:string) {
    for(let i=0;i<capacity;i++)this.items.push(blank());
    this.positions=new Float32Array(capacity*12);this.uvs=new Float32Array(capacity*8);this.colors=new Float32Array(capacity*16);
    const indices=new Uint16Array(capacity*6);
    for(let i=0;i<capacity;i++){const v=i*4,o=i*6;indices[o]=v;indices[o+1]=v+1;indices[o+2]=v+2;indices[o+3]=v;indices[o+4]=v+2;indices[o+5]=v+3;}
    const mesh=this.mesh=new pc.Mesh(app.graphicsDevice);
    mesh.setPositions(this.positions);mesh.setUvs(0,this.uvs);mesh.setColors(this.colors);mesh.setIndices(indices);mesh.update(pc.PRIMITIVE_TRIANGLES,false);
    mesh.aabb=new pc.BoundingBox(new pc.Vec3(),new pc.Vec3(1e5,1e5,1e5));
    this.instance=new pc.MeshInstance(mesh,material);this.instance.cull=false;this.instance.castShadow=false;
    this.entity=new pc.Entity(name);this.entity.addComponent('render',{meshInstances:[this.instance],castShadows:false,receiveShadows:false});
    app.root.addChild(this.entity);
  }
  /** A free particle (or the oldest one), reset. */
  take():Particle {
    let best:Particle|undefined,oldest=-1;
    for(const p of this.items){if(p.life<=0){best=p;break;}const share=p.age/p.life;if(share>oldest){oldest=share;best=p;}}
    Object.assign(best!,BLANK);
    return best!;
  }
  /** One frame: move, age, write the live quads. `eye`: the camera; `light`: the scene's light level for the lit ones. */
  update(dt:number,eye:pc.Vec3,camRight:pc.Vec3,camUp:pc.Vec3,light:number):void {
    let n=0;
    const P=this.positions,U=this.uvs,C=this.colors;
    for(const p of this.items){
      if(p.life<=0)continue;
      if(!p.once){p.age+=dt;if(p.age>=p.life){p.life=0;continue;}}
      const t=p.once?0:p.age/p.life;
      if(!p.decal&&!p.tracer){
        p.vy-=p.gravity*dt;const k=Math.exp(-p.drag*dt);p.vx*=k;p.vy*=k;p.vz*=k;
        p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;
      }
      const size=p.size0+(p.size1-p.size0)*Math.sqrt(t);
      let alpha=p.a0+(p.a1-p.a0)*t;
      if(p.decal){const fade=Math.min(1,(p.life-p.age)/Math.min(8,p.life*.3));alpha=p.a0*fade;}
      const shade=p.lit?light:1;
      // The corners: a billboard (camera axes, rolled), a streak (its way × towards the eye), or a decal (its own frame).
      let ax:number,ay:number,az:number,bx:number,by:number,bz:number,cx=p.x,cy=p.y,cz=p.z;
      if(p.decal){ax=p.ux*size;ay=p.uy*size;az=p.uz*size;const vx=p.ny*p.uz-p.nz*p.uy,vy=p.nz*p.ux-p.nx*p.uz,vz=p.nx*p.uy-p.ny*p.ux;bx=vx*size;by=vy*size;bz=vz*size;}
      else if(p.tracer||p.stretch>0){
        let dx:number,dy:number,dz:number,half:number;
        if(p.tracer){
          // The head runs from the muzzle to the end; the tail `length` behind it.
          const total=Math.hypot(p.ex-p.ox,p.ey-p.oy,p.ez-p.oz)||1,head=p.once?total:Math.min(total,p.age*TRACER_SPEED),tail=Math.max(0,head-p.length);
          dx=(p.ex-p.ox)/total;dy=(p.ey-p.oy)/total;dz=(p.ez-p.oz)/total;
          const mid=(head+tail)/2;half=(head-tail)/2;cx=p.ox+dx*mid;cy=p.oy+dy*mid;cz=p.oz+dz*mid;
          if(head>=total&&tail>=total){p.life=0;continue;}
        }else{
          const speed=Math.hypot(p.vx,p.vy,p.vz)||1;dx=p.vx/speed;dy=p.vy/speed;dz=p.vz/speed;half=Math.max(size*.5,speed*p.stretch*.5);
        }
        // Across: the way × the line to the eye.
        const ex=eye.x-cx,ey=eye.y-cy,ez=eye.z-cz;
        let sx=dy*ez-dz*ey,sy=dz*ex-dx*ez,sz=dx*ey-dy*ex;const sl=Math.hypot(sx,sy,sz)||1;
        sx=sx/sl*size*.5;sy=sy/sl*size*.5;sz=sz/sl*size*.5;
        ax=dx*half;ay=dy*half;az=dz*half;bx=sx;by=sy;bz=sz;
      }else{
        const c=Math.cos(p.roll)*size*.5,s=Math.sin(p.roll)*size*.5;
        ax=camRight.x*c+camUp.x*s;ay=camRight.y*c+camUp.y*s;az=camRight.z*c+camUp.z*s;
        bx=-camRight.x*s+camUp.x*c;by=-camRight.y*s+camUp.y*c;bz=-camRight.z*s+camUp.z*c;
      }
      const o=n*12;
      P[o]=cx-ax-bx;P[o+1]=cy-ay-by;P[o+2]=cz-az-bz;
      P[o+3]=cx+ax-bx;P[o+4]=cy+ay-by;P[o+5]=cz+az-bz;
      P[o+6]=cx+ax+bx;P[o+7]=cy+ay+by;P[o+8]=cz+az+bz;
      P[o+9]=cx-ax+bx;P[o+10]=cy-ay+by;P[o+11]=cz-az+bz;
      const u0=(p.cell%ATLAS)/ATLAS,v0=Math.floor(p.cell/ATLAS)/ATLAS,w=1/ATLAS,e=.004;
      const uo=n*8;
      U[uo]=u0+e;U[uo+1]=v0+e;U[uo+2]=u0+w-e;U[uo+3]=v0+e;U[uo+4]=u0+w-e;U[uo+5]=v0+w-e;U[uo+6]=u0+e;U[uo+7]=v0+w-e;
      const co=n*16,r=p.r*shade,g=p.g*shade,b=p.b*shade,a=Math.max(0,Math.min(1,alpha));
      for(let k=0;k<4;k++){C[co+k*4]=r;C[co+k*4+1]=g;C[co+k*4+2]=b;C[co+k*4+3]=a;}
      n++;
      if(p.once)p.life=0;
    }
    if(n===0&&this.live===0){this.entity.enabled=false;return;}
    this.entity.enabled=n>0;
    this.live=n;
    if(n>0){
      this.mesh.setPositions(this.positions);this.mesh.setUvs(0,this.uvs);this.mesh.setColors(this.colors);
      this.mesh.update(pc.PRIMITIVE_TRIANGLES,false);
      this.mesh.primitive[0]!.count=n*6;
    }
  }
  get count():number {return this.live;}
  destroy():void {this.entity.destroy();this.mesh.destroy();}
}
const BLANK=blank();
const TRACER_SPEED=320;

/** A small solid thrown out (a casing, a magazine): it falls, bounces on the floor under it and lies there a while. */
interface Debris {entity:pc.Entity;vx:number;vy:number;vz:number;spin:pc.Vec3;floor:number;age:number;bounces:number;kind:'brass'|'shell'|'mag';scale:pc.Vec3}
const DEBRIS_LIFE=6,CASINGS=28,MAGAZINES=6;

export interface FxSounds {casing(kind:'brass'|'shell',at:pc.Vec3,strength:number):void;magazine(at:pc.Vec3):void}

/** Where the casings come down: a surface's floor, the map's or the streets'. */
const SURFACE_TINT:Readonly<Record<Surface,[number,number,number]>>={concreto:[.09,.085,.08],asfalto:[.05,.05,.05],metal:[.12,.12,.13],madeira:[.12,.07,.03],vidro:[.85,.9,.95],terra:[.1,.07,.04],carne:[.3,0,0]};
const DUST:Readonly<Record<Surface,[number,number,number]>>={concreto:[.62,.6,.56],asfalto:[.42,.41,.4],metal:[.5,.5,.5],madeira:[.55,.42,.28],vidro:[.85,.9,.95],terra:[.45,.34,.22],carne:[.5,.02,.02]};

export class WeaponFx {
  private readonly glow:Batch;private readonly soft:Batch;private readonly decals:Batch;
  private readonly texture:pc.Texture;
  private readonly materials:pc.Material[]=[];
  private readonly debris:Debris[]=[];
  private readonly torches:{entity:pc.Entity;owner:string}[]=[];
  private readonly brass:pc.StandardMaterial;private readonly shellMat:pc.StandardMaterial;private readonly magMat:pc.StandardMaterial;
  private clock=0;
  private readonly camRight=new pc.Vec3();private readonly camUp=new pc.Vec3();private readonly v=new pc.Vec3();private readonly w=new pc.Vec3();
  /** Counters for tests and telemetry. */
  readonly stats={flashes:0,tracers:0,impacts:0,decals:0,blood:0,casings:0};

  constructor(private readonly app:pc.AppBase,private readonly light:()=>number,private readonly sounds:FxSounds) {
    this.texture=makeAtlas(app.graphicsDevice);
    const material=(name:string,blend:pc.BlendState,bias=false)=>{
      const m=new pc.ShaderMaterial({uniqueName:name,attributes:{aPosition:pc.SEMANTIC_POSITION,aUv0:pc.SEMANTIC_TEXCOORD0,aColor:pc.SEMANTIC_COLOR},vertexGLSL:VERTEX,fragmentGLSL:FRAGMENT});
      m.blendState=blend;m.depthWrite=false;m.cull=pc.CULLFACE_NONE;m.setParameter('atlas',this.texture);
      if(bias){m.depthBias=-4;m.slopeDepthBias=-4;}
      m.update();this.materials.push(m);return m;
    };
    const additive=new pc.BlendState(true,pc.BLENDEQUATION_ADD,pc.BLENDMODE_SRC_ALPHA,pc.BLENDMODE_ONE,pc.BLENDEQUATION_ADD,pc.BLENDMODE_ZERO,pc.BLENDMODE_ONE);
    const normal=new pc.BlendState(true,pc.BLENDEQUATION_ADD,pc.BLENDMODE_SRC_ALPHA,pc.BLENDMODE_ONE_MINUS_SRC_ALPHA,pc.BLENDEQUATION_ADD,pc.BLENDMODE_ZERO,pc.BLENDMODE_ONE);
    this.decals=new Batch(app,96,material('Armas marcas',normal,true),'Armas marcas');
    this.soft=new Batch(app,360,material('Armas fumaça',normal),'Armas fumaça');
    this.glow=new Batch(app,420,material('Armas brilho',additive),'Armas brilho');
    const metal=(r:number,g:number,b:number,metalness:number,gloss:number)=>{const m=new pc.StandardMaterial();m.diffuse=new pc.Color(r,g,b);m.useMetalness=true;m.metalness=metalness;m.gloss=gloss;m.update();return m;};
    this.brass=metal(.78,.58,.24,.9,.7);this.shellMat=metal(.62,.07,.06,.05,.45);this.magMat=metal(.08,.08,.085,.4,.4);
  }

  private spark(batch:Batch,x:number,y:number,z:number,vx:number,vy:number,vz:number,life:number,size0:number,size1:number,r:number,g:number,b:number,a0:number,a1:number,cell:Cell,extra?:Partial<Particle>):Particle {
    const p=batch.take();
    p.x=x;p.y=y;p.z=z;p.vx=vx;p.vy=vy;p.vz=vz;p.life=life;p.size0=size0;p.size1=size1;p.r=r;p.g=g;p.b=b;p.a0=a0;p.a1=a1;p.cell=cell;p.roll=Math.random()*6.283;
    if(extra)Object.assign(p,extra);
    return p;
  }

  /** The flash at a muzzle going `dir` (unit), `size` the weapon's flash (1 normal; a suppressor ~.15). */
  flash(at:pc.Vec3,dir:pc.Vec3,size:number,_holdMs=60):void {
    this.stats.flashes++;
    const s=Math.max(.12,size);
    const warm=size<.4?[.9,.8,.6]:[1,.78,.42];
    if(size>=.3){
      // The bloom out of the barrel along it, the star across it, a hot core.
      this.spark(this.glow,at.x+dir.x*.08*s,at.y+dir.y*.08*s,at.z+dir.z*.08*s,dir.x*.01,dir.y*.01,dir.z*.01,.05,.11*s,.16*s,warm[0]!,warm[1]!,warm[2]!,.95,.0,Cell.Streak,{stretch:22*s});
      this.spark(this.glow,at.x+dir.x*.03,at.y+dir.y*.03,at.z+dir.z*.03,0,0,0,.045,.2*s,.26*s,warm[0]!,warm[1]!,warm[2]!,1,0,Cell.Star);
      this.spark(this.glow,at.x,at.y,at.z,0,0,0,.035,.09*s,.12*s,1,.95,.85,1,0,Cell.Glow);
      for(let i=0;i<3;i++){const a=Math.random()*6.28;this.spark(this.glow,at.x,at.y,at.z,dir.x*3+Math.cos(a)*1.5,dir.y*3+Math.sin(a)*1.5,dir.z*3+Math.cos(a+1)*1.5,.06+Math.random()*.05,.012,.006,1,.7,.3,1,0,Cell.Spark,{stretch:.02});}
      // Deliberately no scene light: the additive particles are the whole flash. A point light here produced a visible circle on floors and walls.
    }else{
      // Suppressed: a faint glow and a puff.
      this.spark(this.glow,at.x,at.y,at.z,0,0,0,.03,.05,.07,.9,.75,.5,.5,0,Cell.Glow);
    }
    this.smoke(at,dir,size>=.3?1:.6);
  }
  smoke(at:pc.Vec3,dir:pc.Vec3,amount:number):void {
    const n=amount>.8?2:1;
    for(let i=0;i<n;i++)this.spark(this.soft,at.x+dir.x*.05,at.y+dir.y*.05,at.z+dir.z*.05,dir.x*(.6+Math.random()*.5)+(Math.random()-.5)*.15,.18+Math.random()*.1+dir.y*.5,dir.z*(.6+Math.random()*.5)+(Math.random()-.5)*.15,
      .9+Math.random()*.7,.05,.32+Math.random()*.2,.78,.77,.75,.32*amount,0,Cell.Smoke,{drag:2.6,lit:true});
  }
  /** A tracer from the muzzle to where the bullet ended. */
  tracer(from:pc.Vec3,to:pc.Vec3,width=.022):void {
    const total=from.distance(to);if(total<1.5)return;
    this.stats.tracers++;
    this.spark(this.glow,from.x,from.y,from.z,0,0,0,(total+5)/TRACER_SPEED+.02,width,width,1,.82,.5,.85,.7,Cell.Streak,
      {tracer:true,ox:from.x,oy:from.y,oz:from.z,ex:to.x,ey:to.y,ez:to.z,length:Math.min(6,total*.4)});
  }
  /** A bullet into the map: what flies off by surface, and the hole. `normal`: the face's (unit). */
  impact(at:pc.Vec3,normal:pc.Vec3,surface:Surface,big=1):void {
    this.stats.impacts++;
    const [r,g,b]=DUST[surface];
    const nx=normal.x,ny=normal.y,nz=normal.z;
    const out=(speed:number,spread:number)=>{
      this.v.set(nx+(Math.random()-.5)*spread,ny+(Math.random()-.5)*spread+.2,nz+(Math.random()-.5)*spread).normalize().mulScalar(speed*(.5+Math.random()*.7));
      return this.v;
    };
    const x=at.x+nx*.02,y=at.y+ny*.02,z=at.z+nz*.02;
    if(surface==='metal'){
      for(let i=0;i<9;i++){const v=out(5.5,1.6);this.spark(this.glow,x,y,z,v.x,v.y,v.z,.18+Math.random()*.2,.012,.006,1,.72,.32,1,.2,Cell.Spark,{gravity:9.8,stretch:.03});}
      this.spark(this.glow,x,y,z,0,0,0,.06,.07,.12,1,.8,.5,1,0,Cell.Glow);
    }else if(surface==='vidro'){
      for(let i=0;i<9;i++){const v=out(2.6,1.8);this.spark(this.soft,x,y,z,v.x,v.y,v.z,.5+Math.random()*.3,.012+Math.random()*.012,.01,.85,.92,1,.85,.2,Cell.Chip,{gravity:9.8,drag:.4});}
      this.spark(this.glow,x,y,z,0,0,0,.05,.05,.08,.8,.9,1,.6,0,Cell.Glow);
    }else if(surface!=='carne'){
      const chips=surface==='madeira'?6:surface==='terra'?7:5,[cr,cg,cb]=surface==='madeira'?[.42,.28,.14]:surface==='terra'?[.3,.22,.14]:[.4,.39,.37];
      for(let i=0;i<chips;i++){const v=out(surface==='terra'?2.2:3.2,1.2);this.spark(this.soft,x,y,z,v.x,v.y,v.z,.45+Math.random()*.3,.012+Math.random()*.014,.012,cr,cg,cb,1,.6,Cell.Chip,{gravity:9.8,drag:.6,lit:true,...(surface==='madeira'?{stretch:.02}:{})});}
      for(let i=0;i<(surface==='terra'?3:2);i++){const v=out(.9,.9);this.spark(this.soft,x,y,z,v.x,v.y,v.z,.6+Math.random()*.5,.06,.38*big+Math.random()*.15,r,g,b,.55,0,Cell.Smoke,{drag:3,gravity:-.05,lit:true});}
    }
    if(surface!=='carne')this.decal(at,normal,surface,.055*big);
  }
  /** A mark on a surface (a hole, a crack in glass, a blood stain), fading after a while; the oldest goes when the ring is full. */
  decal(at:pc.Vec3,normal:pc.Vec3,surface:Surface,size:number):void {
    this.stats.decals++;
    const [r,g,b]=SURFACE_TINT[surface];
    // A frame on the face: any direction across the normal, turned at random.
    this.w.set(Math.abs(normal.y)>.9?1:0,Math.abs(normal.y)>.9?0:1,0);
    this.v.cross(normal,this.w).normalize();
    const a=Math.random()*6.283,c=Math.cos(a),s=Math.sin(a);
    this.w.cross(normal,this.v);
    const ux=this.v.x*c+this.w.x*s,uy=this.v.y*c+this.w.y*s,uz=this.v.z*c+this.w.z*s;
    this.spark(this.decals,at.x+normal.x*.004,at.y+normal.y*.004,at.z+normal.z*.004,0,0,0,surface==='carne'?40:90,size,size,r,g,b,surface==='vidro'?.75:surface==='carne'?.85:.92,0,
      surface==='vidro'?Cell.Crack:surface==='carne'?Cell.Splat:Cell.Hole,{decal:true,nx:normal.x,ny:normal.y,nz:normal.z,ux,uy,uz});
  }
  /** A bullet into a body: a red mist and drops out of the exit side, a stain on the floor under it. */
  blood(at:pc.Vec3,dir:pc.Vec3,amount=1):void {
    this.stats.blood++;
    for(let i=0;i<2;i++)this.spark(this.soft,at.x,at.y,at.z,dir.x*.6+(Math.random()-.5)*.3,dir.y*.6+.1,dir.z*.6+(Math.random()-.5)*.3,.3+Math.random()*.15,.06,.26*amount,.55,.02,.02,.7,0,Cell.Smoke,{drag:4,lit:true});
    for(let i=0;i<Math.round(6*amount);i++){
      const speed=1.4+Math.random()*2.2;
      this.spark(this.soft,at.x,at.y,at.z,dir.x*speed+(Math.random()-.5)*1.2,dir.y*speed+Math.random()*1.4,dir.z*speed+(Math.random()-.5)*1.2,.45+Math.random()*.3,.016+Math.random()*.014,.01,.42,.01,.01,1,.8,Cell.Drop,{gravity:9.8,drag:.3,lit:true,stretch:.012});
    }
    const floor=groundBelow(at.x+dir.x*.4,at.z+dir.z*.4,at.y);
    if(floor!==undefined&&at.y-floor<2.2){this.v.set(at.x+dir.x*.4+(Math.random()-.5)*.2,floor+.004,at.z+dir.z*.4+(Math.random()-.5)*.2);this.decal(this.v,this.w.set(0,1,0),'carne',.16+.1*amount*Math.random());}
  }

  /** A casing (or a magazine) thrown out at `at` with `velocity`. */
  casing(kind:'brass'|'shell',at:pc.Vec3,velocity:pc.Vec3,size:'pistol'|'rifle'='pistol'):void {
    this.stats.casings++;
    const item=this.debrisSlot(kind);
    if(kind==='shell')item.scale.set(.021,.065,.021);else if(size==='rifle')item.scale.set(.0095,.045,.0095);else item.scale.set(.009,.02,.009);
    this.launch(item,at,velocity);
  }
  magazine(at:pc.Vec3,rotation:pc.Quat,velocity:pc.Vec3,long:boolean):void {
    const item=this.debrisSlot('mag');
    if(long)item.scale.set(.026,.15,.058);else item.scale.set(.02,.11,.032);
    this.launch(item,at,velocity);item.entity.setRotation(rotation);
  }
  private debrisSlot(kind:Debris['kind']):Debris {
    const pool=this.debris.filter(item=>(item.kind==='mag')===(kind==='mag'));
    const limit=kind==='mag'?MAGAZINES:CASINGS;
    let item=pool.find(entry=>!entry.entity.enabled);
    if(!item&&pool.length>=limit)item=pool.reduce((a,b)=>a.age>b.age?a:b);
    if(!item){
      const entity=new pc.Entity('Armas cápsula');
      entity.addComponent('render',{type:kind==='mag'?'box':'cylinder',castShadows:false,receiveShadows:true});
      this.app.root.addChild(entity);
      item={entity,vx:0,vy:0,vz:0,spin:new pc.Vec3(),floor:0,age:0,bounces:0,kind,scale:new pc.Vec3()};
      this.debris.push(item);
    }
    item.kind=kind;
    item.entity.render!.meshInstances[0]!.material=kind==='mag'?this.magMat:kind==='shell'?this.shellMat:this.brass;
    return item;
  }
  private launch(item:Debris,at:pc.Vec3,velocity:pc.Vec3):void {
    item.entity.enabled=true;item.entity.setPosition(at);item.entity.setLocalScale(item.scale);
    item.entity.setEulerAngles(Math.random()*360,Math.random()*360,Math.random()*360);
    item.vx=velocity.x;item.vy=velocity.y;item.vz=velocity.z;item.age=0;item.bounces=0;
    item.spin.set((Math.random()-.5)*1400,(Math.random()-.5)*1400,(Math.random()-.5)*1400);
    item.floor=groundBelow(at.x,at.z,at.y)??at.y-1.4;
  }

  /** A laser's beam this frame: from `from` to `to`, a dot where it lands (`hit`). */
  laser(from:pc.Vec3,to:pc.Vec3,hit:boolean):void {
    const p=this.spark(this.glow,from.x,from.y,from.z,0,0,0,1e-4,.006,.006,1,.08,.05,.28,.28,Cell.Streak,{tracer:true,ox:from.x,oy:from.y,oz:from.z,ex:to.x,ey:to.y,ez:to.z,length:1e4});
    p.once=true;
    if(hit){const d=this.spark(this.glow,to.x,to.y,to.z,0,0,0,1e-3,.035,.035,1,.12,.08,1,1,Cell.Glow);d.once=true;}
  }
  /** The flashlights this frame (at most three, the caller picks the nearest): where each starts and which way it shines. */
  torch(index:number,owner:string,from:pc.Vec3,dir:pc.Vec3):void {
    let item=this.torches[index];
    if(!item){
      const entity=new pc.Entity('Armas lanterna');
      entity.addComponent('light',{type:'spot',color:new pc.Color(1,.95,.85),range:16,intensity:4,innerConeAngle:8,outerConeAngle:19,castShadows:false,falloffMode:pc.LIGHTFALLOFF_LINEAR});
      this.app.root.addChild(entity);item={entity,owner};this.torches[index]=item;
    }
    item.owner=owner;item.entity.enabled=true;
    item.entity.setPosition(from);
    // A spot shines down its -Y: look along the beam (-Z), then tip -Y onto it.
    this.v.copy(from).add(dir);item.entity.lookAt(this.v);item.entity.rotateLocal(90,0,0);
    const g=this.spark(this.glow,from.x+dir.x*.01,from.y+dir.y*.01,from.z+dir.z*.01,0,0,0,1e-3,.05,.05,1,.96,.85,.9,.9,Cell.Glow);g.once=true;
  }
  torchesUsed(count:number):void {for(let i=count;i<this.torches.length;i++)this.torches[i]!.entity.enabled=false;}

  update(dt:number,camera:pc.Entity):void {
    this.clock+=dt;
    for(const item of this.debris){
      if(!item.entity.enabled)continue;
      item.age+=dt;
      if(item.age>DEBRIS_LIFE){item.entity.enabled=false;continue;}
      const p=item.entity.getPosition();
      if(item.bounces<4||p.y>item.floor+.01){
        item.vy-=9.8*dt;
        let x=p.x+item.vx*dt,y=p.y+item.vy*dt,z=p.z+item.vz*dt;
        const floor=item.floor+(item.kind==='mag'?.012:item.kind==='shell'?.01:.005);
        if(y<floor&&item.vy<0){
          y=floor;const hit=-item.vy;
          item.vy=hit*(item.kind==='mag'?.18:.38);item.vx*=.55;item.vz*=.55;item.spin.mulScalar(.5);item.bounces++;
          if(item.bounces<=2&&hit>.6){if(item.kind==='mag')this.sounds.magazine(this.v.set(x,y,z));else this.sounds.casing(item.kind,this.v.set(x,y,z),Math.min(1,hit/3));}
          if(item.bounces>=4||hit<.4){item.vx=item.vy=item.vz=0;item.bounces=4;}
          // Lying: on its side.
          if(item.bounces>=4){const e=item.entity.getEulerAngles();item.entity.setEulerAngles(90,e.y,0);}
        }
        item.entity.setPosition(x,y,z);
        if(item.bounces<4){const e=item.entity.getLocalEulerAngles();item.entity.setLocalEulerAngles(e.x+item.spin.x*dt,e.y+item.spin.y*dt,e.z+item.spin.z*dt);}
      }
      // Gone by shrinking in the last second.
      if(item.age>DEBRIS_LIFE-1){const k=Math.max(.01,DEBRIS_LIFE-item.age);item.entity.setLocalScale(item.scale.x*k,item.scale.y*k,item.scale.z*k);}
    }
    const eye=camera.getPosition();
    this.camRight.copy(camera.right);this.camUp.copy(camera.up);
    const light=.3+.7*Math.max(0,Math.min(1,this.light()));
    this.decals.update(dt,eye,this.camRight,this.camUp,light);
    this.soft.update(dt,eye,this.camRight,this.camUp,light);
    this.glow.update(dt,eye,this.camRight,this.camUp,1);
  }
  get showing():{glow:number;soft:number;decals:number;debris:number} {return {glow:this.glow.count,soft:this.soft.count,decals:this.decals.count,debris:this.debris.filter(d=>d.entity.enabled).length};}
  destroy():void {
    this.glow.destroy();this.soft.destroy();this.decals.destroy();
    for(const item of this.debris)item.entity.destroy();
    for(const torch of this.torches)torch.entity.destroy();
    for(const m of this.materials)m.destroy();
    this.texture.destroy();this.brass.destroy();this.shellMat.destroy();this.magMat.destroy();
  }
}
