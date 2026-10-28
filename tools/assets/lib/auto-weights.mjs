// Automatic skin weights for a mesh that Mixamo rigged but delivered without its skin ("bone heat", as in
// Pinocchio/Blender): every vertex is anchored to the nearest bone it can see from inside the body, then the weights
// diffuse over the surface, so the blend between two bones widens where the body is thick.
import {Vector3} from 'three';

const ANCHOR=4;

/**
 * positions/normals: Float32Array (xyz), indices: Uint32Array (triangles), bones: [{a:Vector3, b:Vector3, side:'l'|'r'|'',
 * limb?:boolean}] in the same units; `side` keeps limbs of one side off the other (Mixamo's left is +X). A `limb` root
 * (thigh, upper arm) does not reach behind its joint: the hips above a thigh belong to the pelvis, so the shorts
 * there do not swing through the shirt with the leg.
 * Returns four influences per vertex: {joints:Uint16Array, weights:Float32Array}.
 */
export function autoWeights({positions,normals,indices,bones,iterations=300}){
  const count=positions.length/3;
  // Vertices split by UV seams share one position: weld them so the weights never tear along a seam.
  const keys=new Map(),group=new Uint32Array(count);
  for(let i=0;i<count;i++){
    const k=`${Math.round(positions[i*3]*1e4)},${Math.round(positions[i*3+1]*1e4)},${Math.round(positions[i*3+2]*1e4)}`;
    if(!keys.has(k))keys.set(k,keys.size);group[i]=keys.get(k);
  }
  const groups=keys.size,point=new Float32Array(groups*3),normal=new Float32Array(groups*3);
  for(let i=0;i<count;i++){const g=group[i];point.set(positions.subarray(i*3,i*3+3),g*3);for(let c=0;c<3;c++)normal[g*3+c]+=normals[i*3+c];}
  const neighbours=Array.from({length:groups},()=>new Set());let edge=0,edges=0;
  for(let f=0;f<indices.length;f+=3)for(let k=0;k<3;k++){
    const a=group[indices[f+k]],b=group[indices[f+(k+1)%3]];if(a===b)continue;
    neighbours[a].add(b);neighbours[b].add(a);
    edge+=Math.hypot(point[a*3]-point[b*3],point[a*3+1]-point[b*3+1],point[a*3+2]-point[b*3+2]);edges++;
  }
  edge/=Math.max(1,edges);
  const bvh=buildBvh(positions,indices),closest=new Vector3(),p=new Vector3(),n=new Vector3(),inside=new Vector3();
  const extent=bvh.size,offset=extent*1e-3;
  // Anchor: the nearest bone segment visible from the vertex (pushed slightly inside), with strength ANCHOR*(edge/d)^2:
  // a blend about d/sqrt(ANCHOR) wide, so a thick torso does not carry an arm's weight down to the hips.
  // Loose layers (a shirt hem over shorts) see no bone at all: they take the nearest bone behind the fewest
  // surfaces, never one reached through the air and another body part, with a weaker pull.
  const anchor=new Int32Array(groups),strength=new Float32Array(groups);
  for(let g=0;g<groups;g++){
    p.fromArray(point,g*3);n.fromArray(normal,g*3).normalize();inside.copy(p).addScaledVector(n,-offset);
    const side=p.x>extent*.005?'l':p.x<-extent*.005?'r':'';
    const ranked=bones.map((bone,i)=>{const d=segmentPoint(p,bone.a,bone.b,closest).distanceTo(p);return {i,d:bone.limb&&closest.equals(bone.a)?d*2:d};})
      .filter(({i})=>!bones[i].side||!side||bones[i].side===side).sort((x,y)=>x.d-y.d);
    let chosen,fewest=Infinity;
    for(const candidate of ranked.slice(0,8)){
      if(candidate.d>ranked[0].d*3)break;
      segmentPoint(p,bones[candidate.i].a,bones[candidate.i].b,closest);
      const crossed=bvh.crossings(inside,closest,fewest);
      if(crossed<fewest){fewest=crossed;chosen=candidate;}
      if(!fewest)break;
    }
    anchor[g]=chosen.i;strength[g]=ANCHOR*(edge/Math.max(chosen.d,edge))**2*(fewest?.25:1);
  }
  // Solve (L + H) w = H p per bone by Gauss-Seidel; all bones at once.
  const B=bones.length,w=new Float32Array(groups*B);
  for(let g=0;g<groups;g++)w[g*B+anchor[g]]=1;
  const list=neighbours.map(s=>Uint32Array.from(s)),sum=new Float32Array(B);
  for(let it=0;it<iterations;it++)for(let g=0;g<groups;g++){
    const near=list[g];sum.fill(0);
    for(let k=0;k<near.length;k++){const o=near[k]*B;for(let b=0;b<B;b++)sum[b]+=w[o+b];}
    const h=strength[g],scale=1/(near.length+h);
    for(let b=0;b<B;b++)w[g*B+b]=(sum[b]+(b===anchor[g]?h:0))*scale;
  }
  // The four strongest influences; the rest (and anything below 4%) is dropped and the sum renormalized.
  const joints=new Uint16Array(count*4),weights=new Float32Array(count*4),cache=new Map();
  for(let g=0;g<groups;g++){
    const o=g*B,top=[];
    for(let b=0;b<B;b++)if(w[o+b]>=.04)top.push(b);
    top.sort((x,y)=>w[o+y]-w[o+x]);top.length=Math.min(top.length,4);
    if(!top.length)top.push(anchor[g]);
    const total=top.reduce((s,b)=>s+w[o+b],0);
    cache.set(g,top.map(b=>[b,total>0?w[o+b]/total:1/top.length]));
  }
  for(let i=0;i<count;i++)cache.get(group[i]).forEach(([b,v],k)=>{joints[i*4+k]=b;weights[i*4+k]=v;});
  return {joints,weights};
}

