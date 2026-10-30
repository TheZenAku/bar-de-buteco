import {PHONE,formatPhoneNumber,type PhoneContact,type PhoneMediaKind,type ZapMessage,type ZapThread} from '@bar/shared';
import {api,escape as e} from '../../api';
import {uiIcon} from '../../ui-icons';
import {avatar,duration,header,hourMinute,timeAgo,type CameraRequest,type Person,type Photo,type PhoneApp} from '../core';
import {Recording,mediaUrl,microphone,postPhoto,recorderType,rememberMedia,sendZapMedia,stopTracks} from '../media';

interface Shown extends ZapMessage {pending?:boolean;failed?:boolean}
const day=(at:number)=>new Date(at).toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'});
const MEDIA:Record<PhoneMediaKind,{icon:string;label:string}>={photo:{icon:'camera',label:'Foto'},audio:{icon:'mic',label:'Mensagem de voz'},video:{icon:'video',label:'Vídeo'}};
/** What a conversation's last message says in the list. */
const preview=(message:ZapMessage)=>message.media?`${uiIcon(MEDIA[message.media.kind].icon)}${MEDIA[message.media.kind].label}${message.media.ms?` (${duration(message.media.ms/1000)})`:''}`:e(message.text);
/** Someone outside your contacts shows as their number, as a messenger does, with the name they use beside it. */
const title=(person:Person,saved:boolean)=>saved||!person.number?e(person.name):`${e(formatPhoneNumber(person.number))} <i class="zap-push">~${e(person.name)}</i>`;

/** One child per key, kept between renders while its body is the same: a voice note keeps playing when a message arrives. */
const bodies=new WeakMap<Element,string>(),metas=new WeakMap<Element,string>();
function reconcile(container:HTMLElement,items:Array<{key:string;body:string;meta?:string}>):void {
  const old=new Map<string,HTMLElement>(),keep=new Set<Element>(),template=document.createElement('template');
  for(const child of Array.from(container.children) as HTMLElement[])if(child.dataset.key)old.set(child.dataset.key,child);
  let at=container.firstElementChild;
  for(const item of items){
    let node=old.get(item.key);
    if(!node||bodies.get(node)!==item.body){template.innerHTML=item.body.trim();node=template.content.firstElementChild as HTMLElement;node.dataset.key=item.key;bodies.set(node,item.body);}
    const meta=item.meta!==undefined?node.querySelector('.zap-status'):null;
    if(meta&&metas.get(node)!==item.meta){meta.innerHTML=item.meta!;metas.set(node,item.meta!);}
    keep.add(node);
    if(node===at)at=at.nextElementSibling;else container.insertBefore(node,at);
  }
  for(const child of Array.from(container.children))if(!keep.has(child))child.remove();
}

/**
 * Highzap (WhatsApp parody): one-to-one conversations with the people in your contacts (or who wrote to you first),
 * kept by the API with their photos, voice notes and videos; the room's pings make them live. Calls and video calls
 * start from the conversation.
 */
