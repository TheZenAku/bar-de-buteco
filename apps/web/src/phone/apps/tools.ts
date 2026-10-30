import {formatPhoneNumber} from '@bar/shared';
import {escape as e} from '../../api';
import {gameHour} from '../../engine/day-night';
import {uiIcon} from '../../ui-icons';
import {RINGTONES,avatar,duration,header,type PhoneApp,type PhoneSettings} from '../core';
import {WALLPAPERS} from '../wallpapers';

interface Note {id:string;text:string;at:number}
/** Notas: kept in this browser, per account. */
export const notas:PhoneApp={id:'notas',name:'Notas',icon:'note',tint:'linear-gradient(160deg,#ffe680,#f5b800)',open(view,ctx){
  let notes=ctx.store.get<Note[]>('notes',[]),editing:string|undefined;
  const save=()=>ctx.store.set('notes',notes);
  function render():void {
    const note=notes.find(item=>item.id===editing);
    if(note){view.innerHTML=`${header('','Notas',`<button type="button" class="ph-link danger" data-note="delete">${uiIcon('trash')}</button>`)}<textarea class="ph-note" data-note-text aria-label="Nota" placeholder="Escreva aqui…">${e(note.text)}</textarea>`;view.querySelector('textarea')!.focus();return;}
    view.innerHTML=`<div class="ph-body"><div class="ph-large"><h1>Notas</h1><button type="button" class="ph-link" data-note="new" aria-label="Nova nota">${uiIcon('squarePlus')}</button></div>
      ${notes.length?`<div class="ph-list ph-card">${notes.map(item=>`<button type="button" class="ph-row" data-note="open" data-id="${item.id}"><span class="fl"><b>${e(item.text.split('\n')[0]?.slice(0,40)||'Nota vazia')}</b><small>${new Date(item.at).toLocaleDateString('pt-BR')} · ${e(item.text.split('\n').slice(1).join(' ').slice(0,40)||'Sem mais texto')}</small></span></button>`).join('')}</div>`:`<p class="ph-empty">${uiIcon('note')}Nenhuma nota.<br>Anote a mesa da galera, o pedido, o rolê.</p>`}</div>`;
  }
  view.addEventListener('click',event=>{
    const button=(event.target as HTMLElement).closest<HTMLElement>('[data-note],[data-ph]');if(!button)return;
    if(button.dataset.ph==='back'){notes=notes.filter(item=>item.text.trim());save();editing=undefined;render();return;}
    if(button.dataset.note==='new'){const note={id:crypto.randomUUID(),text:'',at:Date.now()};notes.unshift(note);editing=note.id;render();}
    if(button.dataset.note==='open'){editing=button.dataset.id;render();}
    if(button.dataset.note==='delete'){notes=notes.filter(item=>item.id!==editing);save();editing=undefined;render();}
  });
  view.addEventListener('input',event=>{
    const note=notes.find(item=>item.id===editing),area=event.target as HTMLTextAreaElement;
    if(note&&area.matches('[data-note-text]')){note.text=area.value.slice(0,4000);note.at=Date.now();notes=[note,...notes.filter(item=>item!==note)];save();}
  });
  render();
  return ()=>{notes=notes.filter(item=>item.text.trim());save();};
}};

