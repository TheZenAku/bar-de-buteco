import {JUKEBOX_SYSTEMS,TV_SYSTEMS,INTERACTABLES,canInteract,jukeboxGain,jukeboxTime,youtubeVideoId,type JukeboxState,type JukeboxCommand,type MediaSystem,type WorldState} from '@bar/shared';
import {loadYoutubeApi,youtubeError,type YoutubeApi,type YoutubePlayer} from './youtube-player';
import {televisionTransform,type Point} from './engine/television-surface';
type LocalStatus='loading'|'playing'|'paused'|'buffering'|'blocked'|'error'|'ended'|'stopped'|'hidden';
interface Playback {
  state:JukeboxState;frame:HTMLDivElement;dock:HTMLElement;player?:YoutubePlayer;ready:boolean;revision:number;videoId:string;
  status:LocalStatus;error:string;title:string;lastSync:number;lastVolume:number;gain:number;audibleVolume:number;mode:'tv'|'dock';timeout?:ReturnType<typeof setTimeout>;
  muted?:boolean;
}
interface Hooks {
  send:(type:string,payload:unknown)=>void;now:()=>number;
  project:(id:string)=>Point[]|null;screen:(id:string,visible:boolean)=>void;
  notice:(text:string,error?:boolean)=>void;ambient:(suppressed:boolean)=>void;
}
/** What differs between the jukebox and the TVs. Everything else is the same code with separate state. */
interface MediaKind {
  /** Message prefix (`<prefix>.command`, `.ended`, `.result`) and DOM id prefix. */
  prefix:'jukebox'|'tv';
  stateKey:'jukeboxes'|'televisions';
  systems:readonly MediaSystem[];
  volumeKey:string;
  /** Whether the picture is drawn on a TV screen of the map; the jukebox only has its visible player card. */
  screen:boolean;
  name:string;tooFar:string;intro:string;off:string;offState:string;nothing:string;dockNote:string;
}
const JUKEBOX_KIND:MediaKind={prefix:'jukebox',stateKey:'jukeboxes',systems:JUKEBOX_SYSTEMS,volumeKey:'bar:jukebox:volume',screen:false,
  name:'Jukebox',tooFar:'Chegue mais perto da jukebox.',intro:'Escolha uma música para a jukebox. Os controles são compartilhados com o bar; o volume é só seu. A TV tem controles próprios.',
  off:'Desligar jukebox',offState:'Jukebox desligada',nothing:'Nenhuma música selecionada',dockNote:'Player da jukebox. O volume acompanha sua distância até ela.'};
const TV_KIND:MediaKind={prefix:'tv',stateKey:'televisions',systems:TV_SYSTEMS,volumeKey:'bar:tv:volume',screen:true,
  name:'TV',tooFar:'Chegue mais perto da TV.',intro:'Escolha um vídeo para esta TV. Os controles são compartilhados com o bar; o volume é só seu. A jukebox tem controles próprios.',
  off:'Desligar TV',offState:'TV desligada',nothing:'Nenhum vídeo selecionado',dockNote:'Player visível enquanto você explora. O volume acompanha sua distância até a TV.'};
const labels:Record<LocalStatus,string>={loading:'Carregando vídeo…',playing:'Reproduzindo',paused:'Pausado',buffering:'Carregando vídeo…',blocked:'Clique em Ativar reprodução neste navegador.',error:'Não foi possível reproduzir',ended:'Vídeo encerrado',stopped:'Reprodução interrompida',hidden:'Reprodução local suspensa'};

/** Both kinds share one container of player cards; cards not drawn on a TV are stacked in the corner. */
function dockContainer():HTMLElement {
  let docks=document.querySelector<HTMLElement>('#tv-docks');
  if(!docks){docks=document.createElement('div');docks.id='tv-docks';document.querySelector('#app')!.append(docks);}
  return docks;
}
function stackDocks():void {
  let offset=0;
  for(const dock of document.querySelectorAll<HTMLElement>('#tv-docks > .tv-dock')){
    if(dock.classList.contains('on-surface')){dock.style.removeProperty('--dock-offset');continue;}
    dock.style.setProperty('--dock-offset',`${offset}px`);offset+=dock.offsetHeight+8;
  }
}

