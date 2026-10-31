import {MEDIA_PLATFORMS,mediaLinkUrl,type MediaProvider} from '@bar/shared';
import {loadYoutubeApi,youtubeError} from '../youtube-player';
import {BasePlayer,BUFFERING,ENDED,FAILED,FRAME_ALLOW,MISSING,PAUSED,PLAYING,REFUSED,frameIn,scriptLoader,type MediaPlayer,type PlayerFactory,type PlayerOptions} from './player';
import {FilePlayer} from './file';

const unreachable=(label:string)=>`Não foi possível conectar ao ${label}. Verifique sua conexão e se algum bloqueador não está barrando o player.`;
/** The player's own frame, wherever its platform put it. */
const iframeIn=(host:HTMLElement)=>host.querySelector('iframe')??host;

/** `https://player.vimeo.com/api/player.js`. Promises everywhere; time by event. */
interface VimeoSdk {
  ready():Promise<void>;play():Promise<void>;pause():Promise<void>;setCurrentTime(seconds:number):Promise<number>;setVolume(volume:number):Promise<number>;setMuted(muted:boolean):Promise<boolean>;
  getDuration():Promise<number>;getVideoTitle():Promise<string>;on(event:string,listener:(data:{seconds?:number;duration?:number;name?:string})=>void):void;destroy():Promise<void>;
}
const vimeoApi=scriptLoader('https://player.vimeo.com/api/player.js',()=>(window as unknown as {Vimeo?:{Player:new(element:HTMLElement,options:Record<string,unknown>)=>VimeoSdk}}).Vimeo,unreachable('Vimeo'));
class VimeoPlayer extends BasePlayer {
  private sdk:VimeoSdk;private title='';private start=0;
  constructor(private host:HTMLElement,options:PlayerOptions,Player:new(element:HTMLElement,options:Record<string,unknown>)=>VimeoSdk){
    super(options);
    const [id,hash]=options.media.split(':');
    this.sdk=new Player(host,{...(hash?{url:`https://vimeo.com/${id}/${hash}`}:{id:Number(id)}),width:640,height:360,muted:true,autoplay:false,controls:options.controls,dnt:true,title:false,byline:false,portrait:false,keyboard:options.controls,pip:false});
    this.silent=true;
    this.sdk.on('bufferstart',()=>{if(this.state===PLAYING)this.emit(BUFFERING);});
    this.sdk.on('bufferend',()=>{if(this.state===BUFFERING)this.emit(PLAYING);});
    this.sdk.on('playing',()=>this.emit(PLAYING));this.sdk.on('pause',()=>this.emit(PAUSED));this.sdk.on('ended',()=>this.emit(ENDED));
    this.sdk.on('timeupdate',({seconds,duration})=>this.tell(seconds??0,duration));this.sdk.on('seeked',({seconds})=>this.tell(seconds??0));
    this.sdk.on('error',({name})=>this.fail(name==='NotFoundError'?MISSING:name==='PrivacyError'||name==='PasswordError'?REFUSED:FAILED));
    this.sdk.ready().then(async()=>{
      this.tell(0,await this.sdk.getDuration().catch(()=>0));this.title=await this.sdk.getVideoTitle().catch(()=>'');
      this.announce();
    },()=>this.fail(MISSING));
  }
  override getVideoData(){return {video_id:this.options.media,title:this.title};}
  playVideo():void {
    this.sdk.play().catch((error:Error)=>{if(error.name==='NotAllowedError')this.blocked();else if(error.name==='PrivacyError'||error.name==='PasswordError')this.fail(REFUSED);else if(error.name==='NotFoundError')this.fail(MISSING);});
  }
  pauseVideo():void {this.sdk.pause().catch(()=>{});}
  seekTo(seconds:number):void {this.tell(seconds);this.sdk.setCurrentTime(seconds).catch(()=>{});}
  getIframe():HTMLElement {return iframeIn(this.host);}
  setVolume(volume:number):void {this.volume=volume;this.sdk.setVolume(volume/100).catch(()=>{});}
  mute():void {this.silent=true;this.sdk.setMuted(true).catch(()=>{});}
  unMute():void {this.silent=false;this.sdk.setMuted(false).catch(()=>{});}
  override destroy():void {super.destroy();this.sdk.destroy().catch(()=>{});}
}