/** Calendário: the real month, with events kept in this browser. */
export const calendario:PhoneApp={id:'calendario',name:'Calendário',icon:'calendar',tint:'linear-gradient(160deg,#ffffff,#e9e9ee)',open(view,ctx){
  const today=new Date();
  let month=new Date(today.getFullYear(),today.getMonth(),1),day=today.getDate();
  let events=ctx.store.get<Record<string,string[]>>('events',{});
  const key=(d:number)=>`${month.getFullYear()}-${month.getMonth()+1}-${d}`;
  function render():void {
    const days=new Date(month.getFullYear(),month.getMonth()+1,0).getDate(),offset=month.getDay(),list=events[key(day)]??[];
    const isToday=(d:number)=>d===today.getDate()&&month.getMonth()===today.getMonth()&&month.getFullYear()===today.getFullYear();
    view.innerHTML=`<div class="ph-body"><div class="ph-large cal-head"><h1>${e(month.toLocaleDateString('pt-BR',{month:'long'}))} <small>${month.getFullYear()}</small></h1><span><button type="button" class="ph-mini" data-cal="prev" aria-label="Mês anterior">${uiIcon('chevronLeft')}</button><button type="button" class="ph-mini flip" data-cal="next" aria-label="Próximo mês">${uiIcon('chevronLeft')}</button></span></div>
      <div class="cal-grid">${['D','S','T','Q','Q','S','S'].map(letter=>`<small>${letter}</small>`).join('')}${'<span></span>'.repeat(offset)}${Array.from({length:days},(_,i)=>i+1).map(d=>`<button type="button" class="${d===day?'on':''} ${isToday(d)?'today':''} ${events[key(d)]?.length?'has':''}" data-cal="day" data-day="${d}">${d}</button>`).join('')}</div>
      <h3 class="ph-section">${e(new Date(month.getFullYear(),month.getMonth(),day).toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'}))}</h3>
      <div class="ph-list ph-card">${list.map((text,i)=>`<div class="ph-row"><i class="cal-dot"></i><span class="fl">${e(text)}</span><button type="button" class="ph-mini" data-cal="remove" data-index="${i}" aria-label="Apagar evento">${uiIcon('trash')}</button></div>`).join('')||'<p class="ph-empty small">Nada marcado.</p>'}</div>
      <form class="zap-compose cal-add" data-cal-form><input class="ph-input" name="text" maxlength="80" autocomplete="off" placeholder="Novo evento" aria-label="Novo evento"><button class="zap-send" type="submit" aria-label="Adicionar">${uiIcon('plus')}</button></form></div>`;
  }
  view.addEventListener('click',event=>{
    const button=(event.target as HTMLElement).closest<HTMLElement>('[data-cal]');if(!button)return;
    const action=button.dataset.cal;
    if(action==='prev'||action==='next'){month=new Date(month.getFullYear(),month.getMonth()+(action==='next'?1:-1),1);day=1;}
    if(action==='day')day=Number(button.dataset.day);
    if(action==='remove'){const list=[...(events[key(day)]??[])];list.splice(Number(button.dataset.index),1);events={...events,[key(day)]:list};if(!list.length)delete events[key(day)];ctx.store.set('events',events);}
    render();
  });
  view.addEventListener('submit',event=>{
    event.preventDefault();const text=String(new FormData(event.target as HTMLFormElement).get('text')??'').trim();if(!text)return;
    events={...events,[key(day)]:[...(events[key(day)]??[]),text]};ctx.store.set('events',events);render();view.querySelector<HTMLInputElement>('[name="text"]')?.focus();
  });
  render();
}};

const ZONES:Array<[string,string]>=[['São Paulo','America/Sao_Paulo'],['Lisboa','Europe/Lisbon'],['Nova York','America/New_York'],['Tóquio','Asia/Tokyo']];
/** Relógio: the bar's own hour (the day and night cycle), world clocks and a stopwatch. */
export const relogio:PhoneApp={id:'relogio',name:'Relógio',icon:'clock',tint:'linear-gradient(160deg,#2c2c2e,#000)',open(view,ctx){
  let tab:'world'|'stopwatch'=ctx.store.get('clock-tab','world'),started=0,elapsed=0,laps:number[]=[];
  const watch=()=>elapsed+(started?Date.now()-started:0);
  const stopwatchText=(ms:number)=>`${duration(ms/1000)},${String(Math.floor(ms%1000/10)).padStart(2,'0')}`;
  function render():void {
    const hour=gameHour(ctx.host.serverNow()),h=Math.floor(hour),m=Math.floor((hour-h)*60);
    const body=tab==='world'?`<div class="ph-large"><h1>Relógio</h1></div><div class="ph-list">
        <div class="ph-row clock-row bar"><span class="fl"><small>Aqui no bar</small><b>Highland</b></span><time>${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}</time></div>
        ${ZONES.map(([name,zone])=>`<div class="ph-row clock-row"><span class="fl"><small>${e(new Date().toLocaleDateString('pt-BR',{timeZone:zone,weekday:'long'}))}</small><b>${name}</b></span><time>${new Date().toLocaleTimeString('pt-BR',{timeZone:zone,hour:'2-digit',minute:'2-digit'})}</time></div>`).join('')}</div>
        <p class="ph-hint">No bar, um dia inteiro passa em 40 minutos.</p>`
      :`<div class="stopwatch"><output>${stopwatchText(watch())}</output><div class="stopwatch-actions"><button type="button" class="ph-round soft" data-clock="${started?'lap':'reset'}"><small>${started?'Volta':'Zerar'}</small></button><button type="button" class="ph-round ${started?'decline':'accept'}" data-clock="toggle"><small>${started?'Parar':'Iniciar'}</small></button></div>
        <div class="ph-list">${laps.map((lap,i)=>`<div class="ph-row"><span class="fl">Volta ${laps.length-i}</span><time>${stopwatchText(lap)}</time></div>`).join('')}</div></div>`;
    view.innerHTML=`<div class="ph-body">${body}</div><nav class="ph-tabs">${([['world','globe','Mundial'],['stopwatch','timer','Cronômetro']] as const).map(([value,icon,label])=>`<button type="button" class="${tab===value?'on':''}" data-clock-tab="${value}">${uiIcon(icon)}<small>${label}</small></button>`).join('')}</nav>`;
  }
  view.addEventListener('click',event=>{
    const target=event.target as HTMLElement,tabButton=target.closest<HTMLElement>('[data-clock-tab]'),button=target.closest<HTMLElement>('[data-clock]');
    if(tabButton){tab=tabButton.dataset.clockTab as typeof tab;ctx.store.set('clock-tab',tab);}
    if(button?.dataset.clock==='toggle'){if(started){elapsed+=Date.now()-started;started=0;}else started=Date.now();}
    if(button?.dataset.clock==='lap')laps.unshift(watch());
    if(button?.dataset.clock==='reset'){elapsed=0;laps=[];}
    render();
  });
  render();
  let drawn=Date.now();
  const timer=setInterval(()=>{
    if(tab==='stopwatch'){const out=view.querySelector('.stopwatch output');if(out)out.textContent=stopwatchText(watch());}
    else if(Date.now()-drawn>=1000){drawn=Date.now();render();}
  },50);
  return ()=>clearInterval(timer);
}};

