import {Quaternion, Vector3} from 'three';

// Every rig carries the canonical joint names (the importers alias them). No joints, weights, bind
// matrices or mesh vertices are replaced.
const ends = {hip:'spine_01', spine_01:'spine_02', spine_02:'spine_03', spine_03:'neck', neck:'head'};
for (const side of ['l','r']) {
  for (const [bone,end] of Object.entries({shoulder:'upperarm',upperarm:'lowerarm',lowerarm:'hand',
    upperleg:'lowerleg',lowerleg:'foot',foot:'toe'})) ends[`${bone}_${side}`]=`${end}_${side}`;
}
const rotation = node => node.getWorldQuaternion(new Quaternion()).normalize();
const position = node => node.getWorldPosition(new Vector3());

/** Calibrate native A/T poses by actual bone directions, rather than assuming identical bind poses.
 * The calibration is virtual: the authored skeleton and its bind pose remain untouched. */
export function createRetarget(nodes, referenceNodes, referenceName = node => node.name) {
  const names=nodes.map(n=>n.name);
  const byName=new Map(names.map((name,i)=>[name,i]));
  const reference=new Map(referenceNodes.map(n=>[referenceName(n),n]));
  const parents=nodes.map(n=>nodes.indexOf(n.parent));
  const rest=nodes.map(rotation),local=nodes.map(n=>n.quaternion.clone());
  const bind=[],correction=[];
  // Each mapped joint has its own axes. An A-pose upper arm must first be aligned to
  // the source T-pose; transferring only rest deltas leaves the arms inside the torso.
  const calibrate=i=>{
    if(bind[i])return;
    const node=nodes[i];
    const name=names[i],end=ends[name],targetEnd=byName.get(end),source=reference.get(name),sourceEnd=reference.get(end);
    // Faces and soles already face the correct direction in the native model.
    // Their geometry is a better neutral reference than an artist's neck/toe axis.
    let swing=name==='head'||/^(foot|toe)_[lr]$/.test(name)?new Quaternion():undefined;
    if(!swing&&source&&sourceEnd&&targetEnd!==undefined){
      const a=position(nodes[targetEnd]).sub(position(node)).normalize();
      const b=position(sourceEnd).sub(position(source)).normalize();
      if(a.lengthSq()>.5&&b.lengthSq()>.5)swing=new Quaternion().setFromUnitVectors(a,b);
    }
    // Hands and fingers inherit their parent's pose correction, keeping their native
    // palm orientation and finger spread instead of forcing Nathan's finger axes.
    if(!swing&&parents[i]>=0){calibrate(parents[i]);swing=correction[parents[i]].clone();}
    correction[i]=swing??new Quaternion();
    bind[i]=correction[i].clone().multiply(rest[i]).normalize();
  };
  nodes.forEach((_,i)=>calibrate(i));
  const sourceBind=new Map(referenceNodes.map(n=>[referenceName(n),rotation(n)]));
  const helpers=nodes.map((node,i)=>{
    const match=/^cc_base_([lr])_(forearm|upperarm|calf|thigh)twist0([12])$/i.exec(node.name);
    const standard=/^(upperarm|lowerarm|upperleg|lowerleg)_twist_([lr])$/.exec(node.name);
    if(match||standard){const side=match?match[1].toLowerCase():standard[2],part=match?{forearm:'lowerarm',upperarm:'upperarm',calf:'lowerleg',thigh:'upperleg'}[match[2].toLowerCase()]:standard[1];
      const main=byName.get(`${part}_${side}`),end=byName.get(ends[`${part}_${side}`]);
      const axis=main!==undefined&&end!==undefined?position(nodes[end]).sub(position(nodes[main])).applyQuaternion(rest[main].clone().invert()).normalize():new Vector3(1,0,0);
      return {type:'twist',main,end,axis,weight:!match||match[3]==='2'?.5:0};}
    if(/(?:elbow|knee)sharebone$/i.test(node.name))return {type:'share',main:parents[i],above:parents[parents[i]]};
    return undefined;
  });
  return {names,bind,sourceBind,parents,rest,
    /** Source poses and source bind frames must use the same world coordinate system. */
    pose(source, referenceBind=sourceBind, enabled=()=>true, fallback=local){
      const world=[],output=[];
      // Resolve all mapped world rotations first; helpers can depend on a later hand/foot.
      nodes.forEach((node,i)=>{
        const name=names[i],q=source.get(name),base=referenceBind.get(name);
        if(name!=='root'&&q&&base&&enabled(name)&&node.userData.retargetMesh!==true)
          world[i]=q.clone().multiply(base.clone().invert()).multiply(bind[i]).normalize();
      });
      const resolve=i=>{
        if(world[i])return world[i];
        const parent=parents[i],parentWorld=parent<0?new Quaternion():resolve(parent);
        return world[i]=parentWorld.clone().multiply(fallback[i]).normalize();
      };
      nodes.forEach((_,i)=>resolve(i));
      for(const [i,helper] of helpers.entries()){
        if(!helper||!enabled(names[helper.main])||helper.main===undefined)continue;
        const main=helper.main;
        if(helper.type==='share'&&helper.above>=0){
          const a=world[helper.above].clone().multiply(bind[helper.above].clone().invert());
          const b=world[main].clone().multiply(bind[main].clone().invert());
          world[i]=a.slerp(b,.5).multiply(bind[i]).normalize();
        }else if(helper.type==='twist'&&helper.end!==undefined){
          const mainDelta=world[main].clone().multiply(bind[main].clone().invert());
          const endDelta=world[helper.end].clone().multiply(bind[helper.end].clone().invert());
          // Only axial roll is shared along a limb: elbow/knee bending must never
          // rotate the twist chain away from the line between the actual joints.
          const relative=world[main].clone().invert().multiply(endDelta.multiply(mainDelta.invert())).multiply(world[main]);
          const axis=helper.axis;
          const dot=relative.x*axis.x+relative.y*axis.y+relative.z*axis.z;
          const twist=new Quaternion(axis.x*dot,axis.y*dot,axis.z*dot,relative.w);
          if(twist.lengthSq()<1e-10)twist.identity();else twist.normalize();
          const base=world[main].clone().multiply(rest[main].clone().invert()).multiply(rest[i]);
          const axial=new Quaternion().slerp(twist,helper.weight);
          world[i]=world[main].clone().multiply(axial).multiply(world[main].clone().invert()).multiply(base).normalize();
        }
      }
      nodes.forEach((_,i)=>{const parent=parents[i];output[i]=(parent<0?new Quaternion():world[parent].clone().invert()).multiply(world[i]).normalize();});
      return output;
    }
  };
}