/** `https://w.soundcloud.com/player/api.js`. It takes the time only once a track plays, and has no mute of its own. */
interface SoundcloudWidget {bind(event:string,listener:(data?:{currentPosition?:number})=>void):void;play():void;pause():void;seekTo(milliseconds:number):void;setVolume(volume:number):void;getDuration(callback:(milliseconds:number)=>void):void;getCurrentSound(callback:(sound?:{title?:string})=>void):void}
interface SoundcloudApi {Widget:((frame:HTMLIFrameElement)=>SoundcloudWidget)&{Events:Record<'READY'|'PLAY'|'PAUSE'|'FINISH'|'ERROR'|'PLAY_PROGRESS',string>}}
const soundcloudApi=scriptLoader('https://w.soundcloud.com/player/api.js',()=>(window as unknown as {SC?:SoundcloudApi}).SC,unreachable('SoundCloud'));
class SoundcloudPlayer extends BasePlayer {
  private widget:SoundcloudWidget;private frame:HTMLIFrameElement;private seek?:number;private played=false;private title='';
  constructor(element:HTMLElement,options:PlayerOptions,api:SoundcloudApi){
    super(options);
    const query=new URLSearchParams({url:mediaLinkUrl('soundcloud',options.media),auto_play:'false',visual:'true',single_active:'false',show_comments:'false',show_teaser:'false',sharing:'false',buying:'false',download:'false',show_playcount:'false',show_reposts:'false'});
    this.frame=frameIn(element,`https://w.soundcloud.com/player/?${query}`,options.label);
    this.widget=api.Widget(this.frame);
    const {READY,PLAY,PAUSE,FINISH,ERROR,PLAY_PROGRESS}=api.Widget.Events;
    this.widget.bind(READY,()=>{
      this.widget.getDuration(ms=>{this.length=ms/1000;});this.widget.getCurrentSound(sound=>{this.title=sound?.title??'';});
      this.announce();
    });
    this.widget.bind(PLAY,()=>{this.played=true;if(this.seek!==undefined){this.widget.seekTo(this.seek*1000);this.seek=undefined;}if(!this.length)this.widget.getDuration(ms=>{this.length=ms/1000;});this.emit(PLAYING);});
    this.widget.bind(PAUSE,()=>this.emit(PAUSED));
    this.widget.bind(FINISH,()=>this.emit(ENDED));
    this.widget.bind(PLAY_PROGRESS,data=>{if(data?.currentPosition!==undefined&&this.seek===undefined)this.tell(data.currentPosition/1000);});
    // It shows the error card for a track gone or blocked here; once playing, a hiccup does not count against it.
    this.widget.bind(ERROR,()=>{if(!this.played)this.fail(REFUSED);});
  }
  override getVideoData(){return {video_id:this.options.media,title:this.title};}
  playVideo():void {this.widget.play();}
  pauseVideo():void {this.widget.pause();}
  seekTo(seconds:number):void {this.tell(seconds);if(this.state===PLAYING)this.widget.seekTo(seconds*1000);else this.seek=seconds;}
  getIframe():HTMLElement {return this.frame;}
  setVolume(volume:number):void {this.volume=volume;if(!this.silent)this.widget.setVolume(volume);}
  mute():void {this.silent=true;this.widget.setVolume(0);}
  unMute():void {this.silent=false;this.widget.setVolume(this.volume);}
  override destroy():void {super.destroy();this.frame.remove();}
}

