import {Quaternion,Vector3} from 'three';

/** A slower, periodic 60 Hz walk. Spherical cubic interpolation preserves the joint poses while
 * smoothing angular velocity between the source's 30 Hz keys, including across the loop boundary. */
export function polishWalkCycle(times,rotations,translations,{stretch=1.2,fps=60}={}){
  const sourceDuration=times.at(-1),duration=sourceDuration*stretch,count=times.length-1;
  if(count<3||!(sourceDuration>0))throw new Error('A walk cycle needs at least three poses and a positive duration');
  const samples=Math.round(duration*fps),outputTimes=Array.from({length:samples+1},(_,i)=>i*duration/samples);
  const negate=q=>q.set(-q.x,-q.y,-q.z,-q.w);
  const near=(q,reference)=>q.dot(reference)<0?negate(q):q;
  const log=q=>{
    const length=Math.hypot(q.x,q.y,q.z);
    return new Vector3(q.x,q.y,q.z).multiplyScalar(length>1e-9?Math.atan2(length,q.w)/length:1);
  };
  const exp=v=>{const length=v.length(),factor=length>1e-9?Math.sin(length)/length:1;return new Quaternion(v.x*factor,v.y*factor,v.z*factor,Math.cos(length));};
  const intervals=outputTimes.map(time=>{
    const t=Math.min(time/stretch,sourceDuration-1e-10);let index=0;
    while(index+1<count&&times[index+1]<=t)index++;
    return {index,u:(t-times[index])/(times[index+1]-times[index])};
  });
  const outputRotations=rotations.map(data=>{
    const poses=Array.from({length:count},(_,i)=>new Quaternion().fromArray(data,i*4).normalize());
    const controls=poses.map((q,i)=>{
      const inverse=q.clone().invert();
      const before=log(inverse.clone().multiply(near(poses[(i+count-1)%count].clone(),q)));
      const after=log(inverse.multiply(near(poses[(i+1)%count].clone(),q)));
      return q.clone().multiply(exp(before.add(after).multiplyScalar(-.25))).normalize();
    });
    const output=[];let previous;
    for(const {index,u} of intervals){
      const next=(index+1)%count;
      const arc=poses[index].clone().slerp(poses[next],u),tangent=controls[index].clone().slerp(controls[next],u);
      const q=arc.slerp(tangent,2*u*(1-u)).normalize();
      if(previous)near(q,previous);q.toArray(output,output.length);previous=q;
    }
    output.splice(-4,4,...near(poses[0].clone(),previous).toArray());
    return output;
  });
  const outputTranslations=translations.map(data=>{
    const value=(key,axis)=>data[((key+count)%count)*3+axis];
    const slope=(key,axis)=>{
      const before=value(key,axis)-value(key-1,axis),after=value(key+1,axis)-value(key,axis);
      // Monotone Hermite tangents keep pelvis height inside the authored range instead of adding bounce.
      if(before*after<=0)return 0;
      return Math.sign(before)*Math.min(Math.abs((before+after)/2),3*Math.min(Math.abs(before),Math.abs(after)));
    };
    const output=[];
    for(const {index,u} of intervals){
      const u2=u*u,u3=u2*u;
      for(let axis=0;axis<3;axis++)output.push((2*u3-3*u2+1)*value(index,axis)+(u3-2*u2+u)*slope(index,axis)
        +(-2*u3+3*u2)*value(index+1,axis)+(u3-u2)*slope(index+1,axis));
    }
    output.splice(-3,3,...data.slice(0,3));return output;
  });
  return {times:outputTimes,rotations:outputRotations,translations:outputTranslations,duration};
}
