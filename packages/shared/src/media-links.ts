/**
 * Which links the jukebox, the TVs and the stage screen accept. A source keeps one shared timeline in every browser and
 * fades with distance, so a platform only enters here if its official embedded player can be played, paused, sought and
 * silenced by the page. The players themselves are in apps/web/src/media.
 */
export type MediaProvider='youtube'|'vimeo'|'soundcloud'|'mixcloud'|'spotify'|'tiktok'|'twitch'|'file';
export interface MediaPlatform {
  label:string;
  /** The platform as the subject of a sentence ("O Vimeo não deixa…"). */
  named:string;
  /**
   * How the page may set its sound. `level`: any volume, so it fades with distance. `mute`: on or off only. `none`: not at
   * all, so the player stops where it should not be heard. Both of those cut in instead of fading.
   */
  volume:'level'|'mute'|'none';
  /** Plays only fully visible and at least 400 x 300 px, never under the canvas: it opens in a window over the game. */
  window:boolean;
  /** What the player of this platform cannot do, for the panel. */
  note:string;
}
export const MEDIA_PLATFORMS:Record<MediaProvider,MediaPlatform>={
  youtube:{label:'YouTube',named:'O YouTube',volume:'level',window:false,note:''},
  vimeo:{label:'Vimeo',named:'O Vimeo',volume:'level',window:false,note:''},
  soundcloud:{label:'SoundCloud',named:'O SoundCloud',volume:'level',window:false,note:'Na TV aparece a capa da faixa.'},
  mixcloud:{label:'Mixcloud',named:'O Mixcloud',volume:'level',window:false,note:'Na TV aparece a capa do set.'},
  spotify:{label:'Spotify',named:'O Spotify',volume:'none',window:false,note:'Sem controle de volume: toca cheio perto da fonte e para longe dela. Quem não está logado no Spotify ouve só a prévia.'},
  tiktok:{label:'TikTok',named:'O TikTok',volume:'mute',window:false,note:'Sem controle de volume: o som liga perto da fonte e desliga longe dela.'},
  twitch:{label:'Twitch',named:'A Twitch',volume:'level',window:true,note:'A Twitch só toca com o player inteiro à vista: ele abre numa janela sobre o jogo, não na tela da TV.'},
  file:{label:'Link direto',named:'O link',volume:'level',window:false,note:'Link direto: o endereço é aberto no navegador de quem estiver por perto.'},
};
/** What the panel lists. */
export const MEDIA_PLATFORM_LIST=(Object.keys(MEDIA_PLATFORMS) as MediaProvider[]).filter(provider=>provider!=='file').map(provider=>MEDIA_PLATFORMS[provider].label).join(', ');
/** A link understood: `id` is what the platform's player and the shared state carry. `title`: until the server knows better. */
export interface MediaLink {provider:MediaProvider;id:string;title:string}

const YOUTUBE_ID=/^[A-Za-z0-9_-]{11}$/;
export function youtubeVideoId(input:string):string|null {
  if(input.length>2048||/[\u0000- \u007f\\]/.test(input))return null;
  let url:URL;try{url=new URL(input);}catch{return null;}
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.port)return null;
  const host=url.hostname.toLowerCase();let id:string|null=null;
  if(host==='youtu.be') {const match=url.pathname.match(/^\/([A-Za-z0-9_-]{11})\/?$/);id=match?.[1]??null;}
  else if(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com'].includes(host)) {
    if(url.pathname==='/watch'&&url.searchParams.getAll('v').length===1)id=url.searchParams.get('v');
    else id=url.pathname.match(/^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})\/?$/)?.[1]??null;
  }
  return id&&YOUTUBE_ID.test(id)?id:null;
}

