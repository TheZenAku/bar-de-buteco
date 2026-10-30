import {randomInt,randomUUID} from 'node:crypto';
import {and,asc,desc,eq,gte,ilike,inArray,isNull,like,lt,notInArray,or,sql} from 'drizzle-orm';
import {GRAM_HANDLE,MAX_COIN_BALANCE,PHONE,PHONE_MEDIA_TYPES,PHONE_NUMBER,isJpeg,type BankView,type GramAuthor,type GramComment,type GramPerson,type GramPost,type GramProfile,type GramSuggestion,type PhoneContact,type PhoneMediaKind,type PhoneProfile,type PlayerCard,type ZapMessage,type ZapThread} from '@bar/shared';
import type {Database} from './database/index.js';
import {blocks,currencyLedger,gramComments,gramFollows,gramLikes,gramPosts,gramProfiles,phoneContacts,phoneLines,phoneMedia,phoneMessages,profiles,users,wallets} from './database/schema.js';
import type {WardrobeService} from './wardrobe.js';

export class PhoneError extends Error {constructor(readonly statusCode:number,message:string){super(message);}}
const startOfDay=(now=new Date())=>new Date(now.getFullYear(),now.getMonth(),now.getDate());
const JPEG_PREFIX='data:image/jpeg;base64,';
/** Highgram keeps at most this many posts per account; older ones must be deleted before posting more. */
export const GRAM_POSTS_PER_ACCOUNT=60;
const message=(row:typeof phoneMessages.$inferSelect):ZapMessage=>({id:row.id,from:row.senderId,to:row.recipientId,text:row.body,sentAt:row.createdAt.getTime(),...(row.readAt?{readAt:row.readAt.getTime()}:{}),
  ...(row.mediaKind?{media:{kind:row.mediaKind as PhoneMediaKind,...(row.mediaId?{id:row.mediaId}:{}),...(row.mediaMs?{ms:row.mediaMs}:{})}}:{})});
/** Free text from a player: control characters become spaces. */
const clean=(text:string)=>text.replace(/[\u0000-\u001f\u007f]/g,' ').trim();
/** A JPEG data URL from the phone (a Highgram photo or profile photo) as bytes, or a 400/413. */
function jpegBytes(image:string,max:number):Buffer {
  if(!image.startsWith(JPEG_PREFIX))throw new PhoneError(400,'A foto precisa ser um JPEG.');
  const bytes=Buffer.from(image.slice(JPEG_PREFIX.length),'base64');
  if(bytes.length<64||!isJpeg(bytes))throw new PhoneError(400,'A foto precisa ser um JPEG.');
  if(bytes.length>max)throw new PhoneError(413,'Foto grande demais.');
  return bytes;
}

/**
 * The in-game phone's data: one number per account (assigned on first use), saved contacts, Highzap conversations,
 * Highgram posts and the HighBank statement and Pix. Blocks hide people both ways, as in the bar's chat and voice.
 */
export class PhoneService {
  constructor(private db:Database,private wardrobe:WardrobeService){}

  /** The account's number, drawn the first time it is needed. */
  async line(userId:string):Promise<string>{
    for(let attempt=0;attempt<8;attempt++){
      const [row]=await this.db.select({number:phoneLines.number}).from(phoneLines).where(eq(phoneLines.userId,userId));
      if(row)return row.number;
      const number=`9${String(randomInt(0,100_000_000)).padStart(8,'0')}`;
      // A collision (or a concurrent first use) inserts nothing and the loop reads or draws again.
      const [inserted]=await this.db.insert(phoneLines).values({userId,number}).onConflictDoNothing().returning({number:phoneLines.number});
      if(inserted)return inserted.number;
    }
    throw new PhoneError(503,'Não foi possível criar o número agora. Tente de novo.');
  }
  private async people(ids:readonly string[]):Promise<Map<string,PhoneContact>>{
    const unique=[...new Set(ids)],found=new Map<string,PhoneContact>();
    if(!unique.length)return found;
    const rows=await this.db.select({id:users.id,name:profiles.displayName,avatar:profiles.avatarConfig,number:phoneLines.number,photoAt:gramProfiles.photoAt}).from(users)
      .innerJoin(profiles,eq(profiles.userId,users.id)).leftJoin(phoneLines,eq(phoneLines.userId,users.id)).leftJoin(gramProfiles,eq(gramProfiles.userId,users.id)).where(inArray(users.id,unique));
    for(const row of rows)found.set(row.id,{id:row.id,name:row.name,color:(row.avatar as {color?:string}).color??'#cf7549',number:row.number??await this.line(row.id),...(row.photoAt?{photo:row.photoAt.getTime()}:{})});
    return found;
  }
  private async contactIds(userId:string):Promise<Set<string>>{
    return new Set((await this.db.select({id:phoneContacts.contactId}).from(phoneContacts).where(eq(phoneContacts.ownerId,userId))).map(row=>row.id));
  }
  private async person(id:string):Promise<PhoneContact>{
    const found=(await this.people([id])).get(id);
    if(!found)throw new PhoneError(404,'Número não encontrado.');
    return found;
  }
  /** Who this account blocked or was blocked by. */
  private async hidden(userId:string):Promise<Set<string>>{
    const rows=await this.db.select({owner:blocks.userId,blocked:blocks.blockedId}).from(blocks).where(or(eq(blocks.userId,userId),eq(blocks.blockedId,userId)));
    return new Set(rows.map(row=>row.owner===userId?row.blocked:row.owner));
  }
  private async reachable(userId:string,peerId:string):Promise<PhoneContact>{
    if(peerId===userId)throw new PhoneError(400,'Esse é o seu próprio número.');
    const peer=await this.person(peerId);
    if((await this.hidden(userId)).has(peerId))throw new PhoneError(403,'Não é possível falar com essa pessoa.');
    return peer;
  }
  /** A contact by account id or by number. */
  async resolve(target:{userId?:string;number?:string}):Promise<PhoneContact>{
    if(target.userId)return this.person(target.userId);
    if(!target.number||!PHONE_NUMBER.test(target.number))throw new PhoneError(400,'Digite um número de 9 dígitos começando com 9.');
    const [row]=await this.db.select({userId:phoneLines.userId}).from(phoneLines).where(eq(phoneLines.number,target.number));
    if(!row)throw new PhoneError(404,'Número não encontrado.');
    return this.person(row.userId);
  }

