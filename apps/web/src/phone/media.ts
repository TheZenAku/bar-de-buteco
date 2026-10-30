import {PHONE,mediaBaseType,type PhoneMediaKind,type ZapMessage} from '@bar/shared';
import {ApiError} from '../api';

/** The first type this browser's MediaRecorder writes for a voice note or a video (WebM in Chromium and Firefox, MP4 in Safari). */
export function recorderType(kind:'audio'|'video'):string|undefined {
  if(typeof MediaRecorder==='undefined')return undefined;
  const types=kind==='audio'?['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/mp4']:['video/webm;codecs=vp8,opus','video/webm;codecs=vp9,opus','video/webm','video/mp4'];
  return types.find(type=>MediaRecorder.isTypeSupported(type));
}

/** A microphone of its own for a recording (the proximity voice keeps its stream); stop its tracks when done. */
export async function microphone():Promise<MediaStream> {
  if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw new Error('O navegador só libera o microfone em conexão segura (https:// ou localhost).');
  try{return await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});}
  catch{throw new Error('Microfone negado: libere o microfone para o site nas permissões do navegador.');}
}
export const stopTracks=(stream?:MediaStream)=>{for(const track of stream?.getTracks()??[])track.stop();};

/** A MediaRecorder run until stop(), as one Blob whose type is the plain container type the API takes. */
export class Recording {
  private readonly startedAt=performance.now();
  private readonly chunks:Blob[]=[];
  private readonly recorder:MediaRecorder;
  private readonly done:Promise<Blob>;
  constructor(stream:MediaStream,type:string,bits?:{audio?:number;video?:number}){
    this.recorder=new MediaRecorder(stream,{mimeType:type,...(bits?.audio?{audioBitsPerSecond:bits.audio}:{}),...(bits?.video?{videoBitsPerSecond:bits.video}:{})});
    this.done=new Promise((resolve,reject)=>{
      this.recorder.ondataavailable=event=>{if(event.data.size)this.chunks.push(event.data);};
      this.recorder.onstop=()=>resolve(new Blob(this.chunks,{type:mediaBaseType(this.recorder.mimeType||type)}));
      this.recorder.onerror=()=>reject(new Error('A gravação falhou.'));
    });
    this.recorder.start(500);
  }
  get ms():number {return performance.now()-this.startedAt;}
  stop():Promise<Blob> {if(this.recorder.state!=='inactive')this.recorder.stop();return this.done;}
}

const urls=new Map<string,Promise<string>>();
/** A file this phone just sent: its local copy serves it, nothing is downloaded back. */
export function rememberMedia(id:string,url:string):void {urls.set(id,Promise.resolve(url));}
/** A Highzap attachment as a local URL, fetched once (a Blob URL also lets Safari seek in a video). */
export function mediaUrl(id:string):Promise<string> {
  let url=urls.get(id);
  if(!url){
    url=fetch(`/api/phone/zap/media/${encodeURIComponent(id)}`,{credentials:'include'}).then(async response=>{if(!response.ok)throw new Error('Mídia indisponível.');return URL.createObjectURL(await response.blob());});
    url.catch(()=>urls.delete(id));urls.set(id,url);
  }
  return url;
}

/** Sends a photo, voice note or video to a Highzap conversation as raw bytes; once per requestId. */
export async function sendZapMedia(peerId:string,kind:PhoneMediaKind,blob:Blob,requestId:string,ms?:number):Promise<ZapMessage> {
  const query=new URLSearchParams({kind,requestId,...(ms?{ms:String(Math.round(Math.min(ms,600_000)))}:{})});
  const response=await fetch(`/api/phone/zap/${encodeURIComponent(peerId)}/media?${query}`,{method:'POST',credentials:'include',headers:{'Content-Type':mediaBaseType(blob.type||'image/jpeg')},body:blob});
  const data=await response.json().catch(()=>({error:'O servidor não respondeu como esperado.'}));
  if(!response.ok)throw new ApiError(data.error||'Não foi possível enviar.',response.status);
  return data as ZapMessage;
}

const encode=(canvas:HTMLCanvasElement,quality:number)=>new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Foto inválida.')),'image/jpeg',quality));
/** A photo redrawn into `width`×`height` (cropped to fill) as a JPEG, lowering the quality while it is over `max` bytes. */
export async function fitJpeg(source:Blob,width:number,height:number,max:number,quality=.86):Promise<Blob> {
  if(source.type==='image/jpeg'&&source.size<=max){
    const bitmap=await createImageBitmap(source),fits=bitmap.width===width&&bitmap.height===height;bitmap.close();
    if(fits)return source;
  }
  const bitmap=await createImageBitmap(source),canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  const scale=Math.max(width/bitmap.width,height/bitmap.height),w=bitmap.width*scale,h=bitmap.height*scale;
  canvas.getContext('2d')!.drawImage(bitmap,(width-w)/2,(height-h)/2,w,h);bitmap.close();
  let blob=await encode(canvas,quality);
  for(let q=quality-.12;blob.size>max&&q>.3;q-=.12)blob=await encode(canvas,q);
  if(blob.size>max)throw new Error('Foto grande demais.');
  return blob;
}
export const dataUrl=(blob:Blob)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});
/** A gallery photo for Highgram or Highzap: portrait, under PHONE.photoMaxBytes. */
export const postPhoto=(blob:Blob)=>fitJpeg(blob,PHONE.photoWidth,PHONE.photoHeight,PHONE.photoMaxBytes);
/** A profile photo: a centred square. */
export const profilePhoto=(blob:Blob)=>fitJpeg(blob,PHONE.avatarSize,PHONE.avatarSize,PHONE.avatarMaxBytes,.84);