/**
 * One official YouTube player per active source of this kind. The modal never owns or destroys a player.
 * The jukebox and the TVs are separate instances: own state map, messages, players, panel and volume.
 */
export class MediaController {
  private sessions=new Map<string,Playback>();
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
  private docks=dockContainer();
  private disposed=false;
  private onVisibility=()=>this.setWorld(this.world,this.localId,this.connected);
  private pointer={x:-1,y:-1};
  private onPointer=(event:PointerEvent)=>{if(event.buttons)return;this.pointer={x:event.clientX,y:event.clientY};};
  constructor(private kind:MediaKind,private hooks:Hooks,private apiLoader:()=>Promise<YoutubeApi>=loadYoutubeApi) {
    document.addEventListener('visibilitychange',this.onVisibility);
    window.addEventListener('pointermove',this.onPointer);
    try{const stored=Number(localStorage.getItem(kind.volumeKey));if(localStorage.getItem(kind.volumeKey)!==null&&Number.isFinite(stored))this.volume=Math.max(0,Math.min(1,stored));}catch{}
  }
  private states():Record<string,JukeboxState>|undefined {return this.world?.[this.kind.stateKey];}
  private id(name:string):string {return `#${this.kind.prefix}-${name}`;}
  setWorld(world:WorldState|undefined,localId:string,connected:boolean):void {
    this.world=world;this.localId=localId;this.connected=connected;
    for(const [id,p] of this.sessions){const state=this.states()?.[id];if(!state||state.status==='off')this.remove(id);else p.state=state;}
    if(world&&connected&&!document.hidden)for(const state of Object.values(this.states()??{}))if(state.status!=='off'&&state.videoId&&!this.sessions.has(state.id))void this.create(state);
    this.reconcile();
  }
  private system(id:string):MediaSystem|undefined {return this.kind.systems.find(s=>s.id===id);}
  private async create(state:JukeboxState):Promise<void> {
    document.body.classList.add('media-active');
    const system=this.system(state.id);
    const frame=document.createElement('div');frame.className=`media-player ${this.kind.prefix}-player`;frame.dataset.media=state.id;
    const mount=document.createElement('div');frame.append(mount);
    const dock=document.createElement('section');dock.className=`tv-dock ${this.kind.prefix}-dock`;dock.dataset.media=state.id;dock.setAttribute('aria-label',`${system?.label??this.kind.name} · YouTube`);
    const header=document.createElement('header');header.textContent=`${system?.label??this.kind.name} · YouTube`;
    const activate=document.createElement('button');activate.type='button';activate.textContent='Ativar';activate.setAttribute('aria-label',`Ativar ${system?.label??this.kind.name} neste navegador`);activate.onclick=()=>{const current=this.sessions.get(state.id);if(current?.player){current.revision=-1;this.apply(current);}};header.append(activate);
    const mute=document.createElement('button');mute.type='button';mute.textContent='Silenciar';mute.setAttribute('aria-label',`Silenciar ${system?.label??this.kind.name} neste navegador`);mute.onclick=()=>{this.setMuted(!this.muted);mute.textContent=this.muted?'Ativar som':'Silenciar';};header.append(mute);
    const note=document.createElement('p');note.textContent=this.kind.dockNote;
    dock.append(header,frame,note);this.docks.append(dock);
    const p:Playback={state,frame,dock,ready:false,revision:-1,videoId:'',status:'loading',error:'',title:'',lastSync:0,lastVolume:0,gain:0,audibleVolume:0,mode:'dock'};
    this.sessions.set(state.id,p);stackDocks();
    try {
      const api=await this.apiLoader();if(this.disposed||this.sessions.get(state.id)!==p)return;
      p.player=new api.Player(mount,{width:640,height:360,host:'https://www.youtube.com',playerVars:{playsinline:1,controls:1,autoplay:0,rel:0,origin:location.origin},events:{
        onReady:({target})=>{
          if(this.sessions.get(state.id)!==p){target.destroy();return;}p.player=target;p.ready=true;
          const iframe=target.getIframe();iframe.title=`${system?.label??this.kind.name} do Boteco · YouTube`;iframe.referrerPolicy='strict-origin-when-cross-origin';iframe.setAttribute('allow','autoplay; encrypted-media; picture-in-picture; fullscreen');
          this.apply(p);this.renderPanel();
        },
        onStateChange:({data})=>this.playerState(p,data),
        onError:({data})=>{if(this.sessions.get(state.id)!==p)return;p.error=youtubeError(data);p.status='error';clearTimeout(p.timeout);this.hooks.notice(p.error,true);this.renderPanel();},
        onAutoplayBlocked:()=>{if(this.sessions.get(state.id)!==p)return;p.status='blocked';clearTimeout(p.timeout);this.renderPanel();}
      }});
      p.timeout=setTimeout(()=>{if(!p.ready&&this.sessions.get(state.id)===p){p.status='error';p.error='O player não respondeu. Verifique sua conexão e tente novamente.';this.renderPanel();}},20000);
    }catch(error){if(this.sessions.get(state.id)!==p)return;p.status='error';p.error=error instanceof Error?error.message:'Falha de conexão com o YouTube.';this.renderPanel();}
  }
  private playerState(p:Playback,state:number):void {
    if(this.sessions.get(p.state.id)!==p)return;
    // Old events from a rapidly replaced video cannot change the new selection.
    const data=p.player?.getVideoData?.();if(data?.video_id&&data.video_id!==p.state.videoId)return;
    if(data?.title)p.title=data.title.slice(0,200);
    p.status=({[-1]:'loading',0:'ended',1:'playing',2:'paused',3:'buffering',5:'paused'} as Record<number,LocalStatus>)[state]??'loading';
    if(state===1||state===2||state===0||state===5)clearTimeout(p.timeout);
    if(state===1){p.error='';if(document.hidden||!this.connected)p.player?.pauseVideo();}
    const duration=p.player?.getDuration()??0;
    if(state===0&&p.state.status==='playing'&&Number.isFinite(duration)&&duration>0&&duration<=86400)this.hooks.send(`${this.kind.prefix}.ended`,{id:p.state.id,revision:p.state.revision,videoId:p.state.videoId,duration});
    this.renderPanel();
  }
  private apply(p:Playback):void {
    if(!p.ready||!p.player)return;
    const target=jukeboxTime(p.state,this.hooks.now());
    if(document.hidden||!this.connected){if(p.status!=='hidden')p.player.pauseVideo();p.status='hidden';p.revision=-1;return;}
    if(p.revision===p.state.revision)return;
    p.revision=p.state.revision;p.lastSync=performance.now();p.error='';
    const playing=p.state.status==='playing';
    if(p.videoId!==p.state.videoId){
      p.videoId=p.state.videoId;p.title='';p.status='loading';this.applyVolume(p,true);
      if(playing)p.player.loadVideoById({videoId:p.videoId,startSeconds:target});else p.player.cueVideoById({videoId:p.videoId,startSeconds:target});
    } else {
      p.player.seekTo(target,true);
      if(playing){p.status='loading';p.player.playVideo();}else{p.player.pauseVideo();p.status=p.state.status==='stopped'?'stopped':p.state.status==='ended'?'ended':'paused';}
    }
    clearTimeout(p.timeout);
    if(playing)p.timeout=setTimeout(()=>{if(p.status==='loading'||p.status==='buffering'){p.status='error';p.error='O vídeo demorou para carregar. Verifique a conexão e tente novamente.';this.renderPanel();}},16000);
  }
  private reconcile():void {
    for(const p of this.sessions.values())this.apply(p);
    if(this.pendingRevision!==undefined&&(this.states()?.[this.selected]?.revision!==this.pendingRevision||Date.now()>this.pendingUntil))this.pendingRevision=undefined;
    this.renderPanel();
  }
  frame():void {
    const now=performance.now(),dt=Math.min(.25,(now-this.lastTick)/1000||.05),periodic=now-this.lastTick>=100;
    if(periodic)this.lastTick=now;
    let pointerOnTv=false,moved=false;
    for(const p of this.sessions.values()) {
      const points=this.kind.screen&&p.state.tvId&&!document.hidden&&this.connected?this.hooks.project(p.state.tvId):null;
      // A visible minimum-size card is essential when the physical screen is too small or behind a wall.
      if(points){
        if(p.mode!=='tv'){p.dock.classList.add('on-surface');p.mode='tv';moved=true;}
        p.frame.style.transform=televisionTransform(points);this.hooks.screen(p.state.tvId,true);
        pointerOnTv||=points.every((point,i)=>{const next=points[(i+1)%4];return (next.x-point.x)*(this.pointer.y-point.y)-(next.y-point.y)*(this.pointer.x-point.x)>=0;});
      }else{
        if(this.kind.screen&&p.state.tvId)this.hooks.screen(p.state.tvId,false);
        if(p.mode!=='dock'){p.dock.classList.remove('on-surface');p.mode='dock';p.frame.style.transform='';moved=true;}
      }
      if(periodic){
        this.applyVolume(p,false,dt);
        // Correct coarse drift, without continuously seeking during buffering, ads or errors.
        if(p.ready&&p.player&&p.status==='playing'&&p.state.status==='playing'&&now-p.lastSync>10000&&!document.hidden&&this.connected){
          const target=jukeboxTime(p.state,this.hooks.now()),duration=p.player.getDuration();
          if(duration>0&&target<duration-2&&Math.abs(p.player.getCurrentTime()-target)>3)p.player.seekTo(target,true);
          p.lastSync=now;
        }
      }
    }
    if(moved)stackDocks();
    // A paused/failed selection must not unexpectedly restart the old procedural music.
    this.hooks.ambient(this.sessions.size>0);
    if(this.kind.screen){const canvas=document.querySelector<HTMLCanvasElement>('#world');if(canvas)canvas.style.pointerEvents=pointerOnTv?'none':'';}
    if(periodic)this.renderPanel();
  }
  private applyVolume(p:Playback,immediate=false,dt=.1):void {
    const self=this.world?.players[this.localId],system=this.system(p.state.id);
    // Each source fades with the listener's distance to that source only.
    const target=self&&system&&this.connected&&!document.hidden&&!this.muted?jukeboxGain(self,system.source,system.audio)*this.volume*this.master:0;
    p.gain=immediate?target:p.gain+(target-p.gain)*(1-Math.exp(-dt/(system?.audio.smoothingSeconds??.25)));
    // Hard silence beyond range or on mute; smoothing must never leave a tail outside the radius.
    if(target===0)p.gain=0;
    const value=Math.round(p.gain*100);p.audibleVolume=value;
    if(!p.ready||!p.player)return;
    if(value===0){if((p.player.isMuted?.()??p.muted)!==true)p.player.mute();p.muted=true;}
    else {if((p.player.getVolume?.()??p.lastVolume)!==value)p.player.setVolume(value);if(p.muted!==false)p.player.unMute();p.muted=false;}
    p.lastVolume=value;
  }
  /** This kind's own volume (also set by its panel), remembered in this browser. */
  get ownVolume():number {return this.volume;}
  setVolume(value:number):void {
    if(!Number.isFinite(value))return;
    this.volume=Math.max(0,Math.min(1,value));this.muted=false;
    try{localStorage.setItem(this.kind.volumeKey,String(this.volume));}catch{}
    for(const p of this.sessions.values())this.applyVolume(p,true);this.renderPanel();
  }
  setMaster(value:number):void {if(!Number.isFinite(value))return;this.master=Math.max(0,Math.min(1,value));for(const p of this.sessions.values())this.applyVolume(p,true);}
  setMuted(value:boolean):void {this.muted=value;for(const p of this.sessions.values())this.applyVolume(p,true);this.renderPanel();}
  get soundEnabled():boolean {return this.sessions.size>0&&!this.muted;}
  get selectedSystem():MediaSystem|undefined {return this.system(this.selected);}
  selectedSystemLabel(id:string):string {return (this.system(id)?.label??this.kind.name).toUpperCase();}
  panelHtml(id:string):string {
    this.selected=id;
    const k=this.kind,pre=k.prefix,watch=k.screen?`<button type="button" class="button secondary" data-action="watch-tv" data-tv="${id}">Assistir na TV</button>`:'';
    return `<div class="jukebox-panel media-panel ${pre}-panel" data-capture-input><p class="modal-description">${k.intro}</p><form id="${pre}-form"><label>Link do YouTube<input id="${pre}-url" name="url" type="url" required maxlength="2048" placeholder="https://www.youtube.com/watch?v=…" autocomplete="off"></label><button class="button primary" type="submit">Tocar</button></form><p id="${pre}-title" class="jukebox-title"></p><p id="${pre}-state" role="status"></p><p id="${pre}-error" class="form-message error" role="alert" hidden></p><div class="jukebox-controls"><button type="button" class="button secondary" data-media="pause">Pausar</button><button type="button" class="button secondary" data-media="resume">Continuar</button><button type="button" class="button secondary" data-media="stop">Parar</button><button type="button" class="button secondary" data-media="off">${k.off}</button></div><label>Volume ${k.prefix==='tv'?'das TVs':'da jukebox'} neste navegador <output id="${pre}-volume-value"></output><input id="${pre}-volume" type="range" min="0" max="100" step="1" value="${Math.round(this.volume*100)}"></label><p id="${pre}-distance" class="fine-print"></p><div class="jukebox-controls"><button type="button" class="button primary" data-media-local="activate">Ativar reprodução neste navegador</button>${watch}<button type="button" class="text-button" data-media-local="retry">Tentar conectar novamente</button></div><p class="fine-print">YouTube · volume pela distância até ${k.screen?'esta TV':'a jukebox'}; o navegador não permite posicionar o som do YouTube no espaço. A disponibilidade depende do vídeo e do navegador.</p></div>`;
  }
  attachPanel(root:HTMLElement):void {
    this.panel=root;
    root.querySelector<HTMLFormElement>(this.id('form'))!.onsubmit=event=>{event.preventDefault();event.stopPropagation();this.command('play',root.querySelector<HTMLInputElement>(this.id('url'))!.value);};
    root.querySelector<HTMLInputElement>(this.id('volume'))!.oninput=event=>{
      const value=Number((event.target as HTMLInputElement).value);if(Number.isFinite(value))this.setVolume(value/100);
    };
    root.querySelectorAll<HTMLButtonElement>('[data-media]').forEach(button=>button.onclick=()=>this.command(button.dataset.media as JukeboxCommand['action']));
    root.querySelector<HTMLButtonElement>('[data-media-local=activate]')!.onclick=()=>{
      const p=this.sessions.get(this.selected);if(!p?.player)return;
      p.revision=-1;this.applyVolume(p,true);this.apply(p);
    };
    root.querySelector<HTMLButtonElement>('[data-media-local=retry]')!.onclick=()=>{
      const state=this.states()?.[this.selected];if(!state||state.status==='off')return;this.remove(state.id);void this.create(state);
    };
    this.renderPanel();
  }
  detachPanel():void {this.panel=undefined;this.pendingRevision=undefined;clearTimeout(this.pendingTimer);}
  command(action:JukeboxCommand['action'],url?:string):void {
    if(this.pendingRevision!==undefined)return;
    const state=this.states()?.[this.selected],self=this.world?.players[this.localId],object=INTERACTABLES.find(o=>o.id===this.selected);
    if(!state||!self||!object||!this.connected)return;
    if(!canInteract(object,self)){this.showError(this.kind.tooFar);return;}
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
    const state=this.states()?.[this.selected],p=this.sessions.get(this.selected),pending=this.pendingRevision!==undefined,system=this.system(this.selected);
    const set=(id:string,value:string)=>{const element=root.querySelector<HTMLElement>(this.id(id));if(element&&element.textContent!==value)element.textContent=value;};
    set('title',p?.title||(state?.videoId?`Vídeo ${state.videoId}`:this.kind.nothing));
    const shared=state?.status==='playing'?'Bar: reprodução solicitada':state?.status==='paused'?'Bar: pausado':state?.status==='stopped'?'Bar: interrompido':state?.status==='ended'?'Bar: encerrado':this.kind.offState;
    set('state',pending?'Enviando comando…':p?`${shared} · Neste navegador: ${labels[p.status]}`:shared);
    root.querySelector<HTMLButtonElement>(`${this.id('form')} button`)!.disabled=pending||!this.connected;
    root.querySelectorAll<HTMLButtonElement>('[data-media]').forEach(b=>b.disabled=pending||!this.connected||(b.dataset.media!=='off'&&!state?.videoId)||(b.dataset.media==='pause'&&state?.status!=='playing'));
    const activate=root.querySelector<HTMLButtonElement>('[data-media-local=activate]')!;activate.hidden=!(p&&['blocked','paused','hidden'].includes(p.status)&&state?.status==='playing');
    root.querySelector<HTMLElement>('[data-media-local=retry]')!.hidden=p?.status!=='error';
    set('volume-value',`${Math.round(this.volume*100)}%${this.muted?' · silenciado':''}`);
    set('distance',`Volume recebido agora: ${p?.audibleVolume??0}%. Alcance de ${system?.audio.maxDistance??0} m. Fechar esta janela mantém a reprodução.`);
    const error=root.querySelector<HTMLElement>(this.id('error'))!;
    if(p?.error){this.showError(p.error);error.dataset.playerError='true';}
    else if(!pending&&error.dataset.playerError){error.hidden=true;delete error.dataset.playerError;}
  }
  private remove(id:string):void {const p=this.sessions.get(id);if(!p)return;this.sessions.delete(id);clearTimeout(p.timeout);p.player?.destroy();p.frame.remove();p.dock.remove();if(this.kind.screen&&p.state.tvId)this.hooks.screen(p.state.tvId,false);stackDocks();if(!document.querySelector('#tv-docks > .tv-dock'))document.body.classList.remove('media-active');}
  reset():void {for(const id of [...this.sessions.keys()])this.remove(id);this.world=undefined;this.connected=false;this.detachPanel();this.hooks.ambient(false);if(this.kind.screen){const canvas=document.querySelector<HTMLCanvasElement>('#world');if(canvas)canvas.style.pointerEvents='';}}
  destroy():void {this.disposed=true;this.reset();document.removeEventListener('visibilitychange',this.onVisibility);window.removeEventListener('pointermove',this.onPointer);if(!this.docks.children.length)this.docks.remove();}
  telemetry():unknown {return [...this.sessions.values()].map(p=>({id:p.state.id,kind:this.kind.prefix,tvId:p.state.tvId,videoId:p.videoId,status:p.status,mode:p.mode,volume:p.audibleVolume,revision:p.revision,title:p.title,error:p.error,ready:p.ready,currentTime:p.ready?p.player?.getCurrentTime():0}));}
}
/** The jukebox: music with its own controls, player card and volume. It never touches a TV. */
export class JukeboxController extends MediaController {
  constructor(hooks:Hooks,apiLoader?:()=>Promise<YoutubeApi>){super(JUKEBOX_KIND,hooks,apiLoader);}
}
/** The map's TVs: each shows its own video on its own screen, with controls separate from the jukebox. */
export class TelevisionController extends MediaController {
  constructor(hooks:Hooks,apiLoader?:()=>Promise<YoutubeApi>){super(TV_KIND,hooks,apiLoader);}
}
