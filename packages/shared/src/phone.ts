import {z} from 'zod';

/**
 * The in-game phone (apps/web/src/phone). Calls ring through the room, which relays the call's voice whatever the
 * distance (apps/server/src/world/phone-calls.ts); Highzap, Highgram, contacts and HighBank are kept by the API
 * (apps/api/src/phone-service.ts). The room only forwards "something new" pings, and the phone fetches what changed.
 */
export const PHONE={
  /** An unanswered call stops ringing after this. */
  ringMs:30_000,
  messageMax:500,captionMax:200,commentMax:240,contactsMax:200,
  /** Highgram photos: portrait JPEG, encoded by the phone's camera. */
  photoWidth:540,photoHeight:720,photoMaxBytes:240_000,
  feedPage:12,threadPage:60,bankPage:30,
  /** Pix between players: per transfer, and what one account may send per day. */
  pixMax:5_000,pixDailyMax:10_000,
  /** Highgram profiles: @handle, the name shown, the bio and a square photo. */
  gramNameMax:40,bioMax:150,avatarSize:320,avatarMaxBytes:90_000,suggestions:10,searchMax:20,
  /** Highzap media: photos as Highgram's, voice notes and videos as the browser records them (MediaRecorder). */
  audioMaxMs:60_000,audioMaxBytes:900_000,videoMaxMs:30_000,videoMaxBytes:6_000_000,
  /** What one account keeps sent in Highzap; past it, its oldest media are deleted (the messages stay, marked). */
  mediaQuotaBytes:150_000_000,
  /** Video calls: JPEG frames relayed by the room, each under the WebSocket message limit (8 kB). */
  videoFrameWidth:168,videoFrameHeight:224,videoFps:8,videoFrameMaxBytes:7_600,
} as const;

/** Highgram handles: lower-case letters, digits, dot and underscore. */
export const GRAM_HANDLE=/^[a-z0-9._]{3,24}$/;
export type PhoneMediaKind='photo'|'audio'|'video';
export const PHONE_MEDIA_KINDS=['photo','audio','video'] as const;
/** What the API accepts for each kind of Highzap media (the browser's recorder picks one). */
export const PHONE_MEDIA_TYPES:Record<PhoneMediaKind,readonly string[]>={photo:['image/jpeg'],audio:['audio/webm','audio/ogg','audio/mp4','audio/mpeg'],video:['video/webm','video/mp4']};
/** A recorder's type ("video/webm;codecs=vp8,opus") as the API stores it. */
export const mediaBaseType=(type:string)=>type.split(';')[0]!.trim().toLowerCase();
/** Video calls: a frame is a whole JPEG (starts FF D8 FF). */
export const isJpeg=(bytes:Uint8Array)=>bytes.length>3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;

/** Room messages. */
export const phoneCallSchema=z.object({to:z.string().min(1).max(64),video:z.boolean().optional()}).strict();
export const phoneCallIdSchema=z.object({id:z.string().uuid()}).strict();
export const PHONE_PINGS=['zap','zap-read','gram-like','gram-comment','gram-follow','pix'] as const;
export type PhonePingKind=typeof PHONE_PINGS[number];
export const phonePingSchema=z.object({to:z.string().min(1).max(64),kind:z.enum(PHONE_PINGS)}).strict();
/** What the room forwards: who it comes from, so the phone knows which thread or account to fetch again. */
export interface PhonePing {kind:PhonePingKind;from:string;fromName:string}

export type PhoneCallState='outgoing'|'incoming'|'active'|'ended';
export type PhoneCallEnd='declined'|'busy'|'missed'|'hangup'|'offline'|'blocked'|'dropped'|'self';
/** A call as each side sees it (the room sends one to both on every change). */
/** `video`: the call was placed as a video call (either side can still switch its camera on or off). */
export interface PhoneCallView {id:string;state:PhoneCallState;peerId:string;peerName:string;peerColor:string;startedAt:number;answeredAt?:number;reason?:PhoneCallEnd;video?:boolean}
export const CALL_END_TEXT:Record<PhoneCallEnd,string>={declined:'Chamada recusada',busy:'Linha ocupada',missed:'Não atendeu',hangup:'Chamada encerrada',offline:'Fora de área',blocked:'Não foi possível completar a chamada',dropped:'A ligação caiu',self:'Você não pode ligar para o próprio número'};

