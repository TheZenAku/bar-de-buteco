/**
 * What the jukebox and the TVs need from a player (apps/web/src/jukebox.ts). YouTube's own player is the model; every
 * other platform's official API is wrapped to answer the same way, with YouTube's state and error codes. Official
 * embeds only: no downloads, proxies, pixel capture or extracted audio.
 */
export interface MediaPlayer {
  loadVideoById(options:{videoId:string;startSeconds:number}):void;
  cueVideoById(options:{videoId:string;startSeconds:number}):void;
  playVideo():void;pauseVideo():void;stopVideo():void;seekTo(seconds:number,allowSeekAhead:boolean):void;
  getCurrentTime():number;getDuration():number;getPlayerState():number;
  isMuted?():boolean;getVolume?():number;
  /** `isLive`: a live broadcast (not in YouTube's documented API, so it may be missing; see MediaController.isLive). */
  getVideoData?():{title?:string;video_id?:string;isLive?:boolean};
  getIframe():HTMLElement;setVolume(volume:number):void;mute():void;unMute():void;destroy():void;
}
export interface PlayerEvents {
  onReady:(event:{target:MediaPlayer})=>void;onStateChange:(event:{data:number})=>void;
  /** `message`: a reason only this player knows, instead of the code's. */
  onError:(event:{data:number;message?:string})=>void;onAutoplayBlocked:()=>void;
}
/** `media`: the link's id on its platform (a player plays only this; YouTube's is told what to load). `probe`: the silent check of a link. */
export interface PlayerOptions {media:string;controls:boolean;probe:boolean;label:string;events:PlayerEvents}
export type PlayerFactory=(element:HTMLElement,options:PlayerOptions)=>MediaPlayer;
/** YouTube's states. */
export const PLAYING=1,PAUSED=2,ENDED=0,BUFFERING=3,CUED=5;
/** YouTube's errors: removed or missing, not allowed on other sites. Anything else does not count against the video (PLAYBACK_REFUSED). */
export const MISSING=100,REFUSED=150,FAILED=5;
export const FRAME_ALLOW='autoplay; encrypted-media; picture-in-picture; fullscreen';

/** A platform's script, once; a failure may try again. */
export function scriptLoader<T>(src:string,api:()=>T|undefined,unreachable:string):()=>Promise<T> {
  let loading:Promise<T>|undefined;
  return ()=>{
    const ready=api();if(ready)return Promise.resolve(ready);
    return loading??=new Promise<T>((resolve,reject)=>{
      const script=document.createElement('script');script.src=src;script.async=true;
      const finish=(value?:T)=>{clearTimeout(timeout);clearInterval(poll);script.onerror=null;if(value)resolve(value);else{script.remove();loading=undefined;reject(new Error(unreachable));}};
      // Some scripts finish setting themselves up after they load.
      const poll=setInterval(()=>{const value=api();if(value)finish(value);},100);
      const timeout=setTimeout(()=>finish(),15000);
      script.onerror=()=>finish();
      document.head.append(script);
    });
  };
}

/**
 * The parts every wrapped player shares: the state it last told, and a clock that runs between a platform's time updates
 * (most platforms only tell the time by event, and the page asks for it at any moment).
 */
export abstract class BasePlayer implements MediaPlayer {
  protected state=-1;protected position=0;protected length=0;protected volume=100;protected silent=false;protected gone=false;
  private at=0;
  constructor(protected options:PlayerOptions){}
  protected announce():void {if(!this.gone)this.options.events.onReady({target:this});}
  protected emit(state:number):void {
    if(this.gone||state===this.state)return;
    this.position=this.getCurrentTime();this.at=performance.now();this.state=state;this.options.events.onStateChange({data:state});
  }
  protected fail(code:number,message?:string):void {if(!this.gone)this.options.events.onError(message===undefined?{data:code}:{data:code,message});}
  protected blocked():void {if(!this.gone)this.options.events.onAutoplayBlocked();}
  /** The time and length a platform just told. */
  protected tell(seconds:number,length?:number):void {this.position=seconds;this.at=performance.now();if(length&&Number.isFinite(length))this.length=length;}
  getCurrentTime():number {return this.position+(this.state===PLAYING?(performance.now()-this.at)/1000:0);}
  getDuration():number {return this.length;}
  getPlayerState():number {return this.state;}
  isMuted():boolean {return this.silent;}
  getVolume():number {return this.volume;}
  getVideoData():{title?:string;video_id?:string;isLive?:boolean} {return {video_id:this.options.media};}
  loadVideoById({startSeconds}:{videoId:string;startSeconds:number}):void {if(startSeconds>0)this.seekTo(startSeconds,true);this.playVideo();}
  cueVideoById({startSeconds}:{videoId:string;startSeconds:number}):void {if(startSeconds>0)this.seekTo(startSeconds,true);this.emit(CUED);}
  stopVideo():void {this.pauseVideo();}
  destroy():void {this.gone=true;}
  abstract playVideo():void;abstract pauseVideo():void;abstract seekTo(seconds:number,allowSeekAhead:boolean):void;
  abstract getIframe():HTMLElement;abstract setVolume(volume:number):void;abstract mute():void;abstract unMute():void;
}
/** A platform's iframe in place of the slot. */
export function frameIn(element:HTMLElement,src:string,label:string):HTMLIFrameElement {
  const frame=document.createElement('iframe');
  frame.src=src;frame.title=label;frame.allow=FRAME_ALLOW;frame.referrerPolicy='strict-origin-when-cross-origin';frame.width='640';frame.height='360';
  element.replaceWith(frame);return frame;
}