/** `https://widget.mixcloud.com/media/js/widgetApi.js`. `getVolume`, `setVolume` (0–1) work but are not in its documentation. */
interface MixcloudWidget {
  ready:Promise<unknown>;play():Promise<void>;pause():Promise<void>;seek(seconds:number):Promise<boolean>;setVolume(volume:number):Promise<void>;
  events:Record<'play'|'pause'|'ended'|'error'|'buffering',{on(listener:()=>void):void}>&{progress:{on(listener:(position:number,duration:number)=>void):void}};
}
const mixcloudApi=scriptLoader('https://widget.mixcloud.com/media/js/widgetApi.js',()=>(window as unknown as {Mixcloud?:{PlayerWidget(frame:HTMLIFrameElement):MixcloudWidget}}).Mixcloud,unreachable('Mixcloud'));
class MixcloudPlayer extends BasePlayer {
  private widget:MixcloudWidget;private frame:HTMLIFrameElement;private seek?:number;
  constructor(element:HTMLElement,options:PlayerOptions,api:{PlayerWidget(frame:HTMLIFrameElement):MixcloudWidget}){
    super(options);
    const query=new URLSearchParams({feed:`/${options.media}/`,autoplay:'0',hide_cover:'1'});
    this.frame=frameIn(element,`https://player-widget.mixcloud.com/widget/iframe/?${query}`,options.label);
    this.widget=api.PlayerWidget(this.frame);
    void this.widget.ready.then(()=>{
      const {events}=this.widget;
      events.play.on(()=>{if(this.seek!==undefined){void this.widget.seek(this.seek);this.seek=undefined;}this.emit(PLAYING);});
      events.pause.on(()=>this.emit(PAUSED));events.ended.on(()=>this.emit(ENDED));events.buffering.on(()=>{if(this.state===PLAYING)this.emit(BUFFERING);});
      events.error.on(()=>this.fail(REFUSED));
      events.progress.on((position,duration)=>{if(this.seek===undefined)this.tell(position,duration);if(this.state===BUFFERING)this.emit(PLAYING);});
      this.announce();
    });
  }
  playVideo():void {void this.widget.play();}
  pauseVideo():void {void this.widget.pause();}
  seekTo(seconds:number):void {this.tell(seconds);if(this.state===PLAYING)void this.widget.seek(seconds);else this.seek=seconds;}
  getIframe():HTMLElement {return this.frame;}
  setVolume(volume:number):void {this.volume=volume;if(!this.silent)void this.widget.setVolume(volume/100);}
  mute():void {this.silent=true;void this.widget.setVolume(0);}
  unMute():void {this.silent=false;void this.widget.setVolume(this.volume/100);}
  override destroy():void {super.destroy();this.frame.remove();}
}

/**
 * `https://open.spotify.com/embed/iframe-api/v1`. Its API has no volume at all, so "muted" means stopped: the player
 * waits where it must not be heard while this clock keeps counting, and it reports the end by that clock too.
 */