export const highzap:PhoneApp={id:'highzap',name:'Highzap',icon:'messageCircle',tint:'linear-gradient(160deg,#5ef0a0,#0b9b62)',dock:true,open(view,ctx,arg){
  const me=ctx.host.user()?.id??'';
  let mode:'list'|'thread'|'new'|'share'='list',threads:ZapThread[]=[],peer:Person|undefined,messages:Shown[]=[],query='',loaded=false;
  let sheet:'attach'|'gallery'|undefined,staged:Photo|undefined,viewing:string|undefined,sharing:string|undefined,roll:Photo[]=[];
  let recording:{run:Recording;mic:MediaStream;timer:ReturnType<typeof setInterval>}|undefined;
  const saved=(id:string)=>!!ctx.contact(id);
  function renderList():void {
    const list=threads.filter(thread=>!query||thread.peer.name.toLowerCase().includes(query.toLowerCase())||thread.peer.number.includes(query.replace(/\D/g,'')||'§'));
    view.innerHTML=`<div class="ph-body"><div class="ph-large"><h1>Conversas</h1><button type="button" class="ph-link" data-zap="new" aria-label="Nova conversa">${uiIcon('squarePlus')}</button></div>
      <input class="ph-search" type="search" placeholder="Pesquisar" value="${e(query)}" data-zap-input="search" aria-label="Pesquisar conversas">
      <div class="ph-list zap-threads">${list.map(thread=>`<button type="button" class="ph-row" data-zap="open" data-id="${e(thread.peer.id)}">${avatar(thread.peer,50)}<span class="fl"><b>${title(thread.peer,thread.saved)}</b><small>${thread.last.from===me?`<i class="zap-tick ${thread.last.readAt?'read':''}">${uiIcon(thread.last.readAt?'checkCheck':'check')}</i>`:''}${preview(thread.last)}</small></span><span class="zap-meta"><time class="${thread.unread?'unread':''}">${timeAgo(thread.last.sentAt)}</time>${thread.unread?`<i class="ph-count">${thread.unread}</i>`:''}</span></button>`).join('')}</div>
      ${loaded&&!list.length?`<p class="ph-empty">${uiIcon('messageCircle')}${query?'Nenhuma conversa com esse nome.':'Nenhuma conversa ainda.<br>Toque em + e escolha alguém da sua agenda.'}</p>`:''}</div>`;
  }
  /** Contacts only: a number reaches the agenda from the player's card (click someone in the bar) or the Contatos app. */
  function renderPicker():void {
    const people=(ctx.profile()?.contacts??[]).filter(person=>!query||person.name.toLowerCase().includes(query.toLowerCase())||person.number.includes(query.replace(/\D/g,'')||'§'));
    view.innerHTML=`${header(mode==='share'?'Enviar para…':'Nova conversa','Conversas')}<div class="ph-body"><input class="ph-search" type="search" placeholder="Nome ou número" value="${e(query)}" data-zap-input="search" aria-label="Buscar contato">
      <div class="ph-list">${people.map(person=>`<button type="button" class="ph-row" data-zap="open" data-id="${e(person.id)}">${avatar(person,40)}<span class="fl"><b>${e(person.name)}</b><small>${e(formatPhoneNumber(person.number))}</small></span></button>`).join('')}</div>
      ${people.length?'':`<p class="ph-empty small">${query?'Ninguém da agenda com esse nome.':'Sua agenda está vazia. O número de cada pessoa fica na ficha dela: clique em alguém no bar e salve o contato.'}</p><button type="button" class="ph-pill-btn soft wide" data-zap="contacts">${uiIcon('userPlus')} Adicionar um número</button>`}</div>`;
  }
  function mediaHtml(message:Shown):string {
    const media=message.media!,id=media.id??'';
    if(!id)return `<span class="zap-gone">${uiIcon(MEDIA[media.kind].icon)}${MEDIA[media.kind].label} indisponível (o espaço de quem enviou encheu)</span>`;
    if(media.kind==='photo')return `<button type="button" class="zap-photo" data-zap="view" data-media="${e(id)}" aria-label="Abrir a foto"><img alt="Foto"></button>`;
    if(media.kind==='audio')return `<div class="zap-audio" data-media="${e(id)}"><button type="button" class="zap-play" data-zap="play" aria-label="Ouvir">${uiIcon('play')}</button><span class="zap-track"><i></i></span><time>${duration((media.ms??0)/1000)}</time><audio preload="none"></audio></div>`;
    return `<div class="zap-video" data-media="${e(id)}"><video playsinline preload="metadata"></video><button type="button" class="zap-play big" data-zap="play-video" aria-label="Assistir ao vídeo">${uiIcon('play')}</button><small>${uiIcon('video')}${duration((media.ms??0)/1000)}</small></div>`;
  }
  function items():Array<{key:string;body:string;meta?:string}> {
    let lastDay='';const list:Array<{key:string;body:string;meta?:string}>=[];
    for(const message of messages){
      const mine=message.from===me,today=day(message.sentAt);
      if(today!==lastDay){list.push({key:`day:${today}`,body:`<p class="zap-day">${e(today)}</p>`});lastDay=today;}
      // Pending media show a clock until the upload finishes; the bubble itself is the same before and after.
      const body=`<div class="zap-bubble ${mine?'me':''} ${message.media?`media ${message.media.kind}`:''}">${message.media?mediaHtml(message):`<span>${e(message.text)}</span>`}<small>${hourMinute(message.sentAt)}<span class="zap-status"></span></small></div>`;
      const meta=mine?message.failed?`<i class="zap-tick failed" title="Não enviada">!</i>`:message.pending?`<i class="zap-tick">${uiIcon('clock')}</i>`:`<i class="zap-tick ${message.readAt?'read':''}" title="${message.readAt?'Lida':'Enviada'}">${uiIcon(message.readAt?'checkCheck':'check')}</i>`:'';
      list.push({key:message.id,body,meta});
    }
    return list.length?list:[{key:'empty',body:'<p class="zap-day">As mensagens ficam guardadas para as duas pessoas.</p>'}];
  }
  /** Photos and videos load once their bubble is drawn; voice notes when they are played. */
  function hydrate():void {
    for(const node of view.querySelectorAll<HTMLElement>('.zap-messages [data-media]:not([data-ready])')){
      node.dataset.ready='';
      const id=node.dataset.media!;
      if(node.classList.contains('zap-photo'))void mediaUrl(id).then(url=>{node.querySelector('img')!.src=url;}).catch(()=>node.classList.add('missing'));
      if(node.classList.contains('zap-video'))void mediaUrl(id).then(url=>{node.querySelector('video')!.src=`${url}#t=0.1`;}).catch(()=>node.classList.add('missing'));
      const audio=node.querySelector('audio');
      if(audio){
        const bar=node.querySelector<HTMLElement>('.zap-track i')!,button=node.querySelector<HTMLElement>('.zap-play')!,time=node.querySelector('time')!,total=time.textContent;
        audio.addEventListener('timeupdate',()=>{bar.style.width=`${audio.duration&&isFinite(audio.duration)?audio.currentTime/audio.duration*100:0}%`;time.textContent=duration(audio.currentTime);});
        audio.addEventListener('play',()=>{button.innerHTML=uiIcon('pause');button.setAttribute('aria-label','Pausar');});
        audio.addEventListener('pause',()=>{button.innerHTML=uiIcon('play');button.setAttribute('aria-label','Ouvir');});
        audio.addEventListener('ended',()=>{bar.style.width='0';time.textContent=total;});
      }
    }
  }
  const scrollDown=()=>{const node=view.querySelector('.zap-messages');if(node)node.scrollTop=node.scrollHeight;};
  function renderMessages(stick=false):void {
    const node=view.querySelector<HTMLElement>('.zap-messages');if(!node)return;
    const atBottom=node.scrollHeight-node.scrollTop-node.clientHeight<80;
    reconcile(node,items());hydrate();
    if(atBottom||stick)scrollDown();
  }
  function composeHtml():string {
    if(recording)return `<div class="zap-recording" role="status"><button type="button" class="ph-mini" data-zap="rec-cancel" aria-label="Descartar o áudio">${uiIcon('trash')}</button><i class="zap-rec-dot" aria-hidden="true"></i><b data-rec-time>${duration(recording.run.ms/1000)}</b><span>Gravando…</span><button type="button" class="zap-send" data-zap="rec-send" aria-label="Enviar o áudio">${uiIcon('send')}</button></div>`;
    return `<form class="zap-compose" data-zap-form="send"><button type="button" class="zap-attach" data-zap="attach" aria-label="Enviar foto ou vídeo">${uiIcon('plus')}</button><input class="ph-input" name="text" maxlength="${PHONE.messageMax}" autocomplete="off" placeholder="Mensagem" aria-label="Mensagem para ${e(peer?.name??'')}"><button type="submit" class="zap-send" aria-label="Enviar">${uiIcon('send')}</button><button type="button" class="zap-mic" data-zap="record" aria-label="Gravar mensagem de voz">${uiIcon('mic')}</button></form>`;
  }
  function renderCompose():void {const node=view.querySelector('.zap-bottom');if(node)node.innerHTML=composeHtml();}
  function sheetHtml():string {
    if(viewing)return `<div class="zap-viewer"><img alt="Foto" src="${e(viewing)}"><button type="button" class="ph-mini" data-zap="sheet-close" aria-label="Fechar">${uiIcon('close')}</button></div>`;
    if(staged){
      const url=ctx.gallery.url(staged);
      return `<div class="ph-sheet tall" role="dialog" aria-label="Enviar"><div class="ph-sheet-panel zap-stage"><header><h3>Enviar para ${e(peer?.name??'')}</h3><button type="button" class="ph-mini" data-zap="sheet-close" aria-label="Cancelar">${uiIcon('close')}</button></header>
        ${staged.kind==='video'?`<video src="${url}" controls playsinline></video>`:`<img src="${url}" alt="Foto a enviar">`}<button type="button" class="ph-pill-btn wide" data-zap="send-staged">${uiIcon('send')} Enviar</button></div></div>`;
    }
    if(sheet==='attach')return `<div class="ph-sheet" role="dialog" aria-label="Anexar"><div class="ph-sheet-list"><button type="button" data-zap="camera">${uiIcon('camera')} Câmera</button><button type="button" data-zap="gallery">${uiIcon('image')} Fotos e vídeos</button><button type="button" data-zap="sheet-close">Cancelar</button></div></div>`;
    if(sheet==='gallery')return `<div class="ph-sheet tall" role="dialog" aria-label="Fotos e vídeos"><div class="ph-sheet-panel"><header><h3>Fotos e vídeos</h3><button type="button" class="ph-mini" data-zap="sheet-close" aria-label="Fechar">${uiIcon('close')}</button></header>
      ${roll.length?`<div class="ph-grid3 zap-roll">${roll.map(item=>`<button type="button" data-zap="stage" data-id="${item.id}" aria-label="${item.kind==='video'?'Vídeo':'Foto'}">${item.kind==='video'?`<video src="${ctx.gallery.url(item)}#t=0.1" muted preload="metadata" playsinline></video><small>${uiIcon('play')}${duration((item.ms??0)/1000)}</small>`:`<img src="${ctx.gallery.url(item)}" alt="">`}</button>`).join('')}</div>`:'<p class="ph-empty small">A galeria está vazia. Use a câmera do celular.</p>'}</div></div>`;
    return '';
  }
  function renderSheet():void {view.querySelector('.zap-sheet-host')!.innerHTML=sheetHtml();}
  function headSubtitle():string {
    if(!peer)return '';
    const here=ctx.nearby().some(person=>person.id===peer!.id);
    return saved(peer.id)?(here?'no bar agora':formatPhoneNumber(peer.number??'')):`~${peer.name}`;
  }
  function renderThread():void {
    if(!peer)return;
    const known=saved(peer.id),name=known||!peer.number?peer.name:formatPhoneNumber(peer.number);
    view.innerHTML=`<header class="ph-head zap-head"><button class="ph-back" data-ph="back" type="button" aria-label="Voltar">‹</button>${avatar(peer,36)}<span class="fl"><b>${e(name)}</b><small>${e(headSubtitle())}</small></span><button type="button" class="ph-link" data-zap="video" aria-label="Chamada de vídeo com ${e(peer.name)}">${uiIcon('video')}</button><button type="button" class="ph-link" data-zap="call" aria-label="Ligar para ${e(peer.name)}">${uiIcon('phone')}</button></header>
      ${known?'':`<div class="zap-unknown">${uiIcon('userPlus')}<span>Este número não está na sua agenda.</span><button type="button" class="ph-pill-btn soft" data-zap="save">Salvar</button></div>`}
      <div class="ph-body zap-messages" aria-live="polite"></div><div class="zap-bottom">${composeHtml()}</div><div class="zap-sheet-host">${sheetHtml()}</div>`;
    renderMessages(true);
  }
  async function loadThreads():Promise<void> {
    try{threads=(await api<{threads:ZapThread[]}>('/phone/zap')).threads;loaded=true;if(mode==='list')renderList();}
    catch(error){ctx.host.error(error instanceof Error?error.message:'O Highzap não carregou.');}
  }
  async function loadThread():Promise<void> {
    if(!peer)return;
    const id=peer.id;
    try{
      const result=await api<{peer:PhoneContact;messages:ZapMessage[];read:number}>(`/phone/zap/${encodeURIComponent(id)}`);
      if(mode!=='thread'||peer?.id!==id)return;
      peer={...peer,...result.peer};
      messages=[...result.messages,...messages.filter(message=>(message.pending||message.failed)&&!result.messages.some(sent=>sent.id===message.id))];
      renderMessages();
      const sub=view.querySelector('.zap-head small');if(sub)sub.textContent=headSubtitle();
      // The sender's ticks turn blue.
      if(result.read){ctx.host.send('phone.ping',{to:id,kind:'zap-read'});void ctx.refreshProfile();}
    }catch(error){ctx.host.error(error instanceof Error?error.message:'A conversa não carregou.');mode='list';renderList();}
  }
  function openThread(person:Person):void {mode='thread';peer=person;messages=[];query='';sheet=undefined;viewing=undefined;renderThread();void loadThread();}
  async function send(text:string):Promise<void> {
    if(!peer)return;
    const to=peer.id,shown:Shown={id:crypto.randomUUID(),from:me,to,text,sentAt:Date.now(),pending:true};
    messages.push(shown);renderMessages(true);
    try{
      const sent=await api<ZapMessage>(`/phone/zap/${encodeURIComponent(to)}`,{text,requestId:shown.id});
      Object.assign(shown,sent,{pending:false});
      ctx.host.send('phone.ping',{to,kind:'zap'});
    }catch(error){shown.pending=false;shown.failed=true;ctx.host.error(error instanceof Error?error.message:'Mensagem não enviada.');}
    if(mode==='thread'&&peer?.id===to)renderMessages();
  }
  /** Shown at once from the local copy; uploaded as raw bytes (a photo first fitted under the limit). */
  async function sendMedia(kind:PhoneMediaKind,blob:Blob,ms?:number):Promise<void> {
    if(!peer)return;
    const to=peer.id,id=crypto.randomUUID(),shown:Shown={id,from:me,to,text:'',sentAt:Date.now(),pending:true,media:{id,kind,...(ms?{ms:Math.round(ms)}:{})}};
    rememberMedia(id,URL.createObjectURL(blob));
    messages.push(shown);renderMessages(true);
    try{
      const upload=kind==='photo'?await postPhoto(blob):blob;
      if(kind==='video'&&upload.size>PHONE.videoMaxBytes)throw new Error(`Vídeo grande demais: o Highzap leva até ${PHONE.videoMaxMs/1000} s.`);
      const sent=await sendZapMedia(to,kind,upload,id,ms);
      if(sent.media?.id)rememberMedia(sent.media.id,await mediaUrl(id));
      // The bubble keys on the message id and its body on the media id: keep the local one so nothing reloads.
      Object.assign(shown,sent,{pending:false,media:{...sent.media,id}});
      ctx.host.send('phone.ping',{to,kind:'zap'});
    }catch(error){shown.pending=false;shown.failed=true;ctx.host.error(error instanceof Error?error.message:'Não foi possível enviar.');}
    if(mode==='thread'&&peer?.id===to)renderMessages();
  }
  async function startRecording():Promise<void> {
    const type=recorderType('audio');
    if(!type){ctx.host.error('Este navegador não grava áudio.');return;}
    let mic:MediaStream;
    try{mic=await microphone();}catch(error){ctx.host.error(error instanceof Error?error.message:'Microfone indisponível.');return;}
    if(mode!=='thread'){stopTracks(mic);return;}
    const run=new Recording(mic,type,{audio:48_000});
    recording={run,mic,timer:setInterval(()=>{
      const node=view.querySelector('[data-rec-time]');if(node)node.textContent=duration(run.ms/1000);
      if(run.ms>=PHONE.audioMaxMs-200)void stopRecording(true);
    },200)};
    renderCompose();
  }
  async function stopRecording(keep:boolean):Promise<void> {
    const current=recording;if(!current)return;
    recording=undefined;clearInterval(current.timer);
    const ms=Math.min(PHONE.audioMaxMs,current.run.ms),blob=await current.run.stop().catch(()=>undefined);
    stopTracks(current.mic);renderCompose();
    if(!keep)return;
    if(!blob?.size||ms<700){ctx.host.error('Áudio curto demais: fale um pouco mais.');return;}
    void sendMedia('audio',blob,ms);
  }
  async function stage(id:string):Promise<void> {staged=await ctx.gallery.get(id);sheet=undefined;if(!staged)ctx.host.error('Esse item saiu da galeria.');renderSheet();}
  view.addEventListener('click',event=>{
    const button=(event.target as HTMLElement).closest<HTMLElement>('[data-zap],[data-ph]');if(!button)return;
    if(button.dataset.ph==='back'){void stopRecording(false);mode='list';query='';sharing=undefined;renderList();void loadThreads();return;}
    const action=button.dataset.zap;
    switch(action){
      case 'new':mode='new';query='';renderPicker();break;
      case 'contacts':ctx.open('contatos');break;
      case 'open':{
        const id=button.dataset.id!,thread=threads.find(candidate=>candidate.peer.id===id);
        const person=thread?.peer??ctx.contact(id);
        if(!person)break;
        const share=sharing;sharing=undefined;openThread(person);
        if(share)void stage(share);
        break;
      }
      case 'call':if(peer)ctx.call(peer);break;
      case 'video':if(peer)ctx.call(peer,true);break;
      case 'save':if(peer){const current=peer;void api('/phone/contacts',{userId:current.id}).then(()=>ctx.refreshProfile()).then(()=>{if(peer?.id===current.id)renderThread();}).catch(error=>ctx.host.error(error instanceof Error?error.message:'Não foi possível salvar.'));}break;
      case 'attach':sheet='attach';renderSheet();break;
      case 'camera':if(peer)ctx.open('camera',{then:'highzap',back:{peer:{id:peer.id,name:peer.name,color:peer.color,number:peer.number,photo:peer.photo}}} satisfies CameraRequest);break;
      case 'gallery':void ctx.gallery.list().then(list=>{roll=list;sheet='gallery';renderSheet();});break;
      case 'stage':void stage(button.dataset.id!);break;
      case 'send-staged':{const item=staged;staged=undefined;renderSheet();if(item)void sendMedia(item.kind==='video'?'video':'photo',item.blob,item.ms);break;}
      case 'sheet-close':sheet=undefined;staged=undefined;viewing=undefined;renderSheet();break;
      case 'view':{const img=button.querySelector('img');if(img?.src){viewing=img.src;renderSheet();}break;}
      case 'record':void startRecording();break;
      case 'rec-cancel':void stopRecording(false);break;
      case 'rec-send':void stopRecording(true);break;
      case 'play':{
        const node=button.closest<HTMLElement>('[data-media]')!,audio=node.querySelector('audio')!;
        for(const other of view.querySelectorAll('audio'))if(other!==audio)other.pause();
        if(!audio.paused){audio.pause();break;}
        void (audio.src?Promise.resolve(audio.src):mediaUrl(node.dataset.media!).then(url=>{audio.src=url;return url;})).then(()=>audio.play()).catch(()=>ctx.host.error('Esse áudio não tocou.'));
        break;
      }
      case 'play-video':{
        const node=button.closest<HTMLElement>('[data-media]')!,video=node.querySelector('video')!;
        node.classList.add('playing');video.controls=true;void video.play().catch(()=>{});
        break;
      }
    }
  });
  view.addEventListener('input',event=>{
    const input=event.target as HTMLInputElement;
    if(input.name==='text'){input.closest('.zap-compose')?.classList.toggle('typing',!!input.value.trim());return;}
    if(input.dataset.zapInput!=='search')return;
    query=input.value;
    // Only the list changes, so the search box keeps its focus and caret.
    const caret=input.selectionStart;if(mode==='list')renderList();else renderPicker();
    const next=view.querySelector<HTMLInputElement>('[data-zap-input="search"]');next?.focus();next?.setSelectionRange(caret,caret);
  });
  view.addEventListener('submit',event=>{
    event.preventDefault();
    const form=event.target as HTMLFormElement,input=form.querySelector<HTMLInputElement>('[name="text"]')!,text=input.value.trim();
    if(text){input.value='';form.classList.remove('typing');void send(text);}
    input.focus();
  });
  const off=ctx.onPing(ping=>{
    if(ping.kind!=='zap'&&ping.kind!=='zap-read')return;
    if(mode==='thread'&&peer?.id===ping.from){void loadThread();return ping.kind==='zap';}
    if(mode==='list')void loadThreads();
  });
  // Pings need both phones in the bar; a slow refresh covers the rest.
  const poll=setInterval(()=>{if(mode==='thread')void loadThread();else if(mode==='list')void loadThreads();},15_000);
  const start=arg as (Partial<Person>&{peer?:Person;captured?:string;share?:string})|undefined;
  if(start?.peer){openThread(start.peer);if(start.captured)void stage(start.captured);}
  else if(start?.share){sharing=start.share;mode='share';renderPicker();}
  else if(start?.id&&start.name)openThread(start as Person);
  else renderList();
  void loadThreads();
  return ()=>{off();clearInterval(poll);void stopRecording(false);for(const media of view.querySelectorAll<HTMLMediaElement>('audio,video'))media.pause();};
}};
