import {VOICE,VOICE_CODECS,MULAW_RATE,encodeVoicePacket,decodeVoicePacket,unwrapVoice,mulawEncode,mulawDecode,voiceGain,type Position,type VoiceState} from '@bar/shared';
import type {GameSettings,Settings} from './settings';

// Resamples the microphone to 48 kHz and posts 20 ms frames (the context runs at the device's own rate).
const CAPTURE_WORKLET=`class VoiceCapture extends AudioWorkletProcessor{
  constructor(){super();this.ratio=sampleRate/${VOICE.sampleRate};this.t=0;this.last=0;this.out=new Float32Array(${VOICE.frameSamples});this.n=0;}
  process(inputs){const input=inputs[0]&&inputs[0][0];if(!input)return true;
    for(let i=0;i<input.length;i++){const s=input[i];
      while(this.t<=1){this.out[this.n++]=this.last+(s-this.last)*this.t;this.t+=this.ratio;
        if(this.n===this.out.length){this.port.postMessage(this.out,[this.out.buffer]);this.out=new Float32Array(${VOICE.frameSamples});this.n=0;}}
      this.t-=1;this.last=s;}
    return true;}}
registerProcessor('voice-capture',VoiceCapture);`;
const OPUS:AudioEncoderConfig={codec:'opus',sampleRate:VOICE.sampleRate,numberOfChannels:1,bitrate:VOICE.bitrate};
// Playback starts this far ahead to absorb network jitter; a backlog beyond MAX_DELAY is dropped.
const JITTER=.12,MAX_DELAY=.6;
// The voice gate stays open this long after the last loud frame, so words are not clipped.
const HOLD_MS=350;
const FRAME_MS=VOICE.frameSamples/VOICE.sampleRate*1000;

interface Peer {gain:GainNode;pan:StereoPannerNode;decoder?:AudioDecoder;timestamp:number;nextTime:number;lastHeard:number;played:number}
interface Hooks {
  sendPacket:(packet:Uint8Array)=>void;sendState:(state:VoiceState)=>void;
  notice:(text:string,error?:boolean)=>void;changed:()=>void;
}
export interface Listener extends Position {yaw:number}

/**
 * Proximity voice over the game connection: the microphone is encoded to Opus (or μ-law when the
 * browser has no encoder) and relayed by the server to listeners in earshot. Playback is placed by
 * distance and left/right relative to the camera.
 */
export class VoiceChat {
  private context?:AudioContext;
  private bus?:GainNode;
  /** The other end of a phone call, and the telephone band its voice goes through (full volume, any distance). */
  private callPeer?:string;
  private callBus?:{input:AudioNode;gain:GainNode};
  private peers=new Map<string,Peer>();
  private muted=new Set<string>();
  private stream?:MediaStream;
  private capture?:{source:MediaStreamAudioSourceNode;gain:GainNode;node:AudioWorkletNode;sink:GainNode};
  private encoder?:AudioEncoder;
  private codec:number=VOICE_CODECS.opus;
  private encodedAt=0;
  private pending:Uint8Array[]=[];
  private preroll?:Uint8Array;
  private sequence=0;
  private gateUntil=0;
  private pushToTalk=false;
  private starting?:Promise<void>;
  private inBar=false;
  private warnedDecoder=new Set<string>();
  private workletLoaded=false;
  /** Smoothed microphone RMS for the meter, and whether this player is being transmitted right now. */
  level=0;
  transmitting=false;
  status='';
  constructor(private hooks:Hooks,private settings:Settings){
    settings.subscribe((next,previous)=>this.apply(next,previous));
  }

  get micActive():boolean {return !!this.capture;}
  get supported():boolean {return !!navigator.mediaDevices?.getUserMedia&&typeof AudioWorkletNode!=='undefined';}
  /** Explains why the microphone cannot work here, or '' when it can. */
  get unavailableReason():string {
    if(!window.isSecureContext)return 'O navegador só libera o microfone em conexão segura. Entre pelo endereço https:// do bar (ou por localhost).';
    if(!this.supported)return 'Este navegador não oferece captura de microfone.';
    return '';
  }

