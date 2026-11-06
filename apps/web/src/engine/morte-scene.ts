import * as pc from 'playcanvas';
import {DEATH,DEATH_CLIPS,DEATH_CLIP_ORDER,deathDurationMs,deathFrame,deathStarts,type DeathClip,type DeathPlan} from '@bar/shared';
import type {DeathAudio} from '../death/death-audio';

const RAD_TO_DEG=180/Math.PI;
const clipUrl=(clip:DeathClip)=>`${import.meta.env.BASE_URL}models/morte/${DEATH_CLIPS[clip].file}.glb?v=20261105`;
const smooth=(k:number)=>{const x=Math.max(0,Math.min(1,k));return x*x*(3-2*x);};

/** What the scene asks of the world it plays in: the camera, the clock, a shake, a puff of dust, the quality level. */
export interface MorteHost {
  app:pc.AppBase;
  camera:pc.Entity;
  /** Server time (ms) now. */
  serverNow():number;
  localId():string;
  shake(metres:number):void;
  /** Turns the local player's view to look along `heading` (radians, the players' rotation convention). */
  faceCamera(heading:number):void;
  /** A brief widening of the lens (degrees), eased out by the host. */
  punchFov(degrees:number):void;
  dust(x:number,y:number,z:number,radius:number,colour:[number,number,number]):void;
  /** Level "baixo": half the smoke puffs, no heavy effects. */
  lowQuality():boolean;
}

interface ClipRig {entity:pc.Entity;anim:pc.AnimComponent;smoke:pc.Entity[];tracks:number}

/**
 * The Morte's scene (docs/sistemas/morte.md): five GLBs, one per clip, each with the body, the scythe and (01, 05) animated smoke.
 * Where she is and which clip plays come from `deathFrame` of the plan the room sent, so every client draws the same scene on the room's clock.
 * Nothing here decides anything.
 */
export class MorteScene {
  private readonly containers=new Map<DeathClip,pc.ContainerResource>();
  private readonly requested=new Set<DeathClip>();
  private readonly rigs=new Map<DeathClip,ClipRig>();
  private readonly root:pc.Entity;
  private readonly mist:pc.Entity;
  private readonly mistMaterial:pc.StandardMaterial;
  private readonly crack:pc.Entity;
  private readonly crackMaterial:pc.StandardMaterial;
  private plan?:DeathPlan;
  private shown?:DeathClip;
  private fired=new Set<string>();
  private stepAt=0;
  private punch=0;
  private destroyed=false;
  /** The Morte's own audio (the room and scene sounds); set by the owner. */
  audio?:DeathAudio;
  /** Called with the victim's id when the body is pulled in (0 → 1) and when the scene is over. */
  onPull?:(victim:string,progress:number,towards:{x:number;z:number})=>void;

  constructor(private readonly host:MorteHost){
    this.root=new pc.Entity('Morte');this.root.enabled=false;host.app.root.addChild(this.root);
    const disc=(name:string,texture:pc.Texture,size:number)=>{
      const entity=new pc.Entity(name),material=new pc.StandardMaterial();
      material.diffuse=new pc.Color(0,0,0);material.emissive=new pc.Color(0,0,0);material.useLighting=false;
      material.opacityMap=texture;material.opacityMapChannel='a';material.opacity=0;material.blendType=pc.BLEND_NORMAL;material.depthWrite=false;material.cull=pc.CULLFACE_NONE;material.update();
      entity.addComponent('render',{type:'plane',material,castShadows:false,receiveShadows:false});entity.setLocalScale(size,1,size);entity.enabled=false;host.app.root.addChild(entity);
      return {entity,material};
    };
    const mist=disc('Morte mist',this.radialTexture(),3.2),crack=disc('Morte crack',this.crackTexture(),2.6);
    this.mist=mist.entity;this.mistMaterial=mist.material;this.crack=crack.entity;this.crackMaterial=crack.material;
  }

