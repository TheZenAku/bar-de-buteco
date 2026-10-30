import {GRAM_HANDLE,PHONE,type GramComment,type GramPerson,type GramPost,type GramProfile,type GramSuggestion} from '@bar/shared';
import {api,escape as e} from '../../api';
import {uiIcon} from '../../ui-icons';
import {avatar,header,timeAgo,type CameraRequest,type Photo,type PhoneApp} from '../core';
import {PHOTO_FILTERS,drawFiltered,type PhotoFilter} from '../filters';
import {dataUrl,postPhoto,profilePhoto} from '../media';

const photoUrl=(id:string)=>`/api/phone/gram/photos/${encodeURIComponent(id)}`;
const likes=(n:number)=>n===1?'1 curtida':`${n.toLocaleString('pt-BR')} curtidas`;
const count=(n:number,one:string,many:string)=>`<b>${n.toLocaleString('pt-BR')}</b><small>${n===1?one:many}</small>`;
type Screen={kind:'feed'}|{kind:'explore'}|{kind:'profile';id:string}|{kind:'people';id:string;list:'followers'|'following'}|{kind:'post';post:GramPost}
  |{kind:'compose'}|{kind:'filter';photo:string}|{kind:'edit'};
/** Profile edits in progress survive a trip to the camera for a selfie. */
let draft:{name?:string;handle?:string;bio?:string;photo?:string|null}|undefined;

/**
 * Highgram (Instagram parody): profiles with a name, @handle, bio and photo; following people (home shows them,
 * Explorar the whole bar), search and suggestions of whom to follow; photos from the phone's camera with filters,
 * likes and comments.
 */