  /** Creates or resumes audio output; call it from a click or key press so the browser allows sound. */
  unlock():void {
    if(!this.context){
      this.context=new AudioContext({latencyHint:'interactive'});
      this.bus=this.context.createGain();this.bus.connect(this.context.destination);this.applyVolumes();
    }
    if(this.context.state==='suspended')void this.context.resume().catch(()=>{});
  }

  /** Entering the bar: announce the voice state and restore the microphone if it was on and allowed. */
  async enter():Promise<void> {
    this.inBar=true;this.unlock();
    const {micEnabled}=this.settings.get();
    if(micEnabled){
      const permission=await navigator.permissions?.query({name:'microphone' as PermissionName}).catch(()=>undefined);
      if(permission?.state==='granted')await this.startMicrophone();
      else this.settings.update({micEnabled:false});
    }
    this.syncState();
  }
  leave():void {
    this.inBar=false;this.callPeer=undefined;this.stopMicrophone();
    for(const id of [...this.peers.keys()])this.dropPeer(id);
    this.hooks.changed();
  }
  syncState():void {if(this.inBar)this.hooks.sendState({mic:this.micActive,listen:this.settings.get().voicesEnabled});}

  /** Switches the microphone on or off; resolves with whether it is capturing. */
  async setMicrophone(on:boolean):Promise<boolean> {
    this.unlock();this.settings.update({micEnabled:on});
    await this.starting;
    return this.micActive;
  }
  setPushToTalk(down:boolean):void {
    if(this.pushToTalk===down)return;this.pushToTalk=down;
    if(!down)this.gateUntil=0;
  }
  /** On a phone call with `id` (undefined when it ends): their voice leaves the proximity mix for the phone's. */
  setCallPeer(id?:string):void {
    if(this.callPeer===id)return;
    const previous=this.callPeer;this.callPeer=id;
    if(!this.context)return;
    for(const other of [previous,id])if(other){const peer=this.peers.get(other);if(peer){peer.pan.disconnect();peer.pan.connect(this.route(other));}}
  }
  toggleMute(id:string):boolean {if(this.muted.has(id))this.muted.delete(id);else this.muted.add(id);this.hooks.changed();return this.muted.has(id);}
  isMuted(id:string):boolean {return this.muted.has(id);}
  isSpeaking(id:string):boolean {const peer=this.peers.get(id);return !!peer&&performance.now()-peer.lastHeard<300&&!this.muted.has(id);}

  /** Development telemetry: codec in use and, per speaker, frames played and the current volume. */
  telemetry():unknown {
    return {codec:this.codec===VOICE_CODECS.opus?'opus':'mulaw',context:this.context?.state,peers:[...this.peers].map(([id,peer])=>({id,played:peer.played,gain:+peer.gain.gain.value.toFixed(3),pan:+peer.pan.pan.value.toFixed(3),speaking:this.isSpeaking(id)}))};
  }
  async devices():Promise<MediaDeviceInfo[]> {
    try{return (await navigator.mediaDevices.enumerateDevices()).filter(device=>device.kind==='audioinput');}catch{return [];}
  }

