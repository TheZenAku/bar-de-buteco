import {BasePlayer,BUFFERING,ENDED,FAILED,MISSING,PAUSED,PLAYING,REFUSED,type PlayerOptions} from './player';

const HLS=/\.m3u8(?:$|\?)/i;
interface HlsInstance {loadSource(url:string):void;attachMedia(video:HTMLVideoElement):void;on(event:string,listener:(event:string,data:{fatal:boolean;type:string})=>void):void;destroy():void}
interface HlsClass {new(options:Record<string,unknown>):HlsInstance;isSupported():boolean;Events:{ERROR:string};ErrorTypes:{NETWORK_ERROR:string}}

/**
 * A direct link: a video or audio file, an HLS playlist or an internet radio, in the browser's own element. It carries
 * no platform's rules. A stream of unknown length (a radio, a live playlist) has no timeline: everyone joins it where it is.
 */
export class FilePlayer extends BasePlayer {
  private video:HTMLVideoElement;private hls?:HlsInstance;private wanted=false;private seek?:number;
  constructor(element:HTMLElement,options:PlayerOptions){
    super(options);
    const video=this.video=document.createElement('video');
    video.playsInline=true;video.preload='auto';video.controls=options.controls;video.muted=true;this.silent=true;video.title=options.label;
    video.addEventListener('playing',()=>this.emit(PLAYING));
    video.addEventListener('pause',()=>{if(!video.ended)this.emit(PAUSED);});
    video.addEventListener('waiting',()=>{if(this.state===PLAYING)this.emit(BUFFERING);});
    video.addEventListener('ended',()=>this.emit(ENDED));
    video.addEventListener('loadedmetadata',()=>{if(this.seek!==undefined&&Number.isFinite(video.duration)){video.currentTime=this.seek;this.seek=undefined;}});
    // The address gives nothing the browser can decode (or it is a page): it never played here.
    video.addEventListener('error',()=>{if(!this.hls)this.fail(video.error?.code===MediaError.MEDIA_ERR_NETWORK?FAILED:REFUSED);});
    element.replaceWith(video);
    void this.load().then(()=>this.announce());
  }
  private async load():Promise<void> {
    const {media}=this.options;
    if(!HLS.test(media)){this.video.src=media;return;}
    // Chrome and Firefox read HLS through hls.js; Safari and iOS natively. Only a page that plays one downloads it.
    const Hls=(await import('hls.js')).default as unknown as HlsClass;
    if(this.gone)return;
    if(!Hls.isSupported()){this.video.src=media;return;}
    const hls=this.hls=new Hls({enableWorker:true});
    hls.on(Hls.Events.ERROR,(_,data)=>{if(data.fatal)this.fail(data.type===Hls.ErrorTypes.NETWORK_ERROR?MISSING:FAILED);});
    hls.loadSource(media);hls.attachMedia(this.video);
  }
  /** A radio or a live playlist reads as infinite. */
  private get stream():boolean {return this.video.duration===Infinity;}
  override getVideoData(){return {video_id:this.options.media,isLive:this.stream};}
  override getCurrentTime():number {return this.video.currentTime;}
  override getDuration():number {return Number.isFinite(this.video.duration)?this.video.duration:0;}
  playVideo():void {
    this.wanted=true;
    this.video.play().catch((error:Error)=>{if(this.wanted&&error.name==='NotAllowedError')this.blocked();});
  }
  pauseVideo():void {this.wanted=false;this.video.pause();}
  seekTo(seconds:number):void {
    if(this.stream)return;
    if(this.video.readyState>=HTMLMediaElement.HAVE_METADATA)this.video.currentTime=seconds;else this.seek=seconds;
  }
  getIframe():HTMLElement {return this.video;}
  setVolume(volume:number):void {this.volume=volume;this.video.volume=Math.max(0,Math.min(1,volume/100));}
  mute():void {this.silent=true;this.video.muted=true;}
  unMute():void {this.silent=false;this.video.muted=false;}
  override destroy():void {super.destroy();this.hls?.destroy();this.video.pause();this.video.removeAttribute('src');this.video.load();this.video.remove();}
}