interface SpotifyController {play():void;pause():void;resume():void;seek(seconds:number):void;destroy():void;addListener(event:string,listener:(event:{data:{isPaused:boolean;isBuffering:boolean;duration:number;position:number}})=>void):void}
interface SpotifyApi {createController(element:HTMLElement,options:{uri:string;width:number;height:number},callback:(controller:SpotifyController)=>void):void}
let spotifyApi:SpotifyApi|undefined,spotifyLoading:Promise<SpotifyApi>|undefined;
function loadSpotify():Promise<SpotifyApi> {
  if(spotifyApi)return Promise.resolve(spotifyApi);
  return spotifyLoading??=new Promise<SpotifyApi>((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://open.spotify.com/embed/iframe-api/v1';script.async=true;
    const fail=()=>{clearTimeout(timeout);script.remove();spotifyLoading=undefined;reject(new Error(unreachable('Spotify')));};
    const timeout=setTimeout(fail,15000);script.onerror=fail;
    (window as unknown as {onSpotifyIframeApiReady:(api:SpotifyApi)=>void}).onSpotifyIframeApiReady=api=>{clearTimeout(timeout);spotifyApi=api;resolve(api);};
    document.head.append(script);
  });
}
class SpotifyPlayer extends BasePlayer {
  private controller?:SpotifyController;private host:HTMLElement;private started=false;private wanted=false;private seek?:number;private timer=0;
  constructor(element:HTMLElement,options:PlayerOptions,api:SpotifyApi){
    super(options);this.host=element.parentElement!;this.silent=true;
    api.createController(element,{uri:`spotify:${options.media}`,width:640,height:360},controller=>{
      if(this.gone){controller.destroy();return;}
      this.controller=controller;
      controller.addListener('ready',()=>this.announce());
      controller.addListener('playback_update',({data})=>{
        if(this.silent)return;
        this.tell(data.position/1000,data.duration/1000);
        if(data.duration>0&&data.position>=data.duration&&data.isPaused){this.emit(ENDED);return;}
        if(data.isPaused&&this.started&&!this.wanted)this.emit(PAUSED);else if(data.isBuffering)this.emit(BUFFERING);else if(!data.isPaused)this.emit(PLAYING);
      });
    });
    this.timer=window.setInterval(()=>{if(this.silent&&this.state===PLAYING&&this.length>0&&this.getCurrentTime()>=this.length)this.emit(ENDED);},500);
  }
  private run():void {
    const controller=this.controller;if(!controller)return;
    const at=this.seek;this.seek=undefined;
    if(this.started)controller.resume();else{controller.play();this.started=true;}
    if(at!==undefined&&at>0)controller.seek(Math.floor(at));
  }
  playVideo():void {
    this.wanted=true;
    if(this.silent){this.tell(this.getCurrentTime());this.emit(PLAYING);return;}
    this.run();
  }
  pauseVideo():void {this.wanted=false;if(this.silent)this.emit(PAUSED);else this.controller?.pause();}
  seekTo(seconds:number):void {this.tell(seconds);if(!this.silent&&this.started)this.controller?.seek(Math.floor(seconds));else this.seek=seconds;}
  getIframe():HTMLElement {return iframeIn(this.host);}
  setVolume(volume:number):void {this.volume=volume;}
  mute():void {if(this.silent)return;this.silent=true;this.tell(this.getCurrentTime());if(this.started)this.controller?.pause();}
  unMute():void {if(!this.silent)return;this.silent=false;if(this.wanted){this.seek=this.getCurrentTime();this.run();}}
  override destroy():void {super.destroy();clearInterval(this.timer);try{this.controller?.destroy();}catch{}}
}

/**
 * `https://www.tiktok.com/player/v1/<id>`, spoken to by postMessage. It builds its video only when told to autoplay,
 * and says nothing until then; it has mute but no volume.
 */