function segmentPoint(p,a,b,out){
  const ab=out.subVectors(b,a),length=ab.lengthSq();
  const t=length?Math.min(1,Math.max(0,(p.x-a.x)*ab.x+(p.y-a.y)*ab.y+(p.z-a.z)*ab.z)/length):0;
  return out.copy(a).addScaledVector(ab,t);
}

/** Bounding volume hierarchy answering "does the segment p→q cross the surface?". */
function buildBvh(P,I){
  const triangles=I.length/3,order=Uint32Array.from({length:triangles},(_,i)=>i),centre=new Float32Array(triangles*3);
  for(let t=0;t<triangles;t++)for(let c=0;c<3;c++)centre[t*3+c]=(P[I[t*3]*3+c]+P[I[t*3+1]*3+c]+P[I[t*3+2]*3+c])/3;
  const nodes=[];
  const build=(start,end)=>{
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(let k=start;k<end;k++)for(let v=0;v<3;v++){const i=I[order[k]*3+v]*3;for(let c=0;c<3;c++){min[c]=Math.min(min[c],P[i+c]);max[c]=Math.max(max[c],P[i+c]);}}
    const node={min,max,start,end};nodes.push(node);
    if(end-start>8){
      const axis=[0,1,2].reduce((a,c)=>max[c]-min[c]>max[a]-min[a]?c:a,0),middle=(start+end)>>1;
      order.subarray(start,end).sort((a,b)=>centre[a*3+axis]-centre[b*3+axis]);
      node.left=build(start,middle);node.right=build(middle,end);
    }
    return node;
  };
  const top=build(0,triangles);
  const e1=new Vector3(),e2=new Vector3(),h=new Vector3(),s=new Vector3(),q=new Vector3(),a=new Vector3(),d=new Vector3();
  const hits=(o,t)=>{
    a.fromArray(P,I[t*3]*3);e1.fromArray(P,I[t*3+1]*3).sub(a);e2.fromArray(P,I[t*3+2]*3).sub(a);
    h.crossVectors(d,e2);const det=e1.dot(h);if(Math.abs(det)<1e-12)return false;
    const f=1/det;s.subVectors(o,a);const u=f*s.dot(h);if(u<0||u>1)return false;
    q.crossVectors(s,e1);const v=f*d.dot(q);if(v<0||u+v>1)return false;
    const along=f*e2.dot(q);return along>1e-4&&along<1-1e-4;
  };
  const box=(node,o)=>{
    let near=0,far=1;
    for(let c=0;c<3;c++){
      const origin=o.getComponent(c),dir=d.getComponent(c);
      if(Math.abs(dir)<1e-12){if(origin<node.min[c]||origin>node.max[c])return false;continue;}
      let t0=(node.min[c]-origin)/dir,t1=(node.max[c]-origin)/dir;if(t0>t1)[t0,t1]=[t1,t0];
      near=Math.max(near,t0);far=Math.min(far,t1);if(near>far)return false;
    }
    return true;
  };
  return {
    size:Math.max(...top.max.map((v,c)=>v-top.min[c])),
    /** Surfaces crossed by the segment from→to, counted up to `limit`. */
    crossings(from,to,limit){
      d.subVectors(to,from);const stack=[top];let count=0;
      while(stack.length){
        const node=stack.pop();if(!box(node,from))continue;
        if(node.left){stack.push(node.left,node.right);continue;}
        for(let k=node.start;k<node.end;k++)if(hits(from,order[k])&&++count>=limit)return count;
      }
      return count;
    },
  };
}
