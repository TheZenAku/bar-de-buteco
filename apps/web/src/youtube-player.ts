/** Official IFrame API only: no downloads, proxies, pixel capture or extracted audio. */
export interface YoutubePlayer {
  loadVideoById(options:{videoId:string;startSeconds:number}):void;
  cueVideoById(options:{videoId:string;startSeconds:number}):void;
  playVideo():void;pauseVideo():void;stopVideo():void;seekTo(seconds:number,allowSeekAhead:boolean):void;
  getCurrentTime():number;getDuration():number;getPlayerState():number;
  isMuted?():boolean;getVolume?():number;
  /** `isLive`: a live broadcast (not in the documented API, so it may be missing; see MediaController.isLive). */
  getVideoData?():{title?:string;video_id?:string;isLive?:boolean};
  getIframe():HTMLIFrameElement;setVolume(volume:number):void;mute():void;unMute():void;destroy():void;
}
export interface YoutubeEvents {onReady:(event:{target:YoutubePlayer})=>void;onStateChange:(event:{data:number})=>void;onError:(event:{data:number})=>void;onAutoplayBlocked:()=>void;}
export interface YoutubeApi {Player:new(element:HTMLElement,options:{width:number;height:number;host:string;playerVars:Record<string,string|number>;events:YoutubeEvents})=>YoutubePlayer;}
declare global {interface Window {YT?:YoutubeApi;onYouTubeIframeAPIReady?:()=>void;}}
let loading:Promise<YoutubeApi>|undefined;
export function loadYoutubeApi():Promise<YoutubeApi> {
  if(window.YT?.Player)return Promise.resolve(window.YT);
  if(loading)return loading;
  loading=new Promise<YoutubeApi>((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';script.async=true;
    const previous=window.onYouTubeIframeAPIReady;
    const finish=(error?:Error)=>{
      clearTimeout(timeout);script.onerror=null;
      if(window.onYouTubeIframeAPIReady===ready)window.onYouTubeIframeAPIReady=previous;
      if(error){script.remove();loading=undefined;reject(error);}else resolve(window.YT!);
    };
    const ready=()=>{previous?.();if(window.YT?.Player)finish();else finish(new Error('O YouTube não respondeu. Tente novamente.'));};
    const timeout=setTimeout(()=>finish(new Error('Não foi possível conectar ao YouTube. Verifique sua conexão.')),15000);
    window.onYouTubeIframeAPIReady=ready;
    script.onerror=()=>finish(new Error('Não foi possível conectar ao YouTube. Verifique sua conexão.'));
    document.head.append(script);
  });
  return loading;
}
export function youtubeError(code:number):string {
  if(code===2)return 'O YouTube recusou este identificador de vídeo.';
  if(code===100)return 'Vídeo removido, privado ou indisponível.';
  if(code===101||code===150)return 'O autor deste vídeo não permite reprodução em outros sites. Escolha outro vídeo.';
  if(code===153)return 'O YouTube não identificou este site. Verifique a configuração de origem e Referer do servidor.';
  return 'Não foi possível reproduzir este vídeo. Verifique a conexão ou escolha outro link.';
}