class TiktokPlayer extends BasePlayer {
  private frame:HTMLIFrameElement;private wanted=false;
  private onMessage=(event:MessageEvent)=>{
    if(event.source!==this.frame.contentWindow)return;
    const message=event.data as {'x-tiktok-player'?:boolean;type?:string;value?:unknown}|null;if(!message?.['x-tiktok-player'])return;
    if(message.type==='onPlayerReady'){this.send('mute');this.send('pause');this.announce();}
    else if(message.type==='onStateChange'){
      const state=message.value as number;
      // Its own autoplay starts before anyone asked.
      if(state===PLAYING&&!this.wanted){this.send('pause');return;}
      if(state===ENDED||state===PLAYING||state===PAUSED||state===BUFFERING)this.emit(state);
    }
    else if(message.type==='onCurrentTime'){const {currentTime,duration}=message.value as {currentTime:number;duration:number};this.tell(currentTime,duration);}
    else if(message.type==='onPlayerError'){
      const code=(message.value as {errorCode?:number})?.errorCode;
      if(code===3002)this.blocked();else this.fail(code===1001?MISSING:FAILED);
    }
  };
  constructor(element:HTMLElement,options:PlayerOptions){
    super(options);this.silent=true;
    const query=new URLSearchParams({autoplay:'1',muted:'1',controls:options.controls?'1':'0',music_info:'0',description:'0',rel:'0',native_context_menu:'0',closed_caption:'0'});
    window.addEventListener('message',this.onMessage);
    this.frame=frameIn(element,`https://www.tiktok.com/player/v1/${options.media}?${query}`,options.label);
    this.frame.allow=`accelerometer; gyroscope; ${FRAME_ALLOW}`;
  }
  private send(type:string,value?:number):void {this.frame.contentWindow?.postMessage(value===undefined?{type,'x-tiktok-player':true}:{type,value,'x-tiktok-player':true},'*');}
  playVideo():void {this.wanted=true;this.send('play');}
  pauseVideo():void {this.wanted=false;this.send('pause');}
  seekTo(seconds:number):void {this.tell(seconds);this.send('seekTo',seconds);}
  getIframe():HTMLElement {return this.frame;}
  setVolume(volume:number):void {this.volume=volume;}
  mute():void {this.silent=true;this.send('mute');}
  unMute():void {this.silent=false;this.send('unMute');}
  override destroy():void {super.destroy();window.removeEventListener('message',this.onMessage);this.frame.remove();}
}

/**
 * `https://player.twitch.tv/js/embed/v1.js`. It refuses to play unless the whole player is visible, uncovered and at
 * least 400 x 300 px, so it never goes under the canvas: MediaController opens it in a window (MediaPlatform.window).
 */
interface TwitchSdk {
  play():void;pause():void;seek(seconds:number):void;setVolume(volume:number):void;setMuted(muted:boolean):void;getCurrentTime():number;getDuration():number;addEventListener(event:string,listener:()=>void):void;
}
type TwitchEvent='READY'|'PLAY'|'PLAYING'|'PAUSE'|'ENDED'|'OFFLINE'|'ONLINE'|'PLAYBACK_BLOCKED';
type TwitchClass=(new(element:HTMLElement|string,options:Record<string,unknown>)=>TwitchSdk)&Record<TwitchEvent,string>;
const twitchApi=scriptLoader('https://player.twitch.tv/js/embed/v1.js',()=>(window as unknown as {Twitch?:{Player?:TwitchClass}}).Twitch?.Player,unreachable('Twitch'));
let twitchSlots=0;
class TwitchPlayer extends BasePlayer {
  private sdk:TwitchSdk;private host:HTMLElement;private channel:boolean;private online=false;private seek?:number;private retry=0;
  constructor(element:HTMLElement,options:PlayerOptions,Player:TwitchClass){
    super(options);this.silent=true;this.host=element;this.channel=options.media.startsWith('channel:');
    element.id=`twitch-player-${++twitchSlots}`;
    this.sdk=new Player(element.id,{width:'100%',height:'100%',autoplay:false,muted:true,controls:options.controls,parent:[location.hostname],...(this.channel?{channel:options.media.slice(8)}:{video:options.media.slice(6)})});
    this.sdk.addEventListener(Player.READY,()=>this.announce());
    this.sdk.addEventListener(Player.PLAYING,()=>{if(this.seek!==undefined){this.sdk.seek(this.seek);this.seek=undefined;}this.emit(PLAYING);});
    this.sdk.addEventListener(Player.PAUSE,()=>this.emit(PAUSED));this.sdk.addEventListener(Player.ENDED,()=>this.emit(ENDED));
    this.sdk.addEventListener(Player.ONLINE,()=>{this.online=true;});
    // A channel that goes off the air has nothing more to show: the queue moves on.
    this.sdk.addEventListener(Player.OFFLINE,()=>{if(this.channel){this.online=false;this.fail(REFUSED,'Este canal da Twitch está fora do ar agora.');}});
    this.sdk.addEventListener(Player.PLAYBACK_BLOCKED,()=>this.blocked());
  }
  override getVideoData(){return {video_id:this.options.media,isLive:this.channel&&this.online};}
  override getCurrentTime():number {return this.sdk.getCurrentTime()||0;}
  // A channel has no timeline of its own: 0 keeps the shared clock out of it (MediaController.keepInSync).
  override getDuration():number {return this.channel?0:this.sdk.getDuration()||0;}
  // It ignores a play until it has seen itself on the page (a window just shown, for one): asked again until it plays.
  playVideo():void {
    clearInterval(this.retry);this.sdk.play();
    this.retry=window.setInterval(()=>{if(this.gone||this.state===PLAYING)clearInterval(this.retry);else this.sdk.play();},1000);
  }
  pauseVideo():void {clearInterval(this.retry);this.sdk.pause();}
  seekTo(seconds:number):void {if(this.channel)return;if(this.state===PLAYING)this.sdk.seek(seconds);else this.seek=seconds;}
  getIframe():HTMLElement {return iframeIn(this.host);}
  setVolume(volume:number):void {this.volume=volume;this.sdk.setVolume(volume/100);}
  mute():void {this.silent=true;this.sdk.setMuted(true);}
  unMute():void {this.silent=false;this.sdk.setMuted(false);}
  override destroy():void {super.destroy();clearInterval(this.retry);this.sdk.pause();this.host.replaceChildren();}
}