  /** Fetches the five GLBs ahead of the first death (on entering the bar, once idle); a death that comes sooner loads what it needs. */
  preload():void {for(const clip of DEATH_CLIP_ORDER)this.request(clip);}
  private request(clip:DeathClip):void {
    if(this.requested.has(clip)||this.destroyed)return;
    this.requested.add(clip);
    this.host.app.assets.loadFromUrl(clipUrl(clip),'container',(error,asset)=>{
      if(this.destroyed)return;
      if(error||!asset){console.warn(`Cena da Morte: ${clip} indisponível.`,error);this.requested.delete(clip);return;}
      this.containers.set(clip,asset.resource as pc.ContainerResource);
    });
  }
  get ready():boolean {return DEATH_CLIP_ORDER.every(clip=>this.containers.has(clip));}

  /** Starts the scene; one at a time (a second death starts over from its own plan). */
  start(plan:DeathPlan):void {
    this.stop();
    this.plan=plan;this.fired=new Set();this.shown=undefined;this.stepAt=0;
    for(const clip of DEATH_CLIP_ORDER)this.request(clip);
    this.root.enabled=true;
    // The victim looks towards where she will rise, to watch it happen.
    if(plan.victim===this.host.localId())this.host.faceCamera(Math.atan2(plan.sx-plan.vx,plan.sz-plan.vz));
  }
  /** The plan being played, if any (the owner asks who the victim is). */
  get current():DeathPlan|undefined {return this.plan;}
  stop():void {
    if(this.plan)this.onPull?.(this.plan.victim,0,{x:0,z:0});
    this.plan=undefined;this.root.enabled=false;this.mist.enabled=false;this.crack.enabled=false;
    for(const rig of this.rigs.values())rig.entity.enabled=false;
    if(this.punch){this.host.punchFov(0);this.punch=0;}
    this.audio?.sceneEnd();
  }

  update(dt:number):void {
    const plan=this.plan;if(!plan)return;
    const now=this.host.serverNow(),frame=deathFrame(plan,now),starts=deathStarts(plan);
    if(frame.done&&now>plan.startedAt+deathDurationMs(plan)+300){this.stop();return;}
    // Her place: the position of the frame, her feet on the floor.
    this.root.setPosition(frame.x,frame.y,frame.z);this.root.setEulerAngles(0,frame.yaw*RAD_TO_DEG,0);
    this.showClip(frame.clip,frame.time);
    this.dress(plan,frame.clip,now,starts);
    this.cues(plan,now,starts,frame.impacted,dt);
    // The victim is pulled into the cloud as the leaving clip starts, and is gone when it covers the body.
    const pull=smooth((now-starts.leave)/DEATH.takenMs);
    this.onPull?.(plan.victim,pull,{x:plan.ax,z:plan.az});
  }

  /** The clip's rig, built once from its container; only the current clip is enabled. */
  private showClip(clip:DeathClip,time:number):void {
    if(this.shown!==clip){
      const before=this.shown?this.rigs.get(this.shown):undefined;if(before)before.entity.enabled=false;
      this.shown=clip;
    }
    let rig=this.rigs.get(clip);
    const container=this.containers.get(clip);
    // Built once per clip and kept: building it again every frame stacked a new Morte on the old ones.
    if(!rig&&container){rig=this.build(clip,container);this.rigs.set(clip,rig);}
    if(!rig){this.root.enabled=false;return;}
    this.root.enabled=true;rig.entity.enabled=true;
    const layer=rig.anim.baseLayer;
    if(layer){
      const duration=layer.activeStateDuration||DEATH_CLIPS[clip].ms/1000;
      const wanted=clip==='float'?time%duration:Math.min(time,duration);
      // The clip runs on its own; only a drift from the room's clock (a late joiner, a slow frame) is corrected.
      let drift=Math.abs(layer.activeStateCurrentTime-wanted);if(clip==='float')drift=Math.min(drift,duration-drift);
      if(drift>.2||!rig.tracks)layer.activeStateCurrentTime=wanted;
      rig.tracks=1;
    }
  }
  private build(clip:DeathClip,container:pc.ContainerResource):ClipRig {
    const entity=container.instantiateRenderEntity({castShadows:true,receiveShadows:true});
    entity.name=`Morte ${clip}`;entity.enabled=false;this.root.addChild(entity);
    entity.addComponent('anim',{activate:true});
    const track=container.animations[0]?.resource as pc.AnimTrack|undefined;
    if(track&&entity.anim)entity.anim.assignAnimation('clip',track,undefined,1,clip==='float');
    const smoke:pc.Entity[]=[];
    const walk=(node:pc.GraphNode)=>{
      if(node instanceof pc.Entity&&/^fumaca_/.test(node.name)){smoke.push(node);
        node.render?.meshInstances.forEach(instance=>{instance.castShadow=false;instance.receiveShadow=false;if(instance.material)instance.material.depthWrite=false;});}
      node.children.forEach(walk);
    };
    walk(entity);
    // Low quality: half the puffs of smoke.
    if(this.host.lowQuality())smoke.forEach((node,index)=>{if(index%2)node.enabled=false;});
    return {entity,anim:entity.anim!,smoke,tracks:0};
  }

