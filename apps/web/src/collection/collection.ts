import {RARITIES,RARITY_INFO,type Wardrobe,type WardrobeCard,type WardrobeSkill} from '@bar/shared';
import {escape as e} from '../api';
import {uiIcon} from '../ui-icons';
import {glints} from '../profile/badge-card';
import {cardArt,cardStyle,liveCard,skinCardHtml,type LiveCard} from './skin-card';
import {cardSounds} from './card-sounds';

export interface CollectionHooks {
  /** What the skin being worn is right now (the room's word, a moment ahead of the saved one). */
  wearing:()=>string;
  /** Why a change of clothes has to wait; nothing when it does not. */
  busy:()=>string;
  buy:(skin:string)=>Promise<Wardrobe>;
  equip:(skin:string)=>Promise<Wardrobe>;
  buySkill:(skill:string)=>Promise<Wardrobe>;
  volume:()=>number;
  toast:(text:string,error?:boolean)=>void;
}
const coins=(value:number)=>value.toLocaleString('pt-BR');
const coinTag=(value:number)=>`${uiIcon('coins')}${coins(value)}`;
const CONFIRM_MS=7000;
const REVEAL_PARTICLES=[46,70,104,150,220];

/**
 * The collection (C): a hand of cards, one per character, and one of them drawn to the middle with its variants beside it. Buying a card or a skill,
 * and dressing, all happen here. The world behind stops being drawn while it is open (showModal), and only the card in focus has a frame loop.
 */
