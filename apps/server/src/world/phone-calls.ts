import {randomUUID} from 'node:crypto';
import {PHONE} from '@bar/shared';

/** `video`: placed as a video call (the frames themselves go through BarRoom.relayVideo while it is answered). */
export interface PhoneCall {id:string;from:string;to:string;startedAt:number;answeredAt?:number;video?:boolean}

/**
 * Phone calls between players in the room (the phone's Telefone app): one call per player, ringing until answered,
 * declined or PHONE.ringMs, then active until either side hangs up or leaves. The room relays an answered call's voice
 * between its two ends whatever the distance (BarRoom.relayVoice).
 */
export class PhoneCalls {
  private calls=new Map<string,PhoneCall>();
  private byUser=new Map<string,string>();
  constructor(private ringMs:number=PHONE.ringMs){}
  get size():number {return this.calls.size;}
  get(id:string):PhoneCall|undefined {return this.calls.get(id);}
  of(userId:string):PhoneCall|undefined {const id=this.byUser.get(userId);return id?this.calls.get(id):undefined;}
  /** The other end of an answered call. */
  peerOf(userId:string):string|undefined {const call=this.of(userId);return call?.answeredAt?(call.from===userId?call.to:call.from):undefined;}
  start(from:string,to:string,now:number,video=false):PhoneCall {
    if(from===to)throw new Error('Você não pode ligar para o próprio número.');
    if(this.byUser.has(from))throw new Error('Você já está em uma ligação.');
    if(this.byUser.has(to))throw new Error('Linha ocupada.');
    const call:PhoneCall={id:randomUUID(),from,to,startedAt:now,...(video?{video}:{})};
    this.calls.set(call.id,call);this.byUser.set(from,call.id);this.byUser.set(to,call.id);
    return call;
  }
  /** Only the one being called answers, and only while it rings. */
  answer(id:string,by:string,now:number):PhoneCall {
    const call=this.calls.get(id);
    if(!call||call.to!==by)throw new Error('Essa chamada não existe mais.');
    if(call.answeredAt)return call;
    call.answeredAt=now;
    return call;
  }
  end(id:string):PhoneCall|undefined {
    const call=this.calls.get(id);if(!call)return;
    this.calls.delete(id);
    for(const user of [call.from,call.to])if(this.byUser.get(user)===id)this.byUser.delete(user);
    return call;
  }
  /** Calls nobody answered in time, removed. */
  expire(now:number):PhoneCall[] {
    const missed=[...this.calls.values()].filter(call=>!call.answeredAt&&now-call.startedAt>=this.ringMs);
    for(const call of missed)this.end(call.id);
    return missed;
  }
}
