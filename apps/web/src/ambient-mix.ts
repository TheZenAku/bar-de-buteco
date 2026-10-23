/** Quiet ambience bus; the slider scales this ceiling, not the source recordings. */
export const AMBIENT_MIX={gain:.18,duck:.3,crossfade:12,preload:30} as const;
export interface AmbientTrack {id:string;url:string;duration:number;source?:string;}

/** Every recording once per bag, including no repeat across bag boundaries. */
export class AmbientQueue {
  private bag:AmbientTrack[]=[];
  private last='';
  constructor(private readonly tracks:readonly AmbientTrack[],private readonly random= Math.random){}
  next(excluded:ReadonlySet<string>):AmbientTrack|undefined {
    this.bag=this.bag.filter(track=>!excluded.has(track.id));
    if(!this.bag.length){
      this.bag=this.tracks.filter(track=>!excluded.has(track.id));
      for(let i=this.bag.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[this.bag[i],this.bag[j]]=[this.bag[j],this.bag[i]];}
      if(this.bag.length>1&&this.bag.at(-1)!.id===this.last)[this.bag[0],this.bag[this.bag.length-1]]=[this.bag.at(-1)!,this.bag[0]];
    }
    const track=this.bag.pop();if(track)this.last=track.id;return track;
  }
}

export function fadeCurve(incoming:boolean):Float32Array<ArrayBuffer> {
  return Float32Array.from({length:65},(_,i)=>incoming?Math.sin(i/64*Math.PI/2):Math.cos(i/64*Math.PI/2));
}