/** Numbers are nine digits starting with 9, shown as 9XXXX-XXXX. */
export const PHONE_NUMBER=/^9\d{8}$/;
export const phoneDigits=(text:string)=>text.replace(/\D/g,'').slice(0,9);
export const formatPhoneNumber=(digits:string)=>digits.length>5?`${digits.slice(0,5)}-${digits.slice(5)}`:digits;

/** API views. `photo` is the version of the person's Highgram photo (GET /api/phone/gram/avatars/:id?v=photo), absent without one. */
export interface PhoneContact {id:string;name:string;color:string;number:string;photo?:number}
/** `photo`: the version of your own Highgram photo. */
export interface PhoneProfile {number:string;contacts:PhoneContact[];unread:number;photo?:number}
/** A Highzap attachment; `id` is missing once the sender's quota deleted the file (the message stays). */
export interface ZapMedia {id?:string;kind:PhoneMediaKind;ms?:number}
export interface ZapMessage {id:string;from:string;to:string;text:string;sentAt:number;readAt?:number;media?:ZapMedia}
/** `saved`: the peer is in your contacts (otherwise the phone shows the number, as a messenger does for strangers). */
export interface ZapThread {peer:PhoneContact;last:ZapMessage;unread:number;saved:boolean}
export interface GramAuthor {id:string;name:string;handle:string;color:string;photo?:number}
export interface GramPost {id:string;author:GramAuthor;caption:string;createdAt:number;likes:number;liked:boolean;comments:number;mine:boolean}
export interface GramComment {id:string;author:GramAuthor;text:string;createdAt:number;mine:boolean}
/** `followed`: you follow them; `followsYou`: they follow you. */
export interface GramPerson {author:GramAuthor;followed:boolean;followsYou:boolean}
export interface GramProfile extends GramPerson {bio:string;posts:GramPost[];likes:number;followers:number;following:number;mine:boolean}
export interface GramSuggestion extends GramPerson {reason:string}
/** The player card (clicking someone in the bar): their number to save and their Highgram. */
export interface PlayerCard {id:string;name:string;color:string;number:string;saved:boolean;mine:boolean;gram:GramPerson&{bio:string;posts:number;followers:number;following:number}}
export interface BankEntry {id:string;amount:number;reason:string;at:number;peer?:string}
export interface BankView {balance:number;entries:BankEntry[];sentToday:number}

/** A ledger reason (apps/api currency_ledger) as the bank statement reads it. */
export function ledgerLabel(entry:Pick<BankEntry,'reason'|'amount'|'peer'>):string {
  const [kind='',detail='']=entry.reason.split(':');
  if(entry.reason.startsWith('{'))return 'Ajuste da administração';
  switch(kind){
    case 'pix':return entry.amount<0?`Pix para ${entry.peer??'outro jogador'}`:`Pix de ${entry.peer??'outro jogador'}`;
    case 'media':return detail==='telao'?'Vídeo no telão':detail.startsWith('tv')?'Vídeo na TV':'Música na jukebox';
    case 'counter':return 'Balcão do Magrão';
    case 'table':return 'Pedido na mesa';
    case 'job':return 'Trabalho no bar';
    case 'stage':return 'Ingresso do palco';
    case 'refund':return 'Estorno';
    case 'item':return 'Loja da casa';
    case 'skin':return 'Skin nova';
    case 'daily':return 'Bônus diário';
    case 'welcome':return 'Boas-vindas';
    case 'dev-bots':return 'Bots de teste';
    default:return entry.amount<0?'Débito':'Crédito';
  }
}
