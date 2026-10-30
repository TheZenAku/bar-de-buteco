import {CALL_END_TEXT,PHONE,type PhoneCallView,type PhonePing,type PhoneProfile} from '@bar/shared';
import {api,escape as e} from '../api';
import {gameHour} from '../engine/day-night';
import {uiIcon} from '../ui-icons';
import {DEFAULT_SETTINGS,Gallery,LocalStore,PhoneSounds,avatar,duration,type Person,type PhoneApp,type PhoneContext,type PhoneHost,type PhoneSettings,type RecentCall} from './core';
import {telefone,contatos} from './apps/telefone';
import {highzap} from './apps/zap';
import {highgram} from './apps/gram';
import {camera,fotos} from './apps/camera';
import {mapas} from './apps/maps';
import {highbank} from './apps/bank';
import {notas,calendario,relogio,calculadora,ajustes} from './apps/tools';
import {WALLPAPERS} from './wallpapers';
import './phone.css';

/** Dock first (Telefone, Highzap, Highgram, Câmera), then the home screen's grid. */
const APPS:PhoneApp[]=[telefone,highzap,highgram,camera,fotos,mapas,highbank,contatos,notas,calendario,relogio,calculadora,ajustes];
const SCALE={s:.6,m:.74,l:.9} as const;
const GAME_PHASES:Array<[number,string]>=[[5,'Madrugada'],[7,'Amanhecer'],[12,'Manhã'],[17.5,'Tarde'],[19,'Entardecer'],[24,'Noite']];
const statusIcons=`<span class="ph-signal" aria-hidden="true"><i></i><i></i><i></i><i></i></span><small>5G</small><svg class="ph-wifi" viewBox="0 0 16 12" aria-hidden="true"><path d="M1 4a10 10 0 0 1 14 0M3.5 6.8a6.5 6.5 0 0 1 9 0M6 9.5a3 3 0 0 1 4 0" stroke="currentColor" fill="none" stroke-width="1.7" stroke-linecap="round"/></svg><span class="ph-battery" aria-hidden="true"><b></b></span>`;

export interface Phone {
  readonly isOpen:boolean;
  toggle():void;open(app?:string,arg?:unknown):void;close():void;
  call(view:PhoneCallView):void;ping(ping:PhonePing):void;
  /** A frame of the other end's camera on a video call (a JPEG relayed by the room). */
  videoFrame(bytes:Uint8Array):void;
  /** Calls someone from outside the phone (the player card). */
  dial(person:Person,video?:boolean):void;
  /** The agenda changed outside the phone (the player card saved a contact). */
  refresh():void;
  /** The room's connection dropped: the room ends the call, but its message cannot arrive. */
  disconnected():void;
  /** Entering the bar (fetch the number and unread messages) and leaving it (everything put away). */
  enter():void;leave():void;
}

/**
 * The in-game phone: a device in the bottom-right corner, opened with K, that leaves the world playable (walk while
 * texting). Apps live in ./apps; calls come from the room (PhoneCallView) and their voice goes through VoiceChat.
 */