/** Platforms whose embed cannot be controlled (Facebook's plays only muted), or that do not let anything embed them: the link would never stay in sync. */
const NO_PLAYER:readonly (readonly [readonly string[],string])[]=[
  [['dailymotion.com','dai.ly'],'O Dailymotion'],[['facebook.com','fb.com','fb.watch'],'O Facebook'],[['instagram.com'],'O Instagram'],[['x.com','twitter.com'],'O X'],[['kick.com'],'A Kick'],[['kwai.com'],'O Kwai'],
  [['music.apple.com','tv.apple.com'],'A Apple'],[['deezer.com','deezer.page.link'],'O Deezer'],[['music.amazon.com','primevideo.com'],'A Amazon'],[['drive.google.com'],'O Google Drive'],
  [['netflix.com'],'A Netflix'],[['disneyplus.com'],'O Disney+'],[['max.com','hbomax.com'],'A Max'],[['globoplay.globo.com'],'O Globoplay'],[['bilibili.com'],'O Bilibili'],[['rumble.com'],'O Rumble'],
];
const noPlayer=(named:string)=>`${named} não tem um player que o jogo consiga sincronizar. Use ${MEDIA_PLATFORM_LIST} ou um link direto de vídeo ou áudio.`;
const NOT_A_LINK='Cole um link válido de vídeo ou música.';
// First path segments of these sites that are pages, not people.
const SOUNDCLOUD_PAGES=new Set(['discover','you','charts','search','tags','stream','upload','feed','pages','popular','stations','messages','notifications','settings']);
const MIXCLOUD_PAGES=new Set(['discover','live','select','upload','dashboard','settings','categories','tag','search','mixes','messages','notifications','pro']);
const TWITCH_PAGES=new Set(['directory','videos','settings','downloads','jobs','p','subscriptions','inventory','drops','wallet','login','signup','search','friends','moderator','broadcast','turbo','prime','store','messages','following','popout','embed']);
const isHost=(host:string,...domains:string[])=>domains.some(domain=>host===domain||host.endsWith(`.${domain}`));