  async profile(userId:string):Promise<PhoneProfile>{
    const [number,saved,hidden]=await Promise.all([this.line(userId),
      this.db.select({id:phoneContacts.contactId}).from(phoneContacts).where(eq(phoneContacts.ownerId,userId)),this.hidden(userId)]);
    const people=await this.people(saved.map(row=>row.id));
    const unread=await this.db.select({from:phoneMessages.senderId}).from(phoneMessages).where(and(eq(phoneMessages.recipientId,userId),isNull(phoneMessages.readAt)));
    const [mine]=await this.db.select({photoAt:gramProfiles.photoAt}).from(gramProfiles).where(eq(gramProfiles.userId,userId));
    return {number,contacts:[...people.values()].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')),unread:unread.filter(row=>!hidden.has(row.from)).length,...(mine?.photoAt?{photo:mine.photoAt.getTime()}:{})};
  }
  async addContact(userId:string,target:{userId?:string;number?:string}):Promise<PhoneProfile>{
    const contact=await this.resolve(target);
    if(contact.id===userId)throw new PhoneError(400,'Esse é o seu próprio número.');
    const [{total}]=await this.db.select({total:sql<number>`count(*)::int`}).from(phoneContacts).where(eq(phoneContacts.ownerId,userId)) as [{total:number}];
    if(total>=PHONE.contactsMax)throw new PhoneError(409,`A agenda guarda até ${PHONE.contactsMax} contatos.`);
    await this.db.insert(phoneContacts).values({ownerId:userId,contactId:contact.id}).onConflictDoNothing();
    return this.profile(userId);
  }
  async removeContact(userId:string,contactId:string):Promise<PhoneProfile>{
    await this.db.delete(phoneContacts).where(and(eq(phoneContacts.ownerId,userId),eq(phoneContacts.contactId,contactId)));
    return this.profile(userId);
  }

  /** Highzap: the latest message and unread count of each conversation, newest first. */
  async threads(userId:string):Promise<ZapThread[]>{
    const hidden=await this.hidden(userId);
    const rows=await this.db.select().from(phoneMessages).where(or(eq(phoneMessages.senderId,userId),eq(phoneMessages.recipientId,userId)))
      .orderBy(desc(phoneMessages.createdAt)).limit(1000);
    const latest=new Map<string,ZapMessage>(),unread=new Map<string,number>();
    for(const row of rows){
      const peer=row.senderId===userId?row.recipientId:row.senderId;
      if(hidden.has(peer))continue;
      if(!latest.has(peer))latest.set(peer,message(row));
      if(row.recipientId===userId&&!row.readAt)unread.set(peer,(unread.get(peer)??0)+1);
    }
    const [people,saved]=await Promise.all([this.people([...latest.keys()]),this.contactIds(userId)]);
    return [...latest].filter(([peer])=>people.has(peer)).map(([peer,last])=>({peer:people.get(peer)!,last,unread:unread.get(peer)??0,saved:saved.has(peer)}));
  }
  /** Highzap reaches your contacts, and whoever already shares a conversation with you (someone who wrote first can be answered). */
  private async canMessage(userId:string,peerId:string):Promise<void>{
    if((await this.contactIds(userId)).has(peerId))return;
    const [talked]=await this.db.select({id:phoneMessages.id}).from(phoneMessages)
      .where(or(and(eq(phoneMessages.senderId,userId),eq(phoneMessages.recipientId,peerId)),and(eq(phoneMessages.senderId,peerId),eq(phoneMessages.recipientId,userId)))).limit(1);
    if(!talked)throw new PhoneError(403,'Salve o número nos seus contatos para conversar.');
  }
  /** One conversation, oldest first; the peer's messages are marked read (`read` says how many were new). */
  async thread(userId:string,peerId:string,before?:number):Promise<{peer:PhoneContact;messages:ZapMessage[];read:number}>{
    const peer=await this.reachable(userId,peerId);
    const pair=or(and(eq(phoneMessages.senderId,userId),eq(phoneMessages.recipientId,peerId)),and(eq(phoneMessages.senderId,peerId),eq(phoneMessages.recipientId,userId)));
    const rows=await this.db.select().from(phoneMessages).where(before?and(pair,lt(phoneMessages.createdAt,new Date(before))):pair).orderBy(desc(phoneMessages.createdAt)).limit(PHONE.threadPage);
    const read=await this.db.update(phoneMessages).set({readAt:new Date()})
      .where(and(eq(phoneMessages.senderId,peerId),eq(phoneMessages.recipientId,userId),isNull(phoneMessages.readAt))).returning({id:phoneMessages.id});
    return {peer,messages:rows.reverse().map(message),read:read.length};
  }
  /** Sends once per requestId (a retried request returns the same message). */
  async send(userId:string,peerId:string,text:string,requestId:string):Promise<ZapMessage>{
    await this.reachable(userId,peerId);
    const body=text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,' ').trim();
    if(!body||body.length>PHONE.messageMax)throw new PhoneError(400,`A mensagem precisa ter de 1 a ${PHONE.messageMax} caracteres.`);
    const sent=await this.sent(userId,requestId);if(sent)return sent;
    await this.canMessage(userId,peerId);
    await this.db.insert(phoneMessages).values({id:requestId,senderId:userId,recipientId:peerId,body}).onConflictDoNothing();
    const row=await this.sent(userId,requestId);
    if(!row)throw new PhoneError(409,'Este identificador já foi usado.');
    return row;
  }
  /** A message already sent with this requestId (a retry), or a 409 if the id is someone else's. */
  private async sent(userId:string,requestId:string):Promise<ZapMessage|undefined>{
    const [row]=await this.db.select().from(phoneMessages).where(eq(phoneMessages.id,requestId));
    if(row&&row.senderId!==userId)throw new PhoneError(409,'Este identificador já foi usado.');
    return row&&message(row);
  }
  /**
   * A photo, voice note or video in Highzap, once per requestId. The bytes are kept apart (phone_media) and served only
   * to the two ends; past PHONE.mediaQuotaBytes the sender's oldest files go (their messages then say so).
   */
  async sendMedia(userId:string,peerId:string,upload:{kind:PhoneMediaKind;type:string;bytes:Buffer;ms?:number},requestId:string):Promise<ZapMessage>{
    await this.reachable(userId,peerId);
    const sent=await this.sent(userId,requestId);if(sent)return sent;
    await this.canMessage(userId,peerId);
    const {kind,type,bytes}=upload;
    if(!PHONE_MEDIA_TYPES[kind].includes(type))throw new PhoneError(415,'Formato de arquivo não aceito.');
    const max=kind==='photo'?PHONE.photoMaxBytes:kind==='audio'?PHONE.audioMaxBytes:PHONE.videoMaxBytes;
    if(!bytes.length||bytes.length>max)throw new PhoneError(413,kind==='photo'?'Foto grande demais.':kind==='audio'?'Áudio longo demais.':'Vídeo longo demais.');
    if(kind==='photo'&&!isJpeg(bytes))throw new PhoneError(400,'A foto precisa ser um JPEG.');
    const longest=kind==='audio'?PHONE.audioMaxMs:kind==='video'?PHONE.videoMaxMs:0;
    const ms=longest&&upload.ms?Math.max(1,Math.min(longest,Math.round(upload.ms))):null;
    const mediaId=randomUUID();
    await this.db.transaction(async tx=>{
      await tx.insert(phoneMedia).values({id:mediaId,ownerId:userId,kind,mime:type,bytes,size:bytes.length,durationMs:ms});
      const inserted=await tx.insert(phoneMessages).values({id:requestId,senderId:userId,recipientId:peerId,body:'',mediaId,mediaKind:kind,mediaMs:ms}).onConflictDoNothing().returning({id:phoneMessages.id});
      // The same requestId raced in twice: the first one stands and this copy of the file is not kept.
      if(!inserted.length)await tx.delete(phoneMedia).where(eq(phoneMedia.id,mediaId));
    });
    await this.trimMedia(userId);
    const row=await this.sent(userId,requestId);
    if(!row)throw new PhoneError(409,'Este identificador já foi usado.');
    return row;
  }
  private async trimMedia(userId:string):Promise<void>{
    const rows=await this.db.select({id:phoneMedia.id,size:phoneMedia.size}).from(phoneMedia).where(eq(phoneMedia.ownerId,userId)).orderBy(desc(phoneMedia.createdAt));
    let kept=0;const gone:string[]=[];
    for(const row of rows){kept+=row.size;if(kept>PHONE.mediaQuotaBytes)gone.push(row.id);}
    if(gone.length)await this.db.delete(phoneMedia).where(inArray(phoneMedia.id,gone));
  }
  /** A Highzap attachment, for its sender or the one it was sent to. */
  async media(viewer:string,mediaId:string):Promise<{type:string;bytes:Buffer}>{
    const [row]=await this.db.select({ownerId:phoneMedia.ownerId,mime:phoneMedia.mime,bytes:phoneMedia.bytes}).from(phoneMedia).where(eq(phoneMedia.id,mediaId));
    if(!row)throw new PhoneError(404,'Mídia não encontrada.');
    if(row.ownerId!==viewer){
      const [shared]=await this.db.select({id:phoneMessages.id}).from(phoneMessages).where(and(eq(phoneMessages.mediaId,mediaId),eq(phoneMessages.recipientId,viewer))).limit(1);
      if(!shared||(await this.hidden(viewer)).has(row.ownerId))throw new PhoneError(404,'Mídia não encontrada.');
    }
    return {type:row.mime,bytes:row.bytes};
  }