  /** The disc of mist under her while she rises and leaves, and the crack of the blow. */
  private dress(plan:DeathPlan,clip:DeathClip,now:number,starts:ReturnType<typeof deathStarts>):void {
    const rise=clip==='rise'?Math.min(1,(now-starts.rise)/1200)*(1-smooth((now-starts.rise-DEATH_CLIPS.rise.ms+1500)/1500)):0;
    const leave=clip==='leave'?smooth((now-starts.leave)/1500)*(1-smooth((now-starts.leave-DEATH_CLIPS.leave.ms+1500)/1500)):0;
    const amount=Math.max(rise,leave)*(this.host.lowQuality()?.7:.92);
    this.mist.enabled=amount>.01;
    if(this.mist.enabled){
      const at=clip==='rise'?{x:plan.sx,z:plan.sz}:{x:plan.ax,z:plan.az};
      this.mist.setPosition(at.x,plan.vy+.03,at.z);this.mistMaterial.opacity=amount;this.mistMaterial.update();
    }
    // The crack stays on the floor where the scythe landed, then fades with the scene's end.
    const hit=now-(starts.strike+DEATH.impactMs);
    if(hit>=0){
      const fade=1-smooth((now-starts.leave-DEATH_CLIPS.leave.ms+2500)/2500);
      this.crack.enabled=fade>.01;
      const landing=this.landing(plan);
      this.crack.setPosition(landing.x,plan.vy+.025,landing.z);this.crack.setEulerAngles(0,(Math.atan2(plan.vx-plan.ax,plan.vz-plan.az))*RAD_TO_DEG,0);
      this.crackMaterial.opacity=Math.min(1,hit/180)*fade*.9;this.crackMaterial.update();
    }else this.crack.enabled=false;
  }
  /** Where the scythe lands: beside the victim, between her and the body. */
  private landing(plan:DeathPlan):{x:number;z:number} {
    const dx=plan.vx-plan.ax,dz=plan.vz-plan.az,length=Math.hypot(dx,dz)||1,side=.55;
    return {x:plan.ax+dx*.55+(-dz/length)*side,z:plan.az+dz*.55+(dx/length)*side};
  }

