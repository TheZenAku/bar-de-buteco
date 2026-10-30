import {DEFAULT_SHOW,SHOW_BARS,SHOW_BPM,SHOW_CUES,SHOW_PALETTES,SHOW_PRESETS,SHOW_PROGRAMS,SHOW_TEXT_MAX,applyShowPatch,showMoment,showPlaylist,showText,
  type ShowCue,type ShowPaletteId,type ShowPatch,type ShowProgramId,type StageShowState} from '@bar/shared';
import {escape as e} from './api';
import {uiIcon} from './ui-icons';

export interface LightDeskHooks {
  /** Sends a change to the room (show.set), or fires a cue (show.cue). */
  set(patch:ShowPatch):void;
  cue(cue:ShowCue):void;
  /** The server clock (ms). */
  now():number;
  /** Something plays on the stage (a video on the telão, a musician): with the power on auto, the show is on. */
  playing():boolean;
  notify(text:string):void;
}

/** The scenes this browser saved (Minhas cenas): only here, never on the server. */
const SCENES_KEY='bar:light-desk:scenes:v1',SCENES_MAX=12,MINE='minha:';
interface SavedScene {name:string;patch:ShowPatch}
function savedScenes():SavedScene[] {
  try{const list=JSON.parse(localStorage.getItem(SCENES_KEY)??'[]') as SavedScene[];return Array.isArray(list)?list.filter(s=>typeof s?.name==='string'&&s.patch).slice(0,SCENES_MAX):[];}catch{return [];}
}
function storeScenes(list:SavedScene[]):void {try{localStorage.setItem(SCENES_KEY,JSON.stringify(list));}catch{/* private window: the scene lives until the panel closes */}}

const CUE_KEYS:Record<string,ShowCue>={Digit1:'flash',Digit2:'blackout',Digit3:'drop',Digit4:'letreiro'};
const CUE_ICONS:Record<ShowCue,string>={flash:'bolt',blackout:'moon',drop:'flame',letreiro:'pencil'};
const TABS=[['cenas','Cenas'],['programas','Programas'],['cores','Cores'],['ritmo','Ritmo'],['letreiro','Letreiro']] as const;
const QUICK_TEXTS=['HIGHLAND','BOTECO','SAUDE!','EU ♥ CHOPP','BOA NOITE'];
const SLIDERS=[
  ['master','Geral','%',0,100],['lasers','Lasers e desenhos','%',0,100],['heads','Moving heads','%',0,100],
  ['strobe','Estrobo e blinders','%',0,100],['speed','Movimento','%',25,200],
] as const;
const programName=(id:string)=>id==='drop'?'Drop':SHOW_PROGRAMS.find(p=>p.id===id)?.name??id;
const paletteName=(id:string)=>SHOW_PALETTES.find(p=>p.id===id)?.name??'Automática';
/** The desk's settings as a scene: everything but the clock and who changed it. */
function sceneOf(show:StageShowState):ShowPatch {
  return {power:show.power,mode:show.mode,program:show.program as ShowProgramId,playlist:showPlaylist(show),bars:show.bars as 4|8|16,
    palette:show.palette as ShowPaletteId|'auto',bpm:show.bpm,speed:show.speed,master:show.master,lasers:show.lasers,heads:show.heads,strobe:show.strobe,text:show.text};
}
const sceneSummary=(patch:ShowPatch)=>[patch.mode==='fixed'?`Fixo: ${programName(patch.program??'')}`:`Rodízio de ${patch.playlist?.length??0}`,
  paletteName(patch.palette??'auto'),`${patch.bpm} BPM`].join(' · ');
const ago=(ms:number)=>ms<60_000?'agora há pouco':ms<3_600_000?`há ${Math.round(ms/60_000)} min`:`há ${Math.round(ms/3_600_000)} h`;

/**
 * The stage's light desk (E on its blip, up on the stage): the show's power, cues, tap tempo, scenes (the house's and
 * this browser's), programs, palettes, tempo and levels, and the letreiro's text. Every change goes to the room and is
 * the same for everyone in the backyard; the panel shows the room's state (BarState.stageShow) as it comes back.
 */
