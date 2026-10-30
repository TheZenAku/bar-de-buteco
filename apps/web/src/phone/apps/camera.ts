import {PHONE} from '@bar/shared';
import {uiIcon} from '../../ui-icons';
import {duration,header,type CameraRequest,type Photo,type PhoneApp} from '../core';
import {Recording,microphone,recorderType,stopTracks} from '../media';
import {WALLPAPERS} from '../wallpapers';

const ZOOMS=[1,2,3,5] as const,MAX_ZOOM=8;
/** Recorded videos: portrait like the photos, at a size and rate a Highzap message can carry (PHONE.videoMaxBytes). */
const VIDEO={width:360,height:480,fps:24,bits:900_000};

/**
 * Câmera: the viewfinder is the game's own canvas as a live stream; a photo is the next frame cropped to portrait
 * (BarScene.capture) and a video is that crop recorded with the microphone. Zoom narrows the game camera's lens;
 * selfie turns it to the player's face. Both go to the phone's gallery.
 */
export const camera:PhoneApp={id:'camera',name:'Câmera',icon:'camera',tint:'linear-gradient(160deg,#6a6a70,#1c1c1e)',dock:true,open(view,ctx,arg){
  const request=arg as CameraRequest|undefined,then=request?.then;
  let mode:'photo'|'video'=request?.only??request?.mode??'photo',selfie=false,busy=false,last:Photo|undefined,zoom=1;
  let recording:{run:Recording;canvas:HTMLCanvasElement;draw:number;stream:MediaStream;mic?:MediaStream;timer:ReturnType<typeof setInterval>}|undefined;
  const modes=(['video','photo'] as const).filter(value=>!request?.only||request.only===value);
  view.innerHTML=`<div class="cam-finder"><video muted playsinline autoplay aria-hidden="true"></video><div class="cam-grid" aria-hidden="true"></div><p class="cam-fallback" hidden>O visor não está disponível neste navegador, mas a foto sai do mesmo jeito.</p><i class="cam-flash" aria-hidden="true"></i>
    <button type="button" class="cam-close" data-cam="close">‹ ${then?'Voltar':'Fechar'}</button><p class="cam-rec" hidden aria-live="polite"><i></i><b>00:00</b></p>
    <div class="cam-zoom" role="group" aria-label="Zoom">${ZOOMS.map(value=>`<button type="button" data-cam="zoom" data-zoom="${value}" aria-pressed="${value===1}">${value}×</button>`).join('')}</div></div>
    <div class="cam-modes" role="radiogroup" aria-label="Modo">${modes.map(value=>`<button type="button" role="radio" aria-checked="${value===mode}" data-cam="mode" data-mode="${value}">${value==='video'?'Vídeo':'Foto'}</button>`).join('')}</div>
    <div class="cam-bar"><button type="button" class="cam-thumb" data-cam="roll" aria-label="Abrir a galeria"></button><button type="button" class="cam-shutter" data-cam="shoot" aria-label="Tirar foto"></button><button type="button" class="cam-flip" data-cam="flip" aria-label="Virar a câmera">${uiIcon('switchCamera')}</button></div>`;
  const video=view.querySelector('video')!,thumb=view.querySelector<HTMLButtonElement>('.cam-thumb')!,shutter=view.querySelector<HTMLButtonElement>('.cam-shutter')!,rec=view.querySelector<HTMLElement>('.cam-rec')!;
  let stream:MediaStream|undefined;
  try{stream=ctx.host.canvas.captureStream(VIDEO.fps);video.srcObject=stream;void video.play().catch(()=>{});}
  catch{view.querySelector<HTMLElement>('.cam-fallback')!.hidden=false;}
  const showThumb=(photo?:Photo)=>{last=photo;thumb.style.backgroundImage=photo&&photo.kind!=='video'?`url("${ctx.gallery.url(photo)}")`:'';thumb.classList.toggle('video',photo?.kind==='video');};
  void ctx.gallery.list().then(photos=>showThumb(photos[0]));
  function setSelfie(on:boolean):void {selfie=on;ctx.host.setSelfie(on);view.classList.toggle('selfie',on);}
  function setZoom(value:number):void {
    zoom=Math.round(Math.max(1,Math.min(MAX_ZOOM,value))*10)/10;ctx.host.setZoom(zoom);
    view.querySelectorAll<HTMLElement>('[data-zoom]').forEach(button=>{const step=Number(button.dataset.zoom),next=ZOOMS.find(other=>other>step)??Infinity;const on=zoom>=step&&zoom<next;button.setAttribute('aria-pressed',String(on));button.textContent=on&&zoom!==step?`${zoom.toLocaleString('pt-BR')}×`:`${step}×`;});
  }
  function setMode(next:'photo'|'video'):void {
    if(recording)return;
    mode=next;view.classList.toggle('video-mode',mode==='video');
    shutter.setAttribute('aria-label',mode==='video'?'Gravar vídeo':'Tirar foto');
    view.querySelectorAll<HTMLElement>('[data-mode]').forEach(radio=>radio.setAttribute('aria-checked',String(radio.dataset.mode===mode)));
  }
  function done(photo:Photo):void {if(then)ctx.open(then,{...request?.back,captured:photo.id});}
  async function shoot():Promise<void> {
    if(busy)return;busy=true;
    try{
      const blob=await ctx.host.capture(PHONE.photoWidth,PHONE.photoHeight);
      if(!blob){ctx.host.error('A foto não saiu: o jogo precisa estar na tela.');return;}
      ctx.sounds.shutter();
      const flash=view.querySelector('.cam-flash')!;flash.classList.remove('on');void (flash as HTMLElement).offsetWidth;flash.classList.add('on');
      const photo=await ctx.gallery.add(blob);showThumb(photo);done(photo);
    }finally{busy=false;}
  }
  /** The viewfinder's middle, cropped to portrait every frame, recorded with the microphone when it is allowed. */
  async function record():Promise<void> {
    const type=recorderType('video');
    if(!type||!stream){ctx.host.error('Este navegador não grava vídeo.');return;}
    busy=true;
    let mic:MediaStream|undefined;
    try{mic=await microphone();}catch{ctx.banner('camera','Câmera','Gravando sem som: o microfone não foi liberado.');}
    busy=false;
    const canvas=document.createElement('canvas');canvas.width=VIDEO.width;canvas.height=VIDEO.height;
    const context=canvas.getContext('2d')!;
    const paint=()=>{
      const width=video.videoWidth,height=video.videoHeight;
      if(width&&height){
        const aspect=VIDEO.width/VIDEO.height,sw=Math.min(width,height*aspect),sh=sw/aspect;
        // The selfie view is shown mirrored, as on a phone; the video, like the photo, is not.
        context.drawImage(video,(width-sw)/2,(height-sh)/2,sw,sh,0,0,VIDEO.width,VIDEO.height);
      }
      if(recording)recording.draw=requestAnimationFrame(paint);
    };
    const output=canvas.captureStream(VIDEO.fps);
    for(const track of mic?.getAudioTracks()??[])output.addTrack(track);
    const run=new Recording(output,type,{audio:64_000,video:VIDEO.bits});
    recording={run,canvas,draw:0,stream:output,mic,timer:setInterval(()=>{
      const ms=run.ms;rec.querySelector('b')!.textContent=duration(ms/1000);
      if(ms>=PHONE.videoMaxMs-250)void stopRecording();
    },250)};
    paint();
    view.classList.add('recording');rec.hidden=false;rec.querySelector('b')!.textContent='00:00';shutter.setAttribute('aria-label','Parar a gravação');
    ctx.sounds.click();
  }
  async function stopRecording(save=true):Promise<void> {
    const current=recording;if(!current)return;
    recording=undefined;clearInterval(current.timer);cancelAnimationFrame(current.draw);
    view.classList.remove('recording');rec.hidden=true;shutter.setAttribute('aria-label','Gravar vídeo');
    const ms=Math.min(PHONE.videoMaxMs,current.run.ms);
    const blob=await current.run.stop().catch(()=>undefined);
    stopTracks(current.stream);stopTracks(current.mic);
    if(!save)return;
    if(!blob?.size){ctx.host.error('O vídeo não foi gravado.');return;}
    const item=await ctx.gallery.add(blob,{ms});showThumb(item);done(item);
  }
  view.addEventListener('click',event=>{
    const button=(event.target as HTMLElement).closest<HTMLElement>('[data-cam]');if(!button)return;
    switch(button.dataset.cam){
      case 'close':void stopRecording(false);if(then)ctx.open(then,request?.back);else ctx.home();break;
      case 'mode':setMode(button.dataset.mode==='video'?'video':'photo');break;
      case 'flip':setSelfie(!selfie);break;
      case 'zoom':setZoom(Number(button.dataset.zoom));break;
      case 'shoot':if(mode==='photo')void shoot();else if(recording)void stopRecording();else if(!busy)void record();break;
      case 'roll':if(!recording)ctx.open('fotos',last?{photo:last.id}:undefined);break;
    }
  });
  // The wheel over the viewfinder zooms smoothly, like pinching.
  view.querySelector('.cam-finder')!.addEventListener('wheel',event=>{const wheel=event as WheelEvent;wheel.preventDefault();wheel.stopPropagation();setZoom(zoom*(wheel.deltaY<0?1.12:1/1.12));},{passive:false});
  setMode(mode);setZoom(1);
  if(request?.selfie)setSelfie(true);
  return ()=>{void stopRecording(false);ctx.host.setSelfie(false);ctx.host.setZoom(1);stopTracks(stream);video.srcObject=null;};
}};

