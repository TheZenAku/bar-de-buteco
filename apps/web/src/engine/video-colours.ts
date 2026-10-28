import {jukeboxTime,type JukeboxState} from '@bar/shared';
import {PALETTE_KEYS,videoPalette,type Rgb,type VideoPalette} from './video-palette';

export const toLinear=(c:number)=>Math.pow(c,2.2);
const brightest=(c:Rgb):Rgb=>{const m=Math.max(...c,1e-4);return [c[0]/m,c[1]/m,c[2]/m];};
/** sRGB hex of a linear colour, for telemetry. */
export const hex=(c:Rgb)=>'#'+c.map(v=>Math.round(Math.pow(Math.max(0,Math.min(1,v)),1/2.2)*255).toString(16).padStart(2,'0')).join('');

/**
 * The colours a lit prop shows for a shared YouTube source (jukebox-lights.ts, stage-lights.ts): the colours of the
 * video's stills, cross-faded in the order they appear as the video advances, and eased towards. Everything follows the
 * shared timeline, so every browser shows the same colours at the same moment. Without a video, or for one without
 * colour (black and white, or no network), the prop's own colour.
 */
export class VideoColours {
  /** Shown colours (linear), easing towards the video's. */
  readonly shown:Rgb[];
  private palette?:VideoPalette;
  private requested='';
  private readonly fallback:Rgb;
  /** `fallback`: the prop's own colour (sRGB); `count`: how many colours it shows at once. */
  constructor(fallback:Rgb,count=3){
    this.fallback=fallback.map(toLinear) as Rgb;
    this.shown=Array.from({length:count},()=>[...this.fallback] as Rgb);
  }

  /** `duration`: seconds of the video, from the local player (0 while unknown). Returns the time of the shared timeline. */
  update(dt:number,state:JukeboxState|undefined,serverNow:number,duration:number):number {
    const videoId=state&&state.status!=='off'?state.videoId:'';
    if(videoId&&videoId!==this.requested){
      this.requested=videoId;this.palette=undefined;
      void videoPalette(videoId).then(palette=>{if(this.requested===palette.videoId)this.palette=palette;}).catch(()=>{});
    }
    const time=state?jukeboxTime(state,serverNow):0;
    // Without the duration the stills take turns every 40 s.
    const progress=duration>0?Math.min(.999,time/duration):(time/160)%1;
    const blend=1-Math.exp(-Math.min(dt,.1)*2.5);
    this.target(videoId?progress:-1).forEach((colour,k)=>{const shown=this.shown[k]!;for(let c=0;c<3;c++)shown[c]!+=(colour[c]!-shown[c]!)*blend;});
    return time;
  }

  /** Colours of the video at this point of the song (negative: no video): its stills, cross-faded in the order they appear. */
  private target(progress:number):Rgb[] {
    const frames=this.palette?.frames;
    if(progress<0||!frames?.some(frame=>frame.length))return this.shown.map(()=>this.fallback);
    let i=PALETTE_KEYS.length-1;while(i>0&&progress<PALETTE_KEYS[i]!)i--;
    const next=Math.min(i+1,PALETTE_KEYS.length-1),span=(PALETTE_KEYS[next]!-PALETTE_KEYS[i]!)||1,f=next===i?0:Math.min(1,(progress-PALETTE_KEYS[i]!)/span);
    const colour=(frame:number,k:number)=>(frames[frame]![k]?.map(toLinear) as Rgb|undefined)??this.fallback;
    return this.shown.map((_,k)=>{const a=colour(i,k),b=colour(next,k);return brightest([a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f,a[2]+(b[2]-a[2])*f]);});
  }

  get videoId():string {return this.requested;}
  get hasPalette():boolean {return !!this.palette?.frames.some(frame=>frame.length);}
}