  /** Per-frame placement: volume by distance, left/right by direction relative to the camera. */
  update(listener:Listener|undefined,position:(id:string)=>Position|undefined):void {
    if(!this.context)return;
    const now=this.context.currentTime;
    for(const [id,peer] of this.peers){
      const speaker=position(id);
      let gain=0,pan=0;
      if(id===this.callPeer)gain=this.muted.has(id)?0:1;
      else if(listener&&speaker&&!this.muted.has(id)){
        gain=voiceGain(listener,speaker);
        const dx=speaker.x-listener.x,dz=speaker.z-listener.z,d=Math.hypot(dx,dz);
        // The camera's right is (cos yaw, −sin yaw) in world x/z.
        if(d>.3)pan=Math.max(-1,Math.min(1,(dx*Math.cos(listener.yaw)-dz*Math.sin(listener.yaw))/d))*.8;
      }
      peer.gain.gain.setTargetAtTime(gain,now,.05);peer.pan.pan.setTargetAtTime(pan,now,.05);
      // Forget silent speakers (they come back with their next word).
      if(performance.now()-peer.lastHeard>15000)this.dropPeer(id);
    }
    if(this.transmitting&&performance.now()>this.gateUntil){this.transmitting=false;this.hooks.changed();}
  }

  /** A relayed frame from the server: [speaker id][packet]. */
  receive(frame:Uint8Array):void {
    if(!this.inBar||!this.context)return;
    const message=unwrapVoice(frame),packet=message&&decodeVoicePacket(message.packet);
    // With other voices switched off, only the phone call is still heard.
    if(!message||!packet||(!this.settings.get().voicesEnabled&&message.speakerId!==this.callPeer))return;
    const peer=this.peer(message.speakerId);
    const wasSpeaking=this.isSpeaking(message.speakerId);
    peer.lastHeard=performance.now();
    if(!wasSpeaking)this.hooks.changed();
    if(this.muted.has(message.speakerId))return;
    for(const data of packet.frames){
      if(packet.codec===VOICE_CODECS.mulaw){
        const samples=new Float32Array(data.length);for(let i=0;i<data.length;i++)samples[i]=mulawDecode(data[i]!);
        this.schedule(peer,samples,MULAW_RATE);
      } else {
        const decoder=this.decoder(message.speakerId,peer);if(!decoder)return;
        decoder.decode(new EncodedAudioChunk({type:'key',timestamp:peer.timestamp,data}));peer.timestamp+=FRAME_MS*1000;
      }
    }
  }

  private peer(id:string):Peer {
    let peer=this.peers.get(id);
    if(!peer){
      const gain=this.context!.createGain(),pan=this.context!.createStereoPanner();
      gain.gain.value=0;gain.connect(pan).connect(this.route(id));
      peer={gain,pan,timestamp:0,nextTime:0,lastHeard:0,played:0};this.peers.set(id,peer);
    }
    return peer;
  }
  private route(id:string):AudioNode {
    if(id!==this.callPeer)return this.bus!;
    if(!this.callBus){
      // 300–3400 Hz, the band of a phone line.
      const context=this.context!,high=context.createBiquadFilter(),low=context.createBiquadFilter(),gain=context.createGain();
      high.type='highpass';high.frequency.value=300;low.type='lowpass';low.frequency.value=3400;
      high.connect(low).connect(gain).connect(context.destination);
      this.callBus={input:high,gain};this.applyVolumes();
    }
    return this.callBus.input;
  }
  private decoder(id:string,peer:Peer):AudioDecoder|undefined {
    if(peer.decoder&&peer.decoder.state!=='closed')return peer.decoder;
    if(typeof AudioDecoder==='undefined'){
      if(!this.warnedDecoder.has(id)){this.warnedDecoder.add(id);this.hooks.notice('Seu navegador não decodifica Opus, o formato de voz de outro jogador. Atualize o navegador para ouvi-lo.',true);}
      return;
    }
    const decoder=new AudioDecoder({
      output:data=>{
        const samples=new Float32Array(data.numberOfFrames);
        data.copyTo(samples,{planeIndex:0,format:'f32-planar'});
        this.schedule(peer,samples,data.sampleRate);data.close();
      },
      error:()=>{peer.decoder=undefined;},
    });
    decoder.configure({codec:'opus',sampleRate:VOICE.sampleRate,numberOfChannels:1});
    peer.decoder=decoder;
    return decoder;
  }
  private schedule(peer:Peer,samples:Float32Array<ArrayBuffer>,rate:number):void {
    const context=this.context!;
    const buffer=context.createBuffer(1,samples.length,rate);buffer.copyToChannel(samples,0);
    const now=context.currentTime;
    // Start each burst slightly ahead; drop a backlog rather than drift behind the speaker.
    if(peer.nextTime<now+.02||peer.nextTime>now+MAX_DELAY)peer.nextTime=now+JITTER;
    const source=context.createBufferSource();source.buffer=buffer;source.connect(peer.gain);
    source.start(peer.nextTime);peer.nextTime+=buffer.duration;peer.played++;
  }
  private dropPeer(id:string):void {
    const peer=this.peers.get(id);if(!peer)return;
    if(peer.decoder&&peer.decoder.state!=='closed')peer.decoder.close();
    peer.gain.disconnect();peer.pan.disconnect();this.peers.delete(id);
  }