/** Calculadora: the four operations, percent and sign, like the phone's own. */
export const calculadora:PhoneApp={id:'calculadora',name:'Calculadora',icon:'calculator',tint:'linear-gradient(160deg,#ff9f0a,#c76b00)',open(view){
  let shown='0',stored:number|undefined,operator:string|undefined,fresh=true;
  const apply=(a:number,b:number,op:string)=>op==='+'?a+b:op==='−'?a-b:op==='×'?a*b:b===0?NaN:a/b;
  const format=(value:number)=>Number.isFinite(value)?String(Number(value.toPrecision(12))).replace('.',','):'Erro';
  const value=()=>Number(shown.replace(',','.'));
  const KEYS=[['AC','±','%','÷'],['7','8','9','×'],['4','5','6','−'],['1','2','3','+'],['0',',','=']];
  function render():void {
    view.innerHTML=`<div class="calc"><output style="font-size:${shown.length>9?Math.max(34,86-(shown.length-9)*7):86}px">${e(shown)}</output><div class="calc-keys">${KEYS.flat().map(key=>`<button type="button" class="${'÷×−+='.includes(key)?'op':['AC','±','%'].includes(key)?'fn':''} ${key==='0'?'zero':''} ${key===operator&&fresh?'on':''}" data-calc="${key}">${key==='AC'&&shown!=='0'?'C':key}</button>`).join('')}</div></div>`;
  }
  function press(key:string):void {
    if(/^\d$/.test(key)){shown=fresh||shown==='0'?key:shown.length<12?shown+key:shown;fresh=false;}
    else if(key===','){if(fresh){shown='0,';fresh=false;}else if(!shown.includes(','))shown+=',';}
    else if(key==='AC'){if(shown!=='0'&&!fresh)shown='0';else{shown='0';stored=undefined;operator=undefined;}fresh=true;}
    else if(key==='±')shown=format(-value());
    else if(key==='%')shown=format(value()/100);
    else if(key==='='){if(operator!==undefined&&stored!==undefined){shown=format(apply(stored,value(),operator));stored=undefined;operator=undefined;fresh=true;}}
    else{if(operator&&stored!==undefined&&!fresh)shown=format(apply(stored,value(),operator));stored=value();operator=key;fresh=true;}
    render();
  }
  view.addEventListener('click',event=>{const key=(event.target as HTMLElement).closest<HTMLElement>('[data-calc]')?.dataset.calc;if(key)press(key);});
  const keys=(event:KeyboardEvent)=>{
    if((event.target as HTMLElement).closest('input,textarea'))return;
    const map:Record<string,string>={'/':'÷','*':'×','-':'−','+':'+','Enter':'=','=':'=','Escape':'',',':',','.':',','Backspace':'AC','%':'%'};
    const key=/^\d$/.test(event.key)?event.key:map[event.key];
    if(key){press(key);event.stopPropagation();event.preventDefault();}
  };
  view.ownerDocument.addEventListener('keydown',keys,true);
  render();
  return ()=>view.ownerDocument.removeEventListener('keydown',keys,true);
}};

