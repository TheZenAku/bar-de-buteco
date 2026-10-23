import test from 'node:test';
import assert from 'node:assert/strict';
import {VOICE,VOICE_CODECS,decodeVoicePacket,encodeVoicePacket,mulawDecode,mulawEncode,unwrapVoice,voiceGain,wrapVoice} from '@bar/shared';

test('voice packets round-trip and malformed ones are rejected',()=>{
  const frames=[new Uint8Array([1,2,3]),new Uint8Array(300).fill(7)];
  const packet=encodeVoicePacket(VOICE_CODECS.opus,70000,frames);
  const decoded=decodeVoicePacket(packet)!;
  assert.equal(decoded.codec,VOICE_CODECS.opus);
  assert.equal(decoded.sequence,70000&0xffff,'The sequence wraps at 16 bits');
  assert.deepEqual(decoded.frames.map(f=>[...f]),frames.map(f=>[...f]));
  assert.equal(decodeVoicePacket(packet.subarray(0,packet.length-1)),undefined,'Truncated');
  assert.equal(decodeVoicePacket(new Uint8Array([...packet,0])),undefined,'Trailing bytes');
  assert.equal(decodeVoicePacket(new Uint8Array([9,...packet.subarray(1)])),undefined,'Unknown codec');
  assert.equal(decodeVoicePacket(new Uint8Array(VOICE.maxPacketBytes+1)),undefined,'Oversized');
  assert.equal(decodeVoicePacket(encodeVoicePacket(VOICE_CODECS.mulaw,0,[])),undefined,'No frames');
  const relayed=unwrapVoice(wrapVoice('8d1c0d9e-uuid-like',packet))!;
  assert.equal(relayed.speakerId,'8d1c0d9e-uuid-like');
  assert.deepEqual([...relayed.packet],[...packet]);
});

test('μ-law keeps speech within a small error and preserves silence and sign',()=>{
  for(const sample of [0,.001,-.001,.05,-.3,.7,-.99,1,-1]){
    const restored=mulawDecode(mulawEncode(sample));
    assert.ok(Math.abs(restored-sample)<=Math.max(.002,Math.abs(sample)*.07),`${sample} → ${restored}`);
    if(Math.abs(sample)>.01)assert.equal(Math.sign(restored),Math.sign(sample));
  }
  assert.equal(mulawEncode(5),mulawEncode(1),'Clipped');
});

test('voice volume is full up close, falls smoothly and is silent beyond the radius',()=>{
  const listener={x:0,y:.3,z:0};
  assert.equal(voiceGain(listener,{x:VOICE.fullDistance,y:.3,z:0}),1);
  assert.equal(voiceGain(listener,{x:VOICE.maxDistance,y:.3,z:0}),0);
  assert.equal(voiceGain(listener,{x:0,y:.3,z:VOICE.maxDistance+1}),0);
  let previous=1;
  for(let d=VOICE.fullDistance;d<=VOICE.maxDistance;d+=.25){const g=voiceGain(listener,{x:d,y:.3,z:0});assert.ok(g<=previous+1e-9&&g>=0);previous=g;}
  // A floor above counts in the distance.
  assert.ok(voiceGain(listener,{x:3,y:3.45,z:0})<voiceGain(listener,{x:3,y:.3,z:0}));
});