export function createCollection(root:HTMLElement,first:Wardrobe,hooks:CollectionHooks,focusOn?:string){
  const still=matchMedia('(prefers-reduced-motion:reduce)').matches;
  let wardrobe=first,live:LiveCard|undefined,destroyed=false,busy=false,token=0;
  /** The purchase asking for a second click: a card's or a skill's id. */
  let confirming='',confirmTimer:ReturnType<typeof setTimeout>|undefined;
  /** The variant each character was last seen in. */
  const remembered=new Map<string,string>();
  let shownBalance=first.balance,countFrame=0;
  let closeReveal:(()=>void)|undefined;

  const worn=()=>hooks.wearing();
  const cardOf=(id:string)=>wardrobe.catalog.find(card=>card.id===id);
  const characters=()=>[...new Set(wardrobe.catalog.map(card=>card.base))];
  const variants=(base:string)=>wardrobe.catalog.filter(card=>card.base===base).sort((a,b)=>Number(b.id===base)-Number(a.id===base));
  /** What a character shows in the hand: what was last looked at, else what is being worn, else one the player has. */
  function shownOf(base:string):WardrobeCard {
    const list=variants(base);
    return list.find(card=>card.id===remembered.get(base))??list.find(card=>card.id===worn())??list.find(card=>card.owned)??list[0]!;
  }
  const initial=cardOf(focusOn??'')?.id??wardrobe.catalog.find(card=>card.base===focusOn)?.id??cardOf(worn())?.id??wardrobe.catalog[0]!.id;
  let focus:string=initial;
  const current=()=>cardOf(focus)??shownOf(characters()[0]!);
  const tagOf=(card:WardrobeCard)=>card.id===worn()?`<em class="wearing">${uiIcon('check')}Vestindo</em>`:card.owned?'':card.available?`<em class="price">${coinTag(card.price)}</em>`:`<em class="closed">${uiIcon('lock')}Fora de venda</em>`;

  root.innerHTML=`<div class="cl" id="collection">
    <header class="cl-head">
      <div class="cl-title"><span class="eyebrow">Coleção</span><h2>Suas cartas</h2></div>
      <div class="cl-progress" role="status"><small></small><span class="cl-track"><i></i></span></div>
      <div class="cl-actions"><span class="cl-wallet" title="Sua carteira">${uiIcon('coins')}<b id="wallet-balance"></b></span></div>
    </header>
    <div class="cl-stage">
      <section class="cl-variants" aria-label="Variantes do personagem"><h3>Variantes</h3><div class="cl-variant-list"></div></section>
      <div class="cl-focus"><div class="cl-flip"><div class="sc-scene" title="Arraste para girar o personagem"></div></div></div>
      <section class="cl-info" aria-live="polite"></section>
    </div>
    <div class="cl-hand-wrap"><div class="cl-hand" role="listbox" aria-label="Personagens"></div></div>
    <footer class="cl-keys" aria-hidden="true"><span><kbd>←</kbd><kbd>→</kbd>Personagem</span><span><kbd>↑</kbd><kbd>↓</kbd>Variante</span><span><kbd>Enter</kbd>Vestir ou comprar</span><span><kbd>Arraste a carta</kbd>Gira</span><span><kbd>C</kbd>Fecha</span></footer>
  </div>`;
  const collection=root.querySelector<HTMLElement>('.cl')!,hand=root.querySelector<HTMLElement>('.cl-hand')!,scene=root.querySelector<HTMLElement>('.sc-scene')!,flip=root.querySelector<HTMLElement>('.cl-flip')!;
  const info=root.querySelector<HTMLElement>('.cl-info')!,list=root.querySelector<HTMLElement>('.cl-variant-list')!,variantsBox=root.querySelector<HTMLElement>('.cl-variants')!;

  /** Every picture decoded before it is needed: a card that flips must not arrive empty. */
  const decoded=new Map<string,Promise<void>>();
  const decode=(id:string)=>{let done=decoded.get(id);if(!done){const image=new Image();image.src=cardArt(id);done=image.decode().catch(()=>{});decoded.set(id,done);}return done;};
  for(const card of wardrobe.catalog)void decode(card.id);

  function renderHead():void {
    const owned=wardrobe.catalog.filter(card=>card.owned).length,total=wardrobe.catalog.length;
    root.querySelector('.cl-progress small')!.textContent=`${owned} de ${total} cartas`;
    root.querySelector<HTMLElement>('.cl-track i')!.style.width=`${(owned/Math.max(1,total)*100).toFixed(1)}%`;
    countTo(wardrobe.balance);
  }
  const writeBalance=(value:number)=>{const node=root.querySelector('#wallet-balance');if(node)node.innerHTML=`${coins(value)} <small>moedas</small>`;};
  /** The wallet runs down to its new value, so a purchase is felt. */
  function countTo(target:number):void {
    cancelAnimationFrame(countFrame);
    if(still||shownBalance===target||!root.isConnected){shownBalance=target;writeBalance(target);return;}
    const from=shownBalance,start=performance.now(),duration=620;
    const step=(now:number)=>{
      const t=Math.min(1,(now-start)/duration),eased=1-(1-t)**3;
      shownBalance=Math.round(from+(target-from)*eased);writeBalance(shownBalance);
      if(t<1)countFrame=requestAnimationFrame(step);else{shownBalance=target;writeBalance(target);}
    };
    countFrame=requestAnimationFrame(step);
  }
  /** The hand's cards spread in an arc, closing up when there are too many for the width. */
  function layoutHand():void {
    const buttons=[...hand.children] as HTMLElement[],middle=(buttons.length-1)/2;
    buttons.forEach((button,index)=>{const offset=index-middle;button.style.setProperty('--o',offset.toFixed(2));button.style.setProperty('--arc',`${(offset*offset*1.7).toFixed(1)}px`);});
    const width=buttons[0]?.offsetWidth??0,room=hand.parentElement!.clientWidth-24;
    const overlap=buttons.length>1?Math.max(-6,(buttons.length*width-room)/(buttons.length-1)):0;
    hand.style.setProperty('--overlap',`${overlap.toFixed(1)}px`);
  }
  function renderHand():void {
    hand.innerHTML=characters().map(base=>{const card=shownOf(base);return `<button type="button" class="cl-hand-card" role="option" data-cl="character" data-base="${e(base)}">${skinCardHtml(card,{size:'small',locked:!card.owned,tag:tagOf(card)})}<i class="cl-hand-count" aria-hidden="true"></i></button>`;}).join('');
    syncHand();layoutHand();
  }
  /** Writes only what changed: replacing the cards would restart their pictures. */
  function syncHand():void {
    const base=current().base;
    for(const button of hand.querySelectorAll<HTMLElement>('.cl-hand-card')){
      const id=button.dataset.base!,chosen=id===base,card=chosen?current():shownOf(id),many=variants(id),have=many.filter(each=>each.owned).length;
      button.setAttribute('aria-selected',String(chosen));
      button.setAttribute('aria-label',`${card.name}, ${RARITY_INFO[card.rarity].name}${card.owned?'':', bloqueada'}${card.id===worn()?', em uso':''}`);
      const node=button.querySelector<HTMLElement>('.sc-card')!;
      if(node.dataset.skin!==card.id||node.dataset.rarity!==card.rarity||node.hasAttribute('data-locked')===card.owned)node.outerHTML=skinCardHtml(card,{size:'small',locked:!card.owned,tag:tagOf(card)});
      else{const tag=node.querySelector('.sc-tag')!,html=tagOf(card);if(tag.innerHTML!==html)tag.innerHTML=html;}
      const count=button.querySelector<HTMLElement>('.cl-hand-count')!;
      count.textContent=many.length>1?`${have}/${many.length}`:'';count.hidden=many.length<2;
      button.classList.toggle('wearing',many.some(each=>each.id===worn()));
    }
  }
  function renderVariants():void {
    const card=current(),many=variants(card.base);
    variantsBox.classList.toggle('alone',many.length<2);
    list.innerHTML=many.map(each=>`<button type="button" class="cl-variant" data-cl="variant" data-id="${e(each.id)}" aria-pressed="${each.id===card.id}" aria-label="${e(each.name)}, ${e(each.variant)}, ${e(RARITY_INFO[each.rarity].name)}">${skinCardHtml(each,{size:'small',locked:!each.owned,tag:tagOf(each)})}</button>`).join('')
      +(many.length<2?'<p class="cl-variant-note">Este personagem ainda não tem outras variantes.</p>':'');
  }
  function skillHtml(skill:WardrobeSkill,card:WardrobeCard):string {
    const hasCard=wardrobe.catalog.some(each=>each.base===skill.skin&&each.owned),poor=wardrobe.balance<skill.price,asking=confirming===`skill:${skill.id}`;
    const action=skill.owned?`<span class="cl-skill-owned">${uiIcon('check')}Liberada</span>`
      :!skill.available?`<span class="cl-skill-closed">Fora de venda</span>`
      :!hasCard?`<span class="cl-skill-closed" title="Compre uma carta de ${e(card.name)} para liberar">${uiIcon('lock')}${coins(skill.price)}</span>`
      :asking?`<span class="cl-confirm"><button type="button" class="button primary" data-cl="skill-confirm" data-id="${e(skill.id)}">Confirmar</button><button type="button" class="text-button" data-cl="cancel">Não</button></span>`
      :`<button type="button" class="mini-button cl-skill-buy" data-cl="skill-buy" data-id="${e(skill.id)}" ${poor?'disabled':''} title="${poor?'Moedas insuficientes':'Comprar esta habilidade'}">${uiIcon('coins')}${coins(skill.price)}</button>`;
    return `<li class="cl-skill${skill.owned?' owned':''}" data-skill="${e(skill.id)}" style="--rarity:${e(RARITY_INFO[skill.rarity].color)}"><span class="cl-skill-icon">${uiIcon(skill.owned?skill.icon:'lock')}</span><span class="cl-skill-text"><b>${e(skill.name)}</b><small>${e(skill.description)}</small></span>${action}</li>`;
  }
  function ctaHtml(card:WardrobeCard):string {
    if(card.id===worn())return `<button type="button" class="button primary cl-cta" disabled>${uiIcon('check')}Vestindo</button>`;
    if(card.owned)return `<button type="button" class="button primary cl-cta" data-cl="equip">${uiIcon('shirt')}Vestir esta carta</button>`;
    if(!card.available)return `<button type="button" class="button secondary cl-cta" disabled>${uiIcon('lock')}Fora de venda</button>`;
    if(wardrobe.balance<card.price)return `<button type="button" class="button secondary cl-cta" disabled>Moedas insuficientes</button><small class="cl-cta-note">Faltam ${coins(card.price-wardrobe.balance)} moedas. O trabalho no bar (J) e as entregas pagam.</small>`;
    if(confirming===`skin:${card.id}`)return `<span class="cl-confirm"><button type="button" class="button primary cl-cta" data-cl="buy-confirm">Confirmar ${coinTag(card.price)}</button><button type="button" class="text-button" data-cl="cancel">Não</button></span><small class="cl-cta-note">A compra é permanente.</small>`;
    return `<button type="button" class="button primary cl-cta" data-cl="buy">${uiIcon('coins')}Comprar por ${coins(card.price)}</button>`;
  }
  function renderInfo(animate=true):void {
    const card=current(),skills=wardrobe.skills.filter(skill=>skill.skin===card.base),level=RARITIES.indexOf(card.rarity),rarity=RARITY_INFO[card.rarity];
    info.classList.toggle('rise',animate&&!still);
    info.style.cssText=cardStyle(card);
    info.innerHTML=`<p class="cl-rarity"><span>${e(rarity.name)}</span><i aria-hidden="true">${RARITIES.map((_,index)=>`<b class="${index<=level?'on':''}"></b>`).join('')}</i></p>
      <h2 class="cl-name">${e(card.name)}</h2>
      <p class="cl-variant-name">${variants(card.base).length>1?`Variante ${e(card.variant)}`:e(card.variant)}${card.owned?' · na sua coleção':''}</p>
      <p class="cl-description">${e(card.description)}</p>
      <div class="cl-buy">${ctaHtml(card)}</div>
      ${skills.length?`<section class="cl-skills" aria-label="Habilidades"><h3>Habilidades</h3><ul>${skills.map(skill=>skillHtml(skill,card)).join('')}</ul><small>Valem em todas as variantes de ${e(variants(card.base).find(each=>each.id===card.base)?.name??card.name)}. A tecla se escolhe no seu perfil, aba Skill.</small></section>`:''}`;
  }
  function mountFocus():void {
    live?.destroy();
    const card=current();
    scene.innerHTML=skinCardHtml(card,{size:'big',locked:!card.owned,tag:tagOf(card)});
    live=liveCard(scene,card.id);
  }
  const askedOff=()=>{clearTimeout(confirmTimer);confirming='';};
  function ask(what:string):void {
    askedOff();confirming=what;
    confirmTimer=setTimeout(()=>{confirming='';if(!destroyed)renderInfo(false);},CONFIRM_MS);
    renderInfo(false);
  }
  /** Goes to another card: pulled from the hand when another character, a turn of the same card when another variant. */
  async function show(next:string,from?:HTMLElement):Promise<void> {
    if(next===focus&&live)return;
    const mine=++token,before=current();
    remembered.set(before.base,before.id);
    await decode(next);
    if(mine!==token||destroyed)return;
    askedOff();
    const running=flip.getAnimations();for(const animation of running)animation.cancel();
    focus=next;
    const swap=()=>{mountFocus();renderVariants();syncHand();renderInfo();};
    if(still){swap();return;}
    cardSounds.flip(hooks.volume());
    if(from){
      const source=from.getBoundingClientRect(),target=flip.getBoundingClientRect();
      swap();
      void flip.animate([
        {transform:`translate(${(source.left+source.width/2-target.left-target.width/2).toFixed(1)}px,${(source.top+source.height/2-target.top-target.height/2).toFixed(1)}px) scale(${(source.width/target.width).toFixed(3)}) rotateY(-24deg)`},
        {transform:'none'},
      ],{duration:360,easing:'cubic-bezier(.2,.85,.25,1.06)'});
      return;
    }
    const out=flip.animate([{transform:'rotateY(0deg)'},{transform:'rotateY(90deg)'}],{duration:110,easing:'ease-in',fill:'forwards'});
    await out.finished.catch(()=>{});
    if(mine!==token||destroyed)return;
    out.cancel();swap();
    void flip.animate([{transform:'rotateY(-90deg)'},{transform:'rotateY(8deg)',offset:.75},{transform:'rotateY(0deg)'}],{duration:280,easing:'ease-out'});
  }
  function moveCharacter(by:number):void {
    const all=characters(),at=all.indexOf(current().base),next=all[(at+by+all.length)%all.length]!;
    void show(shownOf(next).id,hand.querySelector<HTMLElement>(`[data-base="${CSS.escape(next)}"]`)??undefined);
  }
  function moveVariant(by:number):void {
    const many=variants(current().base);if(many.length<2)return;
    const at=many.findIndex(card=>card.id===focus);void show(many[(at+by+many.length)%many.length]!.id);
  }
  async function act(job:()=>Promise<Wardrobe>):Promise<boolean> {
    if(busy)return false;
    busy=true;
    try{wardrobe=await job();return !destroyed;}
    catch(error){if(!destroyed){hooks.toast(error instanceof Error?error.message:'Não foi possível concluir.',true);refresh();}return false;}
    finally{busy=false;}
  }
  /** After any change: the wallet, the hand, the tags. The card in focus stays up unless it is what changed. */
  function refresh(remount=false):void {
    if(!cardOf(focus))focus=cardOf(worn())?.id??wardrobe.catalog[0]!.id;
    renderHead();
    if(hand.children.length!==characters().length)renderHand();else syncHand();
    renderVariants();renderInfo(false);
    if(remount)mountFocus();
    else{const tag=scene.querySelector('.sc-tag'),html=tagOf(current());if(tag&&tag.innerHTML!==html)tag.innerHTML=html;}
    layoutHand();
  }
  async function equip():Promise<void> {
    const card=current(),reason=hooks.busy();
    if(reason){hooks.toast(reason);return;}
    if(!await act(()=>hooks.equip(card.id)))return;
    cardSounds.equip(hooks.volume());
    refresh();
    if(!still){
      void flip.animate([{transform:'scale(1)'},{transform:'scale(1.045)',offset:.32},{transform:'scale(1)'}],{duration:340,easing:'ease-out'});
      flash(scene);
    }
  }
  /** A ring of the card's rarity leaving it: one element, gone when it ends. */
  function flash(from:HTMLElement):void {
    const ring=document.createElement('i');ring.className='cl-ring';ring.setAttribute('aria-hidden','true');from.append(ring);
    void ring.animate([{transform:'scale(.98)',opacity:.9},{transform:'scale(1.16)',opacity:0}],{duration:520,easing:'ease-out'}).finished.finally(()=>ring.remove());
  }
  async function buy():Promise<void> {
    const card=current();askedOff();
    if(!await act(()=>hooks.buy(card.id))){renderInfo(false);return;}
    renderHead();syncHand();renderVariants();renderInfo(false);
    const fresh=cardOf(card.id)??card;mountFocus();
    reveal(fresh);
  }
  async function buySkill(id:string):Promise<void> {
    askedOff();
    if(!await act(()=>hooks.buySkill(id))){renderInfo(false);return;}
    cardSounds.skill(hooks.volume());
    refresh();
    const row=info.querySelector<HTMLElement>(`[data-skill="${CSS.escape(id)}"]`);
    if(row&&!still){
      row.classList.add('fresh');
      setTimeout(()=>row.classList.remove('fresh'),1200);
    }
    hooks.toast('Habilidade liberada. A tecla se escolhe no seu perfil, aba Skill.');
  }

  /** A new card: it spins in face down and lands face up, with light behind it and sparks for how rare it is. */
  function reveal(card:WardrobeCard):void {
    const level=RARITIES.indexOf(card.rarity),info_=RARITY_INFO[card.rarity];
    const overlay=document.createElement('div');
    overlay.className='cl-reveal';overlay.dataset.rarity=card.rarity;overlay.style.cssText=cardStyle(card);overlay.setAttribute('role','dialog');overlay.setAttribute('aria-label',`Carta nova: ${card.name}`);
    overlay.innerHTML=`<i class="cl-rays" aria-hidden="true"></i><canvas class="cl-sparks" aria-hidden="true"></canvas>
      <div class="cl-reveal-box"><p class="cl-reveal-label">Carta nova · <b>${e(info_.name)}</b></p>
        <div class="cl-reveal-stage"><div class="cl-reveal-spin"><div class="cl-face front sc-scene">${skinCardHtml(card,{size:'big'})}</div><div class="cl-face back" aria-hidden="true"><span>B.A.R.</span></div></div></div>
        <div class="cl-reveal-actions"><button type="button" class="button primary" data-reveal="wear">${uiIcon('shirt')}Vestir agora</button><button type="button" class="button secondary" data-reveal="keep">Guardar na coleção</button></div></div>`;
    collection.append(overlay);collection.classList.add('revealing');
    const front=overlay.querySelector<HTMLElement>('.cl-face.front')!,spin=overlay.querySelector<HTMLElement>('.cl-reveal-spin')!,box=overlay.querySelector<HTMLElement>('.cl-reveal-box')!;
    let frontCard:LiveCard|undefined,stopSparks:(()=>void)|undefined,gone=false;
    const end=(wear:boolean)=>{
      if(gone)return;gone=true;closeReveal=undefined;
      removeEventListener('keydown',key,true);frontCard?.destroy();stopSparks?.();
      collection.classList.remove('revealing');
      const finish=()=>{overlay.remove();if(wear&&!destroyed)void equip();};
      if(still){finish();return;}
      void overlay.animate([{opacity:1},{opacity:0}],{duration:160,easing:'ease-in'}).finished.finally(finish);
    };
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'||event.code==='KeyC'){event.preventDefault();event.stopPropagation();end(false);}
      else if(event.key==='Enter'){event.preventDefault();event.stopPropagation();end(true);}
      else if(event.key==='Tab'){event.preventDefault();event.stopPropagation();overlay.querySelector<HTMLElement>('[data-reveal="wear"]')?.focus();}
      else if(event.key.startsWith('Arrow')){event.preventDefault();event.stopPropagation();}
    };
    addEventListener('keydown',key,true);
    overlay.addEventListener('click',event=>{const button=(event.target as HTMLElement).closest<HTMLElement>('[data-reveal]');if(button)end(button.dataset.reveal==='wear');});
    closeReveal=()=>end(false);
    overlay.querySelector<HTMLElement>('[data-reveal="wear"]')!.focus({preventScroll:true});
    const land=()=>{
      if(gone)return;
      frontCard=liveCard(front,card.id);frontCard.spin();
      cardSounds.reveal(hooks.volume(),level);
      stopSparks=sparks(overlay.querySelector<HTMLCanvasElement>('.cl-sparks')!,card.rarity,box);
    };
    if(still){overlay.classList.add('landed');land();return;}
    void overlay.animate([{opacity:0},{opacity:1}],{duration:200,easing:'ease-out'});
    // 2.5 turns: it lands on its face halfway through the last one.
    void spin.animate([{transform:'rotateY(-900deg) scale(.5)'},{transform:'rotateY(-180deg) scale(1.08)',offset:.68},{transform:'rotateY(0deg) scale(1)'}],{duration:980,easing:'cubic-bezier(.3,.7,.3,1)'}).finished.then(()=>{overlay.classList.add('landed');land();},()=>{});
    setTimeout(()=>{if(!gone)cardSounds.flip(hooks.volume());},640);
  }
  /** Sparks flying out from the card's middle, and gone: their loop ends with them. */
  function sparks(canvas:HTMLCanvasElement,rarity:WardrobeCard['rarity'],around:HTMLElement):()=>void {
    const width=canvas.offsetWidth,height=canvas.offsetHeight,scale=1,level=RARITIES.indexOf(rarity),sprites=glints();
    canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);
    const g=canvas.getContext('2d')!;g.scale(scale,scale);g.globalCompositeOperation='lighter';
    const box=around.getBoundingClientRect(),own=canvas.getBoundingClientRect(),cx=box.left+box.width/2-own.left,cy=box.top+box.height/2-own.top;
    const flying=Array.from({length:REVEAL_PARTICLES[level]!},()=>{
      const angle=Math.random()*Math.PI*2,speed=120+Math.random()*(260+level*90);
      return {x:cx,y:cy,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life:.7+Math.random()*(.7+level*.14),age:0,size:7+Math.random()*(14+level*5),sprite:sprites[Math.floor(Math.random()*sprites.length)]!};
    });
    let frame=0,last=performance.now();
    const step=(now:number)=>{
      const dt=Math.min(.05,(now-last)/1000);last=now;
      g.clearRect(0,0,width,height);
      let alive=false;
      for(const each of flying){
        each.age+=dt;if(each.age>=each.life)continue;
        alive=true;each.vx*=Math.exp(-1.6*dt);each.vy=each.vy*Math.exp(-1.6*dt)+70*dt;each.x+=each.vx*dt;each.y+=each.vy*dt;
        const left=1-each.age/each.life;g.globalAlpha=Math.min(1,left*1.6);
        const size=each.size*(.5+left*.7);g.drawImage(each.sprite,each.x-size/2,each.y-size/2,size,size);
      }
      if(alive)frame=requestAnimationFrame(step);else g.clearRect(0,0,width,height);
    };
    frame=requestAnimationFrame(step);
    return ()=>cancelAnimationFrame(frame);
  }

  const click=(event:Event)=>{
    const button=(event.target as HTMLElement).closest<HTMLElement>('[data-cl]');if(!button)return;
    switch(button.dataset.cl){
      case 'character':{const base=button.dataset.base!;if(base!==current().base)void show(shownOf(base).id,button);break;}
      case 'variant':void show(button.dataset.id!);break;
      case 'equip':void equip();break;
      case 'buy':ask(`skin:${focus}`);break;
      case 'buy-confirm':void buy();break;
      case 'skill-buy':ask(`skill:${button.dataset.id!}`);break;
      case 'skill-confirm':void buySkill(button.dataset.id!);break;
      case 'cancel':askedOff();renderInfo(false);break;
    }
  };
  const pointer=(event:Event)=>{if((event.target as HTMLElement).closest('.cl-hand-card'))cardSounds.flick(hooks.volume());};
  collection.addEventListener('click',click);hand.addEventListener('pointerenter',pointer,true);
  const key=(event:KeyboardEvent)=>{
    if(event.repeat&&event.key==='Enter')return;
    if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();moveCharacter(event.key==='ArrowLeft'?-1:1);}
    else if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();moveVariant(event.key==='ArrowUp'?-1:1);}
    else if(event.key==='Enter'){
      const onHere=document.activeElement instanceof HTMLButtonElement&&document.activeElement.closest('.cl-info,.cl-head');if(onHere)return;
      const action=info.querySelector<HTMLElement>('.cl-buy [data-cl]');
      if(action){event.preventDefault();action.click();}
    }
  };
  addEventListener('keydown',key);
  const resized=()=>layoutHand();
  addEventListener('resize',resized);

  renderHead();renderHand();renderVariants();renderInfo(false);mountFocus();
  // The hand is dealt, from the middle out.
  if(!still){
    cardSounds.deal(hooks.volume(),Math.min(6,hand.children.length));
    const buttons=[...hand.children] as HTMLElement[],middle=(buttons.length-1)/2;
    buttons.forEach((button,index)=>{
      void button.animate([{translate:`${((middle-index)*60).toFixed(0)}px 170px`,rotate:`${((index-middle)*-9).toFixed(1)}deg`,opacity:0},{translate:'0 0',rotate:'0deg',opacity:1}],{duration:440,delay:Math.abs(index-middle)*38+40,easing:'cubic-bezier(.2,.85,.25,1.08)',fill:'backwards'});
    });
    void flip.animate([{transform:'translateY(36px) scale(.93)'},{transform:'none'}],{duration:420,easing:'cubic-bezier(.2,.85,.25,1.04)'});
  }
  return {
    /** The wallet or the catalog changed from outside (the administration, a job paid). */
    update(next:Wardrobe):void {wardrobe=next;refresh();},
    /** Esc inside a reveal: it closes first. */
    closeInner():boolean {if(closeReveal){closeReveal();return true;}return false;},
    show(id:string):void {void show(id);},
    destroy():void {
      destroyed=true;token++;closeReveal?.();askedOff();cancelAnimationFrame(countFrame);live?.destroy();
      collection.removeEventListener('click',click);hand.removeEventListener('pointerenter',pointer,true);
      removeEventListener('keydown',key);removeEventListener('resize',resized);
    },
  };
}