/** A name no public site answers to: a direct link must not make everyone's browser knock on a router or on their own machine. */
function privateHost(host:string):boolean {
  return !host.includes('.')||host.startsWith('[')||/^\d+\.\d+\.\d+\.\d+$/.test(host)||/\.(localhost|local|localdomain|internal|intranet|lan|home|corp|test|invalid|example)$/.test(host);
}
function fileLink(url:URL):MediaLink|{error:string} {
  if(url.protocol!=='https:')return {error:'Links diretos precisam começar com https://.'};
  if(privateHost(url.hostname))return {error:NOT_A_LINK};
  const direct=new URL(url.href);direct.hash='';
  // A Dropbox share opens a page; its `raw` form is the file itself.
  if(isHost(direct.hostname,'dropbox.com')){direct.searchParams.delete('dl');direct.searchParams.set('raw','1');}
  const name=direct.pathname.split('/').filter(Boolean).pop()??'';let title=name;
  try{title=decodeURIComponent(name);}catch{}
  return {provider:'file',id:direct.href,title:title.replace(/\.[A-Za-z0-9]{1,5}$/,'').replace(/[_+]/g,' ').trim().slice(0,200)||direct.hostname};
}
function platformLink(url:URL,host:string):MediaLink|{error:string}|null {
  const path=url.pathname.replace(/\/+$/,''),segments=path.split('/').filter(Boolean);
  if(isHost(host,'vimeo.com')){
    const match=path.match(/^\/(?:video\/|channels\/[^/]+\/|groups\/[^/]+\/videos\/|album\/\d+\/video\/|showcase\/\d+\/video\/)?(\d+)(?:\/([0-9a-f]+))?$/);
    if(!match)return {error:'Cole o link de um vídeo do Vimeo.'};
    // An unlisted video carries a hash, in the path or in `h`.
    const hash=match[2]??url.searchParams.get('h');
    return {provider:'vimeo',id:hash&&/^[0-9a-f]+$/.test(hash)?`${match[1]}:${hash}`:match[1]!,title:''};
  }
  if(host==='on.soundcloud.com')return {error:'Abra este link no SoundCloud e copie o endereço completo da faixa.'};
  if(isHost(host,'soundcloud.com')){
    if(segments[1]==='sets')return {error:'Cole o link de uma faixa: álbuns e playlists do SoundCloud não entram na fila.'};
    const [user,track,secret]=segments;
    if(!user||!track||segments.length>3||SOUNDCLOUD_PAGES.has(user)||!/^[\w-]+$/.test(user)||!/^[\w-]+$/.test(track)||(secret&&!/^s-\w+$/.test(secret)))return {error:'Cole o link de uma faixa do SoundCloud.'};
    return {provider:'soundcloud',id:segments.join('/'),title:''};
  }
  if(isHost(host,'mixcloud.com')){
    const [user,mix]=segments,safe=/^[\w%.~-]+$/;
    if(segments.length!==2||MIXCLOUD_PAGES.has(user!)||!safe.test(user!)||!safe.test(mix!))return {error:'Cole o link de um set do Mixcloud.'};
    return {provider:'mixcloud',id:segments.join('/'),title:''};
  }
  if(host==='spotify.link')return {error:'Abra este link no Spotify e copie o endereço completo da música.'};
  if(host==='open.spotify.com'){
    const match=path.match(/^(?:\/intl-[a-z-]+)?\/(track|episode)\/([A-Za-z0-9]{22})$/);
    if(!match)return {error:'Cole o link de uma música ou episódio: álbuns e playlists do Spotify não entram na fila.'};
    return {provider:'spotify',id:`${match[1]}:${match[2]}`,title:''};
  }
  if(host==='vm.tiktok.com'||host==='vt.tiktok.com')return {error:'Abra este link no TikTok e copie o endereço completo do vídeo.'};
  if(isHost(host,'tiktok.com')){
    const id=path.match(/^\/(?:@[^/]+\/video|player\/v1|embed\/v2)\/(\d+)$/)?.[1];
    return id?{provider:'tiktok',id,title:'Vídeo do TikTok'}:{error:'Cole o link de um vídeo do TikTok (termina em /video/ e um número).'};
  }
  if(isHost(host,'twitch.tv')){
    if(host==='clips.twitch.tv'||segments[1]==='clip')return {error:'A Twitch não deixa controlar clipes fora do site dela. Cole um canal ou um vídeo.'};
    if(host==='player.twitch.tv'){
      const channel=url.searchParams.get('channel'),video=url.searchParams.get('video')?.replace(/^v/,'');
      if(channel&&/^\w{2,25}$/.test(channel))return {provider:'twitch',id:`channel:${channel.toLowerCase()}`,title:`Twitch: ${channel.toLowerCase()}`};
      return video&&/^\d+$/.test(video)?{provider:'twitch',id:`video:${video}`,title:'Vídeo da Twitch'}:{error:'Cole o link de um canal ou de um vídeo da Twitch.'};
    }
    const video=path.match(/^(?:\/[^/]+)?\/(?:videos|v)\/(\d+)$/)?.[1];if(video)return {provider:'twitch',id:`video:${video}`,title:'Vídeo da Twitch'};
    const channel=segments[0]?.toLowerCase();
    if(segments.length===1&&channel&&!TWITCH_PAGES.has(channel)&&/^\w{2,25}$/.test(channel))return {provider:'twitch',id:`channel:${channel}`,title:`Twitch: ${channel}`};
    return {error:'Cole o link de um canal ou de um vídeo da Twitch.'};
  }
  return null;
}
/** What a pasted link is, or why it cannot play. Anything else on a public https address counts as a direct file; the players then tell. */
export function parseMediaLink(input:string):MediaLink|{error:string} {
  const text=input.trim();
  const uri=text.match(/^spotify:(track|episode):([A-Za-z0-9]{22})$/);if(uri)return {provider:'spotify',id:`${uri[1]}:${uri[2]}`,title:''};
  if(!text||text.length>2048||/[\u0000- \u007f\\]/.test(text))return {error:NOT_A_LINK};
  const youtube=youtubeVideoId(text);if(youtube)return {provider:'youtube',id:youtube,title:''};
  let url:URL;try{url=new URL(text);}catch{return {error:NOT_A_LINK};}
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return {error:NOT_A_LINK};
  const host=url.hostname.toLowerCase();
  if(isHost(host,'youtube.com')||host==='youtu.be')return {error:'Cole o link de um vídeo do YouTube.'};
  for(const [domains,named] of NO_PLAYER)if(isHost(host,...domains))return {error:noPlayer(named)};
  return platformLink(url,host)??fileLink(url);
}
/** A stream with no timeline of its own: everyone simply joins it where it is. */
export function mediaIsStream(provider:string,id:string):boolean {return provider==='twitch'&&id.startsWith('channel:');}
/** The platform's own address for a link, the same however it was pasted (its oEmbed and its players read this). */
export function mediaLinkUrl(provider:MediaProvider,id:string):string {
  switch(provider){
    case 'youtube':return `https://www.youtube.com/watch?v=${id}`;
    case 'vimeo':return `https://vimeo.com/${id.replace(':','/')}`;
    case 'soundcloud':return `https://soundcloud.com/${id}`;
    case 'mixcloud':return `https://www.mixcloud.com/${id}/`;
    case 'spotify':return `https://open.spotify.com/${id.replace(':','/')}`;
    case 'tiktok':return `https://www.tiktok.com/player/v1/${id}`;
    case 'twitch':return id.startsWith('channel:')?`https://www.twitch.tv/${id.slice(8)}`:`https://www.twitch.tv/videos/${id.slice(6)}`;
    case 'file':return id;
  }
}
