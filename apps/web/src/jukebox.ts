import {JUKEBOX_SYSTEMS,TV_SYSTEMS,TV_LABELS,INTERACTABLES,canInteract,mediaGain,nearestMediaSource,jukeboxTime,youtubeVideoId,type JukeboxState,type JukeboxCommand,type MediaSystem,type WorldState} from '@bar/shared';
import {loadYoutubeApi,youtubeError,type YoutubeApi,type YoutubePlayer} from './youtube-player';
import {televisionTransform,type Point} from './engine/television-surface';
type LocalStatus='loading'|'playing'|'paused'|'buffering'|'blocked'|'error'|'ended'|'stopped'|'hidden';
/** One official YouTube player: the jukebox's (sound only) or one screen of a TV group. */
interface Playback {
  screen:string;frame:HTMLDivElement;player?:YoutubePlayer;ready:boolean;revision:number;videoId:string;
  status:LocalStatus;error:string;title:string;lastSync:number;lastVolume:number;onScreen:boolean;timeout?:ReturnType<typeof setTimeout>;
  muted?:boolean;
}
/** A shared source playing in this browser: every screen follows the same state; one player is heard. */
interface Session {state:JukeboxState;system:MediaSystem;players:Playback[];audible:number;gain:number;audibleVolume:number}
interface Hooks {
  send:(type:string,payload:unknown)=>void;now:()=>number;
  /** The screen's corners on the page, or null when no projection exists (the back of the TV). */
  project:(screen:string)=>Point[]|null;
  /** No wall between the camera and the screen, so the pointer may reach its player. */
  clear:(screen:string)=>boolean;
  screen:(screen:string,visible:boolean)=>void;ambient:(suppressed:boolean)=>void;
}
/** What differs between the jukebox and the TVs. Everything else is the same code with separate state. */
interface MediaKind {
  /** Message prefix (`<prefix>.command`, `.ended`, `.result`) and DOM id prefix. */
  prefix:'jukebox'|'tv';
  stateKey:'jukeboxes'|'televisions';
  systems:readonly MediaSystem[];
  volumeKey:string;
  name:string;tooFar:string;intro:string;off:string;offState:string;nothing:string;
}
const JUKEBOX_KIND:MediaKind={prefix:'jukebox',stateKey:'jukeboxes',systems:JUKEBOX_SYSTEMS,volumeKey:'bar:jukebox:volume',
  name:'Jukebox',tooFar:'Chegue mais perto da jukebox.',intro:'Escolha uma música para a jukebox. Só o som toca, sem vídeo. Os controles são compartilhados com o bar; o volume é só seu.',
  off:'Desligar jukebox',offState:'Jukebox desligada',nothing:'Nenhuma música selecionada'};
const TV_KIND:MediaKind={prefix:'tv',stateKey:'televisions',systems:TV_SYSTEMS,volumeKey:'bar:tv:volume',
  name:'TV',tooFar:'Chegue mais perto da TV.',intro:'Escolha um vídeo. Ele passa ao mesmo tempo em todas as TVs deste ambiente. Os controles são compartilhados com o bar; o volume é só seu.',
  off:'Desligar TV',offState:'TV desligada',nothing:'Nenhum vídeo selecionado'};
const labels:Record<LocalStatus,string>={loading:'Carregando vídeo…',playing:'Reproduzindo',paused:'Pausado',buffering:'Carregando vídeo…',blocked:'Clique em Ativar reprodução neste navegador.',error:'Não foi possível reproduzir',ended:'Vídeo encerrado',stopped:'Reprodução interrompida',hidden:'Reprodução local suspensa'};
/** Metres closer another screen must be before the sound moves to it, so walking between two TVs never flips it back and forth. */
const AUDIBLE_HYSTERESIS=1.5;
/** Seconds a screen may drift from the shared timeline before it is corrected. */
const DRIFT_TOLERANCE=1.5;