/** The official player of each platform, loaded the first time it is needed. A link of another platform gets a new player. */
const FACTORIES:Record<MediaProvider,()=>Promise<PlayerFactory>>={
  youtube:async()=>{
    const api=await loadYoutubeApi();
    return (element,{controls,probe,events})=>new api.Player(element,{width:640,height:360,host:'https://www.youtube.com',
      playerVars:probe?{playsinline:1,controls:0,disablekb:1,autoplay:1,mute:1,rel:0,origin:location.origin}:{playsinline:1,controls:controls?1:0,disablekb:controls?0:1,fs:0,iv_load_policy:3,rel:0,autoplay:0,origin:location.origin},events}) as MediaPlayer;
  },
  vimeo:async()=>{const {Player}=await vimeoApi();return (element,options)=>new VimeoPlayer(element,options,Player);},
  soundcloud:async()=>{const api=await soundcloudApi();return (element,options)=>new SoundcloudPlayer(element,options,api);},
  mixcloud:async()=>{const api=await mixcloudApi();return (element,options)=>new MixcloudPlayer(element,options,api);},
  spotify:async()=>{const api=await loadSpotify();return (element,options)=>new SpotifyPlayer(element,options,api);},
  tiktok:async()=>(element,options)=>new TiktokPlayer(element,options),
  twitch:async()=>{const Player=await twitchApi();return (element,options)=>new TwitchPlayer(element,options,Player);},
  file:async()=>(element,options)=>new FilePlayer(element,options),
};
export const loadPlayers=(provider:MediaProvider):Promise<PlayerFactory>=>FACTORIES[provider]();
/** Why a player would not play, for the panel. */
export function playerError(provider:MediaProvider,code:number):string {
  if(provider==='youtube')return youtubeError(code);
  if(provider==='file'&&(code===REFUSED||code===MISSING))return 'Este link não é um vídeo ou áudio válido que o navegador consiga tocar. Confira o endereço.';
  const {named}=MEDIA_PLATFORMS[provider];
  if(code===MISSING)return `${named} diz que este link foi removido, é privado ou não existe.`;
  if(code===REFUSED)return `${named} não deixa este link tocar fora do site dele. Escolha outro.`;
  return 'Não foi possível reproduzir este link. Verifique a conexão ou escolha outro.';
}