export const highgram:PhoneApp={id:'highgram',name:'Highgram',icon:'gram',tint:'linear-gradient(45deg,#fdc468 0%,#f47133 30%,#d62976 60%,#962fbf 85%,#4f5bd5 100%)',dock:true,open(view,ctx,arg){
  let screen:Screen={kind:'feed'},feed:GramPost[]=[],explore:GramPost[]=[],more=true,loading=false,profile:GramProfile|undefined,people:GramPerson[]|undefined;
  let suggestions:GramSuggestion[]=[],results:GramPerson[]|undefined,query='',comments:{post:GramPost;list:GramComment[]}|undefined,menu:GramPost|undefined,reporting:GramPost|undefined;
  let filter:PhotoFilter=PHOTO_FILTERS[0]!,strength=100,picking=false,mine:GramProfile|undefined;
  const me=ctx.host.user()?.id??'';
  const self=()=>({id:me,name:ctx.host.user()?.displayName??'Eu',color:ctx.host.user()?.color,photo:ctx.profile()?.photo});
  const followButton=(person:GramPerson)=>person.author.id===me?'':`<button type="button" class="gr-follow ${person.followed?'on':''}" data-gr="follow" data-id="${e(person.author.id)}" aria-pressed="${person.followed}">${person.followed?'Seguindo':person.followsYou?'Seguir de volta':'Seguir'}</button>`;
  const personRow=(person:GramPerson,note='')=>`<div class="ph-row gr-person"><button type="button" class="ph-row-main" data-gr="author" data-id="${e(person.author.id)}">${avatar(person.author,44)}<span class="fl"><b>${e(person.author.handle)}</b><small>${e(person.author.name)}${note?` · ${e(note)}`:''}</small></span></button>${followButton(person)}</div>`;
  const postHtml=(post:GramPost)=>`<article class="gr-post" data-post="${e(post.id)}">
    <header><button type="button" class="gr-author" data-gr="author" data-id="${e(post.author.id)}">${avatar(post.author,32)}<b>${e(post.author.handle)}</b></button><time>${timeAgo(post.createdAt)}</time><button type="button" class="ph-mini" data-gr="menu" aria-label="Opções">${uiIcon('ellipsis')}</button></header>
    <div class="gr-photo" data-gr="photo"><img src="${photoUrl(post.id)}" alt="Foto de ${e(post.author.name)}" loading="lazy" draggable="false"><i class="gr-pop" aria-hidden="true">${uiIcon('heart')}</i></div>
    <div class="gr-actions"><button type="button" class="gr-like ${post.liked?'on':''}" data-gr="like" aria-pressed="${post.liked}" aria-label="Curtir">${uiIcon('heart')}</button><button type="button" data-gr="comments" aria-label="Comentários">${uiIcon('messageCircle')}</button></div>
    <p class="gr-likes">${likes(post.likes)}</p>${post.caption?`<p class="gr-caption"><b>${e(post.author.handle)}</b> ${e(post.caption)}</p>`:''}
    ${post.comments?`<button type="button" class="gr-more" data-gr="comments">Ver ${post.comments===1?'o comentário':`os ${post.comments} comentários`}</button>`:''}</article>`;
  const tabs=()=>`<nav class="ph-tabs gr-tabs"><button type="button" class="${screen.kind==='feed'?'on':''}" data-gr="feed" aria-label="Início">${uiIcon('home')}</button><button type="button" class="${screen.kind==='explore'?'on':''}" data-gr="explore" aria-label="Buscar">${uiIcon('search')}</button><button type="button" class="${screen.kind==='compose'||screen.kind==='filter'?'on':''}" data-gr="compose" aria-label="Nova publicação">${uiIcon('squarePlus')}</button><button type="button" class="${screen.kind==='profile'&&screen.id===me?'on':''}" data-gr="mine" aria-label="Seu perfil">${avatar(self(),26)}</button></nav>`;
  const sheet=()=>{
    if(reporting)return `<div class="ph-sheet" role="dialog" aria-label="Denunciar"><form class="ph-sheet-form" data-gr-form="report"><h3>Denunciar publicação</h3><p>A administração recebe a foto e o motivo.</p><textarea class="ph-input" name="reason" minlength="5" maxlength="400" required placeholder="O que há de errado?"></textarea><div class="ph-sheet-actions"><button type="button" class="ph-pill-btn soft" data-gr="sheet-close">Cancelar</button><button type="submit" class="ph-pill-btn danger">Enviar</button></div></form></div>`;
    if(menu)return `<div class="ph-sheet" role="dialog" aria-label="Opções"><div class="ph-sheet-list">${menu.mine?`<button type="button" class="danger" data-gr="delete">${uiIcon('trash')} Apagar publicação</button>`:`<button type="button" class="danger" data-gr="report">${uiIcon('flag')} Denunciar</button><button type="button" data-gr="author" data-id="${e(menu.author.id)}">${uiIcon('user')} Ver perfil de ${e(menu.author.handle)}</button>`}<button type="button" data-gr="sheet-close">Cancelar</button></div></div>`;
    if(comments)return `<div class="ph-sheet tall" role="dialog" aria-label="Comentários"><div class="ph-sheet-panel"><header><h3>Comentários</h3><button type="button" class="ph-mini" data-gr="sheet-close" aria-label="Fechar">${uiIcon('close')}</button></header>
      <div class="gr-comments">${comments.list.map(comment=>`<div class="gr-comment">${avatar(comment.author,30)}<p><b>${e(comment.author.handle)}</b> ${e(comment.text)}<small>${timeAgo(comment.createdAt)}</small></p>${comment.mine||comments!.post.mine?`<button type="button" class="ph-mini" data-gr="uncomment" data-id="${e(comment.id)}" aria-label="Apagar comentário">${uiIcon('trash')}</button>`:''}</div>`).join('')||'<p class="ph-empty small">Seja a primeira pessoa a comentar.</p>'}</div>
      <form class="zap-compose" data-gr-form="comment"><input class="ph-input" name="text" maxlength="${PHONE.commentMax}" autocomplete="off" placeholder="Adicione um comentário" aria-label="Comentário"><button type="submit" class="zap-send" aria-label="Publicar comentário">${uiIcon('send')}</button></form></div></div>`;
    if(picking)return `<div class="ph-sheet tall" role="dialog" aria-label="Foto do perfil"><div class="ph-sheet-panel"><header><h3>Foto do perfil</h3><button type="button" class="ph-mini" data-gr="sheet-close" aria-label="Fechar">${uiIcon('close')}</button></header><div class="gr-pick" data-roll></div></div></div>`;
    return '';
  };
  /** A strip of people to follow on the home screen, the best suggestions first. */
  const suggestionsStrip=()=>suggestions.length?`<section class="gr-suggest" aria-label="Sugestões para você"><h3 class="ph-section">Sugestões para você <button type="button" class="ph-link" data-gr="explore">Ver tudo</button></h3><div class="gr-suggest-row">${suggestions.map(person=>`<div class="gr-suggest-card"><button type="button" data-gr="author" data-id="${e(person.author.id)}">${avatar(person.author,64)}<b>${e(person.author.handle)}</b><small>${e(person.reason)}</small></button>${followButton(person)}</div>`).join('')}</div></section>`:'';
  async function galleryGrid(action:string):Promise<string> {
    const roll=(await ctx.gallery.list()).filter(item=>item.kind!=='video');
    return roll.length?`<div class="ph-grid3">${roll.map((item:Photo)=>`<button type="button" data-gr="${action}" data-id="${item.id}"><img src="${ctx.gallery.url(item)}" alt="Foto da galeria"></button>`).join('')}</div>`:'<p class="ph-empty small">Sua galeria está vazia. Use a câmera do celular.</p>';
  }
  async function render():Promise<void> {
    const scroll=view.querySelector('.ph-body')?.scrollTop??0;
    switch(screen.kind){
      case 'compose':
        view.innerHTML=`${header('Nova publicação','Cancelar')}<div class="ph-body gr-compose"><button type="button" class="ph-pill-btn wide" data-gr="shoot">${uiIcon('camera')} Tirar uma foto agora</button><h3 class="ph-section">Da sua galeria</h3>${await galleryGrid('pick')}</div>${tabs()}`;
        return;
      case 'filter':{
        const chosen=await ctx.gallery.get(screen.photo);
        if(!chosen){go({kind:'compose'});return;}
        view.innerHTML=`${header('Filtros','Voltar')}<div class="ph-body gr-edit"><canvas class="gr-canvas" width="${PHONE.photoWidth}" height="${PHONE.photoHeight}" aria-label="Foto com o filtro ${e(filter.name)}"></canvas>
          <div class="gr-filters" role="radiogroup" aria-label="Filtro">${PHOTO_FILTERS.map(item=>`<button type="button" role="radio" aria-checked="${item.id===filter.id}" data-gr="filter" data-id="${item.id}"><canvas width="72" height="96" data-thumb="${item.id}" aria-hidden="true"></canvas><small>${e(item.name)}</small></button>`).join('')}</div>
          <label class="gr-strength" ${filter.id==='normal'?'hidden':''}>Intensidade <output>${strength}%</output><input type="range" min="0" max="100" step="5" value="${strength}" data-gr-input="strength"></label>
          <form data-gr-form="post"><textarea class="ph-input" name="caption" maxlength="${PHONE.captionMax}" placeholder="Escreva uma legenda…" aria-label="Legenda"></textarea><button class="ph-pill-btn wide" type="submit">Publicar</button></form><p class="ph-hint">Todo mundo no Highland pode ver o que você publica.</p></div>`;
        void paintFilters(chosen);
        return;
      }
      case 'edit':{
        const current=mine,base=current?.author??self(),photo=draft?.photo===undefined?undefined:draft.photo===null?null:await ctx.gallery.get(draft.photo);
        // A photo just chosen (not saved yet) shows from the gallery; a removed one shows the initial.
        const shown=photo?`<span class="ph-avatar has-photo" style="--size:96px"><img src="${ctx.gallery.url(photo)}" alt=""></span>`:avatar(photo===null?{...base,photo:undefined}:base,96);
        const hasPhoto=photo?true:photo===null?false:!!base.photo;
        view.innerHTML=`${header('Editar perfil','Cancelar')}<div class="ph-body gr-edit-profile"><div class="gr-edit-photo">${shown}<button type="button" class="ph-link" data-gr="photo-pick">Alterar foto</button>${hasPhoto?`<button type="button" class="ph-link danger" data-gr="photo-remove">Remover foto</button>`:''}</div>
          <form class="ph-card gr-profile-form" data-gr-form="profile"><label>Nome<input class="ph-input" name="name" maxlength="${PHONE.gramNameMax}" required value="${e(draft?.name??base.name)}"></label>
          <label>Nome de usuário<input class="ph-input" name="handle" maxlength="24" required autocomplete="off" spellcheck="false" value="${e(draft?.handle??current?.author.handle??'')}"></label>
          <label>Bio<textarea class="ph-input" name="bio" maxlength="${PHONE.bioMax}" placeholder="Conte quem você é no Highland">${e(draft?.bio??current?.bio??'')}</textarea></label>
          <button class="ph-pill-btn wide" type="submit">Salvar</button></form><p class="ph-hint">O nome de usuário usa letras minúsculas, números, ponto e sublinhado.</p></div>${sheet()}`;
        if(picking)void galleryGrid('photo-chosen').then(grid=>{const node=view.querySelector('[data-roll]');if(node)node.innerHTML=`<button type="button" class="ph-pill-btn wide" data-gr="selfie">${uiIcon('camera')} Tirar uma selfie</button>${grid}`;});
        return;
      }
      case 'post':view.innerHTML=`${header('Publicação')}<div class="ph-body">${postHtml(screen.post)}</div>${tabs()}${sheet()}`;return;
      case 'people':{
        const title=screen.list==='followers'?'Seguidores':'Seguindo',ownFollowers=screen.id===me&&screen.list==='followers';
        // On your own followers, everyone follows you: no need to say so on each row.
        view.innerHTML=`${header(title,'Perfil')}<div class="ph-body"><div class="ph-list">${people?people.map(person=>personRow(person,person.followsYou&&!ownFollowers?'Segue você':'')).join('')||`<p class="ph-empty small">${screen.list==='followers'?'Ninguém segue ainda.':'Não segue ninguém ainda.'}</p>`:'<p class="ph-empty small">Carregando…</p>'}</div></div>${tabs()}`;
        return;
      }
      case 'explore':{
        const searching=!!query.trim();
        view.innerHTML=`<header class="ph-head gr-search-head"><input class="ph-search" type="search" placeholder="Buscar pessoas por nome ou @" value="${e(query)}" data-gr-input="search" aria-label="Buscar pessoas"></header><div class="ph-body gr-explore">
          ${searching?(results?results.map(person=>personRow(person,person.followsYou?'Segue você':'')).join('')||'<p class="ph-empty small">Ninguém com esse nome.</p>':'<p class="ph-empty small">Buscando…</p>')
          :`${suggestions.length?`<h3 class="ph-section">Sugestões para você</h3><div class="ph-list">${suggestions.map(person=>personRow(person,person.reason)).join('')}</div>`:''}
            <h3 class="ph-section">Explorar</h3>${explore.length?`<div class="ph-grid3">${explore.map(post=>`<button type="button" data-gr="open-post" data-id="${e(post.id)}"><img src="${photoUrl(post.id)}" alt="Foto de ${e(post.author.handle)}" loading="lazy"></button>`).join('')}</div>`:'<p class="ph-empty small">Nenhuma foto no bar ainda.</p>'}`}</div>${tabs()}`;
        return;
      }
      case 'profile':{
        const shown=profile&&profile.author.id===screen.id?profile:undefined,own=screen.id===me;
        const head=own?`<header class="ph-head"><h2>${e(shown?.author.handle??'')}</h2><span class="ph-head-right"><button type="button" class="ph-link" data-gr="edit" aria-label="Editar perfil">${uiIcon('pencil')}</button></span></header>`:header(e(shown?.author.handle??'Perfil'));
        const saved=!!ctx.contact(screen.id);
        view.innerHTML=`${head}<div class="ph-body">${shown?`<div class="gr-profile">${avatar(shown.author,84)}<div>${count(shown.posts.length,'publicação','publicações')}</div><button type="button" data-gr="list" data-list="followers">${count(shown.followers,'seguidor','seguidores')}</button><button type="button" data-gr="list" data-list="following">${count(shown.following,'seguindo','seguindo')}</button></div>
          <p class="gr-bio"><b>${e(shown.author.name)}</b>${shown.followsYou&&!own?' <span class="gr-badge">Segue você</span>':''}${shown.bio?`<br>${e(shown.bio)}`:own?'<br><span class="ph-hint">Toque no lápis para escrever sua bio e pôr uma foto.</span>':''}</p>
          <div class="gr-profile-actions">${own?`<button type="button" class="ph-pill-btn soft" data-gr="edit">Editar perfil</button>`:`${followButton(shown).replace('gr-follow','gr-follow wide')}${saved?`<button type="button" class="ph-pill-btn soft" data-gr="dm">Mensagem</button>`:''}`}</div>
          <div class="ph-grid3">${shown.posts.map(post=>`<button type="button" data-gr="open-post" data-id="${e(post.id)}"><img src="${photoUrl(post.id)}" alt="" loading="lazy"></button>`).join('')}</div>${shown.posts.length?'':`<p class="ph-empty small">${own?'Toque em + para publicar sua primeira foto.':'Nenhuma publicação ainda.'}</p>`}`:'<p class="ph-empty small">Carregando…</p>'}</div>${tabs()}${sheet()}`;
        return;
      }
      default:
        view.innerHTML=`<header class="ph-head gr-head"><h2 class="gr-logo">Highgram</h2><button type="button" class="ph-link" data-gr="refresh" aria-label="Atualizar">${uiIcon('refresh')}</button></header>
          <div class="ph-body gr-feed">${suggestionsStrip()}${feed.map(postHtml).join('')}${feed.length&&more?`<button type="button" class="ph-pill-btn soft wide" data-gr="older">${loading?'Carregando…':'Ver mais antigas'}</button>`:''}${!feed.length&&!loading?`<p class="ph-empty">${uiIcon('gram')}Seu feed mostra quem você segue.<br>Siga pessoas ou publique uma foto do bar.</p>`:''}</div>${tabs()}${sheet()}`;
        {const body=view.querySelector('.ph-body');if(body)body.scrollTop=scroll;}
    }
  }
  /** The big preview and one thumbnail per filter, from the same pixels. */
  let preview:ImageBitmap|undefined,painting=0;
  async function paintFilters(chosen:Photo):Promise<void> {
    preview?.close();preview=await createImageBitmap(chosen.blob);
    const small=await createImageBitmap(chosen.blob,{resizeWidth:72,resizeHeight:96,resizeQuality:'medium'});
    for(const thumb of view.querySelectorAll<HTMLCanvasElement>('[data-thumb]'))await drawFiltered(thumb,small,PHOTO_FILTERS.find(item=>item.id===thumb.dataset.thumb)!);
    small.close();paintPreview();
  }
  function paintPreview():void {
    cancelAnimationFrame(painting);
    painting=requestAnimationFrame(()=>{const canvas=view.querySelector<HTMLCanvasElement>('.gr-canvas');if(canvas&&preview)void drawFiltered(canvas,preview,filter,strength/100);});
  }
  async function loadFeed(older=false):Promise<void> {
    if(loading)return;loading=true;
    try{
      const before=older?feed.at(-1)?.createdAt:undefined;
      const page=(await api<{posts:GramPost[]}>(`/phone/gram?scope=following${before?`&before=${before}`:''}`)).posts;
      feed=older?[...feed,...page.filter(post=>!feed.some(shown=>shown.id===post.id))]:page;more=page.length>=PHONE.feedPage;
    }catch(error){ctx.host.error(error instanceof Error?error.message:'O feed não carregou.');}
    finally{loading=false;}
    if(screen.kind==='feed')void render();
  }
  async function loadSuggestions():Promise<void> {
    const here=ctx.nearby().map(person=>person.id).slice(0,64).join(',');
    try{suggestions=(await api<{people:GramSuggestion[]}>(`/phone/gram/suggestions${here?`?here=${here}`:''}`)).people;}catch{/* Suggestions are a bonus. */}
    if((screen.kind==='feed'||screen.kind==='explore')&&!comments&&!menu&&!reporting)void render();
  }
  async function loadExplore():Promise<void> {
    try{explore=(await api<{posts:GramPost[]}>('/phone/gram?scope=all')).posts;}catch(error){ctx.host.error(error instanceof Error?error.message:'O Explorar não carregou.');}
    if(screen.kind==='explore'&&!query.trim())void render();
  }
  let searchTimer:ReturnType<typeof setTimeout>|undefined,searchId=0;
  function search():void {
    clearTimeout(searchTimer);results=undefined;
    const text=query.trim(),id=++searchId;
    if(!text){renderExploreBody();return;}
    searchTimer=setTimeout(()=>void api<{people:GramPerson[]}>(`/phone/gram/search?q=${encodeURIComponent(text)}`).then(found=>{if(id===searchId){results=found.people;renderExploreBody();}}).catch(()=>{}),220);
    renderExploreBody();
  }
  /** Only the results change while typing, so the search box keeps its focus and caret. */
  function renderExploreBody():void {
    const input=view.querySelector<HTMLInputElement>('[data-gr-input="search"]'),caret=input?.selectionStart??query.length;
    void render().then(()=>{const next=view.querySelector<HTMLInputElement>('[data-gr-input="search"]');next?.focus();next?.setSelectionRange(caret,caret);});
  }
  async function loadProfile(id:string):Promise<void> {
    try{const loaded=await api<GramProfile>(`/phone/gram/users/${encodeURIComponent(id)}`);if(id===me)mine=loaded;profile=loaded;}catch(error){ctx.host.error(error instanceof Error?error.message:'Perfil indisponível.');}
    if(screen.kind==='profile'&&screen.id===id)void render();
  }
  async function loadPeople(id:string,list:'followers'|'following'):Promise<void> {
    try{people=(await api<{people:GramPerson[]}>(`/phone/gram/users/${encodeURIComponent(id)}/${list}`)).people;}catch(error){ctx.host.error(error instanceof Error?error.message:'A lista não carregou.');}
    if(screen.kind==='people')void render();
  }
  const find=(id:string)=>feed.find(post=>post.id===id)??explore.find(post=>post.id===id)??profile?.posts.find(post=>post.id===id)??(screen.kind==='post'&&screen.post.id===id?screen.post:undefined);
  function update(post:GramPost):void {
    for(const list of [feed,explore,profile?.posts??[]]){const index=list.findIndex(item=>item.id===post.id);if(index>=0)list[index]=post;}
    if(screen.kind==='post'&&screen.post.id===post.id)screen={kind:'post',post};
    const node=view.querySelector(`[data-post="${CSS.escape(post.id)}"]`);if(node)node.outerHTML=postHtml(post);
  }
  async function like(post:GramPost,liked:boolean):Promise<void> {
    update({...post,liked,likes:post.likes+(liked===post.liked?0:liked?1:-1)});
    try{
      const result=await api<{likes:number;liked:boolean;notify?:string}>(`/phone/gram/posts/${encodeURIComponent(post.id)}/like`,{liked});
      update({...post,liked:result.liked,likes:result.likes});
      if(result.notify)ctx.host.send('phone.ping',{to:result.notify,kind:'gram-like'});
    }catch(error){update(post);ctx.host.error(error instanceof Error?error.message:'Não deu para curtir.');}
  }
  /** Every list showing this person changes at once; the server's answer settles the count. */
  function setFollowed(id:string,on:boolean,followers?:number):void {
    for(const list of [suggestions,results??[],people??[]])for(const person of list)if(person.author.id===id)person.followed=on;
    if(profile?.author.id===id)profile={...profile,followed:on,followers:followers??profile.followers+(on===profile.followed?0:on?1:-1)};
    void render();
  }
  async function follow(id:string,on:boolean):Promise<void> {
    setFollowed(id,on);
    try{
      const result=await api<{followed:boolean;followers:number;notify?:string}>(`/phone/gram/users/${encodeURIComponent(id)}/follow`,{followed:on});
      if(profile?.author.id===id)setFollowed(id,result.followed,result.followers);
      if(result.notify)ctx.host.send('phone.ping',{to:result.notify,kind:'gram-follow'});
    }catch(error){setFollowed(id,!on);ctx.host.error(error instanceof Error?error.message:'Não deu para seguir.');}
  }
  async function openComments(post:GramPost):Promise<void> {
    try{comments={post,list:(await api<{comments:GramComment[]}>(`/phone/gram/posts/${encodeURIComponent(post.id)}/comments`)).comments};void render();}
    catch(error){ctx.host.error(error instanceof Error?error.message:'Os comentários não carregaram.');}
  }
  function go(next:Screen):void {
    screen=next;menu=undefined;comments=undefined;reporting=undefined;picking=false;void render();
    if(next.kind==='profile')void loadProfile(next.id);
    if(next.kind==='feed'){void loadFeed();void loadSuggestions();}
    if(next.kind==='explore'){void loadExplore();if(!suggestions.length)void loadSuggestions();}
    if(next.kind==='people'){people=undefined;void loadPeople(next.id,next.list);}
    if(next.kind==='edit'&&!mine)void loadProfile(me).then(()=>{if(screen.kind==='edit')void render();});
  }
  const readDraft=()=>{
    const form=view.querySelector<HTMLFormElement>('[data-gr-form="profile"]');if(!form)return;
    const data=new FormData(form);draft={...draft,name:String(data.get('name')??''),handle:String(data.get('handle')??''),bio:String(data.get('bio')??'')};
  };
  let lastTap=0;
  view.addEventListener('click',event=>{
    const button=(event.target as HTMLElement).closest<HTMLElement>('[data-gr],[data-ph]');if(!button)return;
    if(button.dataset.ph==='back'){
      if(screen.kind==='filter')go({kind:'compose'});
      else if(screen.kind==='people')go({kind:'profile',id:screen.id});
      else if(screen.kind==='edit'){draft=undefined;go({kind:'profile',id:me});}
      else go({kind:'feed'});
      return;
    }
    const action=button.dataset.gr,post=find(button.closest<HTMLElement>('[data-post]')?.dataset.post??'');
    switch(action){
      case 'feed':case 'refresh':go({kind:'feed'});break;
      case 'explore':query='';results=undefined;go({kind:'explore'});break;
      case 'mine':go({kind:'profile',id:me});break;
      case 'author':go({kind:'profile',id:button.dataset.id!});break;
      case 'list':if(screen.kind==='profile')go({kind:'people',id:screen.id,list:button.dataset.list==='following'?'following':'followers'});break;
      case 'follow':{
        const id=button.dataset.id!,person=[...suggestions,...results??[],...people??[]].find(item=>item.author.id===id)??(profile?.author.id===id?profile:undefined);
        if(person)void follow(id,!person.followed);
        break;
      }
      case 'compose':go({kind:'compose'});break;
      case 'shoot':ctx.open('camera',{then:'highgram',back:{resume:'filter'},only:'photo'} satisfies CameraRequest);break;
      case 'pick':filter=PHOTO_FILTERS[0]!;strength=100;go({kind:'filter',photo:button.dataset.id!});break;
      case 'filter':{
        filter=PHOTO_FILTERS.find(item=>item.id===button.dataset.id)??PHOTO_FILTERS[0]!;
        view.querySelectorAll('[data-gr="filter"]').forEach(node=>node.setAttribute('aria-checked',String(node===button)));
        const range=view.querySelector<HTMLElement>('.gr-strength');if(range)range.hidden=filter.id==='normal';
        view.querySelector('.gr-canvas')?.setAttribute('aria-label',`Foto com o filtro ${filter.name}`);
        paintPreview();break;
      }
      case 'older':void loadFeed(true);break;
      case 'like':if(post)void like(post,!post.liked);break;
      case 'photo':{
        // A double tap likes, with the heart popping on the photo.
        const now=Date.now();
        if(post&&now-lastTap<350){button.classList.remove('popped');void button.offsetWidth;button.classList.add('popped');if(!post.liked)void like(post,true);}
        lastTap=now;break;
      }
      case 'comments':if(post)void openComments(post);break;
      case 'menu':menu=post;void render();break;
      case 'sheet-close':menu=undefined;comments=undefined;reporting=undefined;picking=false;void render();break;
      case 'report':reporting=menu;menu=undefined;void render();break;
      case 'delete':{
        const target=menu;menu=undefined;if(!target)break;
        void api(`/phone/gram/posts/${encodeURIComponent(target.id)}`,undefined,'DELETE').then(()=>{feed=feed.filter(item=>item.id!==target.id);explore=explore.filter(item=>item.id!==target.id);if(profile)profile={...profile,posts:profile.posts.filter(item=>item.id!==target.id)};if(screen.kind==='post')go({kind:'profile',id:me});else void render();})
          .catch(error=>ctx.host.error(error instanceof Error?error.message:'Não foi possível apagar.'));
        break;
      }
      case 'uncomment':if(comments){const open=comments;void api(`/phone/gram/comments/${encodeURIComponent(button.dataset.id!)}`,undefined,'DELETE').then(()=>openComments(open.post)).catch(error=>ctx.host.error(error instanceof Error?error.message:'Não foi possível apagar.'));}break;
      case 'open-post':{const chosen=find(button.dataset.id!);if(chosen){screen={kind:'post',post:chosen};void render();}break;}
      case 'dm':if(profile)ctx.open('highzap',ctx.contact(profile.author.id)??profile.author);break;
      case 'edit':draft=undefined;go({kind:'edit'});break;
      case 'photo-pick':readDraft();picking=true;void render();break;
      case 'photo-chosen':readDraft();draft={...draft,photo:button.dataset.id!};picking=false;void render();break;
      case 'photo-remove':readDraft();draft={...draft,photo:null};void render();break;
      case 'selfie':readDraft();ctx.open('camera',{then:'highgram',back:{resume:'edit'},selfie:true,only:'photo'} satisfies CameraRequest);break;
    }
  });
  view.addEventListener('input',event=>{
    const input=event.target as HTMLInputElement;
    if(input.dataset.grInput==='strength'){strength=Number(input.value);const output=input.parentElement?.querySelector('output');if(output)output.textContent=`${strength}%`;paintPreview();}
    if(input.dataset.grInput==='search'){query=input.value;search();}
    if(input.name==='handle')input.value=input.value.toLowerCase().replace(/[^a-z0-9._@]/g,'');
  });
  view.addEventListener('submit',event=>{
    event.preventDefault();
    const form=event.target as HTMLFormElement,data=new FormData(form),submit=form.querySelector<HTMLButtonElement>('[type="submit"]');
    if(form.dataset.grForm==='comment'&&comments){
      const text=String(data.get('text')??'').trim(),open=comments;if(!text)return;
      if(submit)submit.disabled=true;
      void api<{comments:GramComment[];notify?:string}>(`/phone/gram/posts/${encodeURIComponent(open.post.id)}/comments`,{text,requestId:crypto.randomUUID()}).then(result=>{
        if(result.notify)ctx.host.send('phone.ping',{to:result.notify,kind:'gram-comment'});
        update({...open.post,comments:result.comments.length});comments={post:{...open.post,comments:result.comments.length},list:result.comments};void render();
      }).catch(error=>{ctx.host.error(error instanceof Error?error.message:'Comentário não publicado.');if(submit)submit.disabled=false;});
    }
    if(form.dataset.grForm==='report'&&reporting){
      const target=reporting,reason=String(data.get('reason')??'').trim();
      void api('/reports',{playerId:target.author.id,reason:`Highgram, publicação ${target.id}: ${reason}`.slice(0,500)}).then(()=>{reporting=undefined;void render();ctx.host.notice('Denúncia enviada','A administração vai revisar a publicação.');})
        .catch(error=>ctx.host.error(error instanceof Error?error.message:'Denúncia não enviada.'));
    }
    if(form.dataset.grForm==='post'&&screen.kind==='filter'){
      const caption=String(data.get('caption')??''),canvas=view.querySelector<HTMLCanvasElement>('.gr-canvas');
      if(!canvas)return;
      if(submit){submit.disabled=true;submit.textContent='Publicando…';}
      // The canvas already holds the filtered photo at full size.
      void new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Foto inválida.')),'image/jpeg',.86)).then(postPhoto).then(dataUrl)
        .then(image=>api<GramPost>('/phone/gram/posts',{image,caption,requestId:crypto.randomUUID()}))
        .then(()=>go({kind:'feed'}))
        .catch(error=>{ctx.host.error(error instanceof Error?error.message:'Não foi possível publicar.');if(submit){submit.disabled=false;submit.textContent='Publicar';}});
    }
    if(form.dataset.grForm==='profile'){
      readDraft();
      const handle=(draft?.handle??'').trim().replace(/^@/,'');
      if(!GRAM_HANDLE.test(handle)){ctx.host.error('O nome de usuário usa de 3 a 24 letras minúsculas, números, ponto ou sublinhado.');return;}
      if(submit){submit.disabled=true;submit.textContent='Salvando…';}
      const photo=draft?.photo;
      void (async()=>{
        const item=typeof photo==='string'?await ctx.gallery.get(photo):undefined;
        const image=item?await dataUrl(await profilePhoto(item.blob)):photo===null?null:undefined;
        mine=await api<GramProfile>('/phone/gram/me',{name:draft?.name,handle,bio:draft?.bio,...(image!==undefined?{photo:image}:{})},'PATCH');
        draft=undefined;await ctx.refreshProfile();profile=mine;go({kind:'profile',id:me});
      })().catch(error=>{ctx.host.error(error instanceof Error?error.message:'Não foi possível salvar.');if(submit){submit.disabled=false;submit.textContent='Salvar';}});
    }
  });
  // Someone liked, commented or followed: what is on screen catches up (the banner still shows).
  const off=ctx.onPing(ping=>{
    if(ping.kind!=='gram-like'&&ping.kind!=='gram-comment'&&ping.kind!=='gram-follow')return;
    if(screen.kind==='profile'&&screen.id===me)void loadProfile(me);
    if(screen.kind==='feed'&&!comments&&!menu&&!reporting){if(ping.kind==='gram-follow')void loadSuggestions();else void loadFeed();}
  });
  const start=arg as {photo?:string;profile?:string;resume?:string;captured?:string}|undefined;
  if(start?.resume==='edit'){if(start.captured)draft={...draft,photo:start.captured};go({kind:'edit'});}
  else if(start?.resume==='filter'&&start.captured){filter=PHOTO_FILTERS[0]!;strength=100;go({kind:'filter',photo:start.captured});}
  else if(start?.resume==='filter')go({kind:'compose'});
  else if(start?.photo){filter=PHOTO_FILTERS[0]!;strength=100;go({kind:'filter',photo:start.photo});}
  else if(start?.profile)go({kind:'profile',id:start.profile});
  else go({kind:'feed'});
  return ()=>{off();clearTimeout(searchTimer);cancelAnimationFrame(painting);preview?.close();};
}};
