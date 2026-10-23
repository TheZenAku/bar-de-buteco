// A deterministic API double. Used only for failures/lifecycle tests, never as playback evidence.
window.fixturePlayers=[];window.fixtureCreated=0;window.fixtureDestroyed=0;
class Player {
  constructor(element,options){this.options=options;this.state=-1;this.time=0;this.started=0;this.volume=0;this.data={};this.frame=document.createElement('iframe');this.frame.srcdoc='<body style="margin:0;background:#124655;color:white;font:40px sans-serif">TEST PLAYER</body>';this.frame.width=640;this.frame.height=360;element.replaceWith(this.frame);window.fixturePlayers.push(this);window.fixtureCreated++;setTimeout(()=>options.events.onReady({target:this}),0);}
  emit(state){this.state=state;this.options.events.onStateChange({data:state});}
  loadVideoById(options){this.data={video_id:options.videoId,title:'Vídeo de teste <img src=x>'};this.time=options.startSeconds;this.started=performance.now();this.emit(1);}
  cueVideoById(options){this.data={video_id:options.videoId,title:'Vídeo de teste'};this.time=options.startSeconds;this.emit(5);}
  playVideo(){this.started=performance.now();this.emit(1);}
  pauseVideo(){this.time=this.getCurrentTime();this.emit(2);}
  stopVideo(){this.time=0;this.emit(2);}
  seekTo(time){this.time=time;this.started=performance.now();}
  getCurrentTime(){return this.time+(this.state===1?(performance.now()-this.started)/1000:0);}
  getDuration(){return 1200;}
  getPlayerState(){return this.state;}
  getVolume(){return this.volume;}
  isMuted(){return this.muted??false;}
  getVideoData(){return this.data;}
  getIframe(){return this.frame;}
  setVolume(volume){this.volume=volume;}
  mute(){this.muted=true;}
  unMute(){this.muted=false;}
  destroy(){window.fixtureDestroyed++;this.frame.remove();}
}
window.YT={Player};window.onYouTubeIframeAPIReady?.();