/** Fotos: the camera roll kept in this browser, photos and videos, with posting, sending, wallpaper and deleting. */
export const fotos:PhoneApp={id:'fotos',name:'Fotos',icon:'image',tint:'conic-gradient(from 200deg at 50% 55%,#ffcc00,#ff9500,#ff3b30,#af52de,#007aff,#34c759,#ffcc00)',open(view,ctx,arg){
  let photos:Photo[]=[],shown:number|undefined;
  const wanted=(arg as {photo?:string}|undefined)?.photo;
  const tile=(item:Photo,i:number)=>item.kind==='video'
    ?`<button type="button" class="foto-tile video" data-foto="open" data-index="${i}" aria-label="Vídeo ${i+1}, ${duration((item.ms??0)/1000)}"><video src="${ctx.gallery.url(item)}#t=0.1" muted preload="metadata" playsinline></video><small>${uiIcon('play')}${duration((item.ms??0)/1000)}</small></button>`
    :`<button type="button" class="foto-tile" data-foto="open" data-index="${i}"><img src="${ctx.gallery.url(item)}" alt="Foto ${i+1}"></button>`;
  function render():void {
    const photo=shown===undefined?undefined:photos[shown];
    if(photo){
      const video=photo.kind==='video';
      view.innerHTML=`${header(`${shown!+1} de ${photos.length}`,'Fotos')}<div class="ph-body foto-view">${video?`<video src="${ctx.gallery.url(photo)}" controls playsinline aria-label="Vídeo gravado em ${new Date(photo.at).toLocaleString('pt-BR')}"></video>`:`<img src="${ctx.gallery.url(photo)}" alt="Foto tirada em ${new Date(photo.at).toLocaleString('pt-BR')}">`}<p class="ph-hint">${new Date(photo.at).toLocaleString('pt-BR',{dateStyle:'long',timeStyle:'short'})}${video?` · ${duration((photo.ms??0)/1000)}`:''}</p>
        <div class="foto-nav"><button type="button" class="ph-mini" data-foto="prev" ${shown===0?'disabled':''} aria-label="Anterior">${uiIcon('chevronLeft')}</button><button type="button" class="ph-mini flip" data-foto="next" ${shown===photos.length-1?'disabled':''} aria-label="Próxima">${uiIcon('chevronLeft')}</button></div></div>
        <nav class="ph-tabs foto-actions">${video?'':`<button type="button" data-foto="post">${uiIcon('gram')}<small>Highgram</small></button>`}<button type="button" data-foto="zap">${uiIcon('messageCircle')}<small>Highzap</small></button>${video?'':`<button type="button" data-foto="wallpaper">${uiIcon('palette')}<small>Fundo</small></button>`}<button type="button" data-foto="delete">${uiIcon('trash')}<small>Apagar</small></button></nav>`;
      return;
    }
    const count=photos.filter(item=>item.kind!=='video').length,videos=photos.length-count;
    view.innerHTML=`<div class="ph-body"><div class="ph-large"><h1>Fotos</h1><button type="button" class="ph-link" data-foto="camera" aria-label="Câmera">${uiIcon('camera')}</button></div>
      ${photos.length?`<div class="ph-grid3">${photos.map(tile).join('')}</div><p class="ph-hint">${[count?`${count} ${count===1?'foto':'fotos'}`:'',videos?`${videos} ${videos===1?'vídeo':'vídeos'}`:''].filter(Boolean).join(' e ')} · ficam neste navegador</p>`
        :`<p class="ph-empty">${uiIcon('image')}Nenhuma foto ainda.<br>Abra a Câmera e registre a noite.</p>`}</div>`;
  }
  view.addEventListener('click',event=>{
    const button=(event.target as HTMLElement).closest<HTMLElement>('[data-foto],[data-ph]');if(!button)return;
    if(button.dataset.ph==='back'){shown=undefined;render();return;}
    const photo=shown===undefined?undefined:photos[shown];
    switch(button.dataset.foto){
      case 'open':shown=Number(button.dataset.index);render();break;
      case 'prev':if(shown)shown--;render();break;
      case 'next':if(shown!==undefined&&shown<photos.length-1)shown++;render();break;
      case 'camera':ctx.open('camera');break;
      case 'post':if(photo)ctx.open('highgram',{photo:photo.id});break;
      case 'zap':if(photo)ctx.open('highzap',{share:photo.id});break;
      case 'wallpaper':if(photo){ctx.updateSettings({wallpaper:`photo:${photo.id}`});ctx.banner('ajustes','Fundo de tela','Foto aplicada na tela inicial.');}break;
      case 'delete':if(photo){
        if(ctx.settings().wallpaper===`photo:${photo.id}`)ctx.updateSettings({wallpaper:Object.keys(WALLPAPERS)[0]!});
        void ctx.gallery.remove(photo.id).then(()=>ctx.gallery.list()).then(list=>{photos=list;shown=photos.length?Math.min(shown!,photos.length-1):undefined;render();});
      }break;
    }
  });
  void ctx.gallery.list().then(list=>{photos=list;const index=wanted?photos.findIndex(item=>item.id===wanted):-1;shown=index>=0?index:undefined;render();});
  render();
}};
