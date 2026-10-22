import {JUKEBOX_SYSTEMS,JUKEBOX_AUDIO,INTERACTABLES,canInteract,jukeboxGain,jukeboxTime,youtubeVideoId,type JukeboxState,type JukeboxCommand,type WorldState} from '@bar/shared';
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
const labels:Record<LocalStatus,string>={loading:'Carregando vídeo…',playing:'Reproduzindo',paused:'Pausado',buffering:'Carregando vídeo…',blocked:'Clique em Ativar reprodução neste navegador.',error:'Não foi possível reproduzir',ended:'Vídeo encerrado',stopped:'Reprodução interrompida',hidden:'Reprodução local suspensa'};
/** One official player per active pair. Modal lifecycle never owns or destroys the player. */
export class JukeboxController {
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
  private muted=false;
  private lastTick=0;
  private docks=document.createElement('div');
  private disposed=false;
  private onVisibility=()=>this.setWorld(this.world,this.localId,this.connected);
  private pointer={x:-1,y:-1};
  private onPointer=(event:PointerEvent)=>{if(event.buttons)return;this.pointer={x:event.clientX,y:event.clientY};};
  constructor(private hooks:Hooks,private apiLoader:()=>Promise<YoutubeApi>=loadYoutubeApi) {
    this.docks.id='tv-docks';document.querySelector('#app')!.append(this.docks);
    document.addEventListener('visibilitychange',this.onVisibility);
    window.addEventListener('pointermove',this.onPointer);
    try{const stored=Number(localStorage.getItem('bar:jukebox:volume'));if(localStorage.getItem('bar:jukebox:volume')!==null&&Number.isFinite(stored))this.volume=Math.max(0,Math.min(1,stored));}catch{}
  }
  setWorld(world:WorldState|undefined,localId:string,connected:boolean):void {
    this.world=world;this.localId=localId;this.connected=connected;
    for(const [id,p] of this.sessions){const state=world?.jukeboxes?.[id];if(!state||state.status==='off')this.remove(id);else p.state=state;}
    if(world&&connected&&!document.hidden)for(const state of Object.values(world.jukeboxes??{}))if(state.status!=='off'&&state.videoId&&!this.sessions.has(state.id))void this.create(state);
    this.reconcile();
  }
  private async create(state:JukeboxState):Promise<void> {
    document.body.classList.add('media-active');
    const frame=document.createElement('div');frame.className='tv-player';frame.dataset.jukebox=state.id;
    const mount=document.createElement('div');frame.append(mount);
    const dock=document.createElement('section');dock.className='tv-dock';dock.dataset.jukebox=state.id;
    const header=document.createElement('header');header.textContent='TV · YouTube';
    const activate=document.createElement('button');activate.type='button';activate.textContent='Ativar TV';activate.setAttribute('aria-label','Ativar TV neste navegador');activate.onclick=()=>{const current=this.sessions.get(state.id);if(current?.player){current.revision=-1;this.apply(current);}};header.append(activate);
    const mute=document.createElement('button');mute.type='button';mute.textContent='Silenciar';mute.setAttribute('aria-label','Silenciar vídeo neste navegador');mute.onclick=()=>{this.setMuted(!this.muted);mute.textContent=this.muted?'Ativar som':'Silenciar';};header.append(mute);
    const note=document.createElement('p');note.textContent='Player visível enquanto você explora. O volume acompanha sua distância da jukebox.';
    dock.append(header,frame,note);this.docks.append(dock);
    const p:Playback={state,frame,dock,ready:false,revision:-1,videoId:'',status:'loading',error:'',title:'',lastSync:0,lastVolume:0,gain:0,audibleVolume:0,mode:'dock'};
    this.sessions.set(state.id,p);
    try {
      const api=await this.apiLoader();if(this.disposed||this.sessions.get(state.id)!==p)return;
      p.player=new api.Player(mount,{width:640,height:360,host:'https://www.youtube.com',playerVars:{playsinline:1,controls:1,autoplay:0,rel:0,origin:location.origin},events:{
        onReady:({target})=>{
          if(this.sessions.get(state.id)!==p){target.destroy();return;}p.player=target;p.ready=true;
          const iframe=target.getIframe();iframe.title='TV do Boteco · YouTube';iframe.referrerPolicy='strict-origin-when-cross-origin';iframe.setAttribute('allow','autoplay; encrypted-media; picture-in-picture; fullscreen');
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
    if(state===0&&p.state.status==='playing')this.hooks.send('jukebox.ended',{id:p.state.id,revision:p.state.revision,videoId:p.state.videoId,duration:p.player?.getDuration()??0});
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
    if(this.pendingRevision!==undefined&&(this.world?.jukeboxes?.[this.selected]?.revision!==this.pendingRevision||Date.now()>this.pendingUntil))this.pendingRevision=undefined;
    this.renderPanel();
  }
  frame():void {
    const now=performance.now(),dt=Math.min(.25,(now-this.lastTick)/1000||.05),periodic=now-this.lastTick>=100;
    if(periodic)this.lastTick=now;
    let hasVideo=false,pointerOnTv=false;
    for(const p of this.sessions.values()) {
      const points=!document.hidden&&this.connected?this.hooks.project(p.state.tvId):null;
      // A visible minimum-size dock is essential when the physical screen is too small or behind a wall.
      if(points){
        if(p.mode!=='tv'){p.dock.classList.add('on-surface');p.mode='tv';}
        p.frame.style.transform=televisionTransform(points);this.hooks.screen(p.state.tvId,true);
        pointerOnTv||=points.every((point,i)=>{const next=points[(i+1)%4];return (next.x-point.x)*(this.pointer.y-point.y)-(next.y-point.y)*(this.pointer.x-point.x)>=0;});
      }else{
        this.hooks.screen(p.state.tvId,false);
        if(p.mode!=='dock'){p.dock.classList.remove('on-surface');p.mode='dock';p.frame.style.transform='';}
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
      hasVideo||=p.status==='playing'||p.status==='buffering'||p.status==='loading';
    }
    this.hooks.ambient(hasVideo);
    const canvas=document.querySelector<HTMLCanvasElement>('#world');if(canvas)canvas.style.pointerEvents=pointerOnTv?'none':'';
    if(periodic)this.renderPanel();
  }
  private applyVolume(p:Playback,immediate=false,dt=.1):void {
    const self=this.world?.players[this.localId],system=JUKEBOX_SYSTEMS.find(s=>s.id===p.state.id);
    const target=self&&system&&this.connected&&!document.hidden&&!this.muted?jukeboxGain(self,system.source)*this.volume:0;
    p.gain=immediate?target:p.gain+(target-p.gain)*(1-Math.exp(-dt/JUKEBOX_AUDIO.smoothingSeconds));
    // Hard silence beyond range or on mute; smoothing must never leave a tail outside the radius.
    if(target===0)p.gain=0;
    const value=Math.round(p.gain*100);p.audibleVolume=value;
    if(!p.ready||!p.player)return;
    if(value===0){if(p.muted!==true)p.player.mute();p.muted=true;}
    else {if(p.lastVolume!==value)p.player.setVolume(value);if(p.muted!==false)p.player.unMute();p.muted=false;}
    p.lastVolume=value;
  }
  setMuted(value:boolean):void {this.muted=value;for(const p of this.sessions.values())this.applyVolume(p,true);this.renderPanel();}
  get soundEnabled():boolean {return this.sessions.size>0&&!this.muted;}
  panelHtml(id:string):string {
    this.selected=id;
    return `<div class="jukebox-panel" data-capture-input><p class="modal-description">Escolha um vídeo para a TV do salão. Os controles são compartilhados com o bar; o volume é só seu.</p><form id="jukebox-form"><label>Link do YouTube<input id="jukebox-url" name="url" type="url" required maxlength="2048" placeholder="https://www.youtube.com/watch?v=…" autocomplete="off"></label><button class="button primary" type="submit">Tocar</button></form><p id="jukebox-title" class="jukebox-title"></p><p id="jukebox-state" role="status"></p><p id="jukebox-error" class="form-message error" role="alert" hidden></p><div class="jukebox-controls"><button type="button" class="button secondary" data-jukebox="pause">Pausar</button><button type="button" class="button secondary" data-jukebox="resume">Continuar</button><button type="button" class="button secondary" data-jukebox="stop">Parar</button><button type="button" class="button secondary" data-jukebox="off">Desligar TV</button></div><label>Volume neste navegador <output id="jukebox-volume-value"></output><input id="jukebox-volume" type="range" min="0" max="100" step="1" value="${Math.round(this.volume*100)}"></label><p id="jukebox-distance" class="fine-print"></p><div class="jukebox-controls"><button type="button" class="button primary" data-jukebox-local="activate">Ativar reprodução neste navegador</button><button type="button" class="button secondary" data-action="watch-tv">Assistir na TV</button><button type="button" class="text-button" data-jukebox-local="retry">Tentar conectar novamente</button></div><p class="fine-print">YouTube · volume atenuado por distância, sem áudio espacial. A disponibilidade depende do vídeo e do navegador.</p></div>`;
  }
  attachPanel(root:HTMLElement):void {
    this.panel=root;
    root.querySelector<HTMLFormElement>('#jukebox-form')!.onsubmit=event=>{event.preventDefault();event.stopPropagation();this.command('play',root.querySelector<HTMLInputElement>('#jukebox-url')!.value);};
    root.querySelector<HTMLInputElement>('#jukebox-volume')!.oninput=event=>{
      const value=Number((event.target as HTMLInputElement).value);if(Number.isFinite(value)){this.volume=Math.max(0,Math.min(100,value))/100;this.muted=false;try{localStorage.setItem('bar:jukebox:volume',String(this.volume));}catch{}this.renderPanel();}
    };
    root.querySelectorAll<HTMLButtonElement>('[data-jukebox]').forEach(button=>button.onclick=()=>this.command(button.dataset.jukebox as JukeboxCommand['action']));
    root.querySelector<HTMLButtonElement>('[data-jukebox-local=activate]')!.onclick=()=>{
      const p=this.sessions.get(this.selected);if(!p?.player)return;
      p.revision=-1;this.applyVolume(p,true);this.apply(p);
    };
    root.querySelector<HTMLButtonElement>('[data-jukebox-local=retry]')!.onclick=()=>{
      const state=this.world?.jukeboxes?.[this.selected];if(!state||state.status==='off')return;this.remove(state.id);void this.create(state);
    };
    this.renderPanel();
  }
  detachPanel():void {this.panel=undefined;this.pendingRevision=undefined;clearTimeout(this.pendingTimer);}
  command(action:JukeboxCommand['action'],url?:string):void {
    if(this.pendingRevision!==undefined)return;
    const state=this.world?.jukeboxes?.[this.selected],self=this.world?.players[this.localId],object=INTERACTABLES.find(o=>o.id===this.selected);
    if(!state||!self||!object||!this.connected)return;
    if(!canInteract(object,self)){this.showError('Chegue mais perto da jukebox.');return;}
    if(action==='play'&&!youtubeVideoId(url?.trim()??'')){this.showError('Cole um link válido de vídeo do YouTube.');return;}
    const error=this.panel?.querySelector<HTMLElement>('#jukebox-error');if(error){error.hidden=true;delete error.dataset.playerError;}
    this.pendingRevision=state.revision;this.pendingUntil=Date.now()+5000;
    this.hooks.send('jukebox.command',{id:state.id,revision:state.revision,action,...(url?{url:url.trim()}:{})});this.renderPanel();
    clearTimeout(this.pendingTimer);this.pendingTimer=setTimeout(()=>{if(this.pendingRevision!==undefined){this.pendingRevision=undefined;this.showError('A jukebox não confirmou o comando. Tente novamente.');this.renderPanel();}},5100);
  }
  reject(message:string):void {if(this.panel&&this.pendingRevision!==undefined){this.pendingRevision=undefined;clearTimeout(this.pendingTimer);this.showError(message);this.renderPanel();}}
  private showError(text:string):void {const error=this.panel?.querySelector<HTMLElement>('#jukebox-error');if(error){error.textContent=text;error.hidden=false;}}
  private renderPanel():void {
    const root=this.panel;if(!root?.isConnected)return;
    const state=this.world?.jukeboxes?.[this.selected],p=this.sessions.get(this.selected),pending=this.pendingRevision!==undefined;
    const set=(id:string,value:string)=>{const element=root.querySelector<HTMLElement>(id);if(element&&element.textContent!==value)element.textContent=value;};
    set('#jukebox-title',p?.title||(state?.videoId?`Vídeo ${state.videoId}`:'Nenhuma música selecionada'));
    const shared=state?.status==='playing'?'Bar: reprodução solicitada':state?.status==='paused'?'Bar: pausado':state?.status==='stopped'?'Bar: interrompido':state?.status==='ended'?'Bar: encerrado':'TV desligada';
    set('#jukebox-state',pending?'Enviando comando…':p?`${shared} · Neste navegador: ${labels[p.status]}`:shared);
    root.querySelector<HTMLButtonElement>('#jukebox-form button')!.disabled=pending||!this.connected;
    root.querySelectorAll<HTMLButtonElement>('[data-jukebox]').forEach(b=>b.disabled=pending||!this.connected||(b.dataset.jukebox!=='off'&&!state?.videoId)||(b.dataset.jukebox==='pause'&&state?.status!=='playing'));
    const activate=root.querySelector<HTMLButtonElement>('[data-jukebox-local=activate]')!;activate.hidden=!(p&&['blocked','paused','hidden'].includes(p.status)&&state?.status==='playing');
    root.querySelector<HTMLElement>('[data-jukebox-local=retry]')!.hidden=p?.status!=='error';
    set('#jukebox-volume-value',`${Math.round(this.volume*100)}%${this.muted?' · silenciado':''}`);
    set('#jukebox-distance',`Volume recebido agora: ${p?.audibleVolume??0}%. Alcance de ${JUKEBOX_AUDIO.maxDistance} m. Fechar esta janela mantém a reprodução.`);
    if(p?.error)this.showError(p.error);
    else if(!pending){const error=root.querySelector<HTMLElement>('#jukebox-error')!;if(error.dataset.playerError){error.hidden=true;delete error.dataset.playerError;}}
    if(p?.error)root.querySelector<HTMLElement>('#jukebox-error')!.dataset.playerError='true';
  }
  private remove(id:string):void {const p=this.sessions.get(id);if(!p)return;this.sessions.delete(id);clearTimeout(p.timeout);p.player?.destroy();p.frame.remove();p.dock.remove();this.hooks.screen(p.state.tvId,false);if(!this.sessions.size)document.body.classList.remove('media-active');}
  reset():void {for(const id of [...this.sessions.keys()])this.remove(id);this.world=undefined;this.connected=false;this.detachPanel();this.hooks.ambient(false);const canvas=document.querySelector<HTMLCanvasElement>('#world');if(canvas)canvas.style.pointerEvents='';}
  destroy():void {this.disposed=true;this.reset();document.removeEventListener('visibilitychange',this.onVisibility);window.removeEventListener('pointermove',this.onPointer);this.docks.remove();}
  telemetry():unknown {return [...this.sessions.values()].map(p=>({id:p.state.id,tvId:p.state.tvId,videoId:p.videoId,status:p.status,mode:p.mode,volume:p.audibleVolume,revision:p.revision,title:p.title,error:p.error,ready:p.ready,currentTime:p.ready?p.player?.getCurrentTime():0}));}
}
