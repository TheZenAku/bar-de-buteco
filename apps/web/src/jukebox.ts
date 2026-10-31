import {JUKEBOX_SYSTEMS,TV_SYSTEMS,TV_LABELS,INTERACTABLES,MEDIA_PLATFORMS,MEDIA_PLATFORM_LIST,PLAYBACK_REFUSED,canInteract,mediaGain,mediaReporter,nearestMediaSource,jukeboxTime,parseMediaLink,type JukeboxState,type JukeboxCommand,type MediaLink,type MediaProvider,type MediaSystem,type Position,type WorldState} from '@bar/shared';
import {loadPlayers,playerError} from './media/platforms';
import type {MediaPlayer,PlayerFactory} from './media/player';
import {televisionTransform,type Point} from './engine/television-surface';
type LocalStatus='loading'|'playing'|'paused'|'buffering'|'blocked'|'error'|'ended'|'hidden'|'distant';
/** One official player of the link's platform: the jukebox's (sound only) or one screen of a TV group. */
interface Playback {
  screen:string;frame:HTMLDivElement;player?:MediaPlayer;ready:boolean;revision:number;videoId:string;
  status:LocalStatus;error:string;title:string;lastSync:number;lastVolume:number;onScreen:boolean;timeout?:ReturnType<typeof setTimeout>;
  muted?:boolean;
  /** The screen's corners on the page in the last frame (null without a projection). */
  points?:Point[]|null;
  /** Built with the platform's own controls: this browser controls the video (see MediaController.controls). */
  controls:boolean;
  /** Counts the players built on this screen, so a replaced player's late events are ignored. */
  generation:number;
  /** Just loaded or moved to the timeline: its first playing frames are checked against it at once. */
  fresh:boolean;
  /** When this code last moved the player itself (load, seek, pause): what happens right after is not the controller's. */
  movedAt:number;
  /** The player's time at the last check, to tell a jump on the player's controls from playing and buffering. */
  sample?:{time:number;at:number};
}
/**
 * A shared source playing in this browser: every screen follows the same state; one player is heard.
 * `distant`: out of earshot and out of sight, so its players wait paused here (see updateDistant).
 */
interface Session {
  state:JukeboxState;system:MediaSystem;players:Playback[];audible:number;gain:number;audibleVolume:number;distant:boolean;silentSince?:number;
  /** This browser controls the video: its screens carry the player's controls, and what is done on them goes to everyone. */
  control:boolean;
  /** What the players are built for (playerKey). */
  built:string;
  /** Counts the times the players were built, so a slower build gives way to a newer one. */
  building:number;
  /** Its window was closed in this browser (MediaPlatform.window): it waits, paused, until asked back or a new video. */
  dismissed:boolean;
  /** Reports already sent (`<event>:<revision>`): one each. */
  reported:Set<string>;
  /** The heard player's length a few seconds ago: a live broadcast's keeps growing with the clock. */
  growth?:{duration:number;at:number;live:boolean};
}
interface Hooks {
  send:(type:string,payload:unknown)=>void;now:()=>number;
  /** The screen's corners on the page, or null when no projection exists (the back of the TV). */
  project:(screen:string)=>Point[]|null;
  /** No wall between the camera and the screen, so the pointer may reach its player. */
  clear:(screen:string)=>boolean;
  screen:(screen:string,visible:boolean)=>void;ambient:(suppressed:boolean)=>void;
  /** Share of this source's sound the listener gets next to the other area's (areaMix); 1 when absent. */
  mix?:(system:MediaSystem,listener:Position)=>number;
}
/** What differs between the jukebox and the TVs. Everything else is the same code with separate state. */
interface MediaKind {
  /** Message prefix (`<prefix>.command`, `.ended`, `.failed`, `.live`, `.result`) and DOM id prefix. */
  prefix:'jukebox'|'tv';
  stateKey:'jukeboxes'|'televisions';
  systems:readonly MediaSystem[];
  volumeKey:string;
  name:string;tooFar:string;intro:string;off:string;skip:string;offState:string;nothing:string;
}
const JUKEBOX_KIND:MediaKind={prefix:'jukebox',stateKey:'jukeboxes',systems:JUKEBOX_SYSTEMS,volumeKey:'bar:jukebox:volume',
  name:'Jukebox',tooFar:'Chegue mais perto da jukebox.',intro:'Escolha uma música para a jukebox. Só o som toca, sem vídeo. Com uma música tocando, a sua entra na fila. Quem põe a música controla ela; o volume é só seu.',
  off:'Desligar jukebox',skip:'Pular música',offState:'Jukebox desligada',nothing:'Nenhuma música tocando'};
const TV_KIND:MediaKind={prefix:'tv',stateKey:'televisions',systems:TV_SYSTEMS,volumeKey:'bar:tv:volume',
  name:'TV',tooFar:'Chegue mais perto da TV.',intro:'Escolha um vídeo. Ele passa ao mesmo tempo em todas as TVs deste ambiente; com um vídeo tocando, o seu entra na fila. Quem põe o vídeo controla ele; o volume é só seu.',
  off:'Desligar TV',skip:'Pular vídeo',offState:'TV desligada',nothing:'Nenhum vídeo tocando'};
const labels:Record<LocalStatus,string>={loading:'Carregando vídeo…',playing:'Reproduzindo',paused:'Pausado',buffering:'Carregando vídeo…',blocked:'Clique em Ativar reprodução neste navegador.',error:'Não foi possível reproduzir',ended:'Vídeo encerrado',hidden:'Reprodução local suspensa',distant:'Em espera: longe daqui, volta quando você se aproximar'};
/** Metres closer another screen must be before the sound moves to it, so walking between two TVs never flips it back and forth. */
const AUDIBLE_HYSTERESIS=1.5;
/** Seconds a screen may drift from the shared timeline before it is corrected, and how often each one is checked. */
const DRIFT_TOLERANCE=1.5,SYNC_MS=3000;
/** A live broadcast's players differ by their own latency: only a bigger gap is corrected. */
const LIVE_DRIFT_TOLERANCE=5;
/** How long a source must stay silent and out of sight here before its players pause (no flapping at the edge of its reach). */
const DISTANT_AFTER_MS=3000;
/** Seconds the controller's player must jump at once to count as a seek on YouTube's controls; and how long after this code moved it a jump is its own. */
const SEEK_JUMP=2,OWN_MOVE_MS=2000;
/** The panel's steps back and forward: a video's, and a live broadcast's. */
const SEEK_STEP=10,LIVE_STEP=30;
/** Seconds behind its live edge that a broadcast still counts as live. */
const LIVE_LAG=10;
/** How long the check before queueing waits for the video to start; after it, the server's check decides alone. */
const PROBE_MS=8000;
/** A player without a volume level is on or off: on from this much of the distance curve, off below the other (no flapping at the edge). */
const SOUND_ON=25,SOUND_OFF=15;
/** A state from before the platforms existed, or a fixture's, is YouTube's. */
const providerOf=(state:JukeboxState):MediaProvider=>state.provider||'youtube';
/** YouTube's player loads any video; every other platform's is built for one link. */
const playerKey=(state:JukeboxState)=>state.provider&&state.provider!=='youtube'?`${state.provider}:${state.videoId}`:'youtube';
const windowed=(state:JukeboxState)=>MEDIA_PLATFORMS[providerOf(state)].window;
/** How a link with no title yet is called. */
const untitled=(provider:MediaProvider|'',videoId:string)=>!provider||provider==='youtube'?`Vídeo ${videoId}`:MEDIA_PLATFORMS[provider].label;
const clock=(seconds:number)=>{const s=Math.max(0,Math.floor(seconds)),h=Math.floor(s/3600),m=Math.floor(s/60)%60,r=String(s%60).padStart(2,'0');return h?`${h}:${String(m).padStart(2,'0')}:${r}`:`${m}:${r}`;};