  private apply(next:GameSettings,previous:GameSettings):void {
    this.applyVolumes();
    if(next.voicesEnabled!==previous.voicesEnabled){
      if(!next.voicesEnabled)for(const id of [...this.peers.keys()])if(id!==this.callPeer)this.dropPeer(id);
      this.syncState();
    }
    if(next.micEnabled!==previous.micEnabled){if(next.micEnabled)void this.startMicrophone();else{this.stopMicrophone();this.syncState();}}
    else if(next.micEnabled&&next.inputDevice!==previous.inputDevice){this.stopMicrophone();void this.startMicrophone();}
    if(this.capture)this.capture.gain.gain.value=next.mic*2;
  }
  private applyVolumes():void {
    const {master,voice,voicesEnabled}=this.settings.get();
    if(this.bus&&this.context)this.bus.gain.setTargetAtTime(voicesEnabled?master*voice:0,this.context.currentTime,.03);
    if(this.callBus&&this.context)this.callBus.gain.gain.setTargetAtTime(master*Math.max(voice,.5)*1.4,this.context.currentTime,.03);
  }

  private startMicrophone():Promise<void> {
    if(this.capture)return Promise.resolve();
    this.starting??=(async()=>{
      try{
        const reason=this.unavailableReason;if(reason)throw new Error(reason);
        this.unlock();const context=this.context!;
        const {inputDevice,mic}=this.settings.get();
        this.status='Pedindo permissão para o microfone…';this.hooks.changed();
        this.stream=await navigator.mediaDevices.getUserMedia({audio:{deviceId:inputDevice?{exact:inputDevice}:undefined,channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
        if(!this.settings.get().micEnabled){this.stopMicrophone();return;}
        await this.prepareEncoder();
        if(!this.workletLoaded){
          const url=URL.createObjectURL(new Blob([CAPTURE_WORKLET],{type:'text/javascript'}));
          try{await context.audioWorklet.addModule(url);this.workletLoaded=true;}finally{URL.revokeObjectURL(url);}
        }
        const source=context.createMediaStreamSource(this.stream),gain=context.createGain(),node=new AudioWorkletNode(context,'voice-capture'),sink=context.createGain();
        gain.gain.value=mic*2;sink.gain.value=0;
        // The worklet must reach the destination to run; the silent sink keeps the microphone out of the speakers.
        source.connect(gain).connect(node).connect(sink).connect(context.destination);
        node.port.onmessage=event=>this.frame(event.data as Float32Array<ArrayBuffer>);
        this.capture={source,gain,node,sink};
        this.stream.getAudioTracks()[0]?.addEventListener('ended',()=>{this.hooks.notice('O microfone foi desconectado.',true);this.settings.update({micEnabled:false});});
        this.status=this.codec===VOICE_CODECS.opus?'Microfone ligado · Opus':'Microfone ligado · compatibilidade';
        this.syncState();
      }catch(error){
        this.stopMicrophone();
        const name=error instanceof DOMException?error.name:'';
        this.status=name==='NotAllowedError'?'Permissão do microfone negada. Libere o microfone nas configurações do site, no cadeado da barra de endereço.'
          :name==='NotFoundError'||name==='OverconstrainedError'?'Nenhum microfone encontrado. Conecte um microfone ou escolha outro dispositivo.'
          :name==='NotReadableError'?'O microfone está em uso por outro programa.'
          :error instanceof Error?error.message:'Não foi possível ligar o microfone.';
        this.hooks.notice(this.status,true);
        if(this.settings.get().micEnabled)this.settings.update({micEnabled:false});
      }finally{this.starting=undefined;this.hooks.changed();}
    })();
    return this.starting;
  }
  private async prepareEncoder():Promise<void> {
    this.codec=VOICE_CODECS.mulaw;this.encodedAt=0;this.pending=[];this.preroll=undefined;
    if(typeof AudioEncoder==='undefined'||!(await AudioEncoder.isConfigSupported(OPUS).catch(()=>({supported:false}))).supported)return;
    this.encoder=new AudioEncoder({
      output:chunk=>{const data=new Uint8Array(chunk.byteLength);chunk.copyTo(data);this.queue(data);},
      error:()=>{this.encoder=undefined;this.codec=VOICE_CODECS.mulaw;},
    });
    this.encoder.configure(OPUS);this.codec=VOICE_CODECS.opus;
  }
  private stopMicrophone():void {
    if(this.capture){this.capture.node.port.onmessage=null;this.capture.source.disconnect();this.capture.gain.disconnect();this.capture.node.disconnect();this.capture.sink.disconnect();}
    this.capture=undefined;
    for(const track of this.stream?.getTracks()??[])track.stop();
    this.stream=undefined;
    if(this.encoder&&this.encoder.state!=='closed')this.encoder.close();
    this.encoder=undefined;this.level=0;this.transmitting=false;this.pending=[];
    if(!this.starting)this.status='';
  }

  /** One 20 ms frame of microphone audio at 48 kHz. */
  private frame(samples:Float32Array<ArrayBuffer>):void {
    let sum=0;for(let i=0;i<samples.length;i++)sum+=samples[i]!*samples[i]!;
    const rms=Math.sqrt(sum/samples.length),{voiceMode,sensitivity}=this.settings.get();
    this.level=Math.max(rms,this.level*.85);
    const now=performance.now();
    // −60 dBFS (whisper) to −20 dBFS (loud) as sensitivity goes from 0 to 1.
    if(voiceMode==='ptt'?this.pushToTalk:rms>10**((-60+sensitivity*40)/20))this.gateUntil=now+(voiceMode==='ptt'?60:HOLD_MS);
    const open=now<this.gateUntil;
    if(open!==this.transmitting){this.transmitting=open;this.hooks.changed();}
    if(this.encoder&&this.encoder.state==='configured'){
      const audio=new AudioData({format:'f32-planar',sampleRate:VOICE.sampleRate,numberOfFrames:samples.length,numberOfChannels:1,timestamp:this.encodedAt,data:samples});
      this.encodedAt+=FRAME_MS*1000;this.encoder.encode(audio);audio.close();
    } else {
      const ratio=VOICE.sampleRate/MULAW_RATE,bytes=new Uint8Array(samples.length/ratio);
      for(let i=0;i<bytes.length;i++){let s=0;for(let j=0;j<ratio;j++)s+=samples[i*ratio+j]!;bytes[i]=mulawEncode(s/ratio);}
      this.queue(bytes);
    }
  }
  private queue(frame:Uint8Array):void {
    this.pending.push(frame);
    if(this.pending.length<VOICE.framesPerPacket)return;
    const packet=encodeVoicePacket(this.codec,this.sequence++,this.pending);this.pending=[];
    if(!this.transmitting||!this.inBar){this.preroll=packet;return;}
    // The packet just before the voice opened carries the start of the first syllable.
    if(this.preroll){this.hooks.sendPacket(this.preroll);this.preroll=undefined;}
    this.hooks.sendPacket(packet);
  }
}
