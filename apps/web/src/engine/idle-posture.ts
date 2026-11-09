import * as pc from 'playcanvas';

// Degrees about the body's own axes: + about X swings a hanging limb back (and tips a bone pointing up forward); + about Y takes the left
// collarbone (pointing to the model's left, +X) back, so the right one turns the other way.
const TURNS:readonly (readonly [bone:string,axis:'x'|'y',degrees:number])[]=[
  ['spine_03','x',-6],['neck','x',3],
  ['shoulder_l','y',16],['shoulder_r','y',-16],
  ['upperarm_l','x',7],['upperarm_r','x',7],
];

/**
 * The Mixamo idle every skin plays stands with the shoulders rolled forward and the arms hanging in front of the body. Over it (after the
 * animation, restored before the next one, like FlyPose) the collarbones go back, the chest opens a little and the arms hang at the sides.
 * The turns are about the body's own axes, so no rig's bone axes matter; `weight` follows the clip with a short blend.
 */
export class IdlePosture {
  weight=0;
  private model?:pc.Entity;
  private bones:(pc.GraphNode|null)[]=[];
  private readonly saved=new Map<pc.GraphNode,pc.Quat>();
  private readonly turn=new pc.Quat();
  private readonly axis=new pc.Vec3();

  restore():void {
    for(const [bone,rotation] of this.saved)bone.setLocalRotation(rotation);
    this.saved.clear();
  }

  apply(model:pc.Entity,body:pc.GraphNode,idle:boolean,dt:number):void {
    this.restore();
    this.weight+=((idle?1:0)-this.weight)*(1-Math.exp(-Math.max(0,dt)/.15));
    if(this.weight<.01)return;
    if(model!==this.model){this.model=model;this.bones=TURNS.map(([name])=>model.findByName(name));}
    const rotation=body.getRotation();
    TURNS.forEach(([,axis,degrees],i)=>{
      const bone=this.bones[i];if(!bone)return;
      this.saved.set(bone,bone.getLocalRotation().clone());
      rotation.transformVector(axis==='x'?pc.Vec3.RIGHT:pc.Vec3.UP,this.axis);
      bone.setRotation(this.turn.setFromAxisAngle(this.axis,degrees*this.weight).mul(bone.getRotation().clone()));
    });
  }
}
