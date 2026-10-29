import * as pc from 'playcanvas';
import {STAGE_PHASES,STAGE_SPOTS,phaseMs,type StagePhase,type StageSpot} from '@bar/shared';
import {convert,readClip,readSource,readTarget,type Source,type Target} from './mixamo-retarget';

/**
 * The stage's musicians in PlayCanvas: a port of palco_musicos.js (assets-bar/map/BarBoteco/export/animacoes), which is
 * written for three.js. As there (mixamo-retarget.ts), the clips of a spot (public/palco/palco_<spot>.glb: a 1.75 m Mixamo skeleton with its
 * origin on the spot's floor, facing +Z, and the instrument as Prop_* nodes) are converted to each skin by the world
 * rotation of every bone, and the map's instrument (Palco_Violao, Palco_Cavaquinho, Palco_Baquetas) hides while the
 * GLB's copy of it is in the musician's hands. Who plays where, and since when, comes from the room (musicians.ts).
 */

// The clips were made on a 1.75 m skeleton: on a body far from it the hands and the seat no longer meet.
const AUTHORED_HEIGHT=1.75;
/** The anim state of a spot's phase, on the musician's skin and on the instrument. */
export const musicianState=(spot:string,phase:StagePhase):string=>`Palco ${spot} ${phase}`;
/** Seconds into the phase's clip at `now` (server ms): the loop repeats, the others hold their last frame. */
export function musicianTime(spot:StageSpot,phase:StagePhase,startedAt:number,now:number):number {
  const age=Math.max(0,now-startedAt)/1000,duration=phaseMs(spot,phase)/1000;
  return !duration?0:phase==='loop'?age%duration:Math.min(age,duration);
}

interface SpotView {
  spot:StageSpot;
  anchor?:pc.GraphNode;
  /** The map's instrument, on its stand while nobody plays it. */
  instrument?:pc.GraphNode;
  loading?:Promise<void>;failed?:boolean;source?:Source;
  /** The GLB's copy of the instrument, animated with the musician's body (none at the microphone). */
  props?:pc.Entity;propKey:string;
  /** A musician was drawn at the spot this frame. */
  played:boolean;
}

/**
 * The instrument's part of a clip (its Prop_* nodes, at rest in `props`). Blender leaves out a channel that stays at the
 * rest value (the guitar's turn in the loop): it is filled in here, or the engine would keep whatever the previous clip
 * left there, and a client that skips a phase (late, or back from a hidden tab) would hold the instrument askew.
 */
function propsTrack(track:pc.AnimTrack,props:Map<string,pc.GraphNode>):pc.AnimTrack|null {
  const curves:pc.AnimCurve[]=[],outputs=[...track.outputs],animated=new Set<string>(),paths=new Map<string,string[]>();
  for(const curve of track.curves){
    const onProps=curve.paths.filter(path=>props.has(path.entityPath[path.entityPath.length-1]??''));
    if(!onProps.length)continue;
    curves.push(new pc.AnimCurve(onProps,curve.input,curve.output,curve.interpolation));
    for(const path of onProps){const name=path.entityPath[path.entityPath.length-1]!;animated.add(`${name}.${path.propertyPath[0]}`);paths.set(name,path.entityPath);}
  }
  if(!curves.length)return null;
  const inputs=[...track.inputs,new pc.AnimData(1,new Float32Array([0,track.duration]))];
  for(const [name,node] of props)for(const property of ['localPosition','localRotation'] as const){
    if(animated.has(`${name}.${property}`))continue;
    const rest=property==='localPosition'?[...node.getLocalPosition().toArray([])]:[...node.getLocalRotation().toArray([])];
    outputs.push(new pc.AnimData(rest.length,new Float32Array([...rest,...rest])));
    curves.push(new pc.AnimCurve([{entityPath:paths.get(name)??[name],component:'graph',propertyPath:[property]}],inputs.length-1,outputs.length-1,pc.INTERPOLATION_LINEAR));
  }
  return new pc.AnimTrack(track.name,track.duration,inputs,outputs,curves);
}

export class StageMusicians {
  private readonly spots=new Map<string,SpotView>();
  /** Each skin's bind pose, read once from its first avatar. */
  private readonly targets=new Map<string,Target>();
  /** The four clips of a spot converted for a skin (`skin|spot`); null when that failed. */
  private readonly converted=new Map<string,pc.AnimTrack[]|null>();
  private destroyed=false;

  constructor(private readonly app:pc.Application,map:pc.Entity) {
    for(const spot of STAGE_SPOTS){
      const anchor=map.findByName(`Palco_Lugar_${spot.id[0]!.toUpperCase()}${spot.id.slice(1)}`)??undefined;
      const instrument=spot.instrument?map.findByName(spot.instrument)??undefined:undefined;
      if(!anchor)console.warn(`Lugar do palco "${spot.id}" ausente no mapa.`);
      if(spot.instrument&&!instrument)console.warn(`Instrumento "${spot.instrument}" ausente no mapa.`);
      this.spots.set(spot.id,{spot,anchor,instrument,propKey:'',played:false});
    }
  }

  /** Starts downloading a spot's clips (the local player came near it), so taking it starts without a wait. */
  preload(spotId:string):void {const view=this.spots.get(spotId);if(view)void this.load(view);}

