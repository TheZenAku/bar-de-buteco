import {levelOf,rankOf,startOfBarDay,type DailyView} from '@bar/shared';
import {api,escape as e} from '../api';
import {uiIcon} from '../ui-icons';
import {floatingWindow,type FloatingWindow} from '../profile/floating-window';
import {rankIcon} from './rank-icon';

export interface LevelHudHooks {
  toast(text:string,error?:boolean):void;
  openProfile():void;
  /** The daily bonus is waiting: the game tells the player once per visit. */
  dailyReady(open:()=>void):void;
  /** Coins came with the bonus: the wallet reads its new balance. */
  coinsChanged():void;
}

const still=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const xpText=(value:number)=>value.toLocaleString('pt-BR');
const ease=(t:number)=>1-(1-t)**3;

/**
 * The level in the header (docs/sistemas/niveis.md): badge, rank, XP bar and the daily bonus button. XP arrives from the
 * world a few seconds after what earned it (`xp.state`); the bar runs up to it, pops what was gained and celebrates a new level.
 */
export function createLevelHud(root:HTMLElement,hooks:LevelHudHooks){
  root.innerHTML=`<button type="button" class="lv-chip" data-lv="profile"><span class="lv-icon"></span><span class="lv-text"><b>Nv <span class="lv-num">…</span></b><small class="lv-rank"></small></span><span class="lv-bar"><i class="lv-fill"></i><i class="lv-shine"></i><em class="lv-xp"></em></span></button>
    <button type="button" class="hud-btn lv-daily" data-lv="daily" title="Bônus diário" aria-label="Bônus diário">${uiIcon('gift')}<i class="lv-dot" hidden></i></button>
    <div class="lv-pops" aria-hidden="true"></div><p class="sr-only" aria-live="polite"></p>`;
  const chip=root.querySelector<HTMLElement>('.lv-chip')!,icon=root.querySelector<HTMLElement>('.lv-icon')!,num=root.querySelector<HTMLElement>('.lv-num')!;
  const rankName=root.querySelector<HTMLElement>('.lv-rank')!,fill=root.querySelector<HTMLElement>('.lv-fill')!,xpLabel=root.querySelector<HTMLElement>('.lv-xp')!;
  const pops=root.querySelector<HTMLElement>('.lv-pops')!,spoken=root.querySelector<HTMLElement>('[aria-live]')!,dot=root.querySelector<HTMLElement>('.lv-dot')!;
  let shown:number|undefined,target:number|undefined,frame=0,drawnLevel=0,daily:DailyView|undefined,dailyWindow:FloatingWindow|undefined,tick=0,told=false;

  function draw(xp:number):void {
    const p=levelOf(xp),rank=rankOf(p.level);
    if(p.level!==drawnLevel){
      icon.innerHTML=rankIcon(p.level,34);num.textContent=String(p.level);rankName.textContent=rank.name;
      chip.style.setProperty('--rank',rank.colors[0]);
      if(drawnLevel){chip.classList.remove('lv-leveled');void chip.offsetWidth;chip.classList.add('lv-leveled');}
      drawnLevel=p.level;
    }
    fill.style.width=`${p.need?(p.into/p.need*100).toFixed(2):100}%`;
    xpLabel.textContent=p.need?`${xpText(p.into)} / ${xpText(p.need)} XP`:`${xpText(p.xp)} XP · máximo`;
    chip.setAttribute('aria-label',`Nível ${p.level}, ${rank.name}. ${p.need?`${xpText(p.into)} de ${xpText(p.need)} XP para o próximo`:'Nível máximo'}. Abrir seu perfil`);
  }
  function pop(gained:number):void {
    const node=document.createElement('span');node.className='lv-pop';node.textContent=`+${xpText(gained)} XP`;
    node.style.setProperty('--dx',`${Math.round(Math.random()*24-12)}px`);
    pops.append(node);node.addEventListener('animationend',()=>node.remove());
    if(pops.childElementCount>4)pops.firstElementChild?.remove();
    chip.classList.remove('lv-gain');void chip.offsetWidth;chip.classList.add('lv-gain');
  }
  /** The big moment, over the middle of the screen. */
  function levelUp(level:number):void {
    const rank=rankOf(level),node=document.createElement('div');
    node.className='lv-up';node.style.setProperty('--rank',rank.colors[0]);node.style.setProperty('--rank-dark',rank.colors[1]);
    const sparks=Array.from({length:16},(_,i)=>`<i class="lv-spark" style="--a:${(i*22.5+Math.random()*10).toFixed(0)}deg;--d:${(90+Math.random()*80).toFixed(0)}px;--t:${(Math.random()*.25).toFixed(2)}s"></i>`).join('');
    const newRank=rank.step===1&&level>1;
    node.innerHTML=`<div class="lv-up-rays"></div><div class="lv-up-badge">${rankIcon(level,132)}${sparks}</div><p class="lv-up-kicker">${newRank?'Novo posto':'Subiu de nível'}</p><h2>Nível ${level}</h2><small>${e(rank.name)}${level<100?'':' · nível máximo'}</small>`;
    (document.querySelector('#game')??document.body).append(node);
    setTimeout(()=>node.classList.add('leaving'),3400);setTimeout(()=>node.remove(),4100);
    spoken.textContent=`Você subiu para o nível ${level}, ${rank.name}.`;
  }
  /** Runs the bar from what it shows to the new XP: through each level on the way, filling and starting over. */
  function runTo(xp:number):void {
    cancelAnimationFrame(frame);
    const from=shown??xp,start=performance.now(),duration=still()?0:Math.min(2200,700+Math.abs(xp-from)*4),before=levelOf(from).level;
    const step=(now:number)=>{
      const t=duration?Math.min(1,(now-start)/duration):1;
      shown=Math.round(from+(xp-from)*ease(t));draw(shown);
      if(t<1)frame=requestAnimationFrame(step);
      else{const after=levelOf(xp).level;if(after>before)levelUp(after);}
    };
    frame=requestAnimationFrame(step);
  }

  function dayCard(index:number,view:DailyView):string {
    const n=index+1,done=n<view.day||(n===view.day&&view.claimed),today=n===view.day;
    return `<li class="dl-day${done?' done':''}${today?' today':''}${n===7?' big':''}" style="--i:${index}"><span class="dl-n">Dia ${n}</span><span class="dl-gift">${uiIcon(n===7?'trophy':'gift')}</span><b>+${xpText(view.rewards[index]!)} XP</b>${view.coins>0?`<small>${uiIcon('coins')}${xpText(view.coins)}</small>`:''}<i class="dl-check">${uiIcon('check')}</i></li>`;
  }
  function countdown():string {
    const left=Math.max(0,startOfBarDay().getTime()+86_400_000-Date.now()),h=Math.floor(left/3_600_000),m=Math.floor(left/60_000)%60,s=Math.floor(left/1000)%60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  function drawDaily():void {
    if(!dailyWindow||!daily)return;
    const v=daily;
    dailyWindow.body.innerHTML=`<p class="dl-lead">Passe no bar todo dia: o bônus cresce até o <b>7º dia</b>. Faltou um dia, a sequência recomeça.</p>
      <ol class="dl-days">${v.rewards.map((_,i)=>dayCard(i,v)).join('')}</ol>
      ${v.claimed?`<p class="dl-wait">${uiIcon('clock')}Próximo bônus em <b class="dl-timer">${countdown()}</b></p>`:`<button type="button" class="button primary full dl-claim" data-lv="claim">${uiIcon('gift')}Receber o bônus do dia ${v.day}</button>`}`;
  }
  function setDaily(view:DailyView):void {
    daily=view;dot.hidden=view.claimed;root.querySelector('.lv-daily')!.classList.toggle('ready',!view.claimed);drawDaily();
  }
  async function loadDaily():Promise<void> {
    try{
      setDaily(await api<DailyView>('/daily'));
      if(!daily!.claimed&&!told){told=true;hooks.dailyReady(openDaily);}
    }catch{/* The button stays; it tries again when opened. */}
  }
  function openDaily():void {
    if(dailyWindow){dailyWindow.front();return;}
    dailyWindow=floatingWindow({className:'dl-window',label:'Bônus diário',onClose:()=>{dailyWindow=undefined;clearInterval(tick);}});
    dailyWindow.head.innerHTML=`<div class="pf-id"><h2>${uiIcon('gift')} Bônus diário</h2><small>XP${daily?.coins?' e moedas':''} todo dia</small></div>`;
    dailyWindow.body.innerHTML='<p class="pf-empty"><span class="loader" aria-hidden="true"></span></p>';
    dailyWindow.body.addEventListener('click',event=>{if((event.target as HTMLElement).closest('[data-lv="claim"]'))void claim();});
    tick=window.setInterval(()=>{const timer=dailyWindow?.body.querySelector('.dl-timer');if(timer)timer.textContent=countdown();if(daily?.claimed&&countdown()==='00:00:00')void loadDaily();},1000);
    drawDaily();dailyWindow.settle();void loadDaily().then(()=>dailyWindow?.settle());
  }
  let claiming=false;
  async function claim():Promise<void> {
    if(claiming||!dailyWindow)return;
    claiming=true;const button=dailyWindow.body.querySelector<HTMLButtonElement>('.dl-claim');if(button)button.disabled=true;
    try{
      const answer=await api<DailyView&{gained?:{xp:number;coins:number}}>('/daily',{});
      const card=dailyWindow?.body.querySelector<HTMLElement>('.dl-day.today');
      if(answer.gained&&card&&!still()){
        card.classList.add('claiming');
        card.insertAdjacentHTML('beforeend',`<span class="dl-burst" aria-hidden="true">${Array.from({length:12},(_,i)=>`<i style="--a:${i*30}deg"></i>`).join('')}</span><span class="dl-gain">+${xpText(answer.gained.xp)} XP${answer.gained.coins?` · +${xpText(answer.gained.coins)} moedas`:''}</span>`);
        await new Promise(done=>setTimeout(done,1300));
      }
      setDaily(answer);
      if(answer.gained){
        spoken.textContent=`Bônus recebido: ${answer.gained.xp} XP${answer.gained.coins?` e ${answer.gained.coins} moedas`:''}.`;
        if(answer.gained.coins)hooks.coinsChanged();
      }
    }catch(error){hooks.toast(error instanceof Error?error.message:'Não foi possível receber o bônus.',true);if(button)button.disabled=false;}
    finally{claiming=false;}
  }

  root.addEventListener('click',event=>{
    const action=(event.target as HTMLElement).closest<HTMLElement>('[data-lv]')?.dataset.lv;
    if(action==='profile')hooks.openProfile();
    if(action==='daily')openDaily();
  });

  return {
    /** The XP the world reported (`gained` 0: just where it stands, as on arrival). */
    set(xp:number,gained=0):void {
      if(target===xp)return;
      const first=target===undefined;target=xp;
      if(first||!gained){cancelAnimationFrame(frame);const leveled=!first&&levelOf(xp).level>levelOf(shown??xp).level;shown=xp;draw(xp);if(leveled)levelUp(levelOf(xp).level);return;}
      pop(gained);runTo(xp);
    },
    /** Entering the bar: the bonus may be waiting. */
    enter():void {void loadDaily();},
    openDaily,
    reset():void {
      cancelAnimationFrame(frame);shown=undefined;target=undefined;drawnLevel=0;told=false;daily=undefined;
      dailyWindow?.close();num.textContent='…';rankName.textContent='';icon.innerHTML='';fill.style.width='0%';xpLabel.textContent='';pops.replaceChildren();dot.hidden=true;
    },
  };
}
export type LevelHud=ReturnType<typeof createLevelHud>;
