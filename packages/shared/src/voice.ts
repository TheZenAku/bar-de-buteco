import {z} from 'zod';
import type {Position} from './index.js';

/**
 * Proximity voice. Clients capture 20 ms frames at 48 kHz and send two per packet (40 ms) through the
 * game connection; the server relays each packet only to connected listeners within maxDistance.
 */
export const VOICE = {fullDistance:2,maxDistance:15,sampleRate:48000,frameSamples:960,framesPerPacket:2,bitrate:24000,maxPacketBytes:1400,maxPacketsPerSecond:40};
export const VOICE_CODECS = {opus:1,mulaw:2} as const;
// μ-law fallback is sent at a third of the capture rate.
export const MULAW_RATE = 16000;
export const voiceStateSchema = z.object({mic:z.boolean(),listen:z.boolean()}).strict();
export type VoiceState = z.infer<typeof voiceStateSchema>;

/** Smooth fall-off: full volume up close, silent beyond maxDistance. */
export function voiceGain(listener:Position,speaker:Position,config=VOICE):number {
  const d=Math.hypot(listener.x-speaker.x,(listener.y??0)-(speaker.y??0),listener.z-speaker.z);
  if(d<=config.fullDistance)return 1;if(d>=config.maxDistance)return 0;
  const t=1-(d-config.fullDistance)/(config.maxDistance-config.fullDistance);
  return t*t*(3-2*t);
}

/** Client packet: [codec][sequence u16][frame count] then, per frame, [length u16][bytes]. */
export function encodeVoicePacket(codec:number,sequence:number,frames:readonly Uint8Array[]):Uint8Array {
  const packet=new Uint8Array(4+frames.reduce((sum,frame)=>sum+2+frame.length,0));
  const view=new DataView(packet.buffer);
  packet[0]=codec;view.setUint16(1,sequence&0xffff);packet[3]=frames.length;
  let offset=4;
  for(const frame of frames){view.setUint16(offset,frame.length);packet.set(frame,offset+2);offset+=2+frame.length;}
  return packet;
}
export function decodeVoicePacket(packet:Uint8Array):{codec:number;sequence:number;frames:Uint8Array[]}|undefined {
  if(packet.length<4||packet.length>VOICE.maxPacketBytes)return;
  const codec=packet[0]!;if(codec!==VOICE_CODECS.opus&&codec!==VOICE_CODECS.mulaw)return;
  const view=new DataView(packet.buffer,packet.byteOffset,packet.byteLength),count=packet[3]!,frames:Uint8Array[]=[];
  if(count<1||count>4)return;
  let offset=4;
  for(let i=0;i<count;i++){
    if(offset+2>packet.length)return;
    const length=view.getUint16(offset);offset+=2;
    if(!length||offset+length>packet.length)return;
    frames.push(packet.subarray(offset,offset+length));offset+=length;
  }
  return offset===packet.length?{codec,sequence:view.getUint16(1),frames}:undefined;
}

/** Server-to-client frame: the speaker's id in front of the untouched client packet. */
export function wrapVoice(speakerId:string,packet:Uint8Array):Uint8Array {
  const id=new TextEncoder().encode(speakerId);
  if(id.length>255)throw new Error('Speaker id too long');
  const frame=new Uint8Array(1+id.length+packet.length);
  frame[0]=id.length;frame.set(id,1);frame.set(packet,1+id.length);
  return frame;
}
export function unwrapVoice(frame:Uint8Array):{speakerId:string;packet:Uint8Array}|undefined {
  const length=frame[0];
  if(length===undefined||!length||frame.length<=1+length)return;
  return {speakerId:new TextDecoder().decode(frame.subarray(1,1+length)),packet:frame.subarray(1+length)};
}

// G.711 μ-law, used when the browser has no Opus encoder.
export function mulawEncode(sample:number):number {
  const BIAS=0x84,CLIP=32635;
  let pcm=Math.max(-1,Math.min(1,sample))*32767|0;
  const sign=pcm<0?0x80:0;if(pcm<0)pcm=-pcm;
  pcm=Math.min(pcm,CLIP)+BIAS;
  let exponent=7;for(let mask=0x4000;!(pcm&mask)&&exponent>0;mask>>=1)exponent--;
  const mantissa=(pcm>>(exponent+3))&0x0f;
  return ~(sign|exponent<<4|mantissa)&0xff;
}
export function mulawDecode(byte:number):number {
  const value=~byte&0xff,sign=value&0x80,exponent=(value>>4)&7,mantissa=value&0x0f;
  const magnitude=((mantissa<<3)+0x84<<exponent)-0x84;
  return (sign?-magnitude:magnitude)/32768;
}