export function createPhone(root:HTMLElement,host:PhoneHost):Phone {
  const owner=()=>host.user()?.id??'guest';
  const store=new LocalStore(owner),gallery=new Gallery(owner);
  let settings:PhoneSettings={...DEFAULT_SETTINGS};
  const sounds=new PhoneSounds(()=>host.volume());
  const shell=document.createElement('div');shell.id='phone';shell.className='phone-shell';shell.hidden=true;
  shell.setAttribute('role','dialog');shell.setAttribute('aria-label','Celular');
  shell.innerHTML=`<div class="phone-device"><span class="ph-btn ph-action" aria-hidden="true"></span><span class="ph-btn ph-vol-up" aria-hidden="true"></span><span class="ph-btn ph-vol-down" aria-hidden="true"></span><span class="ph-btn ph-power" aria-hidden="true"></span>
    <div class="phone-screen"><div class="ph-wall"></div><div class="ph-home"></div><div class="ph-app-host"></div><div class="ph-call-host"></div><div class="ph-banners"></div>
    <div class="ph-status"><b class="ph-time"></b><span class="ph-status-right">${statusIcons}</span></div>
    <button class="ph-island" type="button" aria-label="Dynamic Island"></button><button class="ph-home-bar" type="button" data-phone-home aria-label="Voltar à tela inicial"></button></div></div>`;
  const pill=document.createElement('div');pill.id='phone-pill';pill.className='phone-pill';pill.hidden=true;
  root.append(shell,pill);
  const $=<T extends HTMLElement>(selector:string)=>shell.querySelector<T>(selector)!;
  const screen=$('.phone-screen'),home=$('.ph-home'),appHost=$('.ph-app-host'),callHost=$('.ph-call-host'),banners=$('.ph-banners'),island=$<HTMLButtonElement>('.ph-island');
  let open=false,current:{app:PhoneApp;view:HTMLElement;close?:()=>void}|undefined,profile:PhoneProfile|undefined,profileAt=0;
  const badges=new Map<string,number>(),listeners=new Set<(ping:PhonePing)=>boolean|void>();
  let call:PhoneCallView|undefined,callShown=false,micForCall=false,muted=false,callNote='',endTimer:ReturnType<typeof setTimeout>|undefined;
  let direction:'in'|'out'='out',cancelNext=false;
  // Video calls: your camera (front = the game camera on your face, as the selfie; back = your own view of the bar),
  // sent as small JPEGs while the call screen is in front of you; the other end's last frame, and when it came.
  const camera={on:false,front:true};
  let capturing=false,quality=.6,selfieForCall=false,preview:MediaStream|undefined,remote:ImageBitmap|undefined,remoteAt=0,remoteLive=false;

  const ctx:PhoneContext={host,store,gallery,sounds,
    settings:()=>settings,
    updateSettings(patch){settings={...settings,...patch};store.set('settings',settings);applySettings();},
    profile:()=>profile,
    async refreshProfile(){
      try{profile=await api<PhoneProfile>('/phone');profileAt=Date.now();setBadge('highzap',profile.unread);renderHome();}catch{/* Offline API: the phone keeps what it had. */}
      return profile;
    },
    nearby(){
      const world=host.world(),me=owner();
      return Object.values(world?.players??{}).filter(player=>player.connected&&player.id!==me).map(player=>({id:player.id,name:player.displayName,color:player.color}))
        .sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
    },
    contact:id=>profile?.contacts.find(contact=>contact.id===id),
    open:(app,arg)=>openApp(app,arg),
    home:()=>goHome(),
    call:(person,video)=>startCall(person,video),
    banner:(app,title,text,initials)=>banner(app,title,text,initials),
    onPing(listener){listeners.add(listener);return ()=>listeners.delete(listener);},
    setBadge:(app,count)=>setBadge(app,count),
  };

  function applySettings():void {
    const wall=WALLPAPERS[settings.wallpaper];
    screen.classList.toggle('dk',settings.dark);
    const wallNode=$('.ph-wall');
    if(settings.wallpaper.startsWith('photo:'))void gallery.get(settings.wallpaper.slice(6)).then(photo=>{wallNode.style.background=photo?`center/cover url("${gallery.url(photo)}")`:WALLPAPERS.aurora!.css;});
    else wallNode.style.background=(wall??WALLPAPERS.aurora!).css;
    home.classList.toggle('light-wall',!!wall?.light);
    layout();
  }
  function layout():void {
    const fit=Math.min((innerHeight-24)/864,(innerWidth-24)/410),mobile=innerWidth<=760;
    shell.style.setProperty('--phone-scale',String(mobile?Math.min(1,fit):Math.min(fit,SCALE[settings.size]??SCALE.m)));
    shell.classList.toggle('mobile',mobile);
  }
  addEventListener('resize',layout);

  function gameClock():{text:string;phase:string;night:boolean} {
    const hour=gameHour(host.serverNow()),h=Math.floor(hour),m=Math.floor((hour-h)*60);
    return {text:`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`,phase:GAME_PHASES.find(([until])=>hour<until)![1],night:hour<6||hour>=18.5};
  }
  function renderStatus():void {
    const time=gameClock().text,node=$('.ph-time');if(node.textContent!==time)node.textContent=time;
    const clock=home.querySelector('[data-widget="clock"] b');if(clock&&clock.textContent!==time)clock.textContent=time;
  }
  const icon=(app:PhoneApp,label=true)=>`<button class="ph-icon" type="button" data-app="${app.id}" aria-label="${e(app.name)}${badges.get(app.id)?` · ${badges.get(app.id)} novidades`:''}"><span class="ph-glyph" style="--tint:${app.tint}">${uiIcon(app.icon)}${badges.get(app.id)?`<i class="ph-badge">${Math.min(99,badges.get(app.id)!)}</i>`:''}</span>${label?`<span class="ph-label">${e(app.name)}</span>`:''}</button>`;
  function renderHome():void {
    const clock=gameClock(),balance=host.wallet(),unread=profile?.unread??0,today=new Date();
    home.innerHTML=`<div class="ph-widgets">
      <button class="ph-widget ph-w-clock" type="button" data-app="relogio" data-widget="clock"><small>${uiIcon(clock.night?'moon':'sun')} Hora no bar</small><b>${clock.text}</b><span>${clock.phase} · ${today.toLocaleDateString('pt-BR',{weekday:'short',day:'numeric',month:'short'})}</span></button>
      <div class="ph-widget-stack"><button class="ph-widget ph-w-bank" type="button" data-app="highbank"><small>${uiIcon('landmark')} HighBank</small><b>${balance===undefined?'—':balance.toLocaleString('pt-BR')}</b><span>moedas</span></button>
      <button class="ph-widget ph-w-zap" type="button" data-app="highzap"><small>${uiIcon('messageCircle')} Highzap</small><b>${unread}</b><span>${unread===1?'mensagem nova':'mensagens novas'}</span></button></div></div>
      <div class="ph-grid">${APPS.filter(app=>!app.dock).map(app=>icon(app)).join('')}</div>
      <div class="ph-dock">${APPS.filter(app=>app.dock).map(app=>icon(app,false)).join('')}</div>`;
  }
  function setBadge(app:string,count:number):void {
    if((badges.get(app)??0)===count)return;
    if(count>0)badges.set(app,count);else badges.delete(app);
    if(!current)renderHome();
    const total=[...badges.values()].reduce((sum,n)=>sum+n,0),button=root.querySelector('[data-action="phone"]');
    button?.querySelector('.phone-badge')?.remove();
    if(total&&button)button.insertAdjacentHTML('beforeend',`<i class="phone-badge" aria-label="${total} novidades no celular">${Math.min(99,total)}</i>`);
  }

  function openApp(id:string,arg?:unknown):void {
    const app=APPS.find(app=>app.id===id);if(!app)return;
    if(!open)show();
    closeApp();
    const view=document.createElement('section');view.className=`ph-app ph-app-${app.id}`;view.setAttribute('aria-label',app.name);
    appHost.replaceChildren(view);screen.classList.add('in-app');screen.dataset.app=app.id;
    current={app,view};
    const close=app.open(view,ctx,arg);if(close)current.close=close;
  }
  function closeApp():void {
    if(!current)return;
    const leaving=current;current=undefined;
    try{leaving.close?.();}catch(error){console.error(error);}
    leaving.view.remove();screen.classList.remove('in-app');delete screen.dataset.app;
  }
  function goHome():void {closeApp();renderHome();}

  function banner(app:string,title:string,text:string,initials?:string):void {
    if(!settings.dnd)sounds.ding();
    if(!open){host.notice(title,text,initials);return;}
    const target=APPS.find(candidate=>candidate.id===app);
    const node=document.createElement('button');node.type='button';node.className='ph-banner';node.dataset.app=app;
    node.innerHTML=`<span class="ph-glyph" style="--tint:${target?.tint??'#555'}">${uiIcon(target?.icon??'bell')}</span><span><small>${e(target?.name??'')}</small><b>${e(title)}</b><span>${e(text)}</span></span>`;
    banners.replaceChildren(node);setTimeout(()=>node.remove(),4500);
  }

  // Calls.
  function setMic(on:boolean):Promise<boolean> {return host.microphone.set(on).catch(()=>false);}
  async function readyMicrophone():Promise<void> {
    if(host.microphone.active())return;
    const reason=host.microphone.unavailable();
    if(reason){callNote='Sem microfone aqui: você ouve, mas não é ouvido.';renderCall();return;}
    micForCall=true;
    if(!await setMic(true)){callNote='Microfone negado: você ouve, mas não é ouvido.';renderCall();}
  }
  function startCall(person:Person,video=false):void {
    if(call&&call.state!=='ended'){host.error('Você já está em uma ligação.');return;}
    clearTimeout(endTimer);
    call={id:'',state:'outgoing',peerId:person.id,peerName:person.name,peerColor:person.color,startedAt:host.serverNow(),...(video?{video}:{})};
    direction='out';callShown=true;muted=false;callNote='';cancelNext=false;camera.on=video;camera.front=true;
    host.send('phone.call',{to:person.id,...(video?{video}:{})});
    sounds.ringback();renderCall();void readyMicrophone();
    // The room answers at once (ringing or refused); without an answer, the connection is gone.
    const pending=call;
    setTimeout(()=>{if(call===pending)onCall({...pending,state:'ended',reason:'dropped'});},8000);
  }
  function record(view:PhoneCallView,previous:PhoneCallView|undefined):void {
    const kind:RecentCall['kind']=direction==='in'?(previous?.answeredAt?'in':'missed'):'out';
    const name=view.peerName||ctx.contact(view.peerId)?.name||previous?.peerName||'Desconhecido';
    const recents=store.get<RecentCall[]>('recents',[]);
    recents.unshift({peerId:view.peerId,name,color:view.peerColor||previous?.peerColor||'#7c6a9a',kind,at:Date.now(),seconds:previous?.answeredAt?Math.round((host.serverNow()-previous.answeredAt)/1000):0,...(view.video||previous?.video?{video:true}:{})});
    store.set('recents',recents.slice(0,60));
    if(kind==='missed'){
      const missed=store.get<number>('missed',0)+1;store.set('missed',missed);setBadge('telefone',missed);
      banner('telefone','Chamada perdida',name,name[0]);
    }
  }
  function onCall(view:PhoneCallView):void {
    // Hung up before the room answered: the call it then opens is closed at once.
    if(cancelNext&&(view.state==='outgoing'||view.state==='ended')){cancelNext=false;if(view.state==='outgoing')host.send('phone.hangup',{id:view.id});return;}
    const previous=call&&(call.id===view.id||!call.id)?call:undefined;
    if(view.state==='ended'){
      // An end for a call this phone no longer shows (a refused call replaced by a new one, or one already closed) changes nothing.
      if(!call||(call.id&&call.id!==view.id))return;
      clearTimeout(endTimer);sounds.stop();
      if(direction==='out'&&view.reason&&!['hangup','missed'].includes(view.reason))sounds.busy();
      host.setCallPeer(undefined);stopVideo();
      // The microphone goes back to how it was before the call.
      if(micForCall){if(host.microphone.active())void setMic(false);}else if(muted)void setMic(true);
      micForCall=false;muted=false;
      record(view,previous);
      call={...view,peerName:view.peerName||previous?.peerName||'',peerColor:view.peerColor||previous?.peerColor||''};
      renderCall();
      endTimer=setTimeout(()=>{call=undefined;callShown=false;renderCall();},1800);
      return;
    }
    clearTimeout(endTimer);
    call=view;
    if(view.state==='incoming'){
      direction='in';callShown=true;muted=false;callNote='';camera.on=!!view.video;camera.front=true;
      if(!settings.dnd){sounds.ring(settings.ringtone,settings.ringVolume);if(!open)show();}
    }
    if(view.state==='outgoing')callShown=true;
    if(view.state==='active'){sounds.stop();host.setCallPeer(view.peerId);}
    renderCall();
  }
  function callTime():string {return call?.state==='active'&&call.answeredAt?duration((host.serverNow()-call.answeredAt)/1000):'';}
  function callStatus():string {
    if(!call)return '';
    if(call.state==='ended')return call.reason?CALL_END_TEXT[call.reason]:'Chamada encerrada';
    return call.state==='incoming'?(call.video?'Chamada de vídeo':'Chamada no celular'):call.state==='outgoing'?(call.id?(call.video?'Chamada de vídeo…':'Chamando…'):'Discando…'):callTime();
  }
  function renderCall():void {
    const peer=call?{name:call.peerName||ctx.contact(call.peerId)?.name||'Desconhecido',color:call.peerColor||'#7c6a9a'}:undefined;
    screen.classList.toggle('on-call',!!call&&callShown);
    island.classList.toggle('live',!!call&&call.state==='active'&&!callShown);
    island.innerHTML=call?.state==='active'&&!callShown?`<span class="ph-island-call">${uiIcon('phone')}<b data-call-time>${callTime()}</b></span><span class="ph-wave" aria-hidden="true"><i></i><i></i><i></i><i></i></span>`:'';
    island.setAttribute('aria-label',call?.state==='active'?`Em ligação com ${peer!.name}`:'Dynamic Island');
    if(!call||!callShown){callHost.replaceChildren();}
    else {
      const actions=call.state==='incoming'?`<button class="ph-round decline" type="button" data-call="hangup" aria-label="Recusar">${uiIcon('phoneOff')}<small>Recusar</small></button><button class="ph-round accept" type="button" data-call="answer" aria-label="Atender">${uiIcon('phone')}<small>Atender</small></button>`
        :call.state==='ended'?'':`<button class="ph-round soft ${muted?'on':''}" type="button" data-call="mute" aria-pressed="${muted}">${uiIcon(muted?'micOff':'mic')}<small>${muted?'Mudo':'Microfone'}</small></button><button class="ph-round soft ${camera.on?'on':''}" type="button" data-call="camera" aria-pressed="${camera.on}">${uiIcon(camera.on?'video':'videoOff')}<small>Câmera</small></button>${camera.on?`<button class="ph-round soft" type="button" data-call="flip" aria-label="Virar a câmera">${uiIcon('switchCamera')}<small>Virar</small></button>`:''}<button class="ph-round soft" type="button" data-call="hide">${uiIcon('home')}<small>Início</small></button><button class="ph-round decline" type="button" data-call="hangup" aria-label="Encerrar">${uiIcon('phoneOff')}<small>Encerrar</small></button>`;
      // A video call: the other end fills the screen once its frames arrive; your camera sits in the corner.
      const video=call.state==='active'&&(camera.on||remoteLive);
      callHost.innerHTML=`<div class="ph-call ${call.state}${video?' video':''}${remoteLive?' remote':''}" style="--av:${e(peer!.color)}">${video?`<canvas class="ph-call-remote" width="${PHONE.videoFrameWidth}" height="${PHONE.videoFrameHeight}" aria-label="Câmera de ${e(peer!.name)}"></canvas>${camera.on?`<video class="ph-call-self${camera.front?' front':''}" muted playsinline autoplay aria-label="Sua câmera"></video>`:''}`:''}
        <div class="ph-call-top">${avatar(peer!,96)}<h2>${e(peer!.name)}</h2><p data-call-status>${e(callStatus())}</p>${video&&!remoteLive?'<p class="ph-call-note">A câmera do outro lado está desligada.</p>':''}${callNote?`<p class="ph-call-note">${e(callNote)}</p>`:''}</div><div class="ph-call-actions">${actions}</div></div>`;
      if(video){paintRemote();attachPreview();}
    }
    renderPill(peer);
  }
  function renderPill(peer?:{name:string;color:string}):void {
    const visible=!!call&&!!peer&&call.state!=='ended'&&!open;
    pill.hidden=!visible;
    if(!visible)return;
    pill.innerHTML=`<button type="button" class="phone-pill-main" data-pill="open">${avatar(peer!,30)}<span><b>${e(peer!.name)}</b><small data-call-status>${e(callStatus())}</small></span></button>${call!.state==='incoming'?`<button type="button" class="phone-pill-btn accept" data-pill="answer" aria-label="Atender">${uiIcon('phone')}</button>`:''}<button type="button" class="phone-pill-btn decline" data-pill="hangup" aria-label="${call!.state==='incoming'?'Recusar':'Encerrar'}">${uiIcon('phoneOff')}</button>`;
  }
  function answer():void {if(call?.state!=='incoming')return;sounds.stop();void readyMicrophone();host.send('phone.answer',{id:call.id});}
  function paintRemote():void {
    const canvas=callHost.querySelector<HTMLCanvasElement>('.ph-call-remote');
    if(canvas&&remote)canvas.getContext('2d')?.drawImage(remote,0,0,canvas.width,canvas.height);
  }
  /** Your camera in the corner: the game view itself, as the Câmera app's viewfinder. */
  function attachPreview():void {
    const node=callHost.querySelector<HTMLVideoElement>('.ph-call-self');if(!node)return;
    try{preview??=host.canvas.captureStream(15);}catch{return;}
    if(node.srcObject!==preview){node.srcObject=preview;void node.play().catch(()=>{});}
  }
  function setCallSelfie(on:boolean):void {if(on!==selfieForCall){selfieForCall=on;host.setSelfie(on);}}
  /** Eight frames a second while the call screen is in front of you; the JPEG quality follows the frame limit. */
  function videoTick():void {
    const live=call?.state==='active'&&camera.on&&open&&callShown;
    setCallSelfie(!!live&&camera.front);
    if(!live||capturing)return;
    capturing=true;
    void host.capture(PHONE.videoFrameWidth,PHONE.videoFrameHeight,quality).then(async blob=>{
      if(!blob||call?.state!=='active'||!camera.on)return;
      const bytes=new Uint8Array(await blob.arrayBuffer());
      if(bytes.length>PHONE.videoFrameMaxBytes){quality=Math.max(.2,quality-.1);return;}
      if(bytes.length<PHONE.videoFrameMaxBytes*.55&&quality<.75)quality=Math.min(.75,quality+.03);
      host.sendBytes('phone.video',bytes);
    }).catch(()=>{}).finally(()=>{capturing=false;});
  }
  setInterval(videoTick,1000/PHONE.videoFps);
  function stopPreview():void {for(const track of preview?.getTracks()??[])track.stop();preview=undefined;}
  function stopVideo():void {
    setCallSelfie(false);camera.on=false;stopPreview();
    remote?.close();remote=undefined;remoteLive=false;remoteAt=0;
  }
  function hangup():void {
    if(!call||call.state==='ended')return;
    sounds.stop();
    if(call.id)host.send('phone.hangup',{id:call.id});
    else {onCall({...call,state:'ended',reason:'hangup'});cancelNext=true;}
  }
  setInterval(()=>{
    renderStatus();
    if(call?.state==='active'){const time=callTime();for(const node of [...shell.querySelectorAll('[data-call-time],[data-call-status]'),...pill.querySelectorAll('[data-call-status]')])node.textContent=time;}
    // No frame for a while: the other side switched its camera off (or put the phone away).
    if(remoteLive&&performance.now()-remoteAt>1600){remoteLive=false;renderCall();}
    if(!current&&open)home.querySelectorAll<HTMLElement>('.ph-w-bank b').forEach(node=>{const balance=host.wallet();node.textContent=balance===undefined?'—':balance.toLocaleString('pt-BR');});
  },1000);

  shell.addEventListener('pointerdown',()=>sounds.unlock());
  shell.addEventListener('click',event=>{
    const target=event.target as HTMLElement;
    if(settings.keyClicks&&target.closest('button'))sounds.click();
    const control=target.closest<HTMLElement>('[data-call]');
    if(control){
      const action=control.dataset.call;
      if(action==='answer')answer();
      else if(action==='hangup')hangup();
      else if(action==='hide'){callShown=false;renderCall();}
      else if(action==='mute'){muted=!muted;void setMic(!muted);renderCall();}
      else if(action==='camera'){camera.on=!camera.on;if(!camera.on){setCallSelfie(false);stopPreview();}renderCall();}
      else if(action==='flip'){camera.front=!camera.front;renderCall();}
      return;
    }
    if(target.closest('.ph-island')&&call&&call.state!=='ended'){callShown=true;renderCall();return;}
    if(target.closest('[data-phone-home]')){if(callShown&&call?.state==='active'){callShown=false;renderCall();}else goHome();return;}
    const launcher=target.closest<HTMLElement>('[data-app]');
    if(launcher&&(launcher.closest('.ph-home')||launcher.closest('.ph-banners'))){banners.replaceChildren();openApp(launcher.dataset.app!);}
  });
  pill.addEventListener('click',event=>{
    const action=(event.target as HTMLElement).closest<HTMLElement>('[data-pill]')?.dataset.pill;
    if(action==='answer')answer();else if(action==='hangup')hangup();else if(action==='open'){callShown=true;show();}
  });

  function show():void {
    if(open)return;
    open=true;shell.hidden=false;sounds.unlock();
    requestAnimationFrame(()=>shell.classList.add('open'));
    if(!current)renderHome();
    renderCall();
    if(Date.now()-profileAt>15_000)void ctx.refreshProfile();
  }
  function hide():void {
    if(!open)return;
    open=false;shell.classList.remove('open');
    host.setSelfie(false);
    // Put away, the phone keeps a call going (the pill shows it) but closes the app it had open.
    setTimeout(()=>{if(!open){shell.hidden=true;goHome();}},260);
    renderCall();
    (document.activeElement as HTMLElement|null)?.closest('#phone')&&(document.activeElement as HTMLElement).blur();
  }

  function onPing(ping:PhonePing):void {
    let handled=false;
    for(const listener of listeners)if(listener(ping))handled=true;
    const name=ping.fromName||'Alguém';
    if(ping.kind==='zap'){
      void ctx.refreshProfile();
      if(handled)return;
      void api<{threads:Array<{peer:{id:string};last:{text:string;from:string}}>}>('/phone/zap').then(({threads})=>{
        const thread=threads.find(candidate=>candidate.peer.id===ping.from);
        if(thread&&thread.last.from===ping.from)banner('highzap',name,thread.last.text,name[0]);
      }).catch(()=>{});
    }
    if(ping.kind==='gram-like'&&!handled)banner('highgram','Highgram',`${name} curtiu sua foto.`,name[0]);
    if(ping.kind==='gram-follow'&&!handled)banner('highgram','Highgram',`${name} começou a seguir você.`,name[0]);
    if(ping.kind==='gram-comment'&&!handled)banner('highgram','Highgram',`${name} comentou na sua foto.`,name[0]);
    if(ping.kind==='pix')void api<{balance:number;entries:Array<{amount:number;reason:string}>}>('/phone/bank').then(bank=>{
      host.balance(bank.balance);
      const entry=bank.entries.find(item=>item.reason===`pix:in:${ping.from}`);
      if(!handled)banner('highbank','Pix recebido',entry?`${name} te mandou ${entry.amount.toLocaleString('pt-BR')} moedas.`:`${name} te mandou um Pix.`,name[0]);
    }).catch(()=>{});
  }

  return {
    get isOpen(){return open;},
    toggle(){if(open)hide();else show();},
    open(app,arg){if(app)openApp(app,arg);else show();},
    dial(person,video){show();startCall(person,video);},
    refresh(){void ctx.refreshProfile();},
    close:hide,
    call:onCall,
    ping:onPing,
    videoFrame(bytes){
      if(call?.state!=='active')return;
      remoteAt=performance.now();
      void createImageBitmap(new Blob([new Uint8Array(bytes)],{type:'image/jpeg'})).then(bitmap=>{
        if(call?.state!=='active'){bitmap.close();return;}
        remote?.close();remote=bitmap;
        if(!remoteLive){remoteLive=true;renderCall();}else paintRemote();
      }).catch(()=>{});
    },
    disconnected(){if(call&&call.state!=='ended')onCall({...call,state:'ended',reason:'dropped'});},
    enter(){
      settings=store.get('settings',{...DEFAULT_SETTINGS});applySettings();
      badges.clear();setBadge('telefone',store.get<number>('missed',0));
      void ctx.refreshProfile();renderHome();renderStatus();
    },
    leave(){
      if(call&&call.state!=='ended')hangup();
      sounds.stop();host.setCallPeer(undefined);stopVideo();call=undefined;callShown=false;micForCall=false;
      hide();profile=undefined;profileAt=0;renderCall();
    },
  };
}
