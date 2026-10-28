import * as pc from 'playcanvas';
import {TELEVISIONS,COLLIDERS} from '@bar/shared';
export type TvDefinition=typeof TELEVISIONS[number];
export type Point={x:number;y:number};
/** Projective transform, not an axis-aligned floating rectangle. Order: TL, TR, BR, BL. */
export function televisionTransform(p:Point[],width=640,height=360):string {
  const [a,b,c,d]=p,dx1=b.x-c.x,dx2=d.x-c.x,dx3=a.x-b.x+c.x-d.x;
  const dy1=b.y-c.y,dy2=d.y-c.y,dy3=a.y-b.y+c.y-d.y,den=dx1*dy2-dx2*dy1;
  const g=Math.abs(den)<1e-9?0:(dx3*dy2-dx2*dy3)/den,h=Math.abs(den)<1e-9?0:(dx1*dy3-dx3*dy1)/den;
  const m=[(b.x-a.x+g*b.x)/width,(b.y-a.y+g*b.y)/width,0,g/width,(d.x-a.x+h*d.x)/height,(d.y-a.y+h*d.y)/height,0,h/height,0,0,1,0,a.x,a.y,0,1];
  return `matrix3d(${m.join(',')})`;
}
export class TelevisionSurface {
  private plane:pc.Entity;
  private material:pc.ShaderMaterial;
  private offMaterial:pc.StandardMaterial;
  private visible=false;
  /** The map's own picture on this screen (the stage's standby art): shown instead of the dark aperture while no video plays. */
  private standby?:pc.Entity;
  readonly right:pc.Vec3;
  readonly normal:pc.Vec3;
  constructor(private app:pc.Application,readonly definition:TvDefinition) {
    const angle=definition.yaw*Math.PI/180;
    this.right=new pc.Vec3(Math.cos(angle),0,-Math.sin(angle));this.normal=new pc.Vec3(Math.sin(angle),0,Math.cos(angle));
    this.material=new pc.ShaderMaterial({uniqueName:'YouTube screen alpha aperture',attributes:{aPosition:pc.SEMANTIC_POSITION},
      vertexGLSL:'attribute vec3 aPosition;uniform mat4 matrix_model;uniform mat4 matrix_viewProjection;void main(){gl_Position=matrix_viewProjection*matrix_model*vec4(aPosition,1.0);}',
      fragmentGLSL:'void main(){gl_FragColor=vec4(0.0);}' });
    this.material.blendType=pc.BLEND_NONE;this.material.depthWrite=true;this.material.depthTest=true;this.material.cull=pc.CULLFACE_NONE;
    this.offMaterial=new pc.StandardMaterial();this.offMaterial.useLighting=false;this.offMaterial.diffuse.set(0,0,0);this.offMaterial.emissive.set(.008,.008,.008);this.offMaterial.cull=pc.CULLFACE_NONE;this.offMaterial.update();
    this.plane=new pc.Entity(`YouTube aperture ${definition.id}`);
    this.plane.addComponent('render',{type:'plane',material:this.offMaterial,castShadows:false,receiveShadows:false});
    this.plane.setPosition(definition.x,definition.y,definition.z);this.plane.setEulerAngles(90,definition.yaw,0);this.plane.setLocalScale(definition.width,1,definition.height);
    app.root.addChild(this.plane);
  }
  show(value:boolean):void {if(this.visible!==value){this.visible=value;for(const mesh of this.plane.render!.meshInstances)mesh.material=value?this.material:this.offMaterial;this.showStandby();this.app.renderNextFrame=true;}}
  setStandby(entity:pc.Entity|undefined):void {this.standby=entity;this.showStandby();}
  private showStandby():void {if(!this.standby)return;this.standby.enabled=!this.visible;this.plane.enabled=this.visible;}
  /**
   * The video always stays on its screen, at any size and even when partly outside the view; the
   * depth-tested alpha aperture hides it behind walls, furniture and people. Null only when the camera
   * sees the back of the TV or a corner is behind the camera, where no projection exists.
   */
  project(camera:pc.CameraComponent):Point[]|null {
    const d=this.definition,eye=camera.entity.getPosition();
    if(new pc.Vec3(eye.x-d.x,eye.y-d.y,eye.z-d.z).dot(this.normal)<=.02)return null;
    const points=this.corners().map(p=>camera.worldToScreen(p));
    if(points.some(p=>p.z<=camera.nearClip))return null;
    return points.map(p=>({x:p.x,y:p.y}));
  }
  private corners():pc.Vec3[] {
    const d=this.definition;
    return [[-1,1],[1,1],[1,-1],[-1,-1]].map(([x,y])=>new pc.Vec3(d.x+this.right.x*x*d.width/2,d.y+y*d.height/2,d.z+this.right.z*x*d.width/2));
  }
  /** No structural wall between the camera and the screen: only then may the pointer reach its player. */
  clearFrom(camera:pc.CameraComponent):boolean {
    const eye=camera.entity.getPosition();
    return !this.corners().some(p=>COLLIDERS.some(box=>{
      if(box.ramp)return false;
      const from=[eye.x,eye.y,eye.z],to=[p.x,p.y,p.z],min=[box.x-box.hx,(box.minY??-1000),box.z-box.hz],max=[box.x+box.hx,(box.maxY??1000),box.z+box.hz];
      let enter=.001,exit=.995;
      for(let a=0;a<3;a++) {const delta=to[a]-from[a];if(Math.abs(delta)<1e-8){if(from[a]<min[a]||from[a]>max[a])return false;continue;}
        const s=(min[a]-from[a])/delta,t=(max[a]-from[a])/delta;enter=Math.max(enter,Math.min(s,t));exit=Math.min(exit,Math.max(s,t));if(enter>exit)return false;}
      return true;
    }));
  }
  destroy():void {this.plane.destroy();this.material.destroy();this.offMaterial.destroy();}
}