  /**
   * The four body clips of a spot for a skin, converted on first use from an avatar wearing it (`model`, with its own
   * clips `tracks`). Undefined while the spot's GLB loads, or if the skin cannot take them.
   */
  bodyTracks(spotId:string,skinId:string,model:pc.Entity,tracks:readonly pc.AnimTrack[]):pc.AnimTrack[]|undefined {
    const view=this.spots.get(spotId),key=`${skinId}|${spotId}`;
    if(!view)return;
    if(!view.source){void this.load(view);return;}
    if(!this.converted.has(key)){
      try{
        let target=this.targets.get(skinId);
        if(!target){
          target=readTarget(model,tracks);this.targets.set(skinId,target);
          if(Math.abs(target.height-AUTHORED_HEIGHT)>.15)console.warn(`Palco: a skin ${skinId} tem ${target.height.toFixed(2)} m; as animações foram feitas para ${AUTHORED_HEIGHT} m (mãos e assento podem não encostar).`);
        }
        const source=view.source;
        this.converted.set(key,source.clips.map((clip,i)=>convert(clip,source,target!,musicianState(spotId,STAGE_PHASES[i]!))));
      }catch(error){console.warn(`Palco: não foi possível adaptar as animações de ${spotId} para ${skinId}.`,error);this.converted.set(key,null);}
    }
    return this.converted.get(key)??undefined;
  }

  /** This frame a musician plays `phase` at the spot, begun at `startedAt`: the instrument copy follows the body. */
  play(spotId:string,phase:StagePhase,startedAt:number,now:number,blend:number):void {
    const view=this.spots.get(spotId);
    if(!view?.source||phase==='fim')return;
    view.played=true;
    if(view.instrument)view.instrument.enabled=false;
    const props=view.props;
    if(!props)return;
    props.enabled=true;
    const key=`${phase}:${startedAt}`,layer=props.anim?.baseLayer;
    if(key===view.propKey||!layer)return;
    layer.transition(musicianState(spotId,phase),view.propKey?blend:0);
    layer.activeStateCurrentTime=musicianTime(view.spot,phase,startedAt,now);
    view.propKey=key;
  }

  /** After every avatar has been posed: a spot nobody played this frame has its instrument back on the stand. */
  frame():void {
    for(const view of this.spots.values()){
      if(!view.played){
        if(view.instrument)view.instrument.enabled=true;
        if(view.props)view.props.enabled=false;
        view.propKey='';
      }
      view.played=false;
    }
  }

  telemetry():Record<string,{loaded:boolean;instrument:boolean|null;props:boolean|null;propState:string|null;propTime:number|null}> {
    return Object.fromEntries([...this.spots].map(([id,view])=>[id,{loaded:!!view.source,instrument:view.instrument?view.instrument.enabled:null,
      props:view.props?view.props.enabled:null,propState:view.props?.enabled?view.props.anim?.baseLayer?.activeState??null:null,
      propTime:view.props?.enabled?+(view.props.anim?.baseLayer?.activeStateCurrentTime??0).toFixed(3):null}]));
  }

  destroy():void {
    this.destroyed=true;
    for(const view of this.spots.values()){view.props?.destroy();if(view.instrument)view.instrument.enabled=true;}
  }

  private load(view:SpotView):Promise<void> {
    if(view.failed)return Promise.resolve();
    return view.loading??=new Promise<void>(resolve=>{
      const {file,hash}=view.spot.animation;
      this.app.assets.loadFromUrl(`${import.meta.env.BASE_URL}palco/${file}?v=${hash}`,'container',(error,asset)=>{
        if(this.destroyed){resolve();return;}
        if(error||!asset){console.warn(`Animações do palco (${view.spot.id}) indisponíveis.`,error);view.failed=true;resolve();return;}
        try{
          const container=asset.resource as pc.ContainerResource;
          const tracks=view.spot.clips.map(name=>{
            const track=container.animations.map(a=>a.resource as pc.AnimTrack).find(t=>t.name===name);
            if(!track)throw new Error(`${file} não tem o clipe ${name}`);
            return track;
          });
          // Instantiated, before any clip runs: the authoring skeleton and the instrument at rest.
          const entity=container.instantiateRenderEntity({castShadows:true,receiveShadows:true});
          view.source=readSource(entity,tracks.map(track=>readClip(track)));
          const props=new Map(entity.find(node=>node.name.startsWith('Prop_')).map(node=>[node.name,node]));
          const propTracks=tracks.map(track=>propsTrack(track,props));
          if(propTracks.some(Boolean)){
            // The GLB's copy of the instrument stands on the spot (its clips are in the spot's space) until someone plays.
            entity.name=`Palco ${view.spot.id} instrumento`;entity.enabled=false;
            if(view.anchor){entity.setPosition(view.anchor.getPosition());entity.setRotation(view.anchor.getRotation());}
            entity.addComponent('anim',{activate:true});
            propTracks.forEach((track,i)=>{if(track)entity.anim!.assignAnimation(musicianState(view.spot.id,STAGE_PHASES[i]!),track,undefined,1,STAGE_PHASES[i]==='loop');});
            this.app.root.addChild(entity);view.props=entity;
          }else entity.destroy();
        }catch(failure){console.warn(`Animações do palco (${view.spot.id}) inválidas.`,failure);view.failed=true;view.source=undefined;}
        resolve();
      });
    });
  }
}