  /** Highgram profiles for accounts that have none yet: the username as handle (with digits if someone took it) and the bar name. */
  private async ensureGram(ids:readonly string[]):Promise<void>{
    const unique=[...new Set(ids)];if(!unique.length)return;
    const missing=await this.db.select({id:users.id,username:users.username,name:profiles.displayName}).from(users).innerJoin(profiles,eq(profiles.userId,users.id))
      .leftJoin(gramProfiles,eq(gramProfiles.userId,users.id)).where(and(inArray(users.id,unique),isNull(gramProfiles.userId)));
    for(const person of missing){
      const base=person.username.toLowerCase().replace(/[^a-z0-9._]/g,'').slice(0,24).padEnd(3,'_');
      for(let attempt=0;attempt<6;attempt++){
        const handle=attempt?`${base.slice(0,19)}${randomInt(10,99_999)}`:base;
        const [made]=await this.db.insert(gramProfiles).values({userId:person.id,handle,name:person.name.slice(0,PHONE.gramNameMax)}).onConflictDoNothing().returning({id:gramProfiles.userId});
        if(made)break;
        const [exists]=await this.db.select({id:gramProfiles.userId}).from(gramProfiles).where(eq(gramProfiles.userId,person.id));
        if(exists)break;
      }
    }
  }
  private async authors(ids:readonly string[]):Promise<Map<string,GramAuthor>>{
    const unique=[...new Set(ids)];if(!unique.length)return new Map();
    await this.ensureGram(unique);
    const rows=await this.db.select({id:users.id,avatar:profiles.avatarConfig,handle:gramProfiles.handle,name:gramProfiles.name,photoAt:gramProfiles.photoAt}).from(users)
      .innerJoin(profiles,eq(profiles.userId,users.id)).innerJoin(gramProfiles,eq(gramProfiles.userId,users.id)).where(inArray(users.id,unique));
    return new Map(rows.map(row=>[row.id,{id:row.id,name:row.name,handle:row.handle,color:(row.avatar as {color?:string}).color??'#cf7549',...(row.photoAt?{photo:row.photoAt.getTime()}:{})}]));
  }
  /** Who among `ids` the viewer follows, and who follows the viewer. */
  private async relations(viewer:string,ids:readonly string[]):Promise<{followed:Set<string>;followsYou:Set<string>}>{
    if(!ids.length)return {followed:new Set(),followsYou:new Set()};
    const rows=await this.db.select().from(gramFollows).where(or(and(eq(gramFollows.followerId,viewer),inArray(gramFollows.followedId,[...ids])),and(eq(gramFollows.followedId,viewer),inArray(gramFollows.followerId,[...ids]))));
    return {followed:new Set(rows.filter(row=>row.followerId===viewer).map(row=>row.followedId)),followsYou:new Set(rows.filter(row=>row.followedId===viewer).map(row=>row.followerId))};
  }
  /** People as Highgram lists them (search, followers, suggestions), in the order given, without the hidden ones. */
  private async gramPeople(viewer:string,ids:readonly string[]):Promise<GramPerson[]>{
    const hidden=await this.hidden(viewer),shown=[...new Set(ids)].filter(id=>!hidden.has(id));
    const [authors,{followed,followsYou}]=await Promise.all([this.authors(shown),this.relations(viewer,shown)]);
    return shown.filter(id=>authors.has(id)).map(id=>({author:authors.get(id)!,followed:followed.has(id),followsYou:followsYou.has(id)}));
  }
  private async followCounts(userId:string):Promise<{followers:number;following:number}>{
    const [[followers],[following]]=await Promise.all([
      this.db.select({total:sql<number>`count(*)::int`}).from(gramFollows).where(eq(gramFollows.followedId,userId)),
      this.db.select({total:sql<number>`count(*)::int`}).from(gramFollows).where(eq(gramFollows.followerId,userId))]) as [[{total:number}],[{total:number}]];
    return {followers:Number(followers.total),following:Number(following.total)};
  }
  /** A profile's header: the person, the bio and the counts (GramProfile adds the posts). */
  private async gramSummary(viewer:string,userId:string):Promise<GramPerson&{bio:string;posts:number;followers:number;following:number}>{
    if(userId!==viewer&&(await this.hidden(viewer)).has(userId))throw new PhoneError(403,'Perfil indisponível.');
    const [person]=await this.gramPeople(viewer,[userId]);
    if(!person)throw new PhoneError(404,'Perfil não encontrado.');
    const [[profile],[posts],counts]=await Promise.all([this.db.select({bio:gramProfiles.bio}).from(gramProfiles).where(eq(gramProfiles.userId,userId)),
      this.db.select({total:sql<number>`count(*)::int`}).from(gramPosts).where(eq(gramPosts.authorId,userId)),this.followCounts(userId)]);
    return {...person,bio:profile?.bio??'',posts:Number(posts?.total??0),...counts};
  }
  /** Changes your Highgram name, handle, bio or photo (`photo: null` removes it). */
  async updateGram(userId:string,patch:{name?:string;handle?:string;bio?:string;photo?:string|null}):Promise<GramProfile>{
    await this.ensureGram([userId]);
    const changes:Partial<typeof gramProfiles.$inferInsert>={updatedAt:new Date()};
    if(patch.name!==undefined){const name=clean(patch.name);if(!name||name.length>PHONE.gramNameMax)throw new PhoneError(400,`O nome precisa ter de 1 a ${PHONE.gramNameMax} caracteres.`);changes.name=name;}
    if(patch.handle!==undefined){
      const handle=patch.handle.trim().replace(/^@/,'').toLowerCase();
      if(!GRAM_HANDLE.test(handle))throw new PhoneError(400,'O nome de usuário usa de 3 a 24 letras minúsculas, números, ponto ou sublinhado.');
      const [taken]=await this.db.select({id:gramProfiles.userId}).from(gramProfiles).where(eq(gramProfiles.handle,handle));
      if(taken&&taken.id!==userId)throw new PhoneError(409,'Esse nome de usuário já existe no Highgram.');
      changes.handle=handle;
    }
    if(patch.bio!==undefined){const bio=patch.bio.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g,' ').trim();if(bio.length>PHONE.bioMax)throw new PhoneError(400,`A bio tem até ${PHONE.bioMax} caracteres.`);changes.bio=bio;}
    if(patch.photo!==undefined){changes.photo=patch.photo===null?null:jpegBytes(patch.photo,PHONE.avatarMaxBytes).toString('base64');changes.photoAt=patch.photo===null?null:new Date();}
    try{await this.db.update(gramProfiles).set(changes).where(eq(gramProfiles.userId,userId));}
    catch(error){if(String((error as {code?:string}).code??(error as Error).message).match(/23505|unique/i))throw new PhoneError(409,'Esse nome de usuário já existe no Highgram.');throw error;}
    return this.gramProfile(userId,userId);
  }
  async avatar(viewer:string,userId:string):Promise<Buffer>{
    const [row]=await this.db.select({photo:gramProfiles.photo}).from(gramProfiles).where(eq(gramProfiles.userId,userId));
    if(!row?.photo||(userId!==viewer&&(await this.hidden(viewer)).has(userId)))throw new PhoneError(404,'Foto não encontrada.');
    return Buffer.from(row.photo,'base64');
  }
  /** Follows or unfollows; `notify` is the one to ping about a new follower. */
  async follow(userId:string,targetId:string,on:boolean):Promise<{followed:boolean;followers:number;notify?:string}>{
    if(targetId===userId)throw new PhoneError(400,'Você não pode seguir a si mesmo.');
    await this.reachable(userId,targetId);
    const changed=on?await this.db.insert(gramFollows).values({followerId:userId,followedId:targetId}).onConflictDoNothing().returning({id:gramFollows.followedId})
      :await this.db.delete(gramFollows).where(and(eq(gramFollows.followerId,userId),eq(gramFollows.followedId,targetId))).returning({id:gramFollows.followedId});
    return {followed:on,followers:(await this.followCounts(targetId)).followers,...(on&&changed.length?{notify:targetId}:{})};
  }
  async followList(viewer:string,userId:string,which:'followers'|'following'):Promise<GramPerson[]>{
    await this.gramSummary(viewer,userId);
    const rows=which==='followers'?await this.db.select({id:gramFollows.followerId}).from(gramFollows).where(eq(gramFollows.followedId,userId)).orderBy(desc(gramFollows.createdAt)).limit(200)
      :await this.db.select({id:gramFollows.followedId}).from(gramFollows).where(eq(gramFollows.followerId,userId)).orderBy(desc(gramFollows.createdAt)).limit(200);
    return this.gramPeople(viewer,rows.map(row=>row.id));
  }
  /** Highgram search by @handle or name; everyone gets a profile row first, so nobody is missing from it. */
  async search(viewer:string,query:string):Promise<GramPerson[]>{
    const text=query.trim().replace(/^@/,'').slice(0,40);
    if(!text)return [];
    const pattern=`%${text.replace(/[\\%_]/g,match=>`\\${match}`)}%`;
    const accounts=await this.db.select({id:users.id}).from(users).innerJoin(profiles,eq(profiles.userId,users.id)).leftJoin(gramProfiles,eq(gramProfiles.userId,users.id))
      .where(or(ilike(gramProfiles.handle,pattern),ilike(gramProfiles.name,pattern),and(isNull(gramProfiles.userId),or(ilike(users.username,pattern),ilike(profiles.displayName,pattern))))).limit(PHONE.searchMax+1);
    return (await this.gramPeople(viewer,accounts.map(row=>row.id).filter(id=>id!==viewer))).slice(0,PHONE.searchMax);
  }
  /**
   * Whom to follow, best first: who follows you, who the people you follow follow, your phone contacts, who is in the
   * bar with you (`here`, from the room the phone sees) and then the bar's most followed and most recent posters.
   */
  async suggestions(viewer:string,here:readonly string[]):Promise<GramSuggestion[]>{
    const [hidden,following,contacts]=await Promise.all([this.hidden(viewer),
      this.db.select({id:gramFollows.followedId}).from(gramFollows).where(eq(gramFollows.followerId,viewer)).then(rows=>new Set(rows.map(row=>row.id))),this.contactIds(viewer)]);
    const scores=new Map<string,{score:number;best:number;reason:string}>();
    const add=(id:string,points:number,reason:string)=>{
      if(id===viewer||following.has(id)||hidden.has(id))return;
      const entry=scores.get(id);
      if(!entry)scores.set(id,{score:points,best:points,reason});
      else{entry.score+=points;if(points>entry.best){entry.best=points;entry.reason=reason;}}
    };
    for(const row of await this.db.select({id:gramFollows.followerId}).from(gramFollows).where(eq(gramFollows.followedId,viewer)))add(row.id,6,'Segue você');
    if(following.size){
      const rows=await this.db.select({by:gramFollows.followerId,id:gramFollows.followedId}).from(gramFollows).where(inArray(gramFollows.followerId,[...following])).limit(2000);
      const via=new Map<string,string[]>();for(const row of rows)via.set(row.id,[...via.get(row.id)??[],row.by]);
      const names=await this.authors([...new Set(rows.map(row=>row.by))]);
      for(const [id,by] of via){const first=names.get(by[0]!)?.handle??'';add(id,3+Math.min(3,by.length),by.length>1?`Seguido por @${first} e mais ${by.length-1}`:`Seguido por @${first}`);}
    }
    for(const id of contacts)add(id,4,'Nos seus contatos');
    if(here.length){
      const present=await this.db.select({id:users.id}).from(users).where(inArray(users.id,[...new Set(here)].slice(0,64)));
      for(const row of present)add(row.id,2,'No bar agora');
    }
    const popular=await this.db.select({id:gramFollows.followedId,total:sql<number>`count(*)::int`}).from(gramFollows).groupBy(gramFollows.followedId).orderBy(desc(sql`count(*)`)).limit(30);
    for(const row of popular)add(row.id,1,'Popular no Highland');
    const posters=await this.db.select({id:gramPosts.authorId}).from(gramPosts).orderBy(desc(gramPosts.createdAt)).limit(60);
    for(const row of posters)add(row.id,.5,'Publica no Highland');
    const best=[...scores].sort((a,b)=>b[1].score-a[1].score).slice(0,PHONE.suggestions);
    const people=await this.gramPeople(viewer,best.map(([id])=>id));
    return people.map(person=>({...person,reason:scores.get(person.author.id)!.reason}));
  }
  /** The player card shown when clicking someone in the bar: the number to save, and their Highgram. */
  async card(viewer:string,userId:string):Promise<PlayerCard>{
    const [gram,person,saved]=await Promise.all([this.gramSummary(viewer,userId),this.person(userId),this.contactIds(viewer)]);
    return {id:userId,name:person.name,color:person.color,number:person.number,saved:saved.has(userId),mine:userId===viewer,gram};
  }
  /** Posts without their photos (those load from photo()), with likes and comments counted for the viewer. */
  private async posts(viewer:string,rows:Array<{id:string;authorId:string;caption:string;createdAt:Date}>):Promise<GramPost[]>{
    if(!rows.length)return [];
    const ids=rows.map(row=>row.id);
    const [authors,likes,mine,comments]=await Promise.all([this.authors(rows.map(row=>row.authorId)),
      this.db.select({id:gramLikes.postId,total:sql<number>`count(*)::int`}).from(gramLikes).where(inArray(gramLikes.postId,ids)).groupBy(gramLikes.postId),
      this.db.select({id:gramLikes.postId}).from(gramLikes).where(and(eq(gramLikes.userId,viewer),inArray(gramLikes.postId,ids))),
      this.db.select({id:gramComments.postId,total:sql<number>`count(*)::int`}).from(gramComments).where(inArray(gramComments.postId,ids)).groupBy(gramComments.postId)]);
    const count=(list:Array<{id:string;total:number}>,id:string)=>Number(list.find(row=>row.id===id)?.total??0);
    return rows.filter(row=>authors.has(row.authorId)).map(row=>({id:row.id,author:authors.get(row.authorId)!,caption:row.caption,createdAt:row.createdAt.getTime(),
      likes:count(likes,row.id),liked:mine.some(like=>like.id===row.id),comments:count(comments,row.id),mine:row.authorId===viewer}));
  }
  private readonly postColumns={id:gramPosts.id,authorId:gramPosts.authorId,caption:gramPosts.caption,createdAt:gramPosts.createdAt};
  /** `following`: the people you follow and yourself (Highgram's home); `all`: the whole bar (Explorar). */
  async feed(viewer:string,before?:number,scope:'following'|'all'='all'):Promise<GramPost[]>{
    const hidden=[...await this.hidden(viewer)];
    const authors=scope==='following'?[viewer,...(await this.db.select({id:gramFollows.followedId}).from(gramFollows).where(eq(gramFollows.followerId,viewer))).map(row=>row.id)]:undefined;
    const filters=[before?lt(gramPosts.createdAt,new Date(before)):undefined,hidden.length?notInArray(gramPosts.authorId,hidden):undefined,authors?inArray(gramPosts.authorId,authors):undefined].filter(Boolean);
    const rows=await this.db.select(this.postColumns).from(gramPosts).where(filters.length?and(...filters):undefined).orderBy(desc(gramPosts.createdAt)).limit(PHONE.feedPage);
    return this.posts(viewer,rows);
  }
  async gramProfile(viewer:string,authorId:string):Promise<GramProfile>{
    const summary=await this.gramSummary(viewer,authorId);
    const rows=await this.db.select(this.postColumns).from(gramPosts).where(eq(gramPosts.authorId,authorId)).orderBy(desc(gramPosts.createdAt)).limit(GRAM_POSTS_PER_ACCOUNT);
    const posts=await this.posts(viewer,rows);
    return {author:summary.author,followed:summary.followed,followsYou:summary.followsYou,bio:summary.bio,followers:summary.followers,following:summary.following,
      mine:authorId===viewer,posts,likes:posts.reduce((sum,post)=>sum+post.likes,0)};
  }
  /** `image` is a JPEG data URL from the phone's camera (filtered on the phone before it is sent). */
  async createPost(userId:string,image:string,caption:string,requestId:string):Promise<GramPost>{
    const bytes=jpegBytes(image,PHONE.photoMaxBytes);
    const text=clean(caption).slice(0,PHONE.captionMax);
    const [existing]=await this.db.select(this.postColumns).from(gramPosts).where(eq(gramPosts.id,requestId));
    if(!existing){
      const [{total}]=await this.db.select({total:sql<number>`count(*)::int`}).from(gramPosts).where(eq(gramPosts.authorId,userId)) as [{total:number}];
      if(total>=GRAM_POSTS_PER_ACCOUNT)throw new PhoneError(409,`Seu perfil já tem ${GRAM_POSTS_PER_ACCOUNT} fotos. Apague uma antiga para postar outra.`);
      await this.db.insert(gramPosts).values({id:requestId,authorId:userId,caption:text,image:bytes.toString('base64')}).onConflictDoNothing();
    }
    const [row]=await this.db.select(this.postColumns).from(gramPosts).where(eq(gramPosts.id,requestId));
    if(!row||row.authorId!==userId)throw new PhoneError(409,'Este identificador já foi usado.');
    return (await this.posts(userId,[row]))[0]!;
  }
  async photo(viewer:string,postId:string):Promise<Buffer>{
    const [row]=await this.db.select({image:gramPosts.image,authorId:gramPosts.authorId}).from(gramPosts).where(eq(gramPosts.id,postId));
    if(!row||(row.authorId!==viewer&&(await this.hidden(viewer)).has(row.authorId)))throw new PhoneError(404,'Foto não encontrada.');
    return Buffer.from(row.image,'base64');
  }
  async deletePost(userId:string,postId:string,administrator:boolean):Promise<void>{
    const [row]=await this.db.select({authorId:gramPosts.authorId}).from(gramPosts).where(eq(gramPosts.id,postId));
    if(!row)throw new PhoneError(404,'Publicação não encontrada.');
    if(row.authorId!==userId&&!administrator)throw new PhoneError(403,'Só quem postou pode apagar.');
    await this.db.delete(gramPosts).where(eq(gramPosts.id,postId));
  }
  private async visiblePost(viewer:string,postId:string):Promise<{authorId:string}>{
    const [row]=await this.db.select({authorId:gramPosts.authorId}).from(gramPosts).where(eq(gramPosts.id,postId));
    if(!row||(row.authorId!==viewer&&(await this.hidden(viewer)).has(row.authorId)))throw new PhoneError(404,'Publicação não encontrada.');
    return row;
  }
  /** `notify`: the author to ping (a new like on someone else's post). */
  async like(userId:string,postId:string,liked:boolean):Promise<{likes:number;liked:boolean;notify?:string}>{
    const post=await this.visiblePost(userId,postId);
    const changed=liked?await this.db.insert(gramLikes).values({postId,userId}).onConflictDoNothing().returning({postId:gramLikes.postId})
      :await this.db.delete(gramLikes).where(and(eq(gramLikes.postId,postId),eq(gramLikes.userId,userId))).returning({postId:gramLikes.postId});
    const [{total}]=await this.db.select({total:sql<number>`count(*)::int`}).from(gramLikes).where(eq(gramLikes.postId,postId)) as [{total:number}];
    return {likes:Number(total),liked,...(liked&&changed.length&&post.authorId!==userId?{notify:post.authorId}:{})};
  }
  async comments(viewer:string,postId:string):Promise<GramComment[]>{
    await this.visiblePost(viewer,postId);
    const hidden=await this.hidden(viewer);
    const rows=(await this.db.select().from(gramComments).where(eq(gramComments.postId,postId)).orderBy(asc(gramComments.createdAt)).limit(200)).filter(row=>!hidden.has(row.authorId));
    const authors=await this.authors(rows.map(row=>row.authorId));
    return rows.filter(row=>authors.has(row.authorId)).map(row=>({id:row.id,author:authors.get(row.authorId)!,text:row.body,createdAt:row.createdAt.getTime(),mine:row.authorId===viewer}));
  }
  async comment(userId:string,postId:string,text:string,requestId:string):Promise<{comments:GramComment[];notify?:string}>{
    const post=await this.visiblePost(userId,postId);
    const body=text.replace(/[\u0000-\u001f\u007f]/g,' ').trim();
    if(!body||body.length>PHONE.commentMax)throw new PhoneError(400,`O comentário precisa ter de 1 a ${PHONE.commentMax} caracteres.`);
    const inserted=await this.db.insert(gramComments).values({id:requestId,postId,authorId:userId,body}).onConflictDoNothing().returning({id:gramComments.id});
    return {comments:await this.comments(userId,postId),...(inserted.length&&post.authorId!==userId?{notify:post.authorId}:{})};
  }
  async deleteComment(userId:string,commentId:string):Promise<void>{
    const [row]=await this.db.select({authorId:gramComments.authorId,postAuthor:gramPosts.authorId}).from(gramComments).innerJoin(gramPosts,eq(gramPosts.id,gramComments.postId)).where(eq(gramComments.id,commentId));
    if(!row)throw new PhoneError(404,'Comentário não encontrado.');
    if(row.authorId!==userId&&row.postAuthor!==userId)throw new PhoneError(403,'Só quem comentou ou o dono da foto pode apagar.');
    await this.db.delete(gramComments).where(eq(gramComments.id,commentId));
  }

  private async sentToday(userId:string,db:Pick<Database,'select'>=this.db):Promise<number>{
    const [{sum}]=await db.select({sum:sql<number>`coalesce(sum(${currencyLedger.amount}),0)`}).from(currencyLedger)
      .where(and(eq(currencyLedger.userId,userId),like(currencyLedger.reason,'pix:out:%'),gte(currencyLedger.createdAt,startOfDay()))) as [{sum:number}];
    return -Number(sum);
  }
  /** HighBank: the wallet and its latest movements, the other side of each Pix by name. */
  async bank(userId:string):Promise<BankView>{
    await this.wardrobe.initialize(userId);
    const [[wallet],rows,sentToday]=await Promise.all([this.db.select().from(wallets).where(eq(wallets.userId,userId)),
      this.db.select().from(currencyLedger).where(eq(currencyLedger.userId,userId)).orderBy(desc(currencyLedger.createdAt)).limit(PHONE.bankPage),this.sentToday(userId)]);
    const peers=await this.people(rows.filter(row=>row.reason.startsWith('pix:')).map(row=>row.reason.split(':')[2]!).filter(Boolean));
    // Administrative adjustments keep their JSON detail to themselves: the statement shows only the kind.
    return {balance:wallet?.balance??0,sentToday,entries:rows.filter(row=>row.amount!==0).map(row=>({id:row.id,amount:row.amount,reason:row.reason.startsWith('{')?'admin':row.reason,at:row.createdAt.getTime(),
      ...(row.reason.startsWith('pix:')?{peer:peers.get(row.reason.split(':')[2]!)?.name}:{})}))};
  }
  /** Moves coins between two players in one transaction, once per requestId, within PHONE.pixMax and PHONE.pixDailyMax. */
  async pix(userId:string,target:{userId?:string;number?:string},amount:number,requestId:string):Promise<{balance:number;amount:number;to:PhoneContact}>{
    if(!Number.isSafeInteger(amount)||amount<1||amount>PHONE.pixMax)throw new PhoneError(400,`O Pix vai de 1 a ${PHONE.pixMax.toLocaleString('pt-BR')} moedas.`);
    const to=await this.resolve(target);
    await this.reachable(userId,to.id);
    await this.wardrobe.initialize(userId);await this.wardrobe.initialize(to.id);
    const out=`pix:${requestId}:out`;
    const balance=await this.db.transaction(async tx=>{
      // Both wallets locked in one order, so two Pix crossing each other cannot deadlock.
      const locked=await tx.select().from(wallets).where(inArray(wallets.userId,[userId,to.id])).orderBy(asc(wallets.userId)).for('update');
      const mine=locked.find(row=>row.userId===userId),theirs=locked.find(row=>row.userId===to.id);
      if(!mine||!theirs)throw new PhoneError(404,'Carteira não encontrada.');
      const [previous]=await tx.select().from(currencyLedger).where(eq(currencyLedger.id,out));
      if(previous){
        if(previous.userId!==userId)throw new PhoneError(409,'Este identificador já foi usado.');
        return mine.balance;
      }
      const sent=await this.sentToday(userId,tx);
      if(sent+amount>PHONE.pixDailyMax)throw new PhoneError(409,`Limite diário de Pix: ${PHONE.pixDailyMax.toLocaleString('pt-BR')} moedas. Hoje você já enviou ${sent.toLocaleString('pt-BR')}.`);
      if(mine.balance<amount)throw new PhoneError(409,'Moedas insuficientes.');
      if(theirs.balance+amount>MAX_COIN_BALANCE)throw new PhoneError(409,`A carteira de ${to.name} está cheia.`);
      await tx.insert(currencyLedger).values([{id:out,userId,amount:-amount,reason:`pix:out:${to.id}`},{id:`pix:${requestId}:in`,userId:to.id,amount,reason:`pix:in:${userId}`}]);
      await tx.update(wallets).set({balance:mine.balance-amount}).where(eq(wallets.userId,userId));
      await tx.update(wallets).set({balance:theirs.balance+amount}).where(eq(wallets.userId,to.id));
      return mine.balance-amount;
    });
    return {balance,amount,to};
  }
}