  /** Sounds, shakes and dust at their moments (each fires once), with the distance deciding the loudness. */
  private cues(plan:DeathPlan,now:number,starts:ReturnType<typeof deathStarts>,impacted:boolean,dt:number):void {
    const once=(key:string,when:number,action:()=>void)=>{if(now>=when&&!this.fired.has(key)){this.fired.add(key);action();}};
    const audio=this.audio,eye=this.host.camera.getPosition(),near=Math.max(0,1-Math.hypot(eye.x-plan.ax,eye.z-plan.az)/40),calm=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const local=plan.victim===this.host.localId();
    if(audio)audio.proximity=local?1:near*near;
    const shake=(metres:number)=>{if(!calm&&near>.15)this.host.shake(metres*(local?1:near));};
    once('begin',plan.startedAt,()=>{audio?.sceneBegin();});
    once('rise',starts.rise,()=>{audio?.rise();shake(.07);this.host.dust(plan.sx,plan.vy+.1,plan.sz,2.2,[.03,.03,.04]);});
    once('whoosh',starts.strike+700,()=>audio?.whoosh());
    once('impact',starts.strike+DEATH.impactMs,()=>{
      audio?.impact();shake(.11);
      const landing=this.landing(plan);this.host.dust(landing.x,plan.vy+.15,landing.z,this.host.lowQuality()?1.2:2,[.36,.32,.28]);
    });
    once('laugh',starts.laugh,()=>{audio?.laugh(DEATH_CLIPS.laugh.ms);if(!calm&&near>.15){this.punch=1.6;this.host.punchFov(1.6);}});
    once('laugh-end',starts.laugh+900,()=>{if(this.punch){this.host.punchFov(0);this.punch=0;}});
    once('leave',starts.leave,()=>{audio?.leave();});
    once('taken',starts.leave+DEATH.takenMs,()=>{this.host.dust(plan.ax,plan.vy+.2,plan.az,1.8,[.02,.02,.03]);});
    // Slow, dragging steps while she floats over to the victim.
    const floating=now>=starts.float&&now<starts.strike;
    if(floating&&now>=this.stepAt){this.stepAt=now+850;audio?.step();}
    void dt;
  }

  destroy():void {
    this.destroyed=true;this.stop();this.root.destroy();this.mist.destroy();this.crack.destroy();
    this.mistMaterial.destroy();this.crackMaterial.destroy();
  }

  private radialTexture():pc.Texture {
    const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
    const g=canvas.getContext('2d')!,gradient=g.createRadialGradient(64,64,4,64,64,62);
    gradient.addColorStop(0,'rgba(0,0,0,1)');gradient.addColorStop(.55,'rgba(0,0,0,.75)');gradient.addColorStop(1,'rgba(0,0,0,0)');
    g.fillStyle=gradient;g.fillRect(0,0,128,128);
    return this.texture('Morte mist',canvas);
  }
  /** Cracks spreading from the point of the blow: jagged dark lines, thinner as they go. */
  private crackTexture():pc.Texture {
    const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
    const g=canvas.getContext('2d')!;g.strokeStyle='rgba(0,0,0,1)';g.lineCap='round';
    let seed=7;const random=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
    const branch=(x:number,y:number,angle:number,length:number,width:number,depth:number)=>{
      if(length<6||depth>3)return;
      g.lineWidth=width;g.beginPath();g.moveTo(x,y);
      let cx=x,cy=y,heading=angle;
      for(let step=0;step<5;step++){heading+=(random()-.5)*.9;cx+=Math.cos(heading)*length/5;cy+=Math.sin(heading)*length/5;g.lineTo(cx,cy);}
      g.stroke();
      if(random()<.8)branch(cx,cy,heading+.7,length*.55,width*.6,depth+1);
      if(random()<.6)branch(cx,cy,heading-.7,length*.5,width*.6,depth+1);
    };
    for(let arm=0;arm<7;arm++)branch(128,128,arm/7*Math.PI*2+random()*.4,95,5,0);
    const fade=g.createRadialGradient(128,128,10,128,128,126);fade.addColorStop(0,'rgba(0,0,0,1)');fade.addColorStop(1,'rgba(0,0,0,0)');
    g.globalCompositeOperation='destination-in';g.fillStyle=fade;g.fillRect(0,0,256,256);
    return this.texture('Morte crack',canvas);
  }
  private texture(name:string,canvas:HTMLCanvasElement):pc.Texture {
    const texture=new pc.Texture(this.host.app.graphicsDevice,{name,width:canvas.width,height:canvas.height,format:pc.PIXELFORMAT_RGBA8,mipmaps:false,
      minFilter:pc.FILTER_LINEAR,magFilter:pc.FILTER_LINEAR,addressU:pc.ADDRESS_CLAMP_TO_EDGE,addressV:pc.ADDRESS_CLAMP_TO_EDGE});
    texture.setSource(canvas);return texture;
  }
}
