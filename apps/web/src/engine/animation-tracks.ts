import * as pc from 'playcanvas';

/** Complete sparse skeletal tracks from a pristine model before its first animation runs.
 * PlayCanvas keeps the previous value when a new track omits a property. */
export function completeBasePose(track:pc.AnimTrack,model:pc.GraphNode):pc.AnimTrack {
  const missing:{values:number[];path:pc.AnimCurve['paths'][number]}[]=[];
  const nodes:pc.GraphNode[]=[],hip=model.findByName('hip'),root=model.findByName('root');
  hip?.forEach(node=>nodes.push(node));
  if(root&&!nodes.includes(root))nodes.unshift(root);
  const allPaths=track.curves.flatMap(curve=>curve.paths);
  for(const node of nodes){
    const paths=allPaths.filter(path=>path.entityPath.at(-1)===node.name);
    const entityPath:string[]=[];
    for(let current:pc.GraphNode|null=node;current;current=current.parent){
      entityPath.unshift(current.name);
      if(current===model)break;
    }
    const properties=node===root||node===hip?['localRotation','localPosition']:['localRotation'];
    for(const property of properties){
      if(paths.some(path=>path.propertyPath[0]===property))continue;
      const q=node.getLocalRotation(),p=node.getLocalPosition();
      missing.push({values:property==='localRotation'?[q.x,q.y,q.z,q.w]:[p.x,p.y,p.z],
        path:{entityPath:paths[0]?.entityPath??entityPath,component:paths[0]?.component??'graph',propertyPath:[property]}});
    }
  }
  if(!missing.length)return track;
  const inputs=[...track.inputs,new pc.AnimData(1,[0])],outputs=[...track.outputs],curves=[...track.curves];
  for(const {values,path} of missing){
    const output=outputs.push(new pc.AnimData(values.length,values))-1;
    curves.push(new pc.AnimCurve([path],inputs.length-1,output,pc.INTERPOLATION_STEP));
  }
  // PlayCanvas 2.23 declares this getter as AnimEvents, but returns its event array.
  const events=track.events as unknown as object[];
  return new pc.AnimTrack(track.name,track.duration,inputs,outputs,curves,new pc.AnimEvents(events));
}