/** The players sit under the canvas: a TV's shows through its screen's aperture, the jukebox's never shows. */
function playerContainer():HTMLElement {
  let container=document.querySelector<HTMLElement>('#media-players');
  if(!container){container=document.createElement('div');container.id='media-players';document.querySelector('#app')!.append(container);}
  return container;
}

/**
 * The official YouTube players of every active source of this kind. The modal never owns or destroys a player.
 * The jukebox and the TVs are separate instances: own state map, messages, players, panel and volume.
 */
export class MediaController {
  private sessions=new Map<string,Session>();
  private world?:WorldState;
  private localId='';
  private connected=false;
  private panel?:HTMLElement;
  private selected='';
  private pendingRevision:number|undefined;
  private pendingUntil=0;
  private pendingTimer?:ReturnType<typeof setTimeout>;
  private volume=.7;
  /** General volume from the settings, applied on top of this kind's own. */
  private master=1;
  private muted=false;
  private lastTick=0;
  private container=playerContainer();
  private disposed=false;
  private onVisibility=()=>this.setWorld(this.world,this.localId,this.connected);
  private pointer={x:-1,y:-1};
  private onPointer=(event:PointerEvent)=>{if(event.buttons)return;this.pointer={x:event.clientX,y:event.clientY};};
  /** A browser that blocked autoplay accepts it after any click or key press in the game (click, so buttons still get theirs). */
  private onGesture=()=>{for(const session of this.sessions.values())for(const p of session.players)if(p.status==='blocked'){p.revision=-1;this.apply(session,p);}};
  constructor(private kind:MediaKind,private hooks:Hooks,private apiLoader:()=>Promise<YoutubeApi>=loadYoutubeApi) {
    document.addEventListener('visibilitychange',this.onVisibility);
    window.addEventListener('pointermove',this.onPointer);
    window.addEventListener('click',this.onGesture,true);window.addEventListener('keydown',this.onGesture,true);
    try{const stored=Number(localStorage.getItem(kind.volumeKey));if(localStorage.getItem(kind.volumeKey)!==null&&Number.isFinite(stored))this.volume=Math.max(0,Math.min(1,stored));}catch{}
  }
  private states():Record<string,JukeboxState>|undefined {return this.world?.[this.kind.stateKey];}
  private id(name:string):string {return `#${this.kind.prefix}-${name}`;}
  setWorld(world:WorldState|undefined,localId:string,connected:boolean):void {
    this.world=world;this.localId=localId;this.connected=connected;
    for(const [id,session] of this.sessions){const state=this.states()?.[id];if(!state||state.status==='off')this.remove(id);else session.state=state;}
    if(world&&connected&&!document.hidden)for(const state of Object.values(this.states()??{}))if(state.status!=='off'&&state.videoId&&!this.sessions.has(state.id))void this.create(state);
    this.reconcile();
  }
  private system(id:string):MediaSystem|undefined {return this.kind.systems.find(s=>s.id===id);}
  private async create(state:JukeboxState):Promise<void> {
    const system=this.system(state.id);if(!system)return;
    const session:Session={state,system,players:[],audible:0,gain:0,audibleVolume:0};
    // The jukebox has one hidden player for its sound; a TV group has one player per screen.
    for(const screen of system.screens.length?system.screens:['']){
      const frame=document.createElement('div');frame.className=`media-player ${this.kind.prefix}-player${screen?'':' audio-only'}`;frame.dataset.media=state.id;if(screen)frame.dataset.screen=screen;
      frame.append(document.createElement('div'));this.container.append(frame);
      session.players.push({screen,frame,ready:false,revision:-1,videoId:'',status:'loading',error:'',title:'',lastSync:0,lastVolume:0,onScreen:false});
    }
    this.sessions.set(state.id,session);this.updateActive();this.chooseAudible(session,true);
    try {
      const api=await this.apiLoader();if(this.disposed||this.sessions.get(state.id)!==session)return;
      for(const p of session.players)this.mount(api,session,p);
    }catch(error){if(this.sessions.get(state.id)!==session)return;for(const p of session.players){p.status='error';p.error=error instanceof Error?error.message:'Falha de conexão com o YouTube.';}this.renderPanel();}
  }
  private mount(api:YoutubeApi,session:Session,p:Playback):void {
    const label=p.screen?TV_LABELS[p.screen]??session.system.label:session.system.label;
    p.player=new api.Player(p.frame.firstElementChild as HTMLElement,{width:640,height:360,host:'https://www.youtube.com',playerVars:{playsinline:1,controls:1,autoplay:0,rel:0,origin:location.origin},events:{
      onReady:({target})=>{
        if(!this.current(session,p)){target.destroy();return;}p.player=target;p.ready=true;
        const iframe=target.getIframe();iframe.title=`${label} do Boteco · YouTube`;iframe.referrerPolicy='strict-origin-when-cross-origin';iframe.setAttribute('allow','autoplay; encrypted-media; picture-in-picture; fullscreen');
        if(!p.screen)iframe.tabIndex=-1;
        this.apply(session,p);this.renderPanel();
      },
      onStateChange:({data})=>this.playerState(session,p,data),
      onError:({data})=>{if(!this.current(session,p))return;p.error=youtubeError(data);p.status='error';clearTimeout(p.timeout);this.renderPanel();},
      onAutoplayBlocked:()=>{if(!this.current(session,p))return;p.status='blocked';clearTimeout(p.timeout);this.renderPanel();}
    }});
    p.timeout=setTimeout(()=>{if(!p.ready&&this.current(session,p)){p.status='error';p.error='O player não respondeu. Verifique sua conexão e tente novamente.';this.renderPanel();}},20000);
  }
  private current(session:Session,p:Playback):boolean {return this.sessions.get(session.state.id)===session&&session.players.includes(p);}
  private playerState(session:Session,p:Playback,state:number):void {
    if(!this.current(session,p))return;
    // Old events from a rapidly replaced video cannot change the new selection.
    const data=p.player?.getVideoData?.();if(data?.video_id&&data.video_id!==session.state.videoId)return;
    if(data?.title)p.title=data.title.slice(0,200);
    p.status=({[-1]:'loading',0:'ended',1:'playing',2:'paused',3:'buffering',5:'paused'} as Record<number,LocalStatus>)[state]??'loading';
    if(state===1||state===2||state===0||state===5)clearTimeout(p.timeout);
    if(state===1){p.error='';if(document.hidden||!this.connected)p.player?.pauseVideo();}
    const duration=p.player?.getDuration()??0;
    // One report per source: the player being heard speaks for the other screens.
    if(state===0&&p===session.players[session.audible]&&session.state.status==='playing'&&Number.isFinite(duration)&&duration>0&&duration<=86400)this.hooks.send(`${this.kind.prefix}.ended`,{id:session.state.id,revision:session.state.revision,videoId:session.state.videoId,duration});
    this.renderPanel();
  }
  private apply(session:Session,p:Playback):void {
    if(!p.ready||!p.player)return;
    const state=session.state,target=jukeboxTime(state,this.hooks.now());
    if(document.hidden||!this.connected){if(p.status!=='hidden')p.player.pauseVideo();p.status='hidden';p.revision=-1;return;}
    if(p.revision===state.revision)return;
    p.revision=state.revision;p.lastSync=performance.now();p.error='';
    const playing=state.status==='playing';
    if(p.videoId!==state.videoId){
      p.videoId=state.videoId;p.title='';p.status='loading';this.applyVolume(session,true);
      if(playing)p.player.loadVideoById({videoId:p.videoId,startSeconds:target});else p.player.cueVideoById({videoId:p.videoId,startSeconds:target});
    } else {
      p.player.seekTo(target,true);
      if(playing){p.status='loading';p.player.playVideo();}else{p.player.pauseVideo();p.status=state.status==='stopped'?'stopped':state.status==='ended'?'ended':'paused';}
    }
    clearTimeout(p.timeout);
    if(playing)p.timeout=setTimeout(()=>{if(p.status==='loading'||p.status==='buffering'){p.status='error';p.error='O vídeo demorou para carregar. Verifique a conexão e tente novamente.';this.renderPanel();}},16000);
  }
  private reconcile():void {
    for(const session of this.sessions.values())for(const p of session.players)this.apply(session,p);
    if(this.pendingRevision!==undefined&&(this.states()?.[this.selected]?.revision!==this.pendingRevision||Date.now()>this.pendingUntil))this.pendingRevision=undefined;
    this.renderPanel();
  }
  frame():void {
    const now=performance.now(),dt=Math.min(.25,(now-this.lastTick)/1000||.05),periodic=now-this.lastTick>=100;
    if(periodic)this.lastTick=now;
    let pointerOnTv=false;
    for(const session of this.sessions.values()) {
      for(const p of session.players){
        if(!p.screen)continue;
        // The picture never leaves its screen: without a projection (seen from behind) it is simply not drawn.
        const points=!document.hidden&&this.connected?this.hooks.project(p.screen):null;
        if(points){
          p.frame.style.transform=televisionTransform(points);
          if(!p.onScreen){p.onScreen=true;p.frame.style.visibility='';this.hooks.screen(p.screen,true);}
          if(!pointerOnTv&&points.every((point,i)=>{const next=points[(i+1)%4]!;return (next.x-point.x)*(this.pointer.y-point.y)-(next.y-point.y)*(this.pointer.x-point.x)>=0;}))pointerOnTv=this.hooks.clear(p.screen);
        }else if(p.onScreen){p.onScreen=false;p.frame.style.visibility='hidden';this.hooks.screen(p.screen,false);}
      }
      if(periodic){
        this.chooseAudible(session);this.applyVolume(session,false,dt);
        // Keep every screen on the shared timeline, without continuously seeking during buffering, ads or errors.
        for(const p of session.players)if(p.ready&&p.player&&p.status==='playing'&&session.state.status==='playing'&&now-p.lastSync>5000&&!document.hidden&&this.connected){
          const target=jukeboxTime(session.state,this.hooks.now()),duration=p.player.getDuration();
          if(duration>0&&target<duration-2&&Math.abs(p.player.getCurrentTime()-target)>DRIFT_TOLERANCE)p.player.seekTo(target,true);
          p.lastSync=now;
        }
      }
    }
    // A paused/failed selection must not unexpectedly restart the old procedural music.
    this.hooks.ambient(this.sessions.size>0);
    if(this.kind.prefix==='tv'){const canvas=document.querySelector<HTMLCanvasElement>('#world');if(canvas)canvas.style.pointerEvents=pointerOnTv?'none':'';}
    if(periodic)this.renderPanel();
  }
  /** The sound of a TV group comes from the screen closest to the listener. */
  private chooseAudible(session:Session,immediate=false):void {
    const self=this.world?.players[this.localId];if(!self||session.players.length<2)return;
    const nearest=nearestMediaSource(session.system,self),current=session.system.sources[session.audible]!;
    const currentDistance=Math.hypot(self.x-current.x,(self.y??0)-current.y,self.z-current.z);
    if(nearest.index!==session.audible&&(immediate||nearest.distance<currentDistance-AUDIBLE_HYSTERESIS)){session.audible=nearest.index;this.applyVolume(session,true);}
  }
  private applyVolume(session:Session,immediate=false,dt=.1):void {
    const self=this.world?.players[this.localId],system=session.system;
    // Each source fades with the listener's distance to that source only.
    const target=self&&this.connected&&!document.hidden&&!this.muted?mediaGain(self,system)*this.volume*this.master:0;
    session.gain=immediate?target:session.gain+(target-session.gain)*(1-Math.exp(-dt/system.audio.smoothingSeconds));
    // Hard silence beyond range or on mute; smoothing must never leave a tail outside the radius.
    if(target===0)session.gain=0;
    const value=Math.round(session.gain*100);session.audibleVolume=value;
    session.players.forEach((p,i)=>{
      if(!p.ready||!p.player)return;
      const heard=i===session.audible?value:0;
      if(heard===0){if((p.player.isMuted?.()??p.muted)!==true)p.player.mute();p.muted=true;}
      else {if((p.player.getVolume?.()??p.lastVolume)!==heard)p.player.setVolume(heard);if(p.muted!==false)p.player.unMute();p.muted=false;}
      p.lastVolume=heard;
    });
  }
  /** This kind's own volume (also set by its panel), remembered in this browser. */
  get ownVolume():number {return this.volume;}
  setVolume(value:number):void {
    if(!Number.isFinite(value))return;
    this.volume=Math.max(0,Math.min(1,value));this.muted=false;
    try{localStorage.setItem(this.kind.volumeKey,String(this.volume));}catch{}
    for(const session of this.sessions.values())this.applyVolume(session,true);this.renderPanel();
  }
  setMaster(value:number):void {if(!Number.isFinite(value))return;this.master=Math.max(0,Math.min(1,value));for(const session of this.sessions.values())this.applyVolume(session,true);}
  setMuted(value:boolean):void {this.muted=value;for(const session of this.sessions.values())this.applyVolume(session,true);this.renderPanel();}
  get soundEnabled():boolean {return this.sessions.size>0&&!this.muted;}
  /** Length in seconds of the video this source plays, from the player being heard (0 while unknown). */
  duration(id:string):number {
    const session=this.sessions.get(id),p=session?.players[session.audible],value=p?.ready?p.player?.getDuration()??0:0;
    return Number.isFinite(value)&&value>0?value:0;
  }
  get selectedSystem():MediaSystem|undefined {return this.system(this.selected);}
  selectedSystemLabel(id:string):string {return (this.system(id)?.label??this.kind.name).toUpperCase();}
  panelHtml(id:string):string {
    this.selected=id;
    const k=this.kind,pre=k.prefix,tv=pre==='tv',watch=tv?`<button type="button" class="button secondary" data-action="watch-tv" data-tv="${id}">Assistir na TV</button>`:'';
    return `<div class="jukebox-panel media-panel ${pre}-panel" data-capture-input><p class="modal-description">${k.intro}</p><form id="${pre}-form"><label>Link do YouTube<input id="${pre}-url" name="url" type="url" required maxlength="2048" placeholder="https://www.youtube.com/watch?v=…" autocomplete="off"></label><button class="button primary" type="submit">Tocar</button></form><p id="${pre}-title" class="jukebox-title"></p><p id="${pre}-state" role="status"></p><p id="${pre}-error" class="form-message error" role="alert" hidden></p><div class="jukebox-controls"><button type="button" class="button secondary" data-media="pause">Pausar</button><button type="button" class="button secondary" data-media="resume">Continuar</button><button type="button" class="button secondary" data-media="stop">Parar</button><button type="button" class="button secondary" data-media="off">${k.off}</button></div><label>Volume ${tv?'das TVs':'da jukebox'} neste navegador <output id="${pre}-volume-value"></output><input id="${pre}-volume" type="range" min="0" max="100" step="1" value="${Math.round(this.volume*100)}"></label><p id="${pre}-distance" class="fine-print"></p><div class="jukebox-controls"><button type="button" class="button primary" data-media-local="activate">Ativar reprodução neste navegador</button>${watch}<button type="button" class="text-button" data-media-local="retry">Tentar conectar novamente</button></div><p class="fine-print">YouTube · volume pela distância até ${tv?'a TV mais próxima':'a jukebox'}. A disponibilidade depende do vídeo e do navegador.</p></div>`;
  }
  attachPanel(root:HTMLElement):void {
    this.panel=root;
    root.querySelector<HTMLFormElement>(this.id('form'))!.onsubmit=event=>{event.preventDefault();event.stopPropagation();this.command('play',root.querySelector<HTMLInputElement>(this.id('url'))!.value);};
    root.querySelector<HTMLInputElement>(this.id('volume'))!.oninput=event=>{
      const value=Number((event.target as HTMLInputElement).value);if(Number.isFinite(value))this.setVolume(value/100);
    };
    root.querySelectorAll<HTMLButtonElement>('[data-media]').forEach(button=>button.onclick=()=>this.command(button.dataset.media as JukeboxCommand['action']));
    root.querySelector<HTMLButtonElement>('[data-media-local=activate]')!.onclick=()=>{
      const session=this.sessions.get(this.selected);if(!session)return;
      this.applyVolume(session,true);for(const p of session.players){p.revision=-1;this.apply(session,p);}
    };
    root.querySelector<HTMLButtonElement>('[data-media-local=retry]')!.onclick=()=>{
      const state=this.states()?.[this.selected];if(!state||state.status==='off')return;this.remove(state.id);void this.create(state);
    };
    this.renderPanel();
  }
  detachPanel():void {this.panel=undefined;this.pendingRevision=undefined;clearTimeout(this.pendingTimer);}
  command(action:JukeboxCommand['action'],url?:string):void {
    if(this.pendingRevision!==undefined)return;
    const state=this.states()?.[this.selected],self=this.world?.players[this.localId],objects=INTERACTABLES.filter(o=>o.media===this.selected);
    if(!state||!self||!objects.length||!this.connected)return;
    if(!objects.some(object=>canInteract(object,self))){this.showError(this.kind.tooFar);return;}
    if(action==='play'&&!youtubeVideoId(url?.trim()??'')){this.showError('Cole um link válido de vídeo do YouTube.');return;}
    const error=this.panel?.querySelector<HTMLElement>(this.id('error'));if(error){error.hidden=true;delete error.dataset.playerError;}
    this.pendingRevision=state.revision;this.pendingUntil=Date.now()+5000;
    this.hooks.send(`${this.kind.prefix}.command`,{id:state.id,revision:state.revision,action,...(url?{url:url.trim()}:{})});this.renderPanel();
    clearTimeout(this.pendingTimer);this.pendingTimer=setTimeout(()=>{if(this.pendingRevision!==undefined){this.pendingRevision=undefined;this.showError(`${this.kind.name==='TV'?'A TV':'A jukebox'} não confirmou o comando. Tente novamente.`);this.renderPanel();}},5100);
  }
  /** A server error while this panel waits for its own command; other errors are not this panel's. */
  reject(message:string):boolean {if(this.panel&&this.pendingRevision!==undefined){this.pendingRevision=undefined;clearTimeout(this.pendingTimer);this.showError(message);this.renderPanel();return true;}return false;}
  private showError(text:string):void {const error=this.panel?.querySelector<HTMLElement>(this.id('error'));if(error){error.textContent=text;error.hidden=false;}}
  private renderPanel():void {
    const root=this.panel;if(!root?.isConnected)return;
    const state=this.states()?.[this.selected],session=this.sessions.get(this.selected),pending=this.pendingRevision!==undefined,system=this.system(this.selected);
    // The panel reports the player being heard, and the first failure of any screen.
    const p=session?.players[session.audible],failed=session?.players.find(player=>player.error);
    const set=(id:string,value:string)=>{const element=root.querySelector<HTMLElement>(this.id(id));if(element&&element.textContent!==value)element.textContent=value;};
    set('title',p?.title||(state?.videoId?`Vídeo ${state.videoId}`:this.kind.nothing));
    const shared=state?.status==='playing'?'Bar: reprodução solicitada':state?.status==='paused'?'Bar: pausado':state?.status==='stopped'?'Bar: interrompido':state?.status==='ended'?'Bar: encerrado':this.kind.offState;
    set('state',pending?'Enviando comando…':p?`${shared} · Neste navegador: ${labels[p.status]}`:shared);
    root.querySelector<HTMLButtonElement>(`${this.id('form')} button`)!.disabled=pending||!this.connected;
    root.querySelectorAll<HTMLButtonElement>('[data-media]').forEach(b=>b.disabled=pending||!this.connected||(b.dataset.media!=='off'&&!state?.videoId)||(b.dataset.media==='pause'&&state?.status!=='playing'));
    const activate=root.querySelector<HTMLButtonElement>('[data-media-local=activate]')!;activate.hidden=!(session?.players.some(player=>['blocked','paused','hidden'].includes(player.status))&&state?.status==='playing');
    root.querySelector<HTMLElement>('[data-media-local=retry]')!.hidden=!failed;
    set('volume-value',`${Math.round(this.volume*100)}%${this.muted?' · silenciado':''}`);
    set('distance',`Volume recebido agora: ${session?.audibleVolume??0}%. Alcance de ${system?.audio.maxDistance??0} m. Fechar esta janela mantém a reprodução.`);
    const error=root.querySelector<HTMLElement>(this.id('error'))!;
    if(failed){this.showError(failed.error);error.dataset.playerError='true';}
    else if(!pending&&error.dataset.playerError){error.hidden=true;delete error.dataset.playerError;}
  }
  private remove(id:string):void {
    const session=this.sessions.get(id);if(!session)return;this.sessions.delete(id);
    for(const p of session.players){clearTimeout(p.timeout);p.player?.destroy();p.frame.remove();if(p.screen)this.hooks.screen(p.screen,false);}
    this.updateActive();
  }
  /** While a TV plays, the vignette must not darken its picture. */
  private updateActive():void {document.body.classList.toggle('media-active',!!this.container.querySelector('.tv-player'));}
  reset():void {for(const id of [...this.sessions.keys()])this.remove(id);this.world=undefined;this.connected=false;this.detachPanel();this.hooks.ambient(false);if(this.kind.prefix==='tv'){const canvas=document.querySelector<HTMLCanvasElement>('#world');if(canvas)canvas.style.pointerEvents='';}}
  destroy():void {
    this.disposed=true;this.reset();document.removeEventListener('visibilitychange',this.onVisibility);window.removeEventListener('pointermove',this.onPointer);
    window.removeEventListener('click',this.onGesture,true);window.removeEventListener('keydown',this.onGesture,true);
    if(!this.container.children.length)this.container.remove();
  }
  telemetry():unknown {
    return [...this.sessions.values()].flatMap(session=>session.players.map((p,i)=>({id:session.state.id,kind:this.kind.prefix,screen:p.screen,videoId:p.videoId,status:p.status,
      mode:p.screen?(p.onScreen?'tv':'hidden'):'audio',audible:i===session.audible,volume:i===session.audible?session.audibleVolume:0,revision:p.revision,title:p.title,error:p.error,ready:p.ready,currentTime:p.ready?p.player?.getCurrentTime():0})));
  }
}
/** The jukebox: music only, with its own controls and volume. It never touches a TV. */
export class JukeboxController extends MediaController {
  constructor(hooks:Hooks,apiLoader?:()=>Promise<YoutubeApi>){super(JUKEBOX_KIND,hooks,apiLoader);}
}
/** The map's TV groups: every screen of a group shows the group's video, with controls separate from the jukebox. */
export class TelevisionController extends MediaController {
  constructor(hooks:Hooks,apiLoader?:()=>Promise<YoutubeApi>){super(TV_KIND,hooks,apiLoader);}
}