/** The players sit under the canvas: a TV's shows through its screen's aperture, the jukebox's never shows. */
function playerContainer():HTMLElement {
  let container=document.querySelector<HTMLElement>('#media-players');
  if(!container){container=document.createElement('div');container.id='media-players';document.querySelector('#app')!.append(container);}
  return container;
}

/**
 * The official players of every active source of this kind. The modal never owns or destroys a player.
 * The jukebox and the TVs are separate instances: own state map, messages, players, panel and volume.
 */
export class MediaController {
  private sessions=new Map<string,Session>();
  private world?:WorldState;
  private localId='';
  private connected=false;
  private panel?:HTMLElement;
  private selected='';
  /** A command on its way: it is confirmed when the source's playback or queue changes (`mark`). */
  private pending?:{id:string;action:JukeboxCommand['action'];mark:string;timer:ReturnType<typeof setTimeout>};
  /** A link being checked before it is queued (probe). */
  private checking=false;
  /** The panel's position bar is being dragged: its value is the user's until released. */
  private dragging=false;
  private queueShown='';
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
  constructor(private kind:MediaKind,private hooks:Hooks,private players:(provider:MediaProvider)=>Promise<PlayerFactory>=loadPlayers) {
    document.addEventListener('visibilitychange',this.onVisibility);
    window.addEventListener('pointermove',this.onPointer);
    window.addEventListener('click',this.onGesture,true);window.addEventListener('keydown',this.onGesture,true);
    try{const stored=Number(localStorage.getItem(kind.volumeKey));if(localStorage.getItem(kind.volumeKey)!==null&&Number.isFinite(stored))this.volume=Math.max(0,Math.min(1,stored));}catch{}
  }
  private states():Record<string,JukeboxState>|undefined {return this.world?.[this.kind.stateKey];}
  private id(name:string):string {return `#${this.kind.prefix}-${name}`;}
  setWorld(world:WorldState|undefined,localId:string,connected:boolean):void {
    this.world=world;this.localId=localId;this.connected=connected;
    for(const [id,session] of this.sessions){
      const state=this.states()?.[id];if(!state||state.status==='off'){this.remove(id);continue;}
      if(state.revision!==session.state.revision)session.reported.clear();
      session.state=state;
      if(this.controls(state)!==session.control||playerKey(state)!==session.built)void this.build(session);
    }
    if(world&&connected&&!document.hidden)for(const state of Object.values(this.states()??{}))if(state.status!=='off'&&state.videoId&&!this.sessions.has(state.id))void this.create(state);
    this.reconcile();
  }
  private system(id:string):MediaSystem|undefined {return this.kind.systems.find(s=>s.id===id);}
  /**
   * The player's own controls show only on the screens of whoever controls the video, and only they can click them; for
   * everyone else the picture is bare and the pointer goes past it. The stage screen fills the backyard's view and never
   * takes the pointer, so its controller works it from the panel.
   */
  private controls(state:JukeboxState):boolean {const system=this.system(state.id);return !!system?.screens.length&&system.area==='bar'&&!!state.by&&state.by===this.localId;}
  /** This browser tells the server what the players see (the end, a refusal, a live broadcast). */
  private reporter(session:Session):boolean {return mediaReporter(session.state,this.localId);}
  private async create(state:JukeboxState):Promise<void> {
    const system=this.system(state.id);if(!system)return;
    const session:Session={state,system,players:[],audible:0,gain:0,audibleVolume:0,distant:false,control:this.controls(state),reported:new Set(),built:'',building:0,dismissed:false};
    // The jukebox has one hidden player for its sound; a TV group has one player per screen.
    for(const screen of system.screens.length?system.screens:['']){
      const frame=document.createElement('div');frame.className=`media-player ${this.kind.prefix}-player${screen?'':' audio-only'}`;frame.dataset.media=state.id;if(screen)frame.dataset.screen=screen;
      frame.append(document.createElement('div'));this.container.append(frame);
      session.players.push({screen,frame,ready:false,revision:-1,videoId:'',status:'loading',error:'',title:'',lastSync:0,lastVolume:0,onScreen:false,controls:false,generation:0,fresh:false,movedAt:0});
    }
    this.sessions.set(state.id,session);this.updateActive();
    await this.build(session);
  }
  /**
   * Builds the source's players for what it plays now: its platform's, with or without their own controls. It runs again
   * when the next link is of another platform, or when control moves to or from this browser.
   */
  private async build(session:Session):Promise<void> {
    const token=++session.building,state=session.state,inWindow=windowed(state);
    session.control=this.controls(state);session.built=playerKey(state);session.dismissed=false;session.distant=false;session.silentSince=undefined;
    for(const p of session.players){
      clearTimeout(p.timeout);p.player?.destroy();p.player=undefined;p.generation++;
      Object.assign(p,{ready:false,revision:-1,videoId:'',status:'loading',error:'',sample:undefined,muted:undefined});
      p.frame.replaceChildren(document.createElement('div'));this.dress(session,p,inWindow);
    }
    if(inWindow)session.audible=0;else this.chooseAudible(session,true);
    let factory:PlayerFactory;
    try{factory=await this.players(providerOf(state));}
    catch(error){if(this.sessions.get(state.id)!==session||token!==session.building)return;for(const p of session.players){p.status='error';p.error=error instanceof Error?error.message:'Falha de conexão com o player.';}this.renderPanel();return;}
    if(this.disposed||this.sessions.get(state.id)!==session||token!==session.building)return;
    // A window holds one player, whatever the screens of the group.
    for(const p of inWindow?session.players.slice(0,1):session.players)this.mount(factory,session,p);
  }
  /** On its screen under the canvas, or for a platform that must stay in sight (MediaPlatform.window) in a window over the game. */
  private dress(session:Session,p:Playback,inWindow:boolean):void {
    const first=p===session.players[0],frame=p.frame;
    frame.classList.toggle('media-window',inWindow&&first);frame.classList.toggle('audio-only',!inWindow&&!p.screen);
    frame.style.display='';
    // A screen's player shows only once projected: at the page's corner it would show through another screen's aperture.
    frame.style.visibility=(inWindow?first:!p.screen||p.onScreen)?'':'hidden';
    if(!inWindow)return;
    frame.style.transform='';p.points=null;
    if(p.onScreen){p.onScreen=false;this.hooks.screen(p.screen,false);}
    if(first)frame.prepend(this.windowBar(session,frame));
  }
  /** The window's title bar: it drags the window, always whole on the page, and closes it for this browser only. */
  private windowBar(session:Session,frame:HTMLElement):HTMLElement {
    const bar=document.createElement('div'),title=document.createElement('span'),close=document.createElement('button');
    bar.className='media-window-bar';title.textContent=`${MEDIA_PLATFORMS[providerOf(session.state)].label} · ${session.system.label}`;
    close.type='button';close.className='text-button';close.textContent='Fechar';
    close.onclick=()=>{session.dismissed=true;this.updateDistant(session,performance.now());};
    bar.onpointerdown=event=>{
      if(event.target===close)return;
      const box=frame.getBoundingClientRect(),dx=event.clientX-box.left,dy=event.clientY-box.top;
      bar.setPointerCapture(event.pointerId);
      bar.onpointermove=move=>{frame.style.right='auto';frame.style.left=`${Math.max(0,Math.min(innerWidth-box.width,move.clientX-dx))}px`;frame.style.top=`${Math.max(0,Math.min(innerHeight-box.height,move.clientY-dy))}px`;};
      bar.onpointerup=()=>{bar.onpointermove=null;};
    };
    bar.append(title,close);return bar;
  }
  private mount(factory:PlayerFactory,session:Session,p:Playback):void {
    const label=p.screen?TV_LABELS[p.screen]??session.system.label:session.system.label,generation=++p.generation,controls=session.control;
    const provider=providerOf(session.state),title=`${label} do Boteco · ${MEDIA_PLATFORMS[provider].label}`;
    const current=()=>this.current(session,p)&&p.generation===generation;
    p.controls=controls;p.frame.classList.toggle('controls',controls);
    p.player=factory(p.frame.lastElementChild as HTMLElement,{media:session.state.videoId,controls,probe:false,label:title,events:{
      onReady:({target})=>{
        if(!current()){target.destroy();return;}p.player=target;p.ready=true;
        const iframe=target.getIframe();iframe.title=title;
        if(provider==='youtube'&&iframe instanceof HTMLIFrameElement){iframe.referrerPolicy='strict-origin-when-cross-origin';iframe.setAttribute('allow','autoplay; encrypted-media; picture-in-picture; fullscreen');}
        if(!controls)iframe.tabIndex=-1;
        this.applyVolume(session,true);this.apply(session,p);this.renderPanel();
      },
      onStateChange:({data})=>{if(current())this.playerState(session,p,data);},
      onError:({data,message})=>{
        if(!current())return;p.error=message??playerError(provider,data);p.status='error';clearTimeout(p.timeout);
        // The platform refuses this video on other sites: the queue moves on (one report per source).
        if(PLAYBACK_REFUSED.includes(data)&&p===session.players[session.audible]&&this.reporter(session))this.report(session,'failed',{code:data});
        this.renderPanel();
      },
      onAutoplayBlocked:()=>{if(!current())return;p.status='blocked';clearTimeout(p.timeout);this.renderPanel();}
    }});
    p.timeout=setTimeout(()=>{if(!p.ready&&current()){p.status='error';p.error='O player não respondeu. Verifique sua conexão e tente novamente.';this.renderPanel();}},20000);
  }
  private current(session:Session,p:Playback):boolean {return this.sessions.get(session.state.id)===session&&session.players.includes(p);}
  private playerState(session:Session,p:Playback,state:number):void {
    // Old events from a rapidly replaced video cannot change the new selection.
    const data=p.player?.getVideoData?.();if(data?.video_id&&data.video_id!==session.state.videoId)return;
    if(data?.title)p.title=data.title.slice(0,200);
    const previous=p.status;
    p.status=({[-1]:'loading',0:'ended',1:'playing',2:'paused',3:'buffering',5:'paused'} as Record<number,LocalStatus>)[state]??'loading';
    if(state===1||state===2||state===0||state===5)clearTimeout(p.timeout);
    if(state===1){p.error='';if(document.hidden||!this.connected){this.moved(p);p.player?.pauseVideo();}}
    // Pressed on the player's own controls by whoever controls the video: it goes to everyone.
    if(this.handled(session,p)){
      if(state===2&&previous!=='paused'&&session.state.status==='playing')this.command('pause',{},session.state.id);
      else if(state===1&&session.state.status==='paused')this.command('resume',{},session.state.id);
    }
    const duration=p.player?.getDuration()??0;
    // One report per source: the player being heard speaks for the other screens.
    if(state===0&&p===session.players[session.audible]&&session.state.status==='playing'&&this.reporter(session)&&Number.isFinite(duration)&&duration>0)this.report(session,'ended',{duration});
    this.renderPanel();
  }
  private report(session:Session,event:'ended'|'failed'|'live',payload:Record<string,number>):void {
    const key=`${event}:${session.state.revision}`;if(session.reported.has(key))return;session.reported.add(key);
    this.hooks.send(`${this.kind.prefix}.${event}`,{id:session.state.id,revision:session.state.revision,videoId:session.state.videoId,...payload});
  }
  private moved(p:Playback):void {p.movedAt=performance.now();p.sample=undefined;}
  /**
   * The controller is working this player's own controls: it has the keyboard focus (they clicked it), and this code
   * has not just moved it. Its pause, play and seeks become commands.
   */
  private handled(session:Session,p:Playback):boolean {
    return session.control&&p.controls&&p.ready&&!document.hidden&&this.connected&&!session.distant&&p.videoId===session.state.videoId&&p.revision===session.state.revision
      &&performance.now()-p.movedAt>OWN_MOVE_MS&&!!p.player&&document.activeElement===p.player.getIframe();
  }
  private apply(session:Session,p:Playback):void {
    if(!p.ready||!p.player||session.built!==playerKey(session.state))return;
    const state=session.state,target=jukeboxTime(state,this.hooks.now());
    if(document.hidden||!this.connected){if(p.status!=='hidden'){this.moved(p);p.player.pauseVideo();}p.status='hidden';p.revision=-1;return;}
    // Waiting out of earshot and out of sight; coming back resyncs it to the shared timeline (revision -1).
    if(session.distant){if(p.status!=='distant'){this.moved(p);p.player.pauseVideo();}p.status='distant';p.revision=-1;clearTimeout(p.timeout);return;}
    if(p.revision===state.revision)return;
    p.revision=state.revision;p.lastSync=performance.now();p.error='';p.fresh=true;this.moved(p);
    const playing=state.status==='playing';
    if(p.videoId!==state.videoId){
      p.videoId=state.videoId;p.title='';p.status='loading';session.growth=undefined;this.applyVolume(session,true);
      if(playing)p.player.loadVideoById({videoId:p.videoId,startSeconds:target});else p.player.cueVideoById({videoId:p.videoId,startSeconds:target});
    } else {
      p.player.seekTo(target,true);
      if(playing){
        p.status='loading';p.player.playVideo();
        // Only YouTube's player answers a play while it plays already; for the others that is the answer.
        if(providerOf(state)!=='youtube'&&p.player.getPlayerState()===1)p.status='playing';
      }else{p.player.pauseVideo();p.status='paused';}
    }
    clearTimeout(p.timeout);
    if(playing)p.timeout=setTimeout(()=>{if(p.status==='loading'||p.status==='buffering'){p.status='error';p.error='O vídeo demorou para carregar. Verifique a conexão e tente novamente.';this.renderPanel();}},16000);
  }
  private reconcile():void {
    for(const session of this.sessions.values())for(const p of session.players)this.apply(session,p);
    const pending=this.pending;
    if(pending){
      const state=this.states()?.[pending.id];
      if(!state||this.mark(state)!==pending.mark){
        this.clearPending();
        // A link that went in is cleared from the form.
        const input=this.panel?.querySelector<HTMLInputElement>(this.id('url'));if(pending.action==='play'&&input&&pending.id===this.selected){input.value='';this.showHint('');}
      }
    }
    this.renderPanel();
  }
  private mark(state:JukeboxState):string {return `${state.revision}|${(state.queue??[]).map(entry=>entry.key).join()}`;}
  private clearPending():void {if(this.pending)clearTimeout(this.pending.timer);this.pending=undefined;}
  frame():void {
    const now=performance.now(),dt=Math.min(.25,(now-this.lastTick)/1000||.05),periodic=now-this.lastTick>=100;
    if(periodic)this.lastTick=now;
    let pointerOnTv=false;
    for(const session of this.sessions.values()) {
      for(const p of session.players){
        if(!p.screen||session.built&&windowed(session.state))continue;
        // The picture never leaves its screen: without a projection (seen from behind) it is simply not drawn. Nor is
        // YouTube's end or error card: the screen shows its own standby picture instead.
        const points=!document.hidden&&this.connected?this.hooks.project(p.screen):null,drawn=points&&p.status!=='ended'&&p.status!=='error'?points:null;
        p.points=points;
        if(drawn){
          p.frame.style.transform=televisionTransform(drawn);
          if(!p.onScreen){p.onScreen=true;p.frame.style.visibility='';this.hooks.screen(p.screen,true);}
          // Only the controller's screens take the pointer (the player's controls), and never the stage screen.
          if(!pointerOnTv&&p.controls&&drawn.every((point,i)=>{const next=drawn[(i+1)%4]!;return (next.x-point.x)*(this.pointer.y-point.y)-(next.y-point.y)*(this.pointer.x-point.x)>=0;}))pointerOnTv=this.hooks.clear(p.screen);
        }else if(p.onScreen){p.onScreen=false;p.frame.style.visibility='hidden';this.hooks.screen(p.screen,false);}
      }
      if(periodic){
        this.chooseAudible(session);this.applyVolume(session,false,dt);this.updateDistant(session,now);this.watchLive(session,now);
        for(const p of session.players){this.watchControls(session,p);this.keepInSync(session,p,now);}
      }
    }
    // A paused/failed selection must not unexpectedly restart the old procedural music.
    this.hooks.ambient(this.sessions.size>0);
    if(this.kind.prefix==='tv'){const canvas=document.querySelector<HTMLCanvasElement>('#world');if(canvas)canvas.style.pointerEvents=pointerOnTv?'none':'';}
    if(periodic)this.renderPanel();
  }
  /**
   * Keeps every screen on the shared timeline, without continuously seeking during buffering, ads or errors: right after
   * it starts, then every SYNC_MS. The controller's player under their hands is the timeline's reference instead. A
   * stream with no timeline (length 0: a Twitch channel, a radio) is left where it is.
   */
  private keepInSync(session:Session,p:Playback,now:number):void {
    if(!p.ready||!p.player||p.status!=='playing'||session.state.status!=='playing'||document.hidden||!this.connected||this.handled(session,p))return;
    if(!p.fresh&&now-p.lastSync<=SYNC_MS)return;
    p.fresh=false;p.lastSync=now;
    // A live broadcast not reported as one yet keeps its place: the timeline still counts from 0 until liveMedia.
    if(!session.state.live&&this.isLive(session,p))return;
    const duration=p.player.getDuration(),live=session.state.live;
    // Never past a video's end. A live broadcast's timeline runs at its edge: no further than this player's own edge,
    // or a player a little behind the others would seek forever.
    const target=live?Math.min(jukeboxTime(session.state,this.hooks.now()),duration):jukeboxTime(session.state,this.hooks.now());
    if(duration>0&&(live||target<duration-2)&&Math.abs(p.player.getCurrentTime()-target)>(live?LIVE_DRIFT_TOLERANCE:DRIFT_TOLERANCE)){this.moved(p);p.player.seekTo(target,true);}
  }
  /** A jump on the controller's player that this code did not make is a seek on the player's controls: everyone follows. */
  private watchControls(session:Session,p:Playback):void {
    if(!this.handled(session,p)){p.sample=undefined;return;}
    const time=p.player!.getCurrentTime(),at=performance.now(),sample=p.sample;p.sample={time,at};
    if(!sample||(p.status!=='playing'&&p.status!=='paused'))return;
    const expected=sample.time+(p.status==='playing'?(at-sample.at)/1000:0);
    if(Math.abs(time-expected)>SEEK_JUMP)this.command('seek',{position:time},session.state.id);
  }
  /** A live broadcast: YouTube says so, or the heard player's length grows with the clock. */
  private isLive(session:Session,p:Playback):boolean {
    return (p.ready&&p.player?.getVideoData?.()?.isLive===true)||!!session.growth?.live;
  }
  /**
   * Tells the server the video is a live broadcast, with the live edge of this browser's player (its length: the time
   * since the stream began). Everyone's timeline jumps there (liveMedia), instead of hours behind at the stream's start.
   */
  private watchLive(session:Session,now:number):void {
    const p=session.players[session.audible];
    if(!p?.ready||!p.player||p.status!=='playing'||session.state.live||p.revision!==session.state.revision)return;
    const duration=p.player.getDuration();
    // No length at all: a stream with no timeline to jump to (a radio, a live playlist).
    if(!Number.isFinite(duration)||duration<=0){if(this.reporter(session)&&p.player.getVideoData?.()?.isLive===true)this.report(session,'live',{edge:0});return;}
    const growth=session.growth;
    if(!growth)session.growth={duration,at:now,live:false};
    else if(now-growth.at>=4000){
      const elapsed=(now-growth.at)/1000,grew=duration-growth.duration;
      session.growth={duration,at:now,live:growth.live||(grew>elapsed*.5&&grew<elapsed*1.5)};
    }
    if(this.reporter(session)&&this.isLive(session,p))this.report(session,'live',{edge:duration});
  }
  /** The sound of a TV group comes from the screen closest to the listener. */
  private chooseAudible(session:Session,immediate=false):void {
    const self=this.world?.players[this.localId];if(!self||session.players.length<2||windowed(session.state))return;
    const nearest=nearestMediaSource(session.system,self),current=session.system.sources[session.audible]!;
    const currentDistance=Math.hypot(self.x-current.x,(self.y??0)-current.y,self.z-current.z);
    if(nearest.index!==session.audible&&(immediate||nearest.distance<currentDistance-AUDIBLE_HYSTERESIS)){session.audible=nearest.index;this.applyVolume(session,true);}
  }
  /** Where the listener stands: the source's distance fade, shared with the other area where both reach (areaMix). */
  private spatialGain(session:Session):number {
    const self=this.world?.players[this.localId];if(!self)return 0;
    const gain=mediaGain(self,session.system);
    return gain>0?gain*(this.hooks.mix?.(session.system,self)??1):0;
  }
  /**
   * A source nobody here can hear (out of its reach, or covered by the other area) and whose screens are out of sight
   * waits paused in this browser after DISTANT_AFTER_MS: several players decoding at once made the sound stutter on
   * modest machines. It resumes, resynced, as soon as it can be heard or seen again. The video's controller keeps
   * playing, because that browser reports the end of the video. A window waits with it, out of the way, or at once when
   * closed.
   */
  private updateDistant(session:Session,now:number):void {
    const wanted=this.spatialGain(session)===0&&session.state.by!==this.localId&&!session.players.some(p=>this.inView(p));
    if(!wanted)session.silentSince=undefined;else session.silentSince??=now;
    const distant=session.dismissed||(wanted&&now-session.silentSince!>=DISTANT_AFTER_MS);
    if(distant===session.distant)return;
    session.distant=distant;
    if(windowed(session.state))session.players[0]!.frame.style.display=distant?'none':'';
    for(const p of session.players){p.revision=-1;this.apply(session,p);}
    this.renderPanel();
  }
  /** Some of the screen is on the page with no wall in between (the jukebox has no screen). */
  private inView(p:Playback):boolean {
    const points=p.points;if(!p.screen||!points)return false;
    const xs=points.map(point=>point.x),ys=points.map(point=>point.y);
    return Math.max(...xs)>0&&Math.min(...xs)<innerWidth&&Math.max(...ys)>0&&Math.min(...ys)<innerHeight&&this.hooks.clear(p.screen);
  }
  /** Systems of this kind playing right now (the other area's sound fades out where they are louder; areaMix). */
  playingSystems():MediaSystem[] {return [...this.sessions.values()].filter(session=>session.state.status==='playing').map(session=>session.system);}
  private applyVolume(session:Session,immediate=false,dt=.1):void {
    const self=this.world?.players[this.localId],system=session.system;
    // Each source fades with the listener's distance to that source only, and gives way to the other area's sound.
    const target=self&&this.connected&&!document.hidden&&!this.muted?this.spatialGain(session)*this.volume*this.master:0;
    session.gain=immediate?target:session.gain+(target-session.gain)*(1-Math.exp(-dt/system.audio.smoothingSeconds));
    // Hard silence beyond range or on mute; smoothing must never leave a tail outside the radius. Giving way to the
    // other area (its source just started) fades out instead.
    if(target===0&&!(self&&this.connected&&!document.hidden&&!this.muted&&mediaGain(self,system)>0))session.gain=0;
    const value=Math.round(session.gain*100),level=MEDIA_PLATFORMS[providerOf(session.state)].volume==='level';session.audibleVolume=value;
    session.players.forEach((p,i)=>{
      if(!p.ready||!p.player)return;
      const heard=i===session.audible&&(level||value>=(p.muted===false?SOUND_OFF:SOUND_ON))?value:0;
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
  /** Length in seconds of the video this source plays, from the player being heard (0 while unknown); a live broadcast's grows. */
  duration(id:string):number {
    const session=this.sessions.get(id),p=session?.players[session.audible],value=p?.ready?p.player?.getDuration()??0:0;
    return Number.isFinite(value)&&value>0?value:0;
  }
  get selectedSystem():MediaSystem|undefined {return this.system(this.selected);}
  selectedSystemLabel(id:string):string {return (this.system(id)?.label??this.kind.name).toUpperCase();}
  panelHtml(id:string):string {
    this.selected=id;this.queueShown='';this.dragging=false;
    const k=this.kind,pre=k.prefix,tv=pre==='tv',stage=this.system(id)?.area==='stage';
    const watch=tv?`<button type="button" class="button secondary" data-action="watch-tv" data-tv="${id}">${stage?'Assistir no telão':'Assistir na TV'}</button>`:'';
    const intro=stage?'Escolha um vídeo para o telão do palco: todo mundo no quintal assiste junto e as luzes do palco acompanham as cores dele. Com um vídeo tocando, o seu entra na fila. Quem põe o vídeo controla ele; o volume é só seu.':k.intro;
    return `<div class="jukebox-panel media-panel ${pre}-panel" data-capture-input><p class="modal-description">${intro}</p>`
      +`<form id="${pre}-form"><label>Link do vídeo ou da música<input id="${pre}-url" name="url" type="text" required maxlength="2048" placeholder="https://…" autocomplete="off" spellcheck="false"></label><button class="button primary" type="submit">Tocar</button></form>`
      +`<p id="${pre}-hint" class="fine-print media-hint" hidden></p>`
      +`<p class="fine-print">Aceita ${MEDIA_PLATFORM_LIST} e links diretos de vídeo, áudio ou rádio (MP4, WebM, MP3, M3U8…). O link é conferido antes de cobrar. Uma live entra no ao vivo.</p>`
      +`<p id="${pre}-error" class="form-message error" role="alert" hidden></p>`
      +`<section class="media-now" aria-label="Tocando agora"><p class="media-heading"><span id="${pre}-title" class="jukebox-title"></span><span id="${pre}-live" class="media-live" hidden>Ao vivo</span><span id="${pre}-platform" class="media-platform"></span></p><p id="${pre}-owner" class="media-owner"></p><p id="${pre}-state" role="status"></p>`
      +`<div id="${pre}-seek" class="media-seek" hidden><input id="${pre}-position" type="range" min="0" max="0" step="1" value="0" aria-label="Posição do vídeo"><output id="${pre}-time"></output></div>`
      +`<div class="jukebox-controls"><button type="button" class="button secondary" data-media-step="-1"></button><button type="button" class="button secondary" data-media="pause">Pausar</button><button type="button" class="button secondary" data-media="resume">Continuar</button><button type="button" class="button secondary" data-media-step="1"></button><button type="button" class="button secondary" data-media-live>Ir para o ao vivo</button><button type="button" class="button secondary" data-media="skip">${k.off}</button></div></section>`
      +`<section class="media-queue" aria-labelledby="${pre}-queue-title"><h3 id="${pre}-queue-title">Fila</h3><ol id="${pre}-queue"></ol></section>`
      +`<label>Volume ${tv?'das TVs':'da jukebox'} neste navegador <output id="${pre}-volume-value"></output><input id="${pre}-volume" type="range" min="0" max="100" step="1" value="${Math.round(this.volume*100)}"></label><p id="${pre}-distance" class="fine-print"></p>`
      +`<div class="jukebox-controls"><button type="button" class="button primary" data-media-local="activate">Ativar reprodução neste navegador</button>${watch}<button type="button" class="text-button" data-media-local="retry">Tentar conectar novamente</button></div>`
      +`<p class="fine-print">Volume pela distância até ${stage?'o telão; no quintal ele cobre a jukebox e as TVs, e no salão é o contrário':tv?'a TV mais próxima':'a jukebox'}. Pausar, avançar e pular são de graça; tirar o seu vídeo da fila devolve as moedas.</p></div>`;
  }
  attachPanel(root:HTMLElement):void {
    this.panel=root;
    const url=root.querySelector<HTMLInputElement>(this.id('url'))!;
    root.querySelector<HTMLFormElement>(this.id('form'))!.onsubmit=event=>{event.preventDefault();event.stopPropagation();void this.add(url.value);};
    url.oninput=()=>this.showHint(url.value);
    root.querySelector<HTMLInputElement>(this.id('volume'))!.oninput=event=>{
      const value=Number((event.target as HTMLInputElement).value);if(Number.isFinite(value))this.setVolume(value/100);
    };
    root.querySelectorAll<HTMLButtonElement>('[data-media]').forEach(button=>button.onclick=()=>this.command(button.dataset.media as JukeboxCommand['action']));
    root.querySelectorAll<HTMLButtonElement>('[data-media-step]').forEach(button=>button.onclick=()=>this.step(Number(button.dataset.mediaStep)));
    root.querySelector<HTMLButtonElement>('[data-media-live]')!.onclick=()=>{const session=this.sessions.get(this.selected);if(session)this.command('seek',{position:this.liveEdge(session)});};
    const position=root.querySelector<HTMLInputElement>(this.id('position'))!;
    position.oninput=()=>{this.dragging=true;this.renderPanel();};
    position.onchange=()=>{this.dragging=false;const value=Number(position.value);if(Number.isFinite(value))this.command('seek',{position:value});};
    root.querySelector<HTMLElement>(this.id('queue'))!.onclick=event=>{const button=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-media-remove]');if(button)this.command('remove',{entry:button.dataset.mediaRemove});};
    root.querySelector<HTMLButtonElement>('[data-media-local=activate]')!.onclick=()=>{
      const session=this.sessions.get(this.selected);if(!session)return;
      if(session.dismissed){session.dismissed=false;this.updateDistant(session,performance.now());}
      this.applyVolume(session,true);for(const p of session.players){p.revision=-1;this.apply(session,p);}
    };
    root.querySelector<HTMLButtonElement>('[data-media-local=retry]')!.onclick=()=>{
      const state=this.states()?.[this.selected];if(!state||state.status==='off')return;this.remove(state.id);void this.create(state);
    };
    this.renderPanel();
  }
  detachPanel():void {this.panel=undefined;this.dragging=false;}
  /** What the link being typed is, and what its platform cannot do. */
  private showHint(text:string):void {
    const hint=this.panel?.querySelector<HTMLElement>(this.id('hint'));if(!hint)return;
    const link=text.includes('://')||text.startsWith('spotify:')?parseMediaLink(text):undefined;
    hint.hidden=!link;if(!link)return;
    if('error' in link){hint.textContent=link.error;return;}
    const {label,note}=MEDIA_PLATFORMS[link.provider];hint.textContent=note?`${label}. ${note}`:label;
  }
  /** The live edge of a broadcast in this browser: the heard player's length (the time since the stream began). */
  private liveEdge(session:Session):number {return this.duration(session.state.id)||jukeboxTime(session.state,this.hooks.now());}
  /** The panel's step back or forward, within the video (or up to a broadcast's live edge). */
  private step(direction:number):void {
    const state=this.states()?.[this.selected],session=this.sessions.get(this.selected);if(!state||!Number.isFinite(direction))return;
    const end=state.live&&session?this.liveEdge(session):this.duration(state.id)-1,time=jukeboxTime(state,this.hooks.now())+direction*(state.live?LIVE_STEP:SEEK_STEP);
    this.command('seek',{position:Math.max(0,end>0?Math.min(end,time):time)});
  }
  /** Mirrors the server's reach before sending (packages/shared/src/world.ts); false after showing why not. */
  private reachable(id:string,action:JukeboxCommand['action']):boolean {
    const state=this.states()?.[id],self=this.world?.players[this.localId],objects=INTERACTABLES.filter(o=>o.media===id),system=this.system(id);
    if(!state||!self||!objects.length||!system||!this.connected)return false;
    if(action==='remove')return true;
    // The video's controller works it from wherever they hear it; anyone else from the screen.
    if(action!=='play'&&state.by&&state.by===this.localId){if(mediaGain(self,system)>0)return true;}
    else if(objects.some(object=>canInteract(object,self)))return true;
    this.showError(system.area==='stage'?'Encoste na frente do palco para mexer no telão.':this.kind.tooFar);return false;
  }
  /**
   * A new link: checked here first (probe), then sent. It plays at once on an idle source and waits in the queue
   * otherwise; the server asks the platform again before charging.
   */
  private async add(url:string):Promise<void> {
    const id=this.selected,state=this.states()?.[id],link=parseMediaLink(url);
    if(this.pending||this.checking||!this.reachable(id,'play'))return;
    if('error' in link){this.showError(link.error);return;}
    if(state&&(state.videoId===link.id||(state.queue??[]).some(entry=>entry.videoId===link.id))){this.showError('Este vídeo já está na fila.');return;}
    this.hideError();this.checking=true;this.renderPanel();
    const refused=await this.probe(link);
    this.checking=false;
    if(this.disposed)return;
    if(refused){this.showError(refused);this.renderPanel();return;}
    this.send(id,'play',{url:url.trim()});
  }
  /**
   * Plays the video muted for a moment in an invisible player: one its platform does not let play on other sites
   * (embedding off, age-restricted, blocked here, removed), or a direct link that is no media at all, fails right there
   * and never reaches the queue. Without an answer in time the server's check decides alone. A platform that cannot play
   * hidden, or silently (MediaPlatform), is not checked here. Resolves with the reason it was refused, or ''.
   */
  private async probe(link:MediaLink):Promise<string> {
    const platform=MEDIA_PLATFORMS[link.provider];if(platform.window||platform.volume==='none')return '';
    let factory:PlayerFactory;try{factory=await this.players(link.provider);}catch{return '';}
    return new Promise(resolve=>{
      const frame=document.createElement('div');frame.className='media-player media-probe';frame.append(document.createElement('div'));this.container.append(frame);
      let player:MediaPlayer|undefined,done=false;
      const finish=(refused:string)=>{if(done)return;done=true;clearTimeout(timer);try{player?.destroy();}catch{}frame.remove();resolve(refused);};
      const timer=setTimeout(()=>finish(''),PROBE_MS);
      player=factory(frame.firstElementChild as HTMLElement,{media:link.id,controls:false,probe:true,label:'Conferindo o link',events:{
        onReady:({target})=>{player=target;if(done){target.destroy();return;}target.mute();target.loadVideoById({videoId:link.id,startSeconds:0});},
        onStateChange:({data})=>{if(data===1)finish('');},
        onError:({data,message})=>finish(PLAYBACK_REFUSED.includes(data)?message??playerError(link.provider,data):''),
        onAutoplayBlocked:()=>finish(''),
      }});
    });
  }
  /** Pause, resume, skip, seek and taking one's own video out of the queue; `id`: the source (the panel's by default). */
  command(action:JukeboxCommand['action'],extra:{position?:number;entry?:string}={},id=this.selected):void {
    if(this.pending||!this.reachable(id,action))return;
    this.send(id,action,extra);
  }
  private send(id:string,action:JukeboxCommand['action'],extra:{url?:string;position?:number;entry?:string}):void {
    const state=this.states()?.[id];if(!state||this.pending)return;
    this.hideError();
    const timer=setTimeout(()=>{if(this.pending?.id===id){this.reject(`${this.kind.name==='TV'?'A TV':'A jukebox'} não confirmou o comando. Tente novamente.`);}},5100);
    this.pending={id,action,mark:this.mark(state),timer};
    this.hooks.send(`${this.kind.prefix}.command`,{id,revision:state.revision,action,...extra});this.renderPanel();
  }
  /**
   * A server error while a command of this kind waits: it was that command's. A press on the player's controls that did not
   * go through leaves this browser's players on the shared state again. True when the open panel shows it.
   */
  reject(message:string):boolean {
    const pending=this.pending;if(!pending)return false;
    this.clearPending();
    const session=this.sessions.get(pending.id);if(session)for(const p of session.players){p.revision=-1;this.apply(session,p);}
    if(!this.panel?.isConnected){this.renderPanel();return false;}
    this.showError(message);this.renderPanel();return true;
  }
  private showError(text:string):void {const error=this.panel?.querySelector<HTMLElement>(this.id('error'));if(error){error.textContent=text;error.hidden=false;delete error.dataset.playerError;}}
  private hideError():void {const error=this.panel?.querySelector<HTMLElement>(this.id('error'));if(error){error.hidden=true;delete error.dataset.playerError;}}
  private renderPanel():void {
    const root=this.panel;if(!root?.isConnected)return;
    const state=this.states()?.[this.selected],session=this.sessions.get(this.selected),pending=!!this.pending,busy=pending||this.checking,system=this.system(this.selected);
    const queue=state?.queue??[],playing=!!state?.videoId&&state.status!=='off',controller=playing&&state.by===this.localId,free=playing&&!state.by;
    // The panel reports the player being heard, and the first failure of any screen.
    const p=session?.players[session.audible],failed=session?.players.find(player=>player.error);
    const set=(id:string,value:string)=>{const element=root.querySelector<HTMLElement>(this.id(id));if(element&&element.textContent!==value)element.textContent=value;};
    const show=(element:HTMLElement|null,visible:boolean)=>{if(element&&element.hidden===visible)element.hidden=!visible;};
    set('title',state?.title||p?.title||(state?.videoId?untitled(state.provider,state.videoId):this.kind.nothing));
    set('platform',playing?MEDIA_PLATFORMS[providerOf(state)].label:'');
    show(root.querySelector(this.id('live')),!!state?.live&&playing);
    set('owner',!playing?'':controller?`Você está no controle: só você pausa, avança e pula este ${this.kind.prefix==='tv'?'vídeo':'som'}.${session?.control?' Na tela, os controles do player também valem.':''}`
      :free?'Quem pôs este vídeo saiu do bar: quem estiver aqui pode assumir o controle.':`No controle: ${state.byName}. O seu vídeo entra na fila.`);
    const shared=state?.status==='playing'?'Bar: tocando':state?.status==='paused'?'Bar: pausado':this.kind.offState;
    set('state',this.checking?'Conferindo se este link toca aqui…':pending?'Enviando comando…':p?`${shared} · Neste navegador: ${session?.dismissed?'janela fechada':labels[p.status]}`:shared);
    const submit=root.querySelector<HTMLButtonElement>(`${this.id('form')} button`)!;submit.disabled=busy||!this.connected;
    const label=playing?'Pôr na fila':'Tocar';if(submit.textContent!==label)submit.textContent=label;
    // Only whoever can control the video sees its controls.
    const control=playing&&(controller||free),now=this.hooks.now(),time=state?jukeboxTime(state,now):0,duration=this.duration(this.selected),live=!!state?.live;
    const seek=root.querySelector<HTMLElement>(this.id('seek'))!,position=root.querySelector<HTMLInputElement>(this.id('position'))!;
    show(seek,control&&(live||duration>0));show(position,!live);
    if(!live&&duration>0){
      if(position.max!==String(Math.floor(duration)))position.max=String(Math.floor(duration));
      if(!this.dragging)position.value=String(Math.min(Math.floor(duration),Math.floor(time)));
      set('time',`${clock(this.dragging?Number(position.value):time)} / ${clock(duration)}`);
    } else if(live){const behind=(duration||time)-time;set('time',behind<LIVE_LAG?'No ao vivo':`${clock(behind)} atrás do ao vivo`);}
    position.disabled=busy;
    root.querySelectorAll<HTMLButtonElement>('[data-media],[data-media-step],[data-media-live]').forEach(button=>{
      const action=button.dataset.media;
      // A stream with no length (a Twitch channel, a radio) has nowhere to go.
      const movable=!(live&&!duration);
      show(button,control&&(action==='pause'?state?.status==='playing':action==='resume'?state?.status==='paused':button.dataset.mediaLive!==undefined?live&&movable:button.dataset.mediaStep!==undefined?movable:true));
      button.disabled=busy||!this.connected;
    });
    root.querySelectorAll<HTMLButtonElement>('[data-media-step]').forEach(button=>{const value=`${Number(button.dataset.mediaStep)<0?'−':'+'}${live?LIVE_STEP:SEEK_STEP} s`;if(button.textContent!==value)button.textContent=value;});
    const skip=root.querySelector<HTMLButtonElement>('[data-media=skip]')!,skipLabel=queue.length?this.kind.skip:this.kind.off;if(skip.textContent!==skipLabel)skip.textContent=skipLabel;
    this.renderQueue(root,queue,busy);
    const activate=root.querySelector<HTMLButtonElement>('[data-media-local=activate]')!;activate.hidden=!(session?.dismissed||session?.players.some(player=>['blocked','paused','hidden'].includes(player.status))&&state?.status==='playing');
    show(root.querySelector('[data-action=watch-tv]'),!(state&&playing&&windowed(state)));
    root.querySelector<HTMLElement>('[data-media-local=retry]')!.hidden=!failed;
    set('volume-value',`${Math.round(this.volume*100)}%${this.muted?' · silenciado':''}`);
    set('distance',`Volume recebido agora: ${session?.audibleVolume??0}%. Alcance de ${system?.audio.maxDistance??0} m. Fechar esta janela mantém a reprodução.`);
    const error=root.querySelector<HTMLElement>(this.id('error'))!;
    if(failed){if(error.textContent!==failed.error||error.hidden){error.textContent=failed.error;error.hidden=false;}error.dataset.playerError='true';}
    else if(!pending&&error.dataset.playerError){error.hidden=true;delete error.dataset.playerError;}
  }
  /** The queue as text (titles come from the platforms): rebuilt only when it changes. One's own entries can be taken out. */
  private renderQueue(root:HTMLElement,queue:JukeboxState['queue'],busy:boolean):void {
    const list=root.querySelector<HTMLOListElement>(this.id('queue'))!,heading=root.querySelector<HTMLElement>(this.id('queue-title'))!;
    const shown=`${this.localId}|${queue.map(entry=>`${entry.key}:${entry.title}:${entry.byName}`).join('|')}`;
    if(shown!==this.queueShown){
      this.queueShown=shown;
      heading.textContent=queue.length?`Na fila · ${queue.length}`:'Fila vazia';
      list.replaceChildren(...queue.map((entry,i)=>{
        const item=document.createElement('li'),title=document.createElement('span'),by=document.createElement('small');
        title.className='media-queue-title';title.textContent=entry.title||untitled(entry.provider,entry.videoId);by.textContent=`${i===0?'Próximo · ':''}por ${entry.by===this.localId?'você':entry.byName}${entry.provider?` · ${MEDIA_PLATFORMS[entry.provider].label}`:''}`;
        item.append(title,by);
        if(entry.by===this.localId){const remove=document.createElement('button');remove.type='button';remove.className='text-button';remove.dataset.mediaRemove=entry.key;remove.textContent='Tirar da fila';item.append(remove);}
        return item;
      }));
    }
    list.querySelectorAll<HTMLButtonElement>('[data-media-remove]').forEach(button=>button.disabled=busy||!this.connected);
  }
  private remove(id:string):void {
    const session=this.sessions.get(id);if(!session)return;this.sessions.delete(id);
    for(const p of session.players){clearTimeout(p.timeout);p.player?.destroy();p.frame.remove();if(p.screen)this.hooks.screen(p.screen,false);}
    this.updateActive();
  }
  /** While a TV plays, the vignette must not darken its picture. */
  private updateActive():void {document.body.classList.toggle('media-active',!!this.container.querySelector('.tv-player'));}
  reset():void {for(const id of [...this.sessions.keys()])this.remove(id);this.world=undefined;this.connected=false;this.clearPending();this.detachPanel();this.hooks.ambient(false);if(this.kind.prefix==='tv'){const canvas=document.querySelector<HTMLCanvasElement>('#world');if(canvas)canvas.style.pointerEvents='';}}
  destroy():void {
    this.disposed=true;this.reset();document.removeEventListener('visibilitychange',this.onVisibility);window.removeEventListener('pointermove',this.onPointer);
    window.removeEventListener('click',this.onGesture,true);window.removeEventListener('keydown',this.onGesture,true);
    if(!this.container.children.length)this.container.remove();
  }
  telemetry():unknown {
    return [...this.sessions.values()].flatMap(session=>session.players.map((p,i)=>({id:session.state.id,kind:this.kind.prefix,provider:providerOf(session.state),screen:p.screen,videoId:p.videoId,status:p.status,
      mode:windowed(session.state)?'window':p.screen?(p.onScreen?'tv':'hidden'):'audio',audible:i===session.audible,volume:i===session.audible?session.audibleVolume:0,revision:p.revision,title:p.title,error:p.error,ready:p.ready,
      controls:p.controls,live:session.state.live,currentTime:p.ready?p.player?.getCurrentTime():0})));
  }
}
/** The jukebox: music only, with its own controls and volume. It never touches a TV. */
export class JukeboxController extends MediaController {
  constructor(hooks:Hooks){super(JUKEBOX_KIND,hooks);}
}
/** The map's TV groups: every screen of a group shows the group's video, with controls separate from the jukebox. */
export class TelevisionController extends MediaController {
  constructor(hooks:Hooks){super(TV_KIND,hooks);}
}