export function createLightDesk(root:HTMLElement,hooks:LightDeskHooks){
  let show:StageShowState={...DEFAULT_SHOW},tab:typeof TABS[number][0]='cenas',taps:number[]=[],clockKey='';
  const pads=(Object.keys(SHOW_CUES) as ShowCue[]).map((cue,i)=>`<button type="button" class="desk-pad" data-desk-cue="${cue}">${uiIcon(CUE_ICONS[cue])}<span>${SHOW_CUES[cue].name}</span><kbd>${i+1}</kbd></button>`).join('');
  root.innerHTML=`<div class="desk">
    <header class="desk-now"><span class="desk-led" aria-hidden="true"></span><div class="desk-now-text"><small data-desk="state">No ar</small><b data-desk="program">—</b><span data-desk="meta"></span></div>
      <div class="desk-seg desk-power" role="group" aria-label="Show">${(['auto','on','off'] as const).map(p=>`<button type="button" data-desk-power="${p}" aria-pressed="false">${{auto:'Auto',on:'Ligado',off:'Apagado'}[p]}</button>`).join('')}</div></header>
    <div class="desk-pads">${pads}<button type="button" class="desk-pad desk-tap" data-desk-tap>${uiIcon('activity')}<span>Tap <b data-desk="tap">124</b></span><kbd>Espaço</kbd></button></div>
    <nav class="menu-tabs desk-tabs" role="tablist" aria-label="Mesa de luz">${TABS.map(([id,label])=>`<button type="button" role="tab" id="desk-tab-${id}" data-desk-tab="${id}" aria-controls="desk-panel-${id}">${label}</button>`).join('')}</nav>
    <div class="menu-line" aria-hidden="true"></div>
    <div class="desk-body">
      <section role="tabpanel" id="desk-panel-cenas" aria-labelledby="desk-tab-cenas" data-desk-panel="cenas">
        <p class="desk-hint">Uma cena muda tudo de uma vez, para todo mundo no quintal.</p>
        <div class="desk-list">${SHOW_PRESETS.map(p=>`<button type="button" class="desk-scene" data-desk-preset="${p.id}" aria-pressed="false"><b>${e(p.name)}</b><small>${e(p.summary)}</small></button>`).join('')}</div>
        <h3 class="desk-sub">Minhas cenas</h3>
        <form class="desk-save" data-desk-save><input name="name" maxlength="24" placeholder="Nome da cena" aria-label="Nome da cena" autocomplete="off"><button class="button secondary" type="submit">${uiIcon('plus')}Salvar o que está no ar</button></form>
        <div class="desk-list" data-desk="mine"></div>
      </section>
      <section role="tabpanel" id="desk-panel-programas" aria-labelledby="desk-tab-programas" data-desk-panel="programas" hidden>
        <div class="desk-row"><span class="desk-label">Sequência</span><div class="desk-seg" role="group" aria-label="Sequência"><button type="button" data-desk-mode="cycle" aria-pressed="false">Rodízio</button><button type="button" data-desk-mode="fixed" aria-pressed="false">Fixo</button></div></div>
        <div class="desk-row"><span class="desk-label">Cada programa</span><div class="desk-seg" role="group" aria-label="Compassos por programa">${SHOW_BARS.map(b=>`<button type="button" data-desk-bars="${b}" aria-pressed="false">${b} comp.</button>`).join('')}</div></div>
        <p class="desk-hint" data-desk="programs-hint"></p>
        <div class="desk-grid">${SHOW_PROGRAMS.map(p=>`<button type="button" class="desk-program" data-desk-program="${p.id}" aria-pressed="false"><b>${e(p.name)}</b><small>${e(p.summary)}</small></button>`).join('')}</div>
        <div class="desk-actions" data-desk="cycle-actions"><button type="button" class="button secondary" data-desk-all>${uiIcon('check')}Todos no rodízio</button></div>
      </section>
      <section role="tabpanel" id="desk-panel-cores" aria-labelledby="desk-tab-cores" data-desk-panel="cores" hidden>
        <div class="desk-palettes"><button type="button" class="desk-palette" data-desk-palette="auto" aria-pressed="false"><span class="desk-swatches auto" aria-hidden="true"></span><b>Automática</b><small>Troca a cada programa</small></button>
          ${SHOW_PALETTES.map(p=>`<button type="button" class="desk-palette" data-desk-palette="${p.id}" aria-pressed="false"><span class="desk-swatches" aria-hidden="true">${p.colours.map(c=>`<i style="background:${c}"></i>`).join('')}</span><b>${e(p.name)}</b></button>`).join('')}</div>
      </section>
      <section role="tabpanel" id="desk-panel-ritmo" aria-labelledby="desk-tab-ritmo" data-desk-panel="ritmo" hidden>
        <div class="desk-slider"><label for="desk-bpm">Andamento <output data-desk-out="bpm"></output></label><input id="desk-bpm" type="range" min="${SHOW_BPM.min}" max="${SHOW_BPM.max}" step="1" data-desk-range="bpm"></div>
        <div class="desk-actions"><button type="button" class="button secondary" data-desk-step="-1">${uiIcon('minus')}1 BPM</button><button type="button" class="button secondary" data-desk-step="1">${uiIcon('plus')}1 BPM</button><button type="button" class="button secondary" data-desk-one>${uiIcon('play')}O "um" é agora</button></div>
        <p class="desk-hint">Toque o Tap (ou a barra de espaço) junto com a música: o andamento e a batida seguem os seus toques. O "um" começa um compasso no seu clique.</p>
        ${SLIDERS.map(([id,label])=>`<div class="desk-slider"><label for="desk-${id}">${label} <output data-desk-out="${id}"></output></label><input id="desk-${id}" type="range" min="${id==='speed'?25:0}" max="${id==='speed'?200:100}" step="5" data-desk-range="${id}"></div>`).join('')}
        <p class="desk-hint">O estrobo nunca pisca mais que duas vezes por segundo, em nenhum andamento.</p>
      </section>
      <section role="tabpanel" id="desk-panel-letreiro" aria-labelledby="desk-tab-letreiro" data-desk-panel="letreiro" hidden>
        <form class="desk-text" data-desk-text><label for="desk-text">O que o laser escreve no telão</label><input id="desk-text" name="text" maxlength="24" autocomplete="off" spellcheck="false">
          <p class="desk-hint" data-desk="text-preview"></p>
          <div class="desk-chips">${QUICK_TEXTS.map(t=>`<button type="button" data-desk-quick="${e(t)}">${e(t)}</button>`).join('')}</div>
          <p class="desk-hint">Letras sem acento, números e ! ? . - ♥ (ou &lt;3), até ${SHOW_TEXT_MAX}. Com espaço e mais de 9, vai em duas linhas.</p>
          <div class="desk-actions"><button class="button primary" type="submit">${uiIcon('check')}Salvar o letreiro</button><button type="button" class="button secondary" data-desk-cue="letreiro">${uiIcon('pencil')}Escrever agora</button></div></form>
      </section>
    </div>
    <footer class="desk-foot"><span data-desk="by"></span><span class="desk-keys"><kbd>1–4</kbd> efeitos <kbd>Espaço</kbd> tap <kbd>Esc</kbd> fechar</span></footer>
  </div>`;
  const $=<T extends HTMLElement=HTMLElement>(selector:string)=>root.querySelector<T>(selector)!;
  const all=(selector:string)=>root.querySelectorAll<HTMLElement>(selector);
  const press=(selector:string,on:(el:HTMLElement)=>boolean)=>all(selector).forEach(el=>el.setAttribute('aria-pressed',String(on(el))));

  /** Sends a change and shows it at once; the room's state confirms it a moment later. */
  function send(patch:ShowPatch):void {hooks.set(patch);show=applyShowPatch(show,patch,hooks.now(),show.updatedBy);render();}
  // Sliders send while dragged, at most every 120 ms, and once more where they stop.
  const timers=new Map<string,{at:number;timer?:ReturnType<typeof setTimeout>;value?:number}>();
  function throttled(key:string,value:number):void {
    const entry=timers.get(key)??{at:0};timers.set(key,entry);entry.value=value;
    const wait=entry.at+120-performance.now();
    if(wait<=0){clearTimeout(entry.timer);entry.timer=undefined;entry.at=performance.now();send({[key]:value} as ShowPatch);return;}
    entry.timer??=setTimeout(()=>{entry.timer=undefined;entry.at=performance.now();if(entry.value!==undefined)send({[key]:entry.value} as ShowPatch);},wait);
  }

  function tap():void {
    const t=performance.now();
    if(taps.length&&t-taps.at(-1)!>2000)taps=[];
    taps.push(t);if(taps.length>5)taps.shift();
    if(taps.length<2){send({tap:hooks.now()});return;}
    const gaps=taps.slice(1).map((v,i)=>v-taps[i]!),bpm=Math.round(Math.min(SHOW_BPM.max,Math.max(SHOW_BPM.min,60000/(gaps.reduce((a,b)=>a+b,0)/gaps.length))));
    send({bpm,tap:hooks.now()});
  }

  function renderMine():void {
    const list=savedScenes();
    $('[data-desk="mine"]').innerHTML=list.length?list.map((scene,i)=>`<div class="desk-scene mine"><button type="button" data-desk-mine="${i}" aria-pressed="${show.preset===MINE+scene.name}"><b>${e(scene.name)}</b><small>${e(sceneSummary(scene.patch))}</small></button><button type="button" class="desk-forget" data-desk-forget="${i}" aria-label="Apagar a cena ${e(scene.name)}">${uiIcon('trash')}</button></div>`).join('')
      :'<p class="desk-hint">Monte o show do seu jeito e salve aqui. Fica guardado neste navegador.</p>';
  }

  /** The controls from `show`, leaving alone the field being typed in or the slider in the hand. */
  function render():void {
    const focus=document.activeElement,playlist=new Set(showPlaylist(show));
    press('[data-desk-power]',el=>el.dataset.deskPower===show.power);
    press('[data-desk-mode]',el=>el.dataset.deskMode===show.mode);
    press('[data-desk-bars]',el=>Number(el.dataset.deskBars)===show.bars);
    press('[data-desk-program]',el=>show.mode==='fixed'?el.dataset.deskProgram===show.program:playlist.has(el.dataset.deskProgram as ShowProgramId));
    press('[data-desk-palette]',el=>el.dataset.deskPalette===show.palette);
    press('[data-desk-preset]',el=>el.dataset.deskPreset===show.preset);
    press('[data-desk-mine]',el=>show.preset===MINE+(savedScenes()[Number(el.dataset.deskMine)]?.name??''));
    $('[data-desk="programs-hint"]').textContent=show.mode==='fixed'?'No fixo, o programa que você tocar fica no ar, recomeçando a cada volta.':'No rodízio, toque num programa para tirar ou pôr de volta na sequência.';
    $('[data-desk="cycle-actions"]').hidden=show.mode==='fixed';
    $('.desk-grid').classList.toggle('desk-programs-cycle',show.mode==='cycle');
    for(const input of all('[data-desk-range]') as NodeListOf<HTMLInputElement>){
      const key=input.dataset.deskRange as 'bpm'|typeof SLIDERS[number][0],value=show[key];
      if(input!==focus)input.value=String(value);
      $(`[data-desk-out="${key}"]`).textContent=key==='bpm'?`${value} BPM`:`${value}%`;
    }
    $('[data-desk="tap"]').textContent=String(show.bpm);
    const text=$<HTMLInputElement>('#desk-text');if(text!==focus)text.value=show.text;
    $('[data-desk="text-preview"]').textContent=`No telão: ${showText(text.value)}`;
    $('[data-desk="by"]').textContent=show.updatedBy?`Mexido por ${show.updatedBy} · ${ago(Math.max(0,hooks.now()-show.updatedAt))}`:'Show da casa';
    // The LED blinks on the show's beat: a CSS animation put in phase whenever the tempo or the beat moves.
    const key=`${show.bpm}|${show.beatAt}`;
    if(key!==clockKey){
      clockKey=key;const led=$('.desk-led'),beat=60000/show.bpm,phase=((hooks.now()-show.beatAt)%beat+beat)%beat;
      led.style.animation='none';void led.offsetWidth;led.style.animation=`desk-beat ${beat.toFixed(1)}ms linear ${(-phase).toFixed(0)}ms infinite`;
    }
    tick();
  }
  /** What is on the air now (four times a second): the program, palette, bar and a cue firing. */
  function tick():void {
    const now=hooks.now(),moment=showMoment(show,now),cue=moment.cue;
    const on=show.power==='on'||show.power==='auto'&&hooks.playing()||!!cue&&cue.id!=='blackout';
    $('[data-desk="state"]').textContent=cue?`Efeito: ${SHOW_CUES[cue.id].name}`:on?'No ar':show.power==='off'?'Apagado':'Esperando o palco tocar';
    root.querySelector('.desk')!.classList.toggle('dark',!on);
    $('[data-desk="program"]').textContent=cue?.id==='drop'?'Drop':programName(moment.program);
    $('[data-desk="meta"]').textContent=`${paletteName(moment.palette)}${show.palette==='auto'?' (auto)':''} · ${show.bpm} BPM · compasso ${moment.bar+1}/${moment.beats/4}`;
    all('[data-desk-program]').forEach(el=>el.classList.toggle('live',on&&el.dataset.deskProgram===moment.program));
    all('[data-desk-cue]').forEach(el=>el.classList.toggle('firing',el.dataset.deskCue===cue?.id));
  }
  function selectTab(id:typeof tab):void {
    tab=id;
    all('[data-desk-tab]').forEach(el=>{const on=el.dataset.deskTab===id;el.setAttribute('aria-selected',String(on));el.tabIndex=on?0:-1;});
    all('[data-desk-panel]').forEach(el=>{el.hidden=el.dataset.deskPanel!==id;});
  }

  root.addEventListener('click',event=>{
    const target=(event.target as HTMLElement).closest<HTMLElement>('button');if(!target||!root.contains(target))return;
    const d=target.dataset;
    if(d.deskTab)selectTab(d.deskTab as typeof tab);
    else if(d.deskCue){hooks.cue(d.deskCue as ShowCue);target.classList.add('firing');}
    else if(d.deskTap!==undefined)tap();
    else if(d.deskPower)send({power:d.deskPower as StageShowState['power']});
    else if(d.deskMode)send({mode:d.deskMode as StageShowState['mode']});
    else if(d.deskBars)send({bars:Number(d.deskBars) as 4|8|16});
    else if(d.deskPalette)send({palette:d.deskPalette as ShowPaletteId|'auto'});
    else if(d.deskProgram){
      const id=d.deskProgram as ShowProgramId;
      if(show.mode==='fixed'){send({program:id});return;}
      const list=showPlaylist(show),next=list.includes(id)?list.filter(p=>p!==id):[...list,id];
      if(!next.length){hooks.notify('Deixe pelo menos um programa no rodízio.');return;}
      send({playlist:next});
    }
    else if(d.deskAll!==undefined)send({playlist:SHOW_PROGRAMS.map(p=>p.id)});
    else if(d.deskPreset){const preset=SHOW_PRESETS.find(p=>p.id===d.deskPreset);if(preset)send({...preset.patch,preset:preset.id});}
    else if(d.deskMine){const scene=savedScenes()[Number(d.deskMine)];if(scene)send({...scene.patch,preset:MINE+scene.name});}
    else if(d.deskForget){const list=savedScenes();list.splice(Number(d.deskForget),1);storeScenes(list);renderMine();}
    else if(d.deskStep)send({bpm:Math.min(SHOW_BPM.max,Math.max(SHOW_BPM.min,show.bpm+Number(d.deskStep)))});
    else if(d.deskOne!==undefined)send({tap:hooks.now(),bar:true});
    else if(d.deskQuick){$<HTMLInputElement>('#desk-text').value=d.deskQuick;send({text:d.deskQuick});}
  });
  root.addEventListener('input',event=>{
    const input=event.target as HTMLInputElement;
    if(input.dataset.deskRange){const key=input.dataset.deskRange;$(`[data-desk-out="${key}"]`).textContent=key==='bpm'?`${input.value} BPM`:`${input.value}%`;throttled(key,Number(input.value));}
    else if(input.id==='desk-text')$('[data-desk="text-preview"]').textContent=`No telão: ${showText(input.value)}`;
  });
  root.addEventListener('submit',event=>{
    const form=event.target as HTMLFormElement;event.preventDefault();event.stopPropagation();
    if(form.dataset.deskText!==undefined){const text=showText($<HTMLInputElement>('#desk-text').value);send({text});hooks.notify(`Letreiro: ${text}`);return;}
    if(form.dataset.deskSave!==undefined){
      const input=form.querySelector<HTMLInputElement>('input')!,list=savedScenes(),name=input.value.trim().slice(0,24)||`Cena ${list.length+1}`;
      const at=list.findIndex(s=>s.name===name);
      if(at<0&&list.length>=SCENES_MAX){hooks.notify(`Cabem ${SCENES_MAX} cenas: apague uma para salvar outra.`);return;}
      const scene={name,patch:sceneOf(show)};if(at<0)list.push(scene);else list[at]=scene;
      storeScenes(list);input.value='';renderMine();hooks.notify(`Cena salva: ${name}`);
    }
  });
  // Space taps and 1–4 fire the cues, unless typing.
  const keys=(event:KeyboardEvent)=>{
    const typing=event.target instanceof HTMLElement&&['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName)&&(event.target as HTMLInputElement).type!=='range';
    if(typing||event.repeat||event.ctrlKey||event.metaKey||event.altKey)return;
    if(event.code==='Space'){event.preventDefault();tap();return;}
    const cue=CUE_KEYS[event.code];if(cue){event.preventDefault();hooks.cue(cue);root.querySelector(`.desk-pad[data-desk-cue="${cue}"]`)?.classList.add('firing');}
  };
  document.addEventListener('keydown',keys);
  const ticker=setInterval(tick,250);
  selectTab('cenas');renderMine();render();

  return {
    /** The room's state for the show (BarState.stageShow). */
    update(state:StageShowState|undefined):void {if(state){show={...state};render();}},
    destroy():void {document.removeEventListener('keydown',keys);clearInterval(ticker);for(const entry of timers.values())clearTimeout(entry.timer);root.innerHTML='';},
  };
}