/** Ajustes: the phone's own settings, kept per account in this browser. */
export const ajustes:PhoneApp={id:'ajustes',name:'Ajustes',icon:'settings',tint:'linear-gradient(160deg,#a1a1a6,#48484a)',open(view,ctx){
  let photos:Array<{id:string;url:string}>=[];
  const toggle=(key:keyof PhoneSettings,label:string,icon:string,tint:string,on:boolean)=>`<label class="ph-row set-row"><i class="set-icon" style="--tint:${tint}">${uiIcon(icon)}</i><span class="fl">${label}</span><input type="checkbox" role="switch" class="ph-switch" data-set="${key}" ${on?'checked':''}></label>`;
  function render():void {
    const settings=ctx.settings(),user=ctx.host.user(),number=ctx.profile()?.number;
    view.innerHTML=`<div class="ph-body"><div class="ph-large"><h1>Ajustes</h1></div>
      <div class="ph-card set-me">${avatar({name:user?.displayName??'?',color:user?.color},58)}<span class="fl"><b>${e(user?.displayName??'')}</b><small>${number?`Meu número · ${formatPhoneNumber(number)}`:'Buscando seu número…'}</small></span></div>
      <div class="ph-list ph-card">${toggle('dark','Modo escuro','sun','#0a84ff',settings.dark)}${toggle('dnd','Não perturbe','moon','#5856d6',settings.dnd)}${toggle('keyClicks','Sons do teclado','volume','#ff2d55',settings.keyClicks)}</div>
      <p class="ph-hint">Em Não perturbe, ligações e mensagens chegam em silêncio e o celular não abre sozinho.</p>
      <h3 class="ph-section">Toque</h3><div class="ph-list ph-card">${RINGTONES.map((name,i)=>`<button type="button" class="ph-row" data-set="ringtone" data-value="${i}"><span class="fl">${name}</span>${settings.ringtone===i?uiIcon('check'):''}</button>`).join('')}
        <label class="ph-row set-row"><i class="set-icon" style="--tint:#ff3b30">${uiIcon('bell')}</i><span class="fl">Volume</span><input type="range" min="0" max="100" value="${Math.round(settings.ringVolume*100)}" data-set="ringVolume" aria-label="Volume do toque"></label></div>
      <h3 class="ph-section">Fundo de tela</h3><div class="set-walls">${Object.entries(WALLPAPERS).map(([id,wall])=>`<button type="button" class="${settings.wallpaper===id?'on':''}" data-set="wallpaper" data-value="${id}" style="background:${wall.css}"><small>${e(wall.name)}</small></button>`).join('')}${photos.map(photo=>`<button type="button" class="${settings.wallpaper===`photo:${photo.id}`?'on':''}" data-set="wallpaper" data-value="photo:${photo.id}" style="background:center/cover url('${photo.url}')"><small>Foto</small></button>`).join('')}</div>
      <h3 class="ph-section">Tamanho na tela</h3><div class="ph-seg" role="radiogroup" aria-label="Tamanho do celular">${([['s','Pequeno'],['m','Médio'],['l','Grande']] as const).map(([value,label])=>`<button type="button" role="radio" aria-checked="${settings.size===value}" data-set="size" data-value="${value}">${label}</button>`).join('')}</div>
      <h3 class="ph-section">Sobre</h3><div class="ph-list ph-card">${[['Modelo','Highland 18 Pro'],['Sistema','HighOS 26'],['Número',number?formatPhoneNumber(number):'—'],['Fotos na galeria',String(photos.length)]].map(([label,value])=>`<div class="ph-row"><span class="fl">${label}</span><small>${e(value!)}</small></div>`).join('')}</div>
      <p class="ph-hint">K abre e guarda o celular. Esc também guarda.</p></div>`;
  }
  view.addEventListener('click',event=>{
    const button=(event.target as HTMLElement).closest<HTMLElement>('button[data-set]');if(!button)return;
    const key=button.dataset.set,value=button.dataset.value!;
    if(key==='ringtone'){ctx.updateSettings({ringtone:Number(value)});ctx.sounds.ring(Number(value),ctx.settings().ringVolume);setTimeout(()=>ctx.sounds.stop(),2300);}
    if(key==='wallpaper')ctx.updateSettings({wallpaper:value});
    if(key==='size')ctx.updateSettings({size:value as PhoneSettings['size']});
    render();
  });
  view.addEventListener('change',event=>{
    const input=event.target as HTMLInputElement,key=input.dataset.set as keyof PhoneSettings|undefined;
    if(key==='dark'||key==='dnd'||key==='keyClicks')ctx.updateSettings({[key]:input.checked});
    if(key==='ringVolume'){ctx.updateSettings({ringVolume:Number(input.value)/100});ctx.sounds.ding();}
  });
  // Wallpapers are photos; recorded videos stay out of the list.
  void ctx.gallery.list().then(list=>{photos=list.filter(photo=>photo.kind!=='video').slice(0,8).map(photo=>({id:photo.id,url:ctx.gallery.url(photo)}));render();});
  void ctx.refreshProfile().then(render);
  render();
}};
